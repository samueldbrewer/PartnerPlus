# Parts Resolution System Flow Diagram

## High-Level Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────────┐
│   User Request  │───▶│  Node.js Server  │───▶│  Purchase Agent Flask   │
│  (AI Agent /    │    │   (index.js)     │    │     Service (Python)    │
│   Direct API)   │    │                  │    │                         │
└─────────────────┘    └──────────────────┘    └─────────────────────────┘
                                │                           │
                                │                           ▼
                                │              ┌─────────────────────────┐
                                │              │    Part Resolver        │
                                │              │  (part_resolver.py)     │
                                │              └─────────────────────────┘
                                │                           │
                                ▼                           ▼
                    ┌──────────────────────┐    ┌─────────────────────────┐
                    │   Response Format    │    │    Resolution Engine    │
                    │   & Display Logic    │    │     (3 Methods)         │
                    └──────────────────────┘    └─────────────────────────┘
```

## Detailed Parts Resolution Flow

```
START: resolve_part_name(description, make, model, year, options)
│
├─ Initialize Response Structure
│  ├─ query: {description, make, model, year}
│  ├─ database_result: null
│  ├─ manual_search_result: null  
│  ├─ ai_web_search_result: null
│  └─ search_methods_used: {db, manual, web}
│
├─ METHOD 1: DATABASE LOOKUP (if use_database=true)
│  ├─ find_exact_match(description, make, model, year)
│  ├─ Check for exact matches in SQLite database
│  ├─ If found: confidence = 1.0
│  └─ Run SerpAPI validation on result
│     ├─ validate_part_with_serpapi()
│     ├─ Check if part exists online
│     └─ Return validation score + description
│
├─ METHOD 2: MANUAL SEARCH (if use_manual_search=true)
│  ├─ find_part_in_manuals(description, make, model, year)
│  ├─ Search through PDF manuals in database
│  ├─ Use GPT-4.1-nano to analyze manual content
│  ├─ Extract part numbers from technical docs
│  ├─ Quality check for placeholders/drawings
│  └─ Run SerpAPI validation on result
│     ├─ validate_part_with_serpapi()
│     └─ Cross-reference with online suppliers
│
├─ METHOD 3: WEB SEARCH (if use_web_search=true)
│  ├─ find_part_with_web_search(description, make, model)
│  ├─ Use GPT-4.1-nano for intelligent web queries
│  ├─ Search multiple supplier websites
│  ├─ Extract and analyze part information
│  ├─ Confidence scoring based on source quality
│  └─ Run SerpAPI validation on result
│     ├─ validate_part_with_serpapi()
│     └─ Verify part authenticity online
│
├─ RESULT COMPARISON & SELECTION
│  ├─ Compare all three methods' results
│  ├─ select_best_part_result()
│  │  ├─ Calculate composite scores:
│  │  │  └─ method_confidence + (validation_confidence * 0.1)
│  │  ├─ Quality check for part number format
│  │  └─ Select highest scoring result
│  │
│  ├─ Cross-validation if multiple results found
│  │  ├─ Check if manual vs AI results match
│  │  ├─ Analyze differences in validated parts
│  │  └─ Flag discrepancies for review
│  │
│  └─ DECISION TREE: Similar Parts Search Trigger
│     ├─ If OEM found + verified + no alternates → Search similar
│     ├─ If OEM found + not verified → Search similar  
│     ├─ If no OEM found → Search similar
│     └─ If problematic part number → Search similar
│
├─ SIMILAR PARTS SEARCH (if triggered)
│  ├─ find_similar_parts_service()
│  ├─ Search strategies:
│  │  ├─ Manufacturer alternatives
│  │  ├─ Compatible/interchangeable parts
│  │  ├─ Generic equivalents
│  │  └─ Similar equipment parts
│  └─ Return list of alternative options
│
├─ RESULT PROCESSING & FORMATTING
│  ├─ Build comprehensive response structure
│  ├─ Include all method results + validations
│  ├─ Add recommendation with reasoning
│  ├─ Generate summary message
│  └─ Save results to database (if save_results=true)
│
└─ RETURN: Complete structured response
   ├─ success: boolean
   ├─ query: original request details
   ├─ results: {database, manual_search, ai_web_search}
   ├─ recommended_result: best option
   ├─ similar_parts: alternatives (if triggered)
   ├─ comparison: cross-method analysis
   └─ summary: human-readable explanation
```

## API Integration Points

### 1. Node.js ↔ Flask Communication
```
Node.js (port 3000) ──HTTP POST──▶ Flask (port 7777)
│                                      │
├─ Purchase Agent Service              ├─ /api/parts/resolve
├─ Orchestrator Agent                  ├─ /api/parts/find-similar  
└─ Direct API endpoints                └─ /api/suppliers/search
```

### 2. Flask Internal Services
```
Flask API (parts.py)
│
├─ Part Resolver Service (part_resolver.py)
│  ├─ Database queries (SQLite)
│  ├─ Manual processing (PDF analysis)
│  ├─ Web search (GPT + suppliers)
│  └─ SerpAPI validation
│
├─ Manual Finder Service
│  └─ PDF content extraction & analysis
│
└─ Supplier Finder Service
   └─ Multi-supplier search & comparison
```

### 3. External API Dependencies
```
OpenAI GPT-4.1-nano ──▶ Text analysis & part extraction
SerpAPI ──▶ Part number validation & verification  
Supplier APIs ──▶ Real-time pricing & availability
```

## Data Flow Example

```
INPUT: "door seal for Henny Penny 500"
│
├─ Database Search: ✓ Found HP-77575 (confidence: 1.0)
├─ Manual Search: ✓ Found HP-77575 (confidence: 0.9)  
├─ Web Search: ✓ Found HP-77575 (confidence: 0.85)
│
├─ SerpAPI Validation:
│  ├─ HP-77575: ✓ Valid (confidence: 0.95)
│  └─ Description: "Door Seal Assembly for Henny Penny Fryer"
│
├─ Result Selection:
│  └─ Best: Database result (score: 1.095)
│
├─ Similar Parts: ✓ Triggered (no alternates found)
│  ├─ HP-77575A (OEM replacement)
│  ├─ GEN-DS-HP500 (generic equivalent)
│  └─ 3 more alternatives...
│
└─ OUTPUT: Comprehensive response with recommended part + alternatives
```

## Key Features

1. **Multi-Method Approach**: Database, Manual, and Web search
2. **AI-Powered Analysis**: GPT-4.1-nano for intelligent extraction
3. **Validation System**: SerpAPI verification of all results
4. **Smart Selection**: Composite scoring algorithm
5. **Alternative Discovery**: Similar parts when primary search fails
6. **Quality Control**: Placeholder detection and format validation
7. **Comprehensive Response**: All methods' results preserved for transparency