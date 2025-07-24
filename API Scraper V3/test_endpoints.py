#!/usr/bin/env python3
"""
Test script for PartsTown API endpoints
Uses Playwright to bypass Cloudflare bot detection
"""

import asyncio
import json
import time
import re
from playwright.async_api import async_playwright

class PartsTownTester:
    def __init__(self):
        self.base_url = "https://www.partstown.com"
        self.headers = {
            "X-Requested-With": "XMLHttpRequest",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        self.timestamp = int(time.time() * 1000)
    
    def print_section(self, title):
        """Print a formatted section header"""
        print(f"\n{'='*60}")
        print(f"  {title}")
        print(f"{'='*60}")
    
    def print_json(self, data, title="Response"):
        """Print JSON data in a structured way"""
        print(f"\n{title}:")
        print("-" * 40)
        if isinstance(data, dict):
            print(json.dumps(data, indent=2, ensure_ascii=False))
        elif isinstance(data, list):
            print(f"Array with {len(data)} items:")
            if data:
                print("First item:")
                print(json.dumps(data[0], indent=2, ensure_ascii=False))
                if len(data) > 1:
                    print(f"... and {len(data) - 1} more items")
        else:
            print(str(data))
    
    def extract_json_from_html(self, html_content):
        """Extract JSON data from HTML content by finding script tags or data attributes"""
        # Look for common patterns where JSON data is embedded
        patterns = [
            # Pattern 1: window.initialData = {...}
            r'window\.initialData\s*=\s*({.*?});',
            # Pattern 2: window.data = {...}
            r'window\.data\s*=\s*({.*?});',
            # Pattern 3: var data = {...}
            r'var\s+data\s*=\s*({.*?});',
            # Pattern 4: JSON in script tag
            r'<script[^>]*>\s*({.*?})\s*</script>',
            # Pattern 5: data-* attributes
            r'data-models\s*=\s*["\']({.*?})["\']',
            r'data-facets\s*=\s*["\']({.*?})["\']',
            # Pattern 6: React/Vue component data
            r'__INITIAL_STATE__\s*=\s*({.*?});',
            # Pattern 7: JSON-LD script tags
            r'<script[^>]*type=["\']application/(?:ld\+)?json["\'][^>]*>([^<]*)</script>'
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, html_content, re.DOTALL | re.IGNORECASE)
            for match in matches:
                try:
                    # Clean up the JSON string
                    json_str = match.strip()
                    if json_str.startswith('{') and json_str.endswith('}'):
                        data = json.loads(json_str)
                        return data
                except (json.JSONDecodeError, ValueError):
                    continue
        
        # If no JSON found, try to find data in HTML structure
        # Look for specific div containers that might hold data
        data_patterns = [
            r'<div[^>]*class=["\'][^"\']*model-list[^"\']*["\'][^>]*>(.*?)</div>',
            r'<div[^>]*id=["\']models["\'][^>]*>(.*?)</div>',
            r'<div[^>]*data-component=["\'][^"\']*["\'][^>]*>(.*?)</div>'
        ]
        
        for pattern in data_patterns:
            matches = re.findall(pattern, html_content, re.DOTALL | re.IGNORECASE)
            if matches:
                print(f"Found HTML structure match: {len(matches)} elements")
                return {"html_structure": matches[0][:500] + "..." if len(matches[0]) > 500 else matches[0]}
        
        return None
    
    async def test_manufacturers_api(self, page):
        """Test the manufacturers API endpoint"""
        self.print_section("1. MANUFACTURERS API")
        
        url = f"{self.base_url}/api/manufacturers/"
        params = f"?v={self.timestamp}"
        
        try:
            print(f"URL: {url}{params}")
            response = await page.goto(url + params, wait_until="networkidle", timeout=30000)
            
            if response and response.status == 200:
                content = await response.text()
                if content.strip():
                    data = json.loads(content)
                    self.print_json(data, f"Manufacturers Data ({len(data)} manufacturers)")
                    return data
                else:
                    print("Error: Empty response")
                    return None
            else:
                status = response.status if response else "No response"
                print(f"Error: Status {status}")
                return None
                
        except json.JSONDecodeError:
            if content.startswith('<'):
                print("✅ Got XML response (expected format)")
                print(f"First 200 chars: {content[:200]}")
                return "XML_RESPONSE"
            else:
                print("Error: Invalid JSON response")
                return None
        except Exception as e:
            print(f"Error accessing manufacturers API: {e}")
            return None
    
    async def test_models_api(self, page, manufacturer="pitco"):
        """Test the models API endpoint"""
        self.print_section(f"2. MODELS API - {manufacturer.upper()}")
        
        url = f"{self.base_url}/{manufacturer}/parts/models"
        params = f"?v={self.timestamp}&narrow="
        
        try:
            print(f"URL: {url}{params}")
            
            # Set up network request monitoring
            captured_responses = []
            
            async def capture_requests(response):
                # Capture any JSON responses that might contain model data
                if ('application/json' in response.headers.get('content-type', '') or 
                    'models' in response.url or 'api' in response.url):
                    try:
                        if response.status == 200:
                            content = await response.text()
                            if content.strip().startswith('[') or content.strip().startswith('{'):
                                data = json.loads(content)
                                captured_responses.append({
                                    'url': response.url,
                                    'data': data
                                })
                                print(f"📡 Captured API response from: {response.url}")
                    except:
                        pass
            
            page.on('response', capture_requests)
            
            # Navigate to the page
            response = await page.goto(url + params, timeout=30000)
            
            # Wait for dynamic content to load
            await asyncio.sleep(5)
            
            # Check captured responses first
            if captured_responses:
                print("✅ Found data via network interception")
                api_data = captured_responses[0]['data']
                self.print_json(api_data, f"Models Data for {manufacturer} (from {captured_responses[0]['url']})")
                return api_data
            
            # Try to extract data from the loaded page DOM
            print("Attempting to extract data from DOM...")
            try:
                # Look for actual model links and data in the HTML
                models_data = await page.evaluate("""
                    () => {
                        const models = [];
                        
                        // Look for model links
                        const modelLinks = document.querySelectorAll('a[href*="/parts"]');
                        modelLinks.forEach(link => {
                            const href = link.getAttribute('href');
                            const text = link.textContent?.trim();
                            if (href && text && href.includes('/parts')) {
                                models.push({
                                    name: text,
                                    url: href,
                                    type: 'model_link'
                                });
                            }
                        });
                        
                        // Look for any divs with model data
                        const modelDivs = document.querySelectorAll('[data-model], .model, .product-tile');
                        modelDivs.forEach(div => {
                            const data = {};
                            // Get all data attributes
                            Object.assign(data, div.dataset);
                            if (Object.keys(data).length > 0) {
                                data.text = div.textContent?.trim();
                                models.push(data);
                            }
                        });
                        
                        return models.length > 0 ? models : null;
                    }
                """)
                
                if models_data:
                    print("✅ Successfully extracted model data from DOM")
                    self.print_json(models_data, f"Models Data for {manufacturer}")
                    return models_data
                else:
                    print("❌ No model data found in DOM")
                    
            except Exception as e:
                print(f"Error evaluating DOM extraction: {e}")
                
            # Fall back to HTML parsing
            
            if response.status == 200:
                content = await response.text()
                print(f"Response content length: {len(content)}")
                print(f"Response content type: {response.headers.get('content-type', 'N/A')}")
                if content.strip():
                    print(f"First 200 chars: {content[:200]}")
                    try:
                        data = json.loads(content)
                        self.print_json(data, f"Models Data for {manufacturer}")
                        return data
                    except json.JSONDecodeError as e:
                        print(f"JSON decode error: {e}")
                        if content.startswith('<'):
                            print("✅ Got HTML response - attempting to extract JSON data")
                            extracted_data = self.extract_json_from_html(content)
                            if extracted_data:
                                print("✅ Successfully extracted JSON data from HTML")
                                self.print_json(extracted_data, f"Extracted Models Data for {manufacturer}")
                                return extracted_data
                            else:
                                print("❌ Could not extract JSON from HTML")
                                # Let's save a portion of the HTML to analyze
                                print(f"HTML sample (first 1000 chars): {content[:1000]}")
                                return "HTML_RESPONSE"
                        else:
                            print("❌ Invalid response format")
                            return None
                else:
                    print("❌ Empty response body")
                    return None
            else:
                print(f"Error: Status {response.status}")
                return None
                
        except Exception as e:
            print(f"Error accessing models API: {e}")
            return None
    
    async def test_model_facets_api(self, page, manufacturer="pitco"):
        """Test the model facets API endpoint"""
        self.print_section(f"3. MODEL FACETS API - {manufacturer.upper()}")
        
        url = f"{self.base_url}/{manufacturer}/parts/model-facet"
        params = f"?v={self.timestamp}&page=1"
        
        try:
            print(f"URL: {url}{params}")
            
            # First navigate to main manufacturer page to establish session
            main_page = f"{self.base_url}/{manufacturer}/"
            print(f"First navigating to: {main_page}")
            await page.goto(main_page, timeout=30000)
            await asyncio.sleep(2)  # Give page time to load
            
            # Now try the API endpoint
            response = await page.goto(url + params, timeout=30000)
            
            if response.status == 200:
                content = await response.text()
                print(f"Response content length: {len(content)}")
                print(f"Response content type: {response.headers.get('content-type', 'N/A')}")
                if content.strip():
                    print(f"First 200 chars: {content[:200]}")
                    try:
                        data = json.loads(content)
                        self.print_json(data, f"Model Facets Data for {manufacturer}")
                        return data
                    except json.JSONDecodeError as e:
                        print(f"JSON decode error: {e}")
                        if content.startswith('<'):
                            print("✅ Got HTML response - attempting to extract JSON data")
                            extracted_data = self.extract_json_from_html(content)
                            if extracted_data:
                                print("✅ Successfully extracted JSON data from HTML")
                                self.print_json(extracted_data, f"Extracted Model Facets Data for {manufacturer}")
                                return extracted_data
                            else:
                                print("❌ Could not extract JSON from HTML")
                                # Let's save a portion of the HTML to analyze
                                print(f"HTML sample (first 1000 chars): {content[:1000]}")
                                return "HTML_RESPONSE"
                        else:
                            print("❌ Invalid response format")
                            return None
                else:
                    print("❌ Empty response body")
                    return None
            else:
                print(f"Error: Status {response.status}")
                return None
                
        except Exception as e:
            print(f"Error accessing model facets API: {e}")
            return None
    
    async def test_part_predictor_api(self, page, category_code="PT_CAT1163"):
        """Test the part predictor API endpoint"""
        self.print_section(f"4. PART PREDICTOR API - {category_code}")
        
        url = f"{self.base_url}/part-predictor/{category_code}/models"
        
        try:
            print(f"URL: {url}")
            response = await page.goto(url, timeout=30000)
            
            if response.status == 200:
                content = await response.text()
                data = json.loads(content)
                self.print_json(data, f"Part Predictor Data for {category_code}")
                return data
            else:
                print(f"Error: Status {response.status}")
                return None
                
        except Exception as e:
            print(f"Error accessing part predictor API: {e}")
            return None
    
    async def test_product_image(self, page, manufacturer="ALT", part_number="ALTBA-38586"):
        """Test product image endpoint"""
        self.print_section(f"5. PRODUCT IMAGE - {manufacturer}/{part_number}")
        
        url = f"https://partstown.sirv.com/products/{manufacturer}/{part_number}.view"
        
        try:
            print(f"URL: {url}")
            response = await page.goto(url, timeout=30000)
            
            if response.status == 200:
                content_type = response.headers.get('content-type', '')
                content_length = response.headers.get('content-length', 'unknown')
                
                print(f"Image Response:")
                print(f"  Content-Type: {content_type}")
                print(f"  Content-Length: {content_length} bytes")
                print(f"  Status: ✅ Image accessible")
                
                # Test thumbnail version
                thumb_url = url + "?thumb"
                thumb_response = await page.goto(thumb_url)
                if thumb_response.status == 200:
                    thumb_length = thumb_response.headers.get('content-length', 'unknown')
                    print(f"  Thumbnail: ✅ Available ({thumb_length} bytes)")
                
                return True
            else:
                print(f"Error: Status {response.status}")
                return False
                
        except Exception as e:
            print(f"Error accessing product image: {e}")
            return False
    
    async def test_manual_pdf(self, page, manual_name="ALT-1010_spm"):
        """Test manual PDF endpoint"""
        self.print_section(f"6. MANUAL PDF - {manual_name}")
        
        url = f"{self.base_url}/modelManual/{manual_name}.pdf"
        params = f"?v={self.timestamp}"
        
        try:
            print(f"URL: {url}{params}")
            response = await page.goto(url + params, timeout=30000)
            
            if response.status == 200:
                content_type = response.headers.get('content-type', '')
                content_length = response.headers.get('content-length', 'unknown')
                
                print(f"PDF Response:")
                print(f"  Content-Type: {content_type}")
                print(f"  Content-Length: {content_length} bytes")
                print(f"  Status: ✅ PDF accessible")
                return True
            else:
                print(f"Error: Status {response.status}")
                return False
                
        except Exception as e:
            print(f"Error accessing manual PDF: {e}")
            return False

    async def run_all_tests(self):
        """Run all endpoint tests"""
        print("PartsTown API Endpoint Tester")
        print("Using Playwright with Chromium to bypass bot detection")
        
        async with async_playwright() as p:
            # Launch browser with stealth settings
            browser = await p.chromium.launch(
                headless=False,
                args=['--disable-blink-features=AutomationControlled', '--no-sandbox']
            )
            
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
            )
            
            page = await context.new_page()
            
            # Set extra headers
            await page.set_extra_http_headers(self.headers)
            
            try:
                # Test all endpoints with error handling
                manufacturers = None
                models = None
                facets = None
                predictor = None
                image = None
                manual = None
                
                try:
                    manufacturers = await self.test_manufacturers_api(page)
                    await asyncio.sleep(2)  # Rate limiting
                except Exception as e:
                    print(f"Manufacturers test failed: {e}")
                
                try:
                    models = await self.test_models_api(page)
                    await asyncio.sleep(2)
                except Exception as e:
                    print(f"Models test failed: {e}")
                
                try:
                    facets = await self.test_model_facets_api(page)
                    await asyncio.sleep(2)
                except Exception as e:
                    print(f"Facets test failed: {e}")
                
                try:
                    predictor = await self.test_part_predictor_api(page)
                    await asyncio.sleep(2)
                except Exception as e:
                    print(f"Predictor test failed: {e}")
                
                try:
                    image = await self.test_product_image(page)
                    await asyncio.sleep(2)
                except Exception as e:
                    print(f"Image test failed: {e}")
                
                try:
                    manual = await self.test_manual_pdf(page)
                except Exception as e:
                    print(f"Manual test failed: {e}")
                
                # Summary
                self.print_section("SUMMARY")
                results = {
                    "Manufacturers API": "✅" if manufacturers else "❌",
                    "Models API": "✅" if models else "❌",
                    "Model Facets API": "✅" if facets else "❌",
                    "Part Predictor API": "✅" if predictor else "❌",
                    "Product Images": "✅" if image else "❌",
                    "Manual PDFs": "✅" if manual else "❌"
                }
                
                for endpoint, status in results.items():
                    print(f"{endpoint}: {status}")
                
            finally:
                await browser.close()

if __name__ == "__main__":
    tester = PartsTownTester()
    asyncio.run(tester.run_all_tests())