# Visual Claude

A visual browser interface for [Claude Code](https://claude.com/claude-code) that lets you select UI elements and send natural language instructions directly to Claude for real-time code changes.

> **Note:** This project is not affiliated with or endorsed by Anthropic.



https://github.com/user-attachments/assets/247f1e25-06d2-4065-8331-bca3e516c34e



## Description

Visual Claude wraps Claude Code with a browser-based UI, enabling you to:
- Drag and select any area of your web application
- Type natural language instructions about what you want to change
- Watch Claude Code make the changes in real-time
- See updates instantly with automatic hot reload

Built with Go, it acts as a reverse proxy between your browser and dev server, injecting a selection interface and streaming Claude Code's output to a beautiful terminal UI.

## Features

- **Drag-to-Select Interface**: Select any UI area by dragging a rectangle
- **Natural Language Instructions**: Tell Claude what to change in plain English
- **Real-time Streaming**: See Claude's thinking and tool usage as it happens
- **Beautiful TUI**: Bubble Tea terminal interface with live status updates
- **Hot Reload**: Automatic browser refresh when files change
- **Framework Agnostic**: Works with any dev server (Vite, webpack, Next.js, etc.)
- **Modern UI**: Glassmorphism effects, smooth animations, and polished interactions

## How to Use

1. **Start your dev server** (e.g., `npm run dev`)
2. **Run Visual Claude:**
   ```bash
   visual-claude
   ```
3. **Select UI elements**: Click the "Select" button in the bottom-right corner
4. **Drag to select**: Drag a rectangle over the UI area you want to modify
5. **Enter instruction**: Type what you want Claude to do (e.g., "Make this button blue with rounded corners")
6. **Send**: Press Enter or click "Send to Claude"
7. **Watch it happen**: See Claude's output in the terminal and changes appear in your browser

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

1. **Proxy Server**: Intercepts HTTP requests to your dev server
2. **Script Injection**: Injects `inject.js` into all HTML responses
3. **Browser Selection**: User drags to select UI elements
4. **WebSocket Message**: Selection + instruction sent to Go server
5. **Claude Execution**: Message formatted and sent to Claude Code CLI
6. **Streaming Output**: JSONL events parsed and displayed in TUI
7. **File Changes**: Claude modifies files
8. **Hot Reload**: File watcher detects changes → WebSocket → Browser reload

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0) - see the [LICENSE](LICENSE) file for details.

The AGPL-3.0 license ensures that:
- You can freely use, modify, and distribute this software
- If you modify and deploy this software on a server, you must make your modified source code available to users
- Any derivative works must also be licensed under AGPL-3.0

## Acknowledgments

Powered by [Claude Code](https://claude.com/claude-code) from Anthropic.
