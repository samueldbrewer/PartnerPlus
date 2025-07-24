#!/usr/bin/env python3
"""
Interactive PartsTown Data Explorer
Walk through: Manufacturers → Models → Parts → Images/Manuals
"""

import asyncio
import json
import time
import xml.etree.ElementTree as ET
from playwright.async_api import async_playwright

class PartsTownExplorer:
    def __init__(self):
        self.base_url = "https://www.partstown.com"
        self.timestamp = int(time.time() * 1000)
        self.page = None
        self.browser = None
        
    async def setup_browser(self):
        """Initialize the browser with proper settings"""
        print("🌐 Starting browser...")
        p = await async_playwright().start()
        self.browser = await p.chromium.launch(
            headless=False,
            args=['--disable-blink-features=AutomationControlled', '--no-sandbox']
        )
        
        context = await self.browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        )
        
        self.page = await context.new_page()
        await self.page.set_extra_http_headers({
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "application/json, text/plain, */*"
        })
        print("✅ Browser ready!")
        
    async def get_manufacturers(self):
        """Get list of all manufacturers"""
        print("\n📋 Fetching manufacturers...")
        
        url = f"{self.base_url}/api/manufacturers/?v={self.timestamp}"
        response = await self.page.goto(url, timeout=30000)
        
        if response.status == 200:
            content = await response.text()
            if content.startswith('<'):
                # Parse XML response
                root = ET.fromstring(content)
                manufacturers = []
                for item in root.findall('item'):
                    code = item.find('code').text
                    name = item.find('name').text
                    category_uri = item.find('categoryUri').text
                    model_count = int(item.find('modelCount').text)
                    
                    manufacturers.append({
                        'code': code,
                        'name': name,
                        'uri': category_uri,
                        'model_count': model_count
                    })
                
                return sorted(manufacturers, key=lambda x: x['name'])
        
        return []
    
    async def get_models_for_manufacturer(self, manufacturer_uri, manufacturer_code):
        """Get models for a specific manufacturer"""
        print(f"\n🔧 Fetching models for {manufacturer_uri}...")
        
        # Set up network monitoring to capture API responses
        captured_data = []
        
        async def capture_api_calls(response):
            if ('application/json' in response.headers.get('content-type', '')):
                try:
                    if response.status == 200:
                        data = await response.json()
                        # Look for model-like data
                        if (isinstance(data, list) and len(data) > 0 and 
                            any(key in str(data[0]).lower() for key in ['model', 'name', 'code', 'url']) and
                            'models' in response.url):
                            captured_data.append({
                                'url': response.url,
                                'data': data
                            })
                            print(f"📡 Captured models data from: {response.url}")
                except:
                    pass
        
        self.page.on('response', capture_api_calls)
        
        try:
            # Navigate to the models page directly using the URL pattern you provided
            models_url = f"{self.base_url}/{manufacturer_uri}/parts?v={self.timestamp}&narrow=#id=mdptabmodels"
            print(f"🌐 Navigating to: {models_url}")
            
            await self.page.goto(models_url, timeout=30000)
            
            # Wait for the page to load and JavaScript to execute
            await asyncio.sleep(3)
            
            # Try to click on the models tab if it exists
            try:
                # Look for models tab and click it
                await self.page.click('a[href*="mdptabmodels"], #mdptabmodels, .models-tab', timeout=5000)
                await asyncio.sleep(2)
            except:
                print("Models tab not found or already active")
            
            # Wait for any additional AJAX calls
            await asyncio.sleep(2)
            
            # Check if we captured any model data from API calls
            if captured_data:
                print(f"✅ Found {len(captured_data[0]['data'])} models via API")
                return captured_data[0]['data']
            
            # If no API data captured, try to extract from DOM
            print("Attempting to extract models from page DOM...")
            models_data = await self.page.evaluate("""
                () => {
                    const models = [];
                    
                    // Look for model elements in various possible containers
                    const selectors = [
                        '.model-item', '.model-card', '.product-tile', 
                        '[data-model]', '.model', '.equipment-model',
                        'a[href*="/parts"]', '.model-link'
                    ];
                    
                    for (const selector of selectors) {
                        const elements = document.querySelectorAll(selector);
                        elements.forEach(el => {
                            const text = el.textContent?.trim();
                            const href = el.getAttribute('href');
                            
                            if (text && text.length > 0 && text.length < 100) {
                                const model = {
                                    name: text,
                                    element_type: selector
                                };
                                
                                if (href) {
                                    model.url = href;
                                }
                                
                                // Get any data attributes
                                Object.assign(model, el.dataset);
                                
                                models.push(model);
                            }
                        });
                        
                        if (models.length > 0) {
                            console.log(`Found ${models.length} models using selector: ${selector}`);
                            break;
                        }
                    }
                    
                    // Also look for any lists or tables that might contain models
                    if (models.length === 0) {
                        const lists = document.querySelectorAll('ul li, ol li, table tr');
                        lists.forEach(item => {
                            const text = item.textContent?.trim();
                            const link = item.querySelector('a');
                            
                            if (text && text.length > 2 && text.length < 50) {
                                // Filter out obvious non-model content
                                if (!text.toLowerCase().includes('copyright') && 
                                    !text.toLowerCase().includes('privacy') &&
                                    !text.toLowerCase().includes('contact')) {
                                    
                                    const model = {
                                        name: text,
                                        element_type: 'list_item'
                                    };
                                    
                                    if (link) {
                                        model.url = link.getAttribute('href');
                                    }
                                    
                                    models.push(model);
                                }
                            }
                        });
                    }
                    
                    // Remove duplicates based on name
                    const unique = [];
                    const seen = new Set();
                    
                    for (const model of models) {
                        const key = model.name.toLowerCase().trim();
                        if (!seen.has(key) && key.length > 1) {
                            seen.add(key);
                            unique.push(model);
                        }
                    }
                    
                    return unique.slice(0, 50); // Limit to first 50
                }
            """)
            
            if models_data and len(models_data) > 0:
                print(f"✅ Extracted {len(models_data)} models from DOM")
                return models_data
            
            # Final fallback: try the part-predictor endpoint
            print("Trying part-predictor endpoint as fallback...")
            predictor_url = f"{self.base_url}/part-predictor/{manufacturer_code}/models"
            await self.page.goto(predictor_url, timeout=30000)
            await asyncio.sleep(2)
            
            if captured_data:
                print(f"✅ Found {len(captured_data[-1]['data'])} models via part-predictor")
                return captured_data[-1]['data']
            
        except Exception as e:
            print(f"Error fetching models: {e}")
        
        return []
    
    async def get_parts_for_model(self, model_data, manufacturer_uri):
        """Get parts for a specific model"""
        print(f"\n🔩 Fetching parts for model...")
        
        # Set up network monitoring for parts data
        captured_parts = []
        
        async def capture_parts_data(response):
            if ('application/json' in response.headers.get('content-type', '')):
                try:
                    if response.status == 200:
                        data = await response.json()
                        # Be more specific about parts data - avoid manufacturer lists
                        if (isinstance(data, list) and len(data) > 0 and 
                            'parts' in response.url and 
                            'manufacturers' not in response.url and
                            'part-predictor' not in response.url):
                            # Check if it looks like parts data
                            first_item = data[0]
                            if isinstance(first_item, dict):
                                # Look for part-specific fields
                                part_fields = ['partNumber', 'part_number', 'sku', 'productId', 'model', 'price']
                                if any(field in first_item for field in part_fields):
                                    captured_parts.append({
                                        'url': response.url,
                                        'data': data
                                    })
                                    print(f"📡 Captured parts data from: {response.url}")
                        elif (isinstance(data, dict) and 
                              any(key in data for key in ['parts', 'products', 'items', 'results']) and
                              'parts' in response.url):
                            captured_parts.append({
                                'url': response.url,
                                'data': data
                            })
                            print(f"📡 Captured parts data from: {response.url}")
                except:
                    pass
        
        self.page.on('response', capture_parts_data)
        
        try:
            # Build the correct model parts URL
            model_name = model_data.get('name', model_data.get('code', 'unknown'))
            model_url = model_data.get('url')
            
            if model_url:
                # Use the provided URL
                if model_url.startswith('/'):
                    full_url = f"{self.base_url}{model_url}"
                else:
                    full_url = model_url
            else:
                # Construct URL based on manufacturer and model
                full_url = f"{self.base_url}/{manufacturer_uri}/{model_name}/parts"
            
            print(f"🌐 Navigating to: {full_url}")
            await self.page.goto(full_url, timeout=30000)
            await asyncio.sleep(3)
            
            # Check for captured API data first
            if captured_parts:
                parts_list = []
                for capture in captured_parts:
                    data = capture['data']
                    if isinstance(data, list):
                        parts_list.extend(data)
                    elif isinstance(data, dict):
                        # Extract parts from various possible keys
                        for key in ['parts', 'products', 'items', 'results', 'data']:
                            if key in data and isinstance(data[key], list):
                                parts_list.extend(data[key])
                
                if parts_list:
                    print(f"✅ Found {len(parts_list)} parts via API")
                    return parts_list
            
            # If no API data, extract from DOM
            print("Attempting to extract parts from page DOM...")
            parts_data = await self.page.evaluate("""
                () => {
                    const parts = [];
                    
                    // Enhanced selectors for part elements
                    const selectors = [
                        '.part-item', '.product-item', '.search-result',
                        '[data-part-number]', '[data-sku]', '[data-product-id]',
                        '.part-number', '.sku', '.product-sku',
                        'tr[data-part]', 'tr.part-row', 'tr.product-row',
                        '.grid-item', '.list-item', '.catalog-item'
                    ];
                    
                    for (const selector of selectors) {
                        const elements = document.querySelectorAll(selector);
                        
                        elements.forEach(el => {
                            const text = el.textContent?.trim();
                            
                            if (text && text.length > 5) {
                                // Look for part number patterns
                                const partMatches = text.match(/([A-Z0-9][A-Z0-9-]{4,20})/g);
                                
                                if (partMatches) {
                                    partMatches.forEach(partNumber => {
                                        // Filter out obvious non-part numbers
                                        if (!partNumber.match(/^(HTTP|WWW|COM|PDF|JPG|PNG)$/i)) {
                                            const part = {
                                                part_number: partNumber,
                                                description: text.replace(partNumber, '').trim(),
                                                element_type: selector,
                                                source: 'dom_extraction'
                                            };
                                            
                                            // Look for price
                                            const priceMatch = text.match(/\\$([0-9]+\\.?[0-9]*)/);
                                            if (priceMatch) {
                                                part.price = priceMatch[1];
                                            }
                                            
                                            // Look for links
                                            const link = el.querySelector('a') || el.closest('a');
                                            if (link) {
                                                part.url = link.getAttribute('href');
                                            }
                                            
                                            parts.push(part);
                                        }
                                    });
                                }
                            }
                        });
                        
                        if (parts.length > 0) {
                            console.log(`Found ${parts.length} parts using selector: ${selector}`);
                            break;
                        }
                    }
                    
                    // If no parts found, look for any structured data that might be parts
                    if (parts.length === 0) {
                        const tables = document.querySelectorAll('table tr, .data-row, .list-row');
                        
                        tables.forEach(row => {
                            const cells = row.querySelectorAll('td, .cell, .col');
                            
                            if (cells.length >= 2) {
                                const firstCell = cells[0].textContent?.trim();
                                const secondCell = cells[1].textContent?.trim();
                                
                                // Check if first cell looks like a part number
                                if (firstCell && firstCell.match(/^[A-Z0-9][A-Z0-9-]{4,20}$/)) {
                                    parts.push({
                                        part_number: firstCell,
                                        description: secondCell || 'No description',
                                        element_type: 'table_row',
                                        source: 'table_extraction'
                                    });
                                }
                            }
                        });
                    }
                    
                    // Remove duplicates
                    const unique = [];
                    const seen = new Set();
                    
                    for (const part of parts) {
                        const key = part.part_number?.toLowerCase();
                        if (key && !seen.has(key)) {
                            seen.add(key);
                            unique.push(part);
                        }
                    }
                    
                    return unique.slice(0, 100); // Limit to first 100
                }
            """)
            
            if parts_data and len(parts_data) > 0:
                print(f"✅ Extracted {len(parts_data)} parts from DOM")
                return parts_data
            
            # Final attempt: look for any text that might contain part numbers
            print("Attempting basic part number extraction...")
            basic_parts = await self.page.evaluate("""
                () => {
                    const text = document.body.textContent;
                    const partNumbers = text.match(/[A-Z]{2,4}[0-9]{4,8}[A-Z0-9-]*/g);
                    
                    if (partNumbers) {
                        const unique = [...new Set(partNumbers)];
                        return unique.slice(0, 20).map(part => ({
                            part_number: part,
                            description: 'Part number found in page text',
                            source: 'text_extraction'
                        }));
                    }
                    
                    return [];
                }
            """)
            
            if basic_parts and len(basic_parts) > 0:
                print(f"✅ Found {len(basic_parts)} part numbers in page text")
                return basic_parts
                
        except Exception as e:
            print(f"Error fetching parts: {e}")
        
        return []
    
    async def get_part_details(self, part_data, manufacturer_uri, manufacturer_code):
        """Get comprehensive part details from the product page"""
        # Extract part number from the data
        part_number = part_data.get('productCode', part_data.get('partNumber', part_data.get('part_number', part_data.get('code'))))
        
        if not part_number:
            print("❌ No part number found in part data")
            return None
            
        print(f"\n📦 Fetching complete details for part {part_number}...")
        
        # Set up network monitoring for additional API calls
        captured_api_data = []
        
        async def capture_product_data(response):
            if ('application/json' in response.headers.get('content-type', '')):
                try:
                    if response.status == 200:
                        data = await response.json()
                        # Look for product/part detail APIs
                        if ('product' in response.url or 'part' in response.url or 'detail' in response.url):
                            captured_api_data.append({
                                'url': response.url,
                                'data': data
                            })
                            print(f"📡 Captured product API: {response.url}")
                except:
                    pass
        
        self.page.on('response', capture_product_data)
        
        try:
            # Try to construct the product page URL
            # Common patterns: /parts/{part_number}, /{manufacturer}/parts/{part_number}
            possible_urls = [
                f"{self.base_url}/parts/{part_number}",
                f"{self.base_url}/{manufacturer_uri}/parts/{part_number}",
                f"{self.base_url}/product/{part_number}",
                f"{self.base_url}/{manufacturer_uri}/product/{part_number}",
                f"{self.base_url}/part/{part_number}"
            ]
            
            product_details = {}
            
            # Try each URL pattern
            for url in possible_urls:
                try:
                    print(f"🌐 Trying: {url}")
                    response = await self.page.goto(url, timeout=20000)
                    
                    if response.status == 200:
                        print(f"✅ Found product page: {url}")
                        await asyncio.sleep(2)  # Let page load
                        
                        # Extract comprehensive product data from the page
                        page_data = await self.page.evaluate("""
                            () => {
                                const data = {};
                                
                                // Basic product info
                                data.title = document.title;
                                data.url = window.location.href;
                                
                                // Look for part number
                                const partNumberSelectors = [
                                    '[data-part-number]', '.part-number', '.sku', 
                                    '.product-sku', '.product-code', '#part-number'
                                ];
                                
                                for (const selector of partNumberSelectors) {
                                    const el = document.querySelector(selector);
                                    if (el) {
                                        data.part_number = el.textContent?.trim() || el.getAttribute('data-part-number');
                                        break;
                                    }
                                }
                                
                                // Look for description
                                const descSelectors = [
                                    '.product-description', '.description', '.product-title',
                                    'h1', '.product-name', '[data-description]'
                                ];
                                
                                for (const selector of descSelectors) {
                                    const el = document.querySelector(selector);
                                    if (el && el.textContent?.trim()) {
                                        data.description = el.textContent.trim();
                                        break;
                                    }
                                }
                                
                                // Look for price
                                const priceSelectors = [
                                    '.price', '.product-price', '.cost', '[data-price]',
                                    '.price-current', '.price-value'
                                ];
                                
                                for (const selector of priceSelectors) {
                                    const el = document.querySelector(selector);
                                    if (el) {
                                        const priceText = el.textContent?.trim();
                                        const priceMatch = priceText?.match(/\\$([0-9]+\\.?[0-9]*)/);
                                        if (priceMatch) {
                                            data.price = priceMatch[1];
                                            data.price_text = priceText;
                                            break;
                                        }
                                    }
                                }
                                
                                // Look for availability/stock
                                const stockSelectors = [
                                    '.availability', '.stock', '.in-stock', '.out-of-stock',
                                    '[data-stock]', '.inventory'
                                ];
                                
                                for (const selector of stockSelectors) {
                                    const el = document.querySelector(selector);
                                    if (el) {
                                        data.availability = el.textContent?.trim();
                                        break;
                                    }
                                }
                                
                                // Look for specifications table
                                const specTables = document.querySelectorAll('table, .specifications, .spec-table, .details-table');
                                const specifications = {};
                                
                                specTables.forEach(table => {
                                    const rows = table.querySelectorAll('tr');
                                    rows.forEach(row => {
                                        const cells = row.querySelectorAll('td, th');
                                        if (cells.length >= 2) {
                                            const key = cells[0].textContent?.trim();
                                            const value = cells[1].textContent?.trim();
                                            if (key && value && key.length < 50 && value.length < 200) {
                                                specifications[key] = value;
                                            }
                                        }
                                    });
                                });
                                
                                if (Object.keys(specifications).length > 0) {
                                    data.specifications = specifications;
                                }
                                
                                // Look for images
                                const images = [];
                                const imgSelectors = [
                                    '.product-image img', '.gallery img', '.product-gallery img',
                                    '.main-image img', '[data-image] img', '.zoom img'
                                ];
                                
                                for (const selector of imgSelectors) {
                                    const imgs = document.querySelectorAll(selector);
                                    imgs.forEach(img => {
                                        const src = img.src || img.getAttribute('data-src');
                                        if (src && !images.includes(src)) {
                                            images.push(src);
                                        }
                                    });
                                }
                                
                                if (images.length > 0) {
                                    data.images = images;
                                }
                                
                                // Look for compatibility/fits information
                                const compatSelectors = [
                                    '.compatibility', '.fits', '.works-with', '.models-list',
                                    '[data-compatibility]', '.model-compatibility'
                                ];
                                
                                for (const selector of compatSelectors) {
                                    const el = document.querySelector(selector);
                                    if (el) {
                                        data.compatibility = el.textContent?.trim();
                                        break;
                                    }
                                }
                                
                                // Look for additional attributes in data attributes
                                const productEl = document.querySelector('[data-product], .product, .part-details');
                                if (productEl) {
                                    Object.assign(data, productEl.dataset);
                                }
                                
                                // Look for JSON-LD structured data
                                const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
                                jsonLdScripts.forEach(script => {
                                    try {
                                        const jsonData = JSON.parse(script.textContent);
                                        if (jsonData['@type'] === 'Product') {
                                            data.structured_data = jsonData;
                                        }
                                    } catch (e) {}
                                });
                                
                                return data;
                            }
                        """)
                        
                        if page_data:
                            product_details.update(page_data)
                            break
                            
                except Exception as e:
                    print(f"❌ Failed to load {url}: {e}")
                    continue
            
            # Add any captured API data
            if captured_api_data:
                product_details['api_data'] = captured_api_data
            
            # Add Sirv CDN images
            if part_number:
                sirv_images = await self._get_sirv_images(part_number, manufacturer_code)
                if sirv_images:
                    product_details['sirv_images'] = sirv_images
            
            # Merge with original part data
            final_details = {**part_data, **product_details}
            
            return final_details
            
        except Exception as e:
            print(f"Error fetching part details: {e}")
            return part_data  # Return original data if extraction fails
    
    async def _get_sirv_images(self, part_number, manufacturer_code):
        """Helper function to get Sirv CDN images"""
        base_image_url = f"https://partstown.sirv.com/products/{manufacturer_code.upper()}/{part_number}"
        
        images = []
        image_formats = ['.view', '.jpg', '.png', '.gif']
        
        for fmt in image_formats:
            try:
                image_url = base_image_url + fmt
                response = await self.page.goto(image_url, timeout=10000)
                
                if response.status == 200:
                    content_type = response.headers.get('content-type', '')
                    if 'image' in content_type or 'html' in content_type:
                        images.append({
                            'url': image_url,
                            'type': fmt,
                            'content_type': content_type
                        })
                        
                        # For .view format, also try thumbnail
                        if fmt == '.view':
                            thumb_url = image_url + '?thumb'
                            thumb_response = await self.page.goto(thumb_url, timeout=10000)
                            if thumb_response.status == 200:
                                images.append({
                                    'url': thumb_url,
                                    'type': 'thumbnail',
                                    'content_type': thumb_response.headers.get('content-type', '')
                                })
                        
            except:
                continue
        
        return images
    
    def display_part_details(self, part_details):
        """Display comprehensive part details"""
        print("\n" + "="*80)
        print("📦 PART DETAILS")
        print("="*80)
        
        # Basic info
        part_number = part_details.get('part_number', part_details.get('productCode', 'Unknown'))
        print(f"🔧 Part Number: {part_number}")
        
        if 'title' in part_details:
            print(f"📄 Title: {part_details['title']}")
            
        if 'description' in part_details:
            print(f"📝 Description: {part_details['description']}")
            
        if 'price' in part_details or 'price_text' in part_details:
            price = part_details.get('price_text', f"${part_details.get('price', 'N/A')}")
            print(f"💰 Price: {price}")
            
        if 'availability' in part_details:
            print(f"📦 Availability: {part_details['availability']}")
            
        if 'url' in part_details:
            print(f"🌐 Product Page: {part_details['url']}")
        
        # Specifications
        if 'specifications' in part_details and part_details['specifications']:
            print(f"\n📋 Specifications:")
            for key, value in part_details['specifications'].items():
                print(f"   • {key}: {value}")
        
        # Compatibility
        if 'compatibility' in part_details:
            print(f"\n🔗 Compatibility: {part_details['compatibility']}")
        
        # Images from product page
        if 'images' in part_details and part_details['images']:
            print(f"\n🖼️  Product Images:")
            for i, img_url in enumerate(part_details['images'][:5], 1):  # Limit to 5
                print(f"   {i}. {img_url}")
        
        # Sirv CDN Images
        if 'sirv_images' in part_details and part_details['sirv_images']:
            print(f"\n🖼️  CDN Images:")
            for img in part_details['sirv_images']:
                print(f"   📸 {img['type']}: {img['url']}")
                print(f"      Content-Type: {img['content_type']}")
        
        # Additional data from APIs
        if 'api_data' in part_details and part_details['api_data']:
            print(f"\n📡 API Data Sources:")
            for api in part_details['api_data']:
                print(f"   • {api['url']}")
        
        # Structured data
        if 'structured_data' in part_details:
            sd = part_details['structured_data']
            print(f"\n📊 Structured Data:")
            if 'name' in sd:
                print(f"   • Product Name: {sd['name']}")
            if 'brand' in sd:
                print(f"   • Brand: {sd['brand']}")
            if 'offers' in sd and 'price' in sd['offers']:
                print(f"   • Listed Price: {sd['offers']['price']}")
        
        print("\n" + "="*80)
    
    def display_numbered_list(self, items, key_func, desc_func=None, max_items=50):
        """Display a numbered list of items"""
        if not items:
            print("❌ No items found")
            return None
            
        # Limit display for large lists
        display_items = items[:max_items]
        if len(items) > max_items:
            print(f"📋 Showing first {max_items} of {len(items)} items:")
        
        for i, item in enumerate(display_items, 1):
            key = key_func(item)
            desc = desc_func(item) if desc_func else ""
            print(f"{i:3d}. {key} {desc}")
        
        if len(items) > max_items:
            print(f"     ... and {len(items) - max_items} more")
        
        return display_items
    
    def get_user_choice(self, max_choice, allow_back=True):
        """Get user's menu choice"""
        while True:
            try:
                choice_text = input(f"\n👉 Enter choice (1-{max_choice}" + (", 'b' for back" if allow_back else "") + ", 'q' to quit): ").strip().lower()
                
                if choice_text == 'q':
                    return 'quit'
                elif choice_text == 'b' and allow_back:
                    return 'back'
                
                choice = int(choice_text)
                if 1 <= choice <= max_choice:
                    return choice - 1  # Convert to 0-based index
                else:
                    print(f"❌ Please enter a number between 1 and {max_choice}")
            except ValueError:
                print("❌ Please enter a valid number")
    
    async def run_interactive_session(self):
        """Main interactive session"""
        try:
            await self.setup_browser()
            
            while True:
                # Step 1: Select Manufacturer
                print("\n" + "="*60)
                print("🏭 MANUFACTURERS")
                print("="*60)
                
                manufacturers = await self.get_manufacturers()
                if not manufacturers:
                    print("❌ Could not fetch manufacturers")
                    break
                
                displayed_manufacturers = self.display_numbered_list(
                    manufacturers,
                    key_func=lambda x: x['name'],
                    desc_func=lambda x: f"({x['model_count']} models)",
                    max_items=30
                )
                
                choice = self.get_user_choice(len(displayed_manufacturers), allow_back=False)
                if choice == 'quit':
                    break
                
                selected_manufacturer = displayed_manufacturers[choice]
                print(f"\n✅ Selected: {selected_manufacturer['name']}")
                
                while True:
                    # Step 2: Select Model
                    print("\n" + "="*60)
                    print(f"🔧 MODELS FOR {selected_manufacturer['name'].upper()}")
                    print("="*60)
                    
                    models = await self.get_models_for_manufacturer(
                        selected_manufacturer['uri'], 
                        selected_manufacturer['code']
                    )
                    
                    if not models:
                        print("❌ Could not fetch models for this manufacturer")
                        break
                    
                    displayed_models = self.display_numbered_list(
                        models,
                        key_func=lambda x: x.get('name', x.get('code', 'Unknown')),
                        desc_func=lambda x: f"- {x.get('description', '')[:50]}..." if x.get('description') else "",
                        max_items=25
                    )
                    
                    choice = self.get_user_choice(len(displayed_models))
                    if choice == 'quit':
                        return
                    elif choice == 'back':
                        break
                    
                    selected_model = displayed_models[choice]
                    model_name = selected_model.get('name', selected_model.get('code', 'Unknown'))
                    print(f"\n✅ Selected: {model_name}")
                    
                    # Show manuals if available
                    if 'manuals' in selected_model and len(selected_model['manuals']) > 0:
                        print(f"\n📚 Available Manuals:")
                        for manual in selected_model['manuals']:
                            manual_url = f"{self.base_url}{manual['link']}"
                            print(f"   • {manual['type']}: {manual_url}")
                    else:
                        print(f"\n📚 No manuals available for this model")
                    
                    while True:
                        # Step 3: Get Parts
                        print("\n" + "="*60)
                        print(f"🔩 PARTS FOR {model_name.upper()}")
                        print("="*60)
                        
                        parts = await self.get_parts_for_model(selected_model, selected_manufacturer['uri'])
                        
                        if not parts:
                            print("❌ Could not fetch parts for this model")
                            break
                        
                        # Clean up and deduplicate parts
                        unique_parts = {}
                        for part in parts:
                            if isinstance(part, dict):
                                part_num = part.get('part_number', part.get('partNumber', part.get('code')))
                                if part_num and part_num not in unique_parts:
                                    unique_parts[part_num] = part
                        
                        parts_list = list(unique_parts.values())
                        
                        displayed_parts = self.display_numbered_list(
                            parts_list,
                            key_func=lambda x: x.get('part_number', x.get('partNumber', x.get('code', 'Unknown'))),
                            desc_func=lambda x: f"- {x.get('description', x.get('element_text', ''))[:40]}...",
                            max_items=20
                        )
                        
                        choice = self.get_user_choice(len(displayed_parts))
                        if choice == 'quit':
                            return
                        elif choice == 'back':
                            break
                        
                        selected_part = displayed_parts[choice]
                        
                        # Step 4: Get Comprehensive Part Details
                        part_details = await self.get_part_details(
                            selected_part, 
                            selected_manufacturer['uri'], 
                            selected_manufacturer['code']
                        )
                        
                        if part_details:
                            self.display_part_details(part_details)
                        else:
                            print("❌ Could not fetch detailed part information")
                        
                        # Ask if user wants to continue with parts or go back
                        continue_choice = input("\n👉 Press Enter to select another part, 'b' for back to models, 'q' to quit: ").strip().lower()
                        if continue_choice == 'q':
                            return
                        elif continue_choice == 'b':
                            break
                        # Otherwise continue with parts selection
                
        except KeyboardInterrupt:
            print("\n\n👋 Goodbye!")
        except Exception as e:
            print(f"\n❌ Error: {e}")
        finally:
            if self.browser:
                await self.browser.close()

async def main():
    """Main entry point"""
    print("🚀 PartsTown Interactive Explorer")
    print("=" * 60)
    print("Navigate: Manufacturers → Models → Parts → Images")
    print("Commands: Enter number to select, 'b' for back, 'q' to quit")
    print("=" * 60)
    
    explorer = PartsTownExplorer()
    await explorer.run_interactive_session()

if __name__ == "__main__":
    asyncio.run(main())