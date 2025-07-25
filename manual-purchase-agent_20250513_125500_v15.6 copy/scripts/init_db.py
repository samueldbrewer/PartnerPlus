#!/usr/bin/env python3
"""
Database Initialization Script for Manual Purchase Agent.
This script creates a new, empty database with all required tables.
"""

import os
from flask import Flask
from models import db
from models.manual import Manual, ErrorCode, PartReference
from models.part import Part
from models.supplier import Supplier
from models.profile import BillingProfile
from models.purchase import Purchase
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def create_app():
    """Create and configure a Flask application for DB initialization only"""
    app = Flask(__name__)
    
    # Load configuration
    app.config.from_object('config.Config')
    
    # Initialize database
    db.init_app(app)
    
    return app

def init_db():
    """Initialize the database with all required tables"""
    app = create_app()
    
    # Check if the database file exists, and remove it if it does
    db_path = 'instance/app.db'
    if os.path.exists(db_path):
        logger.info(f"Removing existing database at {db_path}")
        os.remove(db_path)
    
    # Ensure the instance directory exists
    os.makedirs('instance', exist_ok=True)
    
    # Create the database
    with app.app_context():
        logger.info("Creating new database with all tables")
        db.create_all()
        logger.info("Database initialization complete")

if __name__ == '__main__':
    init_db()
    print("Database has been initialized successfully.")