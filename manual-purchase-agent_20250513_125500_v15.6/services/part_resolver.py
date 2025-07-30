import json
import logging
import time
import requests
from config import Config
from models import db, Part
from flask import current_app
from contextlib import contextmanager

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

@contextmanager
def get_app_context():
    """Get Flask app context for database operations"""
    try:
        # Check if we're already in an app context
        if current_app:
            yield
            return
    except RuntimeError:
        # We're not in an app context, create one
        from app import create_app
        app = create_app()
        with app.app_context():
            yield

def evaluate_part_number_quality(part_number):
    """
    Evaluate the quality of a part number to detect placeholders or invalid formats
    
    Returns:
        float: Quality score from 0 to 1 (1 being highest quality)
    """
    if not part_number:
        return 0.0
    
    part_str = str(part_number).upper()
    
    # Check for obvious placeholders and problematic patterns
    placeholder_patterns = [
        'XXXX', 'XXXXX', '####', '#####', 
        '101XXXX', '100XXX', 'PARTNUM',
        'UNKNOWN', 'N/A', 'NA', 'TBD',
        'PLACEHOLDER', 'TEMP', 'TEST',
        'SEE DRAWING', 'DRAWING', 'CONTACT',
        'NOT SHOWN', 'VARIES', 'REFER TO',
        'CHECK MANUAL', 'CONSULT', 'VARIES BY'
    ]
    
    for pattern in placeholder_patterns:
        if pattern in part_str:
            return 0.0
    
    # Check for too short or too long
    if len(part_str) < 4 or len(part_str) > 20:
        return 0.2
    
    # Check for reasonable format (mix of letters and numbers is good)
    has_letters = any(c.isalpha() for c in part_str)
    has_numbers = any(c.isdigit() for c in part_str)
    
    if has_letters and has_numbers:
        return 1.0  # Best format
    elif has_numbers and not has_letters:
        return 0.8  # Numbers only is okay
    elif has_letters and not has_numbers:
        return 0.4  # Letters only is suspicious
    
    return 0.5

def select_best_part_result(results, description, make=None, model=None):
    """
    Intelligently select the best part result from multiple sources
    
    Args:
        results (dict): Dictionary containing database_result, manual_search_result, ai_web_search_result
        description (str): Original part description
        make (str): Equipment make
        model (str): Equipment model
        
    Returns:
        dict: The best result with reason for selection
    """
    candidates = []
    
    # Evaluate each result
    for source, result in results.items():
        if not result or not isinstance(result, dict):
            continue
            
        if result.get('found') and result.get('oem_part_number'):
            part_num = result['oem_part_number']
            
            # Calculate composite score (ALIGNED WITH PROCESSOR)
            method_confidence = result.get('confidence', 0.0)
            validation_confidence = 0.0
            
            # Check SerpAPI validation
            if result.get('serpapi_validation'):
                validation = result['serpapi_validation']
                if validation.get('is_valid'):
                    validation_confidence = validation.get('confidence_score', 0.0)
            
            # Simple composite score matching processor logic: method confidence + validation boost
            composite_score = method_confidence + (validation_confidence * 0.1)
            
            # Keep quality score for backward compatibility but don't use in main scoring
            quality_score = evaluate_part_number_quality(part_num)
            
            candidates.append({
                'source': source,
                'result': result,
                'part_number': part_num,
                'quality_score': quality_score,
                'confidence_score': method_confidence,  # Use method_confidence
                'validation_score': validation_confidence,  # Use validation_confidence  
                'composite_score': composite_score
            })
    
    if not candidates:
        return None
    
    # Sort by composite score
    candidates.sort(key=lambda x: x['composite_score'], reverse=True)
    best_candidate = candidates[0]
    
    # Log the decision
    logger.info(f"Part selection analysis for '{description}':")
    for candidate in candidates:
        logger.info(f"  {candidate['source']}: {candidate['part_number']} "
                   f"(quality={candidate['quality_score']:.2f}, "
                   f"confidence={candidate['confidence_score']:.2f}, "
                   f"validation={candidate['validation_score']:.2f}, "
                   f"composite={candidate['composite_score']:.2f})")
    logger.info(f"  Selected: {best_candidate['source']} - {best_candidate['part_number']}")
    
    # Return the best result with selection metadata
    best_result = best_candidate['result'].copy()
    best_result['selection_metadata'] = {
        'selected_from': best_candidate['source'],
        'quality_score': best_candidate['quality_score'],
        'composite_score': best_candidate['composite_score'],
        'all_candidates': [
            {
                'source': c['source'],
                'part_number': c['part_number'],
                'score': c['composite_score']
            } for c in candidates
        ]
    }
    
    return best_result

def call_gpt_for_analysis(prompt, max_tokens=32768):
    """
    Call GPT for text analysis with consistent error handling
    
    Args:
        prompt: The prompt to send to GPT
        max_tokens: Maximum tokens for the response (default 32K for GPT-4.1-Nano)
        
    Returns:
        str: The GPT response text or None on error
    """
    try:
        if USING_NEW_OPENAI_CLIENT:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a technical assistant that extracts specific information from text. Using GPT-4.1-Nano for precise analysis."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=max_tokens,
                temperature=0.1
            )
            return response.choices[0].message.content.strip()
        else:
            import openai
            response = openai.ChatCompletion.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a technical assistant that extracts specific information from text. Using GPT-4.1-Nano for precise analysis."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=max_tokens,
                temperature=0.1
            )
            return response.choices[0].message['content'].strip()
    except Exception as e:
        logger.error(f"Error calling GPT for analysis: {str(e)}")
        return None

