package handlers

import (
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/Boro23-wq/perigee/backend/db"
)

var validFeedbackCategories = map[string]bool{
	"bug":   true,
	"idea":  true,
	"other": true,
}

type submitFeedbackRequest struct {
	Category string  `json:"category"`
	Message  string  `json:"message"`
	Page     *string `json:"page"`
}

// SubmitFeedback stores a short piece of user feedback — no reply flow, no
// admin UI, just a place to jot down a bug or idea while using the app
// without leaving it. Reviewed directly in the database.
func SubmitFeedback(c *gin.Context) {
	userID := c.GetString("user_id")

	var req submitFeedbackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	req.Message = strings.TrimSpace(req.Message)
	if req.Message == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "message is required"})
		return
	}
	if len(req.Message) > 2000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "message must be 2000 characters or fewer"})
		return
	}
	if req.Category == "" {
		req.Category = "other"
	}
	if !validFeedbackCategories[req.Category] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid category"})
		return
	}

	if _, err := db.Pool.Exec(c.Request.Context(),
		`INSERT INTO public.feedback (user_id, category, message, page) VALUES ($1, $2, $3, $4)`,
		userID, req.Category, req.Message, req.Page,
	); err != nil {
		log.Printf("SubmitFeedback error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to submit feedback"})
		return
	}

	c.Status(http.StatusCreated)
}
