import sys
import json
from urllib.parse import urlparse

class MockConfig:
    SERPAPI_KEY = "YOUR_API_KEY"  # Replace with real key if needed

# Mock the database operations
class MockDB:
    class session:
        @staticmethod
        def add(obj):
            pass
        
        @staticmethod
        def commit():
            pass
        
        @staticmethod
        def rollback():
            pass

# Import with patch
sys.modules['config'] = type('', (), {'Config': MockConfig})
sys.modules['models'] = type('', (), {'db': MockDB})

# Now import the function
from services.supplier_finder import GoogleSearch, rank_suppliers

def main():
    part_number = "oil filter"
    make = "Honda"
    model = "Accord"
    
    print(f"Testing supplier finder with: {part_number}, {make}, {model}")
    
    # Construct search query
    query = f"{part_number}"
    
    # Add make and model if provided
    if make:
        query += f" {make}"
    if model:
        query += f" {model}"
    
    query += " buy purchase"
    
    print(f"DEBUG: Searching for suppliers with query: {query}")
    
    # Execute search with SerpAPI - this will fail without a real API key
    # So we'll just simulate the response instead
    
    # Create simulated supplier data
    suppliers = [
        {
            "name": "AutoZone",
            "title": "Honda Oil Filter for 2010-2022 Accord",
            "url": "https://www.autozone.com/honda-accord-oil-filter",
            "price": "$9.99",
            "source": "shopping",
            "domain": "autozone.com",
            "in_stock": True,
            "thumbnail": "http://example.com/thumb1.jpg"
        },
        {
            "name": "OReilly Auto Parts",
            "title": "Premium Oil Filter - Honda Accord",
            "url": "https://www.oreillyauto.com/oil-filter-honda",
            "price": "$8.95",
            "source": "shopping",
            "domain": "oreillyauto.com",
            "in_stock": True,
            "thumbnail": "http://example.com/thumb2.jpg"
        },
        {
            "name": "Amazon",
            "title": "Honda Genuine Parts Oil Filter - Accord Compatible",
            "url": "https://www.amazon.com/honda-accord-oil-filter",
            "price": "$12.49",
            "source": "shopping",
            "domain": "amazon.com",
            "in_stock": True,
            "thumbnail": "http://example.com/thumb3.jpg"
        },
        {
            "name": "RockAuto",
            "title": "HONDA ACCORD Oil Filter (Engine)",
            "url": "https://www.rockauto.com/honda-accord-oil-filter",
            "price": "$7.49",
            "source": "shopping",
            "domain": "rockauto.com",
            "in_stock": True,
            "thumbnail": "http://example.com/thumb4.jpg"
        },
        {
            "name": "eBay",
            "title": "OEM Honda Accord Oil Filter - NEW GENUINE PART",
            "url": "https://www.ebay.com/itm/honda-accord-oil-filter",
            "price": "$11.50",
            "source": "shopping",
            "domain": "ebay.com",
            "in_stock": True,
            "thumbnail": "http://example.com/thumb5.jpg"
        },
        {
            "name": "Advance Auto Parts",
            "title": "Honda Accord Oil Filter - All Models",
            "url": "https://www.advanceautoparts.com/p/honda-accord-oil-filter",
            "price": "$10.49",
            "source": "shopping",
            "domain": "advanceautoparts.com",
            "in_stock": True,
            "thumbnail": "http://example.com/thumb6.jpg"
        },
    ]
    
    # Score and rank suppliers
    suppliers = rank_suppliers(suppliers)
    
    print(f"Found {len(suppliers)} suppliers")
    for i, supplier in enumerate(suppliers, 1):
        print(f"\nSupplier {i}:")
        print(f"  Name: {supplier.get('name', 'Unknown')}")
        print(f"  Title: {supplier.get('title', 'No title')}")
        print(f"  URL: {supplier.get('url', 'No URL')}")
        print(f"  Price: {supplier.get('price', 'No price')}")
        print(f"  Domain: {supplier.get('domain', 'No domain')}")
        print(f"  Score: {supplier.get('score', 0)}")

if __name__ == "__main__":
    main()