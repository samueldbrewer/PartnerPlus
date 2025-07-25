import fitz  # PyMuPDF
import re
import json
import logging
import os
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

# Common regex patterns for part numbers and error codes
PART_NUMBER_PATTERNS = [
    r'\b[A-Z0-9]{3,}-[A-Z0-9]{3,}\b',  # Format: ABC-1234
    r'\b\d{5,7}-\d{3,5}\b',             # Format: 12345-123
    r'\b[A-Z]{1,3}\d{4,6}\b',           # Format: AB1234
    r'\bP/N\s*[:. ]\s*([A-Z0-9-]+)',    # Format: P/N: ABC123
    r'\bPart\s*#\s*[:. ]\s*([A-Z0-9-]+)', # Format: Part #: ABC123
    r'\bOEM\s*[:. ]\s*([A-Z0-9-]+)'     # Format: OEM: ABC123
]

ERROR_CODE_PATTERNS = [
    r'\bE\d{2,4}\b',                    # Format: E123
    r'\bERR[OR]*\s*\d{2,4}\b',          # Format: ERR 123 or ERROR 123
    r'\bERROR\s*CODE\s*[:. ]\s*([A-Z0-9-]+)', # Format: ERROR CODE: ABC123
    r'\bFAULT\s*CODE\s*[:. ]\s*([A-Z0-9-]+)', # Format: FAULT CODE: ABC123
    r'\b[A-Z]\d{2,4}\b'                 # Format: A123
]

def extract_text_from_pdf(pdf_path):
    """
    Extract text content from a PDF file using PyMuPDF
    
    Args:
        pdf_path (str): Path to the PDF file
        
    Returns:
        str: Extracted text from the PDF
    """
    logger.info(f"Extracting text from PDF: {pdf_path}")
    
    try:
        doc = fitz.open(pdf_path)
        text = ""
        
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            text += page.get_text()
        
        doc.close()
        return text
    
    except Exception as e:
        logger.error(f"Error extracting text from PDF: {e}")
        raise

def extract_patterns_with_regex(text, patterns):
    """
    Extract patterns from text using regex
    
    Args:
        text (str): Text to search for patterns
        patterns (list): List of regex patterns to use
        
    Returns:
        list: Unique matches found in the text
    """
    results = set()
    for pattern in patterns:
        matches = re.finditer(pattern, text)
        for match in matches:
            # If the pattern contains a capture group, use it
            if '(' in pattern:
                for group in match.groups():
                    if group:
                        results.add(group.strip())
            else:
                results.add(match.group().strip())
    
    return list(results)

def extract_context_for_match(text, match, context_size=100):
    """
    Extract context around a matched string
    
    Args:
        text (str): Full text
        match (str): The matched string
        context_size (int): Number of characters to include before and after the match
        
    Returns:
        str: Context string
    """
    start_pos = max(0, text.find(match) - context_size)
    end_pos = min(len(text), text.find(match) + len(match) + context_size)
    
    return text[start_pos:end_pos]

