import type { Agent, AgentName, AgentOptions, AgentCheck } from './base.js';
import { PUBLIC_AGENTS } from './base.js';
import { ClaudeAgent, checkClaude } from './claude.js';
import { CodexAgent, checkCodex } from './codex.js';
import { GeminiAgent, checkGemini } from './gemini.js';

export type { Agent, AgentName, AgentOptions };

const ALL_AGENTS: { name: AgentName; displayName: string }[] = [
  { name: 'claude', displayName: 'Claude Code' },
  { name: 'codex', displayName: 'Codex CLI' },
  { name: 'gemini', displayName: 'Gemini via Pi' },
];

// Public agents shown in CLI picker and help text
export const AGENT_LIST = ALL_AGENTS.filter(a => PUBLIC_AGENTS.includes(a.name));

const AGENTS: Record<AgentName, {
  create: (opts: AgentOptions) => Agent;
  check: AgentCheck;
  installHint: string;
  authHint: string;
}> = {
  claude: {
    create: (opts) => new ClaudeAgent(opts),
    check: checkClaude,
    installHint: 'layrr bundles it. Try: claude login',
    authHint: `  Authenticate using one of these methods:

    • Bedrock:  claude login --bedrock
    • SSO:      claude login --sso
    • API key:  claude login`,
  },
  codex: {
    create: (opts) => new CodexAgent(opts),
    check: checkCodex,
    installHint: 'npm install -g @openai/codex',
    authHint: `  Set your OpenAI API key:

    export OPENAI_API_KEY=<your-key>`,
  },
  gemini: {
    create: (opts) => new GeminiAgent(opts),
    check: checkGemini,
    installHint: 'reinstall layrr so bundled Pi dependencies are present: npm install -g layrr',
    authHint: `  Set your Gemini API key:

    export GEMINI_API_KEY=<your-key>

  Optional model override:

    export LAYRR_GEMINI_MODEL=gemini-2.5-flash`,
  },
};

export function createAgent(name: AgentName, opts: AgentOptions): Agent {
  return AGENTS[name].create(opts);
}

export function checkAgent(name: AgentName): ReturnType<AgentCheck> {
  return AGENTS[name].check();
}

export function getAgentDisplayName(name: AgentName): string {
  return AGENT_LIST.find(a => a.name === name)?.displayName || name;
}

export function getInstallHint(name: AgentName): string {
  return AGENTS[name].installHint;
}

export function getAuthHint(name: AgentName): string {
  return AGENTS[name].authHint;
}

export function isValidAgent(name: string): name is AgentName {
  return name in AGENTS;
}
