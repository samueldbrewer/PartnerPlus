import logging
import re
import asyncio
from urllib.parse import urlparse
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

logger = logging.getLogger(__name__)

class PriceScraper:
    """Service for scraping real-time prices from product pages"""
    
    def __init__(self):
        self.price_selectors = {
            # Common price selectors across e-commerce sites
            'generic': [
                '[data-testid*="price"]',
                '[class*="price"]',
                '[id*="price"]',
                '.price',
                '#price',
                '[data-price]',
                '.product-price',
                '.current-price',
                '.sale-price',
                '.regular-price',
                '.price-current',
                '.price-now',
                '.price-value',
                '.product-price-value'
            ],
            # Site-specific selectors for better accuracy
            'partstown.com': [
                '.price-current',
                '.product-price',
                '[data-testid="price"]',
                '.price',
                '.price-display',
                '#price-display'
            ],
            'webstaurantstore.com': [
                '.price-current',
                '.price',
                '.product-price',
                '[data-price]',
                '.price-display'
            ],
            'amazon.com': [
                '.a-price-whole',
                '.a-price .a-offscreen',
                '#priceblock_dealprice',
                '#priceblock_ourprice',
                '.a-price-current'
            ],
            'ebay.com': [
                '.display-price',
                '[data-testid="x-price-primary"]',
                '.notranslate'
            ],
            'grainger.com': [
                '[data-automation-id*="price"]',
                '.price',
                '.product-price'
            ]
        }
        
        self.price_patterns = [
            r'\$\s*[\d,]+\.\d{2}',  # $123.45, $1,234.56 (with cents)
            r'\$\s*[\d,]+',  # $123, $1,234 (without cents)
            r'USD\s*[\d,]+\.?\d*',  # USD 123.45
            r'[\d,]+\.?\d*\s*USD',  # 123.45 USD
            r'Price:\s*\$\s*[\d,]+\.?\d*',  # Price: $123.45
            r'List Price:\s*\$\s*[\d,]+\.?\d*',  # List Price: $123.45
            r'Our Price:\s*\$\s*[\d,]+\.?\d*',  # Our Price: $123.45
        ]
    
    async def scrape_price(self, url, timeout=10000):
        """
        Scrape price from a product page URL
        
        Args:
            url (str): Product page URL
            timeout (int): Timeout in milliseconds
            
        Returns:
            str|None: Extracted price or None if not found
        """
        if not url or not url.startswith('http'):
            logger.warning(f"Invalid URL provided: {url}")
            return None
            
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context(
                    user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                )
                page = await context.new_page()
                
                # Set timeout
                page.set_default_timeout(timeout)
                
                try:
                    # Navigate to the page
                    logger.info(f"Scraping price from: {url}")
                    await page.goto(url, wait_until='domcontentloaded')
                    
                    # Wait a bit for dynamic content to load
                    await page.wait_for_timeout(2000)
                    
                    # Try to find price using selectors
                    price = await self._extract_price_from_page(page, url)
                    
                    try:
                        await browser.close()
                    except:
                        pass
                    return price
                    
                except PlaywrightTimeoutError:
                    logger.warning(f"Timeout scraping price from {url}")
                    try:
                        await browser.close()
                    except:
                        pass
                    return None
                except Exception as e:
                    logger.warning(f"Error navigating to {url}: {e}")
                    try:
                        await browser.close()
                    except:
                        pass
                    return None
                    
        except Exception as e:
            logger.error(f"Error initializing browser for {url}: {e}")
            return None
    
    async def _extract_price_from_page(self, page, url):
        """Extract price from a loaded page using various strategies"""
        domain = urlparse(url).netloc.lower()
        
        # Get site-specific selectors first, then generic ones
        selectors = self.price_selectors.get(domain, []) + self.price_selectors['generic']
        
        # Strategy 1: Try CSS selectors
        for selector in selectors:
            try:
                elements = await page.query_selector_all(selector)
                for element in elements:
                    text = await element.text_content()
                    if text:
                        price = self._extract_price_from_text(text.strip())
                        if price:
                            logger.info(f"Found price {price} using selector {selector}")
                            return price
            except Exception as e:
                logger.debug(f"Selector {selector} failed: {e}")
                continue
        
        # Strategy 2: Search page text for price patterns
        try:
            page_text = await page.text_content('body')
            if page_text:
                price = self._extract_price_from_text(page_text)
                if price:
                    logger.info(f"Found price {price} in page text")
                    return price
        except Exception as e:
            logger.debug(f"Page text extraction failed: {e}")
        
        # Strategy 3: Check meta tags and structured data
        try:
            # Check for structured data prices
            structured_price = await page.evaluate('''() => {
                // Look for JSON-LD structured data
                const scripts = document.querySelectorAll('script[type="application/ld+json"]');
                for (let script of scripts) {
                    try {
                        const data = JSON.parse(script.textContent);
                        if (data.offers && data.offers.price) {
                            return data.offers.price;
                        }
                        if (data.price) {
                            return data.price;
                        }
                    } catch (e) {
                        continue;
                    }
                }
                
                // Check meta tags
                const priceMeta = document.querySelector('meta[property="product:price:amount"], meta[name="price"], meta[property="price"]');
                if (priceMeta && priceMeta.content) {
                    return priceMeta.content;
                }
                
                return null;
            }''')
            
            if structured_price:
                formatted_price = self._format_price(str(structured_price))
                if formatted_price:
                    logger.info(f"Found structured data price: {formatted_price}")
                    return formatted_price
                    
        except Exception as e:
            logger.debug(f"Structured data extraction failed: {e}")
        
        logger.warning(f"No price found on {url}")
        return None
    
    def _extract_price_from_text(self, text):
        """Extract price from text using regex patterns"""
        if not text:
            return None
            
        # Clean up the text
        text = re.sub(r'\s+', ' ', text).strip()
        
        for pattern in self.price_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for match in matches:
                price = self._format_price(match)
                if price and self._is_reasonable_price(price):
                    return price
        
        return None
    
    def _format_price(self, price_text):
        """Format and clean price text"""
        if not price_text:
            return None
            
        # Remove extra whitespace and common prefixes
        price_text = re.sub(r'(Price:\s*|USD\s*)', '', price_text, flags=re.IGNORECASE)
        price_text = price_text.strip()
        
        # Extract just the numeric part with dollar sign
        price_match = re.search(r'\$?\s*[\d,]+\.?\d*', price_text)
        if price_match:
            price = price_match.group(0).strip()
            # Ensure it starts with $
            if not price.startswith('$'):
                price = '$' + price
            return price
            
        return None
    
    def _is_reasonable_price(self, price):
        """Check if the extracted price seems reasonable for a part"""
        if not price:
            return False
            
        # Extract numeric value
        numeric_price = re.sub(r'[^\d.]', '', price)
        try:
            value = float(numeric_price)
            # Reasonable price range for parts: $5 to $50,000
            # Avoid very low prices that are likely errors (like $1 or $01)
            return 5.0 <= value <= 50000.0
        except (ValueError, TypeError):
            return False

