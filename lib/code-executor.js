const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);

class CodeExecutor {
  constructor() {
    this.tempDir = path.join(__dirname, '../temp');
    this.ensureTempDir();
  }

  async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.log('Temp directory already exists or error creating:', error.message);
    }
  }

  async executeCode(code, language = 'javascript') {
    try {
      switch (language.toLowerCase()) {
        case 'javascript':
        case 'js':
          return await this.executeJavaScript(code);
        
        case 'python':
        case 'py':
          return await this.executePython(code);
        
        case 'bash':
        case 'shell':
        case 'sh':
          return await this.executeBash(code);
        
        case 'html':
          return await this.executeHTML(code);
        
        case 'css':
          return this.executeCSS(code);
        
        default:
          return {
            success: false,
            output: '',
            error: `Unsupported language: ${language}. Supported: javascript, python, bash, html, css`
          };
      }
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error.message
      };
    }
  }

  async executeJavaScript(code) {
    const filename = `temp_${Date.now()}.js`;
    const filepath = path.join(this.tempDir, filename);
    
    try {
      // Wrap code to capture console output
      const wrappedCode = `
        const originalLog = console.log;
        const outputs = [];
        console.log = (...args) => {
          outputs.push(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' '));
          originalLog(...args);
        };
        
        try {
          ${code}
        } catch (error) {
          console.log('Runtime Error:', error.message);
        }
        
        if (outputs.length === 0) {
          console.log('Code executed successfully (no output)');
        }
      `;
      
      await fs.writeFile(filepath, wrappedCode);
      const { stdout, stderr } = await execPromise(`node "${filepath}"`, { timeout: 10000 });
      
      await fs.unlink(filepath).catch(() => {}); // Clean up
      
      return {
        success: !stderr,
        output: stdout,
        error: stderr
      };
    } catch (error) {
      await fs.unlink(filepath).catch(() => {}); // Clean up
      return {
        success: false,
        output: '',
        error: error.message
      };
    }
  }

  async executePython(code) {
    const filename = `temp_${Date.now()}.py`;
    const filepath = path.join(this.tempDir, filename);
    
    try {
      await fs.writeFile(filepath, code);
      const { stdout, stderr } = await execPromise(`python3 "${filepath}"`, { timeout: 10000 });
      
      await fs.unlink(filepath).catch(() => {}); // Clean up
      
      return {
        success: !stderr,
        output: stdout,
        error: stderr
      };
    } catch (error) {
      await fs.unlink(filepath).catch(() => {}); // Clean up
      
      // If python3 fails, try python
      try {
        await fs.writeFile(filepath, code);
        const { stdout, stderr } = await execPromise(`python "${filepath}"`, { timeout: 10000 });
        await fs.unlink(filepath).catch(() => {});
        
        return {
          success: !stderr,
          output: stdout,
          error: stderr
        };
      } catch (error2) {
        return {
          success: false,
          output: '',
          error: `Python not found. Original error: ${error.message}`
        };
      }
    }
  }

  async executeBash(code) {
    try {
      // Security: restrict dangerous commands
      const dangerousCommands = ['rm -rf', 'sudo', 'passwd', 'chmod 777', 'mkfs', 'dd if='];
      const lowerCode = code.toLowerCase();
      
      for (const dangerous of dangerousCommands) {
        if (lowerCode.includes(dangerous)) {
          return {
            success: false,
            output: '',
            error: `Dangerous command detected: ${dangerous}. Execution blocked for security.`
          };
        }
      }
      
      const { stdout, stderr } = await execPromise(code, { 
        timeout: 10000,
        cwd: this.tempDir // Run in temp directory for safety
      });
      
      return {
        success: !stderr,
        output: stdout,
        error: stderr
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error.message
      };
    }
  }

  async executeHTML(code) {
    const filename = `temp_${Date.now()}.html`;
    const filepath = path.join(this.tempDir, filename);
    
    try {
      await fs.writeFile(filepath, code);
      
      // For HTML, we'll return the file path so it can be opened in browser
      return {
        success: true,
        output: `HTML file created successfully. File saved as: ${filename}`,
        error: '',
        filePath: filepath,
        htmlContent: code
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error.message
      };
    }
  }

  executeCSS(code) {
    // For CSS, we'll just validate and return the formatted code
    try {
      // Basic CSS validation - check for balanced braces
      const openBraces = (code.match(/{/g) || []).length;
      const closeBraces = (code.match(/}/g) || []).length;
      
      if (openBraces !== closeBraces) {
        return {
          success: false,
          output: '',
          error: 'CSS syntax error: Unbalanced braces'
        };
      }
      
      return {
        success: true,
        output: 'CSS validated successfully',
        error: '',
        cssContent: code
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error.message
      };
    }
  }

  detectLanguage(code) {
    // Simple language detection based on code patterns
    if (code.includes('def ') || code.includes('import ') || code.includes('print(')) {
      return 'python';
    }
    if (code.includes('function ') || code.includes('console.log') || code.includes('const ') || code.includes('let ')) {
      return 'javascript';
    }
    if (code.includes('<!DOCTYPE') || code.includes('<html') || code.includes('<div')) {
      return 'html';
    }
    if (code.includes('{') && code.includes('}') && (code.includes(':') || code.includes('color') || code.includes('margin'))) {
      return 'css';
    }
    if (code.includes('echo ') || code.includes('ls ') || code.includes('cd ') || code.includes('#!/bin/bash')) {
      return 'bash';
    }
    
    // Default to javascript
    return 'javascript';
  }
}

module.exports = CodeExecutor;