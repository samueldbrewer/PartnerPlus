# CLAUDE.md - PartnerPlus Repository Guide

This file provides comprehensive guidance for Claude Code when working with the PartnerPlus repository.

## Project Overview

PartnerPlus is a multi-service business automation platform that combines AI-powered chat agents, email/SMS communication, equipment parts research, and purchase automation. The system consists of multiple interconnected services working together to provide comprehensive business solutions.

### Core Purpose
- **AI Agent Hub**: Multiple AI-powered interfaces for different use cases
- **Communication Services**: Email and SMS integration via IMAP/SMTP and Twilio
- **Equipment Parts Research**: Advanced part number resolution and supplier discovery
- **Purchase Automation**: Automated purchasing through web scraping and browser automation
- **Manual Management**: Technical manual discovery and processing

## High-Level Architecture

### 1. Node.js Main Application (`index.js`)
**Port: 3000 (configurable via PORT env var)**

The primary entry point serving:
- **Express.js web server** with static file serving
- **Multiple AI chat interfaces** (simple, mobile, v2-full)
- **API orchestration** connecting all services
- **Communication services** (email/SMS integration)
- **Purchase agent proxy** (routes to Flask service)

**Key Dependencies:**
```json
{
  "express": "^5.1.0",
  "openai": "^5.10.2",
  "axios": "^1.11.0",
  "nodemailer": "^7.0.5",
  "twilio": "^5.8.0",
  "imap": "^0.8.19"
}
```

### 2. Flask Purchase Agent Service (`manual-purchase-agent_20250513_125500_v15.6/`)
**Port: 7777**

A comprehensive Python Flask microservice for equipment parts research:

**Core Models (SQLAlchemy):**
- `Part`: OEM part storage with specifications and alternates
- `Supplier`: Supplier information and reliability scores  
- `Manual`: Technical manual metadata and references
- `Purchase`: Purchase history and automation records
- `BillingProfile`: Encrypted billing information for automation

**API Blueprint Structure:**
- `/api/parts` - Part resolution and enrichment
- `/api/suppliers` - Supplier search and ranking
- `/api/manuals` - Manual discovery and parsing
- `/api/purchases` - Purchase automation
- `/api/service-providers` - Service provider location
- `/api/images` - Equipment and part image search
- `/api/recordings` - Browser automation recordings

### 3. API Scraper Service (`API Scraper V3/`)
**Port: 5000**

Specialized scraper for PartsTown.com with Playwright-based bot detection bypass:
- **Manufacturer database**: 485+ equipment manufacturers
- **Parts catalog access**: Real-time data extraction
- **Documentation retrieval**: Technical manuals and specs
- **Cloudflare bypass**: Using Playwright with Chromium

### 4. Browser Automation System (`recording_system/`)
**Port: 3001**

Node.js-based Playwright automation for e-commerce purchases:
- **Recording engine**: Captures user interactions
- **Playback system**: Intelligent element detection with fallbacks
- **Variable substitution**: Replace test data with real values
- **Multi-site support**: Works with various e-commerce platforms

## Key Service Libraries (`lib/`)

### Agent Services
- **`agent.js`**: Basic AI chat agent with OpenAI integration
- **`orchestrator-agent.js`**: Multi-tool coordination agent for complex tasks
- **`purchase-agent-service.js`**: Proxy service for Flask purchase agent
- **`code-executor.js`**: Code execution capabilities
- **`email-service.js`**: IMAP/SMTP email handling
- **`sms-service.js`**: Twilio SMS integration
- **`openai-client.js`**: OpenAI API wrapper

## Advanced Features

### Dual Search Architecture
The system implements a sophisticated "dual search" approach for part resolution:

1. **SerpAPI Direct Search**: Raw search results (first 10 organic results)
2. **GPT-4 Web Search**: AI-powered web search with analysis
3. **AI Arbitrator**: Neutral AI selects best result from both methods

This provides improved accuracy and reliability through cross-validation.

### AI-Powered Image Search
Recent additions include:
- **Equipment image search**: Find images of commercial equipment
- **Part image search**: Locate specific replacement parts visually
- Integration with the AI Agent interface for seamless searching

### Communication Integration
- **Email**: Full IMAP/SMTP with Gmail integration
- **SMS**: Twilio-based messaging with webhook support
- **Real-time updates**: Live message synchronization

## Database Architecture

### SQLite Database (`instance/app.db`)
The Flask service uses SQLAlchemy with the following key relationships:

```
Parts ←→ Suppliers (many-to-many via search results)
Manuals ←→ Parts (via PartReference)
Purchases ←→ BillingProfiles (foreign key)
ErrorCodes ←→ Manuals (foreign key)
```

**Critical Data Handling:**
- **Encrypted storage**: Billing profiles use encryption
- **JSON fields**: Specifications and alternates stored as JSON
- **Confidence scoring**: All results include confidence metrics

