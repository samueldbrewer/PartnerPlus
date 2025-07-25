import logging
import json
import requests
from urllib.parse import urlparse, parse_qs, unquote
from config import Config
from models import db, Supplier
from services.price_scraper import scrape_supplier_price

# Initialize OpenAI client for AI-based ranking
try:
    from openai import OpenAI
    client = OpenAI(api_key=Config.OPENAI_API_KEY)
    USING_NEW_OPENAI_CLIENT = True
except ImportError:
    import openai
    openai.api_key = Config.OPENAI_API_KEY
    USING_NEW_OPENAI_CLIENT = False

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def clean_supplier_url(url):
    """
    Clean and extract actual merchant URLs from tracking/redirect URLs
    
    Args:
        url (str): The URL to clean
        
    Returns:
        str: The cleaned URL
    """
    if not url:
        return url
        
    try:
        parsed = urlparse(url)
        
        # Handle Google Shopping redirect URLs
        if 'google.com' in parsed.netloc and ('/aclk' in parsed.path or '/url' in parsed.path):
            params = parse_qs(parsed.query)
            
            # Try different parameter names that Google uses
            for param in ['adurl', 'q', 'url', 'dest']:
                if param in params and params[param]:
                    actual_url = unquote(params[param][0])
                    # Sometimes the URL is double-encoded
                    if actual_url.startswith('http'):
                        return actual_url
                    
        # Handle other common redirect services
        elif any(domain in parsed.netloc for domain in ['redirect', 'track', 'click', 'redir']):
            params = parse_qs(parsed.query)
            
            # Common redirect parameter names
            for param in ['url', 'u', 'q', 'target', 'dest', 'destination', 'out']:
                if param in params and params[param]:
                    actual_url = unquote(params[param][0])
                    if actual_url.startswith('http'):
                        return actual_url
                        
        # If we couldn't extract a clean URL, return the original
        return url
        
    except Exception as e:
        logger.warning(f"Error cleaning URL {url}: {e}")
        return url

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
            
            response = requests.get(self.base_url, params=self.params, timeout=30)
            response.raise_for_status()
            return response.json()
        
        except requests.exceptions.Timeout:
            logger.error(f"SerpAPI request timed out after 30 seconds")
            return {"error": "timeout", "organic_results": []}
        except requests.exceptions.RequestException as e:
            logger.error(f"Error searching with SerpAPI: {e}")
            return {"error": str(e), "organic_results": []}

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
    
    # Construct search query - prioritize part number while including model for compatibility
    query_parts = []
    
    # Start with part number in quotes for exact matching
    query_parts.append(f'"{part_number}"')
    
    # Add "part" or "replacement" to filter out equipment
    query_parts.append("part")
    
    # Add make and model for compatibility verification
    if make:
        query_parts.append(make)
    if model:
        query_parts.append(model)
    
    if oem_only:
        query_parts.append("OEM")
    
    # Join the parts to create a part-focused search query
    # Example: "95349" part Henny Penny OFE-321
    query = " ".join(query_parts)
    
    print(f"DEBUG: Searching for suppliers with query: {query}")
    
    suppliers = []
    
    # First try general web search (prioritized)
    search_params = {
        "api_key": Config.SERPAPI_KEY,
        "engine": "google",
        "q": query,
        "num": 60,  # Get even more results since we're not using shopping results
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
                
            # Skip Google Shopping results in organic results
            if "google.com/shopping" in link:
                continue
                
            domain = urlparse(link).netloc
            
            # Check if it's an e-commerce site OR if the snippet suggests it's selling parts
            snippet = result.get("snippet", "")
            title = result.get("title", "")
            
            # Check if the result is selling parts based on content
            selling_indicators = ["price", "$", "buy", "shop", "order", "in stock", "add to cart", "purchase", "sale"]
            part_indicators = [part_number.lower(), "part", "replacement", "oem", "genuine", "component", "assembly"]
            
            # Equipment exclusion indicators - reject if these appear without "part"
            equipment_indicators = ["fryer", "oven", "machine", "unit", "equipment", "system", "appliance"]
            
            is_selling = any(ind in snippet.lower() or ind in title.lower() for ind in selling_indicators)
            has_part = any(ind in snippet.lower() or ind in title.lower() for ind in part_indicators)
            
            # Check if this is likely equipment listing
            combined_text = (title + " " + snippet).lower()
            is_equipment = any(eq in combined_text for eq in equipment_indicators) and "part" not in combined_text
            
            # Skip obvious equipment listings
            if is_equipment:
                continue
            
            if is_ecommerce_site(domain) or (is_selling and has_part):
                # Clean the URL to handle redirects
                cleaned_url = clean_supplier_url(link)
                cleaned_domain = urlparse(cleaned_url).netloc
                
                # Extract price from snippet if available (quick check)
                price = None
                import re
                price_match = re.search(r'\$[\d,]+\.?\d*', snippet)
                if price_match:
                    price = price_match.group(0)
                
                supplier = {
                    "name": cleaned_domain.replace("www.", ""),
                    "title": result.get("title", ""),
                    "url": cleaned_url,
                    "snippet": snippet,
                    "price": price,
                    "source": "organic",
                    "domain": cleaned_domain,
                    "in_stock": "out of stock" not in snippet.lower() and "unavailable" not in snippet.lower(),
                    "thumbnail": result.get("thumbnail", ""),
                    "price_scraped": False  # Track if we scraped the price
                }
                suppliers.append(supplier)
    
    # Skip shopping results entirely since they don't provide direct product pages
    # Organic results are much better for getting actual product URLs
    
    # Save any new suppliers to the database
    for supplier_data in suppliers:
        save_supplier(supplier_data)
    
    # Use AI to rank suppliers if we have any results
    if len(suppliers) >= 1:  # Use AI even with just 1 result
        ranked_suppliers = rank_suppliers_with_ai(suppliers, part_number, make, model)
    else:
        # Fall back to basic ranking for empty result sets
        ranked_suppliers = rank_suppliers(suppliers)
    
    # Scrape real prices for top suppliers that don't have prices
    logger.info(f"About to call price scraping for {len(ranked_suppliers)} suppliers")
    ranked_suppliers = scrape_prices_for_suppliers(ranked_suppliers)
    logger.info(f"Price scraping completed")
    
    logger.info(f"Returning {len(ranked_suppliers)} ranked suppliers")
    
    return ranked_suppliers

def is_ecommerce_site(domain):
    """
    Check if a domain is likely an e-commerce site
    
    Args:
        domain (str): Domain name to check
        
    Returns:
        bool: Whether the domain is likely an e-commerce site
    """
    # More comprehensive list of ecommerce indicators and common part suppliers
    ecommerce_indicators = [
        # Major marketplaces
        "amazon", "ebay", "walmart", "target", "etsy", "aliexpress", 
        # HVAC and Appliance Parts Suppliers
        "supplyhouse", "repairclinic", "partstown", "webstaurantstore",
        "ferguson", "hvacpartsshop", "tundra", "etundra", "reliableparts",
        "appliancepartspros", "searspartsdirect", "genuinereplacementparts",
        "marcone", "johnstone", "amresupply", "globalindustrial",
        "airconditionerrepairparts", "hvacplus", "alpinehomeair",
        # Restaurant Equipment Suppliers
        "pitco", "katom", "centralrestaurant", "ckitchen", "restaurantsupply",
        "thecompleatrestaurant", "heritage", "partsfe", "doughpro", "partsfps",
        # Kitchen equipment parts
        "kitchenall", "allpoints", "kerekes", "lionsdeal", "culinarydepot",
        # Auto parts stores
        "autozone", "rockauto", "partsgeek", "advanceautoparts", "oreillyauto", 
        "summitracing", "carid", "autopartswarehouse", "carparts", "jcwhitney",
        "napaonline", "pelicanparts", "fcpeuro", "ecstuning", "tirerack",
        # Electronics
        "newegg", "bestbuy", "microcenter", "bhphotovideo", "adorama",
        # General retailers
        "homedepot", "lowes", "acehardware", "truevalue", "grainger",
        "mcmaster", "northerntool", "harborfreight", "zoro", "uline",
        # Generic e-commerce indicators
        "shop", "parts", "buy", "store", "suppl", "ecommerce", "outlet",
        "retail", "marketplace", "mall", "sales", "direct", "oem", "warehouse"
    ]
    
    # Check for common domain extensions that suggest commerce
    commerce_domains = [".shop", ".store", ".market"]
    
    # First check the specific indicators
    is_ecomm = any(indicator in domain.lower() for indicator in ecommerce_indicators)
    
    # If not found, check for common commerce domain extensions
    if not is_ecomm:
        is_ecomm = any(domain.lower().endswith(ext) for ext in commerce_domains)
        
    return is_ecomm

def rank_suppliers_with_ai(suppliers, part_number, make=None, model=None):
    """
    Use AI to intelligently rank suppliers based on relevance and quality
    
    Args:
        suppliers (list): List of supplier dictionaries
        part_number (str): The part number being searched for
        make (str): Equipment make
        model (str): Equipment model
        
    Returns:
        list: AI-ranked list of top 5 suppliers
    """
    if not suppliers:
        return []
    
    logger.info(f"AI ranking {len(suppliers)} suppliers for part {part_number}")
    
    # Prepare supplier data for AI analysis
    supplier_entries = []
    for idx, supplier in enumerate(suppliers):
        entry = f"Supplier {idx + 1}:\n"
        entry += f"  Name: {supplier.get('name', 'Unknown')}\n"
        entry += f"  Domain: {supplier.get('domain', 'Unknown')}\n"
        entry += f"  URL: {supplier.get('url', 'No URL')}\n"
        entry += f"  Title: {supplier.get('title', 'No title')}\n"
        entry += f"  Description: {supplier.get('snippet', supplier.get('description', 'No description'))}\n"
        if supplier.get('price'):
            entry += f"  Price: {supplier['price']}\n"
        entry += f"  Source: {supplier.get('source', 'Unknown')}\n"
        entry += f"  In Stock: {supplier.get('in_stock', 'Unknown')}\n"
        supplier_entries.append(entry)
    
    suppliers_text = "\n".join(supplier_entries)
    
    # Create prompt for AI
    prompt = f"""
    Analyze these supplier search results for part number: {part_number}
    {f'Make: {make}' if make else ''}
    {f'Model: {model}' if model else ''}
    
    SUPPLIER RESULTS:
    {suppliers_text}
    
    CRITICAL REQUIREMENTS - EXCLUDE IMMEDIATELY:
    - ANY listing selling complete equipment/units (fryers, ovens, machines, etc.)
    - Prices over $1000 (these are likely full equipment, not parts)
    - Titles mentioning "fryer", "oven", "unit", "machine", "equipment" without "part"
    - URLs for equipment pages rather than specific part pages
    
    Your task is to select ONLY suppliers that are selling the PART {part_number}, NOT equipment:
    
    INCLUDE ONLY if:
    - Title/description specifically mentions part number {part_number}
    - Price is reasonable for a PART (under $500 typically)
    - Title contains words like "part", "replacement", "component", "assembly"
    - URL appears to be a specific part page, not equipment page
    - From reputable parts suppliers
    
    PRIORITIZE these major US suppliers (in order):
    1. partstown.com, webstaurantstore.com, restaurantsupply.com
    2. amazon.com, ebay.com
    3. grainger.com, mcmaster.com, globalindustrial.com
    4. Known parts suppliers (.com domains in US)
    5. Avoid international suppliers (.au, .ca, .co.uk) unless no US options
    
    REJECT IMMEDIATELY if:
    - Selling complete {make if make else 'equipment'} units/machines
    - Price suggests full equipment (over $1000)
    - Title mentions equipment names without "part"
    - Generic category pages or equipment listings
    
    BE EXTREMELY STRICT - Better to return NO suppliers than wrong suppliers selling equipment
    
    Return a JSON object with:
    - selected_suppliers: Array of supplier indices (1-based) in order of preference
    - reasons: Brief explanation for each selection
    - excluded_full_units: Array of indices that were excluded for selling full units
    - excluded_duplicates: Array of indices that were excluded as duplicates
    
    Example response:
    {{
        "selected_suppliers": [3, 7, 1, 15, 9],
        "reasons": {{
            "3": "Direct link to part HH18HA499 with $45 price",
            "7": "OEM parts supplier with exact part number in stock",
            "1": "Shows specific part listing, not full unit",
            "15": "Specialized parts supplier for this equipment",
            "9": "Part-specific listing with good availability"
        }},
        "excluded_full_units": [2, 5, 11],
        "excluded_duplicates": [4, 8]
    }}
    """
    
    try:
        # Send to AI for analysis
        if USING_NEW_OPENAI_CLIENT:
            ai_response = client.chat.completions.create(
                model="gpt-4.1-nano",
                messages=[
                    {"role": "system", "content": "You are an expert at evaluating e-commerce search results to find the best suppliers for specific parts. You understand duplicate listings, category pages vs product pages, and supplier reliability. Using GPT-4.1-Nano for comprehensive analysis."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            result = json.loads(ai_response.choices[0].message.content)
        else:
            import openai
            ai_response = openai.ChatCompletion.create(
                model="gpt-4.1-nano",
                messages=[
                    {"role": "system", "content": "You are an expert at evaluating e-commerce search results to find the best suppliers for specific parts. You understand duplicate listings, category pages vs product pages, and supplier reliability. Using GPT-4.1-Nano for comprehensive analysis."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            result = json.loads(ai_response.choices[0].message['content'])
        
        # Extract selected suppliers
        selected_indices = result.get("selected_suppliers", [])
        reasons = result.get("reasons", {})
        excluded_duplicates = result.get("excluded_duplicates", [])
        excluded_full_units = result.get("excluded_full_units", [])
        
        logger.info(f"AI selected suppliers: {selected_indices}")
        logger.info(f"Excluded duplicates: {excluded_duplicates}")
        logger.info(f"Excluded full units: {excluded_full_units}")
        
        # Log details of selected suppliers for debugging
        for idx in selected_indices[:5]:
            if 1 <= idx <= len(suppliers):
                supplier = suppliers[idx - 1]
                logger.info(f"Selected supplier {idx}: {supplier.get('name')} - {supplier.get('title')[:60]}... (${supplier.get('price', 'N/A')})")
        
        # Build final supplier list
        final_suppliers = []
        for idx in selected_indices:
            if 1 <= idx <= len(suppliers):
                supplier = suppliers[idx - 1].copy()  # Convert to 0-based index
                supplier["ai_ranking"] = len(final_suppliers) + 1
                supplier["ai_reason"] = reasons.get(str(idx), "Selected by AI")
                final_suppliers.append(supplier)
        
        # Return what we have (even if less than 5)
        if len(final_suppliers) == 0 and len(suppliers) > 0:
            logger.warning(f"AI selected no suppliers, falling back to basic ranking")
            return rank_suppliers(suppliers)
        
        return final_suppliers[:5]
        
    except Exception as e:
        logger.error(f"Error in AI supplier ranking: {e}")
        # Fall back to basic ranking
        return rank_suppliers(suppliers)

def rank_suppliers(suppliers):
    """
    Basic ranking based on domain preferences (fallback method)
    
    Args:
        suppliers (list): List of supplier dictionaries
        
    Returns:
        list: Ranked list of suppliers (up to 5 top suppliers)
    """
    # Preferred domains (known reputable suppliers)
    preferred_domains = [
        "partstown.com", "webstaurantstore.com", "partsfe.com",
        "amazon.com", "ebay.com", "grainger.com", "mcmaster.com",
        "rockauto.com", "summitracing.com", "autozone.com",
        "advanceautoparts.com", "oreillyauto.com", "partsgeek.com"
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
    
    return final_suppliers

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

def scrape_prices_for_suppliers(suppliers, max_to_scrape=3):
    """
    Scrape real prices for suppliers that don't have prices from snippets
    
    Args:
        suppliers (list): List of ranked supplier dictionaries
        max_to_scrape (int): Maximum number of suppliers to scrape prices for
        
    Returns:
        list: Suppliers with updated prices where available
    """
    if not suppliers:
        return suppliers
    
    logger.info(f"Starting price scraping for up to {max_to_scrape} suppliers")
    
    scraped_count = 0
    for supplier in suppliers:
        # Stop if we've scraped enough
        if scraped_count >= max_to_scrape:
            break
            
        # Skip if we already have a price or if we already scraped this one
        if supplier.get("price") or supplier.get("price_scraped"):
            continue
            
        url = supplier.get("url")
        if not url:
            continue
            
        try:
            logger.info(f"Scraping price for {supplier.get('name', 'unknown')} at {url}")
            scraped_price = scrape_supplier_price(url, timeout=8000)  # 8 second timeout
            
            if scraped_price:
                supplier["price"] = scraped_price
                supplier["price_scraped"] = True
                logger.info(f"Successfully scraped price {scraped_price} for {supplier.get('name')}")
            else:
                supplier["price_scraped"] = True  # Mark as attempted
                logger.warning(f"No price found for {supplier.get('name')} at {url}")
                
            scraped_count += 1
            
        except Exception as e:
            logger.error(f"Error scraping price for {supplier.get('name', 'unknown')}: {e}")
            supplier["price_scraped"] = True  # Mark as attempted to avoid retrying
            
    logger.info(f"Completed price scraping for {scraped_count} suppliers")
    return suppliers
        
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
    
    # Execute search with SerpAPI - prioritize general search
    search_params = {
        "api_key": Config.SERPAPI_KEY,
        "engine": "google",
        "q": query,
        "num": 25,  # Get plenty of results for AI to analyze
        "gl": "us",
        "hl": "en"
    }
    
    # Perform web search first
    search = GoogleSearch(search_params)
    results = search.get_dict()
    suppliers = []
    
    # Process organic search results
    if "organic_results" in results and results["organic_results"]:
        for result in results["organic_results"]:
            link = result.get("link", "")
            if not link:
                continue
                
            domain = urlparse(link).netloc
            
            if is_ecommerce_site(domain):
                supplier = {
                    "name": result.get("title", "").split("-")[0].strip(),
                    "url": link,
                    "description": result.get("snippet", ""),
                    "domain": domain,
                    "title": result.get("title", ""),
                    "source": "organic",
                    "in_stock": True  # Assume in stock for organic results
                }
                suppliers.append(supplier)
    
    # If we didn't get enough results, try shopping search
    if len(suppliers) < 5:
        search_params["tbm"] = "shop"
        shopping_search = GoogleSearch(search_params)
        shopping_results = shopping_search.get_dict()
        
        if "shopping_results" in shopping_results and shopping_results["shopping_results"]:
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
                
                if url:
                    supplier = {
                        "name": result.get("source", ""),
                        "title": result.get("title", ""),
                        "url": url,
                        "description": result.get("title", ""),
                        "domain": urlparse(url).netloc,
                        "price": result.get("price", ""),
                        "source": "shopping",
                        "in_stock": "sold out" not in result.get("title", "").lower(),
                        "thumbnail": result.get("thumbnail", "")
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