package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Boro23-wq/perigee/backend/db"
	"github.com/Boro23-wq/perigee/backend/storage"
	"github.com/Boro23-wq/perigee/backend/vision"
)

// maxPhotoBytes bounds what we'll download from Storage and forward to
// Claude Vision — the frontend compresses to ~500KB before upload, so
// anything past a few MB means something is wrong or abusive.
const maxPhotoBytes = 8 * 1024 * 1024

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func extForContentType(ct string) string {
	switch ct {
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	default:
		return ".jpg"
	}
}

type uploadURLRequest struct {
	ContentType string `json:"content_type"`
}

// RequestPhotoUploadURL mints a storage path scoped to this user and a
// short-lived signed upload URL for it. The client PUTs the compressed
// image straight to Supabase Storage — the bytes never touch this server.
func RequestPhotoUploadURL(c *gin.Context) {
	userID := c.GetString("user_id")

	var req uploadURLRequest
	_ = c.ShouldBindJSON(&req) // body is optional; default to jpeg below
	contentType := req.ContentType
	if contentType == "" {
		contentType = "image/jpeg"
	}

	path := fmt.Sprintf("%s/%s/%s%s", userID, time.Now().UTC().Format("2006-01"), randomHex(16), extForContentType(contentType))

	uploadURL, err := storage.CreateSignedUploadURL(path)
	if err != nil {
		log.Printf("CreateSignedUploadURL error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create upload url"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"path": path, "upload_url": uploadURL, "content_type": contentType})
}

type analyzePhotoRequest struct {
	Path     string `json:"path"`
	Date     string `json:"date"`
	MealType string `json:"meal_type"`
}

// AnalyzePhoto downloads the just-uploaded photo, sends it to Claude Vision
// for a calorie/macro estimate, and logs the result as a food_logs row with
// source='photo' — this is the manual-entry-free logging path (spec Fix #16).
func AnalyzePhoto(c *gin.Context) {
	userID := c.GetString("user_id")

	var req analyzePhotoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	// The path is namespaced by user_id — refuse anything that doesn't match
	// the caller, since nothing else here checks storage ownership.
	if !strings.HasPrefix(req.Path, userID+"/") {
		c.JSON(http.StatusForbidden, gin.H{"error": "photo path does not belong to this user"})
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

	readURL, err := storage.CreateSignedReadURL(req.Path, 300)
	if err != nil {
		log.Printf("CreateSignedReadURL error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read uploaded photo"})
		return
	}

	imageBytes, contentType, err := storage.DownloadBytes(readURL, maxPhotoBytes)
	if err != nil {
		log.Printf("DownloadBytes error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read uploaded photo"})
		return
	}

	estimate, err := vision.EstimateFromImage(imageBytes, contentType)
	if err != nil {
		log.Printf("EstimateFromImage error: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to analyze photo, try again"})
		return
	}

	calories := estimate.Calories
	if calories < 0 {
		calories = 0
	}
	if calories > 10000 {
		calories = 10000
	}
	protein := estimate.Protein
	carbs := estimate.Carbs
	fat := estimate.Fat
	fiber := estimate.Fiber
	if protein < 0 {
		protein = 0
	}
	if carbs < 0 {
		carbs = 0
	}
	if fat < 0 {
		fat = 0
	}
	if fiber < 0 {
		fiber = 0
	}

	row := db.Pool.QueryRow(c.Request.Context(),
		`INSERT INTO public.food_logs
		   (user_id, date, meal_type, source, name, calories, protein, carbs, fat, fiber,
		    photo_path, detected_food, ai_confidence, user_adjusted)
		 VALUES ($1, $2, $3, 'photo', $4, $5, $6, $7, $8, $9, $10, $11, $12, false)
		 RETURNING `+mealColumns,
		userID, req.Date, req.MealType, estimate.Name, calories, protein, carbs, fat, fiber,
		req.Path, estimate.Name, estimate.Confidence,
	)
	m, err := scanMeal(row)
	if err != nil {
		log.Printf("AnalyzePhoto insert error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to log meal"})
		return
	}

	c.JSON(http.StatusCreated, m)
}

type adjustMealRequest struct {
	Calories int `json:"calories"`
}

