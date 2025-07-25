from models import db
from datetime import datetime
import json

class Part(db.Model):
    """Model for storing part information"""
    
    __tablename__ = "parts"
    
    id = db.Column(db.Integer, primary_key=True)
    oem_part_number = db.Column(db.String(100), nullable=False, index=True)
    manufacturer = db.Column(db.String(100), nullable=False)
    
    generic_description = db.Column(db.Text, nullable=False)
    description = db.Column(db.Text)
    
    # Store as JSON strings
    specifications = db.Column(db.Text)
    alternate_part_numbers = db.Column(db.Text)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def get_specifications(self):
        """Parse specifications JSON"""
        if self.specifications:
            return json.loads(self.specifications)
        return {}
    
    def set_specifications(self, specs_dict):
        """Set specifications as JSON string"""
        self.specifications = json.dumps(specs_dict)
    
    def get_alternate_part_numbers(self):
        """Parse alternate part numbers JSON"""
        if self.alternate_part_numbers:
            return json.loads(self.alternate_part_numbers)
        return []
    
    def set_alternate_part_numbers(self, part_numbers):
        """Set alternate part numbers as JSON string"""
        self.alternate_part_numbers = json.dumps(part_numbers)
    
    def __repr__(self):
        return f"<Part {self.id}: {self.oem_part_number}>"