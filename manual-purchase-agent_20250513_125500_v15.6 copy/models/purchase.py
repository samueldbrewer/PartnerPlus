from models import db
from datetime import datetime

class Purchase(db.Model):
    """Model for storing purchase transactions"""
    
    __tablename__ = "purchases"
    
    id = db.Column(db.Integer, primary_key=True)
    
    part_number = db.Column(db.String(100), nullable=False)
    supplier_url = db.Column(db.String(500), nullable=False)
    
    quantity = db.Column(db.Integer, default=1)
    price = db.Column(db.Float)
    
    billing_profile_id = db.Column(db.Integer, db.ForeignKey("billing_profiles.id"), nullable=False)
    
    status = db.Column(db.String(50), default="pending")
    confirmation_code = db.Column(db.String(100))
    order_id = db.Column(db.String(100))
    
    # Path to error screenshot if any
    error_screenshot = db.Column(db.String(255))
    error_message = db.Column(db.Text)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = db.Column(db.DateTime)
    
    # Relationship
    billing_profile = db.relationship("BillingProfile", backref="purchases")
    
    def __repr__(self):
        return f"<Purchase {self.id}: {self.part_number} ({self.status})>"