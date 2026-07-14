// Package coach turns a day's deficit/weight-trend numbers into a short,
// data-grounded encouragement message via the Anthropic Messages API — the
// same "point at real numbers, don't hallucinate a platitude" idea as
// package vision, just text in, text out.
package coach

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

var httpClient = &http.Client{Timeout: 20 * time.Second}

// Snapshot is the slice of a user's stats a check-in message is grounded in —
// intentionally smaller than the full weekly-stats response, just the numbers
// that make a message feel earned rather than generic.
type Snapshot struct {
	DailyCalorieBudget int      `json:"daily_calorie_budget"`
	ConsumedToday       int     `json:"consumed_today"`
	RemainingToday      int     `json:"remaining_today"`
	Banking             int     `json:"banking"`
	RemainingPerDay     float64 `json:"remaining_per_day"`
	DaysRemainingInWeek int     `json:"days_remaining_in_week"`
	WeightTrendPerWeek  *float64 `json:"weight_trend_lbs_per_week,omitempty"`
	PaceStatus          *string  `json:"pace_status,omitempty"`
}

const systemPrompt = `You are a calm, encouraging fitness coach writing a single daily check-in message for someone tracking calories toward a weight goal. You will be given their real numbers for today and this week. Respond with 2-3 sentences of plain text — no markdown, no bullet points, no emoji, no "as an AI" disclaimers. Be specific and reference the actual numbers you were given. If they're over budget or behind pace, be honest but not scolding — reframe toward the trend, not one bad day. If their mood is "rough" or "ok", acknowledge it briefly before the numbers. Never invent numbers you weren't given.`

// GenerateCheckin calls Claude with the user's mood (optional, may be empty)
// and today's Snapshot, returning a short coaching message.
func GenerateCheckin(mood string, snapshot Snapshot) (string, error) {
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey == "" {
		return "", fmt.Errorf("ANTHROPIC_API_KEY not configured")
	}
	model := os.Getenv("ANTHROPIC_MODEL")
	if model == "" {
		return "", fmt.Errorf("ANTHROPIC_MODEL not configured")
	}

	snapshotJSON, err := json.Marshal(snapshot)
	if err != nil {
		return "", err
	}

	moodLine := "mood: not shared"
	if mood != "" {
		moodLine = fmt.Sprintf("mood: %s", mood)
	}

	userText := fmt.Sprintf("%s\ntoday's stats: %s", moodLine, string(snapshotJSON))

	reqBody := map[string]any{
		"model":      model,
		"max_tokens": 300,
		// Extended thinking isn't worth the latency/token cost for a short
		// grounded message — and without disabling it, "thinking" content
		// blocks precede the "text" block, which broke naive content[0] parsing.
		"thinking": map[string]any{"type": "disabled"},
		"system":   systemPrompt,
		"messages": []map[string]any{
			{
				"role":    "user",
				"content": userText,
			},
		},
	}
	payload, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequest(http.MethodPost, "https://api.anthropic.com/v1/messages", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("anthropic api error (%d): %s", resp.StatusCode, string(body))
	}

	var parsed struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", fmt.Errorf("failed to parse anthropic response: %w", err)
	}
	for _, block := range parsed.Content {
		if block.Type == "text" && block.Text != "" {
			return block.Text, nil
		}
	}

	return "", fmt.Errorf("anthropic response had no text content")
}
