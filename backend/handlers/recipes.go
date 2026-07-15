package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Boro23-wq/perigee/backend/db"
)

// unmarshalIngredients decodes the recipes.ingredients jsonb column. pgx
// hands back raw bytes for jsonb into a []byte scan target — it does not
// auto-decode into []string the way it does for native array types.
func unmarshalIngredients(raw []byte) []string {
	if len(raw) == 0 {
		return []string{}
	}
	var out []string
	if err := json.Unmarshal(raw, &out); err != nil {
		return []string{}
	}
	return out
}

type Recipe struct {
	ID            string   `json:"id"`
	CreatorID     string   `json:"creator_id"`
	Name          string   `json:"name"`
	TotalCalories int      `json:"total_calories"`
	Protein       float64  `json:"protein"`
	Carbs         float64  `json:"carbs"`
	Fat           float64  `json:"fat"`
	Fiber         float64  `json:"fiber"`
	Servings      float64  `json:"servings"`
	Ingredients   []string `json:"ingredients"`
	Tags          []string `json:"tags"`
	IsFavorite    bool     `json:"is_favorite"`
	ShareToken    *string  `json:"share_token,omitempty"`
	Mine          bool     `json:"mine"`
	CreatedAt     string   `json:"created_at"`
}

type createRecipeRequest struct {
	Name          string   `json:"name"`
	Servings      float64  `json:"servings"`
	TotalCalories int      `json:"total_calories"`
	Protein       float64  `json:"protein"`
	Carbs         float64  `json:"carbs"`
	Fat           float64  `json:"fat"`
	Fiber         float64  `json:"fiber"`
	Ingredients   []string `json:"ingredients"`
	Tags          []string `json:"tags"`
}

// validateRecipeRequest applies the same bounds to both create and update —
// a recipe's shape rules don't change once it exists.
func validateRecipeRequest(c *gin.Context, req *createRecipeRequest) bool {
	if req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return false
	}
	if req.Servings <= 0 || req.Servings > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "servings must be between 0 and 100"})
		return false
	}
	if req.TotalCalories < 0 || req.TotalCalories > 20000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "total_calories must be between 0 and 20000"})
		return false
	}
	if req.Protein < 0 || req.Carbs < 0 || req.Fat < 0 || req.Fiber < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "macros cannot be negative"})
		return false
	}
	if req.Ingredients == nil {
		req.Ingredients = []string{}
	}
	if req.Tags == nil {
		req.Tags = []string{}
	}
	return true
}

// CreateRecipe stores a recipe with batch totals + a serving count — a
// serving's macros are always total/servings, computed on read rather than
// duplicated at write time.
func CreateRecipe(c *gin.Context) {
	userID := c.GetString("user_id")

	var req createRecipeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	if !validateRecipeRequest(c, &req) {
		return
	}
	ingredientsJSON, err := json.Marshal(req.Ingredients)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ingredients"})
		return
	}

	var r Recipe
	var rawIngredients []byte
	err = db.Pool.QueryRow(c.Request.Context(),
		`INSERT INTO public.recipes
		   (creator_id, name, total_calories, protein, carbs, fat, fiber, servings, ingredients, tags)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		 RETURNING id, creator_id, name, total_calories, protein, carbs, fat, fiber, servings, ingredients, tags, share_token, created_at`,
		userID, req.Name, req.TotalCalories, req.Protein, req.Carbs, req.Fat, req.Fiber, req.Servings, string(ingredientsJSON), req.Tags,
	).Scan(&r.ID, &r.CreatorID, &r.Name, &r.TotalCalories, &r.Protein, &r.Carbs, &r.Fat, &r.Fiber,
		&r.Servings, &rawIngredients, &r.Tags, &r.ShareToken, &r.CreatedAt)

	if err != nil {
		log.Printf("CreateRecipe insert error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create recipe"})
		return
	}

	r.Ingredients = unmarshalIngredients(rawIngredients)
	r.Mine = true
	c.JSON(http.StatusCreated, r)
}

// UpdateRecipe edits a recipe the caller created in place — the share_token
// and any existing shares/food_log history are untouched, so a partner who
// already accepted it just sees the updated numbers next time they log it.
func UpdateRecipe(c *gin.Context) {
	userID := c.GetString("user_id")
	id := c.Param("id")

	var req createRecipeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	if !validateRecipeRequest(c, &req) {
		return
	}
	ingredientsJSON, err := json.Marshal(req.Ingredients)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ingredients"})
		return
	}

	var r Recipe
	var rawIngredients []byte
	err = db.Pool.QueryRow(c.Request.Context(),
		`UPDATE public.recipes
		 SET name = $1, total_calories = $2, protein = $3, carbs = $4, fat = $5, fiber = $6,
		     servings = $7, ingredients = $8, tags = $9
		 WHERE id = $10 AND creator_id = $11
		 RETURNING id, creator_id, name, total_calories, protein, carbs, fat, fiber, servings, ingredients, tags, share_token, created_at`,
		req.Name, req.TotalCalories, req.Protein, req.Carbs, req.Fat, req.Fiber, req.Servings, string(ingredientsJSON), req.Tags,
		id, userID,
	).Scan(&r.ID, &r.CreatorID, &r.Name, &r.TotalCalories, &r.Protein, &r.Carbs, &r.Fat, &r.Fiber,
		&r.Servings, &rawIngredients, &r.Tags, &r.ShareToken, &r.CreatedAt)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "recipe not found"})
		return
	}

	r.Ingredients = unmarshalIngredients(rawIngredients)
	r.Mine = true
	c.JSON(http.StatusOK, r)
}