def resolve_part_name(description, make=None, model=None, year=None, 
                  use_database=True, use_manual_search=True, use_web_search=True, save_results=True,
                  bypass_cache=False):
    """
    Enhanced part resolution with SerpAPI validation.
    Resolves a generic part description to OEM part numbers using:
    1. Database lookup
    2. Manual search and GPT analysis
    3. Web search with GPT
    4. SerpAPI validation of found part numbers
    
    Args:
        description (str): Generic part description
        make (str, optional): Vehicle/device make
        model (str, optional): Vehicle/device model
        year (str, optional): Vehicle/device year
        use_database (bool, optional): Whether to search in the database. Defaults to True.
        use_manual_search (bool, optional): Whether to search in manuals. Defaults to True.
        use_web_search (bool, optional): Whether to search on the web. Defaults to True.
        save_results (bool, optional): Whether to save results to database. Defaults to True.
        bypass_cache (bool, optional): Whether to bypass all caching and perform fresh searches. Defaults to False.
        
    Returns:
        dict: Enhanced response with separate AI/manual results and assessments
    """
    # Initialize response structure first to ensure it's always available
    response = {
        "query": {
            "description": description,
            "make": make,
            "model": model,
            "year": year
        },
        "database_result": None,
        "manual_search_result": None,
        "ai_web_search_result": None,
        "search_methods_used": {
            "database": use_database,
            "manual_search": use_manual_search,
            "web_search": use_web_search
        }
    }
    
    try:
        logger.info(f"Resolving part: {description} for {make} {model} {year}")
        logger.info(f"Search toggles: DB={use_database}, Manual={use_manual_search}, Web={use_web_search}, Save={save_results}, Bypass Cache={bypass_cache}")
        logger.info(f"Response initialized: {response is not None}")
        
        # Check for exact match first (skip if bypass_cache is True)
        if use_database and not bypass_cache:
            exact_match = find_exact_match(description, make, model, year)
            if exact_match:
                logger.info(f"Found exact match in database: {exact_match.oem_part_number}")
                response["database_result"] = {
                    "found": True,
                    "oem_part_number": exact_match.oem_part_number,
                    "manufacturer": exact_match.manufacturer,
                    "description": exact_match.description,
                    "confidence": 1.0,
                    "alternate_part_numbers": exact_match.get_alternate_part_numbers() if exact_match.alternate_part_numbers else [],
                    "serpapi_validation": validate_part_with_serpapi(exact_match.oem_part_number, make, model, description, bypass_cache)
                }
        elif bypass_cache:
            logger.info("Bypassing database cache due to bypass_cache=True")
        
        # Execute manual search if requested
        if use_manual_search:
            manual_result = find_part_in_manuals(description, make, model, year, bypass_cache)
            # Check if we got a valid part number (not empty, not placeholder)
            if (manual_result and 
                manual_result.get("oem_part_number") and 
                not manual_result.get("placeholder_rejected", False)):
                # Validate with SerpAPI
                validation = validate_part_with_serpapi(manual_result["oem_part_number"], make, model, description, bypass_cache)
                response["manual_search_result"] = {
                    "found": True,
                    "oem_part_number": manual_result["oem_part_number"],
                    "manufacturer": manual_result.get("manufacturer"),
                    "description": manual_result.get("description"),
                    "confidence": manual_result.get("confidence", 0),
                    "manual_source": manual_result.get("manual_source", "Unknown manual"),
                    "alternate_part_numbers": manual_result.get("alternate_part_numbers", []),
                    "serpapi_validation": validation
                }
            else:
                response["manual_search_result"] = {
                    "found": False,
                    "error": manual_result.get("error") if manual_result and isinstance(manual_result, dict) else "No manual found",
                    "confidence": 0
                }
        
        # Execute AI web search if requested (using new dual search approach)
        if use_web_search:
            from services.dual_search import find_part_with_dual_search
            web_result = find_part_with_dual_search(description, make, model, year, bypass_cache)
            if web_result and web_result.get("oem_part_number"):
                # Validate with SerpAPI
                validation = validate_part_with_serpapi(web_result["oem_part_number"], make, model, description, bypass_cache)
                response["ai_web_search_result"] = {
                    "found": True,
                    "oem_part_number": web_result["oem_part_number"],
                    "manufacturer": web_result.get("manufacturer"),
                    "description": web_result.get("description"),
                    "confidence": web_result.get("confidence", 0),
                    "sources": web_result.get("sources", []),
                    "alternate_part_numbers": web_result.get("alternate_part_numbers", []),
                    "serpapi_validation": validation,
                    # NEW: Dual search specific fields
                    "selected_method": web_result.get("selected_method"),
                    "arbitrator_reasoning": web_result.get("arbitrator_reasoning"),
                    "arbitrator_analysis": web_result.get("arbitrator_analysis"),
                    "serpapi_count": web_result.get("serpapi_count", 0),
                    "gpt_web_success": web_result.get("gpt_web_success", False),
                    "source": "dual_search"
                }
            else:
                response["ai_web_search_result"] = {
                    "found": False,
                    "error": web_result.get("error") if web_result and isinstance(web_result, dict) else "No results found",
                    "confidence": 0,
                    "serpapi_count": web_result.get("serpapi_count", 0) if web_result else 0,
                    "gpt_web_success": web_result.get("gpt_web_success", False) if web_result else False,
                    "source": "dual_search"
                }
        
        # Add comparison if both methods found results
        manual_result = response.get("manual_search_result") or {} if response else {}
        ai_result = response.get("ai_web_search_result") or {} if response else {}
        if (manual_result.get("found") and ai_result.get("found")):
            manual_pn = response["manual_search_result"]["oem_part_number"]
            ai_pn = response["ai_web_search_result"]["oem_part_number"]
            
            comparison = {
                "part_numbers_match": manual_pn.lower() == ai_pn.lower() if manual_pn and ai_pn else False,
                "manual_part_number": manual_pn,
                "ai_part_number": ai_pn
            }
            
            # If both parts are validated as correct, compare them
            manual_valid = response["manual_search_result"].get("serpapi_validation", {}).get("is_valid", False)
            ai_valid = response["ai_web_search_result"].get("serpapi_validation", {}).get("is_valid", False)
            
            if manual_valid and ai_valid and not comparison["part_numbers_match"]:
                # Get the part descriptions from validation
                manual_desc = response["manual_search_result"]["serpapi_validation"].get("part_description", "")
                ai_desc = response["ai_web_search_result"]["serpapi_validation"].get("part_description", "")
                
                # Compare the two valid parts
                comparison["difference_analysis"] = compare_valid_parts(
                    manual_pn, manual_desc,
                    ai_pn, ai_desc,
                    description, make, model
                )
            
            response["comparison"] = comparison
        
        # Intelligently select the best result
        all_results = {
            "database_result": response.get("database_result"),
            "manual_search_result": response.get("manual_search_result"),
            "ai_web_search_result": response.get("ai_web_search_result")
        }
        
        best_result = select_best_part_result(all_results, description, make, model)
        
        # Check if we have any valid results or if we should trigger similar parts search
        should_trigger_similar_parts = False
        all_results_invalid = True
        
        # Check if all results either don't exist or failed validation
        for result_type, result in all_results.items():
            if result and result.get('found'):
                validation = result.get('serpapi_validation', {})
                if validation.get('is_valid', False):
                    all_results_invalid = False
                    break
        
        # Also check for problematic part numbers that indicate we found wrong results
        if best_result:
            part_num = best_result.get('oem_part_number', '')
            validation = best_result.get('serpapi_validation', {})
            is_valid = validation.get('is_valid', False)
            confidence = validation.get('confidence_score', 0)
            
            # Trigger similar parts if:
            # 1. Part number looks like a placeholder or drawing reference
            # 2. Part number equals the model number (indicates wrong result)
            # 3. Validation failed or very low confidence
            problematic_indicators = [
                'SEE DRAWING', 'DRAWING', 'CONTACT', 'NOT SHOWN', 'VARIES',
                model if model else '', make if make else ''
            ]
            
            is_problematic = any(indicator in part_num.upper() for indicator in problematic_indicators if indicator)
            is_model_number = part_num == model or part_num == f"{make} {model}".strip()
            
            if is_problematic or is_model_number or not is_valid or confidence < 0.3:
                should_trigger_similar_parts = True
                logger.warning(f"Triggering similar parts search: problematic={is_problematic}, model_match={is_model_number}, valid={is_valid}, confidence={confidence}")
        
        # If all results are invalid or problematic, trigger similar parts search
        # NEW DECISION TREE LOGIC: Similar parts search
        should_search_similar = False
        
        if best_result and best_result.get('oem_part_number'):  # OEM part found
            validation = best_result.get('serpapi_validation', {})
            is_verified = validation.get('is_valid', False)
            has_alternates = bool(best_result.get('alternate_part_numbers'))
            
            if is_verified:
                if not has_alternates:  # OEM Verified + No Alternates → Search similar
                    should_search_similar = True
                    logger.info("OEM verified but no alternates found - searching similar parts")
                else:  # OEM Verified + Has Alternates → Stop
                    logger.info("OEM verified with alternates found - no similar search needed")
            else:  # not verified
                if not has_alternates:  # OEM Not Verified + No Alternates → Search similar
                    should_search_similar = True
                    logger.info("OEM not verified and no alternates found - searching similar parts")
                else:  # OEM Not Verified + Has Alternates → Stop
                    logger.info("OEM not verified but alternates found - no similar search needed")
        else:  # No OEM Found → Search similar
            should_search_similar = True
            logger.info("No OEM part found - searching similar parts")
        
        # Legacy fallback: Also search similar if all results are invalid or problematic
        if all_results_invalid or should_trigger_similar_parts:
            should_search_similar = True
            logger.info("All search results failed validation or are problematic - searching similar parts")
        
        # Search similar parts if decision tree indicates we should
        if should_search_similar:
            try:
                similar_parts = find_similar_parts(description, make, model, year, 
                                                 failed_part_number=best_result.get('oem_part_number') if best_result else None, 
                                                 max_results=5)
                response["similar_parts_triggered"] = True
                response["similar_parts"] = similar_parts
                
                # NEW: Don't override good results just because similar parts were found
                if all_results_invalid or should_trigger_similar_parts:
                    response["recommendation_reason"] = "Primary search methods returned invalid results. Found similar parts for review."
                    response["recommended_result"] = None
                else:
                    response["recommendation_reason"] = f"Selected {best_result.get('selection_metadata', {}).get('selected_from', 'best')} result. Similar parts also available for review."
                    response["recommended_result"] = best_result
                    
            except Exception as e:
                logger.error(f"Error in similar parts search: {e}")
                response["similar_parts_triggered"] = False
                response["recommended_result"] = best_result
        else:
            response["recommended_result"] = best_result
            if best_result:
                response["recommendation_reason"] = (
                    f"Selected {best_result['selection_metadata']['selected_from']} result "
                    f"with part number {best_result['oem_part_number']} "
                    f"(quality score: {best_result['selection_metadata']['quality_score']:.2f}, "
                    f"composite score: {best_result['selection_metadata']['composite_score']:.2f})"
                )
            else:
                response["recommendation_reason"] = "No valid part numbers found in any search method"
        
        # Save results if enabled and we have high confidence results
        logger.info(f"About to save results: save_results={save_results}, response is None: {response is None}")
        if save_results and response is not None:
            # Use the intelligently selected best result
            best_result = response.get("recommended_result")
            
            if best_result and best_result.get("oem_part_number"):
                try:
                    save_part_match(
                        description=description,
                        oem_part_number=best_result["oem_part_number"],
                        manufacturer=best_result.get("manufacturer", make),
                        detailed_description=best_result.get("description", ""),
                        alternate_part_numbers=best_result.get("alternate_part_numbers", [])
                    )
                except Exception as e:
                    logger.error(f"Error saving part match: {e}")
    
        return response
    except Exception as e:
        logger.error(f"Error in resolve_part_name: {e}", exc_info=True)
        logger.error(f"Error occurred with response state: {response if 'response' in locals() else 'response not defined'}")
        # Return a basic error response
        return {
            "query": {
                "description": description,
                "make": make,
                "model": model,
                "year": year
            },
            "database_result": None,
            "manual_search_result": None,
            "ai_web_search_result": None,
            "search_methods_used": {
                "database": use_database,
                "manual_search": use_manual_search,
                "web_search": use_web_search
            },
            "error": str(e)
        }

