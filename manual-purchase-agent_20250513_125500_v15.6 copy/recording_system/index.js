#!/usr/bin/env node

const { program } = require('commander');
const path = require('path');
const fs = require('fs');
const { playRecording, cloneRecording } = require('./src/player');

// Configure CLI
program
  .name('web-recorder')
  .description('Record and replay web browsing sessions')
  .version('1.0.0');

// Record command
program
  .command('record')
  .description('Record a web browsing session')
  .argument('<url>', 'Starting URL for the recording session')
  .option('-o, --output <path>', 'Output file path (auto-generated if not specified)')
  .option('--enhanced', 'Use enhanced recorder with detailed element tracking', false)
  .action(async (url, options) => {
    try {
      // Auto-generate output path if not provided
      let outputPath = options.output;
      if (!outputPath) {
        try {
          const urlObj = new URL(url);
          const domain = urlObj.hostname.replace('www.', '');
          const siteName = domain.split('.')[0]; // e.g., partstown.com -> partstown
          outputPath = `./recordings/${siteName}.json`;
          console.log(`Auto-generated output path: ${outputPath}`);
        } catch (e) {
          console.error('Invalid URL provided, using default output path');
          outputPath = './recordings/recording.json';
        }
      }
      
      if (options.enhanced) {
        const { recordActions } = require('./src/recorder-enhanced');
        console.log('Using enhanced recorder with detailed tracking...');
        await recordActions(url, outputPath);
      } else {
        const { recordActions } = require('./src/recorder');
        await recordActions(url, outputPath);
      }
    } catch (error) {
      console.error('Recording failed:', error.message);
      process.exit(1);
    }
  });

// Play command
program
  .command('play')
  .description('Replay a recorded web browsing session')
  .argument('<url_or_recording>', 'URL to play (auto-finds recording) or path to recording file')
  .option('--headless', 'Run in headless mode', false)
  .option('--slow-mo <ms>', 'Slow down execution by specified milliseconds', '500')
  .option('--no-wait', 'Do not wait for actions to complete', false)
  .option('--ignore-errors', 'Continue playback on errors', false)
  .option('--keep-open', 'Keep browser open after playback', false)
  .option('--timeout <ms>', 'Timeout for selectors in milliseconds (for progressive forms)', '15000')
  .option('--fast', 'Fast mode: trust recording navigation, use coordinates and active field typing', false)
  .option('--click-delay <ms>', 'Additional delay after each click action (ms)', '0')
  .option('--input-delay <ms>', 'Additional delay after each input action (ms)', '0')
  .option('--nav-delay <ms>', 'Additional delay after navigation actions (ms)', '0')
  .option('--wait-for-idle', 'Wait for network idle after each action', false)
  .option('--conservative', 'Use conservative timing (equivalent to --click-delay 1000 --input-delay 500 --nav-delay 2000)', false)
  .option('--vars <json>', 'JSON string with variables (e.g. \'{"zip_code":"12345"}\')') 
  .option('--vars-file <path>', 'Path to JSON file containing variables')
  .option('--dummy-values-file <path>', 'Path to JSON file with dummy values that should be replaced with variables')
  .action(async (urlOrRecording, options) => {
    try {
      // Determine if input is URL or recording path
      let recordingPath = urlOrRecording;
      let targetUrl = null;
      
      // Check if it looks like a URL
      if (urlOrRecording.startsWith('http://') || urlOrRecording.startsWith('https://')) {
        // It's a URL - find matching recording
        try {
          const urlObj = new URL(urlOrRecording);
          const domain = urlObj.hostname.replace('www.', '');
          const siteName = domain.split('.')[0];
          recordingPath = `./recordings/${siteName}.json`;
          targetUrl = urlOrRecording;
          
          // Check if recording exists
          if (!fs.existsSync(recordingPath)) {
            console.error(`No recording found for ${siteName}. Expected: ${recordingPath}`);
            console.log(`To record this site, run: node index.js record ${urlOrRecording}`);
            process.exit(1);
          }
          
          console.log(`Found recording for ${siteName}: ${recordingPath}`);
          console.log(`Playing back on URL: ${targetUrl}`);
        } catch (e) {
          console.error('Invalid URL provided:', e.message);
          process.exit(1);
        }
      } else {
        // It's a recording path - use as-is
        if (!fs.existsSync(recordingPath)) {
          console.error(`Recording file not found: ${recordingPath}`);
          process.exit(1);
        }
      }
      
      const playbackOptions = {
        headless: options.headless,
        slowMo: parseInt(options.slowMo, 10),
        waitForActions: options.wait,
        ignoreErrors: options.ignoreErrors,
        keepOpen: options.keepOpen,
        selectorTimeout: parseInt(options.timeout, 10),
        fastMode: options.fast,
        dummyValuesFile: options.dummyValuesFile,
        clickDelay: options.conservative ? 1000 : parseInt(options.clickDelay || '0', 10),
        inputDelay: options.conservative ? 500 : parseInt(options.inputDelay || '0', 10),
        navDelay: options.conservative ? 2000 : parseInt(options.navDelay || '0', 10),
        waitForIdle: options.waitForIdle || options.conservative
      };
      
      // Process variables from JSON string or file
      let variables = {};
      
      if (options.vars) {
        try {
          variables = JSON.parse(options.vars);
          console.log('Loaded variables from command line arguments');
        } catch (e) {
          console.error('Error parsing variables JSON:', e.message);
          process.exit(1);
        }
      }
      
      if (options.varsFile) {
        try {
          const varsFileContent = fs.readFileSync(options.varsFile, 'utf8');
          const fileVars = JSON.parse(varsFileContent);
          
          // Merge with existing variables (command line vars take precedence)
          variables = { ...fileVars, ...variables };
          console.log(`Loaded variables from file: ${options.varsFile}`);
        } catch (e) {
          console.error(`Error loading variables from file ${options.varsFile}:`, e.message);
          process.exit(1);
        }
      }
      
      // If we have a target URL, use clone functionality; otherwise use normal play
      if (targetUrl) {
        await cloneRecording(recordingPath, targetUrl, playbackOptions, variables);
      } else {
        await playRecording(recordingPath, playbackOptions, variables);
      }
    } catch (error) {
      console.error('Playback failed:', error.message);
      process.exit(1);
    }
  });

