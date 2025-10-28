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

  // Create UI elements
  const styles = `
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

    .vc-selection-rect {
      position: fixed;
      border: 2px solid #3b82f6;
      background: rgba(59, 130, 246, 0.15);
      pointer-events: none;
      z-index: 999999;
      display: none;
    }

    .vc-selection-rect.vc-show {
      display: block;
    }

    .vc-selection-info {
      position: fixed;
      background: #3b82f6;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-family: system-ui, sans-serif;
      pointer-events: none;
      z-index: 1000000;
      display: none;
    }

    .vc-selection-info.vc-show {
      display: block;
    }

    .vc-popup {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 24px;
      width: 480px;
      max-width: 90vw;
      z-index: 1000000;
      display: none;
    }

    .vc-popup.vc-show {
      display: block;
    }

    .vc-popup-header {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 16px;
      color: #1f2937;
    }

    .vc-popup-selection-info {
      font-size: 13px;
      color: #6b7280;
      margin-bottom: 16px;
      padding: 12px;
      background: #f3f4f6;
      border-radius: 8px;
      font-family: system-ui, sans-serif;
    }

    .vc-popup-textarea {
      width: 100%;
      min-height: 100px;
      padding: 12px;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      font-size: 14px;
      font-family: system-ui, -apple-system, sans-serif;
      resize: vertical;
      margin-bottom: 16px;
      transition: border-color 0.2s;
    }

    .vc-popup-textarea:focus {
      outline: none;
      border-color: #3b82f6;
    }

    .vc-popup-buttons {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }

    .vc-button {
      padding: 10px 20px;
      border-radius: 8px;
      border: none;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .vc-button-primary {
      background: #3b82f6;
      color: white;
    }

    .vc-button-primary:hover {
      background: #2563eb;
    }

    .vc-button-secondary {
      background: #f3f4f6;
      color: #374151;
    }

    .vc-button-secondary:hover {
      background: #e5e7eb;
    }

    .vc-toggle {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: #3b82f6;
      color: white;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      z-index: 1000000;
      transition: all 0.3s;
    }

    .vc-toggle:hover {
      background: #2563eb;
      transform: scale(1.05);
    }

    .vc-toggle.vc-active {
      background: #ef4444;
    }

    .vc-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 999999;
      display: none;
    }

    .vc-backdrop.vc-show {
      display: block;
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
  toggle.textContent = '👁️';
  toggle.title = 'Toggle Visual Claude selection mode (Drag to select area)';

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
    } else {
      console.error('[Visual Claude] ✗ WebSocket not connected, state:', messageWs ? messageWs.readyState : 'null');
    }

    hidePopup();
    toggleSelectionMode();
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
