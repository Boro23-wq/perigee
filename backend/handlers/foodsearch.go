package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Boro23-wq/perigee/backend/db"
)

const (
	fatSecretTokenURL = "https://oauth.fatsecret.com/connect/token"
	fatSecretAPIURL   = "https://platform.fatsecret.com/rest/server.api"
)

// foodIDPattern guards against passing arbitrary input into the FatSecret
// URL — food_id is always a numeric string.
var foodIDPattern = regexp.MustCompile(`^\d+$`)

var fsToken struct {
	mu          sync.Mutex
	accessToken string
	expiresAt   time.Time
}

type fatSecretTokenResponse struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
}

// getFatSecretToken returns a cached OAuth2 client-credentials token,
// refreshing only once it's close to expiry. FatSecret tokens are valid
// ~24h, so under normal traffic this costs one token request/day rather
// than one per search — the free tier's 5,000 req/day budget is for the
// search/detail calls, not token exchanges.
func getFatSecretToken(ctx context.Context) (string, error) {
	fsToken.mu.Lock()
	defer fsToken.mu.Unlock()

	if fsToken.accessToken != "" && time.Now().Before(fsToken.expiresAt) {
		return fsToken.accessToken, nil
	}

	clientID := strings.TrimSpace(os.Getenv("FATSECRET_CLIENT_ID"))
	clientSecret := strings.TrimSpace(os.Getenv("FATSECRET_CLIENT_SECRET"))
	if clientID == "" || clientSecret == "" {
		return "", fmt.Errorf("FatSecret credentials not configured")
	}

	form := url.Values{}
	form.Set("grant_type", "client_credentials")
	form.Set("scope", "basic")

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fatSecretTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.SetBasicAuth(clientID, clientSecret)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("fatsecret token request failed (%d): %s", resp.StatusCode, string(body))
	}

	var parsed fatSecretTokenResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", err
	}
	if parsed.AccessToken == "" {
		return "", fmt.Errorf("fatsecret token response missing access_token")
	}

	fsToken.accessToken = parsed.AccessToken
	// Refresh a minute early so a request never races an about-to-expire token.
	fsToken.expiresAt = time.Now().Add(time.Duration(parsed.ExpiresIn-60) * time.Second)

	return fsToken.accessToken, nil
}

