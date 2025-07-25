from flask import Blueprint, request, jsonify, current_app
from models import db, Manual, ErrorCode, PartReference
from services.manual_finder import search_manuals as search_manuals_service
from services.manual_finder import download_manual as download_manual_service
from services.manual_finder import verify_manual_contains_model, get_pdf_page_count
from services.manual_parser import extract_text_from_pdf, extract_information, extract_components
from services.pdf_preview_generator import PDFPreviewGenerator
from services.pdf_two_page_preview import PDFTwoPagePreview
import os
import logging
import re
import time
import concurrent.futures
from threading import Thread

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

manuals_bp = Blueprint('manuals', __name__)

# Store manual URLs temporarily for proxy access
manual_url_cache = {}

@manuals_bp.route('/search', methods=['GET', 'POST'])
def search_manuals():
    """Search for manuals by make, model and optional year"""
    if request.method == 'POST':
        data = request.json
        make = data.get('make')
        model = data.get('model')
        year = data.get('year')
        manual_type = data.get('manual_type', 'technical')
    else:
        make = request.args.get('make')
        model = request.args.get('model')
        year = request.args.get('year')
        manual_type = request.args.get('type', 'technical')
    
    if not make or not model:
        return jsonify({'error': 'Make and model parameters are required'}), 400
    
    try:
        if year:
            logger.info(f"Searching for {manual_type} manuals for {make} {model} {year}")
            results = search_manuals_service(make, model, manual_type, year)
        else:
            logger.info(f"Searching for {manual_type} manuals for {make} {model}")
            results = search_manuals_service(make, model, manual_type)
        
        # Add two-page preview generation for PDFs
        two_page_preview = PDFTwoPagePreview()
        preview_generator = PDFPreviewGenerator()  # Fallback
        
        # Add source domain to each result
        for result in results:
            # The source_domain should already be added in search_manuals_service
            # Ensure it's there
            if 'source_domain' not in result:
                try:
                    from urllib.parse import urlparse
                    domain = urlparse(result.get('url', '')).netloc
                    result['source_domain'] = domain.replace('www.', '')
                except:
                    result['source_domain'] = 'unknown'
        
        # Generate preview images and verify manuals asynchronously
        def generate_preview_and_verify_async(result):
            try:
                pdf_url = result.get('url', '')
                logger.info(f"Attempting to generate preview for: {pdf_url}")
                
                # Download the PDF temporarily for verification and page count
                temp_path = None
                try:
                    temp_path = download_manual_service(pdf_url)
                    
                    # Get page count
                    page_count = get_pdf_page_count(temp_path)
                    if page_count:
                        result['pages'] = page_count
                    else:
                        result['pages'] = None
                    
                    # Verify model is in the manual
                    if verify_manual_contains_model(temp_path, model):
                        result['model_verified'] = True
                    else:
                        result['model_verified'] = False
                        logger.info(f"Model '{model}' not found in manual: {result.get('title', 'Unknown')}")
                    
                    # Clean up temp file
                    if temp_path and os.path.exists(temp_path):
                        os.remove(temp_path)
                except Exception as ve:
                    logger.error(f"Error verifying manual: {ve}")
                    result['model_verified'] = True  # Default to include if can't verify
                    result['pages'] = None
                
                # Try two-page preview first
                preview_url = two_page_preview.generate_from_url(pdf_url)
                if not preview_url:
                    logger.info("Two-page preview failed, trying simple screenshot")
                    # Fall back to simple screenshot
                    preview_url = preview_generator.generate_preview_from_url(pdf_url)
                
                if preview_url:
                    result['preview_image'] = preview_url
                    logger.info(f"Generated preview for: {result.get('title', 'Unknown')}")
                else:
                    logger.error(f"Failed to generate any preview for: {pdf_url}")
            except Exception as e:
                logger.error(f"Error generating preview: {e}", exc_info=True)
                result['model_verified'] = True  # Default to include
                result['pages'] = None
        
        # Start preview generation and verification in background threads
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            futures = []
            for result in results[:4]:  # Reduced to 4 for two-page previews (slower)
                result['preview_image'] = None  # Initialize
                result['model_verified'] = True  # Default
                result['pages'] = None  # Initialize
                future = executor.submit(generate_preview_and_verify_async, result)
                futures.append(future)
            
            # Wait briefly for some previews to complete (max 3 seconds for two-page)
            concurrent.futures.wait(futures, timeout=3.0)
        
        # Filter out manuals that don't contain the model (after verification)
        verified_results = [r for r in results if r.get('model_verified', True)]
        
        # Generate proxy URLs for PDFs to avoid ad blocker issues
        import uuid
        for result in verified_results:
            proxy_id = str(uuid.uuid4())[:8]
            manual_url_cache[proxy_id] = result['url']
            result['proxy_url'] = f"/api/manuals/proxy/{proxy_id}"
            
        return jsonify({
            'make': make,
            'model': model,
            'year': year,
            'type': manual_type,
            'count': len(verified_results),
            'results': verified_results
        })
    except Exception as e:
        logger.error(f"Error searching manuals: {e}")
        return jsonify({'error': str(e)}), 500

