package claude

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"sync"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/thetronjohnson/visual-claude/internal/tui"
)

// Manager manages Claude Code execution using --print mode
type Manager struct {
	claudePath string
	projectDir string
	mu         sync.Mutex
	verbose    bool
	program    *tea.Program // Bubble Tea program for sending events
}

// NewManager creates a new manager for Claude Code
func NewManager(projectDir, claudePath string, verbose bool) (*Manager, error) {
	return &Manager{
		claudePath: claudePath,
		projectDir: projectDir,
		verbose:    verbose,
	}, nil
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
		_ = m.handleStreamLine(scanner.Text()) // Silently skip unparseable lines
	}

	// Wait for command to complete
	waitErr := cmd.Wait()

	// Always notify TUI that processing is done (success or error)
	if m.program != nil {
		if waitErr != nil {
			// Send error event if command failed
			m.program.Send(tui.StreamEvent{
				Type:    "error",
				Content: fmt.Sprintf("Exit code: %v", waitErr),
			})
		} else {
			// Send completion event if command succeeded
			m.program.Send(tui.StreamEvent{Type: "complete"})
		}
	}

	// Return error if there was one
	if waitErr != nil {
		return fmt.Errorf("Claude Code execution failed: %w", waitErr)
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

	// Require TUI program to be set (fail fast)
	if m.program == nil {
		return fmt.Errorf("TUI program not initialized")
	}

	// Build stream event
	streamEvent := tui.StreamEvent{
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
	case "tool_result":
		// Extract result content if available
		if result, ok := event["content"].(string); ok {
			streamEvent.Content = result
		}
	case "error":
		if errMsg, ok := event["error"].(string); ok {
			streamEvent.Content = errMsg
		}
	}

	// Send to TUI
	m.program.Send(streamEvent)
	return nil
}
