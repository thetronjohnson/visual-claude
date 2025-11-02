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
      pendingAIInstruction: null, // Stores AI instruction while waiting for preview

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

      // Unified Edit Mode State
      selectedElement: null, // Currently selected element for visual editing
      dragHandle: {
        isDragging: false,
        isResizing: false,
        isDraggingFromHandle: false, // True when dragging from the hover handle
        resizeDirection: '', // 'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'
        startX: 0,
        startY: 0,
        elementStartX: 0,
        elementStartY: 0,
        elementStartWidth: 0,
        elementStartHeight: 0,
      },
      showResizeHandles: false,
      resizeHandlesStyle: '',
      showHoverDragHandle: false,
      hoverDragHandleStyle: '',
      hoverDragHandleElement: null,

      // Reorder Mode State
      reorderMode: {
        isActive: false,
        layoutContext: null,
        siblingArrangement: null,
        currentTarget: null,
        insertBefore: true,
        originalIndex: -1,
        newIndex: -1,
        draggedElementWidth: 0,
        draggedElementHeight: 0,
      },
      showReorderPlaceholder: false,
      reorderPlaceholderStyle: '',

      // Drop Validation State
      currentDropTarget: null,
      showDropWarning: false,
      dropWarningText: '',
      dropWarningStyle: '',
      isValidDrop: true,

      // Action Menu State (NEW)
      showActionMenu: false,
      actionMenuStyle: '',
      actionMenuElement: null,

      // Change History State (Phase 2)
      showHistoryPanel: false,
      changeHistory: [], // Array of change objects
      nextChangeId: 1,
      historyIndex: -1, // For undo/redo (-1 means at latest)
      undoStack: [],
      redoStack: [],

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

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
          // Cmd/Ctrl + Shift + E: Toggle mode
          if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'E') {
            e.preventDefault();
            this.toggleMode();
          }

          // Cmd/Ctrl + Shift + H: Toggle history panel
          if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'H') {
            e.preventDefault();
            this.toggleHistoryPanel();
          }

          // Cmd/Ctrl + Z: Undo
          if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'z') {
            e.preventDefault();
            this.undo();
          }

          // Cmd/Ctrl + Shift + Z: Redo
          if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') {
            e.preventDefault();
            this.redo();
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

        // Bind handlers and store references for cleanup
        if (!this._boundHandlers) {
          this._boundHandlers = {
            mousedown: this.handleMouseDown.bind(this),
            mousemove: this.handleMouseMove.bind(this),
            mouseup: this.handleMouseUp.bind(this),
            mouseleave: this.handleMouseLeave.bind(this),
            dblclick: this.handleDoubleClick.bind(this),
            click: this.handleClick.bind(this),
            keydown: this.handleEditModeKeyboard.bind(this),
          };
        }

        // Add event listeners
        document.addEventListener('mousedown', this._boundHandlers.mousedown);
        document.addEventListener('mousemove', this._boundHandlers.mousemove);
        document.addEventListener('mouseup', this._boundHandlers.mouseup);
        document.addEventListener('mouseleave', this._boundHandlers.mouseleave);
        document.addEventListener('dblclick', this._boundHandlers.dblclick);
        document.addEventListener('click', this._boundHandlers.click, true);
        document.addEventListener('keydown', this._boundHandlers.keydown);

        console.log('[Visual Claude] ✏️  Edit Mode enabled');
      },

      disableEditMode() {
        this.isEditMode = false;
        localStorage.setItem(window.VCConstants.EDIT_MODE_KEY, 'false');
        document.body.setAttribute('data-vc-mode', 'view');

        // Remove event listeners
        if (this._boundHandlers) {
          document.removeEventListener('mousedown', this._boundHandlers.mousedown);
          document.removeEventListener('mousemove', this._boundHandlers.mousemove);
          document.removeEventListener('mouseup', this._boundHandlers.mouseup);
          document.removeEventListener('mouseleave', this._boundHandlers.mouseleave);
          document.removeEventListener('dblclick', this._boundHandlers.dblclick);
          document.removeEventListener('click', this._boundHandlers.click, true);
          document.removeEventListener('keydown', this._boundHandlers.keydown);
        }

        // Clean up
        this.hideInlineInput();
        this.hideTextEditor();
        this.removeElementHighlight();
        this.deselectElement();
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

        // Don't start area selection if an element is already selected
        if (this.selectedElement) {
          return;
        }

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
              console.log('[Visual Claude] No valid element found - deselecting');
              // Clicked on empty space - deselect current selection
              if (this.selectedElement) {
                this.deselectElement();
              }
              return;
            }

            // Clicking on the same element that's already selected - do nothing (keep menu open)
            if (clickedElement === this.selectedElement) {
              console.log('[Visual Claude] Same element clicked - maintaining selection');
              return;
            }

            // Select element for visual editing
            this.selectElementForEditing(clickedElement);

            // Show action menu above the selected element
            this.showActionMenuForElement(clickedElement);
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

      handleEditModeKeyboard(e) {
        if (!this.isEditMode) return;

        // Escape key - cancel all selections and close modals
        if (e.key === 'Escape') {
          e.preventDefault();

          // Close any open modals/inputs
          if (this.showInlineInput) {
            this.hideInlineInput();
          }
          if (this.showTextEditor) {
            this.hideTextEditor();
          }
          if (this.showDesignModal) {
            this.closeDesignModal();
          }
          if (this.showActionMenu) {
            this.hideActionMenu();
          }

          // Deselect any selected element
          if (this.selectedElement) {
            this.deselectElement();
          }

          // Remove hover highlight
          if (this.currentHoveredElement) {
            this.removeElementHighlight();
          }

          // Exit reorder mode if active
          if (this.reorderMode.isActive) {
            this.exitReorderMode();
          }

          // FAIL-SAFE: Force cleanup of any stuck floating elements
          if (this.selectedElement) {
            // Remove any lingering position:fixed styles
            this.selectedElement.style.position = '';
            this.selectedElement.style.left = '';
            this.selectedElement.style.top = '';
            this.selectedElement.style.zIndex = '';
            this.selectedElement.style.opacity = '';
            this.selectedElement.style.pointerEvents = '';
            this.selectedElement.classList.remove('vc-reordering');

            // Restore to original position if we have the data
            if (this.dragHandle.originalParent && this.dragHandle.originalNextSibling) {
              try {
                this.dragHandle.originalParent.insertBefore(this.selectedElement, this.dragHandle.originalNextSibling);
              } catch (err) {
                // Silently fail if DOM structure changed
              }
            } else if (this.dragHandle.originalParent) {
              try {
                this.dragHandle.originalParent.appendChild(this.selectedElement);
              } catch (err) {
                // Silently fail if DOM structure changed
              }
            }
          }

          // Cancel any drag in progress
          if (this.isDragging) {
            this.isDragging = false;
            this.showSelectionRect = false;
            this.showSelectionInfo = false;
          }

          // Reset drag handle state
          this.dragHandle.isDragging = false;
          this.dragHandle.isResizing = false;
          this.dragHandle.isDraggingFromHandle = false;

          // Clean up cursor classes
          document.body.classList.remove('vc-reorder-vertical', 'vc-reorder-horizontal', 'vc-free-drag-override');

          console.log('[Visual Claude] Escape pressed - all selections cancelled');
        }

        // Action menu keyboard shortcuts (when action menu is visible)
        if (this.showActionMenu) {
          if (e.key === 'e' || e.key === 'E') {
            e.preventDefault();
            this.actionMenuEdit();
          } else if (e.key === 'a' || e.key === 'A') {
            e.preventDefault();
            this.actionMenuAI();
          }
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

        // Don't show hover indicators when an element is selected
        if (this.selectedElement) {
          if (this.currentHoveredElement) {
            this.removeElementHighlight();
          }
          return;
        }

        // Check if hovering over the drag handle itself - keep highlight
        if (e.target.closest('.vc-hover-drag-handle')) {
          return; // Don't remove highlight when over drag handle
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

        // Show label tooltip
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
        this.showHoverDragHandle = false;
        this.hoverDragHandleElement = null;
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
        const instruction = this.inlineInputText.trim();
        const targetElement = this.selectedElements[0];

        // DEBUG: Log what we're sending to AI
        console.log('[Visual Claude] 🔍 DEBUG - Sending AI Preview:', {
          instruction: instruction,
          targetElement: {
            tag: targetElement.tagName,
            id: targetElement.id,
            classes: targetElement.className,
            selector: window.VCUtils.getSelector(targetElement),
          },
          elementInfo: elementsInfo[0],
        });

        console.log('[Visual Claude] 🎯 Selector being sent to AI:', elementsInfo[0].selector);

        // DEBUG: Log parent info
        if (elementsInfo[0].parent) {
          console.log('[Visual Claude] 📦 Parent:', {
            tag: elementsInfo[0].parent.tagName,
            classes: elementsInfo[0].parent.classes,
            selector: elementsInfo[0].parent.selector,
          });
        }

        // DEBUG: Log siblings
        if (elementsInfo[0].siblings && elementsInfo[0].siblings.length > 0) {
          console.log('[Visual Claude] 👥 Siblings (' + elementsInfo[0].siblings.length + '):',
            elementsInfo[0].siblings.map(s => ({
              tag: s.tagName,
              classes: s.classes,
            }))
          );
        } else {
          console.log('[Visual Claude] ⚠️ No siblings found');
        }

        // Hide input and show loading state
        this.hideInlineInput();
        this.setStatus('processing', 'Getting AI preview...');

        // Extract design tokens from the page
        const designTokens = window.VCUtils.extractDesignTokens();

        // PHASE 1: Get preview changes from Claude Code
        const previewMessage = {
          type: 'ai-preview',
          instruction: instruction,
          screenshot: screenshot,
          bounds: {
            x: bounds.left,
            y: bounds.top,
            width: bounds.width,
            height: bounds.height,
          },
          elements: elementsInfo,
          designTokens: designTokens,
        };

        console.log('[Visual Claude] Requesting AI preview...');
        if (this.messageWs && this.messageWs.readyState === WebSocket.OPEN) {
          this.messageWs.send(JSON.stringify(previewMessage));
        } else {
          console.error('[Visual Claude] WebSocket not connected');
          this.setStatus('idle');
          return;
        }

        // Store pending AI instruction while waiting for preview
        this.pendingAIInstruction = {
          instruction: instruction,
          screenshot: screenshot,
          bounds: { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height },
          elements: elementsInfo,
          targetElement: targetElement,
        };
      },

      handleAIPreviewResult(data) {
        if (!this.pendingAIInstruction) {
          console.warn('[Visual Claude] Received preview result but no pending instruction');
          return;
        }

        if (data.status === 'error') {
          console.error('[Visual Claude] AI preview error:', data.error);
          this.setStatus('idle');
          this.pendingAIInstruction = null;
          return;
        }

        if (data.status === 'success' && data.changes) {
          console.log('[Visual Claude] Applying AI preview changes:', data.changes);

          // Apply DOM changes
          const appliedChanges = this.applyDOMChanges(data.changes);

          // Add to history with DOM changes and original instruction
          const { instruction, screenshot, bounds, elements, targetElement } = this.pendingAIInstruction;
          const changeData = {
            instruction: instruction,
            screenshot: screenshot,
            bounds: bounds,
            elements: elements,
            elementCount: elements.length,
            domChanges: appliedChanges, // Store what was actually applied for undo
          };

          const preview = `"${instruction.substring(0, 50)}${instruction.length > 50 ? '...' : ''}"`;
          this.addToHistory('ai', targetElement, changeData, preview);

          console.log('[Visual Claude] AI preview applied and added to history');
          this.setStatus('idle');
        }

        this.pendingAIInstruction = null;
      },

      applyDOMChanges(changes) {
        const appliedChanges = [];

        for (const change of changes) {
          try {
            const element = document.querySelector(change.selector);
            if (!element) {
              console.warn('[Visual Claude] Element not found for selector:', change.selector);
              continue;
            }

            const applied = {
              selector: change.selector,
              action: change.action,
              element: element,
            };

            switch (change.action) {
              case 'addClass':
                applied.oldValue = element.className;
                element.classList.add(...change.value.split(' '));
                applied.newValue = element.className;
                break;

              case 'removeClass':
                applied.oldValue = element.className;
                element.classList.remove(...change.value.split(' '));
                applied.newValue = element.className;
                break;

              case 'setText':
                applied.oldValue = element.innerText;
                element.innerText = change.value;
                applied.newValue = change.value;
                break;

              case 'setHTML':
                applied.oldValue = element.innerHTML;
                element.innerHTML = change.value;
                applied.newValue = change.value;
                break;

              case 'setStyle':
                applied.property = change.property;
                applied.oldValue = element.style[change.property];
                element.style[change.property] = change.value;
                applied.newValue = change.value;
                break;

              case 'setAttribute':
                applied.attribute = change.attribute;
                applied.oldValue = element.getAttribute(change.attribute);
                element.setAttribute(change.attribute, change.value);
                applied.newValue = change.value;
                break;

              case 'remove':
                applied.oldValue = element.outerHTML;
                applied.parent = element.parentElement;
                applied.nextSibling = element.nextSibling;
                element.remove();
                applied.newValue = '(removed)';
                break;

              case 'hide':
                applied.property = 'display';
                applied.oldValue = element.style.display;
                element.style.display = 'none';
                applied.newValue = 'none';
                break;

              case 'insertAdjacentHTML':
                applied.position = change.position || 'afterend';
                applied.oldValue = '(none)';
                element.insertAdjacentHTML(applied.position, change.value);
                applied.newValue = change.value;
                applied.insertedHTML = change.value;
                break;

              default:
                console.warn('[Visual Claude] Unknown change action:', change.action);
                continue;
            }

            appliedChanges.push(applied);
            console.log('[Visual Claude] Applied change:', applied);
          } catch (err) {
            console.error('[Visual Claude] Error applying change:', change, err);
          }
        }

        return appliedChanges;
      },

      // ============================================================================
      // TEXT EDITOR
      // ============================================================================

      openTextEditor(element) {
        if (!element) {
          console.error('[Visual Claude] openTextEditor: No element provided');
          return;
        }

        console.log('[Visual Claude] Opening text editor for:', element.tagName);

        this.currentEditingElement = element;
        this.removeElementHighlight();

        const currentText = element.innerText.trim();
        console.log('[Visual Claude] Current text:', currentText.substring(0, 50));

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

        console.log('[Visual Claude] Text editor opened, showTextEditor =', this.showTextEditor);
        console.log('[Visual Claude] Text editor style:', this.textEditorStyle);

        this.$nextTick(() => {
          const input = document.querySelector('.vc-text-editor textarea');
          console.log('[Visual Claude] Text editor input found:', !!input);
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

        // Apply change to DOM immediately for instant feedback
        this.currentEditingElement.innerText = newText;

        // Add to history (user will commit via history panel)
        const changeData = {
          oldText: oldText,
          newText: newText,
          originalInnerText: oldText,
        };

        const preview = `"${oldText.substring(0, 30)}${oldText.length > 30 ? '...' : ''}" → "${newText.substring(0, 30)}${newText.length > 30 ? '...' : ''}"`;
        this.addToHistory('text', this.currentEditingElement, changeData, preview);

        console.log('[Visual Claude] Text change applied and added to history');

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
      // UNIFIED EDIT MODE - VISUAL EDITING
      // ============================================================================

      selectElementForEditing(element) {
        if (!element || element === this.selectedElement) return;

        // Deselect previous
        this.deselectElement();

        // Select new element
        this.selectedElement = element;
        element.classList.add('vc-visual-edit-selected');

        // Show resize handles
        this.showResizeHandles = true;
        this.updateResizeHandlesPosition();

        // Show drag handle on left side
        this.hoverDragHandleElement = element;
        const rect = element.getBoundingClientRect();
        const handleSize = 24;
        const handleLeft = rect.left - handleSize - 4;
        const handleTop = rect.top + (rect.height / 2) - (handleSize / 2);
        this.hoverDragHandleStyle = `left: ${handleLeft}px; top: ${handleTop}px;`;
        this.showHoverDragHandle = true;

        // Add scroll/resize listeners for this selected element
        if (!this._scrollListener) {
          this._scrollListener = () => {
            if (this.showResizeHandles && this.selectedElement) {
              this.updateResizeHandlesPosition();
            }
            if (this.showActionMenu && this.actionMenuElement) {
              this.updateActionMenuPosition();
            }
            // Update drag handle position when scrolling/resizing
            if (this.showHoverDragHandle && this.hoverDragHandleElement) {
              const rect = this.hoverDragHandleElement.getBoundingClientRect();
              const handleSize = 24;
              const handleLeft = rect.left - handleSize - 4;
              const handleTop = rect.top + (rect.height / 2) - (handleSize / 2);
              this.hoverDragHandleStyle = `left: ${handleLeft}px; top: ${handleTop}px;`;
            }
          };
          this._resizeListener = () => {
            if (this.showResizeHandles && this.selectedElement) {
              this.updateResizeHandlesPosition();
            }
            if (this.showActionMenu && this.actionMenuElement) {
              this.updateActionMenuPosition();
            }
            // Update drag handle position when scrolling/resizing
            if (this.showHoverDragHandle && this.hoverDragHandleElement) {
              const rect = this.hoverDragHandleElement.getBoundingClientRect();
              const handleSize = 24;
              const handleLeft = rect.left - handleSize - 4;
              const handleTop = rect.top + (rect.height / 2) - (handleSize / 2);
              this.hoverDragHandleStyle = `left: ${handleLeft}px; top: ${handleTop}px;`;
            }
          };
          window.addEventListener('scroll', this._scrollListener, true);
          window.addEventListener('resize', this._resizeListener);
        }

        console.log('[Visual Claude] Selected element:', window.VCUtils.getSelector(element));
      },

      deselectElement() {
        if (this.selectedElement) {
          this.selectedElement.classList.remove('vc-visual-edit-selected');
          this.selectedElement = null;
        }
        this.showResizeHandles = false;
        this.showActionMenu = false;
        this.actionMenuElement = null;

        // Hide drag handle
        this.showHoverDragHandle = false;
        this.hoverDragHandleElement = null;

        // Clean up listeners
        if (this._scrollListener) {
          window.removeEventListener('scroll', this._scrollListener, true);
          window.removeEventListener('resize', this._resizeListener);
          this._scrollListener = null;
          this._resizeListener = null;
        }
      },

      // ============================================================================
      // ACTION MENU - Contextual menu for selected elements
      // ============================================================================

      showActionMenuForElement(element) {
        if (!element) return;

        this.actionMenuElement = element;
        this.showActionMenu = true;
        this.updateActionMenuPosition();

        console.log('[Visual Claude] Action menu shown for element');
      },

      hideActionMenu() {
        this.showActionMenu = false;
        this.actionMenuElement = null;
      },

      updateActionMenuPosition() {
        if (!this.actionMenuElement) {
          this.showActionMenu = false;
          return;
        }

        const rect = this.actionMenuElement.getBoundingClientRect();

        // Position menu above element, centered
        const menuWidth = 400; // Approximate width of 4 buttons
        const menuHeight = 50;
        let left = rect.left + (rect.width / 2) - (menuWidth / 2);
        let top = rect.top - menuHeight - 10;

        // Keep within viewport bounds
        const padding = 20;
        if (left < padding) left = padding;
        if (left + menuWidth > window.innerWidth - padding) {
          left = window.innerWidth - menuWidth - padding;
        }
        if (top < padding) {
          // Show below element if not enough space above
          top = rect.bottom + 10;
        }

        this.actionMenuStyle = `left: ${left}px; top: ${top}px;`;
      },

      actionMenuEdit() {
        console.log('[Visual Claude] Action: Edit text');
        if (!this.actionMenuElement) {
          console.error('[Visual Claude] No element selected for editing');
          return;
        }

        const element = this.actionMenuElement;
        console.log('[Visual Claude] Editing element:', element.tagName, element.className);

        // Check if element is text-editable
        if (window.VCUtils.isTextEditable(element)) {
          console.log('[Visual Claude] Element is text-editable, opening text editor modal');
          this.hideActionMenu();
          this.openTextEditor(element);
        } else {
          console.log('[Visual Claude] Element is not text-editable, falling back to AI mode');
          // Fall back to AI mode if not text-editable
          this.actionMenuAI();
        }
      },

      actionMenuMove() {
        console.log('[Visual Claude] Action: Move element');
        if (!this.actionMenuElement) return;

        this.hideActionMenu();

        // Enable drag mode by programmatically triggering drag start
        // User can now drag the element
        // Show a visual indicator that move mode is active
        const fakeEvent = {
          clientX: 0,
          clientY: 0,
          preventDefault: () => {},
          stopPropagation: () => {},
        };

        // Start drag with the selected element
        this.startDrag(fakeEvent, 'move');

        // Show a hint to the user
        console.log('[Visual Claude] Move mode activated - drag the element');
      },

      actionMenuResize() {
        console.log('[Visual Claude] Action: Resize element');
        if (!this.actionMenuElement) return;

        this.hideActionMenu();

        // Just hide the action menu and keep resize handles visible
        // User can now use the resize handles
        console.log('[Visual Claude] Resize mode activated - use the handles');
      },

      actionMenuAI() {
        console.log('[Visual Claude] Action: AI instructions');
        if (!this.actionMenuElement) {
          console.error('[Visual Claude] No element selected for AI mode');
          return;
        }

        // Store element reference before hiding menu (hideActionMenu sets it to null)
        const element = this.actionMenuElement;
        console.log('[Visual Claude] Opening AI mode for:', element.tagName, element.className);

        const rect = element.getBoundingClientRect();
        const bounds = {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };

        this.hideActionMenu();

        // Open inline input for AI instructions
        this.openInlineInput(rect.right, rect.top, bounds, [element]);
      },

      // ============================================================================
      // CHANGE HISTORY MANAGEMENT (Phase 2)
      // ============================================================================

      toggleHistoryPanel() {
        this.showHistoryPanel = !this.showHistoryPanel;
        console.log('[Visual Claude] History panel:', this.showHistoryPanel ? 'shown' : 'hidden');
      },

      addToHistory(type, element, data, preview) {
        const change = {
          id: this.nextChangeId++,
          type: type, // 'transform', 'reorder', 'text'
          element: element,
          selector: window.VCUtils.getSelector(element),
          timestamp: Date.now(),
          selected: true, // Default to selected
          data: data,
          preview: preview,
        };

        this.changeHistory.push(change);
        this.undoStack.push(change);
        this.redoStack = []; // Clear redo stack when new change is made

        console.log('[Visual Claude] Added to history:', change);
        return change;
      },

      removeFromHistory(changeId) {
        const index = this.changeHistory.findIndex(c => c.id === changeId);
        if (index !== -1) {
          this.changeHistory.splice(index, 1);
          console.log('[Visual Claude] Removed from history:', changeId);
        }
      },

      clearHistory() {
        this.changeHistory = [];
        this.undoStack = [];
        this.redoStack = [];
        this.nextChangeId = 1;
        console.log('[Visual Claude] History cleared');
      },

      toggleChangeSelection(changeId) {
        const change = this.changeHistory.find(c => c.id === changeId);
        if (change) {
          change.selected = !change.selected;
        }
      },

      selectAllChanges() {
        this.changeHistory.forEach(c => c.selected = true);
      },

      deselectAllChanges() {
        this.changeHistory.forEach(c => c.selected = false);
      },

      getSelectedChanges() {
        return this.changeHistory.filter(c => c.selected);
      },

      undo() {
        if (this.undoStack.length === 0) {
          console.log('[Visual Claude] Nothing to undo');
          return;
        }

        const change = this.undoStack.pop();
        this.redoStack.push(change);

        // Remove from changeHistory
        this.removeFromHistory(change.id);

        // Revert the DOM change
        this.revertChange(change);

        console.log('[Visual Claude] Undo:', change);
      },

      redo() {
        if (this.redoStack.length === 0) {
          console.log('[Visual Claude] Nothing to redo');
          return;
        }

        const change = this.redoStack.pop();
        this.undoStack.push(change);

        // Re-add to changeHistory
        this.changeHistory.push(change);

        // Re-apply the change
        this.reapplyChange(change);

        console.log('[Visual Claude] Redo:', change);
      },

      revertChange(change) {
        // Find the element and revert its changes
        const element = document.querySelector(change.selector);
        if (!element) {
          console.warn('[Visual Claude] Element not found for revert:', change.selector);
          return;
        }

        if (change.type === 'transform') {
          // Revert transform/resize
          element.style.transform = '';
          element.style.width = '';
          element.style.height = '';
        } else if (change.type === 'reorder') {
          // Revert reorder - move back to original position
          // This is complex, for now just log
          console.log('[Visual Claude] Reorder revert not yet implemented');
        } else if (change.type === 'text') {
          // Revert text change
          if (change.data.oldText !== undefined) {
            element.innerText = change.data.oldText;
          }
        } else if (change.type === 'ai') {
          // Revert AI changes by reverting each DOM change
          if (change.data.domChanges) {
            for (const domChange of change.data.domChanges) {
              const el = document.querySelector(domChange.selector);
              if (!el) continue;

              switch (domChange.action) {
                case 'addClass':
                case 'removeClass':
                  el.className = domChange.oldValue || '';
                  break;
                case 'setText':
                  el.innerText = domChange.oldValue || '';
                  break;
                case 'setHTML':
                  el.innerHTML = domChange.oldValue || '';
                  break;
                case 'setStyle':
                  el.style[domChange.property] = domChange.oldValue || '';
                  break;
                case 'setAttribute':
                  if (domChange.oldValue) {
                    el.setAttribute(domChange.attribute, domChange.oldValue);
                  } else {
                    el.removeAttribute(domChange.attribute);
                  }
                  break;
              }
            }
          }
        }
      },

      reapplyChange(change) {
        // Find the element and re-apply changes
        const element = document.querySelector(change.selector);
        if (!element) {
          console.warn('[Visual Claude] Element not found for reapply:', change.selector);
          return;
        }

        if (change.type === 'transform') {
          // Re-apply transform/resize
          if (change.data.styles) {
            element.style.transform = change.data.styles.transform || '';
            element.style.width = change.data.styles.width || '';
            element.style.height = change.data.styles.height || '';
          }
        } else if (change.type === 'reorder') {
          // Re-apply reorder
          console.log('[Visual Claude] Reorder reapply not yet implemented');
        } else if (change.type === 'text') {
          // Re-apply text change
          if (change.data.newText !== undefined) {
            element.innerText = change.data.newText;
          }
        } else if (change.type === 'ai') {
          // Re-apply AI changes by re-applying each DOM change
          if (change.data.domChanges) {
            for (const domChange of change.data.domChanges) {
              const el = document.querySelector(domChange.selector);
              if (!el) continue;

              switch (domChange.action) {
                case 'addClass':
                case 'removeClass':
                  el.className = domChange.newValue || '';
                  break;
                case 'setText':
                  el.innerText = domChange.newValue || '';
                  break;
                case 'setHTML':
                  el.innerHTML = domChange.newValue || '';
                  break;
                case 'setStyle':
                  el.style[domChange.property] = domChange.newValue || '';
                  break;
                case 'setAttribute':
                  el.setAttribute(domChange.attribute, domChange.newValue);
                  break;
              }
            }
          }
        }
      },

      formatTimestamp(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (seconds < 60) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return new Date(timestamp).toLocaleDateString();
      },

      getChangeTypeBadge(type) {
        const badges = {
          transform: { text: 'Move/Resize', color: '#3b82f6' },
          reorder: { text: 'Reorder', color: '#8b5cf6' },
          text: { text: 'Text Edit', color: '#10b981' },
          ai: { text: 'AI Instruction', color: '#f59e0b' },
        };
        return badges[type] || { text: type, color: '#6b7280' };
      },

      // Phase 3: Token Estimation
      estimateTokens(change) {
        // Rough estimate: 4 characters ≈ 1 token
        let totalChars = 0;

        // Selector
        totalChars += change.selector.length;

        // Data
        totalChars += JSON.stringify(change.data).length;

        // Instructions overhead
        totalChars += 200; // Base instruction text

        return Math.ceil(totalChars / 4);
      },

      estimateTotalTokens(changes) {
        let total = 500; // Base overhead for prompt structure
        changes.forEach(change => {
          total += this.estimateTokens(change);
        });
        return total;
      },

      // Phase 3: Intelligent Batching
      groupChangesByType(changes) {
        const groups = {
          transform: [],
          reorder: [],
          text: [],
          ai: [],
        };

        changes.forEach(change => {
          if (groups[change.type]) {
            groups[change.type].push(change);
          }
        });

        return groups;
      },

      createBatches(changes, maxTokens = 6000) {
        const batches = [];
        let currentBatch = [];
        let currentTokens = 0;

        // Group by type first for better context
        const grouped = this.groupChangesByType(changes);
        const sortedChanges = [
          ...grouped.text,      // Text edits first
          ...grouped.ai,        // AI instructions second
          ...grouped.transform, // Transforms third
          ...grouped.reorder,   // Reorders last
        ];

        for (const change of sortedChanges) {
          const tokens = this.estimateTokens(change);

          if (currentTokens + tokens > maxTokens && currentBatch.length > 0) {
            // Start new batch
            batches.push(currentBatch);
            currentBatch = [change];
            currentTokens = tokens;
          } else {
            currentBatch.push(change);
            currentTokens += tokens;
          }
        }

        // Add final batch
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
        }

        return batches;
      },

      commitSelectedChanges() {
        const selected = this.getSelectedChanges();
        if (selected.length === 0) {
          console.warn('[Visual Claude] No changes selected');
          return;
        }

        console.log('[Visual Claude] Committing', selected.length, 'selected changes');

        // Close history panel immediately
        this.showHistoryPanel = false;

        this.commitChanges(selected);
      },

      commitAllChanges() {
        if (this.changeHistory.length === 0) {
          console.warn('[Visual Claude] No changes to commit');
          return;
        }

        console.log('[Visual Claude] Committing all', this.changeHistory.length, 'changes');

        // Close history panel immediately
        this.showHistoryPanel = false;

        this.commitChanges(this.changeHistory);
      },

      async commitChanges(changes) {
        // Estimate tokens
        const totalTokens = this.estimateTotalTokens(changes);
        console.log('[Visual Claude] Total estimated tokens:', totalTokens);

        try {
          // Check if we need to batch
          if (totalTokens > 6000) {
            console.log('[Visual Claude] Creating batches...');
            const batches = this.createBatches(changes, 6000);
            console.log('[Visual Claude] Split into', batches.length, 'batches');

            // Process batches sequentially
            for (let i = 0; i < batches.length; i++) {
              console.log(`[Visual Claude] Processing batch ${i + 1}/${batches.length}...`);
              await this.sendBatchToBackend(batches[i], i + 1, batches.length);
            }
          } else {
            // Send all changes in one batch
            await this.sendBatchToBackend(changes, 1, 1);
          }

          // All batches completed successfully
          console.log('[Visual Claude] ✓ All changes committed successfully');
          this.setStatus('idle');

          // Clear history after successful commit
          this.clearHistory();
        } catch (error) {
          console.error('[Visual Claude] ✗ Commit failed:', error);
          this.setStatus('idle');

          // Reopen history panel on error so user can retry
          this.showHistoryPanel = true;
        }
      },

      async sendBatchToBackend(changes, batchNumber, totalBatches) {
        // Convert changes to the format expected by backend
        const changesForBackend = changes.map(change => {
          const changeData = {
            selector: change.selector,
            operation: change.type || 'transform',
          };

          if (change.type === 'reorder' && change.data.reorderData) {
            changeData.reorderData = change.data.reorderData;
          } else if (change.type === 'transform' && change.data.styles) {
            changeData.styles = change.data.styles;
          } else if (change.type === 'text' && change.data) {
            changeData.oldText = change.data.oldText;
            changeData.newText = change.data.newText;
          } else if (change.type === 'ai' && change.data) {
            changeData.instruction = change.data.instruction;
            changeData.screenshot = change.data.screenshot;
            changeData.bounds = change.data.bounds;
            changeData.elements = change.data.elements;
            changeData.elementCount = change.data.elementCount;
          }

          return changeData;
        });

        const message = {
          type: 'apply-visual-edits',
          changes: changesForBackend,
          batch: {
            number: batchNumber,
            total: totalBatches,
          },
        };

        if (this.messageWs && this.messageWs.readyState === WebSocket.OPEN) {
          this.setStatus('processing');

          // Create a promise that resolves when backend sends completion
          const completionPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Batch processing timeout (120s)'));
            }, 120000); // 120 second timeout

            // Store the resolver so the WebSocket handler can call it
            this.pendingBatchResolvers = this.pendingBatchResolvers || {};
            this.pendingBatchResolvers[message.batch.number] = {
              resolve: (result) => {
                clearTimeout(timeout);
                resolve(result);
              },
              reject: (error) => {
                clearTimeout(timeout);
                reject(error);
              }
            };
          });

          this.messageWs.send(JSON.stringify(message));
          console.log(`[Visual Claude] ✓ Batch ${batchNumber}/${totalBatches} sent`);

          // Wait for backend to complete this batch before proceeding
          try {
            await completionPromise;
            console.log(`[Visual Claude] ✓ Batch ${batchNumber}/${totalBatches} completed`);
          } catch (error) {
            console.error(`[Visual Claude] ✗ Batch ${batchNumber}/${totalBatches} failed:`, error);
            throw error;
          }

          // Small delay between batches for stability
          if (batchNumber < totalBatches) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } else {
          console.error('[Visual Claude] ✗ WebSocket not connected');
          throw new Error('WebSocket not connected');
        }
      },

      updateResizeHandlesPosition() {
        if (!this.selectedElement) {
          this.showResizeHandles = false;
          return;
        }

        const rect = this.selectedElement.getBoundingClientRect();
        this.resizeHandlesStyle = `left: ${rect.left}px; top: ${rect.top}px; width: ${rect.width}px; height: ${rect.height}px;`;
      },

      startDrag(e, direction = 'move') {
        if (!this.selectedElement) return;

        e.preventDefault();
        e.stopPropagation();

        // Hide hover drag handle and action menu when starting to drag
        this.showHoverDragHandle = false;
        this.showActionMenu = false;

        const rect = this.selectedElement.getBoundingClientRect();

        this.dragHandle.startX = e.clientX;
        this.dragHandle.startY = e.clientY;
        this.dragHandle.elementStartX = rect.left;
        this.dragHandle.elementStartY = rect.top;
        this.dragHandle.elementStartWidth = rect.width;
        this.dragHandle.elementStartHeight = rect.height;

        if (direction === 'move') {
          this.dragHandle.isDragging = true;
          this.dragHandle.isDraggingFromHandle = true;
          document.body.style.cursor = 'move';

          // CRITICAL: Store original styles and position for snap-back recovery
          this.dragHandle.originalStyles = {
            position: this.selectedElement.style.position,
            left: this.selectedElement.style.left,
            top: this.selectedElement.style.top,
            zIndex: this.selectedElement.style.zIndex,
            opacity: this.selectedElement.style.opacity,
            pointerEvents: this.selectedElement.style.pointerEvents,
            transform: this.selectedElement.style.transform,
          };
          this.dragHandle.originalParent = this.selectedElement.parentElement;
          this.dragHandle.originalNextSibling = this.selectedElement.nextSibling;

          // Detect layout context for potential reordering
          this.reorderMode.layoutContext = window.VCUtils.detectLayoutContext(this.selectedElement);
          this.reorderMode.siblingArrangement = window.VCUtils.getSiblingArrangement(this.selectedElement);

          // Store dragged element dimensions for placeholder
          this.reorderMode.draggedElementWidth = rect.width;
          this.reorderMode.draggedElementHeight = rect.height;

          if (this.reorderMode.siblingArrangement) {
            // Store original index
            this.reorderMode.originalIndex = this.reorderMode.siblingArrangement.siblings.indexOf(this.selectedElement);
          }
        } else {
          this.dragHandle.isResizing = true;
          this.dragHandle.resizeDirection = direction;
        }

        // Add global mouse listeners
        document.addEventListener('mousemove', this.handleDragMove.bind(this));
        document.addEventListener('mouseup', this.handleDragEnd.bind(this));
      },

      startDragFromHoverHandle(e) {
        // Start dragging from the hover handle
        if (!this.hoverDragHandleElement) return;

        // Select the element
        this.selectElementForEditing(this.hoverDragHandleElement);

        // Start drag immediately
        this.startDrag(e, 'move');
      },

      handleDragMove(e) {
        if (!this.selectedElement) return;
        if (!this.dragHandle.isDragging && !this.dragHandle.isResizing) return;

        e.preventDefault();

        const deltaX = e.clientX - this.dragHandle.startX;
        const deltaY = e.clientY - this.dragHandle.startY;

        if (this.dragHandle.isDragging) {
          // Check if we should trigger reorder mode
          // Shift key allows override to free-drag mode
          const shouldReorder = window.VCUtils.shouldTriggerReorder(
            this.selectedElement,
            deltaX,
            deltaY,
            this.reorderMode.layoutContext,
            this.reorderMode.siblingArrangement,
            e.shiftKey
          );

          if (shouldReorder && this.reorderMode.siblingArrangement) {
            // REORDER MODE: Check for collision with siblings
            if (!this.reorderMode.isActive) {
              this.reorderMode.isActive = true;
              // Remove transform when entering reorder mode
              this.selectedElement.style.transform = '';
              this.selectedElement.classList.add('vc-reordering');

              // Add cursor indicator based on layout direction
              const isVertical = this.reorderMode.siblingArrangement.isVertical;
              document.body.classList.add(isVertical ? 'vc-reorder-vertical' : 'vc-reorder-horizontal');

              console.log('[Visual Claude] Entered reorder mode');
            }

            const reorderTarget = window.VCUtils.getReorderTarget(
              this.selectedElement,
              deltaX,
              deltaY,
              this.reorderMode.siblingArrangement.siblings
            );

            if (reorderTarget) {
              this.reorderMode.currentTarget = reorderTarget.target;
              this.reorderMode.insertBefore = reorderTarget.insertBefore;
              this.reorderMode.newIndex = reorderTarget.index;

              // Show placeholder at insertion point
              this.showReorderPlaceholderAt(reorderTarget.target, reorderTarget.insertBefore);

              // Animate siblings to make space
              this.animateSiblingsForReorder();
            } else {
              this.hideReorderPlaceholder();
            }

            // Move dragged element with cursor (use original start position + delta)
            this.selectedElement.style.position = 'fixed';
            this.selectedElement.style.left = `${this.dragHandle.elementStartX + deltaX}px`;
            this.selectedElement.style.top = `${this.dragHandle.elementStartY + deltaY}px`;
            this.selectedElement.style.pointerEvents = 'none';
            this.selectedElement.style.zIndex = '999999';
            this.selectedElement.style.opacity = '0.8';
          } else {
            // FREE-DRAG MODE: Apply transform with validation
            if (this.reorderMode.isActive) {
              // Exit reorder mode
              this.exitReorderMode();
            }

            // Show crosshair cursor when Shift is held (free-drag override)
            if (e.shiftKey && this.reorderMode.siblingArrangement && this.reorderMode.siblingArrangement.count >= 2) {
              document.body.classList.add('vc-free-drag-override');
            } else {
              document.body.classList.remove('vc-free-drag-override');
            }

            // Validate drop target
            const dropTarget = this.findValidDropTarget(e.clientX, e.clientY);

            if (!dropTarget) {
              // Show invalid drop warning
              this.showInvalidDropWarning(e.clientX, e.clientY);
              this.clearDropHighlight();
              // Still allow visual drag but mark as invalid
            } else {
              // Valid drop target
              this.hideDropWarning();
              this.highlightDropTarget(dropTarget);
              this.currentDropTarget = dropTarget.element;
            }

            // Get boundary constraints
            const boundaries = window.VCUtils.getElementBoundaries(this.selectedElement);
            let newX = deltaX;
            let newY = deltaY;

            if (boundaries) {
              const elementRect = this.selectedElement.getBoundingClientRect();

              // Constrain to parent boundaries
              const minTranslateX = boundaries.minX - (elementRect.left + window.scrollX);
              const maxTranslateX = boundaries.maxX - (elementRect.right + window.scrollX);
              const minTranslateY = boundaries.minY - (elementRect.top + window.scrollY);
              const maxTranslateY = boundaries.maxY - (elementRect.bottom + window.scrollY);

              newX = Math.max(minTranslateX, Math.min(newX, maxTranslateX));
              newY = Math.max(minTranslateY, Math.min(newY, maxTranslateY));
            }

            this.selectedElement.style.transform = `translate(${newX}px, ${newY}px)`;
            this.updateResizeHandlesPosition();
          }
        } else if (this.dragHandle.isResizing) {
          // Apply size changes for resizing with constraints
          const direction = this.dragHandle.resizeDirection;
          let newWidth = this.dragHandle.elementStartWidth;
          let newHeight = this.dragHandle.elementStartHeight;

          // Check if we should maintain aspect ratio
          const isImage = this.selectedElement.tagName === 'IMG';
          const maintainRatio = isImage || e.shiftKey; // Always for images, or when Shift held

          if (maintainRatio) {
            const aspectRatio = this.dragHandle.elementStartWidth / this.dragHandle.elementStartHeight;

            // Calculate both dimensions from one axis
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
              // Resize based on width change
              if (direction.includes('e')) {
                newWidth = this.dragHandle.elementStartWidth + deltaX;
              }
              if (direction.includes('w')) {
                newWidth = this.dragHandle.elementStartWidth - deltaX;
              }
              newHeight = newWidth / aspectRatio;
            } else {
              // Resize based on height change
              if (direction.includes('s')) {
                newHeight = this.dragHandle.elementStartHeight + deltaY;
              }
              if (direction.includes('n')) {
                newHeight = this.dragHandle.elementStartHeight - deltaY;
              }
              newWidth = newHeight * aspectRatio;
            }
          } else {
            // Normal resize without aspect ratio
            if (direction.includes('e')) {
              newWidth = this.dragHandle.elementStartWidth + deltaX;
            }
            if (direction.includes('w')) {
              newWidth = this.dragHandle.elementStartWidth - deltaX;
            }
            if (direction.includes('s')) {
              newHeight = this.dragHandle.elementStartHeight + deltaY;
            }
            if (direction.includes('n')) {
              newHeight = this.dragHandle.elementStartHeight - deltaY;
            }
          }

          // Get content-aware minimum size
          const minSizes = window.VCUtils.getMinimumSize(this.selectedElement);

          // Get boundary constraints
          const boundaries = window.VCUtils.getElementBoundaries(this.selectedElement);
          const maxWidth = boundaries ? boundaries.maxWidth : Infinity;
          const maxHeight = boundaries ? boundaries.maxHeight : Infinity;

          // Apply constraints (min from content, max from parent)
          newWidth = Math.max(minSizes.minWidth, Math.min(newWidth, maxWidth));
          newHeight = Math.max(minSizes.minHeight, Math.min(newHeight, maxHeight));

          this.selectedElement.style.width = `${newWidth}px`;
          this.selectedElement.style.height = `${newHeight}px`;
          this.updateResizeHandlesPosition();
        }
      },

      showReorderPlaceholderAt(targetElement, insertBefore) {
        const rect = targetElement.getBoundingClientRect();
        const isVertical = this.reorderMode.siblingArrangement.isVertical;

        // Get dragged element dimensions
        const draggedWidth = this.reorderMode.draggedElementWidth;
        const draggedHeight = this.reorderMode.draggedElementHeight;

        // Get layout gap for proper spacing
        const gap = this.reorderMode.layoutContext.gap || 0;

        let placeholderStyle = '';
        if (isVertical) {
          // Show slot above or below target
          const y = insertBefore ? rect.top - gap : rect.bottom + gap;
          placeholderStyle = `left: ${rect.left}px; top: ${y}px; width: ${draggedWidth}px; height: ${draggedHeight}px;`;
        } else {
          // Show slot left or right of target
          const x = insertBefore ? rect.left - gap : rect.right + gap;
          placeholderStyle = `left: ${x}px; top: ${rect.top}px; width: ${draggedWidth}px; height: ${draggedHeight}px;`;
        }

        this.reorderPlaceholderStyle = placeholderStyle;
        this.showReorderPlaceholder = true;
      },

      hideReorderPlaceholder() {
        this.showReorderPlaceholder = false;
      },

      animateSiblingsForReorder() {
        if (!this.reorderMode.currentTarget || !this.selectedElement) return;
        if (!this.reorderMode.siblingArrangement) return;

        const siblings = this.reorderMode.siblingArrangement.siblings;
        const draggedElement = this.selectedElement;
        const draggedRect = draggedElement.getBoundingClientRect();
        const isVertical = this.reorderMode.siblingArrangement.isVertical;
        const gap = this.reorderMode.layoutContext.gap || 0;

        const targetIndex = siblings.indexOf(this.reorderMode.currentTarget);
        const originalIndex = this.reorderMode.originalIndex;
        const insertIndex = this.reorderMode.insertBefore ? targetIndex : targetIndex + 1;

        // Calculate displacement for each sibling
        siblings.forEach((sibling, index) => {
          if (sibling === draggedElement) return;

          // Determine if this sibling needs to move
          let needsMove = false;
          if (originalIndex < insertIndex) {
            // Moving forward: siblings between original and insert move back
            needsMove = index > originalIndex && index < insertIndex;
          } else {
            // Moving backward: siblings between insert and original move forward
            needsMove = index >= insertIndex && index < originalIndex;
          }

          if (needsMove) {
            const offset = isVertical ? draggedRect.height + gap : draggedRect.width + gap;
            const direction = originalIndex < insertIndex ? -1 : 1;
            const transform = isVertical
              ? `translateY(${direction * offset}px)`
              : `translateX(${direction * offset}px)`;

            sibling.style.transition = 'transform 200ms cubic-bezier(0.2, 0, 0, 1)';
            sibling.style.transform = transform;
          } else {
            sibling.style.transition = 'transform 200ms cubic-bezier(0.2, 0, 0, 1)';
            sibling.style.transform = '';
          }
        });
      },

      exitReorderMode() {
        // DEFENSIVE: Always clean up, even if isActive is false
        // This prevents stuck floating elements
        const wasActive = this.reorderMode.isActive;
        this.reorderMode.isActive = false;
        this.hideReorderPlaceholder();

        // Remove cursor indicators
        document.body.classList.remove('vc-reorder-vertical', 'vc-reorder-horizontal', 'vc-free-drag-override');

        // CRITICAL: Reset dragged element styles unconditionally
        if (this.selectedElement) {
          this.selectedElement.classList.remove('vc-reordering');
          // Use empty string to remove inline styles
          this.selectedElement.style.position = '';
          this.selectedElement.style.left = '';
          this.selectedElement.style.top = '';
          this.selectedElement.style.pointerEvents = '';
          this.selectedElement.style.zIndex = '';
          this.selectedElement.style.opacity = '';
          this.selectedElement.style.transform = '';
        }

        // Reset sibling transforms
        if (this.reorderMode.siblingArrangement) {
          this.reorderMode.siblingArrangement.siblings.forEach(sibling => {
            if (sibling) {
              sibling.style.transition = '';
              sibling.style.transform = '';
            }
          });
        }

        // Reset reorder state
        this.reorderMode.currentTarget = null;
        this.reorderMode.insertBefore = true;
        this.reorderMode.newIndex = -1;

        if (wasActive) {
          console.log('[Visual Claude] Exited reorder mode');
        }
      },

      // ============================================================================
      // DROP TARGET VALIDATION
      // ============================================================================

      findValidDropTarget(cursorX, cursorY) {
        // Hide selected element temporarily to get element under cursor
        const originalVisibility = this.selectedElement.style.visibility;
        this.selectedElement.style.visibility = 'hidden';

        const targetElement = document.elementFromPoint(cursorX, cursorY);

        this.selectedElement.style.visibility = originalVisibility;

        if (!targetElement) {
          return null;
        }

        // Traverse up to find a valid parent
        let current = targetElement;
        let depth = 0;
        const maxDepth = 10;

        while (current && depth < maxDepth) {
          // Skip VC UI elements
          if (current.closest(window.VCConstants.VC_UI_SELECTOR)) {
            current = current.parentElement;
            depth++;
            continue;
          }

          // Don't allow dropping into itself or its children
          if (current === this.selectedElement || this.selectedElement.contains(current)) {
            current = current.parentElement;
            depth++;
            continue;
          }

          // Validate parent-child compatibility
          const validation = window.VCUtils.canAcceptChild(current, this.selectedElement);
          if (validation.valid) {
            return { element: current, reason: '' };
          } else {
            // Store reason for display
            this.dropWarningText = validation.reason;
          }

          current = current.parentElement;
          depth++;
        }

        return null; // No valid parent found
      },

      showInvalidDropWarning(x, y) {
        this.showDropWarning = true;
        this.isValidDrop = false;
        this.dropWarningStyle = `left: ${x + 15}px; top: ${y + 15}px;`;

        // Add invalid cursor class
        document.body.classList.add('vc-dragging-invalid');
      },

      hideDropWarning() {
        this.showDropWarning = false;
        this.isValidDrop = true;
        this.dropWarningText = '';
        document.body.classList.remove('vc-dragging-invalid');
      },

      highlightDropTarget(dropTarget) {
        // Remove previous highlight
        const previousHighlight = document.querySelector('.vc-valid-drop-zone');
        if (previousHighlight) {
          previousHighlight.classList.remove('vc-valid-drop-zone');
        }

        // Add highlight to valid drop zone
        if (dropTarget && dropTarget.element) {
          dropTarget.element.classList.add('vc-valid-drop-zone');
        }
      },

      clearDropHighlight() {
        const highlighted = document.querySelector('.vc-valid-drop-zone');
        if (highlighted) {
          highlighted.classList.remove('vc-valid-drop-zone');
        }
      },

      handleDragEnd(e) {
        if (!this.selectedElement) return;
        if (!this.dragHandle.isDragging && !this.dragHandle.isResizing) return;

        e.preventDefault();

        const selector = window.VCUtils.getSelector(this.selectedElement);
        const computedStyle = window.getComputedStyle(this.selectedElement);

        // Check if this was a reorder operation
        if (this.reorderMode.isActive && this.reorderMode.currentTarget) {
          // VALID REORDER OPERATION
          const parentSelector = window.VCUtils.getSelector(this.reorderMode.layoutContext.parent);
          const targetSelector = window.VCUtils.getSelector(this.reorderMode.currentTarget);

          const change = {
            operation: 'reorder',
            reorderData: {
              parentSelector: parentSelector,
              fromIndex: this.reorderMode.originalIndex,
              toIndex: this.reorderMode.insertBefore ? this.reorderMode.newIndex : this.reorderMode.newIndex + 1,
              insertBeforeSelector: this.reorderMode.insertBefore ? targetSelector : null,
              insertAfterSelector: !this.reorderMode.insertBefore ? targetSelector : null,
            },
            originalStyles: {
              transform: computedStyle.transform !== 'none' ? computedStyle.transform : '',
              width: computedStyle.width,
              height: computedStyle.height,
            }
          };

          console.log('[Visual Claude] Stored reorder operation:', selector, change);

          // Add to history
          const preview = `Reordered from position ${this.reorderMode.originalIndex} to ${change.reorderData.toIndex}`;
          this.addToHistory('reorder', this.selectedElement, change, preview);

          // Actually reorder in DOM for immediate visual feedback
          const parent = this.reorderMode.layoutContext.parent;
          if (this.reorderMode.insertBefore) {
            parent.insertBefore(this.selectedElement, this.reorderMode.currentTarget);
          } else {
            const nextSibling = this.reorderMode.currentTarget.nextSibling;
            if (nextSibling) {
              parent.insertBefore(this.selectedElement, nextSibling);
            } else {
              parent.appendChild(this.selectedElement);
            }
          }

          // Exit reorder mode and clean up
          this.exitReorderMode();
        } else if (this.reorderMode.isActive && !this.reorderMode.currentTarget) {
          // INVALID REORDER DROP - Snap back to original position
          console.log('[Visual Claude] Invalid reorder drop - snapping back to original position');

          // Restore element to original position in DOM if it was moved
          if (this.dragHandle.originalParent && this.dragHandle.originalNextSibling) {
            this.dragHandle.originalParent.insertBefore(this.selectedElement, this.dragHandle.originalNextSibling);
          } else if (this.dragHandle.originalParent) {
            this.dragHandle.originalParent.appendChild(this.selectedElement);
          }

          // Restore original styles
          if (this.dragHandle.originalStyles) {
            Object.keys(this.dragHandle.originalStyles).forEach(key => {
              this.selectedElement.style[key] = this.dragHandle.originalStyles[key] || '';
            });
          }

          // Exit reorder mode and clean up
          this.exitReorderMode();

          // Don't add to history - this was an invalid operation
        } else {
          // TRANSFORM/RESIZE OPERATION
          const change = {
            operation: 'transform',
            styles: {
              transform: this.selectedElement.style.transform || '',
              width: this.selectedElement.style.width || '',
              height: this.selectedElement.style.height || '',
            },
            originalStyles: {
              transform: computedStyle.transform !== 'none' ? computedStyle.transform : '',
              width: computedStyle.width,
              height: computedStyle.height,
            }
          };

          console.log('[Visual Claude] Stored transform/resize:', selector, change);

          // Add to history
          const preview = change.styles.transform ?
            `Moved element` :
            `Resized to ${change.styles.width} × ${change.styles.height}`;
          this.addToHistory('transform', this.selectedElement, change, preview);
        }

        // Reset drag state
        this.dragHandle.isDragging = false;
        this.dragHandle.isResizing = false;
        this.dragHandle.isDraggingFromHandle = false;
        this.dragHandle.resizeDirection = '';
        document.body.style.cursor = '';

        // Reset reorder mode state
        this.reorderMode.isActive = false;
        this.reorderMode.layoutContext = null;
        this.reorderMode.siblingArrangement = null;
        this.reorderMode.currentTarget = null;
        this.reorderMode.insertBefore = true;
        this.reorderMode.originalIndex = -1;
        this.reorderMode.newIndex = -1;

        // Reset drop validation state
        this.hideDropWarning();
        this.clearDropHighlight();
        this.currentDropTarget = null;

        // Clean up cursor classes
        document.body.classList.remove('vc-reorder-vertical', 'vc-reorder-horizontal', 'vc-free-drag-override');

        // Remove global listeners
        document.removeEventListener('mousemove', this.handleDragMove.bind(this));
        document.removeEventListener('mouseup', this.handleDragEnd.bind(this));
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

            // Handle AI preview response
            if (data.type === 'ai-preview-result') {
              this.handleAIPreviewResult(data);
              return;
            }

            // Skip stale message checks if we have pending batch operations
            // Batches use their own tracking via pendingBatchResolvers
            const hasPendingBatches = this.pendingBatchResolvers &&
                                      Object.keys(this.pendingBatchResolvers).length > 0;

            if (!hasPendingBatches) {
              if (data.id && data.id !== this.currentMessageId) {
                console.warn('[Visual Claude] ⚠️  Ignoring stale message');
                return;
              }

              if (!this.currentMessageId && (data.status === 'complete' || data.status === 'error')) {
                console.warn('[Visual Claude] ⚠️  Ignoring completion with no active request');
                return;
              }
            }

            if (data.status === 'received') {
              console.log('[Visual Claude] ✅ Server acknowledged');
            } else if (data.status === 'complete') {
              console.log('[Visual Claude] 🎉 Task completed');

              // Check if this is a batch completion that needs to resolve a promise
              let isBatchOperation = false;
              if (this.pendingBatchResolvers && data.id) {
                // Find matching batch resolver
                for (const [batchNumber, resolver] of Object.entries(this.pendingBatchResolvers)) {
                  if (resolver) {
                    resolver.resolve({ status: 'complete' });
                    delete this.pendingBatchResolvers[batchNumber];
                    isBatchOperation = true;
                    break; // Only resolve one batch at a time
                  }
                }
              }

              // Only set status to 'complete' if this is NOT a batch operation
              // Batch operations handle their own status updates in commitChanges()
              if (!isBatchOperation) {
                this.setStatus('complete');
                this.currentMessageId = null;
              }
            } else if (data.status === 'error') {
              console.error('[Visual Claude] ❌ Error:', data.error);

              // Check if this is a batch error that needs to reject a promise
              let isBatchOperation = false;
              if (this.pendingBatchResolvers && data.id) {
                // Find matching batch resolver
                for (const [batchNumber, resolver] of Object.entries(this.pendingBatchResolvers)) {
                  if (resolver) {
                    resolver.reject(new Error(data.error || 'Unknown error'));
                    delete this.pendingBatchResolvers[batchNumber];
                    isBatchOperation = true;
                    break; // Only reject one batch at a time
                  }
                }
              }

              // Only trigger error reload if this is NOT a batch operation
              // Batch operations handle their own error handling in commitChanges()
              if (!isBatchOperation) {
                this.statusText = 'Error - Reloading...';
                this.statusClass = '';
                this.showStatusIndicator = true;
                this.currentMessageId = null;
                setTimeout(() => {
                  window.location.reload();
                }, window.VCConstants.ERROR_RELOAD_DELAY);
              }
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

  // Drop Warning Tooltip - Shows when trying to drop in invalid location
  app.innerHTML += `
    <div x-show="showDropWarning"
         x-bind:style="dropWarningStyle"
         x-text="dropWarningText"
         class="vc-drop-warning">
    </div>
  `;

  // Reorder Placeholder Slot - Shows where element will be dropped
  app.innerHTML += `
    <div x-show="showReorderPlaceholder"
         x-bind:style="reorderPlaceholderStyle"
         class="vc-reorder-placeholder fixed z-[1000001] pointer-events-none">
      <div class="vc-placeholder-slot">
        <div class="vc-placeholder-label">Drop here</div>
      </div>
    </div>
  `;

  // Inline Input Modal
  app.innerHTML += `
    <div x-show="showInlineInput"
         x-bind:style="inlineInputStyle"
         class="vc-inline-input vc-show bg-white border border-gray-300 rounded-lg p-4 fixed z-[1000000] min-w-[300px] max-w-[400px] shadow-lg">
      <div x-text="inlineInputBadge"
           class="text-xs font-semibold text-gray-700 mb-2 font-sans"></div>
      <textarea x-model="inlineInputText"
                @keydown.enter.prevent="!$event.shiftKey && sendInlineMessage()"
                @keydown.escape.prevent="hideInlineInput()"
                rows="2"
                placeholder="What would you like Visual Claude to do?"
                class="w-full p-2.5 border border-gray-300 rounded-md text-sm font-sans leading-snug resize-none focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"></textarea>
      <div class="flex gap-2 mt-3 justify-end">
        <button @click="hideInlineInput()"
                class="px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all duration-200 ease font-sans bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-98">
          Cancel
        </button>
        <button @click="sendInlineMessage()"
                class="px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all duration-200 ease font-sans bg-blue-600 text-white hover:bg-blue-700 active:scale-98">
          Send
        </button>
      </div>
    </div>
  `;

  // Text Editor Modal
  app.innerHTML += `
    <div x-show="showTextEditor"
         x-bind:style="textEditorStyle"
         class="vc-text-editor vc-show bg-white border border-gray-300 rounded-lg p-4 fixed z-[1000002] min-w-[320px] max-w-[500px] shadow-lg">
      <div x-text="textEditorLabel"
           class="text-xs font-semibold text-gray-500 mb-2 font-sans uppercase tracking-wide"></div>
      <textarea x-model="textEditorValue"
                @keydown.enter.meta.prevent="saveTextEdit()"
                @keydown.enter.ctrl.prevent="saveTextEdit()"
                @keydown.escape.prevent="hideTextEditor()"
                rows="3"
                placeholder="Enter new text..."
                class="w-full p-2.5 px-3 border border-gray-300 rounded-md text-sm font-sans leading-normal resize-y min-h-[70px] box-border focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"></textarea>
      <div x-text="textEditorPreview"
           class="text-xs text-gray-500 mt-2 p-2 px-2.5 bg-gray-50 rounded font-mono max-h-20 overflow-y-auto break-words"></div>
      <div class="flex gap-2 mt-3 justify-end">
        <button @click="hideTextEditor()"
                class="px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all duration-200 ease font-sans bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-98">
          Cancel
        </button>
        <button @click="saveTextEdit()"
                class="px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all duration-200 ease font-sans bg-blue-600 text-white hover:bg-blue-700 active:scale-98">
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
         class="vc-status-indicator fixed bottom-6 left-6 px-5 py-3 rounded-lg bg-white text-gray-700 border border-gray-300 text-sm font-medium font-sans z-[1000000] flex items-center gap-2 shadow-lg transition-all duration-200 ease">
    </div>
  `;

  // Design-to-Code Modal
  app.innerHTML += `
    <div x-show="showDesignModal"
         x-transition
         class="vc-design-modal fixed inset-0 z-[1000004] flex items-center justify-center p-4"
         style="background: rgba(0, 0, 0, 0.5);">

      <div @click.away="closeDesignModal()"
           class="bg-white border border-gray-300 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-xl">

        <!-- Header -->
        <div class="flex items-center justify-between p-5 border-b border-gray-200 bg-gray-50">
          <h2 class="text-lg font-semibold text-gray-900 font-sans">Create Component from Design</h2>
          <button @click="closeDesignModal()"
                  class="w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-200 transition-colors">
            <i class="ph ph-x text-lg"></i>
          </button>
        </div>

        <!-- Body -->
        <div class="p-6 space-y-6">

          <!-- Upload Zone -->
          <div x-show="!imagePreview">
            <label class="block text-sm font-semibold text-gray-700 mb-2 font-sans">Upload Design Image</label>
            <div @drop="handleImageDrop($event)"
                 @dragover.prevent
                 @dragenter.prevent
                 class="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center cursor-pointer hover:bg-gray-50 hover:border-gray-400 transition-colors">
              <input type="file"
                     accept="image/*"
                     @change="processImage($event.target.files[0])"
                     class="hidden"
                     id="vc-design-upload">
              <i class="ph ph-image text-6xl text-gray-400 mb-4"></i>
              <p class="text-lg font-medium text-gray-700 mb-2">Drop your design here</p>
              <p class="text-sm text-gray-500 mb-4">or</p>
              <label for="vc-design-upload"
                     class="inline-block px-4 py-2 rounded-md text-sm font-medium cursor-pointer bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                Browse Files
              </label>
              <p class="text-xs text-gray-400 mt-4">You can also paste (Cmd+V) an image</p>
            </div>
          </div>

          <!-- Image Preview -->
          <div x-show="imagePreview" class="space-y-4">
            <div class="flex items-center justify-between">
              <label class="block text-sm font-semibold text-gray-700 font-sans">Design Preview</label>
              <button @click="imagePreview = ''; uploadedImage = null"
                      class="text-xs text-red-600 hover:text-red-700 font-medium">
                Remove Image
              </button>
            </div>
            <div class="border border-gray-300 rounded-lg overflow-hidden">
              <img x-bind:src="imagePreview" alt="Design preview" class="w-full h-auto">
            </div>
          </div>

          <!-- Prompt Input -->
          <div x-show="imagePreview && !isAnalyzing" class="space-y-4">
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-2 font-sans">What would you like to do with this design?</label>
              <textarea x-model="designPrompt"
                        @keydown.enter.meta.prevent="analyzeAndExecute()"
                        @keydown.enter.ctrl.prevent="analyzeAndExecute()"
                        rows="4"
                        placeholder="Example: Create a new Card component based on this design&#10;Or: Update the existing Button component to match this style&#10;Or: Implement this navigation bar design"
                        class="w-full p-3 border border-gray-300 rounded-md text-sm font-sans leading-normal resize-y focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"></textarea>
              <p class="text-xs text-gray-500 mt-2">
                Claude will analyze the design and work with Claude Code to implement your request
              </p>
            </div>

            <div x-show="analysisError"
                 class="p-3 border border-red-300 bg-red-50 rounded-md">
              <p class="text-sm text-red-700 font-medium" x-text="analysisError"></p>
            </div>

            <button @click="analyzeAndExecute()"
                    x-bind:disabled="!designPrompt.trim()"
                    class="w-full px-4 py-3 rounded-md text-sm font-medium cursor-pointer bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              Analyze & Execute
            </button>
          </div>

          <!-- Progress Indicator -->
          <div x-show="imagePreview && isAnalyzing" class="space-y-4">
            <div class="p-6 border border-blue-300 bg-blue-50 rounded-lg">
              <div class="flex items-center gap-3 mb-3">
                <span class="vc-spinner"></span>
                <span class="text-sm font-medium text-gray-700">
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

  // Hover Drag Handle (appears on left side with larger hitbox)
  app.innerHTML += `
    <div x-show="showHoverDragHandle"
         x-bind:style="hoverDragHandleStyle"
         @mousedown="startDragFromHoverHandle($event)"
         @mouseenter="$event.stopPropagation()"
         class="vc-hover-drag-handle fixed z-[1000002] pointer-events-auto cursor-grab active:cursor-grabbing">
      <!-- Invisible larger hitbox to prevent flickering -->
      <div class="absolute -inset-2"></div>
      <!-- Visible handle (Notion-style) -->
      <div class="relative w-6 h-6 rounded flex items-center justify-center bg-white border border-gray-300 shadow-sm hover:bg-gray-50 transition-colors">
        <i class="ph ph-dots-six text-gray-500 text-base"></i>
      </div>
    </div>
  `;

  // Resize Handles Overlay (shown when element is selected)
  app.innerHTML += `
    <div x-show="showResizeHandles"
         x-bind:style="resizeHandlesStyle"
         class="vc-drag-handles fixed z-[1000002] pointer-events-none">
      <!-- Center Drag Handle (invisible - no border, selection outline handles the visual) -->
      <div @mousedown="startDrag($event, 'move')"
           class="absolute top-0 left-0 w-full h-full cursor-move pointer-events-auto"></div>

      <!-- Corner Resize Handles -->
      <div @mousedown="startDrag($event, 'nw')"
           class="absolute -top-1 -left-1 w-3 h-3 bg-blue-600 border-2 border-white rounded-full cursor-nw-resize pointer-events-auto shadow-md"></div>
      <div @mousedown="startDrag($event, 'ne')"
           class="absolute -top-1 -right-1 w-3 h-3 bg-blue-600 border-2 border-white rounded-full cursor-ne-resize pointer-events-auto shadow-md"></div>
      <div @mousedown="startDrag($event, 'sw')"
           class="absolute -bottom-1 -left-1 w-3 h-3 bg-blue-600 border-2 border-white rounded-full cursor-sw-resize pointer-events-auto shadow-md"></div>
      <div @mousedown="startDrag($event, 'se')"
           class="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-600 border-2 border-white rounded-full cursor-se-resize pointer-events-auto shadow-md"></div>

      <!-- Edge Resize Handles -->
      <div @mousedown="startDrag($event, 'n')"
           class="absolute -top-1 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-blue-600 border-2 border-white rounded-full cursor-n-resize pointer-events-auto shadow-md"></div>
      <div @mousedown="startDrag($event, 's')"
           class="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-blue-600 border-2 border-white rounded-full cursor-s-resize pointer-events-auto shadow-md"></div>
      <div @mousedown="startDrag($event, 'w')"
           class="absolute top-1/2 -left-1 transform -translate-y-1/2 w-3 h-3 bg-blue-600 border-2 border-white rounded-full cursor-w-resize pointer-events-auto shadow-md"></div>
      <div @mousedown="startDrag($event, 'e')"
           class="absolute top-1/2 -right-1 transform -translate-y-1/2 w-3 h-3 bg-blue-600 border-2 border-white rounded-full cursor-e-resize pointer-events-auto shadow-md"></div>
    </div>
  `;

  // Action Menu (NEW) - Contextual menu for selected elements
  app.innerHTML += `
    <div x-show="showActionMenu"
         x-bind:style="actionMenuStyle"
         class="vc-action-menu"
         x-bind:class="{'vc-show': showActionMenu}">
      <!-- Edit Text Button -->
      <button @click="actionMenuEdit()"
              class="vc-action-menu-btn">
        <i class="ph ph-pencil-simple vc-action-menu-icon"></i>
        <span class="vc-action-menu-label">Edit</span>
      </button>

      <!-- AI Instructions Button -->
      <button @click="actionMenuAI()"
              class="vc-action-menu-btn">
        <i class="ph ph-sparkle vc-action-menu-icon"></i>
        <span class="vc-action-menu-label">AI</span>
      </button>
    </div>
  `;

  // Bottom Control Bar (Pill Design) - Simplified unified mode
  app.innerHTML += `
    <div class="vc-control-bar fixed bottom-6 right-6 z-[1000003] flex items-center border border-gray-300 rounded-full shadow-lg" style="background-color: #fffefc;">
      <!-- Design Upload Button -->
      <button @click="openDesignModal()"
              title="Create from Design"
              class="flex items-center justify-center w-12 h-12 text-gray-700 outline-none transition-all duration-200 ease cursor-pointer hover:bg-gray-100 rounded-l-full active:scale-95">
        <i class="ph ph-image text-xl"></i>
      </button>

      <!-- Divider -->
      <div class="w-px h-8 bg-gray-300"></div>

      <!-- History Panel Button -->
      <button @click="toggleHistoryPanel()"
              x-bind:class="{'bg-blue-600 text-white': showHistoryPanel, 'bg-transparent text-gray-700': !showHistoryPanel}"
              title="Change History (Cmd+Shift+H)"
              class="flex items-center justify-center w-12 h-12 outline-none transition-all duration-200 ease cursor-pointer hover:bg-gray-100 active:scale-95 relative">
        <i class="ph ph-clock-counter-clockwise text-xl"></i>
        <!-- Change count badge -->
        <span x-show="changeHistory.length > 0"
              x-text="changeHistory.length"
              class="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center border-2 border-white">
        </span>
      </button>

      <!-- Divider -->
      <div class="w-px h-8 bg-gray-300"></div>

      <!-- Edit/View Mode Toggle Button -->
      <button @click="toggleMode()"
              x-bind:class="modeClass"
              x-bind:title="modeTitle"
              class="vc-mode-toggle flex items-center justify-center w-12 h-12 outline-none transition-all duration-200 ease cursor-pointer rounded-r-full active:scale-95">
        <template x-if="isEditMode">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 32 32" style="display: block;">
            <g transform="rotate(-35 16 16)">
              <path d="M 16 2 L 28 22 L 20 18 L 16 28 L 12 18 L 4 22 Z"
                    fill="currentColor"
                    stroke="none"/>
            </g>
          </svg>
        </template>
        <template x-if="!isEditMode">
          <i class="ph ph-eye text-xl"></i>
        </template>
      </button>
    </div>
  `;

  // History Panel Sidebar (Phase 2)
  app.innerHTML += `
    <div x-show="showHistoryPanel"
         x-transition:enter="transition ease-out duration-200"
         x-transition:enter-start="-translate-x-full"
         x-transition:enter-end="translate-x-0"
         x-transition:leave="transition ease-in duration-150"
         x-transition:leave-start="translate-x-0"
         x-transition:leave-end="-translate-x-full"
         class="vc-history-panel fixed left-0 top-0 bottom-0 w-96 border-r border-gray-200 shadow-xl z-[1000004] overflow-hidden flex flex-col"
         style="background-color: #fffefc;">

      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200" style="background-color: #fffefc;">
        <div class="flex items-center gap-3">
          <i class="ph ph-clock-counter-clockwise text-xl text-gray-700"></i>
          <h2 class="text-base font-semibold text-gray-900 tracking-tight">Change History</h2>
          <span x-show="changeHistory.length > 0"
                x-text="changeHistory.length"
                class="bg-blue-600 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full min-w-[20px] text-center">
          </span>
        </div>
        <button @click="toggleHistoryPanel()"
                class="w-8 h-8 flex items-center justify-center rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 cursor-pointer transition-all">
          <i class="ph ph-x text-lg"></i>
        </button>
      </div>

      <!-- Actions Bar -->
      <div class="flex items-center gap-2 px-4 py-3 border-b border-gray-100" style="background-color: #fffefc;">
        <button @click="selectAllChanges()"
                class="text-xs font-medium px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-md cursor-pointer transition-all">
          Select All
        </button>
        <button @click="deselectAllChanges()"
                class="text-xs font-medium px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-md cursor-pointer transition-all">
          Deselect All
        </button>
        <button @click="clearHistory()"
                class="text-xs font-medium px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-md cursor-pointer transition-all ml-auto">
          Clear All
        </button>
      </div>

      <!-- Change List -->
      <div class="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        <!-- Empty State -->
        <template x-if="changeHistory.length === 0">
          <div class="flex flex-col items-center justify-center h-full text-center p-8">
            <i class="ph ph-note-blank text-6xl text-gray-300 mb-4"></i>
            <p class="text-gray-500 font-medium">No changes yet</p>
            <p class="text-gray-400 text-sm mt-1">Start editing to see changes here</p>
          </div>
        </template>

        <!-- Change Items -->
        <template x-for="change in changeHistory" :key="change.id">
          <div class="vc-change-item border border-gray-200 rounded-lg p-3.5 hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer" style="background-color: #fffefc;">
            <div class="flex items-start gap-3">
              <!-- Checkbox -->
              <input type="checkbox"
                     x-model="change.selected"
                     class="mt-0.5 w-4 h-4 cursor-pointer accent-blue-600 rounded">

              <!-- Content -->
              <div class="flex-1 min-w-0">
                <!-- Type Badge and Timestamp -->
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide"
                        x-bind:style="'background-color: ' + getChangeTypeBadge(change.type).color + '; color: white;'"
                        x-text="getChangeTypeBadge(change.type).text">
                  </span>
                  <span class="text-[11px] text-gray-500 font-medium" x-text="formatTimestamp(change.timestamp)"></span>
                </div>

                <!-- Element Selector -->
                <div class="text-xs font-mono text-gray-600 mb-1.5 truncate bg-gray-50 px-2 py-0.5 rounded" x-text="change.selector"></div>

                <!-- Preview -->
                <div class="text-sm text-gray-700 leading-relaxed" x-text="change.preview"></div>
              </div>

              <!-- Delete Button -->
              <button @click="removeFromHistory(change.id)"
                      class="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer transition-all">
                <i class="ph ph-x text-sm"></i>
              </button>
            </div>
          </div>
        </template>
      </div>

      <!-- Footer Actions -->
      <div class="border-t border-gray-200 px-4 py-4" style="background-color: #fffefc;">
        <div class="text-xs text-gray-500 font-medium mb-3">
          <span x-text="getSelectedChanges().length"></span> of <span x-text="changeHistory.length"></span> selected
        </div>
        <div class="flex gap-2">
          <button @click="commitSelectedChanges()"
                  x-bind:disabled="getSelectedChanges().length === 0"
                  x-bind:class="getSelectedChanges().length === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-50 active:scale-[0.98]'"
                  class="flex-1 px-3 py-2.5 bg-white border border-blue-600 text-blue-600 text-sm font-semibold rounded-lg cursor-pointer transition-all">
            Commit Selected
          </button>
          <button @click="commitAllChanges()"
                  x-bind:disabled="changeHistory.length === 0"
                  x-bind:class="changeHistory.length === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700 active:scale-[0.98]'"
                  class="flex-1 px-3 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg cursor-pointer transition-all shadow-sm">
            Commit All
          </button>
        </div>
      </div>
    </div>
  `;

  // Add Tailwind utility classes for status indicator and control bar states
  const style = document.createElement('style');
  style.textContent = `
    /* Global Inter Font for all VC UI */
    .vc-inline-input,
    .vc-inline-input *,
    .vc-text-editor,
    .vc-text-editor *,
    .vc-status-indicator,
    .vc-status-indicator *,
    .vc-design-modal,
    .vc-design-modal *,
    .vc-control-bar,
    .vc-control-bar *,
    .vc-history-panel,
    .vc-history-panel *,
    .vc-action-menu,
    .vc-action-menu *,
    .vc-selection-info,
    .vc-drop-warning {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif !important;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    .vc-status-indicator.vc-processing {
      background: #2563eb !important;
      color: #ffffff !important;
      border-color: #d1d5db !important;
    }

    .vc-status-indicator.vc-complete {
      background: #22c55e !important;
      color: white !important;
      border-color: #d1d5db !important;
      animation: vc-fadeOut 0.5s ease 2s forwards !important;
    }

    .vc-mode-toggle.vc-edit-mode {
      background: #2563eb !important;
      color: #ffffff !important;
    }

    .vc-mode-toggle.vc-view-mode {
      background: transparent !important;
      color: #6b7280 !important;
    }

    .vc-mode-toggle.vc-edit-mode:hover {
      background: #1d4ed8 !important;
    }

    .vc-mode-toggle.vc-view-mode:hover {
      background: #f3f4f6 !important;
    }

    /* Visual Edit Mode Styles */
    .vc-visual-edit-selected {
      outline: 2px solid #2563eb !important;
      outline-offset: 2px !important;
    }
  `;
  document.head.appendChild(style);

  // Load Phosphor Icons (Notion-style iconography)
  const phosphorLink = document.createElement('link');
  phosphorLink.rel = 'stylesheet';
  phosphorLink.href = 'https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css';
  document.head.appendChild(phosphorLink);

  // Load Inter Font (Notion-style typography)
  const interLink = document.createElement('link');
  interLink.rel = 'stylesheet';
  interLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
  document.head.appendChild(interLink);

  // Append to body
  document.body.appendChild(app);

  console.log('[Visual Claude] UI created ✓');
})();