@manuals_bp.route('', methods=['GET'])
def get_manuals():
    """Get all manuals with pagination"""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    
    # Get filter parameters
    make = request.args.get('make')
    model = request.args.get('model')
    year = request.args.get('year')
    
    # Create query with optional filters
    query = Manual.query
    
    if make:
        query = query.filter(Manual.make.ilike(f'%{make}%'))
    if model:
        query = query.filter(Manual.model.ilike(f'%{model}%'))
    if year:
        query = query.filter(Manual.year == year)
    
    # Execute query with pagination
    pagination = query.order_by(Manual.created_at.desc()).paginate(page=page, per_page=per_page)
    
    manuals = []
    for manual in pagination.items:
        manuals.append({
            'id': manual.id,
            'title': manual.title,
            'make': manual.make,
            'model': manual.model,
            'year': manual.year,
            'file_format': manual.file_format,
            'processed': manual.processed,
            'created_at': manual.created_at.isoformat(),
            'url': manual.url
        })
    
    return jsonify({
        'manuals': manuals,
        'total': pagination.total,
        'pages': pagination.pages,
        'page': page,
        'per_page': per_page
    })

@manuals_bp.route('', methods=['POST'])
def create_manual():
    """Create a new manual entry"""
    data = request.json
    
    # Validate required fields
    required_fields = ['title', 'make', 'model', 'url']
    for field in required_fields:
        if field not in data:
            return jsonify({'error': f'Missing required field: {field}'}), 400
    
    # Create manual
    manual = Manual(
        title=data['title'],
        make=data['make'],
        model=data['model'],
        year=data.get('year'),
        url=data['url'],
        file_format=data.get('file_format', 'pdf')
    )
    
    db.session.add(manual)
    db.session.commit()
    
    return jsonify({
        'id': manual.id,
        'title': manual.title,
        'message': 'Manual created successfully'
    }), 201

@manuals_bp.route('/<int:manual_id>', methods=['GET'])
def get_manual(manual_id):
    """Get a specific manual by ID"""
    manual = Manual.query.get_or_404(manual_id)
    
    return jsonify({
        'id': manual.id,
        'title': manual.title,
        'make': manual.make,
        'model': manual.model,
        'year': manual.year,
        'url': manual.url,
        'local_path': manual.local_path,
        'file_format': manual.file_format,
        'processed': manual.processed,
        'created_at': manual.created_at.isoformat(),
        'updated_at': manual.updated_at.isoformat()
    })

@manuals_bp.route('/<int:manual_id>', methods=['PUT'])
def update_manual(manual_id):
    """Update a manual"""
    manual = Manual.query.get_or_404(manual_id)
    data = request.json
    
    # Update fields
    if 'title' in data:
        manual.title = data['title']
    if 'make' in data:
        manual.make = data['make']
    if 'model' in data:
        manual.model = data['model']
    if 'year' in data:
        manual.year = data['year']
    if 'url' in data:
        manual.url = data['url']
    if 'file_format' in data:
        manual.file_format = data['file_format']
    
    db.session.commit()
    
    return jsonify({
        'id': manual.id,
        'message': 'Manual updated successfully'
    })

@manuals_bp.route('/<int:manual_id>', methods=['DELETE'])
def delete_manual(manual_id):
    """Delete a manual"""
    manual = Manual.query.get_or_404(manual_id)
    
    # Delete associated records
    ErrorCode.query.filter_by(manual_id=manual_id).delete()
    PartReference.query.filter_by(manual_id=manual_id).delete()
    
    # Delete the manual itself
    db.session.delete(manual)
    db.session.commit()
    
    return jsonify({
        'message': 'Manual deleted successfully'
    })

@manuals_bp.route('/<int:manual_id>/download', methods=['POST'])
def download_manual(manual_id):
    """Download a manual if not already downloaded"""
    manual = Manual.query.get_or_404(manual_id)
    
    # Check if already downloaded
    if manual.local_path and os.path.exists(manual.local_path):
        return jsonify({
            'message': 'Manual already downloaded',
            'local_path': manual.local_path
        })
    
    # Download the manual
    try:
        local_path = download_manual_service(manual.url)
        manual.local_path = local_path
        db.session.commit()
        
        return jsonify({
            'message': 'Manual downloaded successfully',
            'local_path': local_path
        })
    except Exception as e:
        logger.error(f"Error downloading manual: {e}")
        return jsonify({'error': str(e)}), 500

