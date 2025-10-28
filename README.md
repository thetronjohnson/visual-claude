# Visual Claude

A Go-based wrapper around [Claude Code](https://claude.com/claude-code) that provides a visual browser interface for selecting elements and sending instructions directly to Claude Code.

## Features

- **Visual Element Selection**: Click any element on your web page to select it
- **Minimal UI**: Clean, unobtrusive interface with a simple popup for instructions
- **Screenshot Capture**: Automatically captures context around selected elements
- **Live Reload**: File changes are automatically reflected in the browser via WebSocket
- **Dev Server Integration**: Proxies your existing Vue/React dev server (Vite, webpack, etc.)
- **Pseudo Terminal Communication**: Messages are sent directly to Claude Code via PTY
- **Visual Status Indicators**: Real-time terminal display showing:
  - Instruction prompts received from browser
  - Animated spinner while Claude is processing
  - Completion status with timing
  - Files modified by Claude
  - Browser reload notifications
  - Full Claude Code output (both parsed and raw)

## How It Works

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Browser   │◄────►│ Proxy Server │◄────►│  Dev Server │
│  (Port 9999)│      │   (Go)       │      │ (Port 3000) │
└─────────────┘      └──────────────┘      └─────────────┘
       │                     │
       │ WebSocket           │ PTY
       │                     │
       ▼                     ▼
┌─────────────┐      ┌──────────────┐
│   Inject.js │      │  Claude Code │
│  (Element   │      │    (PTY)     │
│  Selection) │      │              │
└─────────────┘      └──────────────┘
```

1. Visual Claude starts a proxy server on port 9999
2. The proxy forwards requests to your dev server
3. JavaScript is injected into all HTML responses
4. You click elements and send instructions via the browser UI
5. Messages are formatted and sent to Claude Code via pseudo terminal
6. Claude Code makes changes to your files
7. File watcher detects changes and triggers browser reload

## Installation

### Prerequisites

- Go 1.21 or higher
- [Claude Code](https://docs.claude.com/claude-code) installed and available in PATH
- A running dev server (Vue, React, etc.)

### Build from Source

```bash
# Clone the repository
git clone https://github.com/kiran/visual-claude.git
cd visual-claude

# Build the binary
make build

# Install to /usr/local/bin
make install
```

## Usage

### Basic Usage

Start your dev server first (e.g., `npm run dev`), then run:

```bash
visual-claude
```

This will:
1. Auto-detect your dev server (checks ports 5173, 3000, 8080, 4200, 8000)
2. Start Claude Code in your project directory
3. Start the proxy server on port 9999
4. Open your browser automatically

### With Flags

```bash
# Specify target dev server port
visual-claude -target-port 3000

# Use a different proxy port
visual-claude -proxy-port 8888

# Specify project directory
visual-claude -dir /path/to/project

# Enable verbose logging
visual-claude -verbose
```

### All Available Flags

| Flag | Default | Description |
|------|---------|-------------|
| `-proxy-port` | 9999 | Port for the proxy server |
| `-target-port` | 0 (auto) | Target dev server port |
| `-dir` | . | Project directory |
| `-claude-path` | claude | Path to Claude Code binary |
| `-verbose` | false | Enable verbose logging |

## Using Visual Claude

1. **Enable Selection Mode**: Click the eye icon (👁️) in the bottom-right corner
2. **Select an Element**: Click any element on the page
3. **Enter Instruction**: Type what you want Claude to do (e.g., "Change this button color to blue")
4. **Send to Claude**: Press Enter or click "Send to Claude"
5. **Watch the Terminal**: See real-time status updates with animated spinner
6. **Watch Changes**: Claude Code will make the changes and the browser will auto-reload

### Terminal Status Display

When you send an instruction, the terminal shows:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📨 [14:32:15] Instruction Received
   Element: button.primary-btn
   Action: Change this button color to blue
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚡ Sent to Claude Code

⠹ Processing... (3s)

[Claude Code output appears here in real-time...]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ [14:32:21] Completed in 6 seconds
📝 Files Modified:
   • src/components/Button.vue
🔁 Browser reloaded (1 client)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Example Instructions

- "Change this button's color to blue"
- "Add a hover effect to this element"
- "Make this text larger and bold"
- "Center this div horizontally"
- "Add padding to this section"
- "Change the font family to Inter"

## Supported Frameworks

Visual Claude works with any web framework that runs a local dev server:

- **Vue**: Vite (port 5173)
- **React**: Vite, webpack-dev-server (ports 3000, 5173)
- **Angular**: ng serve (port 4200)
- **Svelte**: Vite (port 5173)
- **Next.js**: (port 3000)
- **Static servers**: Any HTTP server

## Architecture

### Components

- **PTY Manager** (`internal/pty/`): Manages Claude Code pseudo terminal
- **Proxy Server** (`internal/proxy/`): Reverse proxy with HTML injection
- **File Watcher** (`internal/watcher/`): Watches files and triggers reloads
- **Bridge** (`internal/bridge/`): Coordinates browser ↔ Claude Code messages
- **Browser Client** (`internal/proxy/inject.js`): Injected JavaScript for UI

### File Watching

The file watcher monitors these extensions:
- `.vue`, `.jsx`, `.tsx`, `.js`, `.ts`
- `.css`, `.scss`, `.sass`, `.less`
- `.html`

Excluded directories:
- `node_modules`
- `.git`
- `dist`
- `build`
- `.next`

Changes are debounced (300ms) to avoid excessive reloads.

## Development

### Project Structure

```
visual-claude/
├── cmd/visual-claude/          # CLI entry point
│   └── main.go
├── internal/
│   ├── pty/                    # PTY management
│   ├── proxy/                  # Proxy server & injection
│   ├── watcher/                # File watching
│   ├── bridge/                 # Message coordination
│   └── config/                 # Configuration
├── go.mod
├── Makefile
└── README.md
```

### Building

```bash
# Build binary
make build

# Run tests
make test

# Clean build artifacts
make clean

# Install to /usr/local/bin
make install
```

### Dependencies

- [creack/pty](https://github.com/creack/pty) - Pseudo terminal support
- [fsnotify/fsnotify](https://github.com/fsnotify/fsnotify) - File system notifications
- [gorilla/websocket](https://github.com/gorilla/websocket) - WebSocket support

## Limitations

- **macOS only** (currently uses `open` command for browser launching)
- **Web projects only** (requires HTTP server)
- **No Windows/Linux support yet** (coming soon)

## Troubleshooting

### Dev server not detected

```bash
# Start your dev server first
npm run dev

# Then run visual-claude with explicit port
visual-claude -target-port 3000
```

### Claude Code not found

```bash
# Install Claude Code first
# See: https://docs.claude.com/claude-code

# Or specify custom path
visual-claude -claude-path /path/to/claude
```

### Port already in use

```bash
# Use a different proxy port
visual-claude -proxy-port 8888
```

### Changes not reflecting

- Check that file watching is working (use `-verbose` flag)
- Ensure your dev server supports hot reload
- Try manually refreshing the browser

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Credits

Built with Go and powered by [Claude Code](https://claude.com/claude-code) from Anthropic.
