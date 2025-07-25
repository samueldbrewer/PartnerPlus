import asyncio
import logging
import os
import hashlib
import time
from typing import List, Dict, Optional
from urllib.parse import urlparse
from playwright.async_api import async_playwright, Browser, BrowserContext, Page
from concurrent.futures import ThreadPoolExecutor
import aiofiles

logger = logging.getLogger(__name__)

class WebsiteScreenshotService:
    """Service for capturing website screenshots using Playwright"""
    
    def __init__(self, screenshot_dir: str = "uploads/screenshots/suppliers"):
        self.screenshot_dir = screenshot_dir
        self.browser: Optional[Browser] = None
        self.playwright = None
        self.max_parallel = 3  # Reduced for stability
        
        # Create screenshot directory if it doesn't exist
        os.makedirs(self.screenshot_dir, exist_ok=True)
        
    async def initialize(self):
        """Initialize Playwright and browser"""
        if not self.playwright:
            self.playwright = await async_playwright().start()
            self.browser = await self.playwright.chromium.launch(
                headless=True,  # Run headless for better performance
                args=['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            )
            logger.info("Playwright browser initialized")
    
    async def cleanup(self):
        """Clean up browser resources"""
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()
        logger.info("Playwright browser cleaned up")
    
    def _get_screenshot_filename(self, url: str) -> str:
        """Generate a filename for the screenshot based on URL"""
        # Create a hash of the URL for the filename
        url_hash = hashlib.md5(url.encode()).hexdigest()[:12]
        domain = urlparse(url).netloc.replace('www.', '').replace('.', '_')
        timestamp = int(time.time())
        return f"supplier_{domain}_{url_hash}_{timestamp}.png"
    
    def _get_screenshot_path(self, url: str) -> str:
        """Get the full path for a screenshot"""
        filename = self._get_screenshot_filename(url)
        return os.path.join(self.screenshot_dir, filename)
    
    async def capture_screenshot_single(self, url: str) -> Optional[str]:
        """Capture a screenshot of a single website with its own context"""
        context = None
        page = None
        try:
            # Create a new context for this screenshot
            context = await self.browser.new_context(
                viewport={"width": 1280, "height": 720},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            )
            
            page = await context.new_page()
            
            # Navigate to the URL with shorter timeout
            logger.info(f"Navigating to {url}")
            await page.goto(url, wait_until='domcontentloaded', timeout=15000)
            
            # Wait a bit for any dynamic content
            await page.wait_for_timeout(2000)
            
            # Take screenshot
            screenshot_path = self._get_screenshot_path(url)
            await page.screenshot(
                path=screenshot_path,
                full_page=False,
                clip={"x": 0, "y": 0, "width": 1280, "height": 720}
            )
            
            logger.info(f"Screenshot saved: {screenshot_path}")
            
            # Return the relative path for web access
            return screenshot_path.replace('uploads/', '')
            
        except Exception as e:
            error_msg = str(e)
            if "Connection closed" in error_msg:
                logger.warning(f"Connection closed while capturing {url} - this is normal browser behavior")
            else:
                logger.error(f"Error capturing screenshot for {url}: {error_msg}")
            return None
        finally:
            # Clean up page and context safely
            if page and not page.is_closed():
                try:
                    await page.close()
                except Exception as e:
                    logger.debug(f"Error closing page: {e}")
            if context:
                try:
                    await context.close()
                except Exception as e:
                    logger.debug(f"Error closing context: {e}")
    
    async def capture_screenshots_batch(self, urls: List[str]) -> Dict[str, Optional[str]]:
        """Capture screenshots for multiple URLs"""
        # Initialize if not already done
        await self.initialize()
        
        results = {}
        
        # Process URLs in batches to avoid overwhelming the browser
        for i in range(0, len(urls), self.max_parallel):
            batch = urls[i:i + self.max_parallel]
            tasks = []
            
            for url in batch:
                task = asyncio.create_task(self.capture_screenshot_single(url))
                tasks.append((url, task))
            
            # Wait for batch to complete
            for url, task in tasks:
                try:
                    screenshot_path = await task
                    results[url] = screenshot_path
                except Exception as e:
                    logger.error(f"Failed to capture screenshot for {url}: {e}")
                    results[url] = None
        
        return results
    
    def capture_screenshots_sync(self, urls: List[str]) -> Dict[str, Optional[str]]:
        """Synchronous wrapper for capturing screenshots"""
        loop = None
        try:
            # Create new event loop for this thread
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            # Initialize browser
            loop.run_until_complete(self.initialize())
            
            # Run the async function
            return loop.run_until_complete(self.capture_screenshots_batch(urls))
        except Exception as e:
            logger.error(f"Error in sync wrapper: {e}")
            # Return empty results on failure
            return {url: None for url in urls}
        finally:
            if loop and not loop.is_closed():
                try:
                    # Clean up
                    loop.run_until_complete(self.cleanup())
                    loop.close()
                except Exception as e:
                    logger.debug(f"Error closing event loop: {e}")

# Global instance for reuse
_screenshot_service = None

def get_screenshot_service() -> WebsiteScreenshotService:
    """Get or create the global screenshot service instance"""
    global _screenshot_service
    if _screenshot_service is None:
        _screenshot_service = WebsiteScreenshotService()
    return _screenshot_service

def capture_supplier_screenshots(supplier_urls: List[str]) -> Dict[str, Optional[str]]:
    """Capture screenshots for supplier websites"""
    service = get_screenshot_service()
    return service.capture_screenshots_sync(supplier_urls)