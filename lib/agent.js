const OpenAIClient = require('./openai-client');

class Agent {
  constructor() {
    this.openai = new OpenAIClient();
    this.tools = this.defineTools();
    this.conversationHistory = [];
  }

  defineTools() {
    return [
      {
        type: 'function',
        function: {
          name: 'get_current_time',
          description: 'Get the current date and time',
          parameters: {
            type: 'object',
            properties: {
              timezone: {
                type: 'string',
                description: 'The timezone to get the time for (e.g., "UTC", "America/New_York")'
              }
            },
            required: []
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'calculate',
          description: 'Perform basic mathematical calculations',
          parameters: {
            type: 'object',
            properties: {
              expression: {
                type: 'string',
                description: 'The mathematical expression to evaluate'
              }
            },
            required: ['expression']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'search_web',
          description: 'Search the web for information',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query'
              }
            },
            required: ['query']
          }
        }
      }
    ];
  }

  async executeFunction(functionName, args) {
    switch (functionName) {
      case 'get_current_time':
        const timezone = args.timezone || 'UTC';
        const date = new Date();
        return {
          result: date.toLocaleString('en-US', { timeZone: timezone, dateStyle: 'full', timeStyle: 'long' })
        };
      
      case 'calculate':
        try {
          // Basic safe evaluation for simple math
          const result = Function('"use strict"; return (' + args.expression + ')')();
          return { result: result.toString() };
        } catch (error) {
          return { error: 'Invalid mathematical expression' };
        }
      
      case 'search_web':
        // Placeholder for web search functionality
        return { 
          result: `Search results for "${args.query}":`,
          items: [
            'Result 1: Example search result',
            'Result 2: Another example result',
            'Result 3: Third example result'
          ]
        };
      
      default:
        return { error: 'Unknown function' };
    }
  }

  async processMessage(userMessage) {
    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: userMessage
    });

    let messages = [...this.conversationHistory];
    
    // Get response from OpenAI with tools
    const response = await this.openai.chatWithTools(messages, this.tools);

    // Check if the model wants to use a tool
    if (response.message.tool_calls) {
      // Add assistant's message with tool calls to history
      this.conversationHistory.push(response.message);
      messages.push(response.message);

      // Execute each tool call
      for (const toolCall of response.message.tool_calls) {
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);
        
        // Execute the function
        const result = await this.executeFunction(functionName, args);
        
        // Add tool response to messages
        const toolMessage = {
          role: 'tool',
          content: JSON.stringify(result),
          tool_call_id: toolCall.id
        };
        messages.push(toolMessage);
      }

      // Get final response from OpenAI after tool execution
      const finalResponse = await this.openai.chat(messages);
      this.conversationHistory.push(finalResponse);
      
      return finalResponse.content;
    } else {
      // No tool calls, just return the response
      this.conversationHistory.push(response.message);
      return response.message.content;
    }
  }

  clearHistory() {
    this.conversationHistory = [];
  }
}

module.exports = Agent;