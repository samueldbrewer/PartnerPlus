#!/usr/bin/env python3
"""
Test script for purchase automation MVP
"""

import asyncio
import json
from purchase_automation.automation_engine import PurchaseAutomationEngine
from purchase_automation.site_configs import get_site_config, SITE_CONFIGS


def test_site_configs():
    """Test site configuration loading"""
    print("🧪 Testing site configurations...")
    print(f"📋 Configured sites: {list(SITE_CONFIGS.keys())}")
    
    # Test URL parsing
    test_urls = [
        "https://www.etundra.com/product/123",
        "https://etundra.com/product/456",
        "http://example-store.com/item",
        "https://unknown-site.com/product"
    ]
    
    for url in test_urls:
        config = get_site_config(url)
        if config:
            print(f"✅ {url} -> {config['name']}")
        else:
            print(f"❌ {url} -> No config found")
    
    print()


async def test_engine_basic():
    """Test basic engine functionality"""
    print("🧪 Testing automation engine...")
    
    try:
        # Test engine initialization
        engine = PurchaseAutomationEngine(headless=True)
        await engine.start()
        
        print("✅ Engine started successfully")
        
        # Test navigation
        await engine.page.goto("https://www.google.com")
        title = await engine.page.title()
        print(f"✅ Navigated to page: {title}")
        
        await engine.close()
        print("✅ Engine closed successfully")
        
    except Exception as e:
        print(f"❌ Engine test failed: {e}")
    
    print()


async def test_dry_run_purchase():
    """Test a dry run purchase on a demo site"""
    print("🧪 Testing dry run purchase...")
    
    # Test billing data
    test_billing = {
        "email": "test@example.com",
        "first_name": "Test",
        "last_name": "User",
        "address": "123 Test Street",
        "city": "Test City",
        "state": "CA",
        "zip": "90210",
        "phone": "555-123-4567",
        "card_number": "4111111111111111",
        "card_name": "Test User",
        "card_expiry": "12/25",
        "card_cvv": "123"
    }
    
    # Test with a real eTundra product (but in dry run mode)
    test_url = "https://www.etundra.com/kitchen-supplies/food-storage/dough-boxes/cambro-dbc1826cw148-pizza-dough-box-cover/"
    
    async with PurchaseAutomationEngine(headless=False, screenshots_dir="test_screenshots") as engine:
        result = await engine.execute_purchase(
            product_url=test_url,
            billing_data=test_billing,
            dry_run=True  # Important: Always use dry_run for testing!
        )
        
        print(f"\n📊 Purchase Result:")
        print(f"Success: {result['success']}")
        print(f"Site: {result.get('site', 'Unknown')}")
        print(f"Execution Time: {result.get('execution_time', 0):.2f} seconds")
        print(f"Screenshots: {len(result.get('screenshots', []))}")
        
        if result.get('errors'):
            print(f"Errors: {result['errors']}")
        
        if not result['success']:
            print(f"Error: {result.get('error', 'Unknown error')}")
    
    print()


def test_api_payload():
    """Test API payload structure"""
    print("🧪 Testing API payload structure...")
    
    sample_payload = {
        "product_url": "https://www.etundra.com/product/123",
        "billing_profile": {
            "email": "john.doe@company.com",
            "first_name": "John",
            "last_name": "Doe",
            "address": "123 Main Street",
            "city": "New York",
            "state": "NY",
            "zip": "10001",
            "phone": "212-555-1234",
            "card_number": "4111111111111111",
            "card_name": "John Doe",
            "card_expiry": "12/25",
            "card_cvv": "123"
        },
        "options": {
            "dry_run": True,
            "headless": False
        }
    }
    
    print("📝 Sample API payload:")
    print(json.dumps(sample_payload, indent=2))
    print()


async def main():
    """Run all tests"""
    print("🚀 Purchase Automation MVP - Test Suite\n")
    
    # Test configurations
    test_site_configs()
    
    # Test engine
    await test_engine_basic()
    
    # Test API structure
    test_api_payload()
    
    # Ask before running browser test
    response = input("Run browser automation test? (y/n): ")
    if response.lower() == 'y':
        await test_dry_run_purchase()
    
    print("\n✅ All tests completed!")


if __name__ == "__main__":
    asyncio.run(main())