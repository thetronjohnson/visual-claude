import type { PendingEditRequest } from '../server/edit-queue.js';
import type { Agent, AgentOptions, AgentCheckResult } from './base.js';
import { checkBinary, spawnAgent } from './base.js';
import { buildPrompt } from './prompt.js';

const AUTH_KEYWORDS = ['api key', 'auth', 'openai', 'sign in', 'unauthorized'];

export function checkCodex(): AgentCheckResult {
  return checkBinary('codex', ['--version'], AUTH_KEYWORDS);
}

export class CodexAgent implements Agent {
  readonly name = 'codex' as const;
  readonly displayName = 'Codex CLI';
  private projectRoot: string;

  constructor(opts: AgentOptions) {
    this.projectRoot = opts.projectRoot;
  }

  async applyEdit(request: PendingEditRequest): Promise<{ success: boolean; message: string }> {
    const prompt = buildPrompt(request);

    return spawnAgent('codex', [
      'exec',
      '--full-auto',
      prompt,
    ], this.projectRoot);
  }
}
