#!/usr/bin/env python3
"""
Test script for the PartsTown API
"""

import requests
import json
import time

def test_api():
    """Test all API endpoints"""
    base_url = "http://localhost:7777"
    
    print("🧪 Testing PartsTown API...")
    print(f"Base URL: {base_url}")
    
    # Test health check
    print("\n1️⃣ Testing health check...")
    try:
        response = requests.get(f"{base_url}/health", timeout=10)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
    except requests.exceptions.ConnectionError:
        print("❌ API server not running. Start with: python app.py")
        return
    except Exception as e:
        print(f"❌ Error: {e}")
        return
    
    # Test documentation
    print("\n2️⃣ Testing documentation...")
    try:
        response = requests.get(f"{base_url}/docs", timeout=10)
        if response.status_code == 200:
            print("✅ Documentation endpoint working")
        else:
            print(f"❌ Documentation failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Error: {e}")
    
    # Test manufacturers (this will trigger scraper initialization)
    print("\n3️⃣ Testing manufacturers endpoint (may take 10-15 seconds for first request)...")
    try:
        start_time = time.time()
        response = requests.get(f"{base_url}/api/manufacturers?limit=3", timeout=60)
        elapsed = time.time() - start_time
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Manufacturers endpoint working ({elapsed:.1f}s)")
            print(f"Found {data['count']} manufacturers")
            if data['data']:
                print(f"First manufacturer: {data['data'][0]['name']}")
        else:
            print(f"❌ Manufacturers failed: {response.status_code}")
            print(f"Response: {response.text}")
    except Exception as e:
        print(f"❌ Error: {e}")
        return
    
    # Test models endpoint
    print("\n4️⃣ Testing models endpoint...")
    try:
        response = requests.get(f"{base_url}/api/manufacturers/pitco/models?limit=2", timeout=30)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Models endpoint working")
            print(f"Found {data['count']} models for Pitco")
            if data['data']:
                model = data['data'][0]
                print(f"First model: {model['name']} - {model.get('description', 'No description')}")
        else:
            print(f"❌ Models failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Error: {e}")
    
    # Test search endpoint
    print("\n5️⃣ Testing search endpoint...")
    try:
        response = requests.get(f"{base_url}/api/search?q=fryer&limit=3", timeout=30)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Search endpoint working")
            print(f"Found {data['count']} results for 'fryer'")
            if data['data']:
                result = data['data'][0]
                print(f"First result: {result['name']} ({result['type']})")
        else:
            print(f"❌ Search failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Error: {e}")
    
    print("\n🎉 API testing completed!")
    print(f"\n📖 Full documentation: {base_url}/docs")
    print(f"🔍 Health check: {base_url}/health")

if __name__ == "__main__":
    test_api()