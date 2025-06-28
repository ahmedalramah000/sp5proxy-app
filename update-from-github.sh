#!/bin/bash
# Update SP5Proxy from GitHub on VPS

echo "🔄 Updating SP5Proxy from GitHub..."
echo "==================================="

# Step 1: Go to project directory
cd /root/sp5proxy || { echo "❌ Project directory not found!"; exit 1; }

# Step 2: Show current branch and status
echo -e "\n📍 Current Git status:"
git branch
git status

# Step 3: Backup current config files
echo -e "\n💾 Backing up config files..."
cp config/app-config.json config/app-config.json.backup 2>/dev/null || true
cp config-web.js config-web.js.backup 2>/dev/null || true

# Step 4: Pull latest changes
echo -e "\n📥 Pulling latest changes from GitHub..."
git pull origin main

# Step 5: Install any new dependencies
echo -e "\n📦 Installing dependencies..."
npm install

# Step 6: Restart services
echo -e "\n🔄 Restarting all services..."
pm2 stop all
pm2 delete all

# Start Admin Panel
cd admin-panel
pm2 start server.js --name sp5proxy-admin -- --port 8080
cd ..

# Start API Server
pm2 start src/api-server.js --name sp5proxy-api

# Start Web Server
pm2 start server-web.js --name sp5proxy-web

# Save PM2 configuration
pm2 save

# Step 7: Show final status
echo -e "\n✅ Update completed! Current status:"
pm2 list

echo -e "\n🌐 Services running at:"
echo "   Admin Panel: http://168.231.82.24:8080"
echo "   API Server:  http://168.231.82.24:3002"
echo "   Web App:     http://168.231.82.24:3000" 