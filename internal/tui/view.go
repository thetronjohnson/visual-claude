package tui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// Color palette - Modern vibrant theme
var (
	primaryColor    = lipgloss.Color("#8b5cf6") // Purple
	secondaryColor  = lipgloss.Color("#06b6d4") // Cyan
	successColor    = lipgloss.Color("#10b981") // Emerald green
	errorColor      = lipgloss.Color("#f43f5e") // Rose red
	warningColor    = lipgloss.Color("#f59e0b") // Amber
	accentColor     = lipgloss.Color("#ec4899") // Pink
	mutedColor      = lipgloss.Color("#94a3b8") // Slate gray
	dimColor        = lipgloss.Color("#64748b") // Dim slate
	brightColor     = lipgloss.Color("#f1f5f9") // Almost white
	backgroundColor = lipgloss.Color("#0f172a") // Dark navy
)

// Styles
var (
	titleStyle = lipgloss.NewStyle().
			Foreground(primaryColor).
			Bold(true).
			Background(lipgloss.Color("#1e293b")).
			Padding(0, 2).
			MarginBottom(1)

	headerStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(primaryColor).
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
			Foreground(secondaryColor).
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
║   ██╗   ██╗██╗███████╗██╗   ██╗ █████╗ ██╗              ║
║   ██║   ██║██║██╔════╝██║   ██║██╔══██╗██║              ║
║   ██║   ██║██║███████╗██║   ██║███████║██║              ║
║   ╚██╗ ██╔╝██║╚════██║██║   ██║██╔══██║██║              ║
║    ╚████╔╝ ██║███████║╚██████╔╝██║  ██║███████╗         ║
║     ╚═══╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝         ║
║                                                          ║
║    ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗     ║
║   ██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝     ║
║   ██║     ██║     ███████║██║   ██║██║  ██║█████╗       ║
║   ██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝       ║
║   ╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗     ║
║    ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝     ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝`

	// Apply gradient-like colors to the ASCII art
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
					Foreground(primaryColor).
					Render("◆ ") +
					dividerStyle.Render(strings.Repeat("─", 54)) +
					lipgloss.NewStyle().
					Foreground(primaryColor).
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
