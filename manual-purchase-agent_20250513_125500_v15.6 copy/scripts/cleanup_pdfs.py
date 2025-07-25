#!/usr/bin/env python3
"""
Script to clean up existing PDF files to free up storage space
"""
import os
import sys
import logging
from pathlib import Path
from config import Config
from services.temp_pdf_manager import clear_permanent_pdfs, clear_debug_screenshots, clear_all_storage

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def main():
    """Clean up PDF files and screenshots from uploads directory"""
    
    print("🧹 Storage Cleanup Utility")
    print("=" * 50)
    
    upload_folder = Config.UPLOAD_FOLDER
    
    if not os.path.exists(upload_folder):
        print(f"❌ Upload folder doesn't exist: {upload_folder}")
        return
    
    # Count current PDFs
    pdf_files = [f for f in os.listdir(upload_folder) if f.lower().endswith('.pdf')] if os.path.exists(upload_folder) else []
    
    # Count screenshots
    screenshots_dir = os.path.join(upload_folder, 'screenshots')
    screenshot_files = []
    if os.path.exists(screenshots_dir):
        screenshot_files = [f for f in os.listdir(screenshots_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
    
    if not pdf_files and not screenshot_files:
        print("✅ No PDF files or screenshots found to clean up")
        return
    
    # Calculate total sizes
    pdf_size = 0
    for filename in pdf_files:
        file_path = os.path.join(upload_folder, filename)
        try:
            pdf_size += os.path.getsize(file_path)
        except OSError:
            pass
    
    screenshot_size = 0
    for filename in screenshot_files:
        file_path = os.path.join(screenshots_dir, filename)
        try:
            screenshot_size += os.path.getsize(file_path)
        except OSError:
            pass
    
    pdf_size_mb = pdf_size / (1024 * 1024)
    screenshot_size_mb = screenshot_size / (1024 * 1024)
    total_size_mb = pdf_size_mb + screenshot_size_mb
    
    print(f"📊 Found {len(pdf_files)} PDF files ({pdf_size_mb:.2f} MB)")
    print(f"📷 Found {len(screenshot_files)} screenshot files ({screenshot_size_mb:.2f} MB)")
    print(f"📏 Total size: {total_size_mb:.2f} MB")
    print()
    print("⚠️  This will delete all PDF files and debug screenshots.")
    print("   The system will use temporary storage going forward.")
    print()
    
    # Confirmation
    response = input("🤔 Do you want to proceed? (y/N): ").strip().lower()
    
    if response not in ['y', 'yes']:
        print("❌ Cleanup cancelled")
        return
    
    print("\n🚀 Starting cleanup...")
    
    try:
        clear_all_storage(upload_folder)
        print("✅ Storage cleanup completed successfully!")
        print("💡 The system will now use temporary storage with automatic cleanup")
        
    except Exception as e:
        print(f"❌ Error during cleanup: {e}")
        logger.error(f"Cleanup failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()