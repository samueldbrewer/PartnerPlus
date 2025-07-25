#!/bin/bash

# Start Flask service only
# Recording and purchase automation functionality has been removed

echo "🚀 Starting Manual Purchase Agent Service..."

# Set working directory
cd "$(dirname "$0")"

# Export required environment variables
export FLASK_APP=app.py
export FLASK_ENV=development
export PYTHONPATH=$PWD
export ENCRYPTION_KEY='z2KGjtN24oYD3KHkkr8bpKsjyxJAN2SgAfgILqWnO54='

# Kill any existing services
echo "🛑 Stopping existing services..."
pkill -f "flask run" 2>/dev/null || true
sleep 2

# Start Flask application
echo "🌶️  Starting Flask API on port 7777..."
flask run --host=0.0.0.0 --port=7777 > flask_output.log 2>&1 &
FLASK_PID=$!

# Wait for flask service to be ready
echo "⏳ Waiting for Flask service to start..."
sleep 5

# Verify flask service is running
if curl -s http://localhost:7777/api/system/health > /dev/null 2>&1; then
    echo "✅ Flask API is running"
else
    echo "❌ Failed to start Flask API"
    exit 1
fi

# Get local network IP address (works on macOS and Linux)
if command -v ip &> /dev/null; then
    # Linux with ip command
    LOCAL_IP=$(ip route get 1 | awk '{print $NF;exit}' 2>/dev/null)
elif command -v ifconfig &> /dev/null; then
    # macOS or Linux with ifconfig
    LOCAL_IP=$(ifconfig | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' | grep -v '^172\.17\.' | grep -v '^172\.18\.' | head -n 1)
else
    # Fallback method
    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi

# Validate IP address format
if [[ ! "$LOCAL_IP" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
    LOCAL_IP=""
fi

echo ""
echo "🎉 Service started successfully!"
echo ""
echo "📱 Local Access URLs:"
echo "   V3 Interface: http://localhost:7777/static/api-demo/v3/"
echo "   Flask API: http://localhost:7777"
echo ""
if [ ! -z "$LOCAL_IP" ]; then
    echo "🌐 Network Access URLs (for other devices on your network):"
    echo "   V3 Interface: http://$LOCAL_IP:7777/static/api-demo/v3/"
    echo "   Flask API: http://$LOCAL_IP:7777"
    echo ""
fi
echo "📊 To view logs:"
echo "   Flask: tail -f flask_output.log"
echo ""
echo "🛑 To stop service: pkill -f 'flask run'"
echo ""
echo "⚠️  Purchase automation functionality has been removed"
echo ""
echo "🔧 Available features:"
echo "   - Manual and parts search"
echo "   - Supplier finding"
echo "   - PDF processing and enrichment"
echo "   - Billing profile management"
echo ""
echo "💡 Tip: Use the network URLs to access from mobile devices or other computers"
echo ""