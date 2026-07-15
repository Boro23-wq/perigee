package handlers

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Boro23-wq/perigee/backend/db"
)

type dayStat struct {
	Date            string `json:"date"`
	Consumed        int    `json:"consumed"`
	Burned          int    `json:"burned"`
	EffectiveBudget int    `json:"effective_budget"`
}

type weeklyStats struct {
	WeekStart           string    `json:"week_start"`
	WeekEnd             string    `json:"week_end"`
	Timezone            string    `json:"timezone"`
	DailyCalorieBudget  int       `json:"daily_calorie_budget"`
	Days                []dayStat `json:"days"`
	DaysElapsed         int       `json:"days_elapsed"`
	DaysRemaining       int       `json:"days_remaining"`
	WeeklyBudgetTotal   int       `json:"weekly_budget_total"`
	WeeklyConsumedSoFar int       `json:"weekly_consumed_so_far"`
	// Banking is capped at ±300 for display — the app never encourages
	// starving one day to "save up" for another.
	Banking         int            `json:"banking"`
	RemainingBudget int            `json:"remaining_budget"`
	RemainingPerDay float64        `json:"remaining_per_day"`
	WeightTrend     *weightSummary `json:"weight_trend"`
}

const maxDailyBurnCredit = 500
const bankingDisplayCap = 300

func clampInt(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// GetWeeklyStats computes the deficit dashboard's core numbers: the week
// window in the user's own timezone, an activity-adjusted budget per day,
// and a banking figure so a good day doesn't get wiped out by rounding.
func GetWeeklyStats(c *gin.Context) {
	userID := c.GetString("user_id")

	stats, err := computeWeeklyStats(c.Request.Context(), userID)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, errProfileNotFound) {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, stats)
}

var errProfileNotFound = errors.New("profile not found")

// computeWeeklyStats is the pure-data core of GetWeeklyStats, factored out so
// the coach check-in can feed the same numbers to Claude without an HTTP round trip.
func computeWeeklyStats(ctx context.Context, userID string) (*weeklyStats, error) {
	var timezone string
	var dailyBudget int
	var weekStartDay int16
	if err := db.Pool.QueryRow(ctx,
		`SELECT timezone, daily_calorie_budget, week_start_day FROM public.profiles WHERE id = $1`,
		userID,
	).Scan(&timezone, &dailyBudget, &weekStartDay); err != nil {
		return nil, errProfileNotFound
	}

	loc, err := time.LoadLocation(timezone)
	if err != nil {
		loc = time.UTC
	}
	// time.Truncate(24h) rounds to UTC day boundaries, not local midnight —
	// for non-UTC offsets that silently shifts "today" by a day. Build the
	// local calendar date from wall-clock components instead.
	now := time.Now().In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	// Go's time.Weekday is already 0=Sunday..6=Saturday, matching week_start_day's convention.
	todayOffset := (int(today.Weekday()) - int(weekStartDay) + 7) % 7
	weekStart := today.AddDate(0, 0, -todayOffset)
	weekEnd := weekStart.AddDate(0, 0, 6)

	consumedByDate := map[string]int{}
	rows, err := db.Pool.Query(ctx,
		`SELECT date, SUM(calories) FROM public.food_logs
		 WHERE user_id = $1 AND date BETWEEN $2 AND $3
		 GROUP BY date`,
		userID, weekStart.Format("2006-01-02"), weekEnd.Format("2006-01-02"),
	)
	if err != nil {
		return nil, errors.New("failed to load consumed calories")
	}
	for rows.Next() {
		var date string
		var sum int
		if err := rows.Scan(&date, &sum); err != nil {
			rows.Close()
			return nil, errors.New("failed to read consumed calories")
		}
		consumedByDate[date] = sum
	}
	rows.Close()

	burnedByDate := map[string]int{}
	burnRows, err := db.Pool.Query(ctx,
		`SELECT date, SUM(calories_burned) FROM public.activity_logs
		 WHERE user_id = $1 AND date BETWEEN $2 AND $3
		 GROUP BY date`,
		userID, weekStart.Format("2006-01-02"), weekEnd.Format("2006-01-02"),
	)
	if err != nil {
		return nil, errors.New("failed to load burned calories")
	}
	for burnRows.Next() {
		var date string
		var sum int
		if err := burnRows.Scan(&date, &sum); err != nil {
			burnRows.Close()
			return nil, errors.New("failed to read burned calories")
		}
		burnedByDate[date] = sum
	}
	burnRows.Close()

	days := make([]dayStat, 7)
	weeklyBudgetTotal := 0
	weeklyConsumedSoFar := 0
	bankingRaw := 0

	for i := 0; i < 7; i++ {
		date := weekStart.AddDate(0, 0, i)
		dateStr := date.Format("2006-01-02")
		consumed := consumedByDate[dateStr]
		burned := burnedByDate[dateStr]
		effectiveBudget := dailyBudget + min(burned, maxDailyBurnCredit)

		days[i] = dayStat{
			Date:            dateStr,
			Consumed:        consumed,
			Burned:          burned,
			EffectiveBudget: effectiveBudget,
		}
		weeklyBudgetTotal += effectiveBudget

		// "Elapsed" includes today — today's meals logged so far still count,
		// even though today's budget also still applies toward what's left.
		if i <= todayOffset {
			weeklyConsumedSoFar += consumed
			bankingRaw += effectiveBudget - consumed
		}
	}

	daysRemaining := 7 - (todayOffset + 1)
	remainingBudget := weeklyBudgetTotal - weeklyConsumedSoFar
	remainingPerDay := float64(remainingBudget) / float64(max(daysRemaining, 1))

	var goalWeightLbs *float64
	var goalDate *string
	db.Pool.QueryRow(ctx,
		`SELECT weight_goal_lbs, goal_date FROM public.profiles WHERE id = $1`, userID,
	).Scan(&goalWeightLbs, &goalDate)

	weightEntries, trendPerWeek, err := loadWeightEntries(ctx, userID, 30)
	var weightTrend *weightSummary
	if err == nil {
		summary := computeWeightSummary(weightEntries, trendPerWeek, goalWeightLbs, goalDate)
		weightTrend = &summary
	}

	stats := &weeklyStats{
		WeekStart:           weekStart.Format("2006-01-02"),
		WeekEnd:             weekEnd.Format("2006-01-02"),
		Timezone:            timezone,
		DailyCalorieBudget:  dailyBudget,
		Days:                days,
		DaysElapsed:         todayOffset + 1,
		DaysRemaining:       daysRemaining,
		WeeklyBudgetTotal:   weeklyBudgetTotal,
		WeeklyConsumedSoFar: weeklyConsumedSoFar,
		Banking:             clampInt(bankingRaw, -bankingDisplayCap, bankingDisplayCap),
		RemainingBudget:     remainingBudget,
		RemainingPerDay:     remainingPerDay,
		WeightTrend:         weightTrend,
	}

	return stats, nil
}
