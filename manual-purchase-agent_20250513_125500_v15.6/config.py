import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Config:
    """Application configuration"""
    
    # Flask settings
    SECRET_KEY = os.environ.get('SECRET_KEY', 'development-key')
    DEBUG = os.environ.get('DEBUG', 'False').lower() == 'true'
    
    # Database settings - Use absolute path for SQLite
    _basedir = os.path.abspath(os.path.dirname(__file__))
    _db_path = os.path.join(_basedir, 'instance', 'app.db')
    # Force absolute path for local development
    if os.environ.get('DATABASE_URI'):
        SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URI')
    else:
        # Use absolute path for SQLite
        SQLALCHEMY_DATABASE_URI = f'sqlite:///{_db_path}'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,  # Verify connections before use
        'pool_recycle': 3600,   # Recycle connections every hour
    }
    
    # API keys
    SERPAPI_KEY = os.environ.get('SERPAPI_KEY', '7219228e748003a6e5394610456ef659f7c7884225b2df7fb0a890da61ad7f48')
    OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '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')
    
    # Encryption key for sensitive data
    ENCRYPTION_KEY = os.environ.get('ENCRYPTION_KEY')
    
    # File storage settings
    UPLOAD_FOLDER = os.environ.get('UPLOAD_FOLDER', 'uploads')
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50 MB