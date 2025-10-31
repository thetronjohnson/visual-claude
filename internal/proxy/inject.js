// Visual Claude - Alpine.js Component Architecture
(function() {
  'use strict';

  // Note: This script loads with defer, so VCUtils is guaranteed to be loaded
  // Alpine.js loads after this script, so it will pick up our component definition

  // ============================================================================
  // MAIN ALPINE COMPONENT
  // ============================================================================

  window.visualClaude = function() {
    return {
      // State
      isDragging: false,
      dragStart: null,
      dragEnd: null,
      dragStartTime: null,
      selectedElements: [],
      isProcessing: false,
      messageIdCounter: 0,
      currentMessageId: null,
      currentHoveredElement: null,
      lastHoverCheckTime: 0,
      currentEditingElement: null,
      clickTimeout: null,
      processingTimeout: null,
      isEditMode: true,

      // WebSockets
      reloadWs: null,
      messageWs: null,

      // UI State
      showSelectionRect: false,
      showSelectionInfo: false,
      showInlineInput: false,
      showTextEditor: false,
      showStatusIndicator: false,
      showDesignModal: false,

      // UI Data
      selectionRectStyle: '',
      selectionInfoStyle: '',
      selectionInfoText: '',
      inlineInputStyle: '',
      inlineInputBadge: '',
      inlineInputText: '',
      textEditorStyle: '',
      textEditorLabel: 'Edit text content',
      textEditorValue: '',
      textEditorPreview: '',
      statusText: 'Processing...',
      statusClass: '',

      // Design Upload State
      uploadedImage: null,
      imagePreview: '',
      designPrompt: '',
      isAnalyzing: false,
      analysisError: '',
      analysisStep: '', // 'analyzing', 'sending', 'processing', ''
      currentDesignMessageId: null,

      // ============================================================================
      // INITIALIZATION
      // ============================================================================

      init() {
        console.log('[Visual Claude] Initializing Alpine component...');

        // Initialize mode from localStorage
        const savedMode = localStorage.getItem(window.VCConstants.EDIT_MODE_KEY);
        if (savedMode === 'false') {
          this.isEditMode = false;
          this.disableEditMode();
        } else {
          this.isEditMode = true;
          this.enableEditMode();
        }

        // Connect WebSockets
        this.connectWebSockets();

        // Keyboard shortcut: Cmd/Ctrl + Shift + E
        document.addEventListener('keydown', (e) => {
          if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'E') {
            e.preventDefault();
            this.toggleMode();
          }
        });

        console.log('[Visual Claude] Initialized ✓');
        console.log('[Visual Claude] Toggle modes using Cmd/Ctrl+Shift+E or the toolbar');
      },

      // ============================================================================
      // MODE MANAGEMENT
      // ============================================================================

      enableEditMode() {
        this.isEditMode = true;
        localStorage.setItem(window.VCConstants.EDIT_MODE_KEY, 'true');
        document.body.setAttribute('data-vc-mode', 'edit');

        // Add event listeners
        document.addEventListener('mousedown', this.handleMouseDown.bind(this));
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        document.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
        document.addEventListener('dblclick', this.handleDoubleClick.bind(this));
        document.addEventListener('click', this.handleClick.bind(this), true);

        console.log('[Visual Claude] ✏️  Edit Mode enabled');
      },

      disableEditMode() {
        this.isEditMode = false;
        localStorage.setItem(window.VCConstants.EDIT_MODE_KEY, 'false');
        document.body.setAttribute('data-vc-mode', 'view');

        // Clean up
        this.hideInlineInput();
        this.hideTextEditor();
        this.removeElementHighlight();
        this.showSelectionRect = false;
        this.showSelectionInfo = false;
        this.isDragging = false;
        this.dragStart = null;
        this.dragEnd = null;

        if (this.clickTimeout) {
          clearTimeout(this.clickTimeout);
          this.clickTimeout = null;
        }

        if (this.processingTimeout) {
          clearTimeout(this.processingTimeout);
          this.processingTimeout = null;
        }

        console.log('[Visual Claude] 👁️  View Mode enabled');
      },

      toggleMode() {
        if (this.isEditMode) {
          this.disableEditMode();
        } else {
          this.enableEditMode();
        }
      },

      // ============================================================================
      // MOUSE EVENT HANDLERS
      // ============================================================================

      handleMouseDown(e) {
        if (e.target.closest(window.VCConstants.VC_UI_SELECTOR)) return;
        if (this.isProcessing) return;
        if (!this.isEditMode) return;

        if (this.showTextEditor) {
          this.hideTextEditor();
        }

        if (this.currentHoveredElement) {
          this.removeElementHighlight();
        }

        this.isDragging = true;
        this.dragStart = { x: e.clientX, y: e.clientY };
        this.dragEnd = { x: e.clientX, y: e.clientY };
        this.dragStartTime = Date.now();
      },

      handleMouseMove(e) {
        if (!this.isEditMode) return;

        if (this.isDragging) {
          this.dragEnd = { x: e.clientX, y: e.clientY };

          const distance = window.VCUtils.calculateDistance(this.dragStart, this.dragEnd);

          if (distance > window.VCConstants.MIN_DRAG_DISTANCE) {
            this.showSelectionRect = true;
            this.updateSelectionRect();
            this.updateSelectionInfo();
          }
        } else {
          this.handleHoverThrottled(e);
        }
      },

      handleMouseUp(e) {
        if (!this.isDragging || !this.isEditMode) return;

        const dragDuration = Date.now() - this.dragStartTime;
        const distance = window.VCUtils.calculateDistance(this.dragStart, this.dragEnd);

        this.isDragging = false;
        this.showSelectionRect = false;
        this.showSelectionInfo = false;

        // Single click detection
        if (distance < window.VCConstants.CLICK_MAX_DISTANCE &&
            dragDuration < window.VCConstants.CLICK_MAX_DURATION) {
          console.log('[Visual Claude] Single click detected');

          if (this.clickTimeout) {
            clearTimeout(this.clickTimeout);
          }

          this.clickTimeout = setTimeout(() => {
            const clickedElement = window.VCUtils.findElementUnderCursor(e.target);

            if (!clickedElement) {
              console.log('[Visual Claude] No valid element found');
              return;
            }

            const rect = clickedElement.getBoundingClientRect();
            const bounds = {
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
            };

            this.openInlineInput(e.clientX, e.clientY, bounds, [clickedElement]);
            this.clickTimeout = null;
          }, window.VCConstants.CLICK_DOUBLE_CLICK_DELAY);

          return;
        }

        // Drag selection
        const bounds = window.VCUtils.calculateBounds(this.dragStart, this.dragEnd);

        if (bounds.width < window.VCConstants.MIN_SELECTION_SIZE ||
            bounds.height < window.VCConstants.MIN_SELECTION_SIZE) {
          console.log('[Visual Claude] Selection too small');
          return;
        }

        const elements = window.VCUtils.getElementsInBounds(bounds);

        if (elements.length === 0) {
          console.log('[Visual Claude] No elements found');
          return;
        }

        console.log('[Visual Claude] Selection successful:', elements.length, 'elements');
        this.openInlineInput(e.clientX, e.clientY, bounds, elements);
      },

      handleMouseLeave() {
        if (this.currentHoveredElement && this.isEditMode) {
          this.removeElementHighlight();
        }
      },

      handleClick(e) {
        if (!this.isEditMode) return;
        if (e.target.closest(window.VCConstants.VC_UI_SELECTOR)) return;

        // Prevent default behavior in edit mode
        if (e.target.tagName === 'A' || e.target.closest('a')) {
          e.preventDefault();
          e.stopPropagation();
        }

        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.closest('button')) {
          e.preventDefault();
          e.stopPropagation();
        }
      },

      handleDoubleClick(e) {
        if (!this.isEditMode) return;
        if (e.target.closest(window.VCConstants.VC_UI_SELECTOR)) return;
        if (this.isProcessing) return;

        if (this.clickTimeout) {
          clearTimeout(this.clickTimeout);
          this.clickTimeout = null;
        }

        e.preventDefault();
        e.stopPropagation();

        let element = e.target;
        const linkElement = element.closest('a');
        if (linkElement && window.VCUtils.isTextEditable(linkElement)) {
          element = linkElement;
        }

        if (window.VCUtils.isTextEditable(element)) {
          this.openTextEditor(element);
        }
      },

      // ============================================================================
      // HOVER HIGHLIGHTING
      // ============================================================================

      handleHoverThrottled(e) {
        const now = Date.now();
        if (now - this.lastHoverCheckTime < window.VCConstants.HOVER_CHECK_THROTTLE) return;
        this.lastHoverCheckTime = now;
        this.handleHover(e);
      },

      handleHover(e) {
        if (this.isDragging) {
          if (this.currentHoveredElement) {
            this.removeElementHighlight();
          }
          return;
        }

        if (this.isProcessing || this.showInlineInput || this.showTextEditor) {
          if (this.currentHoveredElement) {
            this.removeElementHighlight();
          }
          return;
        }

        const element = window.VCUtils.findElementUnderCursor(e.target);

        if (element !== this.currentHoveredElement) {
          this.removeElementHighlight();
          if (element) {
            this.applyElementHighlight(element);
          }
        }
      },

      applyElementHighlight(element) {
        if (!element) return;

        element.classList.add('vc-element-highlight');
        this.currentHoveredElement = element;

        const label = window.VCUtils.getElementLabel(element);
        const rect = element.getBoundingClientRect();

        this.selectionInfoText = label;
        this.selectionInfoStyle = `left: ${rect.left + 10}px; top: ${rect.top - 30}px;`;
        this.showSelectionInfo = true;
      },

      removeElementHighlight() {
        if (this.currentHoveredElement) {
          this.currentHoveredElement.classList.remove('vc-element-highlight');
          this.currentHoveredElement = null;
        }
        this.showSelectionInfo = false;
      },

      // ============================================================================
      // SELECTION RECT & INFO
      // ============================================================================

      updateSelectionRect() {
        const bounds = window.VCUtils.calculateBounds(this.dragStart, this.dragEnd);
        this.selectionRectStyle = `left: ${bounds.left}px; top: ${bounds.top}px; width: ${bounds.width}px; height: ${bounds.height}px;`;
      },

      updateSelectionInfo() {
        const width = Math.abs(this.dragEnd.x - this.dragStart.x);
        const height = Math.abs(this.dragEnd.y - this.dragStart.y);
        this.selectionInfoText = window.VCUtils.formatAreaSize(width, height);
        this.selectionInfoStyle = `left: ${this.dragEnd.x + 10}px; top: ${this.dragEnd.y + 10}px;`;
        this.showSelectionInfo = true;
      },

      // ============================================================================
      // INLINE INPUT
      // ============================================================================

      openInlineInput(cursorX, cursorY, bounds, elements) {
        this.selectedElements = elements;

        const areaSize = window.VCUtils.formatAreaSize(bounds.width, bounds.height);
        const elementCount = elements.length;

        this.inlineInputBadge = `${elementCount} element${elementCount !== 1 ? 's' : ''} · ${areaSize}`;
        this.inlineInputText = '';

        const pos = window.VCUtils.positionInViewport(
          cursorX, cursorY,
          window.VCConstants.INPUT_WIDTH,
          window.VCConstants.INPUT_HEIGHT
        );

        this.inlineInputStyle = `left: ${pos.left}px; top: ${pos.top}px;`;
        this.showInlineInput = true;

        // Focus textarea after render
        this.$nextTick(() => {
          const textarea = document.querySelector('.vc-inline-text');
          if (textarea) textarea.focus();
        });
      },

      hideInlineInput() {
        this.showInlineInput = false;
        this.selectedElements = [];
        this.inlineInputText = '';
      },

      async sendInlineMessage() {
        if (!this.selectedElements.length || !this.inlineInputText.trim()) {
          console.warn('[Visual Claude] Cannot send: no elements or instruction');
          return;
        }

        const bounds = window.VCUtils.calculateBounds(this.dragStart, this.dragEnd);
        const screenshot = await window.VCUtils.captureAreaScreenshot(bounds);
        const elementsInfo = this.selectedElements.map(el => window.VCUtils.getElementInfo(el));

        const messageId = ++this.messageIdCounter;
        this.currentMessageId = messageId;

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
          instruction: this.inlineInputText.trim(),
          screenshot: screenshot,
        };

        console.log('[Visual Claude] Sending message:', messageId);

        if (this.messageWs && this.messageWs.readyState === WebSocket.OPEN) {
          this.setStatus('processing');
          this.messageWs.send(JSON.stringify(message));
          console.log('[Visual Claude] ✓ Message sent');
        } else {
          console.error('[Visual Claude] ✗ WebSocket not connected');
        }

        this.hideInlineInput();
      },

      // ============================================================================
      // TEXT EDITOR
      // ============================================================================

      openTextEditor(element) {
        if (!element) return;

        this.currentEditingElement = element;
        this.removeElementHighlight();

        const currentText = element.innerText.trim();

        this.textEditorValue = currentText;
        this.textEditorPreview = `Current: "${currentText.substring(0, 100)}${currentText.length > 100 ? '...' : ''}"`;
        this.textEditorLabel = `Edit ${element.tagName.toLowerCase()} text`;

        const rect = element.getBoundingClientRect();
        const pos = window.VCUtils.positionInViewport(
          rect.left, rect.bottom + 10,
          window.VCConstants.EDITOR_WIDTH,
          window.VCConstants.EDITOR_HEIGHT
        );

        this.textEditorStyle = `left: ${pos.left}px; top: ${pos.top}px;`;
        this.showTextEditor = true;

        this.$nextTick(() => {
          const input = document.querySelector('.vc-text-editor-input');
          if (input) {
            input.focus();
            input.select();
          }
        });
      },

      hideTextEditor() {
        this.showTextEditor = false;
        this.currentEditingElement = null;
        this.textEditorValue = '';
      },

      async saveTextEdit() {
        if (!this.currentEditingElement) return;

        const newText = this.textEditorValue.trim();
        const oldText = this.currentEditingElement.innerText.trim();

        if (!newText || newText === oldText) {
          this.hideTextEditor();
          return;
        }

        const elementInfo = window.VCUtils.getElementInfo(this.currentEditingElement);
        const instruction = `Change the text content from "${oldText}" to "${newText}"`;

        const messageId = ++this.messageIdCounter;
        this.currentMessageId = messageId;

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

        console.log('[Visual Claude] Sending text edit:', messageId);

        if (this.messageWs && this.messageWs.readyState === WebSocket.OPEN) {
          this.setStatus('processing');
          this.messageWs.send(JSON.stringify(message));
          console.log('[Visual Claude] ✓ Text edit sent');
        } else {
          console.error('[Visual Claude] ✗ WebSocket not connected');
        }

        this.hideTextEditor();
      },

      // ============================================================================
      // DESIGN-TO-CODE MODAL
      // ============================================================================

      openDesignModal() {
        // Reset state
        this.uploadedImage = null;
        this.imagePreview = '';
        this.designPrompt = '';
        this.isAnalyzing = false;
        this.analysisError = '';

        this.showDesignModal = true;

        // Add paste listener
        document.addEventListener('paste', this.handleImagePaste.bind(this));

        console.log('[Visual Claude] Design modal opened');
      },

      closeDesignModal() {
        this.showDesignModal = false;

        // Remove paste listener
        document.removeEventListener('paste', this.handleImagePaste.bind(this));

        // Clean up
        this.uploadedImage = null;
        this.imagePreview = '';
        this.designPrompt = '';
        this.isAnalyzing = false;
        this.analysisError = '';
        this.analysisStep = '';
        this.currentDesignMessageId = null;

        console.log('[Visual Claude] Design modal closed');
      },

      handleImageDrop(e) {
        e.preventDefault();
        e.stopPropagation();

        const file = e.dataTransfer?.files?.[0];
        if (file && file.type.startsWith('image/')) {
          this.processImage(file);
        }
      },

      handleImagePaste(e) {
        if (!this.showDesignModal) return;

        const items = e.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            e.preventDefault();
            const file = items[i].getAsFile();
            if (file) {
              this.processImage(file);
            }
            break;
          }
        }
      },

      async processImage(file) {
        console.log('[Visual Claude] Processing image:', file.name);

        // Create preview
        const reader = new FileReader();
        reader.onload = (e) => {
          this.imagePreview = e.target.result;
          this.uploadedImage = e.target.result.split(',')[1]; // Base64 without prefix
          console.log('[Visual Claude] ✓ Image processed');
        };
        reader.readAsDataURL(file);
      },

      async analyzeAndExecute() {
        if (!this.uploadedImage || !this.designPrompt.trim()) {
          console.warn('[Visual Claude] Cannot proceed: missing image or prompt');
          return;
        }

        this.isAnalyzing = true;
        this.analysisError = '';
        this.analysisStep = 'analyzing';

        const message = {
          type: 'analyze-design',
          image: this.uploadedImage,
          prompt: this.designPrompt.trim(),
        };

        console.log('[Visual Claude] Sending design to Claude Vision...');

        if (this.messageWs && this.messageWs.readyState === WebSocket.OPEN) {
          this.messageWs.send(JSON.stringify(message));
        } else {
          console.error('[Visual Claude] ✗ WebSocket not connected');
          this.analysisError = 'WebSocket not connected';
          this.isAnalyzing = false;
          this.analysisStep = '';
        }
      },

      handleDesignProgress(data) {
        if (data.status === 'received') {
          console.log('[Visual Claude] Design received, analyzing...');
          this.currentDesignMessageId = data.id;
          this.analysisStep = 'analyzing';
        } else if (data.status === 'complete') {
          console.log('[Visual Claude] Design analysis complete, implementation starting...');
          // Close modal and show status indicator
          this.closeDesignModal();
          this.setStatus('processing');
        } else if (data.status === 'error') {
          console.error('[Visual Claude] Design error:', data.error);
          this.analysisError = data.error || 'An error occurred';
          this.isAnalyzing = false;
          this.analysisStep = '';
        }
      },

      // ============================================================================
      // STATUS INDICATOR
      // ============================================================================

      setStatus(status) {
        this.statusClass = '';

        if (status === 'processing') {
          this.statusText = '<span class="vc-spinner"></span>Processing...';
          this.statusClass = 'vc-processing';
          this.showStatusIndicator = true;
          this.isProcessing = true;

          if (this.processingTimeout) {
            clearTimeout(this.processingTimeout);
          }
          this.processingTimeout = setTimeout(() => {
            console.warn('[Visual Claude] ⚠️  Processing timeout - reloading');
            window.location.reload();
          }, window.VCConstants.PROCESSING_TIMEOUT);

        } else if (status === 'complete') {
          if (this.processingTimeout) {
            clearTimeout(this.processingTimeout);
            this.processingTimeout = null;
          }

          this.statusText = 'Done ✓';
          this.statusClass = 'vc-complete';
          this.showStatusIndicator = true;
          this.isProcessing = false;

          console.log('[Visual Claude] Task completed, reloading...');
          setTimeout(() => {
            window.location.reload();
          }, window.VCConstants.RELOAD_DELAY);

        } else {
          if (this.processingTimeout) {
            clearTimeout(this.processingTimeout);
            this.processingTimeout = null;
          }

          this.showStatusIndicator = false;
          this.isProcessing = false;
        }
      },

      // ============================================================================
      // WEBSOCKET CONNECTIONS
      // ============================================================================

      connectWebSockets() {
        // Reload WebSocket
        this.reloadWs = new WebSocket(window.VCUtils.getWebSocketURL(window.VCConstants.WS_RELOAD_PATH));

        this.reloadWs.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.type === 'reload') {
            console.log('[Visual Claude] Reloading page...');
            window.location.reload();
          }
        };

        this.reloadWs.onerror = (error) => {
          console.error('[Visual Claude] Reload WebSocket error:', error);
        };

        this.reloadWs.onclose = () => {
          console.log('[Visual Claude] Reload WebSocket closed, reconnecting...');
          setTimeout(() => this.connectWebSockets(), window.VCConstants.WS_RECONNECT_DELAY);
        };

        // Message WebSocket
        this.messageWs = new WebSocket(window.VCUtils.getWebSocketURL(window.VCConstants.WS_MESSAGE_PATH));

        this.messageWs.onopen = () => {
          console.log('[Visual Claude] Connected to Claude Code');
        };

        this.messageWs.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('[Visual Claude] Message from server:', data);

            // Handle design analysis progress
            if (this.currentDesignMessageId && data.id === this.currentDesignMessageId) {
              this.handleDesignProgress(data);
              if (data.status === 'complete' || data.status === 'error') {
                this.currentDesignMessageId = null;
              }
              return;
            }

            if (data.id && data.id !== this.currentMessageId) {
              console.warn('[Visual Claude] ⚠️  Ignoring stale message');
              return;
            }

            if (!this.currentMessageId && (data.status === 'complete' || data.status === 'error')) {
              console.warn('[Visual Claude] ⚠️  Ignoring completion with no active request');
              return;
            }

            if (data.status === 'received') {
              console.log('[Visual Claude] ✅ Server acknowledged');
            } else if (data.status === 'complete') {
              console.log('[Visual Claude] 🎉 Task completed');
              this.setStatus('complete');
              this.currentMessageId = null;
            } else if (data.status === 'error') {
              console.error('[Visual Claude] ❌ Error:', data.error);
              this.statusText = 'Error - Reloading...';
              this.statusClass = '';
              this.showStatusIndicator = true;
              this.currentMessageId = null;
              setTimeout(() => {
                window.location.reload();
              }, window.VCConstants.ERROR_RELOAD_DELAY);
            }
          } catch (err) {
            console.error('[Visual Claude] Failed to parse message:', err);
            if (this.isProcessing) {
              setTimeout(() => window.location.reload(), 1000);
            }
          }
        };

        this.messageWs.onerror = (error) => {
          console.error('[Visual Claude] Message WebSocket error:', error);
          if (this.isProcessing) {
            setTimeout(() => window.location.reload(), window.VCConstants.ERROR_RELOAD_DELAY);
          }
        };

        this.messageWs.onclose = () => {
          console.log('[Visual Claude] Message WebSocket closed');
          if (this.isProcessing) {
            setTimeout(() => window.location.reload(), window.VCConstants.ERROR_RELOAD_DELAY);
          }
        };
      },

      // ============================================================================
      // COMPUTED PROPERTIES
      // ============================================================================

      get modeIcon() {
        return this.isEditMode
          ? 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z'
          : 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z';
      },

      get modeTitle() {
        return this.isEditMode
          ? 'Edit Mode - Click to switch to View Mode'
          : 'View Mode - Click to switch to Edit Mode';
      },

      get modeClass() {
        return this.isEditMode ? 'vc-edit-mode' : 'vc-view-mode';
      }
    };
  };

  console.log('[Visual Claude] Component defined ✓');

  // ============================================================================
  // CREATE UI STRUCTURE WITH ALPINE DIRECTIVES
  // ============================================================================

  // Create app container
  const app = document.createElement('div');
  app.setAttribute('x-data', 'visualClaude()');
  app.setAttribute('x-init', 'init()');

  // Selection Rectangle
  app.innerHTML += `
    <div x-show="showSelectionRect"
         x-bind:style="selectionRectStyle"
         class="vc-selection-rect vc-show">
    </div>
  `;

  // Selection Info Tooltip
  app.innerHTML += `
    <div x-show="showSelectionInfo"
         x-bind:style="selectionInfoStyle"
         x-text="selectionInfoText"
         class="vc-selection-info vc-show">
    </div>
  `;

  // Inline Input Modal
  app.innerHTML += `
    <div x-show="showInlineInput"
         x-bind:style="inlineInputStyle"
         class="vc-inline-input vc-show bg-white border-[2.5px] border-[#333] rounded-lg p-3 fixed z-[1000000] min-w-[300px] max-w-[400px]">
      <div x-text="inlineInputBadge"
           class="text-xs font-semibold text-[#333] mb-2 font-sans"></div>
      <textarea x-model="inlineInputText"
                @keydown.enter.prevent="!$event.shiftKey && sendInlineMessage()"
                @keydown.escape.prevent="hideInlineInput()"
                rows="2"
                placeholder="What would you like Visual Claude to do?"
                class="w-full p-2.5 border-2 border-[#333] rounded-md text-sm font-sans leading-snug resize-none focus:outline-none focus:border-[#333]"></textarea>
      <div class="flex gap-2 mt-2 justify-end">
        <button @click="hideInlineInput()"
                class="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all duration-200 ease font-sans bg-gray-200 text-[#333] border-[2.5px] border-[#333] hover:opacity-85 active:scale-95">
          Cancel
        </button>
        <button @click="sendInlineMessage()"
                class="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all duration-200 ease font-sans bg-[#F19E38] text-black border-[2.5px] border-[#333] hover:opacity-85 active:scale-95">
          Send
        </button>
      </div>
    </div>
  `;

  // Text Editor Modal
  app.innerHTML += `
    <div x-show="showTextEditor"
         x-bind:style="textEditorStyle"
         class="vc-text-editor vc-show bg-white border-[2.5px] border-[#333] rounded-lg p-3.5 fixed z-[1000002] min-w-[320px] max-w-[500px] shadow-lg">
      <div x-text="textEditorLabel"
           class="text-[11px] font-semibold text-[#666] mb-2 font-sans uppercase tracking-wide"></div>
      <textarea x-model="textEditorValue"
                @keydown.enter.meta.prevent="saveTextEdit()"
                @keydown.enter.ctrl.prevent="saveTextEdit()"
                @keydown.escape.prevent="hideTextEditor()"
                rows="3"
                placeholder="Enter new text..."
                class="w-full p-2.5 px-3 border-2 border-[#333] rounded-md text-sm font-sans leading-normal resize-y min-h-[70px] box-border focus:outline-none focus:border-[#F19E38] focus:shadow-[0_0_0_3px_rgba(241,158,56,0.1)]"></textarea>
      <div x-text="textEditorPreview"
           class="text-[11px] text-[#666] mt-2 p-2 px-2.5 bg-gray-50 rounded font-mono max-h-20 overflow-y-auto break-words"></div>
      <div class="flex gap-2 mt-2.5 justify-end">
        <button @click="hideTextEditor()"
                class="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all duration-200 ease font-sans bg-gray-200 text-[#333] border-[2.5px] border-[#333] hover:opacity-85 active:scale-95">
          Cancel
        </button>
        <button @click="saveTextEdit()"
                class="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all duration-200 ease font-sans bg-[#F19E38] text-black border-[2.5px] border-[#333] hover:opacity-85 active:scale-95">
          Save
        </button>
      </div>
    </div>
  `;

  // Status Indicator
  app.innerHTML += `
    <div x-show="showStatusIndicator"
         x-bind:class="statusClass"
         x-html="statusText"
         x-transition
         class="vc-status-indicator fixed bottom-6 left-6 px-5 py-3 rounded-lg bg-white text-gray-900 border-[2.5px] border-[#333] text-sm font-semibold font-sans z-[1000000] flex items-center gap-2 shadow-lg transition-all duration-200 ease">
    </div>
  `;

  // Design-to-Code Modal
  app.innerHTML += `
    <div x-show="showDesignModal"
         x-transition
         class="vc-design-modal fixed inset-0 z-[1000004] flex items-center justify-center p-4"
         style="background: rgba(0, 0, 0, 0.5);">

      <div @click.away="closeDesignModal()"
           class="bg-white border-[2.5px] border-[#333] rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">

        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b-[2.5px] border-[#333] bg-[#F19E38]">
          <h2 class="text-lg font-bold text-black font-sans">Create Component from Design</h2>
          <button @click="closeDesignModal()"
                  class="w-8 h-8 flex items-center justify-center rounded-md border-[2.5px] border-[#333] bg-white hover:bg-gray-100 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- Body -->
        <div class="p-6 space-y-6">

          <!-- Upload Zone -->
          <div x-show="!imagePreview">
            <label class="block text-sm font-semibold text-[#333] mb-2 font-sans">Upload Design Image</label>
            <div @drop="handleImageDrop($event)"
                 @dragover.prevent
                 @dragenter.prevent
                 class="border-2 border-dashed border-[#333] rounded-lg p-12 text-center cursor-pointer hover:bg-gray-50 transition-colors">
              <input type="file"
                     accept="image/*"
                     @change="processImage($event.target.files[0])"
                     class="hidden"
                     id="vc-design-upload">
              <svg class="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
              <p class="text-lg font-semibold text-[#333] mb-2">Drop your design here</p>
              <p class="text-sm text-gray-500 mb-4">or</p>
              <label for="vc-design-upload"
                     class="inline-block px-4 py-2 rounded-md text-sm font-semibold cursor-pointer bg-[#F19E38] text-black border-[2.5px] border-[#333] hover:opacity-85 transition-opacity">
                Browse Files
              </label>
              <p class="text-xs text-gray-400 mt-4">You can also paste (Cmd+V) an image</p>
            </div>
          </div>

          <!-- Image Preview -->
          <div x-show="imagePreview" class="space-y-4">
            <div class="flex items-center justify-between">
              <label class="block text-sm font-semibold text-[#333] font-sans">Design Preview</label>
              <button @click="imagePreview = ''; uploadedImage = null"
                      class="text-xs text-red-600 hover:text-red-700 font-semibold">
                Remove Image
              </button>
            </div>
            <div class="border-[2.5px] border-[#333] rounded-lg overflow-hidden">
              <img x-bind:src="imagePreview" alt="Design preview" class="w-full h-auto">
            </div>
          </div>

          <!-- Prompt Input -->
          <div x-show="imagePreview && !isAnalyzing" class="space-y-4">
            <div>
              <label class="block text-sm font-semibold text-[#333] mb-2 font-sans">What would you like to do with this design?</label>
              <textarea x-model="designPrompt"
                        @keydown.enter.meta.prevent="analyzeAndExecute()"
                        @keydown.enter.ctrl.prevent="analyzeAndExecute()"
                        rows="4"
                        placeholder="Example: Create a new Card component based on this design&#10;Or: Update the existing Button component to match this style&#10;Or: Implement this navigation bar design"
                        class="w-full p-3 border-[2.5px] border-[#333] rounded-md text-sm font-sans leading-normal resize-y focus:outline-none focus:border-[#F19E38] focus:shadow-[0_0_0_3px_rgba(241,158,56,0.1)]"></textarea>
              <p class="text-xs text-gray-500 mt-2">
                Claude will analyze the design and work with Claude Code to implement your request
              </p>
            </div>

            <div x-show="analysisError"
                 class="p-3 border-[2.5px] border-red-500 bg-red-50 rounded-md">
              <p class="text-sm text-red-700 font-semibold" x-text="analysisError"></p>
            </div>

            <button @click="analyzeAndExecute()"
                    x-bind:disabled="!designPrompt.trim()"
                    class="w-full px-4 py-3 rounded-md text-sm font-semibold cursor-pointer bg-[#F19E38] text-black border-[2.5px] border-[#333] hover:opacity-85 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity">
              Analyze & Execute
            </button>
          </div>

          <!-- Progress Indicator -->
          <div x-show="imagePreview && isAnalyzing" class="space-y-4">
            <div class="p-6 border-[2.5px] border-[#F19E38] bg-orange-50 rounded-lg">
              <div class="flex items-center gap-3 mb-3">
                <span class="vc-spinner"></span>
                <span class="text-sm font-semibold text-[#333]">
                  <span x-show="analysisStep === 'analyzing'">Analyzing design with Claude Vision...</span>
                </span>
              </div>
              <p class="text-xs text-gray-600">
                Claude is examining the design and understanding the visual elements, layout, colors, and styling.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  `;

  // Bottom Control Bar (Pill Design)
  app.innerHTML += `
    <div class="vc-control-bar fixed bottom-6 right-6 z-[1000003] flex items-center bg-white border-[2.5px] border-[#333] rounded-full shadow-lg">
      <!-- Design Upload Button -->
      <button @click="openDesignModal()"
              title="Create from Design"
              class="flex items-center justify-center w-12 h-12 text-[#333] outline-none transition-all duration-200 ease cursor-pointer hover:bg-gray-100 rounded-l-full active:scale-95">
        <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
        </svg>
      </button>

      <!-- Divider -->
      <div class="w-[2.5px] h-8 bg-[#333]"></div>

      <!-- Mode Toggle Button -->
      <button @click="toggleMode()"
              x-bind:class="modeClass"
              x-bind:title="modeTitle"
              class="vc-mode-toggle flex items-center justify-center w-12 h-12 outline-none transition-all duration-200 ease cursor-pointer rounded-r-full active:scale-95">
        <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path x-bind:d="modeIcon"></path>
        </svg>
      </button>
    </div>
  `;

  // Add Tailwind utility classes for status indicator and control bar states
  const style = document.createElement('style');
  style.textContent = `
    .vc-status-indicator.vc-processing {
      background: #F19E38 !important;
      color: #000000 !important;
      border-color: #333333 !important;
    }

    .vc-status-indicator.vc-complete {
      background: #22c55e !important;
      color: white !important;
      border-color: #333333 !important;
      animation: vc-fadeOut 0.5s ease 2s forwards !important;
    }

    .vc-mode-toggle.vc-edit-mode {
      background: #F19E38 !important;
      color: #000000 !important;
    }

    .vc-mode-toggle.vc-view-mode {
      background: transparent !important;
      color: #6b7280 !important;
    }

    .vc-mode-toggle.vc-edit-mode:hover {
      opacity: 0.9 !important;
    }

    .vc-mode-toggle.vc-view-mode:hover {
      background: #f3f4f6 !important;
    }
  `;
  document.head.appendChild(style);

  // Append to body
  document.body.appendChild(app);

  console.log('[Visual Claude] UI created ✓');
})();
