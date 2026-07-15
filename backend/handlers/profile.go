package handlers

import (
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

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
	HeightIn           *float64 `json:"height_in"`
	Onboarded          bool     `json:"onboarded"`
}

const profileSelectColumns = `id, display_name, timezone, daily_calorie_budget, week_start_day,
	        weight_goal_lbs, goal_date, height_in, (onboarded_at IS NOT NULL) AS onboarded`

func scanProfile(row interface {
	Scan(dest ...any) error
}) (Profile, error) {
	var p Profile
	err := row.Scan(&p.ID, &p.DisplayName, &p.Timezone, &p.DailyCalorieBudget, &p.WeekStartDay,
		&p.WeightGoalLbs, &p.GoalDate, &p.HeightIn, &p.Onboarded)
	return p, err
}

// GetMe returns the authenticated user's profile row, proving the JWT
// middleware and the Postgres connection both work end to end.
func GetMe(c *gin.Context) {
	userID := c.GetString("user_id")

	p, err := scanProfile(db.Pool.QueryRow(c.Request.Context(),
		`SELECT `+profileSelectColumns+` FROM public.profiles WHERE id = $1`,
		userID,
	))

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "profile not found"})
		return
	}

	c.JSON(http.StatusOK, p)
}

type updateProfileRequest struct {
	DisplayName        *string  `json:"display_name"`
	HeightIn           *float64 `json:"height_in"`
	DailyCalorieBudget *int     `json:"daily_calorie_budget"`
	WeightGoalLbs      *float64 `json:"weight_goal_lbs"`
	GoalDate           *string  `json:"goal_date"`
	CompleteOnboarding bool     `json:"complete_onboarding"`
}

// UpdateProfile applies a partial update to the caller's profile row —
// used by both the one-time onboarding form (with complete_onboarding=true)
// and the regular profile/settings page. Only fields present in the request
// are touched; everything else is left as-is.
func UpdateProfile(c *gin.Context) {
	userID := c.GetString("user_id")

	var req updateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	if req.HeightIn != nil && (*req.HeightIn < 24 || *req.HeightIn > 96) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "height_in must be between 24 and 96"})
		return
	}
	if req.DailyCalorieBudget != nil && (*req.DailyCalorieBudget < 800 || *req.DailyCalorieBudget > 10000) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "daily_calorie_budget must be between 800 and 10000"})
		return
	}
	if req.WeightGoalLbs != nil && (*req.WeightGoalLbs <= 0 || *req.WeightGoalLbs >= 1500) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "weight_goal_lbs must be between 0 and 1500"})
		return
	}
	if req.GoalDate != nil {
		if _, err := time.Parse("2006-01-02", *req.GoalDate); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "goal_date must be YYYY-MM-DD"})
			return
		}
	}

	sets := []string{}
	args := []any{}
	next := func(v any) string {
		args = append(args, v)
		return fmt.Sprintf("$%d", len(args))
	}

	if req.DisplayName != nil {
		sets = append(sets, "display_name = "+next(*req.DisplayName))
	}
	if req.HeightIn != nil {
		sets = append(sets, "height_in = "+next(*req.HeightIn))
	}
	if req.DailyCalorieBudget != nil {
		sets = append(sets, "daily_calorie_budget = "+next(*req.DailyCalorieBudget))
	}
	if req.WeightGoalLbs != nil {
		sets = append(sets, "weight_goal_lbs = "+next(*req.WeightGoalLbs))
	}
	if req.GoalDate != nil {
		sets = append(sets, "goal_date = "+next(*req.GoalDate))
	}
	if req.CompleteOnboarding {
		sets = append(sets, "onboarded_at = now()")
	}
	sets = append(sets, "updated_at = now()")

	args = append(args, userID)
	query := fmt.Sprintf(
		`UPDATE public.profiles SET %s WHERE id = $%d RETURNING %s`,
		strings.Join(sets, ", "), len(args), profileSelectColumns,
	)

	p, err := scanProfile(db.Pool.QueryRow(c.Request.Context(), query, args...))
	if err != nil {
		log.Printf("UpdateProfile error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update profile"})
		return
	}

	c.JSON(http.StatusOK, p)
}
