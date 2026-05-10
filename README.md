<div align="center">

  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="layrr-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="layrr-light.svg">
    <img src="layrr-dark.svg" alt="layrr" width="120">
  </picture>

  <h1>layrr</h1>

  <p>
    <strong>Point, click, and edit any web app with AI</strong>
  </p>
  <p>
    Layrr lets you click an element in your running web app, describe the change in plain English, and send the exact source location to Claude Code, Codex CLI, or Gemini via Pi.
  </p>

  <p>
    <a href="https://www.npmjs.com/package/layrr"><img src="https://img.shields.io/npm/v/layrr?style=flat-square&color=18181b" alt="npm"></a>
    <a href="https://github.com/thetronjohnson/layrr/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-18181b?style=flat-square" alt="License"></a>
  </p>
</div>

---

## The problem

You can see the issue in the browser: the button is too wide, the copy is wrong, the spacing is off, or the component needs a quick behavior change. The slow part is finding the right file, line, and context before your coding agent can make a useful edit.

Layrr sits between your browser and local dev server. It injects a small overlay, maps clicked elements back to source, and gives your coding agent the instruction plus the selected code location.

## Install

Install Layrr globally:

```bash
npm install -g layrr
```

## Usage

Start your app first:

```bash
pnpm dev
```

Then run Layrr against the dev server port:

```bash
layrr --port 3000
```

Layrr opens a proxied version of your app at `http://localhost:4567`.

In the browser:

1. Click one or more elements.
2. Describe the change you want.
3. Let the selected coding agent edit the source.
4. Preview or revert Layrr edits from the overlay history.

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
| `--agent <name>` | AI agent to use: `claude`, `codex`, or `gemini`. |
| `--gemini-model <model>` | Save and use a Gemini model, for example `gemini-2.5-flash`. |
| `--configure-gemini` | Reconfigure the Gemini model and API key. |
| `--no-open` | Do not open the browser automatically. |
| `-h, --help` | Show help. |

## Agents

Layrr supports:

- `claude` - Claude Code
- `codex` - Codex CLI
- `gemini` - Gemini via Pi coding agent, installed as a Layrr dependency

If no agent is configured, Layrr prompts you to pick one.

To configure Gemini without starting a session:

```bash
layrr --configure-gemini
```

## Git History

Layrr uses git as its undo path:

- initializes a git repo if needed
- creates an initial snapshot when needed
- commits successful edits with a `[layrr]` prefix
- keeps pre-existing dirty files out of Layrr edit commits
- lets the overlay preview and revert Layrr edits

## License

MIT
