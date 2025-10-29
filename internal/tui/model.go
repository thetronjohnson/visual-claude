package tui

import (
	"fmt"
	"time"

	tea "github.com/charmbracelet/bubbletea"
)

// Event types that can be added to the TUI
type EventType string

const (
	EventInstruction EventType = "instruction"
	EventContent     EventType = "content"
	EventToolUse     EventType = "tool_use"
	EventToolResult  EventType = "tool_result"
	EventError       EventType = "error"
	EventComplete    EventType = "complete"
)

// Event represents a streaming event from Claude Code
type Event struct {
	Type    EventType
	Content string
	Data    map[string]interface{}
}

// Model is the Bubble Tea model for the TUI
type Model struct {
	instruction   string
	areaInfo      string
	events        []Event
	status        string // "waiting", "processing", "complete", "error"
	startTime     time.Time
	duration      time.Duration
	width         int
	height        int
	completionAck chan<- struct{} // Channel to signal completion to Bridge
}

// NewModel creates a new TUI model
func NewModel() Model {
	return Model{
		status: "waiting",
		events: []Event{},
		width:  80,
		height: 24,
	}
}

// Init initializes the TUI
func (m Model) Init() tea.Cmd {
	return nil
}

// Update handles messages and updates the model
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		return m, nil

	case tea.KeyMsg:
		// Ctrl+C to quit
		if msg.Type == tea.KeyCtrlC {
			return m, tea.Quit
		}

	case InstructionMsg:
		// Add separator if there are existing events (for history)
		if len(m.events) > 0 {
			m.events = append(m.events, Event{
				Type:    "separator",
				Content: "---",
			})
		}

		m.instruction = msg.Instruction
		m.areaInfo = msg.AreaInfo
		m.status = "processing"
		m.startTime = time.Now()
		m.completionAck = msg.CompletionAck // Store completion channel

		// Append new instruction instead of replacing
		m.events = append(m.events, Event{
			Type:    EventInstruction,
			Content: msg.Instruction,
		})
		return m, nil

	case StreamEventMsg:
		m.events = append(m.events, Event{
			Type:    msg.EventType,
			Content: msg.Content,
			Data:    msg.Data,
		})
		return m, nil

	case CompleteMsg:
		m.status = "complete"
		m.duration = time.Since(m.startTime)
		m.events = append(m.events, Event{
			Type: EventComplete,
		})
		return m, nil

	case ErrorMsg:
		m.status = "error"
		m.duration = time.Since(m.startTime)
		m.events = append(m.events, Event{
			Type:    EventError,
			Content: msg.Error,
		})
		return m, nil

	// Handle StreamEvent from manager
	case StreamEvent:
		eventType := EventType(msg.Type)
		m.events = append(m.events, Event{
			Type:    eventType,
			Content: msg.Content,
			Data:    msg.Data,
		})

		// Update status if this is a completion or error event
		if eventType == EventComplete {
			m.status = "complete"
			m.duration = time.Since(m.startTime)
			// Signal completion to Bridge
			if m.completionAck != nil {
				close(m.completionAck)
				m.completionAck = nil
			}
		} else if eventType == EventError {
			m.status = "error"
			m.duration = time.Since(m.startTime)
			// Signal completion to Bridge
			if m.completionAck != nil {
				close(m.completionAck)
				m.completionAck = nil
			}
		}

		return m, nil
	}

	return m, nil
}

// StreamEvent is sent from the manager when parsing streaming output
type StreamEvent struct {
	Type    string
	Content string
	Data    map[string]interface{}
}

// Messages that can be sent to the TUI

// InstructionMsg is sent when a new instruction is received from the browser
type InstructionMsg struct {
	Instruction   string
	AreaInfo      string
	CompletionAck chan<- struct{} // Channel to signal when processing is complete
}

// StreamEventMsg is sent for each streaming event from Claude Code
type StreamEventMsg struct {
	EventType EventType
	Content   string
	Data      map[string]interface{}
}

// CompleteMsg is sent when Claude Code finishes successfully
type CompleteMsg struct{}

// ErrorMsg is sent when an error occurs
type ErrorMsg struct {
	Error string
}

// Helper to send instruction
func SendInstruction(instruction, areaInfo string) tea.Cmd {
	return func() tea.Msg {
		return InstructionMsg{
			Instruction: instruction,
			AreaInfo:    areaInfo,
		}
	}
}

// Helper to send stream event
func SendStreamEvent(eventType EventType, content string, data map[string]interface{}) tea.Cmd {
	return func() tea.Msg {
		return StreamEventMsg{
			EventType: eventType,
			Content:   content,
			Data:      data,
		}
	}
}

// Helper to send complete
func SendComplete() tea.Cmd {
	return func() tea.Msg {
		return CompleteMsg{}
	}
}

// Helper to send error
func SendError(err error) tea.Cmd {
	return func() tea.Msg {
		return ErrorMsg{
			Error: fmt.Sprintf("%v", err),
		}
	}
}
