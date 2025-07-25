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
  .option('-o, --output <path>', 'Output file path', './recordings/recording.json')
  .option('--enhanced', 'Use enhanced recorder with detailed element tracking', false)
  .action(async (url, options) => {
    try {
      if (options.enhanced) {
        const { recordActions } = require('./src/recorder-enhanced');
        console.log('Using enhanced recorder with detailed tracking...');
        await recordActions(url, options.output);
      } else {
        const { recordActions } = require('./src/recorder');
        await recordActions(url, options.output);
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
  .argument('<recording>', 'Path to the recording file')
  .option('--headless', 'Run in headless mode', false)
  .option('--slow-mo <ms>', 'Slow down execution by specified milliseconds', '500')
  .option('--no-wait', 'Do not wait for actions to complete', false)
  .option('--ignore-errors', 'Continue playback on errors', false)
  .option('--keep-open', 'Keep browser open after playback', false)
  .option('--timeout <ms>', 'Timeout for selectors in milliseconds (for progressive forms)', '15000')
  .option('--fast', 'Fast mode: trust recording navigation, use coordinates and active field typing', false)
  .option('--vars <json>', 'JSON string with variables (e.g. \'{"zip_code":"12345"}\')') 
  .option('--vars-file <path>', 'Path to JSON file containing variables')
  .option('--dummy-values-file <path>', 'Path to JSON file with dummy values that should be replaced with variables')
  .action(async (recordingPath, options) => {
    try {
      const playbackOptions = {
        headless: options.headless,
        slowMo: parseInt(options.slowMo, 10),
        waitForActions: options.wait,
        ignoreErrors: options.ignoreErrors,
        keepOpen: options.keepOpen,
        selectorTimeout: parseInt(options.timeout, 10),
        fastMode: options.fast,
        dummyValuesFile: options.dummyValuesFile
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
      
      await playRecording(recordingPath, playbackOptions, variables);
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
  .argument('<recording>', 'Path to the recording file')
  .argument('<url>', 'New URL to start the playback from')
  .option('--headless', 'Run in headless mode', false)
  .option('--slow-mo <ms>', 'Slow down execution by specified milliseconds', '500')
  .option('--no-wait', 'Do not wait for actions to complete', false)
  .option('--ignore-errors', 'Continue playback on errors', false)
  .option('--keep-open', 'Keep browser open after playback', false)
  .option('--timeout <ms>', 'Timeout for selectors in milliseconds (for progressive forms)', '15000')
  .option('--fast', 'Fast mode: trust recording navigation, use coordinates and active field typing', false)
  .option('--vars <json>', 'JSON string with variables (e.g. \'{"zip_code":"12345"}\')') 
  .option('--vars-file <path>', 'Path to JSON file containing variables')
  .option('--dummy-values-file <path>', 'Path to JSON file with dummy values that should be replaced with variables')
  .action(async (recordingPath, url, options) => {
    try {
      const playbackOptions = {
        headless: options.headless,
        slowMo: parseInt(options.slowMo, 10),
        waitForActions: options.wait,
        ignoreErrors: options.ignoreErrors,
        keepOpen: options.keepOpen,
        selectorTimeout: parseInt(options.timeout, 10),
        fastMode: options.fast,
        dummyValuesFile: options.dummyValuesFile
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