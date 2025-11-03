#!/bin/bash
set -e

# Layrr Installer Script
# Usage: curl -fsSL https://layrr.dev/install.sh | bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}┌──────────────────────────────────────┐${NC}"
echo -e "${BLUE}│                                      │${NC}"
echo -e "${BLUE}│  ${GREEN}LAYRR${BLUE} - Visual Editor for Claude  │${NC}"
echo -e "${BLUE}│                                      │${NC}"
echo -e "${BLUE}└──────────────────────────────────────┘${NC}"
echo ""

# Detect OS
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
if [ "$OS" != "darwin" ]; then
  echo -e "${RED}✗ Error: This installer only supports macOS${NC}"
  exit 1
fi

# Check for Go
if ! command -v go >/dev/null 2>&1; then
  echo -e "${RED}✗ Go is not installed${NC}"
  echo -e "  Install Go from: ${BLUE}https://go.dev/doc/install${NC}"
  exit 1
fi

GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
echo -e "${BLUE}ℹ Detected: macOS with Go $GO_VERSION${NC}"
echo ""

# Create temp directory
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

# Clone repository
echo -e "${YELLOW}→ Cloning layrr repository...${NC}"
if ! git clone --quiet https://github.com/thetronjohnson/layrr.git "$TMP_DIR/layrr" 2>/dev/null; then
  echo -e "${RED}✗ Failed to clone repository${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Cloned${NC}"

# Build
echo -e "${YELLOW}→ Building layrr...${NC}"
cd "$TMP_DIR/layrr"
if ! make build >/dev/null 2>&1; then
  echo -e "${RED}✗ Build failed${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Built${NC}"

# Install
echo -e "${YELLOW}→ Installing to /usr/local/bin/layrr...${NC}"
if [ -w "/usr/local/bin" ]; then
  mv build/layrr /usr/local/bin/
  chmod +x /usr/local/bin/layrr
else
  sudo mv build/layrr /usr/local/bin/
  sudo chmod +x /usr/local/bin/layrr
fi
echo -e "${GREEN}✓ Installed${NC}"
echo ""

# Verify installation
if command -v layrr >/dev/null 2>&1; then
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}✓ Layrr installed successfully!${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "${BLUE}Quick Start:${NC}"
  echo -e "  1. Start your dev server (e.g., npm run dev)"
  echo -e "  2. Run: ${GREEN}layrr${NC}"
  echo -e "  3. Open: ${BLUE}http://localhost:9999${NC}"
  echo ""
  echo -e "${YELLOW}Note:${NC} Layrr requires Claude Code to be installed"
  echo -e "      Get it from: ${BLUE}https://docs.claude.com/claude-code${NC}"
  echo ""
else
  echo -e "${RED}✗ Installation verification failed${NC}"
  echo -e "  Please ensure /usr/local/bin is in your PATH"
  exit 1
fi