def find_part_with_dual_search(description, make=None, model=None, year=None, bypass_cache=False):
    """
    New dual search approach:
    1. Get first 10 SerpAPI search results directly
    2. Use GPT-4.1-nano with web search preview to find the answer
    3. Send both results to AI arbitrator without web search to pick the best answer
    
    Args:
        description (str): Generic part description
        make (str, optional): Vehicle/device make
        model (str, optional): Vehicle/device model
        year (str, optional): Vehicle/device year
        bypass_cache (bool): Whether to bypass cache
        
    Returns:
        dict: Best part information selected by AI arbitrator
    """
    logger.info(f"Searching for part via web: {description} for {make} {model} {year}")
    
    try:
        import requests
        from config import Config
        
        # Construct search query for finding OEM part numbers
        search_query = f"{description}"
        if make:
            search_query += f" {make}"
        if model:
            search_query += f" {model}"
        if year:
            search_query += f" {year}"
        search_query += " OEM part number specifications"
        
        # Search parameters for SerpAPI
        search_params = {
            "api_key": Config.SERPAPI_KEY,
            "engine": "google",
            "q": search_query,
            "num": 10,
            "gl": "us",
            "hl": "en"
        }
        
        # Add cache-busting if needed
        if bypass_cache:
            import time
            search_params["no_cache"] = "true"
            search_params["t"] = str(int(time.time()))
            logger.info(f"Bypassing SerpAPI cache for web search: {description}")
        
        # Make the request
        try:
            api_response = requests.get("https://serpapi.com/search", params=search_params, timeout=30)
            api_response.raise_for_status()
            results = api_response.json()
        except requests.exceptions.Timeout:
            logger.error("SerpAPI request timed out after 30 seconds")
            return {
                "oem_part_number": None,
                "manufacturer": make if make else None,
                "description": description,
                "confidence": 0,
                "error": "API timeout occurred",
                "source": "web_search",
                "sources": [],
                "alternate_part_numbers": []
            }
        except Exception as e:
            logger.error(f"Error searching with SerpAPI: {e}")
            return {
                "oem_part_number": None,
                "manufacturer": make if make else None,
                "description": description,
                "confidence": 0,
                "error": str(e),
                "source": "web_search",
                "sources": [],
                "alternate_part_numbers": []
            }
        
        # Extract search results for GPT context
        search_context = ""
        sources = []
        
        # Process organic results
        if "organic_results" in results:
            for idx, result in enumerate(results.get("organic_results", [])[:5]):
                search_context += f"Source {idx+1}: {result.get('title', 'Unknown')}\n"
                search_context += f"URL: {result.get('link', 'No URL')}\n"
                search_context += f"Description: {result.get('snippet', 'No description')}\n\n"
                
                sources.append({
                    "name": result.get('title', 'Unknown'),
                    "url": result.get('link', 'No URL')
                })
        
        # Log the search context
        logger.info(f"Found {len(sources)} search results for GPT analysis")
        
        # Log the search context being sent to GPT
        print("\n========= SEARCH CONTEXT FOR GPT =========")
        print(search_context or "No search context available")
        print("==========================================\n")
        
        # Create prompt for GPT with search results
        prompt = f"""
        Find the OEM part number for this part by analyzing these search results:
        
        Part Description: {description}
        {f"Make: {make}" if make else ""}
        {f"Model: {model}" if model else ""}
        {f"Year: {year}" if year else ""}
        
        SEARCH RESULTS:
        {search_context if search_context else "No search results available. Use your knowledge to make a best estimate."}
        
        CRITICAL REQUIREMENT: The part you identify MUST match the TYPE of part requested.
        For example:
        - If the user asks for a "fan", you MUST find a FAN part number (not a thermocouple, sensor, or other component)
        - If the user asks for a "thermostat", you MUST find a THERMOSTAT (not a thermometer or temperature sensor)
        - If the user asks for a "motor", you MUST find a MOTOR (not a capacitor or relay)
        
        The user specifically requested: "{description}"
        
        IMPORTANT INSTRUCTIONS:
        1. Extract the exact OEM (Original Equipment Manufacturer) part number from the search results
        2. VERIFY that this part is actually a {description} and not some other component type
        3. Ensure the part is compatible with the specified make and model
        4. Manufacturer name should match the actual maker of the OEM part
        5. Look for patterns like "OEM Part #XXXXX" or "Part Number: XXXXX" in the search results
        6. Provide a clear, detailed description that confirms this is the correct part type
        7. CRITICAL: DO NOT return the equipment model number ({model}) as a part number - it must be a specific component part number
        8. The part number should be different from the model number and represent a specific replaceable component
        
        Return a JSON object with:
        - oem_part_number: The specific OEM part number (must be the EXACT manufacturer part number)
        - manufacturer: The manufacturer name that matches the OEM part number
        - description: A detailed description of the part including its function and confirming it matches the requested type
        - part_type_match: boolean - does this part match the type requested (is it actually a {description})?
        - confidence: A number between 0 and 1 indicating your confidence (set to 0 if part type doesn't match)
        - alternate_part_numbers: Any alternative part numbers found in the search results
        - sources: Array of source names where you found this information
        
        If the part found does NOT match the type requested, set confidence to 0 and explain the mismatch.
        If you cannot find the part with at least 60% confidence, set confidence to a low value and explain what information is missing.
        """
        
        # Generate completion with GPT-4.1-Nano - handle both client versions
        if USING_NEW_OPENAI_CLIENT:
            ai_response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a parts specialist who analyzes search results to find precise OEM part numbers. You carefully extract information from search results and only provide accurate manufacturer part numbers that you find in the provided sources. You MUST ensure the part type matches what was requested - if user asks for a fan, find a fan, not some other component. Using GPT-4.1-Nano for comprehensive analysis."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            # Get the raw response content
            raw_content = ai_response.choices[0].message.content
        else:
            import openai
            ai_response = openai.ChatCompletion.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a parts specialist who analyzes search results to find precise OEM part numbers. You carefully extract information from search results and only provide accurate manufacturer part numbers that you find in the provided sources. You MUST ensure the part type matches what was requested - if user asks for a fan, find a fan, not some other component. Using GPT-4.1-Nano for comprehensive analysis."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            # Get the raw response content
            raw_content = ai_response.choices[0].message['content']
        
        # Log the raw response from GPT
        print("\n========= GPT WEB SEARCH RESPONSE =========")
        print(raw_content)
        print("==========================================\n")
        
        # Parse the result
        result = json.loads(raw_content)
        
        # Add source information
        result["source"] = "web_search"
        
        # Add sources if not provided by GPT
        if "sources" not in result or not result["sources"]:
            result["sources"] = sources
        
        # Additional validation: if part type doesn't match, reduce confidence to 0
        if result.get("part_type_match") is False:
            logger.warning(f"Part type mismatch in web search: requested '{description}' but found {result.get('description', 'unknown')}")
            result["confidence"] = 0
            result["part_type_mismatch_warning"] = f"Requested {description} but found {result.get('description', 'different part type')}"
        
        # Check if the returned part number is actually the model number
        part_num = result.get("oem_part_number", "")
        if model and part_num == model:
            logger.warning(f"Part type mismatch in web search: requested '{description}' but found OEM power cord for {make} model {model}, used to connect the machine to power supply. The part number {model} is explicitly associated with the power supply component of the machine, indicating it is the OEM power cord or a closely related power supply component.")
            result["confidence"] = 0
            result["model_number_warning"] = f"Returned model number {model} instead of a specific part number"
            
        # Log what was found
        if result.get("oem_part_number"):
            logger.info(f"Web search found OEM part number: {result['oem_part_number']} (confidence: {result.get('confidence', 0)})")
        else:
            logger.info(f"Web search did not find a confident OEM part number match")
        
        return result
    
    except Exception as e:
        logger.error(f"Error finding part with web search: {e}")
        return {
            "oem_part_number": None,
            "manufacturer": make if make else None,
            "description": description, # Include the original description
            "confidence": 0,
            "error": str(e),
            "source": "web_search",
            "sources": [],
            "alternate_part_numbers": [],
            # Ensure all fields that might be accessed are initialized
            "manual_source": None,
            "part_found_in_manual": False,
        }

