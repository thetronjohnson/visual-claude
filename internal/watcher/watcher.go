package watcher

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/gorilla/websocket"
	"github.com/thetronjohnson/layrr/internal/status"
)

// Watcher watches files for changes and notifies connected WebSocket clients
type Watcher struct {
	fsWatcher *fsnotify.Watcher
	clients   map[*websocket.Conn]bool
	clientsMu sync.RWMutex
	debounce  time.Duration
	timer     *time.Timer
	verbose   bool
	display   *status.Display
}

// NewWatcher creates a new file watcher
func NewWatcher(projectDir string, verbose bool, display *status.Display) (*Watcher, error) {
	fsWatcher, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, fmt.Errorf("failed to create file watcher: %w", err)
	}

	w := &Watcher{
		fsWatcher: fsWatcher,
		clients:   make(map[*websocket.Conn]bool),
		debounce:  300 * time.Millisecond, // 300ms debounce
		verbose:   verbose,
		display:   display,
	}

	// Add the project directory recursively
	if err := w.addDirRecursive(projectDir); err != nil {
		return nil, err
	}

	// Start watching
	go w.watch()

	return w, nil
}

// addDirRecursive adds a directory and all its subdirectories to the watcher
func (w *Watcher) addDirRecursive(dir string) error {
	return filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// Skip node_modules, .git, dist, build directories
		if info != nil {
			name := filepath.Base(path)
			if name == "node_modules" || name == ".git" || name == "dist" || name == "build" || name == ".next" {
				return filepath.SkipDir
			}
		}

		// Add directory to watcher
		if err := w.fsWatcher.Add(path); err != nil {
			if w.verbose {
				fmt.Printf("[Watcher] Failed to watch %s: %v\n", path, err)
			}
		}

		return nil
	})
}

// watch monitors file system events
func (w *Watcher) watch() {
	for {
		select {
		case event, ok := <-w.fsWatcher.Events:
			if !ok {
				return
			}

			// Only watch for write and create events on relevant files
			if event.Op&(fsnotify.Write|fsnotify.Create) != 0 {
				if w.isRelevantFile(event.Name) {
					w.debounceReload()
				}
			}

		case err, ok := <-w.fsWatcher.Errors:
			if !ok {
				return
			}
			if w.verbose {
				fmt.Printf("[Watcher] Error: %v\n", err)
			}
		}
	}
}

// isRelevantFile checks if a file should trigger a reload
func (w *Watcher) isRelevantFile(path string) bool {
	ext := filepath.Ext(path)
	relevantExts := []string{".vue", ".jsx", ".tsx", ".js", ".ts", ".css", ".scss", ".sass", ".less", ".html"}

	for _, relevantExt := range relevantExts {
		if ext == relevantExt {
			return true
		}
	}

	return false
}

// debounceReload debounces reload notifications
func (w *Watcher) debounceReload() {
	if w.timer != nil {
		w.timer.Stop()
	}

	w.timer = time.AfterFunc(w.debounce, func() {
		w.notifyClients()
	})
}

// notifyClients sends a reload message to all connected WebSocket clients
func (w *Watcher) notifyClients() {
	w.clientsMu.RLock()
	defer w.clientsMu.RUnlock()

	// Display is handled by TUI now - no direct printing needed

	if w.verbose {
		fmt.Printf("[Watcher] Notifying %d clients to reload\n", len(w.clients))
	}

	for client := range w.clients {
		err := client.WriteMessage(websocket.TextMessage, []byte(`{"type":"reload"}`))
		if err != nil {
			if w.verbose {
				fmt.Printf("[Watcher] Failed to notify client: %v\n", err)
			}
		}
	}
}

// AddClient adds a WebSocket client to receive reload notifications
func (w *Watcher) AddClient(conn *websocket.Conn) {
	w.clientsMu.Lock()
	defer w.clientsMu.Unlock()

	w.clients[conn] = true

	if w.verbose {
		fmt.Printf("[Watcher] Client connected (total: %d)\n", len(w.clients))
	}
}

// RemoveClient removes a WebSocket client
func (w *Watcher) RemoveClient(conn *websocket.Conn) {
	w.clientsMu.Lock()
	defer w.clientsMu.Unlock()

	delete(w.clients, conn)

	if w.verbose {
		fmt.Printf("[Watcher] Client disconnected (total: %d)\n", len(w.clients))
	}
}

// Close closes the watcher
func (w *Watcher) Close() error {
	if w.timer != nil {
		w.timer.Stop()
	}

	return w.fsWatcher.Close()
}
