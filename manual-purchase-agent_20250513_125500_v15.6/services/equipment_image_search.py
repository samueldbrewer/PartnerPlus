import json
import logging
import requests
import time
from config import Config

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize OpenAI client
try:
    from openai import OpenAI
    client = OpenAI(api_key=Config.OPENAI_API_KEY)
    USING_NEW_OPENAI_CLIENT = True
    logger.info("Using new OpenAI client (v1.0.0+)")
except ImportError:
    import openai
    openai.api_key = Config.OPENAI_API_KEY
    USING_NEW_OPENAI_CLIENT = False
    logger.info("Using legacy OpenAI client")

def search_equipment_images(make, model, num_results=20):
    """
    Search for equipment images using SerpAPI
    
    Args:
        make (str): Equipment make/brand
        model (str): Equipment model
        num_results (int): Number of image results to fetch
        
    Returns:
        dict: Image search results
    """
    logger.info(f"Searching for equipment images: {make} {model}")
    
    try:
        # Construct search query
        search_query = f"{make} {model} equipment machinery"
        
        # Search parameters for SerpAPI
        search_params = {
            "api_key": Config.SERPAPI_KEY,
            "engine": "google_images",
            "q": search_query,
            "num": num_results,
            "gl": "us",
            "hl": "en",
            "safe": "active"
        }
        
        # Make the request
        api_response = requests.get("https://serpapi.com/search", params=search_params, timeout=30)
        api_response.raise_for_status()
        results = api_response.json()
        
        # Extract image results
        image_results = []
        if "images_results" in results:
            for idx, result in enumerate(results.get("images_results", [])[:num_results]):
                image_results.append({
                    "position": idx + 1,
                    "title": result.get('title', ''),
                    "url": result.get('original', result.get('link', '')),
                    "thumbnail": result.get('thumbnail', ''),
                    "source": result.get('source', ''),
                    "source_url": result.get('link', ''),
                    "width": result.get('original_width', 0),
                    "height": result.get('original_height', 0)
                })
        
        logger.info(f"Found {len(image_results)} equipment images")
        
        return {
            "success": True,
            "query": search_query,
            "images": image_results,
            "total_results": len(image_results)
        }
        
    except Exception as e:
        logger.error(f"Error searching equipment images: {e}")
        return {
            "success": False,
            "error": str(e),
            "query": search_query if 'search_query' in locals() else "",
            "images": []
        }

