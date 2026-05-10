import { getGeminiPiConfig } from '../config.js';
import type { AgentOptions, AgentCheckResult } from './base.js';
import { PiSdkAgent, checkPiGemini } from './pi.js';

export function checkGemini(): AgentCheckResult | Promise<AgentCheckResult> {
  return checkPiGemini();
}

export class GeminiAgent extends PiSdkAgent {
  readonly name = 'gemini' as const;
  readonly displayName = 'Gemini via Pi';

  constructor(opts: AgentOptions) {
    super(opts);
  }

  protected getConfig() {
    return getGeminiPiConfig();
  }
}
