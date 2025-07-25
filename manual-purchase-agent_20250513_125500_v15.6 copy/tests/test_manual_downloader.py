#!/usr/bin/env python3
"""
Test script for the enhanced manual downloader with Playwright support
"""

import os
import sys
import argparse
import logging
from services.manual_downloader import ManualDownloader

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def test_download(url, output_dir=None):
    """Test downloading a manual from the provided URL"""
    logger.info(f"Testing manual download from: {url}")
    
    try:
        # Create downloader
        downloader = ManualDownloader(output_dir, debug_screenshots=False)
        
        # Download the manual
        local_path = downloader.download_manual(url)
        
        logger.info(f"Successfully downloaded manual to: {local_path}")
        logger.info(f"File size: {os.path.getsize(local_path) / 1024:.2f} KB")
        
        return local_path
    
    except Exception as e:
        logger.error(f"Error downloading manual: {e}")
        return None

def main():
    """Main entry point for the script"""
    parser = argparse.ArgumentParser(description="Test the manual downloader with Playwright support")
    parser.add_argument("url", help="URL of the manual to download")
    parser.add_argument("--output-dir", "-o", help="Directory to save the downloaded manual to")
    
    args = parser.parse_args()
    
    # Test downloading
    local_path = test_download(args.url, args.output_dir)
    
    if local_path:
        print(f"\nSUCCESS: Manual downloaded to: {local_path}")
    else:
        print("\nFAILED: Manual download failed")

if __name__ == "__main__":
    main()