// Parse arguments
// Clone command
program
  .command('clone')
  .description('Replay a recorded session on a different URL')
  .argument('<site_or_recording>', 'Site name (e.g., "partstown") or path to recording file')
  .argument('<url>', 'New URL to start the playback from')
  .option('--headless', 'Run in headless mode', false)
  .option('--slow-mo <ms>', 'Slow down execution by specified milliseconds', '500')
  .option('--no-wait', 'Do not wait for actions to complete', false)
  .option('--ignore-errors', 'Continue playback on errors', false)
  .option('--keep-open', 'Keep browser open after playback', false)
  .option('--timeout <ms>', 'Timeout for selectors in milliseconds (for progressive forms)', '15000')
  .option('--fast', 'Fast mode: trust recording navigation, use coordinates and active field typing', false)
  .option('--click-delay <ms>', 'Additional delay after each click action (ms)', '0')
  .option('--input-delay <ms>', 'Additional delay after each input action (ms)', '0')
  .option('--nav-delay <ms>', 'Additional delay after navigation actions (ms)', '0')
  .option('--wait-for-idle', 'Wait for network idle after each action', false)
  .option('--conservative', 'Use conservative timing (equivalent to --click-delay 1000 --input-delay 500 --nav-delay 2000)', false)
  .option('--vars <json>', 'JSON string with variables (e.g. \'{"zip_code":"12345"}\')') 
  .option('--vars-file <path>', 'Path to JSON file containing variables')
  .option('--dummy-values-file <path>', 'Path to JSON file with dummy values that should be replaced with variables')
  .action(async (siteOrRecording, url, options) => {
    try {
      // Determine if input is site name or recording path
      let recordingPath = siteOrRecording;
      
      // Check if it looks like a site name (no path separators or file extension)
      if (!siteOrRecording.includes('/') && !siteOrRecording.includes('\\') && !siteOrRecording.endsWith('.json')) {
        // It's a site name - construct recording path
        recordingPath = `./recordings/${siteOrRecording}.json`;
        
        // Check if recording exists
        if (!fs.existsSync(recordingPath)) {
          console.error(`No recording found for ${siteOrRecording}. Expected: ${recordingPath}`);
          console.log(`To record this site, run: node index.js record https://${siteOrRecording}.com/product`);
          process.exit(1);
        }
        
        console.log(`Found recording for ${siteOrRecording}: ${recordingPath}`);
      } else {
        // It's a recording path - use as-is
        if (!fs.existsSync(recordingPath)) {
          console.error(`Recording file not found: ${recordingPath}`);
          process.exit(1);
        }
      }
      
      const playbackOptions = {
        headless: options.headless,
        slowMo: parseInt(options.slowMo, 10),
        waitForActions: options.wait,
        ignoreErrors: options.ignoreErrors,
        keepOpen: options.keepOpen,
        selectorTimeout: parseInt(options.timeout, 10),
        fastMode: options.fast,
        dummyValuesFile: options.dummyValuesFile,
        clickDelay: options.conservative ? 1000 : parseInt(options.clickDelay || '0', 10),
        inputDelay: options.conservative ? 500 : parseInt(options.inputDelay || '0', 10),
        navDelay: options.conservative ? 2000 : parseInt(options.navDelay || '0', 10),
        waitForIdle: options.waitForIdle || options.conservative
      };
      
      // Process variables from JSON string or file
      let variables = {};
      
      if (options.vars) {
        try {
          variables = JSON.parse(options.vars);
          console.log('Loaded variables from command line arguments');
        } catch (e) {
          console.error('Error parsing variables JSON:', e.message);
          process.exit(1);
        }
      }
      
      if (options.varsFile) {
        try {
          const varsFileContent = fs.readFileSync(options.varsFile, 'utf8');
          const fileVars = JSON.parse(varsFileContent);
          
          // Merge with existing variables (command line vars take precedence)
          variables = { ...fileVars, ...variables };
          console.log(`Loaded variables from file: ${options.varsFile}`);
        } catch (e) {
          console.error(`Error loading variables from file ${options.varsFile}:`, e.message);
          process.exit(1);
        }
      }
      
      await cloneRecording(recordingPath, url, playbackOptions, variables);
    } catch (error) {
      console.error('Clone playback failed:', error.message);
      process.exit(1);
    }
  });

program.parse();