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

def get_serpapi_manual_results(make, model, year=None, manual_type="service manual", bypass_cache=False):
    """
    Step 1: Get first 10 SerpAPI search results for equipment manuals
    
    Args:
        make (str): Equipment make  
        model (str): Equipment model
        year (str, optional): Equipment year
        manual_type (str): Type of manual (service manual, parts manual, operator manual, etc.)
        bypass_cache (bool): Whether to bypass cache
        
    Returns:
        dict: Contains manual search results and metadata
    """
    logger.info(f"Getting SerpAPI manual results for: {make} {model} {year} - {manual_type}")
    
    try:
        # Construct search query for manuals
        search_query = f"{make} {model}"
        if year:
            search_query += f" {year}"
        search_query += f" {manual_type} PDF filetype:pdf"
        
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
        manual_results = []
        if "organic_results" in results:
            for idx, result in enumerate(results.get("organic_results", [])[:10]):
                manual_results.append({
                    "position": idx + 1,
                    "title": result.get('title', 'Unknown'),
                    "url": result.get('link', 'No URL'),
                    "snippet": result.get('snippet', 'No description'),
                    "displayed_link": result.get('displayed_link', ''),
                    "manual_type": manual_type,
                    "is_pdf": result.get('link', '').lower().endswith('.pdf') or 'pdf' in result.get('title', '').lower()
                })
        
        logger.info(f"SerpAPI returned {len(manual_results)} manual results")
        
        return {
            "success": True,
            "query": search_query,
            "results": manual_results,
            "total_results": len(manual_results),
            "manual_type": manual_type
        }
        
    except requests.exceptions.Timeout:
        logger.error("SerpAPI manual search request timed out")
        return {
            "success": False,
            "error": "SerpAPI timeout",
            "query": search_query if 'search_query' in locals() else "",
            "results": []
        }
    except Exception as e:
        logger.error(f"Error with SerpAPI manual search: {e}")
        return {
            "success": False,
            "error": str(e),
            "query": search_query if 'search_query' in locals() else "",
            "results": []
        }

