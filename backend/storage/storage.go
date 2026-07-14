// Package storage talks to Supabase Storage over its REST API using the
// service-role key. Image bytes never pass through this process except
// briefly in AnalyzePhoto to hand them to Claude Vision — uploads and the
// eventual display URL are both signed URLs the client hits directly.
package storage

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

var httpClient = &http.Client{Timeout: 15 * time.Second}

func baseURL() string        { return os.Getenv("SUPABASE_URL") }
func serviceRoleKey() string { return os.Getenv("SUPABASE_SERVICE_ROLE_KEY") }

func bucket() string {
	if b := os.Getenv("MEAL_PHOTOS_BUCKET"); b != "" {
		return b
	}
	return "meal-photos"
}

func authHeaders(req *http.Request) {
	key := serviceRoleKey()
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("apikey", key)
}

// CreateSignedUploadURL asks Supabase Storage for a one-time upload URL for
// path, valid for a couple of minutes — the client PUTs the file bytes
// straight to it, so they never touch our Go server.
func CreateSignedUploadURL(path string) (string, error) {
	endpoint := fmt.Sprintf("%s/storage/v1/object/upload/sign/%s/%s", baseURL(), bucket(), path)
	req, err := http.NewRequest(http.MethodPost, endpoint, nil)
	if err != nil {
		return "", err
	}
	authHeaders(req)

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return "", fmt.Errorf("supabase storage sign-upload failed (%d): %s", resp.StatusCode, string(body))
	}

	var out struct {
		URL string `json:"url"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return "", err
	}
	// Supabase returns "url" relative to /storage/v1, not the project root.
	return baseURL() + "/storage/v1" + out.URL, nil
}

// CreateSignedReadURL returns a temporary GET URL for an already-uploaded
// object, expiring after expiresInSeconds.
func CreateSignedReadURL(path string, expiresInSeconds int) (string, error) {
	endpoint := fmt.Sprintf("%s/storage/v1/object/sign/%s/%s", baseURL(), bucket(), path)
	payload, _ := json.Marshal(map[string]int{"expiresIn": expiresInSeconds})

	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	authHeaders(req)

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("supabase storage sign-read failed (%d): %s", resp.StatusCode, string(body))
	}

	var out struct {
		SignedURL string `json:"signedURL"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return "", err
	}
	// Supabase returns "signedURL" relative to /storage/v1, not the project root.
	return baseURL() + "/storage/v1" + out.SignedURL, nil
}

// DownloadBytes fetches an object via a signed URL (or any URL) and returns
// its bytes and content type, capped at maxBytes to bound what we forward to
// Claude Vision and how much memory a single request can consume.
func DownloadBytes(url string, maxBytes int64) ([]byte, string, error) {
	resp, err := httpClient.Get(url)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("download failed (%d)", resp.StatusCode)
	}

	limited := io.LimitReader(resp.Body, maxBytes+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return nil, "", err
	}
	if int64(len(data)) > maxBytes {
		return nil, "", fmt.Errorf("photo exceeds %d byte limit", maxBytes)
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "image/jpeg"
	}
	return data, contentType, nil
}