// AdjustMeal rescales a photo-estimated meal's macros to a user-corrected
// calorie count, preserving the AI's macro ratios, and marks it user_adjusted
// so the estimate is never silently wrong forever.
func AdjustMeal(c *gin.Context) {
	userID := c.GetString("user_id")
	id := c.Param("id")

	var req adjustMealRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	if req.Calories < 0 || req.Calories > 10000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "calories must be between 0 and 10000"})
		return
	}

	var existingCalories int
	var protein, carbs, fat, fiber float64
	if err := db.Pool.QueryRow(c.Request.Context(),
		`SELECT calories, protein, carbs, fat, fiber FROM public.food_logs WHERE id = $1 AND user_id = $2`,
		id, userID,
	).Scan(&existingCalories, &protein, &carbs, &fat, &fiber); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "meal not found"})
		return
	}

	ratio := 1.0
	if existingCalories > 0 {
		ratio = float64(req.Calories) / float64(existingCalories)
	}

	row := db.Pool.QueryRow(c.Request.Context(),
		`UPDATE public.food_logs
		 SET calories = $1, protein = $2, carbs = $3, fat = $4, fiber = $5, user_adjusted = true
		 WHERE id = $6 AND user_id = $7
		 RETURNING `+mealColumns,
		req.Calories, protein*ratio, carbs*ratio, fat*ratio, fiber*ratio, id, userID,
	)
	m, err := scanMeal(row)
	if err != nil {
		log.Printf("AdjustMeal update error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to adjust meal"})
		return
	}

	c.JSON(http.StatusOK, m)
}

type refinePhotoMealRequest struct {
	Notes string `json:"notes"`
}

// RefinePhotoMeal re-runs vision on a photo-logged meal's original image,
// this time combined with the user's own stated portions/ingredients (e.g.
// "215g chicken, 100g cilantro rice") — for when they know precisely what
// they ate and the pure visual guess isn't accurate enough. This replaces
// the estimate with a new one grounded in both the photo and their text,
// not a manual override of individual macros.
func RefinePhotoMeal(c *gin.Context) {
	userID := c.GetString("user_id")
	id := c.Param("id")

	var req refinePhotoMealRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	notes := strings.TrimSpace(req.Notes)
	if notes == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "notes is required"})
		return
	}
	if len(notes) > 500 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "notes must be 500 characters or fewer"})
		return
	}

	var photoPath *string
	if err := db.Pool.QueryRow(c.Request.Context(),
		`SELECT photo_path FROM public.food_logs WHERE id = $1 AND user_id = $2`,
		id, userID,
	).Scan(&photoPath); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "meal not found"})
		return
	}
	if photoPath == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "meal has no photo to refine"})
		return
	}

	readURL, err := storage.CreateSignedReadURL(*photoPath, 300)
	if err != nil {
		log.Printf("RefinePhotoMeal CreateSignedReadURL error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read photo"})
		return
	}
	imageBytes, contentType, err := storage.DownloadBytes(readURL, maxPhotoBytes)
	if err != nil {
		log.Printf("RefinePhotoMeal DownloadBytes error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read photo"})
		return
	}

	estimate, err := vision.EstimateFromImageWithHint(imageBytes, contentType, notes)
	if err != nil {
		log.Printf("RefinePhotoMeal EstimateFromImageWithHint error: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to refine estimate, try again"})
		return
	}

	calories := estimate.Calories
	if calories < 0 {
		calories = 0
	}
	if calories > 10000 {
		calories = 10000
	}
	protein := estimate.Protein
	carbs := estimate.Carbs
	fat := estimate.Fat
	fiber := estimate.Fiber
	if protein < 0 {
		protein = 0
	}
	if carbs < 0 {
		carbs = 0
	}
	if fat < 0 {
		fat = 0
	}
	if fiber < 0 {
		fiber = 0
	}

	row := db.Pool.QueryRow(c.Request.Context(),
		`UPDATE public.food_logs
		 SET name = $1, calories = $2, protein = $3, carbs = $4, fat = $5, fiber = $6,
		     detected_food = $1, ai_confidence = $7, user_adjusted = true, notes = $8
		 WHERE id = $9 AND user_id = $10
		 RETURNING `+mealColumns,
		estimate.Name, calories, protein, carbs, fat, fiber, estimate.Confidence, notes, id, userID,
	)
	m, err := scanMeal(row)
	if err != nil {
		log.Printf("RefinePhotoMeal update error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update meal"})
		return
	}

	c.JSON(http.StatusOK, m)
}

// GetMealPhotoURL returns a short-lived signed URL for a meal's photo, scoped
// to the authenticated owner.
func GetMealPhotoURL(c *gin.Context) {
	userID := c.GetString("user_id")
	id := c.Param("id")

	var photoPath *string
	if err := db.Pool.QueryRow(c.Request.Context(),
		`SELECT photo_path FROM public.food_logs WHERE id = $1 AND user_id = $2`,
		id, userID,
	).Scan(&photoPath); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "meal not found"})
		return
	}
	if photoPath == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "meal has no photo"})
		return
	}

	url, err := storage.CreateSignedReadURL(*photoPath, 300)
	if err != nil {
		log.Printf("CreateSignedReadURL error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load photo"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"url": url})
}
