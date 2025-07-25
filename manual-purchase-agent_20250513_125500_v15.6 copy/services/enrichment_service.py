import os
import json
import logging
import requests
import re
import time
from urllib.parse import quote_plus, urlparse, urljoin
from config import Config
from services.manual_finder import SerpAPIClient
from requests.exceptions import RequestException, Timeout, ConnectionError

# Set up logging for troubleshooting
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize the SerpAPI client
serp_client = SerpAPIClient()

# Try to import new OpenAI client, fall back to legacy
try:
    from openai import OpenAI
    USING_NEW_OPENAI_CLIENT = True
except ImportError:
    import openai
    USING_NEW_OPENAI_CLIENT = False

class EnrichmentService:
    """Service for enriching vehicle and part data with multimedia content"""
    
    def __init__(self, api_key=None, model="gpt-4.1-nano"):
        """Initialize the enrichment service with GPT-4.1-Nano for comprehensive analysis"""
        self.openai_api_key = api_key or Config.OPENAI_API_KEY
        self.model = model
        self.serp_client = serp_client
        
        # Set up OpenAI API client
        if USING_NEW_OPENAI_CLIENT:
            self.client = OpenAI(api_key=self.openai_api_key)
        else:
            import openai
            openai.api_key = self.openai_api_key
            self.client = None
        
    def get_enrichment_data(self, make, model, year=None, part_number=None):
        """
        Get enriched data for a vehicle or part - OPTIMIZED for images only
        
        Args:
            make (str): The equipment manufacturer (e.g., "Antunes")
            model (str): The equipment model (e.g., "CC-19")
            year (str, optional): The equipment year (e.g., "2023")
            part_number (str, optional): OEM part number if applicable
            
        Returns:
            dict: Enriched data with images (videos and articles disabled for speed)
        """
        try:
            # Build the search query based on provided parameters
            if part_number:
                # If part number is provided, focus on that specific part
                base_query = f"{make} {model} {part_number}"
                subject = f"{part_number} for {make} {model}"
            else:
                # If no part number, focus on the equipment
                base_query = f"{make} {model}"
                subject = f"{make} {model}"
            
            # Search for more images initially, then AI will select the best ones
            image_results = self._search_images(base_query, limit=20)
            
            # Use AI to review and select the best images
            if image_results and len(image_results) > 1:
                selected_images = self._ai_select_best_images(image_results, make, model, part_number)
                image_results = selected_images
            
            # Return only images - skip videos and articles for performance
            combined_results = {
                "videos": [],  # Disabled for speed
                "articles": [],  # Disabled for speed  
                "images": image_results
            }
            
            return {
                "success": True,
                "subject": subject,
                "query": base_query,
                "data": combined_results  # Changed from 'results' to 'data' to match API usage
            }
            
        except Exception as e:
            logger.error(f"Error fetching enrichment data: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def _search_videos(self, query, limit=10):
        """Search for videos related to the query"""
        try:
            # Construct video-specific search query
            video_query = f"{query} video review tutorial"
            
            # Search using Google Videos via SerpAPI
            results = self.serp_client.search({
                "engine": "google_videos",
                "q": video_query,
                "num": limit,
                "gl": "us",     # Search in the US
                "hl": "en"      # English language
            })
            
            # Extract and format video results
            videos = []
            if "video_results" in results:
                for video in results["video_results"][:limit]:
                    # Get and validate the video URL
                    video_url = video.get("link", "")
                    valid_url = self._validate_url(video_url, "video")
                    
                    # Skip videos with invalid URLs
                    if not valid_url:
                        continue
                    
                    # Validate the thumbnail URL
                    thumbnail_url = video.get("thumbnail", "")
                    valid_thumbnail = self._validate_url(thumbnail_url, "image") if thumbnail_url else ""
                    
                    # Validate the source
                    source = video.get("source", "")
                    valid_source = self._validate_source_url(source) if source else ""
                    
                    videos.append({
                        "title": video.get("title", "Untitled Video"),
                        "url": valid_url,
                        "thumbnail": valid_thumbnail or "",
                        "source": valid_source or "",
                        "duration": video.get("duration", ""),
                        "description": video.get("snippet", "")
                    })
            
            return videos
        
        except Exception as e:
            logger.error(f"Error searching videos: {e}")
            return []
    
    def _search_articles(self, query, limit=10):
        """Search for articles related to the query"""
        try:
            # Try a direct news search first
            news_results = self._search_news_articles(query, limit)
            
            # If we got enough results, return them
            if len(news_results) >= limit/2:
                return news_results
                
            # Otherwise, fall back to regular search with news filter
            # Construct article-specific search query
            article_query = f"{query} review guide article"
            
            # Search using Google with News filter via SerpAPI
            results = self.serp_client.search({
                "engine": "google",
                "q": article_query,
                "num": limit,
                "gl": "us",     # Search in the US
                "hl": "en",     # English language
                "tbm": "nws"    # News search
            })
            
            # Extract and format article results
            articles = []
            
            # Process organic results
            if "organic_results" in results:
                for article in results["organic_results"][:limit]:
                    # Get and validate the article URL
                    article_url = article.get("link", "")
                    
                    # For non-major sites, verify accessibility - note the extra parameter flag
                    valid_url = self._validate_url(article_url, "article", verify_accessibility=True)
                    
                    # Skip articles with invalid URLs
                    if not valid_url:
                        continue
                    
                    # Extract source information
                    source_name = ""
                    source_url = ""
                    
                    # Try to get source from the source field
                    source = article.get("source", "")
                    if source:
                        source_name = source
                        
                        # Try to construct a source URL if not provided
                        if not source_url and source_name:
                            # Check if source_name looks like a domain
                            if '.' in source_name and ' ' not in source_name:
                                source_url = f"https://{source_name}"
                            else:
                                # Try to convert name to domain
                                domain_guess = source_name.lower().replace(" ", "").replace("'", "") + ".com"
                                source_url = f"https://www.{domain_guess}"
                    
                    # Validate source URL
                    valid_source_url = self._validate_source_url(source_url) if source_url else ""
                    
                    # Create the article entry
                    articles.append({
                        "title": article.get("title", "Untitled Article"),
                        "url": valid_url,
                        "source": source_name,
                        "source_url": valid_source_url or "", 
                        "date": article.get("date", ""),
                        "description": article.get("snippet", "")
                    })
            
            # Combine with news results, avoiding duplicates
            seen_urls = set(article["url"] for article in articles)
            for article in news_results:
                if article["url"] not in seen_urls:
                    articles.append(article)
                    seen_urls.add(article["url"])
                    
            # Limit to requested number
            return articles[:limit]
        
        except Exception as e:
            logger.error(f"Error searching articles: {e}")
            return []
            
    def _search_news_articles(self, query, limit=10):
        """Search for articles using Google News API"""
        try:
            # Construct news-specific search query
            news_query = f"{query} news"
            
            # Search using Google News via SerpAPI
            results = self.serp_client.search({
                "engine": "google_news",
                "q": news_query,
                "num": limit,
                "gl": "us",     # Search in the US
                "hl": "en"      # English language
            })
            
            # Extract and format article results
            articles = []
            
            # Process news results
            if "news_results" in results:
                for article in results["news_results"][:limit]:
                    # Get and validate the article URL
                    article_url = article.get("link", "")
                    
                    # For news results, verify accessibility for URLs that aren't from well-known sites
                    parsed = urlparse(article_url)
                    trusted_domains = ['nytimes.com', 'washingtonpost.com', 'bbc.com', 'cnn.com', 
                                     'bloomberg.com', 'wsj.com', 'reuters.com', 'apnews.com',
                                     'theguardian.com', 'ft.com', 'economist.com', 'abc.net.au',
                                     'aljazeera.com', 'npr.org']
                    
                    verify_needed = not any(domain in parsed.netloc for domain in trusted_domains)
                    
                    # Validate the URL, with accessibility check for non-trusted domains
                    valid_url = self._validate_url(article_url, "article", verify_accessibility=verify_needed)
                    
                    # Skip articles with invalid URLs
                    if not valid_url:
                        continue
                    
                    # Extract source information
                    source_name = article.get("source", "")
                    source_url = ""
                    favicon = article.get("favicon", "")
                    
                    # If we have a favicon, extract the domain as potential source URL
                    if favicon:
                        try:
                            parsed_favicon = urlparse(favicon)
                            domain = parsed_favicon.netloc
                            source_url = f"https://{domain}"
                        except Exception:
                            pass
                    
                    # If no source URL yet but we have a source name
                    if not source_url and source_name:
                        # Check if source_name looks like a domain
                        if '.' in source_name and ' ' not in source_name:
                            source_url = f"https://{source_name}"
                        else:
                            # Try to convert name to domain
                            domain_guess = source_name.lower().replace(" ", "").replace("'", "") + ".com"
                            source_url = f"https://www.{domain_guess}"
                    
                    # Validate source URL
                    valid_source_url = self._validate_source_url(source_url) if source_url else ""
                    
                    # Create the article entry with enhanced metadata
                    articles.append({
                        "title": article.get("title", "Untitled Article"),
                        "url": valid_url,
                        "source": source_name,
                        "source_url": valid_source_url or "",
                        "favicon": favicon or "",
                        "date": article.get("date", ""),
                        "description": article.get("snippet", "")
                    })
            
            logger.info(f"Found {len(articles)} articles via Google News API")
            return articles
        
        except Exception as e:
            logger.error(f"Error searching news articles: {e}")
            return []
    
    def _search_images(self, query, limit=12):
        """Search for images related to the query - OPTIMIZED FOR SPEED"""
        try:
            # Keep the original query for better results
            image_query = query
            
            logger.info(f"Searching for images with query: {image_query}")
            
            # Search using Google Images via SerpAPI with speed-optimized parameters
            results = self.serp_client.search({
                "engine": "google_images",
                "q": image_query,
                "num": limit,
                "gl": "us",     # Search in the US
                "hl": "en",     # English language
                "ijn": "0",     # First page of results
                "safe": "off",  # Get all relevant results
                "nfpr": "1"     # No face detection for speed
            })
            
            logger.info(f"SerpAPI response keys: {list(results.keys())}")
            
            # Extract and format image results - SPEED OPTIMIZED
            images = []
            if "images_results" in results:
                logger.info(f"SerpAPI returned {len(results['images_results'])} images")
                for image in results["images_results"][:limit]:
                    # Get the image URL with minimal validation for speed
                    image_url = image.get("original", image.get("thumbnail", ""))
                    
                    # Basic URL check only - skip extensive validation for speed
                    if not image_url or not image_url.startswith(('http://', 'https://')):
                        continue
                    
                    # Get source information without validation for speed
                    link = image.get("link", "")
                    source = image.get("source", "")
                    
                    # Get image title
                    title = image.get("title", "Equipment Image")
                    if title == "Equipment Image" and source:
                        title = f"Image from {source}"
                    
                    # Create the image entry with minimal processing for speed
                    image_entry = {
                        "title": title,
                        "url": image_url,
                        "source_url": link,
                        "source_name": source,
                        "width": image.get("original_width", 0),
                        "height": image.get("original_height", 0),
                        "description": image.get("snippet", "")
                    }
                    
                    images.append(image_entry)
            
            logger.info(f"Returning {len(images)} images from SerpAPI")
            if images:
                logger.info(f"First image URL: {images[0].get('url', 'NO URL')}")
            return images
        
        except Exception as e:
            logger.error(f"Error searching images: {e}")
            return []
    
    def _ai_select_best_images(self, image_results, make, model, part_number=None):
        """Use AI to analyze image URLs and select the most relevant ones"""
        try:
            if not image_results or len(image_results) <= 3:
                # If we have few images, return them all
                return image_results
            
            # Prepare context based on search mode
            if part_number:
                context = f"Part search: {part_number} for {make} {model}"
                search_context = f"We are looking for images of the specific part '{part_number}' that fits {make} {model} equipment."
            else:
                context = f"Equipment search: {make} {model}"
                search_context = f"We are looking for images of {make} {model} equipment."
            
            # Build list of URLs with metadata for AI analysis
            url_data = []
            for i, image in enumerate(image_results):
                url_entry = {
                    "index": i,
                    "url": image.get("url", ""),
                    "title": image.get("title", ""),
                    "source_name": image.get("source_name", ""),
                    "source_url": image.get("source_url", ""),
                    "description": image.get("description", "")
                }
                url_data.append(url_entry)
            
            # Create prompt for AI analysis
            prompt = f"""Analyze these image URLs to select the most relevant ones for: {context}

{search_context}

Here are the image URLs with their metadata:
{json.dumps(url_data, indent=2)}

Please analyze the URLs, titles, source names, and descriptions to determine which images are most likely to show what we're looking for. Consider:

1. URL structure and file names that indicate relevance
2. Source credibility (manufacturer sites, parts suppliers, etc.)
3. Title and description relevance
4. Avoid generic stock photos or unrelated equipment

Return your response as a JSON object with this structure:
{{
    "selected_indices": [list of indices of the best 6-8 images, ordered by relevance],
    "reasoning": "Brief explanation of selection criteria"
}}

Focus on URLs that clearly indicate they show the specific {"part" if part_number else "equipment"} we're looking for."""
            
            # Call OpenAI API with GPT-4.1-Nano for enhanced analysis
            if USING_NEW_OPENAI_CLIENT:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": "You are an expert at analyzing image URLs to determine relevance for equipment and parts searches. Using GPT-4.1-Nano for precise analysis. Return only valid JSON."},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.1,  # Low temperature for consistent analysis
                    max_tokens=32768  # GPT-4.1-Nano max completion tokens
                )
            else:
                import openai
                response = openai.ChatCompletion.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": "You are an expert at analyzing image URLs to determine relevance for equipment and parts searches. Using GPT-4.1-Nano for precise analysis. Return only valid JSON."},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.1,  # Low temperature for consistent analysis
                    max_tokens=32768  # GPT-4.1-Nano max completion tokens
                )
            
            # Parse AI response
            if USING_NEW_OPENAI_CLIENT:
                ai_response = response.choices[0].message.content.strip()
            else:
                ai_response = response.choices[0].message['content'].strip()
            logger.debug(f"AI image selection response: {ai_response}")
            
            # Extract JSON from response
            try:
                # Find JSON in response
                json_start = ai_response.find('{')
                json_end = ai_response.rfind('}') + 1
                
                if json_start >= 0 and json_end > json_start:
                    json_data = ai_response[json_start:json_end]
                    selection_result = json.loads(json_data)
                    
                    selected_indices = selection_result.get("selected_indices", [])
                    reasoning = selection_result.get("reasoning", "")
                    
                    # Validate indices and select images
                    valid_indices = [i for i in selected_indices if 0 <= i < len(image_results)]
                    
                    if valid_indices:
                        selected_images = [image_results[i] for i in valid_indices]
                        logger.info(f"AI selected {len(selected_images)} images from {len(image_results)} total. Reasoning: {reasoning}")
                        return selected_images
                    else:
                        logger.warning("AI returned no valid indices, returning original images")
                        return image_results[:8]  # Return first 8 as fallback
                else:
                    logger.warning("No JSON found in AI response, returning original images")
                    return image_results[:8]
                    
            except json.JSONDecodeError as e:
                logger.error(f"Error parsing AI image selection response: {e}")
                return image_results[:8]  # Return first 8 as fallback
                
        except Exception as e:
            logger.error(f"Error in AI image selection: {e}")
            return image_results[:8]  # Return first 8 as fallback
    
    def _enhance_with_ai(self, make, model, year, part_number, videos, articles, images):
        """Use OpenAI to enhance search results with additional context"""
        try:
            # Prepare search parameters
            subject = f"{make} {model}"
            if year:
                subject += f" {year}"
            if part_number:
                subject += f" part #{part_number}"
            
            # Build a prompt with information about what we're looking for
            prompt = f"""You are helping find and curate high-quality multimedia content for {subject}. 
I'll provide some information about the vehicle/part and initial search results. 
Your task is to:

1. Search for additional relevant videos, articles and images about {subject}.
2. For each resource, provide a brief but informative description explaining what information it contains.
3. Focus on content that would be most helpful for someone working with this vehicle or part.
4. Return results in a structured JSON format with separate sections for videos, articles, and images.
5. For each item, include title, url, description, and source where applicable.

Additional details:
- Make: {make}
- Model: {model}
- Year: {year if year else 'Not specified'}
- Part Number: {part_number if part_number else 'Not specified'}

Ignore any irrelevant, low-quality, or duplicate content. Focus on technical information, reviews, tutorials, and high-quality images.

Ensure your response is complete JSON that can be parsed programmatically with three arrays: videos, articles, and images.
"""            
            # Call the OpenAI API with web search enabled
            response = self._call_openai_with_websearch(prompt)
            
            # Parse and return the AI-generated results
            return self._parse_ai_response(response)
        
        except Exception as e:
            logger.error(f"Error enhancing results with AI: {e}")
            return {"videos": [], "articles": [], "images": []}
    
    def _call_openai_with_websearch(self, prompt):
        """Call OpenAI API with web search preview for enrichment"""
        try:
            logger.debug("generate_extraction_response prompt: %s", prompt)
            
            # Create the OpenAI completion using GPT-4.1-Nano
            if USING_NEW_OPENAI_CLIENT:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": "You are a helpful assistant that provides information about vehicles and parts. Using GPT-4.1-Nano for comprehensive analysis. Return your response as JSON with videos, articles, and images arrays."},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.1,  # Lower temperature for more precise analysis
                    max_tokens=32768  # GPT-4.1-Nano max completion tokens
                )
            else:
                import openai
                response = openai.ChatCompletion.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": "You are a helpful assistant that provides information about vehicles and parts. Using GPT-4.1-Nano for comprehensive analysis. Return your response as JSON with videos, articles, and images arrays."},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.1,  # Lower temperature for more precise analysis
                    max_tokens=32768  # GPT-4.1-Nano max completion tokens
                )
            
            # Extract the response text
            if USING_NEW_OPENAI_CLIENT:
                raw = response.choices[0].message.content.strip()
            else:
                raw = response.choices[0].message['content'].strip()
            logger.debug("generate_extraction_response raw: %s", raw)
            
            # Generate a valid JSON structure even if OpenAI fails
            try:
                json_data = json.loads(raw)
                return raw
            except json.JSONDecodeError:
                logger.warning("Could not parse OpenAI response as JSON, returning empty structure")
                return '{}'
                
        except Exception as e:
            logger.error(f"Error calling OpenAI API: {e}")
            return "{}"
    
    def _parse_ai_response(self, response_text):
        """Parse the AI response to extract structured data"""
        try:
            # Try to extract JSON from the response
            json_start = response_text.find('{')
            json_end = response_text.rfind('}') + 1
            
            if json_start >= 0 and json_end > json_start:
                json_data = response_text[json_start:json_end]
                results = json.loads(json_data)
                
                # Ensure we have the expected structure
                if not isinstance(results, dict):
                    results = {}
                
                # Ensure videos, articles, and images lists exist
                if "videos" not in results:
                    results["videos"] = []
                if "articles" not in results:
                    results["articles"] = []
                if "images" not in results:
                    results["images"] = []
                    
                # Validate URLs in the AI results
                self._validate_ai_urls(results)
                
                return results
            else:
                logger.warning("No JSON found in AI response")
                return {"videos": [], "articles": [], "images": []}
                
        except json.JSONDecodeError as e:
            logger.error(f"Error parsing AI response as JSON: {e}, response: {response_text[:200]}...")
            return {"videos": [], "articles": [], "images": []}
        
        except Exception as e:
            logger.error(f"Error processing AI response: {e}")
            return {"videos": [], "articles": [], "images": []}
            
    def _validate_ai_urls(self, results):
        """Validate URLs in AI-generated results"""
        
        # Validate video URLs
        validated_videos = []
        for video in results.get("videos", []):
            if "url" in video and video["url"]:
                valid_url = self._validate_url(video["url"], "video")
                if valid_url:
                    video["url"] = valid_url
                    # Validate source if present
                    if "source" in video and video["source"]:
                        video["source"] = self._validate_source_url(video["source"]) or ""
                    validated_videos.append(video)
                    
        results["videos"] = validated_videos
        
        # Validate article URLs
        validated_articles = []
        for article in results.get("articles", []):
            if "url" in article and article["url"]:
                valid_url = self._validate_url(article["url"], "article")
                if valid_url:
                    article["url"] = valid_url
                    # Validate source if present
                    if "source" in article and article["source"]:
                        article["source"] = self._validate_source_url(article["source"]) or ""
                    validated_articles.append(article)
                    
        results["articles"] = validated_articles
        
        # Validate image URLs
        validated_images = []
        for image in results.get("images", []):
            if "url" in image and image["url"]:
                valid_url = self._validate_url(image["url"], "image")
                if valid_url:
                    image["url"] = valid_url
                    
                    # Validate source URL if present
                    if "source_url" in image and image["source_url"]:
                        image["source_url"] = self._validate_source_url(image["source_url"]) or ""
                    
                    # If source_name is present but source_url is not, try to generate a valid source URL
                    if (not image.get("source_url") or image["source_url"] == "") and "source_name" in image and image["source_name"]:
                        source_name = image["source_name"]
                        if source_name and " " in source_name:  # If it's a meaningful name, not just a domain
                            # Try to generate a domain from the source name
                            domain_guess = source_name.lower().replace(" ", "").replace("'", "") + ".com"
                            image["source_url"] = f"https://www.{domain_guess}"
                    
                    # Ensure we at least have a source name
                    if (not image.get("source_name") or image["source_name"] == "") and image.get("source_url"):
                        try:
                            # Extract domain name from source URL
                            parsed = urlparse(image["source_url"])
                            domain = parsed.netloc
                            if domain.startswith("www."):
                                domain = domain[4:]
                            image["source_name"] = domain.split(".")[0].capitalize()
                        except Exception:
                            pass
                    
                    validated_images.append(image)
                    
        results["images"] = validated_images
    
    def _verify_url_accessibility(self, url, timeout=2):
        """Verify if a URL is accessible by making a HEAD request
        
        Args:
            url (str): The URL to verify
            timeout (int): Timeout in seconds
            
        Returns:
            bool: True if URL is accessible, False otherwise
        """
        try:
            # Try a HEAD request first (faster, doesn't download content)
            response = requests.head(url, timeout=timeout, allow_redirects=True)
            
            # If we get a successful status code (2xx), the URL is valid
            if 200 <= response.status_code < 300:
                return True
                
            # Some servers don't support HEAD requests, so if we get 4xx/5xx, try GET
            if 400 <= response.status_code < 600:
                # Try with a GET request but only retrieve headers
                response = requests.get(url, timeout=timeout, stream=True, headers={"Range": "bytes=0-0"})
                response.close()  # Close the connection to avoid downloading content
                return 200 <= response.status_code < 300
                
            return False
        except (RequestException, ConnectionError, Timeout):
            return False
            
    def _is_landing_page(self, url):
        """Check if URL appears to be a generic landing page"""
        parsed = urlparse(url)
        
        # Check if the URL ends with common landing page patterns
        if parsed.path.rstrip('/') in ['', '/index', '/home', '/welcome', '/lander']:
            return True
            
        # Check for URLs with suspicious patterns like 'lander' in them
        if 'lander' in parsed.path.lower():
            return True
            
        # If no substantial path segments, likely a landing page
        path_segments = [s for s in parsed.path.split('/') if s]
        if len(path_segments) <= 1:
            return True
            
        return False
    
    def _validate_url(self, url, url_type=None, verify_accessibility=False):
        """Validate and normalize URLs
        
        Args:
            url (str): The URL to validate
            url_type (str, optional): Type of URL (video, article, image)
            verify_accessibility (bool): Whether to check if URL is accessible
            
        Returns:
            str or None: Validated URL or None if invalid
        """
        if not url:
            return None
            
        # Basic URL validation
        try:
            parsed = urlparse(url)
            if not parsed.scheme or not parsed.netloc:
                # Try fixing URLs without scheme
                if not parsed.scheme and parsed.path:
                    fixed_url = f"https://{url}"
                    parsed = urlparse(fixed_url)
                    if parsed.netloc:
                        url = fixed_url
                    else:
                        return None
                else:
                    return None
        except Exception:
            return None
            
        # Video-specific validation (primarily YouTube)
        if url_type == 'video':
            # Validate YouTube URLs
            youtube_patterns = [
                r'^https?://(?:www\.)?youtube\.com/watch\?v=([a-zA-Z0-9_-]{11})',
                r'^https?://(?:www\.)?youtu\.be/([a-zA-Z0-9_-]{11})'
            ]
            
            for pattern in youtube_patterns:
                match = re.match(pattern, url)
                if match:
                    video_id = match.group(1)
                    # Normalize to standard YouTube URL
                    return f"https://www.youtube.com/watch?v={video_id}"
                    
            # If not a YouTube URL, just return the original if it seems valid
            if parsed.netloc in ['vimeo.com', 'dailymotion.com', 'player.vimeo.com']:
                return url
                
            # Handle example URLs
            if "example" in url or url.endswith("/example1"):
                return None
            
        # Article URL validation
        elif url_type == 'article':
            # Block URLs that don't have full paths or seem like placeholders
            if parsed.path in ['', '/', '/index.html'] or 'example' in url:
                return None
                
            # Block known problematic domains and landing pages
            problematic_domains = [
                'cateringinsider.com',  # Dead links or landing pages
                'restaurantequipment.com',  # Generic landing pages
                'foodserviceequipmentjournal.com'  # Problematic links
            ]
            
            if any(domain in parsed.netloc.lower() for domain in problematic_domains):
                logger.warning(f"Blocked article from problematic domain: {url}")
                return None
                
            # Check if URL appears to be a landing page
            if self._is_landing_page(url):
                logger.warning(f"Blocked generic landing page: {url}")
                return None
                
            # Block tracking parameters for cleaner URLs
            query_params = parsed.query.split('&') if parsed.query else []
            filtered_params = []
            for param in query_params:
                # Keep only essential parameters, filter out trackers
                param_name = param.split('=')[0] if '=' in param else param
                if param_name.lower() not in ['utm_source', 'utm_medium', 'utm_campaign', 
                                           'utm_term', 'utm_content', 'fbclid', 
                                           'gclid', 'msclkid', 'ref', '_ga']:
                    filtered_params.append(param)
                    
            # Reconstruct URL without tracking parameters
            clean_query = '&'.join(filtered_params)
            clean_url = parsed._replace(query=clean_query).geturl()
            
            # Ensure major news domains have article paths
            news_domains = ['nytimes.com', 'washingtonpost.com', 'bbc.com', 'cnn.com', 
                           'bloomberg.com', 'wsj.com', 'reuters.com', 'apnews.com']
            if any(domain in parsed.netloc for domain in news_domains) and len(parsed.path.strip('/').split('/')) < 2:
                return None
                
            # For articles, we can optionally verify if the URL is accessible
            # Only do this for domains we're unsure about
            if verify_accessibility and not any(trusted in parsed.netloc for trusted in 
                ['nytimes.com', 'washingtonpost.com', 'bbc.com', 'cnn.com', 'wsj.com', 'bloomberg.com']):
                if not self._verify_url_accessibility(clean_url):
                    logger.warning(f"Article URL not accessible: {clean_url}")
                    return None
                    
            return clean_url
                
        # Image URL validation
        elif url_type == 'image':
            # Check for common image extensions
            if not any(url.lower().endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"]):
                # Try to see if it's a valid image URL anyway
                if not any(host in parsed.netloc for host in ['imgur.com', 'cloudinary.com', 'unsplash.com', 'flickr.com']):
                    # For safety, we could validate actual image URLs by making a HEAD request,
                    # but that would add latency. For now, just check the URL pattern
                    pass
        
        return url
        
    def _validate_source_url(self, url):
        """Validate source attribution URLs
        
        Args:
            url (str): The URL to validate
            
        Returns:
            str or None: Validated URL or None if invalid
        """
        if not url:
            return None
            
        # Basic URL validation
        try:
            parsed = urlparse(url)
            if not parsed.scheme or not parsed.netloc:
                # Try fixing URLs without scheme
                if not parsed.scheme and parsed.path:
                    url = f"https://{url}"
                    parsed = urlparse(url)
                    if not parsed.netloc:
                        return None
                else:
                    return None
        except Exception:
            return None
            
        # Block example domains or URLs without real paths
        if 'example' in url or parsed.path in ['', '/']:
            return None
            
        # Remove tracking parameters for cleaner URLs
        query_params = parsed.query.split('&') if parsed.query else []
        filtered_params = []
        for param in query_params:
            # Keep only essential parameters, filter out trackers
            param_name = param.split('=')[0] if '=' in param else param
            if param_name.lower() not in ['utm_source', 'utm_medium', 'utm_campaign', 
                                       'utm_term', 'utm_content', 'fbclid', 
                                       'gclid', 'msclkid', 'ref', '_ga']:
                filtered_params.append(param)
                
        # Reconstruct URL without tracking parameters
        clean_query = '&'.join(filtered_params)
        clean_url = parsed._replace(query=clean_query).geturl()
            
        return clean_url
    
    def _combine_results_prioritize_serp(self, ai_results, video_results, article_results, image_results):
        """Combine results but prioritize SerpAPI results over AI-generated ones"""
        combined = {
            "videos": [],
            "articles": [],
            "images": []
        }
        
        # For images, use ONLY SerpAPI results (AI generates fake URLs)
        logger.info(f"Combining results: {len(image_results)} SerpAPI images")
        combined["images"] = image_results[:15]  # Limit to 15 images
        logger.info(f"Final combined images: {len(combined['images'])}")
        
        # For videos, combine but prioritize SerpAPI
        video_urls = set()
        for video in video_results:
            if video["url"] and video["url"] not in video_urls:
                video_urls.add(video["url"])
                combined["videos"].append(video)
        
        # Add AI videos only if they have valid URLs not already in the list
        for video in ai_results.get("videos", []):
            if video.get("url") and video["url"] not in video_urls:
                # Check if URL looks real (not example.com or similar)
                if not any(fake in video["url"] for fake in ["example.com", "demo.com", "test.com"]):
                    video_urls.add(video["url"])
                    combined["videos"].append(video)
        
        # For articles, similar approach
        article_urls = set()
        for article in article_results:
            if article["url"] and article["url"] not in article_urls:
                article_urls.add(article["url"])
                combined["articles"].append(article)
        
        # Add AI articles only if they have valid URLs
        for article in ai_results.get("articles", []):
            if article.get("url") and article["url"] not in article_urls:
                if not any(fake in article["url"] for fake in ["example.com", "demo.com", "test.com"]):
                    article_urls.add(article["url"])
                    combined["articles"].append(article)
        
        return combined
    
    def _combine_results(self, ai_results, video_results, article_results, image_results):
        """Combine and deduplicate results from AI and direct search"""
        combined = {
            "videos": [],
            "articles": [],
            "images": []
        }
        
        # Process videos
        video_urls = set()
        # Add AI results first
        for video in ai_results.get("videos", []):
            if "url" in video and video["url"]:
                valid_url = self._validate_url(video["url"], "video")
                if valid_url and valid_url not in video_urls:
                    video_urls.add(valid_url)
                    video["url"] = valid_url
                    # Validate source if present
                    if "source" in video and video["source"]:
                        video["source"] = self._validate_source_url(video["source"]) or ""
                    combined["videos"].append(video)
        
        # Then add SerpAPI results
        for video in video_results:
            if video["url"]:
                valid_url = self._validate_url(video["url"], "video")
                if valid_url and valid_url not in video_urls:
                    video_urls.add(valid_url)
                    video["url"] = valid_url
                    # Validate source if present
                    if "source" in video and video["source"]:
                        video["source"] = self._validate_source_url(video["source"]) or ""
                    combined["videos"].append(video)
        
        # Process articles
        article_urls = set()
        # Add AI results first
        for article in ai_results.get("articles", []):
            if "url" in article and article["url"]:
                valid_url = self._validate_url(article["url"], "article")
                if valid_url and valid_url not in article_urls:
                    article_urls.add(valid_url)
                    article["url"] = valid_url
                    
                    # Make sure we have the standard fields
                    if "source" in article and article["source"]:
                        # Ensure we have a source_url field
                        if "source_url" not in article or not article["source_url"]:
                            # Try to generate a URL from the source name
                            source_name = article["source"]
                            # Check if source_name looks like a domain
                            if '.' in source_name and ' ' not in source_name:
                                article["source_url"] = f"https://{source_name}"
                            else:
                                # Try to convert name to domain
                                domain_guess = source_name.lower().replace(" ", "").replace("'", "") + ".com"
                                article["source_url"] = f"https://www.{domain_guess}"
                            
                            # Validate the URL
                            article["source_url"] = self._validate_source_url(article["source_url"]) or ""
                    elif "source_url" in article and article["source_url"]:
                        # We have a source URL but no source name, extract one from the URL
                        valid_source_url = self._validate_source_url(article["source_url"]) or ""
                        article["source_url"] = valid_source_url
                        
                        if valid_source_url and not article.get("source"):
                            try:
                                parsed = urlparse(valid_source_url)
                                domain = parsed.netloc
                                if domain.startswith("www."):
                                    domain = domain[4:]
                                article["source"] = domain.split(".")[0].capitalize()
                            except Exception:
                                pass
                    
                    combined["articles"].append(article)
        
        # Then add SerpAPI results
        for article in article_results:
            if article["url"]:
                valid_url = self._validate_url(article["url"], "article")
                if valid_url and valid_url not in article_urls:
                    article_urls.add(valid_url)
                    article["url"] = valid_url
                    
                    # Validate and ensure we have source information
                    if "source" in article and article["source"]:
                        source_name = article["source"]
                        
                        # Ensure we have a source_url field
                        if "source_url" not in article or not article["source_url"]:
                            # Try to generate a URL from the source name
                            # Check if source_name looks like a domain
                            if '.' in source_name and ' ' not in source_name:
                                article["source_url"] = f"https://{source_name}"
                            else:
                                # Try to convert name to domain
                                domain_guess = source_name.lower().replace(" ", "").replace("'", "") + ".com"
                                article["source_url"] = f"https://www.{domain_guess}"
                                
                            # Validate the URL
                            article["source_url"] = self._validate_source_url(article["source_url"]) or ""
                    
                    # If we have a favicon, use it to help determine the source URL
                    if "favicon" in article and article["favicon"] and ("source_url" not in article or not article["source_url"]):
                        try:
                            parsed_favicon = urlparse(article["favicon"])
                            domain = parsed_favicon.netloc
                            article["source_url"] = f"https://{domain}"
                            article["source_url"] = self._validate_source_url(article["source_url"]) or ""
                        except Exception:
                            pass
                            
                    combined["articles"].append(article)
        
        # Process images
        image_urls = set()
        # Add AI results first
        for image in ai_results.get("images", []):
            if "url" in image and image["url"]:
                valid_url = self._validate_url(image["url"], "image")
                if valid_url and valid_url not in image_urls:
                    image_urls.add(valid_url)
                    image["url"] = valid_url
                    
                    # Validate source URL if present
                    if "source_url" in image and image["source_url"]:
                        image["source_url"] = self._validate_source_url(image["source_url"]) or ""
                    
                    # Ensure we have a source name too
                    if not image.get("source_name") and image.get("source_url"):
                        try:
                            # Extract domain name from source URL as fallback source name
                            parsed = urlparse(image["source_url"])
                            domain = parsed.netloc
                            if domain.startswith("www."):
                                domain = domain[4:]
                            image["source_name"] = domain.split(".")[0].capitalize()
                        except Exception:
                            pass
                    
                    combined["images"].append(image)
        
        # Then add SerpAPI results
        for image in image_results:
            if image["url"]:
                valid_url = self._validate_url(image["url"], "image")
                if valid_url and valid_url not in image_urls:
                    image_urls.add(valid_url)
                    image["url"] = valid_url
                    
                    # Validate source URL if present
                    if "source_url" in image and image["source_url"]:
                        image["source_url"] = self._validate_source_url(image["source_url"]) or ""
                    
                    # Fill source_url from link if available but source_url is empty
                    if (not image.get("source_url") or image["source_url"] == "") and image.get("link"):
                        link = image.get("link")
                        valid_link = self._validate_source_url(link)
                        if valid_link:
                            image["source_url"] = valid_link
                    
                    # For SerpAPI results, try to provide a source name if none exists
                    if not image.get("source_name") or image["source_name"] == "":
                        # Try to get source from source field
                        source = image.get("source", "")
                        if source:
                            image["source_name"] = source
                        # If still no source name but we have a source_url, extract domain
                        elif image.get("source_url"):
                            try:
                                parsed = urlparse(image["source_url"])
                                domain = parsed.netloc
                                if domain.startswith("www."):
                                    domain = domain[4:]
                                image["source_name"] = domain.split(".")[0].capitalize()
                            except Exception:
                                pass
                    
                    combined["images"].append(image)
        
        # Standardize article fields to match our expected format
        for article in combined["articles"]:
            # Make sure all articles have source and source_url fields
            if "source" not in article:
                article["source"] = ""
            if "source_url" not in article:
                article["source_url"] = ""
                
        # Limit final results
        combined["videos"] = combined["videos"][:10]
        combined["articles"] = combined["articles"][:10]
        combined["images"] = combined["images"][:15]
        
        # Log the number of results with source information
        videos_with_source = sum(1 for v in combined["videos"] if v.get("source", "") != "")
        articles_with_source = sum(1 for a in combined["articles"] if a.get("source", "") != "" or a.get("source_url", "") != "")
        images_with_source = sum(1 for i in combined["images"] if i.get("source_url", "") != "" or i.get("source_name", "") != "")
        
        logger.info(f"Combined results: {len(combined['videos'])} videos ({videos_with_source} with sources), "
                   f"{len(combined['articles'])} articles ({articles_with_source} with sources), "
                   f"{len(combined['images'])} images ({images_with_source} with sources)")
        
        return combined