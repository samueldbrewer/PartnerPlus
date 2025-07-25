import logging
import json
import requests
from urllib.parse import urlparse
from config import Config

# Initialize OpenAI client
try:
    from openai import OpenAI
    client = OpenAI(api_key=Config.OPENAI_API_KEY)
    USING_NEW_OPENAI_CLIENT = True
except ImportError:
    import openai
    openai.api_key = Config.OPENAI_API_KEY
    USING_NEW_OPENAI_CLIENT = False

logger = logging.getLogger(__name__)

def search_suppliers_v2(part_number, make=None, model=None, oem_only=False):
    """
    Clean supplier search starting with raw SERP results
    
    Args:
        part_number (str): The part number to search for
        make (str): Equipment make
        model (str): Equipment model  
        oem_only (bool): Whether to search for OEM only
        
    Returns:
        dict: Search results with suppliers and analysis
    """
    logger.info(f"Searching suppliers for part {part_number} (Make: {make}, Model: {model})")
    
    # Step 1: Build search query
    query_parts = [f'"{part_number}"', "part"]
    if make:
        query_parts.append(make)
    if model:
        query_parts.append(model)
    if oem_only:
        query_parts.append("OEM")
    
    query = " ".join(query_parts)
    logger.info(f"Search query: {query}")
    
    # Step 2: Get raw SERP results
    raw_results = get_serp_results(query)
    logger.info(f"Raw SERP results: {len(raw_results)} total")
    
    # Step 3: Basic filtering
    filtered_results = filter_raw_results(raw_results, part_number)
    logger.info(f"After basic filtering: {len(filtered_results)} results")
    
    # Step 4: Log filtered results for review
    log_filtered_results(filtered_results)
    
    # Step 5: AI ranking (simple for now)
    ranked_results = rank_with_ai(filtered_results, part_number, make, model)
    logger.info(f"AI ranked results: {len(ranked_results)} selected")
    
    return {
        "query": query,
        "raw_count": len(raw_results),
        "filtered_count": len(filtered_results), 
        "final_count": len(ranked_results),
        "suppliers": ranked_results
    }