# Define stub functions that might be referenced by other parts of the system
def find_part_in_manuals(description, make=None, model=None, year=None, bypass_cache=False):
    """
    Find part numbers in technical manuals using SerpAPI + GPT-4.1-Nano analysis
    
    Args:
        description (str): Part description to search for
        make (str, optional): Equipment make
        model (str, optional): Equipment model
        year (str, optional): Equipment year
        bypass_cache (bool, optional): Whether to bypass SerpAPI cache
        
    Returns:
        dict: Manual search result with part number, confidence, source info
    """
    if not description:
        return {"error": "No description provided", "oem_part_number": None}
    
    logger.info(f"Searching manuals for: {description} - {make} {model} {year}")
    
    try:
        import requests
        from config import Config
        
        # Construct manual search query
        search_query = f"{description}"
        if make:
            search_query += f" {make}"
        if model:
            search_query += f" {model}"
        if year:
            search_query += f" {year}"
        search_query += " manual parts list OEM part number PDF"
        
        # Search parameters for SerpAPI
        search_params = {
            "api_key": Config.SERPAPI_KEY,
            "engine": "google",
            "q": search_query,
            "num": 10,
            "gl": "us",
            "hl": "en",
            "tbm": "web"  # Include PDFs and documents
        }
        
        # Add cache-busting if needed
        if bypass_cache:
            import time
            search_params["no_cache"] = "true"
            search_params["t"] = str(int(time.time()))
            logger.info(f"Bypassing SerpAPI cache for manual search: {description}")
        
        # Make the request
        try:
            api_response = requests.get("https://serpapi.com/search", params=search_params, timeout=30)
            api_response.raise_for_status()
            results = api_response.json()
        except requests.exceptions.Timeout:
            logger.error("SerpAPI manual search timed out")
            return {"error": "Manual search timeout", "oem_part_number": None}
        except Exception as e:
            logger.error(f"Error searching manuals with SerpAPI: {e}")
            return {"error": str(e), "oem_part_number": None}
        
        # Extract search results focusing on manuals and technical documents
        search_context = ""
        manual_sources = []
        
        # Process organic results
        if "organic_results" in results:
            for idx, result in enumerate(results.get("organic_results", [])[:8]):
                title = result.get('title', 'Unknown')
                url = result.get('link', 'No URL')
                snippet = result.get('snippet', 'No description')
                
                # Prioritize manual-like content
                is_manual = any(keyword in title.lower() + snippet.lower() + url.lower() 
                              for keyword in ['manual', 'parts', 'service', 'repair', 'maintenance', 'pdf', 'specification'])
                
                if is_manual or idx < 4:  # Include first 4 results regardless
                    search_context += f"Source {idx+1}: {title}\n"
                    search_context += f"URL: {url}\n"
                    search_context += f"Content: {snippet}\n"
                    search_context += f"Manual-related: {is_manual}\n\n"
                    
                    manual_sources.append({
                        "name": title,
                        "url": url,
                        "is_manual": is_manual
                    })
        
        logger.info(f"Found {len(manual_sources)} manual sources for GPT analysis")
        
        # Create manual analysis prompt for GPT
        prompt = f"""
        Extract OEM part numbers from these manual and technical document search results:
        
        Looking for: {description}
        {f"Make: {make}" if make else ""}
        {f"Model: {model}" if model else ""}
        {f"Year: {year}" if year else ""}
        
        SEARCH RESULTS FROM MANUALS/TECHNICAL DOCS:
        {search_context if search_context else "No manual search results found."}
        
        EXTRACTION REQUIREMENTS:
        1. Look for exact OEM part numbers in service manuals, parts lists, or technical documentation
        2. Focus on official manufacturer documents and authorized dealer materials
        3. Verify the part number matches the requested component type ({description})
        4. Prefer part numbers from official manuals over third-party sources
        5. Extract any alternate or compatible part numbers mentioned
        
        CRITICAL: The part you identify MUST be for a {description} specifically.
        
        Return a JSON object with:
        - oem_part_number: The primary OEM part number found (or null if none found)
        - manufacturer: The manufacturer associated with this part number
        - description: Description of the part function from the manual
        - confidence: Confidence level 0.0-1.0 based on source quality and clarity
        - manual_source: Name/description of the manual or document where found
        - alternate_part_numbers: Array of any alternate part numbers found
        - part_found_in_manual: Boolean indicating if part was actually found in manual content
        
        If no reliable part number is found in manual sources, return oem_part_number as null.
        """
        
        # Get GPT manual analysis
        if USING_NEW_OPENAI_CLIENT:
            ai_response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a technical manual specialist who extracts precise OEM part numbers from service manuals and technical documentation. You carefully analyze manual content and only extract verified part numbers from official sources. Using GPT-4.1-Nano for comprehensive manual analysis."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            raw_content = ai_response.choices[0].message.content
        else:
            import openai
            ai_response = openai.ChatCompletion.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a technical manual specialist who extracts precise OEM part numbers from service manuals and technical documentation. You carefully analyze manual content and only extract verified part numbers from official sources. Using GPT-4.1-Nano for comprehensive manual analysis."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            raw_content = ai_response.choices[0].message['content']
        
        # Parse the manual analysis result
        manual_result = json.loads(raw_content)
        
        # Add source information
        manual_result["source"] = "manual_search"
        manual_result["sources"] = manual_sources
        
        # Log what was found
        if manual_result.get("oem_part_number"):
            logger.info(f"Manual search found part: {manual_result['oem_part_number']} (confidence: {manual_result.get('confidence', 0)})")
        else:
            logger.info("Manual search did not find a confident part number match")
        
        return manual_result
        
    except Exception as e:
        logger.error(f"Error in manual search: {e}")
        return {
            "error": str(e),
            "oem_part_number": None,
            "manufacturer": make if make else None,
            "description": description,
            "confidence": 0,
            "manual_source": None,
            "alternate_part_numbers": [],
            "part_found_in_manual": False,
            "source": "manual_search"
        }

