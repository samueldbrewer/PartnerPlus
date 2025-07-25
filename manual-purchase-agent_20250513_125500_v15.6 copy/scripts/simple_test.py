#!/usr/bin/env python3
"""
Simple test script for Manual Purchase Agent core functionality.
This doesn't require database setup.
"""

import os
import sys
import json
import requests
import logging
from urllib.parse import urlparse

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# SerpAPI key
SERPAPI_KEY = "7219228e748003a6e5394610456ef659f7c7884225b2df7fb0a890da61ad7f48"

class SimpleGoogleSearch:
    """A simplified wrapper for SerpAPI Google searches"""
    
    def __init__(self, query, api_key=None):
        """Initialize with query and API key"""
        self.query = query
        self.api_key = api_key or SERPAPI_KEY
        self.base_url = "https://serpapi.com/search"
    
    def execute(self):
        """Execute the search and return results"""
        params = {
            "api_key": self.api_key,
            "engine": "google",
            "q": self.query,
            "num": 10,
            "gl": "us",
            "hl": "en"
        }
        
        try:
            response = requests.get(self.base_url, params=params)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error executing search: {e}")
            return {}

def test_manual_search():
    """Test searching for manuals with SerpAPI"""
    logger.info("Testing manual search...")
    
    # Search for Toyota Camry repair manual
    query = "Toyota Camry 2020 repair manual pdf"
    search = SimpleGoogleSearch(query)
    results = search.execute()
    
    # Process results
    manuals = []
    if "organic_results" in results:
        for result in results["organic_results"]:
            url = result.get("link", "")
            if "pdf" in url.lower():
                manuals.append({
                    "title": result.get("title", "Unknown Title"),
                    "url": url,
                    "snippet": result.get("snippet", "")
                })
    
    logger.info(f"Found {len(manuals)} manuals")
    for i, manual in enumerate(manuals[:3]):  # Show first 3
        logger.info(f"Manual {i+1}: {manual['title']}")
        logger.info(f"URL: {manual['url']}")
        logger.info("-----")
    
    return manuals

def test_part_search():
    """Test searching for parts with SerpAPI"""
    logger.info("Testing part search...")
    
    # Search for a specific part
    part_number = "87139-06030"  # Toyota cabin air filter
    query = f"{part_number} buy"
    
    search = SimpleGoogleSearch(query)
    results = search.execute()
    
    # Process results
    suppliers = []
    if "organic_results" in results:
        for result in results["organic_results"]:
            url = result.get("link", "")
            domain = urlparse(url).netloc
            
            if is_ecommerce_domain(domain):
                suppliers.append({
                    "name": domain.replace("www.", ""),
                    "title": result.get("title", ""),
                    "url": url,
                    "snippet": result.get("snippet", "")
                })
    
    logger.info(f"Found {len(suppliers)} suppliers")
    for i, supplier in enumerate(suppliers[:3]):  # Show first 3
        logger.info(f"Supplier {i+1}: {supplier['name']}")
        logger.info(f"Title: {supplier['title']}")
        logger.info(f"URL: {supplier['url']}")
        logger.info("-----")
    
    return suppliers

def is_ecommerce_domain(domain):
    """Check if a domain is likely an e-commerce site"""
    ecommerce_indicators = [
        "amazon", "ebay", "walmart", "autozone", "rockauto", 
        "shop", "parts", "buy", "store", "suppl", "ecommerce"
    ]
    
    return any(indicator in domain.lower() for indicator in ecommerce_indicators)

def run_tests():
    """Run all tests"""
    logger.info("Starting simplified tests...")
    logger.info("=" * 50)
    
    test_manual_search()
    logger.info("=" * 50)
    
    test_part_search()
    logger.info("=" * 50)
    
    logger.info("All tests completed!")

if __name__ == "__main__":
    run_tests()