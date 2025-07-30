import json
import logging
import requests
import time
from config import Config

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize OpenAI client - handle both new and old API versions
try:
    # Try to import using new OpenAI Python client (v1.0.0+)
    from openai import OpenAI
    client = OpenAI(api_key=Config.OPENAI_API_KEY)
    USING_NEW_OPENAI_CLIENT = True
    logger.info("Using new OpenAI client (v1.0.0+)")
except ImportError:
    # Fall back to old OpenAI client
    import openai
    openai.api_key = Config.OPENAI_API_KEY
    USING_NEW_OPENAI_CLIENT = False
    logger.info("Using legacy OpenAI client")

def get_serpapi_supplier_results(part_number, part_description=None, location=None, bypass_cache=False):
    """
    Step 1: Get first 10 SerpAPI search results for parts suppliers
    
    Args:
        part_number (str): Part number to search for
        part_description (str, optional): Description of the part
        location (str, optional): Geographic location preference
        bypass_cache (bool): Whether to bypass cache
        
    Returns:
        dict: Contains supplier search results and metadata
    """
    logger.info(f"Getting SerpAPI supplier results for: {part_number} - {part_description}")
    
    try:
        # Construct search query for suppliers
        search_query = f"{part_number}"
        if part_description:
            search_query += f" {part_description}"
        search_query += " supplier distributor buy purchase"
        if location:
            search_query += f" {location}"
        
        # Search parameters for SerpAPI
        search_params = {
            "api_key": Config.SERPAPI_KEY,
            "engine": "google",
            "q": search_query,
            "num": 10,  # First 10 results as requested
            "gl": "us",
            "hl": "en"
        }
        
        # Add cache-busting if needed
        if bypass_cache:
            search_params["no_cache"] = "true"
            search_params["t"] = str(int(time.time()))
            logger.info(f"Bypassing SerpAPI cache")
        
        # Make the request
        api_response = requests.get("https://serpapi.com/search", params=search_params, timeout=30)
        api_response.raise_for_status()
        results = api_response.json()
        
        # Extract the first 10 organic results
        supplier_results = []
        if "organic_results" in results:
            for idx, result in enumerate(results.get("organic_results", [])[:10]):
                # Analyze if this looks like a supplier/distributor
                title_lower = result.get('title', '').lower()
                snippet_lower = result.get('snippet', '').lower()
                url_lower = result.get('link', '').lower()
                
                is_supplier = any(keyword in title_lower + snippet_lower + url_lower for keyword in [
                    'distributor', 'supplier', 'parts', 'buy', 'purchase', 'inventory', 'stock', 'catalog'
                ])
                
                supplier_results.append({
                    "position": idx + 1,
                    "title": result.get('title', 'Unknown'),
                    "url": result.get('link', 'No URL'),
                    "snippet": result.get('snippet', 'No description'),
                    "displayed_link": result.get('displayed_link', ''),
                    "is_likely_supplier": is_supplier,
                    "part_number": part_number
                })
        
        logger.info(f"SerpAPI returned {len(supplier_results)} supplier results")
        
        return {
            "success": True,
            "query": search_query,
            "results": supplier_results,
            "total_results": len(supplier_results),
            "part_number": part_number
        }
        
    except requests.exceptions.Timeout:
        logger.error("SerpAPI supplier search request timed out")
        return {
            "success": False,
            "error": "SerpAPI timeout",
            "query": search_query if 'search_query' in locals() else "",
            "results": []
        }
    except Exception as e:
        logger.error(f"Error with SerpAPI supplier search: {e}")
        return {
            "success": False,
            "error": str(e),
            "query": search_query if 'search_query' in locals() else "",
            "results": []
        }

