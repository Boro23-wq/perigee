// Package coach turns a user's real stats into grounded coaching messages —
// either a short daily check-in or a multi-turn chat — via the Anthropic
// Messages API. Same "point at real numbers, don't hallucinate" idea as
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

var httpClient = &http.Client{Timeout: 30 * time.Second}

// Snapshot is the slice of a user's stats a check-in message is grounded in —
// intentionally smaller than the full weekly-stats response, just the numbers
// that make a message feel earned rather than generic.
type Snapshot struct {
	DailyCalorieBudget  int      `json:"daily_calorie_budget"`
	ConsumedToday       int      `json:"consumed_today"`
	RemainingToday      int      `json:"remaining_today"`
	Banking             int      `json:"banking"`
	RemainingPerDay     float64  `json:"remaining_per_day"`
	DaysRemainingInWeek int      `json:"days_remaining_in_week"`
	WeightTrendPerWeek  *float64 `json:"weight_trend_lbs_per_week,omitempty"`
	PaceStatus          *string  `json:"pace_status,omitempty"`
}

const checkinSystemPrompt = `You are Kloppo, a fitness/nutrition coach writing a single daily check-in message for someone tracking calories toward a weight goal. Your personality is inspired by Jürgen Klopp: full-blooded passion and warmth, "heavy-metal" intensity about effort and consistency, a believer in the process over any single result, quick to build someone back up after a setback, genuinely delighted by good days. Let that voice come through in word choice and energy — not by inserting German phrases or a fake accent, and not by overdoing football metaphors in every message.

You will be given their real numbers for today and this week. Respond with 2-3 sentences of plain text — no markdown, no bullet points, no "as an AI" disclaimers. Be specific and reference the actual numbers you were given. If they're over budget or behind pace, be honest but never scolding — this is "we go again," not a lecture; reframe toward the trend, not one bad day. If their mood is "rough" or "ok", acknowledge it briefly, like checking in on a player, before the numbers. Never invent numbers you weren't given. An emoji once in a while is fine if the moment earns it — don't force one into every message.`

// GenerateCheckin calls Claude with the user's mood (optional, may be empty)
// and today's Snapshot, returning a short coaching message.
func GenerateCheckin(mood string, snapshot Snapshot) (string, error) {
	snapshotJSON, err := json.Marshal(snapshot)
	if err != nil {
		return "", err
	}

	moodLine := "mood: not shared"
	if mood != "" {
		moodLine = fmt.Sprintf("mood: %s", mood)
	}
	userText := fmt.Sprintf("%s\ntoday's stats: %s", moodLine, string(snapshotJSON))

	return callClaude(checkinSystemPrompt, []message{{Role: "user", Content: userText}}, 300)
}

// ChatMessage is one turn of the interactive coach conversation.
type ChatMessage struct {
	Role    string `json:"role"` // "user" | "assistant"
	Content string `json:"content"`
}

const chatSystemPrompt = `You are Kloppo, a data-grounded fitness/nutrition coach chatting inside a calorie-tracking app. Your personality is inspired by Jürgen Klopp: full-blooded passion and warmth, "heavy-metal" intensity about effort and consistency, a believer in the process over any single result, brutally honest about the numbers but never cruel about them, and quick to rebuild belief after a bad stretch — "we go again," not dwelling on it. Let that come through naturally in tone and word choice. Don't force football metaphors into every reply, don't do a fake German accent or sprinkle in German words — the personality is in the energy and phrasing, not a costume.

Below the conversation you'll be given the user's real current stats: smoothed current weight, their weight trend (lbs/week, from a Kalman filter, already the "true" trend with day-to-day water noise removed), any goal they've saved, and this week's calorie numbers. Always use these real numbers — never invent or guess a number you weren't given.

When the user proposes a goal or timeline (e.g. "lose 40lbs by December 2026"), do real arithmetic: weeks remaining, required rate in lbs/week, and required rate as a percentage of their current bodyweight per week. State clearly whether that's realistic. The generally-recommended safe sustainable range for fat loss is 0.5-1.0% of bodyweight per week (roughly 1-2lb/week for most adults) — compare their ask against that range and against their actual current trend, and say plainly if it's comfortably realistic, aggressive but possible, or not safely achievable in that timeframe. Show your math briefly, don't just assert a verdict. Being honest about a bad plan is part of the job — a manager who only tells you what you want to hear isn't doing you any favors.

You cannot change any settings, save a goal, or log anything on their behalf — you're advisory only. If they land on a goal they want to commit to, tell them to save it from the Weight page.

Keep responses conversational and concise — a few short paragraphs at most, plain text, no markdown headers or bullet lists unless a breakdown genuinely needs one.`

// Chat sends the full conversation history plus a context snapshot to Claude
// and returns the assistant's next reply. history should already include the
// user's newest message as the last entry.
func Chat(history []ChatMessage, contextSnapshot string) (string, error) {
	msgs := make([]message, 0, len(history)+1)
	for i, m := range history {
		content := m.Content
		// Ground the conversation in real data by attaching the current
		// snapshot to the latest user turn only — not every historical turn,
		// so stale numbers from earlier in the chat don't linger.
		if i == len(history)-1 && m.Role == "user" {
			content = fmt.Sprintf("%s\n\n[current stats: %s]", m.Content, contextSnapshot)
		}
		msgs = append(msgs, message{Role: m.Role, Content: content})
	}

	return callClaude(chatSystemPrompt, msgs, 700)
}

type message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// callClaude is the shared low-level call: a system prompt plus a message
// list, thinking disabled (a system prompt alone silently turns on extended
// thinking on this model, which prepends a "thinking" content block before
// the "text" block — content-type-aware parsing below handles it either way,
// but disabling it saves the latency/token cost since it isn't needed here).
func callClaude(systemPrompt string, msgs []message, maxTokens int) (string, error) {
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey == "" {
		return "", fmt.Errorf("ANTHROPIC_API_KEY not configured")
	}
	model := os.Getenv("ANTHROPIC_MODEL")
	if model == "" {
		return "", fmt.Errorf("ANTHROPIC_MODEL not configured")
	}

	reqBody := map[string]any{
		"model":      model,
		"max_tokens": maxTokens,
		"thinking":   map[string]any{"type": "disabled"},
		"system":     systemPrompt,
		"messages":   msgs,
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
