(async function () {
  if ((window as any).__LAYRR_LOADED__) return;
  (window as any).__LAYRR_LOADED__ = true;

  const WS_PORT = location.port; // empty on standard ports (443/80) — that's correct
  // Detect path prefix when accessed via /preview/{slug}/ proxy
  const previewMatch = location.pathname.match(/^(\/preview\/[^/]+)/);
  const PATH_PREFIX = previewMatch ? previewMatch[1] : '';
  (window as any).__LAYRR_PATH_PREFIX__ = PATH_PREFIX;

  const { L } = await import('./constants');
  const { ensureStyles } = await import('./styles');
  const { createElements, isOwn, toast } = await import('./elements');
  const { app, loadState, initState, save } = await import('./state');
  const { initSourceMapping, extractSourceInfo, getTag, getBreadcrumb, getSelector, posHL, posLabel } = await import('./source');
  const { fetchAndRenderHistory, closeHistory } = await import('./history');
  const { barExpand, barCollapse, contentSwap, contentFadeIn, multiSelectIn, animateHeight, dimIn, dimOut, btnActivate, btnDeactivate } = await import('./animate');

  // Toolbar button colors (match CSS)
  const BTN = {
    browseBg: 'rgba(228,228,231,.05)', browseColor: '#fafafa',
    editBg: 'rgba(250,250,250,.12)', editColor: '#fafafa',
    histBg: 'rgba(228,228,231,.05)', histColor: '#fafafa',
  };

  function activateBrowse(br: HTMLElement, ed: HTMLElement) {
    br.classList.add('active'); btnActivate(br, BTN.browseBg, BTN.browseColor);
    ed.classList.remove('active'); btnDeactivate(ed);
  }

  function activateEdit(br: HTMLElement, ed: HTMLElement) {
    br.classList.remove('active'); btnDeactivate(br);
    ed.classList.add('active'); btnActivate(ed, BTN.editBg, BTN.editColor);
  }

  function activateHistory(br: HTMLElement, ed: HTMLElement, hi: HTMLElement) {
    br.classList.remove('active'); btnDeactivate(br);
    ed.classList.remove('active'); btnDeactivate(ed);
    hi.classList.add('open'); btnActivate(hi, BTN.histBg, BTN.histColor);
  }

  function deactivateHistory(hi: HTMLElement) {
    hi.classList.remove('open'); btnDeactivate(hi);
  }

  await initSourceMapping();

  const saved = loadState();
  initState(saved);

  // ---- Panel helpers ----
  function showPanel(panel: HTMLElement) {
    const bar = document.getElementById(`${L}-bar`);
    if (!bar) return;

    const hp = document.getElementById(`${L}-history`);
    bar.querySelector(`.${L}-bhi`)?.classList.remove('open');

    // If history is open, swap content (bar stays expanded)
    if (hp?.classList.contains('open')) {
      contentSwap(bar, hp, panel);
      return;
    }

    // Expand bar with animation
    barExpand(bar, panel);
  }

  function showHistory(histPanel: HTMLElement, bar: HTMLElement) {
    const panel = app.panelEl;
    bar.querySelector(`.${L}-bhi`)?.classList.add('open');

    // If edit panel is open, swap content (bar stays expanded)
    if (panel?.classList.contains('open')) {
      contentSwap(bar, panel, histPanel);
      return;
    }

    // Expand bar with animation
    barExpand(bar, histPanel);
  }

  function hidePanel(panel: HTMLElement) {
    const bar = document.getElementById(`${L}-bar`);
    if (!bar) return;
    const histOpen = document.getElementById(`${L}-history`)?.classList.contains('open');
    if (histOpen) {
      // Just hide the panel, bar stays expanded for history
      panel.classList.remove('open');
      panel.style.cssText = '';
      return;
    }
    // Collapse bar with animation
    barCollapse(bar, panel);
  }

  function hideHistory(histPanel: HTMLElement) {
    const bar = document.getElementById(`${L}-bar`);
    if (!bar) return;
    const panelOpen = app.panelEl?.classList.contains('open');
    if (panelOpen) {
      histPanel.classList.remove('open');
      histPanel.style.cssText = '';
      return;
    }
    barCollapse(bar, histPanel);
  }

  // ---- Multi-select helpers ----
  function clearMultiHighlights() {
    app.multiHighlights.forEach(h => h.remove());
    app.multiHighlights = [];
  }

  function updateMultiHighlights() {
    clearMultiHighlights();
    const root = document.querySelector(`.${L}-root`);
    if (!root) return;
    for (const el of app.selectedEls) {
      const mhl = document.createElement('div');
      mhl.className = `${L}-mhl`;
      const r = el.getBoundingClientRect();
      mhl.style.borderRadius = getComputedStyle(el).borderRadius || '2px';
      Object.assign(mhl.style, { left: `${r.left - 1}px`, top: `${r.top - 1}px`, width: `${r.width + 2}px`, height: `${r.height + 2}px` });
      root.appendChild(mhl);
      app.multiHighlights.push(mhl);
    }
  }

  function clearSelection() {
    app.selectedEl = null;
    app.selectedEls = [];
    clearMultiHighlights();
    if (app.hlEl) { app.hlEl.style.display = 'none'; app.hlEl.classList.remove('selected'); }
    if (app.labelEl) app.labelEl.style.display = 'none';
    if (app.mode === 'edit' && app.panelEl) {
      updatePanelForSelection();
    } else if (app.panelEl) {
      hidePanel(app.panelEl);
    }
  }

  function updatePanelForSelection() {
    const panel = app.panelEl;
    if (!panel) return;
    const ia = panel.querySelector(`.${L}-ia`) as HTMLElement;
    const hn = panel.querySelector(`.${L}-hn`) as HTMLElement;
    const elInfo = panel.querySelector(`.${L}-ei`) as HTMLElement;

    const bar = app.barEl;

    if (!app.selectedEl && app.selectedEls.length === 0) {
      const update = () => {
        elInfo.innerHTML = `<div class="${L}-eh">Click to select an element or <kbd>Shift+click</kbd> to select multiple</div>`;
        if (ia) ia.style.display = 'none';
        if (hn) hn.style.display = 'none';
      };
      if (bar?.classList.contains('expanded')) { animateHeight(bar, update); } else { update(); }
      contentFadeIn(elInfo);
      return;
    }

    if (ia) ia.style.display = '';
    if (hn) hn.style.display = '';

    if (app.selectedEls.length <= 1) {
      const el = app.selectedEls[0] || app.selectedEl;
      if (!el) return;
      const update = () => {
        elInfo.innerHTML = `
          <div class="${L}-et">${getTag(el)}</div>
          <div class="${L}-ex">${el.textContent?.trim().slice(0, 50) || '(empty)'}</div>
          <div class="${L}-ep">${getBreadcrumb(el)}</div>
        `;
      };
      if (bar?.classList.contains('expanded')) { animateHeight(bar, update); } else { update(); }
      contentFadeIn(elInfo);
    } else {
      let html = `<div class="${L}-et">Selected<span class="${L}-sel-count">${app.selectedEls.length}</span></div>`;
      html += `<div class="${L}-ei-multi">`;
      app.selectedEls.forEach((el, i) => {
        const tag = getTag(el).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html += `<div class="${L}-ei-item"><button class="${L}-ei-rm" data-idx="${i}"><i class="icon-x"></i></button><span>${tag}</span></div>`;
      });
      html += `</div>`;
      const update = () => { elInfo.innerHTML = html; };
      if (bar?.classList.contains('expanded')) { animateHeight(bar, update); } else { update(); }
      multiSelectIn(`.${L}-ei-item`, elInfo);
      elInfo.querySelectorAll(`.${L}-ei-rm`).forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = parseInt((btn as HTMLElement).dataset.idx || '0');
          app.selectedEls.splice(idx, 1);
          if (app.selectedEls.length === 0) {
            clearSelection();
          } else {
            app.selectedEl = app.selectedEls[app.selectedEls.length - 1];
            updateMultiHighlights();
            updatePanelForSelection();
          }
        });
      });
    }
  }

  // ---- Polling ----
  function stopPolling() {
    if (app.pollTimer) { clearInterval(app.pollTimer); app.pollTimer = null; }
    if (app.spinnerTimeout) { clearTimeout(app.spinnerTimeout); app.spinnerTimeout = null; }
  }

  function startPolling() {
    stopPolling();
    app.pollTimer = setInterval(async () => {
      try {
        const resp = await fetch(`${PATH_PREFIX}/__layrr__/edit-status`);
        const data = await resp.json();
        if (data.success !== null && data.timestamp > app.lastEditTimestamp) {
          app.lastEditTimestamp = data.timestamp;
          stopPolling();
          onEditResult(data);
        }
      } catch {}
    }, 2000);
    app.spinnerTimeout = setTimeout(() => {
      stopPolling();
      if (app.activeSendBtn) {
        app.activeSendBtn.disabled = false;
        app.activeSendBtn.classList.remove('loading');
        app.activeSendBtn = null;
      }
      toast('Edit timed out — no response received', 'error');
    }, 60000);
  }

  function onEditResult(msg: any) {
    stopPolling();
    if (app.activeSendBtn) {
      app.activeSendBtn.disabled = false;
      app.activeSendBtn.classList.remove('loading');
      app.activeSendBtn = null;
    }
    if (msg.success) {
      app.editCount++;
      app.lastEdit = null;
      app.selectedEl = null;
      app.selectedEls = [];
      clearMultiHighlights();
      app.hoveredEl = null;
      if (app.hlEl) { app.hlEl.style.display = 'none'; app.hlEl.classList.remove('selected'); }
      if (app.labelEl) app.labelEl.style.display = 'none';
      if (app.panelEl) hidePanel(app.panelEl);
      save();
      toast('Done!', 'success');
      setTimeout(() => location.reload(), 2500);
    } else {
      toast(msg.message || 'Edit failed', 'error');
    }
  }

  // ---- WebSocket ----
  function connectWs() {
    const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = WS_PORT ? `${location.hostname}:${WS_PORT}` : location.hostname;
    app.ws = new WebSocket(`${wsProto}//${wsHost}${PATH_PREFIX}/__layrr__/ws`);
    app.ws.onopen = () => { app.connected = true; app.ws!.send(JSON.stringify({ type: 'overlay-ready' })); };
    app.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'edit-result') onEditResult(msg);
        else if (msg.type === 'version-preview-result') {
          if (msg.success) {
            app.previewingHash = msg.hash;
            sessionStorage.setItem('__layrr_preview', msg.hash);
            toast(`Previewing: ${msg.message || msg.hash.slice(0, 7)}`, 'info');
            fetchAndRenderHistory();
            save();
            setTimeout(() => location.reload(), 1000);
          } else { toast('Preview failed', 'error'); }
        }
        else if (msg.type === 'version-restore-result') {
          if (msg.success) {
            app.previewingHash = null;
            sessionStorage.removeItem('__layrr_preview');
            toast('Back to latest', 'success');
            fetchAndRenderHistory();
            save();
            setTimeout(() => location.reload(), 1000);
          } else { toast('Restore failed', 'error'); }
        }
        else if (msg.type === 'version-revert-result') {
          if (msg.success) {
            app.previewingHash = null;
            sessionStorage.removeItem('__layrr_preview');
            toast('Permanently reverted', 'success');
            fetchAndRenderHistory();
            save();
            setTimeout(() => location.reload(), 1000);
          } else { toast('Revert failed', 'error'); }
        }
      } catch {}
    };
    app.ws.onclose = () => { app.connected = false; setTimeout(() => connectWs(), 2000); };
  }

  // ---- Mode ----
  function setMode(m: 'browse' | 'edit') {
    const histOpen = document.getElementById(`${L}-history`)?.classList.contains('open');
    if (m === app.mode && !histOpen) return;
    if (m === 'edit' && app.previewingHash) {
      toast('Go back to latest to make edits', 'info');
      return;
    }
    app.mode = m;
    const bar = app.barEl;
    const dim = app.dimEl;
    const panel = app.panelEl;
    if (!bar || !dim || !panel) return;
    const br = bar.querySelector(`.${L}-bbr`) as HTMLElement;
    const ed = bar.querySelector(`.${L}-bbe`) as HTMLElement;
    // Close history if open
    const hp = document.getElementById(`${L}-history`);
    const hi = bar.querySelector(`.${L}-bhi`) as HTMLElement;
    if (hp?.classList.contains('open')) {
      if (m === 'browse') {
        hideHistory(hp);
      }
      deactivateHistory(hi);
    }

    if (m === 'browse') {
      activateBrowse(br, ed);
      document.body.style.cursor = '';
      if (dim.classList.contains('active')) {
        dimOut(dim).then(() => { dim.classList.remove('active'); dim.style.cssText = ''; });
      }
      app.selectedEl = null; app.selectedEls = []; app.hoveredEl = null;
      clearMultiHighlights();
      if (app.hlEl) { app.hlEl.style.display = 'none'; app.hlEl.classList.remove('selected'); }
      if (app.labelEl) app.labelEl.style.display = 'none';
      // Only collapse edit panel if history isn't handling the collapse
      if (!hp?.classList.contains('open')) {
        hidePanel(panel);
      }
    } else {
      activateEdit(br, ed);
      document.body.style.cursor = 'crosshair';
      dim.classList.add('active'); dim.style.cssText = ''; dimIn(dim);
      app.selectedEl = null; app.selectedEls = []; app.hoveredEl = null;
      clearMultiHighlights();
      if (app.hlEl) { app.hlEl.style.display = 'none'; app.hlEl.classList.remove('selected'); }
      if (app.labelEl) app.labelEl.style.display = 'none';
      updatePanelForSelection();
      showPanel(panel);
    }
    save();
  }

  // ---- Send edit ----
  async function sendEdit() {
    const input = app.inputEl;
    const sendBtn = app.sendBtnEl;
    if (!app.selectedEl || !app.ws || app.ws.readyState !== WebSocket.OPEN || !input || !sendBtn) return;
    const instruction = input.value.trim(); if (!instruction) return;
    app.activeSendBtn = sendBtn;
    sendBtn.disabled = true; sendBtn.classList.add('loading');

    const elements = app.selectedEls.length > 1 ? app.selectedEls : [app.selectedEl];
    app.lastEdit = { tagName: elements.map(e => e.tagName.toLowerCase()).join(', '), instruction };

    if (elements.length === 1) {
      const el = elements[0];
      const sourceInfo = await extractSourceInfo(el);
      app.ws.send(JSON.stringify({ type: 'edit-request', selector: getSelector(el), tagName: el.tagName.toLowerCase(), className: el.className || '', textContent: el.textContent?.trim().slice(0, 100) || '', instruction, sourceInfo }));
    } else {
      const sourceInfo = await extractSourceInfo(elements[0]);
      const resolvedElements = await Promise.all(elements.map(async el => ({
        selector: getSelector(el),
        tagName: el.tagName.toLowerCase(),
        className: el.className || '',
        textContent: el.textContent?.trim().slice(0, 100) || '',
        sourceInfo: await extractSourceInfo(el),
      })));
      app.ws.send(JSON.stringify({
        type: 'edit-request',
        selector: getSelector(elements[0]),
        tagName: elements[0].tagName.toLowerCase(),
        className: elements[0].className || '',
        textContent: elements[0].textContent?.trim().slice(0, 100) || '',
        instruction,
        sourceInfo,
        elements: resolvedElements,
      }));
    }
    toast('Editing...', 'info');
    startPolling();
  }

  // ---- Init: creates DOM, sets up bar-local listeners ----
  function init() {
    ensureStyles();
    const { dim, hl, label, panel, bar } = createElements();
    app.hlEl = hl; app.labelEl = label; app.panelEl = panel;
    app.barEl = bar; app.dimEl = dim;
    app.inputEl = panel.querySelector(`.${L}-in`) as HTMLTextAreaElement;
    app.sendBtnEl = panel.querySelector(`.${L}-sb`) as HTMLButtonElement;
    connectWs();

    // Check for missed edit results
    fetch(`${PATH_PREFIX}/__layrr__/edit-status`).then(r => r.json()).then(data => {
      if (data.success !== null && data.timestamp > app.lastEditTimestamp) {
        app.lastEditTimestamp = data.timestamp;
        onEditResult(data);
      }
    }).catch(() => {});

    // Bar-local listeners (safe to re-add — they're on elements that get recreated)
    const closeBtn = panel.querySelector(`.${L}-px`) as HTMLButtonElement;
    const browseBtn = bar.querySelector(`.${L}-bbr`) as HTMLElement;
    const editBtn = bar.querySelector(`.${L}-bbe`) as HTMLElement;
    const histBtn = bar.querySelector(`.${L}-bhi`) as HTMLElement;
    const histPanel = document.getElementById(`${L}-history`) as HTMLElement;
    const barDrag = bar.querySelector(`.${L}-bd`) as HTMLElement;

    app.inputEl.addEventListener('input', () => { app.inputEl!.style.height = 'auto'; app.inputEl!.style.height = Math.min(app.inputEl!.scrollHeight, 72) + 'px'; });
    browseBtn.addEventListener('click', () => setMode('browse'));
    editBtn.addEventListener('click', () => setMode('edit'));
    closeBtn.addEventListener('click', () => { setMode('browse'); app.hoveredEl = null; });
    app.sendBtnEl.addEventListener('click', sendEdit);
    app.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendEdit(); } });

    // History toggle
    histBtn.addEventListener('click', () => {
      const wasOpen = histPanel.classList.contains('open');

      if (wasOpen) {
        // Close history
        hideHistory(histPanel);
        deactivateHistory(histBtn);
        activateBrowse(browseBtn, editBtn);
        app.mode = 'browse';
      } else {
        // Open history — clear edit state first
        app.selectedEl = null; app.selectedEls = []; clearMultiHighlights();
        if (hl) { hl.style.display = 'none'; hl.classList.remove('selected'); }
        if (label) label.style.display = 'none';
        app.hoveredEl = null;
        document.body.style.cursor = '';
        if (dim.classList.contains('active')) {
          dimOut(dim).then(() => { dim.classList.remove('active'); dim.style.cssText = ''; });
        }
        app.mode = 'browse';
        activateHistory(browseBtn, editBtn, histBtn);
        showHistory(histPanel, bar);
        fetchAndRenderHistory();
      }
    });

    // Drag (uses local barDragging state, listeners on bar element)
    let barDragging = false, barOff = { x: 0, y: 0 };
    barDrag.addEventListener('mousedown', (e: MouseEvent) => {
      barDragging = true; bar.classList.add('dragging');
      const r = bar.getBoundingClientRect();
      bar.style.right = 'auto'; bar.style.bottom = 'auto';
      bar.style.left = `${r.left}px`; bar.style.top = `${r.top}px`;
      barOff = { x: e.clientX - r.left, y: e.clientY - r.top }; e.preventDefault();
    });
    // Drag move/up need document listeners but we track via app to avoid stale refs
    (app as any)._barDragging = () => barDragging;
    (app as any)._barOff = () => barOff;
    (app as any)._setBarDragging = (v: boolean) => { barDragging = v; };

    // Restore saved state
    fetchAndRenderHistory();
    if (saved.barPos) {
      bar.style.right = 'auto'; bar.style.bottom = 'auto';
      bar.style.left = saved.barPos.left; bar.style.top = saved.barPos.top;
    }
    if (saved.historyOpen) {
      // History takes priority over edit mode
      app.mode = 'browse';
      histPanel.classList.add('open');
      histBtn.classList.add('open');
      bar.classList.add('expanded');
      browseBtn.classList.remove('active');
      editBtn.classList.remove('active');
      fetchAndRenderHistory();
    } else if (app.mode === 'edit') {
      app.mode = 'browse';   // Reset so setMode guard doesn't early-return
      setMode('edit');
    }
  }

  // ---- Document-level listeners: added ONCE in start() ----
  function setupGlobalListeners() {
    // Mousemove — hover highlight + drag
    document.addEventListener('mousemove', (e: MouseEvent) => {
      const bar = app.barEl;
      const hl = app.hlEl;
      const label = app.labelEl;
      const barDragging = (app as any)._barDragging?.() || false;
      const barOff = (app as any)._barOff?.() || { x: 0, y: 0 };

      if (barDragging && bar) {
        bar.style.left = `${Math.max(4, Math.min(window.innerWidth - bar.offsetWidth - 4, e.clientX - barOff.x))}px`;
        bar.style.top = `${Math.max(4, Math.min(window.innerHeight - bar.offsetHeight - 4, e.clientY - barOff.y))}px`;
      }
      if (app.mode !== 'edit' || barDragging) return;
      if (app.selectedEl && !e.shiftKey) return;
      const t = e.target as HTMLElement;
      if (!hl || !label) return;
      if (isOwn(t)) { hl.style.display = 'none'; label.style.display = 'none'; return; }
      if (t !== app.hoveredEl) { app.hoveredEl = t; posHL(t, hl); posLabel(t, label); }
    }, true);

    // Mouseup — end drag
    document.addEventListener('mouseup', () => {
      const barDragging = (app as any)._barDragging?.() || false;
      if (barDragging) {
        (app as any)._setBarDragging?.(false);
        app.barEl?.classList.remove('dragging');
        save();
      }
    });

    // Click — element selection
    document.addEventListener('click', (e) => {
      if (app.mode !== 'edit') return;
      const t = e.target as HTMLElement;
      if (isOwn(t)) return;
      e.preventDefault(); e.stopPropagation();

      const hl = app.hlEl;
      const label = app.labelEl;
      const panel = app.panelEl;
      const input = app.inputEl;
      if (!hl || !label || !panel || !input) return;

      if (e.shiftKey && app.selectedEls.length > 0) {
        const idx = app.selectedEls.indexOf(t);
        if (idx >= 0) {
          app.selectedEls.splice(idx, 1);
          if (app.selectedEls.length === 0) { clearSelection(); return; }
          app.selectedEl = app.selectedEls[app.selectedEls.length - 1];
        } else {
          app.selectedEls.push(t);
          app.selectedEl = t;
        }
        posHL(app.selectedEl, hl); hl.classList.add('selected');
        updateMultiHighlights();
        label.style.display = 'none';
        showPanel(panel);
        updatePanelForSelection();
        setTimeout(() => input.focus(), 50);
      } else {
        app.selectedEl = t;
        app.selectedEls = [t];
        clearMultiHighlights();
        posHL(t, hl); hl.classList.add('selected'); label.style.display = 'none'; showPanel(panel);
        updatePanelForSelection();
        input.value = ''; input.style.height = 'auto'; setTimeout(() => input.focus(), 50);
      }

      if (app.ws?.readyState === WebSocket.OPEN) {
        extractSourceInfo(t).then(sourceInfo => {
          if (app.ws?.readyState === WebSocket.OPEN) {
            app.ws.send(JSON.stringify({ type: 'element-selected', selector: getSelector(t), tagName: t.tagName.toLowerCase(), className: t.className || '', textContent: t.textContent?.trim().slice(0, 100) || '', sourceInfo, rect: t.getBoundingClientRect().toJSON() }));
          }
        });
      }
    }, true);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.altKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setMode(app.mode === 'browse' ? 'edit' : 'browse');
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        // Move focus to body to prevent browser from focusing toolbar buttons
        document.body.focus();
        const histPanel = document.getElementById(`${L}-history`);
        if (histPanel?.classList.contains('open')) {
          closeHistory();
        } else if (app.selectedEl) { clearSelection(); app.hoveredEl = null; }
        else if (app.mode === 'edit') setMode('browse');
      }
    });
  }

  // ---- Persistence across navigations ----
  function reinjectIfNeeded() {
    if (!document.querySelector(`.${L}-root`) && document.body) {
      init();
    }
  }

  function start() {
    init();
    setupGlobalListeners(); // Only once — references app.* for current DOM

    let reinjectTimer: ReturnType<typeof setTimeout> | null = null;
    new MutationObserver(() => {
      if (!document.querySelector(`.${L}-root`) && document.body) {
        if (reinjectTimer) clearTimeout(reinjectTimer);
        reinjectTimer = setTimeout(() => { reinjectTimer = null; reinjectIfNeeded(); }, 50);
      }
    }).observe(document.documentElement, { childList: true, subtree: true });

    // Framework-specific navigation events
    document.addEventListener('astro:after-swap', reinjectIfNeeded);
    document.addEventListener('sveltekit:navigation-end', reinjectIfNeeded);
    window.addEventListener('popstate', () => setTimeout(reinjectIfNeeded, 100));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
