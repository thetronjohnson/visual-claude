<div align="center">

  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="layrr-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="layrr-light.svg">
    <img src="layrr-dark.svg" alt="layrr" width="120">
  </picture>

  <h1>layrr</h1>

  <p>
    <strong>Point at anything. Describe the change. Done.</strong>
  </p>
  <p>
    Layrr is a CLI visual AI code editor. Run it against a local dev server, click any element in the browser, describe what you want in plain English, and an AI agent edits the source code.
  </p>

  <p>
    <a href="https://www.npmjs.com/package/layrr"><img src="https://img.shields.io/npm/v/layrr?style=flat-square&color=18181b" alt="npm"></a>
    <a href="https://github.com/thetronjohnson/layrr/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-18181b?style=flat-square" alt="License"></a>
  </p>
</div>

---

## Usage

Start your app's dev server first:

```bash
pnpm dev
```

Then run Layrr against that port:

```bash
npx layrr --port 3000
```

For a local checkout:

```bash
pnpm install
pnpm build
node dist/cli.js --port 3000
```

## Options

```bash
layrr --port <number> [project-root] [options]
```

| Option | Description |
| --- | --- |
| `-p, --port <number>` | Local dev server port. Required. |
| `--proxy-port <number>` | Layrr proxy port. Defaults to `4567`. |
| `--agent <name>` | AI agent to use: `claude` or `codex`. |
| `--no-open` | Do not open the browser automatically. |
| `-h, --help` | Show help. |

## Agents

Layrr supports:

- `claude` - Claude Code
- `codex` - Codex CLI

If no agent is configured, Layrr prompts you to pick one.

## Git History

Layrr uses git as its undo path:

- initializes a git repo if needed
- creates an initial snapshot when needed
- commits successful edits with a `[layrr]` prefix
- keeps pre-existing dirty files out of Layrr edit commits
- lets the overlay preview and revert Layrr edits

## Repository

This repository is the CLI package.

## License

MIT
