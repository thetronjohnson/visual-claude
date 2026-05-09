#!/usr/bin/env node

import { resolve } from 'path';
import { execSync } from 'child_process';
import { startProxy } from './server/proxy.js';
import { editQueue } from './server/edit-queue.js';
import { createAgent, checkAgent, getAgentDisplayName, getInstallHint, getAuthHint, isValidAgent, AGENT_LIST } from './agents/index.js';
import { resolveAgent, promptAgentSelection } from './config.js';

const args = process.argv.slice(2);

let targetPort: number | null = null;
let proxyPort = 4567;
let projectRoot = process.cwd();
let noOpen = false;
let agentOverride: string | undefined;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if ((arg === '--port' || arg === '-p') && args[i + 1]) {
    targetPort = parseInt(args[i + 1], 10);
    i++;
  } else if (arg === '--proxy-port' && args[i + 1]) {
    proxyPort = parseInt(args[i + 1], 10);
    i++;
  } else if (arg === '--agent' && args[i + 1]) {
    agentOverride = args[i + 1];
    i++;
  } else if (arg === '--no-open') {
    noOpen = true;
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
  layrr - Point, click, and edit any web app with AI

  Usage:
    npx layrr --port <dev-server-port> [options]

  Options:
    -p, --port <number>        Dev server port (required)
    --proxy-port <number>      Layrr proxy port (default: 4567)
    --agent <name>             AI agent to use (${AGENT_LIST.map(a => a.name).join(', ')})
    --no-open                  Don't open browser automatically
    -h, --help                 Show this help

  Example:
    pnpm dev                   # start your dev server on port 3000
    npx layrr --port 3000      # start layrr
`);
    process.exit(0);
  } else if (!arg.startsWith('-')) {
    projectRoot = resolve(arg);
  }
}

if (!targetPort) {
  console.error('  Error: --port is required. Specify your dev server port.\n');
  console.error('  npx layrr --port 3000');
  process.exit(1);
}

projectRoot = resolve(projectRoot);

// ---- Validate --agent flag if provided ----
if (agentOverride && !isValidAgent(agentOverride)) {
  console.error(`  Error: Unknown agent "${agentOverride}"\n`);
  console.error(`  Available agents: ${AGENT_LIST.map(a => `${a.name} (${a.displayName})`).join(', ')}`);
  process.exit(1);
}

// ---- Resolve agent ----
let agentName = resolveAgent(agentOverride);

if (!agentName) {
  agentName = await promptAgentSelection();
}

const displayName = getAgentDisplayName(agentName);

// ---- Preflight: check agent ----
console.log(`\n  Checking ${displayName}...`);
const check = checkAgent(agentName);

if (!check.ok) {
  if (check.error === 'not-authenticated') {
    console.error(`\n  ${displayName} is not authenticated.\n`);
    console.error(getAuthHint(agentName));
    console.error('\n  Then try layrr again.\n');
  } else if (check.error === 'not-found') {
    console.error(`\n  ${displayName} not found.\n`);
    console.error(`  Install it: ${getInstallHint(agentName)}\n`);
  } else {
    console.error(`\n  Could not start ${displayName}: ${check.error}\n`);
  }
  process.exit(1);
}

console.log(`  ✓ ${displayName} ready`);

// ---- Start ----
console.log(`
  ✦ layrr

  Dev server:  http://localhost:${targetPort}
  Proxy:       http://localhost:${proxyPort}
  Agent:       ${displayName}
  Project:     ${projectRoot}
`);

// ---- Ensure git repo is ready ----
try {
  execSync('git rev-parse --git-dir', { cwd: projectRoot, stdio: 'pipe' });
  // Repo exists — check if there are any commits
  try {
    execSync('git rev-parse HEAD', { cwd: projectRoot, stdio: 'pipe' });
    // Has commits — check for uncommitted changes
    const status = execSync('git status --porcelain', { cwd: projectRoot, encoding: 'utf-8' }).trim();
    if (status) {
      console.log('  ↪ Committing existing changes before starting...');
      execSync('git add -A', { cwd: projectRoot, stdio: 'pipe' });
      try {
        execSync('git diff --cached --quiet', { cwd: projectRoot, stdio: 'pipe' });
        // Nothing staged — skip commit
      } catch {
        execSync('git commit -m "pre-layrr snapshot"', { cwd: projectRoot, stdio: 'pipe' });
        console.log('  ✓ Existing changes committed');
      }
    }
  } catch {
    // No commits yet — initial commit
    console.log('  ↪ Creating initial commit...');
    execSync('git add -A', { cwd: projectRoot, stdio: 'pipe' });
    try {
      execSync('git commit -m "initial commit"', { cwd: projectRoot, stdio: 'pipe' });
      console.log('  ✓ Initial commit created');
    } catch {
      // Nothing to commit — that's fine
    }
  }
} catch {
  // Not a git repo — initialize one
  console.log('  ↪ Initializing git repository...');
  execSync('git init', { cwd: projectRoot, stdio: 'pipe' });
  execSync('git add -A', { cwd: projectRoot, stdio: 'pipe' });
  try {
    execSync('git commit -m "initial commit"', { cwd: projectRoot, stdio: 'pipe' });
  } catch {
    // Empty repo is fine
  }
  console.log('  ✓ Git repository initialized');
}

const agent = createAgent(agentName, { projectRoot });
editQueue.projectRoot = projectRoot;

await startProxy(targetPort, proxyPort, projectRoot);
console.log(`  ✓ Proxy running on http://localhost:${proxyPort}`);

if (!noOpen) {
  const { default: open } = await import('open');
  await open(`http://localhost:${proxyPort}`);
  console.log('  ✓ Browser opened');
}

console.log('  ✓ Waiting for edits...\n');

async function editLoop() {
  while (true) {
    const request = await editQueue.waitForNext();

    const src = request.sourceLocation;
    if (request.elements && request.elements.length > 1) {
      console.log(`  ✎ Edit: "${request.instruction}" on ${request.elements.length} elements`);
      for (const el of request.elements) {
        if (el.sourceLocation) {
          console.log(`    → <${el.tagName}> at ${el.sourceLocation.filePath}:${el.sourceLocation.line}`);
        } else {
          console.log(`    → <${el.tagName}>`);
        }
      }
    } else {
      console.log(`  ✎ Edit: "${request.instruction}" on <${request.tagName}>`);
      if (src) {
        console.log(`    → ${src.filePath}:${src.line}`);
      }
    }

    // Snapshot dirty files before agent runs
    let dirtyBefore = new Set<string>();
    try {
      const tracked = execSync('git diff --name-only', { cwd: projectRoot, encoding: 'utf-8' }).trim();
      const untracked = execSync('git ls-files --others --exclude-standard', { cwd: projectRoot, encoding: 'utf-8' }).trim();
      for (const f of tracked.split('\n').filter(Boolean)) dirtyBefore.add(f);
      for (const f of untracked.split('\n').filter(Boolean)) dirtyBefore.add(f);
    } catch {}

    const result = await agent.applyEdit(request);

    if (result.success) {
      // Auto-commit only files the agent changed (not pre-existing dirty files)
      try {
        const trackedAfter = execSync('git diff --name-only', { cwd: projectRoot, encoding: 'utf-8' }).trim();
        const untrackedAfter = execSync('git ls-files --others --exclude-standard', { cwd: projectRoot, encoding: 'utf-8' }).trim();
        const toStage = [
          ...trackedAfter.split('\n').filter(Boolean),
          ...untrackedAfter.split('\n').filter(Boolean),
        ].filter(f => !dirtyBefore.has(f));

        if (toStage.length === 0) {
          console.log(`  ✓ Done (no changes to commit)`);
        } else {
          execSync(`git add -- ${toStage.map(f => `"${f}"`).join(' ')}`, { cwd: projectRoot, stdio: 'pipe' });
          const msg = `[layrr] ${request.instruction.slice(0, 72)}`;
          execSync(`git commit -m ${JSON.stringify(msg)}`, { cwd: projectRoot, stdio: 'pipe' });
          console.log(`  ✓ Done (committed)`);
        }
      } catch {
        console.log(`  ✓ Done (no commit)`);
      }
    } else {
      console.log(`  ✗ Failed: ${result.message}`);
    }

    editQueue.notifyComplete(result.success, result.message);
    console.log('');
  }
}

editLoop();

process.on('SIGINT', () => { console.log('\n  Shutting down...'); process.exit(0); });
process.on('SIGTERM', () => process.exit(0));
