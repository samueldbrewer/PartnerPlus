const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

/**
 * Records user actions on a website and saves them to a JSON file
 * @param {string} url - The URL to navigate to
 * @param {string} outputPath - Path to save the recording
 */
async function recordActions(url, outputPath) {
  console.log(`Starting recording session at ${url}`);
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
  
  // Create a CDP session
  const page = await context.newPage();
  
  // Storage for actions
  const actions = [];
  
  // Set up event listeners for mouse, keyboard, and navigation
  await page.exposeFunction('reportAction', (action) => {
    actions.push(action);
    console.log(`Recorded action: ${action.type}`);
  });
  
  // Inject recorder script
  await page.addInitScript(() => {
    window.addEventListener('click', (e) => {
      const target = e.target;
      window.reportAction({
        type: 'click',
        timestamp: Date.now(),
        x: e.clientX,
        y: e.clientY,
        selector: generateSelector(target),
        textContent: target.textContent ? target.textContent.trim().substring(0, 50) : '',
      });
    }, true);
    
    window.addEventListener('input', (e) => {
      const target = e.target;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        window.reportAction({
          type: 'input',
          timestamp: Date.now(),
          selector: generateSelector(target),
          value: target.value
        });
      }
    }, true);
    
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Tab') {
        window.reportAction({
          type: 'keypress',
          timestamp: Date.now(),
          key: e.key
        });
      }
    }, true);
    
    // Record scroll events
    window.addEventListener('scroll', (e) => {
      window.reportAction({
        type: 'scroll',
        timestamp: Date.now(),
        x: window.scrollX,
        y: window.scrollY
      });
    }, true);
    
    // Record window resize events
    window.addEventListener('resize', (e) => {
      window.reportAction({
        type: 'window_resize',
        timestamp: Date.now(),
        width: window.innerWidth,
        height: window.innerHeight
      });
    }, true);
    
    // Helper to generate a selector for an element
    function generateSelector(el) {
      if (el.id) {
        return `#${el.id}`;
      }
      
      if (el.className && typeof el.className === 'string') {
        return `.${el.className.trim().replace(/\s+/g, '.')}`;
      }
      
      const tag = el.tagName.toLowerCase();
      if (tag === 'a' && el.href) {
        return `a[href="${el.href}"]`;
      }
      
      if (tag === 'input' && el.name) {
        return `input[name="${el.name}"]`;
      }
      
      // Fallback to a more complex selector
      const selectorParts = [];
      let currentEl = el;
      
      while (currentEl && currentEl !== document.body) {
        let selector = currentEl.tagName.toLowerCase();
        
        if (currentEl.className && typeof currentEl.className === 'string' && currentEl.className.trim() !== '') {
          selector += `.${currentEl.className.trim().replace(/\s+/g, '.')}`;
        }
        
        const siblings = Array.from(currentEl.parentNode.children)
          .filter(e => e.tagName === currentEl.tagName);
          
        if (siblings.length > 1) {
          const index = siblings.indexOf(currentEl) + 1;
          selector += `:nth-child(${index})`;
        }
        
        selectorParts.unshift(selector);
        currentEl = currentEl.parentNode;
        
        // Limit selector complexity
        if (selectorParts.length >= 4) {
          break;
        }
      }
      
      return selectorParts.join(' > ');
    }
  });
  
  // Navigation events
  page.on('framenavigated', async (frame) => {
    if (frame === page.mainFrame()) {
      actions.push({
        type: 'navigation',
        timestamp: Date.now(),
        url: frame.url()
      });
    }
  });
  
  // Navigate to the starting URL
  await page.goto(url);
  
  // Record initial window size
  const windowSize = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }));
  actions.push({
    type: 'window_size',
    timestamp: Date.now(),
    width: windowSize.width,
    height: windowSize.height
  });
  
  // Handle exit signals for graceful termination
  const exitHandler = async () => {
    console.log('Recording stopped');
    
    // Save actions to file
    const recording = {
      version: '1.0',
      timestamp: Date.now(),
      startUrl: url,
      actions: actions
    };
    
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(recording, null, 2));
    
    console.log(`Recording saved to ${outputPath}`);
    
    // Close the browser
    await context.close();
    await browser.close();
    
    process.exit(0);
  };
  
  // Handle various termination signals
  process.on('SIGINT', exitHandler);
  process.on('SIGTERM', exitHandler);
  process.on('SIGUSR1', exitHandler);
  process.on('SIGUSR2', exitHandler);
  
  // Wait for user to finish recording (this will be interrupted by Ctrl+C)
  await new Promise(() => {});
}

module.exports = { recordActions };