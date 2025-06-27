#!/bin/bash

# SP5Proxy Application Deployment Script for Ubuntu 22.04 VPS
# Automatically sets up and deploys SP5Proxy with admin panel
# Configures domains: sp5proxyapp.com and admin.sp5proxyapp.com with SSL

set -euo pipefail

# ============================================================================
# CONFIGURATION VARIABLES
# ============================================================================
VPS_IP="168.231.82.24"
SSH_PORT="22"
DOMAIN_MAIN="sp5proxyapp.com"
DOMAIN_ADMIN="admin.sp5proxyapp.com"
SSL_EMAIL="admin@sp5proxyapp.com"

# Repository Configuration
REPO_URL="https://github.com/ahmedalramah000/sp5proxy-app.git"
REPO_BRANCH="main"
GITHUB_USERNAME="${GITHUB_USERNAME:-ahmedalramah000}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
SSH_DEPLOY_KEY="${SSH_DEPLOY_KEY:-}"

# Application Configuration
APP_DIR="/opt/sp5proxy"
WEB_ROOT="/var/www"
ADMIN_PORT="3000"
NODE_VERSION="18"
INSTALLER_NAME="SP5Proxy-Desktop-Setup.exe"

# Security Configuration
WEB_USER="www-data"
APP_USER="sp5proxy"

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================
log() {
    echo "🛠️  $1"
}

success() {
    echo "✅ $1"
}

error() {
    echo "❌ $1" >&2
    exit 1
}

validate_installer() {
    local installer_path="$1"
    if [ -f "$installer_path" ]; then
        local file_size=$(stat -c%s "$installer_path")
        if [ "$file_size" -gt 1048576 ]; then  # > 1MB
            success "Windows installer found: $(basename "$installer_path") ($(numfmt --to=iec "$file_size"))"
            return 0
        else
            log "Warning: Installer file is too small ($(numfmt --to=iec "$file_size")), may be corrupted"
            return 1
        fi
    else
        log "Windows installer not found at: $installer_path"
        return 1
    fi
}

setup_repository_auth() {
    log "Setting up repository authentication..."

    if [ -n "$SSH_DEPLOY_KEY" ]; then
        log "Configuring SSH deploy key authentication..."
        mkdir -p /root/.ssh
        echo "$SSH_DEPLOY_KEY" > /root/.ssh/sp5proxy_deploy_key
        chmod 600 /root/.ssh/sp5proxy_deploy_key

        # Configure SSH to use the deploy key
        cat >> /root/.ssh/config << EOF
Host github.com
    HostName github.com
    User git
    IdentityFile /root/.ssh/sp5proxy_deploy_key
    StrictHostKeyChecking no
EOF

        # Convert HTTPS URL to SSH
        REPO_URL=$(echo "$REPO_URL" | sed 's|https://github.com/|git@github.com:|')
        success "SSH deploy key configured"

    elif [ -n "$GITHUB_TOKEN" ] && [ -n "$GITHUB_USERNAME" ]; then
        log "Configuring GitHub token authentication..."
        REPO_URL="https://${GITHUB_USERNAME}:${GITHUB_TOKEN}@github.com/ahmedalramah000/sp5proxy-app.git"
        success "GitHub token authentication configured"

    else
        log "Using public repository access (no authentication)"
    fi
}

create_app_user() {
    log "Creating application user..."
    if ! id "$APP_USER" &>/dev/null; then
        useradd -r -s /bin/false -d "$APP_DIR" "$APP_USER"
        success "Application user '$APP_USER' created"
    else
        log "Application user '$APP_USER' already exists"
    fi
}

# ============================================================================
# SYSTEM SETUP & DEPENDENCIES
# ============================================================================
log "Starting SP5Proxy deployment on Ubuntu 22.04..."

# Create application user first
create_app_user

# Update system packages
log "Updating system packages..."
apt update && apt upgrade -y
success "System packages updated"

# Install essential dependencies
log "Installing essential dependencies..."
apt install -y curl git build-essential sqlite3 libsqlite3-dev ufw nginx certbot python3-certbot-nginx \
    logrotate fail2ban htop tree unzip wget gnupg2 software-properties-common
