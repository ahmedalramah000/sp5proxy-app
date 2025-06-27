# SP5Proxy Desktop

**System-wide proxy application for Windows** - Route all network traffic through SOCKS5/HTTP proxies with enterprise-grade security and performance.

## 🚀 Features

- **System-wide Traffic Routing**: Captures and routes all system traffic through configured proxy servers
- **Advanced Security**: Professional-grade security features with comprehensive logging and monitoring
- **High Performance**: Optimized networking stack for minimal latency and maximum throughput
- **Admin Panel**: Web-based administration interface for monitoring and configuration
- **Multiple Proxy Support**: SOCKS5 and HTTP proxy protocols
- **Windows Integration**: Deep Windows system integration with TUN interface support

## 📋 System Requirements

- **OS**: Windows 10/11 (64-bit)
- **RAM**: 4GB minimum
- **Disk Space**: 100MB
- **Privileges**: Administrator privileges required
- **Network**: Internet connection for proxy functionality

## 🛠️ Installation

### Desktop Application
1. Download the latest installer from the releases page
2. Run the installer as Administrator
3. Follow the installation wizard
4. Launch SP5Proxy Desktop from the Start Menu

### VPS Deployment (Ubuntu 22.04)
For deploying the admin panel on a VPS:

```bash
# One-line deployment command
ssh root@YOUR_VPS_IP "curl -fsSL https://raw.githubusercontent.com/ahmedalramah000/sp5proxy-app/main/deploy_sp5proxyapp.sh | bash"
```

## 🏗️ Development

### Prerequisites
- Node.js 18+ LTS
- npm or yarn
- Git

### Setup
```bash
# Clone the repository
git clone https://github.com/ahmedalramah000/sp5proxy-app.git
cd sp5proxy-app

# Install dependencies
npm install

# Install admin panel dependencies
cd admin-panel
npm install
cd ..

# Start development
npm run start-dev
```

### Building
```bash
# Build React components
npm run build-react

# Build desktop application
npm run build

# Build for distribution
npm run dist
```

## 🌐 Admin Panel

The admin panel provides a web interface for:
- Real-time connection monitoring
- Proxy configuration management
- User session tracking
- System performance metrics
- Download analytics

### Local Development
```bash
cd admin-panel
npm start
# Access at http://localhost:3000
```

### Production Deployment
The deployment script automatically configures:
- Nginx reverse proxy
- SSL certificates with Let's Encrypt
- PM2 process management
- Firewall and security settings

## 📁 Project Structure

```
sp5proxy-app/
├── admin-panel/          # Web admin interface
│   ├── server.js         # Node.js server
│   ├── public/           # Static web assets
│   └── data/             # Database files
├── src/                  # Desktop application source
│   ├── react/            # React UI components
│   ├── api-server.js     # Local API server
│   └── proxy-manager.js  # Core proxy functionality
├── assets/               # Application assets
├── bin/                  # Binary dependencies
├── config/               # Configuration files
├── scripts/              # Build and utility scripts
└── deploy_sp5proxyapp.sh # VPS deployment script
```

## 🔧 Configuration

### Desktop Application
Configuration files are located in:
- `config/app-config.json` - Application settings
- `config/proxy-config.json` - Proxy configurations

### Admin Panel
Environment variables:
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (production/development)
- `DB_PATH` - Database file path

## 🚀 Deployment

### VPS Deployment Features
- **Automated Setup**: Complete system configuration
- **SSL Certificates**: Automatic Let's Encrypt integration
- **Security**: Firewall, rate limiting, security headers
- **Monitoring**: Comprehensive logging and analytics
- **Backup**: Automated backup and restore functionality

### Deployment Domains
- **Main Site**: `sp5proxyapp.com` - Landing page with download
- **Admin Panel**: `admin.sp5proxyapp.com` - Administration interface

### Management Commands
After deployment, use these commands on your VPS:
```bash
sp5proxy status              # System status
sp5proxy restart             # Restart services
sp5proxy logs [type] [lines] # View logs
sp5proxy update              # Update application
sp5proxy backup [name]       # Create backup
sp5proxy restore <name>      # Restore from backup
sp5proxy monitor             # Real-time monitoring
sp5proxy security            # Security check
```

## 🔒 Security

- **Traffic Encryption**: All proxy traffic is encrypted
- **Admin Authentication**: Secure admin panel access
- **Rate Limiting**: Protection against abuse
- **Security Headers**: Comprehensive HTTP security headers
- **Firewall Integration**: UFW firewall configuration
- **SSL/TLS**: Full SSL certificate management

## 📊 Monitoring

- **Real-time Metrics**: Connection statistics and performance
- **Download Analytics**: Track installer downloads
- **System Health**: Server resource monitoring
- **Error Logging**: Comprehensive error tracking
- **Backup Management**: Automated backup scheduling

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/ahmedalramah000/sp5proxy-app/issues)
- **Documentation**: Check the `/docs` folder for detailed guides
- **Admin Panel**: Access your deployed admin panel for system monitoring

## 🏷️ Version

Current version: 1.0.0

---

**SP5Proxy Desktop** - Professional system-wide proxy solution for Windows with enterprise features and web-based administration.
