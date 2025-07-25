import logging
import json
import requests
from urllib.parse import urlparse
from config import Config
from models import db, Supplier

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class GoogleSearch:
    """A wrapper for the SerpAPI Google search"""
    
    def __init__(self, params):
        """Initialize with search parameters"""
        self.params = params
        self.api_key = params.get("api_key") or Config.SERPAPI_KEY
        self.base_url = "https://serpapi.com/search"
    
    def get_dict(self):
        """Perform the search and return results as a dictionary"""
        try:
            # Ensure API key is included
            self.params["api_key"] = self.api_key
            
            response = requests.get(self.base_url, params=self.params)
            response.raise_for_status()
            return response.json()
        
        except requests.exceptions.RequestException as e:
            logger.error(f"Error searching with SerpAPI: {e}")
            return {}

def find_suppliers(part_number, oem_only=False, make=None, model=None):
    """
    Find suppliers for a specific part number
    
    Args:
        part_number (str): The OEM or generic part number to search for
        oem_only (bool): Whether to limit results to OEM parts only
        make (str, optional): Vehicle/device make
        model (str, optional): Vehicle/device model
        
    Returns:
        list: Supplier listings with pricing and availability
    """
    logger.info(f"Searching for suppliers of part: {part_number}, OEM only: {oem_only}")
    
    # Construct search query
    query = f"{part_number}"
    
    # Add make and model if provided
    if make:
        query += f" {make}"
    if model:
        query += f" {model}"
    
    if oem_only:
        query += " OEM genuine"
    
    query += " buy purchase"
    
    # Execute search with SerpAPI
    search_params = {
        "api_key": Config.SERPAPI_KEY,
        "engine": "google",
        "q": query,
        "num": 20,
        "gl": "us",
        "hl": "en",
        "tbm": "shop"  # Use the shopping tab for better results
    }
    
    # First try shopping search
    search = GoogleSearch(search_params)
    results = search.get_dict()
    suppliers = []
    
    # Process shopping results if available
    if "shopping_results" in results and results["shopping_results"]:
        for result in results["shopping_results"]:
            supplier = {
                "name": result.get("source", ""),
                "title": result.get("title", ""),
                "url": result.get("link", ""),
                "price": result.get("price", ""),
                "source": "shopping",
                "domain": urlparse(result.get("link", "")).netloc,
                "in_stock": "sold out" not in result.get("title", "").lower(),
                "thumbnail": result.get("thumbnail", "")
            }
            suppliers.append(supplier)
    
    # If we didn't get enough shopping results, try web search
    if len(suppliers) < 5:
        # Switch to web search
        search_params["tbm"] = None
        web_search = GoogleSearch(search_params)
        web_results = web_search.get_dict()
        
        # Process organic search results
        if "organic_results" in web_results:
            for result in web_results["organic_results"]:
                # Basic filtering for e-commerce sites
                link = result.get("link", "")
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
    
    # Save any new suppliers to the database
    for supplier_data in suppliers:
        save_supplier(supplier_data)
    
    # Rank suppliers
    ranked_suppliers = rank_suppliers(suppliers)
    
    return ranked_suppliers

def is_ecommerce_site(domain):
    """
    Check if a domain is likely an e-commerce site
    
    Args:
        domain (str): Domain name to check
        
    Returns:
        bool: Whether the domain is likely an e-commerce site
    """
    ecommerce_indicators = [
        "amazon", "ebay", "walmart", "autozone", "rockauto", 
        "shop", "parts", "buy", "store", "suppl", "ecommerce",
        "partsgeek", "advanceautoparts", "oreillyauto", "summitracing",
        "carid", "autopartswarehouse", "newegg", "bestbuy", "homedepot"
    ]
    
    return any(indicator in domain.lower() for indicator in ecommerce_indicators)

