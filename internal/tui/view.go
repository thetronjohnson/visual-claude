package tui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// Color palette
var (
	primaryColor   = lipgloss.Color("#3b82f6") // Blue
	successColor   = lipgloss.Color("#22c55e") // Green
	errorColor     = lipgloss.Color("#ef4444") // Red
	warningColor   = lipgloss.Color("#f59e0b") // Orange
	mutedColor     = lipgloss.Color("#6b7280") // Gray
	backgroundColor = lipgloss.Color("#1f2937") // Dark gray
)

// Styles
var (
	titleStyle = lipgloss.NewStyle().
			Foreground(primaryColor).
			Bold(true).
			Padding(0, 1)

	headerStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(primaryColor).
			Padding(0, 1).
			MarginBottom(1)

	instructionStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#ffffff")).
				Bold(true)

	areaInfoStyle = lipgloss.NewStyle().
			Foreground(mutedColor)

	contentStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#e5e7eb"))

	toolUseStyle = lipgloss.NewStyle().
			Foreground(warningColor).
			Bold(true)

	toolResultStyle = lipgloss.NewStyle().
			Foreground(successColor)

	errorStyle = lipgloss.NewStyle().
			Foreground(errorColor).
			Bold(true)

	statusProcessingStyle = lipgloss.NewStyle().
				Foreground(primaryColor).
				Bold(true)

	statusCompleteStyle = lipgloss.NewStyle().
				Foreground(successColor).
				Bold(true)

	statusErrorStyle = lipgloss.NewStyle().
				Foreground(errorColor).
				Bold(true)

	dividerStyle = lipgloss.NewStyle().
			Foreground(mutedColor)

	durationStyle = lipgloss.NewStyle().
			Foreground(mutedColor).
			Italic(true)
)

// View renders the TUI
func (m Model) View() string {
	var b strings.Builder

	// Header
	header := titleStyle.Render("📨 Visual Claude - Connected to Browser")
	b.WriteString(headerStyle.Render(header))
	b.WriteString("\n")

	// Instruction
	if m.instruction != "" {
		b.WriteString(instructionStyle.Render("📍 " + m.instruction))
		b.WriteString("\n")
		if m.areaInfo != "" {
			b.WriteString(areaInfoStyle.Render("   " + m.areaInfo))
			b.WriteString("\n")
		}
		b.WriteString("\n")
	}

	// Divider
	divider := strings.Repeat("━", min(m.width, 60))
	b.WriteString(dividerStyle.Render(divider))
	b.WriteString("\n\n")

	// Status
	switch m.status {
	case "waiting":
		statusStyle := lipgloss.NewStyle().Foreground(mutedColor)
		b.WriteString(statusStyle.Render("⏳ Waiting for browser selection..."))
		b.WriteString("\n")
	case "processing":
		b.WriteString(statusProcessingStyle.Render("🤖 Claude is working..."))
		b.WriteString("\n\n")
	case "complete":
		b.WriteString(statusCompleteStyle.Render("✅ Completed"))
		b.WriteString("\n\n")
	case "error":
		b.WriteString(statusErrorStyle.Render("❌ Error"))
		b.WriteString("\n\n")
	}

	// Events
	for _, event := range m.events {
		switch event.Type {
		case EventContent:
			b.WriteString(contentStyle.Render("💬 " + event.Content))
			b.WriteString("\n")

		case EventToolUse:
			toolName := "Tool"
			if name, ok := event.Data["name"].(string); ok {
				toolName = name
			}
			icon := getToolIcon(toolName)
			b.WriteString(toolUseStyle.Render(fmt.Sprintf("%s %s", icon, toolName)))
			b.WriteString("\n")

		case EventToolResult:
			b.WriteString(toolResultStyle.Render("   ✓ Tool completed"))
			b.WriteString("\n")

		case EventError:
			b.WriteString(errorStyle.Render("❌ " + event.Content))
			b.WriteString("\n")
		}
	}

	// Duration (if complete)
	if m.status == "complete" || m.status == "error" {
		b.WriteString("\n")
		b.WriteString(dividerStyle.Render(divider))
		b.WriteString("\n\n")
		b.WriteString(durationStyle.Render(fmt.Sprintf("⏱  Completed in %.1fs", m.duration.Seconds())))
		b.WriteString("\n")
	}

	return b.String()
}

// Helper to get icon for tool
func getToolIcon(toolName string) string {
	switch toolName {
	case "Edit":
		return "✏️"
	case "Bash":
		return "🔧"
	case "Read":
		return "📖"
	case "Write":
		return "📝"
	case "Glob":
		return "🔍"
	case "Grep":
		return "🔎"
	default:
		return "🛠️"
	}
}

// Helper for min
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
