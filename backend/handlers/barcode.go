package handlers

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"regexp"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Boro23-wq/perigee/backend/db"
)

var httpClient = &http.Client{Timeout: 10 * time.Second}

// upcPattern guards against passing arbitrary input into the Open Food
// Facts URL — barcodes are numeric, 8-14 digits (UPC-A/E, EAN-8/13).
var upcPattern = regexp.MustCompile(`^\d{8,14}$`)

type barcodeProduct struct {
	Name           string   `json:"name"`
	CaloriesPer100 float64  `json:"calories_per_100g"`
	ProteinPer100  float64  `json:"protein_per_100g"`
	CarbsPer100    float64  `json:"carbs_per_100g"`
	FatPer100      float64  `json:"fat_per_100g"`
	ServingGrams   *float64 `json:"serving_grams"`
	ServingLabel   *string  `json:"serving_label"`
}

type openFoodFactsResponse struct {
	Status  int `json:"status"`
	Product struct {
		ProductName     string  `json:"product_name"`
		ServingQuantity float64 `json:"serving_quantity"`
		ServingSize     string  `json:"serving_size"`
		Nutriments      struct {
			EnergyKcal100g float64 `json:"energy-kcal_100g"`
			Proteins100g   float64 `json:"proteins_100g"`
			Carbs100g      float64 `json:"carbohydrates_100g"`
			Fat100g        float64 `json:"fat_100g"`
		} `json:"nutriments"`
	} `json:"product"`
}

// GetBarcodeProduct looks up a UPC/EAN against Open Food Facts (free, no API
// key) and returns per-100g macros plus the manufacturer's serving size, if
// known — the frontend uses this to build a serving-size selector rather
// than logging a raw 100g figure nobody actually ate.
func GetBarcodeProduct(c *gin.Context) {
	upc := c.Param("upc")
	if !upcPattern.MatchString(upc) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid barcode"})
		return
	}

	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet,
		"https://world.openfoodfacts.org/api/v2/product/"+upc+".json", nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build lookup request"})
		return
	}
	req.Header.Set("User-Agent", "Perigee/1.0 (calorie tracker)")

	resp, err := httpClient.Do(req)
	if err != nil {
		log.Printf("GetBarcodeProduct fetch error: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to reach barcode database"})
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to read barcode database response"})
		return
	}

	var off openFoodFactsResponse
	if err := json.Unmarshal(body, &off); err != nil {
		log.Printf("GetBarcodeProduct parse error: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to parse barcode database response"})
		return
	}

	if off.Status != 1 || off.Product.ProductName == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "no product found for this barcode"})
		return
	}

	product := barcodeProduct{
		Name:           off.Product.ProductName,
		CaloriesPer100: off.Product.Nutriments.EnergyKcal100g,
		ProteinPer100:  off.Product.Nutriments.Proteins100g,
		CarbsPer100:    off.Product.Nutriments.Carbs100g,
		FatPer100:      off.Product.Nutriments.Fat100g,
	}
	if off.Product.ServingQuantity > 0 {
		product.ServingGrams = &off.Product.ServingQuantity
	}
	if off.Product.ServingSize != "" {
		product.ServingLabel = &off.Product.ServingSize
	}

	c.JSON(http.StatusOK, product)
}

type logBarcodeMealRequest struct {
	Date         string  `json:"date"`
	MealType     string  `json:"meal_type"`
	Name         string  `json:"name"`
	Calories     int     `json:"calories"`
	Protein      float64 `json:"protein"`
	Carbs        float64 `json:"carbs"`
	Fat          float64 `json:"fat"`
	ServingGrams float64 `json:"serving_grams"`
}

// LogBarcodeMeal logs a food_logs row for a scanned product — the frontend
// has already scaled per-100g macros to whatever serving size the user
// picked, so this just validates and stores the result the same way
// LogMeal does, with source='barcode' and the serving size recorded.
func LogBarcodeMeal(c *gin.Context) {
	userID := c.GetString("user_id")

	var req logBarcodeMealRequest
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
	if req.Protein < 0 || req.Carbs < 0 || req.Fat < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "macros cannot be negative"})
		return
	}
	if req.ServingGrams <= 0 || req.ServingGrams > 5000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "serving_grams must be between 0 and 5000"})
		return
	}

	row := db.Pool.QueryRow(c.Request.Context(),
		`INSERT INTO public.food_logs
		   (user_id, date, meal_type, source, name, calories, protein, carbs, fat, serving_grams)
		 VALUES ($1, $2, $3, 'barcode', $4, $5, $6, $7, $8, $9)
		 RETURNING `+mealColumns,
		userID, req.Date, req.MealType, req.Name, req.Calories, req.Protein, req.Carbs, req.Fat, req.ServingGrams,
	)
	m, err := scanMeal(row)
	if err != nil {
		log.Printf("LogBarcodeMeal insert error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to log meal"})
		return
	}

	c.JSON(http.StatusCreated, m)
}
