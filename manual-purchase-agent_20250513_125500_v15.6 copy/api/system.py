from flask import Blueprint, jsonify, make_response
from models import db, Manual, ErrorCode, PartReference, Part, Supplier, BillingProfile, Purchase
from sqlalchemy import text
import logging
import os
import glob
import time
from datetime import datetime

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

system_bp = Blueprint('system', __name__)

@system_bp.route('/health', methods=['GET'])
def health_check():
    """
    System health check endpoint for monitoring Flask API service status
    Returns system status, database connectivity, and response time
    """
    start_time = time.time()
    
    try:
        # Test database connectivity
        db_status = "connected"
        try:
            # Simple query to test database connection
            db.session.execute(text('SELECT 1'))
            db.session.commit()
        except Exception as e:
            db_status = f"error: {str(e)}"
            logger.error(f"Database health check failed: {e}")
        
        # Calculate response time
        response_time_ms = (time.time() - start_time) * 1000
        
        # Determine overall status
        overall_status = "healthy" if db_status == "connected" else "unhealthy"
        
        response_data = {
            'status': overall_status,
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'service': 'manual-purchase-agent',
            'version': 'v15.6',
            'database': db_status,
            'response_time_ms': round(response_time_ms, 2)
        }
        
        # Create response with no-cache headers
        response = jsonify(response_data)
        response = add_no_cache_headers(response)
        
        # Return appropriate status code
        status_code = 200 if overall_status == "healthy" else 503
        return response, status_code
        
    except Exception as e:
        logger.error(f"Health check endpoint error: {e}")
        response_time_ms = (time.time() - start_time) * 1000
        
        error_response = jsonify({
            'status': 'error',
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'service': 'manual-purchase-agent',
            'version': 'v15.6',
            'error': str(e),
            'response_time_ms': round(response_time_ms, 2)
        })
        
        return add_no_cache_headers(error_response), 503

@system_bp.route('/clear-database', methods=['POST'])
def clear_database():
    """
    Clear all data from the database (manuals, parts, profiles, suppliers, purchases)
    This is primarily for demo and testing purposes.
    Also clears any cached files and sets no-cache headers on the response.
    """
    try:
        # Delete records in dependency order
        logger.info("Clearing database: removing all records...")
        
        # Delete purchases
        Purchase.query.delete()
        logger.info("Purchases deleted")
        
        # Delete error codes and part references
        ErrorCode.query.delete()
        logger.info("Error codes deleted")
        
        PartReference.query.delete()
        logger.info("Part references deleted")
        
        # Delete suppliers
        Supplier.query.delete()
        logger.info("Suppliers deleted")
        
        # Delete parts
        Part.query.delete()
        logger.info("Parts deleted")
        
        # Delete billing profiles
        BillingProfile.query.delete()
        logger.info("Billing profiles deleted")
        
        # Delete manuals
        Manual.query.delete()
        logger.info("Manuals deleted")
        
        # Commit the changes
        db.session.commit()
        
        # Also clear any cached files in temporary directories
        clear_cache()
        
        # Create response with no-cache headers
        response = jsonify({
            'success': True,
            'message': 'Database and cache cleared successfully',
            'deleted_tables': [
                'manuals', 'error_codes', 'part_references', 
                'parts', 'suppliers', 'billing_profiles', 'purchases'
            ],
            'cache_cleared': True
        })
        
        # Add cache-busting headers
        response = add_no_cache_headers(response)
        return response
    
    except Exception as e:
        # Rollback in case of error
        db.session.rollback()
        logger.error(f"Error clearing database: {e}")
        return jsonify({
            'success': False,
            'error': f"Failed to clear database: {str(e)}"
        }), 500
        
@system_bp.route('/clear-cache', methods=['POST'])
def clear_cache_endpoint():
    """
    Clear all cached files and responses
    This is primarily for demo and testing purposes
    """
    try:
        # Clear caches
        clear_cache()
        
        # Create response with no-cache headers
        response = jsonify({
            'success': True,
            'message': 'Cache cleared successfully',
            'cache_cleared': True
        })
        
        # Add cache-busting headers
        response = add_no_cache_headers(response)
        return response
        
    except Exception as e:
        logger.error(f"Error clearing cache: {e}")
        return jsonify({
            'success': False,
            'error': f"Failed to clear cache: {str(e)}"
        }), 500
        
def clear_cache():
    """Helper function to clear various caches"""
    from flask import current_app
    from config import Config
    import tempfile
    
    logger.info("Clearing caches...")
    
    # 1. Clear uploaded files that are not referenced in the database
    # Only delete if the database is empty to avoid deleting files still in use
    if Manual.query.count() == 0:
        try:
            upload_folder = Config.UPLOAD_FOLDER
            if os.path.exists(upload_folder):
                # Get all files in the uploads folder
                for file_path in glob.glob(os.path.join(upload_folder, "*")):
                    if os.path.isfile(file_path) and not file_path.endswith("README.md"):
                        os.unlink(file_path)
                        logger.info(f"Deleted uploaded file: {file_path}")
        except Exception as e:
            logger.error(f"Error clearing uploaded files: {e}")
    
    # 2. Clear temporary files if they exist
    try:
        temp_dir = tempfile.gettempdir()
        temp_files = glob.glob(os.path.join(temp_dir, "manual_purchase_*"))
        for file_path in temp_files:
            if os.path.isfile(file_path):
                os.unlink(file_path)
                logger.info(f"Deleted temporary file: {file_path}")
    except Exception as e:
        logger.error(f"Error clearing temporary files: {e}")
    
    # Log completion
    logger.info("Cache clearing completed")

def add_no_cache_headers(response):
    """Add headers to prevent caching"""
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response