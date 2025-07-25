from models import db
from datetime import datetime
from sqlalchemy.ext.hybrid import hybrid_property
from cryptography.fernet import Fernet
import os
import json

def get_cipher_suite():
    """Get the encryption cipher suite"""
    encryption_key = os.environ.get("ENCRYPTION_KEY")
    if not encryption_key:
        # Generate a key if not provided (in production, this should be set in environment)
        encryption_key = Fernet.generate_key()
    else:
        # If key is provided as string in environment variable, encode it
        if isinstance(encryption_key, str):
            encryption_key = encryption_key.encode()
    return Fernet(encryption_key)

class BillingProfile(db.Model):
    """Secure storage for billing profiles"""
    
    __tablename__ = "billing_profiles"
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    
    # Encrypted fields
    _billing_address = db.Column(db.LargeBinary, nullable=False)
    _shipping_address = db.Column(db.LargeBinary, nullable=True)
    _payment_info = db.Column(db.LargeBinary, nullable=False)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    @hybrid_property
    def billing_address(self):
        """Decrypt billing address"""
        return json.loads(get_cipher_suite().decrypt(self._billing_address).decode())
    
    @billing_address.setter
    def billing_address(self, address_dict):
        """Encrypt billing address"""
        self._billing_address = get_cipher_suite().encrypt(json.dumps(address_dict).encode())
    
    @hybrid_property
    def shipping_address(self):
        """Decrypt shipping address"""
        if self._shipping_address:
            return json.loads(get_cipher_suite().decrypt(self._shipping_address).decode())
        return None
    
    @shipping_address.setter
    def shipping_address(self, address_dict):
        """Encrypt shipping address"""
        if address_dict:
            self._shipping_address = get_cipher_suite().encrypt(json.dumps(address_dict).encode())
        else:
            self._shipping_address = None
    
    @hybrid_property
    def payment_info(self):
        """Decrypt payment information"""
        return json.loads(get_cipher_suite().decrypt(self._payment_info).decode())
    
    @payment_info.setter
    def payment_info(self, payment_dict):
        """Encrypt payment information"""
        self._payment_info = get_cipher_suite().encrypt(json.dumps(payment_dict).encode())
    
    def get_decrypted_data(self):
        """Get all decrypted data for purchase processing"""
        # Extract company name and email from billing address if available
        billing_addr = self.billing_address or {}
        
        return {
            "company_name": billing_addr.get("company_name", self.name),
            "email": billing_addr.get("email", ""),
            "billing_address": self.billing_address,
            "shipping_address": self.shipping_address or self.billing_address,
            "payment_info": self.payment_info
        }
    
    def to_dict(self, include_sensitive=False):
        """Convert to dictionary with optional sensitive information"""
        result = {
            "id": self.id,
            "name": self.name,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat()
        }
        
        if include_sensitive:
            result["billing_address"] = self.billing_address
            result["shipping_address"] = self.shipping_address
            result["payment_info"] = self.payment_info
        
        return result
    
    def __repr__(self):
        return f"<BillingProfile {self.id}: {self.name}>"