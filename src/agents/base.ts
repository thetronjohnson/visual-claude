import { spawn, spawnSync } from 'child_process';
import type { PendingEditRequest } from '../server/edit-queue.js';

export type AgentName = 'claude' | 'codex' | 'gemini';

export const PUBLIC_AGENTS: AgentName[] = ['claude', 'codex', 'gemini'];

export interface Agent {
  readonly name: AgentName;
  readonly displayName: string;
  applyEdit(request: PendingEditRequest): Promise<{ success: boolean; message: string }>;
}

export interface AgentOptions {
  projectRoot: string;
}

export interface AgentCheckResult {
  ok: boolean;
  error?: string;
}

export type AgentCheck = () => AgentCheckResult | Promise<AgentCheckResult>;

export function checkBinary(bin: string, args: string[], authKeywords: string[]): AgentCheckResult {
  try {
    const result = spawnSync(bin, args, {
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status === 0) return { ok: true };

    const stderr = result.stderr?.toString() || '';
    const stdout = result.stdout?.toString() || '';
    const output = `${stderr}\n${stdout}`.toLowerCase();
    if (authKeywords.some(kw => output.includes(kw))) {
      return { ok: false, error: 'not-authenticated' };
    }

    const reason = result.signal
      ? `${bin} exited with signal ${result.signal}`
      : `${bin} exited with code ${result.status ?? 'unknown'}`;
    const detail = (stderr || stdout).trim();
    return { ok: false, error: detail ? `${reason}: ${detail.slice(-200)}` : reason };
  } catch {
    return { ok: false, error: 'not-found' };
  }
}

export function spawnAgent(
  bin: string,
  args: string[],
  cwd: string,
  timeout = 120000,
): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    const proc = spawn(bin, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      process.stdout.write(`    ${chunk.trim().slice(0, 80)}\r`);
    });
    proc.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, message: stdout.trim().slice(-200) || 'Edit applied' });
      } else {
        resolve({ success: false, message: stderr.trim().slice(-200) || `Process exited with code ${code}` });
      }
    });

    proc.on('error', (err) => {
      resolve({ success: false, message: `Failed to spawn ${bin}: ${err.message}` });
    });

    setTimeout(() => {
      proc.kill();
      resolve({ success: false, message: `Edit timed out after ${timeout / 1000} seconds` });
    }, timeout);
  });
}
