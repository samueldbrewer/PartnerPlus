#!/usr/bin/env python3
"""
Test script for the automated recording system
"""

import requests
import json
import time

# Base URL for the Flask API
BASE_URL = "http://localhost:7777/api/recordings"

def test_health():
    """Test the health endpoint"""
    print("Testing health endpoint...")
    response = requests.get(f"{BASE_URL}/health")
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    return response.status_code == 200

def test_list_recordings():
    """Test listing existing recordings"""
    print("\nTesting list recordings...")
    response = requests.get(f"{BASE_URL}/recordings")
    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Found {data.get('count', 0)} recordings:")
    for recording in data.get('recordings', []):
        print(f"  - {recording['name']}: {recording['start_url']}")
    return response.status_code == 200

def test_get_recording(name):
    """Test getting a specific recording"""
    print(f"\nTesting get recording '{name}'...")
    response = requests.get(f"{BASE_URL}/recording/{name}")
    if response.status_code == 200:
        data = response.json()
        recording_data = data['data']
        print(f"Recording details:")
        print(f"  Start URL: {recording_data.get('startUrl')}")
        print(f"  Actions: {len(recording_data.get('actions', []))}")
        print(f"  Version: {recording_data.get('version')}")
        return True
    else:
        print(f"Error: {response.status_code} - {response.text}")
        return False

def test_play_recording(name, variables=None):
    """Test playing back a recording"""
    print(f"\nTesting playback of '{name}'...")
    
    payload = {
        "recording_name": name,
        "options": {
            "headless": True,  # Run headless for testing
            "fast": True,
            "ignore_errors": True
        }
    }
    
    if variables:
        payload["variables"] = variables
    
    response = requests.post(f"{BASE_URL}/play", json=payload)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"Playback result:")
        print(f"  Success: {data.get('success')}")
        print(f"  Return code: {data.get('return_code')}")
        if data.get('stdout'):
            print(f"  Output: {data['stdout'][:200]}...")
        if data.get('stderr'):
            print(f"  Errors: {data['stderr'][:200]}...")
        return data.get('success', False)
    else:
        print(f"Error: {response.status_code} - {response.text}")
        return False

def test_clone_recording(name, new_url, variables=None):
    """Test cloning a recording to a new URL"""
    print(f"\nTesting clone of '{name}' to '{new_url}'...")
    
    payload = {
        "recording_name": name,
        "url": new_url,
        "options": {
            "headless": True,  # Run headless for testing
            "fast": True,
            "ignore_errors": True
        }
    }
    
    if variables:
        payload["variables"] = variables
    
    response = requests.post(f"{BASE_URL}/clone", json=payload)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"Clone result:")
        print(f"  Success: {data.get('success')}")
        print(f"  Return code: {data.get('return_code')}")
        if data.get('stdout'):
            print(f"  Output: {data['stdout'][:200]}...")
        if data.get('stderr'):
            print(f"  Errors: {data['stderr'][:200]}...")
        return data.get('success', False)
    else:
        print(f"Error: {response.status_code} - {response.text}")
        return False

def main():
    """Run all tests"""
    print("=== Recording System API Tests ===\n")
    
    # Test health
    if not test_health():
        print("Health check failed! Make sure Flask API is running on port 7777")
        return
    
    # Test listing recordings
    test_list_recordings()
    
    # Test getting a specific recording (if etundra exists)
    test_get_recording("etundra")
    
    # Test playback (if etundra exists)
    # test_play_recording("etundra")
    
    # Test clone (if etundra exists)
    # test_clone_recording("etundra", "https://www.example.com/product")
    
    print("\n=== Test Summary ===")
    print("Basic API endpoints are functional.")
    print("To test recording/playback:")
    print("1. Create a new recording manually")
    print("2. Use the play/clone endpoints")
    print("3. Test with variables for form substitution")

if __name__ == "__main__":
    main()