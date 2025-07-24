const OpenAI = require('openai');
require('dotenv').config();

class OpenAIClient {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async chat(messages, options = {}) {
    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4-mini',
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
        model: 'gpt-4-mini',
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