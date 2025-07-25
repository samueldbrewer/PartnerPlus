import os
import logging
import uuid
import time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
from config import Config
from services.temp_pdf_manager import get_temp_pdf_manager, temporary_pdf

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ManualDownloader:
    """Class for downloading manuals using Playwright to handle restricted sites"""
    
    def __init__(self, upload_folder=None, use_temp_storage=True, debug_screenshots=False):
        """Initialize the manual downloader
        
        Args:
            upload_folder (str): Upload folder path (for screenshots if enabled)
            use_temp_storage (bool): If True, use temporary storage for PDFs with auto-cleanup
            debug_screenshots (bool): If True, save debug screenshots (disabled by default)
        """
        self.use_temp_storage = use_temp_storage
        self.debug_screenshots = debug_screenshots
        self.upload_folder = upload_folder or Config.UPLOAD_FOLDER
        
        if not self.use_temp_storage:
            os.makedirs(self.upload_folder, exist_ok=True)
        
        # Create a screenshots directory only if debug screenshots are enabled
        if self.debug_screenshots:
            self.screenshots_dir = os.path.join(self.upload_folder, 'screenshots')
            os.makedirs(self.screenshots_dir, exist_ok=True)
            logger.info("Debug screenshots enabled")
        else:
            self.screenshots_dir = None
            logger.debug("Debug screenshots disabled")
        
        if self.use_temp_storage:
            self.temp_manager = get_temp_pdf_manager()
            logger.info("ManualDownloader initialized with temporary PDF storage")
        else:
            logger.info("ManualDownloader initialized with permanent PDF storage")
    
    def _get_download_path(self, file_ext=".pdf"):
        """
        Get a path for downloading a PDF file
        
        Args:
            file_ext (str): File extension
            
        Returns:
            str: Path for saving the PDF
        """
        if self.use_temp_storage:
            # Use temporary storage
            return self.temp_manager.get_temp_path(prefix="manual", suffix=file_ext)
        else:
            # Use permanent storage
            filename = f"{uuid.uuid4()}{file_ext}"
            return os.path.join(self.upload_folder, filename)
    
    def download_with_playwright(self, url):
        """
        Download a manual using Playwright to handle restricted sites
        
        Args:
            url (str): URL of the manual to download
            
        Returns:
            str: Path to the downloaded manual
        """
        # Special case handling for partstown.com
        if "partstown.com" in url.lower():
            logger.info(f"Detected partstown.com URL, using special handling: {url}")
            return self.download_partstown_manual(url)
            
        logger.info(f"Downloading manual with Playwright from: {url}")
        
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                headless=True,  # Set to False for debugging
                args=['--disable-dev-shm-usage']  # Useful in containerized environments
            )
            
            # Create a context with a user agent that mimics a real browser
            context = browser.new_context(
                viewport={"width": 1920, "height": 1080},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36"
            )
            
            # Create a new page
            page = context.new_page()
            
            try:
                # Navigate to the URL with robust options and minimal waiting
                logger.info(f"Navigating to URL with custom headers: {url}")
                
                # Use a more sophisticated approach to bypass restrictions
                # First set extra HTTP headers that mimic a real browser
                page.set_extra_http_headers({
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1',
                    'Referer': 'https://www.google.com/'
                })
                
                # Use 'commit' which is the most minimal waiting - just wait for initial HTML response
                # This is much more reliable for PDFs and avoids waiting for network activity
                logger.info("Using minimal 'commit' waiting mode for navigation")
                response = page.goto(url, wait_until="commit", timeout=60000)
                
                # Check response status
                if response and response.status == 200:
                    logger.info(f"Successfully navigated to URL with status 200")
                elif response:
                    logger.warning(f"Page loaded with non-200 status: {response.status}")
                
                # Take a screenshot for debugging (if enabled)
                if self.debug_screenshots and self.screenshots_dir:
                    timestamp = int(time.time())
                    screenshot_path = os.path.join(self.screenshots_dir, f"manual_page_{timestamp}.png")
                    page.screenshot(path=screenshot_path)
                    logger.debug(f"Debug screenshot saved: {screenshot_path}")
                
                # Check if the page loaded correctly
                page_title = page.title()
                logger.info(f"Page title: {page_title}")
                
                # Wait a moment for any redirects or JS to complete
                page.wait_for_timeout(2000)
                
                # Generate a unique filename
                parsed_url = urlparse(url)
                original_filename = os.path.basename(parsed_url.path)
                
                # Get file extension or default to .pdf
                file_ext = os.path.splitext(original_filename)[1]
                if not file_ext:
                    file_ext = ".pdf"
                
                # Get download path (temporary or permanent based on configuration)
                local_path = self._get_download_path(file_ext)
                
                # Check if we're directly on a PDF
                content_type = page.evaluate("""() => {
                    return document.contentType || '';
                }""")
                
                logger.info(f"Page content type: {content_type}")
                
                # If we're on a PDF page already
                if 'pdf' in content_type.lower():
                    logger.info("Direct PDF page detected, capturing content")
                    # Save the current page as PDF
                    page.pdf(path=local_path)
                    logger.info(f"PDF content saved to: {local_path}")
                    return local_path
                
                # Wait for the PDF to load or a download button to appear
                try:
                    # Try to download directly from URL if it ends with .pdf
                    if url.lower().endswith('.pdf'):
                        logger.info("Attempting direct download from URL ending with .pdf")
                        try:
                            # Set up special page for download
                            download_page = context.new_page()
                            with download_page.expect_download() as download_info:
                                # Use commit instead of domcontentloaded (faster, less waiting)
                                download_page.goto(url, wait_until="commit", timeout=30000)
                            download = download_info.value
                            download.save_as(local_path)
                            download_page.close()
                            logger.info(f"Direct download successful, saved to: {local_path}")
                            return local_path
                        except Exception as e:
                            logger.warning(f"Direct download attempt failed: {e}")
                            # Continue with other methods
                    
                    # Check for common download button patterns
                    download_selectors = [
                        "a[href*='.pdf']",
                        "a[href*='download']",
                        "a[href*='getfile']",
                        "button:has-text('Download')",
                        "a:has-text('Download')",
                        "button:has-text('View PDF')",
                        "a:has-text('View PDF')"
                    ]
                    
                    # Try to find a download button
                    download_button = None
                    for selector in download_selectors:
                        if page.is_visible(selector):
                            download_button = selector
                            break
                    
                    # If we found a download button, click it
                    if download_button:
                        logger.info(f"Found download button with selector: {download_button}")
                        
                        logger.info(f"Attempting to click download button: {download_button}")
                        try:
                            # Set up download event handler with a longer timeout
                            with page.expect_download(timeout=120000) as download_info:
                                page.click(download_button)
                            
                            # Get the download and save it
                            download = download_info.value
                            logger.info(f"Download started: {download.suggested_filename}")
                            
                            # Save the downloaded file
                            download.save_as(local_path)
                            logger.info(f"Manual downloaded to: {local_path}")
                        except Exception as e:
                            logger.warning(f"Download button click failed: {e}")
                            # Take another screenshot after click attempt
                            if self.debug_screenshots:
                                page.screenshot(path=os.path.join(self.screenshots_dir, f"after_click_{timestamp}.png"))
                            # Try to extract PDF content anyway
                            page.pdf(path=local_path)
                            logger.info(f"Extracted page as PDF after download attempt failed: {local_path}")
                    else:
                        # If no button, try direct PDF content
                        logger.info("No download button found, trying direct page content download")
                        
                        # Check if current page is a PDF
                        content_type = page.evaluate("""() => {
                            return document.contentType || '';
                        }""")
                        
                        if 'pdf' in content_type.lower():
                            # Save the current page as PDF
                            page.pdf(path=local_path)
                            logger.info(f"PDF content extracted and saved to: {local_path}")
                        else:
                            # Try to save the page as PDF anyway
                            page.pdf(path=local_path)
                            logger.info(f"Page converted to PDF and saved to: {local_path}")
                
                except Exception as e:
                    logger.warning(f"Download button interaction failed: {e}")
                    # Fall back to PDF conversion of the entire page
                    logger.info("Falling back to PDF conversion of the entire page")
                    page.pdf(path=local_path)
                    logger.info(f"Page converted to PDF and saved to: {local_path}")
                
                return local_path
                
            except Exception as e:
                logger.error(f"Error downloading manual with Playwright: {e}")
                raise
            
            finally:
                try:
                    page.close()
                except:
                    pass
                try:
                    context.close()
                except:
                    pass
                try:
                    browser.close()
                except:
                    pass
    
    def download_partstown_manual(self, url):
        """
        Special handler for Partstown URLs which have specific restrictions
        
        Args:
            url (str): Partstown URL to download from
            
        Returns:
            str: Path to the downloaded manual
        """
        logger.info(f"Using specialized Partstown download method for: {url}")
        
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                headless=True
            )
            
            # Create a context with specific viewport and user agent
            context = browser.new_context(
                viewport={"width": 1280, "height": 1024},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36"
            )
            
            try:
                # Create a page and navigate to Partstown homepage first
                page = context.new_page()
                logger.info("First navigating to Partstown homepage to set cookies")
                
                # Set extra headers for Partstown
                page.set_extra_http_headers({
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1'
                })
                
                # First visit the main site to get cookies
                page.goto("https://www.partstown.com/", wait_until="domcontentloaded", timeout=30000)
                page.wait_for_timeout(3000)
                
                # Try to simulate user behavior by scrolling
                try:
                    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    page.wait_for_timeout(1000)
                except:
                    pass
                
                # Parse the URL to get the manual model
                parsed = urlparse(url)
                path = parsed.path
                model_part = os.path.basename(path).split('_')[0]
                logger.info(f"Extracted model: {model_part}")
                
                # Get download path for PDF (temporary or permanent based on configuration)
                local_path = self._get_download_path(".pdf")
                
                # Now try a direct access to the PDF with our cookies
                logger.info("Now accessing the PDF directly with cookies")
                page.goto(url, wait_until="commit", timeout=10000)
                
                # Take a screenshot to see what we got
                if self.debug_screenshots:
                    screenshot_path = os.path.join(self.screenshots_dir, f"partstown_{int(time.time())}.png")
                    page.screenshot(path=screenshot_path)
                
                # Try to generate a PDF from the page
                logger.info("Saving page content as PDF")
                page.pdf(path=local_path)
                
                if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
                    logger.info(f"Successfully saved Partstown content to {local_path}")
                    return local_path
                    
                # If direct PDF saving failed, try to locate PDF element or iframe
                logger.info("Looking for PDF embedded elements")
                pdf_selectors = [
                    "embed[type='application/pdf']",
                    "iframe[src*='.pdf']",
                    "object[type='application/pdf']",
                    "a[href*='.pdf']"
                ]
                
                for selector in pdf_selectors:
                    if page.is_visible(selector):
                        logger.info(f"Found PDF element: {selector}")
                        # Try to extract the source
                        src = page.get_attribute(selector, "src") or page.get_attribute(selector, "href")
                        if src:
                            logger.info(f"Found PDF source: {src}")
                            # Try to download from this source
                            try:
                                # Use HTTP request with specific headers
                                headers = {
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
                                    'Accept': 'application/pdf,*/*',
                                    'Referer': 'https://www.partstown.com/'
                                }
                                response = requests.get(src, headers=headers, cookies=page.context.cookies, stream=True)
                                
                                if response.status_code == 200:
                                    with open(local_path, 'wb') as f:
                                        for chunk in response.iter_content(chunk_size=8192):
                                            f.write(chunk)
                                    logger.info(f"Downloaded PDF from embedded element to {local_path}")
                                    return local_path
                            except Exception as e:
                                logger.warning(f"Failed to download from embedded element: {e}")
                                
                # Last resort: use curl to download
                return self.try_download_with_curl(url)
                
            except Exception as e:
                logger.error(f"Error in Partstown download handler: {e}")
                # Try curl as fallback
                return self.try_download_with_curl(url)
                
            finally:
                try:
                    page.close()
                except:
                    pass
                try:
                    context.close()
                except:
                    pass
                try:
                    browser.close()
                except:
                    pass
                
    def try_download_with_curl(self, url):
        """
        Attempt to download using curl as a last resort
        
        Args:
            url (str): URL to download from
            
        Returns:
            str: Path to the downloaded file or None if failed
        """
        try:
            # Generate a unique filename
            parsed_url = urlparse(url)
            original_filename = os.path.basename(parsed_url.path)
            
            # Get file extension or default to .pdf
            file_ext = os.path.splitext(original_filename)[1]
            if not file_ext:
                file_ext = ".pdf"
            
            # Get download path (temporary or permanent based on configuration)
            local_path = self._get_download_path(file_ext)
            
            # Execute curl with options to mimic a browser
            import subprocess
            logger.info(f"Attempting download with curl: {url}")
            
            cmd = [
                'curl', '-L', '-A', 
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                '-e', 'https://www.google.com/',
                '--connect-timeout', '30',
                '--max-time', '120',
                '-o', local_path,
                url
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode == 0 and os.path.exists(local_path) and os.path.getsize(local_path) > 0:
                logger.info(f"Curl download successful to: {local_path}")
                return local_path
            else:
                logger.error(f"Curl download failed: {result.stderr}")
                return None
                
        except Exception as e:
            logger.error(f"Curl download error: {e}")
            return None
            
    def download_manual(self, url):
        """
        Download a manual, trying multiple methods as needed
        
        Args:
            url (str): URL of the manual to download
            
        Returns:
            str: Path to the downloaded manual
        """
        methods_tried = []
        errors = []
        
        # Try all methods until one works
        try:
            # Method 1: First try with Playwright (most robust)
            methods_tried.append("playwright")
            return self.download_with_playwright(url)
        except Exception as e:
            error_msg = f"Playwright download failed: {str(e)}"
            logger.error(error_msg)
            errors.append(error_msg)
            
            # Method 2: Try curl as fallback
            methods_tried.append("curl")
            curl_result = self.try_download_with_curl(url)
            if curl_result:
                return curl_result
                
            # If we get here, all methods failed
            error_details = "\n".join(errors)
            logger.error(f"All download methods ({', '.join(methods_tried)}) failed for {url}:\n{error_details}")
            raise Exception(f"Failed to download manual after trying {len(methods_tried)} methods: {', '.join(methods_tried)}")
