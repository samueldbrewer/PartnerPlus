# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The Manual Purchase Agent is a Flask microservice that combines AI, web scraping, and browser automation to:
1. Find technical and parts manuals for specific makes and models
2. Extract error codes and OEM part numbers from manuals using GPT-4.1-Nano
3. Resolve generic part names to OEM part numbers with configurable search methods
4. Validate part numbers using AI-powered assessment of search results
5. Find supplier listings for parts (both OEM and generic)
6. Autonomously navigate e-commerce sites to purchase parts using stored billing profiles
7. Process equipment CSV files with multi-threaded processing for enhanced performance

### Current Version: v15.6

**Critical Requirements:**
- Never use simulated or dummy data - all functionality must be real
- All API endpoints must process real data and return actual results
- Error codes format: "Error Code Number", "Short Error Description"
- Part numbers format: "OEM Part Number", "Short Part Description"
- Include CSV export functionality for all extracted data
- Use GPT-4.1-Nano for comprehensive PDF analysis (supports up to 1 million tokens)
- Confidence-based part selection with full transparency and method tracking
- Dummy values and billing profiles must have matching field structures for recording/playback

## Architecture

### Two-Service Architecture
1. **Flask API Service** (Port 7777)
   - REST API endpoints for all operations
   - Database management with SQLAlchemy
   - Integration with SerpAPI and OpenAI
   - Encrypted billing profile storage

2. **Playwright-Recorder Service** (Port 3001)
   - Node.js-based browser automation
   - Recording and replay of e-commerce interactions
   - Variable substitution system
   - Real-time purchase execution

### Core Services (`/services/`)
- `manual_finder.py`: Searches and downloads manuals using SerpAPI
- `manual_parser.py`: Extracts text/info from PDFs using PyMuPDF and GPT-4.1-Nano
- `part_resolver.py`: 
  - Resolves generic parts to OEM numbers with confidence-based selection
  - Uses `validate_part_with_serpapi()` for AI assessment of part validity
  - Implements decision tree logic for similar parts search
  - Returns composite confidence scores (method_confidence + validation_confidence * 0.1)
- `supplier_finder.py` & `supplier_finder_v2.py`: Finds suppliers using SerpAPI with AI-powered ranking and deduplication
- `purchase_service.py`: Integrates with playwright-recorder API for automated purchases
- `enrichment_service.py`: Enriches part data with additional information
- `manual_downloader.py`: Handles manual file downloads
- `pdf_preview_generator.py` & `pdf_two_page_preview.py`: Generate PDF previews
- `website_screenshot_service.py`: Captures website screenshots
- `temp_pdf_manager.py`: Manages temporary PDF files

### CSV Processing System (`scripts/process_equipment_csv.py`)
- **Multi-threaded Processing**: Configurable worker threads for faster processing
- **Confidence-based Selection**: Selects highest confidence result regardless of search method
- **Decision Tree Logic**: Smart similar parts search based on verification status and alternates
- **Real-time Writing**: Immediate CSV output with thread-safe row ordering
- **Progress Tracking**: Rate limiting and comprehensive logging
- **Alternate Parts Capture**: Extracts both part numbers and descriptions

### V3 Interface (`/static/api-demo/v3/`)
- **Part Search**: Search and resolve parts to OEM numbers
- **Manual Search**: Find technical and parts manuals
- **Supplier Search**: Find suppliers for parts
- **Purchase Automation**: Execute automated purchases
- **Mobile Responsive**: Works on phones and tablets

## Automated Recording System

### Recording System Overview
The automated recording system is a robust Node.js-based tool that captures and replays e-commerce purchase flows. It uses Playwright with JavaScript injection to record user interactions and provides intelligent playback with variable substitution.

#### Key Features:
- **Automated recording**: Captures all user interactions including clicks, typing, scrolls, and navigation
- **Smart playback**: Intelligent element detection with progressive fallback strategies
- **Variable substitution**: Replace dummy values with real data during playback
- **Clone functionality**: Replay recordings on different product URLs
- **Multiple modes**: Standard recording, enhanced recording with detailed tracking
- **Flask API integration**: Complete REST API for recording management

#### Core Components:
- `recording_system/index.js` - Main CLI interface
- `recording_system/src/recorder.js` - Recording engine with JavaScript injection
- `recording_system/src/player.js` - Intelligent playback engine
- `recording_system/src/api-server.js` - Optional standalone API server
- `recording_system/recordings/` - Stored recording files
- `recording_system/dummy_values.json` - Test data for recording

