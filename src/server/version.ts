import { execSync } from 'child_process';
import type { WebSocket } from 'ws';

let originalBranch: string | null = null;

function send(ws: WebSocket, data: object) {
  try { ws.send(JSON.stringify(data)); } catch {}
}

export function preview(ws: WebSocket, hash: string, projectRoot: string) {
  try {
    if (!originalBranch) {
      try {
        originalBranch = execSync('git symbolic-ref --short HEAD', { cwd: projectRoot, encoding: 'utf-8' }).trim();
      } catch {
        originalBranch = 'main';
      }
    }
    const commitMsg = execSync(`git log -1 --format=%s ${hash}`, { cwd: projectRoot, encoding: 'utf-8' }).trim().replace('[layrr] ', '');
    // Send response BEFORE checkout (checkout triggers reload which kills the WS)
    send(ws, { type: 'version-preview-result', success: true, hash, message: commitMsg });
    execSync(`git checkout ${hash} --detach`, { cwd: projectRoot, stdio: 'pipe' });
    console.log(`  ⏪ Previewing: ${commitMsg}`);
  } catch (err: any) {
    console.log(`  ✗ Preview failed: ${err.message}`);
    send(ws, { type: 'version-preview-result', success: false, message: err.message });
  }
}

export function restore(ws: WebSocket, projectRoot: string) {
  if (!originalBranch) return;
  try {
    const branch = originalBranch;
    originalBranch = null;
    send(ws, { type: 'version-restore-result', success: true, branch });
    execSync(`git checkout ${branch}`, { cwd: projectRoot, stdio: 'pipe' });
    console.log(`  ↩ Restored to ${branch}`);
  } catch (err: any) {
    send(ws, { type: 'version-restore-result', success: false, message: err.message });
  }
}

export function revert(ws: WebSocket, hash: string, projectRoot: string) {
  try {
    const branch = originalBranch || execSync('git symbolic-ref --short HEAD 2>/dev/null || echo main', { cwd: projectRoot, encoding: 'utf-8' }).trim();
    try { execSync(`git checkout ${branch}`, { cwd: projectRoot, stdio: 'pipe' }); } catch {}
    send(ws, { type: 'version-revert-result', success: true, hash });
    execSync(`git reset --hard ${hash}`, { cwd: projectRoot, stdio: 'pipe' });
    originalBranch = null;
    console.log(`  ⚠ Permanently reverted to ${hash.slice(0, 7)}`);
  } catch (err: any) {
    console.log(`  ✗ Revert failed: ${err.message}`);
    send(ws, { type: 'version-revert-result', success: false, message: err.message });
  }
}
