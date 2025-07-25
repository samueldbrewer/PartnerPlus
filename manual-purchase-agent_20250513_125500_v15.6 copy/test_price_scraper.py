#!/usr/bin/env python3
"""
Test script for price scraping functionality
"""
import os
import sys
import logging

# Add the project root to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.price_scraper import scrape_supplier_price

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_price_scraping():
    """Test price scraping with known URLs that should have prices"""
    
    test_urls = [
        # PartsTown - known to have prices
        "https://www.partstown.com/hobart/hob00-917676",
        
        # Amazon - should have prices  
        "https://www.amazon.com/dp/B08N5WRWNW",
        
        # eBay - usually has prices
        "https://www.ebay.com/itm/126414544200",
        
        # Test with a simple product page
        "https://www.webstaurantstore.com/nemco-55150a-easy-slicer-0-25-straight-cut-blade-assembly/63555150A.html"
    ]
    
    print("Testing Price Scraper...")
    print("=" * 50)
    
    for i, url in enumerate(test_urls, 1):
        print(f"\nTest {i}: {url}")
        print("-" * 40)
        
        try:
            price = scrape_supplier_price(url, timeout=10000)
            if price:
                print(f"✅ SUCCESS: Found price: {price}")
            else:
                print(f"❌ FAILED: No price found")
                
        except Exception as e:
            print(f"❌ ERROR: {e}")
    
    print("\n" + "=" * 50)
    print("Price scraping test completed")

if __name__ == "__main__":
    test_price_scraping()