success "Essential dependencies installed"

# Install Node.js LTS
log "Installing Node.js ${NODE_VERSION}..."
curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
apt install -y nodejs
success "Node.js $(node --version) installed"

# Install PM2 globally
log "Installing PM2 process manager..."
npm install -g pm2
success "PM2 installed globally"

# Setup repository authentication
setup_repository_auth

# ============================================================================
# CODE DEPLOYMENT
# ============================================================================
log "Deploying SP5Proxy application code..."

# Create application directory
mkdir -p "$APP_DIR"
cd "$APP_DIR"

# Clone or update repository with error handling
if [ -d ".git" ]; then
    log "Updating existing repository..."
    if ! git pull origin "$REPO_BRANCH" 2>/dev/null; then
        error "Failed to update repository. Check authentication and network connectivity."
    fi
else
    log "Cloning repository..."
    if ! git clone "$REPO_URL" . 2>/dev/null; then
        error "Failed to clone repository. Check URL, authentication, and network connectivity."
    fi

    # Switch to specified branch if not main/master
    if [ "$REPO_BRANCH" != "main" ] && [ "$REPO_BRANCH" != "master" ]; then
        git checkout "$REPO_BRANCH" || error "Failed to checkout branch: $REPO_BRANCH"
    fi
fi
success "Repository deployed to $APP_DIR"

# Verify essential files exist
if [ ! -f "package.json" ]; then
    error "package.json not found in repository root"
fi

if [ ! -d "admin-panel" ] || [ ! -f "admin-panel/package.json" ]; then
    error "admin-panel directory or package.json not found"
fi

# Install root dependencies
log "Installing root dependencies..."
if ! npm ci --omit=dev; then
    error "Failed to install root dependencies"
fi
success "Root dependencies installed"

# Install admin panel dependencies
log "Installing admin panel dependencies..."
cd admin-panel
if ! npm ci; then
    error "Failed to install admin panel dependencies"
fi
cd ..
success "Admin panel dependencies installed"

# Set proper ownership
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
success "Application ownership configured"

# ============================================================================
# ENVIRONMENT CONFIGURATION
# ============================================================================
log "Setting up secure environment variables..."

# Create secure environment file
cat > /etc/profile.d/sp5proxy.sh << EOF
# SP5Proxy Environment Configuration
export NODE_ENV=production
export PORT=${ADMIN_PORT}
export HOST=127.0.0.1
export VPS_DOMAIN=${DOMAIN_ADMIN}
export SSL_ENABLED=true
export SESSION_SECRET=\$(openssl rand -hex 32)
export DB_PATH=${APP_DIR}/admin-panel/data/sp5proxy.db
export LOG_LEVEL=info
export MAX_CONNECTIONS=100
export BACKUP_RETENTION_DAYS=30
EOF

# Set secure permissions on environment file
chmod 644 /etc/profile.d/sp5proxy.sh

# Create application-specific environment file
cat > "$APP_DIR/.env" << EOF
NODE_ENV=production
PORT=${ADMIN_PORT}
HOST=127.0.0.1
VPS_DOMAIN=${DOMAIN_ADMIN}
SSL_ENABLED=true
SESSION_SECRET=$(openssl rand -hex 32)
DB_PATH=${APP_DIR}/admin-panel/data/sp5proxy.db
LOG_LEVEL=info
MAX_CONNECTIONS=100
BACKUP_RETENTION_DAYS=30
EOF

# Secure the .env file
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

source /etc/profile.d/sp5proxy.sh
success "Secure environment variables configured"

# ============================================================================
# APPLICATION CONFIGURATION
# ============================================================================
log "Configuring SP5Proxy application..."

# Ensure admin panel data directory exists
mkdir -p "$APP_DIR/admin-panel/data"

# Create PM2 ecosystem configuration
cat > "$APP_DIR/ecosystem.config.js" << EOF
module.exports = {
  apps: [{
    name: 'sp5proxy-admin',
    script: './admin-panel/server.js',
    cwd: '$APP_DIR',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: $ADMIN_PORT,
      HOST: '127.0.0.1'
    }
  }]
};
EOF

# Start admin panel with PM2
log "Starting admin panel with PM2..."
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root
success "Admin panel started and configured for auto-start"

