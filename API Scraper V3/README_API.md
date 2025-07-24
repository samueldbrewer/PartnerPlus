# PartsTown API Server

A comprehensive REST API for accessing PartsTown equipment parts data with real-time scraping capabilities.

## Features

- **Real-time data**: All data scraped live from partstown.com
- **485+ Manufacturers**: Complete manufacturer database
- **Comprehensive part details**: Prices, images, specifications, manuals
- **Clean REST API**: Simple endpoints with JSON responses
- **Production ready**: Async scraping with thread-safe Flask server
- **CORS enabled**: Ready for web frontend integration

## Quick Start

### Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Install Playwright browsers (if not already done)
python -m playwright install chromium

# Start the server
python app.py
```

Server will start at `http://localhost:5000`

### API Documentation

- **Full Docs**: http://localhost:5000/docs
- **Health Check**: http://localhost:5000/health
- **Interactive**: Use any HTTP client (curl, Postman, browser)

## API Endpoints

### 1. Get All Manufacturers
```http
GET /api/manufacturers
```

**Parameters:**
- `limit` (optional): Max results to return
- `search` (optional): Filter by manufacturer name

**Example:**
```bash
curl "http://localhost:5000/api/manufacturers?limit=5&search=pitco"
```

**Response:**
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "code": "PT_CAT1163",
      "name": "Pitco",
      "uri": "pitco", 
      "model_count": 129
    }
  ]
}
```

### 2. Get Models for Manufacturer
```http
GET /api/manufacturers/{manufacturer_uri}/models
```

**Example:**
```bash
curl "http://localhost:5000/api/manufacturers/pitco/models?limit=3"
```

**Response:**
```json
{
  "success": true,
  "manufacturer": "pitco",
  "manufacturer_name": "Pitco",
  "count": 3,
  "data": [
    {
      "code": "PT_CAT294967",
      "name": "14",
      "url": "/pitco/14/parts",
      "description": "Gas Fryer",
      "manuals": [
        {
          "type": "Parts Manual",
          "typeCode": "pm",
          "link": "/modelManual/PT-7-12-14-14R-PR14-PM14-18_pm.pdf",
          "language": "en"
        }
      ]
    }
  ]
}
```

### 3. Get Parts for Model
```http
GET /api/manufacturers/{manufacturer_uri}/models/{model_name}/parts
```

**Example:**
```bash
curl "http://localhost:5000/api/manufacturers/accutemp/models/e3-series/parts"
```

**Response:**
```json
{
  "success": true,
  "manufacturer": "accutemp",
  "model": "e3-series",
  "model_info": {
    "name": "E3 SERIES",
    "code": "PT_CAT321390",
    "description": "Evolution Electric Boilerless Steamer",
    "manuals": []
  },
  "count": 52,
  "data": [
    {
      "part_number": "AT0E-3617-4",
      "description": "Heating Element",
      "source": "dom_extraction"
    }
  ]
}
```

### 4. Get Complete Part Details
```http
GET /api/parts/{part_number}
```

**Parameters:**
- `manufacturer` (optional): Manufacturer code for better results
- `manufacturer_uri` (optional): Manufacturer URI for better results

**Example:**
```bash
curl "http://localhost:5000/api/parts/WINCXLB44-P10?manufacturer=PT_CAT25482179&manufacturer_uri=accelmix"
```

**Response:**
```json
{
  "success": true,
  "part_number": "WINCXLB44-P10",
  "data": {
    "part_number": "WINCXLB44-P10",
    "title": "Winco XLB44-P10 Pitcher Assembly",
    "description": "Pitcher Assembly", 
    "price": "114.24",
    "price_text": "$114.24",
    "url": "https://www.partstown.com/winco/wincxlb44-p10",
    "images": [
      "https://partstown.sirv.com/products/WINC/WINCXLB44-P10.view?thumb"
    ],
    "sirv_images": [
      {
        "url": "https://partstown.sirv.com/products/WINC/WINCXLB44-P10.view",
        "type": ".view",
        "content_type": "image/avif"
      }
    ],
    "specifications": {},
    "api_data": []
  }
}
```

### 5. Search Parts/Models/Manufacturers
```http
GET /api/search
```

**Parameters:**
- `q` (required): Search query
- `type` (optional): Filter by 'parts', 'models', or 'manufacturers' 
- `limit` (optional): Max results (default: 20)

**Example:**
```bash
curl "http://localhost:5000/api/search?q=fryer&type=models&limit=5"
```

**Response:**
```json
{
  "success": true,
  "query": "fryer",
  "type": "models", 
  "count": 5,
  "data": [
    {
      "type": "model",
      "manufacturer": "Pitco",
      "manufacturer_uri": "pitco",
      "code": "PT_CAT294967",
      "name": "14",
      "description": "Gas Fryer",
      "url": "/pitco/14/parts",
      "manuals": [...]
    }
  ]
}
```

### 6. Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "scraper_ready": true,
  "timestamp": "2024-01-07T10:30:00Z"
}
```

