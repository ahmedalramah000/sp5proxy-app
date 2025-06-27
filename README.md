# SP5Proxy Desktop 🛡️

**Professional Proxy Management Application for Windows**

SP5Proxy Desktop is a comprehensive, production-ready proxy management application built with Electron and React. It provides enterprise-grade proxy functionality with advanced features for secure internet browsing and network management.

## ✨ Key Features

### 🔒 Advanced Proxy Management
- **Multi-Protocol Support**: HTTP, HTTPS, SOCKS4, SOCKS5
- **Authentication Systems**: Username/Password, Token-based
- **Smart Routing**: Automatic failover and load balancing
- **Real-time Monitoring**: Connection status and performance metrics

### 🚀 Desktop Application
- **Modern UI**: Built with React and modern design principles
- **Cross-Platform**: Optimized for Windows with Linux/macOS compatibility
- **System Integration**: Windows taskbar and system tray integration
- **Admin Privileges**: Automated UAC elevation for system-wide proxy settings

### 🌐 Web Interface
- **Admin Panel**: Complete web-based administration interface
- **Real-time Dashboard**: Live connection monitoring and statistics
- **User Management**: Multi-user support with role-based access
- **API Integration**: RESTful API for external integrations

### 🔧 Advanced Features
- **DNS Management**: Custom DNS servers and leak protection
- **Network Diagnostics**: Built-in connectivity testing and troubleshooting
- **Extension Support**: Browser extension integration
- **Monetization Ready**: Built-in monetization management system

## 🏗️ Architecture

```
SP5Proxy Desktop/
├── 🖥️  Electron Main Process
├── ⚛️  React Frontend (Web UI)
├── 🌐 Express.js Backend (API Server)
├── 🗄️  SQLite Database
├── 🔧 PowerShell Integration (Windows)
├── 🌍 Admin Web Panel
└── 🔌 Browser Extensions
```

## 🚀 Quick Start

### Prerequisites
- **Node.js** 16+ 
- **Windows 10/11** (Administrator privileges required)
- **Git** for development

### Installation

1. **Clone the repository**:
```bash
git clone https://github.com/your-username/sp5proxy.git
cd sp5proxy
```

2. **Install dependencies**:
```bash
npm install
```

3. **Launch the application**:
```bash
# For end users (recommended)
.\SP5Proxy-FORCE-ADMIN.bat

# For developers
npm start
```

## 🛠️ Development

### Project Structure
```
sp5proxy/
├── src/                    # Core application logic
│   ├── react/             # React frontend components
│   ├── api-server.js      # Express.js API server
│   ├── proxy-manager.js   # Proxy management
│   ├── network-manager.js # Network utilities
│   └── elevation-manager.js # UAC handling
├── admin-panel/           # Web administration interface
├── assets/               # Application assets and icons
├── bin/                  # Binary executables
├── config/              # Configuration files
└── scripts/             # Build and deployment scripts
```

### Available Scripts

```bash
# Development
npm start                 # Start development server
npm run dev              # Development mode with hot reload
npm run build            # Build production version
npm run package          # Create distributable package

# Testing
npm test                 # Run test suite
npm run lint             # Code linting

# Administration
npm run admin            # Start admin panel
npm run clean            # Clean build artifacts
```

## 🌟 Key Components

### 1. Proxy Management System
- **High-performance proxy handling** with connection pooling
- **Automatic proxy validation** and health checking
- **Smart failover** between multiple proxy servers
- **Real-time performance monitoring**

### 2. Network Security
- **DNS leak protection** with custom DNS servers
- **IP leak prevention** and detection
- **Encrypted proxy connections** (HTTPS/SOCKS5)
- **Traffic analysis and logging**

### 3. User Interface
- **Modern Material Design** components
- **Responsive layout** for all screen sizes
- **Dark/Light theme** support
- **Real-time status indicators**

### 4. System Integration
- **Windows UAC integration** for admin privileges
- **System proxy configuration** management
- **Registry management** for persistent settings
- **Service management** for background operations

## 🔧 Configuration

### Application Settings
Edit `config/app-config.json`:
```json
{
  "autoStart": true,
  "minimizeToTray": true,
  "checkUpdates": true,
  "logLevel": "info"
}
```

### Proxy Configuration
Edit `config/proxy-config.json`:
```json
{
  "defaultProxy": {
    "host": "your-proxy.com",
    "port": 8080,
    "protocol": "http",
    "auth": {
      "username": "",
      "password": ""
    }
  }
}
```

## 📊 Performance Features

- **Memory Optimization**: Efficient resource usage
- **CPU Monitoring**: Real-time performance tracking
- **Network Optimization**: Minimal latency overhead
- **Battery Efficiency**: Power-aware background operations

## 🔒 Security Features

- **Secure Credential Storage**: Windows Credential Manager integration
- **Encrypted Configuration**: Sensitive data protection
- **Admin Rights Management**: Proper privilege escalation
- **Network Isolation**: Secure proxy tunneling

## 🤝 Contributing

We welcome contributions! Please read our contributing guidelines:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: Check the `/docs` folder for detailed guides
- **Issues**: Report bugs via GitHub Issues
- **Discussions**: Join our GitHub Discussions for questions

## 🚀 Roadmap

- [ ] **Linux Support**: Native Linux compatibility
- [ ] **macOS Support**: Native macOS application
- [ ] **Mobile Apps**: iOS and Android companion apps
- [ ] **Cloud Sync**: Cross-device configuration synchronization
- [ ] **VPN Integration**: Built-in VPN capabilities
- [ ] **Advanced Analytics**: Detailed usage statistics

## 💡 Credits

Built with ❤️ using:
- **Electron** - Desktop application framework
- **React** - User interface library
- **Express.js** - Web server framework
- **SQLite** - Database engine
- **Material-UI** - UI component library

---

**SP5Proxy Desktop** - Professional Proxy Management Made Simple

*For technical support, please create an issue or contact the development team.*
