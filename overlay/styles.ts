import { L, C } from './constants';

export function loadFonts() {
  const container = document.createElement('div');
  container.id = `${L}-fonts`;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/__layrr__/fonts/lucide.css';
  container.appendChild(link);

  const s = document.createElement('style');
  s.textContent = `
    @font-face{font-family:"lucide";src:url("/__layrr__/fonts/lucide.woff2") format("woff2"),url("/__layrr__/fonts/lucide.woff") format("woff");font-weight:normal;font-style:normal;font-display:block}
    @font-face{font-family:"Geist Mono";src:url("/__layrr__/fonts/GeistMono-Regular.woff2") format("woff2");font-weight:400;font-style:normal;font-display:swap}
    @font-face{font-family:"Geist Mono";src:url("/__layrr__/fonts/GeistMono-Medium.woff2") format("woff2");font-weight:500;font-style:normal;font-display:swap}
  `;
  container.appendChild(s);
  document.head.appendChild(container);
}

// ---- Design tokens ----
const ease = 'cubic-bezier(.2,.8,.2,1)';
const transition = `all .12s ease`;
const mono = `'Geist Mono',monospace`;
const radius = { sm: '4px', md: '6px', lg: '8px', xl: '14px', full: '50%' };
const shadow = {
  sm: `0 2px 8px rgba(0,0,0,.3)`,
  md: `0 4px 16px rgba(0,0,0,.3)`,
  lg: `0 4px 20px rgba(0,0,0,.35)`,
  xl: `0 8px 24px rgba(0,0,0,.35)`,
};
const size = { xs: '9px', sm: '10px', md: '11px', base: '12px', lg: '13px', xl: '14px' };

