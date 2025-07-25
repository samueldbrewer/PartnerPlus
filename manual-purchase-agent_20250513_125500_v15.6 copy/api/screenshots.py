from flask import Blueprint, request, jsonify, send_file, current_app
from services.website_screenshot_service import capture_supplier_screenshots
import logging
import os

# Set up logging
logger = logging.getLogger(__name__)

# Initialize the blueprint
screenshots_bp = Blueprint('screenshots', __name__)

@screenshots_bp.route('/suppliers', methods=['POST'])
def capture_supplier_screenshots_endpoint():
    """
    Capture screenshots for multiple supplier websites
    
    Request Body:
        urls (list): List of supplier URLs to capture
        
    Returns:
        JSON with screenshot paths for each URL
    """
    try:
        data = request.json
        urls = data.get('urls', [])
        
        if not urls:
            return jsonify({'error': 'No URLs provided'}), 400
        
        if len(urls) > 10:
            return jsonify({'error': 'Maximum 10 URLs allowed per request'}), 400
        
        logger.info(f"Capturing screenshots for {len(urls)} supplier URLs")
        
        # Capture screenshots
        results = capture_supplier_screenshots(urls)
        
        # Build response
        screenshots = {}
        for url, screenshot_path in results.items():
            if screenshot_path:
                # Convert to web-accessible URL
                screenshots[url] = f"/uploads/{screenshot_path}"
            else:
                screenshots[url] = None
        
        return jsonify({
            'success': True,
            'screenshots': screenshots
        })
        
    except Exception as e:
        logger.error(f"Error capturing screenshots: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@screenshots_bp.route('/supplier/<path:filename>')
def serve_supplier_screenshot(filename):
    """Serve a supplier screenshot file"""
    try:
        file_path = os.path.join('uploads/screenshots/suppliers', filename)
        if os.path.exists(file_path):
            return send_file(file_path, mimetype='image/png')
        else:
            return jsonify({'error': 'Screenshot not found'}), 404
    except Exception as e:
        logger.error(f"Error serving screenshot: {e}")
        return jsonify({'error': str(e)}), 500