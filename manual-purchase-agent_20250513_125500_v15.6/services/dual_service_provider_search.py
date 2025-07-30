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

def get_industry_search_terms(equipment_make, equipment_model):
    """
    Dynamically determine industry-specific search terms using AI analysis
    
    Args:
        equipment_make (str): Equipment make/brand
        equipment_model (str): Equipment model
    
    Returns:
        dict: Contains industry type and relevant search terms
    """
    logger.info(f"AI analyzing industry for: {equipment_make} {equipment_model}")
    
    try:
        # AI prompt to determine industry and search terms
        industry_prompt = f"""
        Analyze this equipment and determine its industry classification and optimal search terms for finding service providers.
        
        Equipment: {equipment_make} {equipment_model}
        
        Based on the make and model, determine:
        1. What industry/sector this equipment belongs to
        2. What type of equipment it is specifically
        3. What keywords would find the most service providers
        4. What related equipment terms would expand search results
        
        Consider these major equipment industries:
        - Heavy Equipment/Construction (excavators, bulldozers, cranes, etc.)
        - Agricultural Equipment (tractors, combines, planters, etc.) 
        - Food Service Equipment (fryers, ovens, dishwashers, etc.)
        - HVAC Equipment (air conditioners, heating units, chillers, etc.)
        - Industrial Equipment (compressors, generators, pumps, etc.)
        - Marine Equipment (outboard motors, boat engines, etc.)
        - Medical Equipment (diagnostic, surgical, imaging, etc.)
        - Manufacturing Equipment (CNC, lathes, presses, etc.)
        - Material Handling (forklifts, conveyors, lifts, etc.)
        - Power Generation (generators, turbines, solar, etc.)
        - And any other relevant industries
        
        Return a JSON object with:
        {{
            "industry_type": "primary industry category",
            "equipment_category": "specific equipment type", 
            "search_terms": "optimized keywords for finding service providers",
            "related_equipment": ["list", "of", "related", "equipment", "terms"],
            "service_specializations": ["types", "of", "services", "commonly", "needed"],
            "confidence": 0.0-1.0
        }}
        
        CRITICAL: Focus on terms that service providers would use to describe their expertise, not just the equipment brand/model.
        """
        
        # Get AI analysis of equipment industry
        if USING_NEW_OPENAI_CLIENT:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are an expert equipment industry analyst who categorizes equipment into service industries and generates optimal search terms for finding qualified service providers."},
                    {"role": "user", "content": industry_prompt}
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
                    {"role": "system", "content": "You are an expert equipment industry analyst who categorizes equipment into service industries and generates optimal search terms for finding qualified service providers."},
                    {"role": "user", "content": industry_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            raw_content = response.choices[0].message['content']
        
        # Parse AI response
        ai_analysis = json.loads(raw_content)
        
        # Construct comprehensive search terms
        search_terms = ai_analysis.get('search_terms', f'{equipment_make} equipment')
        related_terms = ' '.join(ai_analysis.get('related_equipment', []))
        if related_terms:
            search_terms = f"{search_terms} {related_terms}"
        
        result = {
            'industry_type': ai_analysis.get('industry_type', 'equipment'),
            'equipment_category': ai_analysis.get('equipment_category', equipment_make),
            'industry_terms': search_terms,
            'service_specializations': ai_analysis.get('service_specializations', []),
            'confidence': ai_analysis.get('confidence', 0.8),
            'ai_analysis': ai_analysis
        }
        
        logger.info(f"AI determined industry: {result['industry_type']} - {result['equipment_category']} (confidence: {result['confidence']:.1%})")
        logger.info(f"Generated search terms: {result['industry_terms']}")
        
        return result
        
    except Exception as e:
        logger.error(f"Error in AI industry analysis: {e}")
        # Fallback to basic terms
        return {
            'industry_type': 'equipment',
            'equipment_category': equipment_make,
            'industry_terms': f'{equipment_make} equipment service repair',
            'service_specializations': ['repair', 'maintenance'],
            'confidence': 0.3,
            'error': str(e)
        }

def get_serpapi_service_provider_results(equipment_make, equipment_model, service_type="repair", location=None, bypass_cache=False):
    """
    Step 1: Get first 10 SerpAPI search results for service providers using industry-based search
    
    Args:
        equipment_make (str): Equipment make/brand
        equipment_model (str): Equipment model
        service_type (str): Type of service needed (repair, maintenance, installation, etc.)
        location (str, optional): Geographic location preference
        bypass_cache (bool): Whether to bypass cache
        
    Returns:
        dict: Contains service provider search results and metadata
    """
    logger.info(f"Getting SerpAPI service provider results for: {equipment_make} {equipment_model} - {service_type}")
    
    try:
        # Get industry-specific search terms instead of exact model
        industry_info = get_industry_search_terms(equipment_make, equipment_model)
        industry_terms = industry_info['industry_terms']
        
        # Construct broader industry-based search query
        search_query = f"{industry_terms} {service_type} service technician"
        if location:
            search_query += f" {location}"
        search_query += " authorized certified dealer"
        
        logger.info(f"Using industry-based search: {search_query}")
        
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
        service_results = []
        if "organic_results" in results:
            for idx, result in enumerate(results.get("organic_results", [])[:10]):
                # Analyze if this looks like a service provider
                title_lower = result.get('title', '').lower()
                snippet_lower = result.get('snippet', '').lower()
                url_lower = result.get('link', '').lower()
                
                is_service_provider = any(keyword in title_lower + snippet_lower + url_lower for keyword in [
                    'service', 'repair', 'technician', 'maintenance', 'installation', 'certified', 'authorized', 'specialist'
                ])
                
                service_results.append({
                    "position": idx + 1,
                    "title": result.get('title', 'Unknown'),
                    "url": result.get('link', 'No URL'),
                    "snippet": result.get('snippet', 'No description'),
                    "displayed_link": result.get('displayed_link', ''),
                    "is_likely_service_provider": is_service_provider,
                    "equipment_make": equipment_make,
                    "equipment_model": equipment_model,
                    "service_type": service_type
                })
        
        logger.info(f"SerpAPI returned {len(service_results)} service provider results")
        
        return {
            "success": True,
            "query": search_query,
            "results": service_results,
            "total_results": len(service_results),
            "equipment_make": equipment_make,
            "equipment_model": equipment_model,
            "service_type": service_type
        }
        
    except requests.exceptions.Timeout:
        logger.error("SerpAPI service provider search request timed out")
        return {
            "success": False,
            "error": "SerpAPI timeout",
            "query": search_query if 'search_query' in locals() else "",
            "results": []
        }
    except Exception as e:
        logger.error(f"Error with SerpAPI service provider search: {e}")
        return {
            "success": False,
            "error": str(e),
            "query": search_query if 'search_query' in locals() else "",
            "results": []
        }

def get_gpt_service_provider_web_search_result(equipment_make, equipment_model, service_type="repair", location=None):
    """
    Step 2: Use GPT-4o with web search to find service providers
    
    Args:
        equipment_make (str): Equipment make/brand
        equipment_model (str): Equipment model
        service_type (str): Type of service needed
        location (str, optional): Geographic location preference
        
    Returns:
        dict: GPT's analysis with web search capabilities for service providers
    """
    logger.info(f"Getting GPT service provider web search result for: {equipment_make} {equipment_model} - {service_type}")
    
    try:
        # Construct the prompt for GPT with web search
        search_context = f"Find {service_type} service providers for {equipment_make} {equipment_model}"
        if location:
            search_context += f" in {location}"
        
        prompt = f"""
        I need to find qualified service providers for this equipment:
        
        Equipment Make: {equipment_make}
        Equipment Model: {equipment_model}
        Service Type Needed: {service_type}
        Location Preference: {location or "No preference"}
        
        Please search the web to find:
        1. Authorized service centers and certified technicians
        2. Manufacturer's official service network
        3. Independent service providers with relevant expertise
        4. Service capabilities and specializations
        5. Contact information and service areas
        6. Customer reviews and service quality ratings
        7. Pricing information and service offerings
        
        CRITICAL REQUIREMENTS:
        - Find CERTIFIED and QUALIFIED service providers
        - Prioritize authorized service centers when available
        - Include both manufacturer-authorized and reputable independent providers
        - Verify service provider credentials and certifications
        - Look for providers with experience on this specific equipment type
        - Include emergency/24-hour service availability if offered
        
        Return your findings in JSON format with:
        - provider_name: Name of the primary service provider found
        - provider_url: URL to the service provider's website
        - contact_info: Phone, email, or contact form information
        - service_area: Geographic area they serve
        - certifications: Any relevant certifications or authorizations
        - service_types: Types of services they offer
        - is_authorized: Whether this is manufacturer-authorized
        - emergency_service: Whether they offer emergency/24-hour service
        - location: Provider's location or headquarters
        - confidence: Your confidence level (0.0-1.0)
        - sources: Array of sources where you found this information
        - search_method: "gpt_service_provider_web_search"
        """
        
        # Use GPT with web search using the Responses API (newer approach)
        if USING_NEW_OPENAI_CLIENT:
            try:
                # Try the new Responses API first
                response = client.responses.create(
                    model="gpt-4o",
                    input=f"Find service providers for equipment: {prompt}. Return your findings in JSON format with: provider_name, provider_url, contact_info, service_area, certifications, service_types, is_authorized (boolean), emergency_service (boolean), location, confidence (0.0-1.0), sources (array), search_method.",
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
                        {"role": "system", "content": "You are a service coordination specialist who finds qualified service providers and technicians for industrial equipment. Use your knowledge to provide the most accurate information about service providers and their capabilities."},
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
                    {"role": "system", "content": "You are a service coordination specialist who finds qualified service providers and technicians for industrial equipment. Use your knowledge to provide the most accurate information about service providers and their capabilities."},
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
                
                # Use the extracted content to find service provider information
                if extracted_content:
                    # Look for URLs and provider names in the text
                    import re
                    urls = re.findall(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', extracted_content)
                    
                    # Extract potential provider names (capitalized words before common service terms)
                    provider_patterns = re.findall(r'([A-Z][a-zA-Z\s&]+)(?:\s+(?:Service|Repair|Maintenance|Inc|Corp|LLC|Company|Center))', extracted_content)
                    provider_name = provider_patterns[0] if provider_patterns else f"{equipment_make} Service Provider"
                    
                    gpt_result = {
                        "provider_name": provider_name,
                        "provider_url": urls[0] if urls else None,
                        "contact_info": "Contact information in search results",
                        "service_area": location or "Various locations",
                        "certifications": "Check with provider",
                        "service_types": [service_type, "Maintenance", "Repair"],
                        "is_authorized": True,  # Assume authorized unless specified otherwise
                        "emergency_service": False,  # Conservative assumption
                        "location": location or "Multiple locations",
                        "confidence": 0.7 if urls else 0.4,
                        "sources": sources,
                        "search_method": "gpt_service_provider_web_search_responses_api"
                    }
                else:
                    gpt_result = {"raw_response": raw_content}
                
                logger.info(f"Extracted from service provider web search: provider={gpt_result.get('provider_name')}, sources={len(sources)}")
            elif isinstance(raw_content, dict):
                gpt_result = raw_content
            else:
                gpt_result = {"raw_response": str(raw_content)}
            
            gpt_result["search_method"] = "gpt_service_provider_web_search"
            
        except (json.JSONDecodeError, TypeError) as e:
            logger.error(f"Failed to parse GPT service provider web search result: {e}")
            gpt_result = {
                "provider_name": f"{equipment_make} Service Provider",
                "provider_url": None,
                "contact_info": "Contact information not available",
                "service_area": location or "Unknown",
                "certifications": "Unknown",
                "service_types": [service_type],
                "is_authorized": False,
                "emergency_service": False,
                "location": location or "Unknown",
                "confidence": 0,
                "error": f"Failed to parse result: {str(e)}",
                "search_method": "gpt_service_provider_web_search",
                "sources": []
            }
        
        logger.info(f"GPT service provider web search found: {gpt_result.get('provider_name', 'No provider')} (confidence: {gpt_result.get('confidence', 0)})")
        
        return {
            "success": True,
            "result": gpt_result
        }
        
    except Exception as e:
        logger.error(f"Error with GPT service provider web search: {e}")
        return {
            "success": False,
            "error": str(e),
            "result": {
                "provider_name": f"{equipment_make} Service Provider",
                "provider_url": None,
                "contact_info": "Contact information not available",
                "service_area": location or "Unknown",
                "certifications": "Unknown",
                "service_types": [service_type],
                "is_authorized": False,
                "emergency_service": False,
                "location": location or "Unknown",
                "confidence": 0,
                "sources": [],
                "search_method": "gpt_service_provider_web_search",
                "error": str(e)
            }
        }

def ai_service_provider_arbitrator(serpapi_results, gpt_results, equipment_make, equipment_model, service_type="repair", location=None):
    """
    Step 3: AI arbitrator without web search picks the best service provider from both results
    
    Args:
        serpapi_results (dict): Results from SerpAPI service provider search
        gpt_results (dict): Results from GPT service provider web search
        equipment_make (str): Equipment make/brand
        equipment_model (str): Equipment model
        service_type (str): Type of service needed
        location (str, optional): Geographic location preference
        
    Returns:
        dict: Best service provider result selected by AI arbitrator
    """
    logger.info(f"AI service provider arbitrator analyzing results for: {equipment_make} {equipment_model} - {service_type}")
    
    try:
        # Prepare the analysis prompt
        serpapi_summary = "SerpAPI Service Provider Results (First 10 search results):\n"
        if serpapi_results.get("success") and serpapi_results.get("results"):
            for result in serpapi_results["results"]:
                serpapi_summary += f"- {result['title']}\n  URL: {result['url']}\n  Description: {result['snippet']}\n  Likely Service Provider: {result.get('is_likely_service_provider', False)}\n\n"
        else:
            serpapi_summary += "No SerpAPI service provider results available\n"
        
        gpt_summary = "GPT Service Provider Web Search Results:\n"
        if gpt_results.get("success") and gpt_results.get("result"):
            gpt_result = gpt_results["result"]
            gpt_summary += f"Provider Name: {gpt_result.get('provider_name', 'None')}\n"
            gpt_summary += f"Provider URL: {gpt_result.get('provider_url', 'None')}\n"
            gpt_summary += f"Contact Info: {gpt_result.get('contact_info', 'None')}\n"
            gpt_summary += f"Service Area: {gpt_result.get('service_area', 'Unknown')}\n"
            gpt_summary += f"Certifications: {gpt_result.get('certifications', 'Unknown')}\n"
            gpt_summary += f"Service Types: {', '.join(gpt_result.get('service_types', []))}\n"
            gpt_summary += f"Is Authorized: {gpt_result.get('is_authorized', False)}\n"
            gpt_summary += f"Emergency Service: {gpt_result.get('emergency_service', False)}\n"
            gpt_summary += f"Location: {gpt_result.get('location', 'Unknown')}\n"
            gpt_summary += f"Confidence: {gpt_result.get('confidence', 0)}\n"
            gpt_summary += f"Sources: {', '.join(gpt_result.get('sources', []))}\n"
        else:
            gpt_summary += "No GPT service provider web search results available\n"
        
        arbitrator_prompt = f"""
        You are an AI arbitrator analyzing two different search approaches for finding equipment service providers.
        
        ORIGINAL REQUEST:
        Equipment Make: {equipment_make}
        Equipment Model: {equipment_model}
        Service Type: {service_type}
        Location Preference: {location or "No preference"}
        
        SEARCH RESULTS TO ANALYZE:
        
        {serpapi_summary}
        
        {gpt_summary}
        
        TASK:
        Analyze both sets of service provider search results and determine the best service provider for the requested equipment and service type.
        Consider:
        1. Service provider qualifications and certifications
        2. Manufacturer authorization status
        3. Equipment specialization and expertise
        4. Geographic coverage and proximity
        5. Service capabilities and offerings
        6. Emergency service availability
        7. Customer reviews and reputation
        8. Contact accessibility and response time
        
        CRITICAL: The selected service provider MUST be qualified to service {equipment_make} {equipment_model} for {service_type}.
        
        Return a JSON object with your decision:
        - selected_source: "serpapi" or "gpt_service_provider_web_search" or "none" (if neither is suitable)
        - provider_name: Name of the best service provider found
        - provider_url: URL to the service provider's website
        - contact_info: Contact information for service requests
        - service_area: Geographic area they serve
        - certifications: Relevant certifications or authorizations
        - service_types: Types of services they offer
        - is_authorized: Whether this is manufacturer-authorized
        - emergency_service: Whether they offer emergency service
        - location: Provider's location
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
                    {"role": "system", "content": "You are an expert AI arbitrator who analyzes different service provider search results to select the most qualified and appropriate service provider for equipment maintenance and repair. You do not have web search capabilities - you analyze only the provided search results to make your decision."},
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
                    {"role": "system", "content": "You are an expert AI arbitrator who analyzes different service provider search results to select the most qualified and appropriate service provider for equipment maintenance and repair. You do not have web search capabilities - you analyze only the provided search results to make your decision."},
                    {"role": "user", "content": arbitrator_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            raw_content = response.choices[0].message['content']
        
        # Parse arbitrator decision
        arbitrator_decision = json.loads(raw_content)
        
        logger.info(f"AI Service Provider Arbitrator selected: {arbitrator_decision.get('selected_source')} - Provider: {arbitrator_decision.get('provider_name')} (confidence: {arbitrator_decision.get('confidence', 0)})")
        logger.info(f"Service Provider Arbitrator reasoning: {arbitrator_decision.get('reasoning', 'No reasoning provided')}")
        
        return {
            "success": True,
            "arbitrator_decision": arbitrator_decision,
            "serpapi_data": serpapi_results,
            "gpt_data": gpt_results
        }
        
    except Exception as e:
        logger.error(f"Error in AI service provider arbitrator: {e}")
        return {
            "success": False,
            "error": str(e),
            "arbitrator_decision": {
                "selected_source": "none",
                "provider_name": f"{equipment_make} Service Provider",
                "provider_url": None,
                "contact_info": "Contact information not available",
                "service_area": location or "Unknown",
                "certifications": "Unknown",
                "service_types": [service_type],
                "is_authorized": False,
                "emergency_service": False,
                "location": location or "Unknown",
                "confidence": 0,
                "reasoning": f"Service provider arbitrator failed: {str(e)}",
                "sources": [],
                "arbitrator_analysis": f"Error during analysis: {str(e)}"
            },
            "serpapi_data": serpapi_results,
            "gpt_data": gpt_results
        }

def ai_service_provider_arbitrator_multiple(serpapi_results, gpt_results, equipment_make, equipment_model, service_type="repair", location=None, max_results=5):
    """
    AI arbitrator that ranks and returns multiple service provider results from both SerpAPI and GPT web search
    
    Args:
        serpapi_results (dict): Results from SerpAPI service provider search
        gpt_results (dict): Results from GPT service provider web search
        equipment_make (str): Equipment make/brand
        equipment_model (str): Equipment model
        service_type (str): Type of service needed
        location (str, optional): Geographic location preference
        max_results (int): Maximum number of ranked results to return
        
    Returns:
        dict: Top ranked service provider results from both sources
    """
    logger.info(f"AI service provider arbitrator ranking multiple results for: {equipment_make} {equipment_model} - {service_type} (max {max_results})")
    
    try:
        # Prepare all available service provider candidates
        provider_candidates = []
        
        # Add SerpAPI results
        if serpapi_results.get("success") and serpapi_results.get("results"):
            for idx, result in enumerate(serpapi_results["results"]):
                provider_candidates.append({
                    "provider_name": result.get('title', 'Unknown Provider'),
                    "provider_url": result.get('url'),
                    "snippet": result.get('snippet', ''),
                    "source_type": "serpapi",
                    "position": idx + 1,
                    "is_likely_service_provider": result.get('is_likely_service_provider', False)
                })
        
        # Add GPT web search result
        if gpt_results.get("success") and gpt_results.get("result"):
            gpt_result = gpt_results["result"]
            if gpt_result.get('provider_name'):
                provider_candidates.append({
                    "provider_name": gpt_result.get('provider_name', 'Unknown Provider'),
                    "provider_url": gpt_result.get('provider_url'),
                    "snippet": f"GPT found: {gpt_result.get('certifications', 'N/A')} - {gpt_result.get('service_types', [])}",
                    "source_type": "gpt_service_provider_web_search",
                    "contact_info": gpt_result.get('contact_info'),
                    "service_area": gpt_result.get('service_area'),
                    "certifications": gpt_result.get('certifications'),
                    "service_types": gpt_result.get('service_types', []),
                    "is_authorized": gpt_result.get('is_authorized', False),
                    "emergency_service": gpt_result.get('emergency_service', False),
                    "location": gpt_result.get('location'),
                    "position": 1
                })
        
        if not provider_candidates:
            return {
                "success": False,
                "error": "No service provider candidates found",
                "ranked_providers": []
            }
        
        # Prepare the ranking prompt
        candidates_summary = f"Available Service Provider Candidates ({len(provider_candidates)} total):\n\n"
        for idx, candidate in enumerate(provider_candidates):
            candidates_summary += f"CANDIDATE {idx + 1} ({candidate['source_type']}):\n"
            candidates_summary += f"  Name: {candidate['provider_name']}\n"
            candidates_summary += f"  URL: {candidate['provider_url']}\n"
            candidates_summary += f"  Description: {candidate['snippet']}\n"
            if candidate.get('certifications'):
                candidates_summary += f"  Certifications: {candidate['certifications']}\n"
            if candidate.get('service_types'):
                candidates_summary += f"  Services: {candidate['service_types']}\n"
            if candidate.get('is_authorized'):
                candidates_summary += f"  Authorized: {candidate['is_authorized']}\n"
            candidates_summary += f"  Source: {candidate['source_type']}\n\n"
        
        arbitrator_prompt = f"""
        You are an AI arbitrator tasked with ranking service provider search results to find the best providers for the user.
        
        ORIGINAL REQUEST:
        Equipment Make: {equipment_make}
        Equipment Model: {equipment_model}
        Service Type: {service_type}
        Location: {location or "Not specified"}
        
        SERVICE PROVIDER CANDIDATES TO RANK:
        {candidates_summary}
        
        TASK:
        Analyze and rank ALL available service provider candidates based on these criteria:
        1. AUTHORIZATION: Manufacturer-authorized vs independent providers
        2. SPECIALIZATION: Industry-specific expertise and equipment familiarity
        3. GEOGRAPHIC PROXIMITY: Location match and service area coverage
        4. SERVICE CAPABILITIES: Range of services offered and expertise
        5. CREDIBILITY: Business legitimacy and professional credentials
        6. ACCESSIBILITY: Contact information and response availability
        
        CRITICAL: Return up to {max_results} providers ranked from best to worst.
        
        Return a JSON object with your rankings:
        {{
            "ranked_providers": [
                {{
                    "ranking": 1,
                    "provider_name": "Exact name from candidate",
                    "provider_url": "URL from candidate", 
                    "source_type": "serpapi or gpt_service_provider_web_search",
                    "contact_info": "contact information",
                    "service_area": "geographic coverage",
                    "certifications": "relevant certifications",
                    "service_types": ["list", "of", "services"],
                    "is_authorized": true/false,
                    "emergency_service": true/false,
                    "location": "provider location",
                    "confidence": 0.0-1.0,
                    "reasoning": "Why this provider ranks at this position",
                    "sources": ["source URLs"]
                }}
                // ... up to {max_results} providers
            ],
            "ranking_methodology": "Overall approach used for ranking these providers"
        }}
        
        IMPORTANT: 
        - Include ONLY providers that can service {equipment_make} equipment
        - Rank by service quality and relevance, not just authorization status
        - Each provider must have a valid name and contact method
        - Confidence should reflect suitability for the specific service request
        """
        
        # Get arbitrator ranking (WITHOUT web search)
        if USING_NEW_OPENAI_CLIENT:
            response = client.chat.completions.create(
                model="gpt-4o-mini",  # Use nano for arbitration, no web search needed
                messages=[
                    {"role": "system", "content": "You are an expert AI arbitrator who ranks service provider search results to help users find the most qualified and appropriate service providers for their equipment. You analyze search results to provide comprehensive rankings based on expertise, authorization, and service quality."},
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
                    {"role": "system", "content": "You are an expert AI arbitrator who ranks service provider search results to help users find the most qualified and appropriate service providers for their equipment. You analyze search results to provide comprehensive rankings based on expertise, authorization, and service quality."},
                    {"role": "user", "content": arbitrator_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            raw_content = response.choices[0].message['content']
        
        # Parse arbitrator rankings
        arbitrator_rankings = json.loads(raw_content)
        ranked_providers = arbitrator_rankings.get("ranked_providers", [])
        
        # Limit to max_results
        ranked_providers = ranked_providers[:max_results]
        
        logger.info(f"AI Service Provider Arbitrator ranked {len(ranked_providers)} providers")
        for idx, provider in enumerate(ranked_providers):
            logger.info(f"  #{idx+1}: {provider.get('provider_name')} (confidence: {provider.get('confidence', 0)}, source: {provider.get('source_type')})")
        
        return {
            "success": True,
            "ranked_providers": ranked_providers,
            "ranking_methodology": arbitrator_rankings.get("ranking_methodology", "Standard relevance-based ranking"),
            "total_candidates": len(provider_candidates),
            "serpapi_data": serpapi_results,
            "gpt_data": gpt_results
        }
        
    except Exception as e:
        logger.error(f"Error in AI service provider arbitrator multiple: {e}")
        return {
            "success": False,
            "error": str(e),
            "ranked_providers": [],
            "serpapi_data": serpapi_results,
            "gpt_data": gpt_results
        }

def find_service_provider_with_dual_search(equipment_make, equipment_model, service_type="repair", location=None, bypass_cache=False, max_results=5):
    """
    Main function implementing the dual search approach for service providers:
    1. Get first 10 SerpAPI search results for service providers directly
    2. Use GPT-4o with web search preview to find qualified service providers  
    3. Send both results to AI arbitrator to rank and return top providers
    
    Args:
        equipment_make (str): Equipment make/brand
        equipment_model (str): Equipment model
        service_type (str): Type of service needed
        location (str, optional): Geographic location preference
        bypass_cache (bool): Whether to bypass cache
        max_results (int): Maximum number of results to return (default 5)
        
    Returns:
        list: Top service provider results ranked by AI arbitrator
    """
    logger.info(f"Starting dual service provider search for: {equipment_make} {equipment_model} - {service_type} (max {max_results} results)")
    
    try:
        # Step 1: Get SerpAPI service provider results
        logger.info("Step 1: Getting SerpAPI service provider results...")
        serpapi_results = get_serpapi_service_provider_results(equipment_make, equipment_model, service_type, location, bypass_cache)
        
        # Step 2: Get GPT service provider web search results  
        logger.info("Step 2: Getting GPT service provider web search results...")
        gpt_results = get_gpt_service_provider_web_search_result(equipment_make, equipment_model, service_type, location)
        
        # Step 3: AI arbitrator ranks all results
        logger.info("Step 3: AI service provider arbitrator ranking all results...")
        final_result = ai_service_provider_arbitrator_multiple(serpapi_results, gpt_results, equipment_make, equipment_model, service_type, location, max_results)
        
        if final_result.get("success"):
            ranked_providers = final_result["ranked_providers"]
            
            # Format the results in the expected format for compatibility
            formatted_results = []
            for idx, provider in enumerate(ranked_providers):
                formatted_result = {
                    "provider_name": provider.get("provider_name"),
                    "provider_url": provider.get("provider_url"),
                    "contact_info": provider.get("contact_info", "Contact information not available"),
                    "service_area": provider.get("service_area", location or "Unknown"),
                    "certifications": provider.get("certifications", "Check with provider"),
                    "service_types": provider.get("service_types", [service_type]),
                    "is_authorized": provider.get("is_authorized", False),
                    "emergency_service": provider.get("emergency_service", False),
                    "location": provider.get("location", location or "Unknown"),
                    "confidence": provider.get("confidence", 0),
                    "sources": provider.get("sources", []),
                    "source": "dual_service_provider_search",
                    "selected_method": provider.get("source_type"),
                    "arbitrator_reasoning": provider.get("reasoning"),
                    "ranking_position": idx + 1,
                    "serpapi_count": len(serpapi_results.get("results", [])),
                    "gpt_web_success": gpt_results.get("success", False),
                    "equipment_make": equipment_make,
                    "equipment_model": equipment_model,
                    "service_type": service_type
                }
                formatted_results.append(formatted_result)
            
            logger.info(f"Dual service provider search completed. Found {len(formatted_results)} ranked results")
            return formatted_results
        else:
            logger.error("Dual service provider search failed in arbitrator")
            return [{
                "provider_name": f"{equipment_make} Service Provider",
                "provider_url": None,
                "contact_info": "Contact information not available",
                "service_area": location or "Unknown",
                "certifications": "Unknown",
                "service_types": [service_type],
                "is_authorized": False,
                "emergency_service": False,
                "location": location or "Unknown",
                "confidence": 0,
                "error": final_result.get("error", "Service provider arbitrator failed"),
                "source": "dual_service_provider_search",
                "sources": [],
                "equipment_make": equipment_make,
                "equipment_model": equipment_model,
                "service_type": service_type
            }]
            
    except Exception as e:
        logger.error(f"Error in dual service provider search: {e}")
        return [{
            "provider_name": f"{equipment_make} Service Provider",
            "provider_url": None,
            "contact_info": "Contact information not available",
            "service_area": location or "Unknown",
            "certifications": "Unknown",
            "service_types": [service_type],
            "is_authorized": False,
            "emergency_service": False,
            "location": location or "Unknown",
            "confidence": 0,
            "error": str(e),
            "source": "dual_service_provider_search",
            "sources": [],
            "equipment_make": equipment_make,
            "equipment_model": equipment_model,
            "service_type": service_type
        }]