@manuals_bp.route('/<int:manual_id>/process', methods=['POST'])
def process_manual(manual_id):
    """Process a manual to extract information"""
    manual = Manual.query.get_or_404(manual_id)
    
    try:
        # Download the manual if not already downloaded
        if not manual.local_path or not os.path.exists(manual.local_path):
            local_path = download_manual_service(manual.url)
            manual.local_path = local_path
            db.session.commit()
        
        # Extract text from the PDF
        logger.info(f"Extracting text from manual ID {manual_id} PDF")
        text = extract_text_from_pdf(manual.local_path)
        
        # Extract information from the text (pass manual_id for better logging)
        logger.info(f"Performing AI analysis on manual ID {manual_id}")
        start_time = time.time()
        extracted_info = extract_information(text, manual_id)
        duration = time.time() - start_time
        logger.info(f"Manual ID {manual_id} processing completed in {duration:.2f} seconds")
        
        # Store error codes
        for error_code in extracted_info['error_codes']:
            # Check if this error code already exists for this manual
            existing = ErrorCode.query.filter_by(
                manual_id=manual.id, 
                code=error_code['code']
            ).first()
            
            if not existing:
                code = ErrorCode(
                    manual_id=manual.id,
                    code=error_code['code'],
                    description=error_code.get('description', '')
                )
                db.session.add(code)
        
        # Store part references
        for part in extracted_info['part_numbers']:
            # Check if this part already exists for this manual
            existing = PartReference.query.filter_by(
                manual_id=manual.id, 
                part_number=part['code']
            ).first()
            
            if not existing:
                part_ref = PartReference(
                    manual_id=manual.id,
                    part_number=part['code'],
                    description=part.get('description', '')
                )
                db.session.add(part_ref)
        
        # Update manual with comprehensive information
        manual.processed = True
        # Store the manual subject if available
        if 'manual_subject' in extracted_info and extracted_info['manual_subject'] != "Unknown":
            if not manual.title or manual.title == "Unknown Title":
                manual.title = extracted_info['manual_subject']
                
        # Commit all changes
        db.session.commit()
        
        # Return comprehensive analysis results including actual error codes and part numbers
        return jsonify({
            'message': 'Manual processed successfully',
            'manual_id': manual.id,
            'manual_subject': extracted_info.get('manual_subject', 'Unknown'),
            'error_codes_count': len(extracted_info['error_codes']),
            'part_numbers_count': len(extracted_info['part_numbers']),
            'error_codes': extracted_info['error_codes'],  # Include the actual error codes
            'part_numbers': extracted_info['part_numbers'],  # Include the actual part numbers
            'common_problems': extracted_info.get('common_problems', []),
            'maintenance_procedures': extracted_info.get('maintenance_procedures', []),
            'safety_warnings': extracted_info.get('safety_warnings', [])
        })
        
    except Exception as e:
        logger.error(f"Error processing manual: {e}")
        return jsonify({'error': str(e)}), 500

