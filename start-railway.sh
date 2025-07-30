#!/bin/bash

# Start Railway deployment script
echo "🚀 Starting PartnerPlus services on Railway..."

# Start Flask purchase agent service in background
echo "🐍 Starting Flask purchase agent service..."
cd manual-purchase-agent_20250513_125500_v15.6

# Check if required modules are available
echo "🔍 Checking Python environment..."
python3 -c "import flask; print('✅ Flask is available')" || { echo "❌ Flask not found"; exit 1; }

# Start Flask service
python3 app.py &
FLASK_PID=$!

# Wait a moment for Flask to start
sleep 5

# Check if Flask is running
if curl -f http://localhost:7777/api/system/health > /dev/null 2>&1; then
    echo "✅ Flask service started successfully on port 7777"
else
    echo "❌ Flask service failed to start"
fi

# Return to root directory
cd ..

# Set environment variable for purchase agent URL
export PURCHASE_AGENT_URL=http://localhost:7777

# Start Node.js main application
echo "🟢 Starting Node.js main application..."
node index.js

# Cleanup on exit
trap "kill $FLASK_PID" EXIT