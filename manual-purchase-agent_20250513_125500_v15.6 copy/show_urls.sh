#!/bin/bash

# Helper script to show service URLs without starting services

echo "📱 Manual Purchase Agent Service URLs"
echo "===================================="

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
echo "🖥️  Local Access (this computer):"
echo "   V3 Interface: http://localhost:7777/static/api-demo/v3/"
echo "   Flask API: http://localhost:7777"
echo "   Playwright API: http://localhost:3001"

if [ ! -z "$LOCAL_IP" ]; then
    echo ""
    echo "🌐 Network Access (other devices on your network):"
    echo "   V3 Interface: http://$LOCAL_IP:7777/static/api-demo/v3/"
    echo "   Flask API: http://$LOCAL_IP:7777"
    echo "   Playwright API: http://$LOCAL_IP:3001"
    echo ""
    echo "📱 Mobile Access:"
    echo "   Open this URL on your phone to access the V3 interface:"
    echo "   http://$LOCAL_IP:7777/static/api-demo/v3/"
else
    echo ""
    echo "⚠️  Could not detect network IP address"
    echo "   You may need to check your network settings"
fi

echo ""
echo "🔧 Service Status:"
echo -n "   Flask API: "
if curl -s http://localhost:7777/api/system/health > /dev/null 2>&1; then
    echo "✅ Running"
else
    echo "❌ Not running (run ./start_services.sh to start)"
fi

echo -n "   Playwright API: "
if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
    echo "✅ Running"
else
    echo "❌ Not running (run ./start_services.sh to start)"
fi

echo ""
echo "💡 Tips:"
echo "   - Use ./start_services.sh to start all services"
echo "   - Use the network URLs to access from other devices"
echo "   - Make sure your firewall allows connections on ports 7777 and 3001"
echo ""