def scrape_supplier_price(url, timeout=10000):
    """
    Synchronous wrapper for scraping price from a supplier URL
    
    Args:
        url (str): Product page URL
        timeout (int): Timeout in milliseconds
        
    Returns:
        str|None: Extracted price or None if not found
    """
    scraper = PriceScraper()
    
    try:
        # Check if there's an existing event loop
        try:
            loop = asyncio.get_running_loop()
            # If we're already in an event loop, run in a separate thread
            import concurrent.futures
            import threading
            
            def run_scraper():
                return asyncio.run(scraper.scrape_price(url, timeout))
            
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(run_scraper)
                return future.result(timeout=timeout/1000 + 5)  # Add 5 second buffer
                
        except RuntimeError:
            # No event loop running, we can use asyncio.run directly
            return asyncio.run(scraper.scrape_price(url, timeout))
            
    except Exception as e:
        logger.error(f"Error in synchronous price scraping wrapper: {e}")
        return None

# Async version for use in async contexts
async def scrape_supplier_price_async(url, timeout=10000):
    """
    Asynchronous version for scraping price from a supplier URL
    
    Args:
        url (str): Product page URL
        timeout (int): Timeout in milliseconds
        
    Returns:
        str|None: Extracted price or None if not found
    """
    scraper = PriceScraper()
    return await scraper.scrape_price(url, timeout)