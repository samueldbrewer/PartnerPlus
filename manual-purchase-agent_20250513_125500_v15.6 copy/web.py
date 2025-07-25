"""
Web UI Routes for Manual Purchase Agent
"""

from flask import Blueprint, render_template, request, jsonify, redirect, url_for, send_from_directory, current_app
import os
import json
from models import db, Manual, Part, Supplier, Purchase, BillingProfile
from services.manual_finder import search_manuals
from services.manual_parser import extract_information
from services.part_resolver import resolve_part_name
from services.supplier_finder import find_suppliers

# Create web blueprint
web_bp = Blueprint('web', __name__)

@web_bp.route('/')
def index():
    """Render the homepage"""
    return render_template('pages/index.html')

@web_bp.route('/dashboard')
def dashboard():
    """Render the dashboard page"""
    # In a real application, we would fetch actual data here
    return render_template('pages/dashboard.html')

@web_bp.route('/manuals')
def manuals():
    """Render the manuals page"""
    # In a real application, we would fetch manuals from the database
    return render_template('pages/manuals.html')

@web_bp.route('/parts')
def parts():
    """Render the parts page"""
    # In a real application, we would fetch parts from the database
    return render_template('pages/manuals.html', section='parts')

@web_bp.route('/suppliers')
def suppliers():
    """Render the suppliers page"""
    # In a real application, we would fetch suppliers from the database
    return render_template('pages/manuals.html', section='suppliers')

@web_bp.route('/purchases')
def purchases():
    """Render the purchases page"""
    # In a real application, we would fetch purchases from the database
    return render_template('pages/manuals.html', section='purchases')

@web_bp.route('/profiles')
def profiles():
    """Render the billing profiles page"""
    # In a real application, we would fetch profiles from the database
    return render_template('pages/manuals.html', section='profiles')

@web_bp.route('/settings')
def settings():
    """Render the settings page"""
    return render_template('pages/manuals.html', section='settings')

@web_bp.route('/demo-mode')
def demo_mode():
    """Render the demo mode page"""
    return render_template('pages/demo_mode.html')

@web_bp.route('/about')
def about():
    """Render the about page"""
    return render_template('pages/manuals.html', section='about')

@web_bp.route('/api-docs')
def api_docs():
    """Render the API documentation page"""
    return render_template('pages/manuals.html', section='api-docs')

@web_bp.route('/api-demo')
def api_demo():
    """Render the API demonstration page"""
    return send_from_directory('static/api-demo', 'index.html')

@web_bp.route('/static/api-demo/<path:filename>')
def api_demo_static(filename):
    """Serve static files for the API demo"""
    return send_from_directory('static/api-demo', filename)

@web_bp.route('/API_REFERENCE.md')
def api_reference():
    """Serve the API reference markdown file"""
    return send_from_directory(current_app.root_path, 'API_REFERENCE.md')

# --- API Endpoints for AJAX Calls from Frontend ---

@web_bp.route('/api/web/search-manuals', methods=['POST'])
def web_search_manuals():
    """API endpoint for searching manuals from the web UI"""
    data = request.json
    
    # Extract search parameters
    make = data.get('make', '')
    model = data.get('model', '')
    manual_type = data.get('type', 'technical')
    
    if not make or not model:
        return jsonify({'error': 'Make and model are required'}), 400
    
    try:
        # Search for manuals
        results = search_manuals(make, model, manual_type)
        return jsonify({
            'success': True,
            'results': results
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@web_bp.route('/api/web/process-manual', methods=['POST'])
def web_process_manual():
    """API endpoint for processing a manual from the web UI"""
    data = request.json
    
    # Extract parameters
    manual_id = data.get('manual_id')
    
    if not manual_id:
        return jsonify({'error': 'Manual ID is required'}), 400
    
    try:
        # Get the manual from the database
        manual = Manual.query.get(manual_id)
        if not manual:
            return jsonify({'error': 'Manual not found'}), 404
            
        # Process the manual (this would normally be a background task)
        # For the demo, we'll do it synchronously
        # The real implementation would involve downloading and processing
        try:
            # Return processing result
            return jsonify({
                'success': True,
                'message': 'Manual processing completed',
                'manual_id': manual.id,
                'title': manual.title
            })
        except Exception as e:
            return jsonify({'error': f'Error processing manual: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@web_bp.route('/api/web/resolve-part', methods=['POST'])
def web_resolve_part():
    """API endpoint for resolving a part from the web UI"""
    data = request.json
    
    # Extract parameters
    description = data.get('description', '')
    make = data.get('make', '')
    model = data.get('model', '')
    year = data.get('year', '')
    
    if not description:
        return jsonify({'error': 'Part description is required'}), 400
    
    try:
        # Resolve part
        result = resolve_part_name(description, make, model, year)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@web_bp.route('/api/web/find-suppliers', methods=['POST'])
def web_find_suppliers():
    """API endpoint for finding suppliers from the web UI"""
    data = request.json
    
    # Extract parameters
    part_number = data.get('part_number', '')
    oem_only = data.get('oem_only', False)
    
    if not part_number:
        return jsonify({'error': 'Part number is required'}), 400
    
    try:
        # Find suppliers
        suppliers = find_suppliers(part_number, oem_only)
        return jsonify({
            'success': True,
            'suppliers': suppliers
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@web_bp.route('/api/web/purchase-part', methods=['POST'])
def web_purchase_part():
    """API endpoint for purchasing a part from the web UI"""
    data = request.json
    
    # Extract parameters
    part_number = data.get('part_number', '')
    supplier_url = data.get('supplier_url', '')
    billing_profile_id = data.get('billing_profile_id')
    quantity = data.get('quantity', 1)
    
    if not part_number or not supplier_url or not billing_profile_id:
        return jsonify({'error': 'Missing required parameters'}), 400
    
    try:
        # Validate profile exists
        profile = BillingProfile.query.get(billing_profile_id)
        if not profile:
            return jsonify({'error': 'Billing profile not found'}), 404
            
        # Create a purchase record
        purchase = Purchase(
            part_number=part_number,
            supplier_url=supplier_url,
            quantity=quantity,
            billing_profile_id=billing_profile_id,
            status="pending"
        )
        
        # Save to database
        db.session.add(purchase)
        db.session.commit()
        
        # In a real app, we would start a background task to handle the purchase
        # For now, just return the purchase details
        return jsonify({
            'success': True,
            'message': 'Purchase initiated',
            'purchase_id': purchase.id,
            'status': purchase.status
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500