// GetRecipes returns recipes the caller created, plus recipes shared to them
// that they've accepted — one combined "my recipes" list for one-tap logging.
// Optional ?q=, ?tag=, ?favorite=true narrow the list for the library view.
func GetRecipes(c *gin.Context) {
	userID := c.GetString("user_id")
	q := c.Query("q")
	tag := c.Query("tag")
	favoriteOnly := c.Query("favorite") == "true"

	query := `SELECT r.id, r.creator_id, r.name, r.total_calories, r.protein, r.carbs, r.fat, r.fiber,
	        r.servings, r.ingredients, r.tags, r.share_token, r.created_at, (r.creator_id = $1) AS mine,
	        EXISTS (SELECT 1 FROM public.recipe_favorites f WHERE f.user_id = $1 AND f.recipe_id = r.id) AS is_favorite
	 FROM public.recipes r
	 WHERE (r.creator_id = $1
	    OR r.id IN (
	         SELECT recipe_id FROM public.recipe_shares
	         WHERE shared_to = $1 AND status = 'accepted'
	       ))`
	args := []any{userID}

	if q != "" {
		args = append(args, "%"+q+"%")
		query += fmt.Sprintf(" AND r.name ILIKE $%d", len(args))
	}
	if tag != "" {
		args = append(args, tag)
		query += fmt.Sprintf(" AND $%d = ANY(r.tags)", len(args))
	}
	if favoriteOnly {
		query += " AND EXISTS (SELECT 1 FROM public.recipe_favorites f2 WHERE f2.user_id = $1 AND f2.recipe_id = r.id)"
	}
	query += " ORDER BY r.created_at DESC"

	rows, err := db.Pool.Query(c.Request.Context(), query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load recipes"})
		return
	}
	defer rows.Close()

	recipes := []Recipe{}
	for rows.Next() {
		var r Recipe
		var rawIngredients []byte
		if err := rows.Scan(&r.ID, &r.CreatorID, &r.Name, &r.TotalCalories, &r.Protein, &r.Carbs,
			&r.Fat, &r.Fiber, &r.Servings, &rawIngredients, &r.Tags, &r.ShareToken, &r.CreatedAt, &r.Mine, &r.IsFavorite); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read recipes"})
			return
		}
		r.Ingredients = unmarshalIngredients(rawIngredients)
		if !r.Mine {
			r.ShareToken = nil // only the creator can re-share
		}
		recipes = append(recipes, r)
	}

	c.JSON(http.StatusOK, gin.H{"recipes": recipes})
}

// recipeVisibleTo checks the same visibility rule LogRecipeMeal uses: the
// caller must have created the recipe or have an accepted share of it.
func recipeVisibleTo(ctx context.Context, recipeID, userID string) (bool, error) {
	var exists bool
	err := db.Pool.QueryRow(ctx,
		`SELECT EXISTS (
		   SELECT 1 FROM public.recipes r
		   WHERE r.id = $1 AND (
		     r.creator_id = $2
		     OR r.id IN (SELECT recipe_id FROM public.recipe_shares WHERE shared_to = $2 AND status = 'accepted')
		   )
		 )`,
		recipeID, userID,
	).Scan(&exists)
	return exists, err
}

// FavoriteRecipe marks a recipe (the caller's own or one shared to them) as a
// favorite for the caller specifically — favorites are per-user, not a
// property of the recipe itself.
func FavoriteRecipe(c *gin.Context) {
	userID := c.GetString("user_id")
	recipeID := c.Param("id")

	visible, err := recipeVisibleTo(c.Request.Context(), recipeID, userID)
	if err != nil || !visible {
		c.JSON(http.StatusNotFound, gin.H{"error": "recipe not found"})
		return
	}

	if _, err := db.Pool.Exec(c.Request.Context(),
		`INSERT INTO public.recipe_favorites (user_id, recipe_id) VALUES ($1, $2)
		 ON CONFLICT (user_id, recipe_id) DO NOTHING`,
		userID, recipeID,
	); err != nil {
		log.Printf("FavoriteRecipe error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to favorite recipe"})
		return
	}

	c.Status(http.StatusNoContent)
}

