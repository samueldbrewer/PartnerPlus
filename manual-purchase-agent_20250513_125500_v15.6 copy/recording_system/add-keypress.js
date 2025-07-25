#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function showUsage() {
  console.log('Manual Keypress Injection Tool');
  console.log('================================');
  console.log('');
  console.log('Usage: node add-keypress.js <recording-file> [options]');
  console.log('');
  console.log('Options:');
  console.log('  --after <action-number>    Insert after this action number');
  console.log('  --key <key>               Key to add (e.g., "I", "L", "Tab")');
  console.log('  --list                    List all actions in the recording');
  console.log('  --interactive             Interactive mode');
  console.log('');
  console.log('Examples:');
  console.log('  node add-keypress.js recordings/partstown.json --list');
  console.log('  node add-keypress.js recordings/partstown.json --after 150 --key I');
  console.log('  node add-keypress.js recordings/partstown.json --interactive');
}

function listActions(recording) {
  console.log(`\nListing actions in recording (${recording.actions.length} total):\n`);
  
  recording.actions.forEach((action, index) => {
    const actionNum = index + 1;
    let description = `[${actionNum}] ${action.type}`;
    
    if (action.type === 'keypress') {
      description += ` - Key: "${action.key}"`;
    } else if (action.type === 'input') {
      description += ` - "${action.value}" in ${action.selector}`;
    } else if (action.type === 'click') {
      description += ` - ${action.selector} (${action.x}, ${action.y})`;
    } else if (action.type === 'navigation') {
      description += ` - ${action.url}`;
    }
    
    console.log(description);
  });
}

function addKeypress(recording, afterAction, key) {
  if (afterAction < 1 || afterAction > recording.actions.length) {
    console.error(`Error: Action number must be between 1 and ${recording.actions.length}`);
    return null;
  }
  
  const insertIndex = afterAction; // afterAction is 1-based, insertIndex is 0-based for insertion
  const baseTimestamp = recording.actions[afterAction - 1].timestamp;
  
  const newKeypress = {
    type: 'keypress',
    timestamp: baseTimestamp + 100, // 100ms after the previous action
    key: key
  };
  
  // Insert the new keypress
  recording.actions.splice(insertIndex, 0, newKeypress);
  
  console.log(`✅ Added keypress "${key}" after action ${afterAction}`);
  return recording;
}

async function interactiveMode(recordingFile) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  function question(prompt) {
    return new Promise(resolve => rl.question(prompt, resolve));
  }
  
  try {
    const recording = JSON.parse(fs.readFileSync(recordingFile, 'utf8'));
    
    console.log('\n🎬 Interactive Keypress Injection Mode');
    console.log('=====================================\n');
    
    while (true) {
      console.log('Commands:');
      console.log('  list - Show all actions');
      console.log('  add - Add a keypress');
      console.log('  save - Save and exit');
      console.log('  quit - Exit without saving');
      console.log('');
      
      const command = await question('Command: ');
      
      if (command === 'list') {
        listActions(recording);
      } else if (command === 'add') {
        const afterAction = parseInt(await question('Insert after action number: '));
        const key = await question('Key to add: ');
        
        if (isNaN(afterAction)) {
          console.log('❌ Please enter a valid action number');
          continue;
        }
        
        if (!key) {
          console.log('❌ Please enter a key');
          continue;
        }
        
        const result = addKeypress(recording, afterAction, key);
        if (result) {
          console.log(`📝 Recording now has ${recording.actions.length} actions`);
        }
      } else if (command === 'save') {
        fs.writeFileSync(recordingFile, JSON.stringify(recording, null, 2));
        console.log(`💾 Saved ${recordingFile}`);
        break;
      } else if (command === 'quit') {
        console.log('👋 Exiting without saving');
        break;
      } else {
        console.log('❌ Unknown command');
      }
      
      console.log('');
    }
  } finally {
    rl.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    showUsage();
    return;
  }
  
  const recordingFile = args[0];
  
  if (!fs.existsSync(recordingFile)) {
    console.error(`Error: Recording file ${recordingFile} not found`);
    return;
  }
  
  try {
    const recording = JSON.parse(fs.readFileSync(recordingFile, 'utf8'));
    
    if (args.includes('--list')) {
      listActions(recording);
      return;
    }
    
    if (args.includes('--interactive')) {
      await interactiveMode(recordingFile);
      return;
    }
    
    const afterIndex = args.indexOf('--after');
    const keyIndex = args.indexOf('--key');
    
    if (afterIndex === -1 || keyIndex === -1) {
      console.error('Error: Both --after and --key are required for non-interactive mode');
      showUsage();
      return;
    }
    
    const afterAction = parseInt(args[afterIndex + 1]);
    const key = args[keyIndex + 1];
    
    if (isNaN(afterAction)) {
      console.error('Error: --after must be followed by a number');
      return;
    }
    
    if (!key) {
      console.error('Error: --key must be followed by a key name');
      return;
    }
    
    const result = addKeypress(recording, afterAction, key);
    if (result) {
      fs.writeFileSync(recordingFile, JSON.stringify(recording, null, 2));
      console.log(`💾 Saved ${recordingFile}`);
    }
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
}

main().catch(console.error);