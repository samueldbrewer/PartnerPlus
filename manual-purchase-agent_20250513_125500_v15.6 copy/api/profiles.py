from flask import Blueprint, request, jsonify
from models import db, BillingProfile
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

profiles_bp = Blueprint('profiles', __name__)

@profiles_bp.route('', methods=['GET'])
def get_profiles():
    """Get all billing profiles with pagination"""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    
    # Create query
    query = BillingProfile.query
    
    # Execute query with pagination
    pagination = query.order_by(BillingProfile.created_at.desc()).paginate(page=page, per_page=per_page)
    
    profiles = []
    for profile in pagination.items:
        profiles.append(profile.to_dict(include_sensitive=False))
    
    return jsonify({
        'profiles': profiles,
        'total': pagination.total,
        'pages': pagination.pages,
        'page': page,
        'per_page': per_page
    })

@profiles_bp.route('', methods=['POST'])
def create_profile():
    """Create a new billing profile"""
    data = request.json
    
    # Validate required fields
    required_fields = ['name', 'billing_address', 'payment_info']
    for field in required_fields:
        if field not in data:
            return jsonify({'error': f'Missing required field: {field}'}), 400
    
    try:
        # Create new billing profile
        profile = BillingProfile(name=data['name'])
        
        # Set encrypted fields
        profile.billing_address = data['billing_address']
        
        if 'shipping_address' in data:
            profile.shipping_address = data['shipping_address']
        
        profile.payment_info = data['payment_info']
        
        db.session.add(profile)
        db.session.commit()
        
        return jsonify({
            'id': profile.id,
            'name': profile.name,
            'message': 'Billing profile created successfully'
        }), 201
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating billing profile: {e}")
        return jsonify({'error': str(e)}), 500

@profiles_bp.route('/<int:profile_id>', methods=['GET'])
def get_profile(profile_id):
    """Get a specific billing profile by ID"""
    profile = BillingProfile.query.get_or_404(profile_id)
    
    # Check if sensitive info should be included
    include_sensitive = request.args.get('include_sensitive', 'false').lower() == 'true'
    
    return jsonify(profile.to_dict(include_sensitive=include_sensitive))

@profiles_bp.route('/<int:profile_id>', methods=['PUT'])
def update_profile(profile_id):
    """Update a billing profile"""
    profile = BillingProfile.query.get_or_404(profile_id)
    data = request.json
    
    try:
        # Update basic fields
        if 'name' in data:
            profile.name = data['name']
        
        # Update encrypted fields
        if 'billing_address' in data:
            profile.billing_address = data['billing_address']
        
        if 'shipping_address' in data:
            profile.shipping_address = data['shipping_address']
        
        if 'payment_info' in data:
            profile.payment_info = data['payment_info']
        
        db.session.commit()
        
        return jsonify({
            'id': profile.id,
            'message': 'Billing profile updated successfully'
        })
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating billing profile: {e}")
        return jsonify({'error': str(e)}), 500

@profiles_bp.route('/<int:profile_id>', methods=['DELETE'])
def delete_profile(profile_id):
    """Delete a billing profile"""
    profile = BillingProfile.query.get_or_404(profile_id)
    
    try:
        # Check if this profile is referenced by any purchases
        if profile.purchases:
            return jsonify({
                'error': 'Cannot delete profile with associated purchases'
            }), 400
        
        db.session.delete(profile)
        db.session.commit()
        
        return jsonify({
            'message': 'Billing profile deleted successfully'
        })
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting billing profile: {e}")
        return jsonify({'error': str(e)}), 500