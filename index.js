require('dotenv').config();
const express = require('express');
const path = require('path');
const Agent = require('./lib/agent');
const OrchestratorAgent = require('./lib/orchestrator-agent');
const OpenAI = require('openai');
const EmailService = require('./lib/email-service');
const SMSService = require('./lib/sms-service');
const CodeExecutor = require('./lib/code-executor');
const PurchaseAgentService = require('./lib/purchase-agent-service');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();
const PORT = process.env.PORT || 3000;

// Kill any process using the port before starting
async function killExistingProcess(port) {
  try {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      // Find process using the port
      const { stdout } = await execPromise(`lsof -ti:${port}`);
      if (stdout.trim()) {
        const pids = stdout.trim().split('\n');
        for (const pid of pids) {
          console.log(`Killing process ${pid} on port ${port}`);
          await execPromise(`kill -9 ${pid}`);
        }
        // Wait a bit for processes to fully terminate
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } else if (process.platform === 'win32') {
      // Windows command to find and kill process
      try {
        await execPromise(`netstat -ano | findstr :${port}`);
        await execPromise(`for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port}') do taskkill /PID %a /F`);
      } catch (err) {
        // No process found, which is fine
      }
    }
  } catch (error) {
    // No process found on port, which is what we want
    console.log(`Port ${port} is available`);
  }
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Create agent instance
const agent = new Agent();

// Create OpenAI client for AI agent chat
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Create orchestrator agent instance
const orchestratorAgent = new OrchestratorAgent();

// Create code executor instance
const codeExecutor = new CodeExecutor();

// Create purchase agent service instance
const purchaseAgent = new PurchaseAgentService();

// Create email service instance
let emailService = null;

// Create SMS service instance
let smsService = null;
// Helper function to clean environment variables from Railway
function cleanEnvVar(value) {
  if (!value) return value;
  return value.replace(/^["']|["']$/g, '');
}

console.log('Environment check - EMAIL_USER:', cleanEnvVar(process.env.EMAIL_USER));
console.log('Environment check - EMAIL_PASS:', process.env.EMAIL_PASS ? `***${process.env.EMAIL_PASS.slice(-4)}` : 'NOT SET');
console.log('Password length:', process.env.EMAIL_PASS ? process.env.EMAIL_PASS.length : 0);

const emailUser = cleanEnvVar(process.env.EMAIL_USER);
const emailPass = cleanEnvVar(process.env.EMAIL_PASS);

if (emailUser && emailPass) {
  console.log('Initializing email service for:', emailUser);
  emailService = new EmailService({
    smtp: {
      host: cleanEnvVar(process.env.SMTP_HOST) || 'smtp.gmail.com',
      port: parseInt(cleanEnvVar(process.env.SMTP_PORT)) || 587,
      secure: false,
      user: emailUser,
      pass: emailPass,
      from: cleanEnvVar(process.env.EMAIL_FROM) || emailUser
    },
    imap: {
      host: cleanEnvVar(process.env.IMAP_HOST) || 'imap.gmail.com',
      port: parseInt(cleanEnvVar(process.env.IMAP_PORT)) || 993,
      tls: true,
      user: emailUser,
      pass: emailPass
    }
  });
  
  emailService.initialize().catch(err => {
    console.error('Failed to initialize email service:', err);
    console.error('Make sure you are using a Gmail App Password, not your regular password');
    console.error('Generate one at: https://myaccount.google.com/apppasswords');
    console.error('Email service will be disabled until authentication is fixed');
    emailService = null; // Disable service on error
  });
} else {
  console.log('Email service not configured. Missing EMAIL_USER or EMAIL_PASS');
}

// Initialize SMS service if credentials are provided
const twilioSid = cleanEnvVar(process.env.TWILIO_ACCOUNT_SID);
const twilioToken = cleanEnvVar(process.env.TWILIO_AUTH_TOKEN);
const twilioPhone = cleanEnvVar(process.env.TWILIO_PHONE_NUMBER);

console.log('Environment check - TWILIO_ACCOUNT_SID:', twilioSid ? `***${twilioSid.slice(-4)}` : 'NOT SET');
console.log('Environment check - TWILIO_AUTH_TOKEN:', twilioToken ? `***${twilioToken.slice(-4)}` : 'NOT SET');
console.log('Environment check - TWILIO_PHONE_NUMBER:', twilioPhone || 'NOT SET');

if (twilioSid && twilioToken && twilioPhone) {
  console.log('Initializing SMS service');
  smsService = new SMSService({
    accountSid: twilioSid,
    authToken: twilioToken,
    phoneNumber: twilioPhone
  });
  
  smsService.initialize().catch(err => {
    console.error('Failed to initialize SMS service:', err);
    console.error('Make sure your Twilio credentials are correct');
    console.error('SMS service will be disabled until authentication is fixed');
    smsService = null; // Disable service on error
  });
} else {
  console.log('SMS service not configured. Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER');
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    services: {
      email: emailService ? 'active' : 'disabled',
      sms: smsService ? 'active' : 'disabled',
      codeExecutor: 'active'
    }
  });
});

// Helper function to generate navigation HTML with dropdown
function generateNavigation(currentPage) {
  return `
    <div class="header">
      <div class="header-inner">
        <div class="nav">
          <h1>PartnerPlus</h1>
          <div class="dropdown">
            <a href="#" class="dropdown-toggle ${['wo-agent', 'ai-agent', 'ai-agent-v1', 'ai-agent-raw'].includes(currentPage) ? 'active' : ''}">Agents ▼</a>
            <div class="dropdown-menu">
              <a href="/">WO Agent</a>
              <a href="/wo-agent-mobile">📱 WO Mobile</a>
              <a href="/ai-agent">AI Agent v2</a>
              <a href="/ai-agent-mobile">📱 AI Mobile</a>
              <a href="/ai-agent-raw">Raw Output</a>
              <a href="/ai-agent-v1">v1 Backup</a>
            </div>
          </div>
          <div class="dropdown">
            <a href="#" class="dropdown-toggle ${['ai-chat', 'PartnerPlus', 'email', 'sms', 'executor', 'purchase-agent', 'search-tools', 'api-docs'].includes(currentPage) ? 'active' : ''}">Tools ▼</a>
            <div class="dropdown-menu">
              <a href="/ai-chat">AI Chat</a>
              <a href="/PartnerPlus">PartnerPlus AI</a>
              <a href="/email">Email Service</a>
              <a href="/sms">SMS Service</a>
              <a href="/executor">Code Executor</a>
              <a href="/purchase-agent">Purchase Agent</a>
              <div style="border-top: 1px solid #ddd; margin: 5px 0;"></div>
              <a href="/search-tools">Search Tools</a>
              <a href="/api-docs">API Documentation</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Common dropdown styles
const dropdownStyles = `
  .dropdown { position: relative; display: inline-block; }
  .dropdown-toggle { cursor: pointer; }
  .dropdown-menu { display: none; position: absolute; background-color: white; min-width: 160px; box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2); z-index: 1; border-radius: 4px; top: 100%; margin-top: 5px; }
  .dropdown-menu a { color: #333 !important; padding: 12px 16px; text-decoration: none; display: block; margin: 0; border-radius: 0; }
  .dropdown-menu a:hover { background-color: #f1f1f1; }
  .dropdown:hover .dropdown-menu { display: block; }
  .dropdown:hover .dropdown-toggle { background-color: rgba(255,255,255,0.2); }
`;

// Routes
app.get('/ai-chat', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>AI Chat - PartnerPlus</title>
      <link rel="icon" type="image/svg+xml" href="/favicon.svg">
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
        .header { background-color: #1976d2; color: white; padding: 15px 0; margin-bottom: 20px; width: 100%; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header-inner { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
        .nav { display: flex; align-items: center; }
        .nav h1 { margin: 0; margin-right: 30px; font-size: 24px; color: white; }
        .nav a { color: white; text-decoration: none; padding: 8px 16px; margin-right: 10px; border-radius: 4px; transition: background-color 0.3s; }
        .nav a:hover { background-color: rgba(255,255,255,0.1); }
        .nav a.active { background-color: rgba(255,255,255,0.2); }
        .content { max-width: 1200px; margin: 0 auto; padding: 0 20px 60px 20px; }
        .chat-container { border: 1px solid #ccc; border-radius: 10px; padding: 20px; height: 400px; overflow-y: auto; margin-bottom: 20px; }
        .message { margin: 10px 0; padding: 10px; border-radius: 5px; }
        .user { background-color: #e3f2fd; text-align: right; }
        .assistant { background-color: #f5f5f5; }
        .input-container { display: flex; gap: 10px; }
        #messageInput { flex: 1; padding: 10px; border: 1px solid #ccc; border-radius: 5px; }
        button { padding: 10px 20px; background-color: #1976d2; color: white; border: none; border-radius: 5px; cursor: pointer; }
        button:hover { background-color: #1565c0; }
        button:disabled { background-color: #ccc; cursor: not-allowed; }
        .cursor { animation: blink 1s infinite; color: #1976d2; }
        @keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
        ${dropdownStyles}
      </style>
    </head>
    <body>
      ${generateNavigation('ai-chat')}
      <div class="content">
        <h2>AI Chat</h2>
        <p>Chat with an AI assistant with web search capabilities and streaming responses!</p>
      <div id="chatContainer" class="chat-container"></div>
      <div class="input-container">
        <input type="text" id="messageInput" placeholder="Type your message..." />
        <button id="sendButton" onclick="sendMessage()">Send</button>
        <button onclick="clearChat()">Clear</button>
      </div>
      
      <script>
        async function sendMessage() {
          const input = document.getElementById('messageInput');
          const message = input.value.trim();
          if (!message) return;
          
          const chatContainer = document.getElementById('chatContainer');
          const sendButton = document.getElementById('sendButton');
          
          // Add user message to chat
          chatContainer.innerHTML += '<div class="message user">' + message + '</div>';
          input.value = '';
          sendButton.disabled = true;
          sendButton.textContent = 'Thinking...';
          
          // Add assistant message container for streaming
          const assistantDiv = document.createElement('div');
          assistantDiv.className = 'message assistant';
          assistantDiv.innerHTML = '<span class="cursor">▋</span>';
          chatContainer.appendChild(assistantDiv);
          chatContainer.scrollTop = chatContainer.scrollTop;
          
          try {
            const response = await fetch('/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message, stream: true })
            });
            
            if (!response.ok) {
              throw new Error('Network response was not ok');
            }
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              const chunk = decoder.decode(value);
              const lines = chunk.split('\\n');
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    
                    switch (data.type) {
                      case 'text_delta':
                        fullText = data.fullText || fullText;
                        assistantDiv.innerHTML = fullText.replace(/\\n/g, '<br>') + '<span class="cursor">▋</span>';
                        chatContainer.scrollTop = chatContainer.scrollHeight;
                        break;
                        
                      case 'web_search_started':
                      case 'web_search_progress':
                      case 'web_search_completed':
                        assistantDiv.innerHTML = (fullText || '') + '<br><em>' + data.content + '</em><span class="cursor">▋</span>';
                        chatContainer.scrollTop = chatContainer.scrollHeight;
                        break;
                        
                      case 'response_complete':
                      case 'done':
                        fullText = data.content || fullText;
                        assistantDiv.innerHTML = fullText.replace(/\\n/g, '<br>');
                        break;
                        
                      case 'error':
                        assistantDiv.innerHTML = 'Error: ' + data.content;
                        break;
                    }
                  } catch (e) {
                    // Ignore JSON parse errors for incomplete chunks
                  }
                }
              }
            }
            
          } catch (error) {
            assistantDiv.innerHTML = 'Error: ' + error.message;
          } finally {
            sendButton.disabled = false;
            sendButton.textContent = 'Send';
          }
        }
        
        async function clearChat() {
          document.getElementById('chatContainer').innerHTML = '';
          await fetch('/api/chat/clear', { method: 'POST' });
        }
        
        // Allow sending message with Enter key
        document.getElementById('messageInput').addEventListener('keypress', function(e) {
          if (e.key === 'Enter' && !document.getElementById('sendButton').disabled) {
            sendMessage();
          }
        });
      </script>
    </body>
    </html>
  `);
});

// WO Agent Mobile - Mobile-optimized version
app.get('/wo-agent-mobile', (req, res) => {
  res.sendFile(path.join(__dirname, 'wo-agent-mobile.html'));
});

// WO Agent - New main landing page
app.get('/', (req, res) => {
  // Check if mobile user agent
  const userAgent = req.headers['user-agent'] || '';
  const isMobile = /Mobile|Android|iPhone|iPad|BlackBerry|IEMobile/i.test(userAgent);
  
  // Redirect mobile users to mobile version unless they explicitly request desktop
  if (isMobile && !req.query.desktop) {
    return res.redirect('/wo-agent-mobile?auto=true');
  }
  
  // For now, redirect to mobile version for all users until we fix the desktop template
  res.redirect('/wo-agent-mobile');
});

// Agent Hub route - NEW V2 Visual Workflow AI Agent (Full Version)
// Agent Hub route - NEW V2 Visual Workflow AI Agent (Full Version)
app.get('/ai-agent', (req, res) => {
  const fs = require('fs');
  
  try {
    const htmlContent = fs.readFileSync(path.join(__dirname, 'ai-agent-v2-full.html'), 'utf8');
    res.send(htmlContent);
  } catch (error) {
    console.error('Error reading v2 HTML file:', error);
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>AI Agent v2 - Error</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg">
      </head>
      <body>
        ${generateNavigation('ai-agent')}
        <div style="max-width: 1200px; margin: 0 auto; padding: 20px;">
          <h1>AI Agent v2 - Loading Error</h1>
          <p>Could not load the full v2 interface. <a href="/ai-agent-v1">Please use v1 Backup</a></p>
        </div>
      </body>
      </html>
    `);
  }
});

// Add route for v1 backup
app.get('/ai-agent-v1', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>AI Agent v1 (Backup) - PartnerPlus</title>
      <link rel="icon" type="image/svg+xml" href="/favicon.svg">
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f8f9fa; }
        .header { background-color: #1976d2; color: white; padding: 15px 0; margin-bottom: 20px; width: 100%; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header-inner { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
        .nav { display: flex; align-items: center; }
        .nav h1 { margin: 0; margin-right: 30px; font-size: 24px; color: white; }
        .nav a { color: white; text-decoration: none; padding: 8px 16px; margin-right: 10px; border-radius: 4px; transition: background-color 0.3s; }
        .nav a:hover { background-color: rgba(255,255,255,0.1); }
        .nav a.active { background-color: rgba(255,255,255,0.2); }
        .dropdown { position: relative; display: inline-block; }
        .dropdown-toggle { cursor: pointer; }
        .dropdown-menu { display: none; position: absolute; background-color: white; min-width: 160px; box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2); z-index: 1; border-radius: 4px; top: 100%; left: 0; }
        .dropdown-menu a { color: #333; padding: 12px 16px; text-decoration: none; display: block; margin: 0; border-radius: 0; }
        .dropdown-menu a:hover { background-color: #f1f1f1; color: #333; }
        .dropdown:hover .dropdown-menu { display: block; }
        .dropdown:hover .dropdown-toggle { background-color: rgba(255,255,255,0.1); }
        .content { max-width: 1200px; margin: 0 auto; padding: 0 20px 60px 20px; }
        .backup-notice { background: #fff3cd; color: #856404; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #ffeaa7; }
      </style>
    </head>
    <body>
      ${generateNavigation('ai-agent-v1')}
      <div class="content">
        <div class="backup-notice">
          <h3>⚠️ This is the backup of the original chat-based interface</h3>
          <p>This version has been preserved for reference. The active development is happening on the <a href="/ai-agent">new v2 visual workflow interface</a>.</p>
          <p>The v1 interface provided a traditional chat experience where workflows were executed automatically. The new v2 interface provides step-by-step visual execution with user control.</p>
        </div>
        <p><strong>Functionality:</strong> This backup page is read-only and demonstrates the previous interface design. For active workflow execution, please use <a href="/ai-agent">AI Agent v2</a>.</p>
      </div>
    </body>
    </html>
  `);
});

