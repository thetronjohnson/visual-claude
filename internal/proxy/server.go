package proxy

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/thetronjohnson/layrr/internal/ai"
	"github.com/thetronjohnson/layrr/internal/analyzer"
	"github.com/thetronjohnson/layrr/internal/bridge"
	"github.com/thetronjohnson/layrr/internal/config"
	"github.com/thetronjohnson/layrr/internal/watcher"
)

//go:embed inject.js inject-utils.js inject.css alpine.min.js tailwind.min.js
var clientAssets embed.FS

//go:embed cursor.svg
var cursorAsset []byte

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for development
	},
}

// Server is the proxy server
type Server struct {
	proxyPort  int
	targetPort int
	bridge     *bridge.Bridge
	watcher    *watcher.Watcher
	verbose    bool
	httpServer *http.Server
	projectDir string
}

// NewServer creates a new proxy server
func NewServer(proxyPort, targetPort int, bridge *bridge.Bridge, watcher *watcher.Watcher, verbose bool, projectDir string) *Server {
	return &Server{
		proxyPort:  proxyPort,
		targetPort: targetPort,
		bridge:     bridge,
		watcher:    watcher,
		verbose:    verbose,
		projectDir: projectDir,
	}
}

// Start starts the proxy server
func (s *Server) Start() error {
	// Create the reverse proxy
	target, err := url.Parse(fmt.Sprintf("http://localhost:%d", s.targetPort))
	if err != nil {
		return fmt.Errorf("failed to parse target URL: %w", err)
	}

	proxy := httputil.NewSingleHostReverseProxy(target)

	// Customize the Director to preserve the original host
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Host = target.Host
		// Remove Accept-Encoding to prevent compression issues with injection
		// This ensures we get uncompressed HTML for easier manipulation
		req.Header.Del("Accept-Encoding")
	}

	// Modify responses to inject our scripts and styles
	proxy.ModifyResponse = func(resp *http.Response) error {
		return InjectScript(resp, "/__layrr")
	}

	// Suppress "context canceled" errors that occur during normal operation
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		// Silently handle context canceled errors (normal when client disconnects)
		if err != nil && !strings.Contains(err.Error(), "context canceled") {
			if s.verbose {
				fmt.Fprintf(os.Stderr, "[Proxy] Error: %v\n", err)
			}
			http.Error(w, "Bad Gateway", http.StatusBadGateway)
		}
	}

	// Set up HTTP handlers
	mux := http.NewServeMux()

	// Serve all client assets
	mux.HandleFunc("/__layrr/alpine.min.js", s.handleAsset("alpine.min.js", "application/javascript"))
	mux.HandleFunc("/__layrr/tailwind.min.js", s.handleAsset("tailwind.min.js", "application/javascript"))
	mux.HandleFunc("/__layrr/inject.css", s.handleAsset("inject.css", "text/css"))
	mux.HandleFunc("/__layrr/inject-utils.js", s.handleAsset("inject-utils.js", "application/javascript"))
	mux.HandleFunc("/__layrr/inject.js", s.handleAsset("inject.js", "application/javascript"))

	// Serve the custom cursor asset
	mux.HandleFunc("/__layrr/cursor.svg", s.handleCursorAsset)

	// WebSocket endpoint for live reload
	mux.HandleFunc("/__layrr/ws/reload", s.handleReloadWebSocket)

	// WebSocket endpoint for messaging
	mux.HandleFunc("/__layrr/ws/message", s.handleMessageWebSocket)

	// Proxy all other requests
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		proxy.ServeHTTP(w, r)
	})

	// Create the HTTP server
	addr := fmt.Sprintf(":%d", s.proxyPort)
	s.httpServer = &http.Server{
		Addr:    addr,
		Handler: mux,
	}

	fmt.Printf("🚀 Layrr proxy server starting on http://localhost%s\n", addr)
	fmt.Printf("   Proxying to: http://localhost:%d\n", s.targetPort)

	return s.httpServer.ListenAndServe()
}

// handleAsset returns a handler function for serving embedded assets
func (s *Server) handleAsset(filename, contentType string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		content, err := clientAssets.ReadFile(filename)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to load asset: %s", filename), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Cache-Control", "no-cache")
		w.Write(content)
	}
}