export function injectStyles() {
  const s = document.createElement('style');
  s.id = `${L}-styles`;
  s.textContent = `
    /* ---- Animations (CSS fallbacks for class-toggle states; motion.js handles enter/exit) ---- */
    @keyframes ${L}-pulse{0%,100%{opacity:1}50%{opacity:.35}}
    @keyframes ${L}-spin{to{transform:rotate(360deg)}}
    @keyframes ${L}-glow{0%,100%{box-shadow:0 0 0 0 ${C.hlGlow}}50%{box-shadow:0 0 0 5px rgba(59,130,246,0)}}

    /* ---- Reset ---- */
    .${L}-root *{box-sizing:border-box;margin:0;padding:0}
    .${L}-root{font-family:${mono};line-height:1.4;font-size:${size.lg}}
    .${L}-root [class^="icon-"],.${L}-root [class*=" icon-"]{font-family:'lucide'!important;font-style:normal;-webkit-font-smoothing:antialiased}

    /* ---- Primitives: Icon Button ---- */
    .${L}-icon-btn{
      border:none;border-radius:${radius.md};background:transparent;
      color:${C.textDim};cursor:pointer;display:flex;align-items:center;justify-content:center;
      transition:${transition};
    }
    .${L}-icon-btn:hover{background:${C.surface};color:${C.textMuted}}
    .${L}-icon-btn:active{transform:scale(.95)}
    .${L}-icon-btn.danger:hover{background:rgba(251,113,133,.1);color:${C.error}}
    .${L}-icon-btn:disabled{opacity:.25;cursor:default;transform:none}

    /* ---- Primitives: Tag / Badge ---- */
    .${L}-tag{
      display:inline-block;font-size:${size.xs};font-weight:700;text-transform:uppercase;letter-spacing:.04em;
      padding:1px 5px;border-radius:${radius.sm};vertical-align:middle;
    }
    .${L}-badge{
      display:inline-flex;align-items:center;justify-content:center;
      background:${C.btnBg};color:${C.accent};
      font-size:${size.sm};font-weight:700;min-width:18px;height:18px;
      border-radius:9px;padding:0 5px;
    }

    /* ---- Primitives: Panel (flyout from bar) ---- */
    .${L}-flyout{
      display:none;width:320px;max-height:280px;overflow-y:auto;
      border-top:1px solid ${C.panelBorder};
      border-radius:${radius.xl} ${radius.xl} 0 0;
    }
    .${L}-flyout.open{display:block}

    /* ---- Primitives: Panel Header ---- */
    .${L}-panel-header{
      display:flex;align-items:center;justify-content:space-between;
      padding:8px 10px 0;user-select:none;
      font-size:${size.sm};font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${C.textMuted};
    }

    /* ---- Primitives: Close Button (small X) ---- */
    .${L}-close{
      width:22px;height:22px;border-radius:${radius.md};border:none;background:transparent;
      color:${C.textDim};cursor:pointer;display:flex;align-items:center;justify-content:center;
      font-size:${size.lg};transition:${transition};margin-left:auto;
    }
    .${L}-close:hover{background:${C.surface};color:${C.textMuted}}
    .${L}-close:active{transform:scale(.95)}

    /* ---- Primitives: Surface Card ---- */
    .${L}-card{
      background:${C.surface};border:1px solid ${C.border};border-radius:${radius.lg};
    }

    /* ---- Primitives: Text ---- */
    .${L}-text{color:${C.text};font-size:${size.base}}
    .${L}-text-muted{color:${C.textMuted};font-size:${size.md}}
    .${L}-text-dim{color:${C.textDim};font-size:${size.sm}}
    .${L}-text-mono{font-family:${mono}}
    .${L}-text-truncate{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

    /* ---- Primitives: Confirm Overlay ---- */
    .${L}-confirm-overlay{
      position:absolute;inset:0;background:#18181b;
      display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;
      border-radius:${radius.xl} ${radius.xl} 0 0;z-index:10;padding:16px;
    }
    .${L}-confirm-msg{font-size:${size.base};color:${C.textMuted};text-align:center;line-height:1.5}
    .${L}-confirm-actions{display:flex;gap:8px}
    .${L}-confirm-actions button{
      padding:5px 14px;border-radius:${radius.md};border:none;font-size:${size.md};font-weight:600;
      font-family:${mono};cursor:pointer;transition:${transition};
    }
    .${L}-confirm-actions button:active{transform:scale(.95)}
    .${L}-confirm-cancel{background:${C.btnBg};color:${C.textMuted}}
    .${L}-confirm-cancel:hover{background:${C.btnHover}}
    .${L}-confirm-yes{background:rgba(251,113,133,.15);color:${C.error}}
    .${L}-confirm-yes:hover{background:rgba(251,113,133,.25)}

    /* ==== Components ==== */

    /* ---- Dim overlay ---- */
    #${L}-dim{position:fixed;inset:0;z-index:999996;pointer-events:none;background:rgba(0,0,0,.06);opacity:0;transition:opacity .3s ease}
    #${L}-dim.active{opacity:1}

    /* ---- Element highlight ---- */
    #${L}-hl{
      position:fixed;pointer-events:none;z-index:999997;
      border:1.5px solid ${C.hl};border-radius:2px;background:${C.hlBg};
      transition:all 60ms ease;display:none;
    }
    #${L}-hl.selected{border-color:${C.hl};background:rgba(161,161,170,.08);animation:${L}-glow 2s ease infinite}
    .${L}-mhl{
      position:fixed;pointer-events:none;z-index:999997;
      border:1.5px solid ${C.hl};border-radius:2px;background:rgba(161,161,170,.08);
      animation:${L}-glow 2s ease infinite;
    }

    /* ---- Element label tooltip ---- */
    #${L}-label{
      position:fixed;pointer-events:none;z-index:999998;
      background:${C.panel};color:${C.textMuted};
      font-size:${size.sm};font-family:${mono};
      padding:2px 7px;border-radius:${radius.sm};white-space:nowrap;display:none;
      box-shadow:${shadow.sm};border:1px solid ${C.border};
    }

    /* ---- Toasts ---- */
    #${L}-toasts{position:fixed;bottom:56px;right:16px;z-index:999999;display:flex;flex-direction:column-reverse;gap:6px}
    .${L}-toast{
      padding:7px 12px;border-radius:${radius.lg};font-size:${size.base};font-weight:500;
      font-family:${mono};
      box-shadow:${shadow.md};
      backdrop-filter:blur(10px);display:flex;align-items:center;gap:6px;max-width:240px;
    }
    .${L}-toast.success{background:rgba(6,78,59,.9);color:${C.success};border:1px solid rgba(52,211,153,.1)}
    .${L}-toast.error{background:rgba(127,29,29,.9);color:${C.error};border:1px solid rgba(251,113,133,.1)}
    .${L}-toast.info{background:${C.panel};color:${C.textMuted};border:1px solid ${C.border}}
    .${L}-toast i{font-size:${size.xl};flex-shrink:0}

    /* ---- Bar + Toolbar ---- */
    #${L}-bar{
      position:fixed;bottom:16px;right:16px;z-index:999999;
      display:flex;flex-direction:column;justify-content:flex-end;
      background:${C.panel};
      backdrop-filter:blur(16px) saturate(1.2);-webkit-backdrop-filter:blur(16px) saturate(1.2);
      border:1px solid ${C.panelBorder};border-radius:${radius.xl};
      box-shadow:${shadow.lg};
      user-select:none;
      transition:box-shadow .12s,border-color .12s;
    }
    #${L}-bar:not(.expanded){border-radius:50px}
    #${L}-bar.expanded{overflow:hidden;border-radius:14px}
    #${L}-bar:hover{border-color:rgba(148,163,184,.16)}
    #${L}-bar.dragging{box-shadow:0 8px 32px rgba(0,0,0,.45),0 0 0 1px rgba(161,161,170,.15);cursor:grabbing}
    .${L}-toolbar{display:flex;align-items:center;padding:5px;height:40px}
    .${L}-bd{display:flex;align-items:center;justify-content:center;width:20px;height:30px;cursor:grab;color:${C.textDim};font-size:${size.xl};transition:color .12s;flex-shrink:0}
    .${L}-bd:hover{color:${C.textMuted}}
    .${L}-bd:active{cursor:grabbing}
    .${L}-bs{width:1px;height:18px;background:${C.border};margin:0 2px}

    /* ---- Toolbar buttons ---- */
    .${L}-bb{
      width:30px;height:30px;border:none;border-radius:${radius.full};padding:0;
      font-size:${size.xl};cursor:pointer;outline:none;
      transition:${transition};display:flex;align-items:center;justify-content:center;
      position:relative;gap:0;
    }
    .${L}-bb::after{
      content:attr(data-tip);position:absolute;bottom:calc(100% + 10px);left:50%;
      transform:translateX(-50%) translateY(4px);
      background:${C.panel};color:${C.textMuted};
      font-size:${size.md};font-weight:500;letter-spacing:.01em;font-family:${mono};
      padding:5px 10px;border-radius:${radius.lg};white-space:nowrap;
      border:1px solid ${C.panelBorder};box-shadow:${shadow.xl};backdrop-filter:blur(12px);
      opacity:0;pointer-events:none;
      transition:opacity .15s ease,transform .15s ${ease};
    }
    .${L}-bb:hover::after{opacity:1;transform:translateX(-50%) translateY(0)}
    .${L}-bbr{background:transparent;color:${C.textDim}}
    .${L}-bbr.active{background:${C.surface};color:${C.text}}
    .${L}-bbr:hover:not(.active){color:${C.textMuted};transform:scale(1.02)}
    .${L}-bbr:active{transform:scale(.97)}
    .${L}-bbe{background:transparent;color:${C.textDim}}
    .${L}-bbe.active{background:${C.btnBg};color:${C.white}}
    .${L}-bbe:hover:not(.active){color:${C.textMuted};transform:scale(1.02)}
    .${L}-bbe:active{transform:scale(.97)}
    .${L}-bhi{background:transparent;color:${C.textDim}}
    .${L}-bhi:hover{color:${C.textMuted};transform:scale(1.02)}
    .${L}-bhi:active{transform:scale(.97)}
    .${L}-bhi.open{background:${C.surface};color:${C.text}}

    /* ---- Edit panel ---- */
    .${L}-panel{
      display:none;width:320px;max-height:280px;overflow-y:auto;
      border-top:1px solid ${C.panelBorder};
      border-radius:${radius.xl} ${radius.xl} 0 0;
    }
    .${L}-panel.open{display:block}
    .${L}-ph{display:flex;align-items:center;justify-content:space-between;padding:8px 10px 0;user-select:none}
    .${L}-pb{display:flex;align-items:center;gap:5px;font-size:${size.sm};font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${C.textMuted}}
    .${L}-pb i{font-size:${size.base}}
    .${L}-px{
      width:22px;height:22px;border-radius:${radius.md};border:none;background:transparent;
      color:${C.textDim};cursor:pointer;display:flex;align-items:center;justify-content:center;
      font-size:${size.lg};transition:${transition};
    }
    .${L}-px:hover{background:${C.surface};color:${C.textMuted}}
    .${L}-px:active{transform:scale(.95)}
    .${L}-ei{margin:6px 10px;padding:6px 8px;background:${C.surface};border:1px solid ${C.border};border-radius:${radius.lg}}
    .${L}-eh{font-size:${size.md};color:${C.textDim};text-align:center;padding:8px 4px}
    .${L}-eh kbd{background:${C.bg};border:1px solid ${C.border};border-radius:3px;padding:1px 4px;font-size:${size.sm};font-family:${mono}}
    .${L}-et{font-family:${mono};font-size:${size.md};color:${C.hl}}
    .${L}-ex{font-size:${size.sm};color:${C.textDim};margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .${L}-ep{font-size:${size.xs};color:${C.accent};margin-top:2px;font-family:${mono};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .${L}-ia{padding:0 10px 8px}
    .${L}-ir{display:flex;gap:6px;align-items:stretch}
    .${L}-in{
      flex:1;background:${C.surface};border:1px solid ${C.border};
      border-radius:${radius.lg};padding:7px 10px;color:${C.text};font-size:${size.base};
      outline:none;font-family:inherit;resize:none;
      transition:border-color .12s,box-shadow .12s;
      min-height:30px;max-height:72px;
    }
    .${L}-in:focus{border-color:rgba(161,161,170,.4);box-shadow:0 0 0 2px rgba(161,161,170,.08)}
    .${L}-in::placeholder{color:${C.textDim}}
    .${L}-sb{
      background:${C.btnBg};border:none;border-radius:${radius.full};
      width:30px;height:30px;padding:0;color:${C.white};font-size:${size.xl};cursor:pointer;
      transition:${transition};
      display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;flex-shrink:0;
    }
    .${L}-sb:hover{background:${C.btnHover};transform:translateY(-1px)}
    .${L}-sb:active{transform:translateY(0) scale(.97)}
    .${L}-sb:disabled{opacity:.35;cursor:not-allowed;transform:none}
    .${L}-sb.loading{background:${C.accentHover};animation:${L}-pulse 1.2s ease infinite}
    .${L}-sp{width:12px;height:12px;border:1.5px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:${radius.full};animation:${L}-spin .5s linear infinite;display:none}
    .${L}-sb.loading .${L}-sp{display:block}
    .${L}-sb.loading .${L}-st{display:none}
    .${L}-hn{padding:0 10px 6px;font-size:${size.xs};color:${C.textDim};display:flex;gap:10px}
    .${L}-hn kbd{background:${C.surface};border-radius:3px;padding:1px 4px;font-family:inherit;font-size:${size.xs};border:1px solid ${C.border};color:${C.accent}}

    /* ---- Multi-select ---- */
    .${L}-sel-count{
      display:inline-flex;align-items:center;justify-content:center;
      background:${C.btnBg};color:${C.accent};
      font-size:${size.sm};font-weight:700;min-width:18px;height:18px;
      border-radius:9px;padding:0 5px;margin-left:6px;
    }
    .${L}-ei-multi{padding:10px 10px 4px;max-height:100px;overflow-y:auto}
    .${L}-ei-item{font-family:${mono};font-size:${size.sm};color:${C.hl};padding:2px 0;display:flex;align-items:center;gap:6px}
    .${L}-ei-rm{
      background:none;border:none;color:${C.textDim};cursor:pointer;
      font-size:${size.md};padding:0 2px;font-family:'lucide'!important;font-style:normal;
      -webkit-font-smoothing:antialiased;transition:color .12s;
    }
    .${L}-ei-rm:hover{color:${C.error}}

    /* ---- History panel ---- */
    #${L}-history{
      display:none;width:320px;max-height:280px;overflow-y:auto;
      border-top:1px solid ${C.panelBorder};
      border-radius:${radius.xl} ${radius.xl} 0 0;
    }
    #${L}-history.open{display:block}
    .${L}-hh{
      display:flex;align-items:center;justify-content:space-between;
      padding:8px 10px 0;font-size:${size.sm};font-weight:700;
      text-transform:uppercase;letter-spacing:.06em;color:${C.textMuted};
    }
    .${L}-hh-close{
      width:22px;height:22px;border-radius:${radius.md};border:none;background:transparent;
      color:${C.textDim};cursor:pointer;display:flex;align-items:center;justify-content:center;
      font-size:${size.lg};transition:${transition};margin-left:auto;
    }
    .${L}-hh-close:hover{background:${C.surface};color:${C.textMuted}}
    .${L}-hh-close:active{transform:scale(.95)}
    .${L}-hh-nav{display:flex;align-items:center;gap:2px}
    .${L}-hh-nav button{background:none;border:none;color:${C.textDim};font-size:${size.lg};cursor:pointer;padding:2px 5px;border-radius:${radius.sm};line-height:1;transition:color .12s,background .12s;font-family:'lucide'!important;font-style:normal;-webkit-font-smoothing:antialiased}
    .${L}-hh-nav button:hover:not(:disabled){color:${C.textMuted};background:${C.surface}}
    .${L}-hh-nav button:disabled{opacity:.25;cursor:default}
    .${L}-he-list{margin:6px 10px 10px;background:${C.surface};border:1px solid ${C.border};border-radius:${radius.lg};overflow:hidden}
    .${L}-he{padding:8px 10px;border-bottom:1px solid ${C.border};font-size:${size.base};color:${C.text};display:flex;align-items:center;gap:8px}
    .${L}-he:last-child{border-bottom:none}
    .${L}-he-body{flex:1;min-width:0}
    .${L}-he-el{font-family:${mono};font-size:${size.sm};color:${C.textDim};margin-top:2px}
    .${L}-he-inst{color:${C.textMuted};font-size:${size.md};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .${L}-he.active .${L}-he-inst{color:${C.success}}
    .${L}-he-tag{
      display:inline-block;font-size:${size.xs};font-weight:700;text-transform:uppercase;letter-spacing:.04em;
      padding:1px 5px;border-radius:${radius.sm};margin-left:6px;vertical-align:middle;
    }
    .${L}-he-tag.latest{background:${C.surface};color:${C.textDim}}
    .${L}-he.active .${L}-he-tag.latest{background:rgba(74,222,128,.12);color:${C.success}}
    .${L}-he.clickable{cursor:pointer}
    .${L}-he.clickable:hover{background:rgba(161,161,170,.06)}
    .${L}-he-actions{display:flex;gap:3px;flex-shrink:0}
    .${L}-he-btn{
      width:24px;height:24px;border:none;border-radius:${radius.md};
      background:transparent;color:${C.textDim};cursor:pointer;
      display:flex;align-items:center;justify-content:center;font-size:${size.base};
      transition:${transition};
    }
    .${L}-he-btn:hover{background:${C.surface};color:${C.textMuted}}
    .${L}-he-btn:active{transform:scale(.9)}
    .${L}-he-btn.danger:hover{background:rgba(251,113,133,.1);color:${C.error}}
    .${L}-he-empty{padding:20px 14px;text-align:center;color:${C.textDim};font-size:${size.base};margin:6px 10px 10px}
  `;
  document.head.appendChild(s);
}

export function ensureStyles() {
  if (!document.getElementById(`${L}-styles`)) injectStyles();
  if (!document.getElementById(`${L}-fonts`)) loadFonts();
}
