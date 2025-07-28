from flask import Blueprint, request, jsonify
from models import db, Supplier
from services.dual_supplier_search import find_supplier_with_dual_search
from services.supplier_finder import find_suppliers
from services.supplier_finder_v2 import search_suppliers_v2
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

suppliers_bp = Blueprint('suppliers', __name__)

@suppliers_bp.route('/search', methods=['GET', 'POST'])
def search_suppliers():
    """Search for suppliers offering a specific part"""
    if request.method == 'POST':
        data = request.json
        logger.info(f"POST data received: {data}")
        part_number = data.get('part_number')
        oem_only = data.get('oem_only', False)
        make = data.get('make')
        model = data.get('model')
        use_v2 = data.get('use_v2', True)  # Default to v2
        use_dual = data.get('use_dual', False)  # Option for dual search
        location = data.get('location')
        logger.info(f"Parsed use_v2: {use_v2}, use_dual: {use_dual} (type: {type(use_v2)})")
    else:
        part_number = request.args.get('part_number')
        oem_only = request.args.get('oem_only', 'false').lower() == 'true'
        make = request.args.get('make')
        model = request.args.get('model')
        use_v2 = request.args.get('use_v2', 'true').lower() == 'true'  # Default to v2
        use_dual = request.args.get('use_dual', 'false').lower() == 'true'
        location = request.args.get('location')
    
    if not part_number:
        return jsonify({'error': 'Part number is required'}), 400
    
    try:
        logger.info(f"Searching suppliers for part {part_number} (v2: {use_v2}, dual: {use_dual})")
        
        if use_dual:
            # Use dual supplier search
            part_description = f"{make} {model}" if make and model else None
            dual_result = find_supplier_with_dual_search(part_number, part_description, location)
            
            # Convert dual search result to expected format
            suppliers = []
            if dual_result.get('supplier_name') and dual_result.get('supplier_url'):
                suppliers.append({
                    'url': dual_result.get('supplier_url'),
                    'title': dual_result.get('supplier_name'),
                    'snippet': f"Confidence: {dual_result.get('confidence', 0):.0%}, Method: {dual_result.get('selected_method', 'unknown')}, Type: {dual_result.get('supplier_type', 'Unknown')}",
                    'domain': 'dual_supplier_search',
                    'score': dual_result.get('confidence', 0) * 100,
                    'has_part_number': True,
                    'is_product_page': True,
                    'contact_info': dual_result.get('contact_info'),
                    'part_availability': dual_result.get('part_availability'),
                    'pricing_info': dual_result.get('pricing_info'),
                    'is_authorized': dual_result.get('is_authorized', False),
                    'supplier_type': dual_result.get('supplier_type'),
                    'location': dual_result.get('location'),
                    'arbitrator_reasoning': dual_result.get('arbitrator_reasoning'),
                    'sources_count': len(dual_result.get('sources', [])),
                    'ai_ranking': True
                })
            
            return jsonify({
                'part_number': part_number,
                'oem_only': oem_only,
                'count': len(suppliers),
                'suppliers': suppliers,
                'ai_ranked': True,
                'ranking_method': 'Dual AI-based supplier search with arbitrator',
                'version': 'dual'
            })
        elif use_v2:
            # Use the new v2 supplier finder with PartsTown boosting
            result = search_suppliers_v2(
                part_number=part_number,
                make=make,
                model=model,
                oem_only=oem_only
            )
            
            # Transform v2 results to match expected format
            suppliers = []
            for supplier in result.get('suppliers', []):
                suppliers.append({
                    'url': supplier['url'],
                    'title': supplier['title'],
                    'snippet': supplier['snippet'],
                    'domain': supplier['domain'],
                    'score': supplier.get('score', 0),
                    'has_part_number': supplier.get('has_part_number', False),
                    'is_product_page': supplier.get('is_product_page', False),
                    'ai_ranking': True
                })
            
            return jsonify({
                'part_number': part_number,
                'oem_only': oem_only,
                'count': len(suppliers),
                'suppliers': suppliers,
                'ai_ranked': True,
                'ranking_method': 'AI-based intelligent ranking v2 (PartsTown priority)',
                'version': 'v2'
            })
        else:
            # Use original supplier finder
            suppliers = find_suppliers(
                part_number=part_number,
                oem_only=oem_only,
                make=make,
                model=model
            )
            
            # Check if AI ranking was used
            ai_ranked = any(s.get('ai_ranking') for s in suppliers) if suppliers else False
            
            return jsonify({
                'part_number': part_number,
                'oem_only': oem_only,
                'count': len(suppliers),
                'suppliers': suppliers,
                'ai_ranked': ai_ranked,
                'ranking_method': 'AI-based intelligent ranking' if ai_ranked else 'Domain-based ranking',
                'version': 'v1'
            })
    
    except Exception as e:
        logger.error(f"Error searching suppliers: {e}")
        return jsonify({'error': str(e)}), 500

