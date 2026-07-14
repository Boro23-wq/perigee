package handlers

import (
	"context"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/Boro23-wq/perigee/backend/db"
)

type partnerInfo struct {
	ID          string  `json:"id"`
	Email       string  `json:"email"`
	DisplayName *string `json:"display_name"`
}

type partnerStatus struct {
	Status         string       `json:"status"` // "none" | "pending_outgoing" | "pending_incoming" | "active"
	RelationshipID *string      `json:"relationship_id"`
	Partner        *partnerInfo `json:"partner"`
}

func loadPartnerInfo(ctx context.Context, userID string) (*partnerInfo, error) {
	var p partnerInfo
	err := db.Pool.QueryRow(ctx,
		`SELECT u.id, u.email, pr.display_name
		 FROM auth.users u
		 LEFT JOIN public.profiles pr ON pr.id = u.id
		 WHERE u.id = $1`,
		userID,
	).Scan(&p.ID, &p.Email, &p.DisplayName)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// GetPartnerStatus returns the caller's current relationship state — no
// connection, a request sent, a request received, or an active partner.
func GetPartnerStatus(c *gin.Context) {
	userID := c.GetString("user_id")

	var id, requesterID, addresseeID, status string
	err := db.Pool.QueryRow(c.Request.Context(),
		`SELECT id, requester_id, addressee_id, status
		 FROM public.relationships
		 WHERE (requester_id = $1 OR addressee_id = $1) AND status IN ('pending', 'active')
		 ORDER BY created_at DESC LIMIT 1`,
		userID,
	).Scan(&id, &requesterID, &addresseeID, &status)

	if err != nil {
		c.JSON(http.StatusOK, partnerStatus{Status: "none"})
		return
	}

	otherID := addresseeID
	if requesterID != userID {
		otherID = requesterID
	}

	result := partnerStatus{RelationshipID: &id}
	switch {
	case status == "active":
		result.Status = "active"
	case requesterID == userID:
		result.Status = "pending_outgoing"
	default:
		result.Status = "pending_incoming"
	}

	partner, err := loadPartnerInfo(c.Request.Context(), otherID)
	if err != nil {
		log.Printf("loadPartnerInfo error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load partner info"})
		return
	}
	result.Partner = partner

	c.JSON(http.StatusOK, result)
}

type requestPartnerRequest struct {
	Email string `json:"email"`
}

// RequestPartner sends a connect request by email. If the target already sent
// one to us, this call mutually activates the connection instead of erroring
// — both people expressing "I want to connect" is consent either way.
func RequestPartner(c *gin.Context) {
	userID := c.GetString("user_id")

	var req requestPartnerRequest
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Email) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "email is required"})
		return
	}
	email := strings.TrimSpace(strings.ToLower(req.Email))

	var targetID string
	if err := db.Pool.QueryRow(c.Request.Context(),
		`SELECT id FROM auth.users WHERE lower(email) = $1`, email,
	).Scan(&targetID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no Perigee account with that email"})
		return
	}
	if targetID == userID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "you can't connect with yourself"})
		return
	}

	// Any existing active relationship for me (with anyone) blocks a new request —
	// this is a couple app, one partner at a time.
	var activeCount int
	if err := db.Pool.QueryRow(c.Request.Context(),
		`SELECT COUNT(*) FROM public.relationships
		 WHERE (requester_id = $1 OR addressee_id = $1) AND status = 'active'`,
		userID,
	).Scan(&activeCount); err == nil && activeCount > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "you're already connected to a partner"})
		return
	}

	var existingID, existingRequester, existingStatus string
	err := db.Pool.QueryRow(c.Request.Context(),
		`SELECT id, requester_id, status FROM public.relationships
		 WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)
		 LIMIT 1`,
		userID, targetID,
	).Scan(&existingID, &existingRequester, &existingStatus)

	if err == nil {
		// A relationship row already exists between these two users.
		if existingStatus == "active" {
			c.JSON(http.StatusConflict, gin.H{"error": "already connected with this person"})
			return
		}
		if existingRequester == targetID {
			// They requested us first — this call accepts it.
			if _, err := db.Pool.Exec(c.Request.Context(),
				`UPDATE public.relationships SET status = 'active' WHERE id = $1`, existingID,
			); err != nil {
				log.Printf("RequestPartner mutual-accept error: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to connect"})
				return
			}
			c.JSON(http.StatusOK, gin.H{"status": "active"})
			return
		}
		c.JSON(http.StatusConflict, gin.H{"error": "request already pending"})
		return
	}

	if _, err := db.Pool.Exec(c.Request.Context(),
		`INSERT INTO public.relationships (requester_id, addressee_id, status)
		 VALUES ($1, $2, 'pending')`,
		userID, targetID,
	); err != nil {
		log.Printf("RequestPartner insert error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to send request"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"status": "pending_outgoing"})
}

// AcceptPartner activates the single pending request addressed to us.
func AcceptPartner(c *gin.Context) {
	userID := c.GetString("user_id")

	tag, err := db.Pool.Exec(c.Request.Context(),
		`UPDATE public.relationships SET status = 'active'
		 WHERE addressee_id = $1 AND status = 'pending'`,
		userID,
	)
	if err != nil {
		log.Printf("AcceptPartner error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to accept request"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "no pending request to accept"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "active"})
}

// DeclinePartner removes the single pending request addressed to us.
func DeclinePartner(c *gin.Context) {
	userID := c.GetString("user_id")

	tag, err := db.Pool.Exec(c.Request.Context(),
		`DELETE FROM public.relationships WHERE addressee_id = $1 AND status = 'pending'`,
		userID,
	)
	if err != nil {
		log.Printf("DeclinePartner error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to decline request"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "no pending request to decline"})
		return
	}

	c.Status(http.StatusNoContent)
}

// DisconnectPartner removes any relationship row involving us — an active
// connection, or a pending request we sent (cancel) or received (decline).
func DisconnectPartner(c *gin.Context) {
	userID := c.GetString("user_id")

	tag, err := db.Pool.Exec(c.Request.Context(),
		`DELETE FROM public.relationships WHERE requester_id = $1 OR addressee_id = $1`,
		userID,
	)
	if err != nil {
		log.Printf("DisconnectPartner error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to disconnect"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "no connection to remove"})
		return
	}

	c.Status(http.StatusNoContent)
}
