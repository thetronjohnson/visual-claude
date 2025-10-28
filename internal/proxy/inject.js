(function() {
  'use strict';

  // State
  let isSelectionMode = false;
  let isDragging = false;
  let dragStart = null;
  let dragEnd = null;
  let selectedElements = [];
  let reloadWs = null;
  let messageWs = null;

  // Create UI elements with CSS custom properties
  const styles = `
    :root {
      --vc-primary: #3b82f6;
      --vc-primary-hover: #2563eb;
      --vc-success: #22c55e;
      --vc-danger: #ef4444;
      --vc-gray-50: #f9fafb;
      --vc-gray-100: #f3f4f6;
      --vc-gray-200: #e5e7eb;
      --vc-gray-400: #9ca3af;
      --vc-gray-600: #6b7280;
      --vc-gray-700: #374151;
      --vc-gray-900: #1f2937;
    }

    .vc-overlay {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 999999;
      cursor: crosshair;
    }

    .vc-overlay.vc-active {
      pointer-events: auto;
    }

    @keyframes vc-dash {
      to {
        stroke-dashoffset: -100;
      }
    }

    .vc-selection-rect {
      position: fixed;
      border: 2px dashed var(--vc-primary);
      background: rgba(59, 130, 246, 0.08);
      border-radius: 8px;
      pointer-events: none;
      z-index: 999999;
      display: none;
      box-shadow:
        0 0 0 1px rgba(59, 130, 246, 0.2),
        0 10px 30px rgba(59, 130, 246, 0.15);
      animation: vc-dash 20s linear infinite;
      stroke-dasharray: 10 5;
      transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .vc-selection-rect.vc-show {
      display: block;
      animation: vc-fadeIn 0.15s cubic-bezier(0.4, 0, 0.2, 1);
    }

    @keyframes vc-fadeIn {
      from {
        opacity: 0;
        transform: scale(0.95);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    .vc-selection-info {
      position: fixed;
      background: rgba(59, 130, 246, 0.95);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      color: white;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-family: system-ui, -apple-system, sans-serif;
      font-weight: 500;
      pointer-events: none;
      z-index: 1000000;
      display: none;
      box-shadow:
        0 4px 12px rgba(59, 130, 246, 0.3),
        0 0 0 1px rgba(255, 255, 255, 0.1) inset;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .vc-selection-info.vc-show {
      display: block;
      animation: vc-tooltipIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    @keyframes vc-tooltipIn {
      from {
        opacity: 0;
        transform: scale(0.85) translateY(-5px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }

    .vc-popup {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) scale(1);
      background: rgba(255, 255, 255, 0.98);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-radius: 16px;
      box-shadow:
        0 25px 50px rgba(0, 0, 0, 0.15),
        0 0 0 1px rgba(0, 0, 0, 0.05),
        0 0 0 1px rgba(255, 255, 255, 0.5) inset;
      padding: 28px;
      width: 480px;
      max-width: 90vw;
      z-index: 1000000;
      display: none;
    }

    .vc-popup.vc-show {
      display: block;
      animation: vc-modalIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    @keyframes vc-modalIn {
      from {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.9);
      }
      to {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
      }
    }

    .vc-popup-header {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 18px;
      color: var(--vc-gray-900);
      letter-spacing: -0.02em;
    }

    .vc-popup-selection-info {
      font-size: 13px;
      color: var(--vc-gray-600);
      margin-bottom: 18px;
      padding: 14px 16px;
      background: linear-gradient(135deg, var(--vc-gray-50) 0%, var(--vc-gray-100) 100%);
      border-radius: 10px;
      font-family: system-ui, -apple-system, sans-serif;
      font-weight: 500;
      border: 1px solid var(--vc-gray-200);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    .vc-popup-textarea {
      width: 100%;
      min-height: 110px;
      padding: 14px;
      border: 2px solid var(--vc-gray-200);
      border-radius: 10px;
      font-size: 14px;
      font-family: system-ui, -apple-system, sans-serif;
      line-height: 1.6;
      resize: vertical;
      margin-bottom: 20px;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    .vc-popup-textarea:focus {
      outline: none;
      border-color: var(--vc-primary);
      box-shadow:
        0 0 0 3px rgba(59, 130, 246, 0.1),
        0 2px 8px rgba(59, 130, 246, 0.15);
      transform: translateY(-1px);
    }

    .vc-popup-textarea::placeholder {
      color: var(--vc-gray-400);
    }

    .vc-popup-buttons {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }

    .vc-button {
      padding: 11px 24px;
      border-radius: 10px;
      border: none;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      font-family: system-ui, -apple-system, sans-serif;
      position: relative;
      overflow: hidden;
    }

    .vc-button:active {
      transform: scale(0.97);
    }

    .vc-button-primary {
      background: linear-gradient(135deg, var(--vc-primary) 0%, #2563eb 100%);
      color: white;
      box-shadow:
        0 4px 12px rgba(59, 130, 246, 0.3),
        0 0 0 1px rgba(255, 255, 255, 0.1) inset;
    }

    .vc-button-primary:hover {
      box-shadow:
        0 6px 20px rgba(59, 130, 246, 0.4),
        0 0 0 1px rgba(255, 255, 255, 0.2) inset;
      transform: translateY(-1px);
    }

    .vc-button-secondary {
      background: var(--vc-gray-100);
      color: var(--vc-gray-700);
      border: 1px solid var(--vc-gray-200);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    }

    .vc-button-secondary:hover {
      background: var(--vc-gray-200);
      transform: translateY(-1px);
      box-shadow: 0 3px 8px rgba(0, 0, 0, 0.1);
    }

    .vc-toggle {
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 14px 24px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      color: var(--vc-gray-900);
      border: 1px solid rgba(0, 0, 0, 0.08);
      cursor: pointer;
      box-shadow:
        0 8px 24px rgba(0, 0, 0, 0.12),
        0 0 0 1px rgba(255, 255, 255, 0.5) inset;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 600;
      font-family: system-ui, -apple-system, sans-serif;
      z-index: 1000000;
      transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      gap: 8px;
      letter-spacing: -0.01em;
    }

    .vc-toggle:hover {
      transform: translateY(-3px) scale(1.02);
      box-shadow:
        0 12px 32px rgba(0, 0, 0, 0.16),
        0 0 0 1px rgba(255, 255, 255, 0.6) inset;
    }

    .vc-toggle:active {
      transform: translateY(-1px) scale(0.98);
      transition: all 0.1s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .vc-toggle.vc-active {
      background: linear-gradient(135deg, var(--vc-danger) 0%, #dc2626 100%);
      color: white;
      border-color: rgba(255, 255, 255, 0.2);
      box-shadow:
        0 8px 24px rgba(239, 68, 68, 0.4),
        0 0 0 1px rgba(255, 255, 255, 0.2) inset;
    }

    .vc-toggle.vc-active:hover {
      box-shadow:
        0 12px 32px rgba(239, 68, 68, 0.5),
        0 0 0 1px rgba(255, 255, 255, 0.3) inset;
    }

    .vc-toggle.vc-processing {
      background: rgba(255, 255, 255, 0.95);
      color: var(--vc-primary);
      cursor: default;
      pointer-events: none;
    }

    .vc-toggle.vc-complete {
      background: rgba(255, 255, 255, 0.95);
      color: var(--vc-success);
      animation: vc-success-pulse 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    @keyframes vc-success-pulse {
      0%, 100% {
        transform: translateY(-3px) scale(1);
      }
      50% {
        transform: translateY(-3px) scale(1.05);
      }
    }

    @keyframes vc-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .vc-spinner {
      display: inline-block;
      width: 15px;
      height: 15px;
      border: 2.5px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: vc-spin 0.7s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    }

    .vc-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      z-index: 999999;
      display: none;
      opacity: 0;
      transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .vc-backdrop.vc-show {
      display: block;
      animation: vc-backdropIn 0.25s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    }

    @keyframes vc-backdropIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
  `;

  // Inject styles
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);

  // Create UI
  const overlay = document.createElement('div');
  overlay.className = 'vc-overlay';

  const selectionRect = document.createElement('div');
  selectionRect.className = 'vc-selection-rect';
  document.body.appendChild(selectionRect);

  const selectionInfo = document.createElement('div');
  selectionInfo.className = 'vc-selection-info';
  document.body.appendChild(selectionInfo);

  const backdrop = document.createElement('div');
  backdrop.className = 'vc-backdrop';

  const popup = document.createElement('div');
  popup.className = 'vc-popup';
  popup.innerHTML = `
    <div class="vc-popup-header">Visual Claude</div>
    <div class="vc-popup-selection-info"></div>
    <textarea class="vc-popup-textarea" placeholder="What would you like Claude to do with this selection?"></textarea>
    <div class="vc-popup-buttons">
      <button class="vc-button vc-button-secondary" data-action="cancel">Cancel</button>
      <button class="vc-button vc-button-primary" data-action="send">Send to Claude</button>
    </div>
  `;

  const toggle = document.createElement('button');
  toggle.className = 'vc-toggle';
  toggle.innerHTML = 'Select';
  toggle.title = 'Click to start selecting elements on the page';

  document.body.appendChild(overlay);
  document.body.appendChild(backdrop);
  document.body.appendChild(popup);
  document.body.appendChild(toggle);

  // Get elements within bounds
  function getElementsInBounds(bounds) {
    const elements = [];
    const allElements = document.querySelectorAll('body *');

    allElements.forEach(el => {
      // Skip our own UI elements
      if (el.closest('.vc-overlay, .vc-selection-rect, .vc-selection-info, .vc-popup, .vc-backdrop, .vc-toggle')) {
        return;
      }

      const rect = el.getBoundingClientRect();

      // Check if element is fully inside selection
      if (rect.left >= bounds.left &&
          rect.right <= bounds.right &&
          rect.top >= bounds.top &&
          rect.bottom <= bounds.bottom) {
        elements.push(el);
      }
    });

    return elements;
  }

  // Get element info
  function getElementInfo(element) {
    return {
      tagName: element.tagName,
      id: element.id || '',
      classes: element.className || '',
      selector: getSelector(element),
      outerHTML: element.outerHTML || '',
    };
  }

  // Get CSS selector for an element
  function getSelector(element) {
    if (element.id) {
      return `#${element.id}`;
    }

    const path = [];
    while (element && element.nodeType === Node.ELEMENT_NODE) {
      let selector = element.nodeName.toLowerCase();

      if (element.className) {
        const classes = element.className.trim().split(/\s+/).filter(c => !c.startsWith('vc-'));
        if (classes.length > 0) {
          selector += '.' + classes[0];
        }
      }

      path.unshift(selector);
      if (path.length > 3) break; // Limit depth
      element = element.parentElement;
    }

    return path.join(' > ');
  }

  // Capture screenshot of selected area
  async function captureAreaScreenshot(bounds) {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      canvas.width = bounds.width;
      canvas.height = bounds.height;

      // Use html2canvas if available, otherwise use basic approach
      if (window.html2canvas) {
        const fullCanvas = await html2canvas(document.body, {
          x: bounds.left + window.scrollX,
          y: bounds.top + window.scrollY,
          width: bounds.width,
          height: bounds.height,
        });
        return fullCanvas.toDataURL('image/png').split(',')[1];
      } else {
        // Fallback: create a placeholder
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, bounds.width, bounds.height);
        ctx.fillStyle = '#666';
        ctx.font = '14px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('Screenshot area', bounds.width / 2, bounds.height / 2);
        return canvas.toDataURL('image/png').split(',')[1];
      }
    } catch (err) {
      console.error('Screenshot capture failed:', err);
      return '';
    }
  }

  // Show popup with selection info
  function showPopup(bounds, elements) {
    selectedElements = elements;

    const areaSize = `${Math.round(bounds.width)}×${Math.round(bounds.height)}px`;
    const elementCount = elements.length;

    console.log('[Visual Claude] Selection complete:', {
      area: areaSize,
      elementCount: elementCount,
      elements: elements.map(el => el.tagName)
    });

    popup.querySelector('.vc-popup-selection-info').textContent =
      `Selected: ${elementCount} element${elementCount !== 1 ? 's' : ''} in ${areaSize} area`;
    popup.querySelector('.vc-popup-textarea').value = '';
    popup.querySelector('.vc-popup-textarea').focus();

    popup.classList.add('vc-show');
    backdrop.classList.add('vc-show');
  }

  // Hide popup
  function hidePopup() {
    popup.classList.remove('vc-show');
    backdrop.classList.remove('vc-show');
    selectedElements = [];
  }

  // Send message to Claude
  async function sendMessage(instruction) {
    if (!selectedElements.length || !instruction.trim()) {
      console.warn('[Visual Claude] Cannot send: no elements or instruction');
      return;
    }

    const bounds = {
      left: Math.min(dragStart.x, dragEnd.x),
      top: Math.min(dragStart.y, dragEnd.y),
      width: Math.abs(dragEnd.x - dragStart.x),
      height: Math.abs(dragEnd.y - dragStart.y),
    };

    const screenshot = await captureAreaScreenshot(bounds);
    const elementsInfo = selectedElements.map(el => getElementInfo(el));

    const message = {
      area: {
        x: bounds.left,
        y: bounds.top,
        width: bounds.width,
        height: bounds.height,
        elementCount: elementsInfo.length,
        elements: elementsInfo,
      },
      instruction: instruction.trim(),
      screenshot: screenshot,
    };

    console.log('[Visual Claude] Preparing to send message:', {
      instruction: instruction.trim(),
      elementCount: elementsInfo.length,
      areaSize: `${bounds.width}x${bounds.height}`,
      screenshotSize: screenshot ? screenshot.length : 0
    });

    if (messageWs && messageWs.readyState === WebSocket.OPEN) {
      console.log('[Visual Claude] WebSocket state: OPEN, sending...');
      messageWs.send(JSON.stringify(message));
      console.log('[Visual Claude] ✓ Message sent to server');

      // Update button to show processing
      setButtonStatus('processing');
    } else {
      console.error('[Visual Claude] ✗ WebSocket not connected, state:', messageWs ? messageWs.readyState : 'null');
    }

    hidePopup();
    toggleSelectionMode();
  }

  // Update button status
  function setButtonStatus(status) {
    // Remove all status classes
    toggle.classList.remove('vc-processing', 'vc-complete');

    switch(status) {
      case 'select':
        toggle.innerHTML = 'Select';
        toggle.disabled = false;
        toggle.style.cursor = 'pointer';
        break;
      case 'processing':
        toggle.innerHTML = '<span class="vc-spinner"></span>Processing...';
        toggle.classList.add('vc-processing');
        toggle.disabled = true;
        toggle.style.cursor = 'default';
        break;
      case 'done':
        toggle.innerHTML = 'Done ✓';
        toggle.classList.add('vc-complete');
        toggle.disabled = true;
        // Auto-reset after 2 seconds
        setTimeout(() => setButtonStatus('select'), 2000);
        break;
    }
  }

  // Toggle selection mode
  function toggleSelectionMode() {
    isSelectionMode = !isSelectionMode;
    overlay.classList.toggle('vc-active', isSelectionMode);
    toggle.classList.toggle('vc-active', isSelectionMode);
    document.body.style.cursor = isSelectionMode ? 'crosshair' : '';

    if (!isSelectionMode) {
      // Reset state
      isDragging = false;
      dragStart = null;
      dragEnd = null;
      selectionRect.classList.remove('vc-show');
      selectionInfo.classList.remove('vc-show');
    }
  }

  // Mouse down handler - start drag
  function handleMouseDown(e) {
    if (!isSelectionMode) return;
    if (e.target.closest('.vc-popup, .vc-backdrop, .vc-toggle')) return;

    isDragging = true;
    dragStart = { x: e.clientX, y: e.clientY };
    dragEnd = { x: e.clientX, y: e.clientY };

    selectionRect.classList.add('vc-show');
    updateSelectionRect();
  }

  // Mouse move handler - update drag
  function handleMouseMove(e) {
    if (!isSelectionMode) return;

    if (isDragging) {
      dragEnd = { x: e.clientX, y: e.clientY };
      updateSelectionRect();
      updateSelectionInfo();
    }
  }

  // Mouse up handler - complete drag
  function handleMouseUp(e) {
    if (!isSelectionMode || !isDragging) return;

    isDragging = false;
    selectionRect.classList.remove('vc-show');
    selectionInfo.classList.remove('vc-show');

    // Calculate bounds
    const bounds = {
      left: Math.min(dragStart.x, dragEnd.x),
      top: Math.min(dragStart.y, dragEnd.y),
      right: Math.max(dragStart.x, dragEnd.x),
      bottom: Math.max(dragStart.y, dragEnd.y),
      width: Math.abs(dragEnd.x - dragStart.x),
      height: Math.abs(dragEnd.y - dragStart.y),
    };

    // Minimum selection size (10x10px)
    if (bounds.width < 10 || bounds.height < 10) {
      console.log('[Visual Claude] Selection too small, ignoring');
      return;
    }

    // Get elements in selection
    const elements = getElementsInBounds(bounds);

    if (elements.length === 0) {
      console.log('[Visual Claude] No elements in selection');
      return;
    }

    // Show popup
    showPopup(bounds, elements);
  }

  // Update selection rectangle
  function updateSelectionRect() {
    const left = Math.min(dragStart.x, dragEnd.x);
    const top = Math.min(dragStart.y, dragEnd.y);
    const width = Math.abs(dragEnd.x - dragStart.x);
    const height = Math.abs(dragEnd.y - dragStart.y);

    selectionRect.style.left = left + 'px';
    selectionRect.style.top = top + 'px';
    selectionRect.style.width = width + 'px';
    selectionRect.style.height = height + 'px';
  }

  // Update selection info tooltip
  function updateSelectionInfo() {
    const width = Math.abs(dragEnd.x - dragStart.x);
    const height = Math.abs(dragEnd.y - dragStart.y);

    selectionInfo.textContent = `${Math.round(width)} × ${Math.round(height)}`;
    selectionInfo.style.left = (dragEnd.x + 10) + 'px';
    selectionInfo.style.top = (dragEnd.y + 10) + 'px';
    selectionInfo.classList.add('vc-show');
  }

  // Event listeners
  toggle.addEventListener('click', toggleSelectionMode);
  document.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);

  popup.querySelector('[data-action="cancel"]').addEventListener('click', (e) => {
    e.stopPropagation();
    hidePopup();
  });

  popup.querySelector('[data-action="send"]').addEventListener('click', (e) => {
    e.stopPropagation();
    const instruction = popup.querySelector('.vc-popup-textarea').value;
    sendMessage(instruction);
  });

  backdrop.addEventListener('click', (e) => {
    e.stopPropagation();
    hidePopup();
  });

  // Handle Enter key in textarea (Shift+Enter for new line)
  popup.querySelector('.vc-popup-textarea').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const instruction = e.target.value;
      sendMessage(instruction);
    }
  });

  // WebSocket connections
  function connectWebSockets() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;

    // Reload WebSocket
    reloadWs = new WebSocket(`${protocol}//${host}/__visual-claude/ws/reload`);
    reloadWs.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'reload') {
        console.log('[Visual Claude] Reloading page...');
        window.location.reload();
      }
    };

    reloadWs.onerror = (error) => {
      console.error('[Visual Claude] Reload WebSocket error:', error);
    };

    reloadWs.onclose = () => {
      console.log('[Visual Claude] Reload WebSocket closed, reconnecting...');
      setTimeout(connectWebSockets, 2000);
    };

    // Message WebSocket
    messageWs = new WebSocket(`${protocol}//${host}/__visual-claude/ws/message`);
    messageWs.onopen = () => {
      console.log('[Visual Claude] Connected to Claude Code');
    };

    messageWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[Visual Claude] Message from server:', data);

        // Listen for completion status
        if (data.status === 'received') {
          // Message was received by server (already showing "Processing...")
        } else if (data.status === 'complete') {
          // Claude finished processing
          setButtonStatus('done');
        }
      } catch (err) {
        console.error('[Visual Claude] Failed to parse server message:', err);
      }
    };

    messageWs.onerror = (error) => {
      console.error('[Visual Claude] Message WebSocket error:', error);
    };

    messageWs.onclose = () => {
      console.log('[Visual Claude] Message WebSocket closed');
    };
  }

  // Initialize
  connectWebSockets();
  console.log('[Visual Claude] Initialized with drag-to-select ✓');
  console.log('[Visual Claude] Click the eye icon and drag to select an area');
})();
