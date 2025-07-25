"""Generate two-page side-by-side PDF previews"""

import os
import logging
import hashlib
from PIL import Image
import io
import fitz  # PyMuPDF
import requests
import tempfile

logger = logging.getLogger(__name__)

class PDFTwoPagePreview:
    """Generate two-page side-by-side previews for PDFs"""
    
    def __init__(self, screenshots_dir="uploads/screenshots"):
        """Initialize the preview generator"""
        self.screenshots_dir = screenshots_dir
        os.makedirs(self.screenshots_dir, exist_ok=True)
    
    def generate_from_url(self, pdf_url):
        """Generate two-page preview from PDF URL"""
        try:
            # Generate unique filename
            url_hash = hashlib.md5(pdf_url.encode()).hexdigest()[:16]
            preview_filename = f"preview_2pages_{url_hash}.png"
            preview_path = os.path.join(self.screenshots_dir, preview_filename)
            
            # Check if preview already exists
            if os.path.exists(preview_path):
                logger.info(f"Two-page preview already exists: {preview_path}")
                return f"/uploads/screenshots/{preview_filename}"
            
            # Download PDF to temporary file
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as temp_pdf:
                try:
                    logger.info(f"Downloading PDF for preview: {pdf_url}")
                    # Add headers to avoid blocking
                    headers = {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                    response = requests.get(pdf_url, timeout=30, stream=True, headers=headers)
                    if response.status_code == 200:
                        total_size = 0
                        for chunk in response.iter_content(chunk_size=8192):
                            temp_pdf.write(chunk)
                            total_size += len(chunk)
                        temp_pdf.flush()
                        logger.info(f"Downloaded {total_size} bytes for preview")
                        
                        # Generate preview from downloaded PDF
                        preview_url = self.generate_from_file(temp_pdf.name, preview_path, preview_filename)
                        return preview_url
                    else:
                        logger.error(f"Failed to download PDF: {response.status_code}")
                        return None
                finally:
                    # Clean up temp file
                    try:
                        os.unlink(temp_pdf.name)
                    except:
                        pass
                        
        except Exception as e:
            logger.error(f"Error generating two-page preview from URL: {e}")
            return None
    
    def generate_from_file(self, pdf_path, preview_path, preview_filename):
        """Generate two-page side-by-side preview from PDF file"""
        try:
            # Open PDF
            pdf_document = fitz.open(pdf_path)
            
            if pdf_document.page_count == 0:
                logger.error("PDF has no pages")
                return None
            
            # Determine how many pages to render (1 or 2)
            num_pages = min(pdf_document.page_count, 2)
            logger.info(f"PDF has {pdf_document.page_count} pages, rendering {num_pages}")
            
            # Render pages at higher DPI for quality
            dpi = 150
            mat = fitz.Matrix(dpi/72, dpi/72)
            
            # Render first page
            page1 = pdf_document[0]
            pix1 = page1.get_pixmap(matrix=mat)
            img1 = Image.open(io.BytesIO(pix1.tobytes("png")))
            
            # If there's a second page, render it
            if num_pages > 1:
                page2 = pdf_document[1]
                pix2 = page2.get_pixmap(matrix=mat)
                img2 = Image.open(io.BytesIO(pix2.tobytes("png")))
                
                # Create side-by-side composite
                # Calculate dimensions
                height = max(img1.height, img2.height)
                width = img1.width + img2.width + 20  # 20px gap between pages
                
                # Create composite image with white background
                composite = Image.new('RGB', (width, height), 'white')
                
                # Paste first page on left
                composite.paste(img1, (0, 0))
                
                # Paste second page on right with gap
                composite.paste(img2, (img1.width + 20, 0))
                
                # Add subtle shadow between pages
                from PIL import ImageDraw
                draw = ImageDraw.Draw(composite)
                shadow_x = img1.width + 10
                for i in range(5):
                    alpha = 50 - (i * 10)
                    draw.line([(shadow_x - i, 0), (shadow_x - i, height)], 
                             fill=(200, 200, 200, alpha), width=1)
                    draw.line([(shadow_x + i, 0), (shadow_x + i, height)], 
                             fill=(200, 200, 200, alpha), width=1)
                
                # Resize to reasonable dimensions for preview
                max_preview_width = 800
                if composite.width > max_preview_width:
                    ratio = max_preview_width / composite.width
                    new_height = int(composite.height * ratio)
                    composite = composite.resize((max_preview_width, new_height), Image.Resampling.LANCZOS)
                
            else:
                # Only one page - just use it
                composite = img1
                # Resize if needed
                max_preview_width = 400
                if composite.width > max_preview_width:
                    ratio = max_preview_width / composite.width
                    new_height = int(composite.height * ratio)
                    composite = composite.resize((max_preview_width, new_height), Image.Resampling.LANCZOS)
            
            # Save preview
            composite.save(preview_path, 'PNG', optimize=True)
            logger.info(f"Generated two-page preview: {preview_path}")
            
            # Close PDF
            pdf_document.close()
            
            return f"/uploads/screenshots/{preview_filename}"
            
        except Exception as e:
            logger.error(f"Error generating two-page preview from file: {e}")
            return None