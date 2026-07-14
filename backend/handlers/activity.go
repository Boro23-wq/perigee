package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Boro23-wq/perigee/backend/db"
)

type logActivityRequest struct {
	Date           string  `json:"date"`
	Steps          *int    `json:"steps"`
	WorkoutType    *string `json:"workout_type"`
	WorkoutMinutes *int    `json:"workout_minutes"`
	CaloriesBurned int     `json:"calories_burned"`
}

type ActivityEntry struct {
	Date           string  `json:"date"`
	Steps          *int    `json:"steps"`
	WorkoutType    *string `json:"workout_type"`
	WorkoutMinutes *int    `json:"workout_minutes"`
	CaloriesBurned int     `json:"calories_burned"`
}

// LogActivity upserts a single activity summary per day — like weight,
// re-logging the same day (e.g. updating steps later, or adding a workout)
// replaces the row rather than erroring.
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
	if req.WorkoutMinutes != nil && *req.WorkoutMinutes < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workout_minutes cannot be negative"})
		return
	}
	if req.CaloriesBurned < 0 || req.CaloriesBurned > 5000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "calories_burned must be between 0 and 5000"})
		return
	}

	var entry ActivityEntry
	err := db.Pool.QueryRow(c.Request.Context(),
		`INSERT INTO public.activity_logs
		   (user_id, date, steps, workout_type, workout_minutes, calories_burned)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (user_id, date)
		   DO UPDATE SET steps = excluded.steps,
		                 workout_type = excluded.workout_type,
		                 workout_minutes = excluded.workout_minutes,
		                 calories_burned = excluded.calories_burned
		 RETURNING date, steps, workout_type, workout_minutes, calories_burned`,
		userID, req.Date, req.Steps, req.WorkoutType, req.WorkoutMinutes, req.CaloriesBurned,
	).Scan(&entry.Date, &entry.Steps, &entry.WorkoutType, &entry.WorkoutMinutes, &entry.CaloriesBurned)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to log activity"})
		return
	}

	c.JSON(http.StatusCreated, entry)
}

// GetActivity returns a single day's activity entry, or zero values if
// nothing has been logged that day.
func GetActivity(c *gin.Context) {
	userID := c.GetString("user_id")
	dateParam := c.Query("date")

	if _, err := time.Parse("2006-01-02", dateParam); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date query param must be YYYY-MM-DD"})
		return
	}

	var entry ActivityEntry
	err := db.Pool.QueryRow(c.Request.Context(),
		`SELECT date, steps, workout_type, workout_minutes, calories_burned
		 FROM public.activity_logs WHERE user_id = $1 AND date = $2`,
		userID, dateParam,
	).Scan(&entry.Date, &entry.Steps, &entry.WorkoutType, &entry.WorkoutMinutes, &entry.CaloriesBurned)

	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"date": dateParam, "steps": nil, "workout_type": nil,
			"workout_minutes": nil, "calories_burned": 0,
		})
		return
	}

	c.JSON(http.StatusOK, entry)
}
