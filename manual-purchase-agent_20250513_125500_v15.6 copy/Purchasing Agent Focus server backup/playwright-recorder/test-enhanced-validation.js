#!/usr/bin/env node

/**
 * Test script that adds extra validation for critical steps
 */

const { chromium } = require('playwright');
const fs = require('fs');

async function runEnhancedTest() {
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 500 
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  
  const page = await context.newPage();
  
  console.log('1. Navigating to product page...');
  await page.goto('https://www.etundra.com/restaurant-parts/cooking-equipment-parts/cheesemelter-parts/vulcan-hart-00-712378-00001-rack-support-cmj-guide/');
  
  console.log('2. Adding to cart...');
  await page.click('.btn.btn-primary.addtocart');
  await page.waitForTimeout(1000);
  
  console.log('3. Going to cart...');
  await page.click('.caption.hidden-xs');
  await page.waitForLoadState('networkidle');
  
  console.log('4. Entering ZIP code...');
  const zipInput = await page.waitForSelector('#ZipCode', { state: 'visible' });
  await zipInput.click();
  await zipInput.fill('90210');
  
  console.log('5. Waiting for Calculate Shipping button to be ready...');
  // Wait a bit for any validation
  await page.waitForTimeout(1000);
  
  // Find the calculate shipping button
  const calculateButton = await page.$('.big.btn.btn-primary.col-xs-12:has-text("Calculate Shipping")');
  if (calculateButton) {
    console.log('6. Clicking Calculate Shipping...');
    await calculateButton.click();
    
    // Wait for shipping options to appear
    console.log('7. Waiting for shipping calculation...');
    try {
      // Wait for shipping options or price update
      await page.waitForSelector('.shipping-option, .shipping-method, [data-shipping]', { 
        timeout: 10000,
        state: 'visible' 
      });
      console.log('✓ Shipping calculated successfully!');
    } catch (e) {
      console.log('✗ Shipping calculation may have failed - no shipping options appeared');
      
      // Check if there's an error message
      const errorMsg = await page.$('.alert-danger, .error-message, .validation-error');
      if (errorMsg) {
        const errorText = await errorMsg.textContent();
        console.log('Error message found:', errorText);
      }
    }
  } else {
    console.log('✗ Calculate Shipping button not found!');
  }
  
  console.log('8. Proceeding to checkout...');
  const checkoutButton = await page.$('.big.btn.btn-primary.btn-checkout.col-xs-12.checkout-button:has-text("Proceed to Checkout")');
  if (checkoutButton) {
    await checkoutButton.click();
    await page.waitForLoadState('networkidle');
    console.log('✓ Navigated to:', page.url());
  }
  
  // Continue with guest checkout
  console.log('9. Checking out as guest...');
  const guestButton = await page.$('.no-thanks.btn.btn-primary:has-text("Checkout as Guest")');
  if (guestButton) {
    await guestButton.click();
    await page.waitForLoadState('networkidle');
    console.log('✓ Final URL:', page.url());
  }
  
  await browser.close();
}

runEnhancedTest().catch(console.error);