#!/usr/bin/env python3
"""
Test script for the integrated purchasing system with playwright-recorder
"""

import requests
import json
import sys

# Configuration
FLASK_API_BASE = "http://localhost:7777"
PLAYWRIGHT_API_BASE = "http://localhost:3001"

def test_playwright_recorder_health():
    """Test if the playwright-recorder API is running"""
    print("Testing playwright-recorder API health...")
    try:
        response = requests.get(f"{PLAYWRIGHT_API_BASE}/api/health")
        if response.status_code == 200:
            print("✓ Playwright-recorder API is healthy")
            print(f"  Response: {response.json()}")
            return True
        else:
            print(f"✗ Playwright-recorder API returned status {response.status_code}")
            return False
    except Exception as e:
        print(f"✗ Could not connect to playwright-recorder API: {e}")
        return False

def test_flask_api_health():
    """Test if the Flask API is running"""
    print("\nTesting Flask API health...")
    try:
        response = requests.get(f"{FLASK_API_BASE}/api/system/health")
        if response.status_code == 200:
            print("✓ Flask API is healthy")
            print(f"  Response: {response.json()}")
            return True
        else:
            print(f"✗ Flask API returned status {response.status_code}")
            return False
    except Exception as e:
        print(f"✗ Could not connect to Flask API: {e}")
        return False

def test_purchase_endpoint():
    """Test the purchase endpoint (without actually making a purchase)"""
    print("\nTesting purchase endpoint...")
    
    # First, we need a billing profile ID
    # In a real test, you would create one or use an existing one
    test_data = {
        "part_number": "TEST-PART-123",
        "supplier_url": "https://www.etundra.com/test-product",
        "billing_profile_id": 1,  # Assuming profile ID 1 exists
        "quantity": 1
    }
    
    print(f"  Request data: {json.dumps(test_data, indent=2)}")
    
    # Note: This will fail if billing profile doesn't exist
    # In production, you'd first create a test profile
    try:
        response = requests.post(
            f"{FLASK_API_BASE}/api/purchases",
            json=test_data,
            headers={"Content-Type": "application/json"}
        )
        
        print(f"  Response status: {response.status_code}")
        print(f"  Response body: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code in [200, 201]:
            print("✓ Purchase endpoint is working")
            return True
        else:
            print("✗ Purchase endpoint returned an error")
            return False
    except Exception as e:
        print(f"✗ Error testing purchase endpoint: {e}")
        return False

def test_playwright_recordings():
    """Test if recordings are available in playwright-recorder"""
    print("\nTesting available recordings...")
    try:
        response = requests.get(f"{PLAYWRIGHT_API_BASE}/api/recordings")
        if response.status_code == 200:
            recordings = response.json().get("recordings", [])
            print(f"✓ Found {len(recordings)} recordings:")
            for rec in recordings:
                print(f"  - {rec.get('file')} for {rec.get('baseUrl')}")
            return True
        else:
            print(f"✗ Could not get recordings: status {response.status_code}")
            return False
    except Exception as e:
        print(f"✗ Error getting recordings: {e}")
        return False

def main():
    """Run all tests"""
    print("=== Purchase Integration Test ===\n")
    
    tests = [
        test_playwright_recorder_health,
        test_flask_api_health,
        test_playwright_recordings,
        # test_purchase_endpoint,  # Commented out to avoid creating failed purchases
    ]
    
    passed = 0
    for test in tests:
        if test():
            passed += 1
    
    print(f"\n=== Results: {passed}/{len(tests)} tests passed ===")
    return 0 if passed == len(tests) else 1

if __name__ == "__main__":
    sys.exit(main())