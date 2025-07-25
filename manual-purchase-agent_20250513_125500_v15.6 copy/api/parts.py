from flask import Blueprint, request, jsonify
from models import db, Part
from services.part_resolver import resolve_part_name
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

parts_bp = Blueprint('parts', __name__)

@parts_bp.route('/resolve', methods=['POST'])
def resolve_part():
    """
    Resolve a generic part description to OEM part number using multiple methods:
    1. Database lookup
    2. Manual search and GPT analysis
    3. Web search with GPT
    
    Optional search toggle parameters:
    - use_database: Whether to search in the database (default: true)
    - use_manual_search: Whether to search in manuals (default: true)
    - use_web_search: Whether to search on the web (default: true)
    - save_results: Whether to save results to the database (default: true)
    - bypass_cache: Whether to bypass all caching and perform fresh searches (default: false)
    
    Returns a comprehensive response with:
    - Primary OEM part number and details
    - Analysis results from both manual and web searches
    - Indication if the part numbers from different sources match
    - Information about which search methods were used
    """
    data = request.json
    
    # Validate required fields
    if 'description' not in data:
        return jsonify({'error': 'Description is required'}), 400
    
    # Ensure description is not empty
    if not data['description'].strip():
        return jsonify({'error': 'Description cannot be empty'}), 400
    
    try:
        logger.info(f"API: Resolving part: {data.get('description')} for {data.get('make')} {data.get('model')} {data.get('year')}")
        
        # Get search toggle parameters with defaults
        use_database = data.get('use_database', True)
        use_manual_search = data.get('use_manual_search', True)
        use_web_search = data.get('use_web_search', True)
        save_results = data.get('save_results', True)
        bypass_cache = data.get('bypass_cache', False)
        
        # Validate toggle parameters
        def validate_bool_param(param, name):
            """Validate that a parameter is a boolean or can be converted to one"""
            if isinstance(param, bool):
                return param
            elif isinstance(param, str):
                if param.lower() in ['true', 'false']:
                    return param.lower() == 'true'
                else:
                    raise ValueError(f"{name} must be a boolean value or 'true'/'false' string")
            elif isinstance(param, int):
                if param in [0, 1]:
                    return bool(param)
                else:
                    raise ValueError(f"{name} must be a boolean value, 0/1, or 'true'/'false' string")
            else:
                raise ValueError(f"{name} must be a boolean value, 0/1, or 'true'/'false' string")
        
        # Validate and convert each toggle parameter
        try:
            use_database = validate_bool_param(use_database, 'use_database')
            use_manual_search = validate_bool_param(use_manual_search, 'use_manual_search')
            use_web_search = validate_bool_param(use_web_search, 'use_web_search')
            save_results = validate_bool_param(save_results, 'save_results')
            bypass_cache = validate_bool_param(bypass_cache, 'bypass_cache')
            
            # Ensure at least one search method is enabled
            if not any([use_database, use_manual_search, use_web_search]):
                return jsonify({
                    'error': 'At least one search method must be enabled',
                    'message': 'Please enable at least one of: database search, manual search, or web search'
                }), 400
                
        except ValueError as e:
            return jsonify({
                'error': 'Invalid parameter format',
                'message': str(e)
            }), 400
            
        # Log toggle parameters
        logger.info(f"Search toggles: DB={use_database}, Manual={use_manual_search}, Web={use_web_search}, Save={save_results}, Bypass Cache={bypass_cache}")
        
        # Execute part resolution with selected methods
        result = resolve_part_name(
            description=data['description'],
            make=data.get('make'),
            model=data.get('model'),
            year=data.get('year'),
            use_database=use_database,
            use_manual_search=use_manual_search,
            use_web_search=use_web_search,
            save_results=save_results,
            bypass_cache=bypass_cache
        )
        
        # Check if result is None or empty
        if not result:
            logger.error("resolve_part_name returned None or empty result")
            return jsonify({
                'success': False,
                'error': "Internal error: No result returned from resolver",
                'message': f"Failed to resolve part '{data.get('description')}'"
            }), 500
        
        # Build structured response with the enhanced data
        response = {
            "success": True,
            "query": result.get("query", {
                "description": data.get('description'),
                "make": data.get('make'),
                "model": data.get('model'),
                "year": data.get('year')
            }),
            "results": {
                "database": result.get("database_result"),
                "manual_search": result.get("manual_search_result"),
                "ai_web_search": result.get("ai_web_search_result")
            },
            "search_methods_used": result.get("search_methods_used", {
                "database": use_database,
                "manual_search": use_manual_search,
                "web_search": use_web_search
            })
        }
        
        # Add comparison if available
        if "comparison" in result:
            response["comparison"] = result["comparison"]
        
        # Add recommendation if available
        if "recommended_result" in result:
            response["recommended_result"] = result["recommended_result"]
            response["recommendation_reason"] = result.get("recommendation_reason", "")
        
        # Add similar parts if triggered
        if result.get("similar_parts_triggered"):
            response["similar_parts_triggered"] = True
            response["similar_parts"] = result.get("similar_parts", [])
        else:
            response["similar_parts_triggered"] = False
        
        # Generate summary message
        messages = []
        
        # Check database result
        db_result = result.get("database_result") or {}
        if db_result.get("found"):
            db_res = result["database_result"]
            messages.append(f"Database: Found exact match '{db_res['oem_part_number']}' with 100% confidence")
        
        # Check manual search result
        manual_result = result.get("manual_search_result") or {}
        if manual_result.get("found"):
            manual_res = result["manual_search_result"]
            validation = manual_res.get("serpapi_validation", {})
            messages.append(
                f"Manual Search: Found '{manual_res['oem_part_number']}' "
                f"(confidence: {manual_res['confidence']:.0%}, "
                f"validated: {'✓' if validation.get('is_valid') else '✗'})"
            )
        elif use_manual_search:
            messages.append("Manual Search: No results found")
        
        # Check AI web search result
        ai_result = result.get("ai_web_search_result") or {}
        if ai_result.get("found"):
            ai_res = result["ai_web_search_result"]
            validation = ai_res.get("serpapi_validation", {})
            messages.append(
                f"AI Web Search: Found '{ai_res['oem_part_number']}' "
                f"(confidence: {ai_res['confidence']:.0%}, "
                f"validated: {'✓' if validation.get('is_valid') else '✗'})"
            )
        elif use_web_search:
            messages.append("AI Web Search: No results found")
        
        # Add comparison message if both manual and AI found results
        if result.get("comparison"):
            if result["comparison"]["part_numbers_match"]:
                messages.append("✓ Manual and AI results match - high confidence in accuracy")
            else:
                messages.append("⚠ Manual and AI returned different part numbers")
        
        # Add recommendation to summary
        if result.get("recommended_result"):
            rec = result["recommended_result"]
            messages.insert(0, f"✅ RECOMMENDED: {rec['oem_part_number']} - {result.get('recommendation_reason', '')}")
        elif result.get("similar_parts_triggered") and result.get("similar_parts"):
            similar_count = len(result["similar_parts"])
            messages.insert(0, f"🔍 SIMILAR PARTS: Found {similar_count} alternative parts for review - {result.get('recommendation_reason', '')}")
        
        response["summary"] = " | ".join(messages) if messages else "No results found"
        
        return jsonify(response)
    
    except Exception as e:
        logger.error(f"Error resolving part name: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'message': f"Failed to resolve part '{data.get('description')}'"
        }), 500

