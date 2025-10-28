package config

import (
	"flag"
	"fmt"
	"os"
)

// Config holds the application configuration
type Config struct {
	ProxyPort       int
	TargetPort      int
	ProjectDir      string
	ClaudeCodePath  string
	AutoDetectPort  bool
	Verbose         bool
}

// ParseFlags parses command line flags and returns the configuration
func ParseFlags() (*Config, error) {
	config := &Config{}

	flag.IntVar(&config.ProxyPort, "proxy-port", 9999, "Port for the proxy server")
	flag.IntVar(&config.TargetPort, "target-port", 0, "Target dev server port (0 = auto-detect)")
	flag.StringVar(&config.ProjectDir, "dir", ".", "Project directory")
	flag.StringVar(&config.ClaudeCodePath, "claude-path", "claude", "Path to Claude Code binary")
	flag.BoolVar(&config.Verbose, "verbose", false, "Enable verbose logging")

	flag.Parse()

	// Auto-detect if target port is not specified
	config.AutoDetectPort = config.TargetPort == 0

	// Validate project directory
	if _, err := os.Stat(config.ProjectDir); os.IsNotExist(err) {
		return nil, fmt.Errorf("project directory does not exist: %s", config.ProjectDir)
	}

	return config, nil
}