## Frontend Interfaces

### AI Agent Interfaces
- **`ai-agent-simple.html`**: Streamlined chat interface
- **`ai-agent-v2-full.html`**: Full-featured mobile-responsive interface
- **`ai-agent-mobile`**: Mobile-optimized version
- **`search-tools.html`**: Tabbed search interface for different functions

### Admin Interfaces
- **Data Navigator**: Database exploration tool
- **API Documentation**: Interactive API testing
- **Recording Studio**: Browser automation management

## Configuration & Deployment

### Environment Variables
```bash
# Core API Keys
OPENAI_API_KEY=your_openai_key
SERPAPI_KEY=your_serpapi_key

# Email Configuration
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
IMAP_HOST=imap.gmail.com
IMAP_PORT=993

# SMS Configuration
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_twilio_number

# Database & Security
DATABASE_URI=sqlite:///instance/app.db
SECRET_KEY=your_secret_key
ENCRYPTION_KEY=your_32_byte_encryption_key
```

### Deployment (Railway)
- **Platform**: Railway with Nixpacks builder
- **Start command**: `node index.js`
- **Build**: Automatic from `package.json` and `nixpacks.toml`
- **Restart policy**: ON_FAILURE with 10 max retries

## Development Workflow

### Local Development
```bash
# Main Node.js service
npm install
npm run dev  # or npm start

# Flask purchase agent (separate terminal)
cd manual-purchase-agent_20250513_125500_v15.6
source venv/bin/activate
python -m flask run --host=0.0.0.0 --port=7777

# API Scraper (if needed)
cd "API Scraper V3"
pip install -r requirements.txt
python app.py
```

### Service Dependencies
The Node.js service automatically starts the Flask purchase agent, but you may need to manually start other services:

1. **Purchase Agent**: Auto-started by Node.js service
2. **API Scraper**: Manual start if needed
3. **Recording System**: Started on-demand for purchases

## API Integration Points

### Primary Endpoints
- **`POST /api/chat`**: Basic AI agent chat
- **`POST /api/ai-agent-chat`**: Enhanced AI agent with history
- **`POST /api/orchestrator/objective`**: Multi-step task coordination
- **`POST /api/purchase-agent/parts/resolve`**: Part number resolution
- **`POST /api/purchase-agent/suppliers/search`**: Supplier discovery
- **`GET /api/purchase-agent/manuals/search`**: Manual search
- **`POST /api/email/send`**: Send emails
- **`POST /api/sms/send`**: Send SMS messages

### Flask Service Proxy
Most `/api/purchase-agent/*` endpoints are proxied to the Flask service running on port 7777, providing seamless integration between Node.js and Python components.

## Security Considerations

### Data Protection
- **Encrypted billing profiles**: All payment information encrypted at rest
- **Environment variable protection**: Sensitive keys via env vars only
- **CORS configuration**: Proper cross-origin request handling
- **Input validation**: All API endpoints validate input data

### Authentication
- **No user authentication**: Currently public access (internal tool)
- **API key protection**: External service keys secured via environment
- **Process isolation**: Services run in separate processes/containers

## Recent Updates & Features

### Latest Additions (per git history)
1. **Dual search model**: Enhanced part resolution accuracy
2. **AI-powered image search**: Equipment and part image discovery
3. **Mobile interface updates**: Improved responsive design
4. **WO Agent integration**: Work order processing capabilities

### Active Development Areas
- **Part resolution accuracy**: Ongoing improvements to search algorithms
- **Mobile responsiveness**: Continuous UI/UX enhancements
- **Integration reliability**: Better error handling and retry logic
- **Performance optimization**: Database and API response improvements

## Working with This Codebase

### Key Principles
1. **Multi-service architecture**: Understand service boundaries and communication
2. **Real data focus**: All functionality processes actual data, no mocking
3. **AI-first approach**: Leverage AI for decision making and content processing
4. **Mobile-responsive**: All interfaces must work on mobile devices
5. **Error resilience**: Robust error handling across all services

### Common Tasks
- **Adding new AI features**: Extend orchestrator agent capabilities
- **Database changes**: Use SQLAlchemy migrations in Flask service
- **Frontend updates**: Modify HTML templates and static assets
- **API integrations**: Add new endpoints via appropriate service
- **Configuration changes**: Update environment variables and config files

### Testing & Debugging
- **Flask service logs**: Check `flask.log` files in purchase agent directory
- **Node.js logs**: Console output shows service coordination
- **API testing**: Use built-in API documentation interfaces
- **Database inspection**: Use Data Navigator for database exploration

This documentation provides the foundation for working effectively with the PartnerPlus platform. Each service has its own specialized documentation in its respective directory for deeper technical details.