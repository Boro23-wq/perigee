package main

import (
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"

	"github.com/Boro23-wq/trellis/backend/db"
	"github.com/Boro23-wq/trellis/backend/handlers"
	"github.com/Boro23-wq/trellis/backend/middleware"
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

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	api := r.Group("/api")
	api.Use(middleware.AuthRequired())
	{
		api.GET("/me", handlers.GetMe)
		api.POST("/meals", handlers.LogMeal)
		api.GET("/meals", handlers.GetMeals)
		api.GET("/meals/usuals", handlers.GetUsuals)
		api.DELETE("/meals/:id", handlers.DeleteMeal)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("trellis backend listening on :%s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
