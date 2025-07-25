#!/usr/bin/env python3
"""
Test script for the multiple manual processing and reconciliation capability.
This script tests the new endpoint for processing multiple manuals simultaneously.
"""

import os
import sys
import json
import requests
import logging
from datetime import datetime

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Add the current directory to the path so we can import our modules
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

# Test configuration
BASE_URL = "http://localhost:5000/api"
TEST_MANUALS = [
    {"make": "Toyota", "model": "Camry", "year": "2020", "title": "Owner's Manual", 
     "url": "https://www.toyota.com/t3Portal/document/om-s/OM06146U/pdf/OM06146U.pdf"},
    {"make": "Toyota", "model": "Camry", "year": "2020", "title": "Maintenance Manual", 
     "url": "https://www.toyota.com/t3Portal/document/smg-s/OM06146U/pdf/SMG13MY20.pdf"},
    {"make": "Toyota", "model": "Camry", "year": "2020", "title": "Navigation Manual", 
     "url": "https://www.toyota.com/t3Portal/document/omnav-s/OM33C56U/pdf/OM33C56U.pdf"}
]

def register_test_manuals():
    """Register test manuals in the system"""
    logger.info("Registering test manuals...")
    
    manual_ids = []
    
    for manual_data in TEST_MANUALS:
        # Create the manual
        response = requests.post(
            f"{BASE_URL}/manuals",
            json=manual_data
        )
        
        if response.status_code == 201:
            manual_id = response.json().get('id')
            logger.info(f"Registered manual ID {manual_id}: {manual_data['title']}")
            manual_ids.append(manual_id)
        else:
            logger.error(f"Failed to register manual: {manual_data['title']}")
            logger.error(f"Response: {response.text}")
    
    return manual_ids

def test_single_manual_processing(manual_id):
    """Test processing a single manual to compare with multi-manual processing"""
    logger.info(f"Testing single manual processing for manual ID {manual_id}...")
    
    response = requests.post(
        f"{BASE_URL}/manuals/{manual_id}/process"
    )
    
    if response.status_code == 200:
        result = response.json()
        logger.info(f"Successfully processed manual ID {manual_id}")
        logger.info(f"Error codes found: {result.get('error_codes_count', 0)}")
        logger.info(f"Part numbers found: {result.get('part_numbers_count', 0)}")
        
        # Save a small sample of the results for comparison
        error_codes_sample = result.get('error_codes', [])[:5]
        part_numbers_sample = result.get('part_numbers', [])[:5]
        
        logger.info(f"Sample error codes: {json.dumps(error_codes_sample)}")
        logger.info(f"Sample part numbers: {json.dumps(part_numbers_sample)}")
        
        return result
    else:
        logger.error(f"Failed to process manual ID {manual_id}")
        logger.error(f"Response: {response.text}")
        return None