// handleCursorAsset serves the custom cursor SVG
func (s *Server) handleCursorAsset(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "image/svg+xml")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.Write(cursorAsset)
}

// handleAnalyzeDesign handles design analysis and passes context to Claude Code
func (s *Server) handleAnalyzeDesign(conn *websocket.Conn, data map[string]interface{}) error {
	if s.verbose {
		fmt.Println("[Proxy] Handling analyze-design request")
	}

	// Extract fields
	imageBase64, _ := data["image"].(string)
	imageType, _ := data["imageType"].(string)
	userPrompt, _ := data["prompt"].(string)

	if imageBase64 == "" || userPrompt == "" {
		return fmt.Errorf("missing required fields: image or prompt")
	}

	// Default to image/png if type not provided
	if imageType == "" {
		imageType = "image/png"
	}

	if s.verbose {
		fmt.Printf("[Proxy] Received image type: %s\n", imageType)
	}

	// Get API key
	apiKey, err := config.GetAnthropicAPIKey(s.projectDir)
	if err != nil {
		return fmt.Errorf("API key not found: %w", err)
	}

	// Analyze project context
	ctx, err := analyzer.AnalyzeProject(s.projectDir)
	if err != nil {
		if s.verbose {
			fmt.Printf("[Proxy] Failed to analyze project: %v\n", err)
		}
		// Use defaults if analysis fails
		ctx = &analyzer.ProjectContext{
			Framework:  "react",
			Styling:    "css",
			TypeScript: false,
		}
	}

	if s.verbose {
		fmt.Printf("[Proxy] Detected project: %s\n", ctx.String())
	}

	// Build vision analysis prompt
	visionPrompt := fmt.Sprintf(`You are analyzing a design image for a %s project using %s for styling.

User's request: %s

CRITICAL: Analyze EVERY element in this design image. Do not skip or omit anything.

Provide a comprehensive description that includes:

1. **Layout & Structure** (TOP TO BOTTOM, LEFT TO RIGHT):
   - Header/navigation (logo, menu items, buttons)
   - Hero section (headings, subheadings, all text content)
   - Call-to-action buttons (text, colors, placement)
   - Feature sections (cards, icons, descriptions)
   - Decorative elements (shapes, illustrations, backgrounds)
   - Footer elements

2. **All Text Content**:
   - Write out EVERY piece of text you see (headings, paragraphs, button labels, etc.)
   - Note text sizes, weights, and colors

3. **Colors & Styling**:
   - Background colors/gradients
   - Text colors
   - Button colors (normal and hover states if visible)
   - Border colors and radius values
   - Shadow effects

4. **Spacing & Dimensions**:
   - Margins and padding between sections
   - Element sizes (buttons, cards, etc.)
   - Alignment (left, center, right)

5. **Interactive Elements**:
   - All buttons (primary, secondary, text links)
   - Input fields if present
   - Icons and their purposes

6. **Responsive/Layout Notes**:
   - How elements are arranged (grid, flex)
   - Relative positioning

Be EXHAUSTIVELY detailed. A developer should be able to recreate this pixel-perfect from your description alone.`, ctx.String(), ctx.Styling, userPrompt)

	// Call Claude Vision API
	client := ai.NewClient(apiKey)
	visualAnalysis, err := client.GenerateFromImage(imageBase64, imageType, visionPrompt)
	if err != nil {
		return fmt.Errorf("vision analysis failed: %w", err)
	}

	if s.verbose {
		fmt.Printf("[Proxy] ✓ Vision analysis completed (%d bytes)\n", len(visualAnalysis))
	}

	// Format as a message for Claude Code
	instruction := fmt.Sprintf(`%s

IMPORTANT: Implement EVERY element described below. Do not skip or omit any components, text, buttons, or decorative elements.

Design Analysis:
%s

Create a complete, production-ready component that includes:
- All text content exactly as described
- All buttons and interactive elements
- All styling (colors, spacing, typography)
- All decorative elements and shapes
- Proper layout and responsive behavior

The result should be pixel-perfect to the original design.`, userPrompt, visualAnalysis)

	// Create a bridge message (similar to element selection)
	msg := bridge.Message{
		ID: int(time.Now().UnixNano() / 1000000), // Use timestamp as ID
		Area: bridge.AreaInfo{
			X:            0,
			Y:            0,
			Width:        0,
			Height:       0,
			ElementCount: 0,
			Elements:     []bridge.ElementInfo{},
		},
		Instruction: instruction,
		Screenshot:  "", // We already analyzed the image, no need to send again
	}

	if s.verbose {
		fmt.Printf("[Proxy] Sending to Claude Code: %s\n", instruction[:min(100, len(instruction))])
	}

	// Send acknowledgment to frontend
	conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
	conn.WriteJSON(map[string]interface{}{
		"id":     msg.ID,
		"status": "received",
	})

	// Send to Claude Code through the bridge
	// This will block until Claude Code completes
	fmt.Printf("[Proxy] ⏳ Processing design request (ID %d)...\n", msg.ID)
	err = s.bridge.HandleMessage(msg)

	// Send completion status
	if err != nil {
		fmt.Printf("[Proxy] ❌ Error processing design: %v\n", err)
		conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
		conn.WriteJSON(map[string]interface{}{
			"id":     msg.ID,
			"status": "error",
			"error":  err.Error(),
		})
	} else {
		fmt.Printf("[Proxy] 🎉 Design implementation complete (ID %d)\n", msg.ID)
		conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
		conn.WriteJSON(map[string]interface{}{
			"id":     msg.ID,
			"status": "complete",
		})
	}

	return nil
}

