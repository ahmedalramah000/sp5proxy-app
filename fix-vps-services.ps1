# SP5Proxy VPS Services Fix Script
Write-Host "🔧 SP5Proxy VPS Services Fix Script" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""

$VPS_IP = "168.231.82.24"
$VPS_USER = "root"

Write-Host "📡 Testing VPS connectivity..." -ForegroundColor Yellow
$ping = Test-NetConnection -ComputerName $VPS_IP -Port 22 -WarningAction SilentlyContinue

if ($ping.TcpTestSucceeded) {
    Write-Host "✅ SSH connection available" -ForegroundColor Green
} else {
    Write-Host "❌ Cannot connect to VPS via SSH" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🔐 Please enter the VPS root password when prompted" -ForegroundColor Yellow
Write-Host ""

# Commands to fix services
$commands = @'
echo "🔍 Checking system status..."
echo "=========================="

# Check if services directories exist
echo ""
echo "📁 Checking directories..."
ls -la /root/sp5proxy 2>/dev/null || echo "❌ SP5Proxy directory not found!"

# Check PM2 status
echo ""
echo "📊 PM2 Status:"
pm2 list

# Stop all services
echo ""
echo "🛑 Stopping all services..."
pm2 stop all
pm2 delete all

# Check for port usage
echo ""
echo "🔍 Checking port usage..."
netstat -tlnp | grep -E ':(8080|3002|3000)' || echo "No services running on expected ports"

# Kill any processes using the ports
echo ""
echo "🔪 Killing processes on ports..."
fuser -k 8080/tcp 2>/dev/null || true
fuser -k 3002/tcp 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true

# Navigate to project directory
cd /root/sp5proxy || { echo "❌ Cannot find project directory!"; exit 1; }

# Start Admin Panel
echo ""
echo "🚀 Starting Admin Panel..."
cd admin-panel
pm2 start server.js --name sp5proxy-admin -- --port 8080
cd ..

# Start API Server
echo ""
echo "🚀 Starting API Server..."
pm2 start src/api-server.js --name sp5proxy-api

# Start Web Server
echo ""
echo "🚀 Starting Web Server..."
pm2 start server-web.js --name sp5proxy-web

# Save PM2 configuration
echo ""
echo "💾 Saving PM2 configuration..."
pm2 save
pm2 startup

# Show final status
echo ""
echo "📊 Final PM2 Status:"
pm2 list

# Check ports again
echo ""
echo "🔍 Checking active ports..."
netstat -tlnp | grep -E ':(8080|3002|3000)' || echo "⚠️ Services may not be listening!"

# Show logs
echo ""
echo "📋 Recent logs:"
pm2 logs --lines 10 --nostream

echo ""
echo "✅ Service restart completed!"
echo ""
echo "🌐 Services should be available at:"
echo "   Admin Panel: http://168.231.82.24:8080"
echo "   API Server:  http://168.231.82.24:3002"
echo "   Web App:     http://168.231.82.24:3000"
'@

# Execute on VPS
try {
    # Using plink for Windows (if available)
    if (Get-Command plink -ErrorAction SilentlyContinue) {
        Write-Host "Using PuTTY plink..." -ForegroundColor Yellow
        echo $commands | plink -ssh $VPS_USER@$VPS_IP -pw (Read-Host -AsSecureString "Password" | ConvertFrom-SecureString -AsPlainText)
    } else {
        # Fallback to manual SSH
        Write-Host "📝 Manual SSH required. Copy and run these commands:" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "ssh $VPS_USER@$VPS_IP" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Then paste these commands:" -ForegroundColor Yellow
        Write-Host $commands -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Error: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "📝 Please run manually:" -ForegroundColor Yellow
    Write-Host "ssh $VPS_USER@$VPS_IP" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "🔍 After running the commands, test the services:" -ForegroundColor Green
Write-Host "   Invoke-WebRequest -Uri 'http://168.231.82.24:8080' -UseBasicParsing" -ForegroundColor Gray
Write-Host "   Invoke-WebRequest -Uri 'http://168.231.82.24:3002/api/status' -UseBasicParsing" -ForegroundColor Gray 