const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

/**
 * Replays recorded actions on a website
 * @param {string} recordingPath - Path to the recording file
 * @param {Object} options - Playback options
 * @param {Object} variables - Variables to substitute in input values
 * @param {string} [startUrl] - Optional URL to start from instead of the one in the recording
 */
async function playRecording(recordingPath, options = {}, variables = {}, startUrl = null) {
  const defaultOptions = {
    headless: false,
    slowMo: 500, // millisecond delay between actions
    waitForActions: false, // disable network idle waits for speed
    ignoreErrors: false,
    selectorTimeout: 5000, // reduced timeout for speed
    retryCount: 1, // reduced retries for speed
    fastMode: false, // trust recording navigation without field verification
    dummyValuesFile: './dummy_values.json' // default dummy values file
  };
  
  const playbackOptions = { ...defaultOptions, ...options };
  
  // Load the recording
  const recordingContent = fs.readFileSync(recordingPath, 'utf8');
  const recording = JSON.parse(recordingContent);
  
  console.log(`Playing back recording from ${recordingPath}`);
  console.log(`Starting URL: ${recording.startUrl}`);
  console.log(`Total actions: ${recording.actions.length}`);
  
  if (Object.keys(variables).length > 0) {
    console.log('Using variables:', JSON.stringify(variables, null, 2));
  }
  
  // Launch the browser
  const browser = await chromium.launch({ 
    headless: playbackOptions.headless 
  });
  
  // Check if recording has window size info
  let recordedWindowSize = { width: 1280, height: 720 }; // default
  
  // Look for window_size action first (preferred over window_resize)
  const windowSizeAction = recording.actions.find(a => a.type === 'window_size');
  if (windowSizeAction) {
    recordedWindowSize = { width: windowSizeAction.width, height: windowSizeAction.height };
    console.log(`Using recorded window size: ${recordedWindowSize.width}x${recordedWindowSize.height}`);
  } else {
    // Fallback: look for a reasonable window_resize
    const resizeAction = recording.actions.find(a => 
      a.type === 'window_resize' && a.width >= 400 && a.height >= 300
    );
    if (resizeAction) {
      recordedWindowSize = { width: resizeAction.width, height: resizeAction.height };
      console.log(`Using window resize size: ${recordedWindowSize.width}x${recordedWindowSize.height}`);
    }
  }

  const context = await browser.newContext({
    viewport: recordedWindowSize
  });
  
  const page = await context.newPage();
  
  // Navigate to the starting URL (use provided startUrl if specified)
  const actualStartUrl = startUrl || recording.startUrl;
  await page.goto(actualStartUrl);
  console.log(`Navigated to starting URL: ${actualStartUrl}${startUrl ? ' (overriding recording URL)' : ''}`);
  
  // Cache for element lookups to avoid re-searching
  const elementCache = new Map();
  
  // Track if we've already handled the initial window size
  let windowSizeSet = false;
  
  // Failure tracking to detect when to switch from blind to element-based
  const failureTracker = {
    recentFailures: [],
    maxBlindAttempts: 10, // Switch to element-based after this many consecutive failures
    shouldUseElementBased: false,
    
    recordFailure() {
      this.recentFailures.push(Date.now());
      // Keep only last 15 failures for analysis
      if (this.recentFailures.length > 15) {
        this.recentFailures.shift();
      }
      
      // If we have maxBlindAttempts consecutive failures, switch strategies
      if (this.recentFailures.length >= this.maxBlindAttempts) {
        this.shouldUseElementBased = true;
        console.log(`🔄 Switching to element-based approach after ${this.maxBlindAttempts} failures`);
      }
    },
    
    recordSuccess() {
      // Reset failure count on success, but don't switch back to blind mode
      // once we're in element-based mode (it's likely the page changed)
      this.recentFailures = [];
    },
    
    getStrategy() {
      return this.shouldUseElementBased ? 'element-first' : 'blind-first';
    }
  };
  
  // Helper function to clean invalid CSS selectors
  const cleanSelector = (selector) => {
    if (!selector) return selector;
    
    // Remove pseudo-classes that are invalid for querying
    return selector
      .replace(/:hover/g, '')
      .replace(/:focus/g, '')
      .replace(/:active/g, '')
      .replace(/:disabled/g, '')
      .replace(/:enabled/g, '')
      .replace(/:visited/g, '')
      .replace(/:link/g, '')
      // Clean up any resulting double dots or spaces
      .replace(/\.\./g, '.')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Helper function to detect if action should trigger navigation
  const shouldTriggerNavigation = (action, allActions) => {
    const currentIndex = (action.index || 1) - 1;
    const nextAction = allActions && allActions[currentIndex + 1];
    
    // Check if next action is navigation
    if (nextAction && nextAction.type === 'navigation') {
      return nextAction.url;
    }
    
    // Check if action has navigation indicators
    if (action.textContent && (
      action.textContent.toLowerCase().includes('checkout') ||
      action.textContent.toLowerCase().includes('continue') ||
      action.textContent.toLowerCase().includes('next') ||
      action.textContent.toLowerCase().includes('submit')
    )) {
      return true;
    }
    
    return false;
  };

  // Helper function to detect DOM changes after an action
  const detectDOMChange = async (page, beforeSnapshot, timeout = 1000) => {
    try {
      // Wait for any DOM change with a short timeout
      await page.waitForFunction(
        (snapshot) => {
          const currentHTML = document.documentElement.innerHTML;
          return currentHTML !== snapshot;
        },
        beforeSnapshot,
        { timeout }
      );
      return true;
    } catch {
      return false;
    }
  };
  
  // Helper function to detect meaningful changes (not just spinners)
  const detectMeaningfulChange = async (page, action, beforeState) => {
    // For buttons that should calculate/update something
    if (action.textContent && action.textContent.includes('Calculate')) {
      // Look for new elements that might indicate calculation results
      try {
        await page.waitForSelector('.shipping-option, .shipping-method, .calculated-price, [data-shipping]', {
          timeout: 2000,
          state: 'visible'
        });
        console.log('  Detected calculation results');
        return true;
      } catch {
        // Also check if price or content significantly changed
        const afterContent = await page.evaluate(() => {
          const prices = Array.from(document.querySelectorAll('.price, .total, .subtotal')).map(el => el.textContent);
          const options = Array.from(document.querySelectorAll('option, .option')).length;
          return { prices, options };
        });
        
        if (JSON.stringify(afterContent) !== JSON.stringify(beforeState.priceInfo)) {
          console.log('  Detected price/option changes');
          return true;
        }
      }
    }
    
    // For navigation buttons
    if (action.textContent && (action.textContent.includes('Checkout') || action.textContent.includes('Continue'))) {
      const urlChanged = beforeState.url !== page.url();
      if (urlChanged) {
        console.log('  Detected navigation');
        return true;
      }
    }
    
    // Default: check for significant DOM changes
    const afterHTML = await page.content();
    const sizeDiff = Math.abs(afterHTML.length - beforeState.html.length);
    // Consider it meaningful if more than 100 characters changed
    return sizeDiff > 100;
  };
  
  // Helper function to check if an element is actually clickable
  const isElementClickable = async (element) => {
    try {
      const box = await element.boundingBox();
      if (!box) return false;
      
      const isVisible = await element.isVisible();
      const isEnabled = await element.isEnabled();
      
      return isVisible && isEnabled && box.width > 0 && box.height > 0;
    } catch {
      return false;
    }
  };
  
  // Smart click handler with progressive fallback
  const smartClick = async (page, action, retryCount, allActions) => {
    const logPrefix = `[${action.index}/${action.total}] Click`;
    
    // Get coordinates based on recording version
    const x = action.coordinates?.x || action.x;
    const y = action.coordinates?.y || action.y;
    
    // Choose strategy based on failure history
    const strategy = failureTracker.getStrategy();
    const rawSelector = action.element?.selector || action.selector;
    const selector = cleanSelector(rawSelector);
    
    // Check if this action should trigger navigation - but prefer actual interaction
    const expectedNavigation = shouldTriggerNavigation(action, allActions);
    // Note: We'll use expectedNavigation for post-action validation, not pre-emptive navigation
    
    if (strategy === 'element-first' && selector) {
      console.log(`${logPrefix}: Using element-first strategy (selector: ${selector})`);
      
      // Try element-based approach first
      try {
        const element = await page.$(selector);
        if (element && await isElementClickable(element)) {
          const beforeState = {
            html: await page.content(),
            url: page.url(),
            priceInfo: await page.evaluate(() => {
              const prices = Array.from(document.querySelectorAll('.price, .total, .subtotal')).map(el => el.textContent);
              const options = Array.from(document.querySelectorAll('option, .option')).length;
              return { prices, options };
            })
          };
          
          await element.click();
          let hadEffect = await detectDOMChange(page, beforeState.html, 500);
          
          // Check for meaningful changes if needed
          if (hadEffect && (action.textContent || action.element?.textContent)) {
            hadEffect = await detectMeaningfulChange(page, action, beforeState);
          }
          
          if (hadEffect) {
            console.log(`${logPrefix}: Element-first click successful`);
            failureTracker.recordSuccess();
            return true;
          }
        }
      } catch (err) {
        console.log(`${logPrefix}: Element-first approach failed: ${err.message}`);
      }
      
      // Fall back to blind click if element approach failed
      console.log(`${logPrefix}: Falling back to blind click at (${x}, ${y})`);
    } else {
      console.log(`${logPrefix}: Using blind-first strategy at (${x}, ${y})`);
    }
    
    // Step 1: Try blind click at coordinates
    console.log(`${logPrefix}: Attempting blind click at (${x}, ${y})`);
    
    // Capture before state
    const beforeState = {
      html: await page.content(),
      url: page.url(),
      priceInfo: await page.evaluate(() => {
        const prices = Array.from(document.querySelectorAll('.price, .total, .subtotal')).map(el => el.textContent);
        const options = Array.from(document.querySelectorAll('option, .option')).length;
        return { prices, options };
      })
    };
    
    await page.mouse.click(x, y);
    
    // Check if the click had any effect
    let hadEffect = await detectDOMChange(page, beforeState.html, 500);
    
    // Special case: Check if this is a click on an input field followed by typing
    if (!hadEffect && selector && (selector.includes('input') || selector.includes('email') || selector.includes('text'))) {
      // Check if next action is typing into the same field
      const currentIndex = (action.index || 1) - 1; // Convert to 0-based index
      const nextAction = allActions && allActions[currentIndex + 1];
      if (nextAction && nextAction.type === 'input' && nextAction.selector === selector) {
        console.log(`${logPrefix}: Click targets input field and next action is typing - considering successful`);
        // Check if the field is now focused
        try {
          const isFocused = await page.evaluate((sel) => {
            const element = document.querySelector(sel);
            return element === document.activeElement;
          }, selector);
          if (isFocused) {
            console.log(`${logPrefix}: Input field is now focused`);
            hadEffect = true;
          }
        } catch (err) {
          console.log(`${logPrefix}: Could not check focus state, but assuming success due to input sequence`);
          hadEffect = true;
        }
      }
    }
    
    // For specific button types, check for meaningful changes
    if (hadEffect && (action.textContent || action.element?.textContent)) {
      hadEffect = await detectMeaningfulChange(page, action, beforeState);
    }
    
    // Enhanced: Check if this action should trigger navigation
    if (action.element?.href || action.element?.isButton || action.triggeredNavigation || expectedNavigation) {
      // Wait a bit longer for navigation
      await page.waitForTimeout(1000);
      try {
        const afterUrl = page.url();
        if (afterUrl !== beforeState.url) {
          console.log(`${logPrefix}: Click triggered navigation to ${afterUrl}`);
          hadEffect = true;
        } else if (expectedNavigation) {
          // If we expected navigation but didn't get it, try direct navigation as fallback
          console.log(`${logPrefix}: Expected navigation didn't occur naturally, trying direct navigation as fallback`);
          try {
            await page.goto(expectedNavigation, { waitUntil: 'networkidle' });
            console.log(`${logPrefix}: Fallback direct navigation successful`);
            hadEffect = true;
          } catch (navErr) {
            console.log(`${logPrefix}: Fallback navigation failed: ${navErr.message}`);
            // Still consider click successful if we expected navigation
            hadEffect = true;
          }
        }
      } catch (err) {
        // Context destroyed means navigation happened
        if (err.message.includes('Execution context was destroyed')) {
          console.log(`${logPrefix}: Navigation detected (context destroyed)`);
          hadEffect = true;
        }
      }
    }
    
    if (hadEffect) {
      console.log(`${logPrefix}: Blind click successful`);
      failureTracker.recordSuccess();
      return true;
    }
    
    // Step 2: Try selector-based click if we have a selector
    if (selector) {
      console.log(`${logPrefix}: Blind click had no effect, trying selector: ${selector}`);
      
      // Enhanced: Use element state information if available
      if (action.element?.state && !action.element.state.visible) {
        console.log(`${logPrefix}: Element was not visible in recording, skipping selector approach`);
      } else {
        try {
          // First try main frame
          const element = await page.$(selector);
          if (element && await isElementClickable(element)) {
            await element.click();
            let hadSelectorEffect = await detectDOMChange(page, beforeClick, 500);
            
            // Special case for input fields: check if clicking led to focus
            if (!hadSelectorEffect && (selector.includes('input') || selector.includes('email') || selector.includes('text'))) {
              const currentIndex = (action.index || 1) - 1;
              const nextAction = allActions && allActions[currentIndex + 1];
              if (nextAction && nextAction.type === 'input' && nextAction.selector === selector) {
                console.log(`${logPrefix}: Input field click - checking focus state`);
                try {
                  const isFocused = await page.evaluate((sel) => {
                    const el = document.querySelector(sel);
                    return el === document.activeElement;
                  }, selector);
                  if (isFocused) {
                    console.log(`${logPrefix}: Input field is focused - considering click successful`);
                    hadSelectorEffect = true;
                  }
                } catch (err) {
                  console.log(`${logPrefix}: Assuming input click success due to typing sequence`);
                  hadSelectorEffect = true;
                }
              }
            }
            
            if (hadSelectorEffect) {
              console.log(`${logPrefix}: Selector click successful`);
              failureTracker.recordSuccess();
              return true;
            }
          }
        } catch (err) {
          console.log(`${logPrefix}: Selector click failed: ${err.message}`);
        }
      }
    }
    
    // Step 3: Search in iframes
    console.log(`${logPrefix}: Searching in iframes...`);
    const frames = page.frames();
    for (const frame of frames) {
      if (frame === page.mainFrame()) continue; // Skip main frame, already tried
      
      try {
        const element = await frame.$(action.selector || `[x="${action.x}"][y="${action.y}"]`);
        if (element && await isElementClickable(element)) {
          const beforeIframeClick = await page.evaluate(() => document.documentElement.innerHTML);
          await element.click();
          const hadIframeEffect = await detectDOMChange(page, beforeIframeClick, 500);
          if (hadIframeEffect) {
            console.log(`${logPrefix}: iframe click successful`);
            failureTracker.recordSuccess();
            return true;
          }
        }
      } catch {
        // Continue to next iframe
      }
    }
    
    // Step 4: Final fallback - try clicking at nearby coordinates
    console.log(`${logPrefix}: Trying nearby coordinates...`);
    const offsets = [[0, 0], [-5, -5], [5, 5], [-10, -10], [10, 10]];
    for (const [dx, dy] of offsets) {
      if (dx === 0 && dy === 0) continue; // Already tried exact coordinates
      const beforeOffset = await page.evaluate(() => document.documentElement.innerHTML);
      await page.mouse.click(action.x + dx, action.y + dy);
      const hadOffsetEffect = await detectDOMChange(page, beforeOffset, 300);
      if (hadOffsetEffect) {
        console.log(`${logPrefix}: Click at offset (${dx}, ${dy}) successful`);
        failureTracker.recordSuccess();
        return true;
      }
    }
    
    console.log(`${logPrefix}: All click strategies failed`);
    failureTracker.recordFailure();
    return false;
  };
  
  // Smart keypress handler with detection
  const smartKeypress = async (page, action, allActions, variables = {}) => {
    const logPrefix = `[${action.index}/${action.total}] Keypress`;
    
    // NEW: Blind typing for single printable characters (letters, numbers, symbols)
    if (action.key && action.key.length === 1 && /^[a-zA-Z0-9\s\-_@.,!#$%&*+=?^`{}|~]$/.test(action.key)) {
      let keyToType = action.key;
      
      // Load dummy values for keypress substitution
      let dummyValues = {};
      if (playbackOptions.dummyValuesFile && fs.existsSync(playbackOptions.dummyValuesFile)) {
        try {
          const dummyValuesContent = fs.readFileSync(playbackOptions.dummyValuesFile, 'utf8');
          dummyValues = JSON.parse(dummyValuesContent);
        } catch (err) {
          console.error(`  Error loading dummy values for keypress: ${err.message}`);
        }
      }
      
      // Check for state keypress substitution
      if (dummyValues.state_keypress_1 === action.key && variables.state_abr) {
        // This is the first character of the state abbreviation
        keyToType = variables.state_abr.charAt(0);
        console.log(`  State keypress substitution: "${action.key}" -> "${keyToType}" (${dummyValues.state_abr} -> ${variables.state_abr})`);
      } else if (dummyValues.state_keypress_2 === action.key && variables.state_abr) {
        // This is the second character of the state abbreviation
        keyToType = variables.state_abr.charAt(1);
        console.log(`  State keypress substitution: "${action.key}" -> "${keyToType}" (${dummyValues.state_abr} -> ${variables.state_abr})`);
      }
      
      console.log(`${logPrefix}: Blind typing "${keyToType}" in focused field`);
      try {
        await page.keyboard.type(keyToType, { delay: 0 });
        console.log(`${logPrefix}: Blind typing successful`);
        return true;
      } catch (err) {
        console.log(`${logPrefix}: Blind typing failed: ${err.message}`);
        return false;
      }
    }
    
    // Special handling for Enter key which often triggers navigation
    if (action.key === 'Enter') {
      console.log(`${logPrefix}: Pressing Enter key`);
      
      // Check if this should trigger navigation - but prefer actual keypress
      const expectedNavigation = shouldTriggerNavigation(action, allActions);
      
      const beforeEnter = await page.url();
      const beforeDOM = await page.evaluate(() => document.documentElement.innerHTML);
      
      await page.keyboard.press('Enter');
      
      // Wait a bit for potential navigation
      await page.waitForTimeout(1000);
      
      try {
        const afterURL = await page.url();
        const domChanged = await detectDOMChange(page, beforeDOM, 1000);
        
        if (afterURL !== beforeEnter) {
          console.log(`${logPrefix}: Enter triggered navigation to ${afterURL}`);
          return true;
        } else if (domChanged) {
          console.log(`${logPrefix}: Enter triggered DOM change`);
          return true;
        } else if (expectedNavigation) {
          // If we expected navigation but didn't get it, try direct navigation as fallback
          console.log(`${logPrefix}: Expected navigation didn't occur naturally, trying direct navigation as fallback`);
          try {
            await page.goto(expectedNavigation, { waitUntil: 'networkidle' });
            console.log(`${logPrefix}: Fallback direct navigation successful`);
            return true;
          } catch (navErr) {
            console.log(`${logPrefix}: Fallback navigation failed: ${navErr.message}`);
            console.log(`${logPrefix}: Enter had no detectable effect`);
            return false;
          }
        } else {
          console.log(`${logPrefix}: Enter had no detectable effect`);
          return false;
        }
      } catch (err) {
        // Context destroyed means navigation happened
        if (err.message.includes('Execution context was destroyed')) {
          console.log(`${logPrefix}: Navigation detected (context destroyed)`);
          return true;
        }
        throw err;
      }
    } else {
      // For other keys, just press and check for DOM changes
      console.log(`${logPrefix}: Pressing ${action.key}`);
      const beforeKey = await page.evaluate(() => document.documentElement.innerHTML);
      await page.keyboard.press(action.key);
      
      const hadEffect = await detectDOMChange(page, beforeKey, 300);
      if (hadEffect) {
        console.log(`${logPrefix}: Key press successful (DOM changed)`);
      }
      return hadEffect;
    }
  };
  
  // Universal delay function with intelligent waiting and configurable delays
  const universalDelay = async (actionType = 'default') => {
    // First apply action-specific delays if configured
    const applyActionDelay = async () => {
      switch (actionType) {
        case 'click':
          if (playbackOptions.clickDelay > 0) {
            console.log(`  Custom click delay: ${playbackOptions.clickDelay}ms`);
            await page.waitForTimeout(playbackOptions.clickDelay);
          }
          break;
        case 'input':
          if (playbackOptions.inputDelay > 0) {
            console.log(`  Custom input delay: ${playbackOptions.inputDelay}ms`);
            await page.waitForTimeout(playbackOptions.inputDelay);
          }
          break;
        case 'navigation':
          if (playbackOptions.navDelay > 0) {
            console.log(`  Custom navigation delay: ${playbackOptions.navDelay}ms`);
            await page.waitForTimeout(playbackOptions.navDelay);
          }
          break;
      }
    };
    
    // Apply custom action delays first
    await applyActionDelay();
    
    // Handle wait-for-idle option
    if (playbackOptions.waitForIdle) {
      try {
        console.log(`  Waiting for network idle...`);
        await page.waitForLoadState('networkidle', { timeout: 3000 });
      } catch (networkError) {
        console.log(`  Network idle timeout, continuing...`);
      }
    }
    
    // Skip standard timing for input/scroll/keypress if no custom delays
    if ((actionType === 'input' || actionType === 'scroll' || actionType === 'keypress') && 
        playbackOptions.clickDelay === 0 && playbackOptions.inputDelay === 0 && !playbackOptions.waitForIdle) {
      return;
    }
    
    // Apply standard timing
    if (playbackOptions.slowMo > 0) {
      // Use simple delay when slowMo is set (but not for input/scroll unless custom delay set)
      if (actionType !== 'input' && actionType !== 'scroll' && actionType !== 'keypress') {
        await page.waitForTimeout(playbackOptions.slowMo);
      }
    } else {
      // Use intelligent page state waiting when slowMo is 0
      try {
        // Wait for network to be mostly idle (max 2 seconds)
        await page.waitForLoadState('networkidle', { timeout: 2000 });
      } catch (networkError) {
        // If network doesn't settle, wait for DOM to be stable
        try {
          await page.waitForLoadState('domcontentloaded', { timeout: 1000 });
        } catch (domError) {
          // Fallback: short wait for any pending JS
          await page.waitForTimeout(100);
        }
      }
      
      // Additional logic based on action type (only if no custom delays)
      if (playbackOptions.clickDelay === 0 && playbackOptions.inputDelay === 0 && playbackOptions.navDelay === 0) {
        switch (actionType) {
          case 'click':
            // After clicks, wait a bit longer for potential navigation/DOM changes
            await page.waitForTimeout(200);
            break;
          case 'keypress':
            // Key presses might trigger form validation or auto-complete
            await page.waitForTimeout(150);
            break;
          case 'navigation':
            // Navigation needs more time to settle
            try {
              await page.waitForLoadState('load', { timeout: 3000 });
            } catch (loadError) {
              await page.waitForTimeout(500);
            }
            break;
          default:
            // Minimal wait for other actions
            await page.waitForTimeout(50);
        }
      }
    }
  };

  // Helper function to detect duplicate clicks
  const isDuplicateClick = (currentAction, nextAction, index) => {
    if (!nextAction || currentAction.type !== 'click' || nextAction.type !== 'click') {
      return false;
    }
    
    // Check if coordinates are the same or very close (within 5 pixels)
    const coordsMatch = Math.abs(currentAction.x - nextAction.x) <= 5 && 
                       Math.abs(currentAction.y - nextAction.y) <= 5;
    
    // Check if timestamps are close (within 500ms)
    const timeGap = nextAction.timestamp - currentAction.timestamp;
    const timingClose = timeGap < 500;
    
    // Check for form elements (radio buttons, checkboxes, or related UI patterns)
    const isFormElement = (currentAction.selector && nextAction.selector && (
      currentAction.selector.includes('checkbox') ||
      currentAction.selector.includes('radio') ||
      nextAction.selector.includes('checkbox') ||
      nextAction.selector.includes('radio') ||
      currentAction.selector.includes('showcase') || // Common pattern
      nextAction.selector.startsWith('#') && currentAction.selector.startsWith('.') // CSS pattern: class -> id
    ));
    
    return coordsMatch && timingClose && isFormElement;
  };

  // Play back each action
  for (let i = 0; i < recording.actions.length; i++) {
    const action = recording.actions[i];
    
    // Check for duplicate clicks and skip if found
    if (action.type === 'click' && i + 1 < recording.actions.length) {
      const nextAction = recording.actions[i + 1];
      if (isDuplicateClick(action, nextAction, i)) {
        console.log(`[${i+1}/${recording.actions.length}] Skipping duplicate click - same coordinates within 500ms (${action.selector} -> ${nextAction.selector})`);
        continue; // Skip this action
      }
    }
    
    let retryCount = 0;
    let actionSuccessful = false;
    
    while (!actionSuccessful && retryCount <= playbackOptions.retryCount) {
      try {
        switch (action.type) {
          case 'click':
            // Use smart click for all modes now
            action.index = i + 1;
            action.total = recording.actions.length;
            const clickSuccess = await smartClick(page, action, retryCount, recording.actions);
            if (!clickSuccess && !playbackOptions.ignoreErrors) {
              throw new Error(`Failed to click at position (${action.x}, ${action.y})`);
            }
            await universalDelay('click');
            break;
          
        case 'input':
          // Always consolidate consecutive input actions for better performance
          {
            let consolidatedValue = action.value;
            let nextIndex = i + 1;
            
            // Look ahead for more input actions with the same selector
            while (nextIndex < recording.actions.length && 
                   recording.actions[nextIndex].type === 'input' && 
                   recording.actions[nextIndex].selector === action.selector) {
              // Use the last (most complete) value for this field
              consolidatedValue = recording.actions[nextIndex].value;
              nextIndex++;
            }
            
            // Skip the consolidated actions (we'll process them all at once)
            const skippedActions = nextIndex - i - 1;
            if (skippedActions > 0) {
              console.log(`[${i+1}/${recording.actions.length}] Typing into: ${action.selector} (consolidated ${skippedActions + 1} actions)`);
              i = nextIndex - 1; // Set i to the last action we're consolidating
            } else {
              console.log(`[${i+1}/${recording.actions.length}] Typing into: ${action.selector}`);
            }
            
            // Process variable substitution
            let inputValue = consolidatedValue;
            
            // Load dummy values if specified in options
            let dummyValues = {};
            if (playbackOptions.dummyValuesFile && fs.existsSync(playbackOptions.dummyValuesFile)) {
              try {
                const dummyValuesContent = fs.readFileSync(playbackOptions.dummyValuesFile, 'utf8');
                dummyValues = JSON.parse(dummyValuesContent);
              } catch (err) {
                console.error(`  Error loading dummy values: ${err.message}`);
              }
            }

            // First, check if the input exactly matches any dummy value
            let foundMatch = false;
            for (const [varName, dummyValue] of Object.entries(dummyValues)) {
              if (inputValue === String(dummyValue)) {
                const userValue = variables[varName];
                if (userValue !== undefined) {
                  console.log(`  Variable substitution: "${inputValue}" -> "${userValue}" (${varName})`);
                  inputValue = userValue;
                  foundMatch = true;
                  break;
                }
              }
            }
            
            // If no exact match, check if this is a progressive typing scenario
            // Look for the final value in the same field within the next few actions
            if (!foundMatch && action.selector) {
              // Look ahead to find the final value for this field
              const nextActionsForField = [];
              for (let j = i + 1; j < Math.min(i + 50, recording.actions.length); j++) {
                const nextAction = recording.actions[j];
                if (nextAction.type === 'input' && nextAction.selector === action.selector) {
                  nextActionsForField.push(nextAction.value);
                } else if (nextAction.type !== 'input') {
                  break; // Stop looking when we hit a non-input action
                }
              }
              
              // Check if any of the future values match a dummy value
              for (const futureValue of nextActionsForField) {
                for (const [varName, dummyValue] of Object.entries(dummyValues)) {
                  if (futureValue === String(dummyValue)) {
                    const userValue = variables[varName];
                    if (userValue !== undefined) {
                      console.log(`  Progressive substitution: Found complete value "${futureValue}" -> "${userValue}" (${varName})`);
                      inputValue = userValue;
                      foundMatch = true;
                      break;
                    }
                  }
                }
                if (foundMatch) break;
              }
            }
            
            // If no dummy value match, check for variable placeholders
            if (!foundMatch) {
              const variablePattern = /\[([a-zA-Z0-9_]+)\]/g;
              let match;
              
              while ((match = variablePattern.exec(inputValue)) !== null) {
                const variableName = match[1];
                const variableValue = variables[variableName];
                
                if (variableValue !== undefined) {
                  console.log(`  Placeholder substitution: [${variableName}] -> "${variableValue}"`);
                  inputValue = inputValue.replace(
                    new RegExp(`\\[${variableName}\\]`, 'g'), 
                    variableValue
                  );
                }
              }
            }
            
            
            // Try to find the target element first, fall back to active field typing
            let element = null;
            let targetFrame = page;
            
            try {
              // Try main frame first
              await page.waitForSelector(action.selector, { timeout: 1000 });
              element = await page.$(action.selector);
              if (element) {
                console.log(`  Found element: ${action.selector}`);
              }
            } catch (mainFrameError) {
              console.log('  Element not found in main frame, checking iframes...');
              
              // Try iframes
              const frames = await page.frames();
              for (const frame of frames) {
                try {
                  await frame.waitForSelector(action.selector, { timeout: 500 });
                  element = await frame.$(action.selector);
                  if (element) {
                    targetFrame = frame;
                    console.log(`  Found element in iframe`);
                    break;
                  }
                } catch (frameError) {
                  // Continue to next frame
                }
              }
            }
            
            // Type the input
            if (element) {
              // Clear and fill the element directly
              await element.click(); // Focus first
              await element.selectText(); // Select all
              await element.fill(inputValue); // Fill with final value
              console.log(`  Typed into element: "${inputValue}"`);
            } else {
              // Fallback to active field typing
              console.log('  Element not found anywhere, typing in active field as fallback');
              await page.keyboard.press('Control+a'); // Select all in active field
              await page.keyboard.type(inputValue, { delay: 0 }); // Type final value
              console.log(`  Typed in active field: "${inputValue}"`);
            }
            
            await universalDelay('input');
          }
          break;
          
        case 'keypress':
          // Use smart keypress handler
          action.index = i + 1;
          action.total = recording.actions.length;
          const keypressSuccess = await smartKeypress(page, action, recording.actions, variables);
          if (!keypressSuccess && action.key === 'Enter' && !playbackOptions.ignoreErrors) {
            console.log(`[${i+1}/${recording.actions.length}] Enter key had no effect, but continuing...`);
          }
          await universalDelay('keypress');
          break;
          
        case 'navigation':
          // If this is the first navigation and we're using a custom start URL, skip it
          // as we've already navigated to our custom URL
          if (i === 0 && startUrl && action.url === recording.startUrl) {
            console.log(`[${i+1}/${recording.actions.length}] Skipping initial navigation (using custom URL)`);
          } else {
            console.log(`[${i+1}/${recording.actions.length}] Navigation to: ${action.url}${retryCount > 0 ? ` (retry ${retryCount})` : ''}`);
            // Don't navigate explicitly, as clicks should trigger navigations naturally
          }
          await universalDelay('navigation');
          break;
          
        case 'scroll':
          console.log(`[${i+1}/${recording.actions.length}] Scrolling to: (${action.x}, ${action.y})${retryCount > 0 ? ` (retry ${retryCount})` : ''}`);
          await page.evaluate(({ x, y }) => {
            window.scrollTo(x, y);
          }, { x: action.x, y: action.y });
          await universalDelay('scroll');
          break;
          
        case 'window_size':
          if (!windowSizeSet) {
            console.log(`[${i+1}/${recording.actions.length}] Setting initial window size: ${action.width}x${action.height}`);
            await page.setViewportSize({ width: action.width, height: action.height });
            windowSizeSet = true;
          } else {
            console.log(`[${i+1}/${recording.actions.length}] Ignoring window size (already set): ${action.width}x${action.height}`);
          }
          break;
          
        case 'window_resize':
          // Ignore unusually small window sizes (likely dev tools or UI glitches)
          if (action.width < 400 || action.height < 300) {
            console.log(`[${i+1}/${recording.actions.length}] Ignoring unusually small resize: ${action.width}x${action.height} (likely UI glitch)`);
          } else if (!windowSizeSet) {
            console.log(`[${i+1}/${recording.actions.length}] Setting initial window size from resize: ${action.width}x${action.height}`);
            await page.setViewportSize({ width: action.width, height: action.height });
            windowSizeSet = true;
            await universalDelay();
          } else {
            console.log(`[${i+1}/${recording.actions.length}] Ignoring mid-recording resize: ${action.width}x${action.height} (use initial window size only)`);
          }
          break;
          
        default:
          console.log(`[${i+1}/${recording.actions.length}] Unsupported action type: ${action.type}${retryCount > 0 ? ` (retry ${retryCount})` : ''}`);
          await universalDelay();
        }
        
        actionSuccessful = true; // If we get here, the action succeeded
        
        // Wait for network to be idle if configured (disabled by default for speed)
        if (playbackOptions.waitForActions) {
          await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
            // Ignore timeout errors for network idle
          });
        }
        
      } catch (err) {
        retryCount++;
        if (retryCount > playbackOptions.retryCount) {
          console.error(`Error playing action ${i+1} (final attempt):`, err.message);
          
          if (!playbackOptions.ignoreErrors) {
            throw err;
          } else {
            actionSuccessful = true; // Skip this action and continue
          }
        } else {
          console.log(`Action ${i+1} failed, retrying in 500ms... (attempt ${retryCount}/${playbackOptions.retryCount})`);
          await page.waitForTimeout(500); // Faster retry delay
        }
      }
    }
  }
  
  console.log('Playback completed!');
  
  // Take final screenshots before closing
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const currentUrl = page.url();
    const domain = new URL(currentUrl).hostname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fullPagePath = path.join(process.cwd(), 'screenshots', `${domain}_${timestamp}_fullpage.png`);
    const viewportPath = path.join(process.cwd(), 'screenshots', `${domain}_${timestamp}_viewport.png`);
    
    // Ensure screenshots directory exists
    fs.mkdirSync(path.dirname(fullPagePath), { recursive: true });
    
    // Take full page screenshot
    await page.screenshot({ 
      path: fullPagePath, 
      fullPage: true,
      animations: 'disabled'
    });
    
    // Take viewport screenshot
    await page.screenshot({ 
      path: viewportPath, 
      fullPage: false,
      animations: 'disabled'
    });
    
    console.log(`Final screenshots saved:`);
    console.log(`  Full page: ${fullPagePath}`);
    console.log(`  Viewport: ${viewportPath}`);
    console.log(`Final URL: ${currentUrl}`);
  } catch (screenshotError) {
    console.error('Failed to capture final screenshots:', screenshotError.message);
  }
  
  // Option to keep the browser open after playback
  if (options.keepOpen) {
    console.log('Browser kept open as requested. Press Ctrl+C to exit.');
    await new Promise(() => {});
  } else {
    // Close the browser
    await browser.close();
  }
}

/**
 * Clones a recording to run on a different URL
 * @param {string} recordingPath - Path to the recording file 
 * @param {string} newUrl - New URL to use instead of the original
 * @param {Object} options - Playback options
 * @param {Object} variables - Variables to substitute in input values
 */
async function cloneRecording(recordingPath, newUrl, options = {}, variables = {}) {
  return playRecording(recordingPath, options, variables, newUrl);
}

module.exports = { playRecording, cloneRecording };