# ============================================================================
# WEB SERVER SETUP
# ============================================================================
log "Configuring Nginx web server with security enhancements..."

# Backup existing nginx configuration
if [ -f /etc/nginx/sites-enabled/default ]; then
    cp /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/default.backup
fi

# Add rate limiting to nginx.conf
if ! grep -q "limit_req_zone" /etc/nginx/nginx.conf; then
    sed -i '/http {/a\\n\t# Rate limiting zones\n\tlimit_req_zone $binary_remote_addr zone=download:10m rate=2r/m;\n\tlimit_req_zone $binary_remote_addr zone=api:10m rate=10r/m;\n\tlimit_req_zone $binary_remote_addr zone=admin:10m rate=30r/m;\n' /etc/nginx/nginx.conf
fi

# Configure proper MIME types for downloads
cat >> /etc/nginx/mime.types << 'EOF'
application/octet-stream    exe;
application/x-msdownload    exe;
EOF

# Create main domain configuration with security headers
cat > "/etc/nginx/sites-available/$DOMAIN_MAIN" << EOF
server {
    listen 80;
    server_name $DOMAIN_MAIN www.$DOMAIN_MAIN;
    root $WEB_ROOT/$DOMAIN_MAIN;
    index index.html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self';" always;

    # Hide nginx version
    server_tokens off;

    # Main site
    location / {
        try_files \$uri \$uri/ =404;

        # Cache static assets
        location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Downloads with security and logging
    location /downloads/ {
        alias $WEB_ROOT/$DOMAIN_MAIN/downloads/;
        autoindex off;

        # Security for executable files
        location ~* \.exe$ {
            add_header Content-Type "application/octet-stream";
            add_header Content-Disposition "attachment";
            add_header X-Content-Type-Options "nosniff";

            # Rate limiting for downloads
            limit_req zone=download burst=5 nodelay;

            # Log downloads
            access_log /var/log/nginx/sp5proxy_downloads.log combined;
        }

        # Block access to sensitive files
        location ~* \.(txt|log|conf)$ {
            deny all;
        }
    }

    # API endpoint for download tracking
    location /api/track-download {
        try_files \$uri /api-track.php;

        # Rate limiting for API
        limit_req zone=api burst=10 nodelay;
    }

    # Block access to hidden files and directories
    location ~ /\. {
        deny all;
    }

    # Block access to backup files
    location ~* \.(bak|backup|old|orig|save|swp|tmp)$ {
        deny all;
    }
}
EOF

# Create admin domain configuration with enhanced security
cat > "/etc/nginx/sites-available/$DOMAIN_ADMIN" << EOF
server {
    listen 80;
    server_name $DOMAIN_ADMIN;

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:;" always;

    # Hide nginx version
    server_tokens off;

    # Rate limiting for admin panel
    limit_req zone=admin burst=20 nodelay;

    location / {
        # Additional security for admin panel
        proxy_pass http://127.0.0.1:$ADMIN_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;

        # Buffer settings for better performance
        proxy_buffering on;
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
    }

    # Block access to sensitive admin files
    location ~* \.(log|conf|db|sql|bak)$ {
        deny all;
    }

    # Admin panel specific logging
    access_log /var/log/nginx/sp5proxy_admin.log combined;
    error_log /var/log/nginx/sp5proxy_admin_error.log;
}
EOF

# Enable sites
ln -sf "/etc/nginx/sites-available/$DOMAIN_MAIN" "/etc/nginx/sites-enabled/"
ln -sf "/etc/nginx/sites-available/$DOMAIN_ADMIN" "/etc/nginx/sites-enabled/"

# Remove default site if it exists
rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
nginx -t
success "Nginx configuration validated"

# ============================================================================
# STATIC WEBSITE SETUP
# ============================================================================
log "Setting up enhanced static landing page..."

# Create web directories with proper structure
mkdir -p "$WEB_ROOT/$DOMAIN_MAIN"/{downloads,assets,logs}

# Create enhanced landing page with responsive design
cat > "$WEB_ROOT/$DOMAIN_MAIN/index.html" << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="SP5Proxy - Professional system-wide proxy application for Windows. Route all traffic through SOCKS5/HTTP proxies with advanced security features.">
    <meta name="keywords" content="proxy, socks5, http proxy, windows, vpn, network, security">
    <meta name="author" content="SP5Proxy Team">
    <title>SP5Proxy - Professional System-wide Proxy Application</title>
    <link rel="icon" type="image/x-icon" href="/assets/favicon.ico">
    <style>
        :root {
            --primary-color: #667eea;
            --secondary-color: #764ba2;
            --accent-color: #ff6b6b;
            --text-light: #ffffff;
            --text-dark: #333333;
            --shadow: rgba(0,0,0,0.2);
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
            color: var(--text-light);
            min-height: 100vh;
            line-height: 1.6;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
        }

        .hero {
            text-align: center;
            margin-bottom: 4rem;
        }

        .logo {
            width: 120px;
            height: 120px;
            margin: 0 auto 2rem;
            background: var(--text-light);
            border-radius: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 3rem;
            color: var(--primary-color);
            box-shadow: 0 10px 30px var(--shadow);
        }

        h1 {
            font-size: clamp(2.5rem, 5vw, 4rem);
            margin-bottom: 1rem;
            text-shadow: 2px 2px 4px var(--shadow);
            font-weight: 700;
        }

        .subtitle {
            font-size: clamp(1.1rem, 2.5vw, 1.4rem);
            margin-bottom: 3rem;
            opacity: 0.9;
            max-width: 600px;
            margin-left: auto;
            margin-right: auto;
        }

        .download-section {
            margin-bottom: 4rem;
        }

        .download-btn {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            background: var(--accent-color);
            color: var(--text-light);
            padding: 18px 36px;
            text-decoration: none;
            border-radius: 50px;
            font-size: 1.2rem;
            font-weight: bold;
            transition: all 0.3s ease;
            box-shadow: 0 8px 25px var(--shadow);
            position: relative;
            overflow: hidden;
        }

        .download-btn:hover {
            background: #ff5252;
            transform: translateY(-3px);
            box-shadow: 0 12px 35px var(--shadow);
        }

        .download-btn::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
            transition: left 0.5s;
        }

        .download-btn:hover::before {
            left: 100%;
        }

        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 2rem;
            width: 100%;
            max-width: 800px;
        }

        .feature {
            background: rgba(255,255,255,0.1);
            padding: 2rem;
            border-radius: 15px;
            text-align: center;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.2);
            transition: transform 0.3s ease;
        }

        .feature:hover {
            transform: translateY(-5px);
        }

        .feature-icon {
            font-size: 3rem;
            margin-bottom: 1rem;
            display: block;
        }

        .feature h3 {
            font-size: 1.3rem;
            margin-bottom: 0.5rem;
        }

        .feature p {
            opacity: 0.8;
            font-size: 0.95rem;
        }

        .system-requirements {
            margin-top: 3rem;
            text-align: center;
            opacity: 0.7;
            font-size: 0.9rem;
        }

        .footer {
            margin-top: 4rem;
            text-align: center;
            opacity: 0.6;
            font-size: 0.85rem;
        }

        @media (max-width: 768px) {
            .container { padding: 1rem; }
            .features { grid-template-columns: 1fr; }
            .download-btn { padding: 15px 30px; font-size: 1.1rem; }
        }

        .download-info {
            margin-top: 1rem;
            font-size: 0.9rem;
            opacity: 0.8;
        }

        .status-indicator {
            display: inline-block;
            width: 8px;
            height: 8px;
            background: #4CAF50;
            border-radius: 50%;
            margin-right: 0.5rem;
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="hero">
            <div class="logo">🛡️</div>
            <h1>SP5Proxy</h1>
            <p class="subtitle">Professional system-wide proxy application for Windows. Route all network traffic through SOCKS5/HTTP proxies with enterprise-grade security and performance.</p>
        </div>

        <div class="download-section">
            <a href="/downloads/SP5Proxy-Desktop-Setup.exe" class="download-btn" onclick="trackDownload()">
                <span>📥</span>
                Download for Windows
            </a>
            <div class="download-info">
                <span class="status-indicator"></span>
                Latest version • Windows 10/11 • Free download
            </div>
        </div>

        <div class="features">
            <div class="feature">
                <span class="feature-icon">🔒</span>
                <h3>Secure Routing</h3>
                <p>Advanced encryption and secure proxy protocols to protect your network traffic</p>
            </div>
            <div class="feature">
                <span class="feature-icon">🌐</span>
                <h3>System-wide Coverage</h3>
                <p>Captures and routes all system traffic through your configured proxy servers</p>
            </div>
            <div class="feature">
                <span class="feature-icon">⚡</span>
                <h3>High Performance</h3>
                <p>Optimized networking stack for minimal latency and maximum throughput</p>
            </div>
            <div class="feature">
                <span class="feature-icon">🛡️</span>
                <h3>Enterprise Security</h3>
                <p>Professional-grade security features with comprehensive logging and monitoring</p>
            </div>
        </div>

        <div class="system-requirements">
            <strong>System Requirements:</strong> Windows 10/11 (64-bit) • 4GB RAM • 100MB disk space • Administrator privileges
        </div>

        <div class="footer">
            <p>&copy; 2024 SP5Proxy Team. All rights reserved. | <a href="https://admin.sp5proxyapp.com" style="color: inherit;">Admin Panel</a></p>
        </div>
    </div>

    <script>
        function trackDownload() {
            // Track download analytics
            if (typeof gtag !== 'undefined') {
                gtag('event', 'download', {
                    'event_category': 'installer',
                    'event_label': 'windows'
                });
            }

            // Log download attempt
            fetch('/api/track-download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    timestamp: new Date().toISOString(),
                    userAgent: navigator.userAgent,
                    referrer: document.referrer
                })
            }).catch(() => {}); // Fail silently
        }
    </script>
