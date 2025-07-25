from flask import Blueprint, request, jsonify, current_app
from services.enrichment_service import EnrichmentService
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize the blueprint
enrichment_bp = Blueprint('enrichment', __name__)

# Initialize the enrichment service
enrichment_service = EnrichmentService()

@enrichment_bp.route('', methods=['POST'])
def get_enrichment_data():
    """
    Get enriched multimedia data for a vehicle or part
    
    Request Body:
        make (str): Vehicle manufacturer (e.g., "Toyota")
        model (str): Vehicle model (e.g., "Camry")
        year (str, optional): Vehicle year (e.g., "2023")
        part_number (str, optional): OEM part number if applicable
        
    Returns:
        JSON with videos, articles, and images related to the vehicle or part
    """
    try:
        # Get request data
        data = request.json
        
        # Validate required fields
        if 'make' not in data or not data['make']:
            return jsonify({'error': 'Make is required'}), 400
            
        if 'model' not in data or not data['model']:
            return jsonify({'error': 'Model is required'}), 400
        
        # Extract optional fields
        make = data['make']
        model = data['model']
        year = data.get('year')
        part_number = data.get('part_number')
        
        # Log the request
        logger.info(f"Enrichment request for {make} {model} {year if year else ''} {part_number if part_number else ''}")
        
        # Get enrichment data
        result = enrichment_service.get_enrichment_data(
            make=make,
            model=model,
            year=year,
            part_number=part_number
        )
        
        if not result['success']:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Unknown error')
            }), 500
        
        # Return the enrichment data
        return jsonify({
            'success': True,
            'query': result.get('query', ''),
            'subject': result.get('subject', ''),
            'data': {
                'videos': result['data']['videos'],
                'articles': result['data']['articles'],
                'images': result['data']['images']
            }
        })
        
    except Exception as e:
        logger.error(f"Error processing enrichment request: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500