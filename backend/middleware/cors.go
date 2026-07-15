package middleware

import (
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// CORS locks cross-origin requests to the configured frontend origin(s) only.
// Set FRONTEND_ORIGIN to a comma-separated list of production domains, e.g.
// "https://perigee.fit,https://www.perigee.fit"; localhost:3000 is only
// allowed when ENVIRONMENT=development.
func CORS() gin.HandlerFunc {
	allowed := map[string]bool{
		"http://localhost:3000": os.Getenv("ENVIRONMENT") == "development",
	}
	for _, o := range strings.Split(os.Getenv("FRONTEND_ORIGIN"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			allowed[o] = true
		}
	}

	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
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
