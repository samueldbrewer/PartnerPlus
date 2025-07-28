#!/bin/bash

# PartnerPlus Services Stop Script
# This script cleanly stops all services

echo "==================================="
echo "Stopping PartnerPlus Services"
echo "==================================="
echo ""

# Function to kill processes
kill_process() {
    local process_name=$1
    local display_name=$2
    echo -n "Stopping $display_name... "
    
    # Check if process is running
    if pgrep -f "$process_name" > /dev/null; then
        # Try graceful kill first
        pkill -f "$process_name" 2>/dev/null
        sleep 1
        
        # Force kill if still running
        if pgrep -f "$process_name" > /dev/null; then
            pkill -9 -f "$process_name" 2>/dev/null
            echo "✓ (force killed)"
        else
            echo "✓"
        fi
    else
        echo "not running"
    fi
}

# Stop Node.js server
kill_process "node.*index.js" "Node.js PartnerPlus Server"

# Stop Flask server
kill_process "flask run" "Flask Purchase Agent Service"
kill_process "python.*app.py" "Python Flask App"

# Clear ports
echo ""
echo "Clearing ports..."
for port in 3000 7777; do
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        echo "Clearing port $port..."
        kill -9 $(lsof -t -i:$port) 2>/dev/null
    fi
done

echo ""
echo "==================================="
echo "All services stopped"
echo "==================================="