def get_serp_results(query):
    """Get raw search results from SerpAPI"""
    try:
        params = {
            "api_key": Config.SERPAPI_KEY,
            "engine": "google",
            "q": query,
            "num": 30,
            "gl": "us",
            "hl": "en"
        }
        
        response = requests.get("https://serpapi.com/search", params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        return data.get("organic_results", [])
        
    except Exception as e:
        logger.error(f"SERP API error: {e}")
        return []

def filter_raw_results(results, part_number):
    """Enhanced filtering to remove PDFs and improve supplier quality"""
    filtered = []
    
    for result in results:
        title = result.get("title", "")
        snippet = result.get("snippet", "")
        link = result.get("link", "")
        
        if not link:
            continue
            
        # Skip PDFs - these are manuals, not suppliers
        if link.lower().endswith('.pdf') or '.pdf' in link.lower():
            continue
            
        # Skip obvious non-commercial sites
        parsed = urlparse(link)
        domain = parsed.netloc.lower()
        
        # Skip forums, wikis, docs, social media, help systems
        skip_domains = ["forum", "wiki", "reddit", "facebook", "youtube", "linkedin", "wikipedia", "help"]
        if any(skip in domain for skip in skip_domains):
            continue
            
        # Skip international suppliers (prefer US) - including PartsTown international variants
        international_tlds = ['.au', '.ca', '.co.uk', '.de', '.fr', '.mx']
        if any(tld in domain for tld in international_tlds):
            continue
            
        # Specifically exclude partstown.ca and partstown.mx
        if 'partstown.ca' in domain or 'partstown.mx' in domain:
            logger.info(f"Excluding international PartsTown variant: {domain}")
            continue
            
        # Basic relevance check
        combined_text = (title + " " + snippet).lower()
        has_part_number = part_number.lower() in combined_text
        
        # Commercial indicators
        commercial_indicators = ["price", "$", "buy", "shop", "order", "cart", "purchase", "add to cart"]
        has_commercial = any(ind in combined_text for ind in commercial_indicators)
        
        # Part indicators  
        part_indicators = ["part", "replacement", "oem", "genuine", "component", "assembly"]
        has_part_context = any(ind in combined_text for ind in part_indicators)
        
        # Product page indicators (boost these)
        product_page_indicators = ["/product/", "/products/", "/parts/", "/p/", "/item/", "/dp/", 
                                 part_number.lower()]  # URLs containing the part number
        is_product_page = any(ind in link.lower() for ind in product_page_indicators)
        
        # Include if relevant
        if has_part_number or (has_commercial and has_part_context):
            filtered.append({
                "title": title,
                "snippet": snippet,
                "url": link,
                "domain": domain,
                "has_part_number": has_part_number,
                "has_commercial": has_commercial,
                "has_part_context": has_part_context,
                "is_product_page": is_product_page
            })
    
    return filtered

def log_filtered_results(results):
    """Log filtered results for manual review"""
    logger.info("=== FILTERED RESULTS FOR REVIEW ===")
    for i, result in enumerate(results[:10], 1):
        logger.info(f"{i}. {result['domain']}")
        logger.info(f"   Title: {result['title'][:80]}...")
        logger.info(f"   URL: {result['url']}")
        logger.info(f"   Part#: {result['has_part_number']}, Commercial: {result['has_commercial']}, Part Context: {result['has_part_context']}, Product Page: {result['is_product_page']}")
        logger.info("")

def rank_with_ai(results, part_number, make, model):
    """Use AI to rank and deduplicate supplier results with PartsTown priority"""
    if not results:
        return []
    
    logger.info(f"Starting AI ranking for {len(results)} results")
    
    # Prepare results for AI analysis
    results_for_ai = []
    for i, result in enumerate(results):
        results_for_ai.append({
            "index": i,
            "domain": result['domain'],
            "title": result['title'],
            "snippet": result['snippet'][:200],  # Truncate for token efficiency
            "url": result['url'],
            "has_part_number": result['has_part_number'],
            "is_product_page": result['is_product_page'],
            "has_commercial": result['has_commercial'],
            "has_part_context": result['has_part_context']
        })
    
    # Create AI prompt for ranking and deduplication
    prompt = f"""
You are an expert at ranking e-commerce supplier search results for industrial parts.

TASK: Rank and deduplicate the following supplier search results for part number "{part_number}" ({make} {model}).

RANKING CRITERIA (in order of priority):
1. **PartsTown.com PRIORITY**: If partstown.com appears, it MUST be ranked #1
2. **PRODUCT DETAIL PAGES ONLY**: Strongly prefer direct product pages over category/listing pages
   - PREFER: URLs with /product/, /item/, /dp/, /p/, or part number in URL
   - AVOID: URLs with /search, /category, /browse, /parts-list, /parts (without specific part)
   - PREFER: Titles mentioning the exact part number or specific product name
   - AVOID: Generic titles like "Parts for [brand]" or "[brand] Parts Catalog"
3. **Deduplication**: Only include ONE result per domain (keep the best product page)
4. **Part number relevance**: Results mentioning the exact part number in title/snippet
5. **Major suppliers**: webstaurantstore.com, amazon.com, ebay.com, grainger.com, mcmaster.com
6. **Commercial indicators**: Price, buy, shop, order mentions

STRICT RULES:
- NEVER include more than one result from the same domain
- PartsTown.com (if present) must be ranked #1, but only if it's a product page
- Exclude any .ca, .mx, or international domains (already filtered)
- Return exactly 5 results maximum
- Choose the BEST PRODUCT PAGE from each domain (not category pages)
- If no product page exists for a domain, exclude that domain entirely

SEARCH RESULTS:
{json.dumps(results_for_ai, indent=2)}

Return ONLY a JSON array of the selected result indices in ranked order (best first):
[index1, index2, index3, index4, index5]
"""

    try:
        if USING_NEW_OPENAI_CLIENT:
            response = client.chat.completions.create(
                model="gpt-4",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=100
            )
            ai_response = response.choices[0].message.content.strip()
        else:
            response = openai.ChatCompletion.create(
                model="gpt-4",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=100
            )
            ai_response = response.choices[0].message.content.strip()
        
        logger.info(f"AI response: {ai_response}")
        
        # Parse AI response
        try:
            selected_indices = json.loads(ai_response)
            if not isinstance(selected_indices, list):
                raise ValueError("AI response is not a list")
        except Exception as e:
            logger.error(f"Failed to parse AI response: {e}, falling back to simple ranking")
            # Fallback: simple ranking by domain priority
            selected_indices = []
            seen_domains = set()
            
            # First, add PartsTown if present
            for i, result in enumerate(results):
                if 'partstown.com' in result['domain'] and result['domain'] not in seen_domains:
                    selected_indices.append(i)
                    seen_domains.add(result['domain'])
                    break
            
            # Then add others
            for i, result in enumerate(results):
                if len(selected_indices) >= 5:
                    break
                if result['domain'] not in seen_domains:
                    selected_indices.append(i)
                    seen_domains.add(result['domain'])
        
        # Build final results using AI-selected indices
        final_results = []
        for idx in selected_indices[:5]:  # Ensure max 5 results
            if 0 <= idx < len(results):
                result = results[idx].copy()
                result['score'] = len(selected_indices) - len(final_results)
                result['ai_ranking'] = True
                final_results.append(result)
        
        logger.info(f"AI ranked results: {len(final_results)} selected from {len(results)} candidates")
        
        # Log final ranking for verification
        for i, result in enumerate(final_results):
            logger.info(f"  #{i+1}: {result['domain']} - {result['title'][:50]}...")
        
        return final_results
        
    except Exception as e:
        logger.error(f"AI ranking failed: {e}, using fallback ranking")
        # Simple fallback if AI fails
        seen_domains = set()
        fallback_results = []
        
        # Prioritize PartsTown first
        for result in results:
            if 'partstown.com' in result['domain'] and result['domain'] not in seen_domains:
                result['score'] = 100
                result['ai_ranking'] = False
                fallback_results.append(result)
                seen_domains.add(result['domain'])
                break
        
        # Add others
        for result in results:
            if len(fallback_results) >= 5:
                break
            if result['domain'] not in seen_domains:
                result['score'] = 50 - len(fallback_results)
                result['ai_ranking'] = False
                fallback_results.append(result)
                seen_domains.add(result['domain'])
        
        return fallback_results[:5]