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
	"time"

	"github.com/gorilla/websocket"
	"github.com/kiran/visual-claude/internal/bridge"
	"github.com/kiran/visual-claude/internal/watcher"
)

//go:embed inject.js
var clientScript embed.FS

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

	// Modify responses to inject our script
	proxy.ModifyResponse = func(resp *http.Response) error {
		return InjectScript(resp, "/__visual-claude/inject.js")
	}

	// Set up HTTP handlers
	mux := http.NewServeMux()

	// Serve the injected JavaScript
	mux.HandleFunc("/__visual-claude/inject.js", s.handleInjectScript)

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

// handleInjectScript serves the client-side JavaScript
func (s *Server) handleInjectScript(w http.ResponseWriter, r *http.Request) {
	content, err := clientScript.ReadFile("inject.js")
	if err != nil {
		http.Error(w, "Failed to load script", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/javascript")
	w.Write(content)
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
			if s.verbose {
				fmt.Printf("[Proxy] WebSocket read error: %v\n", err)
			}
			break
		}

		fmt.Fprintf(os.Stderr, "[Proxy] WebSocket message received (%d bytes)\n", len(message))

		// Parse the message
		var msg bridge.Message
		if err := json.Unmarshal(message, &msg); err != nil {
			fmt.Fprintf(os.Stderr, "[Proxy] ✗ Failed to parse JSON: %v\n", err)
			if s.verbose {
				fmt.Printf("[Proxy] Failed to parse message: %v\n", err)
			}
			continue
		}

		fmt.Fprintf(os.Stderr, "[Proxy] ✓ Parsed message - Instruction: \"%s\", Area: %dx%d with %d elements\n",
			msg.Instruction, msg.Area.Width, msg.Area.Height, msg.Area.ElementCount)

		// Handle the message
		if err := s.bridge.HandleMessage(msg); err != nil {
			fmt.Fprintf(os.Stderr, "[Proxy] ✗ Bridge error: %v\n", err)
			if s.verbose {
				fmt.Printf("[Proxy] Failed to handle message: %v\n", err)
			}
		} else {
			fmt.Fprintf(os.Stderr, "[Proxy] ✓ Message forwarded to bridge\n")
		}

		// Send acknowledgment
		conn.WriteJSON(map[string]string{"status": "received"})
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
