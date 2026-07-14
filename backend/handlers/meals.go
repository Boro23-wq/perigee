package handlers

import (
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Boro23-wq/perigee/backend/db"
)

var validMealTypes = map[string]bool{
	"breakfast": true,
	"lunch":     true,
	"dinner":    true,
	"snack":     true,
	"drink":     true,
}

var validSources = map[string]bool{
	"manual":  true,
	"photo":   true,
	"recipe":  true,
	"barcode": true,
	"repeat":  true,
	"shared":  true,
}

type Meal struct {
	ID           string   `json:"id"`
	Date         string   `json:"date"`
	MealType     string   `json:"meal_type"`
	Source       string   `json:"source"`
	Name         string   `json:"name"`
	Calories     int      `json:"calories"`
	Protein      float64  `json:"protein"`
	Carbs        float64  `json:"carbs"`
	Fat          float64  `json:"fat"`
	Notes        *string  `json:"notes"`
	PhotoPath    *string  `json:"photo_path"`
	DetectedFood *string  `json:"detected_food"`
	AIConfidence *string  `json:"ai_confidence"`
	UserAdjusted bool     `json:"user_adjusted"`
	ServingGrams *float64 `json:"serving_grams"`
	CreatedAt    string   `json:"created_at"`
}

const mealColumns = `id, date, meal_type, source, name, calories, protein, carbs, fat, notes,
	photo_path, detected_food, ai_confidence, user_adjusted, serving_grams, created_at`

func scanMeal(row interface {
	Scan(dest ...any) error
}) (Meal, error) {
	var m Meal
	err := row.Scan(&m.ID, &m.Date, &m.MealType, &m.Source, &m.Name, &m.Calories,
		&m.Protein, &m.Carbs, &m.Fat, &m.Notes,
		&m.PhotoPath, &m.DetectedFood, &m.AIConfidence, &m.UserAdjusted, &m.ServingGrams, &m.CreatedAt)
	return m, err
}

type logMealRequest struct {
	Date     string  `json:"date"`
	MealType string  `json:"meal_type"`
	Source   string  `json:"source"`
	Name     string  `json:"name"`
	Calories int     `json:"calories"`
	Protein  float64 `json:"protein"`
	Carbs    float64 `json:"carbs"`
	Fat      float64 `json:"fat"`
	Notes    *string `json:"notes"`
}

// LogMeal validates and inserts a food_logs row. The client sends the local
// date explicitly (the phone knows the user's day, the server doesn't guess).
func LogMeal(c *gin.Context) {
	userID := c.GetString("user_id")

	var req logMealRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	date, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date must be YYYY-MM-DD"})
		return
	}
	// Sanity-check the date is within ±2 days of server time — prevents
	// backdating abuse while tolerating timezone skew between client/server.
	now := time.Now().UTC()
	if date.Before(now.AddDate(0, 0, -2)) || date.After(now.AddDate(0, 0, 2)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date out of allowed range"})
		return
	}

	if !validMealTypes[req.MealType] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid meal_type"})
		return
	}
	if !validSources[req.Source] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid source"})
		return
	}
	if req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}
	if req.Calories < 0 || req.Calories > 10000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "calories must be between 0 and 10000"})
		return
	}
	if req.Protein < 0 || req.Carbs < 0 || req.Fat < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "macros cannot be negative"})
		return
	}

	row := db.Pool.QueryRow(c.Request.Context(),
		`INSERT INTO public.food_logs
		   (user_id, date, meal_type, source, name, calories, protein, carbs, fat, notes)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		 RETURNING `+mealColumns,
		userID, req.Date, req.MealType, req.Source, req.Name, req.Calories,
		req.Protein, req.Carbs, req.Fat, req.Notes,
	)
	m, err := scanMeal(row)

	if err != nil {
		log.Printf("LogMeal insert error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to log meal"})
		return
	}

	c.JSON(http.StatusCreated, m)
}

// ShareMeal copies one of the caller's logged meals straight into their
// active partner's food_logs for the same date/meal type — no recipe object,
// no accept step, since being partnered is already mutual consent.
func ShareMeal(c *gin.Context) {
	userID := c.GetString("user_id")
	mealID := c.Param("id")

	var partnerID string
	err := db.Pool.QueryRow(c.Request.Context(),
		`SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END
		 FROM public.relationships
		 WHERE (requester_id = $1 OR addressee_id = $1) AND status = 'active'`,
		userID,
	).Scan(&partnerID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no active partner to share with"})
		return
	}

	var date, mealType, name string
	var calories int
	var protein, carbs, fat float64
	err = db.Pool.QueryRow(c.Request.Context(),
		`SELECT date, meal_type, name, calories, protein, carbs, fat
		 FROM public.food_logs WHERE id = $1 AND user_id = $2`,
		mealID, userID,
	).Scan(&date, &mealType, &name, &calories, &protein, &carbs, &fat)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "meal not found"})
		return
	}

	row := db.Pool.QueryRow(c.Request.Context(),
		`INSERT INTO public.food_logs
		   (user_id, date, meal_type, source, name, calories, protein, carbs, fat)
		 VALUES ($1, $2, $3, 'shared', $4, $5, $6, $7, $8)
		 RETURNING `+mealColumns,
		partnerID, date, mealType, name, calories, protein, carbs, fat,
	)
	m, err := scanMeal(row)
	if err != nil {
		log.Printf("ShareMeal insert error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to share meal"})
		return
	}

	c.JSON(http.StatusCreated, m)
}

