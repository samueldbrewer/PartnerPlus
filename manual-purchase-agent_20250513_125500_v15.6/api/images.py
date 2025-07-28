from flask import Blueprint, request, jsonify
from services.equipment_image_search import find_best_equipment_image
from services.part_image_search import find_best_part_image
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

images_bp = Blueprint('images', __name__)

@images_bp.route('/equipment', methods=['GET', 'POST'])
def search_equipment_image():
    """Search for the best equipment image using AI selection"""
    if request.method == 'POST':
        data = request.json
        logger.info(f"POST data received for equipment image: {data}")
        make = data.get('make')
        model = data.get('model')
    else:
        make = request.args.get('make')
        model = request.args.get('model')
    
    if not make or not model:
        return jsonify({'error': 'Make and model are required'}), 400
    
    try:
        logger.info(f"Searching for best equipment image: {make} {model}")
        
        # Find best equipment image
        result = find_best_equipment_image(make, model)
        
        if result.get('success'):
            return jsonify({
                'success': True,
                'equipment_make': make,
                'equipment_model': model,
                'image': result.get('best_image'),
                'search_query': result.get('search_query'),
                'total_images_found': result.get('total_images_found', 0),
                'ai_analyzed_count': result.get('ai_analyzed_count', 0)
            })
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to find equipment image'),
                'equipment_make': make,
                'equipment_model': model
            })
    
    except Exception as e:
        logger.error(f"Error searching equipment image: {e}")
        return jsonify({'error': str(e)}), 500

@images_bp.route('/part', methods=['GET', 'POST'])
def search_part_image():
    """Search for the best part image using AI selection"""
    if request.method == 'POST':
        data = request.json
        logger.info(f"POST data received for part image: {data}")
        make = data.get('make')
        model = data.get('model')
        part_name = data.get('part_name')
        oem_number = data.get('oem_number')
    else:
        make = request.args.get('make')
        model = request.args.get('model')
        part_name = request.args.get('part_name')
        oem_number = request.args.get('oem_number')
    
    if not make or not model or not part_name:
        return jsonify({'error': 'Make, model, and part name are required'}), 400
    
    try:
        logger.info(f"Searching for best part image: {make} {model} - {part_name} (OEM: {oem_number})")
        
        # Find best part image
        result = find_best_part_image(make, model, part_name, oem_number)
        
        if result.get('success'):
            return jsonify({
                'success': True,
                'equipment_make': make,
                'equipment_model': model,
                'part_name': part_name,
                'oem_number': oem_number,
                'image': result.get('best_image'),
                'search_query': result.get('search_query'),
                'total_images_found': result.get('total_images_found', 0),
                'ai_analyzed_count': result.get('ai_analyzed_count', 0)
            })
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to find part image'),
                'equipment_make': make,
                'equipment_model': model,
                'part_name': part_name,
                'oem_number': oem_number
            })
    
    except Exception as e:
        logger.error(f"Error searching part image: {e}")
        return jsonify({'error': str(e)}), 500

@images_bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'images_api',
        'endpoints': ['/equipment', '/part']
    })