#### CLI Usage:
```bash
cd recording_system

# Record a new site (auto-generates filename from domain)
node index.js record https://partstown.com/product
# Saves to: recordings/partstown.json

# Play back a recording using URL (auto-finds recording)
node index.js play https://partstown.com/product --vars-file variables.json

# Play back a recording using file path (traditional way)
node index.js play recordings/partstown.json --vars-file variables.json

# Clone recording to different URL using site name
node index.js clone partstown https://partstown.com/different-product --vars-file variables.json

# Clone recording using file path (traditional way)
node index.js clone recordings/partstown.json https://new-url.com --vars-file variables.json

# Clone with custom timing (slow and careful)
node index.js clone recordings/example.json https://new-site.com/product --vars-file variables.json --conservative

# Clone with specific delays
node index.js clone recordings/example.json https://new-site.com/product --vars-file variables.json --click-delay 500 --input-delay 200 --wait-for-idle

# Enhanced recording with detailed tracking
node index.js record https://example.com/product --enhanced --output recordings/example.json
```

#### Flask API Integration:
```python
# Record management endpoints
POST /api/recordings/record      # Start new recording
GET  /api/recordings/recordings  # List all recordings
GET  /api/recordings/recording/<name>  # Get recording details
POST /api/recordings/play        # Play back recording
POST /api/recordings/clone       # Clone to different URL
DELETE /api/recordings/recording/<name>  # Delete recording
```

#### Variable Substitution System:
The system supports two methods for replacing dummy data with real values:
1. **Exact match replacement**: Dummy values in `dummy_values.json` matched exactly with input
2. **Bracket placeholders**: Variables in format `[variable_name]` replaced during playback

#### Playback Options:
- **Fast mode**: Trust recorded navigation, use coordinates and active field typing
- **Headless mode**: Run without browser UI
- **Speed control**: Adjustable delays between actions with `--slow-mo`
- **Custom timing**: Individual delays for clicks (`--click-delay`), inputs (`--input-delay`), navigation (`--nav-delay`)
- **Conservative mode**: Pre-configured slow timing with `--conservative` (1000ms clicks, 500ms inputs, 2000ms navigation)
- **Network waiting**: Wait for network idle with `--wait-for-idle`
- **Error handling**: Continue on errors or stop on first failure
- **Timeout configuration**: Customizable selector timeouts

## Common Commands

### Start Services
```bash
# Start Flask service only (recommended - current setup)
./start_services.sh

# Alternative: Run Flask service manually
source venv/bin/activate
export PYTHONPATH=$PWD
flask run --host=0.0.0.0 --port=7777

# Start recording system separately (if needed)
cd recording_system
npm install
npx playwright install chromium
PORT=3001 npm run start:api
```

### Stop Services
```bash
# Stop Flask service
pkill -f "flask run"

# Stop both services (if recording system is running)
lsof -ti:7777,3001 | xargs kill -9

# Alternative: Find and kill by process name
pkill -f "node.*api-server"
```

### Health Checks
```bash
# Check Flask API health
curl http://localhost:7777/api/system/health

# Check Playwright Recorder health (if running)
curl http://localhost:3001/api/health

# Check services status
lsof -i:7777  # Flask API
lsof -i:3001  # Recording system (if running)
```

### Database Operations
```bash
# Initialize empty database
python scripts/init_db.py

# Generate encryption key (required for profiles)
python scripts/generate_key.py
```

### CSV Processing
```bash
# Multi-threaded processing (recommended)
python scripts/process_equipment_csv.py data/foodservice-equipment-list.csv --workers 4

# Process with all options
python scripts/process_equipment_csv.py data/input.csv \
  --workers 4 \
  --output data/output.csv \
  --delay 0.5 \
  --start-row 100 \
  --max-rows 50
```

### Testing
```bash
# Run test scripts
./tests/test_api.sh      # Basic API tests
./tests/test_all_api.sh  # Comprehensive API tests

# Test part resolution with search toggles
curl -X POST http://localhost:7777/api/parts/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "description":"Bowl Lift Motor",
    "make":"Hobart",
    "model":"HL600",
    "use_database":false,
    "use_manual_search":true,
    "use_web_search":true,
    "save_results":false
  }'

# Python test scripts
python tests/test_enrichment.py
python tests/test_manual_downloader.py
python tests/test_supplier_finder.py
python tests/test_purchase_integration.py
```

### Lint and Type Checking
```bash
# Python linting with flake8
flake8 . --max-line-length=120 --exclude=venv,__pycache__,node_modules

# Type checking with mypy (if configured)
mypy . --ignore-missing-imports

# Run individual Python tests
python tests/test_supplier_finder.py
python tests/test_enrichment.py
python tests/test_manual_downloader.py
python comprehensive_api_test.py
```

### Recording E-commerce Sites
```bash
cd recording_system

# Record new site (auto-generates filename from domain)
node index.js record https://etundra.com/product
# Saves to: recordings/etundra.json

# Play back recording with variables
node index.js play recordings/example.json --vars-file variables.json

# Clone recording to different URL
node index.js clone recordings/example.json https://example.com/product \
  --vars-file variables.json --fast --headless

# Enhanced recording with detailed tracking
node index.js record https://example.com --enhanced --output recordings/example.json

# Test recording system API
python test_recording_system.py
```

