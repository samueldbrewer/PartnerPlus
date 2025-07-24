#!/usr/bin/env python3
"""
PartsTown API Server
Flask REST API for accessing PartsTown equipment parts data
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import asyncio
import time
import json
from threading import Thread
from queue import Queue
import sys
import os

# Import our scraper
from interactive_scraper import PartsTownExplorer

app = Flask(__name__)
CORS(app)  # Enable CORS for web frontend integration

# Global scraper instance
scraper = None
scraper_queue = Queue()

class AsyncScraper:
    """Thread-safe wrapper for the async scraper"""
    
    def __init__(self):
        self.explorer = None
        self.loop = None
        self.thread = None
        self.ready = False
        
    def start(self):
        """Start the async scraper in a separate thread"""
        self.thread = Thread(target=self._run_async_loop, daemon=True)
        self.thread.start()
        
        # Wait for scraper to be ready
        while not self.ready:
            time.sleep(0.1)
    
    def _run_async_loop(self):
        """Run the asyncio event loop in a separate thread"""
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        
        async def initialize():
            self.explorer = PartsTownExplorer()
            await self.explorer.setup_browser()
            self.ready = True
            
            # Keep the loop running
            while True:
                await asyncio.sleep(1)
        
        try:
            self.loop.run_until_complete(initialize())
        except Exception as e:
            print(f"Error in async loop: {e}")
    
    def run_async(self, coro):
        """Run an async function and return the result"""
        if not self.ready:
            return None
            
        future = asyncio.run_coroutine_threadsafe(coro, self.loop)
        return future.result(timeout=60)  # 60 second timeout

# Initialize scraper on startup
scraper = AsyncScraper()

def init_scraper():
    """Initialize the scraper (called when first needed)"""
    global scraper
    if not scraper.ready:
        print("🚀 Initializing PartsTown scraper...")
        scraper.start()
        print("✅ Scraper ready!")

@app.route('/')
def index():
    """API documentation homepage"""
    return jsonify({
        "name": "PartsTown API",
        "version": "1.0.0",
        "description": "REST API for PartsTown equipment parts data",
        "endpoints": {
            "manufacturers": "/api/manufacturers",
            "models": "/api/manufacturers/{manufacturer_uri}/models",
            "parts": "/api/manufacturers/{manufacturer_uri}/models/{model_name}/parts",
            "part_details": "/api/parts/{part_number}",
            "search": "/api/search?q={query}",
            "health": "/health"
        },
        "documentation": "/docs"
    })

@app.route('/docs')
def documentation():
    """Complete API documentation"""
    return jsonify({
        "PartsTown API Documentation": {
            "base_url": request.host_url.rstrip('/'),
            "authentication": "None required",
            "rate_limits": "None currently enforced",
            "data_source": "Real-time scraping of partstown.com",
            
            "endpoints": {
                "1. Get All Manufacturers": {
                    "method": "GET",
                    "endpoint": "/api/manufacturers",
                    "description": "Retrieve all 485+ equipment manufacturers",
                    "parameters": {
                        "limit": "optional, max results to return (default: all)",
                        "search": "optional, filter by manufacturer name"
                    },
                    "curl_commands": {
                        "get_all_manufacturers": "curl http://localhost:7777/api/manufacturers",
                        "get_limited_manufacturers": "curl 'http://localhost:7777/api/manufacturers?limit=5'",
                        "search_manufacturers": "curl 'http://localhost:7777/api/manufacturers?search=pitco'",
                        "search_with_limit": "curl 'http://localhost:7777/api/manufacturers?search=fryer&limit=3'"
                    },
                    "example_response": {
                        "success": True,
                        "count": 2,
                        "data": [
                            {
                                "code": "PT_CAT1163",
                                "name": "Pitco",
                                "uri": "pitco",
                                "model_count": 129
                            }
                        ]
                    }
                },
                
                "2. Get Models for Manufacturer": {
                    "method": "GET", 
                    "endpoint": "/api/manufacturers/{manufacturer_uri}/models",
                    "description": "Get all models for a specific manufacturer",
                    "parameters": {
                        "manufacturer_uri": "required, manufacturer URI (e.g., 'pitco', 'accutemp')",
                        "limit": "optional, max results to return"
                    },
                    "curl_commands": {
                        "pitco_models": "curl http://localhost:7777/api/manufacturers/pitco/models",
                        "pitco_limited": "curl 'http://localhost:7777/api/manufacturers/pitco/models?limit=3'",
                        "accutemp_models": "curl 'http://localhost:7777/api/manufacturers/accutemp/models?limit=5'",
                        "winco_models": "curl 'http://localhost:7777/api/manufacturers/winco/models?limit=2'"
                    },
                    "example_response": {
                        "success": True,
                        "manufacturer": "pitco",
                        "count": 5,
                        "data": [
                            {
                                "code": "PT_CAT294967",
                                "name": "14",
                                "url": "/pitco/14/parts",
                                "description": "Gas Fryer",
                                "manuals": [
                                    {
                                        "type": "Parts Manual",
                                        "link": "/modelManual/PT-7-12-14-14R-PR14-PM14-18_pm.pdf",
                                        "language": "en"
                                    }
                                ]
                            }
                        ]
                    }
                },
                
                "3. Get Parts for Model": {
                    "method": "GET",
                    "endpoint": "/api/manufacturers/{manufacturer_uri}/models/{model_name}/parts", 
                    "description": "Get all parts for a specific model",
                    "parameters": {
                        "manufacturer_uri": "required, manufacturer URI",
                        "model_name": "required, model name or code",
                        "limit": "optional, max results to return"
                    },
                    "curl_commands": {
                        "accutemp_e3_parts": "curl http://localhost:7777/api/manufacturers/accutemp/models/e3-series/parts",
                        "pitco_14_parts": "curl 'http://localhost:7777/api/manufacturers/pitco/models/14/parts?limit=5'",
                        "winco_xlb44_parts": "curl http://localhost:7777/api/manufacturers/winco/models/xlb-44/parts",
                        "limited_parts": "curl 'http://localhost:7777/api/manufacturers/accutemp/models/e3-series/parts?limit=10'"
                    },
                    "example_response": {
                        "success": True,
                        "manufacturer": "accutemp",
                        "model": "e3-series", 
                        "count": 25,
                        "data": [
                            {
                                "part_number": "AT0E-3617-4",
                                "description": "Heating Element",
                                "source": "dom_extraction"
                            }
                        ]
                    }
                },
                
                "4. Get Complete Part Details": {
                    "method": "GET",
                    "endpoint": "/api/parts/{part_number}",
                    "description": "Get comprehensive details for a specific part",
                    "parameters": {
                        "part_number": "required, the part number to lookup",
                        "manufacturer": "optional, manufacturer code for better results"
                    },
                    "curl_commands": {
                        "winco_pitcher": "curl 'http://localhost:7777/api/parts/WINCXLB44-P10?manufacturer=PT_CAT25482179&manufacturer_uri=winco'",
                        "accutemp_element": "curl 'http://localhost:7777/api/parts/AT0E-3617-4?manufacturer=PT_CAT1000&manufacturer_uri=accutemp'",
                        "pitco_thermostat": "curl 'http://localhost:7777/api/parts/PT60125401?manufacturer=PT_CAT1163&manufacturer_uri=pitco'",
                        "simple_lookup": "curl http://localhost:7777/api/parts/WINCXLB44-P10"
                    },
                    "example_response": {
                        "success": True,
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
                },
                
                "5. Search Parts": {
                    "method": "GET",
                    "endpoint": "/api/search",
                    "description": "Search for parts, models, or manufacturers",
                    "parameters": {
                        "q": "required, search query",
                        "type": "optional, filter by 'parts', 'models', or 'manufacturers'",
                        "limit": "optional, max results to return (default: 20)"
                    },
                    "curl_commands": {
                        "search_fryers": "curl 'http://localhost:7777/api/search?q=fryer&type=models&limit=5'",
                        "search_manufacturers": "curl 'http://localhost:7777/api/search?q=pitco&type=manufacturers'",
                        "search_heating": "curl 'http://localhost:7777/api/search?q=heating%20element&limit=3'",
                        "search_all": "curl 'http://localhost:7777/api/search?q=thermostat'",
                        "search_pumps": "curl 'http://localhost:7777/api/search?q=pump&type=models&limit=10'"
                    },
                    "example_response": {
                        "success": True,
                        "query": "fryer",
                        "type": "models",
                        "count": 5,
                        "data": [
                            {
                                "type": "model",
                                "manufacturer": "pitco",
                                "name": "14",
                                "description": "Gas Fryer"
                            }
                        ]
                    }
                },
                
                "6. Health Check": {
                    "method": "GET",
                    "endpoint": "/health",
                    "description": "Check API health and scraper status",
                    "curl_commands": {
                        "health_check": "curl http://localhost:7777/health",
                        "basic_info": "curl http://localhost:7777/",
                        "docs": "curl http://localhost:7777/docs"
                    },
                    "example_response": {
                        "status": "healthy",
                        "scraper_ready": True,
                        "timestamp": "2024-01-07T10:30:00Z"
                    }
                }
            },
            
            "quick_test_sequence": {
                "description": "Copy these commands in order to test the API",
                "commands": [
                    "curl http://localhost:7777/health",
                    "curl 'http://localhost:7777/api/manufacturers?limit=3'",
                    "curl 'http://localhost:7777/api/manufacturers/pitco/models?limit=2'",
                    "curl 'http://localhost:7777/api/search?q=fryer&limit=3'",
                    "curl http://localhost:7777/api/parts/WINCXLB44-P10"
                ]
            },
            
            "advanced_examples": {
                "pricing_analysis": "curl http://localhost:7777/api/parts/WINCXLB44-P10 | grep -o '\"price_text\":\"[^\"]*'",
                "count_manufacturers": "curl http://localhost:7777/api/manufacturers | grep -o '\"count\":[0-9]*'",
                "find_manuals": "curl 'http://localhost:7777/api/manufacturers/pitco/models?limit=5' | grep -o '\"manuals\":\\[[^]]*\\]'"
            },
            
            "error_responses": {
                "400": "Bad Request - Invalid parameters",
                "404": "Not Found - Resource not found", 
                "500": "Internal Server Error - Scraper error",
                "503": "Service Unavailable - Scraper not ready"
            },
            
            "data_freshness": "All data is scraped in real-time from partstown.com",
            "performance_notes": "First request may take 10-15 seconds while browser initializes"
        }
    })

@app.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy" if scraper and scraper.ready else "initializing",
        "scraper_ready": scraper.ready if scraper else False,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    })

@app.route('/api/manufacturers')
def get_manufacturers():
    """Get all manufacturers"""
    if not scraper or not scraper.ready:
        init_scraper()
        if not scraper.ready:
            return jsonify({"error": "Scraper not ready"}), 503
    
    try:
        # Get query parameters
        limit = request.args.get('limit', type=int)
        search = request.args.get('search', '').lower()
        
        # Get manufacturers from scraper
        manufacturers = scraper.run_async(scraper.explorer.get_manufacturers())
        
        if not manufacturers:
            return jsonify({"error": "Failed to fetch manufacturers"}), 500
        
        # Apply search filter
        if search:
            manufacturers = [m for m in manufacturers if search in m['name'].lower()]
        
        # Apply limit
        if limit:
            manufacturers = manufacturers[:limit]
        
        return jsonify({
            "success": True,
            "count": len(manufacturers),
            "total_available": len(manufacturers) if not limit else "filtered",
            "data": manufacturers
        })
        
    except Exception as e:
        return jsonify({"error": f"Failed to fetch manufacturers: {str(e)}"}), 500

@app.route('/api/manufacturers/<manufacturer_uri>/models')
def get_models(manufacturer_uri):
    """Get models for a specific manufacturer"""
    if not scraper or not scraper.ready:
        init_scraper()
        if not scraper.ready:
            return jsonify({"error": "Scraper not ready"}), 503
    
    try:
        # Get query parameters
        limit = request.args.get('limit', type=int)
        
        # First get manufacturer info
        manufacturers = scraper.run_async(scraper.explorer.get_manufacturers())
        manufacturer = next((m for m in manufacturers if m['uri'] == manufacturer_uri), None)
        
        if not manufacturer:
            return jsonify({"error": f"Manufacturer '{manufacturer_uri}' not found"}), 404
        
        # Get models
        models = scraper.run_async(
            scraper.explorer.get_models_for_manufacturer(
                manufacturer['uri'], 
                manufacturer['code']
            )
        )
        
        if not models:
            return jsonify({"error": "Failed to fetch models"}), 500
        
        # Apply limit
        if limit:
            models = models[:limit]
        
        return jsonify({
            "success": True,
            "manufacturer": manufacturer_uri,
            "manufacturer_name": manufacturer['name'],
            "count": len(models),
            "data": models
        })
        
    except Exception as e:
        return jsonify({"error": f"Failed to fetch models: {str(e)}"}), 500

@app.route('/api/manufacturers/<manufacturer_uri>/models/<model_name>/parts')
def get_parts(manufacturer_uri, model_name):
    """Get parts for a specific model"""
    if not scraper or not scraper.ready:
        init_scraper()
        if not scraper.ready:
            return jsonify({"error": "Scraper not ready"}), 503
    
    try:
        # Get query parameters
        limit = request.args.get('limit', type=int)
        
        # Get manufacturer info
        manufacturers = scraper.run_async(scraper.explorer.get_manufacturers())
        manufacturer = next((m for m in manufacturers if m['uri'] == manufacturer_uri), None)
        
        if not manufacturer:
            return jsonify({"error": f"Manufacturer '{manufacturer_uri}' not found"}), 404
        
        # Get models to find the specific model
        models = scraper.run_async(
            scraper.explorer.get_models_for_manufacturer(
                manufacturer['uri'], 
                manufacturer['code']
            )
        )
        
        model = next((m for m in models if m.get('name', '').lower().replace(' ', '-') == model_name.lower() or 
                     m.get('code', '').lower() == model_name.lower() or
                     m.get('name', '').lower() == model_name.lower()), None)
        
        if not model:
            return jsonify({"error": f"Model '{model_name}' not found for manufacturer '{manufacturer_uri}'"}), 404
        
        # Get parts
        parts = scraper.run_async(
            scraper.explorer.get_parts_for_model(model, manufacturer['uri'])
        )
        
        if not parts:
            return jsonify({"error": "Failed to fetch parts"}), 500
        
        # Apply limit
        if limit:
            parts = parts[:limit]
        
        return jsonify({
            "success": True,
            "manufacturer": manufacturer_uri,
            "model": model_name,
            "model_info": {
                "name": model.get('name'),
                "code": model.get('code'),
                "description": model.get('description', ''),
                "manuals": model.get('manuals', [])
            },
            "count": len(parts),
            "data": parts
        })
        
    except Exception as e:
        return jsonify({"error": f"Failed to fetch parts: {str(e)}"}), 500

@app.route('/api/parts/<part_number>')
def get_part_details(part_number):
    """Get comprehensive details for a specific part"""
    if not scraper or not scraper.ready:
        init_scraper()
        if not scraper.ready:
            return jsonify({"error": "Scraper not ready"}), 503
    
    try:
        # Get query parameters
        manufacturer_code = request.args.get('manufacturer', 'UNKNOWN')
        manufacturer_uri = request.args.get('manufacturer_uri', 'unknown')
        
        # Create mock part data for the lookup
        part_data = {
            'part_number': part_number,
            'productCode': part_number,
            'code': part_number
        }
        
        # Get comprehensive part details
        details = scraper.run_async(
            scraper.explorer.get_part_details(part_data, manufacturer_uri, manufacturer_code)
        )
        
        if not details:
            return jsonify({"error": f"Part '{part_number}' not found"}), 404
        
        return jsonify({
            "success": True,
            "part_number": part_number,
            "data": details
        })
        
    except Exception as e:
        return jsonify({"error": f"Failed to fetch part details: {str(e)}"}), 500

@app.route('/api/search')
def search():
    """Search across parts, models, and manufacturers"""
    if not scraper or not scraper.ready:
        init_scraper()
        if not scraper.ready:
            return jsonify({"error": "Scraper not ready"}), 503
    
    try:
        # Get query parameters
        query = request.args.get('q', '').strip()
        search_type = request.args.get('type', 'all').lower()
        limit = request.args.get('limit', 20, type=int)
        
        if not query:
            return jsonify({"error": "Query parameter 'q' is required"}), 400
        
        results = []
        
        # Search manufacturers
        if search_type in ['all', 'manufacturers']:
            manufacturers = scraper.run_async(scraper.explorer.get_manufacturers())
            for mfr in manufacturers:
                if query.lower() in mfr['name'].lower():
                    results.append({
                        "type": "manufacturer",
                        "code": mfr['code'],
                        "name": mfr['name'],
                        "uri": mfr['uri'],
                        "model_count": mfr['model_count'],
                        "relevance": "name_match"
                    })
        
        # Search models (limited to first few manufacturers for performance)
        if search_type in ['all', 'models'] and len(results) < limit:
            manufacturers = scraper.run_async(scraper.explorer.get_manufacturers())
            for mfr in manufacturers[:5]:  # Limit to first 5 manufacturers for performance
                try:
                    models = scraper.run_async(
                        scraper.explorer.get_models_for_manufacturer(mfr['uri'], mfr['code'])
                    )
                    for model in models:
                        if (query.lower() in model.get('name', '').lower() or 
                            query.lower() in model.get('description', '').lower()):
                            results.append({
                                "type": "model",
                                "manufacturer": mfr['name'],
                                "manufacturer_uri": mfr['uri'],
                                "code": model.get('code'),
                                "name": model.get('name'),
                                "description": model.get('description', ''),
                                "url": model.get('url'),
                                "manuals": model.get('manuals', []),
                                "relevance": "name_or_description_match"
                            })
                            
                            if len(results) >= limit:
                                break
                except:
                    continue  # Skip manufacturers that fail
                
                if len(results) >= limit:
                    break
        
        # Limit results
        results = results[:limit]
        
        return jsonify({
            "success": True,
            "query": query,
            "type": search_type,
            "count": len(results),
            "data": results
        })
        
    except Exception as e:
        return jsonify({"error": f"Search failed: {str(e)}"}), 500

@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Endpoint not found"}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({"error": "Internal server error"}), 500

if __name__ == '__main__':
    print("🚀 Starting PartsTown API Server...")
    print("📖 API Documentation: http://localhost:7777/docs")
    print("🔍 Health Check: http://localhost:7777/health")
    print("🏭 Manufacturers: http://localhost:7777/api/manufacturers")
    
    # For production deployment, use a proper WSGI server
    # app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 7777)), debug=False)
    
    # For local development
    app.run(host='127.0.0.1', port=7777, debug=True, threaded=True)