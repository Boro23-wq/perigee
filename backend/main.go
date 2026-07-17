package main

import (
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"

	"github.com/Boro23-wq/perigee/backend/db"
	"github.com/Boro23-wq/perigee/backend/handlers"
	"github.com/Boro23-wq/perigee/backend/middleware"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("no .env file found, relying on real environment variables")
	}

	if err := db.Init(os.Getenv("DATABASE_URL")); err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer db.Pool.Close()

	if err := middleware.InitJWKS(os.Getenv("SUPABASE_URL")); err != nil {
		log.Fatalf("failed to load Supabase JWKS: %v", err)
	}

	r := gin.Default()
	r.Use(middleware.CORS())
	// 8 req/sec sustained with a burst of 40 — comfortable for normal use by
	// two people, but stops a runaway script or scraped endpoint from
	// hammering the API or the Anthropic-backed routes' per-call cost.
	r.Use(middleware.RateLimit(8, 40))

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	api := r.Group("/api")
	api.Use(middleware.AuthRequired())
	{
		api.GET("/me", handlers.GetMe)
		api.PATCH("/me", handlers.UpdateProfile)
		api.POST("/me/avatar/upload-url", handlers.RequestAvatarUploadURL)
		api.POST("/meals", handlers.LogMeal)
		api.GET("/meals", handlers.GetMeals)
		api.GET("/meals/usuals", handlers.GetUsuals)
		api.GET("/meals/history", handlers.GetMealsHistory)
		api.DELETE("/meals/:id", handlers.DeleteMeal)
		api.PATCH("/meals/:id", handlers.UpdateMeal)
		api.PATCH("/meals/:id/adjust", handlers.AdjustMeal)
		api.POST("/meals/:id/share", handlers.ShareMeal)
		api.GET("/meals/:id/photo-url", handlers.GetMealPhotoURL)
		api.POST("/meals/photo/upload-url", handlers.RequestPhotoUploadURL)
		api.POST("/meals/photo/analyze", handlers.AnalyzePhoto)
		api.POST("/weight", handlers.LogWeight)
		api.GET("/weight/history", handlers.GetWeightHistory)
		api.DELETE("/weight/:date", handlers.DeleteWeight)
		api.GET("/stats/weekly", handlers.GetWeeklyStats)
		api.GET("/streaks", handlers.GetStreak)
		api.GET("/milestones/pending", handlers.GetPendingMilestones)
		api.POST("/milestones/:key/ack", handlers.AckMilestone)
		api.POST("/push/subscribe", handlers.SubscribeToPush)
		api.DELETE("/push/subscribe", handlers.UnsubscribeFromPush)
		api.GET("/push/vapid-public-key", handlers.GetVapidPublicKey)
		api.POST("/feedback", handlers.SubmitFeedback)
		api.POST("/activity", handlers.LogActivity)
		api.GET("/activity", handlers.GetActivity)
		api.GET("/exercises", handlers.GetExercises)
		api.POST("/workouts", handlers.LogWorkout)
		api.GET("/workouts", handlers.GetWorkouts)
		api.GET("/workouts/range", handlers.GetWorkoutsRange)
		api.DELETE("/workouts/:id", handlers.DeleteWorkout)
		api.GET("/partner", handlers.GetPartnerStatus)
		api.POST("/partner/request", handlers.RequestPartner)
		api.POST("/partner/accept", handlers.AcceptPartner)
		api.POST("/partner/decline", handlers.DeclinePartner)
		api.DELETE("/partner", handlers.DisconnectPartner)
		api.GET("/partner/comparison", handlers.GetPartnerComparison)
		api.POST("/partner/poke", handlers.PokePartner)
		api.GET("/partner/pokes/recent", handlers.GetRecentPokes)
		api.GET("/barcode/:upc", handlers.GetBarcodeProduct)
		api.POST("/meals/barcode", handlers.LogBarcodeMeal)
		api.GET("/foods/search", handlers.SearchFoods)
		api.GET("/foods/:id", handlers.GetFoodDetail)
		api.POST("/meals/search", handlers.LogSearchMeal)
		api.POST("/recipes", handlers.CreateRecipe)
		api.GET("/recipes", handlers.GetRecipes)
		api.PUT("/recipes/:id", handlers.UpdateRecipe)
		api.DELETE("/recipes/:id", handlers.DeleteRecipe)
		api.GET("/recipes/shared/:token", handlers.GetSharedRecipe)
		api.POST("/recipes/shared/:token/accept", handlers.AcceptSharedRecipe)
		api.POST("/recipes/:id/log", handlers.LogRecipeMeal)
		api.POST("/recipes/:id/favorite", handlers.FavoriteRecipe)
		api.DELETE("/recipes/:id/favorite", handlers.UnfavoriteRecipe)
		api.POST("/coach/checkin", handlers.CreateCheckin)
		api.GET("/coach/checkin", handlers.GetCheckin)
		api.GET("/coach/messages", handlers.GetChatMessages)
		api.POST("/coach/messages", handlers.PostChatMessage)
	}

	internal := r.Group("/api/internal/cron")
	internal.Use(middleware.InternalAuthRequired())
	{
		internal.POST("/morning-reminder", handlers.CronMorningReminder)
		internal.POST("/evening-reminder", handlers.CronEveningReminder)
		internal.POST("/milestones", handlers.CronCheckMilestones)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("perigee backend listening on :%s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
