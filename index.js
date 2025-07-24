const express = require('express');
const Agent = require('./lib/agent');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Create agent instance
const agent = new Agent();

// Routes
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>PartnerPlus Agent</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
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
      <h1>PartnerPlus AI Agent</h1>
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
            chatContainer.innerHTML += '<div class="message assistant">' + data.response.replace(/\\n/g, '<br>') + '</div>';
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

app.listen(PORT, () => {
  console.log(`PartnerPlus Agent running on port ${PORT}`);
});