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
	"strings"
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
	FiberPer100    float64  `json:"fiber_per_100g"`
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
			Fiber100g      float64 `json:"fiber_100g"`
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
		// Open Food Facts is community-sourced and misses plenty of US
		// retail products. USDA FoodData Central's Branded Foods dataset
		// (free, no per-user gating unlike commercial APIs) fills some of
		// those gaps, so it's tried as a second lookup on a miss here.
		usdaProduct, err := lookupUSDA(c.Request.Context(), upc)
		if err != nil {
			log.Printf("lookupUSDA error: %v", err)
		}
		if usdaProduct != nil {
			c.JSON(http.StatusOK, usdaProduct)
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "no product found for this barcode"})
		return
	}

	product := barcodeProduct{
		Name:           off.Product.ProductName,
		CaloriesPer100: off.Product.Nutriments.EnergyKcal100g,
		ProteinPer100:  off.Product.Nutriments.Proteins100g,
		CarbsPer100:    off.Product.Nutriments.Carbs100g,
		FatPer100:      off.Product.Nutriments.Fat100g,
		FiberPer100:    off.Product.Nutriments.Fiber100g,
	}
	if off.Product.ServingQuantity > 0 {
		product.ServingGrams = &off.Product.ServingQuantity
	}
	if off.Product.ServingSize != "" {
		product.ServingLabel = &off.Product.ServingSize
	}

	c.JSON(http.StatusOK, product)
}

type usdaSearchResponse struct {
	Foods []struct {
		Description     string  `json:"description"`
		GtinUpc         string  `json:"gtinUpc"`
		ServingSize     float64 `json:"servingSize"`
		ServingSizeUnit string  `json:"servingSizeUnit"`
		FoodNutrients   []struct {
			NutrientName string  `json:"nutrientName"`
			Value        float64 `json:"value"`
		} `json:"foodNutrients"`
	} `json:"foods"`
}

// normalizeUPC strips leading zeros so a 12-digit UPC-A and its 13-digit
// EAN form (zero-padded) compare equal — USDA and the scanner don't always
// agree on which form they store/send.
func normalizeUPC(upc string) string {
	return strings.TrimLeft(upc, "0")
}

// lookupUSDA is a second, free fallback for barcodes Open Food Facts
// doesn't have. FoodData Central's Branded Foods dataset reports nutrients
// per 100g, same convention as Open Food Facts, so no per-serving scaling
// is needed here (unlike a commercial API reporting per-serving values).
func lookupUSDA(ctx context.Context, upc string) (*barcodeProduct, error) {
	apiKey := os.Getenv("USDA_FDC_API_KEY")
	if apiKey == "" {
		return nil, nil
	}

	query := url.Values{}
	query.Set("query", upc)
	query.Set("dataType", "Branded")
	query.Set("pageSize", "5")
	query.Set("api_key", apiKey)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		"https://api.nal.usda.gov/fdc/v1/foods/search?"+query.Encode(), nil)
	if err != nil {
		return nil, err
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		log.Printf("USDA FDC api error (%d): %s", resp.StatusCode, string(body))
		return nil, nil
	}

	var parsed usdaSearchResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}

	target := normalizeUPC(upc)
	for _, food := range parsed.Foods {
		if normalizeUPC(food.GtinUpc) != target {
			continue
		}

		product := &barcodeProduct{Name: food.Description}
		for _, n := range food.FoodNutrients {
			switch n.NutrientName {
			case "Energy":
				product.CaloriesPer100 = n.Value
			case "Protein":
				product.ProteinPer100 = n.Value
			case "Carbohydrate, by difference":
				product.CarbsPer100 = n.Value
			case "Total lipid (fat)":
				product.FatPer100 = n.Value
			case "Fiber, total dietary":
				product.FiberPer100 = n.Value
			}
		}
		if food.ServingSize > 0 {
			grams := food.ServingSize
			product.ServingGrams = &grams
		}
		if food.ServingSize > 0 && food.ServingSizeUnit != "" {
			label := fmt.Sprintf("%g%s", food.ServingSize, food.ServingSizeUnit)
			product.ServingLabel = &label
		}
		return product, nil
	}

	return nil, nil
}

type logBarcodeMealRequest struct {
	Date         string  `json:"date"`
	MealType     string  `json:"meal_type"`
	Name         string  `json:"name"`
	Calories     int     `json:"calories"`
	Protein      float64 `json:"protein"`
	Carbs        float64 `json:"carbs"`
	Fat          float64 `json:"fat"`
	Fiber        float64 `json:"fiber"`
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
	if req.Protein < 0 || req.Carbs < 0 || req.Fat < 0 || req.Fiber < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "macros cannot be negative"})
		return
	}
	if req.ServingGrams <= 0 || req.ServingGrams > 5000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "serving_grams must be between 0 and 5000"})
		return
	}

	row := db.Pool.QueryRow(c.Request.Context(),
		`INSERT INTO public.food_logs
		   (user_id, date, meal_type, source, name, calories, protein, carbs, fat, fiber, serving_grams)
		 VALUES ($1, $2, $3, 'barcode', $4, $5, $6, $7, $8, $9, $10)
		 RETURNING `+mealColumns,
		userID, req.Date, req.MealType, req.Name, req.Calories, req.Protein, req.Carbs, req.Fat, req.Fiber, req.ServingGrams,
	)
	m, err := scanMeal(row)
	if err != nil {
		log.Printf("LogBarcodeMeal insert error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to log meal"})
		return
	}

	c.JSON(http.StatusCreated, m)
}
