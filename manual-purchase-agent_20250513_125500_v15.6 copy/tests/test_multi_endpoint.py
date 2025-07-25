#!/usr/bin/env python3
"""
Simple test script to verify the multi-manual processing endpoint.
"""

import requests
import json
import sys

BASE_URL = "http://localhost:5000"  # Change this to match your server URL/port

def test_endpoint():
    """Test the multi-manual processing endpoint"""
    url = f"{BASE_URL}/api/manuals/multi-process"
    
    payload = {
        "manual_ids": [1, 2, 3]  # Change these IDs to match your database
    }
    
    print(f"Testing endpoint: {url}")
    print(f"Payload: {json.dumps(payload, indent=2)}")
    
    try:
        response = requests.post(url, json=payload)
        
        print(f"Status code: {response.status_code}")
        
        if response.status_code == 200:
            print("Success! Endpoint is working.")
            result = response.json()
            
            # Print a summary of the results
            manuals = result.get('manuals', [])
            reconciled = result.get('reconciled_results', {})
            stats = reconciled.get('statistics', {})
            
            print(f"\nProcessed {len(manuals)} manuals")
            print(f"Raw error codes: {stats.get('raw_error_codes', 0)}")
            print(f"Unique error codes: {stats.get('unique_error_codes', 0)}")
            print(f"Raw part numbers: {stats.get('raw_part_numbers', 0)}")
            print(f"Unique part numbers: {stats.get('unique_part_numbers', 0)}")
            
        else:
            print(f"Error: {response.text}")
    
    except requests.exceptions.ConnectionError:
        print("Connection error: Is the server running?")
        print(f"Make sure the Flask server is running on {BASE_URL}")
        print("You can start it with: python -m flask run")
        
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    test_endpoint()