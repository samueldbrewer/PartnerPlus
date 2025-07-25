from urllib.parse import urlparse

def rank_suppliers(suppliers):
    """
    Rank suppliers based on multiple factors
    
    Args:
        suppliers (list): List of supplier dictionaries
        
    Returns:
        list: Ranked list of suppliers (up to 5 top suppliers)
    """
    # Preferred domains (known reputable suppliers)
    preferred_domains = [
        "amazon.com", "ebay.com", "rockauto.com", "summitracing.com",
        "autozone.com", "advanceautoparts.com", "oreillyauto.com",
        "partsgeek.com", "carid.com"
    ]
    
    # Score and sort suppliers
    for supplier in suppliers:
        score = 0
        
        # Preferred domain bonus
        domain = supplier.get("domain", "")
        if any(domain.endswith(preferred) for preferred in preferred_domains):
            score += 20
        
        # Shopping results are often more reliable than organic
        if supplier.get("source") == "shopping":
            score += 10
            
            # Price is available
            if "price" in supplier and supplier["price"]:
                score += 5
        
        # In stock bonus
        if supplier.get("in_stock", False):
            score += 15
        
        # Ensure URL is present
        if not supplier.get("url") and "link" in supplier:
            supplier["url"] = supplier["link"]
        elif not supplier.get("url") and domain:
            supplier["url"] = f"https://{domain}"
            
        # Set score
        supplier["score"] = score
    
    # Remove duplicate domains, keeping the highest scored one
    unique_suppliers = {}
    for supplier in suppliers:
        domain = supplier.get("domain", "")
        if domain not in unique_suppliers or supplier.get("score", 0) > unique_suppliers[domain].get("score", 0):
            unique_suppliers[domain] = supplier
    
    # Sort by score (descending) and get top 5
    final_suppliers = sorted(unique_suppliers.values(), key=lambda x: x.get("score", 0), reverse=True)[:5]
    
    print(f"DEBUG: Returning {len(final_suppliers)} suppliers after filtering and ranking")
    for s in final_suppliers:
        print(f"DEBUG: Supplier: {s.get('name')}, URL: {s.get('url')}")
    
    return final_suppliers

def main():
    part_number = "oil filter"
    make = "Honda"
    model = "Accord"
    
    print(f"Testing supplier finder with: {part_number}, {make}, {model}")
    
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
    ranked_suppliers = rank_suppliers(suppliers)
    
    print(f"\nFound {len(ranked_suppliers)} suppliers")
    for i, supplier in enumerate(ranked_suppliers, 1):
        print(f"\nSupplier {i}:")
        print(f"  Name: {supplier.get('name', 'Unknown')}")
        print(f"  Title: {supplier.get('title', 'No title')}")
        print(f"  URL: {supplier.get('url', 'No URL')}")
        print(f"  Price: {supplier.get('price', 'No price')}")
        print(f"  Domain: {supplier.get('domain', 'No domain')}")
        print(f"  Score: {supplier.get('score', 0)}")

if __name__ == "__main__":
    main()