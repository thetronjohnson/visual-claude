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
	"github.com/thetronjohnson/visual-claude/internal/ai"
	"github.com/thetronjohnson/visual-claude/internal/analyzer"
	"github.com/thetronjohnson/visual-claude/internal/bridge"
	"github.com/thetronjohnson/visual-claude/internal/config"
	"github.com/thetronjohnson/visual-claude/internal/watcher"
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
	}

	// Modify responses to inject our scripts and styles
	proxy.ModifyResponse = func(resp *http.Response) error {
		return InjectScript(resp, "/__visual-claude")
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
	mux.HandleFunc("/__visual-claude/alpine.min.js", s.handleAsset("alpine.min.js", "application/javascript"))
	mux.HandleFunc("/__visual-claude/tailwind.min.js", s.handleAsset("tailwind.min.js", "application/javascript"))
	mux.HandleFunc("/__visual-claude/inject.css", s.handleAsset("inject.css", "text/css"))
	mux.HandleFunc("/__visual-claude/inject-utils.js", s.handleAsset("inject-utils.js", "application/javascript"))
	mux.HandleFunc("/__visual-claude/inject.js", s.handleAsset("inject.js", "application/javascript"))

	// Serve the custom cursor asset
	mux.HandleFunc("/__visual-claude/cursor.svg", s.handleCursorAsset)

	// WebSocket endpoint for live reload
	mux.HandleFunc("/__visual-claude/ws/reload", s.handleReloadWebSocket)

	// WebSocket endpoint for messaging
	mux.HandleFunc("/__visual-claude/ws/message", s.handleMessageWebSocket)

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

	fmt.Printf("🚀 Visual Claude proxy server starting on http://localhost%s\n", addr)
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
	userPrompt, _ := data["prompt"].(string)

	if imageBase64 == "" || userPrompt == "" {
		return fmt.Errorf("missing required fields: image or prompt")
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

Please analyze this design image and provide a detailed description that includes:
1. Visual layout and structure (what elements are present, how they're arranged)
2. Colors, typography, and spacing used
3. Interactive elements (buttons, inputs, etc.)
4. Any animations or transitions visible
5. Responsive design considerations

Be specific and detailed so a developer can implement this accurately.`, ctx.String(), ctx.Styling, userPrompt)

	// Call Claude Vision API
	client := ai.NewClient(apiKey)
	visualAnalysis, err := client.GenerateFromImage(imageBase64, visionPrompt)
	if err != nil {
		return fmt.Errorf("vision analysis failed: %w", err)
	}

	if s.verbose {
		fmt.Printf("[Proxy] ✓ Vision analysis completed (%d bytes)\n", len(visualAnalysis))
	}

	// Format as a message for Claude Code
	instruction := fmt.Sprintf("%s\n\nDesign Analysis:\n%s", userPrompt, visualAnalysis)

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
Please analyze the codebase and apply these visual changes appropriately:

**Project Context:**
- Framework: %s
- Styling: %s

**Instructions:**

FOR REORDER OPERATIONS:
1. Identify the parent container and how children are rendered
2. Determine the reordering strategy based on the code structure:
   - If children are rendered from an array (Array.map, v-for, etc.): Reorder the data array
   - If children are static JSX/template elements: Reorder the elements in the source code
   - If using flexbox/grid: Consider using CSS 'order' property as an alternative
3. Update the appropriate file:
   - For React: Reorder JSX elements or update state/data array
   - For Vue: Reorder template elements or update reactive data
   - For Svelte: Reorder template or update reactive statements
   - For Angular: Reorder template or update component array
4. Ensure list keys are properly maintained if using arrays
5. Preserve all props, attributes, and event handlers during reordering

FOR TRANSFORM/RESIZE OPERATIONS:
1. Identify where elements are defined in the code
2. Apply position/size changes using the project's styling approach:
   - If using Tailwind CSS: Update className with utility classes (absolute, left-*, top-*, w-*, h-*)
   - If using styled-components/CSS-in-JS: Update styled component definitions
   - If using CSS files: Update the relevant stylesheet
   - If using inline styles: Update the style prop/attribute
3. Consider layout context:
   - For absolute positioning, ensure parent has position: relative
   - Maintain responsive design - don't break mobile layouts
   - Preserve existing animations or transitions

FOR TEXT EDIT OPERATIONS:
1. Locate the element in the source code using the selector
2. Update the text content in the appropriate location:
   - For React: Update the text content inside JSX elements
   - For Vue: Update the text content in template
   - For Svelte: Update the text in the markup
   - For HTML: Update the text content directly
3. Preserve all HTML structure and formatting
4. If text is stored in a variable or prop, update that instead
5. Keep translations intact if using i18n

FOR AI INSTRUCTION OPERATIONS:
1. Read and understand the natural language instruction provided
2. Locate the target element(s) using the selector and area information
3. Apply the requested changes based on the instruction:
   - For style changes: Update CSS, Tailwind classes, or inline styles
   - For content changes: Modify text, add/remove elements as needed
   - For layout changes: Adjust structure, positioning, or flex/grid properties
   - For functionality changes: Update event handlers, props, or logic
4. Use the area bounds and element count as context for the scope of changes
5. Maintain code quality and follow project conventions
6. If instruction is ambiguous, make reasonable assumptions based on context

**General Guidelines:**
- Make changes permanent in the appropriate files
- Keep code clean and maintainable
- Preserve component functionality and state
- Test that the changes work as expected

Apply these changes now.`, ctx.Framework, ctx.Styling))

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