def test_multi_manual_processing(manual_ids):
    """Test processing multiple manuals at once"""
    logger.info(f"Testing multi-manual processing for manual IDs {manual_ids}...")
    
    response = requests.post(
        f"{BASE_URL}/manuals/multi-process",
        json={"manual_ids": manual_ids}
    )
    
    if response.status_code == 200:
        result = response.json()
        logger.info(f"Successfully processed {len(manual_ids)} manuals together")
        
        reconciled_results = result.get('reconciled_results', {})
        stats = reconciled_results.get('statistics', {})
        
        logger.info(f"Raw error codes total: {stats.get('raw_error_codes', 0)}")
        logger.info(f"Unique error codes after reconciliation: {stats.get('unique_error_codes', 0)}")
        logger.info(f"Raw part numbers total: {stats.get('raw_part_numbers', 0)}")
        logger.info(f"Unique part numbers after reconciliation: {stats.get('unique_part_numbers', 0)}")
        
        # Calculate deduplication rates
        if stats.get('raw_error_codes', 0) > 0:
            error_dedup_rate = (1 - stats.get('unique_error_codes', 0) / stats.get('raw_error_codes', 1)) * 100
            logger.info(f"Error code deduplication rate: {error_dedup_rate:.1f}%")
        
        if stats.get('raw_part_numbers', 0) > 0:
            part_dedup_rate = (1 - stats.get('unique_part_numbers', 0) / stats.get('raw_part_numbers', 1)) * 100
            logger.info(f"Part number deduplication rate: {part_dedup_rate:.1f}%")
        
        # Show high-confidence items (appearing in multiple manuals)
        error_codes = reconciled_results.get('error_codes', [])
        high_conf_errors = [e for e in error_codes if e.get('manual_count', 0) > 1]
        logger.info(f"Error codes appearing in multiple manuals: {len(high_conf_errors)}")
        if high_conf_errors:
            for error in high_conf_errors[:3]:  # Show up to 3 examples
                logger.info(f"High confidence error: {error.get('code')} - {error.get('confidence')}% confidence")
                logger.info(f"Description: {error.get('description', '')[:100]}...")
        
        part_numbers = reconciled_results.get('part_numbers', [])
        high_conf_parts = [p for p in part_numbers if p.get('manual_count', 0) > 1]
        logger.info(f"Part numbers appearing in multiple manuals: {len(high_conf_parts)}")
        if high_conf_parts:
            for part in high_conf_parts[:3]:  # Show up to 3 examples
                logger.info(f"High confidence part: {part.get('code')} - {part.get('confidence')}% confidence")
                logger.info(f"Description: {part.get('description', '')[:100]}...")
        
        return result
    else:
        logger.error(f"Failed to process multiple manuals")
        logger.error(f"Response: {response.text}")
        return None

def run_test():
    """Run the full test"""
    logger.info("Starting Multiple Manual Processing Test...")
    logger.info("=" * 50)
    
    # Register test manuals
    manual_ids = register_test_manuals()
    if not manual_ids or len(manual_ids) < 2:
        logger.error("Failed to register at least 2 test manuals. Aborting test.")
        return
    
    logger.info("=" * 50)
    
    # Test processing individual manuals
    single_results = []
    total_error_codes = 0
    total_part_numbers = 0
    
    for manual_id in manual_ids:
        result = test_single_manual_processing(manual_id)
        if result:
            single_results.append(result)
            total_error_codes += result.get('error_codes_count', 0)
            total_part_numbers += result.get('part_numbers_count', 0)
    
    logger.info("=" * 50)
    logger.info(f"Total error codes across all manuals processed individually: {total_error_codes}")
    logger.info(f"Total part numbers across all manuals processed individually: {total_part_numbers}")
    
    logger.info("=" * 50)
    
    # Test processing multiple manuals at once
    multi_result = test_multi_manual_processing(manual_ids)
    
    logger.info("=" * 50)
    
    # Compare results
    if single_results and multi_result:
        reconciled_results = multi_result.get('reconciled_results', {})
        stats = reconciled_results.get('statistics', {})
        
        logger.info("Comparison Summary:")
        logger.info(f"Individual processing total error codes: {total_error_codes}")
        logger.info(f"Multi-manual processing raw error codes: {stats.get('raw_error_codes', 0)}")
        logger.info(f"Multi-manual processing unique error codes: {stats.get('unique_error_codes', 0)}")
        
        logger.info(f"Individual processing total part numbers: {total_part_numbers}")
        logger.info(f"Multi-manual processing raw part numbers: {stats.get('raw_part_numbers', 0)}")
        logger.info(f"Multi-manual processing unique part numbers: {stats.get('unique_part_numbers', 0)}")
        
        if stats.get('raw_error_codes', 0) > 0:
            error_dedup_rate = (1 - stats.get('unique_error_codes', 0) / stats.get('raw_error_codes', 1)) * 100
            logger.info(f"Error code deduplication efficacy: {error_dedup_rate:.1f}%")
        
        if stats.get('raw_part_numbers', 0) > 0:
            part_dedup_rate = (1 - stats.get('unique_part_numbers', 0) / stats.get('raw_part_numbers', 1)) * 100
            logger.info(f"Part number deduplication efficacy: {part_dedup_rate:.1f}%")
    
    logger.info("=" * 50)
    logger.info("Test completed!")

if __name__ == "__main__":
    run_test()