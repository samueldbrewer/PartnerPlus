#!/usr/bin/env python3
"""
Example client demonstrating how to use the PartsTown API
"""

import requests
import json

class PartsTownAPIClient:
    """Simple client for the PartsTown API"""
    
    def __init__(self, base_url="http://localhost:7777"):
        self.base_url = base_url.rstrip('/')
        
    def get_manufacturers(self, limit=None, search=None):
        """Get all manufacturers"""
        params = {}
        if limit:
            params['limit'] = limit
        if search:
            params['search'] = search
            
        response = requests.get(f"{self.base_url}/api/manufacturers", params=params)
        return response.json()
    
    def get_models(self, manufacturer_uri, limit=None):
        """Get models for a manufacturer"""
        params = {}
        if limit:
            params['limit'] = limit
            
        response = requests.get(f"{self.base_url}/api/manufacturers/{manufacturer_uri}/models", params=params)
        return response.json()
    
    def get_parts(self, manufacturer_uri, model_name, limit=None):
        """Get parts for a model"""
        params = {}
        if limit:
            params['limit'] = limit
            
        response = requests.get(f"{self.base_url}/api/manufacturers/{manufacturer_uri}/models/{model_name}/parts", params=params)
        return response.json()
    
    def get_part_details(self, part_number, manufacturer=None, manufacturer_uri=None):
        """Get comprehensive part details"""
        params = {}
        if manufacturer:
            params['manufacturer'] = manufacturer
        if manufacturer_uri:
            params['manufacturer_uri'] = manufacturer_uri
            
        response = requests.get(f"{self.base_url}/api/parts/{part_number}", params=params)
        return response.json()
    
    def search(self, query, search_type=None, limit=None):
        """Search across the database"""
        params = {'q': query}
        if search_type:
            params['type'] = search_type
        if limit:
            params['limit'] = limit
            
        response = requests.get(f"{self.base_url}/api/search", params=params)
        return response.json()

def example_workflow():
    """Example workflow showing how to use the API"""
    
    print("🚀 PartsTown API Client Example")
    print("=" * 50)
    
    # Initialize client
    client = PartsTownAPIClient()
    
    try:
        # 1. Find fryer manufacturers
        print("\n1️⃣ Searching for fryer manufacturers...")
        manufacturers = client.get_manufacturers(search="pitco")
        
        if manufacturers['success'] and manufacturers['data']:
            pitco = manufacturers['data'][0]
            print(f"✅ Found: {pitco['name']} ({pitco['model_count']} models)")
            
            # 2. Get fryer models from Pitco
            print(f"\n2️⃣ Getting models from {pitco['name']}...")
            models = client.get_models(pitco['uri'], limit=5)
            
            if models['success'] and models['data']:
                print(f"✅ Found {models['count']} models:")
                
                fryer_models = []
                for model in models['data']:
                    description = model.get('description', '')
                    if 'fryer' in description.lower():
                        fryer_models.append(model)
                        print(f"   🔥 {model['name']}: {description}")
                        
                        # Show manuals if available
                        if model.get('manuals'):
                            print(f"      📚 {len(model['manuals'])} manual(s) available")
                
                # 3. Get parts for the first fryer model
                if fryer_models:
                    fryer = fryer_models[0]
                    model_name = fryer['name'].lower().replace(' ', '-')
                    
                    print(f"\n3️⃣ Getting parts for {fryer['name']} fryer...")
                    parts = client.get_parts(pitco['uri'], model_name, limit=3)
                    
                    if parts['success'] and parts['data']:
                        print(f"✅ Found {parts['count']} parts:")
                        
                        for part in parts['data']:
                            part_num = part.get('part_number', 'Unknown')
                            desc = part.get('description', 'No description')[:50]
                            print(f"   🔧 {part_num}: {desc}...")
                        
                        # 4. Get detailed info for first part
                        if parts['data']:
                            first_part = parts['data'][0]
                            part_number = first_part.get('part_number')
                            
                            if part_number:
                                print(f"\n4️⃣ Getting detailed info for part {part_number}...")
                                details = client.get_part_details(
                                    part_number, 
                                    manufacturer=pitco['code'],
                                    manufacturer_uri=pitco['uri']
                                )
                                
                                if details['success']:
                                    part_data = details['data']
                                    print(f"✅ Part Details:")
                                    print(f"   📦 Title: {part_data.get('title', 'N/A')}")
                                    print(f"   💰 Price: {part_data.get('price_text', 'N/A')}")
                                    print(f"   🌐 URL: {part_data.get('url', 'N/A')}")
                                    
                                    # Show images
                                    sirv_images = part_data.get('sirv_images', [])
                                    if sirv_images:
                                        print(f"   🖼️  {len(sirv_images)} image(s) available:")
                                        for img in sirv_images[:2]:
                                            print(f"      • {img['url']}")
                
        # 5. General search example
        print(f"\n5️⃣ Searching for 'heating element' across all data...")
        search_results = client.search("heating element", limit=3)
        
        if search_results['success'] and search_results['data']:
            print(f"✅ Found {search_results['count']} results:")
            for result in search_results['data']:
                if result['type'] == 'model':
                    print(f"   📱 Model: {result['name']} by {result['manufacturer']}")
                elif result['type'] == 'manufacturer':
                    print(f"   🏭 Manufacturer: {result['name']}")
        
        print(f"\n🎉 Example workflow completed successfully!")
        
    except requests.exceptions.ConnectionError:
        print("❌ Error: API server not running")
        print("Start the server with: python app.py")
    except Exception as e:
        print(f"❌ Error: {e}")

def pricing_analysis_example():
    """Example showing how to analyze pricing across parts"""
    print("\n" + "=" * 50)
    print("💰 PRICING ANALYSIS EXAMPLE")
    print("=" * 50)
    
    client = PartsTownAPIClient()
    
    try:
        # Search for specific part types
        search_terms = ["heating element", "pump", "valve", "thermostat"]
        
        for term in search_terms:
            print(f"\n🔍 Analyzing prices for '{term}'...")
            results = client.search(term, search_type="models", limit=2)
            
            if results['success'] and results['data']:
                for model in results['data']:
                    print(f"📱 {model['manufacturer']}: {model['name']}")
                    
                    # Get parts for this model
                    model_name = model['name'].lower().replace(' ', '-')
                    parts = client.get_parts(model['manufacturer_uri'], model_name, limit=2)
                    
                    if parts['success'] and parts['data']:
                        for part in parts['data']:
                            part_num = part.get('part_number')
                            if part_num:
                                details = client.get_part_details(part_num)
                                if details['success'] and 'price' in details['data']:
                                    price = details['data']['price_text']
                                    desc = details['data'].get('description', 'No description')[:30]
                                    print(f"   💰 {part_num}: {price} - {desc}...")
            
            print("   " + "-" * 40)
    
    except Exception as e:
        print(f"❌ Error in pricing analysis: {e}")

if __name__ == "__main__":
    # Run the main example
    example_workflow()
    
    # Run pricing analysis
    pricing_analysis_example()
    
    print(f"\n📖 For more examples, check the API documentation at: http://localhost:5000/docs")