def find_exact_match(description, make=None, model=None, year=None):
    """
    Find exact part matches in the database
    
    Args:
        description (str): Part description to search for
        make (str, optional): Equipment make
        model (str, optional): Equipment model
        year (str, optional): Equipment year
        
    Returns:
        Part: Database Part object if found, None otherwise
    """
    try:
        with get_app_context():
            # Try exact description match first
            query = Part.query.filter(Part.description.ilike(f"%{description}%"))
            
            if make:
                query = query.filter(Part.manufacturer.ilike(f"%{make}%"))
            
            # Try to find exact match
            exact_match = query.first()
            
            if exact_match:
                logger.info(f"Found exact database match: {exact_match.oem_part_number}")
                return exact_match
            
            # Try fuzzy matching on description
            fuzzy_query = Part.query.filter(
                Part.description.ilike(f"%{description.split()[0]}%")
            )
            
            if make:
                fuzzy_query = fuzzy_query.filter(Part.manufacturer.ilike(f"%{make}%"))
            
            fuzzy_match = fuzzy_query.first()
            
            if fuzzy_match:
                logger.info(f"Found fuzzy database match: {fuzzy_match.oem_part_number}")
                return fuzzy_match
                
            return None
            
    except Exception as e:
        logger.error(f"Error in database search: {e}")
        return None

