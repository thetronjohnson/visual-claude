import { L } from './constants';
import { app } from './state';
import { toast } from './elements';
import { listIn, animateHeight, confirmIn, confirmOut, barCollapse, btnActivate, btnDeactivate } from './animate';

let lastPage = -1;

export async function fetchAndRenderHistory() {
  const container = document.getElementById(`${L}-history`);
  if (!container) return;
  try {
    const prefix = (window as any).__LAYRR_PATH_PREFIX__ || '';
    const resp = await fetch(`${prefix}/__layrr__/history`);
    const data: { head: string; commits: Array<{ hash: string; message: string; timeAgo: string }> } = await resp.json();
    if (data.commits.length === 0) {
      container.innerHTML = `<div class="${L}-hh"><span>History</span><button class="${L}-hh-close"><i class="icon-x"></i></button></div><div class="${L}-he-empty">No edits yet</div>`;
      container.querySelector(`.${L}-hh-close`)?.addEventListener('click', () => closeHistory());
      return;
    }
    const PAGE_SIZE = 5;
    const totalPages = Math.ceil(data.commits.length / PAGE_SIZE);
    if (app.historyPage >= totalPages) app.historyPage = totalPages - 1;
    const start = app.historyPage * PAGE_SIZE;
    const page = data.commits.slice(start, start + PAGE_SIZE);

    const nav = totalPages > 1
      ? `<div class="${L}-hh-nav">` +
        `<button class="${L}-hh-prev"${app.historyPage === 0 ? ' disabled' : ''}><i class="icon-chevron-left"></i></button>` +
        `<button class="${L}-hh-next"${app.historyPage >= totalPages - 1 ? ' disabled' : ''}><i class="icon-chevron-right"></i></button>` +
        `</div>` : '';

    const latestHash = data.commits[0]?.hash;
    const isPreviewingOlder = app.previewingHash && app.previewingHash !== latestHash;

    let html = `<div class="${L}-hh"><span>History (${data.commits.length})</span>${nav}<button class="${L}-hh-close"><i class="icon-x"></i></button></div>`;

    html += `<div class="${L}-he-list">`;
    html += page.map((c, i) => {
      const isLatest = c.hash === latestHash;
      const isActive = app.previewingHash ? c.hash === app.previewingHash : c.hash === data.head && i === 0;
      const clickable = !isActive;
      const cls = (isActive ? 'active' : '') + (clickable ? ' clickable' : '');

      let tag = '';
      if (isLatest) tag = `<span class="${L}-he-tag latest">latest</span>`;

      const actions = isLatest ? '' :
        `<button class="${L}-he-btn danger" data-action="revert" data-hash="${c.hash}" title="Revert to this version"><i class="icon-rotate-ccw"></i></button>`;

      return `<div class="${L}-he ${cls}" data-hash="${c.hash}">` +
        `<div class="${L}-he-body">` +
          `<div class="${L}-he-inst">${c.message}${tag}</div>` +
          `<div class="${L}-he-el">${c.timeAgo}</div>` +
        `</div>` +
        `<div class="${L}-he-actions">${actions}</div>` +
      `</div>`;
    }).join('') + '</div>';
    const bar = document.getElementById(`__layrr-bar`);
    const direction = app.historyPage > lastPage ? 'down' : 'up';
    lastPage = app.historyPage;
    if (bar && bar.classList.contains('expanded')) {
      animateHeight(bar, () => { container.innerHTML = html; });
    } else {
      container.innerHTML = html;
    }
    listIn(`.${L}-he`, container, direction);

    // Wire up events
    container.querySelector(`.${L}-hh-prev`)?.addEventListener('click', () => { app.historyPage--; fetchAndRenderHistory(); });
    container.querySelector(`.${L}-hh-next`)?.addEventListener('click', () => { app.historyPage++; fetchAndRenderHistory(); });
    container.querySelector(`.${L}-hh-close`)?.addEventListener('click', () => closeHistory());

    // Click row to preview that version (or restore to latest)
    container.querySelectorAll(`.${L}-he.clickable`).forEach(row => {
      row.addEventListener('click', () => {
        const hash = (row as HTMLElement).dataset.hash;
        if (!hash || !app.ws || app.ws.readyState !== WebSocket.OPEN) return;
        if (hash === latestHash && isPreviewingOlder) {
          app.ws.send(JSON.stringify({ type: 'version-restore' }));
        } else {
          app.ws.send(JSON.stringify({ type: 'version-preview', hash }));
        }
      });
    });

    // Revert buttons
    container.querySelectorAll(`.${L}-he-btn`).forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const hash = (btn as HTMLElement).dataset.hash;
        if (!hash || !app.ws || app.ws.readyState !== WebSocket.OPEN) return;
        showRevertConfirm(container, hash);
      });
    });
  } catch {
    container.innerHTML = `<div class="${L}-hh"><span>History</span><button class="${L}-hh-close"><i class="icon-x"></i></button></div><div class="${L}-he-empty">Could not load history</div>`;
    container.querySelector(`.${L}-hh-close`)?.addEventListener('click', () => closeHistory());
  }
}

function showRevertConfirm(container: HTMLElement, hash: string) {
  const overlay = document.createElement('div');
  overlay.className = `${L}-confirm-overlay`;
  overlay.innerHTML = `
    <div class="${L}-confirm-msg">Revert to this version?<br>All edits after this point will be lost.</div>
    <div class="${L}-confirm-actions">
      <button class="${L}-confirm-cancel">Cancel</button>
      <button class="${L}-confirm-yes">Revert</button>
    </div>
  `;
  container.style.position = 'relative';
  container.appendChild(overlay);
  confirmIn(overlay);
  overlay.querySelector(`.${L}-confirm-cancel`)?.addEventListener('click', () => {
    confirmOut(overlay).then(() => overlay.remove());
  });
  overlay.querySelector(`.${L}-confirm-yes`)?.addEventListener('click', () => {
    if (app.ws?.readyState === WebSocket.OPEN) {
      app.ws.send(JSON.stringify({ type: 'version-revert', hash }));
    }
    confirmOut(overlay).then(() => overlay.remove());
  });
}

export function closeHistory() {
  const histPanel = document.getElementById(`${L}-history`);
  const bar = document.getElementById(`${L}-bar`);
  const histBtn = bar?.querySelector(`.${L}-bhi`) as HTMLElement;
  const browseBtn = bar?.querySelector(`.${L}-bbr`) as HTMLElement;
  if (histBtn) { histBtn.classList.remove('open'); btnDeactivate(histBtn); }
  if (browseBtn) { browseBtn.classList.add('active'); btnActivate(browseBtn, 'rgba(228,228,231,.05)', '#fafafa'); }
  if (histPanel && bar) {
    barCollapse(bar, histPanel);
  }
}
