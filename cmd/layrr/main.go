package main

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"syscall"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/thetronjohnson/layrr/internal/bridge"
	"github.com/thetronjohnson/layrr/internal/claude"
	"github.com/thetronjohnson/layrr/internal/config"
	"github.com/thetronjohnson/layrr/internal/proxy"
	"github.com/thetronjohnson/layrr/internal/status"
	"github.com/thetronjohnson/layrr/internal/tui"
	"github.com/thetronjohnson/layrr/internal/watcher"
)

func main() {
	// Parse configuration
	cfg, err := config.ParseFlags()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	// Initialize status display (kept for compatibility, but TUI replaces it)
	statusDisplay := status.NewDisplay()

	// Auto-detect dev server port if not specified
	if cfg.AutoDetectPort {
		detectedPort, err := proxy.DetectDevServer()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			fmt.Fprintf(os.Stderr, "Please start your dev server first or specify the port with -target-port\n")
			os.Exit(1)
		}
		cfg.TargetPort = detectedPort
	}

	// Ensure Anthropic API key is available for design-to-code features
	if err := ensureAPIKey(cfg.ProjectDir); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	// Initialize Bubble Tea TUI with alt screen mode
	tuiModel := tui.NewModel()
	tuiProgram := tea.NewProgram(tuiModel, tea.WithAltScreen())

	// Start Claude Code manager
	claudeManager, err := claude.NewManager(cfg.ProjectDir, cfg.ClaudeCodePath, cfg.Verbose)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error starting Claude Code: %v\n", err)
		os.Exit(1)
	}

	// Connect manager to TUI
	claudeManager.SetProgram(tuiProgram)

	// Create bridge
	bridgeInstance := bridge.NewBridge(claudeManager, cfg.Verbose, statusDisplay)
	bridgeInstance.SetProgram(tuiProgram)

	// Start file watcher
	watcherInstance, err := watcher.NewWatcher(cfg.ProjectDir, cfg.Verbose, statusDisplay)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error starting file watcher: %v\n", err)
		os.Exit(1)
	}
	defer watcherInstance.Close()

	// Create and start proxy server
	server := proxy.NewServer(cfg.ProxyPort, cfg.TargetPort, bridgeInstance, watcherInstance, cfg.Verbose, cfg.ProjectDir)

	// Handle graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-sigChan
		// Create shutdown context with timeout
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		// Shutdown HTTP server gracefully
		server.Shutdown(ctx)

		// Close other resources
		watcherInstance.Close()

		os.Exit(0)
	}()

	// Open browser
	go func() {
		time.Sleep(500 * time.Millisecond) // Wait for server to start
		url := fmt.Sprintf("http://localhost:%d", cfg.ProxyPort)
		openBrowser(url)
	}()

	// Start TUI in a goroutine
	go func() {
		if _, err := tuiProgram.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "TUI error: %v\n", err)
		}
	}()

	// Start server (blocking)
	if err := server.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "Server error: %v\n", err)
		os.Exit(1)
	}
}

// ensureAPIKey checks for Anthropic API key and prompts if not found
func ensureAPIKey(projectDir string) error {
	// Try to find existing API key
	_, err := config.GetAnthropicAPIKey(projectDir)
	if err == nil {
		fmt.Println("✓ Anthropic API key found")
		return nil
	}

	// API key not found, prompt user
	fmt.Println("\n⚠️  Anthropic API key not found")
	fmt.Println("Layrr needs your API key for design-to-code features.")
	fmt.Println("\nYou can find your API key at: https://console.anthropic.com/settings/keys")
	fmt.Print("\nPaste your API key (sk-ant-...): ")

	reader := bufio.NewReader(os.Stdin)
	apiKey, err := reader.ReadString('\n')
	if err != nil {
		return fmt.Errorf("failed to read API key: %w", err)
	}

	apiKey = strings.TrimSpace(apiKey)

	// Validate format
	if !strings.HasPrefix(apiKey, "sk-ant-") {
		return fmt.Errorf("invalid API key format (must start with 'sk-ant-')")
	}

	// Save to project .claude/settings.json
	if err := config.CreateProjectSettings(projectDir, apiKey); err != nil {
		return fmt.Errorf("failed to save API key: %w", err)
	}

	fmt.Println("✓ API key saved to .claude/settings.json")
	fmt.Println("✓ Ready to use design-to-code features!\n")

	return nil
}

// openBrowser opens the default browser on macOS
func openBrowser(url string) {
	cmd := exec.Command("open", url)
	if err := cmd.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to open browser: %v\n", err)
		fmt.Printf("Please manually open: %s\n", url)
	}
}