type fatSecretErrorResponse struct {
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// unmarshalOneOrMany handles FatSecret's JSON quirk where a field that's
// normally an array collapses to a single object when there's exactly one
// result (and is absent entirely when there are none).
func unmarshalOneOrMany[T any](raw json.RawMessage) ([]T, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	var many []T
	if err := json.Unmarshal(raw, &many); err == nil {
		return many, nil
	}
	var one T
	if err := json.Unmarshal(raw, &one); err != nil {
		return nil, err
	}
	return []T{one}, nil
}

type fsFoodSearchItem struct {
	FoodID          string  `json:"food_id"`
	FoodName        string  `json:"food_name"`
	BrandName       *string `json:"brand_name,omitempty"`
	FoodDescription string  `json:"food_description"`
}

type foodSearchResult struct {
	FoodID      string  `json:"food_id"`
	Name        string  `json:"name"`
	Brand       *string `json:"brand,omitempty"`
	Description string  `json:"description"`
}

// SearchFoods proxies a text search to FatSecret's foods.search — results
// are a name + human-readable summary, not structured macros (same
// two-step shape as barcode: search here, then GetFoodDetail once the user
// picks a result).
func SearchFoods(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	if q == "" || len(q) > 200 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "q must be 1-200 characters"})
		return
	}

	token, err := getFatSecretToken(c.Request.Context())
	if err != nil {
		log.Printf("SearchFoods token error: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "food search is currently unavailable"})
		return
	}

	query := url.Values{}
	query.Set("method", "foods.search")
	query.Set("search_expression", q)
	query.Set("max_results", "20")
	query.Set("format", "json")

	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, fatSecretAPIURL+"?"+query.Encode(), nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build search request"})
		return
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := httpClient.Do(req)
	if err != nil {
		log.Printf("SearchFoods fetch error: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to reach food search"})
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to read food search response"})
		return
	}

	var errResp fatSecretErrorResponse
	if err := json.Unmarshal(body, &errResp); err == nil && errResp.Error != nil {
		log.Printf("SearchFoods api error: %s", errResp.Error.Message)
		c.JSON(http.StatusBadGateway, gin.H{"error": "food search failed"})
		return
	}

	var parsed struct {
		Foods struct {
			Food json.RawMessage `json:"food"`
		} `json:"foods"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		log.Printf("SearchFoods parse error: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to parse food search response"})
		return
	}

	items, err := unmarshalOneOrMany[fsFoodSearchItem](parsed.Foods.Food)
	if err != nil {
		log.Printf("SearchFoods items parse error: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to parse food search response"})
		return
	}

	results := make([]foodSearchResult, 0, len(items))
	for _, item := range items {
		results = append(results, foodSearchResult{
			FoodID:      item.FoodID,
			Name:        item.FoodName,
			Brand:       item.BrandName,
			Description: item.FoodDescription,
		})
	}

	c.JSON(http.StatusOK, gin.H{"results": results})
}

type fsServing struct {
	ServingID           string `json:"serving_id"`
	ServingDescription  string `json:"serving_description"`
	MetricServingAmount string `json:"metric_serving_amount"`
	MetricServingUnit   string `json:"metric_serving_unit"`
	Calories            string `json:"calories"`
	Protein             string `json:"protein"`
	Carbohydrate        string `json:"carbohydrate"`
	Fat                 string `json:"fat"`
	Fiber               string `json:"fiber"`
}

type foodServing struct {
	ID          string   `json:"id"`
	Description string   `json:"description"`
	Calories    float64  `json:"calories"`
	Protein     float64  `json:"protein"`
	Carbs       float64  `json:"carbs"`
	Fat         float64  `json:"fat"`
	Fiber       float64  `json:"fiber"`
	MetricGrams *float64 `json:"metric_grams,omitempty"`
}

type foodDetail struct {
	FoodID   string        `json:"food_id"`
	Name     string        `json:"name"`
	Brand    *string       `json:"brand,omitempty"`
	Servings []foodServing `json:"servings"`
}

func parseFloatLoose(s string) float64 {
	v, _ := strconv.ParseFloat(s, 64)
	return v
}

// GetFoodDetail fetches the full serving list for a food the user picked
// from search results — FatSecret reports multiple named servings (e.g.
// "1 cup, sliced", "1 medium") each with their own macros already scaled,
// unlike barcode's single per-100g figure.
func GetFoodDetail(c *gin.Context) {
	foodID := c.Param("id")
	if !foodIDPattern.MatchString(foodID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid food id"})
		return
	}

	token, err := getFatSecretToken(c.Request.Context())
	if err != nil {
		log.Printf("GetFoodDetail token error: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "food search is currently unavailable"})
		return
	}

	query := url.Values{}
	query.Set("method", "food.get.v4")
	query.Set("food_id", foodID)
	query.Set("format", "json")

	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, fatSecretAPIURL+"?"+query.Encode(), nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build food detail request"})
		return
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := httpClient.Do(req)
	if err != nil {
		log.Printf("GetFoodDetail fetch error: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to reach food search"})
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to read food detail response"})
		return
	}

	var errResp fatSecretErrorResponse
	if err := json.Unmarshal(body, &errResp); err == nil && errResp.Error != nil {
		log.Printf("GetFoodDetail api error: %s", errResp.Error.Message)
		c.JSON(http.StatusNotFound, gin.H{"error": "food not found"})
		return
	}

	var parsed struct {
		Food struct {
			FoodID    string  `json:"food_id"`
			FoodName  string  `json:"food_name"`
			BrandName *string `json:"brand_name,omitempty"`
			Servings  struct {
				Serving json.RawMessage `json:"serving"`
			} `json:"servings"`
		} `json:"food"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		log.Printf("GetFoodDetail parse error: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to parse food detail response"})
		return
	}

	fsServings, err := unmarshalOneOrMany[fsServing](parsed.Food.Servings.Serving)
	if err != nil {
		log.Printf("GetFoodDetail servings parse error: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to parse food detail response"})
		return
	}

	detail := foodDetail{
		FoodID:   parsed.Food.FoodID,
		Name:     parsed.Food.FoodName,
		Brand:    parsed.Food.BrandName,
		Servings: make([]foodServing, 0, len(fsServings)),
	}
	for _, s := range fsServings {
		serving := foodServing{
			ID:          s.ServingID,
			Description: s.ServingDescription,
			Calories:    parseFloatLoose(s.Calories),
			Protein:     parseFloatLoose(s.Protein),
			Carbs:       parseFloatLoose(s.Carbohydrate),
			Fat:         parseFloatLoose(s.Fat),
			Fiber:       parseFloatLoose(s.Fiber),
		}
		if s.MetricServingUnit == "g" {
			if grams := parseFloatLoose(s.MetricServingAmount); grams > 0 {
				serving.MetricGrams = &grams
			}
		}
		detail.Servings = append(detail.Servings, serving)
	}

	c.JSON(http.StatusOK, detail)
}

type logSearchMealRequest struct {
	Date         string   `json:"date"`
	MealType     string   `json:"meal_type"`
	Name         string   `json:"name"`
	Calories     int      `json:"calories"`
	Protein      float64  `json:"protein"`
	Carbs        float64  `json:"carbs"`
	Fat          float64  `json:"fat"`
	Fiber        float64  `json:"fiber"`
	ServingGrams *float64 `json:"serving_grams"`
}

// LogSearchMeal logs a food_logs row for a food picked via search — the
// frontend has already scaled the chosen serving's macros by quantity, so
// this validates and stores the result the same way LogBarcodeMeal does,
// with source='search'.
func LogSearchMeal(c *gin.Context) {
	userID := c.GetString("user_id")

	var req logSearchMealRequest
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
	if req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}
	if req.Calories < 0 || req.Calories > 10000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "calories must be between 0 and 10000"})
		return
	}
	if req.Protein < 0 || req.Carbs < 0 || req.Fat < 0 || req.Fiber < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "macros cannot be negative"})
		return
	}
	if req.ServingGrams != nil && (*req.ServingGrams <= 0 || *req.ServingGrams > 5000) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "serving_grams must be between 0 and 5000"})
		return
	}

	row := db.Pool.QueryRow(c.Request.Context(),
		`INSERT INTO public.food_logs
		   (user_id, date, meal_type, source, name, calories, protein, carbs, fat, fiber, serving_grams)
		 VALUES ($1, $2, $3, 'search', $4, $5, $6, $7, $8, $9, $10)
		 RETURNING `+mealColumns,
		userID, req.Date, req.MealType, req.Name, req.Calories, req.Protein, req.Carbs, req.Fat, req.Fiber, req.ServingGrams,
	)
	m, err := scanMeal(row)
	if err != nil {
		log.Printf("LogSearchMeal insert error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to log meal"})
		return
	}

	c.JSON(http.StatusCreated, m)
}
