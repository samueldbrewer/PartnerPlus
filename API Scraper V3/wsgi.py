#!/usr/bin/env python3
"""
WSGI entry point for production deployment
"""

import os
from app import app

# Configure for production
if __name__ != '__main__':
    # Production settings
    app.config['ENV'] = 'production'
    app.config['DEBUG'] = False
    
    # Set up logging for production
    import logging
    from logging.handlers import RotatingFileHandler
    
    if not app.debug:
        file_handler = RotatingFileHandler('logs/partstown_api.log', maxBytes=10240, backupCount=10)
        file_handler.setFormatter(logging.Formatter(
            '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'
        ))
        file_handler.setLevel(logging.INFO)
        app.logger.addHandler(file_handler)
        app.logger.setLevel(logging.INFO)
        app.logger.info('PartsTown API startup')

if __name__ == "__main__":
    # For local testing of production config
    port = int(os.environ.get('PORT', 8000))
    app.run(host='0.0.0.0', port=port)