def ai_select_best_equipment_image(make, model, image_results):
    """
    Use AI to select the best equipment image from search results
    
    Args:
        make (str): Equipment make
        model (str): Equipment model
        image_results (list): List of image search results
        
    Returns:
        dict: Selected best image with AI analysis
    """
    logger.info(f"AI selecting best equipment image for: {make} {model}")
    
    try:
        # Prepare image candidates for AI analysis
        candidates_summary = f"Equipment Image Candidates for {make} {model}:\n\n"
        for idx, img in enumerate(image_results):
            candidates_summary += f"IMAGE {idx + 1}:\n"
            candidates_summary += f"  Title: {img['title']}\n"
            candidates_summary += f"  URL: {img['url']}\n"
            candidates_summary += f"  Source: {img['source']}\n"
            candidates_summary += f"  Source URL: {img['source_url']}\n"
            candidates_summary += f"  Dimensions: {img['width']}x{img['height']}\n\n"
        
        prompt = f"""
        You are an expert at identifying equipment images. Analyze these image search results and select the BEST image that shows the complete {make} {model} equipment.
        
        CRITICAL REQUIREMENTS:
        1. The image must show the FULL/COMPLETE equipment (not just parts or components)
        2. Prefer official manufacturer images or professional equipment photos
        3. Avoid images that show only parts, accessories, or close-up details
        4. Prioritize clear, high-quality images from reputable sources
        5. Consider the URL and source - manufacturer sites and equipment dealers are preferred
        6. Avoid stock photo sites or generic image hosts when possible
        
        {candidates_summary}
        
        Analyze each image based on:
        - Title relevance to the exact make/model
        - URL patterns (manufacturer domains, equipment dealers, etc.)
        - Source credibility
        - Image dimensions (larger often means higher quality)
        - Likelihood of showing the complete equipment
        
        Return your selection as JSON with:
        {{
            "selected_image_position": <1-based position of best image>,
            "selected_image_url": "<URL of selected image>",
            "selected_image_title": "<title of selected image>",
            "confidence": <0.0-1.0>,
            "reasoning": "Detailed explanation of why this image was selected",
            "analysis": {{
                "shows_full_equipment": true/false,
                "is_manufacturer_image": true/false,
                "source_credibility": "high/medium/low",
                "title_match_accuracy": "exact/close/partial",
                "url_indicators": ["list", "of", "positive", "indicators"]
            }}
        }}
        """
        
        # Get AI selection
        if USING_NEW_OPENAI_CLIENT:
            response = client.chat.completions.create(
                model="gpt-4.1-mini-2025-04-14",
                messages=[
                    {"role": "system", "content": "You are an expert at analyzing equipment images and identifying authentic, complete equipment photos from search results."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            raw_content = response.choices[0].message.content
        else:
            import openai
            response = openai.ChatCompletion.create(
                model="gpt-4.1-mini-2025-04-14",
                messages=[
                    {"role": "system", "content": "You are an expert at analyzing equipment images and identifying authentic, complete equipment photos from search results."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            raw_content = response.choices[0].message['content']
        
        # Parse AI selection
        selection = json.loads(raw_content)
        
        # Get the selected image details
        selected_position = selection.get("selected_image_position", 1) - 1  # Convert to 0-based
        if 0 <= selected_position < len(image_results):
            selected_image = image_results[selected_position]
            selection["selected_image"] = selected_image
        
        logger.info(f"AI selected image: {selection.get('selected_image_title')} (confidence: {selection.get('confidence', 0)})")
        
        return {
            "success": True,
            "selection": selection,
            "total_candidates": len(image_results)
        }
        
    except Exception as e:
        logger.error(f"Error in AI image selection: {e}")
        # Return first image as fallback
        if image_results:
            return {
                "success": False,
                "error": str(e),
                "selection": {
                    "selected_image_position": 1,
                    "selected_image_url": image_results[0]["url"],
                    "selected_image_title": image_results[0]["title"],
                    "selected_image": image_results[0],
                    "confidence": 0.1,
                    "reasoning": f"Fallback selection due to error: {str(e)}"
                },
                "total_candidates": len(image_results)
            }
        else:
            return {
                "success": False,
                "error": str(e),
                "selection": None
            }

def find_best_equipment_image(make, model):
    """
    Main function to find the best equipment image using SerpAPI + AI selection
    
    Args:
        make (str): Equipment make
        model (str): Equipment model
        
    Returns:
        dict: Best equipment image with AI analysis
    """
    logger.info(f"Finding best equipment image for: {make} {model}")
    
    # Step 1: Search for equipment images
    search_results = search_equipment_images(make, model, num_results=20)
    
    if not search_results.get("success") or not search_results.get("images"):
        return {
            "success": False,
            "error": search_results.get("error", "No images found"),
            "equipment_make": make,
            "equipment_model": model
        }
    
    # Step 2: AI selects the best image
    ai_result = ai_select_best_equipment_image(make, model, search_results["images"])
    
    if ai_result.get("success") and ai_result.get("selection"):
        selection = ai_result["selection"]
        return {
            "success": True,
            "equipment_make": make,
            "equipment_model": model,
            "best_image": {
                "url": selection.get("selected_image_url"),
                "title": selection.get("selected_image_title"),
                "thumbnail": selection.get("selected_image", {}).get("thumbnail"),
                "source": selection.get("selected_image", {}).get("source"),
                "source_url": selection.get("selected_image", {}).get("source_url"),
                "width": selection.get("selected_image", {}).get("width"),
                "height": selection.get("selected_image", {}).get("height"),
                "confidence": selection.get("confidence", 0),
                "reasoning": selection.get("reasoning"),
                "analysis": selection.get("analysis", {})
            },
            "search_query": search_results.get("query"),
            "total_images_found": search_results.get("total_results", 0),
            "ai_analyzed_count": ai_result.get("total_candidates", 0)
        }
    else:
        return {
            "success": False,
            "error": ai_result.get("error", "AI selection failed"),
            "equipment_make": make,
            "equipment_model": model
        }