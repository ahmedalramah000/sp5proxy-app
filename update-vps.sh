#!/bin/bash

# Update VPS API Server with new endpoints

echo "🔄 Updating SP5Proxy API on VPS..."

# Commands to run on VPS
COMMANDS="
cd /opt/sp5proxy
echo '📥 Pulling latest code from GitHub...'
git pull origin main
echo '🔄 Restarting API server...'
pm2 restart sp5proxy-api
echo '✅ API server updated and restarted!'
pm2 status
"

echo "Please run these commands on your VPS:"
echo "======================================="
echo "$COMMANDS"
echo "======================================="
echo ""
echo "Or use PuTTY/SSH client to connect to 168.231.82.24"
echo "Password: 8n/HZ,l/DeHmzP2A4@r)" 