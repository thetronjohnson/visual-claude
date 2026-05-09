import type { WebSocket } from 'ws';
import { resolveSource } from '../editor/source-mapper.js';
import { editQueue } from './edit-queue.js';
import { preview, restore, revert } from './version.js';

interface ElementInfo {
  selector: string;
  tagName: string;
  className: string;
  textContent: string;
  sourceInfo?: { file: string; line: number; column?: number };
}

interface EditRequestMsg {
  type: 'edit-request';
  selector: string;
  tagName: string;
  className: string;
  textContent: string;
  instruction: string;
  sourceInfo?: { file: string; line: number; column?: number };
  elements?: ElementInfo[];
}

let activeWs: WebSocket | null = null;

editQueue.setWsNotifier((success, message) => {
  if (!activeWs || activeWs.readyState !== activeWs.OPEN) return;
  try {
    activeWs.send(JSON.stringify({
      type: 'edit-result',
      success,
      message: message || (success ? 'Edit applied!' : 'Edit failed'),
    }));
  } catch {}
});

async function handleEditRequest(editMsg: EditRequestMsg, projectRoot: string) {
  if (editMsg.elements && editMsg.elements.length > 1) {
    const resolvedElements = await Promise.all(
      editMsg.elements.map(async (el) => ({
        tagName: el.tagName,
        className: el.className,
        textContent: el.textContent,
        selector: el.selector,
        sourceLocation: await resolveSource({
          selector: el.selector,
          tagName: el.tagName,
          className: el.className,
          textContent: el.textContent,
          sourceInfo: el.sourceInfo,
          projectRoot,
        }),
      }))
    );

    editQueue.push({
      instruction: editMsg.instruction,
      tagName: editMsg.tagName,
      className: editMsg.className,
      textContent: editMsg.textContent,
      selector: editMsg.selector,
      sourceLocation: resolvedElements[0].sourceLocation,
      elements: resolvedElements,
    });
  } else {
    const sourceLocation = await resolveSource({
      selector: editMsg.selector,
      tagName: editMsg.tagName,
      className: editMsg.className,
      textContent: editMsg.textContent,
      sourceInfo: editMsg.sourceInfo,
      projectRoot,
    });

    editQueue.push({
      instruction: editMsg.instruction,
      tagName: editMsg.tagName,
      className: editMsg.className,
      textContent: editMsg.textContent,
      selector: editMsg.selector,
      sourceLocation,
    });
  }
}

export function handleWsConnection(ws: WebSocket, projectRoot: string) {
  activeWs = ws;

  ws.on('close', () => {
    if (activeWs === ws) activeWs = null;
  });

  ws.on('message', async (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString());

      switch (msg.type) {
        case 'edit-request':
          await handleEditRequest(msg as EditRequestMsg, projectRoot);
          break;
        case 'version-preview':
          preview(ws, msg.hash, projectRoot);
          break;
        case 'version-restore':
          restore(ws, projectRoot);
          break;
        case 'version-revert':
          revert(ws, msg.hash, projectRoot);
          break;
      }
    } catch (err) {
      console.error('[layrr] Error handling WS message:', err);
    }
  });
}
