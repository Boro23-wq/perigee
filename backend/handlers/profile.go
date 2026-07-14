package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/Boro23-wq/perigee/backend/db"
)

type Profile struct {
	ID                 string   `json:"id"`
	DisplayName        *string  `json:"display_name"`
	Timezone           string   `json:"timezone"`
	DailyCalorieBudget int      `json:"daily_calorie_budget"`
	WeekStartDay       int16    `json:"week_start_day"`
	WeightGoalLbs      *float64 `json:"weight_goal_lbs"`
	GoalDate           *string  `json:"goal_date"`
}

// GetMe returns the authenticated user's profile row, proving the JWT
// middleware and the Postgres connection both work end to end.
func GetMe(c *gin.Context) {
	userID := c.GetString("user_id")

	var p Profile
	err := db.Pool.QueryRow(c.Request.Context(),
		`SELECT id, display_name, timezone, daily_calorie_budget, week_start_day,
		        weight_goal_lbs, goal_date
		 FROM public.profiles WHERE id = $1`,
		userID,
	).Scan(&p.ID, &p.DisplayName, &p.Timezone, &p.DailyCalorieBudget, &p.WeekStartDay,
		&p.WeightGoalLbs, &p.GoalDate)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "profile not found"})
		return
	}

	c.JSON(http.StatusOK, p)
}