// handleApplyVisualEdits handles applying visual drag/resize changes to the codebase
func (s *Server) handleApplyVisualEdits(conn *websocket.Conn, data map[string]interface{}) error {
	if s.verbose {
		fmt.Println("[Proxy] Handling apply-visual-edits request")
	}

	// Extract changes array
	changesData, ok := data["changes"].([]interface{})
	if !ok || len(changesData) == 0 {
		return fmt.Errorf("missing or invalid changes array")
	}

	// Extract batch info if present (Phase 3)
	var batchNumber, totalBatches int
	if batchData, ok := data["batch"].(map[string]interface{}); ok {
		if num, ok := batchData["number"].(float64); ok {
			batchNumber = int(num)
		}
		if total, ok := batchData["total"].(float64); ok {
			totalBatches = int(total)
		}
	}

	// Analyze project context
	ctx, err := analyzer.AnalyzeProject(s.projectDir)
	if err != nil {
		if s.verbose {
			fmt.Printf("[Proxy] Failed to analyze project: %v\n", err)
		}
		// Use defaults if analysis fails
		ctx = &analyzer.ProjectContext{
			Framework:  "react",
			Styling:    "css",
			TypeScript: false,
		}
	}

	if s.verbose {
		fmt.Printf("[Proxy] Detected project: %s\n", ctx.String())
	}

	// Build detailed instruction for Claude
	var instruction strings.Builder
	if totalBatches > 1 {
		instruction.WriteString(fmt.Sprintf("BATCH %d of %d: I made the following visual changes to elements:\n\n", batchNumber, totalBatches))
	} else {
		instruction.WriteString("I made the following visual changes to elements:\n\n")
	}

	for i, changeData := range changesData {
		changeMap, ok := changeData.(map[string]interface{})
		if !ok {
			continue
		}

		selector, _ := changeMap["selector"].(string)
		operation, _ := changeMap["operation"].(string)

		// Default to transform if operation not specified (backward compatibility)
		if operation == "" {
			operation = "transform"
		}

		if operation == "reorder" {
			// REORDER OPERATION
			reorderData, ok := changeMap["reorderData"].(map[string]interface{})
			if !ok {
				continue
			}

			parentSelector, _ := reorderData["parentSelector"].(string)
			fromIndex, _ := reorderData["fromIndex"].(float64) // JSON numbers are float64
			toIndex, _ := reorderData["toIndex"].(float64)
			insertBeforeSelector, _ := reorderData["insertBeforeSelector"].(string)
			insertAfterSelector, _ := reorderData["insertAfterSelector"].(string)

			instruction.WriteString(fmt.Sprintf("%d. REORDER: Element '%s'\n", i+1, selector))
			instruction.WriteString(fmt.Sprintf("   - Parent container: %s\n", parentSelector))
			instruction.WriteString(fmt.Sprintf("   - Move from position %d to position %d\n", int(fromIndex), int(toIndex)))

			if insertBeforeSelector != "" {
				instruction.WriteString(fmt.Sprintf("   - Insert before: %s\n", insertBeforeSelector))
			} else if insertAfterSelector != "" {
				instruction.WriteString(fmt.Sprintf("   - Insert after: %s\n", insertAfterSelector))
			}
			instruction.WriteString("\n")
		} else if operation == "text" {
			// TEXT EDIT OPERATION
			oldText, _ := changeMap["oldText"].(string)
			newText, _ := changeMap["newText"].(string)

			instruction.WriteString(fmt.Sprintf("%d. TEXT EDIT: Element '%s'\n", i+1, selector))
			instruction.WriteString(fmt.Sprintf("   - Old text: \"%s\"\n", oldText))
			instruction.WriteString(fmt.Sprintf("   - New text: \"%s\"\n", newText))
			instruction.WriteString("\n")
		} else if operation == "ai" {
			// AI INSTRUCTION OPERATION
			aiInstruction, _ := changeMap["instruction"].(string)
			boundsData, _ := changeMap["bounds"].(map[string]interface{})
			elementCount, _ := changeMap["elementCount"].(float64)

			instruction.WriteString(fmt.Sprintf("%d. AI INSTRUCTION: '%s'\n", i+1, aiInstruction))
			instruction.WriteString(fmt.Sprintf("   - Target: Element '%s'\n", selector))
			instruction.WriteString(fmt.Sprintf("   - Affected elements: %d\n", int(elementCount)))

			if boundsData != nil {
				x, _ := boundsData["x"].(float64)
				y, _ := boundsData["y"].(float64)
				width, _ := boundsData["width"].(float64)
				height, _ := boundsData["height"].(float64)
				instruction.WriteString(fmt.Sprintf("   - Area: (%.0f, %.0f) - %.0f×%.0fpx\n", x, y, width, height))
			}
			instruction.WriteString("\n")
		} else {
			// TRANSFORM/RESIZE OPERATION
			stylesData, _ := changeMap["styles"].(map[string]interface{})

			instruction.WriteString(fmt.Sprintf("%d. TRANSFORM: Element '%s'\n", i+1, selector))

			if transform, ok := stylesData["transform"].(string); ok && transform != "" {
				instruction.WriteString(fmt.Sprintf("   - Position changed: %s\n", transform))
			}
			if width, ok := stylesData["width"].(string); ok && width != "" {
				instruction.WriteString(fmt.Sprintf("   - Width: %s\n", width))
			}
			if height, ok := stylesData["height"].(string); ok && height != "" {
				instruction.WriteString(fmt.Sprintf("   - Height: %s\n", height))
			}
			instruction.WriteString("\n")
		}
	}

	instruction.WriteString(fmt.Sprintf(`
Apply these visual changes to the %s codebase (%s styling).

For each change:
- Find the element using the selector
- Update the source code to match the changes described above
- Use the project's existing patterns and styling approach

Make the changes permanent in the appropriate files.`, ctx.Framework, ctx.Styling))

	// Create a bridge message
	msg := bridge.Message{
		ID: int(time.Now().UnixNano() / 1000000),
		Area: bridge.AreaInfo{
			X:            0,
			Y:            0,
			Width:        0,
			Height:       0,
			ElementCount: len(changesData),
			Elements:     []bridge.ElementInfo{},
		},
		Instruction: instruction.String(),
		Screenshot:  "",
	}

	if s.verbose {
		fmt.Printf("[Proxy] Sending to Claude Code (%d changes)\n", len(changesData))
	}

	// Send acknowledgment to frontend
	conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
	conn.WriteJSON(map[string]interface{}{
		"id":     msg.ID,
		"status": "received",
	})

	// Send to Claude Code through the bridge
	fmt.Printf("[Proxy] ⏳ Processing visual edits (ID %d)...\n", msg.ID)
	err = s.bridge.HandleMessage(msg)

	// Send completion status
	if err != nil {
		fmt.Printf("[Proxy] ❌ Error processing visual edits: %v\n", err)
		conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
		conn.WriteJSON(map[string]interface{}{
			"id":     msg.ID,
			"status": "error",
			"error":  err.Error(),
		})
	} else {
		fmt.Printf("[Proxy] 🎉 Visual edits applied successfully (ID %d)\n", msg.ID)
		conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
		conn.WriteJSON(map[string]interface{}{
			"id":     msg.ID,
			"status": "complete",
		})
	}

	return nil
}

