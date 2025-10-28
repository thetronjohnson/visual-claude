.PHONY: build install clean test run help

# Binary name
BINARY_NAME=visual-claude

# Build directory
BUILD_DIR=./build

# Go parameters
GOCMD=go
GOBUILD=$(GOCMD) build
GOCLEAN=$(GOCMD) clean
GOTEST=$(GOCMD) test
GOGET=$(GOCMD) get
GOMOD=$(GOCMD) mod

# Build flags
LDFLAGS=-ldflags "-s -w"

# Default target
all: build

help:
	@echo "Visual Claude - Makefile targets:"
	@echo ""
	@echo "  make build        Build the binary"
	@echo "  make install      Install to /usr/local/bin"
	@echo "  make clean        Remove build artifacts"
	@echo "  make test         Run tests"
	@echo "  make run          Build and run"
	@echo "  make deps         Download dependencies"
	@echo ""

deps:
	@echo "Downloading dependencies..."
	$(GOMOD) download
	$(GOMOD) tidy

build: deps
	@echo "Building $(BINARY_NAME)..."
	@mkdir -p $(BUILD_DIR)
	$(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME) ./cmd/visual-claude
	@echo "Build complete: $(BUILD_DIR)/$(BINARY_NAME)"

install: build
	@echo "Installing $(BINARY_NAME) to /usr/local/bin..."
	@sudo cp $(BUILD_DIR)/$(BINARY_NAME) /usr/local/bin/
	@sudo chmod +x /usr/local/bin/$(BINARY_NAME)
	@echo "Installation complete!"
	@echo "Run '$(BINARY_NAME)' to start"

clean:
	@echo "Cleaning..."
	$(GOCLEAN)
	@rm -rf $(BUILD_DIR)
	@echo "Clean complete"

test:
	@echo "Running tests..."
	$(GOTEST) -v ./...

run: build
	@echo "Running $(BINARY_NAME)..."
	$(BUILD_DIR)/$(BINARY_NAME)

# Development targets
dev: clean build run

# Check if Claude Code is installed
check-claude:
	@which claude > /dev/null || (echo "Error: Claude Code not found in PATH" && exit 1)
	@echo "Claude Code found: $$(which claude)"

# Verify all dependencies are installed
verify: check-claude
	@echo "Verifying Go installation..."
	@$(GOCMD) version
	@echo "All dependencies verified!"
