import { L } from './constants';

// Source mapping via element-source
let _resolveSource: ((node: object) => Promise<{ filePath: string; lineNumber: number | null; columnNumber: number | null; componentName: string | null } | null>) | null = null;

export async function initSourceMapping() {
  try {
    const es = await import('element-source');
    const resolver = es.createSourceResolver({ resolvers: [es.vueResolver, es.svelteResolver, es.solidResolver, es.preactResolver] });
    _resolveSource = resolver.resolveSource;
  } catch {}
}

export async function extractSourceInfo(el: HTMLElement): Promise<{ file: string; line: number; column?: number } | null> {
  if (_resolveSource) {
    try {
      const info = await _resolveSource(el);
      if (info?.filePath && info.lineNumber) {
        return { file: info.filePath, line: info.lineNumber, column: info.columnNumber ?? undefined };
      }
    } catch {}
  }
  // Fallback: manual React fiber / Vue instance extraction
  const fk = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
  if (fk) { let f = (el as any)[fk]; while (f) { if (f._debugSource) return { file: f._debugSource.fileName, line: f._debugSource.lineNumber, column: f._debugSource.columnNumber }; f = f.return; } }
  const v = (el as any).__vueParentComponent;
  if (v?.type?.__file) return { file: v.type.__file, line: 1 };
  return null;
}

export function getTag(el: HTMLElement) {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const cls = el.className && typeof el.className === 'string'
    ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
  return `<${tag}${id}${cls}>`;
}

export function getBreadcrumb(el: HTMLElement) {
  const p: string[] = [];
  let c: HTMLElement | null = el;
  while (c && c !== document.body && p.length < 4) {
    p.unshift(c.tagName.toLowerCase() + (c.id ? `#${c.id}` : ''));
    c = c.parentElement;
  }
  return p.join(' › ');
}

export function getSelector(el: HTMLElement) {
  if (el.id) return `#${el.id}`;
  const parts: string[] = [];
  let cur: HTMLElement | null = el;
  while (cur && cur !== document.body) {
    let sel = cur.tagName.toLowerCase();
    if (cur.id) { parts.unshift(`#${cur.id}`); break; }
    if (cur.className && typeof cur.className === 'string') { const c = cur.className.trim().split(/\s+/).slice(0, 2).join('.'); if (c) sel += `.${c}`; }
    const p = cur.parentElement;
    if (p) { const sibs = Array.from(p.children).filter(c => c.tagName === cur!.tagName); if (sibs.length > 1) sel += `:nth-of-type(${sibs.indexOf(cur) + 1})`; }
    parts.unshift(sel); cur = cur.parentElement;
  }
  return parts.join(' > ');
}

export function posHL(el: HTMLElement, hl: HTMLElement) {
  const r = el.getBoundingClientRect();
  hl.style.borderRadius = getComputedStyle(el).borderRadius || '2px';
  Object.assign(hl.style, { left: `${r.left - 1}px`, top: `${r.top - 1}px`, width: `${r.width + 2}px`, height: `${r.height + 2}px`, display: 'block' });
}

export function posLabel(el: HTMLElement, lbl: HTMLElement) {
  const r = el.getBoundingClientRect();
  lbl.textContent = getTag(el);
  let top = r.top - 22; if (top < 4) top = r.bottom + 4;
  Object.assign(lbl.style, { left: `${r.left}px`, top: `${top}px`, display: 'block' });
}
