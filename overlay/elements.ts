import { L } from './constants';
import { toastIn, toastOut, barIn } from './animate';

export function createElements() {
  const root = document.createElement('div');
  root.className = `${L}-root`;
  document.body.appendChild(root);

  const dim = document.createElement('div');
  dim.id = `${L}-dim`;
  root.appendChild(dim);

  const hl = document.createElement('div');
  hl.id = `${L}-hl`;
  root.appendChild(hl);

  const label = document.createElement('div');
  label.id = `${L}-label`;
  root.appendChild(label);

  const toasts = document.createElement('div');
  toasts.id = `${L}-toasts`;
  root.appendChild(toasts);

  const bar = document.createElement('div');
  bar.id = `${L}-bar`;
  bar.innerHTML = `
    <div class="${L}-panel">
      <div class="${L}-ph">
        <div class="${L}-pb">Edit</div>
        <button class="${L}-px"><i class="icon-x"></i></button>
      </div>
      <div class="${L}-ei">
        <div class="${L}-et"></div>
        <div class="${L}-ex"></div>
        <div class="${L}-ep"></div>
      </div>
      <div class="${L}-ia">
        <div class="${L}-ir">
          <textarea class="${L}-in" placeholder="Describe the change..." rows="1"></textarea>
          <button class="${L}-sb"><span class="${L}-st"><i class="icon-arrow-up"></i></span><div class="${L}-sp"></div></button>
        </div>
      </div>
      <div class="${L}-hn"><span><kbd>Enter</kbd> send</span><span><kbd>Esc</kbd> close</span></div>
    </div>
    <div id="${L}-history">
      <div class="${L}-hh">History</div>
      <div class="${L}-he-empty">No edits yet</div>
    </div>
    <div class="${L}-toolbar">
      <div class="${L}-bd"><i class="icon-grip-vertical"></i></div>
      <div class="${L}-bs"></div>
      <button class="${L}-bb ${L}-bbr active" data-tip="Browse"><i class="icon-mouse-pointer-2"></i></button>
      <button class="${L}-bb ${L}-bbe" data-tip="Edit"><i class="icon-square-dashed-mouse-pointer"></i></button>
      <button class="${L}-bb ${L}-bhi" data-tip="History"><i class="icon-clock"></i></button>
    </div>
  `;
  root.appendChild(bar);
  barIn(bar);

  const panel = bar.querySelector(`.${L}-panel`) as HTMLElement;

  return { root, dim, hl, label, panel, toasts, bar };
}

export function isOwn(el: HTMLElement) {
  return !!el.closest(`.${L}-root`);
}

export function toast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
  const c = document.getElementById(`${L}-toasts`)!;
  const el = document.createElement('div');
  el.className = `${L}-toast ${type}`;
  const ic = type === 'success' ? 'icon-circle-check' : type === 'error' ? 'icon-circle-x' : 'icon-info';
  el.innerHTML = `<i class="${ic}"></i><span>${msg}</span>`;
  c.appendChild(el);
  toastIn(el);
  setTimeout(() => { toastOut(el).then(() => el.remove()); }, 3000);
}
