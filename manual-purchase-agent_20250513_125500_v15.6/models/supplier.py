from models import db
from datetime import datetime

class Supplier(db.Model):
    """Model for storing supplier information"""
    
    __tablename__ = "suppliers"
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    domain = db.Column(db.String(100), nullable=False, index=True)
    
    website = db.Column(db.String(255))
    reliability_score = db.Column(db.Float, default=0.0)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f"<Supplier {self.id}: {self.name} ({self.domain})>"