#!/bin/bash

echo "🔄 Restarting SP5Proxy API Server on VPS..."
echo ""

# SSH connection details
VPS_IP="168.231.82.24"
VPS_USER="root"

# Commands to run on VPS
COMMANDS='
cd /root/sp5proxy
echo "📍 Current directory: $(pwd)"
echo ""

echo "🔍 Checking PM2 processes..."
pm2 list
echo ""

echo "🛑 Stopping API server..."
pm2 stop sp5proxy-api
echo ""

echo "🚀 Starting API server..."
pm2 start src/api-server.js --name sp5proxy-api
echo ""

echo "💾 Saving PM2 configuration..."
pm2 save
echo ""

echo "📊 Final PM2 status..."
pm2 list
echo ""

echo "📋 API server logs (last 20 lines)..."
pm2 logs sp5proxy-api --lines 20 --nostream
'

# Execute commands on VPS
echo "🔐 Connecting to VPS at $VPS_IP..."
echo "Please enter the root password when prompted:"
echo ""

ssh $VPS_USER@$VPS_IP "$COMMANDS"

echo ""
echo "✅ VPS API restart script completed!"
echo ""
echo "To check if API is working, run:"
echo "curl http://168.231.82.24:3002/api/status" 