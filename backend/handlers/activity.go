package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Boro23-wq/perigee/backend/db"
)

type logActivityRequest struct {
	Date  string `json:"date"`
	Steps *int   `json:"steps"`
}

type ActivityEntry struct {
	Date  string `json:"date"`
	Steps *int   `json:"steps"`
}

// LogActivity upserts a single steps figure per day — steps genuinely is a
// once-a-day summary (synced from a phone or entered once), unlike workouts
// which live in workout_logs as one row per workout.
func LogActivity(c *gin.Context) {
	userID := c.GetString("user_id")

	var req logActivityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	if _, err := time.Parse("2006-01-02", req.Date); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date must be YYYY-MM-DD"})
		return
	}
	if req.Steps != nil && (*req.Steps < 0 || *req.Steps > 200000) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "steps must be between 0 and 200000"})
		return
	}

	var entry ActivityEntry
	err := db.Pool.QueryRow(c.Request.Context(),
		`INSERT INTO public.activity_logs (user_id, date, steps)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (user_id, date) DO UPDATE SET steps = excluded.steps
		 RETURNING date, steps`,
		userID, req.Date, req.Steps,
	).Scan(&entry.Date, &entry.Steps)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to log activity"})
		return
	}

	c.JSON(http.StatusCreated, entry)
}

// GetActivity returns a single day's steps, or null if nothing's logged yet.
func GetActivity(c *gin.Context) {
	userID := c.GetString("user_id")
	dateParam := c.Query("date")

	if _, err := time.Parse("2006-01-02", dateParam); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date query param must be YYYY-MM-DD"})
		return
	}

	var entry ActivityEntry
	err := db.Pool.QueryRow(c.Request.Context(),
		`SELECT date, steps FROM public.activity_logs WHERE user_id = $1 AND date = $2`,
		userID, dateParam,
	).Scan(&entry.Date, &entry.Steps)

	if err != nil {
		c.JSON(http.StatusOK, gin.H{"date": dateParam, "steps": nil})
		return
	}

	c.JSON(http.StatusOK, entry)
}
