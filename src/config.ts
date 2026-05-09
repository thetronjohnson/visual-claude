import { join } from 'path';
import { homedir } from 'os';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

import type { AgentName } from './agents/index.js';
import { AGENT_LIST, isValidAgent } from './agents/index.js';

const CONFIG_DIR = join(homedir(), '.layrr');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

interface LayrConfig {
  agent: AgentName;
}

export function loadConfig(): LayrConfig | null {
  try {
    if (!existsSync(CONFIG_FILE)) return null;
    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.agent && isValidAgent(parsed.agent)) {
      return parsed as LayrConfig;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveConfig(config: LayrConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n');
}

export function resolveAgent(cliOverride?: string): AgentName | null {
  if (cliOverride && isValidAgent(cliOverride)) return cliOverride;
  const config = loadConfig();
  if (config) return config.agent;
  return null;
}

export async function promptAgentSelection(): Promise<AgentName> {
  let selected = 0;

  const render = () => {
    // Move cursor up to redraw (except first render)
    process.stdout.write(`\x1b[${AGENT_LIST.length}A`);
    AGENT_LIST.forEach((a, i) => {
      const cursor = i === selected ? '❯' : ' ';
      const dim = i === selected ? '\x1b[1m' : '\x1b[2m';
      process.stdout.write(`\x1b[2K  ${dim}${cursor} ${a.displayName}\x1b[0m\n`);
    });
  };

  return new Promise((resolve) => {
    console.log('\n  Select your AI agent:\n');
    // Initial render
    AGENT_LIST.forEach((a, i) => {
      const cursor = i === selected ? '❯' : ' ';
      const dim = i === selected ? '\x1b[1m' : '\x1b[2m';
      process.stdout.write(`  ${dim}${cursor} ${a.displayName}\x1b[0m\n`);
    });

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const onKey = (key: string) => {
      if (key === '\x1b[A' || key === 'k') {
        // Up arrow or k
        selected = (selected - 1 + AGENT_LIST.length) % AGENT_LIST.length;
        render();
      } else if (key === '\x1b[B' || key === 'j') {
        // Down arrow or j
        selected = (selected + 1) % AGENT_LIST.length;
        render();
      } else if (key === '\r' || key === '\n') {
        // Enter
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onKey);

        const agent = AGENT_LIST[selected];
        saveConfig({ agent: agent.name });
        console.log(`\n  ✓ Saved ${agent.displayName} as default agent\n`);
        resolve(agent.name);
      } else if (key === '\x03') {
        // Ctrl+C
        process.stdin.setRawMode(false);
        console.log('');
        process.exit(0);
      }
    };

    process.stdin.on('data', onKey);
  });
}
