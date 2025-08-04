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

def get_serpapi_results(description, make=None, model=None, year=None, bypass_cache=False):
    """
    Step 1: Get first 10 SerpAPI search results directly
    
    Args:
        description (str): Part description
        make (str, optional): Equipment make  
        model (str, optional): Equipment model
        year (str, optional): Equipment year
        bypass_cache (bool): Whether to bypass cache
        
    Returns:
        dict: Contains search results and metadata
    """
    logger.info(f"Getting SerpAPI results for: {description} - {make} {model} {year}")
    
    try:
        # Construct search query
        search_query = f"{description}"
        if make:
            search_query += f" {make}"
        if model:
            search_query += f" {model}"
        if year:
            search_query += f" {year}"
        search_query += " OEM part number"
        
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
        search_results = []
        if "organic_results" in results:
            for idx, result in enumerate(results.get("organic_results", [])[:10]):
                search_results.append({
                    "position": idx + 1,
                    "title": result.get('title', 'Unknown'),
                    "url": result.get('link', 'No URL'),
                    "snippet": result.get('snippet', 'No description'),
                    "displayed_link": result.get('displayed_link', '')
                })
        
        logger.info(f"SerpAPI returned {len(search_results)} results")
        
        return {
            "success": True,
            "query": search_query,
            "results": search_results,
            "total_results": len(search_results)
        }
        
    except requests.exceptions.Timeout:
        logger.error("SerpAPI request timed out")
        return {
            "success": False,
            "error": "SerpAPI timeout",
            "query": search_query if 'search_query' in locals() else "",
            "results": []
        }
    except Exception as e:
        logger.error(f"Error with SerpAPI: {e}")
        return {
            "success": False,
            "error": str(e),
            "query": search_query if 'search_query' in locals() else "",
            "results": []
        }

