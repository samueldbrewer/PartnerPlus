import os
import requests
import json
from urllib.parse import urlparse
from config import Config
import logging
import uuid
from services.manual_downloader import ManualDownloader
from services.temp_pdf_manager import get_temp_pdf_manager
import fitz  # PyMuPDF for PDF verification

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SerpAPIClient:
    """Client for the SerpAPI service"""
    
    def __init__(self, api_key=None):
        """Initialize the SerpAPI client"""
        self.api_key = api_key or Config.SERPAPI_KEY
        self.base_url = "https://serpapi.com/search"
        
    def search(self, params):
        """
        Perform a search using SerpAPI
        
        Args:
            params (dict): Search parameters
            
        Returns:
            dict: Search results
        """
        # Ensure API key is included
        params["api_key"] = self.api_key
        
        try:
            response = requests.get(self.base_url, params=params, timeout=30)
            response.raise_for_status()  # Raise exception for non-200 status codes
            return response.json()
        except requests.exceptions.Timeout:
            logger.error(f"SerpAPI request timed out after 30 seconds")
            return {"error": "timeout", "organic_results": []}
        except requests.exceptions.RequestException as e:
            logger.error(f"Error searching with SerpAPI: {e}")
            return {"error": str(e), "organic_results": []}

# Initialize the SerpAPI client
serp_client = SerpAPIClient()

def search_manuals(make, model, manual_type="technical", year=None, bypass_cache=False):
    """
    Search for technical or parts manuals using SerpAPI
    
    Args:
        make (str): Manufacturer/make (e.g., "Toyota")
        model (str): Model name/number (e.g., "Camry")
        manual_type (str): Type of manual ("technical", "parts", "repair", etc.)
        year (str, optional): Year of the model (e.g., "2020")
        
    Returns:
        list: List of manual metadata (title, URL, format, etc.)
    """
    # Construct search query with optional year
    if year:
        query = f"{make} {model} {year} {manual_type} manual pdf"
    else:
        query = f"{make} {model} {manual_type} manual pdf"
    
    # Build search parameters
    search_params = {
        "engine": "google",
        "q": query,
        "num": 10,
        "filter": "0",  # No duplicate filtering
        "gl": "us",     # Search in the US
        "hl": "en",     # English language
        "filetype": "pdf"  # Focus on PDFs
    }
    
    # Add cache-busting parameter if needed
    if bypass_cache:
        import time
        search_params["no_cache"] = "true"  # SerpAPI parameter to bypass cache
        search_params["t"] = str(int(time.time()))  # Additional timestamp for uniqueness
        logger.info(f"Bypassing SerpAPI cache for manual search: {query}")
    
    # Execute search with SerpAPI
    search_results = serp_client.search(search_params)
    
    # Process results
    manuals = []
    
    # Process organic search results
    if "organic_results" in search_results:
        for result in search_results["organic_results"]:
            url = result.get("link", "")
            
            # Only include PDFs
            if url.lower().endswith(".pdf") or "pdf" in url.lower():
                manuals.append({
                    "title": result.get("title", "Unknown Title"),
                    "url": url,
                    "snippet": result.get("snippet", ""),
                    "file_format": "PDF",
                    "make": make,
                    "model": model
                })
    
    # Process file search results if available
    if "pdf_results" in search_results:
        for result in search_results["pdf_results"]:
            manuals.append({
                "title": result.get("title", "Unknown Title"),
                "url": result.get("link", ""),
                "snippet": result.get("snippet", ""),
                "file_format": "PDF",
                "make": make,
                "model": model
            })
    
    # Add source domain and prepare for verification
    for manual in manuals:
        # Extract domain from URL for source
        try:
            domain = urlparse(manual['url']).netloc
            manual['source_domain'] = domain.replace('www.', '')
        except:
            manual['source_domain'] = 'unknown'
    
    return manuals

def verify_manual_contains_model(pdf_path, model):
    """
    Verify if a PDF manual contains the model number in the first 2 pages
    
    Args:
        pdf_path (str): Path to the PDF file
        model (str): Model number to search for
        
    Returns:
        bool: True if model is found in first 2 pages, False otherwise
    """
    try:
        # Open the PDF
        doc = fitz.open(pdf_path)
        
        # Check first 2 pages (or all pages if less than 2)
        pages_to_check = min(2, len(doc))
        
        # Clean model string for searching
        model_clean = model.strip().lower()
        
        for page_num in range(pages_to_check):
            page = doc[page_num]
            text = page.get_text().lower()
            
            # Check if model appears in the text
            if model_clean in text:
                doc.close()
                return True
        
        doc.close()
        return False
        
    except Exception as e:
        logger.error(f"Error verifying manual: {e}")
        return True  # Default to including if we can't verify

def get_pdf_page_count(pdf_path):
    """
    Get the page count of a PDF file
    
    Args:
        pdf_path (str): Path to the PDF file
        
    Returns:
        int: Number of pages, or None if error
    """
    try:
        doc = fitz.open(pdf_path)
        page_count = len(doc)
        doc.close()
        return page_count
    except Exception as e:
        logger.error(f"Error getting page count: {e}")
        return None

def download_manual(url, upload_folder=None, use_temp_storage=True):
    """
    Download a manual from the provided URL
    
    Args:
        url (str): URL of the manual to download
        upload_folder (str, optional): Folder to save the manual to (ignored if use_temp_storage=True)
        use_temp_storage (bool): If True, use temporary storage with auto-cleanup
        
    Returns:
        str: Path to the downloaded manual
    """
    if not use_temp_storage:
        if upload_folder is None:
            upload_folder = Config.UPLOAD_FOLDER
        # Create the upload folder if it doesn't exist
        os.makedirs(upload_folder, exist_ok=True)
    
    try:
        # First try with regular HTTP requests
        try:
            # Generate a path for the download
            if use_temp_storage:
                # Use temporary storage
                parsed_url = urlparse(url)
                original_filename = os.path.basename(parsed_url.path)
                file_ext = os.path.splitext(original_filename)[1]
                if not file_ext:
                    file_ext = ".pdf"
                temp_manager = get_temp_pdf_manager()
                local_path = temp_manager.get_temp_path(prefix="manual", suffix=file_ext)
            else:
                # Use permanent storage
                parsed_url = urlparse(url)
                original_filename = os.path.basename(parsed_url.path)
                
                # Get file extension or default to .pdf
                file_ext = os.path.splitext(original_filename)[1]
                if not file_ext:
                    file_ext = ".pdf"
                
                filename = f"{uuid.uuid4()}{file_ext}"
                local_path = os.path.join(upload_folder, filename)
            
            # Download the file
            logger.info(f"Attempting to download manual via HTTP: {url}")
            response = requests.get(url, stream=True, timeout=30)
            response.raise_for_status()
            
            with open(local_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            logger.info(f"Manual downloaded successfully: {local_path}")
            return local_path
            
        except (requests.exceptions.RequestException, requests.exceptions.HTTPError) as e:
            logger.warning(f"HTTP download failed, trying with Playwright: {e}")
            
            # If HTTP download fails, try with Playwright
            downloader = ManualDownloader(upload_folder, use_temp_storage=use_temp_storage, debug_screenshots=False)
            local_path = downloader.download_with_playwright(url)
            
            logger.info(f"Manual downloaded with Playwright: {local_path}")
            return local_path
    
    except Exception as e:
        logger.error(f"Error downloading manual {url}: {e}")
        raise