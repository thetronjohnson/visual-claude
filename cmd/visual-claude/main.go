package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/thetronjohnson/visual-claude/internal/bridge"
	"github.com/thetronjohnson/visual-claude/internal/claude"
	"github.com/thetronjohnson/visual-claude/internal/config"
	"github.com/thetronjohnson/visual-claude/internal/proxy"
	"github.com/thetronjohnson/visual-claude/internal/status"
	"github.com/thetronjohnson/visual-claude/internal/tui"
	"github.com/thetronjohnson/visual-claude/internal/watcher"
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
	server := proxy.NewServer(cfg.ProxyPort, cfg.TargetPort, bridgeInstance, watcherInstance, cfg.Verbose)

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

// openBrowser opens the default browser on macOS
func openBrowser(url string) {
	cmd := exec.Command("open", url)
	if err := cmd.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to open browser: %v\n", err)
		fmt.Printf("Please manually open: %s\n", url)
	}
}
