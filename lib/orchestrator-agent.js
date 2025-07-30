const OpenAIClient = require('./openai-client');
const CodeExecutor = require('./code-executor');

class OrchestratorAgent {
  constructor() {
    this.openai = new OpenAIClient();
    this.codeExecutor = new CodeExecutor();
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

4. **Search Tools** - AI-powered and raw web search capabilities
   a) **AI Web Search** - Intelligent web search with analysis and processing
      - Endpoint: POST /api/purchase-agent/search/web
      - Required: query (search terms)
      - Optional: maxResults (default 10), includeAnalysis (default true), focusArea (search focus)
      - Returns: AI-processed search results with analysis and key insights
      - Example: {"query": "Hobart dishwasher parts pricing 2024", "maxResults": 5, "focusArea": "pricing"}
   
   b) **SERP Search** - Raw Google search results via SERP API
      - Endpoint: POST /api/purchase-agent/search/serp
      - Required: query (search terms)
      - Optional: numResults (default 10), location, domain (default google.com), language (default en)
      - Returns: Raw Google search results without AI processing
      - Example: {"query": "commercial oven repair Chicago", "numResults": 15, "location": "Chicago, IL"}

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
- For finding equipment images → use "equipment_image_search" with parameters: make, model
- For finding part images → use "part_image_search" with parameters: make, model, partName, oemNumber?
- For enriching part information → use "enrich_part" with parameters: partNumber, make?, model?
- For finding generic part alternatives → use "find_generic_parts" with parameters: query, equipment_make?, equipment_model?
- For real-time information (stocks, weather, news, current events) → use "web_search" with parameters: query
- For AI-powered web search with analysis → use "ai_web_search" with parameters: query, maxResults?, includeAnalysis?, focusArea?
- For raw Google search results → use "serp_search" with parameters: query, numResults?, location?, domain?, language?

MULTI-STEP PLANNING:
When a task requires multiple steps (like parts resolution + supplier search + email), you should:
1. ALWAYS include a "complete_plan" array showing all planned steps for ANY multi-step task
2. Set "requires_planning_confirmation" to true for multi-step tasks
3. Show the user the complete workflow before executing any actions
4. IMPORTANT: Always return the FIRST action in the workflow, not "complete_plan" as the action
5. IMPORTANT: For complex workflows with 3+ steps, break down the exact sequence:
   - Step 1: Initial action (search_parts, web_search, etc.)
   - Step 2: Secondary action (search_suppliers, etc.) 
   - Step 3: Final action (send_email, send_sms)
6. Be especially thorough with complex requests involving parts → suppliers → communication

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

User: "Look up suppliers for Henny Penny part 77575, then text the best pricing to our manager at +15551234567"
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
  "default_values": {},
  "requires_confirmation": false,
  "complete_plan": [
    {"step": 1, "action": "search_suppliers", "description": "Find suppliers for Henny Penny part 77575"},
    {"step": 2, "action": "send_sms", "description": "Text the best pricing information to manager at +15551234567"}
  ],
  "requires_planning_confirmation": true,
  "reasoning": "User wants supplier search followed by SMS with pricing info, requires 2-step workflow",
  "preview": "Complete workflow: 1) Search for suppliers carrying Henny Penny part 77575, 2) Send SMS with best pricing to +15551234567"
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