@manuals_bp.route('/multi-process', methods=['POST'])
def process_multiple_manuals():
    """
    Process multiple manuals (up to 3) and reconcile the results.
    
    Request format:
    {
        "manual_ids": [1, 2, 3]  # List of up to 3 manual IDs to process
    }
    """
    data = request.json
    
    if not data or 'manual_ids' not in data:
        return jsonify({'error': 'Missing manual_ids parameter'}), 400
    
    manual_ids = data.get('manual_ids')
    
    if not isinstance(manual_ids, list):
        return jsonify({'error': 'manual_ids must be a list'}), 400
    
    if len(manual_ids) < 1:
        return jsonify({'error': 'At least one manual ID is required'}), 400
    
    if len(manual_ids) > 3:
        return jsonify({'error': 'Maximum of 3 manual IDs allowed'}), 400
    
    try:
        # First collect all available manuals
        manual_objects = []
        manuals_info = []
        
        for manual_id in manual_ids:
            manual = Manual.query.get(manual_id)
            if not manual:
                logger.warning(f"Manual with ID {manual_id} not found, skipping")
                continue
            
            manuals_info.append({
                'id': manual.id,
                'title': manual.title,
                'make': manual.make,
                'model': manual.model,
                'year': manual.year
            })
            manual_objects.append(manual)
        
        # Download all manuals in parallel
        logger.info(f"Downloading {len(manual_objects)} manuals in parallel")
        download_start = time.time()
        
        # Process manual download using ThreadPoolExecutor
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(manual_objects)) as executor:
            download_futures = []
            
            # Get Flask app instance for thread context
            from flask import current_app
            app = current_app._get_current_object()  # Get the actual app object, not proxy
            
            # Start all downloads concurrently
            for manual in manual_objects:
                if not manual.local_path or not os.path.exists(manual.local_path):
                    download_futures.append(
                        executor.submit(download_and_update_manual, manual, manual.url, app)
                    )
                else:
                    logger.info(f"Manual ID {manual.id} already downloaded to {manual.local_path}")
            
            # Wait for all downloads to complete
            concurrent.futures.wait(download_futures)
        
        download_duration = time.time() - download_start
        logger.info(f"All downloads completed in {download_duration:.2f} seconds")
        
        # Process each manual in parallel and collect results
        logger.info(f"Processing {len(manual_objects)} manuals in parallel")
        process_start = time.time()
        manual_results = []
        extraction_results = []
        
        # Process manual extraction using ThreadPoolExecutor
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(manual_objects)) as executor:
            processing_futures = []
            
            # Get Flask app instance for thread context (reusing from earlier)
            if not 'app' in locals():
                from flask import current_app
                app = current_app._get_current_object()  # Get the actual app object, not proxy
            
            # Start all processing tasks concurrently
            for manual in manual_objects:
                if manual.local_path and os.path.exists(manual.local_path):
                    processing_futures.append(
                        executor.submit(process_manual_content, manual, app)
                    )
                    
            # Wait for all processing to complete and collect results
            for future in concurrent.futures.as_completed(processing_futures):
                try:
                    result = future.result()
                    if result:
                        manual_results.append(result['result_data'])
                        extraction_results.append(result)
                except Exception as e:
                    logger.error(f"Error processing manual content: {e}")
        
        process_duration = time.time() - process_start
        logger.info(f"All processing completed in {process_duration:.2f} seconds")
        
        # Update database with extraction results
        logger.info("Updating database with extraction results")
        for extraction in extraction_results:
            if not extraction or not extraction.get('success'):
                continue
                
            manual = extraction['manual']
            extracted_info = extraction['extracted_info']
            manual_id = manual.id
            
            # Use a fresh session for each manual update
            try:
                # Mark as processed and update database records
                manual.processed = True
                
                # Store the manual subject if available
                if 'manual_subject' in extracted_info and extracted_info['manual_subject'] != "Unknown":
                    if not manual.title or manual.title == "Unknown Title":
                        manual.title = extracted_info['manual_subject']
                
                # Safely store error codes
                error_count = 0
                for error_code in extracted_info['error_codes']:
                    # Check if this error code already exists for this manual
                    existing = ErrorCode.query.filter_by(
                        manual_id=manual_id, 
                        code=error_code['code']
                    ).first()
                    
                    if not existing:
                        code = ErrorCode(
                            manual_id=manual_id,
                            code=error_code['code'],
                            description=error_code.get('description', '')
                        )
                        db.session.add(code)
                        error_count += 1
                
                # Safely store part references
                part_count = 0
                for part in extracted_info['part_numbers']:
                    # Check if this part already exists for this manual
                    existing = PartReference.query.filter_by(
                        manual_id=manual_id, 
                        part_number=part['code']
                    ).first()
                    
                    if not existing:
                        part_ref = PartReference(
                            manual_id=manual_id,
                            part_number=part['code'],
                            description=part.get('description', '')
                        )
                        db.session.add(part_ref)
                        part_count += 1
                        
                logger.info(f"Added {error_count} new error codes and {part_count} new part references for manual ID {manual_id}")  
                
            except Exception as e:
                logger.error(f"Error updating database for manual ID {manual_id}: {e}")
                # Continue with other manuals even if one fails
        
        # Commit all database changes
        db.session.commit()
        
        # Start reconciliation
        logger.info(f"Starting reconciliation of {len(manual_results)} manual results")
        reconcile_start = time.time()
        reconciled_results = reconcile_multiple_manual_results(manual_results)
        reconcile_duration = time.time() - reconcile_start
        logger.info(f"Reconciliation completed in {reconcile_duration:.2f} seconds")
        
        # Calculate total duration
        total_duration = time.time() - download_start
        logger.info(f"Total processing time: {total_duration:.2f} seconds")
        
        # Enhanced statistics for the response
        stats = reconciled_results.get('statistics', {})
        processing_stats = {
            'download_time': f"{download_duration:.2f} seconds",
            'processing_time': f"{process_duration:.2f} seconds",
            'reconciliation_time': f"{reconcile_duration:.2f} seconds",
            'total_time': f"{total_duration:.2f} seconds",
            'manual_count': len(manual_results),
            'raw_error_codes': stats.get('raw_error_codes', 0),
            'unique_error_codes': stats.get('unique_error_codes', 0),
            'raw_part_numbers': stats.get('raw_part_numbers', 0),
            'unique_part_numbers': stats.get('unique_part_numbers', 0)
        }
        
        # Add processing stats to reconciled results
        reconciled_results['processing_stats'] = processing_stats
        
        # Return combined and reconciled results
        return jsonify({
            'message': f'Successfully processed {len(manual_results)} manuals',
            'manuals': manuals_info,
            'reconciled_results': reconciled_results
        })
        
    except Exception as e:
        logger.error(f"Error processing multiple manuals: {e}")
        return jsonify({'error': str(e)}), 500

