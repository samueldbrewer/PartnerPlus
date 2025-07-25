#!/usr/bin/env node

/**
 * Test script for the enhanced clone functionality
 * Tests the smart action verification system with etundra.json
 */

const { exec } = require('child_process');
const path = require('path');

// Test configuration
const testConfig = {
  recording: 'recordings/etundra.json',
  targetUrl: 'https://www.etundra.com/restaurant-parts/cooking-equipment-parts/cheesemelter-parts/vulcan-hart-00-712378-00001-rack-support-cmj-guide/',
  slowMo: 5000,
  variables: {
    first_name: 'Test',
    last_name: 'Clone',
    company_name: 'Clone Test Company',
    email: 'test.clone@example.com',
    address: '123 Test Street',
    city: 'Test City',
    state: 'California',
    state_abr: 'CA',
    phone_number: '555-123-4567',
    zip_code: '90210'
  }
};

console.log('=== Clone Test with Enhanced Smart Actions ===');
console.log(`Recording: ${testConfig.recording}`);
console.log(`Target URL: ${testConfig.targetUrl}`);
console.log(`Slow Motion: ${testConfig.slowMo}ms`);
console.log('');

// Build the command
const command = [
  'node',
  'index.js',
  'clone',
  testConfig.recording,
  `"${testConfig.targetUrl}"`,
  '--dummy-values-file dummy_values.json',
  `--vars '${JSON.stringify(testConfig.variables)}'`,
  `--slow-mo ${testConfig.slowMo}`,
  '--no-wait',  // Skip network idle waits
  '--headless'  // Run in headless mode for testing
].join(' ');

console.log('Executing command:');
console.log(command);
console.log('');
console.log('Starting test...');
console.log('');

// Execute the command
const startTime = Date.now();
const child = exec(command, { cwd: __dirname }, (error, stdout, stderr) => {
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;
  
  console.log('=== Test Results ===');
  console.log(`Duration: ${duration.toFixed(2)} seconds`);
  console.log('');
  
  if (error) {
    console.error('❌ Test FAILED');
    console.error('Error:', error.message);
    console.error('');
    console.error('STDERR:', stderr);
    process.exit(1);
  } else {
    console.log('✅ Test PASSED');
    console.log('');
    
    // Parse stdout for smart action results
    const lines = stdout.split('\n');
    let blindClickSuccess = 0;
    let selectorClickSuccess = 0;
    let iframeClickSuccess = 0;
    let offsetClickSuccess = 0;
    let totalClicks = 0;
    let domChangesDetected = 0;
    
    lines.forEach(line => {
      if (line.includes('Blind click successful')) {
        blindClickSuccess++;
        domChangesDetected++;
      } else if (line.includes('Selector click successful')) {
        selectorClickSuccess++;
        domChangesDetected++;
      } else if (line.includes('iframe click successful')) {
        iframeClickSuccess++;
        domChangesDetected++;
      } else if (line.includes('Click at offset') && line.includes('successful')) {
        offsetClickSuccess++;
        domChangesDetected++;
      }
      
      if (line.includes('Click:')) {
        totalClicks++;
      }
    });
    
    console.log('=== Smart Action Statistics ===');
    console.log(`Total clicks: ${totalClicks}`);
    console.log(`Blind click successes: ${blindClickSuccess} (${(blindClickSuccess/totalClicks*100).toFixed(1)}%)`);
    console.log(`Selector click successes: ${selectorClickSuccess} (${(selectorClickSuccess/totalClicks*100).toFixed(1)}%)`);
    console.log(`Iframe click successes: ${iframeClickSuccess} (${(iframeClickSuccess/totalClicks*100).toFixed(1)}%)`);
    console.log(`Offset click successes: ${offsetClickSuccess} (${(offsetClickSuccess/totalClicks*100).toFixed(1)}%)`);
    console.log(`Total DOM changes detected: ${domChangesDetected}`);
    console.log('');
    
    // Check for any failures
    const failedClicks = lines.filter(line => line.includes('All click strategies failed')).length;
    if (failedClicks > 0) {
      console.log(`⚠️  Warning: ${failedClicks} clicks failed all strategies`);
    }
    
    // Check for Enter key effects
    const enterNoEffect = lines.filter(line => line.includes('Enter had no detectable effect')).length;
    if (enterNoEffect > 0) {
      console.log(`⚠️  Warning: ${enterNoEffect} Enter keypresses had no effect`);
    }
    
    console.log('');
    console.log('Full output saved to stdout.log');
    
    // Save full output for analysis
    require('fs').writeFileSync('stdout.log', stdout);
  }
});

// Show live output
child.stdout.on('data', (data) => {
  process.stdout.write(data);
});

child.stderr.on('data', (data) => {
  process.stderr.write(data);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\nTest interrupted by user');
  child.kill();
  process.exit(1);
});