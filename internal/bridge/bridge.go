package bridge

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/thetronjohnson/visual-claude/internal/claude"
	"github.com/thetronjohnson/visual-claude/internal/status"
	"github.com/thetronjohnson/visual-claude/internal/tui"
)

// ElementInfo represents information about a selected HTML element
type ElementInfo struct {
	TagName    string `json:"tagName"`
	ID         string `json:"id"`
	Classes    string `json:"classes"`
	Selector   string `json:"selector"`
	InnerText  string `json:"innerText"`
	OuterHTML  string `json:"outerHTML"`
}

// AreaInfo represents information about a selected area containing multiple elements
type AreaInfo struct {
	X            int           `json:"x"`
	Y            int           `json:"y"`
	Width        int           `json:"width"`
	Height       int           `json:"height"`
	ElementCount int           `json:"elementCount"`
	Elements     []ElementInfo `json:"elements"`
}

// Message represents a message from the browser to Claude Code
type Message struct {
	Area        AreaInfo `json:"area"`
	Instruction string   `json:"instruction"`
	Screenshot  string   `json:"screenshot"` // Base64 encoded image
}

// Bridge coordinates messages between the browser and Claude Code
type Bridge struct {
	claudeManager *claude.Manager
	verbose       bool
	display       *status.Display
	program       *tea.Program
}

// NewBridge creates a new bridge
func NewBridge(claudeManager *claude.Manager, verbose bool, display *status.Display) *Bridge {
	return &Bridge{
		claudeManager: claudeManager,
		verbose:       verbose,
		display:       display,
	}
}

// SetProgram sets the TUI program for sending messages
func (b *Bridge) SetProgram(p *tea.Program) {
	b.program = p
}

// HandleMessage processes a message from the browser and sends it to Claude Code
func (b *Bridge) HandleMessage(msg Message) error {
	// Format the message for Claude Code
	formattedMsg := b.formatMessage(msg)

	// Notify TUI that an instruction was received
	if b.program != nil {
		areaInfo := fmt.Sprintf("%dx%d px · %d elements",
			msg.Area.Width, msg.Area.Height, msg.Area.ElementCount)
		b.program.Send(tui.InstructionMsg{
			Instruction: msg.Instruction,
			AreaInfo:    areaInfo,
		})
	}

	// Send to Claude Code
	if err := b.claudeManager.SendMessage(formattedMsg); err != nil {
		return fmt.Errorf("failed to send message to Claude Code: %w", err)
	}

	return nil
}

// formatMessage formats a browser message for Claude Code
func (b *Bridge) formatMessage(msg Message) string {
	// Format message for Claude Code CLI
	// Single-line format keeps the message compact and readable

	var parts []string

	// Start with the instruction
	parts = append(parts, msg.Instruction)

	// Add area context inline
	parts = append(parts, fmt.Sprintf("(Selected %d elements in %dx%d area:",
		msg.Area.ElementCount, msg.Area.Width, msg.Area.Height))

	// Include ALL elements with full details (not just first 3)
	for i, el := range msg.Area.Elements {
		// Build element descriptor with full information
		var elementDesc strings.Builder
		elementDesc.WriteString("[")

		// Selector (e.g., "div#card-1.card.featured")
		elementDesc.WriteString(el.Selector)

		// Inner text (first 50 chars to keep message manageable)
		if el.InnerText != "" {
			innerText := strings.ReplaceAll(el.InnerText, "\n", " ")
			innerText = strings.TrimSpace(innerText)
			if len(innerText) > 50 {
				innerText = innerText[:50] + "..."
			}
			elementDesc.WriteString(fmt.Sprintf(" text:\"%s\"", innerText))
		}

		// Compact HTML (first 100 chars)
		if el.OuterHTML != "" {
			html := strings.ReplaceAll(el.OuterHTML, "\n", " ")
			html = strings.TrimSpace(html)
			if len(html) > 100 {
				html = html[:100] + "..."
			}
			elementDesc.WriteString(fmt.Sprintf(" html:%s", html))
		}

		elementDesc.WriteString("]")

		parts = append(parts, elementDesc.String())

		// Limit total elements to 20 to keep message size reasonable
		if i >= 19 && len(msg.Area.Elements) > 20 {
			parts = append(parts, fmt.Sprintf("[+%d more elements]", len(msg.Area.Elements)-20))
			break
		}
	}

	parts = append(parts, ")")

	// Join all parts with spaces - single line, no newlines
	return strings.Join(parts, " ")
}
