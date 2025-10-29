(function() {
  'use strict';

  // State
  let isDragging = false;
  let dragStart = null;
  let dragEnd = null;
  let dragStartTime = null;
  let selectedElements = [];
  let reloadWs = null;
  let messageWs = null;
  let isProcessing = false;

  // Hover state
  let currentHoveredElement = null;
  let lastHoverCheckTime = 0;
  const HOVER_CHECK_THROTTLE = 16; // ~60fps

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

    .vc-element-highlight {
      outline: 2px solid var(--vc-primary) !important;
      outline-offset: 2px !important;
      transition: outline 0.15s ease !important;
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

    .vc-inline-input {
      position: fixed;
      background: white;
      border: 2.5px solid #333333;
      border-radius: 8px;
      padding: 12px;
      z-index: 1000000;
      display: none;
      min-width: 300px;
      max-width: 400px;
    }

    .vc-inline-input.vc-show {
      display: block;
      animation: vc-fadeIn 0.2s ease;
    }

    .vc-inline-badge {
      font-size: 11px;
      font-weight: 600;
      color: #333333;
      margin-bottom: 8px;
      font-family: system-ui, -apple-system, sans-serif;
    }

    .vc-inline-text {
      width: 100%;
      padding: 10px;
      border: 2px solid #333333;
      border-radius: 6px;
      font-size: 14px;
      font-family: system-ui, -apple-system, sans-serif;
      line-height: 1.4;
      resize: none;
      transition: none;
    }

    .vc-inline-text:focus {
      outline: none;
      border-color: #333333;
    }

    .vc-inline-text::placeholder {
      color: var(--vc-gray-400);
    }

    .vc-inline-buttons {
      display: flex;
      gap: 8px;
      margin-top: 8px;
      justify-content: flex-end;
    }

    .vc-inline-button {
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: system-ui, -apple-system, sans-serif;
    }

    .vc-inline-button:active {
      transform: scale(0.95);
    }

    .vc-inline-button-send {
      background: #F19E38;
      color: #000000;
      border: 2.5px solid #333333;
    }

    .vc-inline-button-send:hover {
      opacity: 0.85;
    }

    .vc-inline-button-cancel {
      background: var(--vc-gray-200);
      color: #333333;
      border: 2.5px solid #333333;
    }

    .vc-inline-button-cancel:hover {
      opacity: 0.85;
    }

    .vc-status-indicator {
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 12px 20px;
      border-radius: 8px;
      background: white;
      color: #1f2937;
      border: 2px dotted black;
      font-size: 14px;
      font-weight: 600;
      font-family: system-ui, -apple-system, sans-serif;
      z-index: 1000000;
      display: none;
      align-items: center;
      gap: 8px;
    }

    .vc-status-indicator.vc-show {
      display: flex;
    }

    .vc-status-indicator.vc-processing {
      background: #3b82f6;
      color: white;
    }

    .vc-status-indicator.vc-complete {
      background: #22c55e;
      color: white;
      animation: vc-fadeOut 0.5s ease 2s forwards;
    }

    @keyframes vc-fadeOut {
      from {
        opacity: 1;
      }
      to {
        opacity: 0;
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

  `;

  // Inject styles
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);

  // Create UI
  const selectionRect = document.createElement('div');
  selectionRect.className = 'vc-selection-rect';
  document.body.appendChild(selectionRect);

  const selectionInfo = document.createElement('div');
  selectionInfo.className = 'vc-selection-info';
  document.body.appendChild(selectionInfo);

  const inlineInput = document.createElement('div');
  inlineInput.className = 'vc-inline-input';
  inlineInput.innerHTML = `
    <div class="vc-inline-badge"></div>
    <textarea class="vc-inline-text" rows="2" placeholder="What would you like Claude to do?"></textarea>
    <div class="vc-inline-buttons">
      <button class="vc-inline-button vc-inline-button-cancel" data-action="cancel">Cancel</button>
      <button class="vc-inline-button vc-inline-button-send" data-action="send">Send</button>
    </div>
  `;
  document.body.appendChild(inlineInput);

  const statusIndicator = document.createElement('div');
  statusIndicator.className = 'vc-status-indicator';
  statusIndicator.innerHTML = '<span class="vc-spinner"></span>Processing...';
  document.body.appendChild(statusIndicator);

  // Set custom cursor globally with fallback
  const cursorURL = '/__visual-claude/cursor.svg';
  document.body.style.cursor = `url('${cursorURL}') 8 6, auto`;

  // Get elements within bounds
  function getElementsInBounds(bounds) {
    const elements = [];
    const allElements = document.querySelectorAll('body *');

    allElements.forEach(el => {
      // Skip our own UI elements
      if (el.closest('.vc-selection-rect, .vc-selection-info, .vc-inline-input, .vc-status-indicator')) {
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

  // Show inline input with selection info
  function showInlineInput(cursorX, cursorY, bounds, elements) {
    selectedElements = elements;

    const areaSize = `${Math.round(bounds.width)}×${Math.round(bounds.height)}px`;
    const elementCount = elements.length;

    console.log('[Visual Claude] Selection complete:', {
      area: areaSize,
      elementCount: elementCount,
      elements: elements.map(el => el.tagName)
    });

    // Update badge
    inlineInput.querySelector('.vc-inline-badge').textContent =
      `${elementCount} element${elementCount !== 1 ? 's' : ''} · ${areaSize}`;

    // Clear and focus input
    const textArea = inlineInput.querySelector('.vc-inline-text');
    textArea.value = '';

    // Position near cursor with smart boundaries
    const inputWidth = 320;
    const inputHeight = 140;
    const padding = 20;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = cursorX + padding;
    let top = cursorY + padding;

    // Keep within viewport bounds
    if (left + inputWidth > viewportWidth - padding) {
      left = cursorX - inputWidth - padding;
    }
    if (top + inputHeight > viewportHeight - padding) {
      top = cursorY - inputHeight - padding;
    }

    // Ensure minimum distance from edges
    left = Math.max(padding, Math.min(left, viewportWidth - inputWidth - padding));
    top = Math.max(padding, Math.min(top, viewportHeight - inputHeight - padding));

    inlineInput.style.left = left + 'px';
    inlineInput.style.top = top + 'px';
    inlineInput.classList.add('vc-show');

    // Focus after a small delay to ensure visibility
    setTimeout(() => textArea.focus(), 100);
  }

  // Hide inline input
  function hideInlineInput() {
    inlineInput.classList.remove('vc-show');
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

      // Show processing status
      isProcessing = true;
      statusIndicator.classList.add('vc-show', 'vc-processing');
    } else {
      console.error('[Visual Claude] ✗ WebSocket not connected, state:', messageWs ? messageWs.readyState : 'null');
    }

    hideInlineInput();
  }

  // Update status indicator
  function setStatus(status) {
    statusIndicator.classList.remove('vc-processing', 'vc-complete');

    if (status === 'processing') {
      statusIndicator.innerHTML = '<span class="vc-spinner"></span>Processing...';
      statusIndicator.classList.add('vc-show', 'vc-processing');
      isProcessing = true;
    } else if (status === 'complete') {
      statusIndicator.innerHTML = 'Done ✓';
      statusIndicator.classList.add('vc-show', 'vc-complete');
      isProcessing = false;
      // Hide after animation
      setTimeout(() => {
        statusIndicator.classList.remove('vc-show', 'vc-complete');
      }, 2500);
    } else {
      statusIndicator.classList.remove('vc-show');
      isProcessing = false;
    }
  }

  // Mouse down handler - start drag
  function handleMouseDown(e) {
    // Skip if clicking on inline input or status indicator
    if (e.target.closest('.vc-inline-input, .vc-status-indicator')) return;
    // Skip if processing
    if (isProcessing) return;

    // Clear hover highlight when starting drag
    if (currentHoveredElement) {
      removeElementHighlight();
    }

    isDragging = true;
    dragStart = { x: e.clientX, y: e.clientY };
    dragEnd = { x: e.clientX, y: e.clientY };
    dragStartTime = Date.now();
  }

  // Mouse move handler - update drag
  function handleMouseMove(e) {
    if (isDragging) {
      dragEnd = { x: e.clientX, y: e.clientY };

      // Only show selection rect if moved more than 10px
      const distance = Math.sqrt(
        Math.pow(dragEnd.x - dragStart.x, 2) +
        Math.pow(dragEnd.y - dragStart.y, 2)
      );

      if (distance > 10) {
        selectionRect.classList.add('vc-show');
        updateSelectionRect();
        updateSelectionInfo();
      }
    }
  }

  // Mouse up handler - complete drag
  function handleMouseUp(e) {
    if (!isDragging) return;

    const dragDuration = Date.now() - dragStartTime;
    const distance = Math.sqrt(
      Math.pow(dragEnd.x - dragStart.x, 2) +
      Math.pow(dragEnd.y - dragStart.y, 2)
    );

    isDragging = false;
    selectionRect.classList.remove('vc-show');
    selectionInfo.classList.remove('vc-show');

    // If it's a click (small movement and short duration), allow normal behavior
    if (distance < 10 && dragDuration < 300) {
      console.log('[Visual Claude] Click detected, allowing normal interaction');
      return;
    }

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

    // Show inline input near cursor
    showInlineInput(e.clientX, e.clientY, bounds, elements);
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

  // Hover highlighting functions
  function findElementUnderCursor(target) {
    let element = target;
    let depth = 0;
    const maxDepth = 3;

    while (element && depth < maxDepth) {
      // Skip if it's a Visual Claude UI element
      if (element.classList &&
          (element.classList.contains('vc-selection-rect') ||
           element.classList.contains('vc-selection-info') ||
           element.classList.contains('vc-inline-input') ||
           element.classList.contains('vc-status-indicator'))) {
        return null;
      }

      // Check if element is valid and visible
      if (element.nodeType === Node.ELEMENT_NODE && element.offsetParent !== null) {
        const rect = element.getBoundingClientRect();
        if (rect.width > 5 && rect.height > 5) {
          return element;
        }
      }

      element = element.parentElement;
      depth++;
    }

    return null;
  }

  function applyElementHighlight(element) {
    if (!element) return;

    element.classList.add('vc-element-highlight');
    currentHoveredElement = element;

    // Show element info in tooltip
    const tagName = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    const classes = Array.from(element.classList)
      .filter(c => !c.startsWith('vc-'))
      .slice(0, 2)
      .join('.');
    const classStr = classes ? `.${classes}` : '';

    const label = `${tagName}${id}${classStr}`;

    // Position tooltip near element
    const rect = element.getBoundingClientRect();
    selectionInfo.textContent = label;
    selectionInfo.style.left = (rect.left + 10) + 'px';
    selectionInfo.style.top = (rect.top - 30) + 'px';
    selectionInfo.classList.add('vc-show');
  }

  function removeElementHighlight() {
    if (currentHoveredElement) {
      currentHoveredElement.classList.remove('vc-element-highlight');
      currentHoveredElement = null;
    }
    selectionInfo.classList.remove('vc-show');
  }

  function handleHover(e) {
    // Skip if dragging
    if (isDragging) {
      if (currentHoveredElement) {
        removeElementHighlight();
      }
      return;
    }

    // Skip if processing or inline input is open
    if (isProcessing || inlineInput.classList.contains('vc-show')) {
      if (currentHoveredElement) {
        removeElementHighlight();
      }
      return;
    }

    // Find element under cursor
    const element = findElementUnderCursor(e.target);

    // Update highlight if element changed
    if (element !== currentHoveredElement) {
      removeElementHighlight();
      if (element) {
        applyElementHighlight(element);
      }
    }
  }

  function handleHoverThrottled(e) {
    const now = Date.now();
    if (now - lastHoverCheckTime < HOVER_CHECK_THROTTLE) return;
    lastHoverCheckTime = now;
    handleHover(e);
  }

  // Event listeners
  document.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mousemove', (e) => {
    handleMouseMove(e);
    handleHoverThrottled(e);
  });
  document.addEventListener('mouseup', handleMouseUp);
  document.addEventListener('mouseleave', () => {
    if (currentHoveredElement) {
      removeElementHighlight();
    }
  });

  // Inline input event listeners
  inlineInput.querySelector('[data-action="cancel"]').addEventListener('click', (e) => {
    e.stopPropagation();
    hideInlineInput();
  });

  inlineInput.querySelector('[data-action="send"]').addEventListener('click', (e) => {
    e.stopPropagation();
    const instruction = inlineInput.querySelector('.vc-inline-text').value;
    sendMessage(instruction);
  });

  // Handle Enter key in textarea (Shift+Enter for new line)
  inlineInput.querySelector('.vc-inline-text').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const instruction = e.target.value;
      sendMessage(instruction);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hideInlineInput();
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
          setStatus('complete');
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
  console.log('[Visual Claude] Initialized with always-on drag-to-select ✓');
  console.log('[Visual Claude] Drag anywhere to select elements. Regular clicks work normally.');
})();
