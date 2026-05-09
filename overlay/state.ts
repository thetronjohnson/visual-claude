import { L } from './constants';

export type Mode = 'browse' | 'edit';

const SS_KEY = '__layrr_state';

export function loadState(): any {
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export function saveState(mode: Mode, editCount: number, lastEditTimestamp: number) {
  try {
    const bar = document.getElementById(`${L}-bar`);
    const histOpen = document.getElementById(`${L}-history`)?.classList.contains('open') || false;
    const state: any = { mode, editCount, lastEditTimestamp, historyOpen: histOpen };
    if (bar) {
      const s = bar.style;
      if (s.left && s.top) {
        state.barPos = { left: s.left, top: s.top };
      }
    }
    sessionStorage.setItem(SS_KEY, JSON.stringify(state));
  } catch {}
}

// Shared mutable state
export const app = {
  mode: 'browse' as Mode,
  hoveredEl: null as HTMLElement | null,
  selectedEl: null as HTMLElement | null,
  selectedEls: [] as HTMLElement[],
  multiHighlights: [] as HTMLElement[],
  ws: null as WebSocket | null,
  connected: false,
  editCount: 0,
  lastEdit: null as { tagName: string; instruction: string } | null,
  historyPage: 0,
  activeSendBtn: null as HTMLButtonElement | null,
  hlEl: null as HTMLElement | null,
  labelEl: null as HTMLElement | null,
  panelEl: null as HTMLElement | null,
  barEl: null as HTMLElement | null,
  dimEl: null as HTMLElement | null,
  inputEl: null as HTMLTextAreaElement | null,
  sendBtnEl: null as HTMLButtonElement | null,
  pollTimer: null as ReturnType<typeof setInterval> | null,
  spinnerTimeout: null as ReturnType<typeof setTimeout> | null,
  lastEditTimestamp: 0,
  previewingHash: sessionStorage.getItem('__layrr_preview') || null as string | null,
};

export function initState(saved: any) {
  app.mode = saved.mode || 'browse';
  app.editCount = saved.editCount || 0;
  app.lastEditTimestamp = saved.lastEditTimestamp || 0;
}

export function save() {
  saveState(app.mode, app.editCount, app.lastEditTimestamp);
}
