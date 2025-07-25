const OpenAIClient = require('./openai-client');

class Agent {
  constructor() {
    this.openai = new OpenAIClient();
    this.conversationHistory = [];
  }

  async processMessage(userMessage, options = {}) {
    try {
      // Build conversation context
      const conversationContext = this.conversationHistory.map(msg => {
        if (msg.role === 'user') {
          return `User: ${msg.content}`;
        } else if (msg.role === 'assistant') {
          return `Assistant: ${msg.content}`;
        } else if (msg.role === 'tool') {
          return `Tool Result: ${msg.content}`;
        }
        return '';
      }).join('\n');

      // Check if the message needs web search
      const needsWebSearch = userMessage.toLowerCase().includes('search') || 
                            userMessage.toLowerCase().includes('find') ||
                            userMessage.toLowerCase().includes('latest') ||
                            userMessage.toLowerCase().includes('current') ||
                            userMessage.toLowerCase().includes('news') ||
                            userMessage.toLowerCase().includes('web');

      // Prepare the input for Responses API
      const input = conversationContext ? 
        `${conversationContext}\n\nUser: ${userMessage}\n\nAssistant:` : 
        `User: ${userMessage}\n\nAssistant:`;

      // Use the Responses API for everything
      console.log('Using Responses API with web search:', needsWebSearch);
      const response = await this.openai.chatWithResponses(input, {
        includeWebSearch: needsWebSearch,
        temperature: 0.7,
        max_tokens: 1500,
        stream: options.stream || false
      });
      
      // Handle streaming response
      if (options.stream && response[Symbol.asyncIterator]) {
        return this.handleStreamingResponse(response, userMessage, options.onChunk);
      }
      
      // Extract the response content according to Responses API format
      let responseContent;
      
      console.log('Response type:', typeof response);
      console.log('Is array:', Array.isArray(response));
      console.log('Response keys:', Object.keys(response));
      console.log('Full response:', JSON.stringify(response, null, 2));
      
      // Check if response is an array (like your examples)
      if (Array.isArray(response)) {
        // Find the message with role 'assistant' and extract text
        const assistantMessage = response.find(item => item.role === 'assistant');
        console.log('Assistant message found:', !!assistantMessage);
        if (assistantMessage) {
          console.log('Assistant message:', assistantMessage);
          if (assistantMessage.content && assistantMessage.content[0] && assistantMessage.content[0].text) {
            responseContent = assistantMessage.content[0].text;
            console.log('Extracted text:', responseContent);
          } else {
            console.log('Could not extract text from assistant message');
            responseContent = JSON.stringify(response);
          }
        } else {
          console.log('No assistant message found in array');
          responseContent = JSON.stringify(response);
        }
      } else if (response.output_text) {
        // Responses API has direct output_text field
        responseContent = response.output_text;
        console.log('Using output_text:', responseContent);
      } else if (response.output && Array.isArray(response.output)) {
        // Responses API returns content in the 'output' field as array
        const assistantMessage = response.output.find(item => item.role === 'assistant');
        if (assistantMessage && assistantMessage.content && assistantMessage.content[0] && assistantMessage.content[0].text) {
          responseContent = assistantMessage.content[0].text;
          console.log('Extracted from output array:', responseContent);
        } else {
          responseContent = JSON.stringify(response.output);
        }
      } else if (response.output) {
        // Responses API returns content in the 'output' field
        responseContent = typeof response.output === 'string' ? response.output : JSON.stringify(response.output);
      } else if (response.choices && response.choices[0]) {
        // Fallback to chat completions format
        responseContent = response.choices[0].message?.content || response.choices[0].content || response.choices[0].text;
      } else if (response.content) {
        responseContent = response.content;
      } else if (response.text) {
        responseContent = response.text;
      } else if (typeof response === 'string') {
        responseContent = response;
      } else {
        // Final fallback
        console.log('Using JSON stringify fallback');
        responseContent = JSON.stringify(response);
      }
      
      // Add to conversation history
      this.conversationHistory.push({
        role: 'user',
        content: userMessage
      });
      this.conversationHistory.push({
        role: 'assistant',
        content: responseContent
      });
      
      return responseContent;
    } catch (error) {
      console.error('Error processing message:', error);
      
      // If Responses API fails, provide a helpful error message
      const errorMessage = `I encountered an error while processing your request. ${error.message || 'Please try again.'}`;
      
      this.conversationHistory.push({
        role: 'user',
        content: userMessage
      });
      this.conversationHistory.push({
        role: 'assistant',
        content: errorMessage
      });
      
      return errorMessage;
    }
  }

  async handleStreamingResponse(stream, userMessage, onChunk) {
    let fullResponse = '';
    let currentMessageId = null;
    
    try {
      // Add user message to history immediately
      this.conversationHistory.push({
        role: 'user',
        content: userMessage
      });

      for await (const event of stream) {
        console.log('Stream event:', event.type);
        
        switch (event.type) {
          case 'response.output_text.delta':
            // Text delta - append to current response
            if (event.delta) {
              fullResponse += event.delta;
              if (onChunk) {
                onChunk({
                  type: 'text_delta',
                  content: event.delta,
                  fullText: fullResponse
                });
              }
            }
            break;
            
          case 'response.web_search_call.in_progress':
            if (onChunk) {
              onChunk({
                type: 'web_search_started',
                content: '🔍 Searching the web...'
              });
            }
            break;
            
          case 'response.web_search_call.searching':
            if (onChunk) {
              onChunk({
                type: 'web_search_progress',
                content: '🔍 Searching...'
              });
            }
            break;
            
          case 'response.web_search_call.completed':
            if (onChunk) {
              onChunk({
                type: 'web_search_completed',
                content: '✅ Web search completed'
              });
            }
            break;
            
          case 'response.completed':
            // Final response - extract the complete text
            if (event.response && event.response.output_text) {
              fullResponse = event.response.output_text;
            }
            if (onChunk) {
              onChunk({
                type: 'response_complete',
                content: fullResponse
              });
            }
            break;
            
          case 'response.failed':
            throw new Error(event.response?.error?.message || 'Response failed');
        }
      }
      
      // Add final response to conversation history
      this.conversationHistory.push({
        role: 'assistant',
        content: fullResponse
      });
      
      return fullResponse;
      
    } catch (error) {
      console.error('Streaming error:', error);
      const errorMessage = `Error during streaming: ${error.message}`;
      
      this.conversationHistory.push({
        role: 'assistant',
        content: errorMessage
      });
      
      if (onChunk) {
        onChunk({
          type: 'error',
          content: errorMessage
        });
      }
      
      return errorMessage;
    }
  }

  clearHistory() {
    this.conversationHistory = [];
  }

  getLastMessage() {
    // Get the last assistant message from history
    for (let i = this.conversationHistory.length - 1; i >= 0; i--) {
      const message = this.conversationHistory[i];
      if (message.role === 'assistant') {
        return message.content;
      }
    }
    return null;
  }
}

module.exports = Agent;