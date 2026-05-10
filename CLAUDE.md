# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Scope

Layrr is kept as a CLI-only project. The hosted dashboard, process manager, deployment files, templates, and hosted-only agents are intentionally removed.

The repository root is the CLI package.

## Commands

```bash
pnpm install
pnpm build
```

Local CLI run after building:

```bash
node dist/cli.js --port 3000
```

There are no automated tests configured.

## CLI Architecture

The CLI proxies a local dev server, injects a browser overlay, resolves selected elements back to source code, sends edit requests to an AI agent, and records successful edits in git.

Important paths:

- `src/cli.ts` - argument parsing, agent selection, git preflight, proxy startup, edit loop
- `src/agents/` - public agent integrations for Claude Code, Codex, and Gemini via Pi
- `src/server/` - HTTP proxy, WebSocket handling, edit queue, version history
- `src/editor/source-mapper.ts` - source file and line resolution
- `overlay/` - injected browser UI, bundled as an IIFE
- `scripts/build.ts` - builds overlay, compiles TypeScript, copies font assets

## Notes

- Public agents are `claude`, `codex`, and `gemini`.
- Keep overlay CSS scoped with the `__layrr` prefix.
- Do not reintroduce app/server/dashboard/deployment code unless explicitly requested.
- Use `rg` for repository searches.