User: "Resolve what part we need for a broken Vulcan oven door, find 3 suppliers with pricing, and email the comparison to purchasing@company.com"
Response:
\`\`\`json
{
  "action": "search_parts",
  "parameters": {
    "description": "oven door",
    "make": "Vulcan",
    "model": "oven"
  },
  "confidence": 0.8,
  "missing_info": ["specific_model_number", "door_component_details"],
  "default_values": {
    "model": "I used generic 'oven' since no specific model was provided",
    "description": "I used 'oven door' as the part description to search for"
  },
  "requires_confirmation": false,
  "complete_plan": [
    {"step": 1, "action": "search_parts", "description": "Find the specific part needed for Vulcan oven door"},
    {"step": 2, "action": "search_suppliers", "description": "Find 3 suppliers with pricing for the identified part"},
    {"step": 3, "action": "send_email", "description": "Email supplier comparison to purchasing@company.com"}
  ],
  "requires_planning_confirmation": true,
  "reasoning": "User wants complete parts resolution workflow: identify part → find suppliers → email comparison. This requires all 3 steps in sequence.",
  "preview": "Complete workflow: 1) Identify Vulcan oven door part, 2) Find 3 suppliers with pricing, 3) Email comparison to purchasing@company.com"
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
        // Check if this is a multi-step workflow that includes SMS or email
        if (actionPlan.complete_plan && actionPlan.complete_plan.length > 1) {
          const hasFollowupAction = actionPlan.complete_plan.some(step => 
            step.action === 'send_sms' || step.action === 'send_email'
          );
          if (hasFollowupAction) {
            console.log('✅ Using executeActionWithFollowup for supplier workflow');
            result = await this.executeActionWithFollowup(actionPlan);
          } else {
            result = await this.executeSearchSuppliers(parameters);
          }
        } else {
          result = await this.executeSearchSuppliers(parameters);
        }
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
      case 'search_equipment_image':
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
      case 'ai_web_search':
        result = await this.executeAIWebSearch(parameters);
        break;
      case 'serp_search':
        result = await this.executeSerpSearch(parameters);
        break;
      case 'execute_code':
        result = await this.executeCodeExecution(parameters);
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
      } else if (result.success && this.currentPlan && this.currentPlan.length > 1) {
        // If there's a next step in the workflow and current action succeeded, execute it
        const currentStepIndex = this.currentPlan.findIndex(step => step.action === action);
        if (currentStepIndex >= 0 && currentStepIndex < this.currentPlan.length - 1) {
          const nextStep = this.currentPlan[currentStepIndex + 1];
          console.log(`🔄 Continuing workflow: ${action} → ${nextStep.action}`);
          
          // For multi-step workflows, we need to prepare parameters for the next action
          let nextActionParams = {};
          
          // Special handling for specific workflow combinations
          if (action === 'equipment_image_search' && nextStep.action === 'send_email') {
            // Prepare email with image data
            const imageData = result.data;
            if (imageData && imageData.image && imageData.image.url) {
              nextActionParams = {
                to: "samueldbrewer@gmail.com", // Get from original objective
                subject: `${imageData.equipment_make} ${imageData.equipment_model} Equipment Image`,
                text: `Here is the equipment image you requested for ${imageData.equipment_make} ${imageData.equipment_model}:\n\n${imageData.image.title}\n\nImage URL: ${imageData.image.url}\n\nConfidence: ${Math.round(imageData.image.confidence * 100)}%\n\nSource: ${imageData.image.source}`
              };
            }
          } else if (action === 'web_search' && nextStep.action === 'send_email') {
            // Prepare email with web search results
            const searchData = result.data;
            if (searchData) {
              // Extract key information from web search result
              const searchText = searchData.output_text || 'Web search completed';
              const stockPriceMatch = searchText.match(/trading at \$?([\d,]+\.?\d*)/i);
              const stockPrice = stockPriceMatch ? stockPriceMatch[1] : 'N/A';
              
              nextActionParams = {
                to: "samueldbrewer@gmail.com", 
                subject: "Current NVDA Stock Price",
                text: `Hi,\n\nHere are the latest NVDA stock price details:\n\n${searchText}\n\nBest regards`
              };
            }
          } else if (action === 'search_parts' && nextStep.action === 'search_suppliers') {
            // Pass the found part number to supplier search
            const partData = result.data;
            console.log(`🔧 Raw part data for supplier search:`, JSON.stringify(partData, null, 2));
            
            // Handle nested data structure from parts search
            const recommendedResult = partData?.data?.recommended_result || partData?.recommended_result;
            if (recommendedResult && recommendedResult.oem_part_number) {
              // Format for /api/purchase-agent/suppliers/search endpoint which expects { partNumber, options }
              nextActionParams = {
                partNumber: recommendedResult.oem_part_number,
                options: {
                  make: recommendedResult.manufacturer || 'Unknown',
                  model: '',
                  limit: 5
                }
              };
              console.log(`🔧 Passing part data to supplier search:`, nextActionParams);
            } else {
              console.log(`❌ Could not extract part number from parts data:`, JSON.stringify(partData, null, 2));
            }
          } else if (action === 'search_suppliers' && nextStep.action === 'send_sms') {
            // Pass supplier results to SMS
            const supplierData = result.data;
            if (supplierData && supplierData.suppliers && Array.isArray(supplierData.suppliers)) {
              // Format suppliers for SMS
              const supplierList = supplierData.suppliers.slice(0, 3).map((supplier, index) => 
                `${index + 1}. ${supplier.name}\n   ${supplier.contact || 'No contact info'}\n   ${supplier.location || 'Location not specified'}`
              ).join('\n\n');
              
              // Extract phone number from step parameters
              const smsStep = actionPlan.complete_plan?.find(step => step.action === 'send_sms');
              const phoneNumber = nextStep.parameters?.phoneNumber || 
                                nextStep.parameters?.phone || 
                                nextStep.parameters?.to ||
                                smsStep?.parameters?.phoneNumber ||
                                smsStep?.parameters?.phone ||
                                smsStep?.parameters?.to ||
                                "+18775641118";
              
              nextActionParams = {
                to: phoneNumber,
                message: `Supplier List:\n\n${supplierList}\n\nFor part: ${supplierData.part_number || 'N/A'}`
              };
            }
          }
          
          // Execute the next step
          const nextActionPlan = {
            action: nextStep.action,
            parameters: nextActionParams
          };
          
          const nextResult = await this.executeAction(nextActionPlan);
          
          // Combine results for the frontend
          result.nextStepResult = nextResult;
          result.continuedWorkflow = true;
        }
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
      // Add bypass_cache=true to force fresh results and clear any cached data
      const searchParams = {
        ...params,
        bypass_cache: true
      };
      
      const response = await fetch('http://localhost:3000/api/purchase-agent/suppliers/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchParams)
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
      // Map orchestrator params to endpoint params
      const mappedParams = {
        zipCode: params.zipCode || params.location || params.zip_code || '10001',
        make: params.make || params.equipment_make || params.equipmentMake || 'Unknown',
        model: params.model || params.equipment_model || params.equipmentModel || 'General',
        serviceType: params.serviceType || params.service_type || 'repair'
      };
      
      const response = await fetch('http://localhost:3000/api/purchase-agent/service-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mappedParams)
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

  async executeCodeExecution(params) {
    try {
      const { code, language = 'javascript' } = params;
      
      if (!code) {
        return {
          success: false,
          message: 'Code is required for execution',
          data: null
        };
      }

      const result = await this.codeExecutor.executeCode(code, language);
      
      return {
        success: result.success,
        message: result.success ? 'Code executed successfully' : `Code execution failed: ${result.error}`,
        data: {
          output: result.output,
          error: result.error,
          language: language,
          executedCode: code
        }
      };
    } catch (error) {
      return {
        success: false,
        message: `Code execution error: ${error.message}`,
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

  async executeAIWebSearch(params) {
    try {
      const response = await fetch('http://localhost:3000/api/purchase-agent/search/web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const result = await response.json();
      return {
        success: response.ok,
        message: response.ok ? 'AI web search completed' : result.error,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: `AI web search error: ${error.message}`,
        data: null
      };
    }
  }

  async executeSerpSearch(params) {
    try {
      const response = await fetch('http://localhost:3000/api/purchase-agent/search/serp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const result = await response.json();
      return {
        success: response.ok,
        message: response.ok ? 'SERP search completed' : result.error,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: `SERP search error: ${error.message}`,
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
        case 'search_suppliers':
          primaryResult = await this.executeSearchSuppliers(actionPlan.parameters);
          break;
        default:
          throw new Error(`Unsupported action for followup: ${actionPlan.action}`);
      }
      
      if (!primaryResult.success) {
        return primaryResult;
      }
      
      // Check if there's a complete_plan to follow instead of asking AI
      console.log(`🔍 WORKFLOW DEBUG: Has complete_plan?`, !!actionPlan.complete_plan);
      console.log(`🔍 WORKFLOW DEBUG: Plan length:`, actionPlan.complete_plan ? actionPlan.complete_plan.length : 'N/A');
      if (actionPlan.complete_plan && actionPlan.complete_plan.length > 1) {
        console.log(`🔍 Checking planned workflow for action: ${actionPlan.action}`);
        console.log(`🔍 Complete plan:`, JSON.stringify(actionPlan.complete_plan, null, 2));
        const currentStepIndex = actionPlan.complete_plan.findIndex(step => step.action === actionPlan.action);
        console.log(`🔍 Current step index: ${currentStepIndex}`);
        if (currentStepIndex >= 0 && currentStepIndex < actionPlan.complete_plan.length - 1) {
          const nextStep = actionPlan.complete_plan[currentStepIndex + 1];
          console.log(`🔄 Following planned workflow: ${actionPlan.action} → ${nextStep.action}`);
          
          // Prepare parameters for the next action based on current results
          let nextActionParams = {};
          
          if (actionPlan.action === 'search_parts' && nextStep.action === 'search_suppliers') {
            // Pass the found part number to supplier search
            const partData = primaryResult.data;
            console.log(`🔧 Raw part data for supplier search:`, JSON.stringify(partData, null, 2));
            
            // Handle nested data structure from parts search
            const recommendedResult = partData?.data?.recommended_result || partData?.recommended_result;
            if (recommendedResult && recommendedResult.oem_part_number) {
              // Format for /api/purchase-agent/suppliers/search endpoint which expects { partNumber, options }
              nextActionParams = {
                partNumber: recommendedResult.oem_part_number,
                options: {
                  make: recommendedResult.manufacturer || actionPlan.parameters?.make || 'Unknown',
                  model: actionPlan.parameters?.model || '',
                  limit: 5
                }
              };
              console.log(`🔧 Passing part data to supplier search:`, nextActionParams);
            } else {
              console.log(`❌ Could not extract part number from parts data:`, JSON.stringify(partData, null, 2));
            }
          } else if (actionPlan.action === 'search_suppliers' && nextStep.action === 'send_sms') {
            // Pass supplier results to SMS
            const supplierData = primaryResult.data;
            console.log(`🔧 Raw supplier data for SMS:`, JSON.stringify(supplierData, null, 2));
            
            // Handle nested data structure - supplier data might be in data.data.suppliers
            const actualSupplierData = supplierData?.data || supplierData;
            const suppliers = actualSupplierData?.suppliers || [];
            
            
            if (suppliers && Array.isArray(suppliers) && suppliers.length > 0) {
              // Format suppliers for SMS
              const supplierList = suppliers.slice(0, 3).map((supplier, index) => 
                `${index + 1}. ${supplier.title || supplier.name || 'Unknown'}\n   ${supplier.url || 'No URL'}\n   Domain: ${supplier.domain || 'Unknown'}`
              ).join('\n\n');
              
              // Extract phone number from next step or original plan
              const smsStep = actionPlan.complete_plan?.find(step => step.action === 'send_sms');
              const phoneNumber = nextStep.parameters?.phoneNumber || 
                                nextStep.parameters?.phone || 
                                nextStep.parameters?.to ||
                                smsStep?.parameters?.phoneNumber ||
                                smsStep?.parameters?.phone ||
                                smsStep?.parameters?.to ||
                                "+18775641118";
              
              nextActionParams = {
                to: phoneNumber,
                message: `Top 3 Suppliers for ${actualSupplierData.part_number || 'Part'}:\n\n${supplierList}`
              };
              console.log(`🔧 Passing supplier data to SMS:`, nextActionParams);
            } else {
              // No suppliers found - send notification SMS
              const partNumber = actualSupplierData.part_number || actualSupplierData.partNumber || 'Unknown part';
              const smsStep = actionPlan.complete_plan?.find(step => step.action === 'send_sms');
              const phoneNumber = nextStep.parameters?.phoneNumber || 
                                nextStep.parameters?.phone || 
                                nextStep.parameters?.to ||
                                smsStep?.parameters?.phoneNumber ||
                                smsStep?.parameters?.phone ||
                                smsStep?.parameters?.to ||
                                "+18775641118";
              
              nextActionParams = {
                to: phoneNumber,
                message: `No suppliers found for part: ${partNumber}\n\nPlease check the part number or try alternative sources.`
              };
              console.log(`❌ No suppliers found - sending notification SMS:`, nextActionParams);
            }
          } else if (actionPlan.action === 'search_suppliers' && nextStep.action === 'send_email') {
            // Pass supplier results to email
            const supplierData = primaryResult.data;
            console.log(`🔧 Raw supplier data for email:`, JSON.stringify(supplierData, null, 2));
            
            // Handle nested data structure - supplier data might be in data.data.suppliers
            const actualSupplierData = supplierData?.data || supplierData;
            const suppliers = actualSupplierData?.suppliers || [];
            
            // Extract email parameters from next step or original plan
            const emailStep = actionPlan.complete_plan?.find(step => step.action === 'send_email');
            const emailAddress = nextStep.parameters?.to || 
                               nextStep.parameters?.email ||
                               emailStep?.parameters?.to ||
                               emailStep?.parameters?.email ||
                               "purchasing@company.com";
            
            if (suppliers && Array.isArray(suppliers) && suppliers.length > 0) {
              // Format suppliers for email with pricing focus
              const supplierComparison = suppliers.slice(0, 3).map((supplier, index) => 
                `${index + 1}. ${supplier.title || supplier.name || 'Unknown Supplier'}
   Website: ${supplier.domain || 'Unknown'}
   URL: ${supplier.url || 'No URL available'}
   Description: ${supplier.snippet || 'No description available'}
   ${supplier.price ? `Price: ${supplier.price}` : 'Contact for pricing'}`
              ).join('\n\n');
              
              const partNumber = actualSupplierData.part_number || actualSupplierData.partNumber || 'Unknown part';
              
              nextActionParams = {
                to: emailAddress,
                subject: `Supplier Comparison for Part ${partNumber}`,
                text: `Supplier Comparison Report for Part: ${partNumber}

