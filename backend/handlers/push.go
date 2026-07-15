package handlers

import (
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"

	"github.com/Boro23-wq/perigee/backend/db"
)

type pushSubscriptionKeys struct {
	P256dh string `json:"p256dh"`
	Auth   string `json:"auth"`
}

type subscribePushRequest struct {
	Endpoint string               `json:"endpoint"`
	Keys     pushSubscriptionKeys `json:"keys"`
}

// SubscribeToPush stores (or refreshes) a browser's push subscription for
// the caller. The standard PushSubscriptionJSON shape is accepted as-is —
// endpoint is unique across all users, since a given browser subscription
// can only ever belong to one signed-in account at a time.
func SubscribeToPush(c *gin.Context) {
	userID := c.GetString("user_id")

	var req subscribePushRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	if req.Endpoint == "" || req.Keys.P256dh == "" || req.Keys.Auth == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "endpoint and keys are required"})
		return
	}

	if _, err := db.Pool.Exec(c.Request.Context(),
		`INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (endpoint) DO UPDATE
		   SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
		userID, req.Endpoint, req.Keys.P256dh, req.Keys.Auth,
	); err != nil {
		log.Printf("SubscribeToPush error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save subscription"})
		return
	}

	c.Status(http.StatusCreated)
}

type unsubscribePushRequest struct {
	Endpoint string `json:"endpoint"`
}

// UnsubscribeFromPush removes a single subscription, scoped to the caller so
// one user can't drop another's subscription.
func UnsubscribeFromPush(c *gin.Context) {
	userID := c.GetString("user_id")

	var req unsubscribePushRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Endpoint == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "endpoint is required"})
		return
	}

	if _, err := db.Pool.Exec(c.Request.Context(),
		`DELETE FROM public.push_subscriptions WHERE user_id = $1 AND endpoint = $2`,
		userID, req.Endpoint,
	); err != nil {
		log.Printf("UnsubscribeFromPush error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to remove subscription"})
		return
	}

	c.Status(http.StatusNoContent)
}

// GetVapidPublicKey exposes the VAPID public key so the frontend doesn't
// need it baked into the build — rotating the key needs no redeploy.
func GetVapidPublicKey(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"public_key": os.Getenv("VAPID_PUBLIC_KEY")})
}
