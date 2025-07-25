const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const app = express();
app.use(express.json());

// Helper function to extract base URL from a full URL
function getBaseUrl(url) {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}`;
  } catch (e) {
    return null;
  }
}

// Helper function to find recording by base URL
async function findRecordingByBaseUrl(targetBaseUrl) {
  const baseDir = path.join(__dirname, '..');
  const recordingsDir = path.join(baseDir, 'recordings');
  
  // Check recordings subdirectory first
  let allFiles = [];
  
  try {
    const recordingFiles = await fs.readdir(recordingsDir);
    const recordingJsonFiles = recordingFiles
      .filter(f => f.endsWith('.json'))
      .map(f => ({ file: f, dir: recordingsDir }));
    allFiles = allFiles.concat(recordingJsonFiles);
  } catch (e) {
    // recordings directory might not exist
  }
  
  // Also check root directory for backward compatibility
  try {
    const rootFiles = await fs.readdir(baseDir);
    const rootJsonFiles = rootFiles
      .filter(f => f.endsWith('.json') && !f.includes('package') && !f.includes('dummy_values') && !f.includes('variables') && !f.includes('temp-vars'))
      .map(f => ({ file: f, dir: baseDir }));
    allFiles = allFiles.concat(rootJsonFiles);
  } catch (e) {
    // Error reading root directory
  }
  
  for (const { file, dir } of allFiles) {
    try {
      const filePath = path.join(dir, file);
      const content = await fs.readFile(filePath, 'utf8');
      const recording = JSON.parse(content);
      
      // Check if it's a valid recording file
      if (!recording.startUrl || !recording.actions) continue;
      
      // Check startUrl
      const recordingBaseUrl = getBaseUrl(recording.startUrl);
      if (recordingBaseUrl === targetBaseUrl) {
        return { filePath, recording };
      }
      
      // Also check navigation actions for base URL match
      const hasMatchingNavigation = recording.actions.some(action => {
        if (action.type === 'navigation' && action.url) {
          return getBaseUrl(action.url) === targetBaseUrl;
        }
        return false;
      });
      
      if (hasMatchingNavigation) {
        return { filePath, recording };
      }
    } catch (e) {
      // Skip invalid JSON files
      continue;
    }
  }
  
  return null;
}

// API endpoint for purchases
app.post('/api/purchases', async (req, res) => {
  try {
    const { 
      productUrl, 
      variables = {}, 
      options = {},
      slowMo = 500 
    } = req.body;
    
    // Validate input
    if (!productUrl) {
      return res.status(400).json({
        success: false,
        error: 'productUrl is required'
      });
    }
    
    // Extract base URL from the product URL
    const targetBaseUrl = getBaseUrl(productUrl);
    if (!targetBaseUrl) {
      return res.status(400).json({
        success: false,
        error: 'Invalid productUrl format'
      });
    }
    
    // Find a recording that matches the base URL
    const recordingMatch = await findRecordingByBaseUrl(targetBaseUrl);
    if (!recordingMatch) {
      return res.status(404).json({
        success: false,
        error: `No recording found for base URL: ${targetBaseUrl}`
      });
    }
    
    // Build the command to execute
    const { filePath } = recordingMatch;
    const scriptPath = path.join(__dirname, '..', 'index.js');
    let command = `node "${scriptPath}" clone "${filePath}" "${productUrl}"`;
    
    // Add variables if provided
    if (Object.keys(variables).length > 0) {
      // Save variables to temporary file
      const tempVarsPath = path.join(__dirname, '..', `temp-vars-${Date.now()}.json`);
      await fs.writeFile(tempVarsPath, JSON.stringify(variables, null, 2));
      command += ` --vars-file "${tempVarsPath}"`;
    }
    
    // Add options
    if (options.headless !== false) {
      command += ' --headless';
    }
    if (options.fast) {
      command += ' --fast';
    }
    if (options.ignoreErrors) {
      command += ' --ignore-errors';
    }
    if (options.noWait) {
      command += ' --no-wait';
    }
    
    // Add slowMo parameter
    command += ` --slow-mo ${slowMo}`;
    
    // Check if dummy_values.json exists and add it
    const dummyValuesPath = path.join(__dirname, '..', 'dummy_values.json');
    if (await fs.access(dummyValuesPath).then(() => true).catch(() => false)) {
      command += ` --dummy-values-file "${dummyValuesPath}"`;
    }
    
    // Execute the clone command
    console.log(`Executing: ${command}`);
    const { stdout, stderr } = await execAsync(command, {
      cwd: path.join(__dirname, '..')
    });
    
    // Clean up temp files
    if (command.includes('temp-vars-')) {
      const tempFile = command.match(/temp-vars-\d+\.json/)[0];
      await fs.unlink(path.join(__dirname, '..', tempFile)).catch(() => {});
    }
    
    // Parse output for success/failure
    const success = !stderr.includes('Error') && !stderr.includes('Failed');
    
    res.json({
      success,
      recordingUsed: path.basename(filePath),
      baseUrl: targetBaseUrl,
      output: stdout + stderr,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Purchase API error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'playwright-recorder-api' });
});

// List available recordings endpoint
app.get('/api/recordings', async (req, res) => {
  try {
    const baseDir = path.join(__dirname, '..');
    const recordingsDir = path.join(baseDir, 'recordings');
    const recordings = [];
    
    // Check recordings subdirectory first
    try {
      const recordingFiles = await fs.readdir(recordingsDir);
      for (const file of recordingFiles.filter(f => f.endsWith('.json'))) {
        try {
          const filePath = path.join(recordingsDir, file);
          const content = await fs.readFile(filePath, 'utf8');
          const recording = JSON.parse(content);
          
          if (recording.startUrl && recording.actions) {
            recordings.push({
              file: `recordings/${file}`,
              startUrl: recording.startUrl,
              baseUrl: getBaseUrl(recording.startUrl),
              actionsCount: recording.actions.length,
              timestamp: recording.timestamp
            });
          }
        } catch (e) {
          // Skip invalid files
        }
      }
    } catch (e) {
      // recordings directory might not exist
    }
    
    // Also check root directory for backward compatibility
    try {
      const rootFiles = await fs.readdir(baseDir);
      const rootJsonFiles = rootFiles.filter(f => 
        f.endsWith('.json') && 
        !f.includes('package') && 
        !f.includes('dummy_values') && 
        !f.includes('variables') && 
        !f.includes('temp-vars')
      );
      
      for (const file of rootJsonFiles) {
        try {
          const filePath = path.join(baseDir, file);
          const content = await fs.readFile(filePath, 'utf8');
          const recording = JSON.parse(content);
          
          if (recording.startUrl && recording.actions) {
            recordings.push({
              file: file,
              startUrl: recording.startUrl,
              baseUrl: getBaseUrl(recording.startUrl),
              actionsCount: recording.actions.length,
              timestamp: recording.timestamp
            });
          }
        } catch (e) {
          // Skip invalid files
        }
      }
    } catch (e) {
      // Error reading root directory
    }
    
    res.json({ recordings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Playwright Recorder API running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Purchases endpoint: POST http://localhost:${PORT}/api/purchases`);
  console.log(`Recordings list: GET http://localhost:${PORT}/api/recordings`);
});

module.exports = app;