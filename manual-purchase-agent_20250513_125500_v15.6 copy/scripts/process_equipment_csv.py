#!/usr/bin/env python3
"""
Equipment CSV Processor
Processes foodservice equipment CSV and enriches data using API endpoints
Similar to v3 demo functionality
"""

import csv
import json
import requests
import time
import sys
from urllib.parse import urljoin
import argparse
from pathlib import Path
from tqdm import tqdm
import logging
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock
import threading
import queue

class EquipmentProcessor:
    def __init__(self, base_url="http://localhost:7777", delay=1.0, log_file=None):
        self.base_url = base_url
        self.delay = delay  # Delay between API calls to avoid rate limiting
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        })
        
        # Setup logging
        self.setup_logging(log_file)
        
        # Progress tracking
        self.progress_bar = None
        self.current_row = 0
        self.total_rows = 0
        
    def setup_logging(self, log_file):
        """Setup detailed logging"""
        log_format = '%(asctime)s - %(levelname)s - %(message)s'
        date_format = '%Y-%m-%d %H:%M:%S'
        
        # Configure logging
        handlers = [logging.StreamHandler(sys.stdout)]
        if log_file:
            handlers.append(logging.FileHandler(log_file))
            
        logging.basicConfig(
            level=logging.INFO,
            format=log_format,
            datefmt=date_format,
            handlers=handlers,
            force=True
        )
        
        self.logger = logging.getLogger(__name__)
        
    def log(self, level, message, **kwargs):
        """Enhanced logging with levels"""
        if kwargs:
            extra_info = ' | '.join(f'{k}={v}' for k, v in kwargs.items())
            message = f"{message} | {extra_info}"
            
        if level == 'error':
            self.logger.error(message)
        elif level == 'warning':
            self.logger.warning(message)
        elif level == 'success':
            self.logger.info(f"✅ {message}")
        elif level == 'api':
            self.logger.info(f"🔗 API: {message}")
        else:
            self.logger.info(message)
        
    def make_api_call(self, endpoint, data=None, method='POST'):
        """Make API call with error handling and retry logic"""
        url = urljoin(self.base_url, endpoint)
        
        # Use semaphore if it exists (for multi-threaded version)
        semaphore = getattr(self, 'api_semaphore', None)
        if semaphore:
            semaphore.acquire()
        
        try:
            self.log('api', f"Calling {endpoint}", 
                    method=method, 
                    data_keys=list(data.keys()) if data else None)
            
            start_time = time.time()
            try:
                if method == 'POST':
                    response = self.session.post(url, json=data, timeout=120)
                else:
                    response = self.session.get(url, timeout=60)
                
                response.raise_for_status()
                elapsed = time.time() - start_time
                
                result = response.json()
                self.log('success', f"API call completed", 
                        endpoint=endpoint, 
                        status=response.status_code,
                        elapsed_sec=f"{elapsed:.2f}")
                return result
                
            except requests.exceptions.RequestException as e:
                elapsed = time.time() - start_time
                self.log('error', f"API call failed", 
                        endpoint=endpoint, 
                        error=str(e),
                        elapsed_sec=f"{elapsed:.2f}")
                return None
            except json.JSONDecodeError as e:
                elapsed = time.time() - start_time
                self.log('error', f"Invalid JSON response", 
                        endpoint=endpoint, 
                        error=str(e),
                        elapsed_sec=f"{elapsed:.2f}")
                return None
        finally:
            # Release semaphore if it exists
            if semaphore:
                semaphore.release()
            
    def get_equipment_photo_and_manuals(self, make, model):
        """Get equipment photo and manuals using enrichment and manual search"""
        self.log('info', f"🔍 Getting photo and manuals", make=make, model=model)
        
        # Get equipment photo via enrichment
        self.log('info', "📸 Fetching equipment photo...")
        photo_data = self.make_api_call('/api/enrichment', {
            'make': make,
            'model': model
        })
        
        equipment_photo = None
        if photo_data and photo_data.get('success'):
            # Look for images in the enrichment data
            images = photo_data.get('data', {}).get('images', [])
            self.log('info', f"Enrichment returned {len(images)} images")
            if images and len(images) > 0:
                # Take the first image URL
                first_image = images[0]
                equipment_photo = first_image.get('url') or first_image.get('image_url') or first_image.get('link')
                if equipment_photo:
                    self.log('success', f"Equipment photo found", url=equipment_photo)
                else:
                    self.log('warning', f"Image found but no URL", image_keys=list(first_image.keys()))
        
        if not equipment_photo:
            self.log('warning', "No equipment photo found")
            # Log the structure for debugging
            if photo_data:
                self.log('info', f"Enrichment response structure", 
                        success=photo_data.get('success'),
                        data_keys=list(photo_data.get('data', {}).keys()) if photo_data.get('data') else None)
            
        # Search for manuals
        self.log('info', "📚 Searching for manuals...")
        manuals_data = self.make_api_call('/api/manuals/search', {
            'make': make,
            'model': model
        })
        
        manual_links = []
        verified_status = 'Not Verified'
        
        if manuals_data and manuals_data.get('results'):
            manual_count = len(manuals_data['results'])
            self.log('success', f"Found {manual_count} manuals")
            
            for i, manual in enumerate(manuals_data['results'][:5]):  # Limit to 5 manuals
                if manual.get('download_url'):
                    manual_links.append(manual['download_url'])
                    self.log('info', f"Manual {i+1}: {manual.get('title', 'Unknown')}")
                elif manual.get('url'):
                    manual_links.append(manual['url'])
                    self.log('info', f"Manual {i+1}: {manual.get('title', 'Unknown')}")
            
            # Check if manuals contain model verification
            if any(manual.get('verified') for manual in manuals_data['results']):
                verified_status = 'Verified'
                self.log('success', "Manual verification successful")
        else:
            self.log('warning', "No manuals found")
        
        # Pad manual links to 5 entries
        while len(manual_links) < 5:
            manual_links.append('')
            
        return equipment_photo, manual_links, verified_status
        
    def resolve_part_number(self, description, make, model):
        """Resolve part description to OEM part number"""
        self.log('info', f"🔧 Resolving part", 
                description=description, make=make, model=model)
        
        part_data = self.make_api_call('/api/parts/resolve', {
            'description': description,
            'make': make,
            'model': model,
            'use_database': False,
            'use_manual_search': True,
            'use_web_search': True,
            'save_results': False
        })
        
        oem_part_number = ''
        part_verified = 'Not Verified'
        part_photo = ''
        alternate_parts = []
        alternate_descriptions = []
        confidence_score = 0.0
        selected_method = 'None'
        
        if part_data and part_data.get('results'):
            results = part_data['results']
            self.log('info', f"Part resolution methods available: {list(results.keys())}")
            
            # Log if similar_parts exist in response
            if part_data.get('similar_parts'):
                self.log('info', f"Response includes {len(part_data['similar_parts'])} similar parts")
            
            # NEW LOGIC: Select highest confidence result instead of first-found
            best_result = None
            best_confidence = 0.0
            best_method = None
            
            # Evaluate all available search methods
            for search_method in ['manual_search', 'ai_web_search']:
                if search_method in results and results[search_method]:
                    method_result = results[search_method]
                    if method_result.get('oem_part_number'):
                        # Calculate composite confidence score
                        method_confidence = method_result.get('confidence', 0.0)
                        validation = method_result.get('serpapi_validation', {})
                        validation_confidence = validation.get('confidence_score', 0.0) if validation.get('is_valid') else 0.0
                        
                        # Composite score: method confidence + validation boost
                        composite_confidence = method_confidence + (validation_confidence * 0.1)  # Small boost for validated parts
                        
                        self.log('info', f"{search_method}: part={method_result['oem_part_number']}, "
                                       f"method_conf={method_confidence}, validation_conf={validation_confidence}, "
                                       f"composite={composite_confidence:.3f}")
                        
                        # Select if this is the best so far
                        if composite_confidence > best_confidence:
                            best_result = method_result
                            best_confidence = composite_confidence
                            best_method = search_method
            
            # Use the highest confidence result
            if best_result:
                oem_part_number = best_result['oem_part_number']
                confidence_score = best_result.get('confidence', 0.0)
                selected_method = best_method
                
                self.log('success', f"Selected {best_method} result with highest confidence", 
                        part_number=oem_part_number, confidence=confidence_score)
                
                # Check verification status from SerpAPI validation
                validation = best_result.get('serpapi_validation', {})
                if validation.get('is_valid'):
                    part_verified = 'Verified'
                    validation_confidence = validation.get('confidence_score', 0)
                    self.log('success', f"Part verified by SerpAPI + GPT-4.1-Nano", 
                            validation_confidence=validation_confidence)
                else:
                    part_verified = 'Not Verified'
                    self.log('warning', f"Part not verified by SerpAPI validation: {validation.get('assessment', 'No assessment')}")
                
                # Get alternate part numbers from the selected result
                if best_result.get('alternate_part_numbers'):
                    alt_parts = best_result['alternate_part_numbers'][:3]
                    for alt_part in alt_parts:
                        if alt_part != oem_part_number:  # Don't duplicate the main part
                            alternate_parts.append(alt_part)
                            main_desc = best_result.get('description', '')
                            alternate_descriptions.append(f"Alternate: {main_desc}")
                    self.log('info', f"Found {len(alternate_parts)} alternate parts from {best_method}")
            
            # NEW DECISION TREE LOGIC for similar parts
            should_search_similar = False
            
            if oem_part_number:  # OEM part found
                if part_verified == 'Verified':
                    if not alternate_parts:  # OEM Verified + No Alternates → Search similar
                        should_search_similar = True
                        self.log('info', "OEM verified but no alternates found - will search similar parts")
                    else:  # OEM Verified + Has Alternates → Stop
                        self.log('info', "OEM verified with alternates found - no similar search needed")
                else:  # part_verified == 'Not Verified'
                    if not alternate_parts:  # OEM Not Verified + No Alternates → Search similar
                        should_search_similar = True
                        self.log('info', "OEM not verified and no alternates found - will search similar parts")
                    else:  # OEM Not Verified + Has Alternates → Stop
                        self.log('info', "OEM not verified but alternates found - no similar search needed")
            else:  # No OEM Found → Search similar
                should_search_similar = True
                self.log('info', "No OEM part found - will search similar parts")
            
            # Search similar parts if decision tree indicates we should
            if should_search_similar:
                self.log('info', "Triggering similar parts search based on decision tree")
                
                # Make API call to find similar parts
                similar_parts_data = self.make_api_call('/api/parts/find-similar', {
                    'description': description,
                    'make': make,
                    'model': model,
                    'failed_part_number': oem_part_number if oem_part_number else None
                })
                
                # Check if we got a valid response (even if no parts found)
                if similar_parts_data and 'similar_parts' in similar_parts_data:
                    similar_parts = similar_parts_data['similar_parts']
                    self.log('info', f"Similar parts API returned {len(similar_parts)} parts")
                    
                    # Extract OEM part numbers from similar parts API response
                    for part in similar_parts[:3]:  # Take up to 3 similar parts
                        # Similar parts API already returns clean part numbers
                        part_num = part.get('part_number')
                        desc = part.get('description', '')
                        
                        if part_num and part_num not in alternate_parts:
                            alternate_parts.append(part_num)
                            alternate_descriptions.append(desc)
                            self.log('info', f"Added similar part: {part_num} - {desc[:50]}...")
                    
                    # Limit to 3 alternate parts
                    alternate_parts = alternate_parts[:3]
                    alternate_descriptions = alternate_descriptions[:3]
                else:
                    self.log('warning', "Similar parts API returned no results")
                
                time.sleep(self.delay)  # Rate limiting for similar parts API call
            
            # Process existing similar_parts in response (when all methods failed)
            if part_data.get('similar_parts'):
                similar_parts = part_data['similar_parts']
                self.log('info', f"Found {len(similar_parts)} similar parts in response")
                
                # Extract OEM part numbers from similar parts
                import re
                for part in similar_parts[:3]:  # Take up to 3 similar parts
                    desc = part.get('description', '')
                    part_num = None
                    
                    # First try to extract the actual part number from the description
                    part_num_match = re.search(r'\b(\d{2}-\d{5,6}(?:-\d+)?)\b', desc)
                    if part_num_match:
                        part_num = part_num_match.group(1)
                        if part_num and part_num not in alternate_parts:
                            alternate_parts.append(part_num)
                            alternate_descriptions.append(desc)  # Store the full description
                            self.log('info', f"Extracted alternate part number: {part_num}")
                    elif part.get('part_number') and part['part_number'] not in ['HOBART', 'BOWL', 'MOTOR', 'LIFT', 'POWER', 'MACH', 'ACTUATOR', 'SERVICE']:
                        # Use part_number if it's not a generic term
                        part_num = part['part_number']
                        if part_num not in alternate_parts:
                            alternate_parts.append(part_num)
                            alternate_descriptions.append(desc)  # Store the full description
                
                # Limit to 3 alternate parts
                alternate_parts = alternate_parts[:3]
                alternate_descriptions = alternate_descriptions[:3]
            
            # Get part photo via enrichment if we have a part number
            if oem_part_number:
                self.log('info', "📸 Fetching part photo...")
                photo_data = self.make_api_call('/api/enrichment', {
                    'make': make,
                    'model': model,
                    'part_number': oem_part_number
                })
                if photo_data and photo_data.get('success'):
                    # Look for images in the enrichment data
                    images = photo_data.get('data', {}).get('images', [])
                    self.log('info', f"Part enrichment returned {len(images)} images")
                    if images and len(images) > 0:
                        # Take the first image URL
                        first_image = images[0]
                        part_photo = first_image.get('url') or first_image.get('image_url') or first_image.get('link')
                        if part_photo:
                            self.log('success', f"Part photo found", url=part_photo)
                        else:
                            self.log('warning', f"Part image found but no URL", image_keys=list(first_image.keys()))
                
                if not part_photo:
                    self.log('warning', "No part photo found")
        else:
            self.log('warning', "No part resolution results")
        
        return oem_part_number, part_verified, part_photo, alternate_parts, alternate_descriptions, confidence_score, selected_method
        
    def search_suppliers(self, part_number, make, model):
        """Search for suppliers for the part number"""
        if not part_number:
            self.log('warning', "No part number provided for supplier search")
            return [''] * 5
            
        self.log('info', f"🏪 Searching suppliers", part_number=part_number)
        
        supplier_data = self.make_api_call('/api/suppliers/search', {
            'part_number': part_number,
            'make': make,
            'model': model,
            'oem_only': False
        })
        
        supplier_links = []
        
        if supplier_data and supplier_data.get('suppliers'):
            # Sort by AI ranking if available
            suppliers = supplier_data['suppliers']
            if isinstance(suppliers, list):
                supplier_count = len(suppliers)
                self.log('success', f"Found {supplier_count} suppliers")
                
                # Take top 5 suppliers
                for i, supplier in enumerate(suppliers[:5]):
                    supplier_name = supplier.get('name', f'Supplier {i+1}')
                    if supplier.get('url'):
                        supplier_links.append(supplier['url'])
                        self.log('info', f"Supplier {i+1}: {supplier_name}", 
                                url=supplier['url'])
                    elif supplier.get('website'):
                        supplier_links.append(supplier['website'])
                        self.log('info', f"Supplier {i+1}: {supplier_name}", 
                                url=supplier['website'])
                    else:
                        supplier_links.append('')
                        self.log('warning', f"Supplier {i+1}: {supplier_name} - no URL")
            else:
                self.log('warning', "Suppliers data is not in expected format")
        else:
            self.log('warning', "No suppliers found")
        
        # Pad to 5 entries
        while len(supplier_links) < 5:
            supplier_links.append('')
            
        return supplier_links
        
    def process_row(self, row, row_number):
        """Process a single CSV row with enhanced logging"""
        make = row['Make'].strip()
        model = row['Model'].strip()
        part_name = row['Part Name'].strip()
        
        # Update progress bar description
        if self.progress_bar:
            self.progress_bar.set_description(f"Row {row_number}: {make} {model}")
        
        self.log('info', f"🚀 STARTING ROW {row_number}", 
                make=make, model=model, part_name=part_name)
        
        row_start_time = time.time()
        
        try:
            # Step 1: Get equipment photo and manuals
            self.log('info', f"📋 STEP 1/4: Equipment Info")
            equipment_photo, manual_links, manual_status = self.get_equipment_photo_and_manuals(make, model)
            time.sleep(self.delay)
            
            # Step 2: Resolve part number
            self.log('info', f"📋 STEP 2/4: Part Resolution")
            oem_part_number, part_verified, part_photo, alternate_parts, alternate_descriptions, confidence_score, selected_method = self.resolve_part_number(part_name, make, model)
            time.sleep(self.delay)
            
            # Step 3: Search suppliers (only if part is verified or we have a part number)
            self.log('info', f"📋 STEP 3/4: Supplier Search")
            supplier_links = [''] * 5
            if oem_part_number and part_verified == 'Verified':
                supplier_links = self.search_suppliers(oem_part_number, make, model)
                time.sleep(self.delay)
            else:
                self.log('warning', "Skipping supplier search - part not verified")
            
            # Format alternate parts as comma-separated strings
            alternate_parts_str = ', '.join(filter(None, alternate_parts))
            alternate_descriptions_str = ' | '.join(filter(None, alternate_descriptions))
            
            row_elapsed = time.time() - row_start_time
            self.log('success', f"✅ COMPLETED ROW {row_number}", 
                    elapsed_sec=f"{row_elapsed:.1f}")
            
            return {
                'Make': make,
                'Model': model,
                'Part Name': part_name,
                'Equipment Photo': equipment_photo or '',
                'Manual 1': manual_links[0],
                'Manual 2': manual_links[1],
                'Manual 3': manual_links[2],
                'Manual 4': manual_links[3],
                'Manual 5': manual_links[4],
                'OEM Part Verified': part_verified,
                'OEM Part Number': oem_part_number,
                'Confidence Score': f"{confidence_score:.2f}",
                'Selected Method': selected_method,
                'Part Photo': part_photo,
                'Alternate Part Numbers': alternate_parts_str,
                'Alternate Part Descriptions': alternate_descriptions_str,
                'Supplier 1': supplier_links[0],
                'Supplier 2': supplier_links[1],
                'Supplier 3': supplier_links[2],
                'Supplier 4': supplier_links[3],
                'Supplier 5': supplier_links[4]
            }
            
        except Exception as e:
            row_elapsed = time.time() - row_start_time
            self.log('error', f"❌ FAILED ROW {row_number}", 
                    error=str(e), elapsed_sec=f"{row_elapsed:.1f}")
            
            # Return empty row with basic info
            return {
                'Make': make,
                'Model': model,
                'Part Name': part_name,
                'Equipment Photo': '',
                'Manual 1': '', 'Manual 2': '', 'Manual 3': '', 'Manual 4': '', 'Manual 5': '',
                'OEM Part Verified': 'Error',
                'OEM Part Number': '',
                'Part Photo': '',
                'Alternate Part Numbers': '',
                'Alternate Part Descriptions': '',
                'Supplier 1': '', 'Supplier 2': '', 'Supplier 3': '', 'Supplier 4': '', 'Supplier 5': ''
            }
        
    def process_csv(self, input_file, output_file, start_row=0, max_rows=None):
        """Process the entire CSV file with progress bar and immediate writing"""
        
        # First, count total rows for progress bar
        with open(input_file, 'r', newline='', encoding='utf-8') as infile:
            reader = csv.DictReader(infile)
            all_rows = list(reader)
            total_in_file = len(all_rows)
        
        # Calculate actual processing range
        effective_start = max(0, start_row)
        effective_end = min(total_in_file, effective_start + max_rows) if max_rows else total_in_file
        total_to_process = max(0, effective_end - effective_start)
        
        self.log('info', f"🚀 STARTING CSV PROCESSING", 
                input_file=input_file, 
                output_file=output_file,
                total_rows_in_file=total_in_file,
                start_row=effective_start,
                rows_to_process=total_to_process)
        
        if total_to_process == 0:
            self.log('warning', "No rows to process!")
            return
        
        # Define output columns
        output_columns = [
            'Make', 'Model', 'Part Name', 'Equipment Photo',
            'Manual 1', 'Manual 2', 'Manual 3', 'Manual 4', 'Manual 5',
            'OEM Part Verified', 'OEM Part Number', 'Confidence Score', 'Selected Method', 'Part Photo', 
            'Alternate Part Numbers', 'Alternate Part Descriptions',
            'Supplier 1', 'Supplier 2', 'Supplier 3', 'Supplier 4', 'Supplier 5'
        ]
        
        # Initialize progress bar
        self.progress_bar = tqdm(
            total=total_to_process,
            desc="Processing...",
            unit="rows",
            bar_format="{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}, {rate_fmt}]",
            ncols=120
        )
        
        processed_count = 0
        success_count = 0
        error_count = 0
        start_time = time.time()
        
        try:
            # Open output file for writing
            with open(output_file, 'w', newline='', encoding='utf-8') as outfile:
                writer = csv.DictWriter(outfile, fieldnames=output_columns)
                writer.writeheader()
                outfile.flush()  # Ensure header is written immediately
                
                # Process rows in the specified range
                rows_to_process = all_rows[effective_start:effective_end]
                
                for i, row in enumerate(rows_to_process):
                    actual_row_num = effective_start + i + 1  # 1-based row number
                    
                    try:
                        # Process the row
                        processed_row = self.process_row(row, actual_row_num)
                        
                        # Write immediately and flush
                        writer.writerow(processed_row)
                        outfile.flush()
                        
                        # Track success
                        if processed_row.get('OEM Part Verified') != 'Error':
                            success_count += 1
                        else:
                            error_count += 1
                            
                        processed_count += 1
                        
                        # Update progress bar
                        self.progress_bar.update(1)
                        
                        # Log progress every 10 rows
                        if processed_count % 10 == 0:
                            elapsed = time.time() - start_time
                            rate = processed_count / elapsed
                            remaining_time = (total_to_process - processed_count) / rate if rate > 0 else 0
                            
                            self.log('info', f"📊 PROGRESS UPDATE", 
                                    completed=processed_count,
                                    total=total_to_process,
                                    success_count=success_count,
                                    error_count=error_count,
                                    rate_per_min=f"{rate*60:.1f}",
                                    eta_minutes=f"{remaining_time/60:.1f}")
                        
                    except Exception as e:
                        error_count += 1
                        processed_count += 1
                        
                        self.log('error', f"CRITICAL ERROR processing row {actual_row_num}", 
                                error=str(e))
                        
                        # Write error row to maintain alignment
                        error_row = {col: '' for col in output_columns}
                        error_row.update({
                            'Make': row.get('Make', ''),
                            'Model': row.get('Model', ''),
                            'Part Name': row.get('Part Name', ''),
                            'OEM Part Verified': 'Critical Error'
                        })
                        writer.writerow(error_row)
                        outfile.flush()
                        
                        # Update progress bar
                        self.progress_bar.update(1)
        
        finally:
            # Close progress bar
            if self.progress_bar:
                self.progress_bar.close()
                self.progress_bar = None
        
        # Final summary
        elapsed_total = time.time() - start_time
        avg_time_per_row = elapsed_total / processed_count if processed_count > 0 else 0
        
        self.log('success', f"🎉 PROCESSING COMPLETE!", 
                total_processed=processed_count,
                success_count=success_count,
                error_count=error_count,
                success_rate=f"{(success_count/processed_count*100):.1f}%" if processed_count > 0 else "0%",
                total_time_minutes=f"{elapsed_total/60:.1f}",
                avg_seconds_per_row=f"{avg_time_per_row:.1f}",
                output_file=output_file)


