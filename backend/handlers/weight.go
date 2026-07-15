package handlers

import (
	"context"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Boro23-wq/perigee/backend/db"
)

type logWeightRequest struct {
	Date      string  `json:"date"`
	WeightLbs float64 `json:"weight_lbs"`
	Note      *string `json:"note"`
}

type WeightEntry struct {
	Date       string  `json:"date"`
	WeightLbs  float64 `json:"weight_lbs"`
	Note       *string `json:"note"`
	RollingAvg float64 `json:"rolling_avg"`
}

// LogWeight upserts a single weigh-in per day — re-logging the same day
// updates it rather than erroring, since the dashboard's quick weigh-in is
// meant to be tap-and-go, not "did I already log today?"
func LogWeight(c *gin.Context) {
	userID := c.GetString("user_id")

	var req logWeightRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	if _, err := time.Parse("2006-01-02", req.Date); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date must be YYYY-MM-DD"})
		return
	}
	if req.WeightLbs <= 0 || req.WeightLbs >= 1500 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "weight_lbs must be between 0 and 1500"})
		return
	}

	var entry WeightEntry
	err := db.Pool.QueryRow(c.Request.Context(),
		`INSERT INTO public.weight_logs (user_id, date, weight_lbs, note)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (user_id, date)
		   DO UPDATE SET weight_lbs = excluded.weight_lbs, note = excluded.note
		 RETURNING date, weight_lbs, note`,
		userID, req.Date, req.WeightLbs, req.Note,
	).Scan(&entry.Date, &entry.WeightLbs, &entry.Note)

	if err != nil {
		log.Printf("LogWeight insert error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to log weight"})
		return
	}

	c.JSON(http.StatusCreated, entry)
}

type weightSummary struct {
	StartWeight     *float64 `json:"start_weight"`
	CurrentWeight   *float64 `json:"current_weight"`
	GoalWeightLbs   *float64 `json:"goal_weight_lbs"`
	GoalDate        *string  `json:"goal_date"`
	TrendLbsPerWeek *float64 `json:"trend_lbs_per_week"`
	PaceStatus      *string  `json:"pace_status"` // "on_pace" | "behind_pace" | null
}

// parseRange turns "90d" into 90. Defaults to 90 on anything unparseable.
func parseRange(raw string) int {
	raw = strings.TrimSuffix(strings.TrimSpace(raw), "d")
	days, err := strconv.Atoi(raw)
	if err != nil || days <= 0 {
		return 90
	}
	if days > 365 {
		days = 365
	}
	return days
}

// loadWeightEntries fetches the user's ENTIRE weigh-in history and runs the
// Kalman filter across all of it — the trend estimate needs the full
// history to converge properly and shouldn't be blind-restarted at whatever
// date happens to sit at the edge of a display window. Only entries within
// the last `days` are returned for display; the trend returned alongside
// them reflects the filter's full-history state, not just the window.
func loadWeightEntries(ctx context.Context, userID string, days int) ([]WeightEntry, float64, error) {
	rows, err := db.Pool.Query(ctx,
		`SELECT date, weight_lbs, note
		 FROM public.weight_logs
		 WHERE user_id = $1
		 ORDER BY date`,
		userID,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var dates []time.Time
	all := []WeightEntry{}
	for rows.Next() {
		var e WeightEntry
		var dateStr string
		if err := rows.Scan(&dateStr, &e.WeightLbs, &e.Note); err != nil {
			return nil, 0, err
		}
		parsed, perr := time.Parse("2006-01-02", dateStr)
		if perr != nil {
			continue
		}
		e.Date = dateStr
		dates = append(dates, parsed)
		all = append(all, e)
	}

	weights := make([]float64, len(all))
	for i, e := range all {
		weights[i] = e.WeightLbs
	}
	smoothed, trendPerWeek := kalmanWeightFilter(dates, weights)
	for i := range all {
		all[i].RollingAvg = smoothed[i]
	}

	cutoff := time.Now().AddDate(0, 0, -days)
	windowed := []WeightEntry{}
	for i, d := range dates {
		if d.After(cutoff) {
			windowed = append(windowed, all[i])
		}
	}

	return windowed, trendPerWeek, nil
}

// computeWeightSummary derives start/current weight and a pace-vs-goal read.
// trendPerWeek comes straight from the Kalman filter's full-history state —
// the "the scale didn't move but your trend is -1.2 lbs/week" logic.
func computeWeightSummary(entries []WeightEntry, trendPerWeek float64, goalWeightLbs *float64, goalDate *string) weightSummary {
	summary := weightSummary{
		GoalWeightLbs: goalWeightLbs,
		GoalDate:      goalDate,
	}

	if len(entries) == 0 {
		return summary
	}

	start := entries[0].WeightLbs
	current := entries[len(entries)-1].RollingAvg
	summary.StartWeight = &start
	summary.CurrentWeight = &current

	if len(entries) < 2 {
		return summary
	}

	trend := trendPerWeek
	summary.TrendLbsPerWeek = &trend

	if goalWeightLbs == nil || goalDate == nil {
		return summary
	}
	parsedGoalDate, err := time.Parse("2006-01-02", *goalDate)
	if err != nil {
		return summary
	}
	weeksRemaining := parsedGoalDate.Sub(time.Now()).Hours() / 24 / 7
	if weeksRemaining <= 0 {
		return summary
	}

	needed := (*goalWeightLbs - current) / weeksRemaining
	status := "behind_pace"
	if (needed <= 0 && trend <= needed) || (needed >= 0 && trend >= needed) {
		status = "on_pace"
	}
	summary.PaceStatus = &status
	return summary
}

// GetWeightHistory returns raw weigh-ins plus a 7-day rolling average (the
// "truth" the dashboard shows — daily water-weight noise is the #1
// motivation killer) and a pace-vs-goal read computed from the trend slope.
func GetWeightHistory(c *gin.Context) {
	userID := c.GetString("user_id")
	days := parseRange(c.DefaultQuery("range", "90d"))

	entries, trendPerWeek, err := loadWeightEntries(c.Request.Context(), userID, days)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load weight history"})
		return
	}

	var profileWeightGoal *float64
	var profileGoalDate *string
	if err := db.Pool.QueryRow(c.Request.Context(),
		`SELECT weight_goal_lbs, goal_date FROM public.profiles WHERE id = $1`, userID,
	).Scan(&profileWeightGoal, &profileGoalDate); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "profile not found"})
		return
	}

	summary := computeWeightSummary(entries, trendPerWeek, profileWeightGoal, profileGoalDate)

	c.JSON(http.StatusOK, gin.H{"entries": entries, "summary": summary})
}