// Add route for mobile AI Agent page
app.get('/ai-agent-mobile', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>AI Agent Mobile - PartnerPlus</title>
      <link rel="icon" type="image/svg+xml" href="/favicon.svg">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
      <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
      <style>
        * { box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
          margin: 0; 
          padding: 0; 
          background: #f8f9fa;
          height: 100vh;
          overflow: hidden;
        }
        
        /* Minimized Header */
        .header { 
          background: #1976d2; 
          color: white; 
          padding: 10px 15px; 
          display: flex;
          align-items: center;
          justify-content: space-between;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          min-height: 50px;
        }
        
        .header h1 { 
          margin: 0; 
          font-size: 18px; 
          font-weight: 500;
        }
        
        .header-actions {
          display: flex;
          gap: 10px;
        }
        
        .examples-btn {
          background: rgba(255,255,255,0.2);
          border: none;
          color: white;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          transition: background 0.3s;
        }
        
        .examples-btn:hover {
          background: rgba(255,255,255,0.3);
        }
        
        /* Chat Container */
        .chat-container {
          height: calc(100vh - 50px);
          display: flex;
          flex-direction: column;
        }
        
        /* Messages Area */
        .messages-area {
          flex: 1;
          overflow-y: auto;
          padding: 15px;
          background: #f8f9fa;
        }
        
        .message {
          margin-bottom: 15px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }
        
        .message.user {
          flex-direction: row-reverse;
        }
        
        .message-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          flex-shrink: 0;
        }
        
        .message.user .message-avatar {
          background: #1976d2;
          color: white;
        }
        
        .message.assistant .message-avatar {
          background: #4caf50;
          color: white;
        }
        
        .message-content {
          max-width: 85%;
          padding: 12px 16px;
          border-radius: 18px;
          font-size: 15px;
          line-height: 1.4;
        }
        
        .message.user .message-content {
          background: #1976d2;
          color: white;
          border-bottom-right-radius: 6px;
        }
        
        .message.assistant .message-content {
          background: white;
          color: #333;
          border: 1px solid #e0e0e0;
          border-bottom-left-radius: 6px;
        }
        
        /* Simplified workflow - no complex step visualization needed */
        
        /* Input Area */
        .input-area {
          padding: 15px;
          background: white;
          border-top: 1px solid #e0e0e0;
        }
        
        .input-container {
          display: flex;
          gap: 10px;
          align-items: flex-end;
        }
        
        .message-input {
          flex: 1;
          min-height: 40px;
          max-height: 120px;
          padding: 10px 15px;
          border: 1px solid #e0e0e0;
          border-radius: 20px;
          font-size: 15px;
          resize: none;
          background: #f8f9fa;
          outline: none;
        }
        
        .message-input:focus {
          border-color: #1976d2;
          background: white;
        }
        
        .send-btn {
          width: 40px;
          height: 40px;
          border: none;
          background: #1976d2;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.3s;
          flex-shrink: 0;
        }
        
        .send-btn:hover:not(:disabled) {
          background: #1565c0;
          transform: scale(1.05);
        }
        
        .send-btn:disabled {
          background: #ccc;
          cursor: not-allowed;
          transform: none;
        }
        
        /* Modal */
        .modal {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.5);
          z-index: 1000;
        }
        
        .modal.show {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .modal-content {
          background: white;
          border-radius: 12px;
          margin: 20px;
          max-width: 90vw;
          max-height: 80vh;
          overflow-y: auto;
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        
        .modal-header {
          padding: 20px 20px 0 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        
        .modal-title {
          font-size: 18px;
          font-weight: 600;
          color: #1976d2;
          margin: 0;
        }
        
        .close-btn {
          background: none;
          border: none;
          font-size: 24px;
          color: #666;
          cursor: pointer;
          padding: 5px;
        }
        
        .modal-body {
          padding: 20px;
        }
        
        .example-item {
          background: #f8f9fa;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 12px;
          cursor: pointer;
          transition: all 0.3s;
        }
        
        .example-item:hover {
          background: #e3f2fd;
          border-color: #1976d2;
          transform: translateY(-1px);
        }
        
        .example-item:active {
          transform: translateY(0);
        }
        
        .example-title {
          font-weight: 600;
          color: #1976d2;
          margin-bottom: 5px;
          font-size: 14px;
        }
        
        .example-text {
          color: #333;
          font-size: 14px;
          line-height: 1.4;
        }
        
        /* Loading Animation */
        .typing-indicator {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 12px 16px;
        }
        
        .typing-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #999;
          animation: typing 1.4s infinite ease-in-out;
        }
        
        .typing-dot:nth-child(1) { animation-delay: -0.32s; }
        .typing-dot:nth-child(2) { animation-delay: -0.16s; }
        
        @keyframes typing {
          0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }
        
        /* Utility Classes */
        .hidden { display: none !important; }
        
        /* Continue button removed - using text confirmation now */
      </style>
    </head>
    <body>
      <!-- Header -->
      <div class="header">
        <h1>🤖 AI Agent</h1>
        <div class="header-actions">
          <button class="examples-btn" onclick="showExamples()">💡 Examples</button>
        </div>
      </div>
      
      <!-- Chat Container -->
      <div class="chat-container">
        <!-- Messages Area -->
        <div class="messages-area" id="messagesArea">
          <div class="message assistant">
            <div class="message-avatar">🤖</div>
            <div class="message-content">
              Hi! I'm your AI workflow assistant. I can help you automate tasks like finding parts, contacting suppliers, sending emails, and more. What would you like me to help you with today?
            </div>
          </div>
        </div>
        
        <!-- Input Area -->
        <div class="input-area">
          <div class="input-container">
            <textarea 
              id="messageInput" 
              class="message-input" 
              placeholder="Describe what you'd like me to do..."
              rows="1"
            ></textarea>
            <button id="sendBtn" class="send-btn" onclick="sendMessage()">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      <!-- Examples Modal -->
      <div class="modal" id="examplesModal">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">💡 Example Workflows</h3>
            <button class="close-btn" onclick="hideExamples()">&times;</button>
          </div>
          <div class="modal-body">
            <div class="example-item" onclick="selectExample('Find the part number for Henny Penny 500 lid seal and email it to samueldbrewer@gmail.com')">
              <div class="example-title">🔧➡️📧 Parts Resolution</div>
              <div class="example-text">Find the part number for Henny Penny 500 lid seal and email it to samueldbrewer@gmail.com</div>
            </div>
            
            <div class="example-item" onclick="selectExample('Look up suppliers for Henny Penny part 77575, then text the best pricing to 5024456053')">
              <div class="example-title">🏪➡️💬 Supplier Search</div>
              <div class="example-text">Look up suppliers for Henny Penny part 77575, then text the best pricing to 5024456053</div>
            </div>
            
            <div class="example-item" onclick="selectExample('Resolve what part we need for a broken Vulcan oven door, find 3 suppliers with pricing, and email the comparison to samueldbrewer@gmail.com')">
              <div class="example-title">🔧➡️🏪➡️📧 Complete Parts Chain</div>
              <div class="example-text">Resolve what part we need for a broken Vulcan oven door, find 3 suppliers with pricing, and email the comparison to samueldbrewer@gmail.com</div>
            </div>
            
            <div class="example-item" onclick="selectExample('Check my email for any urgent messages, then find repair services near Louisville, KY for any equipment mentioned')">
              <div class="example-title">📧➡️🔍 Inbox + Research</div>
              <div class="example-text">Check my email for any urgent messages, then find repair services near Louisville, KY for any equipment mentioned</div>
            </div>
            
            <div class="example-item" onclick="selectExample('Search for True refrigeration repair manual, then text key troubleshooting steps to 5024456053')">
              <div class="example-title">📋➡️💬 Manual Lookup</div>
              <div class="example-text">Search for True refrigeration repair manual, then text key troubleshooting steps to 5024456053</div>
            </div>
            
            <div class="example-item" onclick="selectExample('Find contact info for Hobart service center near Louisville, then email their details to samueldbrewer@gmail.com')">
              <div class="example-title">🔍➡️📧 Service Center Lookup</div>
              <div class="example-text">Find contact info for Hobart service center near Louisville, then email their details to samueldbrewer@gmail.com</div>
            </div>
          </div>
        </div>
      </div>
      
      <script>
        let currentWorkflow = null;
        let currentStep = 0;
        let isProcessing = false;
        let pendingStep = null;
        let stepResults = [];
        
        // Auto-resize textarea
        const messageInput = document.getElementById('messageInput');
        messageInput.addEventListener('input', function() {
          this.style.height = 'auto';
          this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });
        
        // Send message on Enter (but allow Shift+Enter for new lines)
        messageInput.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
          }
        });
        
        // Examples modal functions
        function showExamples() {
          document.getElementById('examplesModal').classList.add('show');
        }
        
        function hideExamples() {
          document.getElementById('examplesModal').classList.remove('show');
        }
        
        function selectExample(text) {
          document.getElementById('messageInput').value = text;
          hideExamples();
          messageInput.style.height = 'auto';
          messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
          messageInput.focus();
        }
        
        // Close modal when clicking outside
        document.getElementById('examplesModal').addEventListener('click', function(e) {
          if (e.target === this) {
            hideExamples();
          }
        });
        
        async function sendMessage() {
          const input = document.getElementById('messageInput');
          const message = input.value.trim();
          
          if (!message || isProcessing) return;
          
          isProcessing = true;
          input.value = '';
          input.style.height = 'auto';
          document.getElementById('sendBtn').disabled = true;
          
          // Add user message
          addMessage('user', message);
          
          // Check if user is confirming a step
          if (pendingStep && (message.toLowerCase().includes('yes') || message.toLowerCase().includes('ok') || message.toLowerCase().includes('proceed') || message.toLowerCase() === 'y')) {
            executeConfirmedStep();
            return;
          }
          
          // Check if user is declining a step
          if (pendingStep && (message.toLowerCase().includes('no') || message.toLowerCase().includes('skip') || message.toLowerCase() === 'n')) {
            addMessage('assistant', 'Step skipped. What would you like me to help with next?');
            resetWorkflow();
            return;
          }
          
          // Show typing indicator
          const typingId = addTypingIndicator();
          
          try {
            // Generate workflow plan
            const response = await fetch('/api/orchestrator/objective', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ objective: message })
            });
            
            const data = await response.json();
            currentWorkflow = data.actionPlan;
            currentStep = 0;
            pendingStep = null;
            
            // Remove typing indicator
            removeMessage(typingId);
            
            if (currentWorkflow.action === 'error' || currentWorkflow.action === 'clarification_needed') {
              addMessage('assistant', currentWorkflow.reasoning || 'I need more information to help you with that request.');
            } else {
              // Show plan and ask for confirmation
              showPlanAndConfirm(currentWorkflow);
            }
            
          } catch (error) {
            removeMessage(typingId);
            addMessage('assistant', 'Sorry, I encountered an error processing your request. Please try again.');
          } finally {
            isProcessing = false;
            document.getElementById('sendBtn').disabled = false;
            input.focus();
          }
        }
        
        function addMessage(type, content) {
          const messagesArea = document.getElementById('messagesArea');
          const messageId = 'msg-' + Date.now();
          
          const messageDiv = document.createElement('div');
          messageDiv.className = 'message ' + type;
          messageDiv.id = messageId;
          
          const avatar = type === 'user' ? '👤' : '🤖';
          
          messageDiv.innerHTML = 
            '<div class="message-avatar">' + avatar + '</div>' +
            '<div class="message-content">' + content.replace(/\n/g, '<br>') + '</div>';
          
          messagesArea.appendChild(messageDiv);
          messagesArea.scrollTop = messagesArea.scrollHeight;
          
          return messageId;
        }
        
        function addTypingIndicator() {
          const messagesArea = document.getElementById('messagesArea');
          const typingId = 'typing-' + Date.now();
          
          const messageDiv = document.createElement('div');
          messageDiv.className = 'message assistant';
          messageDiv.id = typingId;
          
          messageDiv.innerHTML = 
            '<div class="message-avatar">🤖</div>' +
            '<div class="message-content">' +
              '<div class="typing-indicator">' +
                '<div class="typing-dot"></div>' +
                '<div class="typing-dot"></div>' +
                '<div class="typing-dot"></div>' +
              '</div>' +
            '</div>';
          
          messagesArea.appendChild(messageDiv);
          messagesArea.scrollTop = messagesArea.scrollHeight;
          
          return typingId;
        }
        
        function removeMessage(messageId) {
          const message = document.getElementById(messageId);
          if (message) {
            message.remove();
          }
        }
        
        function showPlanAndConfirm(workflow) {
          const steps = workflow.complete_plan || [{ action: workflow.action, description: workflow.preview }];
          
          let planText = "I've created a plan to help you:\n\n";
          steps.forEach((step, index) => {
            const actionName = formatActionName(step.action);
            planText += \`\${index + 1}. \${actionName}\`;
            if (step.description && step.description !== workflow.preview) {
              planText += \` - \${step.description}\`;
            }
            planText += '\n';
          });
          
          planText += '\nShould I proceed with step 1? (yes/no)';
          addMessage('assistant', planText);
          
          // Set up for step confirmation
          pendingStep = {
            workflow: workflow,
            stepIndex: 0,
            steps: steps
          };
        }
        
        async function executeConfirmedStep() {
          if (!pendingStep || isProcessing) return;
          
          isProcessing = true;
          const step = pendingStep.steps[pendingStep.stepIndex];
          const stepActionPlan = {
            action: step.action,
            parameters: pendingStep.stepIndex === 0 ? pendingStep.workflow.parameters || {} : step.parameters || {},
            complete_plan: pendingStep.workflow.complete_plan,
            confidence: pendingStep.workflow.confidence || 0.9
          };
          
          // Show typing indicator
          const typingId = addTypingIndicator();
          
          try {
            const response = await fetch('/api/orchestrator/execute-step', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                actionPlan: stepActionPlan,
                stepIndex: pendingStep.stepIndex,
                previousResults: stepResults
              })
            });
            
            const data = await response.json();
            const result = data.result;
            
            // Remove typing indicator
            removeMessage(typingId);
            
            // Store result
            stepResults[pendingStep.stepIndex] = result;
            
            if (result.success) {
              const resultMessage = formatStepResult(step.action, result);
              addMessage('assistant', resultMessage);
              
              // Check if there are more steps
              if (pendingStep.stepIndex + 1 < pendingStep.steps.length) {
                const nextStepIndex = pendingStep.stepIndex + 1;
                const nextStep = pendingStep.steps[nextStepIndex];
                const nextActionName = formatActionName(nextStep.action);
                
                setTimeout(() => {
                  addMessage('assistant', \`Ready for step \${nextStepIndex + 1}: \${nextActionName}. Should I proceed? (yes/no)\`);
                  pendingStep.stepIndex = nextStepIndex;
                }, 1000);
              } else {
                addMessage('assistant', '🎉 All steps completed successfully! What else can I help you with?');
                resetWorkflow();
              }
            } else {
              addMessage('assistant', '❌ Step failed: ' + (result.message || 'Unknown error') + '\nWhat would you like me to help you with next?');
              resetWorkflow();
            }
            
          } catch (error) {
            removeMessage(typingId);
            addMessage('assistant', '❌ Error executing step: ' + error.message + '\nWhat would you like me to help you with next?');
            resetWorkflow();
          } finally {
            isProcessing = false;
            document.getElementById('sendBtn').disabled = false;
            document.getElementById('messageInput').focus();
          }
        }
        
        function resetWorkflow() {
          currentWorkflow = null;
          currentStep = 0;
          pendingStep = null;
          stepResults = [];
        }
        
        function getActionIcon(action) {
          const icons = {
            'search_parts': '🔧',
            'search_suppliers': '🏪',
            'send_email': '📧',
            'send_sms': '💬',
            'read_email_inbox': '📧',
            'read_sms_messages': '💬',
            'web_search': '🔍',
            'equipment_image_search': '📷'
          };
          return icons[action] || '⚙️';
        }
        
        function formatActionName(action) {
          return action.replace(/_/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase());
        }
        
        function formatStepResult(action, result) {
          if (!result.success) {
            return '❌ Step failed: ' + (result.message || 'Unknown error');
          }
          
          switch (action) {
            case 'search_parts':
              if (result.data && result.data.data && result.data.data.recommended_result) {
                const part = result.data.data.recommended_result;
                return '🔧 **Part Found:** ' + part.oem_part_number + ' - ' + (part.description || 'No description');
              }
              return '🔧 Part search completed';
              
            case 'search_suppliers':
              if (result.data && result.data.data && result.data.data.suppliers) {
                const count = result.data.data.suppliers.length;
                return '🏪 **Suppliers Found:** ' + count + ' suppliers located';
              }
              return '🏪 Supplier search completed';
              
            case 'send_email':
              return '📧 **Email Sent:** Message delivered successfully';
              
            case 'send_sms':
              return '💬 **SMS Sent:** Text message delivered successfully';
              
            default:
              return '✅ **' + formatActionName(action) + ':** Completed successfully';
          }
        }
        
        // Focus input on load
        window.addEventListener('load', () => {
          document.getElementById('messageInput').focus();
        });
      </script>
    </body>
    </html>
  `);
});

