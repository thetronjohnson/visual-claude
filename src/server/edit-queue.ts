import type { SourceLocation } from '../editor/source-mapper.js';

export interface ElementEditInfo {
  tagName: string;
  className: string;
  textContent: string;
  selector: string;
  sourceLocation: SourceLocation | null;
}

export interface PendingEditRequest {
  instruction: string;
  tagName: string;
  className: string;
  textContent: string;
  selector: string;
  sourceLocation: SourceLocation | null;
  elements?: ElementEditInfo[];
}

type EditResolver = (request: PendingEditRequest) => void;
type WsNotifier = (success: boolean, message?: string) => void;

export interface EditResult {
  success: boolean;
  message: string;
  timestamp: number;
}

class EditQueue {
  private waitingResolver: EditResolver | null = null;
  private wsNotifier: WsNotifier | null = null;
  private _lastResult: EditResult | null = null;
  private _projectRoot: string = '';

  get lastResult(): EditResult | null {
    return this._lastResult;
  }

  set projectRoot(root: string) {
    this._projectRoot = root;
  }

  push(request: PendingEditRequest) {
    if (this.waitingResolver) {
      const resolve = this.waitingResolver;
      this.waitingResolver = null;
      resolve(request);
    }
  }

  waitForNext(): Promise<PendingEditRequest> {
    return new Promise((resolve) => {
      this.waitingResolver = resolve;
    });
  }

  setWsNotifier(notifier: WsNotifier) {
    this.wsNotifier = notifier;
  }

  notifyComplete(success: boolean, message?: string) {
    this._lastResult = {
      success,
      message: message || (success ? 'Edit applied!' : 'Edit failed'),
      timestamp: Date.now(),
    };
    if (this.wsNotifier) {
      this.wsNotifier(success, message);
    }
  }
}

export const editQueue = new EditQueue();