// handleAIPreview handles AI instruction preview requests - returns DOM changes without modifying files
func (s *Server) handleAIPreview(conn *websocket.Conn, data map[string]interface{}) error {
	if s.verbose {
		fmt.Println("[Proxy] Handling AI preview request")
	}

	// Extract instruction
	instruction, ok := data["instruction"].(string)
	if !ok || instruction == "" {
		return fmt.Errorf("missing or invalid instruction")
	}

	// Extract screenshot (optional)
	screenshot := getString(data, "screenshot")

	// Extract elements info
	elementsData, _ := data["elements"].([]interface{})
	elements := make([]ai.ElementInfo, 0, len(elementsData))
	for _, el := range elementsData {
		elMap, ok := el.(map[string]interface{})
		if !ok {
			continue
		}

		// Parse parent info (optional)
		var parentInfo *ai.ParentInfo
		if parentData, ok := elMap["parent"].(map[string]interface{}); ok {
			parentInfo = &ai.ParentInfo{
				TagName:   getString(parentData, "tagName"),
				ID:        getString(parentData, "id"),
				Classes:   getString(parentData, "classes"),
				Selector:  getString(parentData, "selector"),
				OuterHTML: getString(parentData, "outerHTML"),
			}
		}

		// Parse siblings info (optional)
		var siblings []ai.SiblingInfo
		if siblingsData, ok := elMap["siblings"].([]interface{}); ok {
			for _, sibData := range siblingsData {
				if sibMap, ok := sibData.(map[string]interface{}); ok {
					siblings = append(siblings, ai.SiblingInfo{
						TagName:   getString(sibMap, "tagName"),
						Classes:   getString(sibMap, "classes"),
						OuterHTML: getString(sibMap, "outerHTML"),
					})
				}
			}
		}

		elements = append(elements, ai.ElementInfo{
			TagName:   getString(elMap, "tagName"),
			ID:        getString(elMap, "id"),
			Classes:   getString(elMap, "classes"),
			Selector:  getString(elMap, "selector"),
			InnerText: getString(elMap, "innerText"),
			OuterHTML: getString(elMap, "outerHTML"),
			Parent:    parentInfo,
			Siblings:  siblings,
		})
	}

	if len(elements) == 0 {
		return fmt.Errorf("no elements provided")
	}

	// DEBUG: Log received element info
	if len(elements) > 0 {
		el := elements[0]
		fmt.Printf("[Proxy] 🔍 DEBUG - Received element:\n")
		fmt.Printf("  Tag: %s, ID: %s, Classes: %s\n", el.TagName, el.ID, el.Classes)
		fmt.Printf("  Selector: %s\n", el.Selector)

		if el.Parent != nil {
			fmt.Printf("  📦 Parent: %s", el.Parent.TagName)
			if el.Parent.Classes != "" {
				fmt.Printf(" class='%s'", el.Parent.Classes)
			}
			fmt.Println()
		} else {
			fmt.Println("  📦 Parent: none")
		}

		if len(el.Siblings) > 0 {
			fmt.Printf("  👥 Siblings: %d\n", len(el.Siblings))
			for i, sib := range el.Siblings {
				fmt.Printf("    %d. %s", i+1, sib.TagName)
				if sib.Classes != "" {
					fmt.Printf(" class='%s'", sib.Classes)
				}
				fmt.Println()
			}
		} else {
			fmt.Println("  👥 Siblings: none")
		}
	}

	// Extract design tokens (optional)
	var designTokens *ai.DesignTokens
	if tokensData, ok := data["designTokens"].(map[string]interface{}); ok {
		designTokens = &ai.DesignTokens{
			Colors:     make(map[string]string),
			Spacing:    make(map[string]string),
			Typography: make(map[string]string),
			Other:      make(map[string]string),
		}

		if colors, ok := tokensData["colors"].(map[string]interface{}); ok {
			for k, v := range colors {
				if str, ok := v.(string); ok {
					designTokens.Colors[k] = str
				}
			}
		}

		if spacing, ok := tokensData["spacing"].(map[string]interface{}); ok {
			for k, v := range spacing {
				if str, ok := v.(string); ok {
					designTokens.Spacing[k] = str
				}
			}
		}

		if typography, ok := tokensData["typography"].(map[string]interface{}); ok {
			for k, v := range typography {
				if str, ok := v.(string); ok {
					designTokens.Typography[k] = str
				}
			}
		}

		if other, ok := tokensData["other"].(map[string]interface{}); ok {
			for k, v := range other {
				if str, ok := v.(string); ok {
					designTokens.Other[k] = str
				}
			}
		}
	}

	if s.verbose {
		fmt.Printf("[Proxy] AI preview request: '%s' for %d element(s)\n",
			instruction[:min(50, len(instruction))], len(elements))
		if designTokens != nil {
			fmt.Printf("[Proxy] Design tokens: %d colors, %d spacing, %d typography\n",
				len(designTokens.Colors), len(designTokens.Spacing), len(designTokens.Typography))
		}
	}

	// Get API key from config
	apiKey, err := config.GetAnthropicAPIKey(s.projectDir)
	if err != nil {
		fmt.Printf("[Proxy] ❌ Failed to get API key: %v\n", err)
		return fmt.Errorf("API key not configured. Please set ANTHROPIC_API_KEY in .claude/settings.json")
	}

	// Create Anthropic API client
	client := ai.NewClient(apiKey)

	// Call Claude API for preview
	fmt.Println("[Proxy] ⏳ Requesting AI preview from Claude API...")
	changes, err := client.GeneratePreview(instruction, elements, screenshot, designTokens)
	if err != nil {
		fmt.Printf("[Proxy] ❌ AI preview failed: %v\n", err)
		return err
	}

	if s.verbose {
		fmt.Printf("[Proxy] ✅ Claude returned %d DOM change(s)\n", len(changes))
	}

	// DEBUG: Log AI response details
	fmt.Println("[Proxy] 🤖 AI Response Changes:")
	for i, change := range changes {
		fmt.Printf("  %d. Action: %s, Selector: %s\n", i+1, change.Action, change.Selector)
		if change.Position != "" {
			fmt.Printf("     Position: %s\n", change.Position)
		}
		if change.Value != "" {
			// Truncate long HTML values
			val := change.Value
			if len(val) > 100 {
				val = val[:100] + "..."
			}
			fmt.Printf("     Value: %s\n", val)
		}
	}

	// Convert ai.DOMChange to frontend format
	changesForFrontend := make([]map[string]interface{}, 0, len(changes))
	for _, change := range changes {
		changeMap := map[string]interface{}{
			"selector": change.Selector,
			"action":   change.Action,
		}

		if change.Value != "" {
			changeMap["value"] = change.Value
		}
		if change.Property != "" {
			changeMap["property"] = change.Property
		}
		if change.Attribute != "" {
			changeMap["attribute"] = change.Attribute
		}
		if change.Position != "" {
			changeMap["position"] = change.Position
		}

		changesForFrontend = append(changesForFrontend, changeMap)
	}

	// Send response back to browser
	conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
	err = conn.WriteJSON(map[string]interface{}{
		"type":    "ai-preview-result",
		"status":  "success",
		"changes": changesForFrontend,
	})

	if err != nil {
		return fmt.Errorf("failed to send response: %w", err)
	}

	fmt.Printf("[Proxy] ✅ AI preview complete - sent %d changes to browser\n", len(changes))
	return nil
}