def get_gpt_manual_web_search_result(make, model, year=None, manual_type="service manual"):
    """
    Step 2: Use GPT-4o with web search to find equipment manuals
    
    Args:
        make (str): Equipment make
        model (str): Equipment model  
        year (str, optional): Equipment year
        manual_type (str): Type of manual needed
        
    Returns:
        dict: GPT's analysis with web search capabilities for manuals
    """
    logger.info(f"Getting GPT manual web search result for: {make} {model} {year} - {manual_type}")
    
    try:
        # Construct the prompt for GPT with web search
        search_context = f"Find the {manual_type} for {make} {model}"
        if year:
            search_context += f" ({year})"
        
        prompt = f"""
        I need to find the official {manual_type} for this equipment:
        
        Equipment Make: {make}
        Equipment Model: {model}
        Year: {year or "Not specified"}
        Manual Type: {manual_type}
        
        Please search the web to find:
        1. Official manufacturer documentation (service manual, parts manual, operator manual)
        2. Direct PDF download links from official sources
        3. Equipment specifications and manual details
        4. Alternative sources for official documentation
        5. Manual part numbers or document identifiers
        
        CRITICAL REQUIREMENTS:
        - Find OFFICIAL manufacturer documentation, not third-party copies
        - Prioritize direct PDF downloads from manufacturer websites
        - Verify the manual matches the exact make/model/year
        - Look for current, up-to-date versions
        - Include manual part numbers or document IDs when available
        
        Return your findings in JSON format with:
        - manual_title: The official title of the manual
        - manual_url: Direct URL to the manual (preferably PDF)
        - manufacturer_source: Whether this is from official manufacturer website
        - document_id: Manual part number or document identifier
        - manual_type: Type of manual found
        - file_format: Format of the manual (PDF, HTML, etc.)
        - confidence: Your confidence level (0.0-1.0)
        - sources: Array of sources where you found this information
        - search_method: "gpt_manual_web_search"
        """
        
        # Use GPT with web search using the Responses API (newer approach)
        if USING_NEW_OPENAI_CLIENT:
            try:
                # Try the new Responses API first
                response = client.responses.create(
                    model="gpt-4o",
                    input=f"Find official equipment manual for: {prompt}. Return your findings in JSON format with: manual_title, manual_url, manufacturer_source (boolean), document_id, manual_type, file_format, confidence (0.0-1.0), sources (array), search_method.",
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
                        {"role": "system", "content": "You are a technical documentation specialist who finds official equipment manuals and documentation. Use your knowledge to provide the most accurate information about manuals and their sources."},
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
                    {"role": "system", "content": "You are a technical documentation specialist who finds official equipment manuals and documentation. Use your knowledge to provide the most accurate information about manuals and their sources."},
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
                
                # Use the extracted content to find manual information
                if extracted_content:
                    # Look for URLs and manual titles in the text
                    import re
                    urls = re.findall(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', extracted_content)
                    
                    gpt_result = {
                        "manual_title": f"{make} {model} {manual_type}",
                        "manual_url": urls[0] if urls else None,
                        "manufacturer_source": True if any(make.lower() in url.lower() for url in urls) else False,
                        "document_id": None,
                        "manual_type": manual_type,
                        "file_format": "PDF" if any('.pdf' in url.lower() for url in urls) else "Unknown",
                        "confidence": 0.8 if urls else 0.3,
                        "sources": sources,
                        "search_method": "gpt_manual_web_search_responses_api"
                    }
                else:
                    gpt_result = {"raw_response": raw_content}
                
                logger.info(f"Extracted from manual web search: title={gpt_result.get('manual_title')}, sources={len(sources)}")
            elif isinstance(raw_content, dict):
                gpt_result = raw_content
            else:
                gpt_result = {"raw_response": str(raw_content)}
            
            gpt_result["search_method"] = "gpt_manual_web_search"
            
        except (json.JSONDecodeError, TypeError) as e:
            logger.error(f"Failed to parse GPT manual web search result: {e}")
            gpt_result = {
                "manual_title": f"{make} {model} {manual_type}",
                "manual_url": None,
                "manufacturer_source": False,
                "document_id": None,
                "manual_type": manual_type,
                "file_format": "Unknown",
                "confidence": 0,
                "error": f"Failed to parse result: {str(e)}",
                "search_method": "gpt_manual_web_search",
                "sources": []
            }
        
        logger.info(f"GPT manual web search found: {gpt_result.get('manual_title', 'No manual')} (confidence: {gpt_result.get('confidence', 0)})")
        
        return {
            "success": True,
            "result": gpt_result
        }
        
    except Exception as e:
        logger.error(f"Error with GPT manual web search: {e}")
        return {
            "success": False,
            "error": str(e),
            "result": {
                "manual_title": f"{make} {model} {manual_type}",
                "manual_url": None,
                "manufacturer_source": False,
                "document_id": None,
                "manual_type": manual_type,
                "file_format": "Unknown",
                "confidence": 0,
                "sources": [],
                "search_method": "gpt_manual_web_search",
                "error": str(e)
            }
        }

def ai_manual_arbitrator(serpapi_results, gpt_results, make, model, year=None, manual_type="service manual"):
    """
    Step 3: AI arbitrator without web search picks the best manual from both results
    
    Args:
        serpapi_results (dict): Results from SerpAPI manual search
        gpt_results (dict): Results from GPT manual web search
        make (str): Equipment make
        model (str): Equipment model
        year (str, optional): Equipment year
        manual_type (str): Type of manual needed
        
    Returns:
        dict: Best manual result selected by AI arbitrator
    """
    logger.info(f"AI manual arbitrator analyzing results for: {make} {model} {year} - {manual_type}")
    
    try:
        # Prepare the analysis prompt
        serpapi_summary = "SerpAPI Manual Results (First 10 search results):\n"
        if serpapi_results.get("success") and serpapi_results.get("results"):
            for result in serpapi_results["results"]:
                serpapi_summary += f"- {result['title']}\n  URL: {result['url']}\n  Description: {result['snippet']}\n  Is PDF: {result.get('is_pdf', False)}\n\n"
        else:
            serpapi_summary += "No SerpAPI manual results available\n"
        
        gpt_summary = "GPT Manual Web Search Results:\n"
        if gpt_results.get("success") and gpt_results.get("result"):
            gpt_result = gpt_results["result"]
            gpt_summary += f"Manual Title: {gpt_result.get('manual_title', 'None')}\n"
            gpt_summary += f"Manual URL: {gpt_result.get('manual_url', 'None')}\n"
            gpt_summary += f"Manufacturer Source: {gpt_result.get('manufacturer_source', False)}\n"
            gpt_summary += f"Document ID: {gpt_result.get('document_id', 'None')}\n"
            gpt_summary += f"File Format: {gpt_result.get('file_format', 'Unknown')}\n"
            gpt_summary += f"Confidence: {gpt_result.get('confidence', 0)}\n"
            gpt_summary += f"Sources: {', '.join(gpt_result.get('sources', []))}\n"
        else:
            gpt_summary += "No GPT manual web search results available\n"
        
        arbitrator_prompt = f"""
        You are an AI arbitrator analyzing two different search approaches for finding equipment manuals.
        
        ORIGINAL REQUEST:
        Equipment Make: {make}
        Equipment Model: {model}
        Year: {year or "Not specified"}
        Manual Type: {manual_type}
        
        SEARCH RESULTS TO ANALYZE:
        
        {serpapi_summary}
        
        {gpt_summary}
        
        TASK:
        Analyze both sets of manual search results and determine the best manual source for the requested equipment.
        Consider:
        1. Official manufacturer documentation vs third-party sources
        2. Direct PDF accessibility and download capability
        3. Match accuracy to the specific make/model/year
        4. Manual completeness and type accuracy
        5. Source reliability and authenticity
        6. Document currency (most recent version)
        
        CRITICAL: The selected manual MUST be for a {manual_type} for {make} {model}, not any other equipment.
        
        Return a JSON object with your decision:
        - selected_source: "serpapi" or "gpt_manual_web_search" or "none" (if neither is suitable)
        - manual_title: The title of the best manual found
        - manual_url: URL to access the manual
        - manufacturer_source: Whether this is from official manufacturer
        - document_id: Manual part number or document identifier
        - manual_type: Type of manual
        - file_format: Format of the manual file
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
                    {"role": "system", "content": "You are an expert AI arbitrator who analyzes different manual search results to select the most accurate and official equipment documentation. You do not have web search capabilities - you analyze only the provided search results to make your decision."},
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
                    {"role": "system", "content": "You are an expert AI arbitrator who analyzes different manual search results to select the most accurate and official equipment documentation. You do not have web search capabilities - you analyze only the provided search results to make your decision."},
                    {"role": "user", "content": arbitrator_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            raw_content = response.choices[0].message['content']
        
        # Parse arbitrator decision
        arbitrator_decision = json.loads(raw_content)
        
        logger.info(f"AI Manual Arbitrator selected: {arbitrator_decision.get('selected_source')} - Manual: {arbitrator_decision.get('manual_title')} (confidence: {arbitrator_decision.get('confidence', 0)})")
        logger.info(f"Manual Arbitrator reasoning: {arbitrator_decision.get('reasoning', 'No reasoning provided')}")
        
        return {
            "success": True,
            "arbitrator_decision": arbitrator_decision,
            "serpapi_data": serpapi_results,
            "gpt_data": gpt_results
        }
        
    except Exception as e:
        logger.error(f"Error in AI manual arbitrator: {e}")
        return {
            "success": False,
            "error": str(e),
            "arbitrator_decision": {
                "selected_source": "none",
                "manual_title": f"{make} {model} {manual_type}",
                "manual_url": None,
                "manufacturer_source": False,
                "document_id": None,
                "manual_type": manual_type,
                "file_format": "Unknown",
                "confidence": 0,
                "reasoning": f"Manual arbitrator failed: {str(e)}",
                "sources": [],
                "arbitrator_analysis": f"Error during analysis: {str(e)}"
            },
            "serpapi_data": serpapi_results,
            "gpt_data": gpt_results
        }

def ai_manual_arbitrator_multiple(serpapi_results, gpt_results, make, model, year=None, manual_type="service manual", max_results=5):
    """
    AI arbitrator that ranks and returns multiple manual results from both SerpAPI and GPT web search
    
    Args:
        serpapi_results (dict): Results from SerpAPI manual search
        gpt_results (dict): Results from GPT manual web search
        make (str): Equipment make
        model (str): Equipment model
        year (str, optional): Equipment year
        manual_type (str): Type of manual needed
        max_results (int): Maximum number of ranked results to return
        
    Returns:
        dict: Top ranked manual results from both sources
    """
    logger.info(f"AI manual arbitrator ranking multiple results for: {make} {model} {year} - {manual_type} (max {max_results})")
    
    try:
        # Prepare all available manual candidates
        manual_candidates = []
        
        # Add SerpAPI results
        if serpapi_results.get("success") and serpapi_results.get("results"):
            for idx, result in enumerate(serpapi_results["results"]):
                manual_candidates.append({
                    "manual_title": result.get('title', 'Unknown'),
                    "manual_url": result.get('url'),
                    "snippet": result.get('snippet', ''),
                    "source_type": "serpapi",
                    "position": idx + 1,
                    "is_pdf": result.get('is_pdf', False)
                })
        
        # Add GPT web search result
        if gpt_results.get("success") and gpt_results.get("result"):
            gpt_result = gpt_results["result"]
            if gpt_result.get('manual_url'):
                manual_candidates.append({
                    "manual_title": gpt_result.get('manual_title', 'Unknown'),
                    "manual_url": gpt_result.get('manual_url'),
                    "snippet": f"GPT found: {gpt_result.get('document_id', 'N/A')} - {gpt_result.get('file_format', 'Unknown')}",
                    "source_type": "gpt_manual_web_search",
                    "manufacturer_source": gpt_result.get('manufacturer_source', False),
                    "document_id": gpt_result.get('document_id'),
                    "file_format": gpt_result.get('file_format', 'Unknown'),
                    "position": 1
                })
        
        if not manual_candidates:
            return {
                "success": False,
                "error": "No manual candidates found",
                "ranked_manuals": []
            }
        
        # Prepare the ranking prompt
        candidates_summary = f"Available Manual Candidates ({len(manual_candidates)} total):\n\n"
        for idx, candidate in enumerate(manual_candidates):
            candidates_summary += f"CANDIDATE {idx + 1} ({candidate['source_type']}):\n"
            candidates_summary += f"  Title: {candidate['manual_title']}\n"
            candidates_summary += f"  URL: {candidate['manual_url']}\n"
            candidates_summary += f"  Description: {candidate['snippet']}\n"
            if candidate.get('document_id'):
                candidates_summary += f"  Document ID: {candidate['document_id']}\n"
            if candidate.get('file_format'):
                candidates_summary += f"  Format: {candidate['file_format']}\n"
            candidates_summary += f"  Source: {candidate['source_type']}\n\n"
        
        arbitrator_prompt = f"""
        You are an AI arbitrator tasked with ranking equipment manual search results to find the best manuals for the user.
        
        ORIGINAL REQUEST:
        Equipment Make: {make}
        Equipment Model: {model}
        Year: {year or "Not specified"}
        Manual Type: {manual_type}
        
        MANUAL CANDIDATES TO RANK:
        {candidates_summary}
        
        TASK:
        Analyze and rank ALL available manual candidates based on these criteria:
        1. RELEVANCE: Exact match to make/model/year/manual type
        2. AUTHENTICITY: Official manufacturer sources vs third-party
        3. COMPLETENESS: Full manuals vs excerpts or summaries
        4. ACCESSIBILITY: Direct PDF downloads vs webpage links
        5. CURRENCY: Recent/updated documentation
        6. DOCUMENT TYPE: Service manuals > Operation manuals > Parts catalogs
        
        CRITICAL: Return up to {max_results} manuals ranked from best to worst.
        
        Return a JSON object with your rankings:
        {{
            "ranked_manuals": [
                {{
                    "ranking": 1,
                    "manual_title": "Exact title from candidate",
                    "manual_url": "URL from candidate", 
                    "source_type": "serpapi or gpt_manual_web_search",
                    "manufacturer_source": true/false,
                    "document_id": "document ID if available",
                    "manual_type": "{manual_type}",
                    "file_format": "PDF/HTML/etc",
                    "confidence": 0.0-1.0,
                    "reasoning": "Why this manual ranks at this position",
                    "sources": ["source URLs"]
                }}
                // ... up to {max_results} manuals
            ],
            "ranking_methodology": "Overall approach used for ranking these manuals"
        }}
        
        IMPORTANT: 
        - Include ONLY manuals that are relevant to {make} {model}
        - Rank by quality and relevance, not just source type
        - Each manual must have a valid URL
        - Confidence should reflect how well it matches the request
        """
        
        # Get arbitrator ranking (WITHOUT web search)
        if USING_NEW_OPENAI_CLIENT:
            response = client.chat.completions.create(
                model="gpt-4o-mini",  # Use nano for arbitration, no web search needed
                messages=[
                    {"role": "system", "content": "You are an expert AI arbitrator who ranks technical documentation search results to help users find the most relevant and high-quality equipment manuals. You analyze search results to provide comprehensive rankings based on relevance, authenticity, and usefulness."},
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
                    {"role": "system", "content": "You are an expert AI arbitrator who ranks technical documentation search results to help users find the most relevant and high-quality equipment manuals. You analyze search results to provide comprehensive rankings based on relevance, authenticity, and usefulness."},
                    {"role": "user", "content": arbitrator_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            raw_content = response.choices[0].message['content']
        
        # Parse arbitrator rankings
        arbitrator_rankings = json.loads(raw_content)
        ranked_manuals = arbitrator_rankings.get("ranked_manuals", [])
        
        # Limit to max_results
        ranked_manuals = ranked_manuals[:max_results]
        
        logger.info(f"AI Manual Arbitrator ranked {len(ranked_manuals)} manuals")
        for idx, manual in enumerate(ranked_manuals):
            logger.info(f"  #{idx+1}: {manual.get('manual_title')} (confidence: {manual.get('confidence', 0)}, source: {manual.get('source_type')})")
        
        return {
            "success": True,
            "ranked_manuals": ranked_manuals,
            "ranking_methodology": arbitrator_rankings.get("ranking_methodology", "Standard relevance-based ranking"),
            "total_candidates": len(manual_candidates),
            "serpapi_data": serpapi_results,
            "gpt_data": gpt_results
        }
        
    except Exception as e:
        logger.error(f"Error in AI manual arbitrator multiple: {e}")
        return {
            "success": False,
            "error": str(e),
            "ranked_manuals": [],
            "serpapi_data": serpapi_results,
            "gpt_data": gpt_results
        }

def find_manual_with_dual_search(make, model, year=None, manual_type="service manual", bypass_cache=False, max_results=5):
    """
    Main function implementing the dual search approach for equipment manuals:
    1. Get first 10 SerpAPI search results for manuals directly
    2. Use GPT-4o with web search preview to find official manuals  
    3. Send both results to AI arbitrator to rank and return top results
    
    Args:
        make (str): Equipment make
        model (str): Equipment model
        year (str, optional): Equipment year
        manual_type (str): Type of manual needed
        bypass_cache (bool): Whether to bypass cache
        max_results (int): Maximum number of results to return (default 5)
        
    Returns:
        list: Top manual results ranked by AI arbitrator
    """
    logger.info(f"Starting dual manual search for: {make} {model} {year} - {manual_type} (max {max_results} results)")
    
    try:
        # Step 1: Get SerpAPI manual results
        logger.info("Step 1: Getting SerpAPI manual results...")
        serpapi_results = get_serpapi_manual_results(make, model, year, manual_type, bypass_cache)
        
        # Step 2: Get GPT manual web search results  
        logger.info("Step 2: Getting GPT manual web search results...")
        gpt_results = get_gpt_manual_web_search_result(make, model, year, manual_type)
        
        # Step 3: AI arbitrator ranks all results
        logger.info("Step 3: AI manual arbitrator ranking all results...")
        final_result = ai_manual_arbitrator_multiple(serpapi_results, gpt_results, make, model, year, manual_type, max_results)
        
        if final_result.get("success"):
            ranked_manuals = final_result["ranked_manuals"]
            
            # Format the results in the expected format for compatibility
            formatted_results = []
            for idx, manual in enumerate(ranked_manuals):
                formatted_result = {
                    "manual_title": manual.get("manual_title"),
                    "manual_url": manual.get("manual_url"),
                    "manufacturer_source": manual.get("manufacturer_source", False),
                    "document_id": manual.get("document_id"),
                    "manual_type": manual.get("manual_type", manual_type),
                    "file_format": manual.get("file_format", "Unknown"),
                    "confidence": manual.get("confidence", 0),
                    "sources": manual.get("sources", []),
                    "source": "dual_manual_search",
                    "selected_method": manual.get("source_type"),
                    "arbitrator_reasoning": manual.get("reasoning"),
                    "ranking_position": idx + 1,
                    "serpapi_count": len(serpapi_results.get("results", [])),
                    "gpt_web_success": gpt_results.get("success", False)
                }
                formatted_results.append(formatted_result)
            
            logger.info(f"Dual manual search completed. Found {len(formatted_results)} ranked results")
            return formatted_results
        else:
            logger.error("Dual manual search failed in arbitrator")
            return [{
                "manual_title": f"{make} {model} {manual_type}",
                "manual_url": None,
                "manufacturer_source": False,
                "document_id": None,
                "manual_type": manual_type,
                "file_format": "Unknown",
                "confidence": 0,
                "error": final_result.get("error", "Manual arbitrator failed"),
                "source": "dual_manual_search",
                "sources": []
            }]
            
    except Exception as e:
        logger.error(f"Error in dual manual search: {e}")
        return [{
            "manual_title": f"{make} {model} {manual_type}",
            "manual_url": None,
            "manufacturer_source": False,
            "document_id": None,
            "manual_type": manual_type,
            "file_format": "Unknown",
            "confidence": 0,
            "error": str(e),
            "source": "dual_manual_search", 
            "sources": []
        }]