type dayTotals struct {
	Calories int     `json:"calories"`
	Protein  float64 `json:"protein"`
	Carbs    float64 `json:"carbs"`
	Fat      float64 `json:"fat"`
}

// GetMeals returns a day's meals plus totals.
func GetMeals(c *gin.Context) {
	userID := c.GetString("user_id")
	dateParam := c.Query("date")

	if _, err := time.Parse("2006-01-02", dateParam); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date query param must be YYYY-MM-DD"})
		return
	}

	rows, err := db.Pool.Query(c.Request.Context(),
		`SELECT `+mealColumns+`
		 FROM public.food_logs
		 WHERE user_id = $1 AND date = $2
		 ORDER BY created_at`,
		userID, dateParam,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load meals"})
		return
	}
	defer rows.Close()

	meals := []Meal{}
	totals := dayTotals{}
	for rows.Next() {
		m, err := scanMeal(rows)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read meals"})
			return
		}
		meals = append(meals, m)
		totals.Calories += m.Calories
		totals.Protein += m.Protein
		totals.Carbs += m.Carbs
		totals.Fat += m.Fat
	}

	c.JSON(http.StatusOK, gin.H{"meals": meals, "totals": totals})
}

type usual struct {
	Name     string  `json:"name"`
	MealType string  `json:"meal_type"`
	Calories int     `json:"calories"`
	Protein  float64 `json:"protein"`
	Carbs    float64 `json:"carbs"`
	Fat      float64 `json:"fat"`
	Times    int     `json:"times"`
	Last     string  `json:"last"`
}

// currentMealType buckets the hour of day into a meal_type so usuals
// matching the current time of day are surfaced first.
func currentMealType(loc *time.Location) string {
	hour := time.Now().In(loc).Hour()
	switch {
	case hour >= 5 && hour < 11:
		return "breakfast"
	case hour >= 11 && hour < 15:
		return "lunch"
	case hour >= 15 && hour < 21:
		return "dinner"
	default:
		return "snack"
	}
}

// GetUsuals returns the top 8 most-repeated meals from the last 30 days,
// with meals matching the current time of day surfaced first. This replaces
// the brittle exact-hash meal_patterns table — it's just a query.
func GetUsuals(c *gin.Context) {
	userID := c.GetString("user_id")

	var timezone string
	if err := db.Pool.QueryRow(c.Request.Context(),
		`SELECT timezone FROM public.profiles WHERE id = $1`, userID,
	).Scan(&timezone); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "profile not found"})
		return
	}

	loc, err := time.LoadLocation(timezone)
	if err != nil {
		loc = time.UTC
	}
	current := currentMealType(loc)

	rows, err := db.Pool.Query(c.Request.Context(),
		`SELECT name, meal_type, calories, protein, carbs, fat, COUNT(*) AS times, MAX(date) AS last
		 FROM public.food_logs
		 WHERE user_id = $1 AND source <> 'recipe' AND date > CURRENT_DATE - 30
		 GROUP BY name, meal_type, calories, protein, carbs, fat
		 ORDER BY (meal_type = $2) DESC, times DESC, last DESC
		 LIMIT 8`,
		userID, current,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load usuals"})
		return
	}
	defer rows.Close()

	usuals := []usual{}
	for rows.Next() {
		var u usual
		if err := rows.Scan(&u.Name, &u.MealType, &u.Calories, &u.Protein, &u.Carbs, &u.Fat, &u.Times, &u.Last); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read usuals"})
			return
		}
		usuals = append(usuals, u)
	}

	c.JSON(http.StatusOK, gin.H{"usuals": usuals})
}

// DeleteMeal removes a food_logs row, scoped to the authenticated user so
// one user can never delete another's entry.
func DeleteMeal(c *gin.Context) {
	userID := c.GetString("user_id")
	id := c.Param("id")

	tag, err := db.Pool.Exec(c.Request.Context(),
		`DELETE FROM public.food_logs WHERE id = $1 AND user_id = $2`,
		id, userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete meal"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "meal not found"})
		return
	}

	c.Status(http.StatusNoContent)
}
