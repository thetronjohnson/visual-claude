package pty

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"sync"

	"github.com/thetronjohnson/visual-claude/internal/status"
	tea "github.com/charmbracelet/bubbletea"
)

// StreamEvent represents an event to send to the TUI
type StreamEvent struct {
	Type    string
	Content string
	Data    map[string]interface{}
}

// Manager manages Claude Code execution using --print mode
type Manager struct {
	claudePath string
	projectDir string
	mu         sync.Mutex
	verbose    bool
	display    *status.Display
	program    *tea.Program // Bubble Tea program for sending events
}

// NewManager creates a new manager for Claude Code
func NewManager(projectDir, claudePath string, verbose bool, display *status.Display) (*Manager, error) {
	manager := &Manager{
		claudePath: claudePath,
		projectDir: projectDir,
		verbose:    verbose,
		display:    display,
	}

	// Verbose logging removed - TUI provides all feedback

	return manager, nil
}

// SetProgram sets the Bubble Tea program for sending UI updates
func (m *Manager) SetProgram(p *tea.Program) {
	m.program = p
}

// SendMessage sends a message to Claude Code using --print mode with streaming JSON output
func (m *Manager) SendMessage(message string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Run Claude Code with streaming JSON output
	// --output-format stream-json: Outputs JSONL (one JSON object per line)
	// --verbose: Required when using stream-json with --print
	// --dangerously-skip-permissions: Skip permission prompts for automation
	cmd := exec.Command(m.claudePath,
		"--print", message,
		"--output-format", "stream-json",
		"--verbose",
		"--dangerously-skip-permissions")
	cmd.Dir = m.projectDir
	cmd.Env = os.Environ()

	// Pipe stdout to read line-by-line JSONL output
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	// Discard stderr to keep terminal clean (only TUI output)
	cmd.Stderr = nil

	// Start the command
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start Claude Code: %w", err)
	}

	// Read and parse JSONL output line by line
	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		line := scanner.Text()
		if err := m.handleStreamLine(line); err != nil {
			// Silently skip unparseable lines (keeps TUI clean)
			if m.verbose {
				fmt.Fprintf(os.Stderr, "[Manager] Warning: failed to parse line: %v\n", err)
			}
		}
	}

	if err := scanner.Err(); err != nil {
		// Only log errors in verbose mode
		if m.verbose {
			fmt.Fprintf(os.Stderr, "[Manager] Error reading output: %v\n", err)
		}
	}

	// Wait for command to complete
	if err := cmd.Wait(); err != nil {
		return fmt.Errorf("Claude Code execution failed: %w", err)
	}

	// Send completion event to TUI
	if m.program != nil {
		m.program.Send(StreamEvent{Type: "complete"})
	}

	return nil
}

// handleStreamLine parses a single line of JSONL output from Claude Code and sends to TUI
func (m *Manager) handleStreamLine(line string) error {
	// Parse the JSON line
	var event map[string]interface{}
	if err := json.Unmarshal([]byte(line), &event); err != nil {
		return fmt.Errorf("failed to parse JSON: %w", err)
	}

	// Extract event type
	eventType, ok := event["type"].(string)
	if !ok {
		return fmt.Errorf("missing or invalid 'type' field")
	}

	// Send event to TUI if program is set
	if m.program != nil {
		streamEvent := StreamEvent{
			Type: eventType,
			Data: event,
		}

		// Extract content for specific event types
		switch eventType {
		case "content":
			if content, ok := event["content"].(string); ok {
				streamEvent.Content = content
			}
		case "tool_use":
			if toolName, ok := event["name"].(string); ok {
				streamEvent.Content = toolName
			}
		case "error":
			if errMsg, ok := event["error"].(string); ok {
				streamEvent.Content = errMsg
			}
		}

		// Send to TUI
		m.program.Send(streamEvent)
	} else {
		// Fallback to console output if no TUI
		switch eventType {
		case "content":
			if content, ok := event["content"].(string); ok {
				fmt.Print(content)
			}
		case "tool_use":
			toolName, _ := event["name"].(string)
			fmt.Fprintf(os.Stderr, "\n🔧 Tool: %s\n", toolName)
		case "tool_result":
			fmt.Fprintf(os.Stderr, "✓ Tool completed\n")
		case "error":
			if errMsg, ok := event["error"].(string); ok {
				fmt.Fprintf(os.Stderr, "❌ Error: %s\n", errMsg)
			}
		}
	}

	return nil
}

// Close cleanup (no-op since we're not keeping a persistent process)
func (m *Manager) Close() error {
	return nil
}
