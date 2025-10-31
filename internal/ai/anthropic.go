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

// ElementInfo represents information about a DOM element
type ElementInfo struct {
	TagName   string
	ID        string
	Classes   string
	Selector  string
	InnerText string
	OuterHTML string
}

// DOMChange represents a single DOM manipulation instruction
type DOMChange struct {
	Selector  string `json:"selector"`
	Action    string `json:"action"`
	Value     string `json:"value,omitempty"`
	Property  string `json:"property,omitempty"`
	Attribute string `json:"attribute,omitempty"`
}

// PreviewResponse represents the expected JSON structure from Claude
type PreviewResponse struct {
	Changes []DOMChange `json:"changes"`
}

// GeneratePreview generates DOM manipulation instructions from AI instruction
// This is used for instant preview mode - no file modifications, just DOM changes
func (c *Client) GeneratePreview(instruction string, elements []ElementInfo, screenshot string) ([]DOMChange, error) {
	// Build element context string
	var elementsDesc string
	for i, el := range elements {
		elementsDesc += fmt.Sprintf("%d. %s (selector: %s)\n", i+1, el.TagName, el.Selector)
		if el.ID != "" {
			elementsDesc += fmt.Sprintf("   ID: %s\n", el.ID)
		}
		if el.Classes != "" {
			elementsDesc += fmt.Sprintf("   Classes: %s\n", el.Classes)
		}
		if el.InnerText != "" && len(el.InnerText) < 100 {
			elementsDesc += fmt.Sprintf("   Text: %s\n", el.InnerText)
		}
	}

	// Build prompt requesting structured JSON
	prompt := fmt.Sprintf(`VISUAL CLAUDE - AI PREVIEW MODE

User instruction: "%s"

Target elements (%d):
%s

**CRITICAL: This is PREVIEW MODE. Return ONLY a JSON object. Do NOT write explanations. Do NOT use markdown code blocks.**

Your task:
1. Analyze the user's instruction: "%s"
2. Determine what DOM changes are needed to fulfill this instruction
3. Return a JSON object with this EXACT structure:

{
  "changes": [
    {"selector": "CSS_SELECTOR", "action": "ACTION_TYPE", "value": "VALUE"},
    {"selector": "CSS_SELECTOR", "action": "setStyle", "property": "CSS_PROPERTY", "value": "CSS_VALUE"}
  ]
}

Supported actions:
- "addClass": Add CSS classes (value = space-separated class names)
- "removeClass": Remove CSS classes (value = space-separated class names)
- "setText": Change text content (value = new text)
- "setHTML": Change HTML content (value = new HTML)
- "setStyle": Change inline style (property = CSS property name, value = CSS value)
- "setAttribute": Set attribute (attribute = attr name, value = attr value)

Rules:
1. Return ONLY the JSON object - no explanations before or after
2. Do NOT wrap in markdown code blocks (no triple-backticks or json keyword)
3. Use proper CSS selectors from the elements above
4. Be specific and intentional with changes
5. Prefer CSS classes over inline styles when possible
6. If the instruction is unclear, make reasonable assumptions

Return the JSON now:`, instruction, len(elements), elementsDesc, instruction)

	// Build content array (text + optional image)
	contentArray := []Content{
		{
			Type: "text",
			Text: prompt,
		},
	}

	// Add screenshot if provided
	if screenshot != "" {
		contentArray = append([]Content{
			{
				Type: "image",
				Source: &ImageSource{
					Type:      "base64",
					MediaType: "image/png",
					Data:      screenshot,
				},
			},
		}, contentArray...)
	}

	// Build request
	req := Request{
		Model:     Model,
		MaxTokens: 2048, // Preview responses should be concise
		Messages: []Message{
			{
				Role:    "user",
				Content: contentArray,
			},
		},
	}

	// Marshal request body
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	// Create HTTP request
	httpReq, err := http.NewRequest("POST", APIEndpoint, bytes.NewBuffer(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	httpReq.Header.Set("x-api-key", c.APIKey)
	httpReq.Header.Set("anthropic-version", APIVersion)
	httpReq.Header.Set("content-type", "application/json")

	// Make request
	resp, err := c.HTTPClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("API request failed: %w", err)
	}
	defer resp.Body.Close()

	// Read response body
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Handle non-200 responses
	if resp.StatusCode != http.StatusOK {
		var errorResp ErrorResponse
		if err := json.Unmarshal(respBody, &errorResp); err != nil {
			return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(respBody))
		}
		return nil, fmt.Errorf("API error: %s - %s", errorResp.Error.Type, errorResp.Error.Message)
	}

	// Parse API response
	var result Response
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to parse API response: %w", err)
	}

	// Extract generated text
	if len(result.Content) == 0 {
		return nil, fmt.Errorf("no content in API response")
	}

	responseText := result.Content[0].Text

	// Try to parse as JSON directly
	var previewResp PreviewResponse
	if err := json.Unmarshal([]byte(responseText), &previewResp); err != nil {
		// Claude might have wrapped it in markdown - try to extract
		responseText = extractJSONFromMarkdown(responseText)
		if err := json.Unmarshal([]byte(responseText), &previewResp); err != nil {
			return nil, fmt.Errorf("failed to parse Claude's response as JSON: %w\nResponse: %s", err, responseText)
		}
	}

	// Validate we have changes
	if len(previewResp.Changes) == 0 {
		return nil, fmt.Errorf("Claude returned no DOM changes")
	}

	return previewResp.Changes, nil
}

// extractJSONFromMarkdown attempts to extract JSON from markdown code blocks
func extractJSONFromMarkdown(text string) string {
	// Look for ```json ... ``` or ``` ... ```
	start := -1
	end := -1

	// Find first ```
	for i := 0; i < len(text)-2; i++ {
		if text[i] == '`' && text[i+1] == '`' && text[i+2] == '`' {
			start = i + 3
			// Skip optional "json" keyword
			if start < len(text)-4 && text[start:start+4] == "json" {
				start += 4
			}
			// Skip newline
			if start < len(text) && text[start] == '\n' {
				start++
			}
			break
		}
	}

	// Find closing ```
	if start > 0 {
		for i := start; i < len(text)-2; i++ {
			if text[i] == '`' && text[i+1] == '`' && text[i+2] == '`' {
				end = i
				break
			}
		}
	}

	if start > 0 && end > start {
		return text[start:end]
	}

	// If no code blocks found, return original
	return text
}
