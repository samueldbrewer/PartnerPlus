#!/usr/bin/env python3
"""
Test API endpoints for purchase automation
"""

import requests
import json

BASE_URL = "http://localhost:7777"

def test_supported_sites():
    """Test the supported sites endpoint"""
    print("🧪 Testing GET /api/automation/supported-sites")
    
    try:
        response = requests.get(f"{BASE_URL}/api/automation/supported-sites")
        data = response.json()
        
        print(f"✅ Status: {response.status_code}")
        print(f"✅ Success: {data.get('success')}")
        print(f"✅ Sites: {data.get('total')} supported")
        
        for site in data.get('sites', []):
            print(f"   - {site['name']} ({site['domain']})")
        
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to Flask server. Is it running?")
    except Exception as e:
        print(f"❌ Error: {e}")


def test_compatibility_check():
    """Test site compatibility check"""
    print("\n🧪 Testing POST /api/automation/test")
    
    test_urls = [
        "https://www.etundra.com/product/123",
        "https://www.amazon.com/product/456",
        "https://example-store.com/item"
    ]
    
    for url in test_urls:
        try:
            response = requests.post(
                f"{BASE_URL}/api/automation/test",
                json={"product_url": url}
            )
            data = response.json()
            
            if data.get('compatible'):
                print(f"✅ {url} -> Supported ({data.get('site_name')})")
            else:
                print(f"❌ {url} -> Not supported")
                
        except Exception as e:
            print(f"❌ Error testing {url}: {e}")


def test_purchase_endpoint():
    """Test the purchase execution endpoint"""
    print("\n🧪 Testing POST /api/automation/execute")
    
    # Test payload
    payload = {
        "product_url": "https://www.etundra.com/kitchen-supplies/food-storage/dough-boxes/cambro-dbc1826cw148-pizza-dough-box-cover/",
        "billing_profile": {
            "email": "test@example.com",
            "first_name": "Test",
            "last_name": "User",
            "address": "123 Test Street",
            "city": "Test City",
            "state": "CA",
            "zip": "90210",
            "phone": "555-123-4567",
            "card_number": "4111111111111111",
            "card_name": "Test User",
            "card_expiry": "12/25",
            "card_cvv": "123"
        },
        "options": {
            "dry_run": True,
            "headless": True
        }
    }
    
    print("📝 Payload preview:")
    print(f"   Product: {payload['product_url'][:50]}...")
    print(f"   Dry Run: {payload['options']['dry_run']}")
    print(f"   Headless: {payload['options']['headless']}")
    
    # Note: We're not actually executing this to avoid launching browsers
    print("\n⚠️  Skipping actual execution (would launch browser)")
    print("💡 Use the CLI tool to test actual purchases")


def main():
    print("🚀 Testing Purchase Automation API Endpoints\n")
    
    # Check if server is running
    try:
        response = requests.get(f"{BASE_URL}/api/system/health")
        if response.status_code == 200:
            print("✅ Flask server is running\n")
        else:
            print("⚠️  Flask server responded with status:", response.status_code)
    except requests.exceptions.ConnectionError:
        print("❌ Flask server is not running!")
        print("💡 Start it with: ./start_services.sh")
        return
    
    # Run tests
    test_supported_sites()
    test_compatibility_check()
    test_purchase_endpoint()
    
    print("\n✅ API endpoint tests completed!")
    print("\n📋 Available endpoints:")
    print("   GET  /api/automation/supported-sites")
    print("   POST /api/automation/test")
    print("   POST /api/automation/execute")


if __name__ == "__main__":
    main()