package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Boro23-wq/perigee/backend/coach"
	"github.com/Boro23-wq/perigee/backend/db"
)

var validMoods = map[string]bool{
	"great": true,
	"ok":    true,
	"rough": true,
}

type checkinRequest struct {
	Date string `json:"date"`
	Mood string `json:"mood"`
}

type checkinResponse struct {
	Date          string  `json:"date"`
	Mood          *string `json:"mood"`
	CoachResponse string  `json:"coach_response"`
}

// CreateCheckin computes today's real numbers, asks Claude for a short
// grounded message, and upserts one check-in per user per day (re-checking
// in the same day just refreshes the message with current numbers).
func CreateCheckin(c *gin.Context) {
	userID := c.GetString("user_id")

	var req checkinRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	if _, err := time.Parse("2006-01-02", req.Date); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date must be YYYY-MM-DD"})
		return
	}
	if req.Mood != "" && !validMoods[req.Mood] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid mood"})
		return
	}

	stats, err := computeWeeklyStats(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load stats"})
		return
	}

	var today *dayStat
	for i := range stats.Days {
		if stats.Days[i].Date == req.Date {
			today = &stats.Days[i]
			break
		}
	}
	if today == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date is outside the current week"})
		return
	}

	snapshot := coach.Snapshot{
		DailyCalorieBudget:  stats.DailyCalorieBudget,
		ConsumedToday:       today.Consumed,
		RemainingToday:      today.EffectiveBudget - today.Consumed,
		Banking:             stats.Banking,
		RemainingPerDay:     stats.RemainingPerDay,
		DaysRemainingInWeek: stats.DaysRemaining,
		WeightTrendPerWeek:  nil,
		PaceStatus:          nil,
	}
	if stats.WeightTrend != nil {
		snapshot.WeightTrendPerWeek = stats.WeightTrend.TrendLbsPerWeek
		snapshot.PaceStatus = stats.WeightTrend.PaceStatus
	}

	message, err := coach.GenerateCheckin(req.Mood, snapshot)
	if err != nil {
		log.Printf("coach.GenerateCheckin error: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "coach is unavailable right now"})
		return
	}

	snapshotJSON, err := json.Marshal(snapshot)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encode snapshot"})
		return
	}

	var mood *string
	if req.Mood != "" {
		mood = &req.Mood
	}

	if _, err := db.Pool.Exec(c.Request.Context(),
		`INSERT INTO public.coach_checkins (user_id, date, user_mood, stats_snapshot, coach_response)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (user_id, date) DO UPDATE
		   SET user_mood = $3, stats_snapshot = $4, coach_response = $5`,
		userID, req.Date, mood, string(snapshotJSON), message,
	); err != nil {
		log.Printf("CreateCheckin insert error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save check-in"})
		return
	}

	c.JSON(http.StatusCreated, checkinResponse{Date: req.Date, Mood: mood, CoachResponse: message})
}

// GetCheckin returns the day's existing check-in, if the user already did one.
func GetCheckin(c *gin.Context) {
	userID := c.GetString("user_id")
	dateParam := c.Query("date")

	if _, err := time.Parse("2006-01-02", dateParam); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date query param must be YYYY-MM-DD"})
		return
	}

	var mood *string
	var response string
	err := db.Pool.QueryRow(c.Request.Context(),
		`SELECT user_mood, coach_response FROM public.coach_checkins WHERE user_id = $1 AND date = $2`,
		userID, dateParam,
	).Scan(&mood, &response)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no check-in for that date"})
		return
	}

	c.JSON(http.StatusOK, checkinResponse{Date: dateParam, Mood: mood, CoachResponse: response})
}

const maxChatHistory = 20 // bound context size/cost per turn

type chatMessageRequest struct {
	Content string `json:"content"`
}

type chatMessageRecord struct {
	Role      string `json:"role"`
	Content   string `json:"content"`
	CreatedAt string `json:"created_at"`
}

// GetChatMessages returns the full coach conversation so far, oldest first.
func GetChatMessages(c *gin.Context) {
	userID := c.GetString("user_id")

	rows, err := db.Pool.Query(c.Request.Context(),
		`SELECT role, content, created_at FROM public.coach_messages
		 WHERE user_id = $1 ORDER BY created_at`,
		userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load messages"})
		return
	}
	defer rows.Close()

	messages := []chatMessageRecord{}
	for rows.Next() {
		var m chatMessageRecord
		if err := rows.Scan(&m.Role, &m.Content, &m.CreatedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read messages"})
			return
		}
		messages = append(messages, m)
	}

	c.JSON(http.StatusOK, gin.H{"messages": messages})
}

