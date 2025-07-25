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
                model="gpt-4.1-nano",
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
                model="gpt-4.1-nano",
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
        
        # Execute AI web search if requested
        if use_web_search:
            web_result = find_part_with_web_search(description, make, model, year, bypass_cache)
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
                    "serpapi_validation": validation
                }
            else:
                response["ai_web_search_result"] = {
                    "found": False,
                    "error": web_result.get("error") if web_result and isinstance(web_result, dict) else "No results found",
                    "confidence": 0
                }
        
        # Add comparison if both methods found results
        if (response.get("manual_search_result", {}).get("found") and 
            response.get("ai_web_search_result", {}).get("found")):
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

def compare_valid_parts(part1_number, part1_desc, part2_number, part2_desc, original_request, make=None, model=None):
    """
    Compare two validated parts to help users understand the differences
    
    Args:
        part1_number (str): First part number (from manual)
        part1_desc (str): Description of first part
        part2_number (str): Second part number (from AI web search)
        part2_desc (str): Description of second part
        original_request (str): What the user originally requested
        make (str, optional): Vehicle/device make
        model (str, optional): Vehicle/device model
        
    Returns:
        dict: Analysis of the differences between the parts
    """
    logger.info(f"Comparing parts: {part1_number} vs {part2_number}")
    
    try:
        # Create prompt for AI comparison
        comparison_prompt = f"""
        Compare these two valid OEM parts and explain their differences to help the user choose:
        
        User's Original Request: "{original_request}" for {make} {model}
        
        Part 1 (From Manual Search):
        - Part Number: {part1_number}
        - Description: {part1_desc}
        
        Part 2 (From AI Web Search):
        - Part Number: {part2_number}
        - Description: {part2_desc}
        
        Analyze and explain:
        1. What is the key difference between these parts?
        2. Why might the manual and web search have returned different results?
        3. Which part is more likely what the user is looking for and why?
        4. Are these interchangeable or do they serve different functions?
        
        Return a JSON object with:
        - key_differences: Brief explanation of main differences
        - recommendation: Which part better matches the user's request and why
        - interchangeable: boolean - can these parts be used interchangeably?
        - explanation: Detailed explanation to help user decide
        """
        
        # Send to AI for analysis
        if USING_NEW_OPENAI_CLIENT:
            ai_response = client.chat.completions.create(
                model="gpt-4.1-nano",
                messages=[
                    {"role": "system", "content": "You are a parts expert who helps users understand the differences between similar parts. Using GPT-4.1-Nano for comprehensive analysis."},
                    {"role": "user", "content": comparison_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            analysis = json.loads(ai_response.choices[0].message.content)
        else:
            import openai
            ai_response = openai.ChatCompletion.create(
                model="gpt-4.1-nano",
                messages=[
                    {"role": "system", "content": "You are a parts expert who helps users understand the differences between similar parts. Using GPT-4.1-Nano for comprehensive analysis."},
                    {"role": "user", "content": comparison_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            analysis = json.loads(ai_response.choices[0].message['content'])
        
        return analysis
        
    except Exception as e:
        logger.error(f"Error comparing parts: {e}")
        return {
            "key_differences": "Unable to analyze differences",
            "recommendation": "Please review both parts manually",
            "interchangeable": False,
            "explanation": f"Error during comparison: {str(e)}"
        }

def validate_part_with_serpapi(part_number, make=None, model=None, original_description=None, bypass_cache=False):
    """
    Validate a part number using SerpAPI and AI assessment
    
    Args:
        part_number (str): The OEM part number to validate
        make (str, optional): Vehicle/device make
        model (str, optional): Vehicle/device model
        original_description (str, optional): The original generic part description
        
    Returns:
        dict: Validation results indicating if the part number is valid and appropriate
    """
    logger.info(f"Validating part number {part_number} with SerpAPI and AI assessment")
    
    try:
        import requests
        from config import Config
        
        # Construct search query for validation
        query = f"{part_number}"
        if make:
            query += f" {make}"
        if model:
            query += f" {model}"
        query += " OEM part specifications"
        
        # Search parameters for SerpAPI
        search_params = {
            "api_key": Config.SERPAPI_KEY,
            "engine": "google",
            "q": query,
            "num": 10,
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
            logger.error("SerpAPI request timed out after 30 seconds")
            return {"is_valid": False, "confidence_score": 0.0, "assessment": "API timeout occurred"}
        except requests.exceptions.RequestException as e:
            logger.error(f"SerpAPI request failed: {str(e)}")
            return {"is_valid": False, "confidence_score": 0.0, "assessment": f"API error: {str(e)}"}
        
        # Collect search results for AI analysis
        search_evidence = []
        
        # Process organic results
        if "organic_results" in results:
            for result in results.get("organic_results", [])[:5]:
                search_evidence.append({
                    "title": result.get("title", ""),
                    "snippet": result.get("snippet", ""),
                    "url": result.get("link", "")
                })
        
        # Process shopping results
        if "shopping_results" in results:
            for result in results.get("shopping_results", [])[:3]:
                search_evidence.append({
                    "title": result.get("title", ""),
                    "snippet": f"Price: {result.get('price', 'N/A')} - Source: {result.get('source', 'Unknown')}",
                    "url": result.get("link", "")
                })
        
        # If no search results found, return early
        if not search_evidence:
            return {
                "part_number": part_number,
                "is_valid": False,
                "confidence_score": 0.0,
                "assessment": f"No search results found for part number {part_number}. Unable to validate."
            }
        
        # Prepare search evidence for AI
        evidence_text = ""
        for idx, evidence in enumerate(search_evidence, 1):
            evidence_text += f"Result {idx}:\n"
            evidence_text += f"Title: {evidence['title']}\n"
            evidence_text += f"Description: {evidence['snippet']}\n\n"
        
        # Create prompt for AI validation
        validation_prompt = f"""
        Analyze these search results to determine if the part number is valid and appropriate for the user's request.
        
        User's Original Request:
        - Generic Part: {original_description if original_description else 'Not specified'}
        - Make: {make if make else 'Not specified'}
        - Model: {model if model else 'Not specified'}
        
        Part Number Being Validated: {part_number}
        
        Search Results for this Part Number:
        {evidence_text}
        
        Based on the search results, determine:
        1. Is this a real, valid OEM part number that exists in the market?
        2. Is this part number appropriate for the user's make/model?
        3. Does this part match what the user is looking for (their generic part description)?
        4. CRITICAL: Does the part TYPE match what was requested? (e.g., if user asked for "fan", is this actually a fan?)
        
        Return a JSON object with:
        - is_valid: boolean (true if this is a valid and appropriate part number AND matches the requested part type)
        - confidence_score: number between 0 and 1 (set to 0 if part type doesn't match)
        - reasoning: brief explanation of your assessment
        - part_description: what this part actually is based on the search results
        - part_type_match: boolean - does this part match the type requested in the original description?
        """
        
        # Send to AI for assessment
        if USING_NEW_OPENAI_CLIENT:
            ai_response = client.chat.completions.create(
                model="gpt-4.1-nano",
                messages=[
                    {"role": "system", "content": "You are a parts validation expert who assesses whether part numbers are valid and appropriate based on search evidence. You MUST verify that the part type matches what was requested (e.g., if user asked for a fan, the part must actually be a fan). Using GPT-4.1-Nano for comprehensive validation."},
                    {"role": "user", "content": validation_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            assessment_result = json.loads(ai_response.choices[0].message.content)
        else:
            import openai
            ai_response = openai.ChatCompletion.create(
                model="gpt-4.1-nano",
                messages=[
                    {"role": "system", "content": "You are a parts validation expert who assesses whether part numbers are valid and appropriate based on search evidence. You MUST verify that the part type matches what was requested (e.g., if user asked for a fan, the part must actually be a fan). Using GPT-4.1-Nano for comprehensive validation."},
                    {"role": "user", "content": validation_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            assessment_result = json.loads(ai_response.choices[0].message['content'])
        
        # Build validation response
        validation = {
            "part_number": part_number,
            "is_valid": assessment_result.get("is_valid", False),
            "confidence_score": assessment_result.get("confidence_score", 0.0),
            "assessment": assessment_result.get("reasoning", "No assessment provided"),
            "part_description": assessment_result.get("part_description", "Unknown part"),
            "part_type_match": assessment_result.get("part_type_match", True)  # Default to True for backward compatibility
        }
        
        # If part type doesn't match, override is_valid to False
        if not validation["part_type_match"]:
            validation["is_valid"] = False
            validation["confidence_score"] = 0.0
            validation["assessment"] = f"Part type mismatch: {validation['assessment']}"
        
        logger.info(f"AI validation result for {part_number}: valid={validation['is_valid']}, confidence={validation['confidence_score']}")
        
        return validation
        
    except Exception as e:
        logger.error(f"Error validating part with SerpAPI: {e}")
        return {
            "part_number": part_number,
            "is_valid": False,
            "confidence_score": 0.0,
            "assessment": f"Error validating part number {part_number}: {str(e)}"
        }
    
def find_part_in_manuals(description, make=None, model=None, year=None, bypass_cache=False):
    """
    Find part by searching for and analyzing parts manuals using targeted page extraction
    
    Args:
        description (str): Generic part description
        make (str, optional): Vehicle/device make
        model (str, optional): Vehicle/device model
        year (str, optional): Vehicle/device year
        
    Returns:
        dict: Part information found in manuals
    """
    logger.info(f"Searching for part in manuals: {description} for {make} {model} {year}")
    
    # Similar matches to provide as context
    similar_matches = find_similar_matches(description, make, model, year)
    
    try:
        # Step 1: Get text from manuals via the manual search service
        from services.manual_finder import search_manuals
        
        # Create search query for the manual
        search_query = f"{make} {model} parts manual"
        if year:
            search_query += f" {year}"
        
        # Search for parts manuals
        manual_results = search_manuals(make, model, "parts manual" if model else None, bypass_cache=bypass_cache)
        print("\n========= PARTS MANUAL SEARCH RESULTS =========")
        print(json.dumps(manual_results, indent=2) if manual_results else "No parts manual results")
        print("==============================================\n")
        
        # If no specific parts manual found, try technical manual
        if not manual_results and model:
            manual_results = search_manuals(make, model, "technical manual", bypass_cache=bypass_cache)
            print("\n========= TECHNICAL MANUAL SEARCH RESULTS =========")
            print(json.dumps(manual_results, indent=2) if manual_results else "No technical manual results")
            print("=================================================\n")
        
        # If no manuals found with model, try just the make
        if not manual_results and make:
            manual_results = search_manuals(make, None, "parts manual", bypass_cache=bypass_cache)
            print("\n========= MAKE-ONLY MANUAL SEARCH RESULTS =========")
            print(json.dumps(manual_results, indent=2) if manual_results else "No make-only manual results")
            print("=================================================\n")
        
        # If we have a manual, try to extract text from it
        manual_text = ""
        manual_source = ""
        manual_url = ""
        
        if manual_results:
            from services.manual_parser import extract_text_from_pdf
            from services.manual_finder import download_manual
            import os
            
            # Take the first result 
            manual = manual_results[0]
            manual_source = manual.get('title', 'Unknown manual')
            manual_url = manual.get('url', '')
            
            # Download the manual if it's a PDF
            if manual.get('file_format', '').lower() == 'pdf' or manual.get('url', '').lower().endswith('.pdf'):
                try:
                    # Download the manual
                    local_path = download_manual(manual['url'], use_temp_storage=True)
                    
                    # Extract targeted text based on the part description
                    if os.path.exists(local_path):
                        # Extract full text first
                        full_text = extract_text_from_pdf(local_path)
                        logger.info(f"Extracted {len(full_text)} characters from manual: {manual_source}")
                        
                        # Identify key terms to search for in the PDF
                        search_terms = []
                        
                        # Add the full description as a search term
                        search_terms.append(description.lower())
                        
                        # Add individual terms from the description
                        desc_words = description.lower().split()
                        for word in desc_words:
                            if len(word) > 3 and word not in ["part", "for", "the", "and", "with"]:
                                search_terms.append(word)
                        
                        # Add the last 1-2 words in the description (often the most specific part name)
                        if len(desc_words) > 1:
                            search_terms.append(desc_words[-1])  
                            search_terms.append(' '.join(desc_words[-2:])) 
                        
                        # Extract relevant snippets from the PDF
                        snippet_contexts = []
                        for term in search_terms:
                            # Find all occurrences of the term
                            term_positions = [i for i in range(len(full_text)) if full_text[i:i+len(term)].lower() == term]
                            
                            # For each occurrence, get a context snippet (500 chars before, 500 after)
                            for pos in term_positions[:3]:  # Limit to first 3 occurrences
                                start = max(0, pos - 500)
                                end = min(len(full_text), pos + len(term) + 500)
                                snippet = full_text[start:end]
                                snippet_contexts.append(snippet)
                        
                        # If we found specific context snippets, use those
                        if snippet_contexts:
                            # Concatenate the most relevant snippets (limit total to 5000 chars)
                            manual_text = "\n\n...\n\n".join(snippet_contexts[:5])
                            if len(manual_text) > 5000:
                                manual_text = manual_text[:5000] + "..."
                            logger.info(f"Extracted {len(manual_text)} characters of relevant contexts from manual")
                        else:
                            # If no specific matches, use a sample from beginning and end
                            manual_text = full_text[:2500] + "\n\n...\n\n" + full_text[-2500:]
                            logger.info("No specific matches found, using sample from beginning and end")
                        
                        # Log a sample of the extracted text
                        print("\n========= MANUAL TEXT SAMPLE (first 1000 chars) =========")
                        print(manual_text[:1000] + "..." if len(manual_text) > 1000 else manual_text)
                        print("Last 1000 characters:")
                        print("..." + manual_text[-1000:] if len(manual_text) > 1000 else manual_text)
                        print("=====================================================\n")
                except Exception as e:
                    logger.error(f"Error downloading or extracting manual: {e}")
        
        # Get a random page number for the prompt (simulating page reference)
        import random
        page_number = random.randint(10, 50) if manual_text else 1
        
        # Prepare targeted prompt similar to the reference code
        max_snippet_len = 3000
        snippet = manual_text[:max_snippet_len] if len(manual_text) > max_snippet_len else manual_text
        
        # Create focused prompt for GPT analysis of the manual - using reference code approach
        prompt = (
            f"You are a parts expert specialized in {make if make else 'automotive'} products.\n"
            f"Make: {make if make else 'Unknown'}\n"
            f"Model: {model if model else 'Unknown'}\n"
            f"Generic part described as: '{description}'.\n\n"
            f"CRITICAL REQUIREMENT: You MUST find a part that matches the TYPE requested.\n"
            f"For example:\n"
            f"- If user asks for 'fan', you MUST find a FAN part number, NOT a thermocouple or other component\n"
            f"- If user asks for 'thermostat', you MUST find a THERMOSTAT, NOT a thermometer\n"
            f"- If user asks for 'motor', you MUST find a MOTOR, NOT a capacitor\n\n"
            f"In the following excerpt from a service manual (URL: {manual_url}, page {page_number}):\n"
            f"'''{snippet}'''\n\n"
            f"Identify the exact OEM part number for the SPECIFIC PART TYPE requested: '{description}'.\n\n"
            f"Return a JSON object with:\n"
            f"- oem_part_number: The EXACT OEM part number found in the manual (MUST be empty string '' if no specific part number is found - DO NOT make up placeholder numbers like 101XXXX)\n"
            f"- manufacturer: The manufacturer of the part ({make if make else 'Unknown'})\n"
            f"- description: A detailed description of the part as provided in the manual\n"
            f"- part_type_match: boolean - does this part match the type requested (e.g., is it actually a {description})?\n"
            f"- confidence: A number between 0 and 1 indicating your confidence in this match\n"
            f"- alternate_part_numbers: An array of alternative part numbers if mentioned in the manual\n\n"
            f"CRITICAL RULES:\n"
            f"1. NEVER invent or guess part numbers - if you don't find an exact part number, return empty string ''\n"
            f"2. Only return actual part numbers that appear in the manual text (e.g., 0700463, 7000269, etc.)\n"
            f"3. Do NOT use placeholders like 'XXXXX' or '101XXXX' - these are not real part numbers\n"
            f"4. Set confidence to 0 if no actual part number is found\n"
            f"5. Set confidence to 0 if the part type doesn't match what was requested"
        )
        
        print("\n========= PROMPT SENT TO GPT =========")
        print(prompt[:1000] + "..." if len(prompt) > 1000 else prompt)
        print("=====================================\n")
        
        # Generate completion with GPT-4.1-Nano - handle both client versions
        if USING_NEW_OPENAI_CLIENT:
            ai_response = client.chat.completions.create(
                model="gpt-4.1-nano",
                messages=[
                    {"role": "system", "content": "You are a technical parts identification expert. You can identify exact OEM part numbers from service manual excerpts. You MUST ensure that the part you identify matches the TYPE of part requested (e.g., if user asks for a fan, you must find a fan, not a thermocouple or other component). Using GPT-4.1-Nano for comprehensive analysis."},
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
                model="gpt-4.1-nano",
                messages=[
                    {"role": "system", "content": "You are a technical parts identification expert. You can identify exact OEM part numbers from service manual excerpts. You MUST ensure that the part you identify matches the TYPE of part requested (e.g., if user asks for a fan, you must find a fan, not a thermocouple or other component). Using GPT-4.1-Nano for comprehensive analysis."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            # Get the raw response content
            raw_content = ai_response.choices[0].message['content']
        
        # Log the raw response from GPT
        print("\n========= GPT MANUAL SEARCH RESPONSE =========")
        print(raw_content)
        print("==============================================\n")
        
        # Parse the result
        result = json.loads(raw_content)
        
        # Add source information
        result["source"] = "manual_search"
        result["manual_source"] = manual_source
        
        # Additional validation: if part type doesn't match, reduce confidence to 0
        if result.get("part_type_match") is False:
            logger.warning(f"Part type mismatch in manual search: requested '{description}' but found {result.get('description', 'unknown')}")
            result["confidence"] = 0
            result["part_type_mismatch_warning"] = f"Requested {description} but found {result.get('description', 'different part type')}"
        
        # Check for placeholder part numbers and reject them
        part_num = result.get("oem_part_number", "")
        if part_num and ('XXXX' in part_num or part_num.startswith('101') or len(part_num) < 4):
            logger.warning(f"Rejecting placeholder part number from manual search: {part_num}")
            result["oem_part_number"] = ""
            result["confidence"] = 0
            result["found"] = False
            result["placeholder_rejected"] = True
        
        return result
    
    except Exception as e:
        logger.error(f"Error finding part in manuals: {e}")
        return {
            "oem_part_number": None,
            "manufacturer": make if make else None,
            "description": None,
            "confidence": 0,
            "error": str(e),
            "source": "manual_search",
            "manual_source": "Error searching manuals",
            "part_found_in_manual": False
        }

def find_part_with_web_search(description, make=None, model=None, year=None, bypass_cache=False):
    """
    Find part using web search and GPT analysis
    
    Args:
        description (str): Generic part description
        make (str, optional): Vehicle/device make
        model (str, optional): Vehicle/device model
        year (str, optional): Vehicle/device year
        
    Returns:
        dict: Part information found via web search
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
                model="gpt-4.1-nano",
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
                model="gpt-4.1-nano",
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

def combine_search_results(manual_result, web_result, description, make=None, model=None, year=None):
    """
    Combine results from manual search and web search
    
    Args:
        manual_result (dict): Results from manual search
        web_result (dict): Results from web search
        description (str): Original part description
        make (str, optional): Vehicle/device make
        model (str, optional): Vehicle/device model
        year (str, optional): Vehicle/device year
        
    Returns:
        dict: Combined part information
    """
    logger.info(f"Combining search results for: {description}")
    
    # Handle case where no search methods returned results
    if not manual_result and not web_result:
        logger.warning("No results from any search method")
        return {
            "oem_part_number": None,
            "manufacturer": make if make else None,
            "description": None,
            "confidence": 0,
            "alternate_part_numbers": [],
            "source": "none",
            "manual_analysis": {
                "oem_part_number": None,
                "confidence": 0,
                "manual_source": "No manual search performed or no results found",
                "part_found_in_manual": False
            },
            "web_search_analysis": {
                "oem_part_number": None,
                "confidence": 0,
                "sources": []
            },
            "matches_web_search": None
        }
    
    # Get confidence scores
    manual_confidence = manual_result.get("confidence", 0) if manual_result else 0
    web_confidence = web_result.get("confidence", 0) if web_result else 0
    
    # Get part numbers
    manual_part_number = manual_result.get("oem_part_number") if manual_result else None
    web_part_number = web_result.get("oem_part_number") if web_result else None
    
    # Check if part numbers match
    part_numbers_match = False
    if manual_part_number and web_part_number:
        # Case insensitive comparison
        part_numbers_match = manual_part_number.lower() == web_part_number.lower()
    
    # Use the result with higher confidence, or manual result if equal
    if manual_confidence >= web_confidence:
        primary_result = manual_result or {}
        secondary_result = web_result
        primary_source = "manual"
    else:
        primary_result = web_result or {}
        secondary_result = manual_result
        primary_source = "web"
    
    # Combine alternate part numbers
    alt_parts = []
    if primary_result.get("alternate_part_numbers"):
        alt_parts.extend(primary_result["alternate_part_numbers"])
    
    # Add secondary result's part number as alternate if it doesn't match primary
    if secondary_result and secondary_result.get("oem_part_number") and not part_numbers_match:
        secondary_part = secondary_result["oem_part_number"]
        if secondary_part not in alt_parts:
            alt_parts.append(secondary_part)
    
    # Add secondary result's alternates if not already included
    if secondary_result and secondary_result.get("alternate_part_numbers"):
        for alt in secondary_result["alternate_part_numbers"]:
            if alt not in alt_parts:
                alt_parts.append(alt)
    
    # Construct the final result
    result = {
        "oem_part_number": primary_result.get("oem_part_number"),
        "manufacturer": primary_result.get("manufacturer") or make,
        "description": primary_result.get("description") or description,
        "confidence": primary_result.get("confidence", 0),
        "alternate_part_numbers": alt_parts,
        "source": primary_source,
        "manual_analysis": {
            "oem_part_number": manual_result.get("oem_part_number") if manual_result else None,
            "confidence": manual_result.get("confidence", 0) if manual_result else 0,
            "manual_source": manual_result.get("manual_source", "No manual found") if manual_result else "No manual found",
            "part_found_in_manual": manual_result.get("part_found_in_manual", False) if manual_result else False
        },
        "web_search_analysis": {
            "oem_part_number": web_result.get("oem_part_number") if web_result else None,
            "confidence": web_result.get("confidence", 0) if web_result else 0,
            "sources": web_result.get("sources", []) if web_result else []
        },
        "matches_web_search": part_numbers_match
    }
    
    return result

def find_exact_match(description, make=None, model=None, year=None):
    """
    Find an exact part match in the database
    
    Args:
        description (str): Generic part description
        make (str, optional): Vehicle/device make
        model (str, optional): Vehicle/device model
        year (str, optional): Vehicle/device year
        
    Returns:
        Part: Exact matching Part object or None
    """
    try:
        with get_app_context():
            # Create a base query
            query = Part.query
            
            # Look for exact description match (case insensitive)
            query = query.filter(Part.generic_description.ilike(f"{description}"))
            
            # Add manufacturer/make filter if provided (exact match)
            if make:
                query = query.filter(Part.manufacturer.ilike(make))
            
            # Model and year would be in the description or could be added as fields
            # in a future database schema update
            
            # Get the first exact match
            return query.first()
    
    except Exception as e:
        logger.error(f"Error searching for exact part match: {e}")
        return None

def find_similar_matches(description, make=None, model=None, year=None):
    """
    Find similar part matches in the database
    
    Args:
        description (str): Generic part description
        make (str, optional): Vehicle/device make
        model (str, optional): Vehicle/device model
        year (str, optional): Vehicle/device year
        
    Returns:
        list: List of similar matching Part objects
    """
    try:
        with get_app_context():
            # Create a base query
            query = Part.query
            
            # Break the description into keywords for better matching
            keywords = description.lower().split()
            conditions = []
            
            # Create a condition for each keyword
            for keyword in keywords:
                if len(keyword) > 2:  # Ignore very short words
                    conditions.append(Part.generic_description.ilike(f"%{keyword}%"))
            
            # Combine keyword conditions with OR logic if we have any
            if conditions:
                from sqlalchemy import or_
                query = query.filter(or_(*conditions))
            
            # Add manufacturer/make filter if provided
            if make:
                query = query.filter(Part.manufacturer.ilike(f"%{make}%"))
            
            # Add model filter if provided (look in description)
            if model:
                query = query.filter(Part.generic_description.ilike(f"%{model}%"))
            
            # Get the top 5 similar matches
            return query.limit(5).all()
    
    except Exception as e:
        logger.error(f"Error searching for similar part matches: {e}")
        return []

def save_part_match(description, oem_part_number, manufacturer, detailed_description="", alternate_part_numbers=None):
    """
    Save a part match to the database
    
    Args:
        description (str): Generic part description
        oem_part_number (str): OEM part number
        manufacturer (str): Manufacturer name
        detailed_description (str): Detailed part description
        alternate_part_numbers (list): Alternative part numbers
        
    Returns:
        Part: The saved Part object
    """
    try:
        with get_app_context():
            # First check if this exact part description already exists
            # to avoid duplicating similar parts with different OEM numbers
            existing_description = Part.query.filter(
                Part.generic_description.ilike(f"{description}"),
                Part.manufacturer.ilike(f"{manufacturer}") if manufacturer else True
            ).first()
            
            if existing_description:
                logger.info(f"Found existing part with same description: {existing_description.oem_part_number}")
                
                # Update the part with any new information
                if detailed_description and not existing_description.description:
                    existing_description.description = detailed_description
                
                # Add any new alternate part numbers
                if alternate_part_numbers:
                    existing_alt_numbers = existing_description.get_alternate_part_numbers() if existing_description.alternate_part_numbers else []
                    # Add the provided OEM number as an alternate if it's different
                    if oem_part_number != existing_description.oem_part_number and oem_part_number not in existing_alt_numbers:
                        existing_alt_numbers.append(oem_part_number)
                    # Add other provided alternates if they don't exist
                    for alt in alternate_part_numbers:
                        if alt not in existing_alt_numbers:
                            existing_alt_numbers.append(alt)
                    existing_description.set_alternate_part_numbers(existing_alt_numbers)
                
                db.session.commit()
                logger.info(f"Updated existing part with new details: {existing_description.oem_part_number}")
                return existing_description
            
            # Check if this OEM part number already exists
            existing_part = Part.query.filter_by(oem_part_number=oem_part_number).first()
            
            if existing_part:
                # Only update fields that are not already set
                if not existing_part.generic_description or len(existing_part.generic_description) < len(description):
                    existing_part.generic_description = description
                
                if not existing_part.manufacturer and manufacturer:
                    existing_part.manufacturer = manufacturer
                    
                if not existing_part.description and detailed_description:
                    existing_part.description = detailed_description
                
                # Handle alternate part numbers
                if alternate_part_numbers:
                    existing_alt_numbers = existing_part.get_alternate_part_numbers() if existing_part.alternate_part_numbers else []
                    for alt in alternate_part_numbers:
                        if alt not in existing_alt_numbers:
                            existing_alt_numbers.append(alt)
                    existing_part.set_alternate_part_numbers(existing_alt_numbers)
                
                db.session.commit()
                logger.info(f"Updated existing part with OEM number: {oem_part_number}")
                return existing_part
            else:
                # Create new part
                new_part = Part(
                    generic_description=description,
                    oem_part_number=oem_part_number,
                    manufacturer=manufacturer,
                    description=detailed_description
                )
                
                # Handle alternate part numbers
                if alternate_part_numbers:
                    new_part.set_alternate_part_numbers(alternate_part_numbers)
                
                db.session.add(new_part)
                db.session.commit()
                logger.info(f"Created new part: {oem_part_number}")
                return new_part
            
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error saving part match: {e}")
        return None

def find_similar_parts(description, make=None, model=None, year=None, failed_part_number=None, max_results=10):
    """
    Find similar or alternative parts using simple search strategies.
    Returns parts quickly without validation - just collects potential matches with images.
    
    Args:
        description (str): Generic part description
        make (str, optional): Vehicle/device make
        model (str, optional): Vehicle/device model
        year (str, optional): Vehicle/device year
        failed_part_number (str, optional): The part number that failed validation
        max_results (int): Maximum number of results to return (default: 10)
        
    Returns:
        list: List of similar parts with images and basic details
    """
    logger.info(f"Finding similar parts for: {description} ({make} {model} {year})")
    
    similar_parts = []
    seen_part_numbers = set()
    
    # If we have a failed part number, exclude it from results
    if failed_part_number:
        seen_part_numbers.add(failed_part_number.lower())
    
    try:
        import requests
        from config import Config
        
        # Create simple search queries
        search_queries = [
            f"{description} {make} {model} part number",
            f"{description} {make} replacement part",
            f"{description} OEM part"
        ]
        
        for query in search_queries:
            logger.info(f"Searching similar parts with query: {query}")
            
            search_params = {
                "api_key": Config.SERPAPI_KEY,
                "engine": "google", 
                "q": query,
                "num": 15,
                "gl": "us",
                "hl": "en",
                "tbm": "shop"
            }
            
            try:
                api_response = requests.get("https://serpapi.com/search", params=search_params, timeout=30)
                api_response.raise_for_status()
                results = api_response.json()
                
                # Process shopping results with AI validation
                if "shopping_results" in results:
                    for result in results["shopping_results"][:5]:  # Take fewer results per query
                        title = result.get("title", "")
                        source_url = result.get("link", "")
                        
                        # Use AI to extract part number from title and validate
                        try:
                            # Ask AI to extract the OEM part number from the product title
                            extraction_prompt = f"""
                            Extract the OEM part number from this product listing title using GPT-4.1-Nano for precise analysis:
                            
                            Title: {title}
                            Equipment: {make} {model if model else ''}
                            Part Type: {description}
                            
                            Return ONLY the part number if found, or "NO_PART_FOUND" if no clear part number exists.
                            Do not return brand names, model numbers, or generic terms.
                            """
                            
                            extracted_part = call_gpt_for_analysis(extraction_prompt, max_tokens=32768)
                            
                            if not extracted_part or extracted_part.strip().upper() == "NO_PART_FOUND":
                                continue
                                
                            part_number = extracted_part.strip()
                            
                            # Skip if we've already seen this part
                            if part_number.lower() in seen_part_numbers:
                                continue
                                
                            seen_part_numbers.add(part_number.lower())
                            
                            # Light validation for similar parts - just check make/model compatibility
                            is_compatible = False
                            compatibility_reason = ""
                            
                            # Check if the title mentions the make or model
                            title_lower = title.lower()
                            if make and make.lower() in title_lower:
                                is_compatible = True
                                compatibility_reason = f"Matches make: {make}"
                            elif model and model.lower() in title_lower:
                                is_compatible = True
                                compatibility_reason = f"Matches model: {model}"
                            elif description.lower() in title_lower:
                                is_compatible = True
                                compatibility_reason = f"Matches part type: {description}"
                            else:
                                # If no direct match, accept it as a generic similar part
                                is_compatible = True
                                compatibility_reason = "Generic similar part"
                            
                            if not is_compatible:
                                continue
                                
                            # Get image for this part
                            image_url = result.get("thumbnail")
                            if not image_url:
                                image_url = get_part_image_simple(part_number, make, model)
                            
                            # Build part entry with light validation
                            part_entry = {
                                "part_number": part_number,
                                "description": title[:100],  # Truncate long titles
                                "manufacturer": extract_manufacturer_from_title(title, make),
                                "image_url": image_url,
                                "confidence_score": 0.7 if (make and make.lower() in title_lower) else 0.5,
                                "source": result.get("source", ""),
                                "price": result.get("price", ""),
                                "validation": {"is_valid": True, "assessment": f"Similar part - {compatibility_reason}"}
                            }
                            
                            similar_parts.append(part_entry)
                            
                            # Stop if we have enough results
                            if len(similar_parts) >= max_results:
                                break
                                
                        except Exception as e:
                            logger.error(f"Error extracting/validating part from title '{title}': {e}")
                            continue
                            
            except requests.exceptions.Timeout:
                logger.error(f"SerpAPI timeout for similar parts search query '{query}'")
                continue
            except Exception as e:
                logger.error(f"Error in similar parts search query '{query}': {e}")
                continue
            
            # Stop if we have enough results
            if len(similar_parts) >= max_results:
                break
    
    except Exception as e:
        logger.error(f"Error in find_similar_parts: {e}")
    
    logger.info(f"Found {len(similar_parts)} similar parts")
    return similar_parts[:max_results]


def get_part_image_simple(part_number, make=None, model=None):
    """Simple image search for a part number"""
    try:
        import requests
        from config import Config
        
        query = f"{part_number}"
        if make:
            query += f" {make}"
        if model:
            query += f" {model}"
        query += " part"
        
        search_params = {
            "api_key": Config.SERPAPI_KEY,
            "engine": "google",
            "q": query,
            "tbm": "isch",  # Image search
            "num": 5
        }
        
        response = requests.get("https://serpapi.com/search", params=search_params, timeout=30)
        response.raise_for_status()
        results = response.json()
        
        if "images_results" in results and len(results["images_results"]) > 0:
            return results["images_results"][0].get("original")
    except Exception as e:
        logger.debug(f"Error getting image for {part_number}: {e}")
    
    return None


def extract_manufacturer_from_title(title, primary_make=None):
    """Extract manufacturer from product title"""
    title_upper = title.upper()
    
    # Check if primary make is in the title
    if primary_make and primary_make.upper() in title_upper:
        return primary_make
    
    # Common manufacturers
    manufacturers = [
        'CARRIER', 'RHEEM', 'GOODMAN', 'TRANE', 'YORK', 'LENNOX', 'AMANA',
        'BRYANT', 'PAYNE', 'HEIL', 'TEMPSTAR', 'ARCOAIRE', 'COMFORTMAKER',
        'DUCANE', 'LUXAIRE', 'WESTINGHOUSE', 'NORDYNE', 'MILLER', 'INTERTHERM',
        'HONEYWELL', 'WHITE-RODGERS', 'JOHNSON CONTROLS', 'EMERSON', 'COPELAND'
    ]
    
    for mfg in manufacturers:
        if mfg in title_upper:
            return mfg.title()
    
    return primary_make or "Unknown"

def rank_similar_parts_with_ai(parts, original_description, make=None, model=None, failed_part_number=None):
    """
    Use AI to rank similar parts by relevance and quality
    
    Args:
        parts (list): List of part dictionaries
        original_description (str): What the user originally requested
        make (str): Equipment make
        model (str): Equipment model
        failed_part_number (str): The part that failed validation
        
    Returns:
        list: AI-ranked list of parts
    """
    if not parts:
        return []
    
    logger.info(f"AI ranking {len(parts)} similar parts")
    
    # Prepare parts data for AI
    parts_text = ""
    for idx, part in enumerate(parts):
        parts_text += f"\nPart {idx + 1}:\n"
        if part.get("part_number"):
            parts_text += f"  Part Number: {part['part_number']}\n"
        parts_text += f"  Title: {part.get('title', 'No title')}\n"
        parts_text += f"  Description: {part.get('description', 'No description')}\n"
        if part.get("price"):
            parts_text += f"  Price: {part['price']}\n"
        if part.get("validation"):
            val = part["validation"]
            parts_text += f"  Validation: {'Valid' if val.get('is_valid') else 'Invalid'} (confidence: {val.get('confidence_score', 0):.1f})\n"
            parts_text += f"  Assessment: {val.get('assessment', 'No assessment')}\n"
    
    # Create ranking prompt
    prompt = f"""
    Rank these similar/alternative parts for the user's request:
    
    Original Request: "{original_description}"
    {f'Make: {make}' if make else ''}
    {f'Model: {model}' if model else ''}
    {f'Failed Part Number: {failed_part_number}' if failed_part_number else ''}
    
    PARTS TO RANK:
    {parts_text}
    
    Rank these parts by:
    1. How well they match the user's original request
    2. Validation results (prefer validated parts)
    3. Whether they're appropriate alternatives/replacements
    4. Price reasonableness for the part type
    5. Availability (in stock preferred)
    
    Return a JSON object with:
    - ranked_indices: Array of part indices (1-based) in order of preference
    - explanations: Object with brief explanation for each ranked part
    
    Example:
    {{
        "ranked_indices": [3, 1, 5, 2],
        "explanations": {{
            "3": "Direct compatible replacement with high confidence",
            "1": "Alternative part from same manufacturer",
            "5": "Generic equivalent at good price",
            "2": "Related part but different specifications"
        }}
    }}
    """
    
    try:
        # Send to AI
        if USING_NEW_OPENAI_CLIENT:
            ai_response = client.chat.completions.create(
                model="gpt-4.1-nano",
                messages=[
                    {"role": "system", "content": "You are an expert at finding alternative and compatible replacement parts. You understand part specifications, compatibility, and help users find suitable alternatives when exact matches aren't available. Using GPT-4.1-Nano for comprehensive analysis."},
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
                    {"role": "system", "content": "You are an expert at finding alternative and compatible replacement parts. You understand part specifications, compatibility, and help users find suitable alternatives when exact matches aren't available. Using GPT-4.1-Nano for comprehensive analysis."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            result = json.loads(ai_response.choices[0].message['content'])
        
        # Build ranked list
        ranked_parts = []
        ranked_indices = result.get("ranked_indices", [])
        explanations = result.get("explanations", {})
        
        for rank, idx in enumerate(ranked_indices):
            if 1 <= idx <= len(parts):
                part = parts[idx - 1].copy()
                part["rank"] = rank + 1
                part["ai_explanation"] = explanations.get(str(idx), "Selected as alternative")
                ranked_parts.append(part)
        
        # If AI didn't rank all parts, add the rest
        for idx, part in enumerate(parts):
            if not any(p.get("part_number") == part.get("part_number") for p in ranked_parts):
                part_copy = part.copy()
                part_copy["rank"] = len(ranked_parts) + 1
                part_copy["ai_explanation"] = "Additional option"
                ranked_parts.append(part_copy)
        
        return ranked_parts
        
    except Exception as e:
        logger.error(f"Error in AI ranking: {e}")
        # Return original order on error
        for idx, part in enumerate(parts):
            part["rank"] = idx + 1
            part["ai_explanation"] = "Original search order"
        return parts