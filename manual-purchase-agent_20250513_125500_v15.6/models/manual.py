from models import db
from datetime import datetime

class Manual(db.Model):
    """Model for storing manual information"""
    
    __tablename__ = "manuals"
    
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    make = db.Column(db.String(100), nullable=False)
    model = db.Column(db.String(100), nullable=False)
    year = db.Column(db.String(20))
    
    url = db.Column(db.String(500), nullable=False)
    local_path = db.Column(db.String(500))
    file_format = db.Column(db.String(20), default="pdf")
    
    processed = db.Column(db.Boolean, default=False)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    error_codes = db.relationship("ErrorCode", backref="manual", lazy=True)
    part_references = db.relationship("PartReference", backref="manual", lazy=True)
    
    def __repr__(self):
        return f"<Manual {self.id}: {self.make} {self.model} {self.year}>"


class ErrorCode(db.Model):
    """Model for storing error codes from manuals"""
    
    __tablename__ = "error_codes"
    
    id = db.Column(db.Integer, primary_key=True)
    manual_id = db.Column(db.Integer, db.ForeignKey("manuals.id"), nullable=False)
    
    code = db.Column(db.String(50), nullable=False)
    description = db.Column(db.Text)
    resolution = db.Column(db.Text)
    severity = db.Column(db.String(20))
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f"<ErrorCode {self.id}: {self.code}>"


class PartReference(db.Model):
    """Model for storing part references from manuals"""
    
    __tablename__ = "part_references"
    
    id = db.Column(db.Integer, primary_key=True)
    manual_id = db.Column(db.Integer, db.ForeignKey("manuals.id"), nullable=False)
    
    part_number = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    quantity = db.Column(db.Integer, default=1)
    location = db.Column(db.String(255))
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f"<PartReference {self.id}: {self.part_number}>"