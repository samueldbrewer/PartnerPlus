import requests
import json
import sys
import re
from urllib.parse import urlparse

def validate_url(url):
    """Basic URL validation function for testing"""
    if not url:
        return False
        
    try:
        parsed = urlparse(url)
        return bool(parsed.scheme and parsed.netloc)
    except Exception:
        return False

def validate_youtube_url(url):
    """Validate YouTube URLs"""
    if not url:
        return False
        
    youtube_patterns = [
        r'^https?://(?:www\.)?youtube\.com/watch\?v=([a-zA-Z0-9_-]{11})',
        r'^https?://(?:www\.)?youtu\.be/([a-zA-Z0-9_-]{11})'
    ]
    
    for pattern in youtube_patterns:
        if re.match(pattern, url):
            return True
    
    return False

def check_no_example_urls(urls):
    """Check that no URLs contain 'example' string"""
    for url in urls:
        if 'example' in url:
            return False
    return True

def test_enrichment_api():
    url = "http://localhost:5000/api/enrichment"
    headers = {"Content-Type": "application/json"}
    payload = {
        "make": "Toyota",
        "model": "Camry",
        "year": "2023"
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()  # Raises an exception for 4XX/5XX responses
        data = response.json()
        
        # Pretty print the first image, video, and article with all their fields
        print("API Response Structure:")
        print(json.dumps(data.keys(), indent=2))
        
        if "data" in data:
            # First check if we're getting any results
            images = data["data"].get("images", [])
            videos = data["data"].get("videos", [])
            articles = data["data"].get("articles", [])
            
            print(f"\nFound {len(images)} images, {len(videos)} videos, {len(articles)} articles")
            
            # Validate URLs
            video_urls = [v.get("url", "") for v in videos]
            article_urls = [a.get("url", "") for a in articles]
            image_urls = [i.get("url", "") for i in images]
            
            # Check for valid URLs
            valid_video_urls = all(validate_url(url) for url in video_urls if url)
            valid_article_urls = all(validate_url(url) for url in article_urls if url)
            valid_image_urls = all(validate_url(url) for url in image_urls if url)
            
            # Check no example URLs
            no_example_in_videos = check_no_example_urls(video_urls)
            no_example_in_articles = check_no_example_urls(article_urls)
            no_example_in_images = check_no_example_urls(image_urls)
            
            # Check YouTube URLs format
            youtube_urls = [url for url in video_urls if "youtube" in url or "youtu.be" in url]
            valid_youtube_format = all(validate_youtube_url(url) for url in youtube_urls)
            
            # Check article URLs have paths (not just domain roots)
            article_have_paths = all(urlparse(url).path and urlparse(url).path != '/' 
                                    for url in article_urls if url)
                                    
            # Check for image sources
            images_with_sources = sum(1 for img in images if img.get("source_url") or img.get("source_name"))
            image_source_percentage = (images_with_sources / len(images) * 100) if images else 0
            
            # Check for article sources
            articles_with_sources = sum(1 for art in articles if art.get("source") or art.get("source_url"))
            article_source_percentage = (articles_with_sources / len(articles) * 100) if articles else 0
            
            # Print validation results
            print("\nURL Validation Results:")
            print(f"Valid video URLs: {'✅' if valid_video_urls else '❌'}")
            print(f"Valid article URLs: {'✅' if valid_article_urls else '❌'}")
            print(f"Valid image URLs: {'✅' if valid_image_urls else '❌'}")
            print(f"No example URLs in videos: {'✅' if no_example_in_videos else '❌'}")
            print(f"No example URLs in articles: {'✅' if no_example_in_articles else '❌'}")
            print(f"No example URLs in images: {'✅' if no_example_in_images else '❌'}")
            print(f"Valid YouTube URL format: {'✅' if valid_youtube_format else '❌'}")
            print(f"Article URLs have proper paths: {'✅' if article_have_paths else '❌'}")
            print(f"Image sources: {images_with_sources}/{len(images)} ({image_source_percentage:.1f}% have sources)")
            print(f"Article sources: {articles_with_sources}/{len(articles)} ({article_source_percentage:.1f}% have sources)")
            
            # Print image sources for examination
            print("\nImage Source Information:")
            for i, img in enumerate(images[:5]):  # Show first 5 images
                print(f"Image {i+1}:")
                print(f"  Source URL: {img.get('source_url', 'None')}")
                print(f"  Source Name: {img.get('source_name', 'None')}")
                print()
                
            # Print article sources for examination
            print("\nArticle Source Information:")
            for i, art in enumerate(articles[:5]):  # Show first 5 articles
                print(f"Article {i+1}:")
                print(f"  Title: {art.get('title', 'None')[:50]}...")
                print(f"  URL: {art.get('url', 'None')}")
                print(f"  Source: {art.get('source', 'None')}")
                print(f"  Source URL: {art.get('source_url', 'None')}")
                print()
            
            # Display first image
            if images:
                print("\nFirst Image Data:")
                first_image = images[0]
                print(json.dumps(first_image, indent=2))
            
            # Display first video
            if videos:
                print("\nFirst Video Data:")
                first_video = videos[0]
                print(json.dumps(first_video, indent=2))
            
            # Display first article
            if articles:
                print("\nFirst Article Data:")
                first_article = articles[0]
                print(json.dumps(first_article, indent=2))
        else:
            print("\nData field not found in response. Full response:")
            print(json.dumps(data, indent=2))
        
    except requests.exceptions.RequestException as e:
        print(f"Error making request: {e}")
        return None
    except json.JSONDecodeError:
        print("Error decoding JSON response")
        print("Raw response:", response.text)
        return None

if __name__ == "__main__":
    test_enrichment_api()