</body>
</html>
EOF

# Create download tracking endpoint
cat > "$WEB_ROOT/$DOMAIN_MAIN/api-track.php" << 'EOF'
<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $logEntry = [
        'timestamp' => $data['timestamp'] ?? date('c'),
        'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
        'userAgent' => $data['userAgent'] ?? $_SERVER['HTTP_USER_AGENT'] ?? 'unknown',
        'referrer' => $data['referrer'] ?? $_SERVER['HTTP_REFERER'] ?? 'direct'
    ];

    file_put_contents('/var/www/sp5proxyapp.com/logs/downloads.log',
        json_encode($logEntry) . "\n", FILE_APPEND | LOCK_EX);

    echo json_encode(['status' => 'logged']);
} else {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
}
?>
EOF

# Find and copy Windows installer with validation
INSTALLER_FOUND=false
INSTALLER_PATHS=(
    "$APP_DIR/dist-new/SP5Proxy Desktop Setup.exe"
    "$APP_DIR/dist-new/$INSTALLER_NAME"
    "$APP_DIR/dist/SP5Proxy Desktop Setup.exe"
    "$APP_DIR/dist/$INSTALLER_NAME"
    "$APP_DIR/build/SP5Proxy Desktop Setup.exe"
    "$APP_DIR/build/$INSTALLER_NAME"
)

