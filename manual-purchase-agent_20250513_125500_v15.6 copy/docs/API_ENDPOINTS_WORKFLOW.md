# Manual Purchase Agent API Endpoints - Complete Workflow Documentation

This document provides a comprehensive visual workflow for every API endpoint in the Manual Purchase Agent system, showing what each endpoint does and which external services it uses.

## Table of Contents
1. [Manuals API](#manuals-api)
2. [Parts API](#parts-api)
3. [Suppliers API](#suppliers-api)
4. [Purchases API](#purchases-api)
5. [Profiles API](#profiles-api)
6. [Enrichment API](#enrichment-api)
7. [System API](#system-api)
8. [Screenshots API](#screenshots-api)
9. [Recordings API](#recordings-api)

## Legend for Service Icons
- 🔍 **SerpAPI** - Web search and scraping
- 🤖 **OpenAI GPT-4.1-Nano** - AI analysis and text extraction
- 💾 **Database** - PostgreSQL database operations
- 🌐 **Playwright** - Browser automation
- 📸 **Screenshot Service** - PDF and web page screenshots
- 🎭 **Playwright Recorder API** - Purchase automation service (port 3001)

---

## Manuals API

### 1. `GET/POST /api/manuals/search`
**Purpose**: Search for technical/parts manuals by make, model, and year

**Workflow**:
```
User Request → 🔍 SerpAPI (search for PDFs) → Filter Results → 
→ 📸 Screenshot Service (generate 2-page previews) → 
→ 💾 Database (verify model in manual) → Return Results
```

**Services Used**:
- 🔍 **SerpAPI**: Searches Google for manual PDFs with queries like "make model year technical manual filetype:pdf"
- 📸 **PDF Preview Generator**: Creates 2-page preview images of PDFs
- 💾 **PyMuPDF**: Verifies the model number exists in the manual

---

### 2. `POST /api/manuals`
**Purpose**: Create a new manual entry in the database

**Workflow**:
```
User Data → Validate Fields → 💾 Database (insert) → Return Manual ID
```

**Services Used**:
- 💾 **Database**: Stores manual metadata

---

### 3. `POST /api/manuals/{id}/download`
**Purpose**: Download a manual PDF to local storage

**Workflow**:
```
Manual ID → 💾 Database (get URL) → Download PDF → 
→ 💾 Database (update local_path) → Return Path
```

**Services Used**:
- 💾 **Database**: Retrieves manual URL and updates local path
- **HTTP Client**: Downloads PDF file

---

### 4. `POST /api/manuals/{id}/process`
**Purpose**: Extract error codes and part numbers from a manual

**Workflow**:
```
Manual ID → Download (if needed) → Extract Text (PyMuPDF) → 
→ 🤖 OpenAI GPT-4.1-Nano (analyze up to 1M tokens) → 
→ 💾 Database (store error codes & parts) → Return Results
```

**Services Used**:
- **PyMuPDF**: Extracts text from PDF
- 🤖 **OpenAI GPT-4.1-Nano**: Analyzes manual text to extract:
  - Error codes with descriptions
  - OEM part numbers with descriptions
  - Common problems
  - Maintenance procedures
  - Safety warnings
- 💾 **Database**: Stores extracted data

---

### 5. `POST /api/manuals/multi-process`
**Purpose**: Process up to 3 manuals simultaneously and reconcile results

**Workflow**:
```
Manual IDs → Parallel Processing:
├── Manual 1: Download → Extract → 🤖 AI Analysis
├── Manual 2: Download → Extract → 🤖 AI Analysis  
└── Manual 3: Download → Extract → 🤖 AI Analysis
→ Reconciliation (deduplicate, confidence scoring) → 
→ 💾 Database (store unified results) → Return Reconciled Data
```

**Services Used**:
- **Concurrent Processing**: ThreadPoolExecutor for parallel operations
- 🤖 **OpenAI GPT-4.1-Nano**: Analyzes each manual
- 💾 **Database**: Stores reconciled results
- **Reconciliation Logic**: Deduplicates and assigns confidence scores

---

### 6. `GET /api/manuals/{id}/components`
**Purpose**: Extract structural components from manual (TOC, diagrams, etc.)

**Workflow**:
```
Manual ID → Download (if needed) → Extract Text → 
→ 🤖 OpenAI (identify components & page ranges) → Return Components
```

**Services Used**:
- 🤖 **OpenAI**: Identifies manual sections like:
  - Table of contents
  - Exploded view diagrams  
  - Error code tables
  - Installation instructions
  - Troubleshooting flowcharts

---

## Parts API

### 1. `POST /api/parts/resolve`
**Purpose**: Resolve generic part description to OEM part number

**Workflow**:
```
Part Description → Three Parallel Searches:
├── 💾 Database Search (existing parts)
├── Manual Search: 🔍 SerpAPI → Download → 🤖 AI Extract → Validate
└── Web Search: 🔍 SerpAPI → 🤖 AI Analysis → Validate
→ Compare Results → 🤖 AI Recommendation → Return All Results
```

**Services Used**:
- 💾 **Database**: Searches existing parts
- 🔍 **SerpAPI**: 
  - Searches for manuals containing the part
  - Searches web for part information
  - Validates found part numbers
- 🤖 **OpenAI**: 
  - Extracts parts from manuals
  - Analyzes web search results
  - Validates if parts are real and appropriate
  - Compares different results and provides recommendations

**Toggle Options**:
- `use_database`: Enable/disable database search
- `use_manual_search`: Enable/disable manual search
- `use_web_search`: Enable/disable web search
- `save_results`: Save results to database
- `bypass_cache`: Force fresh searches

---

### 2. `POST /api/parts/find-similar`
**Purpose**: Find similar/alternative parts when main resolution fails

**Workflow**:
```
Failed Part Search → Multiple Strategies:
├── Manufacturer Alternatives
├── Compatible/Interchangeable Parts
├── Generic Equivalents
└── Similar Equipment Parts
→ 🔍 SerpAPI (search each strategy) → 
→ 🤖 AI (validate & rank) → Return Alternatives
```

**Services Used**:
- 🔍 **SerpAPI**: Searches for alternative parts
- 🤖 **OpenAI**: Validates alternatives are appropriate

---

## Suppliers API

### 1. `GET/POST /api/suppliers/search`
**Purpose**: Find suppliers offering a specific part number

**Workflow**:
```
Part Number → 🔍 SerpAPI (shopping search) → 
→ Extract Supplier Info → 🤖 AI Ranking (optional) → 
→ 📸 Screenshot Service → Return Ranked Suppliers
```

**Services Used**:
- 🔍 **SerpAPI**: Shopping search for part number
- 🤖 **OpenAI**: Intelligent supplier ranking based on:
  - OEM vs aftermarket
  - Price competitiveness
  - Supplier reliability
  - Shipping options
- 📸 **Screenshot Service**: Captures supplier page previews

---

## Purchases API

### 1. `POST /api/purchases`
**Purpose**: Automate part purchase from e-commerce site

**Workflow**:
```
Purchase Request → 💾 Get Billing Profile → 
→ 🎭 Playwright Recorder API (port 3001):
  ├── Load Pre-recorded Session
  ├── Variable Substitution (billing/shipping)
  ├── 🌐 Playwright Browser Automation
  └── Execute Purchase
→ 💾 Database (update status) → Return Confirmation
```

**Services Used**:
- 💾 **Database**: Retrieves encrypted billing profile
- 🎭 **Playwright Recorder API**: 
  - Loads pre-recorded browser sessions
  - Substitutes variables (addresses, payment info)
  - Executes purchase with visible browser
- 🌐 **Playwright**: Browser automation for purchase

**Supported Sites**:
- etundra.com
- webstaurantstore.com
- partstown.com

---

### 2. `POST /api/purchases/{id}/retry`
**Purpose**: Retry a failed purchase

**Workflow**:
```
Failed Purchase ID → Create New Purchase → 
→ Same workflow as POST /api/purchases
```

---

## Profiles API

### 1. `POST /api/profiles`
**Purpose**: Create encrypted billing profile

**Workflow**:
```
Billing Data → 🔐 Fernet Encryption → 
→ 💾 Database (store encrypted) → Return Profile ID
```

**Services Used**:
- 🔐 **Fernet Encryption**: Encrypts sensitive payment information
- 💾 **Database**: Stores encrypted profile

---

## Enrichment API

### 1. `POST /api/enrichment`
**Purpose**: Get videos, articles, and images for equipment/parts

**Workflow**:
```
Make/Model/Part → 🔍 SerpAPI:
├── Video Search (YouTube, Vimeo)
├── Article Search (repair guides, manuals)
└── Image Search (diagrams, photos)
→ Format Results → Return Multimedia Data
```

**Services Used**:
- 🔍 **SerpAPI**: Searches for multimedia content across:
  - YouTube for repair videos
  - Web for articles and guides
  - Google Images for diagrams

---

## System API

### 1. `POST /api/system/clear-database`
**Purpose**: Clear all database tables (for testing/demo)

**Workflow**:
```
Clear Request → 💾 Database:
├── Delete Purchases
├── Delete Error Codes & Part References
├── Delete Suppliers & Parts
├── Delete Billing Profiles
└── Delete Manuals
→ Clear File Cache → Return Success
```

**Services Used**:
- 💾 **Database**: Truncates all tables
- **File System**: Clears uploaded files and temp files

---

### 2. `POST /api/system/clear-cache`
**Purpose**: Clear cached files without affecting database

**Workflow**:
```
Clear Request → File System:
├── Clear Upload Directory
└── Clear Temp Files
→ Return Success
```

---

## Screenshots API

### 1. `POST /api/screenshots/suppliers`
**Purpose**: Capture screenshots of supplier websites

**Workflow**:
```
Supplier URLs → 📸 Screenshot Service:
├── Playwright Browser Launch
├── Navigate to Each URL
├── Capture Screenshot
└── Save to uploads/screenshots/suppliers/
→ Return Screenshot Paths
```

**Services Used**:
- 📸 **Playwright**: Captures website screenshots
- **File System**: Stores screenshot images

---

## Recordings API

### 1. `GET /api/recordings/available`
**Purpose**: List e-commerce sites with purchase recordings

**Workflow**:
```
Request → File System (scan recordings/) → 
→ Parse Recording Files → Return Available Domains
```

**Services Used**:
- **File System**: Scans for .json recording files

---

### 2. `GET /api/recordings/check/{domain}`
**Purpose**: Check if specific domain has recording

**Workflow**:
```
Domain → File System (check for domain.json) → 
→ Return Recording Status
```

---

## Service Dependencies Summary

### External APIs
1. **SerpAPI** (🔍)
   - Manual search
   - Part resolution
   - Supplier search
   - Enrichment data
   - Part validation

2. **OpenAI GPT-4.1-Nano** (🤖)
   - Manual text analysis (up to 1M tokens)
   - Part extraction
   - Error code extraction
   - Component identification
   - Part validation
   - Supplier ranking

### Internal Services
1. **Database** (💾)
   - PostgreSQL for all data storage
   - Encrypted billing profiles

2. **Playwright Services** (🌐📸🎭)
   - Screenshot generation
   - Purchase automation
   - Browser automation

3. **File Services**
   - PDF downloads
   - Screenshot storage
   - Recording management

## API Usage Patterns

### Complete Part Resolution Flow
```
1. POST /api/parts/resolve → Get OEM part number
2. POST /api/suppliers/search → Find suppliers
3. POST /api/purchases → Automate purchase
```

### Manual Processing Flow
```
1. GET /api/manuals/search → Find manuals
2. POST /api/manuals/{id}/process → Extract data
3. GET /api/manuals/{id}/error-codes → Get error codes
4. GET /api/manuals/{id}/part-numbers → Get parts
```

### Multi-Manual Processing Flow
```
1. GET /api/manuals/search → Find multiple manuals
2. POST /api/manuals → Create manual entries
3. POST /api/manuals/multi-process → Process all with reconciliation
```