def download_and_update_manual(manual, url, app):
    """
    Helper function to download a manual and update the database
    
    Args:
        manual (Manual): Manual object to update
        url (str): URL to download from
        app: Flask application instance for context management
        
    Returns:
        dict: Result of the download operation
    """
    try:
        logger.info(f"Downloading manual ID {manual.id} from {url}")
        start_time = time.time()
        
        # Download the manual
        local_path = download_manual_service(url)
        duration = time.time() - start_time
        
        # Use Flask app context for database operations
        with app.app_context():
            # Get a fresh instance of the manual from the database
            from models import Manual, db
            db_manual = Manual.query.get(manual.id)
            if db_manual:
                db_manual.local_path = local_path
                db.session.commit()
                logger.info(f"Database updated with local path for manual ID {manual.id}")
            else:
                logger.warning(f"Manual ID {manual.id} not found in database when updating local path")
        
        logger.info(f"Manual ID {manual.id} downloaded to {local_path} in {duration:.2f} seconds")
        return {
            'success': True,
            'manual_id': manual.id,
            'local_path': local_path,
            'duration': duration
        }
    except Exception as e:
        logger.error(f"Error downloading manual ID {manual.id} from {url}: {e}")
        return {
            'success': False,
            'manual_id': manual.id,
            'error': str(e)
        }

def process_manual_content(manual, app):
    """
    Helper function to process a manual's content
    
    Args:
        manual (Manual): Manual object to process
        app: Flask application instance for context management
        
    Returns:
        dict: Extraction results and manual information
    """
    try:
        manual_id = manual.id
        manual_path = manual.local_path  # Store the path since we'll need it outside app context
        logger.info(f"Processing manual ID {manual_id} content")
        start_time = time.time()
        
        # Verify the file exists before processing
        if not os.path.exists(manual_path):
            logger.error(f"Manual file not found at {manual_path} for manual ID {manual_id}")
            return None
            
        # Extract text from the PDF - doesn't need app context
        logger.info(f"Extracting text from manual ID {manual_id}")
        text = extract_text_from_pdf(manual_path)
        
        # Extract information from the text (pass manual_id for better logging)
        logger.info(f"Extracting information from manual ID {manual_id} text")
        extracted_info = extract_information(text, manual_id)
        
        # Prepare results
        result_data = {
            'manual_id': manual_id,
            'manual_subject': extracted_info.get('manual_subject', 'Unknown'),
            'error_codes': extracted_info['error_codes'],
            'part_numbers': extracted_info['part_numbers'],
            'common_problems': extracted_info.get('common_problems', []),
            'maintenance_procedures': extracted_info.get('maintenance_procedures', []),
            'safety_warnings': extracted_info.get('safety_warnings', [])
        }
        
        # Get fresh manual object within app context
        with app.app_context():
            from models import Manual, db
            db_manual = Manual.query.get(manual_id)
        
        duration = time.time() - start_time
        logger.info(f"Manual ID {manual_id} processed in {duration:.2f} seconds")
        logger.info(f"Found {len(extracted_info['error_codes'])} error codes and {len(extracted_info['part_numbers'])} part numbers in manual ID {manual_id}")
        
        return {
            'success': True,
            'manual': db_manual or manual,  # Use the fresh object if available
            'extracted_info': extracted_info,
            'result_data': result_data,
            'duration': duration
        }
    except Exception as e:
        logger.error(f"Error processing manual ID {manual.id}: {e}")
        return None