def find_similar_parts(description, make=None, model=None, year=None, failed_part_number=None, max_results=10):
    """
    Find similar/compatible parts using SerpAPI + GPT-4.1-Nano analysis
    
    Args:
        description (str): Original part description
        make (str, optional): Equipment make
        model (str, optional): Equipment model  
        year (str, optional): Equipment year
        failed_part_number (str, optional): Part number that failed validation
        max_results (int, optional): Maximum number of results to return
        
    Returns:
        list: List of similar parts with compatibility information
    """
    if not description:
        return []
    
    logger.info(f"Searching for similar parts: {description} - {make} {model} {year}")
    
    try:
        import requests
        from config import Config
        
        # Construct similar parts search query
        search_query = f"{description} compatible alternate OEM part"
        if make:
            search_query += f" {make}"
        if model:
            search_query += f" {model}"
        if year:
            search_query += f" {year}"
        search_query += " replacement interchange"
        
        # Search parameters for SerpAPI
        search_params = {
            "api_key": Config.SERPAPI_KEY,
            "engine": "google",
            "q": search_query,
            "num": 12,
            "gl": "us",
            "hl": "en"
        }
        
        # Make the request
        try:
            api_response = requests.get("https://serpapi.com/search", params=search_params, timeout=30)
            api_response.raise_for_status()
            results = api_response.json()
        except Exception as e:
            logger.error(f"Error searching similar parts with SerpAPI: {e}")
            return []
        
        # Extract search results for GPT analysis
        search_context = ""
        sources = []
        
        # Process organic results
        if "organic_results" in results:
            for idx, result in enumerate(results.get("organic_results", [])[:10]):
                search_context += f"Source {idx+1}: {result.get('title', 'Unknown')}\n"
                search_context += f"URL: {result.get('link', 'No URL')}\n"
                search_context += f"Content: {result.get('snippet', 'No description')}\n\n"
                
                sources.append({
                    "name": result.get('title', 'Unknown'),
                    "url": result.get('link', 'No URL')
                })
        
        logger.info(f"Found {len(sources)} sources for similar parts analysis")
        
        # Create similar parts analysis prompt for GPT
        prompt = f"""
        Find similar and compatible parts from these search results:
        
        Original Request: {description}
        {f"Make: {make}" if make else ""}
        {f"Model: {model}" if model else ""}
        {f"Year: {year}" if year else ""}
        {f"Failed Part Number: {failed_part_number} (find alternatives to this)" if failed_part_number else ""}
        
        SEARCH RESULTS:
        {search_context if search_context else "No search results available."}
        
        SIMILAR PARTS REQUIREMENTS:
        1. Find OEM and aftermarket parts that serve the same function as "{description}"
        2. Look for interchange numbers, compatible parts, and direct replacements
        3. Include both OEM and high-quality aftermarket alternatives
        4. Verify compatibility with the specified make/model if provided
        5. Extract part numbers, manufacturers, and compatibility information
        6. Focus on parts that are readily available for purchase
        
        Return a JSON object with:
        - similar_parts: Array of up to {max_results} similar parts, each containing:
          - part_number: The part number
          - manufacturer: Manufacturer name
          - part_type: Type of part (OEM, Aftermarket, etc.)
          - description: What this part does
          - compatibility: Equipment compatibility info
          - confidence: 0.0-1.0 confidence in compatibility
          - source_url: Where this information was found
          - interchangeable: Boolean if directly interchangeable
        - total_found: Total number of compatible parts identified
        - search_quality: Overall quality of search results (0.0-1.0)
        
        Only include parts with confidence >= 0.4. Sort by confidence (highest first).
        """
        
        # Get GPT similar parts analysis
        if USING_NEW_OPENAI_CLIENT:
            ai_response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a parts compatibility specialist who identifies similar and interchangeable parts from search results. You carefully analyze compatibility information and provide accurate part alternatives. Using GPT-4.1-Nano for comprehensive compatibility analysis."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            raw_content = ai_response.choices[0].message.content
        else:
            import openai
            ai_response = openai.ChatCompletion.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a parts compatibility specialist who identifies similar and interchangeable parts from search results. You carefully analyze compatibility information and provide accurate part alternatives. Using GPT-4.1-Nano for comprehensive compatibility analysis."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            raw_content = ai_response.choices[0].message['content']
        
        # Parse the similar parts analysis result
        similar_result = json.loads(raw_content)
        
        # Extract and return similar parts list
        similar_parts = similar_result.get("similar_parts", [])
        
        # Log what was found
        logger.info(f"Similar parts search found {len(similar_parts)} compatible parts")
        
        return similar_parts
        
    except Exception as e:
        logger.error(f"Error in similar parts search: {e}")
        return []

