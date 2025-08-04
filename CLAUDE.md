# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PartnerGPT (formerly PartnerPlus) is a multi-service platform for commercial foodservice equipment maintenance and parts procurement. It combines AI-powered work order generation, parts resolution, supplier discovery, and automated purchasing.

## Architecture

The system uses a **microservices architecture** with three main components:

1. **Node.js Express Server** (`index.js`, port 3000)
   - Main application server and API gateway
   - Serves frontend interfaces
   - Proxies requests to Flask service
   - Handles email/SMS integration

2. **Flask Purchase Agent** (`manual-purchase-agent_20250513_125500_v15.6/app.py`, port 7777)
   - Parts resolution and supplier discovery
   - Manual search and PDF processing
   - SQLite database with SQLAlchemy ORM
   - Dual search architecture with AI arbitration

3. **API Scraper** (`API Scraper V3/app.py`, port 5000) - Optional
   - PartsTown.com scraping with Playwright
   - Cloudflare bypass capabilities

## Essential Commands

```bash
# Start development (auto-starts Flask service)
npm run dev

# Run tests and linting
npm run lint          # Check code style (when configured)
npm run typecheck     # Type checking (when configured)

# Manual service startup
cd manual-purchase-agent_20250513_125500_v15.6
source venv/bin/activate
python app.py

# Deploy to production (Railway)
git add -A
git commit -m "Your message"
git push origin main  # Auto-deploys to Railway
```

## Key Frontend Interfaces

- `/wo-agent-mobile` - Work order generation and management (mobile-optimized)
- `/ai-chat-v2` - AI chat interface with purchase agent integration  
- `/ai-agent` - Visual workflow AI agent
- `/api-docs` - Interactive API documentation

## Important Implementation Details

### Work Order Generation
- Uses specific commercial equipment brands (Hobart, Vulcan, True, Hoshizaki, etc.)
- Generates realistic failure scenarios based on equipment type
- Located in `/api/generate-work-order` endpoint

### Dual Search Architecture
Services in `manual-purchase-agent_20250513_125500_v15.6/services/`:
- `dual_search.py` - Parts resolution
- `dual_manual_search.py` - Manual discovery
- `dual_supplier_search.py` - Supplier location
- `dual_service_provider_search.py` - Service provider discovery

Each implements parallel SerpAPI + GPT-4 search with AI arbitration for accuracy.

### Activity Log Formatting
The WO Agent uses structured activity logs with:
- Concise headers (4-6 words max)
- Bullet points for details/links
- Prompt in `wo-agent-mobile.html` line ~1537

### Database Schema
SQLite database at `instance/app.db` with key models:
- `Part` - OEM parts with alternates
- `Supplier` - Supplier information  
- `Manual` - Technical documentation
- `Purchase` - Purchase history
- `BillingProfile` - Encrypted payment info

## Environment Configuration

Required `.env` variables:
```
OPENAI_API_KEY=sk-...
SERPAPI_KEY=...
EMAIL_USER=...@gmail.com
EMAIL_PASS=app_password
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
```

## Common Development Tasks

### Adding New Equipment Brands/Models
Update system prompt in `index.js` around line 1651-1700 with approved brands and realistic models.

### Modifying Activity Log Format
Edit prompt in `wo-agent-mobile.html` function `generateActivityLogEntry()` around line 1535.

### Adding API Endpoints
1. Node.js endpoints: Add to `index.js`
2. Flask endpoints: Add to appropriate file in `manual-purchase-agent_20250513_125500_v15.6/api/`
3. Update proxy routes in `index.js` if needed

### Debugging Issues
- Flask logs: `manual-purchase-agent_20250513_125500_v15.6/flask.log`
- Node logs: Console output from `npm run dev`
- Check Railway deployment logs for production issues

## Current Work Areas

Based on recent commits and file modifications:
- Work order generation with specific equipment brands
- Activity log formatting improvements
- Mobile interface responsiveness
- Restaurant/technician details in work orders

## Railway Deployment Notes

- Automatic deployment on push to main branch
- Uses `nixpacks.toml` for build configuration
- Flask service configured via `FLASK_PORT` environment variable
- Both services deploy together as single Railway app

## Testing Infrastructure

Python tests:
```bash
cd manual-purchase-agent_20250513_125500_v15.6
python -m pytest tests/
python test_api_endpoints.py
```

No formal Node.js test suite currently configured.