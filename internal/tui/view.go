package tui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// Color palette - Matching GUI design language
var (
	primaryColor    = lipgloss.Color("#F19E38") // Orange (matching GUI edit mode)
	secondaryColor  = lipgloss.Color("#333333") // Dark gray (matching GUI borders)
	successColor    = lipgloss.Color("#22c55e") // Green (matching GUI complete state)
	errorColor      = lipgloss.Color("#ef4444") // Red
	warningColor    = lipgloss.Color("#F19E38") // Orange (same as primary)
	accentColor     = lipgloss.Color("#F19E38") // Orange accent
	mutedColor      = lipgloss.Color("#6b7280") // Gray
	dimColor        = lipgloss.Color("#9ca3af") // Light gray
	brightColor     = lipgloss.Color("#ffffff") // White
	backgroundColor = lipgloss.Color("#1f2937") // Dark background
)

// Styles
var (
	titleStyle = lipgloss.NewStyle().
			Foreground(primaryColor).
			Bold(true).
			Background(secondaryColor).
			Padding(0, 2).
			MarginBottom(1)

	headerStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(secondaryColor).
			Padding(0, 1).
			MarginBottom(1)

	instructionStyle = lipgloss.NewStyle().
				Foreground(accentColor).
				Bold(true)

	areaInfoStyle = lipgloss.NewStyle().
			Foreground(dimColor).
			Italic(true)

	contentStyle = lipgloss.NewStyle().
			Foreground(mutedColor)

	toolUseStyle = lipgloss.NewStyle().
			Foreground(primaryColor).
			Bold(true)

	toolResultStyle = lipgloss.NewStyle().
			Foreground(dimColor).
			Italic(true)

	errorStyle = lipgloss.NewStyle().
			Foreground(errorColor).
			Bold(true)

	statusProcessingStyle = lipgloss.NewStyle().
				Foreground(warningColor).
				Bold(true)

	statusCompleteStyle = lipgloss.NewStyle().
				Foreground(successColor).
				Bold(true)

	statusErrorStyle = lipgloss.NewStyle().
				Foreground(errorColor).
				Bold(true)

	statusWaitingStyle = lipgloss.NewStyle().
				Foreground(dimColor).
				Italic(true)

	dividerStyle = lipgloss.NewStyle().
			Foreground(dimColor)

	durationStyle = lipgloss.NewStyle().
			Foreground(dimColor).
			Italic(true)
)

// View renders the TUI
func (m Model) View() string {
	var b strings.Builder

	// ASCII art header
	asciiArt := `╔══════════════════════════════════════════════════════════╗
║                                                          ║
║         ██╗      █████╗ ██╗   ██╗██████╗ ██████╗        ║
║         ██║     ██╔══██╗╚██╗ ██╔╝██╔══██╗██╔══██╗       ║
║         ██║     ███████║ ╚████╔╝ ██████╔╝██████╔╝       ║
║         ██║     ██╔══██║  ╚██╔╝  ██╔══██╗██╔══██╗       ║
║         ███████╗██║  ██║   ██║   ██║  ██║██║  ██║       ║
║         ╚══════╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝       ║
║                                                          ║
║           Visual Editor for Claude Code                 ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝`

	// Apply orange color to the ASCII art (matching GUI)
	artStyle := lipgloss.NewStyle().
		Foreground(primaryColor).
		Bold(true)

	b.WriteString(artStyle.Render(asciiArt))
	b.WriteString("\n\n")

	// Status
	switch m.status {
	case "waiting":
		b.WriteString(statusWaitingStyle.Render("⏳ Waiting for browser selection..."))
		b.WriteString("\n")
	case "processing", "complete", "error":
		// Status indicator (only if currently processing)
		if m.status == "processing" {
			b.WriteString(statusProcessingStyle.Render("🤖 Claude is working..."))
			b.WriteString("\n\n")
		}

		// Events (display full history including instructions)
		for _, event := range m.events {
			switch event.Type {
			case "separator":
				// Visual separator between instructions with decorative elements
				b.WriteString("\n")
				separator := lipgloss.NewStyle().
					Foreground(secondaryColor).
					Render("◆ ") +
					dividerStyle.Render(strings.Repeat("─", 54)) +
					lipgloss.NewStyle().
					Foreground(secondaryColor).
					Render(" ◆")
				b.WriteString(separator)
				b.WriteString("\n\n")

			case EventInstruction:
				// Show instruction from history
				b.WriteString(instructionStyle.Render("📍 " + event.Content))
				b.WriteString("\n\n")

			case EventContent:
				if strings.TrimSpace(event.Content) != "" {
					b.WriteString(contentStyle.Render("   " + event.Content))
					b.WriteString("\n")
				}

			case EventToolUse:
				// Use Content which has the tool name extracted by manager
				toolName := event.Content
				if toolName == "" {
					// Fallback to Data if Content is empty
					if name, ok := event.Data["name"].(string); ok {
						toolName = name
					} else {
						toolName = "Tool"
					}
				}
				icon := getToolIcon(toolName)
				b.WriteString(toolUseStyle.Render(fmt.Sprintf("   %s %s", icon, toolName)))
				b.WriteString("\n")

			case EventToolResult:
				// Show tool result (usually not displayed unless verbose)
				if event.Content != "" && strings.TrimSpace(event.Content) != "" {
					// Truncate long results
					result := event.Content
					if len(result) > 100 {
						result = result[:100] + "..."
					}
					b.WriteString(toolResultStyle.Render("   → " + result))
					b.WriteString("\n")
				}

			case EventError:
				b.WriteString(errorStyle.Render("   ❌ " + event.Content))
				b.WriteString("\n")

			case EventComplete:
				// Show completion status in history with visual flair
				b.WriteString("\n")
				completionBox := lipgloss.NewStyle().
					Foreground(successColor).
					Bold(true).
					Render("✅ Completed")
				b.WriteString(completionBox)
				b.WriteString("\n")
			}
		}
	}

	return b.String()
}

// Helper to get icon for tool
func getToolIcon(toolName string) string {
	switch toolName {
	case "Edit":
		return "✏️ "
	case "Bash":
		return "⚡"
	case "Read":
		return "📖"
	case "Write":
		return "📝"
	case "Glob":
		return "🔍"
	case "Grep":
		return "🔎"
	case "Task":
		return "🚀"
	case "WebFetch":
		return "🌐"
	case "WebSearch":
		return "🔎"
	default:
		return "🛠️ "
	}
}

// Helper for min
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
