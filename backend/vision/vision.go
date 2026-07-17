// Package vision turns a meal photo into a calorie/macro estimate via the
// Anthropic Messages API (Claude Vision). This is the whole point of photo
// logging: replace "type in the calories yourself" with "point the camera
// at it" — see spec Fix #16 (Photo Accuracy UX).
package vision

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"time"
)

var httpClient = &http.Client{Timeout: 30 * time.Second}

type Estimate struct {
	Name       string  `json:"name"`
	Calories   int     `json:"calories"`
	Protein    float64 `json:"protein"`
	Carbs      float64 `json:"carbs"`
	Fat        float64 `json:"fat"`
	Fiber      float64 `json:"fiber"`
	Confidence string  `json:"confidence"` // "low" | "medium" | "high"
}

const prompt = `Identify the food in this photo and estimate its nutrition for the visible portion. Respond with ONLY a JSON object — no prose, no markdown code fences — matching exactly this shape:
{"name": string, "calories": integer, "protein": number, "carbs": number, "fat": number, "fiber": number, "confidence": "low"|"medium"|"high"}
"confidence" is your own certainty about portion size and hidden ingredients (oils, butter, sauces) — restaurant or mixed dishes are usually "low" or "medium", a single whole food (an apple, a plain egg) can be "high".`

var jsonFence = regexp.MustCompile("(?s)```(?:json)?\\s*(.*?)\\s*```")

// EstimateFromImage sends imageBytes to Claude and parses its JSON reply.
func EstimateFromImage(imageBytes []byte, mediaType string) (*Estimate, error) {
	return estimateFromImage(imageBytes, mediaType, "")
}

// EstimateFromImageWithHint re-estimates the same photo, but with the
// user's own stated portions/ingredients folded into the prompt — e.g. "215g
// chicken, 100g cilantro rice" — for when they know precisely what they ate
// and the visual guess alone isn't accurate enough. The photo is still sent;
// this combines both rather than replacing the image with a pure text-based
// guess.
func EstimateFromImageWithHint(imageBytes []byte, mediaType, hint string) (*Estimate, error) {
	return estimateFromImage(imageBytes, mediaType, hint)
}

func estimateFromImage(imageBytes []byte, mediaType, hint string) (*Estimate, error) {
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("ANTHROPIC_API_KEY not configured")
	}
	model := os.Getenv("ANTHROPIC_MODEL")
	if model == "" {
		return nil, fmt.Errorf("ANTHROPIC_MODEL not configured")
	}

	promptText := prompt
	if hint != "" {
		promptText += fmt.Sprintf("\n\nThe user has told you the specific amounts they ate: %q. Combine this with what you see in the photo — trust their stated quantities and ingredients over your own visual portion guess where they overlap, but still use the photo to catch anything they didn't mention (sauces, oil, sides) and to sanity-check the overall dish.", hint)
	}

	b64 := base64.StdEncoding.EncodeToString(imageBytes)
	reqBody := map[string]any{
		"model":      model,
		"max_tokens": 300,
		"messages": []map[string]any{
			{
				"role": "user",
				"content": []map[string]any{
					{
						"type": "image",
						"source": map[string]string{
							"type":       "base64",
							"media_type": mediaType,
							"data":       b64,
						},
					},
					{"type": "text", "text": promptText},
				},
			},
		},
	}
	payload, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest(http.MethodPost, "https://api.anthropic.com/v1/messages", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("anthropic api error (%d): %s", resp.StatusCode, string(body))
	}

	var parsed struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("failed to parse anthropic response: %w", err)
	}
	if len(parsed.Content) == 0 {
		return nil, fmt.Errorf("anthropic response had no content")
	}

	text := jsonFence.ReplaceAllString(parsed.Content[0].Text, "$1")

	var estimate Estimate
	if err := json.Unmarshal([]byte(text), &estimate); err != nil {
		return nil, fmt.Errorf("failed to parse nutrition estimate: %w", err)
	}
	switch estimate.Confidence {
	case "low", "medium", "high":
	default:
		estimate.Confidence = "low"
	}
	if estimate.Name == "" {
		estimate.Name = "Logged meal"
	}
	return &estimate, nil
}
