#!/bin/bash

# PartnerPlus Services Start Script
# This script cleanly stops all services and restarts them

echo "==================================="
echo "PartnerPlus Services Manager"
echo "==================================="

# Function to kill processes
kill_process() {
    local process_name=$1
    echo "Stopping $process_name..."
    
    # Try graceful kill first
    pkill -f "$process_name" 2>/dev/null
    sleep 1
    
    # Force kill if still running
    pkill -9 -f "$process_name" 2>/dev/null
}

# Function to check if port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        echo "Port $port is in use, killing process..."
        kill -9 $(lsof -t -i:$port) 2>/dev/null
        sleep 1
    fi
}

# Step 1: Stop all services
echo ""
echo "Step 1: Stopping all existing services..."
echo "-----------------------------------------"

# Kill Node.js server
kill_process "node.*index.js"
kill_process "node index.js"

# Kill Flask server
kill_process "flask run"
kill_process "python.*app.py"

# Check and clear ports
check_port 3000
check_port 7777

echo "All services stopped."

# Step 2: Start Flask service
echo ""
echo "Step 2: Starting Flask Purchase Agent Service..."
echo "------------------------------------------------"

cd /Users/sambrewer/Desktop/Partner+/manual-purchase-agent_20250513_125500_v15.6

# Activate virtual environment and start Flask
source venv/bin/activate

# Load environment variables from the main project
if [ -f "../.env" ]; then
    echo "Loading environment variables from .env file..."
    export $(cat ../.env | grep -v '^#' | xargs)
fi

export FLASK_APP=app.py
export PYTHONPATH=.

# Verify environment variables are set
if [ -z "$SERPAPI_KEY" ]; then
    echo "⚠️  WARNING: SERPAPI_KEY not set - image search will fail"
else
    echo "✓ SERPAPI_KEY is set"
fi

if [ -z "$OPENAI_API_KEY" ]; then
    echo "⚠️  WARNING: OPENAI_API_KEY not set - AI features will fail"
else
    echo "✓ OPENAI_API_KEY is set"
fi

# Start Flask in background
flask run --host=0.0.0.0 --port=7777 > flask.log 2>&1 &
FLASK_PID=$!

echo "Flask service starting (PID: $FLASK_PID)..."

# Wait for Flask to start
for i in {1..10}; do
    if curl -s http://localhost:7777/api/system/health >/dev/null; then
        echo "✅ Flask service is running!"
        break
    fi
    echo "Waiting for Flask to start... ($i/10)"
    sleep 2
done

# Step 3: Start Node.js server
echo ""
echo "Step 3: Starting Node.js PartnerPlus Server..."
echo "----------------------------------------------"

cd /Users/sambrewer/Desktop/Partner+

# Start Node.js server
node index.js > node.log 2>&1 &
NODE_PID=$!

echo "Node.js server starting (PID: $NODE_PID)..."

# Wait for Node.js to start
sleep 3

# Step 4: Verify services
echo ""
echo "Step 4: Verifying services..."
echo "-----------------------------"

# Check Flask
if curl -s http://localhost:7777/api/system/health >/dev/null; then
    echo "✅ Flask Purchase Agent API: Running on http://localhost:7777"
else
    echo "❌ Flask Purchase Agent API: Not responding"
fi

# Check Node.js
if curl -s http://localhost:3000 >/dev/null; then
    echo "✅ PartnerPlus Server: Running on http://localhost:3000"
else
    echo "❌ PartnerPlus Server: Not responding"
fi

echo ""
echo "==================================="
echo "Service Status Complete"
echo "==================================="
echo ""
echo "Access PartnerPlus at: http://localhost:3000"
echo "Purchase Agent at: http://localhost:3000/purchase-agent"
echo ""
echo "To view logs:"
echo "  Flask logs: tail -f /Users/sambrewer/Desktop/Partner+/manual-purchase-agent_20250513_125500_v15.6/flask.log"
echo "  Node logs: tail -f /Users/sambrewer/Desktop/Partner+/node.log"
echo ""
echo "To stop all services, run: pkill -f 'flask|node'"