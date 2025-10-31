package analyzer

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ProjectContext contains information about the project's framework and styling approach
type ProjectContext struct {
	Framework  string // "react", "vue", "svelte", "html"
	Styling    string // "tailwind", "css-modules", "styled-components", "emotion", "css"
	TypeScript bool
}

// AnalyzeProject detects the project's framework and styling approach
func AnalyzeProject(projectDir string) (*ProjectContext, error) {
	ctx := &ProjectContext{
		Framework:  "html",
		Styling:    "css",
		TypeScript: false,
	}

	// Read package.json
	pkgPath := filepath.Join(projectDir, "package.json")
	data, err := os.ReadFile(pkgPath)
	if err != nil {
		// No package.json = plain HTML project
		return ctx, nil
	}

	var pkg struct {
		Dependencies    map[string]string `json:"dependencies"`
		DevDependencies map[string]string `json:"devDependencies"`
	}

	if err := json.Unmarshal(data, &pkg); err != nil {
		// Invalid package.json, return defaults
		return ctx, nil
	}

	// Combine all dependencies
	allDeps := make(map[string]bool)
	for k := range pkg.Dependencies {
		allDeps[k] = true
	}
	for k := range pkg.DevDependencies {
		allDeps[k] = true
	}

	// Detect framework
	if allDeps["react"] || allDeps["react-dom"] {
		ctx.Framework = "react"
	} else if allDeps["vue"] {
		ctx.Framework = "vue"
	} else if allDeps["svelte"] {
		ctx.Framework = "svelte"
	} else if allDeps["@angular/core"] {
		ctx.Framework = "angular"
	}

	// Detect styling approach
	if allDeps["tailwindcss"] {
		ctx.Styling = "tailwind"
	} else if allDeps["styled-components"] {
		ctx.Styling = "styled-components"
	} else if allDeps["@emotion/react"] || allDeps["@emotion/styled"] {
		ctx.Styling = "emotion"
	} else if hasFileWithSuffix(projectDir, ".module.css") || hasFileWithSuffix(projectDir, ".module.scss") {
		ctx.Styling = "css-modules"
	}

	// Detect TypeScript
	ctx.TypeScript = allDeps["typescript"] ||
		hasFileWithSuffix(projectDir, ".tsx") ||
		hasFileWithSuffix(projectDir, ".ts")

	return ctx, nil
}

// hasFileWithSuffix checks if the project has any file with the given suffix
func hasFileWithSuffix(projectDir, suffix string) bool {
	found := false

	// Walk the project directory (limit depth to avoid node_modules)
	filepath.Walk(projectDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}

		// Skip common directories
		if info.IsDir() {
			name := info.Name()
			if name == "node_modules" || name == ".git" || name == "dist" ||
				name == "build" || name == ".next" || name == "coverage" {
				return filepath.SkipDir
			}
		}

		// Check if file has the suffix
		if !info.IsDir() && strings.HasSuffix(info.Name(), suffix) {
			found = true
			return filepath.SkipDir // Stop walking once found
		}

		return nil
	})

	return found
}

// GetFileExtension returns the appropriate file extension for the project
func (ctx *ProjectContext) GetFileExtension() string {
	switch ctx.Framework {
	case "react":
		if ctx.TypeScript {
			return ".tsx"
		}
		return ".jsx"
	case "vue":
		return ".vue"
	case "svelte":
		return ".svelte"
	case "angular":
		return ".component.ts"
	default:
		if ctx.TypeScript {
			return ".ts"
		}
		return ".js"
	}
}

// String returns a human-readable description of the project context
func (ctx *ProjectContext) String() string {
	lang := "JavaScript"
	if ctx.TypeScript {
		lang = "TypeScript"
	}
	return fmt.Sprintf("%s + %s (%s)", ctx.Framework, ctx.Styling, lang)
}
