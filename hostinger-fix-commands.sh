#!/bin/bash
# SP5Proxy Fix Script for Hostinger Terminal

echo "🔧 Starting SP5Proxy Services Fix..."
echo "===================================="

# Step 1: Check where we are
echo -e "\n📍 Current location:"
pwd

# Step 2: Go to project directory
echo -e "\n📁 Going to project directory..."
cd /root/sp5proxy || { echo "❌ Project directory not found!"; exit 1; }
pwd

# Step 3: Check PM2 status
echo -e "\n📊 Current PM2 status:"
pm2 list

# Step 4: Stop everything
echo -e "\n🛑 Stopping all services..."
pm2 stop all
pm2 delete all

# Step 5: Start Admin Panel
echo -e "\n🚀 Starting Admin Panel..."
cd admin-panel
pm2 start server.js --name sp5proxy-admin -- --port 8080
cd ..

# Step 6: Start API Server
echo -e "\n🚀 Starting API Server..."
pm2 start src/api-server.js --name sp5proxy-api

# Step 7: Start Web Server
echo -e "\n🚀 Starting Web Server..."
pm2 start server-web.js --name sp5proxy-web

# Step 8: Save PM2
echo -e "\n💾 Saving PM2 configuration..."
pm2 save

# Step 9: Show final status
echo -e "\n✅ Final status:"
pm2 list

echo -e "\n🌐 Services should be running at:"
echo "   Admin Panel: http://168.231.82.24:8080"
echo "   API Server:  http://168.231.82.24:3002"
echo "   Web App:     http://168.231.82.24:3000" 