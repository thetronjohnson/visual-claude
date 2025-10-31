package ai

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const (
	// APIEndpoint is the Anthropic Messages API endpoint
	APIEndpoint = "https://api.anthropic.com/v1/messages"

	// Model is Claude Sonnet 4.5 (latest as of implementation)
	Model = "claude-sonnet-4-5-20250929"

	// APIVersion is the Anthropic API version
	APIVersion = "2023-06-01"
)

// Client is the Anthropic API client
type Client struct {
	APIKey     string
	HTTPClient *http.Client
}

// Message represents a message in the API request
type Message struct {
	Role    string    `json:"role"`
	Content []Content `json:"content"`
}

// Content represents content blocks (text or image)
type Content struct {
	Type   string       `json:"type"` // "text" or "image"
	Text   string       `json:"text,omitempty"`
	Source *ImageSource `json:"source,omitempty"`
}

// ImageSource represents an image source for vision API
type ImageSource struct {
	Type      string `json:"type"`       // "base64"
	MediaType string `json:"media_type"` // "image/png", "image/jpeg", etc.
	Data      string `json:"data"`       // base64 encoded image
}

// Request is the API request structure
type Request struct {
	Model     string    `json:"model"`
	MaxTokens int       `json:"max_tokens"`
	Messages  []Message `json:"messages"`
}

// Response is the API response structure
type Response struct {
	ID      string `json:"id"`
	Type    string `json:"type"`
	Role    string `json:"role"`
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	Model        string `json:"model"`
	StopReason   string `json:"stop_reason"`
	StopSequence string `json:"stop_sequence"`
	Usage        struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
}

// ErrorResponse represents an API error
type ErrorResponse struct {
	Type  string `json:"type"`
	Error struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error"`
}

// NewClient creates a new Anthropic API client
func NewClient(apiKey string) *Client {
	return &Client{
		APIKey: apiKey,
		HTTPClient: &http.Client{
			Timeout: 60 * time.Second, // 60 second timeout for API calls
		},
	}
}

// GenerateFromImage generates code from a design image using Claude's vision capabilities
func (c *Client) GenerateFromImage(imageBase64, prompt string) (string, error) {
	// Build request
	req := Request{
		Model:     Model,
		MaxTokens: 4096,
		Messages: []Message{
			{
				Role: "user",
				Content: []Content{
					{
						Type: "image",
						Source: &ImageSource{
							Type:      "base64",
							MediaType: "image/png", // Assuming PNG, could be dynamic
							Data:      imageBase64,
						},
					},
					{
						Type: "text",
						Text: prompt,
					},
				},
			},
		},
	}

	// Marshal request body
	body, err := json.Marshal(req)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	// Create HTTP request
	httpReq, err := http.NewRequest("POST", APIEndpoint, bytes.NewBuffer(body))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	httpReq.Header.Set("x-api-key", c.APIKey)
	httpReq.Header.Set("anthropic-version", APIVersion)
	httpReq.Header.Set("content-type", "application/json")

	// Make request
	resp, err := c.HTTPClient.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("API request failed: %w", err)
	}
	defer resp.Body.Close()

	// Read response body
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	// Handle non-200 responses
	if resp.StatusCode != http.StatusOK {
		var errorResp ErrorResponse
		if err := json.Unmarshal(respBody, &errorResp); err != nil {
			return "", fmt.Errorf("API error %d: %s", resp.StatusCode, string(respBody))
		}
		return "", fmt.Errorf("API error: %s - %s", errorResp.Error.Type, errorResp.Error.Message)
	}

	// Parse response
	var result Response
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("failed to parse response: %w", err)
	}

	// Extract generated text
	if len(result.Content) == 0 {
		return "", fmt.Errorf("no content in API response")
	}

	return result.Content[0].Text, nil
}
