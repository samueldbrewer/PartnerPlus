const OpenAI = require('openai');
require('dotenv').config();

class OpenAIClient {
  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('⚠️ OPENAI_API_KEY not found in environment variables');
      throw new Error('OPENAI_API_KEY is required');
    }
    
    // Remove quotes if they exist (Railway issue)
    const cleanApiKey = apiKey.replace(/^["']|["']$/g, '');
    
    this.client = new OpenAI({
      apiKey: cleanApiKey,
    });
  }

  async chat(messages, options = {}) {
    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4.1-mini-2025-04-14',
        messages: messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 1000,
        ...options
      });

      return response.choices[0].message;
    } catch (error) {
      console.error('OpenAI API Error:', error);
      throw error;
    }
  }

  async chatWithTools(messages, tools, options = {}) {
    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4.1-mini-2025-04-14',
        messages: messages,
        tools: tools,
        tool_choice: options.tool_choice || 'auto',
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 1000,
        ...options
      });

      return response.choices[0];
    } catch (error) {
      console.error('OpenAI API Error:', error);
      throw error;
    }
  }

  async chatWithResponses(input, options = {}) {
    try {
      // Use the new Responses API for all interactions
      const model = options.model || 'gpt-4.1-mini-2025-04-14'; // Allow model override
      const tools = options.tools || [];
      
      // Create clean options for Responses API (only temperature is supported, not max_tokens)
      const cleanOptions = {
        temperature: options.temperature || 0.7,
        stream: options.stream || false
      };
      
      const requestBody = {
        model: model,
        input: input,
        ...cleanOptions
      };
      
      // Add tools if they exist
      if (tools && tools.length > 0) {
        requestBody.tools = tools;
        requestBody.tool_choice = 'auto'; // Explicitly allow tool usage
      }
      
      const response = await this.client.responses.create(requestBody);

      return response;
    } catch (error) {
      console.error('OpenAI Responses API Error:', error);
      // Fallback to regular chat if Responses API fails
      console.log('Falling back to regular chat');
      
      // Convert Responses API format to regular chat format
      const chatMessages = [];
      if (typeof input === 'string') {
        // Simple string input - convert to user message
        chatMessages.push({ role: 'user', content: input });
      } else if (Array.isArray(input)) {
        // Array of messages - convert from Responses format to chat format
        for (const msg of input) {
          if (msg.content && Array.isArray(msg.content)) {
            // Extract text from content array
            const textContent = msg.content
              .filter(item => item.type === 'text')
              .map(item => item.text)
              .join('\n');
            chatMessages.push({
              role: msg.role,
              content: textContent
            });
          } else if (typeof msg.content === 'string') {
            chatMessages.push(msg);
          }
        }
      }
      
      // Create clean fallback options without custom parameters
      const fallbackOptions = {
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 1500
      };
      
      return await this.chat(chatMessages, fallbackOptions);
    }
  }
}

module.exports = OpenAIClient;