@parts_bp.route('', methods=['GET'])
def get_parts():
    """Get all parts with pagination and optional filtering"""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    
    # Get filter parameters
    part_number = request.args.get('part_number')
    manufacturer = request.args.get('manufacturer')
    description = request.args.get('description')
    
    # Create query with optional filters
    query = Part.query
    
    if part_number:
        query = query.filter(Part.oem_part_number.ilike(f'%{part_number}%'))
    if manufacturer:
        query = query.filter(Part.manufacturer.ilike(f'%{manufacturer}%'))
    if description:
        query = query.filter(Part.generic_description.ilike(f'%{description}%'))
    
    # Execute query with pagination
    pagination = query.order_by(Part.created_at.desc()).paginate(page=page, per_page=per_page)
    
    parts = []
    for part in pagination.items:
        parts.append({
            'id': part.id,
            'oem_part_number': part.oem_part_number,
            'manufacturer': part.manufacturer,
            'generic_description': part.generic_description,
            'description': part.description,
            'specifications': part.get_specifications() if part.specifications else {},
            'alternate_part_numbers': part.get_alternate_part_numbers() if part.alternate_part_numbers else [],
            'created_at': part.created_at.isoformat()
        })
    
    return jsonify({
        'parts': parts,
        'total': pagination.total,
        'pages': pagination.pages,
        'page': page,
        'per_page': per_page
    })

@parts_bp.route('', methods=['POST'])
def create_part():
    """Create a new part entry"""
    data = request.json
    
    # Validate required fields
    required_fields = ['oem_part_number', 'manufacturer', 'generic_description']
    for field in required_fields:
        if field not in data:
            return jsonify({'error': f'Missing required field: {field}'}), 400
    
    try:
        # Check if part already exists
        existing = Part.query.filter_by(oem_part_number=data['oem_part_number']).first()
        if existing:
            return jsonify({
                'error': 'Part with this OEM number already exists',
                'existing_id': existing.id
            }), 409
        
        # Create new part
        part = Part(
            oem_part_number=data['oem_part_number'],
            manufacturer=data['manufacturer'],
            generic_description=data['generic_description'],
            description=data.get('description', '')
        )
        
        # Add specifications if provided
        if 'specifications' in data:
            part.set_specifications(data['specifications'])
        
        # Add alternate part numbers if provided
        if 'alternate_part_numbers' in data:
            part.set_alternate_part_numbers(data['alternate_part_numbers'])
        
        db.session.add(part)
        db.session.commit()
        
        return jsonify({
            'id': part.id,
            'oem_part_number': part.oem_part_number,
            'message': 'Part created successfully'
        }), 201
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating part: {e}")
        return jsonify({'error': str(e)}), 500

