#!/usr/bin/env python3
"""
Test script for the new dual search system
"""

import sys
import os
sys.path.append('/Users/sambrewer/Desktop/Partner+/manual-purchase-agent_20250513_125500_v15.6')

from services.dual_search import find_part_with_dual_search, get_serpapi_results, get_gpt_web_search_result, ai_arbitrator

def test_serpapi_only():
    """Test just the SerpAPI results"""
    print("=" * 50)
    print("Testing SerpAPI Results Only")
    print("=" * 50)
    
    result = get_serpapi_results("door seal", "Henny Penny", "500")
    print(f"Success: {result.get('success')}")
    print(f"Query: {result.get('query')}")
    print(f"Results count: {len(result.get('results', []))}")
    
    if result.get('results'):
        print("\nFirst 3 results:")
        for i, res in enumerate(result['results'][:3]):
            print(f"{i+1}. {res['title']}")
            print(f"   URL: {res['url']}")
            print(f"   Snippet: {res['snippet'][:100]}...")
            print()

def test_gpt_web_search():
    """Test GPT web search"""
    print("=" * 50) 
    print("Testing GPT Web Search")
    print("=" * 50)
    
    result = get_gpt_web_search_result("door seal", "Henny Penny", "500")
    print(f"Success: {result.get('success')}")
    
    if result.get('success'):
        gpt_result = result['result']
        print(f"Part Number: {gpt_result.get('oem_part_number')}")
        print(f"Manufacturer: {gpt_result.get('manufacturer')}")
        print(f"Description: {gpt_result.get('description')}")
        print(f"Confidence: {gpt_result.get('confidence')}")
        print(f"Sources: {gpt_result.get('sources')}")

def test_full_dual_search():
    """Test the complete dual search system"""
    print("=" * 50)
    print("Testing Complete Dual Search System")
    print("=" * 50)
    
    result = find_part_with_dual_search("door seal", "Henny Penny", "500")
    
    print(f"Part Number: {result.get('oem_part_number')}")
    print(f"Manufacturer: {result.get('manufacturer')}")
    print(f"Description: {result.get('description')}")
    print(f"Confidence: {result.get('confidence')}")
    print(f"Selected Method: {result.get('selected_method')}")
    print(f"Arbitrator Reasoning: {result.get('arbitrator_reasoning')}")
    print(f"SerpAPI Results Count: {result.get('serpapi_count')}")
    print(f"GPT Web Search Success: {result.get('gpt_web_success')}")

if __name__ == "__main__":
    print("Testing New Dual Search System")
    print("Part: door seal for Henny Penny 500")
    print()
    
    try:
        # Test each component
        test_serpapi_only()
        print()
        test_gpt_web_search() 
        print()
        test_full_dual_search()
        
    except Exception as e:
        print(f"Test failed with error: {e}")
        import traceback
        traceback.print_exc()