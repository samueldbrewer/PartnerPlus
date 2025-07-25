from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

# Import models
from models.manual import Manual, ErrorCode, PartReference
from models.part import Part
from models.supplier import Supplier
from models.profile import BillingProfile
from models.purchase import Purchase