def reconcile_multiple_manual_results(manual_results):
    """
    Reconcile results from multiple manuals, removing duplicates and selecting the best data.
    
    Args:
        manual_results (list): List of dictionaries containing extraction results from each manual
        
    Returns:
        dict: Reconciled results with deduplicated error codes and part numbers
    """
    if not manual_results:
        return {
            'error_codes': [],
            'part_numbers': [],
            'common_problems': [],
            'maintenance_procedures': [],
            'safety_warnings': []
        }
    
    # Initialize counters for statistics
    manual_count = len(manual_results)
    raw_error_codes_count = sum(len(m['error_codes']) for m in manual_results)
    raw_part_numbers_count = sum(len(m['part_numbers']) for m in manual_results)
    
    logger.info(f"Reconciling results from {manual_count} manuals")
    logger.info(f"Raw error codes: {raw_error_codes_count}, Raw part numbers: {raw_part_numbers_count}")
    
    # Use dictionaries to track unique codes (based on normalized keys)
    error_codes_dict = {}
    part_numbers_dict = {}
    common_problems_dict = {}
    maintenance_procedures_set = set()
    safety_warnings_set = set()
    
    # Track which codes appear in multiple manuals (for confidence scoring)
    error_code_appearances = {}
    part_number_appearances = {}
    
    # Helper function to normalize codes for comparison
    def normalize_code(code):
        # Remove all whitespace and special characters, convert to uppercase
        return re.sub(r'[^A-Z0-9]', '', code.upper())
    
    # First pass: Collect all unique codes and track their appearances across manuals
    for manual_result in manual_results:
        manual_id = manual_result['manual_id']
        
        # Process error codes
        for error in manual_result['error_codes']:
            code = error['code']
            norm_code = normalize_code(code)
            
            # Update appearances count
            if norm_code not in error_code_appearances:
                error_code_appearances[norm_code] = set()
            error_code_appearances[norm_code].add(manual_id)
            
            # Update the dictionary with this code
            if norm_code not in error_codes_dict:
                error_codes_dict[norm_code] = {
                    'code': code,
                    'description': error.get('description', ''),
                    'normalized_code': norm_code,
                    'sources': [manual_id],
                    'all_descriptions': [error.get('description', '')]
                }
            else:
                # Track the source manual
                if manual_id not in error_codes_dict[norm_code]['sources']:
                    error_codes_dict[norm_code]['sources'].append(manual_id)
                
                # Keep the existing code format if it's more detailed
                if len(code) > len(error_codes_dict[norm_code]['code']):
                    error_codes_dict[norm_code]['code'] = code
                
                # Track all descriptions for later reconciliation
                if error.get('description') and error.get('description') not in error_codes_dict[norm_code]['all_descriptions']:
                    error_codes_dict[norm_code]['all_descriptions'].append(error.get('description', ''))
        
        # Process part numbers
        for part in manual_result['part_numbers']:
            code = part['code']
            norm_code = normalize_code(code)
            
            # Update appearances count
            if norm_code not in part_number_appearances:
                part_number_appearances[norm_code] = set()
            part_number_appearances[norm_code].add(manual_id)
            
            # Update the dictionary with this code
            if norm_code not in part_numbers_dict:
                part_numbers_dict[norm_code] = {
                    'code': code,
                    'description': part.get('description', ''),
                    'normalized_code': norm_code,
                    'sources': [manual_id],
                    'all_descriptions': [part.get('description', '')]
                }
            else:
                # Track the source manual
                if manual_id not in part_numbers_dict[norm_code]['sources']:
                    part_numbers_dict[norm_code]['sources'].append(manual_id)
                
                # Keep the existing code format if it's more detailed
                if len(code) > len(part_numbers_dict[norm_code]['code']):
                    part_numbers_dict[norm_code]['code'] = code
                
                # Track all descriptions for later reconciliation
                if part.get('description') and part.get('description') not in part_numbers_dict[norm_code]['all_descriptions']:
                    part_numbers_dict[norm_code]['all_descriptions'].append(part.get('description', ''))
        
        # Process common problems (using problem text as key)
        for problem in manual_result.get('common_problems', []):
            problem_key = problem.get('issue', '').strip().lower()
            if problem_key and problem_key not in common_problems_dict:
                common_problems_dict[problem_key] = problem
        
        # Process maintenance procedures
        for procedure in manual_result.get('maintenance_procedures', []):
            proc_text = procedure.strip()
            if proc_text:
                maintenance_procedures_set.add(proc_text)
        
        # Process safety warnings
        for warning in manual_result.get('safety_warnings', []):
            warning_text = warning.strip()
            if warning_text:
                safety_warnings_set.add(warning_text)
    
    # Second pass: Reconcile descriptions and choose the best one
    # For error codes and part numbers, prefer:
    # 1. Descriptions that appear in multiple manuals
    # 2. Longer, more detailed descriptions
    
    reconciled_error_codes = []
    for norm_code, error_data in error_codes_dict.items():
        # Calculate a confidence score based on number of manuals with this code
        confidence = (len(error_data['sources']) / manual_count) * 100
        
        # Choose the best description
        if len(error_data['all_descriptions']) > 1:
            # Sort descriptions by length (prefer longer descriptions)
            sorted_descriptions = sorted(
                [desc for desc in error_data['all_descriptions'] if desc], 
                key=len, 
                reverse=True
            )
            best_description = sorted_descriptions[0] if sorted_descriptions else ""
        else:
            best_description = error_data['description']
        
        # Create the reconciled error code
        reconciled_error = {
            'code': error_data['code'],
            'Error Code Number': error_data['code'],
            'Short Error Description': best_description,
            'description': best_description,
            'confidence': confidence,
            'manual_count': len(error_data['sources'])
        }
        reconciled_error_codes.append(reconciled_error)
    
    reconciled_part_numbers = []
    for norm_code, part_data in part_numbers_dict.items():
        # Calculate a confidence score based on number of manuals with this part number
        confidence = (len(part_data['sources']) / manual_count) * 100
        
        # Choose the best description
        if len(part_data['all_descriptions']) > 1:
            # Sort descriptions by length (prefer longer descriptions)
            sorted_descriptions = sorted(
                [desc for desc in part_data['all_descriptions'] if desc], 
                key=len, 
                reverse=True
            )
            best_description = sorted_descriptions[0] if sorted_descriptions else ""
        else:
            best_description = part_data['description']
        
        # Create the reconciled part number
        reconciled_part = {
            'code': part_data['code'],
            'OEM Part Number': part_data['code'],
            'Short Part Description': best_description,
            'description': best_description,
            'confidence': confidence,
            'manual_count': len(part_data['sources'])
        }
        reconciled_part_numbers.append(reconciled_part)
    
    # Sort the reconciled results by confidence (highest first)
    reconciled_error_codes.sort(key=lambda x: x['confidence'], reverse=True)
    reconciled_part_numbers.sort(key=lambda x: x['confidence'], reverse=True)
    
    # Log reconciliation statistics
    logger.info(f"Reconciliation complete: {len(reconciled_error_codes)} unique error codes, {len(reconciled_part_numbers)} unique part numbers")
    logger.info(f"Deduplication rates: Error codes {(1 - len(reconciled_error_codes) / raw_error_codes_count) * 100:.1f}%, "
               f"Part numbers {(1 - len(reconciled_part_numbers) / raw_part_numbers_count) * 100:.1f}%")
    
    # Return the reconciled results
    return {
        'error_codes': reconciled_error_codes,
        'part_numbers': reconciled_part_numbers,
        'common_problems': list(common_problems_dict.values()),
        'maintenance_procedures': list(maintenance_procedures_set),
        'safety_warnings': list(safety_warnings_set),
        'statistics': {
            'manual_count': manual_count,
            'raw_error_codes': raw_error_codes_count,
            'unique_error_codes': len(reconciled_error_codes),
            'raw_part_numbers': raw_part_numbers_count,
            'unique_part_numbers': len(reconciled_part_numbers)
        }
    }