def get_gpt_web_search_result(description, make=None, model=None, year=None):
    """
    Step 2: Use GPT-4.1-nano with web search preview to find the answer
    
    Args:
        description (str): Part description
        make (str, optional): Equipment make
        model (str, optional): Equipment model  
        year (str, optional): Equipment year
        
    Returns:
        dict: GPT's analysis with web search capabilities
    """
    logger.info(f"Getting GPT web search result for: {description} - {make} {model} {year}")
    
    try:
        # Construct the prompt for GPT with web search
        search_context = f"Find the OEM part number for: {description}"
        if make:
            search_context += f" for {make}"
        if model:
            search_context += f" {model}"
        if year:
            search_context += f" ({year})"
        
        prompt = f"""
        I need to find the exact OEM part number for this component:
        
        Part Description: {description}
        Equipment Make: {make or "Not specified"}
        Equipment Model: {model or "Not specified"}
        Year: {year or "Not specified"}
        
        Please search the web to find:
        1. The exact OEM (Original Equipment Manufacturer) part number
        2. The manufacturer who makes this part
        3. A detailed description confirming this is the correct part type
        4. Any alternate part numbers
        5. Sources where you found this information
        
        CRITICAL REQUIREMENTS:
        - The part MUST match the requested type ({description})
        - Return the specific component part number, not the equipment model number
        - Verify the part is compatible with the specified make/model
        - Use current web search to find the most accurate information
        
        Return your findings in JSON format with:
        - oem_part_number: The exact OEM part number
        - manufacturer: The part manufacturer
        - description: Detailed part description
        - confidence: Your confidence level (0.0-1.0)
        - alternate_part_numbers: Array of alternate part numbers
        - sources: Array of sources where you found this information
        - search_method: "gpt_web_search"
        """
        
        # Use GPT with web search using the Responses API (newer approach)
        if USING_NEW_OPENAI_CLIENT:
            try:
                # Try the new Responses API first
                response = client.responses.create(
                    model="gpt-4o",
                    input=f"Find OEM part information for: {prompt}. Return your findings in JSON format with: oem_part_number, manufacturer, description, confidence (0.0-1.0), alternate_part_numbers (array), sources (array), search_method.",
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
                        {"role": "system", "content": "You are a parts specialist who finds precise OEM part numbers. Use your knowledge to provide the most accurate information about parts and their manufacturers."},
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
                    {"role": "system", "content": "You are a parts specialist who finds precise OEM part numbers. Use your knowledge to provide the most accurate information about parts and their manufacturers."},
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
                
                # Use the extracted content to find part information
                if extracted_content:
                    # Look for part numbers in the text using regex
                    import re
                    part_numbers = re.findall(r'\b\d{4,6}\b', extracted_content)  # Look for 4-6 digit part numbers
                    
                    if part_numbers:
                        gpt_result = {
                            "oem_part_number": part_numbers[0],  # Take the first found part number
                            "manufacturer": make or "Unknown",
                            "description": extracted_content[:200] + "..." if len(extracted_content) > 200 else extracted_content,
                            "confidence": 0.8,  # Medium confidence since we extracted it
                            "sources": sources,
                            "alternate_part_numbers": part_numbers[1:] if len(part_numbers) > 1 else [],
                            "search_method": "gpt_web_search_responses_api"
                        }
                    else:
                        gpt_result = {
                            "oem_part_number": None,
                            "manufacturer": make or "Unknown", 
                            "description": extracted_content[:200] + "..." if len(extracted_content) > 200 else extracted_content,
                            "confidence": 0.3,  # Low confidence since no part number found
                            "sources": sources,
                            "alternate_part_numbers": [],
                            "search_method": "gpt_web_search_responses_api"
                        }
                else:
                    gpt_result = {"raw_response": raw_content}
                
                logger.info(f"Extracted from web search: part={gpt_result.get('oem_part_number')}, sources={len(sources)}")
            elif isinstance(raw_content, dict):
                gpt_result = raw_content
            else:
                gpt_result = {"raw_response": str(raw_content)}
            
            gpt_result["search_method"] = "gpt_web_search"
            
        except (json.JSONDecodeError, TypeError) as e:
            logger.error(f"Failed to parse GPT web search result: {e}")
            gpt_result = {
                "oem_part_number": None,
                "manufacturer": None,
                "description": description,
                "confidence": 0,
                "error": f"Failed to parse result: {str(e)}",
                "search_method": "gpt_web_search",
                "sources": [],
                "alternate_part_numbers": []
            }
        
        logger.info(f"GPT web search found: {gpt_result.get('oem_part_number', 'No part')} (confidence: {gpt_result.get('confidence', 0)})")
        
        return {
            "success": True,
            "result": gpt_result
        }
        
    except Exception as e:
        logger.error(f"Error with GPT web search: {e}")
        return {
            "success": False,
            "error": str(e),
            "result": {
                "oem_part_number": None,
                "manufacturer": None,
                "description": description,
                "confidence": 0,
                "alternate_part_numbers": [],
                "sources": [],
                "search_method": "gpt_web_search",
                "error": str(e)
            }
        }

def ai_arbitrator(serpapi_results, gpt_results, description, make=None, model=None, year=None):
    """
    Step 3: AI arbitrator without web search picks the best answer from both results
    
    Args:
        serpapi_results (dict): Results from SerpAPI direct search
        gpt_results (dict): Results from GPT web search
        description (str): Original part description
        make (str, optional): Equipment make
        model (str, optional): Equipment model
        year (str, optional): Equipment year
        
    Returns:
        dict: Best result selected by AI arbitrator
    """
    logger.info(f"AI arbitrator analyzing results for: {description}")
    
    try:
        # Prepare the analysis prompt
        serpapi_summary = "SerpAPI Results (First 10 search results):\n"
        if serpapi_results.get("success") and serpapi_results.get("results"):
            for result in serpapi_results["results"]:
                serpapi_summary += f"- {result['title']}\n  URL: {result['url']}\n  Description: {result['snippet']}\n\n"
        else:
            serpapi_summary += "No SerpAPI results available\n"
        
        gpt_summary = "GPT Web Search Results:\n"
        if gpt_results.get("success") and gpt_results.get("result"):
            gpt_result = gpt_results["result"]
            gpt_summary += f"OEM Part Number: {gpt_result.get('oem_part_number', 'None')}\n"
            gpt_summary += f"Manufacturer: {gpt_result.get('manufacturer', 'None')}\n"
            gpt_summary += f"Description: {gpt_result.get('description', 'None')}\n"
            gpt_summary += f"Confidence: {gpt_result.get('confidence', 0)}\n"
            gpt_summary += f"Sources: {', '.join(gpt_result.get('sources', []))}\n"
        else:
            gpt_summary += "No GPT web search results available\n"
        
        arbitrator_prompt = f"""
        You are an AI arbitrator analyzing two different search approaches for finding an OEM part number.
        
        ORIGINAL REQUEST:
        Part Description: {description}
        Equipment Make: {make or "Not specified"}
        Equipment Model: {model or "Not specified"}  
        Year: {year or "Not specified"}
        
        SEARCH RESULTS TO ANALYZE:
        
        {serpapi_summary}
        
        {gpt_summary}
        
        TASK:
        Analyze both sets of results and determine the best OEM part number for the requested component.
        Consider:
        1. Accuracy and relevance of the part number to the requested description
        2. Quality and reliability of sources
        3. Confidence levels and validation
        4. Whether the part actually matches the requested component type
        5. Manufacturer authenticity
        
        CRITICAL: The selected part MUST be a {description}, not any other component type.
        
        Return a JSON object with your decision:
        - selected_source: "serpapi" or "gpt_web_search" or "none" (if neither is suitable)
        - oem_part_number: The best OEM part number found (or null if none suitable)
        - manufacturer: The manufacturer of the selected part
        - description: Description of the selected part
        - confidence: Your confidence in this selection (0.0-1.0)
        - reasoning: Explanation of why you selected this result
        - alternate_part_numbers: Any alternate part numbers from your selection
        - sources: Sources supporting your selection
        - arbitrator_analysis: Your detailed analysis of both search results
        """
        
        # Get arbitrator decision (WITHOUT web search)
        if USING_NEW_OPENAI_CLIENT:
            response = client.chat.completions.create(
                model="gpt-4.1-mini-2025-04-14",  # Use nano for arbitration, no web search needed
                messages=[
                    {"role": "system", "content": "You are an expert AI arbitrator who analyzes different search results to select the most accurate OEM part number. You do not have web search capabilities - you analyze only the provided search results to make your decision."},
                    {"role": "user", "content": arbitrator_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            raw_content = response.choices[0].message.content
        else:
            import openai
            response = openai.ChatCompletion.create(
                model="gpt-4.1-mini-2025-04-14",
                messages=[
                    {"role": "system", "content": "You are an expert AI arbitrator who analyzes different search results to select the most accurate OEM part number. You do not have web search capabilities - you analyze only the provided search results to make your decision."},
                    {"role": "user", "content": arbitrator_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            raw_content = response.choices[0].message['content']
        
        # Parse arbitrator decision
        arbitrator_decision = json.loads(raw_content)
        
        logger.info(f"AI Arbitrator selected: {arbitrator_decision.get('selected_source')} - Part: {arbitrator_decision.get('oem_part_number')} (confidence: {arbitrator_decision.get('confidence', 0)})")
        logger.info(f"Arbitrator reasoning: {arbitrator_decision.get('reasoning', 'No reasoning provided')}")
        
        return {
            "success": True,
            "arbitrator_decision": arbitrator_decision,
            "serpapi_data": serpapi_results,
            "gpt_data": gpt_results
        }
        
    except Exception as e:
        logger.error(f"Error in AI arbitrator: {e}")
        return {
            "success": False,
            "error": str(e),
            "arbitrator_decision": {
                "selected_source": "none",
                "oem_part_number": None,
                "manufacturer": None,
                "description": description,
                "confidence": 0,
                "reasoning": f"Arbitrator failed: {str(e)}",
                "alternate_part_numbers": [],
                "sources": [],
                "arbitrator_analysis": f"Error during analysis: {str(e)}"
            },
            "serpapi_data": serpapi_results,
            "gpt_data": gpt_results
        }

def find_part_with_dual_search(description, make=None, model=None, year=None, bypass_cache=False):
    """
    Main function implementing the new dual search approach:
    1. Get first 10 SerpAPI search results directly
    2. Use GPT-4.1-nano with web search preview to find the answer  
    3. Send both results to AI arbitrator without web search to pick the best answer
    
    Args:
        description (str): Part description  
        make (str, optional): Equipment make
        model (str, optional): Equipment model
        year (str, optional): Equipment year
        bypass_cache (bool): Whether to bypass cache
        
    Returns:
        dict: Final result selected by AI arbitrator
    """
    logger.info(f"Starting dual search for: {description} - {make} {model} {year}")
    
    try:
        # Step 1: Get SerpAPI results
        logger.info("Step 1: Getting SerpAPI results...")
        serpapi_results = get_serpapi_results(description, make, model, year, bypass_cache)
        
        # Step 2: Get GPT web search results  
        logger.info("Step 2: Getting GPT web search results...")
        gpt_results = get_gpt_web_search_result(description, make, model, year)
        
        # Step 3: AI arbitrator selects best result
        logger.info("Step 3: AI arbitrator analyzing results...")
        final_result = ai_arbitrator(serpapi_results, gpt_results, description, make, model, year)
        
        if final_result.get("success"):
            decision = final_result["arbitrator_decision"]
            
            # Format the result in the expected format for compatibility
            formatted_result = {
                "oem_part_number": decision.get("oem_part_number"),
                "manufacturer": decision.get("manufacturer"),
                "description": decision.get("description", description),
                "confidence": decision.get("confidence", 0),
                "alternate_part_numbers": decision.get("alternate_part_numbers", []),
                "sources": decision.get("sources", []),
                "source": "dual_search",
                "selected_method": decision.get("selected_source"),
                "arbitrator_reasoning": decision.get("reasoning"),
                "arbitrator_analysis": decision.get("arbitrator_analysis"),
                "serpapi_count": len(serpapi_results.get("results", [])),
                "gpt_web_success": gpt_results.get("success", False)
            }
            
            logger.info(f"Dual search completed. Selected: {formatted_result.get('oem_part_number')} via {formatted_result.get('selected_method')}")
            return formatted_result
        else:
            logger.error("Dual search failed in arbitrator")
            return {
                "oem_part_number": None,
                "manufacturer": make if make else None,
                "description": description,
                "confidence": 0,
                "error": final_result.get("error", "Arbitrator failed"),
                "source": "dual_search",
                "alternate_part_numbers": [],
                "sources": []
            }
            
    except Exception as e:
        logger.error(f"Error in dual search: {e}")
        return {
            "oem_part_number": None,
            "manufacturer": make if make else None,
            "description": description,
            "confidence": 0,
            "error": str(e),
            "source": "dual_search", 
            "alternate_part_numbers": [],
            "sources": []
        }