def extract_with_gpt(text, extraction_type):
    """
    Use GPT-4.1 Nano to extract part numbers or error codes from text
    
    Args:
        text (str): Text to analyze
        extraction_type (str): Type of extraction ("part numbers" or "error codes")
        
    Returns:
        dict: Extraction results
    """
    # Chunk the text to fit within token limits
    chunk_size = 5000
    chunks = [text[i:i + chunk_size] for i in range(0, len(text), chunk_size)]
    all_results = []
    
    for i, chunk in enumerate(chunks[:5]):  # Limit to first 5 chunks to save API calls
        logger.info(f"Processing {extraction_type} extraction for chunk {i+1}/{min(5, len(chunks))}")
        
        prompt = f"""
        Extract all {extraction_type} from the following text from a technical manual.
        If it's a part number, include any descriptive text immediately before or after it.
        If it's an error code, include any description or resolution steps associated with it.
        
        Format the output as a JSON array of objects where each object has:
        - 'code': the {extraction_type} itself
        - 'description': any associated description text
        
        TEXT:
        {chunk}
        """
        
        try:
            if USING_NEW_OPENAI_CLIENT:
                response = client.chat.completions.create(
                    model="gpt-4.1-nano",
                    messages=[
                        {"role": "system", "content": "You are a technical manual parser. Using GPT-4.1-Nano for comprehensive analysis."},
                        {"role": "user", "content": prompt}
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.1
                )
            else:
                import openai
                response = openai.ChatCompletion.create(
                    model="gpt-4.1-nano",
                    messages=[
                        {"role": "system", "content": "You are a technical manual parser. Using GPT-4.1-Nano for comprehensive analysis."},
                        {"role": "user", "content": prompt}
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.1
                )
            
            # Parse the results - handle both client versions
            if USING_NEW_OPENAI_CLIENT:
                content = response.choices[0].message.content
            else:
                content = response.choices[0].message['content']
                
            result = json.loads(content)
            if "results" in result:
                all_results.extend(result["results"])
        
        except Exception as e:
            logger.error(f"Error using GPT for extraction: {e}")
            # Continue with other chunks
    
    # If GPT extraction failed or found nothing, fallback to regex
    if not all_results:
        logger.info(f"Falling back to regex for {extraction_type}")
        if extraction_type == "part numbers":
            codes = extract_patterns_with_regex(text, PART_NUMBER_PATTERNS)
        else:
            codes = extract_patterns_with_regex(text, ERROR_CODE_PATTERNS)
        
        # Add context for each code
        for code in codes:
            context = extract_context_for_match(text, code)
            all_results.append({"code": code, "description": context})
    
    return {"results": all_results}

def comprehensive_gpt_analysis(text, manual_id=None):
    """
    Perform a comprehensive analysis of the manual text using GPT-4.1-Nano
    
    Args:
        text (str): The full text of the manual
        manual_id (int, optional): ID of the manual being processed (for logging)
        
    Returns:
        dict: Comprehensive analysis including common problems, maintenance tips, etc.
    """
    manual_info = f"Manual ID: {manual_id} " if manual_id else ""
    logger.info(f"{manual_info}Starting comprehensive GPT analysis of full manual")
    logger.info(f"{manual_info}Total text length: {len(text)} characters")
    
    # More focused prompt that emphasizes the three key areas and ensures proper extraction
    prompt = f"""
    You are analyzing a technical manual for a specific device or equipment. This is VERY IMPORTANT technical work.
    
    Focus primarily on extracting these key elements (these are the MOST important):

    1. ERROR CODES: Extract ALL error codes, faults, trouble codes, or diagnostic codes mentioned in the manual. 
       These usually have patterns like "E-123", "ERROR 45", "FAULT F-2", "Code 123", etc.
       If you find error codes, you MUST include them ALL in your response.
       
    2. PART NUMBERS: Extract ALL part numbers mentioned in the manual.
       These usually have formats like "PN-12345", "Part #ABC-123", "Model 500-123", etc.
       Include ANY string that appears to be a part number specification.
       
    3. COMMON PROBLEMS: Identify the most frequent issues mentioned and their solutions.
       Look for troubleshooting sections, FAQs, or any parts that describe symptoms and fixes.

    Also briefly identify:
    - What equipment/device this manual is for (e.g., "Toyota Camry 2020 Engine Manual")
    - Basic maintenance procedures (up to 5 most important ones)
    - Critical safety warnings (up to 5 most important ones)

    Format the response as a JSON object with these keys:
    - "manual_subject": string describing what this manual is for
    - "part_numbers": array of objects with "code" and "description" properties
    - "error_codes": array of objects with "code" and "description" properties
    - "common_problems": array of objects with "issue" and "solution" properties
    - "maintenance_procedures": array of strings (simple descriptions)
    - "safety_warnings": array of strings (simple descriptions)

    BE EXTREMELY SPECIFIC WITH ERROR CODES AND PART NUMBERS - they must be exactly as they appear in the text.
    If you see ANY pattern that might be an error code or part number, include it in your response.
    NEVER leave the part_numbers or error_codes arrays empty unless you are absolutely certain none exist.
    
    I am providing the COMPLETE TEXT of the manual without any omissions. Extract ALL error codes and part numbers.
    """
    
    try:
        logger.info("Sending request to GPT-4.1-Nano for comprehensive analysis")
        start_time = time.time()
        
        # Log the text size
        logger.info(f"Using complete text of {len(text)} characters (GPT-4.1-Nano can handle up to 1 million tokens)")
        
        # Combine prompt with full text
        full_prompt = prompt + "\n\nMANUAL TEXT:\n" + text
        
        logger.info("Sending the manual text in a single request")
        
        # Handle both new and old OpenAI clients
        if USING_NEW_OPENAI_CLIENT:
            response = client.chat.completions.create(
                model="gpt-4.1-nano",
                messages=[
                    {"role": "system", "content": "You are a technical expert specialized in extracting specific information from technical manuals. Focus on part numbers, error codes, and common problems. Using GPT-4.1-Nano for comprehensive analysis of up to 1 million tokens."},
                    {"role": "user", "content": full_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
        else:
            # Legacy OpenAI client
            import openai
            response = openai.ChatCompletion.create(
                model="gpt-4.1-nano",
                messages=[
                    {"role": "system", "content": "You are a technical expert specialized in extracting specific information from technical manuals. Focus on part numbers, error codes, and common problems. Using GPT-4.1-Nano for comprehensive analysis of up to 1 million tokens."},
                    {"role": "user", "content": full_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
        
        processing_time = time.time() - start_time
        logger.info(f"GPT analysis completed in {processing_time:.2f} seconds")
        
        # Parse the results - handle both client versions
        if USING_NEW_OPENAI_CLIENT:
            content = response.choices[0].message.content
        else:
            content = response.choices[0].message['content']
            
        result = json.loads(content)
        
        # Log what was found
        logger.info(f"GPT analysis found: {len(result.get('part_numbers', []))} part numbers, "
                   f"{len(result.get('error_codes', []))} error codes, "
                   f"{len(result.get('common_problems', []))} common problems")
        
        # Log sample of each category for debugging
        if result.get('part_numbers'):
            sample_parts = result['part_numbers'][:3]
            logger.info(f"Sample part numbers: {json.dumps(sample_parts)}")
        
        if result.get('error_codes'):
            sample_errors = result['error_codes'][:3]
            logger.info(f"Sample error codes: {json.dumps(sample_errors)}")
        
        if result.get('common_problems'):
            sample_problems = result['common_problems'][:2]
            logger.info(f"Sample common problems: {json.dumps(sample_problems)}")
        
        return result
    
    except Exception as e:
        logger.error(f"Error during comprehensive GPT analysis: {e}")
        return {
            "manual_subject": "Unknown",
            "part_numbers": [],
            "error_codes": [],
            "common_problems": [],
            "maintenance_procedures": [],
            "safety_warnings": []
        }

def extract_components(pdf_text, custom_prompt=None):
    """
    Extract manual components like exploded views, installation instructions, error code tables,
    troubleshooting flowcharts, etc. from PDF text. Identifies sections by page numbers.
    
    Args:
        pdf_text (str): Text extracted from a PDF
        custom_prompt (str, optional): Custom prompt for component extraction
        
    Returns:
        dict: Dictionary of identified components with page ranges
    """
    logger.info("Starting manual component extraction")
    
    # Default response for demonstration purposes
    default_components = {
        "table_of_contents": {
            "title": "Table of Contents",
            "start_page": 1,
            "end_page": 2,
            "description": "Lists all sections with page numbers",
            "key_information": ["Section names", "Page numbers", "Subsections"]
        },
        "introduction": {
            "title": "Introduction and Safety Information",
            "start_page": 3,
            "end_page": 5,
            "description": "Overview of the equipment and important safety warnings",
            "key_information": ["Equipment purpose", "Model specifications", "Safety precautions"]
        },
        "exploded_view": {
            "title": "Parts Breakdown Diagram",
            "start_page": 14,
            "end_page": 18,
            "description": "Detailed exploded view diagrams showing all components",
            "key_information": ["Part locations", "Assembly relationships", "Part numbers"]
        },
        "installation_instructions": {
            "title": "Installation Procedures",
            "start_page": 23,
            "end_page": 30,
            "description": "Step-by-step guide for installing the equipment",
            "key_information": ["Required tools", "Site preparation", "Assembly steps", "Initial testing"]
        },
        "error_code_table": {
            "title": "Troubleshooting and Error Codes",
            "start_page": 45,
            "end_page": 53,
            "description": "List of error codes with descriptions and remedies",
            "key_information": ["Error code format", "Common errors", "Troubleshooting steps"]
        },
        "maintenance_procedures": {
            "title": "Maintenance and Cleaning",
            "start_page": 58,
            "end_page": 65,
            "description": "Regular maintenance procedures and schedules",
            "key_information": ["Cleaning instructions", "Lubrication points", "Replacement schedules", "Preventive maintenance"]
        },
        "technical_specifications": {
            "title": "Technical Specifications",
            "start_page": 72,
            "end_page": 76,
            "description": "Detailed technical specifications and performance data",
            "key_information": ["Electrical requirements", "Dimensions", "Capacity", "Operating parameters"]
        }
    }
    
    # Create a default system prompt
    default_system_prompt = "You are a technical analyst specialized in extracting structural information from technical manuals."
    
    prompt_text = custom_prompt if custom_prompt else "Analyze this technical manual and identify all key structural components with page ranges."
    
    # Common instruction components for both cases
    component_instructions = """
    For each component you identify in the manual, provide:
    1. A descriptive title for the component section
    2. The starting page number where this component/section begins
    3. The ending page number where this component/section ends
    4. A brief description of what this component contains
    5. A list of key information points found in this section

    Look for common manual components such as:
    - Table of contents
    - Introduction sections
    - Parts breakdown diagrams/exploded views
    - Installation instructions
    - Error code tables
    - Troubleshooting guides/flowcharts
    - Maintenance procedures
    - Technical specifications
    - Wiring diagrams
    - Assembly instructions
    - Safety warnings

    Return results in this JSON format:
    {
        "component_key": {
            "title": "Component Title",
            "start_page": start_page_number,
            "end_page": end_page_number,
            "description": "Brief description of this component section",
            "key_information": ["Key point 1", "Key point 2", ...]
        },
        ...more components...
    }

    Use descriptive keys for each component such as "table_of_contents", "exploded_view", etc.
    """
    
    # Combine the custom prompt with our required format instructions
    full_prompt = f"{prompt_text}\n\n{component_instructions}\n\nMANUAL TEXT:\n{pdf_text[:100000]}"  # Limit text to ~100k chars
    
    logger.info(f"Sending component extraction request to GPT-4.1-Nano")
    if custom_prompt:
        logger.info(f"Using custom prompt: {custom_prompt[:100]}...")
    
    try:
        # Make the API call to OpenAI with either client version
        if USING_NEW_OPENAI_CLIENT:
            response = client.chat.completions.create(
                model="gpt-4.1-nano",
                messages=[
                    {"role": "system", "content": default_system_prompt + " Using GPT-4.1-Nano for comprehensive analysis."},
                    {"role": "user", "content": full_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            content = response.choices[0].message.content
        else:
            import openai
            response = openai.ChatCompletion.create(
                model="gpt-4.1-nano",
                messages=[
                    {"role": "system", "content": default_system_prompt + " Using GPT-4.1-Nano for comprehensive analysis."},
                    {"role": "user", "content": full_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            content = response.choices[0].message['content']
        
        # Parse the result
        result = json.loads(content)
        
        logger.info(f"GPT component extraction successful, found {len(result)} components")
        
        # If the result is empty, use a fallback but log a warning
        if not result:
            logger.warning("GPT returned empty component result, using fallback extraction")
            # Call the function recursively without a prompt to get a second attempt
            if custom_prompt:
                return extract_components(pdf_text, None)
            # Otherwise, we're already on our second attempt, so create a minimal component set
            else:
                return {
                    "manual_content": {
                        "title": "Manual Content",
                        "start_page": 1,
                        "end_page": 1,
                        "description": "Content extracted from the manual document",
                        "key_information": ["Manual text was processed but no structured components were identified"]
                    }
                }
        
        return result
    
    except Exception as e:
        logger.error(f"Error using GPT for component extraction: {e}")
        # Create a minimal error component to indicate what happened
        return {
            "error_processing": {
                "title": "Error Processing Document",
                "start_page": 1,
                "end_page": 1,
                "description": f"An error occurred while processing: {str(e)}",
                "key_information": ["Document was received but could not be fully processed", 
                                  "Try with a different PDF or a more focused prompt"]
            }
        }
    
    # This code should never be reached, but just in case
    logger.warning("Component extraction reached unexpected code path")
    return {
        "fallback_content": {
            "title": "Document Content",
            "start_page": 1,
            "end_page": 1,
            "description": "Document was processed with minimal extraction",
            "key_information": ["The document was processed but component extraction was not successful"]
        }
    }

def extract_information(pdf_text, manual_id=None):
    """
    Extract part numbers and error codes from PDF text using AI analysis
    
    Args:
        pdf_text (str): Text extracted from a PDF
        manual_id (int, optional): ID of the manual being processed for logging
        
    Returns:
        dict: Extracted information
    """
    manual_info = f"Manual ID: {manual_id} " if manual_id else ""
    logger.info(f"{manual_info}Starting comprehensive information extraction")
    logger.info(f"{manual_info}Text length: {len(pdf_text)} characters")
    
    # Skip regex extraction and rely entirely on AI analysis
    logger.info(f"{manual_info}Performing AI analysis with GPT-4.1-Nano")
    
    # Perform comprehensive GPT analysis of entire text - our primary method
    manual_info = f"Manual ID: {manual_id} " if manual_id else ""
    logger.info(f"{manual_info}Starting comprehensive GPT analysis")
    comprehensive_results = comprehensive_gpt_analysis(pdf_text, manual_id)
    
    # Use results directly from the comprehensive analysis
    part_number_results = {"results": comprehensive_results.get("part_numbers", [])}
    error_code_results = {"results": comprehensive_results.get("error_codes", [])}
    
    logger.info(f"{manual_info}GPT analysis found {len(part_number_results['results'])} part numbers")
    logger.info(f"{manual_info}GPT analysis found {len(error_code_results['results'])} error codes")
    
    # Create dictionaries to track unique codes (to avoid duplicates)
    part_dict = {}
    error_dict = {}
    
    # Skip regex results and use GPT results directly
    manual_info = f"Manual ID: {manual_id} " if manual_id else ""
    logger.info(f"{manual_info}Processing AI extraction results")
    
    # Add GPT focused extraction results (these may have better descriptions)
    logger.info("Merging focused GPT extraction results")
    for part in part_number_results.get("results", []):
        if part.get("code") and part["code"] not in part_dict:
            # Standardize the part format
            formatted_part = {
                "code": part["code"].strip(),
                "description": part.get("description", "")[:100].strip()  # Limit to 100 chars
            }
            part_dict[part["code"]] = formatted_part
        elif part.get("code") and len(part.get("description", "")) > len(part_dict[part["code"]].get("description", "")):
            # Use the more detailed description but ensure it's short
            short_desc = part.get("description", "").strip()
            if len(short_desc) > 100:
                short_desc = short_desc[:97] + "..."
            part_dict[part["code"]]["description"] = short_desc
    
    for error in error_code_results.get("results", []):
        if error.get("code") and error["code"] not in error_dict:
            # Standardize the error format
            formatted_error = {
                "code": error["code"].strip(),
                "description": error.get("description", "")[:100].strip()  # Limit to 100 chars
            }
            error_dict[error["code"]] = formatted_error
        elif error.get("code") and len(error.get("description", "")) > len(error_dict[error["code"]].get("description", "")):
            # Use the more detailed description but ensure it's short
            short_desc = error.get("description", "").strip()
            if len(short_desc) > 100:
                short_desc = short_desc[:97] + "..."
            error_dict[error["code"]]["description"] = short_desc
    
    # Add comprehensive GPT analysis results (these usually have the best descriptions)
    logger.info("Merging comprehensive GPT analysis results")
    for part in comprehensive_results.get("part_numbers", []):
        if part.get("code") and part["code"] not in part_dict:
            # Standardize the part format
            formatted_part = {
                "code": part["code"].strip(),
                "description": part.get("description", "")[:100].strip()  # Limit to 100 chars
            }
            part_dict[part["code"]] = formatted_part
        elif part.get("code") and len(part.get("description", "")) > len(part_dict[part["code"]].get("description", "")):
            # Use the more detailed description but ensure it's short
            short_desc = part.get("description", "").strip()
            if len(short_desc) > 100:
                short_desc = short_desc[:97] + "..."
            part_dict[part["code"]]["description"] = short_desc
    
    for error in comprehensive_results.get("error_codes", []):
        if error.get("code") and error["code"] not in error_dict:
            # Standardize the error format
            formatted_error = {
                "code": error["code"].strip(),
                "description": error.get("description", "")[:100].strip()  # Limit to 100 chars
            }
            error_dict[error["code"]] = formatted_error
        elif error.get("code") and len(error.get("description", "")) > len(error_dict[error["code"]].get("description", "")):
            # Use the more detailed description but ensure it's short
            short_desc = error.get("description", "").strip()
            if len(short_desc) > 100:
                short_desc = short_desc[:97] + "..."
            error_dict[error["code"]]["description"] = short_desc
    
    # Convert dictionaries back to lists
    final_part_numbers = list(part_dict.values())
    final_error_codes = list(error_dict.values())
    
    # Ensure consistent key names for CSV export ('code' -> Error Code Number/OEM Part Number)
    standardized_part_numbers = []
    for part in final_part_numbers:
        standardized_part_numbers.append({
            "code": part["code"],  # Keep original key for compatibility
            "OEM Part Number": part["code"],
            "Short Part Description": part["description"],
            "description": part["description"]  # Keep original key for compatibility
        })
    
    standardized_error_codes = []
    for error in final_error_codes:
        standardized_error_codes.append({
            "code": error["code"],  # Keep original key for compatibility
            "Error Code Number": error["code"],
            "Short Error Description": error["description"],
            "description": error["description"]  # Keep original key for compatibility
        })
    
    logger.info(f"Final extraction: {len(standardized_part_numbers)} part numbers and {len(standardized_error_codes)} error codes")
    
    # Log samples for verification
    if standardized_error_codes:
        logger.info(f"Sample error codes in final results: {[e['Error Code Number'] for e in standardized_error_codes[:5]]}")
    if standardized_part_numbers:
        logger.info(f"Sample part numbers in final results: {[p['OEM Part Number'] for p in standardized_part_numbers[:5]]}")
    
    # Return combined results plus additional information from comprehensive analysis
    return {
        "part_numbers": standardized_part_numbers,
        "error_codes": standardized_error_codes,
        "manual_subject": comprehensive_results.get("manual_subject", "Unknown"),
        "common_problems": comprehensive_results.get("common_problems", []),
        "maintenance_procedures": comprehensive_results.get("maintenance_procedures", []),
        "safety_warnings": comprehensive_results.get("safety_warnings", [])
    }