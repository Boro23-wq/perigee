package middleware

import (
	"os"

	"github.com/gin-gonic/gin"
)

// CORS locks cross-origin requests to the configured frontend origin only.
// Set FRONTEND_ORIGIN to the Vercel domain in production; localhost:3000 is
// only allowed when ENVIRONMENT=development.
func CORS() gin.HandlerFunc {
	frontendOrigin := os.Getenv("FRONTEND_ORIGIN")

	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		allowed := map[string]bool{
			frontendOrigin:          true,
			"http://localhost:3000": os.Getenv("ENVIRONMENT") == "development",
		}
		if allowed[origin] {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
			c.Header("Access-Control-Allow-Credentials", "true")
		}
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}
