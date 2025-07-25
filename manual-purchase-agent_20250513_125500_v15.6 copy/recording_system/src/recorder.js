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
  
  // Display dummy values for reference
  try {
    const dummyValuesPath = path.join(process.cwd(), 'dummy_values.json');
    if (fs.existsSync(dummyValuesPath)) {
      const dummyValues = JSON.parse(fs.readFileSync(dummyValuesPath, 'utf8'));
      console.log('\n📋 DUMMY VALUES FOR RECORDING REFERENCE:');
      console.log('=====================================');
      
      // Group values by category for better display
      const categories = {
        'Personal Info': ['first_name', 'last_name', 'email', 'phone', 'company'],
        'Address': ['address', 'address2', 'city', 'state', 'zip_code', 'country'],
        'Payment': ['credit_card', 'expiry_month', 'expiry_year', 'cvv'],
        'Billing': ['billing_first_name', 'billing_last_name', 'billing_address', 'billing_address2', 'billing_city', 'billing_state', 'billing_zip']
      };
      
      for (const [categoryName, fieldNames] of Object.entries(categories)) {
        const categoryValues = fieldNames.filter(field => dummyValues[field]);
        if (categoryValues.length > 0) {
          console.log(`\n${categoryName}:`);
          categoryValues.forEach(field => {
            console.log(`  ${field}: ${dummyValues[field]}`);
          });
        }
      }
      
      // Show any other values not in categories
      const allCategoryFields = Object.values(categories).flat();
      const otherFields = Object.keys(dummyValues).filter(field => !allCategoryFields.includes(field));
      if (otherFields.length > 0) {
        console.log('\nOther Values:');
        otherFields.forEach(field => {
          console.log(`  ${field}: ${dummyValues[field]}`);
        });
      }
      
      console.log('\n=====================================');
      console.log('Use these values during recording. They will be replaced with real data during playback.\n');
    } else {
      console.log('\n⚠️  No dummy_values.json found. Consider creating one for consistent test data.\n');
    }
  } catch (error) {
    console.log(`\n⚠️  Error loading dummy values: ${error.message}\n`);
  }
  
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
    // Track recent Enter keypresses to avoid duplicate click recording
    let lastEnterKeypress = 0;
    
    window.addEventListener('click', (e) => {
      const target = e.target;
      const now = Date.now();
      
      // Skip click events that happen within 50ms of an Enter keypress
      // These are likely keyboard-triggered clicks on focused buttons
      if (now - lastEnterKeypress < 50) {
        console.log('Skipping keyboard-triggered click event');
        return;
      }
      
      // Skip synthetic clicks with coordinates (0,0) as they're usually programmatic
      if (e.clientX === 0 && e.clientY === 0 && e.isTrusted) {
        console.log('Skipping synthetic click at (0,0)');
        return;
      }
      
      window.reportAction({
        type: 'click',
        timestamp: now,
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
        const now = Date.now();
        
        // Track Enter keypresses to filter out resulting clicks
        if (e.key === 'Enter') {
          lastEnterKeypress = now;
        }
        
        window.reportAction({
          type: 'keypress',
          timestamp: now,
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