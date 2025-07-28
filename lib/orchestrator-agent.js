const OpenAIClient = require('./openai-client');

class OrchestratorAgent {
  constructor() {
    this.openai = new OpenAIClient();
    this.conversationHistory = [];
    this.systemPrompt = this.getSystemPrompt();
    this.completedActions = []; // Track completed actions for summary
    this.currentPlan = null; // Store the complete plan
  }

  getSystemPrompt() {
    return `You are an AI Orchestrator Agent for PartnerPlus, a comprehensive business automation platform. Your role is to help users accomplish objectives by coordinating multiple tools and services.

AVAILABLE TOOLS:
1. **Email Service** - Send and receive emails
   a) **Send Email** - Send emails via SMTP
      - Endpoint: POST /api/email/send
      - Required parameters: to (email address), subject (string), text (email body content)
      - Optional parameters: html (HTML email body)
      - Validation: All three required fields must be provided
      - Example: {"to": "user@example.com", "subject": "Meeting Reminder", "text": "Hi there,\n\nJust a reminder about our meeting tomorrow.\n\nBest regards"}
   
   b) **Read Email Inbox** - Get recent emails from inbox
      - Endpoint: GET /api/email/inbox
      - Optional parameters: limit (number of emails to retrieve, default 10)
      - Returns: Array of email objects with sender, subject, date, body
      - Example query: ?limit=20

2. **SMS Service** - Send and receive text messages via Twilio
   a) **Send SMS** - Send text messages
      - Endpoint: POST /api/sms/send  
      - Required parameters: to (phone number with country code), message (text content)
      - Validation: Both fields required, phone numbers should include country code like +1234567890
      - Example: {"to": "+1234567890", "message": "Your order has been confirmed"}
   
   b) **Read SMS Messages** - Get recent SMS messages
      - Endpoint: GET /api/sms/messages
      - Optional parameters: limit (number of messages to retrieve, default 20)
      - Returns: Array of message objects with from, to, body, date, status
      - Example query: ?limit=50

3. **Purchase Agent** - Equipment parts and supplier research
   a) **Parts Resolution** - Find and validate equipment parts
      - Endpoint: POST /api/purchase-agent/parts/resolve
      - Required: description (part description or query)
      - Optional: make (equipment brand), model (equipment model), options (search preferences)
      - Example: {"description": "door seal for commercial oven", "make": "Hobart", "model": "HO300"}
   
   b) **Supplier Search** - Find suppliers for specific parts  
      - Endpoint: POST /api/purchase-agent/suppliers/search
      - Required: partNumber (specific part number to search for)
      - Optional: options (may include make, model for context)
      - Example: {"partNumber": "77575", "options": {"make": "Henny Penny"}}
   
   c) **Manual Search** - Find technical manuals and documentation
      - Endpoint: GET /api/purchase-agent/manuals/search
      - Query parameters: make (equipment brand), model (equipment model), category (manual type)
      - Example: ?make=Hobart&model=HO300&category=service
   
   d) **Service Company Search** - Find local repair services
      - Endpoint: POST /api/purchase-agent/service-search  
      - Required: zipCode (5-digit US zip), make (equipment brand)
      - Optional: model (equipment model), serviceType (type of service needed)
      - Example: {"zipCode": "90210", "make": "Hobart", "model": "Dishwasher", "serviceType": "repair"}
   
   e) **Equipment Image Search** - Find the best image of complete equipment using AI selection
      - Endpoint: POST /api/purchase-agent/equipment-image
      - Required: make (equipment brand), model (equipment model)
      - Returns: AI-selected best image showing the full equipment with confidence score and analysis
      - Example: {"make": "Caterpillar", "model": "320D"}
   
   f) **Part Image Search** - Find the best image of a specific part using AI selection
      - Endpoint: POST /api/purchase-agent/part-image
      - Required: make (equipment brand), model (equipment model), partName (name of the part)
      - Optional: oemNumber (OEM part number for better accuracy)
      - Returns: AI-selected best part image with confidence score and detailed analysis
      - Example: {"make": "Caterpillar", "model": "320D", "partName": "hydraulic filter", "oemNumber": "1R-0770"}
   
   g) **Part Enrichment** - Get detailed information about specific parts
      - Endpoint: POST /api/purchase-agent/parts/enrich  
      - Required: partNumber (specific part number to enrich)
      - Optional: make (equipment brand), model (equipment model) for better context
      - Returns: Enhanced part information including specifications, compatibility, and sourcing
      - Example: {"partNumber": "1R-0770", "make": "Caterpillar", "model": "320D"}
   
   h) **Generic Parts Search** - Find generic part alternatives for specific parts
      - Endpoint: POST /api/purchase-agent/parts/find-generic
      - Required: query (part description or OEM number to find generics for)
      - Optional: equipment_make, equipment_model for better matching
      - Returns: List of compatible generic parts with specifications
      - Example: {"query": "hydraulic filter 1R-0770", "equipment_make": "Caterpillar"}

RESPONSE FORMAT:
When a user requests an action, respond with a JSON object containing:

\`\`\`json
{
  "action": "tool_name",
  "parameters": {
    "param1": "value1",
    "param2": "value2"
  },
  "confidence": 0.85,
  "missing_info": ["field1", "field2"],
  "default_values": {
    "field1": "default_value_explanation",
    "field2": "what_will_be_used_if_not_provided"
  },
  "requires_confirmation": true,
  "complete_plan": [
    {"step": 1, "action": "web_search", "description": "Search for current stock price"},
    {"step": 2, "action": "send_email", "description": "Send email with stock data"}
  ],
  "requires_planning_confirmation": true,
  "reasoning": "Brief explanation of why this action is needed",
  "preview": "What the user can expect to happen, including any defaults being used"
}
\`\`\`

IMPORTANT RULES:
- Always analyze if you have enough information to complete the task
- If missing critical information, set "requires_confirmation": true and list missing fields
- ALWAYS include "default_values" object explaining what defaults are being applied
- The "parameters" field should contain the EXACT values that will be sent to the API
- The "default_values" field should explain which parameter values are defaults and why
- For sensitive actions (emails, SMS), always require confirmation unless explicitly told to proceed
- Provide clear reasoning for your chosen action
- If the request is unclear or impossible, return "action": "clarification_needed"
- Be completely transparent: if you generate email text, subject lines, etc., explain that in default_values

WEB SEARCH CAPABILITIES:
- I HAVE access to web search through OpenAI's web_search_preview tool
- I CAN retrieve real-time data like stock prices, weather, news, current events
- For requests requiring current information, I can search the web automatically
- Web search will be performed using the latest GPT model with streaming responses

ACTION MAPPING:
- For sending email → use "send_email" with parameters: to, subject, text
- For reading email inbox → use "read_email_inbox" with parameters: limit? (optional)
- For sending SMS → use "send_sms" with parameters: to, message  
- For reading SMS messages → use "read_sms_messages" with parameters: limit? (optional)
- For finding/searching parts → use "search_parts" with parameters: description, make?, model?
- For finding suppliers for a part number → use "search_suppliers" with parameters: partNumber, options?
- For finding manuals/documentation → use "search_manuals" with parameters: make, model, category?
- For finding service companies → use "search_service_companies" with parameters: zipCode, make, model?, serviceType?
- For real-time information (stocks, weather, news, current events) → use "web_search" with parameters: query

MULTI-STEP PLANNING:
When a task requires multiple steps (like web search + email), you should:
1. Include a "complete_plan" array showing all planned steps
2. Set "requires_planning_confirmation" to true for multi-step tasks
3. Show the user the complete workflow before executing any actions
4. IMPORTANT: Always return the FIRST action in the workflow, not "complete_plan" as the action

PARAMETER REQUIREMENTS:
- Email: Must use "text" not "body" for email content
- SMS: Phone numbers should include country code (+1 for US)
- Supplier search: Must use "partNumber" not "part_number"
- Parts search: Use "description" for the part query/name
- Manual search: All parameters are query parameters, not body
- Service search: "zipCode" must be 5-digit US zip code
- Web search: Use "query" for the search terms

EXAMPLES:

User: "Send an email to john@company.com about the meeting tomorrow"
Response:
\`\`\`json
{
  "action": "send_email",
  "parameters": {
    "to": "john@company.com",
    "subject": "Meeting Tomorrow",
    "text": "Hi John,\\n\\nThis is a reminder about our meeting scheduled for tomorrow. Please let me know if you need to reschedule.\\n\\nBest regards"
  },
  "confidence": 0.7,
  "missing_info": ["meeting_time", "meeting_topic", "sender_name"],
  "default_values": {
    "subject": "I generated 'Meeting Tomorrow' since no subject was provided",
    "text": "I wrote this complete email text since no specific message was given: 'Hi John, This is a reminder about our meeting scheduled for tomorrow. Please let me know if you need to reschedule. Best regards'"
  },
  "requires_confirmation": true,
  "reasoning": "User wants to send a meeting reminder but didn't provide specific details",
  "preview": "Will send email to john@company.com with MY generated subject 'Meeting Tomorrow' and MY written email text about meeting reminder"
}
\`\`\`

User: "Find suppliers for part number 77575 for Henny Penny equipment"
Response:
\`\`\`json
{
  "action": "search_suppliers", 
  "parameters": {
    "partNumber": "77575",
    "options": {"make": "Henny Penny"}
  },
  "confidence": 0.95,
  "missing_info": [],
  "requires_confirmation": false,
  "reasoning": "User provided specific part number and equipment brand for supplier search",
  "preview": "Will search for suppliers who carry Henny Penny part #77575"
}
\`\`\`

User: "Send SMS to +1234567890 saying order is ready"
Response:
\`\`\`json
{
  "action": "send_sms",
  "parameters": {
    "to": "+1234567890",
    "message": "Your order is ready for pickup."
  },
  "confidence": 0.9,
  "missing_info": [],
  "requires_confirmation": true,
  "reasoning": "User wants to send SMS notification about order status",
  "preview": "Will send SMS to +1234567890 with order ready notification"
}
\`\`\`

User: "Find parts for Hobart dishwasher door handle"
Response:
\`\`\`json
{
  "action": "search_parts",
  "parameters": {
    "description": "door handle",
    "make": "Hobart",
    "model": "dishwasher"
  },
  "confidence": 0.8,
  "missing_info": ["specific_model_number"],
  "default_values": {
    "model": "I used generic 'dishwasher' since no specific model number was provided"
  },
  "requires_confirmation": false,
  "reasoning": "User wants to find parts for specific equipment, have brand and part type but missing exact model",
  "preview": "Will search for Hobart dishwasher door handle parts using generic model"
}
\`\`\`

User: "Send email to sam@example.com that says yo dog"
Response:
\`\`\`json
{
  "action": "send_email",
  "parameters": {
    "to": "sam@example.com",
    "subject": "Message from PartnerPlus",
    "text": "yo dog"
  },
  "confidence": 0.9,
  "missing_info": ["subject"],
  "default_values": {
    "subject": "I generated 'Message from PartnerPlus' since no subject was provided - this is what will be sent as the email subject line"
  },
  "requires_confirmation": true,
  "reasoning": "User provided email content but no subject line, need to generate one",
  "preview": "Will send email with subject 'Message from PartnerPlus' and message 'yo dog'"
}
\`\`\`

User: "Send email to john@company.com with the current NVDA stock price"
Response:
\`\`\`json
{
  "action": "web_search",
  "parameters": {
    "query": "NVDA stock price current"
  },
  "confidence": 0.95,
  "missing_info": [],
  "default_values": {
    "query": "I generated 'NVDA stock price current' to find the latest NVIDIA stock price"
  },
  "requires_confirmation": false,
  "complete_plan": [
    {"step": 1, "action": "web_search", "description": "Search for current NVDA stock price"},
    {"step": 2, "action": "send_email", "description": "Send email to john@company.com with the stock price information"}
  ],
  "requires_planning_confirmation": true,
  "reasoning": "User wants current NVDA stock price for an email, I need to search the web for real-time stock data first, then send the email",
  "preview": "Complete workflow: 1) Search for current NVDA stock price, 2) Send email to john@company.com with the stock information"
}
\`\`\`

User: "Find the part number for Henny Penny 500 lid seal and email it to sam@company.com"
Response:
\`\`\`json
{
  "action": "search_parts",
  "parameters": {
    "description": "lid seal",
    "make": "Henny Penny", 
    "model": "500"
  },
  "confidence": 0.85,
  "missing_info": [],
  "default_values": {},
  "requires_confirmation": false,
  "complete_plan": [
    {"step": 1, "action": "search_parts", "description": "Find the part number for Henny Penny 500 lid seal"},
    {"step": 2, "action": "send_email", "description": "Email the found part number to sam@company.com"}
  ],
  "requires_planning_confirmation": true,
  "reasoning": "User wants to find a specific part and then email the details, requires parts search first then email",
  "preview": "Complete workflow: 1) Search for Henny Penny 500 lid seal part, 2) Email the part information to sam@company.com"
}
\`\`\`

When given web search results and asked for followup action:
\`\`\`json
{
  "action": "send_email",
  "parameters": {
    "to": "john@company.com",
    "subject": "Current NVDA Stock Price",
    "text": "Hi John,\\n\\nHere's the current NVIDIA (NVDA) stock price:\\n\\nNVDA: $173.56 (-0.10%)\\n\\nBest regards"
  },
  "confidence": 0.95,
  "missing_info": [],
  "default_values": {
    "subject": "I generated 'Current NVDA Stock Price' as an appropriate subject",
    "text": "I created email content incorporating the web search results showing NVDA at $173.56"
  },
  "requires_confirmation": true,
  "reasoning": "Now that I have the stock price from web search, I can send the email with the current information",
  "preview": "Will send email to john@company.com with the current NVDA stock price of $173.56"
}
\`\`\`

User: "Check my email inbox for new messages"
Response:
\`\`\`json
{
  "action": "read_email_inbox",
  "parameters": {
    "limit": 10
  },
  "confidence": 0.95,
  "missing_info": [],
  "default_values": {
    "limit": "I used default limit of 10 emails since no specific number was requested"
  },
  "requires_confirmation": false,
  "reasoning": "User wants to check their email inbox for new messages",
  "preview": "Will retrieve the 10 most recent emails from your inbox"
}
\`\`\`

User: "Show me the last 5 SMS messages"
Response:
\`\`\`json
{
  "action": "read_sms_messages",
  "parameters": {
    "limit": 5
  },
  "confidence": 0.95,
  "missing_info": [],
  "default_values": {},
  "requires_confirmation": false,
  "reasoning": "User wants to see recent SMS messages with a specific limit of 5",
  "preview": "Will retrieve the 5 most recent SMS messages"
}
\`\`\`

User: "Check if I got any new emails and reply to the most recent one from John"
Response:
\`\`\`json
{
  "action": "read_email_inbox",
  "parameters": {
    "limit": 20
  },
  "confidence": 0.9,
  "missing_info": [],
  "default_values": {
    "limit": "I used 20 emails to ensure we can find recent messages from John"
  },
  "requires_confirmation": false,
  "complete_plan": [
    {"step": 1, "action": "read_email_inbox", "description": "Check email inbox for new messages"},
    {"step": 2, "action": "send_email", "description": "Reply to the most recent email from John"}
  ],
  "requires_planning_confirmation": true,
  "reasoning": "User wants to check for new emails and then reply to John, requires multi-step workflow",
  "preview": "Complete workflow: 1) Check inbox for new emails, 2) Reply to most recent email from John"
}
\`\`\`

Remember: You are a helpful orchestrator. Break down complex requests into actionable steps and always prioritize user safety and confirmation for sensitive actions.`;
  }

