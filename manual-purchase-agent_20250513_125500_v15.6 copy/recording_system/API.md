# Playwright Recorder API Documentation

## Overview

The Playwright Recorder API provides HTTP endpoints to automate web purchases using pre-recorded browser sessions. It uses the clone functionality to apply existing recordings to new product URLs with the same site structure.

## Starting the API Server

```bash
# Install dependencies (including Express)
npm install

# Start the API server
npm run start:api

# The server will run on port 3000 by default
# Set PORT environment variable to use a different port
PORT=8080 npm run start:api
```

## API Endpoints

### 1. Purchase Automation

**Endpoint:** `POST /api/purchases`

**Description:** Executes a purchase flow on a new product URL using an existing recording from the same website.

**Request Body:**
```json
{
  "productUrl": "https://www.etundra.com/restaurant-parts/new-product-page",
  "variables": {
    "customer_name": "John Doe",
    "phone_number": "555-123-4567",
    "email": "john@example.com",
    "zip_code": "94043"
  },
  "options": {
    "headless": true,
    "fast": true,
    "ignoreErrors": false,
    "noWait": false
  },
  "slowMo": 500
}
```

**Parameters:**
- `productUrl` (required): The target product URL to automate
- `variables` (optional): Key-value pairs for form field substitution
- `options` (optional):
  - `headless`: Run browser in headless mode (default: true)
  - `fast`: Enable fast mode for quicker execution
  - `ignoreErrors`: Continue on errors
  - `noWait`: Skip waiting for network idle states
- `slowMo` (optional): Delay in milliseconds between actions (default: 500, use 0 for maximum speed)

**Response:**
```json
{
  "success": true,
  "recordingUsed": "recordings/etundra.json",
  "baseUrl": "https://www.etundra.com",
  "output": "Playback completed successfully",
  "timestamp": "2025-05-22T16:30:00.000Z"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "No recording found for base URL: https://www.example.com"
}
```

### 2. List Available Recordings

**Endpoint:** `GET /api/recordings`

**Description:** Lists all available recordings with their base URLs.

**Response:**
```json
{
  "recordings": [
    {
      "file": "recordings/etundra.json",
      "startUrl": "https://www.etundra.com/restaurant-parts/...",
      "baseUrl": "https://www.etundra.com",
      "actionsCount": 45,
      "timestamp": 1736435401624
    }
  ]
}
```

### 3. Health Check

**Endpoint:** `GET /api/health`

**Response:**
```json
{
  "status": "ok",
  "service": "playwright-recorder-api"
}
```

## Integration Example

### Using cURL

```bash
# Execute a purchase with maximum speed
curl -X POST http://localhost:3000/api/purchases \
  -H "Content-Type: application/json" \
  -d '{
    "productUrl": "https://www.etundra.com/restaurant-parts/beverage-equipment/coffee-brewers/bunn-12-cup-digital-coffee-brewer-cwtf15-3/",
    "variables": {
      "customer_name": "Test User",
      "zip_code": "40014"
    },
    "options": {
      "fast": true,
      "noWait": true
    },
    "slowMo": 0
  }'

# Execute with normal speed (500ms delays)
curl -X POST http://localhost:3000/api/purchases \
  -H "Content-Type: application/json" \
  -d '{
    "productUrl": "https://www.etundra.com/restaurant-parts/beverage-equipment/coffee-brewers/bunn-12-cup-digital-coffee-brewer-cwtf15-3/",
    "variables": {
      "customer_name": "Test User",
      "zip_code": "40014"
    },
    "slowMo": 500
  }'

# List recordings
curl http://localhost:3000/api/recordings

# Health check
curl http://localhost:3000/api/health
```

### Using JavaScript/Node.js

```javascript
const axios = require('axios');

async function automatedPurchase() {
  try {
    const response = await axios.post('http://localhost:3000/api/purchases', {
      productUrl: 'https://www.etundra.com/restaurant-parts/new-product',
      variables: {
        customer_name: 'John Doe',
        phone_number: '555-123-4567',
        email: 'john@example.com',
        zip_code: '94043'
      },
      options: {
        headless: true,
        fast: true
      }
    });
    
    console.log('Purchase result:', response.data);
  } catch (error) {
    console.error('Purchase failed:', error.response?.data || error.message);
  }
}
```

### Using Python

```python
import requests

def automate_purchase():
    url = "http://localhost:3000/api/purchases"
    payload = {
        "productUrl": "https://www.etundra.com/restaurant-parts/new-product",
        "variables": {
            "customer_name": "John Doe",
            "phone_number": "555-123-4567",
            "email": "john@example.com",
            "zip_code": "94043"
        },
        "options": {
            "headless": True,
            "fast": True
        }
    }
    
    response = requests.post(url, json=payload)
    print(response.json())
```

## How It Works

1. **Recording Matching**: When a purchase request is received, the API extracts the base URL (protocol + domain) from the provided product URL.

2. **Recording Search**: It searches through all available JSON recording files to find one that matches the base URL. It checks both the `startUrl` and any navigation actions within the recording.

3. **Clone Execution**: If a matching recording is found, it uses the `clone` command to replay the recording on the new product URL.

4. **Variable Substitution**: Any provided variables are saved to a temporary file and passed to the playback engine, which replaces placeholders and dummy values in form fields.

5. **Response**: The API returns the execution result, including success status and any output from the playback process.

## Prerequisites

Before using the API:

1. **Create Recordings**: You must have at least one recording for the target website:
   ```bash
   node index.js record https://www.example.com -o example.json
   ```

2. **Install Browsers**: Ensure Playwright browsers are installed:
   ```bash
   npx playwright install
   ```

3. **Test Recording**: Verify your recording works:
   ```bash
   node index.js play example.json
   ```

## Error Handling

The API will return appropriate HTTP status codes:

- `200 OK`: Successful execution
- `400 Bad Request`: Invalid input (missing productUrl, invalid URL format)
- `404 Not Found`: No recording found for the provided base URL
- `500 Internal Server Error`: Execution error or server issue

## Security Considerations

1. **Input Validation**: The API validates URLs and sanitizes inputs
2. **File Access**: Only reads JSON files from the project directory
3. **Process Isolation**: Each playback runs in a separate process
4. **Timeout**: Consider implementing timeouts for long-running playbacks

## Limitations

1. Recordings must exist for the target website's base URL
2. The target page must have the same structure as the recorded page
3. Dynamic content or layout changes may cause playback failures
4. Only supports single concurrent playback per API instance