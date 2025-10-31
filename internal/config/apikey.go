package config

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

var ErrAPIKeyNotFound = errors.New("API key not found")

// Settings represents the structure of .claude/settings.json
type Settings struct {
	Env struct {
		AnthropicAPIKey string `json:"ANTHROPIC_API_KEY"`
	} `json:"env"`
}

// GetAnthropicAPIKey looks up API key in this order:
// 1. .claude/settings.json in project root
// 2. ~/.claude/settings.json in user home directory
func GetAnthropicAPIKey(projectDir string) (string, error) {
	// 1. Try project-level settings
	projectSettings := filepath.Join(projectDir, ".claude", "settings.json")
	if key, err := readAPIKey(projectSettings); err == nil {
		return key, nil
	}

	// 2. Try user-level settings (Mac)
	homeDir, err := os.UserHomeDir()
	if err == nil {
		userSettings := filepath.Join(homeDir, ".claude", "settings.json")
		if key, err := readAPIKey(userSettings); err == nil {
			return key, nil
		}
	}

	return "", ErrAPIKeyNotFound
}

// readAPIKey reads the API key from a settings.json file
func readAPIKey(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}

	var settings Settings
	if err := json.Unmarshal(data, &settings); err != nil {
		return "", err
	}

	if settings.Env.AnthropicAPIKey == "" {
		return "", errors.New("API key empty in settings")
	}

	return settings.Env.AnthropicAPIKey, nil
}

// CreateProjectSettings creates .claude/settings.json with the provided API key
func CreateProjectSettings(projectDir, apiKey string) error {
	claudeDir := filepath.Join(projectDir, ".claude")
	if err := os.MkdirAll(claudeDir, 0755); err != nil {
		return err
	}

	settings := Settings{}
	settings.Env.AnthropicAPIKey = apiKey

	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}

	settingsPath := filepath.Join(claudeDir, "settings.json")
	return os.WriteFile(settingsPath, data, 0644)
}
