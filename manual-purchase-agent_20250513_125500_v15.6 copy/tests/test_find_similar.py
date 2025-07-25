#!/usr/bin/env python3
"""
Test the find-similar endpoint
"""

import requests
import json
import sys

# API endpoint
BASE_URL = "http://localhost:7777"
ENDPOINT = f"{BASE_URL}/api/parts/find-similar"

def test_find_similar():
    """Test the find-similar endpoint with various scenarios"""
    
    print("Testing /api/parts/find-similar endpoint...\n")
    
    # Test case 1: Basic search for a fan
    test_data = {
        "description": "fan",
        "make": "Carrier",
        "model": "58STA",
        "failed_part_number": "HH18HA499"  # Example of a part that failed validation
    }
    
    print(f"Test 1: Finding similar parts for '{test_data['description']}' ({test_data['make']} {test_data['model']})")
    print(f"Failed part number: {test_data.get('failed_part_number', 'None')}")
    
    try:
        response = requests.post(ENDPOINT, json=test_data)
        
        if response.status_code == 200:
            result = response.json()
            print(f"\nSuccess! Found {result.get('total_found', 0)} similar parts")
            
            # Display the results
            similar_parts = result.get('similar_parts', [])
            for i, part in enumerate(similar_parts[:5], 1):  # Show top 5
                print(f"\n--- Part {i} ---")
                print(f"Part Number: {part.get('part_number', 'N/A')}")
                print(f"Title: {part.get('title', 'N/A')}")
                print(f"Description: {part.get('description', 'N/A')[:100]}...")
                print(f"Price: {part.get('price', 'N/A')}")
                print(f"Image: {'Yes' if part.get('image') else 'No'}")
                print(f"In Stock: {part.get('in_stock', 'Unknown')}")
                print(f"Confidence: {part.get('confidence', 0):.2f}")
                print(f"AI Explanation: {part.get('ai_explanation', 'N/A')}")
                
                # Show validation info if available
                if part.get('validation'):
                    val = part['validation']
                    print(f"Validation: {'Valid' if val.get('is_valid') else 'Invalid'}")
                    print(f"Assessment: {val.get('assessment', 'N/A')[:100]}...")
        
        elif response.status_code == 404:
            print("\nNo similar parts found")
            print(f"Response: {response.json()}")
        
        else:
            print(f"\nError: HTTP {response.status_code}")
            print(f"Response: {response.text}")
            
    except Exception as e:
        print(f"\nError making request: {e}")
        return False
    
    # Test case 2: Search without failed part number
    print("\n" + "="*60 + "\n")
    
    test_data2 = {
        "description": "thermostat",
        "make": "Honeywell",
        "model": "T87F",
        "max_results": 5
    }
    
    print(f"Test 2: Finding similar parts for '{test_data2['description']}' ({test_data2['make']} {test_data2['model']})")
    
    try:
        response = requests.post(ENDPOINT, json=test_data2)
        
        if response.status_code == 200:
            result = response.json()
            print(f"\nSuccess! Found {result.get('total_found', 0)} similar parts")
            print(f"Summary: {result.get('summary', 'N/A')}")
            
            # Just show count and first part
            similar_parts = result.get('similar_parts', [])
            if similar_parts:
                part = similar_parts[0]
                print(f"\nTop result:")
                print(f"- {part.get('title', 'N/A')}")
                print(f"- Price: {part.get('price', 'N/A')}")
                print(f"- Link: {part.get('link', 'N/A')[:50]}...")
        
        else:
            print(f"\nError: HTTP {response.status_code}")
            print(f"Response: {response.text}")
            
    except Exception as e:
        print(f"\nError making request: {e}")
        return False
    
    return True

if __name__ == "__main__":
    # Check if server is running
    try:
        health_check = requests.get(f"{BASE_URL}/api/system/health")
        if health_check.status_code != 200:
            print("Error: Server is not running on port 7777")
            sys.exit(1)
    except:
        print("Error: Cannot connect to server on port 7777")
        print("Make sure the Flask server is running: flask run --port 7777")
        sys.exit(1)
    
    # Run the test
    success = test_find_similar()
    sys.exit(0 if success else 1)