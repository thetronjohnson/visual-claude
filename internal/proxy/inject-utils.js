// Visual Claude - Utility Functions and Constants
(function() {
  'use strict';

  // ============================================================================
  // CONSTANTS
  // ============================================================================

  window.VCConstants = {
    // Timing
    HOVER_CHECK_THROTTLE: 16, // ~60fps
    PROCESSING_TIMEOUT: 300000, // 5 minutes max
    CLICK_DOUBLE_CLICK_DELAY: 250, // ms to distinguish single from double click
    RELOAD_DELAY: 1500, // ms before auto-reload after completion
    WS_RECONNECT_DELAY: 2000, // ms before reconnecting WebSocket
    ERROR_RELOAD_DELAY: 2000, // ms before reloading on error

    // UI Dimensions
    INPUT_WIDTH: 320,
    INPUT_HEIGHT: 140,
    EDITOR_WIDTH: 400,
    EDITOR_HEIGHT: 200,
    UI_PADDING: 20,

    // Selection Constraints
    MIN_DRAG_DISTANCE: 10, // px minimum drag to show selection
    MIN_SELECTION_SIZE: 10, // px minimum selection width/height
    CLICK_MAX_DISTANCE: 5, // px maximum movement to be considered a click
    CLICK_MAX_DURATION: 200, // ms maximum duration to be considered a click
    MIN_ELEMENT_SIZE: 5, // px minimum element size to be selectable

    // Element Traversal
    MAX_ELEMENT_DEPTH: 3, // Maximum depth when finding parent elements

    // LocalStorage Keys
    EDIT_MODE_KEY: 'vc-edit-mode',

    // WebSocket Endpoints
    WS_RELOAD_PATH: '/__visual-claude/ws/reload',
    WS_MESSAGE_PATH: '/__visual-claude/ws/message',

    // Cursor
    CURSOR_URL: '/__visual-claude/cursor.svg',
    CURSOR_HOTSPOT: '8 6',

    // Editable Tags
    EDITABLE_TAGS: ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                    'span', 'a', 'button', 'label', 'li', 'td', 'th', 'div'],

    // VC UI Selector (for skipping our own elements)
    VC_UI_SELECTOR: '.vc-selection-rect, .vc-selection-info, .vc-inline-input, ' +
                   '.vc-status-indicator, .vc-text-editor, .vc-mode-toolbar, .vc-design-modal, ' +
                   '.vc-control-bar, .vc-drag-handles, .vc-visual-toolbar, .vc-hover-drag-handle, ' +
                   '.vc-reorder-placeholder',
  };

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  window.VCUtils = {

    /**
     * Get all elements within specified bounds
     * @param {Object} bounds - {left, top, right, bottom}
     * @returns {Array<Element>} Elements intersecting with bounds
     */
    getElementsInBounds(bounds) {
      const elements = [];
      const allElements = document.querySelectorAll('body *');

      allElements.forEach(el => {
        // Skip our own UI elements
        if (el.closest(window.VCConstants.VC_UI_SELECTOR)) {
          return;
        }

        const rect = el.getBoundingClientRect();

        // Check if element intersects with selection
        if (rect.left < bounds.right &&
            rect.right > bounds.left &&
            rect.top < bounds.bottom &&
            rect.bottom > bounds.top) {
          elements.push(el);
        }
      });

      return elements;
    },

    /**
     * Get CSS selector for an element
     * @param {Element} element - DOM element
     * @returns {string} CSS selector
     */
    getSelector(element) {
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
        if (path.length > window.VCConstants.MAX_ELEMENT_DEPTH) break;
        element = element.parentElement;
      }

      return path.join(' > ');
    },

    /**
     * Get element information object
     * @param {Element} element - DOM element
     * @returns {Object} Element info
     */
    getElementInfo(element) {
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
        selector: this.getSelector(element),
        innerText: element.innerText || '',
        outerHTML: element.outerHTML || '',
      };
    },

    /**
     * Find the best element under cursor for selection
     * @param {Element} target - Initial target element
     * @returns {Element|null} Best selectable element
     */
    findElementUnderCursor(target) {
      let element = target;
      let depth = 0;

      while (element && depth < window.VCConstants.MAX_ELEMENT_DEPTH) {
        // Skip if it's a Visual Claude UI element
        if (element.closest(window.VCConstants.VC_UI_SELECTOR)) {
          return null;
        }

        // Check if element is valid and visible
        if (element.nodeType === Node.ELEMENT_NODE && element.offsetParent !== null) {
          const rect = element.getBoundingClientRect();
          if (rect.width > window.VCConstants.MIN_ELEMENT_SIZE &&
              rect.height > window.VCConstants.MIN_ELEMENT_SIZE) {
            return element;
          }
        }

        element = element.parentElement;
        depth++;
      }

      return null;
    },

    /**
     * Check if element is text-editable
     * @param {Element} element - DOM element
     * @returns {boolean} Whether element can be text-edited
     */
    isTextEditable(element) {
      if (!element || !element.innerText) return false;

      const text = element.innerText.trim();
      if (text.length === 0) return false;

      const tagName = element.tagName.toLowerCase();
      return window.VCConstants.EDITABLE_TAGS.includes(tagName) ||
             element.hasAttribute('contenteditable');
    },

    /**
     * Capture screenshot of selected area
     * @param {Object} bounds - {left, top, width, height}
     * @returns {Promise<string>} Base64 encoded screenshot
     */
    async captureAreaScreenshot(bounds) {
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
        console.error('[Visual Claude] Screenshot capture failed:', err);
        return '';
      }
    },

    /**
     * Calculate distance between two points
     * @param {Object} p1 - {x, y}
     * @param {Object} p2 - {x, y}
     * @returns {number} Distance in pixels
     */
    calculateDistance(p1, p2) {
      return Math.sqrt(
        Math.pow(p2.x - p1.x, 2) +
        Math.pow(p2.y - p1.y, 2)
      );
    },

    /**
     * Position element within viewport bounds
     * @param {number} x - Desired x position
     * @param {number} y - Desired y position
     * @param {number} width - Element width
     * @param {number} height - Element height
     * @param {number} padding - Minimum padding from edges
     * @returns {Object} {left, top} adjusted position
     */
    positionInViewport(x, y, width, height, padding = window.VCConstants.UI_PADDING) {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let left = x + padding;
      let top = y + padding;

      // Keep within viewport bounds
      if (left + width > viewportWidth - padding) {
        left = x - width - padding;
      }
      if (top + height > viewportHeight - padding) {
        top = y - height - padding;
      }

      // Ensure minimum distance from edges
      left = Math.max(padding, Math.min(left, viewportWidth - width - padding));
      top = Math.max(padding, Math.min(top, viewportHeight - height - padding));

      return { left, top };
    },

    /**
     * Get WebSocket URL for given path
     * @param {string} path - WebSocket path
     * @returns {string} Full WebSocket URL
     */
    getWebSocketURL(path) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      return `${protocol}//${host}${path}`;
    },

    /**
     * Format area size for display
     * @param {number} width - Width in pixels
     * @param {number} height - Height in pixels
     * @returns {string} Formatted size string
     */
    formatAreaSize(width, height) {
      return `${Math.round(width)}×${Math.round(height)}px`;
    },

    /**
     * Get element label for tooltip display
     * @param {Element} element - DOM element
     * @returns {string} Element label
     */
    getElementLabel(element) {
      const tagName = element.tagName.toLowerCase();
      const id = element.id ? `#${element.id}` : '';
      const classes = Array.from(element.classList)
        .filter(c => !c.startsWith('vc-'))
        .slice(0, 2)
        .join('.');
      const classStr = classes ? `.${classes}` : '';

      return `${tagName}${id}${classStr}`;
    },

    /**
     * Calculate bounds from two points
     * @param {Object} start - {x, y}
     * @param {Object} end - {x, y}
     * @returns {Object} {left, top, right, bottom, width, height}
     */
    calculateBounds(start, end) {
      return {
        left: Math.min(start.x, end.x),
        top: Math.min(start.y, end.y),
        right: Math.max(start.x, end.x),
        bottom: Math.max(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
      };
    },

    /**
     * Detect layout context of parent container
     * @param {Element} element - DOM element
     * @returns {Object} Layout information
     */
    detectLayoutContext(element) {
      if (!element || !element.parentElement) return null;

      const parent = element.parentElement;
      const computedStyle = window.getComputedStyle(parent);

      return {
        isFlex: computedStyle.display.includes('flex'),
        isGrid: computedStyle.display === 'grid',
        isBlock: computedStyle.display === 'block',
        flexDirection: computedStyle.flexDirection || 'row',
        gap: parseFloat(computedStyle.gap) || 0,
        parent: parent,
      };
    },

    /**
     * Get sibling arrangement and detect if vertical or horizontal
     * @param {Element} element - DOM element
     * @returns {Object} Arrangement information
     */
    getSiblingArrangement(element) {
      if (!element || !element.parentElement) return null;

      const parent = element.parentElement;
      const siblings = Array.from(parent.children).filter(child => {
        // Filter out VC UI elements
        return !child.closest(window.VCConstants.VC_UI_SELECTOR) &&
               child.nodeType === Node.ELEMENT_NODE &&
               window.getComputedStyle(child).display !== 'none';
      });

      if (siblings.length < 2) return null;

      const rects = siblings.map(s => s.getBoundingClientRect());
      const tolerance = 10; // 10px tolerance for alignment

      // Check if arranged vertically (stacked)
      let isVertical = true;
      for (let i = 1; i < rects.length; i++) {
        const prev = rects[i - 1];
        const curr = rects[i];
        // Current element should start below or at the bottom of previous
        if (curr.top < prev.bottom - tolerance) {
          isVertical = false;
          break;
        }
      }

      // Check if arranged horizontally (side by side)
      let isHorizontal = true;
      for (let i = 1; i < rects.length; i++) {
        const prev = rects[i - 1];
        const curr = rects[i];
        // Current element should start to the right of previous
        if (curr.left < prev.right - tolerance) {
          isHorizontal = false;
          break;
        }
      }

      return {
        siblings: siblings,
        rects: rects,
        isVertical: isVertical,
        isHorizontal: isHorizontal,
        count: siblings.length,
      };
    },

    /**
     * Determine if drag should trigger reorder based on context and movement
     * @param {Element} element - Element being dragged
     * @param {number} deltaX - Horizontal drag distance
     * @param {number} deltaY - Vertical drag distance
     * @param {Object} layoutContext - Layout context from detectLayoutContext
     * @param {Object} siblingArrangement - Sibling arrangement from getSiblingArrangement
     * @returns {boolean} Whether to trigger reorder
     */
    shouldTriggerReorder(element, deltaX, deltaY, layoutContext, siblingArrangement) {
      if (!layoutContext || !siblingArrangement) return false;
      if (siblingArrangement.count < 2) return false;

      const threshold = 20; // Minimum drag distance to trigger reorder

      // For flex column or vertical arrangement
      if ((layoutContext.isFlex && layoutContext.flexDirection === 'column') ||
          (siblingArrangement.isVertical && !siblingArrangement.isHorizontal)) {
        return Math.abs(deltaY) > threshold;
      }

      // For flex row or horizontal arrangement
      if ((layoutContext.isFlex && layoutContext.flexDirection === 'row') ||
          (siblingArrangement.isHorizontal && !siblingArrangement.isVertical)) {
        return Math.abs(deltaX) > threshold;
      }

      // For grid or block flow (typically vertical)
      if (layoutContext.isGrid || layoutContext.isBlock) {
        if (siblingArrangement.isVertical) {
          return Math.abs(deltaY) > threshold;
        }
      }

      return false;
    },

    /**
     * Find which sibling element is being hovered over during drag
     * @param {Element} draggingElement - Element being dragged
     * @param {number} deltaX - Horizontal drag offset
     * @param {number} deltaY - Vertical drag offset
     * @param {Array<Element>} siblings - Array of sibling elements
     * @returns {Object} {target: Element, insertBefore: boolean} or null
     */
    getReorderTarget(draggingElement, deltaX, deltaY, siblings) {
      if (!siblings || siblings.length === 0) return null;

      const dragRect = draggingElement.getBoundingClientRect();
      const dragCenter = {
        x: dragRect.left + dragRect.width / 2 + deltaX,
        y: dragRect.top + dragRect.height / 2 + deltaY,
      };

      // Find which sibling's bounding box contains the drag center
      for (let i = 0; i < siblings.length; i++) {
        const sibling = siblings[i];
        if (sibling === draggingElement) continue;

        const rect = sibling.getBoundingClientRect();
        const siblingCenter = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };

        // Check if drag center is within sibling bounds
        if (dragCenter.x >= rect.left && dragCenter.x <= rect.right &&
            dragCenter.y >= rect.top && dragCenter.y <= rect.bottom) {

          // Determine if we should insert before or after
          const insertBefore = dragCenter.y < siblingCenter.y ||
                              (Math.abs(dragCenter.y - siblingCenter.y) < 5 &&
                               dragCenter.x < siblingCenter.x);

          return {
            target: sibling,
            insertBefore: insertBefore,
            index: i,
          };
        }
      }

      return null;
    }
  };

  console.log('[Visual Claude Utils] Loaded ✓');
})();