@suppliers_bp.route('', methods=['GET'])
def get_suppliers():
    """Get all suppliers with pagination"""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    
    # Get filter parameters
    name = request.args.get('name')
    domain = request.args.get('domain')
    min_reliability = request.args.get('min_reliability', type=float)
    
    # Create query with optional filters
    query = Supplier.query
    
    if name:
        query = query.filter(Supplier.name.ilike(f'%{name}%'))
    if domain:
        query = query.filter(Supplier.domain.ilike(f'%{domain}%'))
    if min_reliability is not None:
        query = query.filter(Supplier.reliability_score >= min_reliability)
    
    # Execute query with pagination
    pagination = query.order_by(Supplier.reliability_score.desc()).paginate(page=page, per_page=per_page)
    
    suppliers = []
    for supplier in pagination.items:
        suppliers.append({
            'id': supplier.id,
            'name': supplier.name,
            'domain': supplier.domain,
            'website': supplier.website,
            'reliability_score': supplier.reliability_score,
            'created_at': supplier.created_at.isoformat()
        })
    
    return jsonify({
        'suppliers': suppliers,
        'total': pagination.total,
        'pages': pagination.pages,
        'page': page,
        'per_page': per_page
    })

@suppliers_bp.route('', methods=['POST'])
def create_supplier():
    """Create a new supplier entry"""
    data = request.json
    
    # Validate required fields
    required_fields = ['name', 'domain']
    for field in required_fields:
        if field not in data:
            return jsonify({'error': f'Missing required field: {field}'}), 400
    
    try:
        # Check if supplier already exists
        existing = Supplier.query.filter_by(domain=data['domain']).first()
        if existing:
            return jsonify({
                'error': 'Supplier with this domain already exists',
                'existing_id': existing.id
            }), 409
        
        # Create the website URL if not provided
        website = data.get('website')
        if not website:
            website = f"https://{data['domain']}"
        
        # Create new supplier
        supplier = Supplier(
            name=data['name'],
            domain=data['domain'],
            website=website,
            reliability_score=data.get('reliability_score', 0.5)
        )
        
        db.session.add(supplier)
        db.session.commit()
        
        return jsonify({
            'id': supplier.id,
            'name': supplier.name,
            'message': 'Supplier created successfully'
        }), 201
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating supplier: {e}")
        return jsonify({'error': str(e)}), 500

@suppliers_bp.route('/<int:supplier_id>', methods=['GET'])
def get_supplier(supplier_id):
    """Get a specific supplier by ID"""
    supplier = Supplier.query.get_or_404(supplier_id)
    
    return jsonify({
        'id': supplier.id,
        'name': supplier.name,
        'domain': supplier.domain,
        'website': supplier.website,
        'reliability_score': supplier.reliability_score,
        'created_at': supplier.created_at.isoformat(),
        'updated_at': supplier.updated_at.isoformat()
    })

@suppliers_bp.route('/<int:supplier_id>', methods=['PUT'])
def update_supplier(supplier_id):
    """Update a supplier"""
    supplier = Supplier.query.get_or_404(supplier_id)
    data = request.json
    
    try:
        # Update fields
        if 'name' in data:
            supplier.name = data['name']
        if 'domain' in data:
            supplier.domain = data['domain']
        if 'website' in data:
            supplier.website = data['website']
        if 'reliability_score' in data:
            supplier.reliability_score = data['reliability_score']
        
        db.session.commit()
        
        return jsonify({
            'id': supplier.id,
            'message': 'Supplier updated successfully'
        })
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating supplier: {e}")
        return jsonify({'error': str(e)}), 500

@suppliers_bp.route('/<int:supplier_id>', methods=['DELETE'])
def delete_supplier(supplier_id):
    """Delete a supplier"""
    supplier = Supplier.query.get_or_404(supplier_id)
    
    try:
        db.session.delete(supplier)
        db.session.commit()
        
        return jsonify({
            'message': 'Supplier deleted successfully'
        })
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting supplier: {e}")
        return jsonify({'error': str(e)}), 500