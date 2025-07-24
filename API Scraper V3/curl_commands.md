# PartsTown API - Curl Commands Reference

Copy and paste these commands directly into your terminal to test the API.

## 🔍 Quick Test Sequence
```bash
# 1. Health check
curl http://localhost:7777/health

# 2. Get first 3 manufacturers
curl "http://localhost:7777/api/manufacturers?limit=3"

# 3. Get Pitco models
curl "http://localhost:7777/api/manufacturers/pitco/models?limit=2"

# 4. Search for fryers
curl "http://localhost:7777/api/search?q=fryer&limit=3"

# 5. Get part details
curl "http://localhost:7777/api/parts/WINCXLB44-P10"
```

## 🏭 Manufacturers
```bash
# All manufacturers
curl http://localhost:7777/api/manufacturers

# Limited results
curl "http://localhost:7777/api/manufacturers?limit=5"

# Search manufacturers
curl "http://localhost:7777/api/manufacturers?search=pitco"

# Search with limit
curl "http://localhost:7777/api/manufacturers?search=fryer&limit=3"
```

## 🔧 Models
```bash
# Pitco models
curl "http://localhost:7777/api/manufacturers/pitco/models"

# Limited Pitco models
curl "http://localhost:7777/api/manufacturers/pitco/models?limit=3"

# AccuTemp models
curl "http://localhost:7777/api/manufacturers/accutemp/models?limit=5"

# Winco models
curl "http://localhost:7777/api/manufacturers/winco/models?limit=2"
```

## 🔩 Parts
```bash
# AccuTemp E3 Series parts
curl "http://localhost:7777/api/manufacturers/accutemp/models/e3-series/parts"

# Pitco 14 parts (limited)
curl "http://localhost:7777/api/manufacturers/pitco/models/14/parts?limit=5"

# Winco XLB-44 parts
curl "http://localhost:7777/api/manufacturers/winco/models/xlb-44/parts"

# Limited parts
curl "http://localhost:7777/api/manufacturers/accutemp/models/e3-series/parts?limit=10"
```

## 📦 Part Details
```bash
# Winco pitcher (with manufacturer info)
curl "http://localhost:7777/api/parts/WINCXLB44-P10?manufacturer=PT_CAT25482179&manufacturer_uri=winco"

# AccuTemp heating element
curl "http://localhost:7777/api/parts/AT0E-3617-4?manufacturer=PT_CAT1000&manufacturer_uri=accutemp"

# Pitco thermostat
curl "http://localhost:7777/api/parts/PT60125401?manufacturer=PT_CAT1163&manufacturer_uri=pitco"

# Simple lookup
curl "http://localhost:7777/api/parts/WINCXLB44-P10"
```

## 🔍 Search
```bash
# Search fryer models
curl "http://localhost:7777/api/search?q=fryer&type=models&limit=5"

# Search manufacturers
curl "http://localhost:7777/api/search?q=pitco&type=manufacturers"

# Search heating elements
curl "http://localhost:7777/api/search?q=heating%20element&limit=3"

# Search all types
curl "http://localhost:7777/api/search?q=thermostat"

# Search pumps
curl "http://localhost:7777/api/search?q=pump&type=models&limit=10"
```

## 🏥 Health & Docs
```bash
# Health check
curl http://localhost:7777/health

# Basic API info
curl http://localhost:7777/

# Full documentation
curl http://localhost:7777/docs
```

## 🧪 Advanced Examples
```bash
# Extract just the price
curl "http://localhost:7777/api/parts/WINCXLB44-P10" | grep -o '"price_text":"[^"]*'

# Count total manufacturers
curl "http://localhost:7777/api/manufacturers" | grep -o '"count":[0-9]*'

# Find manuals
curl "http://localhost:7777/api/manufacturers/pitco/models?limit=5" | grep -o '"manuals":\[[^]]*\]'

# Pretty print JSON (if you have jq installed)
curl "http://localhost:7777/api/manufacturers?limit=2" | jq '.'

# Save response to file
curl "http://localhost:7777/api/manufacturers?limit=10" > manufacturers.json
```

## 📊 Real Data Examples

These commands use actual part numbers and manufacturers from the system:

```bash
# Real Winco pitcher assembly - $114.24
curl "http://localhost:7777/api/parts/WINCXLB44-P10"

# Real Pitco 14" Gas Fryer models
curl "http://localhost:7777/api/manufacturers/pitco/models?limit=3"

# Real AccuTemp E3 Series steamer parts
curl "http://localhost:7777/api/manufacturers/accutemp/models/e3-series/parts?limit=5"

# Real search for commercial fryers
curl "http://localhost:7777/api/search?q=fryer&type=models&limit=5"
```

---

## 🚀 Start the API Server First!

Before running any of these commands, make sure the server is running:

```bash
cd "/Users/sambrewer/Desktop/Data Services/Data Services PTU Focus/API Scraper V2"
python app.py
```

Then open a new terminal and run the curl commands above.