// getString is a helper to safely extract string from map
func getString(m map[string]interface{}, key string) string {
	if val, ok := m[key].(string); ok {
		return val
	}
	return ""
}

// min helper function
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// handleReloadWebSocket handles WebSocket connections for live reload
func (s *Server) handleReloadWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		if s.verbose {
			fmt.Printf("[Proxy] Failed to upgrade WebSocket: %v\n", err)
		}
		return
	}
	defer conn.Close()

	// Add to watcher clients
	s.watcher.AddClient(conn)
	defer s.watcher.RemoveClient(conn)

	// Keep connection alive
	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

// handleMessageWebSocket handles WebSocket connections for messaging
func (s *Server) handleMessageWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		if s.verbose {
			fmt.Printf("[Proxy] Failed to upgrade WebSocket: %v\n", err)
		}
		return
	}
	defer conn.Close()

	if s.verbose {
		fmt.Println("[Proxy] Message WebSocket connected")
	}

	// Read messages from the browser
	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			break
		}

		// First, try to parse as generic map to check message type
		var data map[string]interface{}
		if err := json.Unmarshal(message, &data); err != nil {
			if s.verbose {
				fmt.Printf("[Proxy] Failed to parse message: %v\n", err)
			}
			continue
		}

		// Check if this is a design analysis message
		if msgType, ok := data["type"].(string); ok {
			switch msgType {
			case "analyze-design":
				// Handle design analysis - this will block until Claude Code completes
				if err := s.handleAnalyzeDesign(conn, data); err != nil {
					if s.verbose {
						fmt.Printf("[Proxy] ❌ Design analysis error: %v\n", err)
					}
					conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
					conn.WriteJSON(map[string]interface{}{
						"status": "error",
						"error":  err.Error(),
					})
				}
				continue

			case "apply-visual-edits":
				// Handle visual edits - this will block until Claude Code completes
				if err := s.handleApplyVisualEdits(conn, data); err != nil {
					if s.verbose {
						fmt.Printf("[Proxy] ❌ Visual edits error: %v\n", err)
					}
					conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
					conn.WriteJSON(map[string]interface{}{
						"status": "error",
						"error":  err.Error(),
					})
				}
				continue

			case "ai-preview":
				// Handle AI preview request - get DOM changes without modifying code
				if err := s.handleAIPreview(conn, data); err != nil {
					if s.verbose {
						fmt.Printf("[Proxy] ❌ AI preview error: %v\n", err)
					}
					conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
					conn.WriteJSON(map[string]interface{}{
						"type":   "ai-preview-result",
						"status": "error",
						"error":  err.Error(),
					})
				}
				continue
			}
		}

		// Otherwise, handle as regular element selection message
		var msg bridge.Message
		if err := json.Unmarshal(message, &msg); err != nil {
			if s.verbose {
				fmt.Printf("[Proxy] Failed to parse message: %v\n", err)
			}
			continue
		}

		// Send acknowledgment that message was received
		fmt.Printf("[Proxy] 📨 Sending 'received' ack for message ID %d\n", msg.ID)
		conn.WriteJSON(map[string]interface{}{
			"id":     msg.ID,
			"status": "received",
		})

		// Handle the message (TUI will show all feedback)
		// This blocks until Claude Code finishes
		fmt.Printf("[Proxy] ⏳ Processing message ID %d...\n", msg.ID)
		err = s.bridge.HandleMessage(msg)

		// Send completion status with write deadline
		if err != nil {
			fmt.Printf("[Proxy] ❌ Sending 'error' status for message ID %d: %v\n", msg.ID, err)
			conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
			if writeErr := conn.WriteJSON(map[string]interface{}{
				"id":     msg.ID,
				"status": "error",
				"error":  err.Error(),
			}); writeErr != nil {
				fmt.Fprintf(os.Stderr, "[Proxy] Failed to send error to browser: %v\n", writeErr)
			}
		} else {
			fmt.Printf("[Proxy] 🎉 Sending 'complete' status for message ID %d\n", msg.ID)
			conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
			if writeErr := conn.WriteJSON(map[string]interface{}{
				"id":     msg.ID,
				"status": "complete",
			}); writeErr != nil {
				fmt.Fprintf(os.Stderr, "[Proxy] ⚠️  Failed to send completion to browser: %v\n", writeErr)
			} else {
				fmt.Printf("[Proxy] ✅ Successfully sent 'complete' for message ID %d\n", msg.ID)
			}
		}
	}
}

// Shutdown gracefully shuts down the HTTP server
func (s *Server) Shutdown(ctx context.Context) error {
	if s.httpServer != nil {
		if s.verbose {
			fmt.Println("[Proxy] Shutting down HTTP server...")
		}
		return s.httpServer.Shutdown(ctx)
	}
	return nil
}

// DetectDevServer attempts to detect a running dev server
func DetectDevServer() (int, error) {
	commonPorts := []int{5173, 3000, 8080, 4200, 8000}

	for _, port := range commonPorts {
		addr := fmt.Sprintf("localhost:%d", port)
		conn, err := net.DialTimeout("tcp", addr, 500*time.Millisecond)
		if err == nil {
			conn.Close()
			return port, nil
		}
	}

	return 0, fmt.Errorf("no dev server found on common ports")
}