@manuals_bp.route('/<int:manual_id>/error-codes', methods=['GET'])
def get_error_codes(manual_id):
    """Get error codes for a specific manual"""
    Manual.query.get_or_404(manual_id)  # Ensure manual exists
    
    error_codes = ErrorCode.query.filter_by(manual_id=manual_id).all()
    
    return jsonify({
        'manual_id': manual_id,
        'error_codes': [{
            'id': code.id,
            'code': code.code,
            'description': code.description,
            'resolution': code.resolution,
            'severity': code.severity
        } for code in error_codes]
    })

@manuals_bp.route('/<int:manual_id>/part-numbers', methods=['GET'])
def get_part_numbers(manual_id):
    """Get part numbers for a specific manual"""
    Manual.query.get_or_404(manual_id)  # Ensure manual exists
    
    part_references = PartReference.query.filter_by(manual_id=manual_id).all()
    
    return jsonify({
        'manual_id': manual_id,
        'part_numbers': [{
            'id': ref.id,
            'part_number': ref.part_number,
            'description': ref.description,
            'quantity': ref.quantity,
            'location': ref.location
        } for ref in part_references]
    })

@manuals_bp.route('/<int:manual_id>/components', methods=['GET'])
def get_manual_components(manual_id):
    """
    Parse a manual into key structural components like exploded views, 
    installation instructions, error code tables, troubleshooting flowcharts, etc.
    Identifies components by page number ranges.
    """
    # Get the manual from the database
    manual = Manual.query.get_or_404(manual_id)
    
    try:
        # Download the manual if not already downloaded
        if not manual.local_path or not os.path.exists(manual.local_path):
            local_path = download_manual_service(manual.url)
            manual.local_path = local_path
            db.session.commit()
        
        # Extract text from the PDF
        text = extract_text_from_pdf(manual.local_path)
        
        # Extract components from the text
        default_prompt = "Analyze this technical manual and identify key structural components with page ranges"
        extracted_components = extract_components(text, default_prompt)
        
        # Return components results
        result = {
            'manual_id': manual.id,
            'title': manual.title,
            'make': manual.make,
            'model': manual.model,
            'components': extracted_components
        }
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error extracting manual components: {e}")
        return jsonify({'error': str(e)}), 500


