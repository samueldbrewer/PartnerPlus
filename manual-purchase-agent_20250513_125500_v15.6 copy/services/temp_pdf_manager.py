"""
Temporary PDF Manager for handling PDFs with automatic cleanup
"""
import os
import tempfile
import logging
import atexit
import shutil
from contextlib import contextmanager
from pathlib import Path

logger = logging.getLogger(__name__)

class TempPDFManager:
    """Manages temporary PDF storage with automatic cleanup"""
    
    def __init__(self):
        """Initialize the temporary PDF manager"""
        # Create a temporary directory for this session
        self.temp_dir = tempfile.mkdtemp(prefix="manual_pdfs_")
        self.temp_files = set()
        
        # Register cleanup on exit
        atexit.register(self.cleanup_all)
        
        logger.info(f"Temporary PDF storage initialized: {self.temp_dir}")
    
    def get_temp_path(self, prefix="manual", suffix=".pdf"):
        """
        Get a temporary file path for storing a PDF
        
        Args:
            prefix (str): Prefix for the filename
            suffix (str): File extension (default: .pdf)
            
        Returns:
            str: Path to temporary file
        """
        fd, temp_path = tempfile.mkstemp(prefix=prefix, suffix=suffix, dir=self.temp_dir)
        os.close(fd)  # Close the file descriptor, we just want the path
        self.temp_files.add(temp_path)
        return temp_path
    
    def cleanup_file(self, file_path):
        """
        Clean up a specific temporary file
        
        Args:
            file_path (str): Path to file to clean up
        """
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                logger.debug(f"Cleaned up temporary PDF: {file_path}")
            if file_path in self.temp_files:
                self.temp_files.remove(file_path)
        except Exception as e:
            logger.warning(f"Error cleaning up temporary file {file_path}: {e}")
    
    def cleanup_all(self):
        """Clean up all temporary files and directory"""
        try:
            # Remove individual tracked files
            for temp_file in list(self.temp_files):
                self.cleanup_file(temp_file)
            
            # Remove the temporary directory
            if os.path.exists(self.temp_dir):
                shutil.rmtree(self.temp_dir)
                logger.info(f"Cleaned up temporary PDF directory: {self.temp_dir}")
                
        except Exception as e:
            logger.warning(f"Error during cleanup: {e}")

# Global instance
_temp_pdf_manager = None

def get_temp_pdf_manager():
    """Get the global temporary PDF manager instance"""
    global _temp_pdf_manager
    if _temp_pdf_manager is None:
        _temp_pdf_manager = TempPDFManager()
    return _temp_pdf_manager

@contextmanager
def temporary_pdf(prefix="manual", suffix=".pdf"):
    """
    Context manager for temporary PDF files that automatically cleanup
    
    Args:
        prefix (str): Prefix for the filename
        suffix (str): File extension
        
    Yields:
        str: Path to temporary PDF file
    """
    manager = get_temp_pdf_manager()
    temp_path = manager.get_temp_path(prefix, suffix)
    
    try:
        yield temp_path
    finally:
        manager.cleanup_file(temp_path)

def clear_permanent_pdfs(upload_folder):
    """
    Clear all PDFs from the permanent upload folder to free up space
    
    Args:
        upload_folder (str): Path to uploads folder
    """
    try:
        if not os.path.exists(upload_folder):
            logger.info(f"Upload folder doesn't exist: {upload_folder}")
            return
        
        pdf_count = 0
        space_freed = 0
        
        # Clear PDF files
        for filename in os.listdir(upload_folder):
            if filename.lower().endswith('.pdf'):
                file_path = os.path.join(upload_folder, filename)
                try:
                    file_size = os.path.getsize(file_path)
                    os.remove(file_path)
                    pdf_count += 1
                    space_freed += file_size
                    logger.debug(f"Removed PDF: {filename}")
                except Exception as e:
                    logger.warning(f"Error removing {filename}: {e}")
        
        # Convert bytes to MB for logging
        space_freed_mb = space_freed / (1024 * 1024)
        logger.info(f"Cleared {pdf_count} PDF files, freed {space_freed_mb:.2f} MB of space")
        
    except Exception as e:
        logger.error(f"Error clearing permanent PDFs: {e}")

def clear_debug_screenshots(upload_folder):
    """
    Clear all screenshot files from the debug screenshots folder
    
    Args:
        upload_folder (str): Path to uploads folder
    """
    try:
        screenshots_dir = os.path.join(upload_folder, 'screenshots')
        
        if not os.path.exists(screenshots_dir):
            logger.info(f"Screenshots folder doesn't exist: {screenshots_dir}")
            return
        
        screenshot_count = 0
        space_freed = 0
        
        # Clear screenshot files
        for filename in os.listdir(screenshots_dir):
            if filename.lower().endswith(('.png', '.jpg', '.jpeg')):
                file_path = os.path.join(screenshots_dir, filename)
                try:
                    file_size = os.path.getsize(file_path)
                    os.remove(file_path)
                    screenshot_count += 1
                    space_freed += file_size
                    logger.debug(f"Removed screenshot: {filename}")
                except Exception as e:
                    logger.warning(f"Error removing {filename}: {e}")
        
        # Convert bytes to MB for logging
        space_freed_mb = space_freed / (1024 * 1024)
        logger.info(f"Cleared {screenshot_count} screenshot files, freed {space_freed_mb:.2f} MB of space")
        
    except Exception as e:
        logger.error(f"Error clearing debug screenshots: {e}")

def clear_all_storage(upload_folder):
    """
    Clear both PDFs and screenshots to free up maximum space
    
    Args:
        upload_folder (str): Path to uploads folder
    """
    logger.info("Clearing all temporary storage files...")
    clear_permanent_pdfs(upload_folder)
    clear_debug_screenshots(upload_folder)
    logger.info("Storage cleanup completed")