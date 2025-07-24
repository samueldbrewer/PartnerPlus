require('dotenv').config();
const express = require('express');
const Agent = require('./lib/agent');
const EmailService = require('./lib/email-service');
const SMSService = require('./lib/sms-service');
const CodeExecutor = require('./lib/code-executor');
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

// Create code executor instance
const codeExecutor = new CodeExecutor();

// Create email service instance
let emailService = null;

// Create SMS service instance
let smsService = null;
console.log('Environment check - EMAIL_USER:', process.env.EMAIL_USER);
console.log('Environment check - EMAIL_PASS:', process.env.EMAIL_PASS ? `***${process.env.EMAIL_PASS.slice(-4)}` : 'NOT SET');
console.log('Password length:', process.env.EMAIL_PASS ? process.env.EMAIL_PASS.length : 0);
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  console.log('Initializing email service for:', process.env.EMAIL_USER);
  emailService = new EmailService({
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT || 587,
      secure: false,
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER
    },
    imap: {
      host: process.env.IMAP_HOST || 'imap.gmail.com',
      port: process.env.IMAP_PORT || 993,
      tls: true,
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
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
console.log('Environment check - TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID ? `***${process.env.TWILIO_ACCOUNT_SID.slice(-4)}` : 'NOT SET');
console.log('Environment check - TWILIO_AUTH_TOKEN:', process.env.TWILIO_AUTH_TOKEN ? `***${process.env.TWILIO_AUTH_TOKEN.slice(-4)}` : 'NOT SET');
console.log('Environment check - TWILIO_PHONE_NUMBER:', process.env.TWILIO_PHONE_NUMBER || 'NOT SET');

if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
  console.log('Initializing SMS service');
  smsService = new SMSService({
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER
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

// Routes
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>PartnerPlus Agent</title>
      <link rel="icon" type="image/svg+xml" href="/favicon.svg">
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 0; }
        .header { background-color: #1976d2; color: white; padding: 15px 20px; margin-bottom: 20px; }
        .nav { display: flex; align-items: center; }
        .nav h1 { margin: 0; margin-right: 30px; font-size: 24px; }
        .nav a { color: white; text-decoration: none; padding: 8px 16px; margin-right: 10px; border-radius: 4px; transition: background-color 0.3s; }
        .nav a:hover { background-color: rgba(255,255,255,0.1); }
        .nav a.active { background-color: rgba(255,255,255,0.2); }
        .content { padding: 0 20px; }
        .chat-container { border: 1px solid #ccc; border-radius: 10px; padding: 20px; height: 400px; overflow-y: auto; margin-bottom: 20px; }
        .message { margin: 10px 0; padding: 10px; border-radius: 5px; }
        .user { background-color: #e3f2fd; text-align: right; }
        .assistant { background-color: #f5f5f5; }
        .input-container { display: flex; gap: 10px; }
        #messageInput { flex: 1; padding: 10px; border: 1px solid #ccc; border-radius: 5px; }
        button { padding: 10px 20px; background-color: #1976d2; color: white; border: none; border-radius: 5px; cursor: pointer; }
        button:hover { background-color: #1565c0; }
        button:disabled { background-color: #ccc; cursor: not-allowed; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="nav">
          <h1>PartnerPlus</h1>
          <a href="/" class="active">AI Agent</a>
          <a href="/email">Email Service</a>
          <a href="/sms">SMS Service</a>
          <a href="/executor">Code Executor</a>
        </div>
      </div>
      <div class="content">
        <h2>AI Agent</h2>
        <p>Chat with an AI agent that can use tools to help you!</p>
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
          
          try {
            const response = await fetch('/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message })
            });
            
            const data = await response.json();
            
            // Add assistant response to chat
            const responseText = data.response || data.error || 'No response received';
            chatContainer.innerHTML += '<div class="message assistant">' + responseText.replace(/\\n/g, '<br>') + '</div>';
            chatContainer.scrollTop = chatContainer.scrollHeight;
          } catch (error) {
            chatContainer.innerHTML += '<div class="message assistant">Error: ' + error.message + '</div>';
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

app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    const response = await agent.processMessage(message);
    res.json({ response });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat/clear', (req, res) => {
  agent.clearHistory();
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
        body { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 0; }
        .header { background-color: #1976d2; color: white; padding: 15px 20px; margin-bottom: 20px; }
        .nav { display: flex; align-items: center; }
        .nav h1 { margin: 0; margin-right: 30px; font-size: 24px; }
        .nav a { color: white; text-decoration: none; padding: 8px 16px; margin-right: 10px; border-radius: 4px; transition: background-color 0.3s; }
        .nav a:hover { background-color: rgba(255,255,255,0.1); }
        .nav a.active { background-color: rgba(255,255,255,0.2); }
        .content { padding: 0 20px; }
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
        <div class="nav">
          <h1>PartnerPlus</h1>
          <a href="/">AI Agent</a>
          <a href="/email" class="active">Email Service</a>
          <a href="/sms">SMS Service</a>
          <a href="/executor">Code Executor</a>
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
        body { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 0; }
        .header { background-color: #1976d2; color: white; padding: 15px 20px; margin-bottom: 20px; }
        .nav { display: flex; align-items: center; }
        .nav h1 { margin: 0; margin-right: 30px; font-size: 24px; }
        .nav a { color: white; text-decoration: none; padding: 8px 16px; margin-right: 10px; border-radius: 4px; transition: background-color 0.3s; }
        .nav a:hover { background-color: rgba(255,255,255,0.1); }
        .nav a.active { background-color: rgba(255,255,255,0.2); }
        .content { padding: 0 20px; }
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
        <div class="nav">
          <h1>PartnerPlus</h1>
          <a href="/">AI Agent</a>
          <a href="/email">Email Service</a>
          <a href="/sms" class="active">SMS Service</a>
          <a href="/executor">Code Executor</a>
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

// Code Executor page
app.get('/executor', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Code Executor - PartnerPlus</title>
      <link rel="icon" type="image/svg+xml" href="/favicon.svg">
      <style>
        body { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 0; }
        .header { background-color: #1976d2; color: white; padding: 15px 20px; margin-bottom: 20px; }
        .nav { display: flex; align-items: center; }
        .nav h1 { margin: 0; margin-right: 30px; font-size: 24px; }
        .nav a { color: white; text-decoration: none; padding: 8px 16px; margin-right: 10px; border-radius: 4px; transition: background-color 0.3s; }
        .nav a:hover { background-color: rgba(255,255,255,0.1); }
        .nav a.active { background-color: rgba(255,255,255,0.2); }
        .content { padding: 0 20px; }
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
        <div class="nav">
          <h1>PartnerPlus</h1>
          <a href="/">AI Agent</a>
          <a href="/email">Email Service</a>
          <a href="/sms">SMS Service</a>
          <a href="/executor" class="active">Code Executor</a>
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

// SMS Opt-In Policy page
app.get('/optin', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>SMS Opt-In Policy - PartnerPlus</title>
      <link rel="icon" type="image/svg+xml" href="/favicon.svg">
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 0; }
        .header { background-color: #1976d2; color: white; padding: 15px 20px; margin-bottom: 20px; }
        .nav { display: flex; align-items: center; }
        .nav h1 { margin: 0; margin-right: 30px; font-size: 24px; }
        .nav a { color: white; text-decoration: none; padding: 8px 16px; margin-right: 10px; border-radius: 4px; transition: background-color 0.3s; }
        .nav a:hover { background-color: rgba(255,255,255,0.1); }
        .content { padding: 20px; line-height: 1.6; }
        h1, h2 { color: #1976d2; }
        .policy-section { margin-bottom: 30px; }
        .highlight { background-color: #e3f2fd; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .contact-info { background-color: #f5f5f5; padding: 15px; border-radius: 5px; }
        a { color: #1976d2; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="nav">
          <h1>PartnerPlus</h1>
          <a href="/">AI Agent</a>
          <a href="/email">Email Service</a>
          <a href="/sms">SMS Service</a>
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

// Graceful shutdown handler
let server;
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
  console.log('\nShutting down gracefully...');
  if (server) {
    server.close(() => {
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