We found ${suppliers.length} suppliers for this part. Here are the top 3 options:

${supplierComparison}

Please review these options and contact the suppliers directly for current pricing and availability.

Best regards,
PartnerPlus Purchase Agent`
              };
              console.log(`🔧 Passing supplier data to email:`, nextActionParams);
            } else {
              // No suppliers found - send notification email
              const partNumber = actualSupplierData.part_number || actualSupplierData.partNumber || 'Unknown part';
              
              nextActionParams = {
                to: emailAddress,
                subject: `No Suppliers Found for Part ${partNumber}`,
                text: `Supplier Search Results for Part: ${partNumber}

Unfortunately, no suppliers were found for this part number.

Recommendations:
- Verify the part number is correct
- Check for alternative or compatible part numbers
- Contact the equipment manufacturer directly
- Try searching with different keywords or specifications

Please let us know if you need assistance with alternative part searches.

Best regards,
PartnerPlus Purchase Agent`
              };
              console.log(`❌ No suppliers found - sending notification email:`, nextActionParams);
            }
          }
          
          // Execute the planned next step
          const nextActionPlan = {
            action: nextStep.action,
            parameters: nextActionParams,
            complete_plan: actionPlan.complete_plan // Pass along the plan
          };
          
          const nextResult = await this.executeAction(nextActionPlan);
          
          // Return combined results
          return {
            success: true,
            message: `${actionPlan.action} completed. Continuing with planned workflow.`,
            data: {
              primaryAction: {
                success: primaryResult.success,
                data: primaryResult.data
              },
              plannedNextStep: {
                action: nextStep.action,
                result: nextResult
              }
            },
            workflowSummary: nextResult.workflowSummary || this.generateWorkflowSummary(),
            continuedWorkflow: true
          };
        }
      }
      
      // Get the primary action results - could be web search results, parts data, supplier data, etc.
      let primaryData;
      if (actionPlan.action === 'web_search') {
        primaryData = primaryResult.data.results;
      } else if (actionPlan.action === 'search_parts') {
        primaryData = JSON.stringify(primaryResult.data, null, 2);
      } else if (actionPlan.action === 'search_suppliers') {
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
          message: `${actionPlan.action} completed, but could not determine next action`,
          data: primaryResult.data
        };
      }

      // Execute the followup action automatically if it exists
      if (followupAction.action && followupAction.action !== actionPlan.action) {
        console.log('🔄 Executing followup action:', followupAction.action);
        const followupResult = await this.executeAction(followupAction);
        
        // Prepare response for successful multi-step execution
        const actionStart = Date.now();
        const actionEnd = Date.now();
        
        // Create workflow summary
        const workflowSummary = {
          summary: "Workflow completed successfully",
          totalActions: 2,
          totalDuration: (actionEnd - actionStart),
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          actions: [
            {
              step: 1,
              action: actionPlan.action,
              status: primaryResult.success ? 'completed' : 'failed',
              duration: '0ms', // We don't track this precisely
              message: primaryResult.message
            },
            {
              step: 2,
              action: followupAction.action,
              status: followupResult.success ? 'completed' : 'failed', 
              duration: '0ms',
              message: followupResult.message
            }
          ],
          originalObjective: originalObjective
        };
        
        return {
          success: true,
          message: `${actionPlan.action} completed. Follow-up action ready for confirmation.`,
          data: {
            primaryAction: primaryResult.data,
            followupAction: followupAction,
            requiresFollowup: true
          },
          nextStepResult: followupResult,
          workflowSummary: workflowSummary,
          continuedWorkflow: true
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