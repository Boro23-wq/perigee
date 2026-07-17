package coach

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/Boro23-wq/perigee/backend/db"
)

type toolInputSchema struct {
	Type       string                    `json:"type"`
	Properties map[string]map[string]any `json:"properties"`
	Required   []string                  `json:"required"`
}

type toolDef struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	InputSchema toolInputSchema `json:"input_schema"`
}

var emptySchema = toolInputSchema{Type: "object", Properties: map[string]map[string]any{}, Required: []string{}}

var chatTools = []toolDef{
	{
		Name:        "get_todays_meals",
		Description: "Every food the user has logged today, with per-item calories and macros. Use this before commenting on what they ate today instead of trusting a verbal description alone.",
		InputSchema: emptySchema,
	},
	{
		Name:        "get_todays_workouts",
		Description: "Every workout the user has logged today, with minutes and calories burned.",
		InputSchema: emptySchema,
	},
	{
		Name:        "get_recent_meals",
		Description: "Food logged over the past N days, not including today — useful for spotting patterns like eating out frequency or day-to-day consistency.",
		InputSchema: toolInputSchema{
			Type: "object",
			Properties: map[string]map[string]any{
				"days": {"type": "integer", "description": "How many past days to look back, 1-14"},
			},
			Required: []string{"days"},
		},
	},
}

// runTool executes a single tool_use block Claude requested and returns the
// JSON string to send back as its tool_result. userID scopes every query;
// today is the caller's local date (already resolved via their timezone by
// buildChatContext), so "today's meals" means the same day the user sees
// in the app, not a UTC-boundary guess.
func runTool(ctx context.Context, userID, today string, tu contentBlock) (string, error) {
	switch tu.Name {
	case "get_todays_meals":
		return todaysMealsJSON(ctx, userID, today)
	case "get_todays_workouts":
		return todaysWorkoutsJSON(ctx, userID, today)
	case "get_recent_meals":
		var input struct {
			Days int `json:"days"`
		}
		_ = json.Unmarshal(tu.Input, &input)
		return recentMealsJSON(ctx, userID, today, input.Days)
	default:
		return "", fmt.Errorf("unknown tool: %s", tu.Name)
	}
}

type mealEntry struct {
	Name     string  `json:"name"`
	MealType string  `json:"meal_type"`
	Calories int     `json:"calories"`
	Protein  float64 `json:"protein"`
	Carbs    float64 `json:"carbs"`
	Fat      float64 `json:"fat"`
}

func todaysMealsJSON(ctx context.Context, userID, today string) (string, error) {
	rows, err := db.Pool.Query(ctx,
		`SELECT name, meal_type, calories, protein, carbs, fat
		 FROM public.food_logs WHERE user_id = $1 AND date = $2
		 ORDER BY created_at`,
		userID, today,
	)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	meals := []mealEntry{}
	for rows.Next() {
		var m mealEntry
		if err := rows.Scan(&m.Name, &m.MealType, &m.Calories, &m.Protein, &m.Carbs, &m.Fat); err != nil {
			return "", err
		}
		meals = append(meals, m)
	}
	b, err := json.Marshal(meals)
	return string(b), err
}

type workoutEntry struct {
	Name           string `json:"name"`
	Minutes        *int   `json:"minutes"`
	CaloriesBurned int    `json:"calories_burned"`
}

func todaysWorkoutsJSON(ctx context.Context, userID, today string) (string, error) {
	rows, err := db.Pool.Query(ctx,
		`SELECT name, minutes, calories_burned
		 FROM public.workout_logs WHERE user_id = $1 AND date = $2
		 ORDER BY created_at`,
		userID, today,
	)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	workouts := []workoutEntry{}
	for rows.Next() {
		var w workoutEntry
		if err := rows.Scan(&w.Name, &w.Minutes, &w.CaloriesBurned); err != nil {
			return "", err
		}
		workouts = append(workouts, w)
	}
	b, err := json.Marshal(workouts)
	return string(b), err
}

type dailyMealEntry struct {
	Date     string `json:"date"`
	Name     string `json:"name"`
	MealType string `json:"meal_type"`
	Calories int    `json:"calories"`
}

func recentMealsJSON(ctx context.Context, userID, today string, days int) (string, error) {
	if days < 1 {
		days = 1
	}
	if days > 14 {
		days = 14
	}

	rows, err := db.Pool.Query(ctx,
		`SELECT date, name, meal_type, calories
		 FROM public.food_logs
		 WHERE user_id = $1 AND date < $2 AND date >= ($2::date - make_interval(days => $3))
		 ORDER BY date DESC, created_at`,
		userID, today, days,
	)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	meals := []dailyMealEntry{}
	for rows.Next() {
		var m dailyMealEntry
		if err := rows.Scan(&m.Date, &m.Name, &m.MealType, &m.Calories); err != nil {
			return "", err
		}
		meals = append(meals, m)
	}
	b, err := json.Marshal(meals)
	return string(b), err
}
