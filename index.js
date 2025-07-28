require('dotenv').config();
const express = require('express');
const Agent = require('./lib/agent');
const OrchestratorAgent = require('./lib/orchestrator-agent');
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
          <a href="/" class="${currentPage === 'wo-agent' ? 'active' : ''}">WO Agent</a>
          <div class="dropdown">
            <a href="#" class="dropdown-toggle ${['ai-agent', 'ai-chat', 'email', 'sms', 'executor', 'purchase-agent'].includes(currentPage) ? 'active' : ''}">AI Tools ▼</a>
            <div class="dropdown-menu">
              <a href="/ai-agent">AI Agent</a>
              <a href="/ai-chat">AI Chat</a>
              <a href="/email">Email Service</a>
              <a href="/sms">SMS Service</a>
              <a href="/executor">Code Executor</a>
              <a href="/purchase-agent">Purchase Agent</a>
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
        .nav h1 { margin: 0; margin-right: 30px; font-size: 24px; }
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

// WO Agent - New main landing page
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>WO Agent - PartnerPlus</title>
      <link rel="icon" type="image/svg+xml" href="/favicon.svg">
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
        .header { background-color: #1976d2; color: white; padding: 15px 0; margin-bottom: 20px; width: 100%; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header-inner { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
        .nav { display: flex; align-items: center; }
        .nav h1 { margin: 0; margin-right: 30px; font-size: 24px; }
        .nav a { color: white; text-decoration: none; padding: 8px 16px; margin-right: 10px; border-radius: 4px; transition: background-color 0.3s; }
        .nav a:hover { background-color: rgba(255,255,255,0.1); }
        .nav a.active { background-color: rgba(255,255,255,0.2); }
        ${dropdownStyles}
        .content { max-width: 1200px; margin: 0 auto; padding: 0 20px 60px 20px; }
        .main-container { text-align: center; padding: 60px 20px; }
        .main-container h1 { font-size: 48px; color: #1976d2; margin-bottom: 20px; }
        .main-container p { font-size: 20px; color: #666; margin-bottom: 40px; }
        .demo-section { background-color: #f5f5f5; padding: 40px; border-radius: 10px; margin: 40px auto; max-width: 800px; }
        .cta-button { display: inline-block; padding: 15px 30px; background-color: #1976d2; color: white; text-decoration: none; border-radius: 5px; font-size: 18px; transition: background-color 0.3s; }
        .cta-button:hover { background-color: #1565c0; }
        .features-list { text-align: left; display: inline-block; margin-top: 20px; }
        .features-list li { margin: 10px 0; font-size: 16px; }
      </style>
    </head>
    <body>
      ${generateNavigation('wo-agent')}
      <div class="content">
        <div class="main-container">
          <h1>Work Order Agent</h1>
          <p>Intelligent work order management powered by AI</p>
          
          <div class="demo-section">
            <h2>Coming Soon</h2>
            <p>Our advanced Work Order Agent will revolutionize how you manage service requests, maintenance tasks, and equipment repairs.</p>
            <p><strong>Features will include:</strong></p>
            <ul class="features-list">
              <li>🔧 Automated work order creation from emails and messages</li>
              <li>🔍 Intelligent parts and supplier matching</li>
              <li>👷 Service technician scheduling and dispatch</li>
              <li>📊 Real-time status updates and tracking</li>
              <li>🤖 Predictive maintenance recommendations</li>
              <li>📧 Automated customer communication</li>
              <li>💰 Cost estimation and approval workflows</li>
            </ul>
            <br><br>
            <a href="/ai-agent" class="cta-button">Try AI Agent Demo</a>
          </div>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Agent Hub route - Main AI agent with orchestrator tools
app.get('/ai-agent', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>AI Agent - PartnerPlus</title>
      <link rel="icon" type="image/svg+xml" href="/favicon.svg">
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
        .header { background-color: #1976d2; color: white; padding: 15px 0; margin-bottom: 20px; width: 100%; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header-inner { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
        .nav { display: flex; align-items: center; }
        .nav h1 { margin: 0; margin-right: 30px; font-size: 24px; }
        .nav a { color: white; text-decoration: none; padding: 8px 16px; margin-right: 10px; border-radius: 4px; transition: background-color 0.3s; }
        .nav a:hover { background-color: rgba(255,255,255,0.1); }
        .nav a.active { background-color: rgba(255,255,255,0.2); }
        .content { max-width: 1200px; margin: 0 auto; padding: 0 20px 60px 20px; }
        .chat-container { border: 1px solid #ccc; border-radius: 10px; padding: 20px; height: 400px; overflow-y: auto; margin-bottom: 20px; }
        .message { margin: 10px 0; padding: 10px; border-radius: 5px; }
        .user { background-color: #e3f2fd; text-align: right; }
        .assistant { background-color: #f5f5f5; }
        .action-plan { background-color: #fff3e0; border: 2px solid #ff9800; margin: 10px 0; padding: 15px; border-radius: 8px; }
        .action-details { margin: 10px 0; font-family: monospace; background: #f5f5f5; padding: 10px; border-radius: 4px; }
        .confirmation-buttons { margin-top: 10px; display: flex; gap: 10px; }
        .confirm-btn { background-color: #4caf50; }
        .cancel-btn { background-color: #f44336; }
        .result { background-color: #e8f5e9; border-left: 4px solid #4caf50; margin: 10px 0; padding: 10px; }
        .error { background-color: #ffebee; border-left: 4px solid #f44336; margin: 10px 0; padding: 10px; }
        .examples { background-color: #f0f7ff; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        .examples h3 { margin-top: 0; color: #1976d2; }
        .examples li { margin: 8px 0; line-height: 1.4; }
        .examples-note { background-color: #e8f5e9; border-left: 4px solid #4caf50; padding: 12px; margin-top: 15px; border-radius: 4px; }
        .examples-note p { margin: 0; font-style: italic; }
        .complete-plan { background-color: #f3f4f6; border: 1px solid #d1d5db; border-radius: 6px; padding: 12px; margin: 10px 0; }
        .complete-plan ol { margin: 8px 0 0 0; padding-left: 20px; }
        .complete-plan li { margin: 4px 0; }
        .workflow-summary { background-color: #e8f5e9; border: 2px solid #4caf50; border-radius: 8px; padding: 15px; margin: 15px 0; }
        .workflow-summary h4 { margin: 0 0 10px 0; color: #2e7d32; }
        .workflow-summary .action-steps { margin-top: 12px; }
        .workflow-summary ol { margin: 8px 0 0 0; padding-left: 20px; }
        .workflow-summary li { margin: 4px 0; }
        .results-display { background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px; padding: 15px; margin: 15px 0; }
        .results-display h4 { margin: 0 0 12px 0; color: #495057; }
        .results-display hr { margin: 10px 0; border: none; border-top: 1px solid #dee2e6; }
        .email-item, .sms-item, .part-item, .supplier-item { margin: 8px 0; }
        .search-results { background-color: #ffffff; padding: 10px; border-radius: 4px; border: 1px solid #e9ecef; white-space: pre-wrap; }
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
      ${generateNavigation('ai-agent')}
      <div class="content">
        <h2>AI Agent</h2>
        <p>Give me an objective and I'll coordinate our tools (email, SMS, purchase agent) to help you accomplish it!</p>
        <div class="examples">
          <h3>🚀 Multi-Step Workflows I Can Execute:</h3>
          <ul>
            <li><strong>🔧➡️📧 Parts Resolution:</strong> "Find the part number for Henny Penny 500 lid seal and email it to samueldbrewer@gmail.com"</li>
            <li><strong>🏪➡️💬 Supplier Search:</strong> "Look up suppliers for Henny Penny part 77575, then text the best pricing to our manager at +15551234567"</li>
            <li><strong>📧➡️🔍 Inbox + Research:</strong> "Check my email for any urgent messages, then find repair services near 10001 for any equipment mentioned"</li>
            <li><strong>🌐➡️📧 Market Updates:</strong> "Get today's Tesla stock price and email a summary to investors@fund.com with current market analysis"</li>
            <li><strong>🔧➡️🏪➡️📧 Complete Parts Chain:</strong> "Resolve what part we need for a broken Vulcan oven door, find 3 suppliers with pricing, and email the comparison to purchasing@company.com"</li>
            <li><strong>💬➡️📧 Communication Bridge:</strong> "Check recent SMS messages for any equipment issues, then email a status report to operations@business.com"</li>
            <li><strong>📧➡️🔍➡️💬 Service Coordination:</strong> "Read my latest emails, find local service companies for any equipment problems mentioned, and text me the top recommendations"</li>
          </ul>
          <div class="examples-note">
            <p><strong>💡 Pro Tip:</strong> I can chain multiple actions together! Just describe your end goal and I'll coordinate all the necessary steps across email, SMS, parts research, and web search.</p>
          </div>
        </div>
      <div id="chatContainer" class="chat-container"></div>
      <div class="input-container">
        <input type="text" id="messageInput" placeholder="What would you like me to help you accomplish?" />
        <button id="sendButton" onclick="sendObjective()">Execute</button>
        <button onclick="clearChat()">Clear</button>
      </div>
      
      <script>
        let currentActionPlan = null;
        
        async function sendObjective() {
          const input = document.getElementById('messageInput');
          const objective = input.value.trim();
          if (!objective) return;
          
          const chatContainer = document.getElementById('chatContainer');
          const sendButton = document.getElementById('sendButton');
          
          // Add user objective to chat
          chatContainer.innerHTML += '<div class="message user"><strong>Objective:</strong> ' + objective + '</div>';
          input.value = '';
          sendButton.disabled = true;
          sendButton.textContent = 'Analyzing...';
          
          try {
            const response = await fetch('/api/orchestrator/objective', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ objective })
            });
            
            if (!response.ok) {
              throw new Error('Network response was not ok');
            }
            
            const data = await response.json();
            currentActionPlan = data.actionPlan;
            
            // Display action plan
            displayActionPlan(currentActionPlan);
            
          } catch (error) {
            chatContainer.innerHTML += '<div class="message error">Error: ' + error.message + '</div>';
          } finally {
            sendButton.disabled = false;
            sendButton.textContent = 'Execute';
            chatContainer.scrollTop = chatContainer.scrollHeight;
          }
        }
        
        function displayActionPlan(actionPlan) {
          console.log('displayActionPlan called with:', actionPlan);
          const chatContainer = document.getElementById('chatContainer');
          const buttonId = 'executeBtn_' + Date.now(); // Unique ID for each button
          const cancelId = 'cancelBtn_' + Date.now();
          
          if (actionPlan.action === 'clarification_needed') {
            chatContainer.innerHTML += 
              '<div class="message assistant">' +
                '<div class="action-plan">' +
                  '<strong>Need More Information</strong>' +
                  '<p>' + actionPlan.reasoning + '</p>' +
                  (actionPlan.missing_info.length > 0 ? 
                    '<p><strong>Missing:</strong> ' + actionPlan.missing_info.join(', ') + '</p>' : '') +
                '</div>' +
              '</div>';
            return;
          }

          if (actionPlan.action === 'web_search') {
            chatContainer.innerHTML += 
              '<div class="message assistant">' +
                '<div class="action-plan">' +
                  '<strong>🔍 Web Search Required</strong>' +
                  '<p><strong>Query:</strong> ' + actionPlan.parameters.query + '</p>' +
                  '<p><strong>Plan:</strong> ' + actionPlan.reasoning + '</p>' +
                  '<div class="confirmation-buttons">' +
                    '<button class="confirm-btn" onclick="executeCurrentAction()">🔍 Search & Continue</button>' +
                    '<button class="cancel-btn" onclick="cancelAction()">✗ Cancel</button>' +
                  '</div>' +
                '</div>' +
              '</div>';
            return;
          }
          
          if (actionPlan.action === 'error') {
            chatContainer.innerHTML += 
              '<div class="message error">' +
                '<strong>Error:</strong> ' + actionPlan.reasoning +
                (actionPlan.error_message ? '<br><em>' + actionPlan.error_message + '</em>' : '') +
              '</div>';
            return;
          }
          
          // Display action plan details  
          const isFollowup = actionPlan.isFollowup || false;
          let actionHtml = 
            '<div class="message assistant">' +
              '<div class="action-plan">' +
                '<strong>' + (isFollowup ? '📧 Follow-up Action: ' : 'Action Plan: ') + actionPlan.action + '</strong>' +
                '<p><strong>Plan:</strong> ' + (actionPlan.reasoning || 'Ready to proceed with next step') + '</p>' +
                '<p><strong>Preview:</strong> ' + (actionPlan.preview || 'Will execute the planned action') + '</p>' +
                '<p><strong>Confidence:</strong> ' + Math.round((actionPlan.confidence || 0.9) * 100) + '%</p>' +
                
                // Show complete plan if available
                (actionPlan.complete_plan && actionPlan.complete_plan.length > 0 ? 
                  '<div class="complete-plan">' +
                    '<strong>📋 Complete Workflow:</strong>' +
                    '<ol>' +
                      actionPlan.complete_plan.map(function(step) {
                        return '<li><strong>' + step.action + ':</strong> ' + step.description + '</li>';
                      }).join('') +
                    '</ol>' +
                  '</div>' : '') +
                
                '<div class="action-details">' +
                  '<strong>Parameters:</strong><br>' +
                  JSON.stringify(actionPlan.parameters, null, 2) +
                '</div>' +
                
                (actionPlan.missing_info.length > 0 ? 
                  '<p><strong>Missing Info:</strong> ' + actionPlan.missing_info.join(', ') + '</p>' : '') +
                
                (actionPlan.default_values ? 
                  '<div class="action-details">' +
                    '<strong>Default Values Being Used:</strong><br>' +
                    Object.entries(actionPlan.default_values).map(function(entry) {
                      return '• <strong>' + entry[0] + ':</strong> ' + entry[1];
                    }).join('<br>') +
                  '</div>' : '');
          
          if (actionPlan.requires_confirmation) {
            actionHtml += 
                '<div class="confirmation-buttons">' +
                  '<button class="confirm-btn" id="' + buttonId + '">✓ Confirm & Execute</button>' +
                  '<button class="cancel-btn" id="' + cancelId + '">✗ Cancel</button>' +
                '</div>';
          } else {
            actionHtml += 
                '<div class="confirmation-buttons">' +
                  '<button class="confirm-btn" id="' + buttonId + '">▶ Execute</button>' +
                '</div>';
          }
          
          actionHtml += '</div></div>';
          chatContainer.innerHTML += actionHtml;
          
          // Add event listeners for the buttons after they're added to DOM
          const executeBtn = document.getElementById(buttonId);
          const cancelBtn = document.getElementById(cancelId);
          
          console.log('Looking for button with ID:', buttonId);
          console.log('Found executeBtn element:', executeBtn);
          
          if (executeBtn) {
            console.log('Adding click listener to execute button');
            executeBtn.addEventListener('click', function() {
              console.log('Execute button clicked via event listener');
              console.log('currentActionPlan at button click:', currentActionPlan);
              executeCurrentAction();
            });
          } else {
            console.log('ERROR: Execute button not found!');
          }
          
          if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
              console.log('Cancel button clicked via event listener');
              cancelAction();
            });
          }
        }
        
        function formatActionResults(action, data) {
          console.log('formatActionResults called with action:', action, 'data:', data);
          let formattedHtml = '';
          
          switch (action) {
            case 'read_email_inbox':
              if (data.emails && data.emails.length > 0) {
                formattedHtml += '<div class="results-display">';
                formattedHtml += '<h4>📧 Email Inbox (' + data.emails.length + ' emails)</h4>';
                data.emails.forEach(function(email, index) {
                  formattedHtml += 
                    '<div class="email-item">' +
                      '<strong>From:</strong> ' + (email.from || email.sender || 'Unknown') + '<br>' +
                      '<strong>Subject:</strong> ' + (email.subject || 'No Subject') + '<br>' +
                      '<strong>Date:</strong> ' + (email.date ? new Date(email.date).toLocaleString() : 'Unknown') + '<br>' +
                      '<strong>Preview:</strong> ' + (email.text || email.body || 'No content').substring(0, 100) +
                      (email.text && email.text.length > 100 ? '...' : '') +
                    '</div>';
                  if (index < data.emails.length - 1) formattedHtml += '<hr>';
                });
                formattedHtml += '</div>';
              } else {
                formattedHtml += '<div class="results-display"><p>📧 No emails found in inbox.</p></div>';
              }
              break;
              
            case 'read_sms_messages':
              if (data.messages && data.messages.length > 0) {
                formattedHtml += '<div class="results-display">';
                formattedHtml += '<h4>💬 SMS Messages (' + data.messages.length + ' messages)</h4>';
                data.messages.forEach(function(msg, index) {
                  formattedHtml += 
                    '<div class="sms-item">' +
                      '<strong>From:</strong> ' + (msg.from || 'Unknown') + '<br>' +
                      '<strong>To:</strong> ' + (msg.to || 'Unknown') + '<br>' +
                      '<strong>Date:</strong> ' + (msg.dateSent ? new Date(msg.dateSent).toLocaleString() : 'Unknown') + '<br>' +
                      '<strong>Message:</strong> ' + (msg.body || msg.message || 'No content') +
                    '</div>';
                  if (index < data.messages.length - 1) formattedHtml += '<hr>';
                });
                formattedHtml += '</div>';
              } else {
                formattedHtml += '<div class="results-display"><p>💬 No SMS messages found.</p></div>';
              }
              break;
              
            case 'search_parts':
              console.log('Formatting search_parts results, data:', data);
              // Handle the nested data structure (data.data contains the actual results)
              const actualData = data.data || data;
              console.log('Actual parts data:', actualData);
              // Handle the purchase agent's specific response format
              if (actualData.recommended_result && actualData.recommended_result.oem_part_number) {
                formattedHtml += '<div class="results-display">';
                formattedHtml += '<h4>🔧 Part Found (Recommended Result)</h4>';
                formattedHtml += 
                  '<div class="part-item">' +
                    '<strong>Equipment:</strong> ' + (actualData.query.description || 'Unknown') + '<br>' +
                    '<strong>OEM Part Number:</strong> ' + actualData.recommended_result.oem_part_number + '<br>' +
                    '<strong>Description:</strong> ' + (actualData.recommended_result.description || 'N/A') + '<br>' +
                    '<strong>Confidence:</strong> ' + Math.round((actualData.recommended_result.confidence || 0) * 100) + '%<br>' +
                    (actualData.summary ? '<strong>Search Summary:</strong> ' + actualData.summary + '<br>' : '') +
                  '</div>';
                formattedHtml += '</div>';
              } else if (actualData.parts && actualData.parts.length > 0) {
                formattedHtml += '<div class="results-display">';
                formattedHtml += '<h4>🔧 Parts Found (' + actualData.parts.length + ' results)</h4>';
                actualData.parts.forEach(function(part, index) {
                  formattedHtml += 
                    '<div class="part-item">' +
                      '<strong>Part:</strong> ' + (part.name || part.description || 'Unknown') + '<br>' +
                      (part.partNumber ? '<strong>Part #:</strong> ' + part.partNumber + '<br>' : '') +
                      (part.make ? '<strong>Make:</strong> ' + part.make + '<br>' : '') +
                      (part.model ? '<strong>Model:</strong> ' + part.model + '<br>' : '') +
                      (part.price ? '<strong>Price:</strong> ' + part.price + '<br>' : '') +
                    '</div>';
                  if (index < data.parts.length - 1) formattedHtml += '<hr>';
                });
                formattedHtml += '</div>';
              } else {
                formattedHtml += '<div class="results-display"><p>🔧 No parts found matching the search criteria.</p></div>';
              }
              break;
              
            case 'search_suppliers':
              if (data.suppliers && data.suppliers.length > 0) {
                formattedHtml += '<div class="results-display">';
                formattedHtml += '<h4>🏪 Suppliers Found (' + data.suppliers.length + ' results)</h4>';
                data.suppliers.forEach(function(supplier, index) {
                  formattedHtml += 
                    '<div class="supplier-item">' +
                      '<strong>Supplier:</strong> ' + (supplier.name || supplier.company || 'Unknown') + '<br>' +
                      (supplier.price ? '<strong>Price:</strong> ' + supplier.price + '<br>' : '') +
                      (supplier.availability ? '<strong>Availability:</strong> ' + supplier.availability + '<br>' : '') +
                      (supplier.contact ? '<strong>Contact:</strong> ' + supplier.contact + '<br>' : '') +
                    '</div>';
                  if (index < data.suppliers.length - 1) formattedHtml += '<hr>';
                });
                formattedHtml += '</div>';
              } else {
                formattedHtml += '<div class="results-display"><p>🏪 No suppliers found for this part.</p></div>';
              }
              break;
              
            case 'web_search':
              if (data.results) {
                formattedHtml += '<div class="results-display">';
                formattedHtml += '<h4>🔍 Web Search Results</h4>';
                formattedHtml += '<div class="search-results">' + (data.results || 'No results content') + '</div>';
                formattedHtml += '</div>';
              }
              break;
              
            default:
              // For other actions, show raw data if interesting
              if (data && typeof data === 'object' && Object.keys(data).length > 0) {
                formattedHtml += '<div class="action-details">' + JSON.stringify(data, null, 2) + '</div>';
              }
          }
          
          return formattedHtml;
        }
        
        async function executeCurrentAction() {
          console.log('Execute button clicked, currentActionPlan:', currentActionPlan);
          if (!currentActionPlan) {
            console.log('No current action plan available');
            alert('No current action plan available. Please refresh the page and try again.');
            return;
          }
          
          const chatContainer = document.getElementById('chatContainer');
          
          // Show execution status
          chatContainer.innerHTML += '<div class="message assistant">🔄 Executing action...</div>';
          chatContainer.scrollTop = chatContainer.scrollHeight;
          
          try {
            console.log('Sending request to execute action:', currentActionPlan);
            console.log('currentActionPlan.complete_plan:', currentActionPlan.complete_plan);
            console.log('complete_plan length:', currentActionPlan.complete_plan ? currentActionPlan.complete_plan.length : 'undefined');
            const response = await fetch('/api/orchestrator/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ actionPlan: currentActionPlan })
            });
            
            console.log('Response status:', response.status);
            if (!response.ok) {
              throw new Error('HTTP error! status: ' + response.status);
            }
            
            const data = await response.json();
            console.log('Response data:', data);
            const result = data.result;
            
            if (result.success) {
              // Check if there's a follow-up action that needs confirmation
              if (result.data && result.data.requiresFollowup && result.data.followupAction) {
                // Show the primary action results first
                let resultHtml = 
                  '<div class="message assistant">' +
                    '<div class="result">' +
                      '<strong>✅ Success:</strong> ' + result.message;
                
                // Display the primary action results
                if (result.data.primaryAction) {
                  resultHtml += formatActionResults(currentActionPlan.action, result.data.primaryAction);
                }
                
                resultHtml += '</div></div>';
                chatContainer.innerHTML += resultHtml;
                
                // Display the follow-up action plan
                currentActionPlan = result.data.followupAction;
                currentActionPlan.isFollowup = true; // Mark as follow-up for UI display
                console.log('Setting follow-up currentActionPlan:', currentActionPlan);
                displayActionPlan(currentActionPlan);
                console.log('currentActionPlan after displayActionPlan:', currentActionPlan);
                // Don't clear currentActionPlan - we need it for the follow-up action
                chatContainer.scrollTop = chatContainer.scrollHeight;
                return; // Early return to avoid clearing currentActionPlan
              } else {
                // Check if there's a workflow summary
                let resultHtml = 
                  '<div class="message assistant">' +
                    '<div class="result">' +
                      '<strong>✅ Success:</strong> ' + result.message;
                
                // Display actual results based on action type
                if (currentActionPlan && result.data) {
                  console.log('About to format results for action:', currentActionPlan.action);
                  console.log('Result data structure:', result.data);
                  resultHtml += formatActionResults(currentActionPlan.action, result.data);
                }
                
                // Display workflow summary if available
                if (result.workflowSummary) {
                  const summary = result.workflowSummary;
                  resultHtml += 
                    '<div class="workflow-summary">' +
                      '<h4>📋 Workflow Summary</h4>' +
                      '<p><strong>Objective:</strong> ' + summary.originalObjective + '</p>' +
                      '<p><strong>Total Actions:</strong> ' + summary.totalActions + '</p>' +
                      '<p><strong>Duration:</strong> ' + summary.totalDuration + 'ms</p>' +
                      '<p><strong>Completed:</strong> ' + new Date(summary.endTime).toLocaleTimeString() + '</p>' +
                      '<div class="action-steps">' +
                        '<strong>Steps Completed:</strong>' +
                        '<ol>' +
                          summary.actions.map(function(action) {
                            return '<li><strong>' + action.action + '</strong> - ' + action.status + ' (' + action.duration + ')</li>';
                          }).join('') +
                        '</ol>' +
                      '</div>' +
                    '</div>';
                } else if (result.data) {
                  resultHtml += '<div class="action-details">' + JSON.stringify(result.data, null, 2) + '</div>';
                }
                
                resultHtml += '</div></div>';
                chatContainer.innerHTML += resultHtml;
                currentActionPlan = null; // Clear after final action completion
              }
            } else {
              chatContainer.innerHTML += 
                '<div class="message assistant">' +
                  '<div class="error">' +
                    '<strong>❌ Error:</strong> ' + result.message +
                    (result.data ? '<div class="action-details">' + JSON.stringify(result.data, null, 2) + '</div>' : '') +
                  '</div>' +
                '</div>';
              currentActionPlan = null; // Clear after error
            }
            
          } catch (error) {
            chatContainer.innerHTML += '<div class="message error">Execution Error: ' + error.message + '</div>';
            currentActionPlan = null; // Clear on error
          }
          
          chatContainer.scrollTop = chatContainer.scrollHeight;
        }
        
        function cancelAction() {
          const chatContainer = document.getElementById('chatContainer');
          chatContainer.innerHTML += '<div class="message assistant">❌ Action cancelled by user.</div>';
          currentActionPlan = null;
          chatContainer.scrollTop = chatContainer.scrollHeight;
        }
        
        async function clearChat() {
          document.getElementById('chatContainer').innerHTML = '';
          currentActionPlan = null;
          await fetch('/api/orchestrator/clear', { method: 'POST' });
        }
        
        // Allow sending objective with Enter key
        document.getElementById('messageInput').addEventListener('keypress', function(e) {
          if (e.key === 'Enter' && !document.getElementById('sendButton').disabled) {
            sendObjective();
          }
        });
      </script>
    </body>
    </html>
  `);
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

app.post('/api/orchestrator/clear', (req, res) => {
  orchestratorAgent.clearHistory();
  res.json({ success: true });
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
        .nav h1 { margin: 0; margin-right: 30px; font-size: 24px; }
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
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-inner">
          <div class="nav">
            <h1>PartnerPlus</h1>
          </div>
        </div>
      </div>
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
            
            emailItem.innerHTML = \`
              <div class="email-from">\${fromName}</div>
              <div class="email-subject">\${email.subject || '(No Subject)'}</div>
              <div class="email-date">\${dateDisplay}</div>
              <div class="email-preview">\${preview}</div>
            \`;
            
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
            fromName = \`\${emailMatch[1]} <\${emailMatch[2]}>\`;
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
        .nav h1 { margin: 0; margin-right: 30px; font-size: 24px; }
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
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-inner">
          <div class="nav">
            <h1>PartnerPlus</h1>
            <a href="/">AI Agent</a>
            <a href="/email">Email Service</a>
            <a href="/sms" class="active">SMS Service</a>
            <a href="/executor">Code Executor</a>
            <a href="/purchase-agent">Purchase Agent</a>
          </div>
        </div>
      </div>
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
          
          charCountDiv.textContent = \`\${length} / \${length <= 160 ? '160' : '1600'} characters (\${smsCount} SMS)\`;
          
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
            messageItem.className = \`message-item \${message.type}\`;
            
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
            
            messageItem.innerHTML = \`
              <div class="message-from">\${message.type === 'sent' ? 'To: ' + phoneNumber : 'From: ' + phoneNumber}</div>
              <div class="message-body">\${message.body}</div>
              <div class="message-date">\${dateDisplay}</div>
              \${message.status ? '<div class="message-status">Status: ' + message.status + '</div>' : ''}
            \`;
            
            messageList.appendChild(messageItem);
          });
        }

        // Format phone number for display
        function formatPhoneForDisplay(phoneNumber) {
          if (!phoneNumber) return 'Unknown';
          
          const digits = phoneNumber.replace(/\\D/g, '');
          
          if (digits.length === 10) {
            return \`(\${digits.slice(0, 3)}) \${digits.slice(3, 6)}-\${digits.slice(6)}\`;
          } else if (digits.length === 11 && digits.startsWith('1')) {
            return \`+1 (\${digits.slice(1, 4)}) \${digits.slice(4, 7)}-\${digits.slice(7)}\`;
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
        .nav h1 { margin: 0; margin-right: 30px; font-size: 24px; }
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
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-inner">
          <div class="nav">
            <h1>PartnerPlus</h1>
            <a href="/">AI Agent</a>
            <a href="/email">Email Service</a>
            <a href="/sms">SMS Service</a>
            <a href="/executor" class="active">Code Executor</a>
            <a href="/purchase-agent">Purchase Agent</a>
          </div>
        </div>
      </div>
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
        .nav h1 { margin: 0; margin-right: 30px; font-size: 24px; }
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
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-inner">
          <div class="nav">
            <h1>PartnerPlus</h1>
            <a href="/">AI Agent</a>
            <a href="/email">Email Service</a>
            <a href="/sms">SMS Service</a>
            <a href="/executor">Code Executor</a>
            <a href="/purchase-agent" class="active">Purchase Agent</a>
          </div>
        </div>
      </div>
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
        .nav h1 { margin: 0; margin-right: 30px; font-size: 24px; }
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
      <div class="header">
        <div class="header-inner">
          <div class="nav">
            <h1>PartnerPlus</h1>
            <a href="/">AI Agent</a>
            <a href="/email">Email Service</a>
            <a href="/sms">SMS Service</a>
            <a href="/executor">Code Executor</a>
            <a href="/purchase-agent">Purchase Agent</a>
            <a href="/agent-hub">Agent Hub</a>
          </div>
        </div>
      </div>
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