def rank_suppliers(suppliers):
    """
    Rank suppliers based on multiple factors
    
    Args:
        suppliers (list): List of supplier dictionaries
        
    Returns:
        list: Ranked list of suppliers
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
        
        # Set score
        supplier["score"] = score
    
    # Remove duplicate domains, keeping the highest scored one
    unique_suppliers = {}
    for supplier in suppliers:
        domain = supplier.get("domain", "")
        if domain not in unique_suppliers or supplier.get("score", 0) > unique_suppliers[domain].get("score", 0):
            unique_suppliers[domain] = supplier
    
    # Sort by score (descending)
    return sorted(unique_suppliers.values(), key=lambda x: x.get("score", 0), reverse=True)

def save_supplier(supplier_data):
    """
    Save supplier information to the database
    
    Args:
        supplier_data (dict): Supplier information
        
    Returns:
        Supplier: The saved Supplier object
    """
    try:
        domain = supplier_data.get("domain", "")
        if not domain:
            return None
            
        # Check if supplier already exists
        existing_supplier = Supplier.query.filter_by(domain=domain).first()
        
        if existing_supplier:
            # Update reliability score if it's a shopping result
            if supplier_data.get("source") == "shopping":
                existing_supplier.reliability_score = min(1.0, existing_supplier.reliability_score + 0.1)
            
            db.session.commit()
            return existing_supplier
        else:
            # Create new supplier
            name = supplier_data.get("name", domain.replace("www.", ""))
            
            new_supplier = Supplier(
                name=name,
                domain=domain,
                website=f"https://{domain}",
                reliability_score=0.5 if supplier_data.get("source") == "shopping" else 0.3
            )
            
            db.session.add(new_supplier)
            db.session.commit()
            return new_supplier
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error saving supplier: {e}")
        return None
        
def search_suppliers(params):
    """
    Search for suppliers based on part description, make, and model
    
    Args:
        params (dict): Search parameters including part_description, make, model
        
    Returns:
        dict: Search results with suppliers information
    """
    logger.info(f"Searching suppliers for: {params}")
    
    part_description = params.get("part_description", "")
    make = params.get("make")
    model = params.get("model")
    
    # Construct search query
    query = part_description
    
    if make:
        query += f" {make}"
    if model:
        query += f" {model}"
    
    query += " buy purchase part"
    
    # Execute search with SerpAPI
    search_params = {
        "api_key": Config.SERPAPI_KEY,
        "engine": "google",
        "q": query,
        "num": 10,
        "gl": "us",
        "hl": "en"
    }
    
    # Perform web search
    search = GoogleSearch(search_params)
    results = search.get_dict()
    suppliers = []
    
    # Process organic search results
    if "organic_results" in results and results["organic_results"]:
        for result in results["organic_results"]:
            link = result.get("link", "")
            domain = urlparse(link).netloc
            
            supplier = {
                "name": result.get("title", "").split("-")[0].strip(),
                "url": link,
                "description": result.get("snippet", ""),
                "domain": domain
            }
            suppliers.append(supplier)
    
    # If we didn't get enough results, try shopping search
    if len(suppliers) < 5 and "shopping_results" in results and results["shopping_results"]:
        for result in results["shopping_results"]:
            supplier = {
                "name": result.get("source", ""),
                "title": result.get("title", ""),
                "url": result.get("link", ""),
                "description": result.get("title", ""),
                "domain": urlparse(result.get("link", "")).netloc,
                "price": result.get("price", "")
            }
            suppliers.append(supplier)
    
    # Save any new suppliers to the database - only if we're in a Flask application context
    try:
        from flask import current_app
        if current_app:
            for supplier_data in suppliers:
                if "domain" in supplier_data:
                    save_supplier(supplier_data)
    except (ImportError, RuntimeError):
        # Skip saving if not in Flask app context
        logger.info("Skipping database save - not in Flask app context")
    
    return {
        "query": query,
        "suppliers": suppliers[:10]  # Return top 10 suppliers
    }