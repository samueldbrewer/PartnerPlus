"""Generate preview images for PDF files"""

import os
import logging
import hashlib
import requests
import time
from urllib.parse import quote

logger = logging.getLogger(__name__)

class PDFPreviewGenerator:
    """Generate preview images for PDF files using web screenshot service"""
    
    def __init__(self, screenshots_dir="uploads/screenshots"):
        """Initialize the preview generator"""
        self.screenshots_dir = screenshots_dir
        # Create screenshots directory if it doesn't exist
        os.makedirs(self.screenshots_dir, exist_ok=True)
    
    def generate_preview_from_url(self, pdf_url):
        """Generate preview image from PDF URL using screenshot service"""
        try:
            # Generate a unique filename based on URL
            url_hash = hashlib.md5(pdf_url.encode()).hexdigest()[:16]
            preview_filename = f"preview_2page_{url_hash}.png"
            preview_path = os.path.join(self.screenshots_dir, preview_filename)
            
            # Check if preview already exists
            if os.path.exists(preview_path):
                logger.info(f"Preview already exists: {preview_path}")
                return f"/uploads/screenshots/{preview_filename}"
            
            # For two-page preview, we need a more sophisticated approach
            # Since web services can't easily do this, we'll create a composite preview
            return self.generate_two_page_preview(pdf_url, preview_path, preview_filename)
            
        except Exception as e:
            logger.error(f"Error generating preview from URL: {e}")
            return None
    
    def generate_two_page_preview(self, pdf_url, preview_path, preview_filename):
        """Generate a two-page side-by-side preview"""
        try:
            # First, try to get screenshots of the PDF
            # We'll use a service that can capture full PDF pages
            page1_url = f"https://image.thum.io/get/width/400/crop/600/pdfPage/1/{pdf_url}"
            page2_url = f"https://image.thum.io/get/width/400/crop/600/pdfPage/2/{pdf_url}"
            
            # Download both pages
            try:
                page1_response = requests.get(page1_url, timeout=20)
                page2_response = requests.get(page2_url, timeout=20)
                
                if page1_response.status_code == 200:
                    # We have at least page 1
                    with open(preview_path, 'wb') as f:
                        f.write(page1_response.content)
                    logger.info(f"Generated preview with page 1: {preview_path}")
                    return f"/uploads/screenshots/{preview_filename}"
                else:
                    # Fall back to single page preview
                    single_page_url = f"https://image.thum.io/get/width/800/crop/600/pdf/{pdf_url}"
                    response = requests.get(single_page_url, timeout=20)
                    if response.status_code == 200:
                        with open(preview_path, 'wb') as f:
                            f.write(response.content)
                        return f"/uploads/screenshots/{preview_filename}"
                    
            except requests.RequestException as e:
                logger.error(f"Error downloading PDF pages: {e}")
                
            # If all else fails, try generic screenshot
            return self.generate_generic_screenshot(pdf_url)
            
        except Exception as e:
            logger.error(f"Error generating two-page preview: {e}")
            return None
    
    def generate_generic_screenshot(self, url):
        """Generate a generic website screenshot as fallback"""
        try:
            # Extract domain for filename
            domain = url.split('/')[2] if url.startswith('http') else 'unknown'
            timestamp = int(time.time())
            preview_filename = f"generic_{domain}_{timestamp}.png"
            preview_path = os.path.join(self.screenshots_dir, preview_filename)
            
            # Use a simple website screenshot service
            screenshot_url = f"https://image.thum.io/get/width/600/crop/400/{url}"
            
            response = requests.get(screenshot_url, timeout=20)
            if response.status_code == 200:
                with open(preview_path, 'wb') as f:
                    f.write(response.content)
                logger.info(f"Generated generic screenshot: {preview_path}")
                return f"/uploads/screenshots/{preview_filename}"
                
        except Exception as e:
            logger.error(f"Error generating generic screenshot: {e}")
        
        return None
    