## Production Deployment

### Option 1: Gunicorn (Recommended)

```bash
# Install gunicorn
pip install gunicorn

# Create logs directory
mkdir logs

# Start with gunicorn
gunicorn --bind 0.0.0.0:8000 --workers 1 --timeout 120 wsgi:app
```

### Option 2: Docker

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
RUN python -m playwright install chromium

COPY . .

EXPOSE 8000
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "1", "--timeout", "120", "wsgi:app"]
```

### Option 3: Cloud Deployment

#### Heroku
```bash
# Create Procfile
echo "web: gunicorn wsgi:app" > Procfile

# Add Playwright buildpack
heroku buildpacks:add heroku-community/inline

# Deploy
git push heroku main
```

#### Railway/Render/DigitalOcean
- Upload code
- Set start command: `gunicorn wsgi:app`
- Set environment variables if needed

## Performance Notes

- **First request**: 10-15 seconds (browser initialization)
- **Subsequent requests**: 2-5 seconds (real-time scraping)
- **Concurrent requests**: Handled by single browser instance
- **Memory usage**: ~200MB (including browser)

## Error Handling

- **400**: Bad Request - Invalid parameters
- **404**: Not Found - Resource not found
- **500**: Internal Server Error - Scraping failure
- **503**: Service Unavailable - Scraper not ready

## Rate Limiting

Currently no rate limits enforced. For production, consider adding:
- Flask-Limiter for request throttling
- Redis/database caching for frequently accessed data
- CDN for static responses

## Security

- CORS enabled for web integration
- No authentication required (public data)
- Input validation on all endpoints
- Error messages don't expose internal details

## Monitoring

Add these for production monitoring:
- Health check endpoint (`/health`) for uptime monitoring
- Logging to files/external services
- Metrics collection (response times, error rates)
- Browser process monitoring

## Example Usage Scripts

### Python Client
```python
import requests

base_url = "http://localhost:5000"

# Get manufacturers
response = requests.get(f"{base_url}/api/manufacturers?limit=5")
manufacturers = response.json()['data']

# Get models for first manufacturer
mfr_uri = manufacturers[0]['uri']
response = requests.get(f"{base_url}/api/manufacturers/{mfr_uri}/models")
models = response.json()['data']

# Get part details
response = requests.get(f"{base_url}/api/parts/WINCXLB44-P10")
part_details = response.json()['data']
print(f"Price: {part_details['price_text']}")
```

### JavaScript/Node.js Client
```javascript
const baseUrl = 'http://localhost:5000';

// Search for fryers
fetch(`${baseUrl}/api/search?q=fryer&type=models`)
  .then(response => response.json())
  .then(data => {
    console.log(`Found ${data.count} fryer models`);
    data.data.forEach(model => {
      console.log(`${model.manufacturer}: ${model.name}`);
    });
  });
```

## License

This API provides access to publicly available data from partstown.com for legitimate research and business purposes.