// UnfavoriteRecipe removes the caller's favorite on a recipe.
func UnfavoriteRecipe(c *gin.Context) {
	userID := c.GetString("user_id")
	recipeID := c.Param("id")

	if _, err := db.Pool.Exec(c.Request.Context(),
		`DELETE FROM public.recipe_favorites WHERE user_id = $1 AND recipe_id = $2`,
		userID, recipeID,
	); err != nil {
		log.Printf("UnfavoriteRecipe error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to unfavorite recipe"})
		return
	}

	c.Status(http.StatusNoContent)
}

// GetSharedRecipe looks up a recipe by its public share token — any
// authenticated Perigee user holding the link can view it, same as a
// Notion-style share link.
func GetSharedRecipe(c *gin.Context) {
	token := c.Param("token")

	var r Recipe
	var rawIngredients []byte
	err := db.Pool.QueryRow(c.Request.Context(),
		`SELECT id, creator_id, name, total_calories, protein, carbs, fat, fiber, servings, ingredients, created_at
		 FROM public.recipes WHERE share_token = $1`,
		token,
	).Scan(&r.ID, &r.CreatorID, &r.Name, &r.TotalCalories, &r.Protein, &r.Carbs, &r.Fat, &r.Fiber,
		&r.Servings, &rawIngredients, &r.CreatedAt)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "recipe not found"})
		return
	}

	r.Ingredients = unmarshalIngredients(rawIngredients)
	c.JSON(http.StatusOK, r)
}

// DeleteRecipe removes a recipe the caller created. recipe_shares rows cascade
// via FK; food_logs rows keep their history with recipe_id set to null.
func DeleteRecipe(c *gin.Context) {
	userID := c.GetString("user_id")
	id := c.Param("id")

	tag, err := db.Pool.Exec(c.Request.Context(),
		`DELETE FROM public.recipes WHERE id = $1 AND creator_id = $2`,
		id, userID,
	)
	if err != nil {
		log.Printf("DeleteRecipe error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete recipe"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "recipe not found"})
		return
	}

	c.Status(http.StatusNoContent)
}

// AcceptSharedRecipe is the "one-tap accept" — it adds the recipe to the
// caller's own recipe list without duplicating the row, via recipe_shares.
func AcceptSharedRecipe(c *gin.Context) {
	userID := c.GetString("user_id")
	token := c.Param("token")

	var recipeID string
	if err := db.Pool.QueryRow(c.Request.Context(),
		`SELECT id FROM public.recipes WHERE share_token = $1`, token,
	).Scan(&recipeID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "recipe not found"})
		return
	}

	if _, err := db.Pool.Exec(c.Request.Context(),
		`INSERT INTO public.recipe_shares (recipe_id, shared_to, status)
		 VALUES ($1, $2, 'accepted')
		 ON CONFLICT (recipe_id, shared_to) DO UPDATE SET status = 'accepted'`,
		recipeID, userID,
	); err != nil {
		log.Printf("AcceptSharedRecipe error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to accept recipe"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"recipe_id": recipeID})
}

type logRecipeRequest struct {
	Date     string `json:"date"`
	MealType string `json:"meal_type"`
}

// LogRecipeMeal logs one serving of a recipe the caller can see (created by
// them, or an accepted share) as a food_logs row.
func LogRecipeMeal(c *gin.Context) {
	userID := c.GetString("user_id")
	recipeID := c.Param("id")

	var req logRecipeRequest
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
	if !validMealTypes[req.MealType] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid meal_type"})
		return
	}

	var name string
	var totalCalories int
	var protein, carbs, fat, fiber, servings float64
	err = db.Pool.QueryRow(c.Request.Context(),
		`SELECT r.name, r.total_calories, r.protein, r.carbs, r.fat, r.fiber, r.servings
		 FROM public.recipes r
		 WHERE r.id = $1 AND (
		   r.creator_id = $2
		   OR r.id IN (SELECT recipe_id FROM public.recipe_shares WHERE shared_to = $2 AND status = 'accepted')
		 )`,
		recipeID, userID,
	).Scan(&name, &totalCalories, &protein, &carbs, &fat, &fiber, &servings)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "recipe not found"})
		return
	}

	row := db.Pool.QueryRow(c.Request.Context(),
		`INSERT INTO public.food_logs
		   (user_id, date, meal_type, source, recipe_id, name, calories, protein, carbs, fat, fiber)
		 VALUES ($1, $2, $3, 'recipe', $4, $5, $6, $7, $8, $9, $10)
		 RETURNING `+mealColumns,
		userID, req.Date, req.MealType, recipeID, name,
		int(float64(totalCalories)/servings), protein/servings, carbs/servings, fat/servings, fiber/servings,
	)
	m, err := scanMeal(row)
	if err != nil {
		log.Printf("LogRecipeMeal insert error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to log meal"})
		return
	}

	c.JSON(http.StatusCreated, m)
}
