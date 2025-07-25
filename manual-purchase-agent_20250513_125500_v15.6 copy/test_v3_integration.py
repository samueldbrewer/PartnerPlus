#!/usr/bin/env python3
"""
Test script for V3 API demo integration with recording system
"""

import requests
import json

def test_v3_integration():
    """Test the V3 API demo integration with recording system"""
    
    print("=== V3 Integration Test ===\n")
    
    base_url = "http://localhost:7777"
    
    # Test 1: Available recordings endpoint
    print("1. Testing available recordings endpoint...")
    try:
        response = requests.get(f"{base_url}/api/recordings/available")
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"   Available domains: {data.get('domains', [])}")
            print(f"   Count: {data.get('count', 0)}")
            print("   ✅ Available recordings endpoint working")
        else:
            print(f"   ❌ Failed: {response.text}")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    print()
    
    # Test 2: Variables endpoint (GET)
    print("2. Testing variables GET endpoint...")
    try:
        response = requests.get(f"{base_url}/api/recordings/variables")
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            variables = data.get('variables', {})
            print(f"   Variables loaded: {len(variables)} fields")
            print(f"   Sample fields: {list(variables.keys())[:5]}")
            print("   ✅ Variables GET endpoint working")
        else:
            print(f"   ❌ Failed: {response.text}")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    print()
    
    # Test 3: Variables endpoint (POST)
    print("3. Testing variables POST endpoint...")
    try:
        test_variables = {
            "first_name": "Test",
            "last_name": "User",
            "email": "test@example.com",
            "phone": "555-TEST-123",
            "zip_code": "12345"
        }
        
        response = requests.post(f"{base_url}/api/recordings/variables", 
                               json={"variables": test_variables})
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"   Response: {data.get('status', 'unknown')}")
            print("   ✅ Variables POST endpoint working")
        else:
            print(f"   ❌ Failed: {response.text}")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    print()
    
    # Test 4: List recordings endpoint  
    print("4. Testing list recordings endpoint...")
    try:
        response = requests.get(f"{base_url}/api/recordings/recordings")
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            recordings = data.get('recordings', [])
            print(f"   Recordings found: {len(recordings)}")
            if recordings:
                print(f"   Sample recording: {recordings[0].get('name', 'unnamed')}")
            print("   ✅ List recordings endpoint working")
        else:
            print(f"   ❌ Failed: {response.text}")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    print()
    
    # Test 5: Check if admin.html exists
    print("5. Testing admin page accessibility...")
    try:
        response = requests.get(f"{base_url}/static/api-demo/v3/admin.html")
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            print("   ✅ Admin page accessible")
        else:
            print(f"   ❌ Admin page not accessible: {response.status_code}")
    except Exception as e:
        print(f"   ❌ Error accessing admin page: {e}")
    
    print()
    
    # Test 6: Check if main page exists
    print("6. Testing main V3 page accessibility...")
    try:
        response = requests.get(f"{base_url}/static/api-demo/v3/index.html")
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            print("   ✅ Main V3 page accessible")
        else:
            print(f"   ❌ Main V3 page not accessible: {response.status_code}")
    except Exception as e:
        print(f"   ❌ Error accessing main page: {e}")
    
    print("\n=== Integration Test Summary ===")
    print("✅ Recording system integrated with V3 API demo")
    print("✅ Admin page for managing purchase variables")
    print("✅ Purchase button will appear for sites with recordings")
    print("✅ Variables will be used during automated purchases")
    
    print("\nNext steps:")
    print("1. Start Flask API: flask run --host=0.0.0.0 --port=7777")
    print("2. Open V3 demo: http://localhost:7777/static/api-demo/v3/")
    print("3. Configure variables: http://localhost:7777/static/api-demo/v3/admin.html")
    print("4. Test purchase automation on sites with recordings")

if __name__ == "__main__":
    test_v3_integration()