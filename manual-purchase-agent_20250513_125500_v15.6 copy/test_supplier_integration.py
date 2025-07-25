#!/usr/bin/env python3
"""
Test script for supplier search with price scraping integration
"""
import os
import sys
import logging

# Add the project root to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Test just the supplier finder function
from services.supplier_finder import find_suppliers

def test_supplier_integration():
    """Test the supplier finder with price scraping"""
    
    print("Testing Supplier Search with Price Scraping...")
    print("=" * 60)
    
    # Test with a known part
    part_number = "00-917676"
    make = "Hobart"
    model = "A200"
    
    print(f"Searching for: {part_number} for {make} {model}")
    print("-" * 40)
    
    try:
        suppliers = find_suppliers(
            part_number=part_number,
            make=make,
            model=model,
            oem_only=False
        )
        
        print(f"Found {len(suppliers)} suppliers:")
        
        for i, supplier in enumerate(suppliers, 1):
            print(f"\n{i}. {supplier.get('name', 'Unknown')}")
            print(f"   URL: {supplier.get('url', 'No URL')}")
            print(f"   Price: {supplier.get('price', 'No price')}")
            print(f"   Price Scraped: {supplier.get('price_scraped', False)}")
            print(f"   Source: {supplier.get('source', 'Unknown')}")
            
    except Exception as e:
        print(f"❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
    
    print("\n" + "=" * 60)
    print("Supplier integration test completed")

if __name__ == "__main__":
    test_supplier_integration()