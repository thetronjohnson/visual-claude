import { join } from 'path';
import { homedir } from 'os';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

import { PUBLIC_AGENTS, type AgentName } from './agents/base.js';

const AGENT_DISPLAY_NAMES: Record<AgentName, string> = {
  claude: 'Claude Code',
  codex: 'Codex CLI',
  gemini: 'Gemini via Pi',
};

const AGENT_LIST = PUBLIC_AGENTS.map((name) => ({
  name,
  displayName: AGENT_DISPLAY_NAMES[name],
}));

function isValidAgent(agent: string): agent is AgentName {
  return PUBLIC_AGENTS.includes(agent as AgentName);
}

const CONFIG_DIR = join(homedir(), '.layrr');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export interface PiProviderConfig {
  provider: 'google';
  model: string;
  apiKey?: string;
}

interface LayrConfig {
  agent: AgentName;
  pi?: {
    gemini?: PiProviderConfig;
  };
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

export function getGeminiPiConfig(): PiProviderConfig | null {
  return loadConfig()?.pi?.gemini || null;
}

export function setGeminiPiModel(model: string): void {
  const config = loadConfig() || { agent: 'gemini' as AgentName };
  saveConfig({
    ...config,
    agent: 'gemini',
    pi: {
      ...config.pi,
      gemini: {
        provider: 'google',
        model,
        apiKey: config.pi?.gemini?.apiKey,
      },
    },
  });
}

export function resolveAgent(cliOverride?: string): AgentName | null {
  if (cliOverride && isValidAgent(cliOverride)) return cliOverride;
  const config = loadConfig();
  if (config) return config.agent;
  return null;
}

async function promptInput(question: string, defaultValue?: string): Promise<string> {
  const wasRaw = input.isRaw;
  input.setRawMode?.(false);
  const rl = createInterface({ input, output, terminal: true });
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  try {
    const answer = await rl.question(`  ${question}${suffix}: `);
    return answer.trim() || defaultValue || '';
  } finally {
    rl.close();
    input.setRawMode?.(wasRaw);
  }
}

async function promptSecret(question: string, defaultValue?: string): Promise<string> {
  const wasRaw = input.isRaw;
  input.setRawMode?.(false);
  const rl = createInterface({ input, output, terminal: true });
  const suffix = defaultValue ? ' (using existing if blank)' : '';
  const prompt = `  ${question}${suffix}: `;

  const originalWrite = (rl as any)._writeToOutput?.bind(rl);
  let masking = false;
  (rl as any)._writeToOutput = (text: string) => {
    if (!masking) {
      originalWrite?.(text);
      return;
    }

    if (text.includes('\r') || text.includes('\n')) {
      originalWrite?.(text);
    } else if (text.includes('\x1b') || text.includes('\b')) {
      originalWrite?.(text);
    } else {
      output.write('*'.repeat([...text].length));
    }
  };

  try {
    output.write(prompt);
    masking = true;
    const answer = await new Promise<string>((resolve) => {
      rl.once('line', resolve);
    });
    return answer.trim() || defaultValue || '';
  } finally {
    masking = false;
    rl.close();
    input.setRawMode?.(wasRaw);
  }
}

export async function ensureAgentConfigured(agent: AgentName, opts: { force?: boolean } = {}): Promise<void> {
  if (agent !== 'gemini') return;

  const config = loadConfig() || { agent };
  if (!opts.force && config.pi?.gemini?.model && (config.pi.gemini.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) {
    return;
  }

  console.log('\n  Configure Gemini via Pi:\n');
  const model = await promptInput('Model', config.pi?.gemini?.model || process.env.LAYRR_GEMINI_MODEL || 'gemini-2.5-flash');
  const apiKey = await promptSecret('Gemini API key', config.pi?.gemini?.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

  saveConfig({
    ...config,
    agent,
    pi: {
      ...config.pi,
      gemini: {
        provider: 'google',
        model,
        apiKey,
      },
    },
  });

  console.log('  ✓ Saved Gemini configuration\n');
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
