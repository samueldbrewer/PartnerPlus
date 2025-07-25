from flask import Blueprint, request, jsonify
from models import db, Purchase, BillingProfile
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

purchases_bp = Blueprint('purchases', __name__)

@purchases_bp.route('', methods=['POST'])
def create_purchase():
    """Purchase automation functionality has been removed"""
    return jsonify({
        'success': False,
        'error': 'Purchase automation functionality has been removed',
        'message': 'This feature is no longer available'
    }), 501

@purchases_bp.route('', methods=['GET'])
def get_purchases():
    """Get all purchases with pagination"""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    
    # Get filter parameters
    part_number = request.args.get('part_number')
    status = request.args.get('status')
    profile_id = request.args.get('billing_profile_id', type=int)
    
    # Create query with optional filters
    query = Purchase.query
    
    if part_number:
        query = query.filter(Purchase.part_number.ilike(f'%{part_number}%'))
    if status:
        query = query.filter(Purchase.status == status)
    if profile_id:
        query = query.filter(Purchase.billing_profile_id == profile_id)
    
    # Execute query with pagination
    pagination = query.order_by(Purchase.created_at.desc()).paginate(page=page, per_page=per_page)
    
    purchases = []
    for purchase in pagination.items:
        purchases.append({
            'id': purchase.id,
            'part_number': purchase.part_number,
            'supplier_url': purchase.supplier_url,
            'quantity': purchase.quantity,
            'price': purchase.price,
            'status': purchase.status,
            'confirmation_code': purchase.confirmation_code,
            'order_id': purchase.order_id,
            'billing_profile_id': purchase.billing_profile_id,
            'created_at': purchase.created_at.isoformat(),
            'completed_at': purchase.completed_at.isoformat() if purchase.completed_at else None
        })
    
    return jsonify({
        'purchases': purchases,
        'total': pagination.total,
        'pages': pagination.pages,
        'page': page,
        'per_page': per_page
    })

@purchases_bp.route('/<int:purchase_id>', methods=['GET'])
def get_purchase(purchase_id):
    """Get a specific purchase by ID"""
    purchase = Purchase.query.get_or_404(purchase_id)
    
    return jsonify({
        'id': purchase.id,
        'part_number': purchase.part_number,
        'supplier_url': purchase.supplier_url,
        'quantity': purchase.quantity,
        'price': purchase.price,
        'status': purchase.status,
        'confirmation_code': purchase.confirmation_code,
        'order_id': purchase.order_id,
        'error_message': purchase.error_message,
        'error_screenshot': purchase.error_screenshot,
        'billing_profile_id': purchase.billing_profile_id,
        'created_at': purchase.created_at.isoformat(),
        'updated_at': purchase.updated_at.isoformat(),
        'completed_at': purchase.completed_at.isoformat() if purchase.completed_at else None
    })

@purchases_bp.route('/<int:purchase_id>/cancel', methods=['POST'])
def cancel_purchase(purchase_id):
    """Cancel a purchase if it's still pending"""
    purchase = Purchase.query.get_or_404(purchase_id)
    
    # Check if purchase can be cancelled
    if purchase.status != 'pending':
        return jsonify({
            'error': f'Cannot cancel purchase with status: {purchase.status}'
        }), 400
    
    try:
        # Update purchase status
        purchase.status = 'cancelled'
        db.session.commit()
        
        return jsonify({
            'id': purchase.id,
            'message': 'Purchase cancelled successfully'
        })
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error cancelling purchase: {e}")
        return jsonify({'error': str(e)}), 500

@purchases_bp.route('/<int:purchase_id>/retry', methods=['POST'])
def retry_purchase(purchase_id):
    """Purchase automation functionality has been removed"""
    return jsonify({
        'success': False,
        'error': 'Purchase automation functionality has been removed',
        'message': 'This feature is no longer available'
    }), 501