// PostChatMessage appends the user's message, asks Claude for a reply
// grounded in their real current stats (advisory only — the coach can't
// change settings or log anything), and stores both turns.
func PostChatMessage(c *gin.Context) {
	userID := c.GetString("user_id")

	var req chatMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Content) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "content is required"})
		return
	}
	if len(req.Content) > 2000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "message is too long"})
		return
	}

	if _, err := db.Pool.Exec(c.Request.Context(),
		`INSERT INTO public.coach_messages (user_id, role, content) VALUES ($1, 'user', $2)`,
		userID, req.Content,
	); err != nil {
		log.Printf("PostChatMessage insert user error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save message"})
		return
	}

	rows, err := db.Pool.Query(c.Request.Context(),
		`SELECT role, content FROM public.coach_messages
		 WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
		userID, maxChatHistory,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load conversation"})
		return
	}
	var history []coach.ChatMessage
	for rows.Next() {
		var m coach.ChatMessage
		if err := rows.Scan(&m.Role, &m.Content); err != nil {
			rows.Close()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read conversation"})
			return
		}
		history = append([]coach.ChatMessage{m}, history...) // DESC rows, restore ascending order
	}
	rows.Close()

	contextSnapshot, today, err := buildChatContext(c.Request.Context(), userID)
	if err != nil {
		log.Printf("buildChatContext error: %v", err)
		contextSnapshot = "{}"
		today = time.Now().UTC().Format("2006-01-02")
	}

	reply, err := coach.Chat(c.Request.Context(), userID, today, history, contextSnapshot)
	if err != nil {
		log.Printf("coach.Chat error: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "coach is unavailable right now"})
		return
	}

	if _, err := db.Pool.Exec(c.Request.Context(),
		`INSERT INTO public.coach_messages (user_id, role, content) VALUES ($1, 'assistant', $2)`,
		userID, reply,
	); err != nil {
		log.Printf("PostChatMessage insert assistant error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save reply"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"role": "assistant", "content": reply})
}

type chatContext struct {
	Today                   string   `json:"today"`
	CurrentWeightLbs        *float64 `json:"current_weight_lbs,omitempty"`
	WeightTrendPerWeek      *float64 `json:"weight_trend_lbs_per_week,omitempty"`
	GoalWeightLbs           *float64 `json:"goal_weight_lbs,omitempty"`
	GoalDate                *string  `json:"goal_date,omitempty"`
	DailyCalorieBudget      int      `json:"daily_calorie_budget"`
	RemainingPerDayThisWeek float64  `json:"remaining_cal_per_day_this_week"`
	BankingCal              int      `json:"banking_cal"`
}

// buildChatContext assembles the real-numbers snapshot the chat is grounded
// in — same philosophy as the daily check-in's Snapshot, just reused here.
// Also returns the caller's local "today" separately (not just embedded in
// the JSON) since coach.Chat needs it unparsed to scope tool calls.
func buildChatContext(ctx context.Context, userID string) (snapshot, today string, err error) {
	stats, err := computeWeeklyStats(ctx, userID)
	if err != nil {
		return "", "", err
	}

	var goalWeightLbs *float64
	var goalDate *string
	var timezone string
	if err := db.Pool.QueryRow(ctx,
		`SELECT weight_goal_lbs, goal_date, timezone FROM public.profiles WHERE id = $1`, userID,
	).Scan(&goalWeightLbs, &goalDate, &timezone); err != nil {
		return "", "", err
	}

	loc, err := time.LoadLocation(timezone)
	if err != nil {
		loc = time.UTC
	}
	today = time.Now().In(loc).Format("2006-01-02")

	cc := chatContext{
		Today:                   today,
		GoalWeightLbs:           goalWeightLbs,
		GoalDate:                goalDate,
		DailyCalorieBudget:      stats.DailyCalorieBudget,
		RemainingPerDayThisWeek: stats.RemainingPerDay,
		BankingCal:              stats.Banking,
	}
	if stats.WeightTrend != nil {
		cc.CurrentWeightLbs = stats.WeightTrend.CurrentWeight
		cc.WeightTrendPerWeek = stats.WeightTrend.TrendLbsPerWeek
	}

	b, err := json.Marshal(cc)
	if err != nil {
		return "", "", err
	}
	return string(b), today, nil
}