// Add route for raw output page
app.get('/ai-agent-raw', (req, res) => {
  try {
    const fs = require('fs');
    const htmlContent = fs.readFileSync(path.join(__dirname, 'ai-agent-raw.html'), 'utf8');
    res.send(htmlContent);
  } catch (error) {
    console.error('Error loading ai-agent-raw.html:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Raw Output - PartnerPlus</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg">
        <style>
          ${dropdownStyles}
        </style>
      </head>
      <body>
        ${generateNavigation('ai-agent-raw')}
        <div style="max-width: 1200px; margin: 0 auto; padding: 20px;">
          <h1>AI Agent Raw Output - Loading Error</h1>
          <p>Could not load the raw output interface. <a href="/ai-agent">Please use AI Agent v2</a></p>
        </div>
      </body>
      </html>
    `);
  }
});

// Add route for simple AI agent
app.get('/ai-agent-simple', (req, res) => {
  res.sendFile(path.join(__dirname, 'ai-agent-simple.html'));
});

// Add route for API documentation
app.get('/api-docs', (req, res) => {
  try {
    const fs = require('fs');
    const htmlContent = fs.readFileSync(path.join(__dirname, 'api-docs.html'), 'utf8');
    res.send(htmlContent);
  } catch (error) {
    console.error('Error loading api-docs.html:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>API Documentation - PartnerPlus</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg">
        <style>
          ${dropdownStyles}
        </style>
      </head>
      <body>
        ${generateNavigation('api-docs')}
        <div style="max-width: 1200px; margin: 0 auto; padding: 20px;">
          <h1>API Documentation - Loading Error</h1>
          <p>Could not load the API documentation. Please check that api-docs.html exists.</p>
        </div>
      </body>
      </html>
    `);
  }
});

// Add route for PartnerPlus AI Assistant
app.get('/PartnerPlus', (req, res) => {
  try {
    const fs = require('fs');
    const htmlContent = fs.readFileSync(path.join(__dirname, 'ai-chat-v2.html'), 'utf8');
    res.send(htmlContent);
  } catch (error) {
    console.error('Error loading ai-chat-v2.html:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>PartnerPlus - AI Assistant</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg">  
        <style>
          ${dropdownStyles}
        </style>
      </head>
      <body>
        ${generateNavigation('PartnerPlus')}
        <div style="max-width: 1200px; margin: 0 auto; padding: 20px;">
          <h1>PartnerPlus - Loading Error</h1>
          <p>Could not load the PartnerPlus interface. Please check that ai-chat-v2.html exists.</p>
        </div>
      </body>
      </html>
    `);
  }
});

// Redirect old agent-hub URL to AI agent page
app.get('/agent-hub', (req, res) => {
  res.redirect('/ai-agent');
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, stream } = req.body;
    
    if (stream) {
      // Set headers for Server-Sent Events
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });

      // Handle streaming response
      const response = await agent.processMessage(message, {
        stream: true,
        onChunk: (chunk) => {
          // Send chunk as Server-Sent Event
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
      });

      // Send final event and close
      res.write(`data: ${JSON.stringify({ type: 'done', content: response })}\n\n`);
      res.end();
    } else {
      // Regular non-streaming response
      const response = await agent.processMessage(message);
      res.json({ response });
    }
  } catch (error) {
    console.error('Chat error:', error);
    if (req.body.stream) {
      res.write(`data: ${JSON.stringify({ type: 'error', content: error.message })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

app.post('/api/chat/clear', (req, res) => {
  agent.clearHistory();
  res.json({ success: true });
});

// AI Agent Chat with tool decision making
app.post('/api/ai-agent-chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    
    // System prompt that explains available tools
    const systemPrompt = `You are an AI assistant for PartnerPlus, a restaurant equipment service platform. You can chat normally or use tools when needed.

AVAILABLE TOOLS:
1. PARTS SEARCH: POST /api/purchase-agent/parts/resolve - Find OEM part numbers from descriptions
   - Use when: User mentions equipment parts, part numbers, or needs to identify parts
   - Parameters: {description: "part description", make: "manufacturer", model: "model"}

2. SUPPLIER SEARCH: POST /api/purchase-agent/suppliers/search - Find suppliers for specific parts
   - Use when: User wants to find suppliers or pricing for a part number
   - Parameters: {partNumber: "12345", options: {limit: 5}}

3. SEND EMAIL: POST /api/email/send - Send emails
   - Use when: User wants to email information or results
   - Parameters: {to: "email@example.com", subject: "subject", text: "message body"}

4. CHECK EMAIL: GET /api/email/inbox - Read recent emails
   - Use when: User wants to check their inbox or read messages
   - Parameters: {limit: 10} (query parameter)

5. SEND SMS: POST /api/sms/send - Send text messages
   - Use when: User wants to send SMS alerts or notifications
   - Parameters: {to: "+1234567890", message: "text message"}

6. WEB SEARCH: POST /api/purchase-agent/search/web - Search the web with AI
   - Use when: User needs current information, pricing, or general web research
   - Parameters: {query: "search question"}

7. CODE EXECUTION: POST /api/execute-code - Execute code safely
   - Use when: User needs to run calculations, scripts, or code
   - Parameters: {code: "code to run", language: "python|javascript|bash"}

INSTRUCTIONS:
- Chat normally for general questions and conversation
- When a user request requires a tool, decide which tool to use and tell them what you're doing
- Use tools in sequence if needed (e.g., search parts first, then find suppliers, then email results)
- Always explain what tool you're using and why
- If you're not sure what the user wants, ask for clarification rather than guessing

Respond naturally and be helpful. Only use tools when the user's request clearly needs them.`;

    // Prepare messages for OpenAI
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-10), // Keep last 10 messages for context
      { role: 'user', content: message }
    ];

    // First, let the AI decide what to do
    const decisionResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages,
      temperature: 0.7,
      max_tokens: 1500
    });

    const aiResponse = decisionResponse.choices[0].message.content;
    
    // Check if the AI mentions using a specific tool
    let toolUsed = false;
    let toolMessage = '';
    let finalResponse = aiResponse;

    // Simple pattern matching to detect tool usage intent
    const toolPatterns = {
      'parts': /(?:search|find|look.*up|identify).*(?:part|component)/i,
      'suppliers': /(?:find|search|look.*up).*(?:supplier|vendor|source)/i,
      'email': /(?:send|email|mail).*(?:to|@)/i,
      'inbox': /(?:check|read|show).*(?:email|inbox|messages)/i,
      'sms': /(?:send|text|sms).*(?:to|\+\d)/i,
      'search': /(?:search|google|find.*online|web.*search)/i
    };

    // If AI response suggests using a tool, try to execute it
    if (aiResponse.toLowerCase().includes('let me') || aiResponse.toLowerCase().includes("i'll")) {
      
      // Extract relevant information from the user message for tool parameters
      const userLower = message.toLowerCase();
      
      // Try to execute the most appropriate tool
      if (toolPatterns.parts.test(userLower) || aiResponse.toLowerCase().includes('part')) {
        try {
          // Extract part description and manufacturer
          const partMatch = message.match(/(?:part|component)[\s\w]*?(\d+)|([a-zA-Z\s]+(?:part|component|seal|door|handle|motor))/i);
          const makeMatch = message.match(/(henny penny|hobart|vulcan|true|taylor|manitowoc|ice-o-matic)/i);
          
          if (partMatch) {
            const partDescription = partMatch[1] || partMatch[2] || 'equipment part';
            const make = makeMatch ? makeMatch[1] : '';
            
            toolMessage = `🔧 Searching for parts: "${partDescription}"${make ? ` from ${make}` : ''}`;
            
            const toolResponse = await fetch('http://localhost:3000/api/purchase-agent/parts/resolve', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                description: partDescription,
                make: make
              })
            });
            
            const toolData = await toolResponse.json();
            toolUsed = true;
            
            if (toolData.success && toolData.data?.recommended_result) {
              const part = toolData.data.recommended_result;
              finalResponse = `I found the part you're looking for:

**${part.oem_part_number}** - ${part.description || 'Equipment part'}
Manufacturer: ${toolData.data.query?.make || 'Unknown'}
Confidence: ${Math.round((part.confidence || 0) * 100)}%

${aiResponse.includes('email') || aiResponse.includes('supplier') ? 'Would you like me to find suppliers for this part or email these details to someone?' : 'Is this the part you were looking for?'}`;
            } else {
              finalResponse = `I couldn't find specific part information for "${partDescription}". Could you provide more details like the equipment model or a more specific part description?`;
            }
          }
        } catch (error) {
          console.error('Parts search error:', error);
        }
      }
      
      else if (toolPatterns.search.test(userLower) || aiResponse.toLowerCase().includes('search')) {
        try {
          toolMessage = `🔍 Searching the web for: "${message}"`;
          
          const toolResponse = await fetch('http://localhost:3000/api/purchase-agent/search/web', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: message })
          });
          
          const toolData = await toolResponse.json();
          toolUsed = true;
          
          if (toolData.success) {
            finalResponse = toolData.response?.output_text || 'I found some information, but the results were unclear. Could you be more specific about what you\'re looking for?';
          } else {
            finalResponse = 'I had trouble searching for that information. Could you rephrase your question?';
          }
        } catch (error) {
          console.error('Web search error:', error);
        }
      }
      
      else if (toolPatterns.inbox.test(userLower)) {
        try {
          toolMessage = '📧 Checking your email inbox...';
          
          const toolResponse = await fetch('http://localhost:3000/api/email/inbox?limit=5');
          const toolData = await toolResponse.json();
          toolUsed = true;
          
          if (toolData.success && toolData.emails?.length > 0) {
            let emailSummary = `Here are your recent emails:\n\n`;
            toolData.emails.slice(0, 3).forEach((email, i) => {
              emailSummary += `${i + 1}. **From:** ${email.from}\n   **Subject:** ${email.subject}\n   **Date:** ${new Date(email.date).toLocaleDateString()}\n\n`;
            });
            finalResponse = emailSummary;
          } else {
            finalResponse = 'Your inbox appears to be empty or I couldn\'t access it right now.';
          }
        } catch (error) {
          console.error('Email check error:', error);
          finalResponse = 'I had trouble checking your email. Please make sure email access is configured.';
        }
      }
    }

    res.json({
      response: finalResponse,
      toolUsed: toolUsed,
      toolMessage: toolMessage
    });

  } catch (error) {
    console.error('AI Agent Chat error:', error);
    res.status(500).json({ 
      error: 'I encountered an error processing your request. Please try again.',
      response: 'Sorry, I had a technical issue. Please try your request again.'
    });
  }
});

