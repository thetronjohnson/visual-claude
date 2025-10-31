# Visual Claude

A universal visual editor for [Claude Code](https://claude.com/claude-code) that works like Elementor or Framer but on **any website**. Select, drag, resize, and edit UI elements visually or with natural language instructions - Claude applies changes intelligently to your codebase.

> **Note:** This project is not affiliated with or endorsed by Anthropic.



https://github.com/user-attachments/assets/247f1e25-06d2-4065-8331-bca3e516c34e



## Description

Visual Claude combines visual editing with AI-powered code generation, enabling you to:
- **Visual Edit Mode**: Drag and resize elements with live preview, commit changes through Claude Code
- **Design-to-Code Mode**: Upload design images and let Claude generate production-ready components
- **Text Edit Mode**: Select elements and modify their text content directly in the browser
- **Area Selection Mode**: Select regions and give natural language instructions for changes

Built with Go, it acts as a reverse proxy between your browser and dev server, injecting a powerful editing interface and integrating seamlessly with Claude Code.

## Features

### Visual Editing (NEW!)
- **Drag & Drop**: Click and drag elements to reposition them
- **Resize Handles**: 8-handle resize system (corners + edges) like Figma
- **Live Preview**: See changes in real-time before committing
- **Commit Workflow**: Review and apply/discard visual changes
- **Framework-Native Output**: Claude intelligently updates Tailwind classes, CSS files, or inline styles
- **Scroll/Resize Aware**: Handles follow elements as you scroll or resize the window

### AI-Powered Features
- **Design-to-Code**: Upload design images → Claude generates production-ready components
- **Natural Language Instructions**: Select areas and describe changes in plain English
- **Context-Aware**: Automatically detects your framework (React/Vue/Svelte) and styling (Tailwind/CSS)
- **Real-time Streaming**: See Claude's thinking and tool usage as it happens

### Developer Experience
- **Beautiful TUI**: Bubble Tea terminal interface with live status updates
- **Hot Reload**: Automatic browser refresh when files change
- **Framework Agnostic**: Works with any dev server (Vite, webpack, Next.js, etc.)
- **Modern UI**: Glassmorphism effects, smooth animations, and polished interactions
- **Multiple Edit Modes**: Visual, Text, Design, and Area Selection modes

## How to Use

### Quick Start

1. **Start your dev server** (e.g., `npm run dev`)
2. **Run Visual Claude:**
   ```bash
   visual-claude
   ```
3. **Open your browser** at `http://localhost:9999` (or your configured proxy port)
4. **Choose an editing mode** from the bottom control bar

### Visual Edit Mode 🖱️

1. Click the **cursor icon** in the bottom control bar
2. **Click any element** to select it (purple outline + 9 handles appear)
3. **Drag the center handle** to move the element
4. **Drag corner/edge handles** to resize the element
5. Make multiple changes (counter shows "[X] changes")
6. Click **"Apply Changes"** to commit → Claude intelligently updates your code
7. Or click **"Discard"** to reset

**Keyboard Shortcuts:**
- `Escape` - Deselect element

### Design-to-Code Mode 🎨

1. Click the **image upload icon** in the bottom control bar
2. **Upload a design image** (screenshot, Figma export, etc.)
3. **Add context prompt** (e.g., "Create a pricing card component")
4. **Send to Claude** → Claude analyzes the design and generates code
5. Watch as Claude creates/updates components automatically

### Text Edit Mode ✏️

1. Click the **edit icon** in the bottom control bar
2. **Click any text element** (paragraph, heading, button, etc.)
3. **Edit text inline** using the popup editor
4. Press **Enter** to send changes to Claude
5. Claude updates the code and preserves styling

### Area Selection Mode 🔲

1. Click the **selection icon** in the bottom control bar
2. **Drag a rectangle** over any UI area
3. **Enter natural language instructions** (e.g., "Make this section responsive")
4. **Send to Claude** → Claude analyzes and implements changes

### Available Flags

```bash
visual-claude [options]

Options:
  -proxy-port     Proxy server port (default: 9999)
  -target-port    Dev server port (default: auto-detect)
  -dir           Project directory (default: current directory)
  -claude-path   Path to Claude Code binary (default: "claude")
  -verbose       Enable verbose logging
```

### Example Usage

```bash
# Auto-detect dev server
visual-claude

# Specify dev server port
visual-claude -target-port 3000

# Custom proxy port and project directory
visual-claude -proxy-port 8888 -dir ~/projects/my-app
```

## Installation

### Prerequisites

- **Go 1.21+** - [Install Go](https://go.dev/doc/install)
- **Claude Code** - [Install Claude Code](https://docs.claude.com/claude-code)
- **Running dev server** - Any local web server (Vite, webpack, Next.js, etc.)

### Build from Source

```bash
# Clone the repository
git clone https://github.com/thetronjohnson/visual-claude.git
cd visual-claude

# Build the binary
make build

# Install to /usr/local/bin
make install
```

## Dependencies

Visual Claude uses these Go packages:

- **[gorilla/websocket](https://github.com/gorilla/websocket)** - WebSocket connections for browser communication
- **[fsnotify/fsnotify](https://github.com/fsnotify/fsnotify)** - File system watching for hot reload
- **[charmbracelet/bubbletea](https://github.com/charmbracelet/bubbletea)** - Terminal UI framework
- **[charmbracelet/lipgloss](https://github.com/charmbracelet/lipgloss)** - Terminal styling

## Tech Stack

- **Language**: Go 1.21+
- **Terminal UI**: Bubble Tea + Lipgloss
- **WebSockets**: Gorilla WebSocket
- **File Watching**: fsnotify
- **Browser UI**: Vanilla JavaScript with CSS animations
- **Claude Integration**: Claude Code CLI with `--output-format stream-json`

## Development

### Project Structure

```
visual-claude/
├── cmd/visual-claude/        # CLI entry point
│   └── main.go
├── internal/
│   ├── pty/                  # Claude Code execution & streaming
│   │   └── manager.go
│   ├── proxy/                # Reverse proxy & injection
│   │   ├── server.go
│   │   ├── inject.js         # Browser UI
│   │   └── injector.go
│   ├── watcher/              # File watching
│   │   └── watcher.go
│   ├── bridge/               # Browser ↔ Claude messaging
│   │   └── bridge.go
│   ├── tui/                  # Terminal UI
│   │   ├── model.go
│   │   └── view.go
│   ├── status/               # Status display
│   │   └── display.go
│   └── config/               # Configuration
│       └── config.go
├── go.mod
├── Makefile
└── README.md
```

### Development Commands

```bash
# Build the binary
make build

# Install to /usr/local/bin
make install

# Run tests
make test

# Clean build artifacts
make clean

# Run with verbose output
go run cmd/visual-claude/main.go -verbose

# Build for release
go build -ldflags="-s -w" -o visual-claude cmd/visual-claude/main.go
```

### How It Works

#### Core Architecture
1. **Proxy Server**: Intercepts HTTP requests to your dev server
2. **Script Injection**: Injects `inject.js` + `inject-utils.js` into all HTML responses
3. **WebSocket Channels**: Two-way communication between browser and Go server
4. **File Watching**: Monitors project files for changes
5. **Hot Reload**: Automatic browser refresh when files change

#### Visual Edit Mode Flow
1. User selects element → Purple outline + 9 drag handles appear
2. User drags/resizes element → Inline styles applied for live preview
3. Changes tracked in `pendingChanges` Map (non-destructive)
4. User clicks "Apply Changes" → WebSocket message sent to backend
5. Backend analyzes project context (framework, styling approach)
6. Context-aware prompt sent to Claude Code
7. Claude intelligently updates code (Tailwind classes, CSS files, or inline styles)
8. File watcher detects changes → Browser auto-reloads

#### Design-to-Code Mode Flow
1. User uploads design image + context prompt
2. Image + prompt sent to Claude Code with project context
3. Claude analyzes design using vision capabilities
4. Claude generates production-ready component code
5. Claude determines where to place component in codebase
6. File changes → Auto-reload

#### Text/Area Selection Mode Flow
1. User selects element/area + provides instruction
2. WebSocket message sent with selection details
3. Message formatted and sent to Claude Code CLI
4. JSONL events parsed and displayed in TUI
5. Claude modifies files
6. File watcher detects changes → Browser reloads

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0) - see the [LICENSE](LICENSE) file for details.

The AGPL-3.0 license ensures that:
- You can freely use, modify, and distribute this software
- If you modify and deploy this software on a server, you must make your modified source code available to users
- Any derivative works must also be licensed under AGPL-3.0

## Acknowledgments

Powered by [Claude Code](https://claude.com/claude-code) from Anthropic.
