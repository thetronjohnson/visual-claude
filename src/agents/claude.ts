import { spawn, spawnSync } from 'child_process';
import { randomUUID } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { PendingEditRequest } from '../server/edit-queue.js';
import type { Agent, AgentOptions, AgentCheckResult } from './base.js';
import { buildPrompt } from './prompt.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const claudeBin = join(__dirname, '..', '..', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');

export function checkClaude(): AgentCheckResult {
  try {
    const result = spawnSync('node', [claudeBin, '--version'], {
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status === 0) return { ok: true };

    const stderr = result.stderr?.toString() || '';
    const stderrLower = stderr.toLowerCase();
    if (stderrLower.includes('auth') || stderrLower.includes('login') ||
        stderrLower.includes('api key') || stderrLower.includes('credentials') ||
        stderrLower.includes('bedrock') || stderrLower.includes('not configured')) {
      return { ok: false, error: 'not-authenticated' };
    }

    return { ok: false, error: `claude exited with code ${result.status}` };
  } catch {
    return { ok: false, error: 'not-found' };
  }
}

export class ClaudeAgent implements Agent {
  readonly name = 'claude' as const;
  readonly displayName = 'Claude Code';
  private sessionId: string;
  private projectRoot: string;

  constructor(opts: AgentOptions) {
    this.sessionId = randomUUID();
    this.projectRoot = opts.projectRoot;
  }

  async applyEdit(request: PendingEditRequest): Promise<{ success: boolean; message: string }> {
    const prompt = buildPrompt(request);

    return new Promise((resolve) => {
      const args = [
        claudeBin,
        '--print',
        '--output-format', 'text',
        '--dangerously-skip-permissions',
        '--session-id', this.sessionId,
        '--no-session-persistence',
        '-p', prompt,
      ];

      const proc = spawn('node', args, {
        cwd: this.projectRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({
            success: true,
            message: stdout.trim().slice(-200) || 'Edit applied',
          });
        } else {
          const err = stderr.trim();
          const errLower = err.toLowerCase();
          if (errLower.includes('auth') || errLower.includes('login') ||
              errLower.includes('api key') || errLower.includes('credentials') ||
              errLower.includes('bedrock') || errLower.includes('not configured')) {
            resolve({ success: false, message: 'Claude Code authentication failed. Run: claude login' });
          } else {
            resolve({ success: false, message: err.slice(-200) || `Claude exited with code ${code}` });
          }
        }
      });

      proc.on('error', (err) => {
        resolve({ success: false, message: `Failed to spawn Claude: ${err.message}` });
      });

      setTimeout(() => {
        proc.kill();
        resolve({ success: false, message: 'Edit timed out after 60 seconds' });
      }, 60000);
    });
  }
}
