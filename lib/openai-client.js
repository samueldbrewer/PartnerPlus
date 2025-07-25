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
}

module.exports = OpenAIClient;