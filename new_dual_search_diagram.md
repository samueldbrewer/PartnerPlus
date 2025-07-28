# New Dual Search Parts Resolution System

## Updated Architecture Flow

```
User Request
     │
     ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────────┐
│   Node.js       │───▶│  Purchase Agent  │───▶│   Flask API             │
│   (index.js)    │    │   Service        │    │   (parts.py)            │
└─────────────────┘    └──────────────────┘    └─────────────────────────┘
                                                          │
                                                          ▼
                                               ┌─────────────────────────┐
                                               │   Part Resolver         │
                                               │   (part_resolver.py)    │
                                               └─────────────────────────┘
                                                          │
                  ┌──────────────────────────────────────┼──────────────────────────────────────┐
                  │                                      │                                      │
                  ▼                                      ▼                                      ▼
        ┌─────────────────┐                 ┌─────────────────────────┐           ┌─────────────────┐
        │  Database       │                 │   NEW DUAL SEARCH       │           │  Manual Search  │
        │  Lookup         │                 │   (dual_search.py)      │           │  (unchanged)    │
        └─────────────────┘                 └─────────────────────────┘           └─────────────────┘
                                                          │
                           ┌──────────────────────────────┼──────────────────────────────┐
                           │                              │                              │
                           ▼                              ▼                              ▼
                 ┌─────────────────┐          ┌─────────────────────────┐    ┌─────────────────┐
                 │   STEP 1:       │          │      STEP 2:            │    │    STEP 3:      │
                 │  SerpAPI        │          │   GPT-4.1-nano          │    │ AI Arbitrator   │
                 │ Direct Search   │          │  with Web Search        │    │ (no web search) │
                 │ (First 10)      │          │    Preview              │    │                 │
                 └─────────────────┘          └─────────────────────────┘    └─────────────────┘
                           │                              │                              │
                           └──────────────────────────────┼──────────────────────────────┘
                                                          │
                                                          ▼
                                               ┌─────────────────────────┐
                                               │    Best Result          │
                                               │   Selected & Returned   │
                                               └─────────────────────────┘
```

## New Dual Search Process Detail

### Step 1: SerpAPI Direct Search
```
Input: "door seal Henny Penny 500 OEM part number"
│
├─ Direct SerpAPI call with num=10
├─ Extract first 10 organic results
├─ Return raw search results with:
│  ├─ Title, URL, snippet for each result
│  ├─ Position ranking
│  └─ Total count
│
Output: Raw search data for analysis
```

### Step 2: GPT-4.1-nano with Web Search Preview
```
Input: Same part description 
│
├─ Use GPT-4o with web_search_preview tool
├─ Let AI search web independently  
├─ AI analyzes findings and extracts:
│  ├─ OEM part number
│  ├─ Manufacturer
│  ├─ Description
│  ├─ Confidence score
│  └─ Sources found
│
Output: AI-analyzed part information
```

### Step 3: AI Arbitrator (No Web Search)
```
Input: Both Step 1 & Step 2 results
│
├─ GPT-4.1-nano (without web search)
├─ Analyzes both result sets
├─ Compares quality and accuracy
├─ Selects best option based on:
│  ├─ Source reliability
│  ├─ Part type matching
│  ├─ Manufacturer authenticity  
│  └─ Confidence levels
│
Output: Final selected result with reasoning
```

## Key Improvements

### 🔍 **Dual Validation Approach**
- **Independent Methods**: SerpAPI raw results vs GPT web search
- **Cross-Validation**: AI arbitrator compares both approaches
- **Bias Reduction**: Two different search strategies reduce single-point failures

### 🤖 **Enhanced AI Decision Making**
- **Specialized Roles**: Each AI has a specific function
  - GPT with web search: Information gathering
  - GPT without web search: Analysis and decision making
- **Transparent Reasoning**: Arbitrator explains selection logic

### 📊 **Better Result Quality**
- **Raw Data Access**: Direct SerpAPI results (no GPT interpretation layer)
- **AI-Powered Analysis**: GPT web search for complex reasoning
- **Quality Arbitration**: Neutral AI selects best from both methods

### 🛡️ **Improved Reliability**
- **Fallback Strategy**: If one method fails, other may succeed
- **Error Isolation**: Problems in one search don't affect the other
- **Confidence Scoring**: Better assessment of result quality

## Response Format

```json
{
  "oem_part_number": "HP-77575",
  "manufacturer": "Henny Penny",
  "description": "Door Seal Assembly for Model 500 Fryer",
  "confidence": 0.95,
  "selected_method": "gpt_web_search",
  "arbitrator_reasoning": "GPT web search provided higher confidence result with verified manufacturer information",
  "serpapi_count": 10,
  "gpt_web_success": true,
  "sources": ["hennypennyparts.com", "partstown.com"],
  "alternate_part_numbers": ["HP77575", "500-SEAL"]
}
```

## Integration Points

The new system maintains full compatibility with existing:
- ✅ Node.js Purchase Agent Service
- ✅ Flask API endpoints (/api/parts/resolve)
- ✅ Response formatting for UI display
- ✅ Database storage and validation
- ✅ SerpAPI validation pipeline

Only the web search method has been replaced with the new dual approach.