@manuals_bp.route('/<int:manual_id>/process-components', methods=['POST'])
def process_manual_components(manual_id):
    """Process a manual to extract components information with optional custom prompt"""
    manual = Manual.query.get_or_404(manual_id)
    
    # Get custom prompt from request if provided
    data = request.json or {}
    custom_prompt = data.get('prompt')
    
    try:
        # Download the manual if not already downloaded
        if not manual.local_path or not os.path.exists(manual.local_path):
            local_path = download_manual_service(manual.url)
            manual.local_path = local_path
            db.session.commit()
        
        # Extract text from the PDF
        text = extract_text_from_pdf(manual.local_path)
        
        # Log if using a custom prompt
        if custom_prompt:
            logger.info(f"Using custom prompt for manual {manual_id}: {custom_prompt[:100]}...")
        
        # Extract components from the text with optional custom prompt
        extracted_components = extract_components(text, custom_prompt)
        
        # Update manual as processed
        manual.processed = True
        db.session.commit()
        
        # Return comprehensive components results
        result = {
            'manual_id': manual.id,
            'title': manual.title,
            'make': manual.make,
            'model': manual.model,
            'components': extracted_components
        }
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error processing manual components: {e}")
        return jsonify({'error': str(e)}), 500


@manuals_bp.route('/<int:manual_id>/components-test', methods=['GET'])
def get_components_static(manual_id):
    """
    Static test endpoint that returns component data without requiring OpenAI.
    This lets us test the frontend UI.
    """
    logger.info(f"Components-test endpoint called for manual ID: {manual_id}")
    manual = Manual.query.get_or_404(manual_id)
    
    # Define a fixed set of components for demonstration and testing
    components = {
        "table_of_contents": {
            "title": "Table of Contents",
            "start_page": 1,
            "end_page": 2,
            "description": "Lists all sections with page numbers",
            "key_information": ["Section names", "Page numbers", "Subsections"]
        },
        "introduction": {
            "title": "Introduction and Safety Information",
            "start_page": 3,
            "end_page": 5,
            "description": "Overview of the equipment and important safety warnings",
            "key_information": ["Equipment purpose", "Model specifications", "Safety precautions"]
        },
        "exploded_view": {
            "title": "Parts Breakdown Diagram",
            "start_page": 14,
            "end_page": 18,
            "description": "Detailed exploded view diagrams showing all components",
            "key_information": ["Part locations", "Assembly relationships", "Part numbers"]
        },
        "installation_instructions": {
            "title": "Installation Procedures",
            "start_page": 23,
            "end_page": 30,
            "description": "Step-by-step guide for installing the equipment",
            "key_information": ["Required tools", "Site preparation", "Assembly steps", "Initial testing"]
        },
        "error_code_table": {
            "title": "Troubleshooting and Error Codes",
            "start_page": 45,
            "end_page": 53,
            "description": "List of error codes with descriptions and remedies",
            "key_information": ["Error code format", "Common errors", "Troubleshooting steps"]
        },
        "maintenance_procedures": {
            "title": "Maintenance and Cleaning",
            "start_page": 58,
            "end_page": 65,
            "description": "Regular maintenance procedures and schedules",
            "key_information": ["Cleaning instructions", "Lubrication points", "Replacement schedules", "Preventive maintenance"]
        },
        "technical_specifications": {
            "title": "Technical Specifications",
            "start_page": 72,
            "end_page": 76,
            "description": "Detailed technical specifications and performance data",
            "key_information": ["Electrical requirements", "Dimensions", "Capacity", "Operating parameters"]
        }
    }
    
    # Add meta information
    result = {
        'manual_id': manual.id,
        'title': manual.title,
        'make': manual.make,
        'model': manual.model,
        'components': components
    }
    
    return jsonify(result)

@manuals_bp.route('/proxy/<proxy_id>')
def proxy_manual(proxy_id):
    """Proxy manual PDF to avoid ad blocker issues"""
    from flask import redirect
    
    # Get the original URL
    original_url = manual_url_cache.get(proxy_id)
    if not original_url:
        return jsonify({'error': 'Manual not found'}), 404
    
    # Redirect to the original URL
    # This avoids direct linking which can be blocked
    return redirect(original_url, code=302)