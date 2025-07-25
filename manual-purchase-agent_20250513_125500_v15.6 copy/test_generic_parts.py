#!/usr/bin/env python3
"""
Test script for the Generic Parts Finder API endpoint
"""

import requests
import json
import sys

def test_generic_parts_endpoint():
    """Test the new generic parts finder endpoint"""
    
    base_url = "http://localhost:7777"
    
    # Test data - using a verified OEM part
    test_request = {
        "make": "Carrier",
        "model": "58STA080",
        "oem_part_number": "HH18HA499", 
        "oem_part_description": "Hi Limit Switch",
        "search_options": {
            "include_cross_reference": True,
            "include_aftermarket": True,
            "max_results": 10,
            "price_range": {"min": 0, "max": 1000}
        }
    }
    
    print("🔍 Testing Generic Parts Finder API")
    print("=" * 50)
    print(f"Request: {json.dumps(test_request, indent=2)}")
    print("=" * 50)
    
    try:
        # Test the main endpoint
        response = requests.post(
            f"{base_url}/api/parts/find-generic",
            json=test_request,
            timeout=30
        )
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ SUCCESS!")
            print(f"Found {len(result.get('generic_alternatives', []))} generic alternatives")
            
            # Display results
            for i, alt in enumerate(result.get('generic_alternatives', []), 1):
                print(f"\n📦 Alternative {i}:")
                print(f"   Part Number: {alt.get('generic_part_number', 'N/A')}")
                print(f"   Description: {alt.get('generic_part_description', 'N/A')}")
                print(f"   Manufacturer: {alt.get('manufacturer', 'N/A')}")
                print(f"   Confidence: {alt.get('confidence_score', 'N/A')}/10")
                print(f"   Savings: {alt.get('cost_savings_potential', 'N/A')}")
                print(f"   Source: {alt.get('source_website', 'N/A')}")
                if alt.get('image_url'):
                    print(f"   Image: {alt['image_url']}")
            
            # Display metadata
            metadata = result.get('search_metadata', {})
            print(f"\n📊 Search Metadata:")
            print(f"   Cross-references found: {metadata.get('cross_references_found', 0)}")
            print(f"   Generic parts found: {metadata.get('generic_parts_found', 0)}")
            print(f"   AI validated: {metadata.get('ai_validated', 0)}")
            
        else:
            print("❌ FAILED!")
            print(f"Response: {response.text}")
            
    except requests.exceptions.RequestException as e:
        print(f"❌ CONNECTION ERROR: {e}")
        print("\n💡 Make sure the Flask app is running on port 7777")
        print("   Run: flask run --host=0.0.0.0 --port=7777")
        return False
    
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False
    
    return True

def test_compatibility_validation():
    """Test the compatibility validation endpoint"""
    
    base_url = "http://localhost:7777"
    
    test_request = {
        "oem_part_number": "HH18HA499",
        "generic_part_number": "GE-HL-499",
        "make": "Carrier",
        "model": "58STA080"
    }
    
    print("\n🔬 Testing Compatibility Validation API")
    print("=" * 50)
    
    try:
        response = requests.post(
            f"{base_url}/api/parts/validate-compatibility",
            json=test_request,
            timeout=15
        )
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ SUCCESS!")
            print(f"Compatibility Score: {result.get('compatibility_score', 'N/A')}/10")
            print(f"Recommendation: {result.get('recommendation', 'N/A')}")
            print(f"Risk Assessment: {result.get('risk_assessment', 'N/A')}")
            
            analysis = result.get('compatibility_analysis', {})
            print("\n📋 Compatibility Analysis:")
            for key, value in analysis.items():
                print(f"   {key.replace('_', ' ').title()}: {value}")
        else:
            print("❌ FAILED!")
            print(f"Response: {response.text}")
            
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False
    
    return True

def main():
    """Run all tests"""
    print("🚀 Generic Parts Finder API Test Suite")
    print("=" * 60)
    
    # Test main endpoint
    success1 = test_generic_parts_endpoint()
    
    # Test validation endpoint  
    success2 = test_compatibility_validation()
    
    print("\n" + "=" * 60)
    if success1 and success2:
        print("🎉 All tests completed successfully!")
        return 0
    else:
        print("💥 Some tests failed!")
        return 1

if __name__ == "__main__":
    sys.exit(main())