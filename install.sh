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
echo -e "${BLUE}│         ${GREEN}LAYRR${BLUE} - Visual Editor       │${NC}"
echo -e "${BLUE}│                                      │${NC}"
echo -e "${BLUE}└──────────────────────────────────────┘${NC}"
echo ""

# Detect OS
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
if [ "$OS" != "darwin" ]; then
  echo -e "${RED}✗ Error: This installer only supports macOS${NC}"
  exit 1
fi

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "x86_64" ]; then
  ARCH="amd64"
  ARCH_NAME="Intel"
elif [ "$ARCH" = "arm64" ]; then
  ARCH="arm64"
  ARCH_NAME="Apple Silicon"
else
  echo -e "${RED}✗ Error: Unsupported architecture: $ARCH${NC}"
  exit 1
fi

echo -e "${BLUE}ℹ Detected: macOS $ARCH_NAME${NC}"
echo ""

# GitHub repository
REPO="thetronjohnson/layrr"
BINARY_NAME="layrr-darwin-${ARCH}"

# Get latest release version
echo -e "${YELLOW}→ Fetching latest release...${NC}"
LATEST_VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/' 2>/dev/null)

if [ -z "$LATEST_VERSION" ]; then
  echo -e "${RED}✗ Failed to fetch latest version${NC}"
  echo -e "${YELLOW}  Tip: Check your internet connection or GitHub API limits${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Latest version: $LATEST_VERSION${NC}"

# Download URL
DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${LATEST_VERSION}/${BINARY_NAME}"

# Create temp directory
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

# Download binary
echo -e "${YELLOW}→ Downloading layrr...${NC}"
if ! curl -fsSL "$DOWNLOAD_URL" -o "$TMP_DIR/layrr"; then
  echo -e "${RED}✗ Download failed${NC}"
  echo -e "${YELLOW}  Tried: $DOWNLOAD_URL${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Downloaded${NC}"

# Install
echo -e "${YELLOW}→ Installing to /usr/local/bin/layrr...${NC}"
if [ -w "/usr/local/bin" ]; then
  mv "$TMP_DIR/layrr" /usr/local/bin/layrr
  chmod +x /usr/local/bin/layrr
else
  sudo mv "$TMP_DIR/layrr" /usr/local/bin/layrr
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
