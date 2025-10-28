package pty

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"sync"

	"github.com/kiran/visual-claude/internal/status"
)

// Manager manages Claude Code execution using --print mode
type Manager struct {
	claudePath string
	projectDir string
	mu         sync.Mutex
	verbose    bool
	display    *status.Display
}

// NewManager creates a new manager for Claude Code
func NewManager(projectDir, claudePath string, verbose bool, display *status.Display) (*Manager, error) {
	manager := &Manager{
		claudePath: claudePath,
		projectDir: projectDir,
		verbose:    verbose,
		display:    display,
	}

	if verbose {
		fmt.Fprintf(os.Stderr, "[Manager] Initialized for Claude Code at: %s\n", claudePath)
		fmt.Fprintf(os.Stderr, "[Manager] Project directory: %s\n", projectDir)
	}

	return manager, nil
}

// SendMessage sends a message to Claude Code using --print mode with streaming JSON output
func (m *Manager) SendMessage(message string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	fmt.Fprintf(os.Stderr, "[Manager] SendMessage called\n")
	fmt.Fprintf(os.Stderr, "[Manager] Message (%d bytes): %q\n", len(message), message)

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

	// Connect stderr directly for error messages
	cmd.Stderr = os.Stderr

	fmt.Fprintf(os.Stderr, "[Manager] Starting Claude Code with stream-json output...\n")

	// Start the command
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start Claude Code: %w", err)
	}

	// Read and parse JSONL output line by line
	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		line := scanner.Text()
		if err := m.handleStreamLine(line); err != nil {
			fmt.Fprintf(os.Stderr, "[Manager] Warning: failed to parse line: %v\n", err)
		}
	}

	if err := scanner.Err(); err != nil {
		fmt.Fprintf(os.Stderr, "[Manager] Error reading output: %v\n", err)
	}

	// Wait for command to complete
	if err := cmd.Wait(); err != nil {
		fmt.Fprintf(os.Stderr, "[Manager] ✗ Execution failed: %v\n", err)
		return fmt.Errorf("Claude Code execution failed: %w", err)
	}

	fmt.Fprintf(os.Stderr, "[Manager] ✓ Execution completed successfully\n")
	return nil
}

// handleStreamLine parses and displays a single line of JSONL output from Claude Code
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

	// Handle different event types
	switch eventType {
	case "content":
		// Claude's text response
		if content, ok := event["content"].(string); ok {
			fmt.Print(content)
		}

	case "tool_use":
		// Claude is using a tool (Edit, Bash, etc.)
		toolName, _ := event["name"].(string)
		fmt.Fprintf(os.Stderr, "\n🔧 Tool: %s\n", toolName)

	case "tool_result":
		// Tool execution completed
		fmt.Fprintf(os.Stderr, "✓ Tool completed\n")

	case "error":
		// Error occurred
		if errMsg, ok := event["error"].(string); ok {
			fmt.Fprintf(os.Stderr, "❌ Error: %s\n", errMsg)
		}

	default:
		// Debug: show unknown event types in verbose mode
		if m.verbose {
			fmt.Fprintf(os.Stderr, "[Debug] Event type: %s\n", eventType)
		}
	}

	return nil
}

// Close cleanup (no-op since we're not keeping a persistent process)
func (m *Manager) Close() error {
	if m.verbose {
		fmt.Fprintf(os.Stderr, "[Manager] Close called (no-op in --print mode)\n")
	}
	return nil
}
