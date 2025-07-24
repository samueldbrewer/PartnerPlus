const nodemailer = require('nodemailer');
const Imap = require('imap');
const { simpleParser } = require('mailparser');

class EmailService {
  constructor(config) {
    this.config = config;
    this.transporter = null;
    this.imap = null;
    this.inbox = [];
  }

  async initialize() {
    // Initialize SMTP transporter for sending emails
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: this.config.smtp.user,
        pass: this.config.smtp.pass
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    // Try to verify SMTP connection but don't fail initialization
    try {
      await this.transporter.verify();
      console.log('SMTP server is ready to send emails');
      this.smtpReady = true;
    } catch (error) {
      console.error('SMTP Error (will try anyway):', error.message);
      this.smtpReady = false;
      // Don't throw error - let IMAP work even if SMTP fails
    }

    // Initialize IMAP for receiving emails
    this.imap = new Imap({
      user: this.config.imap.user,
      password: this.config.imap.pass,
      host: this.config.imap.host,
      port: this.config.imap.port,
      tls: this.config.imap.tls,
      tlsOptions: { rejectUnauthorized: false }
    });
  }

  async sendEmail(to, subject, text, html) {
    try {
      // Try different SMTP configurations if the first fails
      const configs = [
        {
          service: 'gmail',
          port: 587,
          secure: false,
          requireTLS: true
        },
        {
          service: 'gmail',
          port: 465,
          secure: true
        },
        {
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          requireTLS: true
        }
      ];

      for (let i = 0; i < configs.length; i++) {
        try {
          const transporter = nodemailer.createTransport({
            ...configs[i],
            auth: {
              user: this.config.smtp.user,
              pass: this.config.smtp.pass
            },
            tls: {
              rejectUnauthorized: false
            }
          });

          const mailOptions = {
            from: this.config.smtp.from || this.config.smtp.user,
            to: to,
            subject: subject,
            text: text,
            html: html || text
          };

          const info = await transporter.sendMail(mailOptions);
          console.log(`Email sent successfully using config ${i + 1}`);
          return {
            success: true,
            messageId: info.messageId,
            response: info.response
          };
        } catch (configError) {
          console.log(`Config ${i + 1} failed:`, configError.message);
          if (i === configs.length - 1) throw configError;
        }
      }
    } catch (error) {
      console.error('Send email error:', error);
      return {
        success: false,
        error: `Failed to send email: ${error.message}. Make sure you have a valid Gmail App Password.`
      };
    }
  }

  fetchEmails() {
    return new Promise((resolve, reject) => {
      const emails = new Map(); // Use Map to ensure no duplicates
      let expectedCount = 0;
      let processedCount = 0;
      
      this.imap.once('ready', () => {
        this.imap.openBox('INBOX', false, (err, box) => {
          if (err) {
            reject(err);
            return;
          }

          console.log(`Total messages in inbox: ${box.messages.total}`);
          expectedCount = box.messages.total;
          
          if (expectedCount === 0) {
            this.imap.end();
            resolve([]);
            return;
          }
          
          // Try fetching all emails first to see what we get
          const fetchRange = '1:*';
          console.log(`Fetching range: ${fetchRange}`);
          const f = this.imap.seq.fetch(fetchRange, {
            bodies: '',
            struct: true
          });

          f.on('message', (msg, seqno) => {
            msg.on('body', (stream, info) => {
              simpleParser(stream, (err, parsed) => {
                if (err) {
                  console.error('Parse error:', err);
                  processedCount++;
                  return;
                }

                const emailData = {
                  id: seqno,
                  from: parsed.from?.text || 'Unknown',
                  to: parsed.to?.text || 'Unknown',
                  subject: parsed.subject || 'No Subject',
                  text: parsed.text || '',
                  html: parsed.html || '',
                  date: parsed.date || new Date(),
                  attachments: parsed.attachments?.length || 0
                };
                
                console.log(`Parsed email ${seqno}: ${emailData.subject} from ${emailData.from} at ${emailData.date}`);
                emails.set(seqno, emailData);
                processedCount++;
                
                // Check if we've processed all emails
                if (processedCount === expectedCount) {
                  this.imap.end();
                  // Convert Map to Array and sort by date, most recent first
                  const emailArray = Array.from(emails.values());
                  emailArray.sort((a, b) => new Date(b.date) - new Date(a.date));
                  this.inbox = emailArray;
                  console.log(`Returning ${emailArray.length} emails`);
                  resolve(emailArray);
                }
              });
            });
          });

          f.once('error', (err) => {
            console.error('Fetch error:', err);
            reject(err);
          });

          // Fallback timeout in case some emails don't process
          setTimeout(() => {
            if (emails.size > 0) {
              this.imap.end();
              const emailArray = Array.from(emails.values());
              emailArray.sort((a, b) => new Date(b.date) - new Date(a.date));
              this.inbox = emailArray;
              console.log(`Timeout: Returning ${emailArray.length} emails`);
              resolve(emailArray);
            }
          }, 5000);
        });
      });

      this.imap.once('error', (err) => {
        console.error('IMAP error:', err);
        reject(err);
      });

      this.imap.connect();
    });
  }

  async getInbox(limit = 10) {
    try {
      // If we have cached emails, return them
      if (this.inbox.length > 0) {
        return this.inbox.slice(0, limit);
      }
      
      // Otherwise fetch new emails
      const emails = await this.fetchEmails();
      return emails.slice(0, limit);
    } catch (error) {
      console.error('Get inbox error:', error);
      return [];
    }
  }

  async refreshInbox() {
    try {
      const emails = await this.fetchEmails();
      return emails;
    } catch (error) {
      console.error('Refresh inbox error:', error);
      return this.inbox; // Return cached emails on error
    }
  }
}

module.exports = EmailService;