def validate_part_with_serpapi(part_number, make=None, model=None, original_description=None, bypass_cache=False):
    """
    Validate a part number using SerpAPI search and GPT-4.1-Nano analysis
    
    Args:
        part_number (str): The part number to validate
        make (str, optional): Equipment make
        model (str, optional): Equipment model  
        original_description (str, optional): Original part description for context
        bypass_cache (bool, optional): Whether to bypass SerpAPI cache
        
    Returns:
        dict: Validation result with is_valid, confidence_score, assessment, and part_description
    """
    if not part_number:
        return {"is_valid": False, "confidence_score": 0.0, "assessment": "No part number provided"}
    
    logger.info(f"Validating part number {part_number} for {make} {model}")
    
    try:
        import requests
        from config import Config
        
        # Construct validation search query
        search_query = f'"{part_number}" OEM part specifications'
        if make:
            search_query += f" {make}"
        if model:
            search_query += f" {model}"
        if original_description:
            search_query += f" {original_description}"
            
        # Search parameters for SerpAPI
        search_params = {
            "api_key": Config.SERPAPI_KEY,
            "engine": "google", 
            "q": search_query,
            "num": 8,
            "gl": "us",
            "hl": "en"
        }
        
        # Add cache-busting if needed
        if bypass_cache:
            import time
            search_params["no_cache"] = "true"
            search_params["t"] = str(int(time.time()))
            logger.info(f"Bypassing SerpAPI cache for validation: {part_number}")
        
        # Make the request
        try:
            api_response = requests.get("https://serpapi.com/search", params=search_params, timeout=30)
            api_response.raise_for_status()
            results = api_response.json()
        except requests.exceptions.Timeout:
            logger.error("SerpAPI validation request timed out")
            return {"is_valid": False, "confidence_score": 0.0, "assessment": "Validation timeout"}
        except Exception as e:
            logger.error(f"Error validating with SerpAPI: {e}")
            return {"is_valid": False, "confidence_score": 0.0, "assessment": f"Validation error: {str(e)}"}
        
        # Extract search results for GPT context
        search_context = ""
        sources_found = 0
        
        # Process organic results
        if "organic_results" in results:
            for idx, result in enumerate(results.get("organic_results", [])[:6]):
                search_context += f"Result {idx+1}: {result.get('title', 'Unknown')}\n"
                search_context += f"URL: {result.get('link', 'No URL')}\n"
                search_context += f"Content: {result.get('snippet', 'No description')}\n\n"
                sources_found += 1
        
        logger.info(f"Found {sources_found} validation results for GPT analysis")
        
        # Create validation prompt for GPT
        prompt = f"""
        Validate this part number by analyzing search results:
        
        Part Number: {part_number}
        {f"Make: {make}" if make else ""}
        {f"Model: {model}" if model else ""}
        {f"Original Description: {original_description}" if original_description else ""}
        
        SEARCH RESULTS:
        {search_context if search_context else "No search results found for this part number."}
        
        VALIDATION CRITERIA:
        1. Does this part number appear in legitimate OEM or parts supplier websites?
        2. Is this part number associated with the correct make/model if specified?
        3. Does the part description match the original request if provided?
        4. Are there multiple reliable sources confirming this part number?
        5. Is this a real, purchasable part (not a placeholder, drawing reference, or model number)?
        
        IMPORTANT INSTRUCTIONS:
        - Score confidence from 0.0 to 1.0 based on evidence quality
        - Set is_valid to true only if you find solid evidence this is a real OEM part
        - Consider manufacturer websites, parts suppliers, and technical documentation as high-quality sources
        - Be conservative - if uncertain, mark as invalid rather than guessing
        - Extract the actual part description/function from the search results
        
        Return a JSON object with:
        - is_valid: boolean indicating if this is a validated part number
        - confidence_score: number from 0.0 to 1.0 indicating confidence level
        - assessment: brief explanation of the validation decision
        - part_description: extracted description of what this part actually is
        - sources_count: number of reliable sources found
        """
        
        # Get GPT validation analysis
        if USING_NEW_OPENAI_CLIENT:
            ai_response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a parts validation specialist who analyzes search results to verify OEM part numbers. You carefully evaluate evidence from search results and only validate parts with solid proof. Using GPT-4.1-Nano for comprehensive validation analysis."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            raw_content = ai_response.choices[0].message.content
        else:
            import openai
            ai_response = openai.ChatCompletion.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a parts validation specialist who analyzes search results to verify OEM part numbers. You carefully evaluate evidence from search results and only validate parts with solid proof. Using GPT-4.1-Nano for comprehensive validation analysis."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            raw_content = ai_response.choices[0].message['content']
        
        # Parse and return the validation result
        validation_result = json.loads(raw_content)
        
        # Log validation result
        logger.info(f"Part validation for {part_number}: valid={validation_result.get('is_valid')}, confidence={validation_result.get('confidence_score')}")
        
        return validation_result
        
    except Exception as e:
        logger.error(f"Error in part validation: {e}")
        return {
            "is_valid": False,
            "confidence_score": 0.0,
            "assessment": f"Validation failed: {str(e)}",
            "part_description": "Unknown",
            "sources_count": 0
        }

