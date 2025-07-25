import sys
import json
import requests
from urllib.parse import urlparse

# Mock configuration
class MockConfig:
    SERPAPI_KEY = "YOUR_SERPAPI_KEY"  # Replace with a real key if needed

# Mock database
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

# Mock flask modules
sys.modules['config'] = type('', (), {'Config': MockConfig})
sys.modules['models'] = type('', (), {'db': MockDB, 'Supplier': type('Supplier', (), {})})
sys.modules['flask'] = type('', (), {'current_app': None})

# Import the functions
from services.supplier_finder import is_ecommerce_site, rank_suppliers

class GoogleSearch:
    """A simplified wrapper for the SerpAPI Google search"""
    
    def __init__(self, params):
        """Initialize with search parameters"""
        self.params = params
        
    def get_dict(self):
        """Return simulated results"""
        search_type = self.params.get("tbm")
        query = self.params.get("q", "")
        
        if search_type == "shop":
            return {"shopping_results": self._get_simulated_shopping_results(query)}
        else:
            return {"organic_results": self._get_simulated_organic_results(query)}
    
    def _get_simulated_organic_results(self, query):
        # Simulate organic search results
        part_number = query.split()[0]
        domains = [
            "rockauto.com", "amazon.com", "ebay.com", "autozone.com", 
            "oreillyauto.com", "advanceautoparts.com", "walmart.com",
            "carid.com", "partsgeek.com", "summitracing.com"
        ]
        
        results = []
        for i, domain in enumerate(domains[:10]):
            results.append({
                "title": f"Buy {part_number} online | {domain}",
                "link": f"https://www.{domain}/products/{part_number.lower()}",
                "snippet": f"High quality {part_number} at competitive prices. Free shipping on orders over $35.",
                "position": i + 1
            })
        
        return results
    
    def _get_simulated_shopping_results(self, query):
        # Simulate shopping search results
        part_number = query.split()[0]
        sources = [
            "Amazon", "Walmart", "eBay", "AutoZone", 
            "O'Reilly Auto Parts", "Advance Auto Parts",
            "Rock Auto", "CarID", "Parts Geek", "Summit Racing"
        ]
        
        results = []
        for i, source in enumerate(sources[:5]):
            price = 9.99 + i * 2.5
            domain = source.lower().replace("'", "").replace(" ", "")
            results.append({
                "title": f"{part_number} - High Quality Replacement Part",
                "link": f"https://www.{domain}.com/product/{part_number.lower()}",
                "source": source,
                "price": f"${price:.2f}",
                "product_link": f"https://www.{domain}.com/product/{part_number.lower()}",
                "thumbnail": f"https://example.com/images/{part_number.lower()}.jpg"
            })
        
        return results

def find_suppliers_test(part_number, make=None, model=None):
    """
    Test version of find_suppliers without database interactions
    """
    # Construct search query
    query = f"{part_number}"
    
    # Add make and model if provided
    if make:
        query += f" {make}"
    if model:
        query += f" {model}"
    
    query += " buy purchase"
    
    print(f"DEBUG: Searching for suppliers with query: {query}")
    
    suppliers = []
    
    # First try general web search (prioritized)
    search_params = {
        "engine": "google",
        "q": query,
        "num": 20,
        "gl": "us",
        "hl": "en"
    }
    
    web_search = GoogleSearch(search_params)
    web_results = web_search.get_dict()
    
    # Process organic search results
    if "organic_results" in web_results and web_results["organic_results"]:
        print(f"DEBUG: Found {len(web_results['organic_results'])} organic results")
        for result in web_results["organic_results"]:
            # Basic filtering for e-commerce sites
            link = result.get("link", "")
            if not link:
                continue
                
            domain = urlparse(link).netloc
            
            if is_ecommerce_site(domain):
                supplier = {
                    "name": domain.replace("www.", ""),
                    "title": result.get("title", ""),
                    "url": link,
                    "snippet": result.get("snippet", ""),
                    "source": "organic",
                    "domain": domain,
                    "in_stock": True,  # Assume in stock for organic results
                    "thumbnail": result.get("thumbnail", "")
                }
                suppliers.append(supplier)
    
    # If we didn't get enough organic results, try shopping search as fallback
    if len(suppliers) < 5:
        # Switch to shopping search
        search_params["tbm"] = "shop"
        shopping_search = GoogleSearch(search_params)
        shopping_results = shopping_search.get_dict()
        
        # Process shopping results if available
        if "shopping_results" in shopping_results and shopping_results["shopping_results"]:
            print(f"DEBUG: Found {len(shopping_results['shopping_results'])} shopping results")
            for result in shopping_results["shopping_results"]:
                # Make sure URL is present and not empty
                url = result.get("link", "")
                if not url and "product_link" in result:
                    url = result.get("product_link", "")
                
                # If still no URL, construct one if possible
                if not url and result.get("source", ""):
                    source = result.get("source", "")
                    source_domain = source.lower().replace(" ", "").replace(".", "") + ".com"
                    url = f"https://www.{source_domain}"
                
                # If we have a URL, add the supplier
                if url:
                    supplier = {
                        "name": result.get("source", ""),
                        "title": result.get("title", ""),
                        "url": url,
                        "price": result.get("price", ""),
                        "source": "shopping",
                        "domain": urlparse(url).netloc,
                        "in_stock": "sold out" not in result.get("title", "").lower(),
                        "thumbnail": result.get("thumbnail", "")
                    }
                    suppliers.append(supplier)
    
    # Rank suppliers
    ranked_suppliers = rank_suppliers(suppliers)
    
    return ranked_suppliers

def main():
    # Test cases
    test_cases = [
        ("15400-PLM-A02", "Honda", "Accord"),
        ("oil filter", "Toyota", "Camry"),
        ("air filter", None, None),
        ("spark plug", "Bosch", None)
    ]
    
    for part, make, model in test_cases:
        print(f"\n===== Testing: {part} {make or ''} {model or ''} =====")
        suppliers = find_suppliers_test(part, make, model)
        
        print(f"\nFound {len(suppliers)} suppliers:")
        for i, supplier in enumerate(suppliers, 1):
            print(f"\n-- Supplier {i}: --")
            print(f"  Name: {supplier.get('name', 'Unknown')}")
            print(f"  Title: {supplier.get('title', 'No title')}")
            print(f"  URL: {supplier.get('url', 'No URL')}")
            print(f"  Source: {supplier.get('source', 'Unknown')}")
            print(f"  Domain: {supplier.get('domain', 'No domain')}")
            if "price" in supplier:
                print(f"  Price: {supplier.get('price', 'No price')}")
            print(f"  Score: {supplier.get('score', 0)}")

if __name__ == "__main__":
    main()