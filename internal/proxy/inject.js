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
  let messageIdCounter = 0;
  let currentMessageId = null;

  // Hover state
  let currentHoveredElement = null;
  let lastHoverCheckTime = 0;
  const HOVER_CHECK_THROTTLE = 16; // ~60fps

  // Text editing state
  let currentEditingElement = null;

  // Click handling state
  let clickTimeout = null;

  // Mode toggle state
  let isEditMode = true;
  const EDIT_MODE_KEY = 'vc-edit-mode';
  const eventHandlers = {
    mousedown: null,
    mousemove: null,
    mouseup: null,
    mouseleave: null,
    dblclick: null,
    click: null
  };

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
      left: 24px;
      padding: 12px 20px;
      border-radius: 8px;
      background: white;
      color: #1f2937;
      border: 2.5px solid #333333;
      font-size: 14px;
      font-weight: 600;
      font-family: system-ui, -apple-system, sans-serif;
      z-index: 1000000;
      display: none;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .vc-status-indicator.vc-show {
      display: flex;
      animation: vc-fadeIn 0.2s ease;
    }

    .vc-status-indicator.vc-processing {
      background: #F19E38;
      color: #000000;
      border-color: #333333;
    }

    .vc-status-indicator.vc-complete {
      background: #22c55e;
      color: white;
      border-color: #333333;
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

    /* Text Editor */
    .vc-text-editor {
      position: fixed;
      background: white;
      border: 2.5px solid #333333;
      border-radius: 8px;
      padding: 14px;
      z-index: 1000002;
      display: none;
      min-width: 320px;
      max-width: 500px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    }

    .vc-text-editor.vc-show {
      display: block;
      animation: vc-fadeIn 0.2s ease;
    }

    .vc-text-editor-label {
      font-size: 11px;
      font-weight: 600;
      color: #666666;
      margin-bottom: 8px;
      font-family: system-ui, -apple-system, sans-serif;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .vc-text-editor-input {
      width: 100%;
      padding: 10px 12px;
      border: 2px solid #333333;
      border-radius: 6px;
      font-size: 14px;
      font-family: inherit;
      line-height: 1.5;
      resize: vertical;
      min-height: 70px;
      box-sizing: border-box;
    }

    .vc-text-editor-input:focus {
      outline: none;
      border-color: #F19E38;
      box-shadow: 0 0 0 3px rgba(241, 158, 56, 0.1);
    }

    .vc-text-editor-buttons {
      display: flex;
      gap: 8px;
      margin-top: 10px;
      justify-content: flex-end;
    }

    .vc-text-editor-preview {
      font-size: 11px;
      color: #666;
      margin-top: 8px;
      padding: 8px 10px;
      background: #f9fafb;
      border-radius: 4px;
      font-family: monospace;
      max-height: 80px;
      overflow-y: auto;
      word-break: break-word;
    }

    /* Mode Toolbar */
    .vc-mode-toolbar {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 1000003;
    }

    .vc-mode-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border: 2.5px solid #333333;
      border-radius: 50%;
      outline: none;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    }

    .vc-mode-toggle:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 20px rgba(0,0,0,0.2);
    }

    .vc-mode-toggle:active {
      transform: scale(1.0);
    }

    .vc-mode-toggle.vc-edit-mode {
      background: #F19E38;
      color: #000000;
    }

    .vc-mode-toggle.vc-view-mode {
      background: #e5e7eb;
      color: #4b5563;
    }

    .vc-mode-icon {
      width: 20px;
      height: 20px;
      fill: currentColor;
    }

    /* Hide VC UI elements in View Mode */
    body[data-vc-mode="view"] .vc-element-highlight,
    body[data-vc-mode="view"] .vc-selection-rect,
    body[data-vc-mode="view"] .vc-selection-info,
    body[data-vc-mode="view"] .vc-inline-input,
    body[data-vc-mode="view"] .vc-text-editor,
    body[data-vc-mode="view"] .vc-status-indicator {
      display: none !important;
    }

    /* Force custom cursor on all elements in Edit Mode */
    body[data-vc-mode="edit"],
    body[data-vc-mode="edit"] * {
      cursor: url('/__visual-claude/cursor.svg') 8 6, auto !important;
    }

    /* Keep normal cursor for VC UI elements */
    body[data-vc-mode="edit"] .vc-inline-input,
    body[data-vc-mode="edit"] .vc-inline-input *,
    body[data-vc-mode="edit"] .vc-text-editor,
    body[data-vc-mode="edit"] .vc-text-editor *,
    body[data-vc-mode="edit"] .vc-mode-toolbar,
    body[data-vc-mode="edit"] .vc-mode-toolbar * {
      cursor: auto !important;
    }

    /* Pointer cursor for VC buttons */
    body[data-vc-mode="edit"] .vc-inline-button,
    body[data-vc-mode="edit"] .vc-mode-toggle {
      cursor: pointer !important;
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
    <textarea class="vc-inline-text" rows="2" placeholder="What would you like Visual Claude to do?"></textarea>
    <div class="vc-inline-buttons">
      <button class="vc-inline-button vc-inline-button-cancel" data-action="cancel">Cancel</button>
      <button class="vc-inline-button vc-inline-button-send" data-action="send">Send</button>
    </div>
  `;
  document.body.appendChild(inlineInput);

  const textEditor = document.createElement('div');
  textEditor.className = 'vc-text-editor';
  textEditor.innerHTML = `
    <div class="vc-text-editor-label">Edit text content</div>
    <textarea class="vc-text-editor-input" rows="3" placeholder="Enter new text..."></textarea>
    <div class="vc-text-editor-preview"></div>
    <div class="vc-text-editor-buttons">
      <button class="vc-inline-button vc-inline-button-cancel" data-action="cancel-edit">Cancel</button>
      <button class="vc-inline-button vc-inline-button-send" data-action="save-edit">Save</button>
    </div>
  `;
  document.body.appendChild(textEditor);

  const statusIndicator = document.createElement('div');
  statusIndicator.className = 'vc-status-indicator';
  statusIndicator.innerHTML = '<span class="vc-spinner"></span>Processing...';
  document.body.appendChild(statusIndicator);

  const modeToolbar = document.createElement('div');
  modeToolbar.className = 'vc-mode-toolbar';
  modeToolbar.innerHTML = `
    <button class="vc-mode-toggle vc-edit-mode" data-action="toggle-mode" title="Edit Mode">
      <svg class="vc-mode-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
      </svg>
    </button>
  `;
  document.body.appendChild(modeToolbar);

  // Custom cursor URL (will be applied in Edit mode)
  const cursorURL = '/__visual-claude/cursor.svg';

  // Get elements within bounds
  function getElementsInBounds(bounds) {
    const elements = [];
    const allElements = document.querySelectorAll('body *');

    allElements.forEach(el => {
      // Skip our own UI elements
      if (el.closest('.vc-selection-rect, .vc-selection-info, .vc-inline-input, .vc-status-indicator, .vc-text-editor, .vc-mode-toolbar')) {
        return;
      }

      const rect = el.getBoundingClientRect();

      // Check if element intersects with selection (more forgiving than full containment)
      if (rect.left < bounds.right &&
          rect.right > bounds.left &&
          rect.top < bounds.bottom &&
          rect.bottom > bounds.top) {
        elements.push(el);
      }
    });

    return elements;
  }

  // Get element info
  function getElementInfo(element) {
    // Handle both string className (HTML) and SVGAnimatedString (SVG)
    let classes = '';
    if (element.className) {
      classes = typeof element.className === 'string'
        ? element.className
        : element.className.baseVal || '';
    }

    return {
      tagName: element.tagName,
      id: element.id || '',
      classes: classes,
      selector: getSelector(element),
      innerText: element.innerText || '',
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
        // Handle both string className (HTML) and SVGAnimatedString (SVG)
        const classNameStr = typeof element.className === 'string'
          ? element.className
          : element.className.baseVal || '';
        const classes = classNameStr.trim().split(/\s+/).filter(c => !c.startsWith('vc-'));
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

    // Generate unique message ID for tracking
    const messageId = ++messageIdCounter;
    currentMessageId = messageId;
    console.log('[Visual Claude] 🆔 Generated new message ID:', messageId);

    const message = {
      id: messageId,
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

      // Show processing status immediately (clear any previous status)
      setStatus('processing');

      messageWs.send(JSON.stringify(message));
      console.log('[Visual Claude] ✓ Message sent to server');
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

  // Mode toggle functions
  function enableEditMode() {
    isEditMode = true;
    localStorage.setItem(EDIT_MODE_KEY, 'true');

    // Apply custom cursor
    document.body.style.cursor = `url('${cursorURL}') 8 6, auto`;

    // Set body attribute for CSS
    document.body.setAttribute('data-vc-mode', 'edit');

    // Set up event handlers
    eventHandlers.mousedown = handleMouseDown;
    eventHandlers.mousemove = (e) => {
      handleMouseMove(e);
      handleHoverThrottled(e);
    };
    eventHandlers.mouseup = handleMouseUp;
    eventHandlers.mouseleave = () => {
      if (currentHoveredElement) {
        removeElementHighlight();
      }
    };
    eventHandlers.dblclick = handleDoubleClick;
    eventHandlers.click = handleClick;

    // Add event listeners
    document.addEventListener('mousedown', eventHandlers.mousedown);
    document.addEventListener('mousemove', eventHandlers.mousemove);
    document.addEventListener('mouseup', eventHandlers.mouseup);
    document.addEventListener('mouseleave', eventHandlers.mouseleave);
    document.addEventListener('dblclick', eventHandlers.dblclick);
    document.addEventListener('click', eventHandlers.click, true); // Use capture phase

    // Update toolbar UI
    updateToolbarUI();

    console.log('[Visual Claude] ✏️  Edit Mode enabled');
  }

  function disableEditMode() {
    isEditMode = false;
    localStorage.setItem(EDIT_MODE_KEY, 'false');

    // Remove custom cursor
    document.body.style.cursor = '';

    // Set body attribute for CSS
    document.body.setAttribute('data-vc-mode', 'view');

    // Remove event listeners
    if (eventHandlers.mousedown) {
      document.removeEventListener('mousedown', eventHandlers.mousedown);
      document.removeEventListener('mousemove', eventHandlers.mousemove);
      document.removeEventListener('mouseup', eventHandlers.mouseup);
      document.removeEventListener('mouseleave', eventHandlers.mouseleave);
      document.removeEventListener('dblclick', eventHandlers.dblclick);
      document.removeEventListener('click', eventHandlers.click, true);
    }

    // Cancel any pending click actions
    if (clickTimeout) {
      clearTimeout(clickTimeout);
      clickTimeout = null;
    }

    // Clean up any active UI elements
    hideInlineInput();
    hideTextEditor();
    removeElementHighlight();
    selectionRect.classList.remove('vc-show');
    selectionInfo.classList.remove('vc-show');

    // Reset drag state
    isDragging = false;
    dragStart = null;
    dragEnd = null;

    // Update toolbar UI
    updateToolbarUI();

    console.log('[Visual Claude] 👁️  View Mode enabled');
  }

  function updateToolbarUI() {
    const toggleBtn = modeToolbar.querySelector('.vc-mode-toggle');
    const modeIcon = toggleBtn.querySelector('.vc-mode-icon path');

    if (isEditMode) {
      toggleBtn.className = 'vc-mode-toggle vc-edit-mode';
      toggleBtn.setAttribute('title', 'Edit Mode - Click to switch to View Mode');
      // Edit icon SVG (pencil)
      modeIcon.setAttribute('d', 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z');
    } else {
      toggleBtn.className = 'vc-mode-toggle vc-view-mode';
      toggleBtn.setAttribute('title', 'View Mode - Click to switch to Edit Mode');
      // Eye icon SVG
      modeIcon.setAttribute('d', 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z');
    }
  }

  function toggleMode() {
    if (isEditMode) {
      disableEditMode();
    } else {
      enableEditMode();
    }
  }

  // Text editing functions
  function isTextEditable(element) {
    if (!element || !element.innerText) return false;

    const text = element.innerText.trim();
    if (text.length === 0) return false;

    const tagName = element.tagName.toLowerCase();
    const editableTags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                          'span', 'a', 'button', 'label', 'li', 'td', 'th', 'div'];

    return editableTags.includes(tagName) || element.hasAttribute('contenteditable');
  }

  function showTextEditor(element) {
    if (!element) return;

    currentEditingElement = element;
    removeElementHighlight();

    // Get current text
    const currentText = element.innerText.trim();

    // Update editor
    const input = textEditor.querySelector('.vc-text-editor-input');
    const preview = textEditor.querySelector('.vc-text-editor-preview');
    const label = textEditor.querySelector('.vc-text-editor-label');

    input.value = currentText;
    preview.textContent = `Current: "${currentText.substring(0, 100)}${currentText.length > 100 ? '...' : ''}"`;
    label.textContent = `Edit ${element.tagName.toLowerCase()} text`;

    // Position near element
    const rect = element.getBoundingClientRect();
    const editorWidth = 400;
    const editorHeight = 200;
    const padding = 20;

    let left = rect.left;
    let top = rect.bottom + 10;

    // Keep within viewport
    if (left + editorWidth > window.innerWidth - padding) {
      left = window.innerWidth - editorWidth - padding;
    }
    if (top + editorHeight > window.innerHeight - padding) {
      top = rect.top - editorHeight - 10;
    }

    left = Math.max(padding, left);
    top = Math.max(padding, top);

    textEditor.style.left = left + 'px';
    textEditor.style.top = top + 'px';
    textEditor.classList.add('vc-show');

    // Focus input
    setTimeout(() => {
      input.focus();
      input.select();
    }, 100);
  }

  function hideTextEditor() {
    textEditor.classList.remove('vc-show');
    currentEditingElement = null;
  }

  async function saveTextEdit() {
    if (!currentEditingElement) return;

    const input = textEditor.querySelector('.vc-text-editor-input');
    const newText = input.value.trim();
    const oldText = currentEditingElement.innerText.trim();

    if (!newText || newText === oldText) {
      hideTextEditor();
      return;
    }

    // Format instruction for Claude Code
    const elementInfo = getElementInfo(currentEditingElement);
    const instruction = `Change the text content from "${oldText}" to "${newText}"`;

    // Generate message ID
    const messageId = ++messageIdCounter;
    currentMessageId = messageId;
    console.log('[Visual Claude] 🆔 Generated new message ID:', messageId);

    const message = {
      id: messageId,
      area: {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        elementCount: 1,
        elements: [elementInfo],
      },
      instruction: instruction,
      screenshot: '',
    };

    console.log('[Visual Claude] Sending text edit:', message);

    if (messageWs && messageWs.readyState === WebSocket.OPEN) {
      setStatus('processing');
      messageWs.send(JSON.stringify(message));
      console.log('[Visual Claude] ✓ Text edit sent to server');
    } else {
      console.error('[Visual Claude] ✗ WebSocket not connected');
    }

    hideTextEditor();
  }

  // Click handler - prevent default actions in Edit Mode
  function handleClick(e) {
    // Skip if clicking on VC UI elements
    if (e.target.closest('.vc-inline-input, .vc-status-indicator, .vc-text-editor, .vc-mode-toolbar')) return;

    // Prevent default behavior for links and buttons in Edit Mode
    if (e.target.tagName === 'A' || e.target.closest('a')) {
      e.preventDefault();
      e.stopPropagation();
    }

    // Prevent form submissions
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.closest('button')) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // Double-click handler for text editing
  function handleDoubleClick(e) {
    // Skip if clicking on VC UI elements
    if (e.target.closest('.vc-inline-input, .vc-status-indicator, .vc-text-editor, .vc-mode-toolbar')) return;

    // Skip if processing
    if (isProcessing) return;

    // Cancel any pending single-click action
    if (clickTimeout) {
      clearTimeout(clickTimeout);
      clickTimeout = null;
    }

    // Prevent default behavior (especially for links)
    e.preventDefault();
    e.stopPropagation();

    // Find the text-editable element (check target and closest anchor)
    let element = e.target;

    // If double-clicking on a link, use the link element
    const linkElement = element.closest('a');
    if (linkElement && isTextEditable(linkElement)) {
      element = linkElement;
    }

    if (isTextEditable(element)) {
      showTextEditor(element);
    }
  }

  // Mouse down handler - start drag
  function handleMouseDown(e) {
    // Skip if clicking on VC UI elements
    if (e.target.closest('.vc-inline-input, .vc-status-indicator, .vc-text-editor, .vc-mode-toolbar')) return;
    // Skip if processing
    if (isProcessing) return;

    // Close text editor if open
    if (textEditor.classList.contains('vc-show')) {
      hideTextEditor();
    }

    // Check WebSocket connection state
    if (!messageWs || messageWs.readyState !== WebSocket.OPEN) {
      console.warn('[Visual Claude] WebSocket not ready - state:',
        messageWs ? messageWs.readyState : 'null',
        '(0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)');
    }

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

    // If it's a single click (small movement and short duration), select the clicked element
    if (distance < 5 && dragDuration < 200) {
      console.log('[Visual Claude] Single click detected, delaying to check for double-click');

      // Cancel any existing timeout
      if (clickTimeout) {
        clearTimeout(clickTimeout);
      }

      // Delay single-click action to distinguish from double-click
      clickTimeout = setTimeout(() => {
        console.log('[Visual Claude] Processing single click');

        // Find the element that was clicked
        const clickedElement = findElementUnderCursor(e.target);

        if (!clickedElement) {
          console.log('[Visual Claude] No valid element found at click position');
          return;
        }

        // Get element bounds for the selection
        const rect = clickedElement.getBoundingClientRect();
        const bounds = {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };

        // Show inline input for single element
        showInlineInput(e.clientX, e.clientY, bounds, [clickedElement]);
        clickTimeout = null;
      }, 250); // Wait 250ms to distinguish from double-click

      return;
    }

    // Calculate bounds for drag selection
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
      console.log('[Visual Claude] Selection rejected - too small:', {
        width: bounds.width,
        height: bounds.height,
        minRequired: '10x10px'
      });
      return;
    }

    // Get elements in selection
    const elements = getElementsInBounds(bounds);

    if (elements.length === 0) {
      console.log('[Visual Claude] Selection rejected - no elements found:', {
        bounds: bounds,
        totalElements: document.querySelectorAll('body *').length
      });
      return;
    }

    console.log('[Visual Claude] Selection successful:', {
      elements: elements.length,
      bounds: `${bounds.width}x${bounds.height}px`
    });

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
      if (element.closest('.vc-selection-rect, .vc-selection-info, .vc-inline-input, .vc-status-indicator, .vc-text-editor, .vc-mode-toolbar')) {
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

    // Skip if processing or any input is open
    if (isProcessing || inlineInput.classList.contains('vc-show') || textEditor.classList.contains('vc-show')) {
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

  // Initialize mode toggle functionality
  function initializeMode() {
    // Add toolbar toggle listener
    modeToolbar.querySelector('[data-action="toggle-mode"]').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMode();
    });

    // Add keyboard shortcut: Cmd/Ctrl + Shift + E
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        toggleMode();
      }
    });

    // Check saved mode preference
    const savedMode = localStorage.getItem(EDIT_MODE_KEY);
    if (savedMode === 'false') {
      disableEditMode();
    } else {
      enableEditMode(); // Default to Edit Mode
    }
  }

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

  // Text editor event listeners
  textEditor.querySelector('[data-action="cancel-edit"]').addEventListener('click', (e) => {
    e.stopPropagation();
    hideTextEditor();
  });

  textEditor.querySelector('[data-action="save-edit"]').addEventListener('click', (e) => {
    e.stopPropagation();
    saveTextEdit();
  });

  textEditor.querySelector('.vc-text-editor-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      saveTextEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hideTextEditor();
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
        console.log('[Visual Claude] Message from server:', data, 'currentMessageId:', currentMessageId);

        // Check if this message is for the current request
        if (data.id && data.id !== currentMessageId) {
          console.warn('[Visual Claude] ⚠️  Ignoring stale message - received ID:', data.id, 'current:', currentMessageId, 'status:', data.status);
          return;
        }

        // Safety check: if we don't have a current message ID but receive a completion, ignore it
        if (!currentMessageId && (data.status === 'complete' || data.status === 'error')) {
          console.warn('[Visual Claude] ⚠️  Ignoring completion message with no active request');
          return;
        }

        // Listen for completion status
        if (data.status === 'received') {
          // Message was received by server (already showing "Processing...")
          console.log('[Visual Claude] ✅ Server acknowledged receipt of message ID:', data.id);
        } else if (data.status === 'complete') {
          // Claude finished processing
          console.log('[Visual Claude] 🎉 Task completed successfully for message ID:', data.id);
          console.log('[Visual Claude] 🎯 About to call setStatus("complete")');
          setStatus('complete');
          console.log('[Visual Claude] 🧹 Clearing currentMessageId (was:', currentMessageId, ')');
          currentMessageId = null; // Clear current message ID
        } else if (data.status === 'error') {
          // Error occurred
          console.log('[Visual Claude] ❌ Error occurred for message ID:', data.id, 'Error:', data.error);
          setStatus('error');
          currentMessageId = null; // Clear current message ID
        } else {
          console.warn('[Visual Claude] ⚠️  Unknown status received:', data.status);
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
  initializeMode();
  connectWebSockets();
  console.log('[Visual Claude] Initialized ✓');
  console.log('[Visual Claude] Toggle between Edit and View modes using the toolbar (bottom-right corner)');
})();