def get_gpt_supplier_web_search_result(part_number, part_description=None, location=None):
    """
    Step 2: Use GPT-4o with web search to find parts suppliers
    
    Args:
        part_number (str): Part number to search for
        part_description (str, optional): Description of the part
        location (str, optional): Geographic location preference
        
    Returns:
        dict: GPT's analysis with web search capabilities for suppliers
    """
    logger.info(f"Getting GPT supplier web search result for: {part_number} - {part_description}")
    
    try:
        # Construct the prompt for GPT with web search
        search_context = f"Find suppliers for part number {part_number}"
        if part_description:
            search_context += f" ({part_description})"
        
        prompt = f"""
        I need to find reliable suppliers and distributors for this part:
        
        Part Number: {part_number}
        Part Description: {part_description or "Not specified"}
        Preferred Location: {location or "No preference"}
        
        Please search the web to find:
        1. Authorized distributors and suppliers who stock this part
        2. Manufacturer's official distribution network
        3. Industrial suppliers with verified inventory
        4. Pricing information and availability
        5. Contact information for purchasing
        6. Lead times and shipping information
        
        CRITICAL REQUIREMENTS:
        - Find AUTHORIZED distributors and legitimate suppliers
        - Prioritize suppliers with current stock/availability
        - Include both OEM authorized and aftermarket suppliers
        - Verify supplier credibility and business legitimacy
        - Look for suppliers with good customer reviews/ratings
        - Include pricing information where available
        
        Return your findings in JSON format with:
        - supplier_name: Name of the primary supplier found
        - supplier_url: URL to the supplier's website or product page
        - contact_info: Phone, email, or contact form information
        - part_availability: Current stock status if available
        - pricing_info: Price range or specific pricing if found
        - is_authorized: Whether this is an authorized distributor
        - supplier_type: Type of supplier (OEM, distributor, aftermarket, etc.)
        - location: Supplier's location or service area
        - confidence: Your confidence level (0.0-1.0)
        - sources: Array of sources where you found this information
        - search_method: "gpt_supplier_web_search"
        """
        
        # Use GPT with web search using the Responses API (newer approach)
        if USING_NEW_OPENAI_CLIENT:
            try:
                # Try the new Responses API first
                response = client.responses.create(
                    model="gpt-4o",
                    input=f"Find suppliers for part: {prompt}. Return your findings in JSON format with: supplier_name, supplier_url, contact_info, part_availability, pricing_info, is_authorized (boolean), supplier_type, location, confidence (0.0-1.0), sources (array), search_method.",
                    tools=[{"type": "web_search"}]
                )
                # Extract the content from the Responses API format - check different possible structures
                if hasattr(response, 'choices') and response.choices:
                    raw_content = response.choices[0].message.content
                elif hasattr(response, 'output'):
                    raw_content = response.output
                elif hasattr(response, 'content'):
                    raw_content = response.content
                else:
                    # Log the response structure for debugging
                    logger.info(f"Responses API structure: {type(response)} - {dir(response)}")
                    raw_content = str(response)
            except Exception as e:
                logger.warning(f"Responses API failed, trying Chat Completions without web search: {e}")
                # Fallback to regular Chat Completions without web search
                response = client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {"role": "system", "content": "You are a procurement specialist who finds reliable suppliers and distributors for industrial parts. Use your knowledge to provide the most accurate information about suppliers and their capabilities."},
                        {"role": "user", "content": prompt}
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.1
                )
                raw_content = response.choices[0].message.content
        else:
            # For legacy client, fallback to regular GPT (web search may not be available)
            import openai
            response = openai.ChatCompletion.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are a procurement specialist who finds reliable suppliers and distributors for industrial parts. Use your knowledge to provide the most accurate information about suppliers and their capabilities."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            raw_content = response.choices[0].message['content']
        
        # Parse the result - handle different response formats
        try:
            if isinstance(raw_content, str):
                gpt_result = json.loads(raw_content)
            elif isinstance(raw_content, list):
                # If we get a list (from Responses API), extract the text content
                logger.info("Processing Responses API list format...")
                extracted_content = ""
                sources = []
                
                for item in raw_content:
                    if hasattr(item, 'type') and item.type == 'message' and hasattr(item, 'content'):
                        for content_item in item.content:
                            if hasattr(content_item, 'type') and content_item.type == 'output_text':
                                extracted_content += content_item.text
                                # Extract sources from annotations
                                if hasattr(content_item, 'annotations'):
                                    for annotation in content_item.annotations:
                                        if hasattr(annotation, 'url') and annotation.url not in sources:
                                            sources.append(annotation.url)
                
                # Use the extracted content to find supplier information
                if extracted_content:
                    # Look for URLs and supplier names in the text
                    import re
                    urls = re.findall(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', extracted_content)
                    
                    # Extract potential supplier names (capitalized words before common supplier terms)
                    supplier_patterns = re.findall(r'([A-Z][a-zA-Z\s&]+)(?:\s+(?:Inc|Corp|LLC|Company|Industries|Supply|Parts|Distributor))', extracted_content)
                    supplier_name = supplier_patterns[0] if supplier_patterns else "Unknown Supplier"
                    
                    gpt_result = {
                        "supplier_name": supplier_name,
                        "supplier_url": urls[0] if urls else None,
                        "contact_info": "Contact information in search results",
                        "part_availability": "Check with supplier",
                        "pricing_info": "Contact for pricing",
                        "is_authorized": True,  # Assume authorized unless specified otherwise
                        "supplier_type": "Distributor",
                        "location": location or "Various locations",
                        "confidence": 0.7 if urls else 0.4,
                        "sources": sources,
                        "search_method": "gpt_supplier_web_search_responses_api"
                    }
                else:
                    gpt_result = {"raw_response": raw_content}
                
                logger.info(f"Extracted from supplier web search: supplier={gpt_result.get('supplier_name')}, sources={len(sources)}")
            elif isinstance(raw_content, dict):
                gpt_result = raw_content
            else:
                gpt_result = {"raw_response": str(raw_content)}
            
            gpt_result["search_method"] = "gpt_supplier_web_search"
            
        except (json.JSONDecodeError, TypeError) as e:
            logger.error(f"Failed to parse GPT supplier web search result: {e}")
            gpt_result = {
                "supplier_name": "Unknown Supplier",
                "supplier_url": None,
                "contact_info": "Contact information not available",
                "part_availability": "Unknown",
                "pricing_info": "Contact for pricing",
                "is_authorized": False,
                "supplier_type": "Unknown",
                "location": location or "Unknown",
                "confidence": 0,
                "error": f"Failed to parse result: {str(e)}",
                "search_method": "gpt_supplier_web_search",
                "sources": []
            }
        
        logger.info(f"GPT supplier web search found: {gpt_result.get('supplier_name', 'No supplier')} (confidence: {gpt_result.get('confidence', 0)})")
        
        return {
            "success": True,
            "result": gpt_result
        }
        
    except Exception as e:
        logger.error(f"Error with GPT supplier web search: {e}")
        return {
            "success": False,
            "error": str(e),
            "result": {
                "supplier_name": "Unknown Supplier",
                "supplier_url": None,
                "contact_info": "Contact information not available",
                "part_availability": "Unknown",
                "pricing_info": "Contact for pricing",
                "is_authorized": False,
                "supplier_type": "Unknown",
                "location": location or "Unknown",
                "confidence": 0,
                "sources": [],
                "search_method": "gpt_supplier_web_search",
                "error": str(e)
            }
        }

def ai_supplier_arbitrator(serpapi_results, gpt_results, part_number, part_description=None, location=None):
    """
    Step 3: AI arbitrator without web search picks the best supplier from both results
    
    Args:
        serpapi_results (dict): Results from SerpAPI supplier search
        gpt_results (dict): Results from GPT supplier web search
        part_number (str): Part number being searched
        part_description (str, optional): Description of the part
        location (str, optional): Geographic location preference
        
    Returns:
        dict: Best supplier result selected by AI arbitrator
    """
    logger.info(f"AI supplier arbitrator analyzing results for: {part_number} - {part_description}")
    
    try:
        # Prepare the analysis prompt
        serpapi_summary = "SerpAPI Supplier Results (First 10 search results):\n"
        if serpapi_results.get("success") and serpapi_results.get("results"):
            for result in serpapi_results["results"]:
                serpapi_summary += f"- {result['title']}\n  URL: {result['url']}\n  Description: {result['snippet']}\n  Likely Supplier: {result.get('is_likely_supplier', False)}\n\n"
        else:
            serpapi_summary += "No SerpAPI supplier results available\n"
        
        gpt_summary = "GPT Supplier Web Search Results:\n"
        if gpt_results.get("success") and gpt_results.get("result"):
            gpt_result = gpt_results["result"]
            gpt_summary += f"Supplier Name: {gpt_result.get('supplier_name', 'None')}\n"
            gpt_summary += f"Supplier URL: {gpt_result.get('supplier_url', 'None')}\n"
            gpt_summary += f"Contact Info: {gpt_result.get('contact_info', 'None')}\n"
            gpt_summary += f"Part Availability: {gpt_result.get('part_availability', 'Unknown')}\n"
            gpt_summary += f"Pricing Info: {gpt_result.get('pricing_info', 'Unknown')}\n"
            gpt_summary += f"Is Authorized: {gpt_result.get('is_authorized', False)}\n"
            gpt_summary += f"Supplier Type: {gpt_result.get('supplier_type', 'Unknown')}\n"
            gpt_summary += f"Location: {gpt_result.get('location', 'Unknown')}\n"
            gpt_summary += f"Confidence: {gpt_result.get('confidence', 0)}\n"
            gpt_summary += f"Sources: {', '.join(gpt_result.get('sources', []))}\n"
        else:
            gpt_summary += "No GPT supplier web search results available\n"
        
        arbitrator_prompt = f"""
        You are an AI arbitrator analyzing two different search approaches for finding parts suppliers.
        
        ORIGINAL REQUEST:
        Part Number: {part_number}
        Part Description: {part_description or "Not specified"}
        Location Preference: {location or "No preference"}
        
        SEARCH RESULTS TO ANALYZE:
        
        {serpapi_summary}
        
        {gpt_summary}
        
        TASK:
        Analyze both sets of supplier search results and determine the best supplier for purchasing the requested part.
        Consider:
        1. Supplier credibility and business legitimacy
        2. Authorized distributor status vs aftermarket suppliers
        3. Part availability and current stock
        4. Geographic proximity and shipping capabilities
        5. Contact information accessibility
        6. Pricing transparency and competitiveness
        7. Supplier specialization in the relevant industry/part type
        
        CRITICAL: The selected supplier MUST be reliable and legitimate for purchasing {part_number}.
        
        Return a JSON object with your decision:
        - selected_source: "serpapi" or "gpt_supplier_web_search" or "none" (if neither is suitable)
        - supplier_name: Name of the best supplier found
        - supplier_url: URL to the supplier's website or product page
        - contact_info: Contact information for purchasing
        - part_availability: Part availability status
        - pricing_info: Pricing information if available
        - is_authorized: Whether this is an authorized distributor
        - supplier_type: Type of supplier
        - location: Supplier location or service area
        - confidence: Your confidence in this selection (0.0-1.0)
        - reasoning: Explanation of why you selected this result
        - sources: Sources supporting your selection
        - arbitrator_analysis: Your detailed analysis of both search results
        """
        
        # Get arbitrator decision (WITHOUT web search)
        if USING_NEW_OPENAI_CLIENT:
            response = client.chat.completions.create(
                model="gpt-4o-mini",  # Use nano for arbitration, no web search needed
                messages=[
                    {"role": "system", "content": "You are an expert AI arbitrator who analyzes different supplier search results to select the most reliable and appropriate supplier for parts procurement. You do not have web search capabilities - you analyze only the provided search results to make your decision."},
                    {"role": "user", "content": arbitrator_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            raw_content = response.choices[0].message.content
        else:
            import openai
            response = openai.ChatCompletion.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are an expert AI arbitrator who analyzes different supplier search results to select the most reliable and appropriate supplier for parts procurement. You do not have web search capabilities - you analyze only the provided search results to make your decision."},
                    {"role": "user", "content": arbitrator_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            raw_content = response.choices[0].message['content']
        
        # Parse arbitrator decision
        arbitrator_decision = json.loads(raw_content)
        
        logger.info(f"AI Supplier Arbitrator selected: {arbitrator_decision.get('selected_source')} - Supplier: {arbitrator_decision.get('supplier_name')} (confidence: {arbitrator_decision.get('confidence', 0)})")
        logger.info(f"Supplier Arbitrator reasoning: {arbitrator_decision.get('reasoning', 'No reasoning provided')}")
        
        return {
            "success": True,
            "arbitrator_decision": arbitrator_decision,
            "serpapi_data": serpapi_results,
            "gpt_data": gpt_results
        }
        
    except Exception as e:
        logger.error(f"Error in AI supplier arbitrator: {e}")
        return {
            "success": False,
            "error": str(e),
            "arbitrator_decision": {
                "selected_source": "none",
                "supplier_name": "Unknown Supplier",
                "supplier_url": None,
                "contact_info": "Contact information not available",
                "part_availability": "Unknown",
                "pricing_info": "Contact for pricing",
                "is_authorized": False,
                "supplier_type": "Unknown",
                "location": location or "Unknown",
                "confidence": 0,
                "reasoning": f"Supplier arbitrator failed: {str(e)}",
                "sources": [],
                "arbitrator_analysis": f"Error during analysis: {str(e)}"
            },
            "serpapi_data": serpapi_results,
            "gpt_data": gpt_results
        }

def find_supplier_with_dual_search(part_number, part_description=None, location=None, bypass_cache=False):
    """
    Main function implementing the dual search approach for parts suppliers:
    1. Get first 10 SerpAPI search results for suppliers directly
    2. Use GPT-4o with web search preview to find reliable suppliers  
    3. Send both results to AI arbitrator without web search to pick the best supplier
    
    Args:
        part_number (str): Part number to search for
        part_description (str, optional): Description of the part
        location (str, optional): Geographic location preference
        bypass_cache (bool): Whether to bypass cache
        
    Returns:
        dict: Final supplier result selected by AI arbitrator
    """
    logger.info(f"Starting dual supplier search for: {part_number} - {part_description}")
    
    try:
        # Step 1: Get SerpAPI supplier results
        logger.info("Step 1: Getting SerpAPI supplier results...")
        serpapi_results = get_serpapi_supplier_results(part_number, part_description, location, bypass_cache)
        
        # Step 2: Get GPT supplier web search results  
        logger.info("Step 2: Getting GPT supplier web search results...")
        gpt_results = get_gpt_supplier_web_search_result(part_number, part_description, location)
        
        # Step 3: AI arbitrator selects best supplier result
        logger.info("Step 3: AI supplier arbitrator analyzing results...")
        final_result = ai_supplier_arbitrator(serpapi_results, gpt_results, part_number, part_description, location)
        
        if final_result.get("success"):
            decision = final_result["arbitrator_decision"]
            
            # Format the result in the expected format for compatibility
            formatted_result = {
                "supplier_name": decision.get("supplier_name"),
                "supplier_url": decision.get("supplier_url"),
                "contact_info": decision.get("contact_info"),
                "part_availability": decision.get("part_availability"),
                "pricing_info": decision.get("pricing_info"),
                "is_authorized": decision.get("is_authorized", False),
                "supplier_type": decision.get("supplier_type", "Unknown"),
                "location": decision.get("location"),
                "confidence": decision.get("confidence", 0),
                "sources": decision.get("sources", []),
                "source": "dual_supplier_search",
                "selected_method": decision.get("selected_source"),
                "arbitrator_reasoning": decision.get("reasoning"),
                "arbitrator_analysis": decision.get("arbitrator_analysis"),
                "serpapi_count": len(serpapi_results.get("results", [])),
                "gpt_web_success": gpt_results.get("success", False),
                "part_number": part_number
            }
            
            logger.info(f"Dual supplier search completed. Selected: {formatted_result.get('supplier_name')} via {formatted_result.get('selected_method')}")
            return formatted_result
        else:
            logger.error("Dual supplier search failed in arbitrator")
            return {
                "supplier_name": "Unknown Supplier",
                "supplier_url": None,
                "contact_info": "Contact information not available",
                "part_availability": "Unknown",
                "pricing_info": "Contact for pricing",
                "is_authorized": False,
                "supplier_type": "Unknown",
                "location": location or "Unknown",
                "confidence": 0,
                "error": final_result.get("error", "Supplier arbitrator failed"),
                "source": "dual_supplier_search",
                "sources": [],
                "part_number": part_number
            }
            
    except Exception as e:
        logger.error(f"Error in dual supplier search: {e}")
        return {
            "supplier_name": "Unknown Supplier",
            "supplier_url": None,
            "contact_info": "Contact information not available",
            "part_availability": "Unknown",
            "pricing_info": "Contact for pricing",
            "is_authorized": False,
            "supplier_type": "Unknown",
            "location": location or "Unknown",
            "confidence": 0,
            "error": str(e),
            "source": "dual_supplier_search",
            "sources": [],
            "part_number": part_number
        }