@parts_bp.route('/<int:part_id>', methods=['GET'])
def get_part(part_id):
    """Get a specific part by ID"""
    part = Part.query.get_or_404(part_id)
    
    return jsonify({
        'id': part.id,
        'oem_part_number': part.oem_part_number,
        'manufacturer': part.manufacturer,
        'generic_description': part.generic_description,
        'description': part.description,
        'specifications': part.get_specifications() if part.specifications else {},
        'alternate_part_numbers': part.get_alternate_part_numbers() if part.alternate_part_numbers else [],
        'created_at': part.created_at.isoformat(),
        'updated_at': part.updated_at.isoformat()
    })

@parts_bp.route('/<int:part_id>', methods=['PUT'])
def update_part(part_id):
    """Update a part"""
    part = Part.query.get_or_404(part_id)
    data = request.json
    
    try:
        # Update basic fields
        if 'oem_part_number' in data:
            part.oem_part_number = data['oem_part_number']
        if 'manufacturer' in data:
            part.manufacturer = data['manufacturer']
        if 'generic_description' in data:
            part.generic_description = data['generic_description']
        if 'description' in data:
            part.description = data['description']
        
        # Update specifications if provided
        if 'specifications' in data:
            part.set_specifications(data['specifications'])
        
        # Update alternate part numbers if provided
        if 'alternate_part_numbers' in data:
            part.set_alternate_part_numbers(data['alternate_part_numbers'])
        
        db.session.commit()
        
        return jsonify({
            'id': part.id,
            'message': 'Part updated successfully'
        })
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating part: {e}")
        return jsonify({'error': str(e)}), 500

@parts_bp.route('/<int:part_id>', methods=['DELETE'])
def delete_part(part_id):
    """Delete a part"""
    part = Part.query.get_or_404(part_id)
    
    try:
        db.session.delete(part)
        db.session.commit()
        
        return jsonify({
            'message': 'Part deleted successfully'
        })
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting part: {e}")
        return jsonify({'error': str(e)}), 500

@parts_bp.route('/find-similar', methods=['POST'])
def find_similar_parts():
    """
    Find similar or alternative parts when the main resolution fails.
    This endpoint searches for similar parts using various strategies:
    1. Related parts from the same manufacturer
    2. Compatible/interchangeable parts
    3. Generic equivalents or aftermarket alternatives
    4. Parts with similar descriptions from other equipment
    
    Each result includes images, descriptions, and supplier information
    to help users make an informed selection.
    """
    data = request.json
    
    # Validate required fields
    if 'description' not in data:
        return jsonify({'error': 'Description is required'}), 400
    
    # Ensure description is not empty
    if not data['description'].strip():
        return jsonify({'error': 'Description cannot be empty'}), 400
    
    try:
        logger.info(f"API: Finding similar parts for: {data.get('description')} for {data.get('make')} {data.get('model')}")
        
        # Import the find_similar_parts function from the service layer
        from services.part_resolver import find_similar_parts as find_similar_parts_service
        
        # Call the service to find similar parts
        similar_parts = find_similar_parts_service(
            description=data['description'],
            make=data.get('make'),
            model=data.get('model'),
            year=data.get('year'),
            failed_part_number=data.get('failed_part_number'),  # Optional: the part number that failed validation
            max_results=data.get('max_results', 10)  # Default to 10 results
        )
        
        # Check if we found any similar parts
        if not similar_parts or len(similar_parts) == 0:
            return jsonify({
                'success': False,
                'message': f"No similar parts found for '{data.get('description')}'",
                'query': {
                    'description': data.get('description'),
                    'make': data.get('make'),
                    'model': data.get('model'),
                    'year': data.get('year')
                },
                'similar_parts': []
            }), 404
        
        # Build the response
        response = {
            'success': True,
            'query': {
                'description': data.get('description'),
                'make': data.get('make'),
                'model': data.get('model'),
                'year': data.get('year'),
                'failed_part_number': data.get('failed_part_number')
            },
            'similar_parts': similar_parts,
            'total_found': len(similar_parts),
            'search_strategies_used': [
                'manufacturer_alternatives',
                'compatible_parts',
                'generic_equivalents',
                'similar_equipment_parts'
            ]
        }
        
        # Add a summary message
        response['summary'] = f"Found {len(similar_parts)} similar or alternative parts for '{data.get('description')}'"
        
        return jsonify(response)
    
    except Exception as e:
        logger.error(f"Error finding similar parts: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'message': f"Failed to find similar parts for '{data.get('description')}'"
        }), 500