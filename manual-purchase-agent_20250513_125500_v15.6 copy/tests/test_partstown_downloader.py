#!/usr/bin/env python3
"""
Test script specifically for the problematic Partstown URL download.
"""

import os
import sys
import logging
from services.manual_downloader import ManualDownloader

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def test_partstown_download():
    """Test downloading a manual from Partstown"""
    
    # The problematic URL
    url = "https://www.partstown.com/modelManual/HEN-CFA500_iom.pdf?srsltid=AfmBOop4cdunXgbmAZRq4iDGtwwsp4Bzu0whetL5flLDTg8fpcBl9A6N"
    
    # Create manual downloader
    downloader = ManualDownloader(debug_screenshots=False)
    
    # Try each download method in sequence
    try:
        logger.info("=== Testing Playwright Download ===")
        try:
            path = downloader.download_with_playwright(url)
            logger.info(f"✓ SUCCESS: Downloaded with Playwright to {path}")
            logger.info(f"File size: {os.path.getsize(path) / 1024:.2f} KB")
            return path
        except Exception as e:
            logger.error(f"✗ FAILED: Playwright download failed: {e}")
            
        logger.info("\n=== Testing Curl Download ===")
        try:
            path = downloader.try_download_with_curl(url)
            if path:
                logger.info(f"✓ SUCCESS: Downloaded with curl to {path}")
                logger.info(f"File size: {os.path.getsize(path) / 1024:.2f} KB")
                return path
            else:
                logger.error("✗ FAILED: Curl download returned None")
        except Exception as e:
            logger.error(f"✗ FAILED: Curl download failed: {e}")
        
        logger.error("\n✗ ALL METHODS FAILED: Could not download the manual")
    except Exception as e:
        logger.error(f"Error during testing: {e}")

if __name__ == "__main__":
    test_partstown_download()