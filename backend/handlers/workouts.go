package handlers

import (
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Boro23-wq/perigee/backend/db"
)

type Workout struct {
	ID             string `json:"id"`
	Date           string `json:"date"`
	Name           string `json:"name"`
	Minutes        *int   `json:"minutes"`
	CaloriesBurned int    `json:"calories_burned"`
	CreatedAt      string `json:"created_at"`
}

type logWorkoutRequest struct {
	Date           string `json:"date"`
	Name           string `json:"name"`
	Minutes        *int   `json:"minutes"`
	CaloriesBurned int    `json:"calories_burned"`
}

// LogWorkout inserts one workout entry — unlike the old activity_logs
// upsert-per-day, this is one-to-many per day (same shape as food_logs), so
// a second workout the same day adds a row instead of overwriting the first.
// The client has already computed calories_burned (net/active calories at
// the weight known at log time); this validates and stores that snapshot
// rather than recomputing it, so a later weigh-in can't retroactively change
// a past day's burn total.
func LogWorkout(c *gin.Context) {
	userID := c.GetString("user_id")

	var req logWorkoutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	date, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date must be YYYY-MM-DD"})
		return
	}
	now := time.Now().UTC()
	if date.Before(now.AddDate(0, 0, -2)) || date.After(now.AddDate(0, 0, 2)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date out of allowed range"})
		return
	}
	if req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}
	if req.Minutes != nil && *req.Minutes < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "minutes cannot be negative"})
		return
	}
	if req.CaloriesBurned < 0 || req.CaloriesBurned > 5000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "calories_burned must be between 0 and 5000"})
		return
	}

	var w Workout
	err = db.Pool.QueryRow(c.Request.Context(),
		`INSERT INTO public.workout_logs (user_id, date, name, minutes, calories_burned)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, date, name, minutes, calories_burned, created_at`,
		userID, req.Date, req.Name, req.Minutes, req.CaloriesBurned,
	).Scan(&w.ID, &w.Date, &w.Name, &w.Minutes, &w.CaloriesBurned, &w.CreatedAt)

	if err != nil {
		log.Printf("LogWorkout insert error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to log workout"})
		return
	}

	c.JSON(http.StatusCreated, w)
}

// GetWorkouts lists a single day's workouts, oldest first — the dashboard
// shows them as a running list, same idea as a day's meals.
func GetWorkouts(c *gin.Context) {
	userID := c.GetString("user_id")
	dateParam := c.Query("date")

	if _, err := time.Parse("2006-01-02", dateParam); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date query param must be YYYY-MM-DD"})
		return
	}

	rows, err := db.Pool.Query(c.Request.Context(),
		`SELECT id, date, name, minutes, calories_burned, created_at
		 FROM public.workout_logs WHERE user_id = $1 AND date = $2
		 ORDER BY created_at`,
		userID, dateParam,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load workouts"})
		return
	}
	defer rows.Close()

	workouts := []Workout{}
	for rows.Next() {
		var w Workout
		if err := rows.Scan(&w.ID, &w.Date, &w.Name, &w.Minutes, &w.CaloriesBurned, &w.CreatedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read workouts"})
			return
		}
		workouts = append(workouts, w)
	}

	c.JSON(http.StatusOK, gin.H{"workouts": workouts})
}

// GetWorkoutsRange returns every workout in an inclusive date range — used
// by the History page to show past workouts alongside whatever span of past
// meals is currently loaded there, rather than a separate paginated feed.
func GetWorkoutsRange(c *gin.Context) {
	userID := c.GetString("user_id")
	start := c.Query("start")
	end := c.Query("end")

	if _, err := time.Parse("2006-01-02", start); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "start must be YYYY-MM-DD"})
		return
	}
	if _, err := time.Parse("2006-01-02", end); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "end must be YYYY-MM-DD"})
		return
	}

	rows, err := db.Pool.Query(c.Request.Context(),
		`SELECT id, date, name, minutes, calories_burned, created_at
		 FROM public.workout_logs WHERE user_id = $1 AND date BETWEEN $2 AND $3
		 ORDER BY date DESC, created_at`,
		userID, start, end,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load workouts"})
		return
	}
	defer rows.Close()

	workouts := []Workout{}
	for rows.Next() {
		var w Workout
		if err := rows.Scan(&w.ID, &w.Date, &w.Name, &w.Minutes, &w.CaloriesBurned, &w.CreatedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read workouts"})
			return
		}
		workouts = append(workouts, w)
	}

	c.JSON(http.StatusOK, gin.H{"workouts": workouts})
}

// DeleteWorkout removes a single workout entry the caller owns.
func DeleteWorkout(c *gin.Context) {
	userID := c.GetString("user_id")
	id := c.Param("id")

	tag, err := db.Pool.Exec(c.Request.Context(),
		`DELETE FROM public.workout_logs WHERE id = $1 AND user_id = $2`,
		id, userID,
	)
	if err != nil {
		log.Printf("DeleteWorkout error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete workout"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "workout not found"})
		return
	}

	c.Status(http.StatusNoContent)
}
