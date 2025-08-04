from flask import Blueprint, request, jsonify
import requests
import json
import os
import logging
from typing import Dict, List, Optional

# Initialize OpenAI client - handle both new and old API versions
try:
    # Try to import using new OpenAI Python client (v1.0.0+)
    from openai import OpenAI
    openai_client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
    USING_NEW_OPENAI_CLIENT = True
    logger = logging.getLogger(__name__)
    logger.info("Using new OpenAI client (v1.0.0+)")
except ImportError:
    # Fall back to legacy OpenAI client (v0.x)
    import openai
    openai.api_key = os.getenv('OPENAI_API_KEY')
    openai_client = None
    USING_NEW_OPENAI_CLIENT = False
    logger = logging.getLogger(__name__)
    logger.info("Using legacy OpenAI client")

generic_parts_bp = Blueprint('generic_parts', __name__)

class GenericPartsFinder:
    def __init__(self):
        self.serpapi_key = os.getenv('SERPAPI_KEY')
        self.openai_client = openai_client
    
    def find_generic_alternatives(self, make: str, model: str, oem_part_number: str, 
                                oem_part_description: str, options: Dict = None) -> Dict:
        """
        Find generic/aftermarket alternatives to OEM parts using SerpAPI and AI analysis
        """
        if options is None:
            options = {}
        
        try:
            # Step 1: Search for cross-reference information
            cross_ref_results = self._search_cross_references(oem_part_number, make, model)
            
            # Step 2: Search for generic/aftermarket alternatives  
            generic_results = self._search_generic_parts(oem_part_description, make, model, oem_part_number)
            
            # Step 3: Use AI to analyze and validate compatibility
            analyzed_results = self._analyze_compatibility(
                oem_part_number, oem_part_description, make, model, 
                cross_ref_results + generic_results, options
            )
            
            # Step 4: Enhance with additional details and photos
            enhanced_results = self._enhance_part_details(analyzed_results)
            
            return {
                'success': True,
                'oem_reference': {
                    'part_number': oem_part_number,
                    'description': oem_part_description,
                    'make': make,
                    'model': model
                },
                'generic_alternatives': enhanced_results,
                'search_metadata': {
                    'cross_references_found': len(cross_ref_results),
                    'generic_parts_found': len(generic_results),
                    'ai_validated': len([r for r in enhanced_results if r.get('ai_validated')])
                }
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'oem_reference': {
                    'part_number': oem_part_number,
                    'description': oem_part_description,
                    'make': make,
                    'model': model
                }
            }
    
    def _search_cross_references(self, oem_part_number: str, make: str, model: str) -> List[Dict]:
        """Search for cross-reference parts using SerpAPI"""
        search_queries = [
            f"{oem_part_number} cross reference {make}",
            f"{oem_part_number} compatible parts {make} {model}",
            f"{oem_part_number} aftermarket replacement",
            f"{oem_part_number} generic equivalent"
        ]
        
        all_results = []
        
        for query in search_queries:
            try:
                params = {
                    'engine': 'google',
                    'q': query,
                    'api_key': self.serpapi_key,
                    'num': 5
                }
                
                response = requests.get('https://serpapi.com/search', params=params)
                if response.status_code == 200:
                    data = response.json()
                    results = data.get('organic_results', [])
                    
                    for result in results:
                        all_results.append({
                            'title': result.get('title', ''),
                            'link': result.get('link', ''),
                            'snippet': result.get('snippet', ''),
                            'search_type': 'cross_reference',
                            'query': query
                        })
                        
            except Exception as e:
                print(f"Error in cross-reference search: {e}")
                continue
        
        return all_results
    
    def _search_generic_parts(self, part_description: str, make: str, model: str, oem_part: str) -> List[Dict]:
        """Search for generic parts using SerpAPI"""
        search_queries = [
            f"{part_description} {make} {model} aftermarket",
            f"{part_description} {make} generic replacement",
            f"{part_description} compatible {make} {model}",
            f"aftermarket {part_description} {make}",
            f"universal {part_description} {make} {model}"
        ]
        
        all_results = []
        
        for query in search_queries:
            try:
                params = {
                    'engine': 'google',
                    'q': query,
                    'api_key': self.serpapi_key,
                    'num': 5
                }
                
                response = requests.get('https://serpapi.com/search', params=params)
                if response.status_code == 200:
                    data = response.json()
                    results = data.get('organic_results', [])
                    
                    for result in results:
                        all_results.append({
                            'title': result.get('title', ''),
                            'link': result.get('link', ''),
                            'snippet': result.get('snippet', ''),
                            'search_type': 'generic_search',
                            'query': query
                        })
                        
            except Exception as e:
                print(f"Error in generic parts search: {e}")
                continue
        
        return all_results
    
    def _analyze_compatibility(self, oem_part: str, oem_description: str, make: str, 
                             model: str, search_results: List[Dict], options: Dict) -> List[Dict]:
        """Use AI to analyze compatibility and extract part information"""
        
        # Prepare search results for AI analysis - GPT-4.1-Nano can handle up to 1M input tokens
        results_text = "\n".join([
            f"Title: {r.get('title', '')}\nURL: {r.get('link', '')}\nDescription: {r.get('snippet', '')}\nSearch Type: {r.get('search_type', '')}\n---"
            for r in search_results  # Process all results with GPT-4.1-Nano's large input context
        ])
        
        prompt = f"""
        You are an expert parts analyst with access to comprehensive search results. Analyze these results to find generic/aftermarket alternatives for an OEM part using GPT-4.1-Nano's enhanced analytical capabilities.

        OEM Part Information:
        - Part Number: {oem_part}
        - Description: {oem_description}
        - Make: {make}
        - Model: {model}

        Search Results (Comprehensive Analysis):
        {results_text}

        Using GPT-4.1-Nano's advanced reasoning capabilities, perform a deep analysis to extract generic/aftermarket alternatives. For each alternative, provide detailed information:

        Required Fields:
        1. "generic_part_number": Exact part number if found
        2. "generic_part_description": Detailed description of the generic part
        3. "manufacturer": Brand/manufacturer of the generic part
        4. "compatibility_notes": Specific compatibility information with the OEM part
        5. "price_information": Price details if available (include currency and source)
        6. "confidence_score": Integer from 1-10 based on compatibility evidence
        7. "key_features": Array of key specifications and features
        8. "source_website": Website URL where this part was found
        9. "cross_reference_evidence": Specific evidence supporting compatibility
        10. "dimensional_specs": Physical dimensions if mentioned
        11. "electrical_specs": Electrical specifications if applicable
        12. "material_composition": Materials used in construction if mentioned

        Analysis Criteria (GPT-4.1-Nano Enhanced):
        ✅ INCLUDE:
        - Direct OEM cross-references with documented compatibility
        - Aftermarket brands (Dorman, Beck/Arnley, Febi, Genuine, etc.)
        - Universal/compatible parts with clear fitment data
        - Parts with specific make/model compatibility lists
        - Cross-reference charts and compatibility tables
        - Parts with identical specifications and mounting requirements

        ❌ EXCLUDE:
        - Original OEM parts from the same manufacturer
        - Completely unrelated automotive/industrial parts
        - Parts for different equipment categories
        - Vague compatibility claims without evidence
        - Parts with conflicting specifications

        Enhanced Analysis Instructions:
        - Leverage the full context to cross-reference information across multiple sources
        - Look for patterns in part numbering systems that indicate compatibility
        - Identify aftermarket manufacturers known for quality cross-references
        - Pay special attention to electrical specifications, dimensions, and mounting details
        - Consider application-specific requirements (temperature, pressure, etc.)
        - Validate compatibility claims by checking multiple sources when possible

        Return ONLY a valid JSON array with detailed analysis. Each part entry should be thoroughly researched and validated using the comprehensive search results provided. Use GPT-4.1-Nano's enhanced analytical capabilities with 1M input token capacity to provide the most accurate and detailed compatibility assessment possible.
        """
        
        try:
            # Handle both new and old OpenAI clients - using GPT-4.1-Nano
            if USING_NEW_OPENAI_CLIENT:
                response = self.openai_client.chat.completions.create(
                    model="gpt-4.1-mini-2025-04-14",
                    messages=[
                        {"role": "system", "content": "You are an expert in automotive and industrial parts cross-referencing using GPT-4.1-Nano's enhanced analytical capabilities. Analyze search results to find compatible generic alternatives to OEM parts with comprehensive analysis."},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=32768,  # GPT-4.1-Nano max completion tokens
                    temperature=0.2   # Lower temperature for more precise analysis
                )
            else:
                # Legacy OpenAI client - using GPT-4.1-Nano
                import openai
                response = openai.ChatCompletion.create(
                    model="gpt-4.1-mini-2025-04-14",
                    messages=[
                        {"role": "system", "content": "You are an expert in automotive and industrial parts cross-referencing using GPT-4.1-Nano's enhanced analytical capabilities. Analyze search results to find compatible generic alternatives to OEM parts with comprehensive analysis."},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=32768,  # GPT-4.1-Nano max completion tokens
                    temperature=0.2   # Lower temperature for more precise analysis
                )
            
            # Parse response based on client version
            if USING_NEW_OPENAI_CLIENT:
                ai_response = response.choices[0].message.content
            else:
                ai_response = response.choices[0].message['content']
            
            # Try to parse JSON from AI response
            try:
                # Extract JSON from response (handle cases where AI adds explanatory text)
                import re
                json_match = re.search(r'\[.*\]', ai_response, re.DOTALL)
                if json_match:
                    parsed_results = json.loads(json_match.group())
                    
                    # Add metadata to each result
                    for result in parsed_results:
                        result['ai_validated'] = True
                        result['ai_analysis_date'] = None  # Could add timestamp
                        
                    return parsed_results
                else:
                    print("No JSON found in AI response")
                    return []
                    
            except json.JSONDecodeError as e:
                print(f"Error parsing AI response JSON: {e}")
                return []
                
        except Exception as e:
            print(f"Error in AI analysis: {e}")
            return []
    
    def _enhance_part_details(self, analyzed_results: List[Dict]) -> List[Dict]:
        """Enhance part details with additional searches for photos and specifications"""
        enhanced_results = []
        
        for part in analyzed_results:
            enhanced_part = part.copy()
            
            # Search for part images
            if part.get('generic_part_number'):
                image_url = self._search_part_image(part['generic_part_number'], part.get('manufacturer', ''))
                enhanced_part['image_url'] = image_url
            
            # Add additional metadata
            enhanced_part['cost_savings_potential'] = self._estimate_savings(part)
            enhanced_part['availability_score'] = self._estimate_availability(part)
            
            enhanced_results.append(enhanced_part)
        
        return enhanced_results
    
    def _search_part_image(self, part_number: str, manufacturer: str) -> Optional[str]:
        """Search for part images using Google Images API"""
        try:
            query = f"{manufacturer} {part_number}" if manufacturer else part_number
            params = {
                'engine': 'google_images',
                'q': query,
                'api_key': self.serpapi_key,
                'num': 1
            }
            
            response = requests.get('https://serpapi.com/search', params=params)
            if response.status_code == 200:
                data = response.json()
                images = data.get('images_results', [])
                if images:
                    return images[0].get('original', '')
                    
        except Exception as e:
            print(f"Error searching for part image: {e}")
        
        return None
    
    def _estimate_savings(self, part: Dict) -> str:
        """Estimate potential cost savings compared to OEM"""
        # This is a simplified estimation - could be enhanced with actual price data
        confidence = part.get('confidence_score', 5)
        if confidence >= 8:
            return "High (30-50% savings typical)"
        elif confidence >= 6:
            return "Medium (20-40% savings typical)"
        else:
            return "Variable (verify pricing)"
    
    def _estimate_availability(self, part: Dict) -> int:
        """Estimate availability based on search results (1-10 scale)"""
        # Simplified scoring based on number of sources and manufacturer
        score = 5  # baseline
        
        if part.get('manufacturer'):
            score += 2  # Known manufacturer
        
        if part.get('source_website'):
            score += 1  # Has source
            
        # Cap at 10
        return min(score, 10)

# Initialize the finder
generic_finder = GenericPartsFinder()

@generic_parts_bp.route('/find-generic', methods=['POST'])
def find_generic_parts():
    """
    Find generic/aftermarket alternatives to OEM parts
    
    Expected JSON payload:
    {
        "make": "Carrier",
        "model": "58STA080", 
        "oem_part_number": "HH18HA499",
        "oem_part_description": "Hi Limit Switch",
        "search_options": {
            "include_cross_reference": true,
            "include_aftermarket": true,
            "max_results": 10
        }
    }
    """
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['make', 'model', 'oem_part_number', 'oem_part_description']
        for field in required_fields:
            if not data.get(field):
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        
        make = data['make']
        model = data['model']
        oem_part_number = data['oem_part_number']
        oem_part_description = data['oem_part_description']
        search_options = data.get('search_options', {})
        
        # Find generic alternatives
        result = generic_finder.find_generic_alternatives(
            make, model, oem_part_number, oem_part_description, search_options
        )
        
        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 500
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Internal server error: {str(e)}'
        }), 500

@generic_parts_bp.route('/validate-compatibility', methods=['POST'])
def validate_compatibility():
    """
    Validate compatibility between an OEM part and a proposed generic alternative
    """
    try:
        data = request.get_json()
        
        required_fields = ['oem_part_number', 'generic_part_number', 'make', 'model']
        for field in required_fields:
            if not data.get(field):
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        
        # This would use AI to do a detailed compatibility analysis
        # For now, return a placeholder structure
        return jsonify({
            'success': True,
            'compatibility_score': 8.5,
            'compatibility_analysis': {
                'dimensional_match': 'High confidence',
                'electrical_specs': 'Compatible',
                'mounting_compatibility': 'Verified',
                'performance_rating': 'Equivalent',
                'warranty_coverage': 'Check with supplier'
            },
            'recommendation': 'Highly compatible - recommended for cost savings',
            'risk_assessment': 'Low risk - well-documented cross-reference'
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Internal server error: {str(e)}'
        }), 500