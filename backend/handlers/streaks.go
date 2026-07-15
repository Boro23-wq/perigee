package handlers

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Boro23-wq/perigee/backend/db"
)

type streakInfo struct {
	CurrentStreak int    `json:"current_streak"`
	LongestStreak int    `json:"longest_streak"`
	LoggedToday   bool   `json:"logged_today"`
	Last7Days     []bool `json:"last_7_days"` // oldest first, index 6 is today
}

const foodLogDatesQuery = `SELECT DISTINCT date FROM public.food_logs WHERE user_id = $1 AND date > CURRENT_DATE - 400`
const weightLogDatesQuery = `SELECT DISTINCT date FROM public.weight_logs WHERE user_id = $1 AND date > CURRENT_DATE - 400`

func loadDateSet(ctx context.Context, query, userID string) (map[string]bool, error) {
	rows, err := db.Pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	set := map[string]bool{}
	for rows.Next() {
		var dateStr string
		if err := rows.Scan(&dateStr); err != nil {
			return nil, err
		}
		set[dateStr] = true
	}
	return set, rows.Err()
}

// computeStreak counts consecutive local days where the user logged both a
// meal and a weigh-in. Both habits are required for a day to count — the
// accountability bar is "did you show up for both", not just one.
func computeStreak(ctx context.Context, userID, timezone string) (streakInfo, error) {
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		loc = time.UTC
	}
	now := time.Now().In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)

	mealDates, err := loadDateSet(ctx, foodLogDatesQuery, userID)
	if err != nil {
		return streakInfo{}, err
	}
	weightDates, err := loadDateSet(ctx, weightLogDatesQuery, userID)
	if err != nil {
		return streakInfo{}, err
	}

	qualifies := func(d time.Time) bool {
		key := d.Format("2006-01-02")
		return mealDates[key] && weightDates[key]
	}

	loggedToday := qualifies(today)

	// If today isn't complete yet (e.g. it's 9am and the weigh-in hasn't
	// happened), start counting from yesterday so the streak doesn't
	// falsely show as broken before the day is over.
	cursor := today
	if !loggedToday {
		cursor = today.AddDate(0, 0, -1)
	}
	current := 0
	for qualifies(cursor) {
		current++
		cursor = cursor.AddDate(0, 0, -1)
	}

	longest := 0
	run := 0
	cursor = today
	for i := 0; i < 400; i++ {
		if qualifies(cursor) {
			run++
			if run > longest {
				longest = run
			}
		} else {
			run = 0
		}
		cursor = cursor.AddDate(0, 0, -1)
	}

	last7 := make([]bool, 7)
	cursor = today.AddDate(0, 0, -6)
	for i := 0; i < 7; i++ {
		last7[i] = qualifies(cursor)
		cursor = cursor.AddDate(0, 0, 1)
	}

	return streakInfo{
		CurrentStreak: current,
		LongestStreak: longest,
		LoggedToday:   loggedToday,
		Last7Days:     last7,
	}, nil
}

// GetStreak returns the caller's current/longest daily logging streak.
func GetStreak(c *gin.Context) {
	userID := c.GetString("user_id")

	var timezone string
	if err := db.Pool.QueryRow(c.Request.Context(),
		`SELECT timezone FROM public.profiles WHERE id = $1`, userID,
	).Scan(&timezone); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "profile not found"})
		return
	}

	streak, err := computeStreak(c.Request.Context(), userID, timezone)
	if err != nil {
		log.Printf("computeStreak error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to compute streak"})
		return
	}

	c.JSON(http.StatusOK, streak)
}
