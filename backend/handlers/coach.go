package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Boro23-wq/perigee/backend/coach"
	"github.com/Boro23-wq/perigee/backend/db"
)

var validMoods = map[string]bool{
	"great": true,
	"ok":    true,
	"rough": true,
}

type checkinRequest struct {
	Date string `json:"date"`
	Mood string `json:"mood"`
}

type checkinResponse struct {
	Date          string  `json:"date"`
	Mood          *string `json:"mood"`
	CoachResponse string  `json:"coach_response"`
}

// CreateCheckin computes today's real numbers, asks Claude for a short
// grounded message, and upserts one check-in per user per day (re-checking
// in the same day just refreshes the message with current numbers).
func CreateCheckin(c *gin.Context) {
	userID := c.GetString("user_id")

	var req checkinRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	if _, err := time.Parse("2006-01-02", req.Date); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date must be YYYY-MM-DD"})
		return
	}
	if req.Mood != "" && !validMoods[req.Mood] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid mood"})
		return
	}

	stats, err := computeWeeklyStats(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load stats"})
		return
	}

	var today *dayStat
	for i := range stats.Days {
		if stats.Days[i].Date == req.Date {
			today = &stats.Days[i]
			break
		}
	}
	if today == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date is outside the current week"})
		return
	}

	snapshot := coach.Snapshot{
		DailyCalorieBudget:  stats.DailyCalorieBudget,
		ConsumedToday:       today.Consumed,
		RemainingToday:      today.EffectiveBudget - today.Consumed,
		Banking:             stats.Banking,
		RemainingPerDay:     stats.RemainingPerDay,
		DaysRemainingInWeek: stats.DaysRemaining,
		WeightTrendPerWeek:  nil,
		PaceStatus:          nil,
	}
	if stats.WeightTrend != nil {
		snapshot.WeightTrendPerWeek = stats.WeightTrend.TrendLbsPerWeek
		snapshot.PaceStatus = stats.WeightTrend.PaceStatus
	}

	message, err := coach.GenerateCheckin(req.Mood, snapshot)
	if err != nil {
		log.Printf("coach.GenerateCheckin error: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "coach is unavailable right now"})
		return
	}

	snapshotJSON, err := json.Marshal(snapshot)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encode snapshot"})
		return
	}

	var mood *string
	if req.Mood != "" {
		mood = &req.Mood
	}

	if _, err := db.Pool.Exec(c.Request.Context(),
		`INSERT INTO public.coach_checkins (user_id, date, user_mood, stats_snapshot, coach_response)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (user_id, date) DO UPDATE
		   SET user_mood = $3, stats_snapshot = $4, coach_response = $5`,
		userID, req.Date, mood, string(snapshotJSON), message,
	); err != nil {
		log.Printf("CreateCheckin insert error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save check-in"})
		return
	}

	c.JSON(http.StatusCreated, checkinResponse{Date: req.Date, Mood: mood, CoachResponse: message})
}

// GetCheckin returns the day's existing check-in, if the user already did one.
func GetCheckin(c *gin.Context) {
	userID := c.GetString("user_id")
	dateParam := c.Query("date")

	if _, err := time.Parse("2006-01-02", dateParam); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date query param must be YYYY-MM-DD"})
		return
	}

	var mood *string
	var response string
	err := db.Pool.QueryRow(c.Request.Context(),
		`SELECT user_mood, coach_response FROM public.coach_checkins WHERE user_id = $1 AND date = $2`,
		userID, dateParam,
	).Scan(&mood, &response)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no check-in for that date"})
		return
	}

	c.JSON(http.StatusOK, checkinResponse{Date: dateParam, Mood: mood, CoachResponse: response})
}
