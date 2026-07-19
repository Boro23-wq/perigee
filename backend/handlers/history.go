package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Boro23-wq/perigee/backend/db"
)

// GetLoggedDates returns the distinct dates within [start, end] that have at
// least one meal or workout logged — used to draw a "logged" indicator on
// calendar days without fetching every day's full data.
func GetLoggedDates(c *gin.Context) {
	userID := c.GetString("user_id")
	start := c.Query("start")
	end := c.Query("end")

	startDate, err := time.Parse("2006-01-02", start)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "start must be YYYY-MM-DD"})
		return
	}
	endDate, err := time.Parse("2006-01-02", end)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "end must be YYYY-MM-DD"})
		return
	}
	if endDate.Before(startDate) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "end must not be before start"})
		return
	}
	if endDate.Sub(startDate) > 92*24*time.Hour {
		c.JSON(http.StatusBadRequest, gin.H{"error": "range must be 92 days or fewer"})
		return
	}

	rows, err := db.Pool.Query(c.Request.Context(),
		`SELECT DISTINCT date FROM (
		   SELECT date FROM public.food_logs WHERE user_id = $1 AND date BETWEEN $2 AND $3
		   UNION
		   SELECT date FROM public.workout_logs WHERE user_id = $1 AND date BETWEEN $2 AND $3
		 ) d ORDER BY date`,
		userID, start, end,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load logged dates"})
		return
	}
	defer rows.Close()

	dates := []string{}
	for rows.Next() {
		var d string
		if err := rows.Scan(&d); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read logged dates"})
			return
		}
		dates = append(dates, d)
	}

	c.JSON(http.StatusOK, gin.H{"dates": dates})
}
