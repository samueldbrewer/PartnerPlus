const twilio = require('twilio');

class SMSService {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.messages = [];
  }

  async initialize() {
    if (!this.config.accountSid || !this.config.authToken) {
      throw new Error('Twilio credentials not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN');
    }

    this.client = twilio(this.config.accountSid, this.config.authToken);
    
    // Test the connection
    try {
      await this.client.api.accounts(this.config.accountSid).fetch();
      console.log('Twilio SMS service initialized successfully');
      return true;
    } catch (error) {
      console.error('Twilio initialization error:', error.message);
      throw error;
    }
  }

  async sendSMS(to, message) {
    try {
      if (!this.client) {
        throw new Error('SMS service not initialized');
      }

      // Ensure phone number is in E.164 format
      if (!to.startsWith('+')) {
        if (to.length === 10) {
          to = '+1' + to; // Assume US number if 10 digits
        } else if (to.length === 11 && to.startsWith('1')) {
          to = '+' + to; // Add + to 11-digit US number
        }
      }

      const result = await this.client.messages.create({
        body: message,
        from: this.config.phoneNumber,
        to: to
      });

      // Store sent message
      const messageData = {
        id: result.sid,
        to: to,
        from: this.config.phoneNumber,
        body: message,
        direction: 'outbound',
        status: result.status,
        date: new Date(),
        type: 'sent'
      };

      this.messages.unshift(messageData);

      return {
        success: true,
        messageId: result.sid,
        status: result.status,
        to: to,
        message: message
      };
    } catch (error) {
      console.error('Send SMS error:', error);
      return {
        success: false,
        error: `Failed to send SMS: ${error.message}`
      };
    }
  }

  async getMessages(limit = 20) {
    try {
      if (!this.client) {
        return this.messages.slice(0, limit);
      }

      // Fetch recent messages from Twilio
      const messages = await this.client.messages.list({
        limit: limit
      });

      const formattedMessages = messages.map(msg => ({
        id: msg.sid,
        to: msg.to,
        from: msg.from,
        body: msg.body,
        direction: msg.direction,
        status: msg.status,
        date: new Date(msg.dateCreated),
        type: msg.direction === 'outbound-api' ? 'sent' : 'received'
      }));

      // Merge with local messages and remove duplicates
      const allMessages = [...formattedMessages, ...this.messages];
      const uniqueMessages = allMessages.filter((msg, index, arr) => 
        arr.findIndex(m => m.id === msg.id) === index
      );

      // Sort by date, most recent first
      uniqueMessages.sort((a, b) => new Date(b.date) - new Date(a.date));

      this.messages = uniqueMessages;
      return uniqueMessages.slice(0, limit);
    } catch (error) {
      console.error('Get messages error:', error);
      return this.messages.slice(0, limit);
    }
  }

  async refreshMessages() {
    return await this.getMessages(50);
  }

  formatPhoneNumber(phoneNumber) {
    // Remove all non-digit characters
    const digits = phoneNumber.replace(/\D/g, '');
    
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    
    return phoneNumber; // Return original if can't format
  }
}

module.exports = SMSService;