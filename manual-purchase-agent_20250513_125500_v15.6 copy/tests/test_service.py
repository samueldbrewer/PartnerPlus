#!/usr/bin/env python3
"""
Test script for Manual Purchase Agent service
This script tests the core functionality of the service.
"""

import os
import sys
import json
import time
import logging
import subprocess
from datetime import datetime

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Add the current directory to the path so we can import our modules
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

# Import our services
from services.manual_finder import search_manuals, download_manual
from services.manual_parser import extract_text_from_pdf, extract_information
from services.part_resolver import resolve_part_name
from services.supplier_finder import find_suppliers
from services.purchase_service import PurchaseAutomator

def test_manual_finder():
    """Test finding technical manuals"""
    logger.info("Testing manual finder service...")
    
    # Test searching for Toyota Camry manuals
    results = search_manuals(make="Toyota", model="Camry 2020", manual_type="repair")
    
    logger.info(f"Found {len(results)} manuals for Toyota Camry")
    for i, manual in enumerate(results[:3]):  # Show first 3 results
        logger.info(f"Manual {i+1}: {manual['title']}")
        logger.info(f"URL: {manual['url']}")
        logger.info("-----")
    
    return results

def test_manual_parser(manual_url=None):
    """Test parsing manual and extracting information"""
    logger.info("Testing manual parser service...")
    
    if not manual_url:
        # Use a sample URL if none provided
        manual_url = "https://www.toyota.com/t3Portal/document/om-s/OM06146U/pdf/OM06146U.pdf"
    
    # Download the manual
    try:
        local_path = download_manual(manual_url)
        logger.info(f"Downloaded manual to {local_path}")
        
        # Extract text
        text = extract_text_from_pdf(local_path)
        logger.info(f"Extracted {len(text)} characters of text")
        
        # Extract information (limit to first 50,000 chars to save time)
        extracted_info = extract_information(text[:50000])
        
        logger.info(f"Found {len(extracted_info['part_numbers'])} part numbers")
        for i, part in enumerate(extracted_info['part_numbers'][:3]):  # Show first 3
            logger.info(f"Part {i+1}: {part['code']}")
            if part.get('description'):
                logger.info(f"Description: {part['description'][:100]}...")
            logger.info("-----")
        
        logger.info(f"Found {len(extracted_info['error_codes'])} error codes")
        for i, code in enumerate(extracted_info['error_codes'][:3]):  # Show first 3
            logger.info(f"Error Code {i+1}: {code['code']}")
            if code.get('description'):
                logger.info(f"Description: {code['description'][:100]}...")
            logger.info("-----")
        
        return extracted_info
    
    except Exception as e:
        logger.error(f"Error in manual parser test: {e}")
        return None

def test_part_resolver():
    """Test resolving generic part names to OEM numbers"""
    logger.info("Testing part resolver service...")
    
    # Test resolving some common parts
    test_parts = [
        {"description": "Cabin air filter", "make": "Toyota", "model": "Camry", "year": "2020"},
        {"description": "Front brake pads", "make": "Honda", "model": "Accord", "year": "2019"},
        {"description": "Oil filter", "make": "Ford", "model": "F-150", "year": "2021"}
    ]
    
    results = []
    for part in test_parts:
        logger.info(f"Resolving: {part['description']} for {part['make']} {part['model']} {part['year']}")
        
        result = resolve_part_name(
            description=part['description'],
            make=part['make'],
            model=part['model'],
            year=part['year']
        )
        
        logger.info(f"OEM Part Number: {result.get('oem_part_number')}")
        logger.info(f"Manufacturer: {result.get('manufacturer')}")
        logger.info(f"Confidence: {result.get('confidence')}")
        if result.get('alternate_part_numbers'):
            logger.info(f"Alternate Part Numbers: {', '.join(result.get('alternate_part_numbers'))}")
        logger.info("-----")
        
        results.append(result)
    
    return results

