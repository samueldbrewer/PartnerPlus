// BACKUP OF ORIGINAL AI AGENT PAGE - Created on 2025-07-29
// This is the old chat-based AI Agent interface

// Agent Hub route - Main AI agent with orchestrator tools
app.get('/ai-agent-v1', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>AI Agent v1 (Backup) - PartnerPlus</title>
      <link rel="icon" type="image/svg+xml" href="/favicon.svg">
      <!-- Cache bust: ${Date.now()} -->
      <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
      <meta http-equiv="Pragma" content="no-cache">
      <meta http-equiv="Expires" content="0">
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
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-inner">
          <div class="nav">
            <h1>PartnerPlus</h1>
            <a href="/ai-agent">AI Agent v2</a>
            <a href="/ai-agent-v1" class="active">AI Agent v1 (Backup)</a>
          </div>
        </div>
      </div>
      <div class="content">
        <h2>AI Agent v1 - Original Chat Interface (Backup)</h2>
        <p><strong>⚠️ This is the backup of the original chat-based interface.</strong> <a href="/ai-agent">Click here for the new v2 visual workflow interface</a></p>
        <div class="examples">
          <h3>🚀 Multi-Step Workflows This Version Can Execute:</h3>
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
            <p><strong>💡 Pro Tip:</strong> This original version chains multiple actions together in a chat format. The new v2 version provides a visual workflow interface.</p>
          </div>
        </div>
        <p><em>This backup page is provided for reference and fallback purposes. The active development is happening on the <a href="/ai-agent">new v2 visual workflow interface</a>.</em></p>
      </div>
    </body>
    </html>
  `);
});