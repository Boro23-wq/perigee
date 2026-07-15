package middleware

import (
	"crypto/subtle"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

// InternalAuthRequired protects the Cloud Scheduler-triggered cron endpoints
// with a shared secret header, separate from user JWT auth — these endpoints
// act on behalf of many users at once and are never called by the frontend.
func InternalAuthRequired() gin.HandlerFunc {
	secret := []byte(os.Getenv("CRON_SECRET"))

	return func(c *gin.Context) {
		provided := []byte(c.GetHeader("X-Internal-Secret"))
		if len(secret) == 0 || subtle.ConstantTimeCompare(secret, provided) != 1 {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		c.Next()
	}
}