def test_supplier_finder(part_number=None):
    """Test finding suppliers for a part"""
    logger.info("Testing supplier finder service...")
    
    if not part_number:
        # Use a sample part number if none provided
        part_number = "87139-06030"  # Toyota cabin air filter
    
    logger.info(f"Searching for suppliers of part: {part_number}")
    suppliers = find_suppliers(part_number=part_number, oem_only=True)
    
    logger.info(f"Found {len(suppliers)} suppliers")
    for i, supplier in enumerate(suppliers[:5]):  # Show first 5
        logger.info(f"Supplier {i+1}: {supplier.get('name')}")
        logger.info(f"URL: {supplier.get('url')}")
        if supplier.get('price'):
            logger.info(f"Price: {supplier.get('price')}")
        logger.info(f"Score: {supplier.get('score')}")
        logger.info("-----")
    
    return suppliers

def test_purchase_service(part_number=None, supplier_url=None):
    """Test purchase service (simulation only)"""
    logger.info("Testing purchase service (SIMULATION MODE)...")
    
    if not part_number:
        part_number = "87139-06030"  # Toyota cabin air filter
    
    if not supplier_url:
        supplier_url = "https://www.amazon.com/dp/B00Y4RNRUM"
    
    # Create a mock billing profile
    mock_billing_profile = {
        "id": 1,
        "billing_address": {
            "name": "Test User",
            "address1": "123 Test St",
            "city": "Test City",
            "state": "CA",
            "zip": "12345",
            "phone": "555-555-5555"
        },
        "shipping_address": {
            "name": "Test User",
            "address1": "123 Test St",
            "city": "Test City",
            "state": "CA",
            "zip": "12345",
            "phone": "555-555-5555"
        },
        "payment_info": {
            "card_number": "4111111111111111",  # Test card number
            "name": "Test User",
            "exp_month": "12",
            "exp_year": "2025",
            "cvv": "123"
        }
    }
    
    logger.info(f"Simulating purchase of part {part_number} from {supplier_url}")
    
    # Since we don't have a database, we'll just simulate the purchase flow
    # In a real test, we would use the actual PurchaseAutomator class
    # with PurchaseAutomator() as automator:
    #     result = automator.purchase_part(
    #         part_number=part_number,
    #         supplier_url=supplier_url,
    #         billing_profile_id=1,
    #         quantity=1
    #     )
    
    # For now, just return a simulated success result
    result = {
        "success": True,
        "order_id": f"TEST-{int(time.time())}",
        "price": 19.99,
        "message": "Purchase simulation completed successfully"
    }
    
    logger.info(f"Purchase Result: {'Success' if result.get('success') else 'Failed'}")
    logger.info(f"Order ID: {result.get('order_id')}")
    logger.info(f"Price: ${result.get('price')}")
    logger.info(f"Message: {result.get('message')}")
    
    return result

def run_all_tests():
    """Run all tests"""
    logger.info("Starting Manual Purchase Agent service tests...")
    logger.info("=" * 50)
    
    # Test manual finder
    manuals = test_manual_finder()
    logger.info("=" * 50)
    
    # Test manual parser with the first manual URL from the previous test
    if manuals and len(manuals) > 0:
        manual_url = manuals[0]['url']
        extracted_info = test_manual_parser(manual_url)
    else:
        extracted_info = test_manual_parser()
    logger.info("=" * 50)
    
    # Test part resolver
    part_results = test_part_resolver()
    logger.info("=" * 50)
    
    # Test supplier finder with a part number from the part resolver
    if part_results and len(part_results) > 0 and part_results[0].get('oem_part_number'):
        part_number = part_results[0].get('oem_part_number')
        suppliers = test_supplier_finder(part_number)
    else:
        suppliers = test_supplier_finder()
    logger.info("=" * 50)
    
    # Test purchase service with a supplier URL from the previous test
    if suppliers and len(suppliers) > 0:
        supplier_url = suppliers[0].get('url')
        if part_results and len(part_results) > 0 and part_results[0].get('oem_part_number'):
            part_number = part_results[0].get('oem_part_number')
            test_purchase_service(part_number, supplier_url)
        else:
            test_purchase_service(supplier_url=supplier_url)
    else:
        test_purchase_service()
    
    logger.info("=" * 50)
    logger.info("All tests completed!")

if __name__ == "__main__":
    run_all_tests()