// Orchestrator Agent endpoints
app.post('/api/orchestrator/objective', async (req, res) => {
  try {
    const { objective, stream } = req.body;
    
    if (stream) {
      // Set headers for Server-Sent Events
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });

      // Handle streaming response (if implemented)
      const actionPlan = await orchestratorAgent.processObjective(objective, {
        stream: false // For now, disable streaming for orchestrator
      });

      // Send action plan
      res.write(`data: ${JSON.stringify({ type: 'action_plan', content: actionPlan })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done', content: actionPlan })}\n\n`);
      res.end();
    } else {
      // Regular non-streaming response
      const actionPlan = await orchestratorAgent.processObjective(objective);
      res.json({ actionPlan });
    }
  } catch (error) {
    console.error('Orchestrator error:', error);
    if (req.body.stream) {
      res.write(`data: ${JSON.stringify({ type: 'error', content: error.message })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

app.post('/api/orchestrator/execute', async (req, res) => {
  try {
    const { actionPlan } = req.body;
    const result = await orchestratorAgent.executeAction(actionPlan);
    res.json({ result });
  } catch (error) {
    console.error('Action execution error:', error);
    res.status(500).json({ error: error.message });
  }
});

// New endpoint for step-by-step execution in v2 visual workflow
app.post('/api/orchestrator/execute-step', async (req, res) => {
  try {
    const { actionPlan, stepIndex, previousResults } = req.body;
    
    console.log(`🎯 V2 WORKFLOW - Executing step ${stepIndex}:`, actionPlan.action);
    console.log(`🎯 V2 WORKFLOW - Action plan:`, JSON.stringify(actionPlan, null, 2));
    console.log(`🎯 V2 WORKFLOW - Previous results count:`, previousResults ? previousResults.length : 0);
    
    // For steps beyond the first, we may need to pass data from previous steps
    if (stepIndex > 0 && previousResults && previousResults.length > 0) {
      // Enhance parameters with data from previous steps
      const previousStepResult = previousResults[stepIndex - 1];
      
      if (previousStepResult && previousStepResult.success && previousStepResult.data) {
        console.log(`🔗 V2 WORKFLOW - Using previous step result for parameter enhancement`);
        
        // Pass along relevant data based on the workflow pattern
        if (actionPlan.action === 'search_suppliers' && previousStepResult.data.data?.recommended_result?.oem_part_number) {
          // Parts -> Suppliers workflow
          const partData = previousStepResult.data.data.recommended_result;
          actionPlan.parameters = {
            partNumber: partData.oem_part_number,
            options: {
              make: partData.manufacturer || actionPlan.parameters?.make || 'Unknown',
              model: actionPlan.parameters?.model || '',
              limit: 5
            }
          };
          console.log(`🔗 V2 WORKFLOW - Enhanced supplier search params:`, actionPlan.parameters);
        } else if (actionPlan.action === 'send_email' && previousStepResult.data.data?.suppliers?.length > 0) {
          // Suppliers -> Email workflow  
          const supplierData = previousStepResult.data.data;
          const suppliers = supplierData.suppliers.slice(0, 3);
          
          const supplierComparison = suppliers.map((supplier, index) => 
            (index + 1) + '. ' + (supplier.title || supplier.name || 'Unknown Supplier') + '\n' +
            '   Website: ' + (supplier.domain || 'Unknown') + '\n' +
            '   URL: ' + (supplier.url || 'No URL available') + '\n' +
            '   Description: ' + (supplier.snippet || 'No description available') + '\n' +
            '   ' + (supplier.price ? 'Price: ' + supplier.price : 'Contact for pricing')
          ).join('\\n\\n');
          
          const partNumber = supplierData.part_number || supplierData.partNumber || 'Unknown part';
          
          // Use existing email parameters or defaults
          actionPlan.parameters = {
            to: actionPlan.parameters?.to || actionPlan.parameters?.email || 'purchasing@company.com',
            subject: actionPlan.parameters?.subject || `Supplier Comparison for Part ${partNumber}`,
            text: `Supplier Comparison Report for Part: ${partNumber}

We found ${suppliers.length} suppliers for this part. Here are the top 3 options:

${supplierComparison}

Please review these options and contact the suppliers directly for current pricing and availability.

Best regards,
PartnerPlus Purchase Agent`
          };
          console.log(`🔗 V2 WORKFLOW - Enhanced email params:`, actionPlan.parameters);
        } else if (actionPlan.action === 'send_sms' && previousStepResult.data.data?.suppliers?.length > 0) {
          // Suppliers -> SMS workflow
          const supplierData = previousStepResult.data.data;
          const suppliers = supplierData.suppliers.slice(0, 3);
          
          const supplierList = suppliers.map((supplier, index) => 
            (index + 1) + '. ' + (supplier.title || supplier.name || 'Unknown') + '\\n   ' + 
            (supplier.url || 'No URL') + '\\n   Domain: ' + (supplier.domain || 'Unknown')
          ).join('\\n\\n');
          
          const partNumber = supplierData.part_number || supplierData.partNumber || 'Part';
          
          actionPlan.parameters = {
            to: actionPlan.parameters?.to || actionPlan.parameters?.phone || '+18775641118',
            message: 'Top 3 Suppliers for ' + partNumber + ':\\n\\n' + supplierList
          };
          console.log(`🔗 V2 WORKFLOW - Enhanced SMS params:`, actionPlan.parameters);
        }
      }
    }
    
    // Execute the single step using the existing orchestrator logic
    const result = await orchestratorAgent.executeAction(actionPlan);
    
    console.log(`🎯 V2 WORKFLOW - Step ${stepIndex} completed:`, result.success ? 'SUCCESS' : 'FAILED');
    if (!result.success) {
      console.log(`🎯 V2 WORKFLOW - Step ${stepIndex} error:`, result.message);
    }
    
    res.json({ result });
  } catch (error) {
    console.error(`V2 WORKFLOW - Step execution error:`, error);
    res.status(500).json({ 
      result: { 
        success: false, 
        message: `Error executing step: ${error.message}`,
        data: null 
      } 
    });
  }
});

app.post('/api/orchestrator/clear', (req, res) => {
  orchestratorAgent.clearHistory();
  res.json({ success: true });
});

// Work Order Generation endpoint
app.get('/api/generate-work-order', async (req, res) => {
  console.log('🔧 Work order generation requested');
  try {
    // Enhanced system prompt for realistic work order generation
    const systemPrompt = `You are a work order generation system for a commercial foodservice equipment service company. 

Generate a unique and realistic work order with creative variety.

REQUIREMENTS:
- Focus on foodservice industry (restaurants, cafes, hotels, cafeterias, food trucks, etc.)
- Create diverse equipment from these categories:
  * HOT EQUIPMENT: grills, fryers, ovens, ranges, steamers, broilers, warmers, heated displays
  * COLD EQUIPMENT: refrigerators, freezers, ice machines, prep tables, display cases, blast chillers
  * BEVERAGE: coffee machines, espresso machines, juice dispensers, tea brewers, soda fountains
  * PREP: mixers, slicers, food processors, grinders, scales, cutting boards
  * WAREWASHING: dishwashers, glasswashers, pot sinks, disposal units
  * VENTILATION: hoods, exhaust fans, make-up air units
- Mix well-known commercial brands with generic/lesser-known manufacturers
- Generate varied business names, addresses, and contact information  
- Create diverse technician names with professional emails (firstname.lastname@partnerplus.com)
- Write technical service notes in brief, spartan technician style
- Use proper commercial kitchen part terminology
- Include realistic error codes or technical observations when relevant
- Make suspected parts appropriate for the equipment and failure type

Be creative and vary equipment types across ALL categories, business types, locations, issues, and scenarios.

FORMAT AS JSON with this exact structure:
{
  "id": "WO-[4-digit number]",
  "equipment": "[Make] [Model]",
  "locationName": "[Foodservice Business Name]",
  "address": "[Full street address, City, State ZIP]",
  "locationContactName": "[Manager name]",
  "locationContactPhone": "[Phone]",
  "locationContactEmail": "[Email]",
  "technicianName": "[Tech name]",
  "technicianPhone": "[Phone]",
  "technicianEmail": "[Email]",
  "status": "In Progress",
  "dispatchNotes": "[Customer complaint and dispatch details]",
  "serviceNotes": "[Tech's initial diagnosis in spartan technical style]",
  "suspectedFailure": "[Brief technical description]",
  "suspectedParts": ["part1", "part2", "part3"]
}`;

    // Add randomization to make each request unique
    const randomPrompts = [
      'Generate a work order for a HOT equipment failure (grill, fryer, oven, etc).',
      'Create a work order for COLD equipment breakdown (refrigerator, freezer, ice machine, etc).',
      'Generate a work order for a BEVERAGE equipment issue (coffee, espresso, soda, etc).',
      'Create a service ticket for PREP equipment problems (mixer, slicer, processor, etc).',
      'Generate a work order for WAREWASHING equipment failure (dishwasher, disposal, etc).',
      'Create a work order for VENTILATION system issues (hood, exhaust, etc).',
      'Generate a service request for a unique or specialty foodservice equipment.',
      'Create a work order for an urgent commercial kitchen breakdown.',
      'Generate a work order mixing multiple equipment types in one location.'
    ];
    
    const randomPrompt = randomPrompts[Math.floor(Math.random() * randomPrompts.length)];
    
    console.log('🤖 Calling OpenAI with prompt:', randomPrompt);
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: randomPrompt }
      ],
      temperature: 1.2,
      top_p: 0.95,
      frequency_penalty: 0.5,
      presence_penalty: 0.3,
      response_format: { type: "json_object" }
    });
    
    console.log('✅ OpenAI response received');
    const workOrder = JSON.parse(response.choices[0].message.content);
    console.log('📋 Generated work order address:', workOrder.address);
    
    // Ensure all required fields are present
    const finalWorkOrder = {
      id: workOrder.id || `WO-${Math.floor(Math.random() * 9000) + 1000}`,
      equipment: workOrder.equipment,
      customer: workOrder.locationName,
      locationName: workOrder.locationName,
      address: workOrder.address,
      contact: `${workOrder.locationContactName} ${workOrder.locationContactPhone}`,
      locationContactName: workOrder.locationContactName,
      locationContactPhone: workOrder.locationContactPhone,
      locationContactEmail: workOrder.locationContactEmail,
      technician: workOrder.technicianName,
      technicianName: workOrder.technicianName,
      technicianPhone: workOrder.technicianPhone,
      technicianEmail: workOrder.technicianEmail,
      status: workOrder.status || 'In Progress',
      description: workOrder.dispatchNotes.split('.')[0], // First sentence for summary
      dispatchNotes: workOrder.dispatchNotes,
      serviceNotes: workOrder.serviceNotes,
      suspectedFailure: workOrder.suspectedFailure,
      suspectedParts: workOrder.suspectedParts || [],
      estimatedDuration: `${Math.floor(Math.random() * 3) + 1} hours`,
      parts: [],
      notes: []
    };

    res.json(finalWorkOrder);
  } catch (error) {
    console.error('❌ Error generating work order:', error);
    console.log('🔄 Falling back to static work order');
    
    // Fallback to a static work order if AI fails
    const fallbackWorkOrder = {
      id: `WO-${Math.floor(Math.random() * 9000) + 1000}`,
      equipment: 'Hobart AM15',
      customer: 'Downtown Grill House',
      locationName: 'Downtown Grill House',
      address: '456 Main Street, Louisville, KY 40202',
      contact: 'John Smith (502) 555-0123',
      locationContactName: 'John Smith',
      locationContactPhone: '(502) 555-0123',
      locationContactEmail: 'manager@downtowngrillhouse.com',
      technician: 'Mike Johnson',
      technicianName: 'Mike Johnson',
      technicianPhone: '(502) 555-0234',
      technicianEmail: 'mike.johnson@partnerplus.com',
      status: 'In Progress',
      description: 'Dishwasher not completing wash cycle',
      dispatchNotes: 'Customer reports dishwasher stops mid-cycle, error code E2 displayed. Machine is 5 years old, last serviced 6 months ago. Kitchen manager requests urgent repair.',
      serviceNotes: 'E2 code indicates wash pump failure. Pump motor drawing high amps, bearings shot. Water not circulating properly. Need to replace wash pump assembly.',
      suspectedFailure: 'Wash pump motor failure',
      suspectedParts: ['Wash pump assembly', 'Pump seal kit', 'Motor capacitor'],
      estimatedDuration: '2 hours',
      parts: [],
      notes: []
    };
    
    res.json(fallbackWorkOrder);
  }
});

// Code extraction endpoint
app.post('/api/extract-code', async (req, res) => {
  try {
    const lastMessage = agent.getLastMessage();
    if (!lastMessage) {
      return res.json({ code: null, language: null });
    }

    // First try to extract code blocks using regex patterns
    let extractedCode = null;
    let language = null;

    // Pattern 1: Look for code blocks with language specification ```language
    const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
    const matches = [...lastMessage.matchAll(codeBlockRegex)];
    
    if (matches.length > 0) {
      // Use the first/longest code block
      let bestMatch = matches[0];
      for (const match of matches) {
        if (match[2].length > bestMatch[2].length) {
          bestMatch = match;
        }
      }
      extractedCode = bestMatch[2].trim();
      language = bestMatch[1] || codeExecutor.detectLanguage(extractedCode);
    } else {
      // Pattern 2: Look for inline code patterns
      const inlinePatterns = [
        /console\.log\([^)]+\)/g,
        /print\([^)]+\)/g,
        /echo\s+[^\n]+/g,
        /<[^>]+>[^<]*<\/[^>]+>/g,
        /function\s+\w+\s*\([^)]*\)\s*{[^}]*}/g
      ];
      
      for (const pattern of inlinePatterns) {
        const match = lastMessage.match(pattern);
        if (match) {
          extractedCode = match[0];
          language = codeExecutor.detectLanguage(extractedCode);
          break;
        }
      }
    }

    // If regex fails, fall back to AI extraction
    if (!extractedCode) {
      const extractPrompt = `Extract only the executable code from this message, removing any explanations or markdown formatting. Return only the raw code that can be executed. If there are multiple code blocks, return the most complete/main one. If there's no code, return "NO_CODE_FOUND". Message: "${lastMessage}"`;
      
      const response = await agent.processMessage(extractPrompt);
      
      if (response !== "NO_CODE_FOUND" && response.length > 5) {
        extractedCode = response;
        language = codeExecutor.detectLanguage(response);
      }
    }
    
    res.json({ 
      code: extractedCode, 
      language: language || 'javascript',
      original: lastMessage 
    });
  } catch (error) {
    console.error('Code extraction error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Code execution endpoint
app.post('/api/execute-code', async (req, res) => {
  try {
    const { code, language } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'No code provided' });
    }

    const result = await codeExecutor.executeCode(code, language);
    res.json(result);
  } catch (error) {
    console.error('Code execution error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Email API endpoints
app.post('/api/email/send', async (req, res) => {
  if (!emailService) {
    return res.status(503).json({ error: 'Email service not configured' });
  }

  try {
    const { to, subject, text, html } = req.body;
    
    if (!to || !subject || !text) {
      return res.status(400).json({ error: 'Missing required fields: to, subject, text' });
    }

    const result = await emailService.sendEmail(to, subject, text, html);
    res.json(result);
  } catch (error) {
    console.error('Email send error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/email/inbox', async (req, res) => {
  if (!emailService) {
    return res.status(503).json({ error: 'Email service not configured' });
  }

  try {
    const limit = parseInt(req.query.limit) || 10;
    const emails = await emailService.getInbox(limit);
    res.json({ emails });
  } catch (error) {
    console.error('Email inbox error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/email/refresh', async (req, res) => {
  if (!emailService) {
    return res.status(503).json({ error: 'Email service not configured' });
  }

  try {
    const emails = await emailService.refreshInbox();
    res.json({ emails });
  } catch (error) {
    console.error('Email refresh error:', error);
    res.status(500).json({ error: error.message });
  }
});

// SMS API endpoints
app.post('/api/sms/send', async (req, res) => {
  if (!smsService) {
    return res.status(503).json({ error: 'SMS service not configured' });
  }

  try {
    const { to, message } = req.body;
    
    if (!to || !message) {
      return res.status(400).json({ error: 'Missing required fields: to, message' });
    }

    const result = await smsService.sendSMS(to, message);
    res.json(result);
  } catch (error) {
    console.error('SMS send error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sms/messages', async (req, res) => {
  if (!smsService) {
    return res.status(503).json({ error: 'SMS service not configured' });
  }

  try {
    const limit = parseInt(req.query.limit) || 20;
    const messages = await smsService.getMessages(limit);
    res.json({ messages });
  } catch (error) {
    console.error('SMS messages error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sms/refresh', async (req, res) => {
  if (!smsService) {
    return res.status(503).json({ error: 'SMS service not configured' });
  }

  try {
    const messages = await smsService.refreshMessages();
    res.json({ messages });
  } catch (error) {
    console.error('SMS refresh error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Email manual interface
app.get('/email', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Email Service - PartnerPlus</title>
      <link rel="icon" type="image/svg+xml" href="/favicon.svg">
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
        .header { background-color: #1976d2; color: white; padding: 15px 0; margin-bottom: 20px; width: 100%; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header-inner { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
        .nav { display: flex; align-items: center; }
        .nav h1 { margin: 0; margin-right: 30px; font-size: 24px; color: white; }
        .nav a { color: white; text-decoration: none; padding: 8px 16px; margin-right: 10px; border-radius: 4px; transition: background-color 0.3s; }
        .nav a:hover { background-color: rgba(255,255,255,0.1); }
        .nav a.active { background-color: rgba(255,255,255,0.2); }
        .content { max-width: 1200px; margin: 0 auto; padding: 0 20px 60px 20px; }
        .container { display: flex; gap: 20px; }
        .section { flex: 1; border: 1px solid #ccc; border-radius: 10px; padding: 20px; }
        h2 { margin-top: 0; color: #1976d2; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input, textarea { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
        textarea { min-height: 100px; resize: vertical; }
        button { padding: 10px 20px; background-color: #1976d2; color: white; border: none; border-radius: 5px; cursor: pointer; }
        button:hover { background-color: #1565c0; }
        button:disabled { background-color: #ccc; cursor: not-allowed; }
        .email-list { max-height: 600px; overflow-y: auto; }
        .email-item { border: 1px solid #eee; border-radius: 5px; padding: 10px; margin-bottom: 10px; cursor: pointer; }
        .email-item:hover { background-color: #f5f5f5; }
        .email-from { font-weight: bold; color: #333; }
        .email-subject { color: #1976d2; margin: 5px 0; }
        .email-date { color: #666; font-size: 0.9em; }
        .email-preview { color: #666; font-size: 0.9em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .status { padding: 10px; margin: 10px 0; border-radius: 5px; }
        .status.success { background-color: #d4edda; color: #155724; }
        .status.error { background-color: #f8d7da; color: #721c24; }
        .modal { display: none; position: fixed; z-index: 1; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.4); }
        .modal-content { background-color: #fefefe; margin: 5% auto; padding: 20px; border: 1px solid #888; width: 80%; max-width: 800px; border-radius: 10px; }
        .close { color: #aaa; float: right; font-size: 28px; font-weight: bold; cursor: pointer; }
        .close:hover { color: black; }
        .email-body { white-space: pre-wrap; word-wrap: break-word; }
        ${dropdownStyles}
      </style>
    </head>
    <body>
      ${generateNavigation('email')}
      <div class="content">
        <h2>Email Service Manual Interface</h2>
      
      <div class="container">
        <div class="section">
          <h2>Send Email</h2>
          <form id="sendEmailForm">
            <div class="form-group">
              <label for="to">To:</label>
              <input type="email" id="to" name="to" required placeholder="recipient@example.com">
            </div>
            <div class="form-group">
              <label for="subject">Subject:</label>
              <input type="text" id="subject" name="subject" required placeholder="Email subject">
            </div>
            <div class="form-group">
              <label for="text">Message:</label>
              <textarea id="text" name="text" required placeholder="Your message here..."></textarea>
            </div>
            <div class="form-group">
              <label for="html">HTML (optional):</label>
              <textarea id="html" name="html" placeholder="<p>HTML version of your message</p>"></textarea>
            </div>
            <button type="submit" id="sendButton">Send Email</button>
          </form>
          <div id="sendStatus"></div>
        </div>

        <div class="section">
          <h2>Inbox</h2>
          <button onclick="refreshInbox()" id="refreshButton">Refresh Inbox</button>
          <div id="inboxStatus"></div>
          <div id="emailList" class="email-list"></div>
        </div>
      </div>

      <!-- Email Detail Modal -->
      <div id="emailModal" class="modal">
        <div class="modal-content">
          <span class="close" onclick="closeModal()">&times;</span>
          <h2 id="modalSubject"></h2>
          <p><strong>From:</strong> <span id="modalFrom"></span></p>
          <p><strong>To:</strong> <span id="modalTo"></span></p>
          <p><strong>Date:</strong> <span id="modalDate"></span></p>
          <hr>
          <div id="modalBody" class="email-body"></div>
        </div>
      </div>

      <script>
        // Load inbox on page load
        window.onload = () => {
          refreshInbox();
        };

        // Send email form handler
        document.getElementById('sendEmailForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const sendButton = document.getElementById('sendButton');
          const statusDiv = document.getElementById('sendStatus');
          
          sendButton.disabled = true;
          sendButton.textContent = 'Sending...';
          
          const formData = {
            to: document.getElementById('to').value,
            subject: document.getElementById('subject').value,
            text: document.getElementById('text').value,
            html: document.getElementById('html').value
          };

          try {
            const response = await fetch('/api/email/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(formData)
            });

            const result = await response.json();
            
            if (result.success) {
              statusDiv.className = 'status success';
              statusDiv.textContent = 'Email sent successfully! Message ID: ' + result.messageId;
              document.getElementById('sendEmailForm').reset();
            } else {
              statusDiv.className = 'status error';
              statusDiv.textContent = 'Failed to send email: ' + (result.error || 'Unknown error');
            }
          } catch (error) {
            statusDiv.className = 'status error';
            statusDiv.textContent = 'Error: ' + error.message;
          } finally {
            sendButton.disabled = false;
            sendButton.textContent = 'Send Email';
          }
        });

        // Refresh inbox
        async function refreshInbox() {
          const refreshButton = document.getElementById('refreshButton');
          const statusDiv = document.getElementById('inboxStatus');
          const emailList = document.getElementById('emailList');
          
          refreshButton.disabled = true;
          refreshButton.textContent = 'Refreshing...';
          statusDiv.textContent = '';

          try {
            const response = await fetch('/api/email/refresh', {
              method: 'POST'
            });

            const result = await response.json();
            
            if (result.emails) {
              displayEmails(result.emails);
              statusDiv.className = 'status success';
              statusDiv.textContent = 'Inbox refreshed: ' + result.emails.length + ' emails';
            } else {
              statusDiv.className = 'status error';
              statusDiv.textContent = 'Failed to refresh inbox: ' + (result.error || 'Unknown error');
            }
          } catch (error) {
            statusDiv.className = 'status error';
            statusDiv.textContent = 'Error: ' + error.message;
          } finally {
            refreshButton.disabled = false;
            refreshButton.textContent = 'Refresh Inbox';
          }
        }

        // Display emails in the list
        function displayEmails(emails) {
          const emailList = document.getElementById('emailList');
          emailList.innerHTML = '';

          if (emails.length === 0) {
            emailList.innerHTML = '<p>No emails found</p>';
            return;
          }

          emails.forEach((email, index) => {
            const emailItem = document.createElement('div');
            emailItem.className = 'email-item';
            emailItem.onclick = () => showEmailDetail(email);
            
            // Clean up the email text for better preview
            let cleanText = email.text || '';
            // Remove common email artifacts
            cleanText = cleanText.replace(/\\[image:.*?\\]/g, ''); // Remove image placeholders
            cleanText = cleanText.replace(/\\n+/g, ' '); // Replace multiple newlines with spaces
            cleanText = cleanText.replace(/\\s+/g, ' '); // Replace multiple spaces with single space
            cleanText = cleanText.trim();
            
            // Get preview text (first 80 characters)
            const preview = cleanText.length > 80 ? cleanText.substring(0, 80) + '...' : cleanText;
            
            // Clean up sender name (remove quotes if present)
            let fromName = email.from;
            const emailMatch = fromName.match(/"?(.*?)"?\\s*<(.+?)>/);
            if (emailMatch) {
              fromName = emailMatch[1] || emailMatch[2];
            }
            
            // Format date nicely
            const emailDate = new Date(email.date);
            const now = new Date();
            const diffDays = Math.floor((now - emailDate) / (1000 * 60 * 60 * 24));
            
            let dateDisplay;
            if (diffDays === 0) {
              dateDisplay = emailDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            } else if (diffDays === 1) {
              dateDisplay = 'Yesterday';
            } else if (diffDays < 7) {
              dateDisplay = emailDate.toLocaleDateString([], {weekday: 'short'});
            } else {
              dateDisplay = emailDate.toLocaleDateString([], {month: 'short', day: 'numeric'});
            }
            
            emailItem.innerHTML = 
              '<div class="email-from">' + fromName + '</div>' +
              '<div class="email-subject">' + (email.subject || '(No Subject)') + '</div>' +
              '<div class="email-date">' + dateDisplay + '</div>' +
              '<div class="email-preview">' + preview + '</div>';
            
            emailList.appendChild(emailItem);
          });
        }

        // Show email detail in modal
        function showEmailDetail(email) {
          document.getElementById('modalSubject').textContent = email.subject || '(No Subject)';
          
          // Clean up sender name for display
          let fromName = email.from;
          const emailMatch = fromName.match(/"?(.*?)"?\\s*<(.+?)>/);
          if (emailMatch) {
            fromName = emailMatch[1] + ' <' + emailMatch[2] + '>';
          }
          
          document.getElementById('modalFrom').textContent = fromName;
          document.getElementById('modalTo').textContent = email.to;
          document.getElementById('modalDate').textContent = new Date(email.date).toLocaleString();
          
          // Display email body - prefer HTML if available, otherwise format text
          const modalBody = document.getElementById('modalBody');
          if (email.html && email.html.length > 50) {
            // Create a sandboxed iframe for HTML content to prevent XSS
            const iframe = document.createElement('iframe');
            iframe.style.width = '100%';
            iframe.style.height = '400px';
            iframe.style.border = 'none';
            iframe.srcdoc = email.html;
            modalBody.innerHTML = '';
            modalBody.appendChild(iframe);
          } else {
            // Format plain text nicely
            let formattedText = email.text || 'No content';
            formattedText = formattedText.replace(/\\[image:.*?\\]/g, '[Image]');
            formattedText = formattedText.replace(/\\n/g, '<br>');
            modalBody.innerHTML = formattedText;
          }
          
          document.getElementById('emailModal').style.display = 'block';
        }

        // Close modal
        function closeModal() {
          document.getElementById('emailModal').style.display = 'none';
        }

        // Close modal when clicking outside
        window.onclick = (event) => {
          const modal = document.getElementById('emailModal');
          if (event.target == modal) {
            modal.style.display = 'none';
          }
        }
      </script>
      </div>
    </body>
    </html>
  `);
});

// SMS manual interface
app.get('/sms', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>SMS Service - PartnerPlus</title>
      <link rel="icon" type="image/svg+xml" href="/favicon.svg">
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
        .header { background-color: #1976d2; color: white; padding: 15px 0; margin-bottom: 20px; width: 100%; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header-inner { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
        .nav { display: flex; align-items: center; }
        .nav h1 { margin: 0; margin-right: 30px; font-size: 24px; color: white; }
        .nav a { color: white; text-decoration: none; padding: 8px 16px; margin-right: 10px; border-radius: 4px; transition: background-color 0.3s; }
        .nav a:hover { background-color: rgba(255,255,255,0.1); }
        .nav a.active { background-color: rgba(255,255,255,0.2); }
        .content { max-width: 1200px; margin: 0 auto; padding: 0 20px 60px 20px; }
        .container { display: flex; gap: 20px; }
        .section { flex: 1; border: 1px solid #ccc; border-radius: 10px; padding: 20px; }
        h2 { margin-top: 0; color: #1976d2; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input, textarea { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
        textarea { min-height: 100px; resize: vertical; }
        button { padding: 10px 20px; background-color: #1976d2; color: white; border: none; border-radius: 5px; cursor: pointer; }
        button:hover { background-color: #1565c0; }
        button:disabled { background-color: #ccc; cursor: not-allowed; }
        .message-list { max-height: 600px; overflow-y: auto; }
        .message-item { border: 1px solid #eee; border-radius: 5px; padding: 10px; margin-bottom: 10px; }
        .message-item.sent { background-color: #e3f2fd; margin-left: 20px; }
        .message-item.received { background-color: #f5f5f5; margin-right: 20px; }
        .message-from { font-weight: bold; color: #333; }
        .message-body { margin: 5px 0; }
        .message-date { color: #666; font-size: 0.9em; }
        .message-status { color: #666; font-size: 0.8em; font-style: italic; }
        .status { padding: 10px; margin: 10px 0; border-radius: 5px; }
        .status.success { background-color: #d4edda; color: #155724; }
        .status.error { background-color: #f8d7da; color: #721c24; }
        .phone-input { font-family: monospace; }
        .char-count { font-size: 0.8em; color: #666; text-align: right; margin-top: 5px; }
        .char-count.warning { color: #f57c00; }
        .char-count.error { color: #d32f2f; }
        ${dropdownStyles}
      </style>
    </head>
    <body>
      ${generateNavigation('sms')}
      <div class="content">
        <h2>SMS Service Manual Interface</h2>
      
        <div class="container">
          <div class="section">
            <h2>Send SMS</h2>
            <p><small>By using this service, you agree to our <a href="/optin" target="_blank">SMS Opt-In Policy</a>. Message and data rates may apply.</small></p>
            <form id="sendSMSForm">
              <div class="form-group">
                <label for="to">To (Phone Number):</label>
                <input type="tel" id="to" name="to" required placeholder="+1 (555) 123-4567" class="phone-input">
                <small>Format: +1 (555) 123-4567 or 5551234567</small>
              </div>
              <div class="form-group">
                <label for="message">Message:</label>
                <textarea id="message" name="message" required placeholder="Your message here..." maxlength="1600" oninput="updateCharCount()"></textarea>
                <div id="charCount" class="char-count">0 / 160 characters (1 SMS)</div>
              </div>
              <button type="submit" id="sendButton">Send SMS</button>
            </form>
            <div id="sendStatus"></div>
          </div>

          <div class="section">
            <h2>Messages</h2>
            <button onclick="refreshMessages()" id="refreshButton">Refresh Messages</button>
            <div id="messageStatus"></div>
            <div id="messageList" class="message-list"></div>
          </div>
        </div>
      </div>

      <script>
        // Load messages on page load
        window.onload = () => {
          refreshMessages();
        };

        // Character count function
        function updateCharCount() {
          const messageInput = document.getElementById('message');
          const charCountDiv = document.getElementById('charCount');
          const length = messageInput.value.length;
          
          let smsCount = Math.ceil(length / 160);
          if (length > 160) {
            smsCount = Math.ceil(length / 153); // SMS segments after first are 153 chars
          }
          
          charCountDiv.textContent = length + ' / ' + (length <= 160 ? '160' : '1600') + ' characters (' + smsCount + ' SMS)';
          
          if (length > 1600) {
            charCountDiv.className = 'char-count error';
          } else if (length > 160) {
            charCountDiv.className = 'char-count warning';
          } else {
            charCountDiv.className = 'char-count';
          }
        }

        // Send SMS form handler
        document.getElementById('sendSMSForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const sendButton = document.getElementById('sendButton');
          const statusDiv = document.getElementById('sendStatus');
          
          sendButton.disabled = true;
          sendButton.textContent = 'Sending...';
          
          const formData = {
            to: document.getElementById('to').value,
            message: document.getElementById('message').value
          };

          try {
            const response = await fetch('/api/sms/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(formData)
            });

            const result = await response.json();
            
            if (result.success) {
              statusDiv.className = 'status success';
              statusDiv.textContent = 'SMS sent successfully! Message ID: ' + result.messageId;
              document.getElementById('sendSMSForm').reset();
              updateCharCount();
              // Refresh messages to show sent message
              setTimeout(refreshMessages, 1000);
            } else {
              statusDiv.className = 'status error';
              statusDiv.textContent = 'Failed to send SMS: ' + (result.error || 'Unknown error');
            }
          } catch (error) {
            statusDiv.className = 'status error';
            statusDiv.textContent = 'Error: ' + error.message;
          } finally {
            sendButton.disabled = false;
            sendButton.textContent = 'Send SMS';
          }
        });

        // Format phone number as user types
        document.getElementById('to').addEventListener('input', function(e) {
          let value = e.target.value.replace(/\\D/g, '');
          if (value.length >= 10) {
            if (value.length === 10) {
              value = value.replace(/(\\d{3})(\\d{3})(\\d{4})/, '($1) $2-$3');
            } else if (value.length === 11 && value.startsWith('1')) {
              value = value.replace(/(\\d{1})(\\d{3})(\\d{3})(\\d{4})/, '+$1 ($2) $3-$4');
            }
          }
          e.target.value = value;
        });

        // Refresh messages
        async function refreshMessages() {
          const refreshButton = document.getElementById('refreshButton');
          const statusDiv = document.getElementById('messageStatus');
          const messageList = document.getElementById('messageList');
          
          refreshButton.disabled = true;
          refreshButton.textContent = 'Refreshing...';
          statusDiv.textContent = '';

          try {
            const response = await fetch('/api/sms/refresh', {
              method: 'POST'
            });

            const result = await response.json();
            
            if (result.messages) {
              displayMessages(result.messages);
              statusDiv.className = 'status success';
              statusDiv.textContent = 'Messages refreshed: ' + result.messages.length + ' messages';
            } else {
              statusDiv.className = 'status error';
              statusDiv.textContent = 'Failed to refresh messages: ' + (result.error || 'Unknown error');
            }
          } catch (error) {
            statusDiv.className = 'status error';
            statusDiv.textContent = 'Error: ' + error.message;
          } finally {
            refreshButton.disabled = false;
            refreshButton.textContent = 'Refresh Messages';
          }
        }

        // Display messages in the list
        function displayMessages(messages) {
          const messageList = document.getElementById('messageList');
          messageList.innerHTML = '';

          if (messages.length === 0) {
            messageList.innerHTML = '<p>No messages found</p>';
            return;
          }

          messages.forEach((message) => {
            const messageItem = document.createElement('div');
            messageItem.className = 'message-item ' + message.type;
            
            // Format phone number for display
            const phoneNumber = formatPhoneForDisplay(message.type === 'sent' ? message.to : message.from);
            
            // Format date nicely
            const messageDate = new Date(message.date);
            const now = new Date();
            const diffDays = Math.floor((now - messageDate) / (1000 * 60 * 60 * 24));
            
            let dateDisplay;
            if (diffDays === 0) {
              dateDisplay = messageDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            } else if (diffDays === 1) {
              dateDisplay = 'Yesterday ' + messageDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            } else if (diffDays < 7) {
              dateDisplay = messageDate.toLocaleDateString([], {weekday: 'short'}) + ' ' + messageDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            } else {
              dateDisplay = messageDate.toLocaleDateString([], {month: 'short', day: 'numeric'}) + ' ' + messageDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            }
            
            messageItem.innerHTML = 
              '<div class="message-from">' + (message.type === 'sent' ? 'To: ' + phoneNumber : 'From: ' + phoneNumber) + '</div>' +
              '<div class="message-body">' + message.body + '</div>' +
              '<div class="message-date">' + dateDisplay + '</div>' +
              (message.status ? '<div class="message-status">Status: ' + message.status + '</div>' : '');
            
            messageList.appendChild(messageItem);
          });
        }

        // Format phone number for display
        function formatPhoneForDisplay(phoneNumber) {
          if (!phoneNumber) return 'Unknown';
          
          const digits = phoneNumber.replace(/\\D/g, '');
          
          if (digits.length === 10) {
            return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
          } else if (digits.length === 11 && digits.startsWith('1')) {
            return '+1 (' + digits.slice(1, 4) + ') ' + digits.slice(4, 7) + '-' + digits.slice(7);
          }
          
          return phoneNumber; // Return original if can't format
        }
      </script>
      </div>
    </body>
    </html>
  `);
});

// Twilio webhook for incoming SMS
app.post('/webhook/sms', (req, res) => {
  const { From, Body, MessageSid } = req.body;
  
  console.log('Incoming SMS:', {
    from: From,
    body: Body,
    messageId: MessageSid
  });

  // Store incoming message in SMS service
  if (smsService) {
    const messageData = {
      id: MessageSid,
      from: From,
      to: process.env.TWILIO_PHONE_NUMBER,
      body: Body,
      direction: 'inbound',
      status: 'received',
      date: new Date(),
      type: 'received'
    };
    
    smsService.messages.unshift(messageData);
  }

  // Respond with TwiML (empty response = no auto-reply)
  res.type('text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
</Response>`);
});

// Purchase Agent API endpoints
app.post('/api/purchase-agent/start', async (req, res) => {
  try {
    await purchaseAgent.start();
    res.json({ success: true, message: 'Purchase Agent service started' });
  } catch (error) {
    console.error('Failed to start Purchase Agent:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/purchase-agent/health', async (req, res) => {
  try {
    const health = await purchaseAgent.checkHealth();
    res.json({ success: true, health });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/purchase-agent/parts/resolve', async (req, res) => {
  try {
    const { description, make, model, options } = req.body;
    const result = await purchaseAgent.resolvePart(description, make, model, options || {});
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Part resolution error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/purchase-agent/manuals/search', async (req, res) => {
  try {
    const { make, model, category } = req.query;
    const result = await purchaseAgent.searchManuals(make, model, category);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Manual search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/purchase-agent/suppliers/search', async (req, res) => {
  try {
    const { partNumber, options } = req.body;
    const result = await purchaseAgent.searchSuppliers(partNumber, options || {});
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Supplier search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Service Company Search endpoint
app.post('/api/purchase-agent/service-search', async (req, res) => {
  try {
    const { zipCode, make, model, serviceType } = req.body;
    
    if (!zipCode || !make) {
      return res.status(400).json({ 
        success: false, 
        error: 'Zip code and equipment make are required' 
      });
    }

    const searchResults = await purchaseAgent.searchServiceCompanies(make, model, {
      serviceType: serviceType,
      location: zipCode
    });
    
    res.json({
      success: true,
      data: searchResults
    });
  } catch (error) {
    console.error('Service search error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Equipment Image Search endpoint
app.post('/api/purchase-agent/equipment-image', async (req, res) => {
  try {
    const { make, model } = req.body;
    
    if (!make || !model) {
      return res.status(400).json({ 
        success: false, 
        error: 'Equipment make and model are required' 
      });
    }

    const imageResult = await purchaseAgent.searchEquipmentImage(make, model);
    
    res.json(imageResult);
  } catch (error) {
    console.error('Equipment image search error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Part Image Search endpoint
app.post('/api/purchase-agent/part-image', async (req, res) => {
  try {
    const { make, model, partName, oemNumber } = req.body;
    
    if (!make || !model || !partName) {
      return res.status(400).json({ 
        success: false, 
        error: 'Equipment make, model, and part name are required' 
      });
    }

    const imageResult = await purchaseAgent.searchPartImage(make, model, partName, oemNumber);
    
    res.json(imageResult);
  } catch (error) {
    console.error('Part image search error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Part Enrichment endpoint
app.post('/api/purchase-agent/parts/enrich', async (req, res) => {
  try {
    const { partNumber, make, model } = req.body;
    
    if (!partNumber) {
      return res.status(400).json({ 
        success: false, 
        error: 'Part number is required' 
      });
    }

    const enrichResult = await purchaseAgent.enrichPart(partNumber, make, model);
    
    res.json(enrichResult);
  } catch (error) {
    console.error('Part enrichment error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Generic Parts Search endpoint
app.post('/api/purchase-agent/parts/find-generic', async (req, res) => {
  try {
    const { query, equipment_make, equipment_model } = req.body;
    
    if (!query) {
      return res.status(400).json({ 
        success: false, 
        error: 'Search query is required' 
      });
    }

    // Call the Flask API directly since the Node.js purchase agent service doesn't have this method
    const response = await fetch('http://localhost:7777/api/parts/find-generic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, equipment_make, equipment_model })
    });

    const result = await response.json();
    res.json(result);
  } catch (error) {
    console.error('Generic parts search error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// AI Web Search endpoint - GPT with web search enabled
app.post('/api/purchase-agent/search/web', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ 
        success: false, 
        error: 'Search query is required' 
      });
    }

    // Use OpenAI client with web search capability
    const OpenAIClient = require('./lib/openai-client');
    const openaiClient = new OpenAIClient();
    
    // Query GPT with web search enabled
    const input = `Please search the web for: ${query}. Use web search to find the most current, real-time data and provide a comprehensive answer.`;
    
    console.log('GPT web search input:', input);
    
    const response = await openaiClient.chatWithResponses(input, {
      model: 'gpt-4o',
      tools: [{ type: 'web_search_preview' }],
      stream: false
    });
    
    console.log('GPT web search response:', JSON.stringify(response, null, 2));
    
    res.json({
      success: true,
      query: query,
      response: response,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('AI web search error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// SERP Search endpoint - Returns 10 real Google search results via SerpAPI
app.post('/api/purchase-agent/search/serp', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ 
        success: false, 
        error: 'Search query is required' 
      });
    }

    // Use real SerpAPI like the Flask service does
    const axios = require('axios');
    const serpApiKey = process.env.SERPAPI_KEY;
    
    if (!serpApiKey) {
      return res.status(500).json({
        success: false,
        error: 'SERPAPI_KEY not configured'
      });
    }

    const searchParams = {
      q: query,
      engine: 'google',
      api_key: serpApiKey,
      num: 10
    };

    const response = await axios.get('https://serpapi.com/search', {
      params: searchParams,
      timeout: 30000
    });

    const serpResults = response.data;
    
    res.json({
      success: true,
      query: query,
      searchEngine: "Google (via SerpAPI)",
      count: serpResults.organic_results ? serpResults.organic_results.length : 0,
      results: {
        search_metadata: serpResults.search_metadata,
        search_parameters: serpResults.search_parameters,
        search_information: serpResults.search_information,
        organic_results: serpResults.organic_results || [],
        related_searches: serpResults.related_searches || []
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('SERP search error:', error);
    if (error.response) {
      res.status(500).json({
        success: false,
        error: `SerpAPI error: ${error.response.status} - ${error.response.data?.error || error.response.statusText}`
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
});

// Search Tools page
app.get('/search-tools', (req, res) => {
  const fs = require('fs');
  
  try {
    // Load the simplified tabbed search tools page
    const htmlContent = fs.readFileSync(path.join(__dirname, 'search-tools-simple-tabs.html'), 'utf8');
    res.send(htmlContent);
  } catch (error) {
    console.error('Error loading search tools page:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Search Tools - Error - PartnerPlus</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg">
      </head>
      <body>
        ${generateNavigation('search-tools')}
        <div style="max-width: 1200px; margin: 0 auto; padding: 20px;">
          <h1>Search Tools - Loading Error</h1>
          <p>Could not load the search tools interface. Error: ${error.message}</p>
          <p>File path attempted: ${path.join(__dirname, 'search-tools-simple.html')}</p>
        </div>
      </body>
      </html>
    `);
  }
});

// Code Executor page
app.get('/executor', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Code Executor - PartnerPlus</title>
      <link rel="icon" type="image/svg+xml" href="/favicon.svg">
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
        .header { background-color: #1976d2; color: white; padding: 15px 0; margin-bottom: 20px; width: 100%; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header-inner { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
        .nav { display: flex; align-items: center; }
        .nav h1 { margin: 0; margin-right: 30px; font-size: 24px; color: white; }
        .nav a { color: white; text-decoration: none; padding: 8px 16px; margin-right: 10px; border-radius: 4px; transition: background-color 0.3s; }
        .nav a:hover { background-color: rgba(255,255,255,0.1); }
        .nav a.active { background-color: rgba(255,255,255,0.2); }
        .content { max-width: 1200px; margin: 0 auto; padding: 0 20px 60px 20px; }
        .container { display: flex; gap: 20px; flex-wrap: wrap; }
        .section { flex: 1; min-width: 300px; border: 1px solid #ccc; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
        h2 { margin-top: 0; color: #1976d2; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        select, textarea { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
        textarea { min-height: 200px; font-family: 'Monaco', 'Consolas', monospace; font-size: 14px; }
        button { padding: 10px 20px; background-color: #1976d2; color: white; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px; }
        button:hover { background-color: #1565c0; }
        button:disabled { background-color: #ccc; cursor: not-allowed; }
        button.execute { background-color: #2e7d32; }
        button.execute:hover { background-color: #1b5e20; }
        button.clear { background-color: #d32f2f; }
        button.clear:hover { background-color: #c62828; }
        .output { background-color: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; padding: 15px; min-height: 200px; font-family: 'Monaco', 'Consolas', monospace; white-space: pre-wrap; font-size: 14px; overflow-y: auto; max-height: 400px; }
        .output.success { border-left: 4px solid #4caf50; }
        .output.error { border-left: 4px solid #f44336; background-color: #ffebee; }
        .language-badge { display: inline-block; background-color: #1976d2; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; margin-bottom: 10px; }
        .status { padding: 10px; margin: 10px 0; border-radius: 5px; }
        .status.success { background-color: #d4edda; color: #155724; }
        .status.error { background-color: #f8d7da; color: #721c24; }
        .status.info { background-color: #d1ecf1; color: #0c5460; }
        .examples { background-color: #e3f2fd; padding: 15px; border-radius: 5px; margin-bottom: 15px; }
        .examples h3 { margin-top: 0; color: #1976d2; }
        .examples code { background-color: white; padding: 2px 4px; border-radius: 3px; font-family: 'Monaco', 'Consolas', monospace; }
        .html-preview { border: 1px solid #ddd; border-radius: 4px; background: white; min-height: 200px; }
        .html-preview iframe { width: 100%; height: 300px; border: none; }
        ${dropdownStyles}
      </style>
    </head>
    <body>
      ${generateNavigation('executor')}
      <div class="content">
        <h2>Code Executor</h2>
        <p>Execute code in multiple languages. Code can be imported from AI Agent conversations.</p>
        
        <div class="examples">
          <h3>Supported Languages:</h3>
          <p><strong>JavaScript:</strong> <code>console.log("Hello World")</code></p>
          <p><strong>Python:</strong> <code>print("Hello World")</code></p>
          <p><strong>Bash:</strong> <code>echo "Hello World"</code></p>
          <p><strong>HTML:</strong> <code>&lt;h1&gt;Hello World&lt;/h1&gt;</code></p>
          <p><strong>CSS:</strong> <code>body { color: blue; }</code></p>
        </div>
        
        <div class="container">
          <div class="section">
            <h2>Code Input</h2>
            <div class="form-group">
              <label for="language">Language:</label>
              <select id="language" onchange="updateLanguage()">
                <option value="javascript">JavaScript</option>
                <option value="python">Python</option>
                <option value="bash">Bash</option>
                <option value="html">HTML</option>
                <option value="css">CSS</option>
              </select>
            </div>
            <div class="form-group">
              <label for="code">Code:</label>
              <textarea id="code" placeholder="Enter your code here..." oninput="updateLineNumbers()"></textarea>
            </div>
            <button class="execute" onclick="executeCode()" id="executeBtn">Execute Code</button>
            <button class="clear" onclick="clearCode()">Clear</button>
            <button onclick="loadFromStorage()">Load from AI Chat</button>
            <div id="executeStatus"></div>
          </div>

          <div class="section">
            <h2>Output</h2>
            <div id="languageBadge" class="language-badge">JavaScript</div>
            <div id="output" class="output">Ready to execute code...</div>
            <div id="htmlPreview" class="html-preview" style="display: none;">
              <h3>HTML Preview:</h3>
              <iframe id="htmlFrame"></iframe>
            </div>
          </div>
        </div>
      </div>

      <script>
        // Load code from localStorage if available (from AI chat)
        window.onload = () => {
          loadFromStorage();
        };

        function loadFromStorage() {
          const extractedCode = localStorage.getItem('extractedCode');
          const codeLanguage = localStorage.getItem('codeLanguage');
          
          if (extractedCode) {
            document.getElementById('code').value = extractedCode;
            if (codeLanguage) {
              document.getElementById('language').value = codeLanguage;
              updateLanguage();
            }
            
            // Clear from storage after loading
            localStorage.removeItem('extractedCode');
            localStorage.removeItem('codeLanguage');
            
            // Show status
            const statusDiv = document.getElementById('executeStatus');
            statusDiv.className = 'status info';
            statusDiv.textContent = 'Code loaded from AI Agent chat';
          }
        }

        function updateLanguage() {
          const language = document.getElementById('language').value;
          const badge = document.getElementById('languageBadge');
          badge.textContent = language.charAt(0).toUpperCase() + language.slice(1);
          
          // Update placeholder based on language
          const codeArea = document.getElementById('code');
          const placeholders = {
            javascript: 'console.log("Hello, World!");\\n\\n// Your JavaScript code here',
            python: 'print("Hello, World!")\\n\\n# Your Python code here',
            bash: 'echo "Hello, World!"\\n\\n# Your bash commands here',
            html: '<!DOCTYPE html>\\n<html>\\n<body>\\n<h1>Hello, World!</h1>\\n</body>\\n</html>',
            css: 'body {\\n  background-color: #f0f0f0;\\n  font-family: Arial, sans-serif;\\n}'
          };
          
          if (!codeArea.value) {
            codeArea.placeholder = placeholders[language] || 'Enter your code here...';
          }
        }

        function clearCode() {
          document.getElementById('code').value = '';
          document.getElementById('output').textContent = 'Ready to execute code...';
          document.getElementById('output').className = 'output';
          document.getElementById('htmlPreview').style.display = 'none';
          document.getElementById('executeStatus').textContent = '';
        }

        async function executeCode() {
          const code = document.getElementById('code').value.trim();
          const language = document.getElementById('language').value;
          const executeBtn = document.getElementById('executeBtn');
          const output = document.getElementById('output');
          const statusDiv = document.getElementById('executeStatus');
          const htmlPreview = document.getElementById('htmlPreview');
          
          if (!code) {
            statusDiv.className = 'status error';
            statusDiv.textContent = 'Please enter some code to execute';
            return;
          }

          executeBtn.disabled = true;
          executeBtn.textContent = 'Executing...';
          output.textContent = 'Executing code...';
          output.className = 'output';
          htmlPreview.style.display = 'none';
          statusDiv.textContent = '';

          try {
            const response = await fetch('/api/execute-code', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code, language })
            });

            const result = await response.json();
            
            if (result.success) {
              output.className = 'output success';
              output.textContent = result.output || 'Code executed successfully (no output)';
              
              statusDiv.className = 'status success';
              statusDiv.textContent = 'Code executed successfully';
              
              // Special handling for HTML
              if (language === 'html' && result.htmlContent) {
                htmlPreview.style.display = 'block';
                const iframe = document.getElementById('htmlFrame');
                iframe.srcdoc = result.htmlContent;
              }
              
              // Special handling for CSS
              if (language === 'css' && result.cssContent) {
                output.textContent = 'CSS validated successfully\\n\\n' + result.cssContent;
              }
              
            } else {
              output.className = 'output error';
              output.textContent = result.error || 'Unknown error occurred';
              
              statusDiv.className = 'status error';
              statusDiv.textContent = 'Execution failed';
            }
          } catch (error) {
            output.className = 'output error';
            output.textContent = 'Network error: ' + error.message;
            
            statusDiv.className = 'status error';
            statusDiv.textContent = 'Failed to execute code';
          } finally {
            executeBtn.disabled = false;
            executeBtn.textContent = 'Execute Code';
          }
        }

        // Allow Ctrl+Enter to execute code
        document.getElementById('code').addEventListener('keydown', function(e) {
          if (e.ctrlKey && e.key === 'Enter') {
            executeCode();
          }
        });

        // Initialize
        updateLanguage();
      </script>
    </body>
    </html>
  `);
});

// Purchase Agent page
app.get('/purchase-agent', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Purchase Agent - PartnerPlus</title>
      <link rel="icon" type="image/svg+xml" href="/favicon.svg">
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
        .header { background-color: #1976d2; color: white; padding: 15px 0; margin-bottom: 20px; width: 100%; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header-inner { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
        .nav { display: flex; align-items: center; }
        .nav h1 { margin: 0; margin-right: 30px; font-size: 24px; color: white; }
        .nav a { color: white; text-decoration: none; padding: 8px 16px; margin-right: 10px; border-radius: 4px; transition: background-color 0.3s; }
        .nav a:hover { background-color: rgba(255,255,255,0.1); }
        .nav a.active { background-color: rgba(255,255,255,0.2); }
        .content { max-width: 1200px; margin: 0 auto; padding: 0 20px 60px 20px; }
        .tabs { display: flex; border-bottom: 2px solid #1976d2; margin-bottom: 20px; }
        .tab { padding: 10px 20px; cursor: pointer; border-radius: 4px 4px 0 0; margin-right: 5px; background-color: #f5f5f5; }
        .tab.active { background-color: #1976d2; color: white; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        .section { background-color: white; border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; color: #333; }
        input, select, textarea { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; font-size: 14px; }
        textarea { min-height: 80px; resize: vertical; }
        button { padding: 10px 20px; background-color: #1976d2; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px; margin-right: 10px; }
        button:hover { background-color: #1565c0; }
        button:disabled { background-color: #ccc; cursor: not-allowed; }
        button.secondary { background-color: #757575; }
        button.secondary:hover { background-color: #616161; }
        .results { margin-top: 20px; }
        .result-item { background-color: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 4px; padding: 15px; margin-bottom: 10px; }
        .result-header { font-weight: bold; margin-bottom: 10px; color: #1976d2; }
        .result-detail { margin: 5px 0; font-size: 14px; }
        .confidence { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; }
        .confidence.high { background-color: #4caf50; color: white; }
        .confidence.medium { background-color: #ff9800; color: white; }
        .confidence.low { background-color: #f44336; color: white; }
        .loading { text-align: center; padding: 20px; }
        .spinner { border: 3px solid #f3f3f3; border-top: 3px solid #1976d2; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .error { background-color: #ffebee; color: #c62828; padding: 10px; border-radius: 4px; margin: 10px 0; }
        .success { background-color: #e8f5e9; color: #2e7d32; padding: 10px; border-radius: 4px; margin: 10px 0; }
        .info { background-color: #e3f2fd; color: #1565c0; padding: 10px; border-radius: 4px; margin: 10px 0; }
        .supplier-list { list-style: none; padding: 0; }
        .supplier-item { background-color: #f5f5f5; padding: 10px; margin-bottom: 8px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; }
        .supplier-name { font-weight: bold; }
        .supplier-price { color: #2e7d32; }
        .manual-item { display: flex; align-items: center; padding: 10px; background-color: #f5f5f5; margin-bottom: 8px; border-radius: 4px; }
        .manual-title { flex: 1; margin-right: 10px; }
        .manual-actions { display: flex; gap: 10px; }
        .status-indicator { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 10px; }
        .status-indicator.running { background-color: #4caf50; animation: pulse 1.5s infinite; }
        .status-indicator.stopped { background-color: #f44336; }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
        ${dropdownStyles}
      </style>
    </head>
    <body>
      ${generateNavigation('purchase-agent')}
      <div class="content">
        <h2>Purchase Agent <span id="serviceStatus"><span class="status-indicator stopped"></span>Service Stopped</span></h2>
        <div class="info">
          Intelligent parts resolution, manual search, and supplier finding for equipment maintenance.
        </div>
        
        <div class="tabs">
          <div class="tab active" onclick="switchTab('parts')">Part Resolution</div>
          <div class="tab" onclick="switchTab('manuals')">Manual Search</div>
          <div class="tab" onclick="switchTab('suppliers')">Supplier Search</div>
          <div class="tab" onclick="switchTab('service')">Service Repair</div>
          <div class="tab" onclick="switchTab('equipment-images')">Equipment Images</div>
          <div class="tab" onclick="switchTab('part-images')">Part Images</div>
        </div>

        <!-- Part Resolution Tab -->
        <div id="parts-tab" class="tab-content active">
          <div class="section">
            <h3>Resolve Generic Part to OEM Number</h3>
            <form id="partResolveForm">
              <div class="form-group">
                <label for="partDescription">Part Description *</label>
                <input type="text" id="partDescription" name="description" placeholder="e.g., Bowl Lift Motor, Door Gasket, Temperature Sensor" required>
              </div>
              <div class="form-group">
                <label for="partMake">Equipment Make</label>
                <input type="text" id="partMake" name="make" placeholder="e.g., Hobart, True, Vulcan">
              </div>
              <div class="form-group">
                <label for="partModel">Equipment Model</label>
                <input type="text" id="partModel" name="model" placeholder="e.g., HL600, T-49F, VC4GD">
              </div>
              <div class="form-group">
                <label>Search Options</label>
                <div style="display: flex; gap: 20px; margin-top: 10px;">
                  <label style="font-weight: normal;">
                    <input type="checkbox" name="useDatabase" checked> Use Database
                  </label>
                  <label style="font-weight: normal;">
                    <input type="checkbox" name="useManualSearch" checked> Search Manuals
                  </label>
                  <label style="font-weight: normal;">
                    <input type="checkbox" name="useWebSearch" checked> Web Search
                  </label>
                </div>
              </div>
              <button type="submit">Resolve Part</button>
              <button type="button" class="secondary" onclick="clearPartForm()">Clear</button>
            </form>
          </div>
          <div id="partResults" class="results"></div>
        </div>

        <!-- Manual Search Tab -->
        <div id="manuals-tab" class="tab-content">
          <div class="section">
            <h3>Search Equipment Manuals</h3>
            <form id="manualSearchForm">
              <div class="form-group">
                <label for="manualMake">Equipment Make *</label>
                <input type="text" id="manualMake" name="make" placeholder="e.g., Hobart, True, Vulcan" required>
              </div>
              <div class="form-group">
                <label for="manualModel">Equipment Model *</label>
                <input type="text" id="manualModel" name="model" placeholder="e.g., HL600, T-49F, VC4GD" required>
              </div>
              <div class="form-group">
                <label for="manualCategory">Manual Type</label>
                <select id="manualCategory" name="category">
                  <option value="">All Types</option>
                  <option value="parts">Parts Manual</option>
                  <option value="service">Service Manual</option>
                  <option value="installation">Installation Manual</option>
                  <option value="user">User Manual</option>
                </select>
              </div>
              <button type="submit">Search Manuals</button>
              <button type="button" class="secondary" onclick="clearManualForm()">Clear</button>
            </form>
          </div>
          <div id="manualResults" class="results"></div>
        </div>

        <!-- Supplier Search Tab -->
        <div id="suppliers-tab" class="tab-content">
          <div class="section">
            <h3>Find Parts Suppliers</h3>
            <form id="supplierSearchForm">
              <div class="form-group">
                <label for="supplierPartNumber">Part Number *</label>
                <input type="text" id="supplierPartNumber" name="partNumber" placeholder="e.g., 00-917676, WS-34268" required>
              </div>
              <div class="form-group">
                <label for="supplierMake">Equipment Make (optional)</label>
                <input type="text" id="supplierMake" name="make" placeholder="e.g., Hobart, True, Vulcan">
              </div>
              <div class="form-group">
                <label for="supplierModel">Equipment Model (optional)</label>
                <input type="text" id="supplierModel" name="model" placeholder="e.g., HL600, T-49F, VC4GD">
              </div>
              <button type="submit">Find Suppliers</button>
              <button type="button" class="secondary" onclick="clearSupplierForm()">Clear</button>
            </form>
          </div>
          <div id="supplierResults" class="results"></div>
        </div>

        <!-- Service Repair Tab -->
        <div id="service-tab" class="tab-content">
          <div class="section">
            <h3>Find Service Repair Companies</h3>
            <form id="serviceSearchForm">
              <div class="form-group">
                <label for="serviceZipCode">Zip Code *</label>
                <input type="text" id="serviceZipCode" name="zipCode" required placeholder="Enter zip code (e.g., 10001)">
              </div>
              <div class="form-group">
                <label for="serviceMake">Equipment Make *</label>
                <input type="text" id="serviceMake" name="make" required placeholder="e.g., Hobart, Pitco, Vulcan">
              </div>
              <div class="form-group">
                <label for="serviceModel">Equipment Model</label>
                <input type="text" id="serviceModel" name="model" placeholder="e.g., HL600, SE14">
              </div>
              <div class="form-group">
                <label for="serviceType">Service Type</label>
                <select id="serviceType" name="serviceType">
                  <option value="">All Services</option>
                  <option value="repair">Repair</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="installation">Installation</option>
                  <option value="parts">Parts & Service</option>
                </select>
              </div>
              <div class="form-actions">
                <button type="submit" class="primary">Search Service Companies</button>
                <button type="button" onclick="clearServiceForm()" class="secondary">Clear</button>
              </div>
            </form>
          </div>
          <div id="serviceResults" class="results"></div>
        </div>
      </div>

      <!-- Equipment Images Tab -->
      <div id="equipment-images-tab" class="tab-content">
        <div class="section">
          <h3>Find Equipment Images</h3>
          <form id="equipmentImageForm">
            <div class="form-group">
              <label for="equipmentImageMake">Equipment Make *</label>
              <input type="text" id="equipmentImageMake" name="make" placeholder="e.g., Caterpillar, John Deere" required>
            </div>
            <div class="form-group">
              <label for="equipmentImageModel">Equipment Model *</label>
              <input type="text" id="equipmentImageModel" name="model" placeholder="e.g., 320D, D6T" required>
            </div>
            <button type="submit" class="search-button">Find Best Image</button>
          </form>
          <div id="equipmentImageResults" class="results"></div>
        </div>
      </div>

      <!-- Part Images Tab -->
      <div id="part-images-tab" class="tab-content">
        <div class="section">
          <h3>Find Part Images</h3>
          <form id="partImageForm">
            <div class="form-group">
              <label for="partImageMake">Equipment Make *</label>
              <input type="text" id="partImageMake" name="make" placeholder="e.g., Caterpillar, John Deere" required>
            </div>
            <div class="form-group">
              <label for="partImageModel">Equipment Model *</label>
              <input type="text" id="partImageModel" name="model" placeholder="e.g., 320D, D6T" required>
            </div>
            <div class="form-group">
              <label for="partImageName">Part Name *</label>
              <input type="text" id="partImageName" name="part_name" placeholder="e.g., hydraulic filter, fuel pump" required>
            </div>
            <div class="form-group">
              <label for="partImageOEM">OEM Number (optional)</label>
              <input type="text" id="partImageOEM" name="oem_number" placeholder="e.g., 1R-0770, 326-1644">
            </div>
            <button type="submit" class="search-button">Find Best Image</button>
          </form>
          <div id="partImageResults" class="results"></div>
        </div>
      </div>

      <script>
        let serviceRunning = false;

        // Check service status on load
        window.onload = async () => {
          checkServiceStatus();
          startService();
        };

        async function checkServiceStatus() {
          try {
            const response = await fetch('/api/purchase-agent/health');
            const data = await response.json();
            updateServiceStatus(data.success && data.health);
          } catch (error) {
            updateServiceStatus(false);
          }
        }

        function updateServiceStatus(running) {
          serviceRunning = running;
          const statusEl = document.getElementById('serviceStatus');
          const indicator = statusEl.querySelector('.status-indicator');
          
          if (running) {
            indicator.className = 'status-indicator running';
            statusEl.innerHTML = '<span class="status-indicator running"></span>Service Running';
          } else {
            indicator.className = 'status-indicator stopped';
            statusEl.innerHTML = '<span class="status-indicator stopped"></span>Service Stopped';
          }
        }

        async function startService() {
          if (serviceRunning) return;
          
          try {
            const response = await fetch('/api/purchase-agent/start', { method: 'POST' });
            const data = await response.json();
            
            if (data.success) {
              setTimeout(() => checkServiceStatus(), 3000);
            }
          } catch (error) {
            console.error('Failed to start service:', error);
          }
        }

        function switchTab(tabName) {
          // Update tab buttons
          document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
          });
          event.target.classList.add('active');

          // Update tab content
          document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
          });
          document.getElementById(tabName + '-tab').classList.add('active');
        }

        // Part Resolution Form
        document.getElementById('partResolveForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const resultsDiv = document.getElementById('partResults');
          resultsDiv.innerHTML = '<div class="loading"><div class="spinner"></div>Resolving part...</div>';

          const formData = new FormData(e.target);
          const data = {
            description: formData.get('description'),
            make: formData.get('make'),
            model: formData.get('model'),
            options: {
              useDatabase: formData.get('useDatabase') === 'on',
              useManualSearch: formData.get('useManualSearch') === 'on',
              useWebSearch: formData.get('useWebSearch') === 'on'
            }
          };

          try {
            const response = await fetch('/api/purchase-agent/parts/resolve', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            });

            const result = await response.json();
            
            if (result.success && result.data) {
              displayPartResults(result.data);
            } else {
              resultsDiv.innerHTML = '<div class="error">Failed to resolve part: ' + (result.error || 'Unknown error') + '</div>';
            }
          } catch (error) {
            resultsDiv.innerHTML = '<div class="error">Error: ' + error.message + '</div>';
          }
        });

        function displayPartResults(data) {
          const resultsDiv = document.getElementById('partResults');
          let html = '';

          if (data.recommended_result) {
            const conf = data.recommended_result.confidence;
            const confClass = conf >= 0.8 ? 'high' : conf >= 0.5 ? 'medium' : 'low';
            
            // Clean prominent display of just the OEM part number
            html += '<div class="result-item" style="background-color: #e8f5e9; border-left: 4px solid #4caf50;">';
            html += '<div class="result-header" style="color: #2e7d32; font-size: 18px;">✅ OEM Part Number</div>';
            html += '<div style="font-size: 24px; font-weight: bold; margin: 10px 0; color: #1976d2;">' + 
                    data.recommended_result.oem_part_number + '</div>';
            html += '<div class="result-detail"><strong>Confidence:</strong> <span class="confidence ' + confClass + '">' + 
                    (conf * 100).toFixed(0) + '%</span></div>';
            if (data.recommended_result.selection_metadata) {
              html += '<div class="result-detail"><strong>Source:</strong> ' + 
                      data.recommended_result.selection_metadata.selected_from.replace(/_/g, ' ') + '</div>';
            }
            html += '</div>';
          }

          // Raw response section
          html += '<div class="result-item">';
          html += '<div class="result-header">Full API Response</div>';
          html += '<details style="margin-top: 10px;">';
          html += '<summary style="cursor: pointer; font-weight: bold; padding: 5px;">🔍 View Raw Response Data</summary>';
          html += '<pre style="background-color: #f5f5f5; padding: 15px; border-radius: 4px; overflow-x: auto; font-size: 12px; margin-top: 10px;">' + 
                  JSON.stringify(data, null, 2) + '</pre>';
          html += '</details>';
          html += '</div>';

          if (data.results) {
            html += '<div class="result-item">';
            html += '<div class="result-header">Search Methods Used</div>';
            
            if (data.results.database) {
              html += '<div class="result-detail"><strong>Database:</strong> ' + 
                      (data.results.database ? 'Searched' : 'Not used') + '</div>';
            }
            
            if (data.results.manual_search) {
              html += '<div class="result-detail"><strong>Manual Search:</strong> ' + 
                      (data.results.manual_search ? 'Searched' : 'Not used') + '</div>';
            }
            
            if (data.results.ai_web_search) {
              html += '<div class="result-detail"><strong>AI Web Search:</strong> ' + 
                      (data.results.ai_web_search ? 'Searched' : 'Not used') + '</div>';
            }
            html += '</div>';
          }

          resultsDiv.innerHTML = html || '<div class="info">No results found</div>';
        }

        // Manual Search Form
        document.getElementById('manualSearchForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const resultsDiv = document.getElementById('manualResults');
          resultsDiv.innerHTML = '<div class="loading"><div class="spinner"></div>Searching manuals...</div>';

          const formData = new FormData(e.target);
          const params = new URLSearchParams({
            make: formData.get('make'),
            model: formData.get('model'),
            category: formData.get('category')
          });

          try {
            const response = await fetch('/api/purchase-agent/manuals/search?' + params);
            const result = await response.json();
            
            if (result.success && result.data) {
              displayManualResults(result.data);
            } else {
              resultsDiv.innerHTML = '<div class="error">Failed to search manuals: ' + (result.error || 'Unknown error') + '</div>';
            }
          } catch (error) {
            resultsDiv.innerHTML = '<div class="error">Error: ' + error.message + '</div>';
          }
        });

        function displayManualResults(data) {
          const resultsDiv = document.getElementById('manualResults');
          let html = '';

          if (data.results && data.results.length > 0) {
            html += '<div class="result-item">';
            html += '<div class="result-header">Found ' + data.results.length + ' manual(s)</div>';
            
            data.results.forEach(manual => {
              html += '<div class="manual-item">';
              html += '<div class="manual-title">' + manual.title + '</div>';
              if (manual.snippet) {
                html += '<div class="manual-snippet" style="font-size: 12px; color: #666; margin: 5px 0;">' + manual.snippet + '</div>';
              }
              html += '<div class="manual-meta" style="font-size: 11px; color: #888; margin: 5px 0;">Pages: ' + (manual.pages || 'Unknown') + ' | Source: ' + (manual.source_domain || 'Unknown') + '</div>';
              html += '<div class="manual-actions">';
              if (manual.url) {
                html += '<a href="' + manual.url + '" target="_blank"><button class="secondary">View</button></a>';
              }
              html += '</div>';
              html += '</div>';
            });
            html += '</div>';
          } else {
            html = '<div class="info">No manuals found</div>';
          }

          // Raw response section
          html += '<div class="result-item">';
          html += '<div class="result-header">Full API Response</div>';
          html += '<details style="margin-top: 10px;">';
          html += '<summary style="cursor: pointer; font-weight: bold; padding: 5px;">🔍 View Raw Response Data</summary>';
          html += '<pre style="background-color: #f5f5f5; padding: 15px; border-radius: 4px; overflow-x: auto; font-size: 12px; margin-top: 10px;">' + 
                  JSON.stringify(data, null, 2) + '</pre>';
          html += '</details>';
          html += '</div>';

          resultsDiv.innerHTML = html;
        }

        // Supplier Search Form
        document.getElementById('supplierSearchForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const resultsDiv = document.getElementById('supplierResults');
          resultsDiv.innerHTML = '<div class="loading"><div class="spinner"></div>Searching suppliers...</div>';

          const formData = new FormData(e.target);
          const data = {
            partNumber: formData.get('partNumber'),
            options: {
              make: formData.get('make'),
              model: formData.get('model')
            }
          };

          try {
            const response = await fetch('/api/purchase-agent/suppliers/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            });

            const result = await response.json();
            
            if (result.success && result.data) {
              displaySupplierResults(result.data);
            } else {
              resultsDiv.innerHTML = '<div class="error">Failed to search suppliers: ' + (result.error || 'Unknown error') + '</div>';
            }
          } catch (error) {
            resultsDiv.innerHTML = '<div class="error">Error: ' + error.message + '</div>';
          }
        });

        function displaySupplierResults(data) {
          const resultsDiv = document.getElementById('supplierResults');
          let html = '';

          if (data.suppliers && data.suppliers.length > 0) {
            html += '<div class="result-item">';
            html += '<div class="result-header">Found ' + data.suppliers.length + ' supplier(s)</div>';
            if (data.ranking_method) {
              html += '<div style="font-size: 12px; color: #666; margin: 5px 0;">Ranking: ' + data.ranking_method + '</div>';
            }
            html += '<ul class="supplier-list">';
            
            data.suppliers.forEach(supplier => {
              html += '<li class="supplier-item">';
              html += '<div>';
              html += '<div class="supplier-name">' + (supplier.title || supplier.domain) + '</div>';
              if (supplier.snippet) {
                html += '<div style="font-size: 12px; color: #666; margin: 5px 0;">' + supplier.snippet + '</div>';
              }
              html += '<div style="font-size: 11px; color: #888;">Domain: ' + supplier.domain + (supplier.ai_ranking ? ' (AI Ranked)' : '') + '</div>';
              html += '</div>';
              html += '<div>';
              if (supplier.price) {
                html += '<div class="supplier-price">' + supplier.price + '</div>';
              }
              html += '<a href="' + supplier.url + '" target="_blank"><button class="secondary">View</button></a>';
              html += '</div>';
              html += '</li>';
            });
            html += '</ul>';
            html += '</div>';
          } else {
            html = '<div class="info">No suppliers found</div>';
          }

          // Raw response section
          html += '<div class="result-item">';
          html += '<div class="result-header">Full API Response</div>';
          html += '<details style="margin-top: 10px;">';
          html += '<summary style="cursor: pointer; font-weight: bold; padding: 5px;">🔍 View Raw Response Data</summary>';
          html += '<pre style="background-color: #f5f5f5; padding: 15px; border-radius: 4px; overflow-x: auto; font-size: 12px; margin-top: 10px;">' + 
                  JSON.stringify(data, null, 2) + '</pre>';
          html += '</details>';
          html += '</div>';

          resultsDiv.innerHTML = html;
        }

        // Clear functions
        function clearPartForm() {
          document.getElementById('partResolveForm').reset();
          document.getElementById('partResults').innerHTML = '';
        }

        function clearManualForm() {
          document.getElementById('manualSearchForm').reset();
          document.getElementById('manualResults').innerHTML = '';
        }

        function clearSupplierForm() {
          document.getElementById('supplierSearchForm').reset();
          document.getElementById('supplierResults').innerHTML = '';
        }

        // Service Search Form
        document.getElementById('serviceSearchForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const resultsDiv = document.getElementById('serviceResults');
          resultsDiv.innerHTML = '<div class="loading"><div class="spinner"></div>Searching service companies...</div>';

          const formData = new FormData(e.target);
          const zipCode = formData.get('zipCode');
          const make = formData.get('make');
          const model = formData.get('model') || '';
          const serviceType = formData.get('serviceType') || '';

          try {
            const response = await fetch('/api/purchase-agent/service-search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                zipCode,
                make,
                model,
                serviceType
              })
            });

            const result = await response.json();
            
            if (result.success) {
              displayServiceResults(result.data);
            } else {
              resultsDiv.innerHTML = '<div class="error">Failed to search service companies: ' + (result.error || 'Unknown error') + '</div>';
            }
          } catch (error) {
            resultsDiv.innerHTML = '<div class="error">Error: ' + error.message + '</div>';
          }
        });

        function displayServiceResults(data) {
          const resultsDiv = document.getElementById('serviceResults');
          let html = '';

          if (data.companies && data.companies.length > 0) {
            html += '<div class="result-item">';
            html += '<div class="result-header">Found ' + data.companies.length + ' service company(s)</div>';
            if (data.search_location) {
              html += '<div style="font-size: 12px; color: #666; margin: 5px 0;">Location: ' + data.search_location + '</div>';
            }
            html += '<ul class="supplier-list">';
            
            data.companies.forEach(company => {
              html += '<li class="supplier-item">';
              html += '<div>';
              html += '<div class="supplier-name">' + (company.name || company.title) + '</div>';
              if (company.address) {
                html += '<div style="font-size: 12px; color: #666; margin: 5px 0;">📍 ' + company.address + '</div>';
              }
              if (company.phone) {
                html += '<div style="font-size: 12px; color: #008000; margin: 5px 0;">📞 ' + company.phone + '</div>';
              }
              if (company.rating) {
                html += '<div style="font-size: 11px; color: #ff6f00; margin: 5px 0;">⭐ ' + company.rating + '</div>';
              }
              if (company.services) {
                html += '<div style="font-size: 11px; color: #888; margin: 5px 0;">Services: ' + company.services + '</div>';
              }
              html += '</div>';
              html += '<div>';
              if (company.website || company.url) {
                html += '<a href="' + (company.website || company.url) + '" target="_blank"><button class="secondary">View</button></a>';
              }
              html += '</div>';
              html += '</li>';
            });
            html += '</ul>';
            html += '</div>';
          } else {
            html = '<div class="info">No service companies found in this area</div>';
          }

          // Raw response section
          html += '<div class="result-item">';
          html += '<div class="result-header">Full API Response</div>';
          html += '<details style="margin-top: 10px;">';
          html += '<summary style="cursor: pointer; font-weight: bold; padding: 5px;">🔍 View Raw Response Data</summary>';
          html += '<pre style="background-color: #f5f5f5; padding: 15px; border-radius: 4px; overflow-x: auto; font-size: 12px; margin-top: 10px;">' + 
                  JSON.stringify(data, null, 2) + '</pre>';
          html += '</details>';
          html += '</div>';

          resultsDiv.innerHTML = html;
        }

        function clearServiceForm() {
          document.getElementById('serviceSearchForm').reset();
          document.getElementById('serviceResults').innerHTML = '';
        }

        // Equipment Image Search Form
        document.getElementById('equipmentImageForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const resultsDiv = document.getElementById('equipmentImageResults');
          resultsDiv.innerHTML = '<div class="loading"><div class="spinner"></div>Searching for best equipment image...</div>';

          const formData = new FormData(e.target);
          const make = formData.get('make');
          const model = formData.get('model');

          try {
            const response = await fetch('/api/purchase-agent/equipment-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ make, model })
            });

            const data = await response.json();
            
            if (data.success && data.image) {
              displayEquipmentImageResult(data);
            } else {
              resultsDiv.innerHTML = '<div class="error">No suitable equipment image found. Please try different search terms.</div>';
            }
          } catch (error) {
            console.error('Equipment image search error:', error);
            resultsDiv.innerHTML = '<div class="error">Error searching for equipment image: ' + error.message + '</div>';
          }
        });

        // Part Image Search Form
        document.getElementById('partImageForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const resultsDiv = document.getElementById('partImageResults');
          resultsDiv.innerHTML = '<div class="loading"><div class="spinner"></div>Searching for best part image...</div>';

          const formData = new FormData(e.target);
          const make = formData.get('make');
          const model = formData.get('model');
          const partName = formData.get('part_name');
          const oemNumber = formData.get('oem_number');

          try {
            const response = await fetch('/api/purchase-agent/part-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ make, model, partName, oemNumber })
            });

            const data = await response.json();
            
            if (data.success && data.image) {
              displayPartImageResult(data);
            } else {
              resultsDiv.innerHTML = '<div class="error">No suitable part image found. Please try different search terms.</div>';
            }
          } catch (error) {
            console.error('Part image search error:', error);
            resultsDiv.innerHTML = '<div class="error">Error searching for part image: ' + error.message + '</div>';
          }
        });

        // Display Equipment Image Result
        function displayEquipmentImageResult(data) {
          const resultsDiv = document.getElementById('equipmentImageResults');
          let html = '<div class="result-item">';
          
          html += '<h4>Best Equipment Image Found</h4>';
          html += '<div class="result-detail"><strong>Equipment:</strong> ' + data.equipment_make + ' ' + data.equipment_model + '</div>';
          
          if (data.image) {
            html += '<div class="image-result">';
            html += '<img src="' + data.image.url + '" alt="' + data.image.title + '" style="max-width: 100%; height: auto; margin: 10px 0;">';
            html += '<div class="result-detail"><strong>Title:</strong> ' + data.image.title + '</div>';
            html += '<div class="result-detail"><strong>Source:</strong> ' + data.image.source + '</div>';
            html += '<div class="result-detail"><strong>Confidence:</strong> ' + (data.image.confidence * 100).toFixed(0) + '%</div>';
            html += '<div class="result-detail"><strong>AI Reasoning:</strong> ' + data.image.reasoning + '</div>';
            
            if (data.image.analysis) {
              html += '<div class="result-detail"><strong>Analysis:</strong><ul>';
              html += '<li>Shows Full Equipment: ' + (data.image.analysis.shows_full_equipment ? 'Yes' : 'No') + '</li>';
              html += '<li>Manufacturer Image: ' + (data.image.analysis.is_manufacturer_image ? 'Yes' : 'No') + '</li>';
              html += '<li>Source Credibility: ' + data.image.analysis.source_credibility + '</li>';
              html += '</ul></div>';
            }
            
            html += '<div class="result-detail"><a href="' + data.image.url + '" target="_blank" class="secondary">View Full Image</a></div>';
            html += '</div>';
          }
          
          html += '<div class="result-detail" style="margin-top: 10px; font-size: 12px; color: #666;">';
          html += 'Analyzed ' + data.ai_analyzed_count + ' images from ' + data.total_images_found + ' search results';
          html += '</div>';
          
          html += '</div>';
          resultsDiv.innerHTML = html;
        }

        // Display Part Image Result
        function displayPartImageResult(data) {
          const resultsDiv = document.getElementById('partImageResults');
          let html = '<div class="result-item">';
          
          html += '<h4>Best Part Image Found</h4>';
          html += '<div class="result-detail"><strong>Part:</strong> ' + data.part_name + '</div>';
          if (data.oem_number) {
            html += '<div class="result-detail"><strong>OEM Number:</strong> ' + data.oem_number + '</div>';
          }
          html += '<div class="result-detail"><strong>Equipment:</strong> ' + data.equipment_make + ' ' + data.equipment_model + '</div>';
          
          if (data.image) {
            html += '<div class="image-result">';
            html += '<img src="' + data.image.url + '" alt="' + data.image.title + '" style="max-width: 100%; height: auto; margin: 10px 0;">';
            html += '<div class="result-detail"><strong>Title:</strong> ' + data.image.title + '</div>';
            html += '<div class="result-detail"><strong>Source:</strong> ' + data.image.source + '</div>';
            html += '<div class="result-detail"><strong>Confidence:</strong> ' + (data.image.confidence * 100).toFixed(0) + '%</div>';
            html += '<div class="result-detail"><strong>AI Reasoning:</strong> ' + data.image.reasoning + '</div>';
            
            if (data.image.analysis) {
              html += '<div class="result-detail"><strong>Analysis:</strong><ul>';
              html += '<li>Shows Actual Part: ' + (data.image.analysis.shows_actual_part ? 'Yes' : 'No') + '</li>';
              html += '<li>OEM Number Visible: ' + (data.image.analysis.oem_number_visible ? 'Yes' : 'No') + '</li>';
              html += '<li>Product Photo: ' + (data.image.analysis.is_product_photo ? 'Yes' : 'No') + '</li>';
              html += '<li>Source Type: ' + data.image.analysis.source_type + '</li>';
              html += '</ul></div>';
            }
            
            html += '<div class="result-detail"><a href="' + data.image.url + '" target="_blank" class="secondary">View Full Image</a></div>';
            html += '</div>';
          }
          
          html += '<div class="result-detail" style="margin-top: 10px; font-size: 12px; color: #666;">';
          html += 'Analyzed ' + data.ai_analyzed_count + ' images from ' + data.total_images_found + ' search results';
          html += '</div>';
          
          html += '</div>';
          resultsDiv.innerHTML = html;
        }
      </script>
    </body>
    </html>
  `);
});

// SMS Opt-In Policy page
app.get('/optin', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>SMS Opt-In Policy - PartnerPlus</title>
      <link rel="icon" type="image/svg+xml" href="/favicon.svg">
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
        .header { background-color: #1976d2; color: white; padding: 15px 0; margin-bottom: 20px; width: 100%; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header-inner { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
        .nav { display: flex; align-items: center; }
        .nav h1 { margin: 0; margin-right: 30px; font-size: 24px; color: white; }
        .nav a { color: white; text-decoration: none; padding: 8px 16px; margin-right: 10px; border-radius: 4px; transition: background-color 0.3s; }
        .nav a:hover { background-color: rgba(255,255,255,0.1); }
        .content { max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
        h1, h2 { color: #1976d2; }
        .policy-section { margin-bottom: 30px; }
        .highlight { background-color: #e3f2fd; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .contact-info { background-color: #f5f5f5; padding: 15px; border-radius: 5px; }
        a { color: #1976d2; }
      </style>
    </head>
    <body>
      ${generateNavigation('optin')}
      <div class="content">
        <h1>SMS Opt-In Policy & Terms of Service</h1>
        
        <div class="highlight">
          <strong>By providing your phone number and using our SMS service, you agree to receive text messages from PartnerPlus.</strong>
        </div>

        <div class="policy-section">
          <h2>1. Consent to Receive Messages</h2>
          <p>By providing your mobile phone number to PartnerPlus, you expressly consent to receive text messages from us. This includes:</p>
          <ul>
            <li>Service notifications and updates</li>
            <li>Responses to your inquiries</li>
            <li>Administrative messages related to your account</li>
          </ul>
        </div>

        <div class="policy-section">
          <h2>2. Message Frequency</h2>
          <p>Message frequency varies based on your usage and interactions with our service. You may receive messages in response to your inquiries or as part of our service delivery.</p>
        </div>

        <div class="policy-section">
          <h2>3. Message and Data Rates</h2>
          <p><strong>Message and data rates may apply.</strong> Standard messaging rates from your wireless carrier will apply to all SMS messages sent and received through our service.</p>
        </div>

        <div class="policy-section">
          <h2>4. Opt-Out Instructions</h2>
          <p>You can opt out of receiving SMS messages at any time by:</p>
          <ul>
            <li>Replying <strong>STOP</strong> to any message from our service</li>
            <li>Contacting us using the information provided below</li>
          </ul>
          <p>After opting out, you will receive a confirmation message, and no further messages will be sent to your number unless you opt back in.</p>
        </div>

        <div class="policy-section">
          <h2>5. Help and Support</h2>
          <p>For help or questions about our SMS service, reply <strong>HELP</strong> to any message or contact us using the information below.</p>
        </div>

        <div class="policy-section">
          <h2>6. Privacy</h2>
          <p>We respect your privacy and will not share your phone number with third parties without your consent, except as required by law or to provide our services. Your phone number and message content are used solely for service delivery and communication purposes.</p>
        </div>

        <div class="policy-section">
          <h2>7. Service Availability</h2>
          <p>SMS service is available to users in the United States. Service availability depends on your carrier network and may not be available in all areas.</p>
        </div>

        <div class="policy-section">
          <h2>8. Changes to Policy</h2>
          <p>We may update this SMS policy from time to time. Continued use of our SMS service after changes indicates your acceptance of the updated terms.</p>
        </div>

        <div class="contact-info">
          <h2>Contact Information</h2>
          <p><strong>PartnerPlus</strong><br>
          Email: <a href="mailto:partnerplustestsdb@gmail.com">partnerplustestsdb@gmail.com</a><br>
          SMS Support: Text HELP to +1 (877) 564-1118<br>
          Website: <a href="/">PartnerPlus Dashboard</a></p>
        </div>

        <div class="policy-section">
          <p><small><em>Last updated: ${new Date().toLocaleDateString()}</em></small></p>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Fast shutdown handler
let server;
let shutdownInitiated = false;

process.on('SIGTERM', fastShutdown);
process.on('SIGINT', fastShutdown);

function fastShutdown() {
  if (shutdownInitiated) {
    console.log('\nForce killing process...');
    process.exit(1);
  }
  
  shutdownInitiated = true;
  console.log('\nShutting down... (Press Ctrl+C again to force quit)');
  
  if (server) {
    // Force close after 500ms instead of waiting for connections to finish
    const forceShutdown = setTimeout(() => {
      console.log('Force closing server');
      process.exit(0);
    }, 500);
    
    server.close(() => {
      clearTimeout(forceShutdown);
      console.log('Server closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

// Start server with port conflict handling
async function startServer() {
  try {
    console.log('Starting PartnerPlus server...');
    console.log('Environment:', {
      NODE_ENV: process.env.NODE_ENV,
      PORT: PORT,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'Set' : 'Not set',
      EMAIL_USER: process.env.EMAIL_USER || 'Not set',
      TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID ? 'Set' : 'Not set'
    });

    // Only kill existing processes locally, not on Railway
    if (process.env.NODE_ENV !== 'production') {
      await killExistingProcess(PORT);
    }
    
    // Start the server
    server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ PartnerPlus server successfully started!`);
      console.log(`🌐 Running on: http://0.0.0.0:${PORT}`);
      console.log(`🚀 Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    server.on('error', (error) => {
      console.error('❌ Server error:', error);
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use`);
      }
      process.exit(1);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the application
startServer();