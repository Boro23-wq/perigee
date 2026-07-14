package middleware

import (
	"net/http"
	"os"
	"strings"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

var jwks keyfunc.Keyfunc

// InitJWKS fetches and caches the project's JSON Web Key Set for verifying
// modern Supabase projects, which sign access tokens with an asymmetric key
// (ES256) rather than the legacy shared HS256 secret. Call once at startup.
func InitJWKS(supabaseURL string) error {
	k, err := keyfunc.NewDefault([]string{supabaseURL + "/auth/v1/.well-known/jwks.json"})
	if err != nil {
		return err
	}
	jwks = k
	return nil
}

// AuthRequired verifies Supabase-issued JWTs. Stateless — no DB call, just a
// signature check. Supports both signing modes so this works whether the
// project uses the newer JWKS-based keys or the legacy HS256 JWT secret.
func AuthRequired() gin.HandlerFunc {
	secret := []byte(os.Getenv("SUPABASE_JWT_SECRET")) // Project Settings → API → JWT Secret (legacy)

	return func(c *gin.Context) {
		h := c.GetHeader("Authorization")
		if !strings.HasPrefix(h, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing bearer token"})
			return
		}
		tokenStr := strings.TrimPrefix(h, "Bearer ")

		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
			switch t.Method.(type) {
			case *jwt.SigningMethodHMAC:
				return secret, nil
			case *jwt.SigningMethodECDSA:
				if jwks == nil {
					return nil, jwt.ErrTokenUnverifiable
				}
				return jwks.Keyfunc(t)
			default:
				return nil, jwt.ErrSignatureInvalid // reject alg-confusion / alg:none attacks
			}
		},
			jwt.WithValidMethods([]string{"HS256", "ES256"}),
			jwt.WithExpirationRequired(),
			jwt.WithAudience("authenticated"),
		)
		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}

		claims := token.Claims.(jwt.MapClaims)
		sub, _ := claims.GetSubject() // Supabase user UUID
		if sub == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid subject"})
			return
		}

		c.Set("user_id", sub)
		c.Next()
	}
}
