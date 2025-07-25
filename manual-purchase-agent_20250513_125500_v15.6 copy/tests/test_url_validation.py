#!/usr/bin/env python3
import unittest
from services.enrichment_service import EnrichmentService

class TestURLValidation(unittest.TestCase):
    """Test the URL validation functions in the EnrichmentService class"""
    
    def setUp(self):
        """Set up the test case with an EnrichmentService instance"""
        self.service = EnrichmentService()
    
    def test_validate_url(self):
        """Test the _validate_url method with various input URLs"""
        # Valid URLs
        self.assertEqual(
            self.service._validate_url("https://www.youtube.com/watch?v=abc12345678", "video"),
            "https://www.youtube.com/watch?v=abc12345678"
        )
        self.assertEqual(
            self.service._validate_url("https://youtu.be/abc12345678", "video"),
            "https://www.youtube.com/watch?v=abc12345678"
        )
        self.assertEqual(
            self.service._validate_url("https://example.com/article/12345", "article"),
            "https://example.com/article/12345"
        )
        self.assertEqual(
            self.service._validate_url("https://example.com/image.jpg", "image"),
            "https://example.com/image.jpg"
        )
        
        # Invalid URLs
        self.assertIsNone(self.service._validate_url("", "video"))
        self.assertIsNone(self.service._validate_url(None, "video"))
        self.assertIsNone(self.service._validate_url("not-a-url", "video"))
        self.assertIsNone(self.service._validate_url("example.com", "article"))
        
        # Example URLs that should be rejected
        self.assertIsNone(self.service._validate_url("https://www.youtube.com/watch?v=example1", "video"))
        self.assertIsNone(self.service._validate_url("https://www.example.com/", "article"))
        
        # URL fixing (adding https://)
        self.assertEqual(
            self.service._validate_url("www.example.com/article/12345", "article"),
            "https://www.example.com/article/12345"
        )
    
    def test_validate_source_url(self):
        """Test the _validate_source_url method"""
        # Valid URLs
        self.assertEqual(
            self.service._validate_source_url("https://www.example.com/publisher"),
            "https://www.example.com/publisher"
        )
        
        # Invalid URLs
        self.assertIsNone(self.service._validate_source_url(""))
        self.assertIsNone(self.service._validate_source_url(None))
        self.assertIsNone(self.service._validate_source_url("not-a-url"))
        
        # URL fixing (adding https://)
        self.assertEqual(
            self.service._validate_source_url("www.example.com/publisher"),
            "https://www.example.com/publisher"
        )
        
        # Reject example URLs or URLs without paths
        self.assertIsNone(self.service._validate_source_url("https://example.com"))
        self.assertIsNone(self.service._validate_source_url("https://www.example.com/"))

    def test_validate_ai_urls(self):
        """Test the _validate_ai_urls method"""
        # Create a test result with mixed valid and invalid URLs
        test_results = {
            "videos": [
                {"url": "https://www.youtube.com/watch?v=abc12345678", "title": "Good Video"},
                {"url": "https://www.youtube.com/watch?v=example1", "title": "Bad Example URL"},
                {"url": "not-a-url", "title": "Invalid URL"}
            ],
            "articles": [
                {"url": "https://www.example.com/article/123", "title": "Good Article"},
                {"url": "https://www.example.com/", "title": "Bad Root URL"},
                {"url": "", "title": "Empty URL"}
            ],
            "images": [
                {"url": "https://www.example.com/image.jpg", "title": "Good Image"},
                {"url": "image.jpg", "title": "Invalid URL"}
            ]
        }
        
        # Validate URLs in the test results
        self.service._validate_ai_urls(test_results)
        
        # Verify that only valid URLs remain
        self.assertEqual(len(test_results["videos"]), 1)
        self.assertEqual(test_results["videos"][0]["url"], "https://www.youtube.com/watch?v=abc12345678")
        
        self.assertEqual(len(test_results["articles"]), 1)
        self.assertEqual(test_results["articles"][0]["url"], "https://www.example.com/article/123")
        
        self.assertEqual(len(test_results["images"]), 1)
        self.assertEqual(test_results["images"][0]["url"], "https://www.example.com/image.jpg")

    def test_combine_results(self):
        """Test that _combine_results properly validates URLs"""
        # Create test results with mixed valid and invalid URLs
        ai_results = {
            "videos": [
                {"url": "https://www.youtube.com/watch?v=abc12345678", "title": "Good Video"},
                {"url": "https://www.youtube.com/watch?v=example1", "title": "Bad Example URL"}
            ],
            "articles": [
                {"url": "https://www.example.com/article/123", "title": "Good Article"},
                {"url": "https://www.example.com/", "title": "Bad Root URL"}
            ],
            "images": [
                {"url": "https://www.example.com/image.jpg", "title": "Good Image"},
                {"url": "image.jpg", "title": "Invalid URL"}
            ]
        }
        
        video_results = [
            {"url": "https://www.youtube.com/watch?v=def87654321", "title": "Another Good Video"},
            {"url": "not-a-url", "title": "Invalid URL"}
        ]
        
        article_results = [
            {"url": "https://www.example.com/article/456", "title": "Another Good Article"},
            {"url": "example.com", "title": "Invalid URL"}
        ]
        
        image_results = [
            {"url": "https://www.example.com/photo.png", "title": "Another Good Image"},
            {"url": "https://example.com/image", "title": "Invalid Image URL (no extension)"}
        ]
        
        # Combine and validate results
        combined = self.service._combine_results(ai_results, video_results, article_results, image_results)
        
        # Verify that only valid URLs remain
        self.assertEqual(len(combined["videos"]), 2)
        video_urls = [v["url"] for v in combined["videos"]]
        self.assertIn("https://www.youtube.com/watch?v=abc12345678", video_urls)
        self.assertIn("https://www.youtube.com/watch?v=def87654321", video_urls)
        
        self.assertEqual(len(combined["articles"]), 2)
        article_urls = [a["url"] for a in combined["articles"]]
        self.assertIn("https://www.example.com/article/123", article_urls)
        self.assertIn("https://www.example.com/article/456", article_urls)
        
        self.assertEqual(len(combined["images"]), 2)
        image_urls = [i["url"] for i in combined["images"]]
        self.assertIn("https://www.example.com/image.jpg", image_urls)
        self.assertIn("https://www.example.com/photo.png", image_urls)

    def test_youtube_url_validation(self):
        """Test YouTube URL validation and normalization"""
        # Standard YouTube URL
        self.assertEqual(
            self.service._validate_url("https://www.youtube.com/watch?v=abc1234567a", "video"),
            "https://www.youtube.com/watch?v=abc1234567a"
        )
        
        # YouTube short URL
        self.assertEqual(
            self.service._validate_url("https://youtu.be/abc1234567a", "video"),
            "https://www.youtube.com/watch?v=abc1234567a"
        )
        
        # Malformed YouTube URLs
        self.assertIsNone(self.service._validate_url("https://youtube.com/watch", "video"))
        self.assertIsNone(self.service._validate_url("https://youtube.com/watch?v=", "video"))
        self.assertIsNone(self.service._validate_url("https://www.youtube.com/watch?v=example1", "video"))
        
        # Non-YouTube video URLs
        self.assertEqual(
            self.service._validate_url("https://vimeo.com/123456789", "video"),
            "https://vimeo.com/123456789"
        )

if __name__ == "__main__":
    unittest.main()