const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

/**
 * Enhanced recorder that captures detailed element information
 * @param {string} url - The URL to navigate to
 * @param {string} outputPath - Path to save the recording
 */
async function recordActions(url, outputPath) {
  console.log(`Starting enhanced recording session at ${url}`);
  console.log('Press Ctrl+C to stop recording and save the actions');
  
  // Launch the browser
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    recordVideo: {
      dir: path.join(process.cwd(), 'recordings'),
      size: { width: 1280, height: 720 }
    },
    viewport: { width: 1280, height: 720 }
  });
  
  const page = await context.newPage();
  
  // Storage for actions
  const actions = [];
  let lastUrl = null;
  let focusedElement = null;
  
  // Set up event listeners
  await page.exposeFunction('reportAction', (action) => {
    // Check if this action triggered a URL change
    const currentUrl = page.url();
    if (lastUrl && currentUrl !== lastUrl) {
      action.triggeredNavigation = {
        fromUrl: lastUrl,
        toUrl: currentUrl
      };
    }
    lastUrl = currentUrl;
    
    actions.push(action);
    console.log(`Recorded action: ${action.type}${action.triggeredNavigation ? ' (triggered navigation)' : ''}`);
  });
  
  // Inject enhanced recorder script
  await page.addInitScript(() => {
    // Track focused element
    let currentFocus = null;
    
    document.addEventListener('focusin', (e) => {
      currentFocus = e.target;
    }, true);
    
    // Helper to get element position and dimensions
    function getElementRect(el) {
      const rect = el.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left
      };
    }
    
    // Helper to get element attributes
    function getElementAttributes(el) {
      const attrs = {};
      for (const attr of el.attributes) {
        attrs[attr.name] = attr.value;
      }
      return attrs;
    }
    
    // Helper to get computed styles
    function getElementState(el) {
      const computed = window.getComputedStyle(el);
      const rect = getElementRect(el);
      
      return {
        visible: computed.display !== 'none' && 
                 computed.visibility !== 'hidden' && 
                 computed.opacity !== '0' &&
                 rect.width > 0 && 
                 rect.height > 0,
        enabled: !el.disabled && !el.hasAttribute('disabled'),
        readonly: el.readOnly || el.hasAttribute('readonly'),
        clickable: computed.pointerEvents !== 'none',
        zIndex: computed.zIndex,
        position: computed.position
      };
    }
    
    // Helper to get form information
    function getFormInfo(el) {
      const form = el.form || el.closest('form');
      if (!form) return null;
      
      return {
        formId: form.id,
        formName: form.name,
        formAction: form.action,
        formMethod: form.method
      };
    }
    
    // Enhanced click handler
    window.addEventListener('click', async (e) => {
      const target = e.target;
      const rect = getElementRect(target);
      const state = getElementState(target);
      const attrs = getElementAttributes(target);
      const formInfo = getFormInfo(target);
      
      // Wait a tiny bit to capture URL changes
      const urlBefore = window.location.href;
      
      window.reportAction({
        type: 'click',
        timestamp: Date.now(),
        coordinates: {
          x: e.clientX,
          y: e.clientY,
          pageX: e.pageX,
          pageY: e.pageY
        },
        element: {
          tagName: target.tagName.toLowerCase(),
          selector: generateSelector(target),
          textContent: target.textContent ? target.textContent.trim().substring(0, 100) : '',
          value: target.value || '',
          placeholder: target.placeholder || '',
          attributes: attrs,
          rect: rect,
          state: state,
          type: target.type || '',
          role: target.getAttribute('role') || '',
          ariaLabel: target.getAttribute('aria-label') || '',
          isButton: target.tagName === 'BUTTON' || 
                    target.type === 'button' || 
                    target.type === 'submit' ||
                    target.getAttribute('role') === 'button',
          isLink: target.tagName === 'A' || target.getAttribute('role') === 'link',
          href: target.href || '',
          formInfo: formInfo
        },
        context: {
          focusedElement: currentFocus ? generateSelector(currentFocus) : null,
          urlBefore: urlBefore
        }
      });
    }, true);
    
    // Enhanced input handler
    window.addEventListener('input', (e) => {
      const target = e.target;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        const rect = getElementRect(target);
        const state = getElementState(target);
        const attrs = getElementAttributes(target);
        const formInfo = getFormInfo(target);
        
        window.reportAction({
          type: 'input',
          timestamp: Date.now(),
          element: {
            tagName: target.tagName.toLowerCase(),
            selector: generateSelector(target),
            value: target.value,
            attributes: attrs,
            rect: rect,
            state: state,
            inputType: target.type || 'text',
            name: target.name || '',
            id: target.id || '',
            placeholder: target.placeholder || '',
            maxLength: target.maxLength || -1,
            pattern: target.pattern || '',
            required: target.required || false,
            formInfo: formInfo
          }
        });
      }
    }, true);
    
    // Enhanced keypress handler
    window.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' || e.key === 'Tab' || e.key === 'Escape') {
        const target = e.target;
        const urlBefore = window.location.href;
        
        window.reportAction({
          type: 'keypress',
          timestamp: Date.now(),
          key: e.key,
          keyCode: e.keyCode,
          ctrlKey: e.ctrlKey,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          metaKey: e.metaKey,
          element: {
            tagName: target.tagName.toLowerCase(),
            selector: generateSelector(target),
            type: target.type || '',
            isInput: target.tagName === 'INPUT' || target.tagName === 'TEXTAREA',
            isButton: target.tagName === 'BUTTON' || target.type === 'submit',
            value: target.value || ''
          },
          context: {
            urlBefore: urlBefore
          }
        });
      }
    }, true);
    
    // Focus tracking
    window.addEventListener('focus', (e) => {
      window.reportAction({
        type: 'focus',
        timestamp: Date.now(),
        element: {
          selector: generateSelector(e.target),
          tagName: e.target.tagName.toLowerCase()
        }
      });
    }, true);
    
    // Scroll events with more context
    let scrollTimeout;
    window.addEventListener('scroll', (e) => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        window.reportAction({
          type: 'scroll',
          timestamp: Date.now(),
          position: {
            x: window.scrollX,
            y: window.scrollY,
            maxX: document.documentElement.scrollWidth - window.innerWidth,
            maxY: document.documentElement.scrollHeight - window.innerHeight
          }
        });
      }, 150); // Debounce scroll events
    }, true);
    
    // Window resize with debouncing
    let resizeTimeout;
    window.addEventListener('resize', (e) => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        window.reportAction({
          type: 'window_resize',
          timestamp: Date.now(),
          dimensions: {
            width: window.innerWidth,
            height: window.innerHeight,
            screenWidth: window.screen.width,
            screenHeight: window.screen.height
          }
        });
      }, 250);
    }, true);
    
    // Enhanced selector generator
    function generateSelector(el) {
      // Try ID first
      if (el.id) {
        return `#${el.id}`;
      }
      
      // Try data attributes
      if (el.dataset) {
        for (const [key, value] of Object.entries(el.dataset)) {
          if (key.includes('test') || key.includes('id') || key.includes('name')) {
            return `[data-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}="${value}"]`;
          }
        }
      }
      
      // Try aria-label
      if (el.getAttribute('aria-label')) {
        return `[aria-label="${el.getAttribute('aria-label')}"]`;
      }
      
      // Try name attribute
      if (el.name) {
        return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
      }
      
      // Try specific attributes for common elements
      const tag = el.tagName.toLowerCase();
      if (tag === 'a' && el.href) {
        return `a[href="${el.href}"]`;
      }
      
      if (tag === 'button' && el.textContent) {
        const text = el.textContent.trim();
        if (text.length < 30) {
          return `button:contains("${text}")`;
        }
      }
      
      // Try class names
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.trim().split(/\s+/).filter(c => !c.includes('hover') && !c.includes('focus'));
        if (classes.length > 0) {
          return `${tag}.${classes.join('.')}`;
        }
      }
      
      // Build a path selector
      const path = [];
      let current = el;
      
      while (current && current !== document.body && path.length < 5) {
        let selector = current.tagName.toLowerCase();
        
        // Add useful attributes
        if (current.className && typeof current.className === 'string') {
          const classes = current.className.trim().split(/\s+/).slice(0, 2);
          if (classes.length > 0) {
            selector += `.${classes.join('.')}`;
          }
        }
        
        // Add position among siblings
        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(child => child.tagName === current.tagName);
          if (siblings.length > 1) {
            const index = siblings.indexOf(current) + 1;
            selector += `:nth-of-type(${index})`;
          }
        }
        
        path.unshift(selector);
        current = current.parentElement;
      }
      
      return path.join(' > ');
    }
  });
  
  // Navigation tracking
  page.on('framenavigated', async (frame) => {
    if (frame === page.mainFrame()) {
      const action = {
        type: 'navigation',
        timestamp: Date.now(),
        url: frame.url(),
        isMainFrame: true
      };
      
      // If there's a previous action within 2 seconds, mark it as triggering this navigation
      if (actions.length > 0) {
        const lastAction = actions[actions.length - 1];
        const timeDiff = Date.now() - lastAction.timestamp;
        if (timeDiff < 2000) {
          lastAction.triggeredNavigation = {
            toUrl: frame.url(),
            timeToNavigate: timeDiff
          };
          action.triggeredBy = {
            actionType: lastAction.type,
            actionIndex: actions.length - 1
          };
        }
      }
      
      actions.push(action);
      lastUrl = frame.url();
    }
  });
  
  // Navigate to the starting URL
  await page.goto(url);
  lastUrl = url;
  
  // Record initial state
  const windowSize = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio
  }));
  
  actions.push({
    type: 'window_size',
    timestamp: Date.now(),
    dimensions: windowSize
  });
  
  // Handle exit signals
  const exitHandler = async () => {
    console.log('Recording stopped');
    
    // Save enhanced recording
    const recording = {
      version: '2.0', // New version for enhanced format
      timestamp: Date.now(),
      startUrl: url,
      finalUrl: page.url(),
      totalDuration: actions.length > 0 ? Date.now() - actions[0].timestamp : 0,
      actions: actions
    };
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Save to file
    fs.writeFileSync(outputPath, JSON.stringify(recording, null, 2));
    console.log(`Recording saved to ${outputPath}`);
    console.log(`Total actions recorded: ${actions.length}`);
    
    // Save video path
    const video = await page.video();
    if (video) {
      const videoPath = await video.path();
      console.log(`Video saved to ${videoPath}`);
    }
    
    // Close browser
    await browser.close();
    process.exit(0);
  };
  
  // Set up signal handlers
  process.on('SIGINT', exitHandler);
  process.on('SIGTERM', exitHandler);
  
  console.log('Recording... Navigate and interact with the page.');
}

module.exports = { recordActions };