  async processObjective(userObjective, options = {}) {
    try {
      // Store current objective for later use
      this.currentObjective = userObjective;
      
      // Reset workflow tracking for new objectives
      this.completedActions = [];
      this.currentPlan = null;
      
      // Build conversation context with system prompt
      const messages = [
        { role: 'system', content: this.systemPrompt },
        ...this.conversationHistory,
        { role: 'user', content: userObjective }
      ];

      // Get action plan from AI - use simple string input for Responses API
      const input = `${this.getSystemPrompt()}\n\nUser Objective: ${userObjective}\n\nAnalyze this objective and respond with the appropriate action JSON:`;

      const response = await this.openai.chatWithResponses(input, {
        model: 'gpt-4.1-nano-2025-04-14', // Keep nano for planning since it's faster and doesn't need tools
        temperature: 0.3, // Lower temperature for more consistent JSON
        stream: options.stream || false
      });

      let actionPlan;
      if (options.stream && response[Symbol.asyncIterator]) {
        return this.handleStreamingResponse(response, userObjective, options.onChunk);
      }

      // Extract response content
      let responseContent = this.extractResponseContent(response);
      
      try {
        // Try to parse JSON from the response
        const jsonMatch = responseContent.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          actionPlan = JSON.parse(jsonMatch[1]);
        } else {
          // Try to parse the entire response as JSON
          actionPlan = JSON.parse(responseContent);
        }
      } catch (e) {
        // If JSON parsing fails, return clarification needed
        actionPlan = {
          action: "clarification_needed",
          parameters: {},
          confidence: 0.1,
          missing_info: ["clear_objective"],
          requires_confirmation: false,
          reasoning: "Could not parse the objective into a clear action plan",
          preview: "Need more specific instructions",
          raw_response: responseContent
        };
      }

      // Store the complete plan if available
      if (actionPlan.complete_plan) {
        this.currentPlan = actionPlan.complete_plan;
      }

      // Add to conversation history
      this.conversationHistory.push(
        { role: 'user', content: userObjective },
        { role: 'assistant', content: JSON.stringify(actionPlan, null, 2) }
      );

      return actionPlan;
    } catch (error) {
      console.error('Error processing objective:', error);
      return {
        action: "error",
        parameters: {},
        confidence: 0,
        missing_info: [],
        requires_confirmation: false,
        reasoning: "System error occurred while processing the objective",
        preview: "Unable to complete request due to technical error",
        error_message: error.message
      };
    }
  }

  extractResponseContent(response) {
    if (response.output_text) {
      return response.output_text;
    } else if (response.output && Array.isArray(response.output)) {
      const assistantMessage = response.output.find(item => item.role === 'assistant');
      if (assistantMessage && assistantMessage.content && assistantMessage.content[0] && assistantMessage.content[0].text) {
        return assistantMessage.content[0].text;
      }
    }
    return JSON.stringify(response);
  }

  async executeAction(actionPlan) {
    const { action, parameters } = actionPlan;
    
    console.log('🚀 ORCHESTRATOR executeAction called with:', action);
    console.log('🚀 Full actionPlan:', JSON.stringify(actionPlan, null, 2));
    
    // Track the action being executed
    const actionStart = Date.now();
    
    let result;
    switch (action) {
      case 'send_email':
        result = await this.executeSendEmail(parameters);
        break;
      case 'read_email_inbox':
        result = await this.executeReadEmailInbox(parameters);
        break;
      case 'send_sms':
        result = await this.executeSendSMS(parameters);
        break;
      case 'read_sms_messages':
        result = await this.executeReadSMSMessages(parameters);
        break;
      case 'search_parts':
        // Check if this is a multi-step workflow (has complete_plan)
        console.log('🔍 search_parts - Has complete_plan?', !!actionPlan.complete_plan);
        console.log('🔍 search_parts - Complete plan length:', actionPlan.complete_plan ? actionPlan.complete_plan.length : 'N/A');
        console.log('🔍 search_parts - Length > 1?', actionPlan.complete_plan ? actionPlan.complete_plan.length > 1 : false);
        
        if (actionPlan.complete_plan && actionPlan.complete_plan.length > 1) {
          console.log('✅ Using executeActionWithFollowup');
          result = await this.executeActionWithFollowup(actionPlan);
        } else {
          console.log('❌ Using direct executeSearchParts');
          result = await this.executeSearchParts(parameters);
        }
        console.log('🔍 search_parts execution completed, result success:', result.success);
        break;
      case 'search_suppliers':
        result = await this.executeSearchSuppliers(parameters);
        break;
      case 'search_manuals':
        result = await this.executeSearchManuals(parameters);
        break;
      case 'search_service_companies':
        result = await this.executeSearchServiceCompanies(parameters);
        break;
      case 'equipment_image_search':
      case 'Equipment Image Search':
      case 'equipment-image':
        result = await this.executeEquipmentImageSearch(parameters);
        break;
      case 'part_image_search':
      case 'Part Image Search':
      case 'part-image':
        result = await this.executePartImageSearch(parameters);
        break;
      case 'enrich_part':
      case 'Part Enrichment':
        result = await this.executePartEnrichment(parameters);
        break;
      case 'find_generic_parts':
      case 'Generic Parts Search':
        result = await this.executeFindGenericParts(parameters);
        break;
      case 'web_search':
        result = await this.executeActionWithFollowup(actionPlan);
        break;
      case 'clarification_needed':
        result = {
          success: true,
          message: "I need more information to complete this task",
          data: actionPlan
        };
        break;
      default:
        result = {
          success: false,
          message: `Unknown action: ${action}`,
          data: null
        };
    }
    
    // Track completed action
    if (result && action !== 'clarification_needed') {
      const actionEnd = Date.now();
      this.completedActions.push({
        action: action,
        parameters: parameters,
        result: result,
        duration: actionEnd - actionStart,
        timestamp: new Date().toISOString()
      });
      
      // Check if this is the final action and generate summary
      if (this.isWorkflowComplete(action)) {
        result.workflowSummary = this.generateWorkflowSummary();
      }
    }
    
    return result;
  }

  async executeSendEmail(params) {
    try {
      const response = await fetch('http://localhost:3000/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const result = await response.json();
      return {
        success: response.ok,
        message: response.ok ? 'Email sent successfully' : result.error,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: `Email service error: ${error.message}`,
        data: null
      };
    }
  }

  async executeSendSMS(params) {
    try {
      const response = await fetch('http://localhost:3000/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const result = await response.json();
      return {
        success: response.ok,
        message: response.ok ? 'SMS sent successfully' : result.error,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: `SMS service error: ${error.message}`,
        data: null
      };
    }
  }

  async executeReadEmailInbox(params) {
    try {
      const limit = params.limit || 10;
      const response = await fetch(`http://localhost:3000/api/email/inbox?limit=${limit}`);
      const result = await response.json();
      return {
        success: response.ok,
        message: response.ok ? `Retrieved ${result.emails?.length || 0} emails from inbox` : result.error,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: `Email inbox error: ${error.message}`,
        data: null
      };
    }
  }

  async executeReadSMSMessages(params) {
    try {
      const limit = params.limit || 20;
      const response = await fetch(`http://localhost:3000/api/sms/messages?limit=${limit}`);
      const result = await response.json();
      return {
        success: response.ok,
        message: response.ok ? `Retrieved ${result.messages?.length || 0} SMS messages` : result.error,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: `SMS messages error: ${error.message}`,
        data: null
      };
    }
  }

  async executeSearchParts(params) {
    try {
      const response = await fetch('http://localhost:3000/api/purchase-agent/parts/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const result = await response.json();
      return {
        success: response.ok,
        message: response.ok ? 'Parts search completed' : result.error,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: `Parts search error: ${error.message}`,
        data: null
      };
    }
  }

  async executeSearchSuppliers(params) {
    try {
      const response = await fetch('http://localhost:3000/api/purchase-agent/suppliers/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const result = await response.json();
      return {
        success: response.ok,
        message: response.ok ? 'Supplier search completed' : result.error,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: `Supplier search error: ${error.message}`,
        data: null
      };
    }
  }

  async executeSearchManuals(params) {
    try {
      // Build query string for GET request
      const queryParams = new URLSearchParams();
      if (params.make) queryParams.append('make', params.make);
      if (params.model) queryParams.append('model', params.model);
      if (params.category) queryParams.append('category', params.category);
      
      const response = await fetch(`http://localhost:3000/api/purchase-agent/manuals/search?${queryParams}`);
      const result = await response.json();
      return {
        success: response.ok,
        message: response.ok ? 'Manual search completed' : result.error,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: `Manual search error: ${error.message}`,
        data: null
      };
    }
  }

  async executeSearchServiceCompanies(params) {
    try {
      const response = await fetch('http://localhost:3000/api/purchase-agent/service-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const result = await response.json();
      return {
        success: response.ok,
        message: response.ok ? 'Service company search completed' : result.error,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: `Service search error: ${error.message}`,
        data: null
      };
    }
  }

  async executeEquipmentImageSearch(params) {
    try {
      const response = await fetch('http://localhost:3000/api/purchase-agent/equipment-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const result = await response.json();
      return {
        success: response.ok,
        message: response.ok ? 'Equipment image search completed' : result.error,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: `Equipment image search error: ${error.message}`,
        data: null
      };
    }
  }

  async executePartImageSearch(params) {
    try {
      const response = await fetch('http://localhost:3000/api/purchase-agent/part-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const result = await response.json();
      return {
        success: response.ok,
        message: response.ok ? 'Part image search completed' : result.error,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: `Part image search error: ${error.message}`,
        data: null
      };
    }
  }

  async executePartEnrichment(params) {
    try {
      const response = await fetch('http://localhost:3000/api/purchase-agent/parts/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const result = await response.json();
      return {
        success: response.ok,
        message: response.ok ? 'Part enrichment completed' : result.error,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: `Part enrichment error: ${error.message}`,
        data: null
      };
    }
  }

  async executeFindGenericParts(params) {
    try {
      const response = await fetch('http://localhost:3000/api/purchase-agent/parts/find-generic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const result = await response.json();
      return {
        success: response.ok,
        message: response.ok ? 'Generic parts search completed' : result.error,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: `Generic parts search error: ${error.message}`,
        data: null
      };
    }
  }

  async executeWebSearch(params) {
    try {
      // Use OpenAI client with web search capability
      const OpenAIClient = require('./openai-client');
      const openaiClient = new OpenAIClient();
      
      // Be more explicit about requiring web search
      const input = `Search the web for: ${params.query}. Use web search to find the most current, real-time data. Do not use your training data - search the internet for live information.`;
      
      console.log('Web search input:', input);
      console.log('Web search tools:', [{ type: 'web_search_preview' }]);
      
      const response = await openaiClient.chatWithResponses(input, {
        model: 'gpt-4o', // Use latest gpt-4o which should support web search
        tools: [{ type: 'web_search_preview' }],
        stream: false
      });
      
      console.log('Web search response:', JSON.stringify(response, null, 2));
      
      return {
        success: true,
        message: 'Web search completed successfully',
        data: {
          query: params.query,
          response: response,
          results: this.extractResponseContent(response)
        }
      };
    } catch (error) {
      return {
        success: false,
        message: `Web search error: ${error.message}`,
        data: null
      };
    }
  }

  async executeActionWithFollowup(actionPlan) {
    try {
      // First execute the primary action
      let primaryResult;
      
      switch (actionPlan.action) {
        case 'web_search':
          primaryResult = await this.executeWebSearch(actionPlan.parameters);
          break;
        case 'search_parts':
          primaryResult = await this.executeSearchParts(actionPlan.parameters);
          break;
        default:
          throw new Error(`Unsupported action for followup: ${actionPlan.action}`);
      }
      
      if (!primaryResult.success) {
        return primaryResult;
      }
      
      // Get the primary action results - could be web search results, parts data, etc.
      let primaryData;
      if (actionPlan.action === 'web_search') {
        primaryData = primaryResult.data.results;
      } else if (actionPlan.action === 'search_parts') {
        primaryData = JSON.stringify(primaryResult.data, null, 2);
      } else {
        primaryData = JSON.stringify(primaryResult.data, null, 2);
      }
      
      // Store the original objective - it should be available from the actionPlan context
      const originalObjective = actionPlan.original_objective || this.currentObjective || 'Complete the user request';
      
      // Now ask the AI what to do next with the primary action results
      const followupInput = `${this.getSystemPrompt()}

Original user objective: ${originalObjective}

Action completed: ${actionPlan.action}
Action results: ${primaryData}

The ${actionPlan.action} has been completed. Based on the original objective and the results above, what should be the next action to complete the user's request? 

IMPORTANT: Analyze the results carefully:
- If a part was found (check for recommended_result, oem_part_number, etc.), include that information
- If the next action is send_email, you MUST include all required parameters:
  - to: the email address from the original objective  
  - subject: an appropriate subject line
  - text: email body incorporating the action results
- If no useful results were found, suggest an alternative action or indicate completion

Respond with the appropriate action JSON:`;

      const followupResponse = await this.openai.chatWithResponses(followupInput, {
        model: 'gpt-4.1-nano-2025-04-14',
        temperature: 0.3,
        stream: false
      });

      // Parse the followup action
      let followupAction;
      const followupContent = this.extractResponseContent(followupResponse);
      
      console.log('Follow-up AI response:', followupContent);
      
      try {
        const jsonMatch = followupContent.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          followupAction = JSON.parse(jsonMatch[1]);
        } else {
          followupAction = JSON.parse(followupContent);
        }
        
        console.log('Parsed follow-up action:', JSON.stringify(followupAction, null, 2));
      } catch (e) {
        console.log('Failed to parse follow-up action:', e.message);
        return {
          success: true,
          message: 'Web search completed, but could not determine next action',
          data: webSearchResult.data
        };
      }

      // Instead of executing immediately, return the followup action for user confirmation
      if (followupAction.action && followupAction.action !== 'web_search') {
        return {
          success: true,
          message: `${actionPlan.action} completed. Follow-up action ready for confirmation.`,
          data: {
            primaryAction: primaryResult.data,
            followupAction: followupAction,
            requiresFollowup: true
          }
        };
      }

      return primaryResult;
      
    } catch (error) {
      return {
        success: false,
        message: `${actionPlan.action} followup error: ${error.message}`,
        data: null
      };
    }
  }

  isWorkflowComplete(currentAction) {
    // If no plan exists, assume single action workflow
    if (!this.currentPlan || this.currentPlan.length === 0) {
      return true;
    }
    
    // Find the current action in the plan
    const currentStepIndex = this.currentPlan.findIndex(step => step.action === currentAction);
    
    // If it's the last step in the plan, workflow is complete
    return currentStepIndex === this.currentPlan.length - 1;
  }
  
  generateWorkflowSummary() {
    if (this.completedActions.length === 0) {
      return null;
    }
    
    const totalDuration = this.completedActions.reduce((sum, action) => sum + action.duration, 0);
    const startTime = new Date(this.completedActions[0].timestamp);
    const endTime = new Date(this.completedActions[this.completedActions.length - 1].timestamp);
    
    return {
      summary: "Workflow completed successfully",
      totalActions: this.completedActions.length,
      totalDuration: totalDuration,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      actions: this.completedActions.map((action, index) => ({
        step: index + 1,
        action: action.action,
        status: action.result.success ? 'completed' : 'failed',
        duration: `${action.duration}ms`,
        message: action.result.message
      })),
      originalObjective: this.currentObjective
    };
  }

  clearHistory() {
    this.conversationHistory = [];
    this.completedActions = [];
    this.currentPlan = null;
  }
}

module.exports = OrchestratorAgent;