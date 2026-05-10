import type { PendingEditRequest } from '../server/edit-queue.js';
import { execSync } from 'child_process';
import { getGeminiPiConfig, type PiProviderConfig } from '../config.js';
import type { Agent, AgentOptions, AgentCheckResult } from './base.js';
import { buildPrompt } from './prompt.js';

type PiCodingAgentModule = {
  AuthStorage: {
    inMemory: () => {
      setRuntimeApiKey: (provider: string, apiKey: string) => void;
    };
  };
  ModelRegistry: {
    inMemory: (authStorage: unknown) => unknown;
  };
  SessionManager?: {
    inMemory: () => unknown;
  };
  createAgentSessionFromServices: (options: Record<string, unknown>) => Promise<Record<string, unknown>>;
  createAgentSessionRuntime: (factory: (options: Record<string, unknown>) => Promise<Record<string, unknown>>, options: Record<string, unknown>) => Promise<unknown>;
  createAgentSessionServices: (options: Record<string, unknown>) => Promise<Record<string, unknown>>;
  getAgentDir: () => string;
  runPrintMode: (runtime: unknown, options: Record<string, unknown>) => Promise<number>;
};

type PiAiModule = {
  getModel: (provider: string, model: string) => unknown;
};

const PI_CODING_AGENT_PACKAGE = '@earendil-works/pi-coding-agent';
const PI_AI_PACKAGE = '@earendil-works/pi-ai';

async function importPiCodingAgent(): Promise<PiCodingAgentModule> {
  return import(PI_CODING_AGENT_PACKAGE) as Promise<PiCodingAgentModule>;
}

async function importPiAi(): Promise<PiAiModule> {
  return import(PI_AI_PACKAGE) as Promise<PiAiModule>;
}

export abstract class PiSdkAgent implements Agent {
  abstract readonly name: 'gemini';
  abstract readonly displayName: string;

  protected projectRoot: string;

  constructor(opts: AgentOptions) {
    this.projectRoot = opts.projectRoot;
  }

  protected abstract getConfig(): PiProviderConfig | null;

  async applyEdit(request: PendingEditRequest): Promise<{ success: boolean; message: string }> {
    const config = this.getConfig();
    if (!config?.model) {
      return { success: false, message: `${this.displayName} is not configured` };
    }

    const apiKey = config.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (apiKey) process.env.GEMINI_API_KEY = apiKey;
    delete process.env.GOOGLE_API_KEY;

    const prompt = buildPrompt(request);
    const before = getWorktreeSnapshot(this.projectRoot);

    try {
      const [{
        AuthStorage,
        ModelRegistry,
        SessionManager,
        createAgentSessionFromServices,
        createAgentSessionRuntime,
        createAgentSessionServices,
        getAgentDir,
        runPrintMode,
      }, { getModel }] = await Promise.all([
        importPiCodingAgent(),
        importPiAi(),
      ]);

      const model = getModel(config.provider, config.model);

      const authStorage = AuthStorage.inMemory();
      if (apiKey) authStorage.setRuntimeApiKey(config.provider, apiKey);
      const modelRegistry = ModelRegistry.inMemory(authStorage);
      const agentDir = getAgentDir();

      const createRuntime = async ({ cwd, sessionManager, sessionStartEvent }: Record<string, unknown>) => {
        const services = await createAgentSessionServices({
          cwd,
          agentDir,
          authStorage,
          modelRegistry,
        });

        return {
          ...(await createAgentSessionFromServices({
            services,
            sessionManager,
            sessionStartEvent,
            model,
          })),
          services,
          diagnostics: services.diagnostics,
        };
      };

      const runtime = await createAgentSessionRuntime(createRuntime, {
        cwd: this.projectRoot,
        agentDir,
        sessionManager: SessionManager?.inMemory(),
      });

      const session = (runtime as { session?: { subscribe?: (listener: (event: any) => void) => () => void } }).session;
      const unsubscribe = session?.subscribe?.((event) => {
        if (event.type === 'tool_execution_start') process.stdout.write(`    ${event.toolName || 'tool'}...\n`);
      });

      const exitCode = await runPrintMode(runtime, {
        mode: 'text',
        initialMessage: prompt,
      });

      unsubscribe?.();
      if (exitCode !== 0) return { success: false, message: `Gemini exited with code ${exitCode}` };

      const after = getWorktreeSnapshot(this.projectRoot);
      if (after === before) {
        return { success: false, message: 'Gemini completed but did not change any files' };
      }

      return { success: true, message: 'Edit applied' };
    } catch (err: any) {
      return { success: false, message: err.message || `${this.displayName} failed` };
    }
  }
}

export async function checkPiGemini(): Promise<AgentCheckResult> {
  try {
    await Promise.all([
      importPiCodingAgent(),
      importPiAi(),
    ]);
  } catch {
    return { ok: false, error: 'not-found' };
  }

  const config = getGeminiPiConfig();
  if (!config?.model || !(config.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) {
    return { ok: false, error: 'not-authenticated' };
  }
  return { ok: true };
}

function getWorktreeSnapshot(cwd: string): string {
  try {
    const status = execSync('git status --porcelain=v1 -uall', { cwd, encoding: 'utf-8' });
    const diff = execSync('git diff --no-ext-diff --no-color --binary', { cwd, encoding: 'utf-8' });
    return `${status}\n${diff}`;
  } catch {
    return '';
  }
}
