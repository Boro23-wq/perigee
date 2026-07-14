package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

// visitor tracks one client's token bucket plus when it was last used, so
// idle entries can be swept instead of growing the map forever.
type visitor struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// RateLimit caps requests per client IP with a token bucket — generous
// enough for normal two-person use, tight enough to blunt a runaway script
// or a leaked/scraped endpoint. In-memory is fine at this scale; swap for a
// Redis-backed limiter if this ever runs on more than one machine.
func RateLimit(requestsPerSecond float64, burst int) gin.HandlerFunc {
	var mu sync.Mutex
	visitors := make(map[string]*visitor)

	go func() {
		for range time.Tick(time.Minute) {
			mu.Lock()
			for ip, v := range visitors {
				if time.Since(v.lastSeen) > 10*time.Minute {
					delete(visitors, ip)
				}
			}
			mu.Unlock()
		}
	}()

	return func(c *gin.Context) {
		ip := c.ClientIP()

		mu.Lock()
		v, ok := visitors[ip]
		if !ok {
			v = &visitor{limiter: rate.NewLimiter(rate.Limit(requestsPerSecond), burst)}
			visitors[ip] = v
		}
		v.lastSeen = time.Now()
		allowed := v.limiter.Allow()
		mu.Unlock()

		if !allowed {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "too many requests, slow down"})
			return
		}
		c.Next()
	}
}