class MultiThreadedEquipmentProcessor(EquipmentProcessor):
    """Multi-threaded version of EquipmentProcessor for faster parallel processing"""
    
    def __init__(self, base_url="http://localhost:7777", delay=1.0, log_file=None, workers=4):
        super().__init__(base_url, delay, log_file)
        self.workers = min(workers, 3)  # Limit to 3 workers to prevent overwhelming the API
        self.write_lock = Lock()
        self.progress_lock = Lock()
        self.stats_lock = Lock()
        self.results_queue = queue.PriorityQueue()
        self.api_semaphore = threading.Semaphore(2)  # Limit concurrent API calls
        
        # Thread-safe counters
        self.processed_count = 0
        self.success_count = 0
        self.error_count = 0
        
    def process_row_threaded(self, row, row_number):
        """Process a single row in a thread-safe manner"""
        thread_id = threading.current_thread().name
        
        self.log('info', f"🧵 [{thread_id}] Processing row {row_number}")
        
        # Process the row
        result = self.process_row(row, row_number)
        
        # Update thread-safe counters
        with self.stats_lock:
            self.processed_count += 1
            if result.get('OEM Part Verified') != 'Error' and result.get('OEM Part Verified') != 'Critical Error':
                self.success_count += 1
            else:
                self.error_count += 1
        
        # Update progress bar
        with self.progress_lock:
            if self.progress_bar:
                self.progress_bar.update(1)
                self.progress_bar.set_description(f"Processed: {self.processed_count}/{self.total_rows}")
        
        return row_number, result
    
    def write_row_immediately(self, row_number, processed_row):
        """Write a single row to the CSV file immediately"""
        with self.write_lock:
            # Store the result
            if not hasattr(self, 'pending_results'):
                self.pending_results = {}
            self.pending_results[row_number] = processed_row
            
            # Write any rows that are ready in order
            while self.next_row_to_write in self.pending_results:
                self.csv_writer.writerow(self.pending_results[self.next_row_to_write])
                self.written_rows.add(self.next_row_to_write)
                del self.pending_results[self.next_row_to_write]
                self.next_row_to_write += 1
                
            # Force flush to disk
            self.output_file_handle.flush()
            
    def worker_process_rows(self, rows_batch):
        """Worker function to process a batch of rows"""
        results = []
        for i, (row_number, row) in enumerate(rows_batch):
            try:
                # Add delay between rows to prevent overwhelming the API
                if i > 0:
                    time.sleep(self.delay)
                    
                row_num, processed_row = self.process_row_threaded(row, row_number)
                results.append((row_num, processed_row))
                
                # Write the row immediately
                self.write_row_immediately(row_num, processed_row)
                
            except Exception as e:
                self.log('error', f"Worker error on row {row_number}: {str(e)}")
                # Create error row
                error_row = {
                    'Make': row.get('Make', ''),
                    'Model': row.get('Model', ''),
                    'Part Name': row.get('Part Name', ''),
                    'Equipment Photo': '',
                    'Manual 1': '', 'Manual 2': '', 'Manual 3': '', 'Manual 4': '', 'Manual 5': '',
                    'OEM Part Verified': 'Critical Error',
                    'OEM Part Number': '',
                    'Confidence Score': '0.00',
                    'Selected Method': 'Error',
                    'Part Photo': '',
                    'Alternate Part Numbers': '',
                    'Alternate Part Descriptions': '',
                    'Supplier 1': '', 'Supplier 2': '', 'Supplier 3': '', 'Supplier 4': '', 'Supplier 5': ''
                }
                results.append((row_number, error_row))
                
                # Write error row immediately
                self.write_row_immediately(row_number, error_row)
                
        return results
        
    def process_csv(self, input_file, output_file, start_row=0, max_rows=None):
        """Process CSV file using multiple threads"""
        
        # First, count total rows for progress bar
        with open(input_file, 'r', newline='', encoding='utf-8') as infile:
            reader = csv.DictReader(infile)
            all_rows = list(reader)
            total_in_file = len(all_rows)
        
        # Calculate actual processing range
        effective_start = max(0, start_row)
        effective_end = min(total_in_file, effective_start + max_rows) if max_rows else total_in_file
        total_to_process = max(0, effective_end - effective_start)
        self.total_rows = total_to_process
        
        self.log('info', f"🚀 STARTING MULTI-THREADED CSV PROCESSING", 
                input_file=input_file, 
                output_file=output_file,
                total_rows_in_file=total_in_file,
                start_row=effective_start,
                rows_to_process=total_to_process,
                workers=self.workers)
        
        if total_to_process == 0:
            self.log('warning', "No rows to process!")
            return
        
        # Define output columns
        output_columns = [
            'Make', 'Model', 'Part Name', 'Equipment Photo',
            'Manual 1', 'Manual 2', 'Manual 3', 'Manual 4', 'Manual 5',
            'OEM Part Verified', 'OEM Part Number', 'Confidence Score', 'Selected Method', 'Part Photo', 
            'Alternate Part Numbers', 'Alternate Part Descriptions',
            'Supplier 1', 'Supplier 2', 'Supplier 3', 'Supplier 4', 'Supplier 5'
        ]
        
        # Initialize progress bar
        self.progress_bar = tqdm(
            total=total_to_process,
            desc="Processing...",
            unit="rows",
            bar_format="{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}, {rate_fmt}]",
            ncols=120
        )
        
        # Reset counters
        self.processed_count = 0
        self.success_count = 0
        self.error_count = 0
        start_time = time.time()
        
        # Dictionary to track which rows have been written
        self.written_rows = set()
        self.next_row_to_write = effective_start + 1  # Track next row number to write
        self.pending_results = {}  # Store results waiting to be written
        
        # Open output file and write header
        self.output_file_handle = open(output_file, 'w', newline='', encoding='utf-8')
        self.csv_writer = csv.DictWriter(self.output_file_handle, fieldnames=output_columns)
        self.csv_writer.writeheader()
        self.output_file_handle.flush()
        
        try:
            # Prepare rows to process with their row numbers
            rows_to_process = []
            for i, row in enumerate(all_rows[effective_start:effective_end]):
                actual_row_num = effective_start + i + 1  # 1-based row number
                rows_to_process.append((actual_row_num, row))
            
            # Create batches for workers
            batch_size = max(3, len(rows_to_process) // (self.workers * 2))  # Smaller batches for better distribution
            batches = [rows_to_process[i:i + batch_size] for i in range(0, len(rows_to_process), batch_size)]
            
            self.log('info', f"Created {len(batches)} batches for {self.workers} workers")
            
            # Process batches using thread pool
            with ThreadPoolExecutor(max_workers=self.workers) as executor:
                # Submit all batches
                future_to_batch = {executor.submit(self.worker_process_rows, batch): batch 
                                 for batch in batches}
                
                # Process completed batches
                for future in as_completed(future_to_batch):
                    try:
                        batch_results = future.result()
                        # Results are already written by the worker
                            
                        # Log progress every 10 completed rows
                        if self.processed_count % 10 == 0:
                            elapsed = time.time() - start_time
                            rate = self.processed_count / elapsed if elapsed > 0 else 0
                            remaining_time = (total_to_process - self.processed_count) / rate if rate > 0 else 0
                            
                            self.log('info', f"📊 PROGRESS UPDATE", 
                                    completed=self.processed_count,
                                    total=total_to_process,
                                    success_count=self.success_count,
                                    error_count=self.error_count,
                                    rate_per_min=f"{rate*60:.1f}",
                                    eta_minutes=f"{remaining_time/60:.1f}",
                                    rows_written=len(self.written_rows))
                                    
                    except Exception as e:
                        self.log('error', f"Batch processing error: {str(e)}")
            
            # Write any remaining results that might be in pending_results
            if hasattr(self, 'pending_results') and self.pending_results:
                self.log('info', f"Writing {len(self.pending_results)} remaining results...")
                for row_num in sorted(self.pending_results.keys()):
                    self.csv_writer.writerow(self.pending_results[row_num])
                    self.written_rows.add(row_num)
                self.output_file_handle.flush()
        
        finally:
            # Close output file
            if hasattr(self, 'output_file_handle'):
                self.output_file_handle.close()
                
            # Close progress bar
            if self.progress_bar:
                self.progress_bar.close()
                self.progress_bar = None
        
        # Final summary
        elapsed_total = time.time() - start_time
        avg_time_per_row = elapsed_total / self.processed_count if self.processed_count > 0 else 0
        
        self.log('success', f"🎉 MULTI-THREADED PROCESSING COMPLETE!", 
                total_processed=self.processed_count,
                success_count=self.success_count,
                error_count=self.error_count,
                success_rate=f"{(self.success_count/self.processed_count*100):.1f}%" if self.processed_count > 0 else "0%",
                total_time_minutes=f"{elapsed_total/60:.1f}",
                avg_seconds_per_row=f"{avg_time_per_row:.1f}",
                workers_used=self.workers,
                rows_written=len(self.written_rows),
                output_file=output_file)


def main():
    parser = argparse.ArgumentParser(description='Process equipment CSV through API endpoints')
    parser.add_argument('input_file', help='Input CSV file path')
    parser.add_argument('-o', '--output', help='Output CSV file path', 
                       default='processed_equipment_list.csv')
    parser.add_argument('--base-url', default='http://localhost:7777',
                       help='Base URL for API endpoints')
    parser.add_argument('--delay', type=float, default=1.0,
                       help='Delay between API calls in seconds')
    parser.add_argument('--start-row', type=int, default=0,
                       help='Row number to start processing from (0-based)')
    parser.add_argument('--max-rows', type=int,
                       help='Maximum number of rows to process')
    parser.add_argument('--log-file', help='Log file path (logs to stdout if not specified)')
    parser.add_argument('--workers', type=int, default=1,
                       help='Number of worker threads (1 for single-threaded, >1 for multi-threaded)')
    
    args = parser.parse_args()
    
    # Validate input file exists
    if not Path(args.input_file).exists():
        print(f"ERROR: Input file '{args.input_file}' does not exist")
        sys.exit(1)
    
    # Generate default log file name if not specified
    log_file = args.log_file
    if not log_file:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_file = f"equipment_processing_{timestamp}.log"
    
    # Create processor and run
    if args.workers > 1:
        processor = MultiThreadedEquipmentProcessor(
            base_url=args.base_url, 
            delay=args.delay,
            log_file=log_file,
            workers=args.workers
        )
        processor_type = "Multi-Threaded"
    else:
        processor = EquipmentProcessor(
            base_url=args.base_url, 
            delay=args.delay,
            log_file=log_file
        )
        processor_type = "Single-Threaded"
    
    # Print startup info
    print(f"\n🚀 Equipment CSV Processor Starting ({processor_type})...")
    print(f"📁 Input: {args.input_file}")
    print(f"📁 Output: {args.output}")
    print(f"📁 Log: {log_file}")
    print(f"🌐 API Base URL: {args.base_url}")
    print(f"⏱️  Delay: {args.delay}s between API calls")
    if args.workers > 1:
        print(f"🧵 Worker Threads: {args.workers}")
    if args.start_row > 0:
        print(f"📍 Starting from row: {args.start_row + 1}")
    if args.max_rows:
        print(f"📊 Max rows to process: {args.max_rows}")
    print("="*80)
    
    try:
        processor.process_csv(
            input_file=args.input_file,
            output_file=args.output,
            start_row=args.start_row,
            max_rows=args.max_rows
        )
        
        print(f"\n✅ Processing completed successfully!")
        print(f"📁 Results saved to: {args.output}")
        print(f"📁 Detailed logs in: {log_file}")
        
    except KeyboardInterrupt:
        processor.log('warning', "Processing interrupted by user")
        print("\n⚠️  Processing was interrupted by user")
        print(f"📁 Partial results may be in: {args.output}")
        print(f"📁 Logs available in: {log_file}")
        sys.exit(1)
    except Exception as e:
        processor.log('error', f"FATAL ERROR: {e}")
        print(f"\n❌ Fatal error occurred: {e}")
        print(f"📁 Check logs for details: {log_file}")
        sys.exit(1)

if __name__ == '__main__':
    main()