def save_part_match(description, oem_part_number, manufacturer, detailed_description="", alternate_part_numbers=None):
    """
    Save a successful part match to the database for future lookups
    
    Args:
        description (str): Original part description searched for
        oem_part_number (str): Found OEM part number
        manufacturer (str): Manufacturer name
        detailed_description (str, optional): Detailed part description
        alternate_part_numbers (list, optional): List of alternate part numbers
        
    Returns:
        Part: Saved Part object or None if save failed
    """
    if not description or not oem_part_number:
        logger.warning("Cannot save part match: missing description or part number")
        return None
    
    try:
        with get_app_context():
            # Check if this part already exists
            existing_part = Part.query.filter_by(oem_part_number=oem_part_number).first()
            
            if existing_part:
                logger.info(f"Part {oem_part_number} already exists in database")
                return existing_part
            
            # Create new part entry
            new_part = Part(
                generic_description=description,
                oem_part_number=oem_part_number,
                manufacturer=manufacturer or "Unknown",
                description=detailed_description or description
            )
            
            # Add alternate part numbers if provided
            if alternate_part_numbers and isinstance(alternate_part_numbers, list):
                # Store as JSON string
                import json
                new_part.alternate_part_numbers = json.dumps(alternate_part_numbers)
            
            # Save to database
            db.session.add(new_part)
            db.session.commit()
            
            logger.info(f"Saved new part to database: {oem_part_number} - {description}")
            return new_part
            
    except Exception as e:
        logger.error(f"Error saving part match: {e}")
        try:
            db.session.rollback()
        except:
            pass
        return None

def compare_valid_parts(part1_number, part1_desc, part2_number, part2_desc, original_request, make=None, model=None):
    """Stub function for comparing parts"""
    return {
        "key_differences": "Unable to analyze differences",
        "recommendation": "Please review both parts manually",
        "interchangeable": False,
        "explanation": "Comparison not available in this version"
    }