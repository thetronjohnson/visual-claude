package status

import (
	"fmt"
	"os"
	"strings"
	"sync"
	"time"
)

// Display manages terminal status output
type Display struct {
	spinner     *Spinner
	currentTask string
	startTime   time.Time
	mu          sync.Mutex
}

// Spinner manages animated spinner display
type Spinner struct {
	frames   []string
	current  int
	active   bool
	message  string
	stopChan chan bool
	mu       sync.Mutex
}

// NewDisplay creates a new status display
func NewDisplay() *Display {
	return &Display{
		spinner: &Spinner{
			frames:   []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"},
			stopChan: make(chan bool),
		},
	}
}

// PrintDivider prints a divider line
func (d *Display) PrintDivider() {
	fmt.Fprintln(os.Stderr, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}

// PrintInstructionReceived displays when an instruction is received
func (d *Display) PrintInstructionReceived(element, instruction string) {
	d.mu.Lock()
	defer d.mu.Unlock()

	d.startTime = time.Now()
	d.currentTask = instruction

	fmt.Fprintln(os.Stderr)
	d.PrintDivider()
	fmt.Fprintf(os.Stderr, "📨 [%s] Instruction Received\n", d.timestamp())
	if element != "" {
		fmt.Fprintf(os.Stderr, "   Element: %s\n", element)
	}
	fmt.Fprintf(os.Stderr, "   Action: %s\n", instruction)
	d.PrintDivider()
	fmt.Fprintln(os.Stderr)
	os.Stderr.Sync() // Force flush output buffer
}

// PrintSentToClaude displays when message is sent to Claude
func (d *Display) PrintSentToClaude() {
	d.mu.Lock()
	defer d.mu.Unlock()

	fmt.Fprintf(os.Stderr, "⚡ Sent to Claude Code\n\n")
	os.Stderr.Sync() // Force flush output buffer
}

// StartSpinner starts the animated spinner
func (d *Display) StartSpinner(message string) {
	d.spinner.Start(message)
}

// StopSpinner stops the animated spinner
func (d *Display) StopSpinner() {
	d.spinner.Stop()
}

// PrintCompleted displays completion status with timing and files
func (d *Display) PrintCompleted(files []string) {
	d.mu.Lock()
	defer d.mu.Unlock()

	duration := time.Since(d.startTime)

	fmt.Fprintln(os.Stderr)
	d.PrintDivider()
	fmt.Fprintf(os.Stderr, "✅ [%s] Completed in %.1f seconds\n", d.timestamp(), duration.Seconds())

	if len(files) > 0 {
		fmt.Fprintf(os.Stderr, "📝 Files Modified:\n")
		for _, file := range files {
			fmt.Fprintf(os.Stderr, "   • %s\n", file)
		}
	}
	os.Stderr.Sync() // Force flush output buffer
}

// PrintError displays error status
func (d *Display) PrintError(err error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	fmt.Fprintln(os.Stderr)
	d.PrintDivider()
	fmt.Fprintf(os.Stderr, "❌ [%s] Error: %v\n", d.timestamp(), err)
	d.PrintDivider()
	fmt.Fprintln(os.Stderr)
	os.Stderr.Sync() // Force flush output buffer
}

// PrintBrowserReload displays browser reload notification
func (d *Display) PrintBrowserReload(clientCount int) {
	d.mu.Lock()
	defer d.mu.Unlock()

	fmt.Fprintf(os.Stderr, "🔁 Browser reloaded (%d client)\n", clientCount)
	d.PrintDivider()
	fmt.Fprintln(os.Stderr)
	os.Stderr.Sync() // Force flush output buffer
}

// timestamp returns formatted timestamp
func (d *Display) timestamp() string {
	return time.Now().Format("15:04:05")
}

// Start starts the spinner animation
func (s *Spinner) Start(message string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.active {
		return
	}

	s.active = true
	s.message = message
	s.current = 0

	go s.animate()
}

// Stop stops the spinner animation
func (s *Spinner) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.active {
		return
	}

	s.active = false
	s.stopChan <- true

	// Clear the spinner line and add newline
	fmt.Fprint(os.Stderr, "\r\033[K\n")
	os.Stderr.Sync() // Force flush output buffer
}

// animate runs the spinner animation loop
func (s *Spinner) animate() {
	ticker := time.NewTicker(80 * time.Millisecond)
	defer ticker.Stop()

	startTime := time.Now()

	for {
		select {
		case <-s.stopChan:
			return
		case <-ticker.C:
			s.mu.Lock()
			if !s.active {
				s.mu.Unlock()
				return
			}

			elapsed := time.Since(startTime).Seconds()
			frame := s.frames[s.current%len(s.frames)]

			// Clear line and print spinner
			fmt.Fprintf(os.Stderr, "\r\033[K%s %s (%.0fs)", frame, s.message, elapsed)
			os.Stderr.Sync() // Force flush spinner output

			s.current++
			s.mu.Unlock()
		}
	}
}

// PrintClaudeOutput prints Claude Code's raw output with prefix
func (d *Display) PrintClaudeOutput(line string) {
	// Don't lock for raw output to avoid blocking
	// Just print directly with a subtle prefix
	if strings.TrimSpace(line) != "" {
		fmt.Print(line)
	}
}