for installer_path in "${INSTALLER_PATHS[@]}"; do
    if validate_installer "$installer_path"; then
        cp "$installer_path" "$WEB_ROOT/$DOMAIN_MAIN/downloads/$INSTALLER_NAME"
        INSTALLER_FOUND=true
        break
    fi
done

if [ "$INSTALLER_FOUND" = false ]; then
    log "⚠️  Windows installer not found in repository"
    log "📝 Manual upload required to: $WEB_ROOT/$DOMAIN_MAIN/downloads/$INSTALLER_NAME"

    # Create placeholder file with instructions
    cat > "$WEB_ROOT/$DOMAIN_MAIN/downloads/README.txt" << EOF
Windows Installer Upload Instructions
====================================

Please upload the SP5Proxy Windows installer to this directory:
$WEB_ROOT/$DOMAIN_MAIN/downloads/$INSTALLER_NAME

The installer should be:
- A valid Windows executable (.exe)
- Larger than 1MB in size
- Named exactly: $INSTALLER_NAME

After uploading, verify the download link works at:
https://$DOMAIN_MAIN/downloads/$INSTALLER_NAME
EOF
fi

# Set proper permissions and security
chown -R "$WEB_USER:$WEB_USER" "$WEB_ROOT/$DOMAIN_MAIN"
chmod -R 755 "$WEB_ROOT/$DOMAIN_MAIN"
chmod 644 "$WEB_ROOT/$DOMAIN_MAIN"/*.html
chmod 644 "$WEB_ROOT/$DOMAIN_MAIN"/*.php
chmod 755 "$WEB_ROOT/$DOMAIN_MAIN/downloads"
chmod 644 "$WEB_ROOT/$DOMAIN_MAIN/downloads"/*
chmod 755 "$WEB_ROOT/$DOMAIN_MAIN/logs"

success "Enhanced landing page and download structure configured"

# Reload nginx
nginx -s reload
success "Nginx reloaded with new configuration"

# ============================================================================
# SSL & SECURITY SETUP
# ============================================================================
log "Configuring SSL certificates and security..."

# Configure firewall
log "Setting up UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 'Nginx Full'
ufw --force enable
success "Firewall configured"

# Generate SSL certificates
log "Generating SSL certificates with Let's Encrypt..."
certbot --nginx -d "$DOMAIN_MAIN" -d "www.$DOMAIN_MAIN" --email "$SSL_EMAIL" --agree-tos --non-interactive --redirect
certbot --nginx -d "$DOMAIN_ADMIN" --email "$SSL_EMAIL" --agree-tos --non-interactive --redirect
success "SSL certificates generated and configured"

# Set up automatic certificate renewal
log "Setting up automatic SSL certificate renewal..."
(crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet") | crontab -
success "Automatic SSL renewal configured"

# ============================================================================
# FINAL CONFIGURATION & CLEANUP
# ============================================================================
log "Performing final configuration..."

# Ensure PM2 is running
pm2 restart all
pm2 status

# Test nginx configuration one more time
nginx -t && nginx -s reload

# Create enhanced maintenance script
cat > "$APP_DIR/maintenance.sh" << 'EOF'
#!/bin/bash
# SP5Proxy Enhanced Maintenance Script

APP_DIR="/opt/sp5proxy"
WEB_ROOT="/var/www/sp5proxyapp.com"
BACKUP_DIR="/root/sp5proxy-backups"
LOG_DIR="/var/log/sp5proxy"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR" "$LOG_DIR"

case "$1" in
    status)
        echo "╔════════════════════════════════════════════════════════════════╗"
        echo "║                    SP5Proxy System Status                      ║"
        echo "╚════════════════════════════════════════════════════════════════╝"
        echo ""
        echo "=== PM2 Processes ==="
        pm2 status
        echo ""
        echo "=== System Services ==="
        systemctl status nginx --no-pager -l
        echo ""
        echo "=== SSL Certificates ==="
        certbot certificates
        echo ""
        echo "=== Disk Usage ==="
        df -h "$APP_DIR" "$WEB_ROOT"
        echo ""
        echo "=== Memory Usage ==="
        free -h
        echo ""
        echo "=== Download Statistics ==="
        if [ -f "$WEB_ROOT/logs/downloads.log" ]; then
            echo "Total downloads: $(wc -l < "$WEB_ROOT/logs/downloads.log")"
            echo "Recent downloads:"
            tail -5 "$WEB_ROOT/logs/downloads.log" | jq -r '.timestamp + " - " + .ip'
        else
            echo "No download logs found"
        fi
        ;;
    restart)
        echo "🔄 Restarting SP5Proxy services..."
        pm2 restart all
        nginx -t && nginx -s reload
        echo "✅ Services restarted successfully"
        ;;
    logs)
        case "$2" in
            app|admin)
                echo "=== SP5Proxy Admin Panel Logs ==="
                pm2 logs sp5proxy-admin --lines "${3:-50}"
                ;;
            nginx)
                echo "=== Nginx Access Logs ==="
                tail -n "${3:-50}" /var/log/nginx/sp5proxy_*.log
                ;;
            downloads)
                echo "=== Download Logs ==="
                if [ -f "$WEB_ROOT/logs/downloads.log" ]; then
                    tail -n "${3:-20}" "$WEB_ROOT/logs/downloads.log" | jq .
                else
                    echo "No download logs found"
                fi
                ;;
            *)
                echo "=== All PM2 Logs ==="
                pm2 logs --lines "${2:-50}"
                ;;
        esac
        ;;
    update)
        echo "🔄 Updating SP5Proxy application..."
        cd "$APP_DIR"

        # Create backup before update
        echo "📦 Creating pre-update backup..."
        "$0" backup "pre-update-$(date +%Y%m%d-%H%M%S)"

        # Update repository
        git fetch origin
        git pull origin main || git pull origin master

        # Update dependencies
        npm ci --omit=dev
        cd admin-panel && npm ci && cd ..

        # Restart services
        pm2 restart all

        echo "✅ Application updated successfully"
        ;;
    backup)
        BACKUP_NAME="${2:-backup-$(date +%Y%m%d-%H%M%S)}"
        BACKUP_FILE="$BACKUP_DIR/sp5proxy-$BACKUP_NAME.tar.gz"

        echo "📦 Creating backup: $BACKUP_NAME"

        tar -czf "$BACKUP_FILE" \
            --exclude="$APP_DIR/node_modules" \
            --exclude="$APP_DIR/admin-panel/node_modules" \
            --exclude="$APP_DIR/.git" \
            "$APP_DIR/admin-panel/data" \
            "$APP_DIR/config" \
            "$APP_DIR/ecosystem.config.js" \
            "/etc/nginx/sites-available/sp5proxyapp.com" \
            "/etc/nginx/sites-available/admin.sp5proxyapp.com" \
            "$WEB_ROOT/logs" \
            "/var/log/nginx/sp5proxy_*.log" 2>/dev/null

        echo "✅ Backup created: $BACKUP_FILE"
        echo "📊 Backup size: $(du -h "$BACKUP_FILE" | cut -f1)"

        # Clean old backups (keep last 10)
        ls -t "$BACKUP_DIR"/sp5proxy-*.tar.gz | tail -n +11 | xargs -r rm
        echo "🧹 Old backups cleaned (keeping last 10)"
        ;;
    restore)
        if [ -z "$2" ]; then
            echo "Available backups:"
            ls -la "$BACKUP_DIR"/sp5proxy-*.tar.gz 2>/dev/null || echo "No backups found"
            exit 1
        fi

        BACKUP_FILE="$BACKUP_DIR/sp5proxy-$2.tar.gz"
        if [ ! -f "$BACKUP_FILE" ]; then
            echo "❌ Backup file not found: $BACKUP_FILE"
            exit 1
        fi

        echo "⚠️  This will restore from backup: $2"
        read -p "Are you sure? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            pm2 stop all
            tar -xzf "$BACKUP_FILE" -C /
            pm2 restart all
            nginx -s reload
            echo "✅ Restore completed"
        else
            echo "❌ Restore cancelled"
        fi
        ;;
    monitor)
        echo "🔍 Starting real-time monitoring (Ctrl+C to exit)..."
        echo "Press 1 for PM2 monitor, 2 for logs, 3 for system stats"
        read -n 1 -r
        case $REPLY in
            1) pm2 monit ;;
            2) pm2 logs --raw ;;
            3) watch -n 2 'echo "=== System Stats ==="; free -h; echo; df -h; echo; pm2 status' ;;
            *) pm2 monit ;;
        esac
        ;;
    security)
        echo "🔒 Security Check Report"
        echo "======================="

        # Check file permissions
        echo "📁 File Permissions:"
        ls -la "$APP_DIR/admin-panel/data/"

        # Check SSL certificates
        echo "🔐 SSL Certificate Status:"
        certbot certificates | grep -E "(Certificate Name|Expiry Date)"

        # Check firewall status
        echo "🛡️  Firewall Status:"
        ufw status

        # Check for failed login attempts
        echo "🚨 Recent Failed Logins:"
        grep "Failed" /var/log/auth.log | tail -5 2>/dev/null || echo "No recent failures"
        ;;
    *)
        echo "SP5Proxy Maintenance Tool"
        echo "========================"
        echo "Usage: $0 {command} [options]"
        echo ""
        echo "Commands:"
        echo "  status              - Show system status"
        echo "  restart             - Restart all services"
        echo "  logs [type] [lines] - View logs (app|nginx|downloads)"
        echo "  update              - Update application"
        echo "  backup [name]       - Create backup"
        echo "  restore <name>      - Restore from backup"
        echo "  monitor             - Real-time monitoring"
        echo "  security            - Security status check"
        echo ""
        echo "Examples:"
        echo "  $0 logs app 100     - Show last 100 app log lines"
        echo "  $0 backup manual    - Create backup named 'manual'"
        echo "  $0 restore backup-20241201-120000"
        exit 1
        ;;
esac
EOF

chmod +x "$APP_DIR/maintenance.sh"
ln -sf "$APP_DIR/maintenance.sh" /usr/local/bin/sp5proxy

success "Maintenance script created at /usr/local/bin/sp5proxy"

# ============================================================================
# DEPLOYMENT SUMMARY
# ============================================================================
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    🎉 DEPLOYMENT COMPLETE! 🎉                  ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "🌐 Main Website:     https://$DOMAIN_MAIN"
echo "🔧 Admin Panel:      https://$DOMAIN_ADMIN"
echo "📊 Server IP:        $VPS_IP"
echo ""
echo "📋 Enhanced Management Commands:"
echo "   sp5proxy status              - Comprehensive system status"
echo "   sp5proxy restart             - Restart all services"
echo "   sp5proxy logs [type] [lines] - View logs (app|nginx|downloads)"
echo "   sp5proxy update              - Update application with backup"
echo "   sp5proxy backup [name]       - Create named backup"
echo "   sp5proxy restore <name>      - Restore from backup"
echo "   sp5proxy monitor             - Real-time monitoring dashboard"
echo "   sp5proxy security            - Security status check"
echo ""
echo "🔧 PM2 Commands:"
echo "   pm2 status         - View PM2 processes"
echo "   pm2 logs           - View real-time logs"
echo "   pm2 restart all    - Restart all processes"
echo "   pm2 monit          - Interactive process monitor"
echo ""
echo "📁 Important Paths:"
echo "   Application:       $APP_DIR"
echo "   Web Root:          $WEB_ROOT/$DOMAIN_MAIN"
echo "   Admin Database:    $APP_DIR/admin-panel/data/sp5proxy.db"
echo "   Nginx Config:      /etc/nginx/sites-available/"
echo "   Download Logs:     $WEB_ROOT/$DOMAIN_MAIN/logs/"
echo "   Backups:           /root/sp5proxy-backups/"
echo ""
echo "🔒 Security Features:"
echo "   ✅ SSL certificates configured and auto-renewing"
echo "   ✅ Firewall (UFW) enabled with secure rules"
echo "   ✅ Rate limiting on downloads and admin access"
echo "   ✅ Security headers configured"
echo "   ✅ Download tracking and logging"
echo "   ✅ Admin panel accessible only via HTTPS"
echo "   ✅ File permission security"
echo ""
echo "📊 Repository Configuration:"
if [ -n "$SSH_DEPLOY_KEY" ]; then
    echo "   ✅ SSH deploy key authentication configured"
elif [ -n "$GITHUB_TOKEN" ]; then
    echo "   ✅ GitHub token authentication configured"
else
    echo "   ✅ Public repository access configured"
fi
echo "   📂 Repository: $REPO_URL"
echo "   🌿 Branch: $REPO_BRANCH"
echo ""
echo "📝 Next Steps:"
if [ "$INSTALLER_FOUND" = false ]; then
    echo "   ⚠️  1. UPLOAD Windows installer to: $WEB_ROOT/$DOMAIN_MAIN/downloads/$INSTALLER_NAME"
else
    echo "   ✅ 1. Windows installer ready for download"
fi
echo "   2. Configure DNS A records for both domains to point to $VPS_IP"
echo "   3. Access admin panel at https://$DOMAIN_ADMIN"
echo "   4. Monitor system with: sp5proxy status"
echo "   5. Check download analytics: sp5proxy logs downloads"
echo "   6. Create regular backups: sp5proxy backup"
echo ""
success "SP5Proxy deployment completed successfully!"
