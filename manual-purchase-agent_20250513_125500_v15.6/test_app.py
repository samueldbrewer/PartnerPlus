from flask import Flask
from models import db
from api.parts import parts_bp

def create_app():
    app = Flask(__name__)
    
    # Configuration
    app.config['SECRET_KEY'] = 'dev-secret-key'
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///instance/app.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    # Initialize database
    db.init_app(app)
    
    # Register only the parts API (working)
    app.register_blueprint(parts_bp, url_prefix='/api/parts')
    
    @app.route('/api/system/health')
    def health():
        return {"status": "healthy", "service": "test-app"}
    
    # Create database tables
    with app.app_context():
        db.create_all()
    
    return app

if __name__ == '__main__':
    app = create_app()
    app.run(host='0.0.0.0', port=7777, debug=True)