#!/usr/bin/env python3
"""
CLI tool for testing purchase automation
"""

import asyncio
import argparse
import json
from pathlib import Path
from purchase_automation.automation_engine import PurchaseAutomationEngine
from purchase_automation.site_configs import get_site_config, SITE_CONFIGS


async def execute_purchase_cli(args):
    """Execute a purchase from command line"""
    # Load billing profile
    if args.billing_file:
        with open(args.billing_file, 'r') as f:
            billing_data = json.load(f)
    else:
        # Default test data
        billing_data = {
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
    
    # Check if site is supported
    site_config = get_site_config(args.url)
    if not site_config:
        print(f"❌ Unsupported site for URL: {args.url}")
        print(f"💡 Supported sites: {', '.join(SITE_CONFIGS.keys())}")
        return
    
    print(f"🛒 Starting purchase automation...")
    print(f"📍 Site: {site_config['name']}")
    print(f"🔗 URL: {args.url}")
    print(f"🧪 Dry Run: {args.dry_run}")
    print(f"👁️  Headless: {args.headless}")
    print()
    
    # Create screenshots directory
    screenshots_dir = Path("purchase_screenshots")
    screenshots_dir.mkdir(exist_ok=True)
    
    # Execute purchase
    async with PurchaseAutomationEngine(
        headless=args.headless,
        screenshots_dir=str(screenshots_dir)
    ) as engine:
        result = await engine.execute_purchase(
            product_url=args.url,
            billing_data=billing_data,
            dry_run=args.dry_run
        )
        
        # Print results
        print("\n" + "="*50)
        print("📊 PURCHASE RESULT")
        print("="*50)
        
        if result['success']:
            print(f"✅ Status: {'DRY RUN SUCCESSFUL' if args.dry_run else 'PURCHASE COMPLETED'}")
        else:
            print(f"❌ Status: FAILED")
            print(f"Error: {result.get('error', 'Unknown error')}")
        
        print(f"⏱️  Execution Time: {result.get('execution_time', 0):.2f} seconds")
        print(f"📸 Screenshots: {len(result.get('screenshots', []))}")
        
        if result.get('screenshots'):
            print("\n📸 Screenshots saved:")
            for screenshot in result['screenshots']:
                print(f"   - {screenshot}")
        
        if result.get('errors'):
            print("\n⚠️  Errors encountered:")
            for error in result['errors']:
                print(f"   - {error}")
        
        # Save result to file
        result_file = screenshots_dir / "last_result.json"
        with open(result_file, 'w') as f:
            json.dump(result, f, indent=2)
        print(f"\n💾 Full result saved to: {result_file}")


def list_sites():
    """List all supported sites"""
    print("🛒 Supported E-commerce Sites:")
    print("="*50)
    
    for key, config in SITE_CONFIGS.items():
        print(f"\n📍 {config['name']}")
        print(f"   Key: {key}")
        print(f"   Domain: {config['domain']}")
        print(f"   Flow Type: {config['checkout_flow']}")
        print(f"   Steps: {len(config['flow_steps'])}")


def main():
    parser = argparse.ArgumentParser(
        description="Purchase Automation CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s purchase https://www.etundra.com/product/123 --dry-run
  %(prog)s purchase https://www.etundra.com/product/123 --billing profile.json
  %(prog)s list-sites
        """
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Commands')
    
    # Purchase command
    purchase_parser = subparsers.add_parser('purchase', help='Execute a purchase')
    purchase_parser.add_argument('url', help='Product URL to purchase')
    purchase_parser.add_argument('--billing-file', help='JSON file with billing data')
    purchase_parser.add_argument('--dry-run', action='store_true', default=True,
                               help='Stop before placing order (default: True)')
    purchase_parser.add_argument('--live', action='store_true',
                               help='Actually place the order (careful!)')
    purchase_parser.add_argument('--headless', action='store_true',
                               help='Run browser in headless mode')
    
    # List sites command
    list_parser = subparsers.add_parser('list-sites', help='List supported sites')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    if args.command == 'purchase':
        # Override dry_run if --live is specified
        if args.live:
            args.dry_run = False
            response = input("⚠️  WARNING: Live mode will place a real order. Continue? (yes/no): ")
            if response.lower() != 'yes':
                print("❌ Cancelled")
                return
        
        asyncio.run(execute_purchase_cli(args))
    
    elif args.command == 'list-sites':
        list_sites()


if __name__ == "__main__":
    main()