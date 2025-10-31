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
	"github.com/thetronjohnson/visual-claude/internal/bridge"
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
}

// NewServer creates a new proxy server
func NewServer(proxyPort, targetPort int, bridge *bridge.Bridge, watcher *watcher.Watcher, verbose bool) *Server {
	return &Server{
		proxyPort:  proxyPort,
		targetPort: targetPort,
		bridge:     bridge,
		watcher:    watcher,
		verbose:    verbose,
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

		// Parse the message
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
