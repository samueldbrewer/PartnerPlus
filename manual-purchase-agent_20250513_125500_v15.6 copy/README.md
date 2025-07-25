# Manual Purchase Agent - Enterprise API Edition (v4.0.0)

A comprehensive Flask microservice that combines AI, web scraping, and browser automation to find technical manuals, extract part information, and autonomously purchase parts online. This Enterprise API Edition includes a powerful web UI and enhanced API functionality with comprehensive documentation and testing tools.

## Features

- **Enhanced API**: Flexible endpoints supporting both GET and POST methods for all operations
- **API Documentation**: Comprehensive reference with examples for all endpoints
- **API Testing Tools**: Ready-made scripts for testing all API functionality
- **Real-time Integration**: Full support for external APIs without prefetched data
- **Intuitive Web UI**: Interactive dashboard and visualization for all components
- **Manual Management**: Find, download, and process technical and parts manuals
- **Part Identification**: Extract and resolve parts with AI-powered processing
- **Supplier Integration**: Find and compare suppliers for any part
- **Automated Purchasing**: Advanced browser automation using playwright-recorder service
- **Recording & Replay**: Record purchase flows once, replay with different products
- **Enterprise Demo Mode**: Showcase all features in a safe, simulated environment
- **Security Controls**: Environment-based configuration for real vs simulated purchases

## System Architecture

This application is built using the following technologies:
- **Backend**: Flask, SQLAlchemy, SerpAPI, OpenAI
- **Purchase Automation**: Node.js playwright-recorder service
- **Frontend**: Bootstrap 5, Vue.js, Chart.js
- **Database**: PostgreSQL
- **Infrastructure**: Docker, Gunicorn, Docker Compose

## Installation

### Prerequisites

- Docker and Docker Compose
- Python 3.11 or higher (for local development)
- SerpAPI and OpenAI API keys

### Setup with Docker (Recommended)

1. Clone the repository:
```bash
git clone https://github.com/yourusername/manual-purchase-agent.git
cd manual-purchase-agent
```

2. Use the provided `.env` file or edit it with your own API keys and credentials.

3. Important environment variables:
   - `SERPAPI_KEY`: Your SerpAPI key for manual searching
   - `OPENAI_API_KEY`: Your OpenAI API key for text extraction
   - `ENCRYPTION_KEY`: Base64-encoded Fernet key for encrypting sensitive data
   - `ENABLE_REAL_PURCHASES`: Set to "true" to enable actual purchase execution (default: false)

   Note: To generate a proper Fernet key, run:
   ```bash
   python generate_key.py
   ```

4. Build and start the Docker containers:
```bash
docker-compose up -d
```

The application will be available at:
- Main application: `http://localhost:7777`
- Playwright-recorder API: `http://localhost:3001`

### Local Development Setup

1. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Install Playwright browsers (required for purchase automation):
```bash
playwright install chromium
```

4. Use the provided `.env` file or edit it with your own credentials.

5. Run the Flask application:
```bash
export PYTHONPATH=$PWD  # Set Python path to current directory
flask run --host=0.0.0.0 --port=7777
```

6. In a separate terminal, run the playwright-recorder service:
```bash
cd "Purchasing Agent Focus server backup/playwright-recorder"
npm install
npx playwright install chromium
PORT=3001 npm run start:api
```

## Web UI Overview

The Manual Purchase Agent Enterprise Edition includes a comprehensive web interface with the following sections:

### Dashboard
- Real-time statistics and monitoring
- System activity visualization
- Recent operations tracking

### Manuals Section
- Search and download technical manuals
- Process manuals to extract information
- Browse extracted parts and error codes

### Parts Section
- View and manage identified parts
- Resolve generic part descriptions
- View part relationships and alternatives

### Suppliers Section
- Search and manage suppliers
- Compare prices and availability
- Track supplier reliability

### Purchases Section
- View purchase history
- Track purchase status
- Monitor automated purchase workflows

### Demo Mode
- Enterprise demonstration with simulated workflows
- Step-by-step visualization of the entire process
- Interactive controls for presentations

## REST API

The application provides a comprehensive REST API for integration with other systems. 

### API Documentation

Detailed API documentation is available in the [API_REFERENCE.md](API_REFERENCE.md) file, which includes:
- Complete endpoint descriptions for all resources
- Required and optional parameters for each endpoint
- Example curl commands for testing each endpoint
- Expected response formats

### API Testing

Two testing scripts are included for verifying API functionality:
- `test_api.sh`: Tests basic API functionality
- `test_all_api.sh`: Comprehensive tests for all API endpoints

To run the API tests:
```bash
# Make sure the scripts are executable
chmod +x test_api.sh test_all_api.sh

# Run basic API tests
./test_api.sh

# Run comprehensive API tests
./test_all_api.sh
```

## Security Considerations

- Sensitive payment and billing information is encrypted in the database
- API keys are secured and never exposed in the frontend
- Authentication and authorization controls for enterprise deployment
- In production, always use HTTPS and proper authentication

## License

This project is licensed under the MIT License - see the LICENSE file for details.