## Key Implementation Details

### API Endpoints Structure
The API follows RESTful conventions with these main resource groups:
- `/api/manuals/*` - Manual search, download, and processing
- `/api/parts/*` - Part resolution and management
- `/api/suppliers/*` - Supplier search and management
- `/api/profiles/*` - Billing profile management
- `/api/purchases/*` - Purchase automation
- `/api/enrichment/*` - Data enrichment operations
- `/api/recordings/*` - Purchase recording management
- `/api/system/*` - System health and status

### Confidence-Based Part Resolution
Both the API endpoint and CSV processor use identical confidence-based selection:
- **Composite Score**: `method_confidence + (validation_confidence * 0.1)`
- **Method Selection**: Highest confidence result wins, regardless of source
- **Transparency**: Full confidence scores and method selection recorded
- **Validation**: SerpAPI + GPT-4.1-Nano assessment for part appropriateness

### AI-Powered Supplier Ranking (`supplier_finder_v2.py`)
Advanced supplier search with intelligent ranking and deduplication:
- **PartsTown Priority**: PartsTown.com results ranked #1 when present (product pages only)
- **Product Page Detection**: Strongly prefers direct product pages over category/listing pages
- **URL Pattern Analysis**: Prioritizes URLs with `/product/`, `/item/`, `/dp/`, `/p/`, or part number
- **Smart Deduplication**: Only one result per domain, selecting the best product page
- **Commercial Validation**: Filters for actual e-commerce sites with buying capabilities
- **Fallback Logic**: Graceful degradation when AI ranking fails

### Variable Substitution System
Recording and playback use matching field structures:
- **Dummy Values** (`dummy_values.json`): Static test data for recording
- **Billing Profiles**: Dynamic data for actual purchases
- **Required Fields**: Both must have identical field names for proper substitution
- **Field Categories**: Personal info, address, payment, billing address

### Enhanced Part Resolution Response
```json
{
  "recommended_result": {
    "oem_part_number": "00-917676",
    "confidence": 0.95,
    "serpapi_validation": {
      "is_valid": true,
      "confidence_score": 0.9,
      "assessment": "AI assessment using GPT-4.1-Nano"
    },
    "selection_metadata": {
      "selected_from": "ai_web_search_result",
      "composite_score": 1.04
    }
  },
  "results": {
    "manual_search": {...},
    "ai_web_search": {...}
  }
}
```

### CSV Output Format
```csv
Make,Model,Part Name,Equipment Photo,Manual 1,Manual 2,Manual 3,Manual 4,Manual 5,
OEM Part Verified,OEM Part Number,Confidence Score,Selected Method,Part Photo,
Alternate Part Numbers,Alternate Part Descriptions,
Supplier 1,Supplier 2,Supplier 3,Supplier 4,Supplier 5
```

## Environment Variables

Required in `.env` file:
```
SERPAPI_KEY=your_serpapi_key
OPENAI_API_KEY=your_openai_key
SECRET_KEY=your_secret_key
ENCRYPTION_KEY=your_encryption_key  # Generate with: python scripts/generate_key.py
DATABASE_URI=postgresql://postgres:postgres@db:5432/manual_purchase_agent
ENABLE_REAL_PURCHASES=false  # Set to "true" for real purchases
PLAYWRIGHT_RECORDER_API_URL=http://localhost:3001
```

## Common Issues and Solutions

1. **Port Already in Use**: Kill existing processes with `lsof -ti:7777,3001 | xargs kill -9`
2. **Database Connection**: Ensure PostgreSQL is running or use SQLite for development
3. **Playwright Browser**: Run `playwright install chromium` if browser not found
4. **Variable Substitution**: Ensure dummy_values.json matches billing profile structure
5. **Recording Playback**: Check recording exists in recordings/ directory
6. **API Rate Limits**: Add delays in CSV processing with --delay parameter
7. **Module Import Errors**: Ensure PYTHONPATH is set to project root
8. **SSL Certificate Errors**: Update certificates or use verify=False for development

## Important Notes

1. All functionality must be real - no dummy/simulated data
2. Purchase automation executes real purchases when `ENABLE_REAL_PURCHASES=true`
3. Always use environment variables for API keys - never hardcode
4. Dummy values and billing profiles must maintain field parity
5. Admin portal changes require cache bust (update ?v= in script tag)
6. Recording names auto-generate from URLs (e.g., etundra.com → etundra)
7. Both services must be running for full functionality
8. PDF processing can handle up to 1 million tokens with GPT-4.1-Nano
9. The system uses real-time API calls - no prefetched data
10. All error messages should follow the standard format established in the API