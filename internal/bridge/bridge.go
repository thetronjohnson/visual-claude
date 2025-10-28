package bridge

import (
	"fmt"
	"strings"

	"github.com/thetronjohnson/visual-claude/internal/pty"
	"github.com/thetronjohnson/visual-claude/internal/status"
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
	ptyManager *pty.Manager
	verbose    bool
	display    *status.Display
}

// NewBridge creates a new bridge
func NewBridge(ptyManager *pty.Manager, verbose bool, display *status.Display) *Bridge {
	return &Bridge{
		ptyManager: ptyManager,
		verbose:    verbose,
		display:    display,
	}
}

// HandleMessage processes a message from the browser and sends it to Claude Code
func (b *Bridge) HandleMessage(msg Message) error {
	// Format the message for Claude Code
	formattedMsg := b.formatMessage(msg)

	// Send to Claude Code
	if err := b.ptyManager.SendMessage(formattedMsg); err != nil {
		return fmt.Errorf("failed to send message to Claude Code: %w", err)
	}

	return nil
}

// formatMessage formats a browser message for Claude Code
func (b *Bridge) formatMessage(msg Message) string {
	// Create a single-line message (no embedded newlines)
	// This allows submission with a single Enter press
	// Multiline messages would require Shift+Enter which can't be simulated via PTY

	var parts []string

	// Start with the instruction
	parts = append(parts, msg.Instruction)

	// Add area context inline
	parts = append(parts, fmt.Sprintf("(Selected area: %dx%d pixels with %d elements:",
		msg.Area.Width, msg.Area.Height, msg.Area.ElementCount))

	// Add first few elements inline
	elementLimit := 3
	if len(msg.Area.Elements) < elementLimit {
		elementLimit = len(msg.Area.Elements)
	}

	for i := 0; i < elementLimit; i++ {
		el := msg.Area.Elements[i]
		elementDesc := fmt.Sprintf("<%s>", el.TagName)
		if el.ID != "" {
			elementDesc += fmt.Sprintf("#%s", el.ID)
		}
		if el.Classes != "" {
			// Just show first class
			classes := strings.Split(el.Classes, " ")
			if len(classes) > 0 {
				elementDesc += fmt.Sprintf(".%s", classes[0])
			}
		}
		parts = append(parts, elementDesc)
	}

	if len(msg.Area.Elements) > elementLimit {
		parts = append(parts, fmt.Sprintf("+%d more", len(msg.Area.Elements)-elementLimit))
	}

	parts = append(parts, ")")

	// Join all parts with spaces - single line, no newlines
	return strings.Join(parts, " ")
}
