from flask import Blueprint, request, jsonify
from services.dual_service_provider_search import find_service_provider_with_dual_search
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

service_providers_bp = Blueprint('service_providers', __name__)

@service_providers_bp.route('/search', methods=['GET', 'POST'])
def search_service_providers():
    """Search for service providers for specific equipment"""
    if request.method == 'POST':
        data = request.json
        logger.info(f"POST data received: {data}")
        equipment_make = data.get('equipment_make')
        equipment_model = data.get('equipment_model')
        service_type = data.get('service_type', 'repair')
        location = data.get('location')
        bypass_cache = data.get('bypass_cache', False)
    else:
        equipment_make = request.args.get('equipment_make')
        equipment_model = request.args.get('equipment_model')
        service_type = request.args.get('service_type', 'repair')
        location = request.args.get('location')
        bypass_cache = request.args.get('bypass_cache', 'false').lower() == 'true'
    
    if not equipment_make or not equipment_model:
        return jsonify({'error': 'Equipment make and model are required'}), 400
    
    try:
        logger.info(f"Searching service providers for {equipment_make} {equipment_model} - {service_type}")
        
        # Use dual service provider search
        dual_result = find_service_provider_with_dual_search(
            equipment_make=equipment_make,
            equipment_model=equipment_model,
            service_type=service_type,
            location=location,
            bypass_cache=bypass_cache
        )
        
        # Convert dual search result to expected format
        providers = []
        # dual_result is now a list of provider dictionaries
        if isinstance(dual_result, list):
            for provider_result in dual_result:
                if provider_result.get('provider_name'):
                    providers.append({
                        'name': provider_result.get('provider_name'),
                        'url': provider_result.get('provider_url'),
                        'contact_info': provider_result.get('contact_info'),
                        'service_area': provider_result.get('service_area'),
                        'certifications': provider_result.get('certifications'),
                        'service_types': provider_result.get('service_types', []),
                        'is_authorized': provider_result.get('is_authorized', False),
                        'emergency_service': provider_result.get('emergency_service', False),
                        'location': provider_result.get('location'),
                        'confidence': provider_result.get('confidence', 0),
                        'selected_method': provider_result.get('selected_method'),
                        'arbitrator_reasoning': provider_result.get('arbitrator_reasoning'),
                        'sources_count': len(provider_result.get('sources', [])),
                        'snippet': f"Confidence: {provider_result.get('confidence', 0):.0%}, Method: {provider_result.get('selected_method', 'unknown')}, Authorized: {'Yes' if provider_result.get('is_authorized') else 'No'}",
                        'score': provider_result.get('confidence', 0) * 100
                    })
        else:
            # Handle legacy single result format
            if dual_result.get('provider_name'):
                providers.append({
                    'name': dual_result.get('provider_name'),
                    'url': dual_result.get('provider_url'),
                    'contact_info': dual_result.get('contact_info'),
                    'service_area': dual_result.get('service_area'),
                    'certifications': dual_result.get('certifications'),
                    'service_types': dual_result.get('service_types', []),
                    'is_authorized': dual_result.get('is_authorized', False),
                    'emergency_service': dual_result.get('emergency_service', False),
                    'location': dual_result.get('location'),
                    'confidence': dual_result.get('confidence', 0),
                    'selected_method': dual_result.get('selected_method'),
                    'arbitrator_reasoning': dual_result.get('arbitrator_reasoning'),
                    'sources_count': len(dual_result.get('sources', [])),
                    'snippet': f"Confidence: {dual_result.get('confidence', 0):.0%}, Method: {dual_result.get('selected_method', 'unknown')}, Authorized: {'Yes' if dual_result.get('is_authorized') else 'No'}",
                    'score': dual_result.get('confidence', 0) * 100
                })
        
        return jsonify({
            'equipment_make': equipment_make,
            'equipment_model': equipment_model,
            'service_type': service_type,
            'location': location,
            'count': len(providers),
            'providers': providers,
            'ai_ranked': True,
            'ranking_method': 'Dual AI-based service provider search with arbitrator',
            'version': 'dual'
        })
    
    except Exception as e:
        logger.error(f"Error searching service providers: {e}")
        return jsonify({'error': str(e)}), 500

@service_providers_bp.route('/types', methods=['GET'])
def get_service_types():
    """Get available service types"""
    service_types = [
        'repair',
        'maintenance',
        'installation',
        'calibration',
        'inspection',
        'cleaning',
        'replacement',
        'upgrade',
        'troubleshooting',
        'emergency service'
    ]
    
    return jsonify({
        'service_types': service_types
    })

@service_providers_bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'service_providers_api',
        'version': 'dual'
    })