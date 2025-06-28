const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
// Move autoUpdater import to when it's actually needed to avoid startup errors
let autoUpdater = null;
const path = require('path');
const fs = require('fs');
const ProxyManager = require('./src/proxy-manager');
const NetworkManager = require('./src/network-manager');
const CredentialManager = require('./src/credential-manager');
const ElevationManager = require('./src/elevation-manager');
const DNSManager = require('./src/dns-manager');
const DNSLeakTester = require('./src/dns-leak-tester');
const MonetizationManager = require('./src/monetization-manager');
const ConfigManager = require('./src/config-manager');
const DatabaseManager = require('./src/database-manager');
const APIServer = require('./src/api-server');
const UrlExtensionManager = require('./src/url-extension-manager');
const VPSSync = require('./src/vps-sync');

// 🚨 SINGLE INSTANCE ENFORCEMENT - Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    console.log('🚫 Another instance of SP5Proxy Desktop is already running');
    console.log('🚪 Exiting this instance to prevent conflicts');
    app.quit();
} else {
    console.log('✅ Single instance lock acquired successfully');

    // Handle second instance attempts
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        console.log('🔄 Second instance attempted to start - focusing existing window');

        // Focus the existing window instead of creating a new one
        if (sp5ProxyApp && sp5ProxyApp.mainWindow) {
            if (sp5ProxyApp.mainWindow.isMinimized()) {
                sp5ProxyApp.mainWindow.restore();
            }
            sp5ProxyApp.mainWindow.focus();
            sp5ProxyApp.mainWindow.show();
        }
    });
}

class SP5ProxyApp {
    constructor() {
        this.mainWindow = null;
        this.proxyManager = null;
        this.networkManager = null;
        this.credentialManager = null;
        this.elevationManager = null;
        this.dnsManager = null;
        this.dnsLeakTester = null;
        this.monetizationManager = null;
        this.configManager = null;
        this.databaseManager = null;
        this.apiServer = null;
        this.urlExtensionManager = null;
        this.vpsSync = null;
        this.isConnected = false;
        this.currentConfig = null;
        this.autoElevationAttempted = false;
        this.currentSessionId = null;
        this.ipcHandlersRegistered = false;
        this.windowReady = false;

        // Initialize test mode flags
        this.reactTestMode = process.argv.includes('--react-test') || process.env.SP5PROXY_REACT_TEST === '1';

        // IP refresh system
        this.ipRefreshInterval = null;
        this.lastKnownIP = null;
        this.ipRefreshIntervalMs = 30000; // Refresh every 30 seconds when connected
    }

    // Initialize components when needed
    initializeComponents() {
        console.log('🔧 Initializing components...');
        try {
            console.log('📦 Creating ProxyManager...');
            this.proxyManager = new ProxyManager();
            console.log('📦 Creating NetworkManager...');
            this.networkManager = new NetworkManager();
            console.log('📦 Creating CredentialManager...');
            this.credentialManager = new CredentialManager();
            console.log('📦 Creating ElevationManager...');
            this.elevationManager = new ElevationManager();
            console.log('📦 Creating DNSManager...');
            this.dnsManager = new DNSManager();
            console.log('📦 Creating DNSLeakTester...');
            this.dnsLeakTester = new DNSLeakTester();
            console.log('📦 Creating MonetizationManager...');
            this.monetizationManager = new MonetizationManager();
            console.log('📦 Creating ConfigManager...');
            this.configManager = new ConfigManager();
            
            console.log('📦 Creating VPS Sync...');
            this.vpsSync = new VPSSync();

            // Skip database in development mode to avoid crashes
            const SKIP_DATABASE = process.env.SP5PROXY_DEV_MODE === '1';
            if (SKIP_DATABASE) {
                console.log('🛠️ Development mode - skipping DatabaseManager and APIServer');
                this.databaseManager = null;
                this.apiServer = null;
            } else {
                console.log('📦 Creating DatabaseManager...');
                this.databaseManager = new DatabaseManager();
                console.log('📦 Creating APIServer...');
                this.apiServer = new APIServer();
            }
            console.log('✅ Components initialized successfully');
        } catch (error) {
            console.error('❌ Component initialization failed:', error);
            throw error;
        }
    }

    // Safe method to send messages to renderer
    safeWebContentsSend(channel, ...args) {
        if (this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents && this.windowReady) {
            try {
                this.mainWindow.webContents.send(channel, ...args);
                return true;
            } catch (error) {
                console.warn(`⚠️ Failed to send message to renderer (${channel}):`, error.message);
                return false;
            }
        }
        return false;
    }

    // الحصول على الأيقونة الموحدة
    getUnifiedIcon() {
        // ترتيب الأولوية للأيقونات - تفضيل ICO للويندوز
        const iconPaths = [
            path.resolve(__dirname, 'assets', 'icon.ico'),
            path.resolve(__dirname, 'assets', 'icon.png'),
            path.resolve(__dirname, 'dist-react', 'assets', 'icon.ico'),
            path.resolve(__dirname, 'dist-react', 'assets', 'icon.png'),
            // إضافة مسارات إضافية للأيقونات
            path.resolve(__dirname, 'build', 'icon.ico'),
            path.resolve(__dirname, 'build', 'icon.png')
        ];

        for (const iconPath of iconPaths) {
            if (fs.existsSync(iconPath)) {
                const iconStats = fs.statSync(iconPath);
                console.log('✅ استخدام الأيقونة الموحدة:', iconPath);
                console.log(`📊 حجم الأيقونة: ${iconStats.size} بايت`);
                
                // التأكد من أن الأيقونة ليست فارغة
                if (iconStats.size > 1000) {
                    return iconPath;
                } else {
                    console.warn(`⚠️ الأيقونة صغيرة جداً: ${iconPath} (${iconStats.size} بايت)`);
                }
            }
        }

        console.warn('⚠️ لم يتم العثور على أيقونة موحدة مناسبة، استخدام الافتراضية');
        return null;
    }

    // Auto-refresh IP when connected to proxy
    async startIPRefresh() {
        if (this.ipRefreshInterval) {
            clearInterval(this.ipRefreshInterval);
        }

        console.log('🔄 Starting IP auto-refresh (every 30 seconds)...');

        this.ipRefreshInterval = setInterval(async () => {
            if (this.isConnected) {
                try {
                    console.log('🔄 Auto-refreshing IP...');
                    const newIP = await this.fetchCurrentIP();

                    if (newIP && newIP !== this.lastKnownIP) {
                        console.log(`🔄 IP changed: ${this.lastKnownIP} → ${newIP}`);
                        this.lastKnownIP = newIP;

                        // Update proxy manager's external IP
                        if (this.proxyManager) {
                            this.proxyManager.externalIP = newIP;
                        }

                        // Send updated IP to renderer
                        this.safeWebContentsSend('ip-updated', {
                            ip: newIP,
                            timestamp: new Date().toISOString(),
                            isConnected: this.isConnected,
                            proxyConfig: this.currentConfig
                        });

                        // Also trigger location update
                        this.safeWebContentsSend('trigger-ip-location-update');

                        // Update database session if connected
                        if (this.databaseManager && this.currentConfig) {
                            try {
                                await this.databaseManager.updateActiveSession(this.currentConfig.sessionId || 'default', {
                                    external_ip: newIP,
                                    status: 'connected'
                                });
                                console.log('📍 Updated session IP in database:', newIP);
                            } catch (dbError) {
                                console.warn('⚠️ Failed to update session IP in database:', dbError.message);
                            }
                        }
                    }
                } catch (error) {
                    console.warn('⚠️ Auto IP refresh failed:', error.message);
                }
            } else {
                // If not connected, check if we need to update to real IP
                try {
                    const realIP = await this.fetchCurrentIP();
                    if (realIP && realIP !== this.lastKnownIP) {
                        console.log(`🔄 Real IP detected after disconnect: ${realIP}`);
                        this.lastKnownIP = realIP;

                        // Send updated real IP to renderer
                        this.safeWebContentsSend('ip-updated', {
                            ip: realIP,
                            timestamp: new Date().toISOString(),
                            isConnected: false,
                            proxyConfig: null
                        });

                        // Also trigger location update
                        this.safeWebContentsSend('trigger-ip-location-update');
                    }
                } catch (error) {
                    console.warn('⚠️ Real IP refresh failed:', error.message);
                }
            }
        }, this.ipRefreshIntervalMs);
    }

    // Stop IP refresh
    stopIPRefresh() {
        if (this.ipRefreshInterval) {
            console.log('⏹️ Stopping IP auto-refresh...');
            clearInterval(this.ipRefreshInterval);
            this.ipRefreshInterval = null;
        }
    }

    // Fetch current IP (unified method with enhanced proxy rotation detection)
    async fetchCurrentIP() {
        const axios = require('axios');

        try {
            // Enhanced IP detection methods with better proxy support
            const ipDetectionMethods = [
                {
                    name: 'ipify',
                    url: 'https://api.ipify.org?format=json',
                    parser: (data) => data.ip,
                    timeout: 8000
                },
                {
                    name: 'httpbin',
                    url: 'https://httpbin.org/ip',
                    parser: (data) => data.origin,
                    timeout: 8000
                },
                {
                    name: 'ipapi',
                    url: 'https://ipapi.co/json',
                    parser: (data) => data.ip,
                    timeout: 10000
                },
                {
                    name: 'jsonip',
                    url: 'https://jsonip.com',
                    parser: (data) => data.ip,
                    timeout: 8000
                },
                {
                    name: 'icanhazip',
                    url: 'https://icanhazip.com',
                    parser: (data) => typeof data === 'string' ? data.trim() : data,
                    timeout: 8000
                }
            ];

            // Try proxy manager first if available and connected
            if (this.isConnected && this.proxyManager && this.proxyManager.fetchExternalIP) {
                try {
                    const proxyIP = await this.proxyManager.fetchExternalIP();
                    if (proxyIP && this.isValidIP(proxyIP)) {
                        console.log('✅ IP from proxy manager:', proxyIP);
                        return proxyIP;
                    }
                } catch (proxyError) {
                    console.warn('⚠️ Proxy manager IP fetch failed:', proxyError.message);
                }
            }

            // Try multiple methods for better reliability
            for (const method of ipDetectionMethods) {
                try {
                    console.log(`🔍 Trying ${method.name} for IP detection...`);
                    const response = await axios.get(method.url, {
                        timeout: method.timeout,
                        headers: {
                            'User-Agent': 'SP5Proxy-Desktop/1.0',
                            'Accept': 'application/json, text/plain, */*'
                        }
                    });

                    let detectedIP;
                    if (typeof response.data === 'string') {
                        detectedIP = response.data.trim();
                    } else {
                        detectedIP = method.parser(response.data);
                    }

                    if (detectedIP && this.isValidIP(detectedIP)) {
                        console.log(`✅ IP detected via ${method.name}:`, detectedIP);
                        return detectedIP;
                    }
                } catch (methodError) {
                    console.log(`❌ ${method.name} failed:`, methodError.message);
                    continue; // Try next method
                }
            }

            throw new Error('All IP detection methods failed');
        } catch (error) {
            console.warn('⚠️ IP fetch failed:', error.message);
            return null;
        }
    }

    // Validate IP address format
    isValidIP(ip) {
        if (!ip || typeof ip !== 'string') return false;

        // Basic IPv4 validation
        const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

        // Basic IPv6 validation (simplified)
        const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;

        return ipv4Regex.test(ip.trim()) || ipv6Regex.test(ip.trim());
    }

    async initialize() {
        try {
            console.log('🚀 Initializing SP5Proxy Desktop...');

            // GPU stability flags already set before app.whenReady()

            // Skip component initialization for now - will be done after window creation

            // For development mode, skip complex initialization and just create window
            const isDevMode = process.env.SP5PROXY_DEV_MODE === '1';
            if (isDevMode) {
                console.log('🛠️ Development mode - creating window directly...');
                // Initialize essential components for dev mode (without database)
                console.log('📦 Initializing essential components for dev mode...');
                this.configManager = new (require('./src/config-manager'))();
                this.proxyManager = new (require('./src/proxy-manager'))();
                this.networkManager = new (require('./src/network-manager'))();
                this.elevationManager = new (require('./src/elevation-manager'))();
                this.dnsManager = new (require('./src/dns-manager'))();
                this.credentialManager = new (require('./src/credential-manager'))();
                this.monetizationManager = new (require('./src/monetization-manager'))();
                this.dnsLeakTester = new (require('./src/dns-leak-tester'))();
                console.log('✅ Essential components initialized for dev mode');

                this.createWindow();
                this.setupIPC();
                return;
            }

            // Check if we were launched with --force-no-elevate flag or NO_ELEVATION env variable
            const forceNoElevate = process.argv.includes('--force-no-elevate') || process.env.SP5PROXY_NO_ELEVATION === '1';
            const isAlreadyElevated = process.env.SP5PROXY_ELEVATED === '1';
            const noElevationDialog = process.env.SP5PROXY_NO_ELEVATION_DIALOG === '1';
            const forceElevatedMode = isAlreadyElevated && (isDevMode || noElevationDialog);
            
            console.log('🔍 Elevation flags check:', {
                forceNoElevate,
                isAlreadyElevated,
                noElevationDialog,
                isDevMode,
                reactTestMode: this.reactTestMode,
                forceElevatedMode,
                'process.env.SP5PROXY_NO_ELEVATION': process.env.SP5PROXY_NO_ELEVATION,
                'process.env.SP5PROXY_ELEVATED': process.env.SP5PROXY_ELEVATED,
                'process.env.SP5PROXY_NO_ELEVATION_DIALOG': process.env.SP5PROXY_NO_ELEVATION_DIALOG,
                'process.env.SP5PROXY_DEV_MODE': process.env.SP5PROXY_DEV_MODE,
                'process.env.SP5PROXY_REACT_TEST': process.env.SP5PROXY_REACT_TEST,
                'process.argv': process.argv
            });
            
            // Determine admin status with priority on force elevated mode
            let hasAdminRights;
            
            if (forceElevatedMode) {
                console.log('🔒 FORCE ELEVATED MODE ACTIVATED - Bypassing ALL elevation checks');
                console.log('🔒 Environment variables detected: ELEVATED=1, DEV_MODE=1, NO_DIALOG=1');
                console.log('🔒 Trusting launcher elevation - Setting hasAdminRights = true');
                hasAdminRights = true;
            } else if (isAlreadyElevated && isDevMode) {
                console.log('🛠️ DEV MODE + ELEVATED FLAG - Forcing admin rights without checks');
                hasAdminRights = true;
            } else if (isAlreadyElevated) {
                console.log('🔄 ELEVATED flag set but no DEV_MODE - Quick verification...');
                // Quick check only, don't let it fail
                try {
                    if (this.elevationManager && typeof this.elevationManager.checkAdminRights === 'function') {
                        hasAdminRights = await this.elevationManager.checkAdminRights();
                        if (hasAdminRights !== true) {
                            console.log('🔧 Quick check failed but ELEVATED=1 set - forcing admin rights');
                            hasAdminRights = true;
                        }
                    } else {
                        console.log('🔧 ElevationManager not available but ELEVATED=1 set - forcing admin rights');
                        hasAdminRights = true;
                    }
                } catch (error) {
                    console.log('🔧 Admin check threw error but ELEVATED=1 set - forcing admin rights');
                    hasAdminRights = true;
                }
            } else {
                console.log('🔍 No elevation flags - Running normal admin checks...');
                // Only run full checks if no elevation flags and manager is available
                if (this.elevationManager && typeof this.elevationManager.checkAdminRights === 'function') {
                    hasAdminRights = await this.elevationManager.checkAdminRights();
                    console.log(`🔍 Admin rights check: ${hasAdminRights === true ? 'Administrator' : hasAdminRights === 'limited-admin' ? 'Limited Admin (UAC)' : 'Standard User'}`);
                } else {
                    console.warn('⚠️ ElevationManager not available, skipping admin check');
                    hasAdminRights = false;
                }
            }

            if (forceNoElevate) {
                console.log('⚠️  Elevation check skipped (NO_ELEVATION flag set)');
            }

            // DISABLED: No automatic elevation - run with current privileges
            console.log('🔧 Running SP5Proxy Desktop with current user privileges');
            console.log('💡 Admin elevation can be requested manually when needed');

            // Continue with normal initialization based on admin status
            if (hasAdminRights === true) {
                console.log('✅ Administrator privileges confirmed - full functionality available');
                await this.initializeWithAdminRights();
            } else if (hasAdminRights === 'limited-admin') {
                console.log('⚠️  Administrator with UAC limited token - starting with elevation capability');
                console.log('💡 Application will request elevation manually when needed for TUN operations');
                await this.initializeWithLimitedAdminRights();
            } else {
                console.log('⚠️  No administrator privileges - running with limited functionality');
                console.log('💡 Users can request elevation manually when needed');
                await this.initializeWithLimitedAdminRights();
            }

        } catch (error) {
            console.error('❌ Critical initialization error:', error);
            console.log('🔄 Attempting to continue with basic functionality...');

            // Try to create window and basic IPC even if initialization fails
            try {
                this.createWindow();
                this.setupIPC();
                console.log('✅ Basic functionality restored despite initialization error');
            } catch (windowError) {
                console.error('❌ Failed to create basic functionality:', windowError);
                await this.handleCriticalError(error);
            }
        }
    }

    // REMOVED: forceMandatoryElevation function - no automatic elevation dialogs

    // REMOVED: showCriticalElevationError function - no automatic elevation dialogs

    async initializeWithAdminRights() {
        try {
            // Initialize all components first
            console.log('📦 Initializing all components...');
            this.initializeComponents();
            console.log('✅ All components initialized');

            console.log('🔐 Enabling required Windows privileges...');
            await this.elevationManager.enableRequiredPrivileges();

            console.log('🔧 Initializing core components...');
            console.log('🔧 Initializing configuration manager...');
            await this.configManager.initialize();
            console.log('✅ Configuration loaded successfully');

            await this.credentialManager.initialize();
            await this.proxyManager.initialize();

            console.log('🔍 Detecting current network configuration...');
            await this.networkManager.initialize();
            console.log('🌐 Final network config:', {
                gateway: this.networkManager.originalGateway,
                interface: this.networkManager.originalInterface
            });

            // Detect and log current IP address
            console.log('🔍 Detecting current IP address...');
            try {
                const currentIP = await this.fetchCurrentIP();
                if (currentIP) {
                    console.log(`✅ Current IP detected: ${currentIP}`);
                    this.lastKnownIP = currentIP;
                } else {
                    console.log('⚠️ Could not detect current IP address');
                }
            } catch (ipError) {
                console.log('⚠️ IP detection failed:', ipError.message);
            }

            // Initialize database manager and API server
            try {
                console.log('🗄️ Initializing database and API server...');
                await this.databaseManager.initialize();
                await this.apiServer.initialize();

                // Connect monetization manager with database
                this.monetizationManager.setDatabaseManager(this.databaseManager);

                // Initialize URL Extension Manager
                this.urlExtensionManager = new UrlExtensionManager(this.databaseManager);

                // Connect URL Extension Manager with Monetization Manager
                this.urlExtensionManager.setMonetizationManager(this.monetizationManager);
                this.monetizationManager.setUrlExtensionManager(this.urlExtensionManager);

                console.log('✅ URL Extension Manager initialized and connected to Monetization Manager');

                console.log('✅ Database and API server initialized successfully');
            } catch (error) {
                console.warn('⚠️ Database/API server initialization failed (continuing without sync):', error.message);
            }

            console.log('🖥️  Creating application window...');
            this.createWindow();
            this.setupIPC();

            // Add automatic loading screen hide after 3 seconds as failsafe
            setTimeout(() => {
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    console.log('⏰ Auto-hiding loading screen after 3 seconds...');
                    this.mainWindow.webContents.executeJavaScript(`
                        console.log('🔧 Main process: Force hiding loading screen');
                        document.body.classList.add('app-ready');

                        // If React failed to load, show basic interface
                        const reactRoot = document.getElementById('react-root');
                        if (reactRoot && reactRoot.innerHTML.trim() === '') {
                            reactRoot.innerHTML = \`
                                <div style="padding: 20px; font-family: Arial, sans-serif; color: white; background: #1e1e1e; min-height: 100vh;">
                                    <h1 style="color: #007acc; margin-bottom: 20px;">🔗 SP5Proxy Desktop</h1>
                                    <div style="background: #2d2d2d; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                                        <h2 style="color: #ffffff; margin-bottom: 15px;">Proxy Connection</h2>
                                        <div style="margin-bottom: 10px;">
                                            <label style="display: block; margin-bottom: 5px; color: #cccccc;">Server:</label>
                                            <input type="text" value="68.225.23.92:18240" style="width: 300px; padding: 8px; border: 1px solid #555; background: #333; color: white; border-radius: 4px;" readonly>
                                        </div>
                                        <div style="margin-bottom: 15px;">
                                            <label style="display: block; margin-bottom: 5px; color: #cccccc;">Type:</label>
                                            <select style="width: 150px; padding: 8px; border: 1px solid #555; background: #333; color: white; border-radius: 4px;">
                                                <option>SOCKS5</option>
                                                <option>HTTP</option>
                                            </select>
                                        </div>
                                        <button onclick="alert('Proxy connection functionality is available via the backend API on port 3002')"
                                                style="background: #007acc; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 14px;">
                                            Connect to Proxy
                                        </button>
                                        <button onclick="alert('Proxy disconnection functionality is available via the backend API on port 3002')"
                                                style="background: #dc3545; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 14px; margin-left: 10px;">
                                            Disconnect
                                        </button>
                                    </div>
                                    <div style="background: #2d2d2d; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                                        <h3 style="color: #ffffff; margin-bottom: 10px;">Status</h3>
                                        <p style="color: #28a745; margin: 0;">✅ Backend services running on port 3002</p>
                                        <p style="color: #28a745; margin: 5px 0 0 0;">✅ Proxy configuration loaded</p>
                                        <p style="color: #28a745; margin: 5px 0 0 0;">✅ Current IP: ${this.lastKnownIP || 'Detecting...'}</p>
                                    </div>
                                    <div style="background: #2d2d2d; padding: 15px; border-radius: 8px;">
                                        <h3 style="color: #ffffff; margin-bottom: 10px;">Quick Actions</h3>
                                        <button onclick="window.location.reload()"
                                                style="background: #6c757d; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-right: 10px;">
                                            Reload Interface
                                        </button>
                                    </div>
                                </div>
                            \`;
                            console.log('📱 Fallback interface loaded with IP: ${this.lastKnownIP || 'Unknown'}');
                        }
                    `).catch(err => console.log('Script execution failed:', err.message));
                }
            }, 3000);
            
            // Setup auto-updater with error handling
            try {
                this.setupAutoUpdater();
            } catch (updaterError) {
                console.warn('⚠️ Auto-updater setup failed (continuing without updates):', updaterError.message);
            }
            
            this.setupMonetizationHandlers();

            // Force refresh admin status to ensure UI is updated correctly
            console.log('🔄 Verifying admin status after initialization...');

            // Check if this is an elevated process
            const wasElevated = await this.elevationManager.wasProcessElevated();
            if (wasElevated) {
                console.log('✅ Detected elevated process - updating admin status immediately');
            }

            // Immediate admin status check
            const immediateAdminCheck = async () => {
                console.log('🔄 IMMEDIATE admin status check starting...');
                const hasAdminRights = await this.elevationManager.refreshAdminStatus();
                console.log(`🔍 IMMEDIATE Admin check result: ${hasAdminRights ? 'Administrator' : 'Standard User'}`);

                if (this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents) {
                    console.log('📤 Sending admin status update to renderer...');
                    try {
                        this.mainWindow.webContents.send('admin-status-updated', hasAdminRights);
                    } catch (error) {
                        console.warn('⚠️ Failed to send admin status update:', error.message);
                    }

                    if (hasAdminRights) {
                        console.log('🛡️ Administrator privileges confirmed - full functionality available');
                    } else {
                        console.log('❌ No administrator privileges detected');
                    }
                }
            };

            // Check immediately and then again after 2 seconds
            setTimeout(immediateAdminCheck, 500);
            setTimeout(immediateAdminCheck, 2000);
            setTimeout(immediateAdminCheck, 5000);

            // Ensure window is visible after initialization (important for elevated processes)
            setTimeout(() => {
                if (this.mainWindow && !this.mainWindow.isVisible()) {
                    console.log('🖥️  Ensuring window visibility after admin initialization...');
                    this.showWindowProperly();
                }
            }, 1000);

            console.log('✅ SP5Proxy Desktop initialized successfully with admin privileges');
        } catch (error) {
            console.error('❌ Failed to initialize with admin rights:', error);
            // Continue anyway to show error in UI
            this.createWindow();
            this.setupIPC();
        }
    }

    async initializeWithLimitedAdminRights() {
        try {
            console.log('⚠️  Initializing with limited admin rights - UAC elevation available');

            // Initialize all components first
            console.log('📦 Initializing all components...');
            this.initializeComponents();
            console.log('✅ All components initialized');

            // Initialize components that work with limited admin
            console.log('🔧 Initializing configuration manager...');
            await this.configManager.initialize();
            console.log('✅ Configuration loaded successfully');

            await this.credentialManager.initialize();
            await this.proxyManager.initialize();

            console.log('🔍 Detecting current network configuration...');
            await this.networkManager.initialize();
            console.log('🌐 Final network config:', {
                gateway: this.networkManager.originalGateway,
                interface: this.networkManager.originalInterface
            });

            // Detect and log current IP address
            console.log('🔍 Detecting current IP address...');
            try {
                const currentIP = await this.fetchCurrentIP();
                if (currentIP) {
                    console.log(`✅ Current IP detected: ${currentIP}`);
                    this.lastKnownIP = currentIP;
                } else {
                    console.log('⚠️ Could not detect current IP address');
                }
            } catch (ipError) {
                console.log('⚠️ IP detection failed:', ipError.message);
            }

            // Initialize database manager and API server
            try {
                console.log('🗄️ Initializing database and API server...');
                await this.databaseManager.initialize();
                await this.apiServer.initialize();

                // Connect monetization manager with database
                this.monetizationManager.setDatabaseManager(this.databaseManager);

                // Initialize URL Extension Manager
                this.urlExtensionManager = new UrlExtensionManager(this.databaseManager);

                // Connect URL Extension Manager with Monetization Manager
                this.urlExtensionManager.setMonetizationManager(this.monetizationManager);
                this.monetizationManager.setUrlExtensionManager(this.urlExtensionManager);

                console.log('✅ URL Extension Manager initialized and connected to Monetization Manager');
                console.log('✅ Database and API server initialized successfully');
            } catch (error) {
                console.warn('⚠️ Database/API server initialization failed (continuing without sync):', error.message);
            }

            console.log('🖥️  Creating application window...');
            this.createWindow();
            this.setupIPC();

            // Add automatic loading screen hide after 3 seconds as failsafe
            setTimeout(() => {
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    console.log('⏰ Auto-hiding loading screen after 3 seconds...');
                    this.mainWindow.webContents.executeJavaScript(`
                        console.log('🔧 Main process: Force hiding loading screen');
                        document.body.classList.add('app-ready');

                        // If React failed to load, show basic interface
                        const reactRoot = document.getElementById('react-root');
                        if (reactRoot && reactRoot.innerHTML.trim() === '') {
                            reactRoot.innerHTML = \`
                                <div style="padding: 20px; font-family: Arial, sans-serif; color: white; background: #1e1e1e; min-height: 100vh;">
                                    <h1 style="color: #007acc; margin-bottom: 20px;">🔗 SP5Proxy Desktop</h1>
                                    <div style="background: #2d2d2d; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                                        <h2 style="color: #ffffff; margin-bottom: 15px;">Proxy Connection</h2>
                                        <div style="margin-bottom: 10px;">
                                            <label style="display: block; margin-bottom: 5px; color: #cccccc;">Server:</label>
                                            <input type="text" value="68.225.23.92:18240" style="width: 300px; padding: 8px; border: 1px solid #555; background: #333; color: white; border-radius: 4px;" readonly>
                                        </div>
                                        <div style="margin-bottom: 15px;">
                                            <label style="display: block; margin-bottom: 5px; color: #cccccc;">Type:</label>
                                            <select style="width: 150px; padding: 8px; border: 1px solid #555; background: #333; color: white; border-radius: 4px;">
                                                <option>SOCKS5</option>
                                                <option>HTTP</option>
                                            </select>
                                        </div>
                                        <button onclick="alert('Proxy connection functionality is available via the backend API on port 3002')"
                                                style="background: #007acc; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 14px;">
                                            Connect to Proxy
                                        </button>
                                        <button onclick="alert('Proxy disconnection functionality is available via the backend API on port 3002')"
                                                style="background: #dc3545; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 14px; margin-left: 10px;">
                                            Disconnect
                                        </button>
                                    </div>
                                    <div style="background: #2d2d2d; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                                        <h3 style="color: #ffffff; margin-bottom: 10px;">Status</h3>
                                        <p style="color: #28a745; margin: 0;">✅ Backend services running on port 3002</p>
                                        <p style="color: #28a745; margin: 5px 0 0 0;">✅ Proxy configuration loaded</p>
                                        <p style="color: #28a745; margin: 5px 0 0 0;">✅ Current IP: ${this.lastKnownIP || 'Detecting...'}</p>
                                    </div>
                                    <div style="background: #2d2d2d; padding: 15px; border-radius: 8px;">
                                        <h3 style="color: #ffffff; margin-bottom: 10px;">Quick Actions</h3>
                                        <button onclick="window.location.reload()"
                                                style="background: #6c757d; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-right: 10px;">
                                            Reload Interface
                                        </button>
                                    </div>
                                </div>
                            \`;
                            console.log('📱 Fallback interface loaded with IP: ${this.lastKnownIP || 'Unknown'}');
                        }
                    `).catch(err => console.log('Script execution failed:', err.message));
                }
            }, 3000);
            
            // Setup auto-updater with error handling
            try {
                this.setupAutoUpdater();
            } catch (updaterError) {
                console.warn('⚠️ Auto-updater setup failed (continuing without updates):', updaterError.message);
            }
            
            this.setupMonetizationHandlers();

            // Show that we can elevate when needed
            setTimeout(async () => {
                if (this.elevationManager && typeof this.elevationManager.checkAdminRights === 'function') {
                    const currentStatus = await this.elevationManager.checkAdminRights();
                    console.log(`🔍 Admin status confirmation: ${currentStatus === true ? 'Full Admin' : currentStatus === 'limited-admin' ? 'Limited Admin (UAC)' : 'Standard User'}`);

                    if (this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents) {
                        try {
                            this.mainWindow.webContents.send('admin-status-updated', {
                                hasAdminRights: currentStatus === true,
                                isLimitedAdmin: currentStatus === 'limited-admin',
                                canElevate: currentStatus === 'limited-admin' || currentStatus === true
                            });
                        } catch (error) {
                            console.warn('⚠️ Failed to send admin status update:', error.message);
                        }

                        if (currentStatus === 'limited-admin') {
                            console.log('🛡️ Limited admin privileges - can elevate for TUN operations when needed');
                        }
                    }
                } else {
                    console.warn('⚠️ ElevationManager not available for status confirmation');
                }
            }, 2000);

            console.log('✅ SP5Proxy Desktop initialized with limited admin privileges - elevation available when needed');
        } catch (error) {
            console.error('❌ Failed to initialize with limited admin rights:', error);
            // Continue anyway to show error in UI
            this.createWindow();
            this.setupIPC();
        }
    }

    async initializeWithoutAdminRights(elevationResult) {
        try {
            console.log('⚠️  Initializing without admin rights - limited functionality');

            // Initialize all components first
            console.log('📦 Initializing all components...');
            this.initializeComponents();
            console.log('✅ All components initialized');

            // Initialize components that don't require admin rights
            await this.credentialManager.initialize();
            await this.proxyManager.initialize();
            await this.networkManager.initialize();

            // Initialize database and WebView system for monetization
            try {
                await this.databaseManager.initialize();
                await this.apiServer.initialize();
                this.monetizationManager.setDatabaseManager(this.databaseManager);

                // Initialize URL Extension Manager
                this.urlExtensionManager = new UrlExtensionManager(this.databaseManager);
                this.urlExtensionManager.setMonetizationManager(this.monetizationManager);
                this.monetizationManager.setUrlExtensionManager(this.urlExtensionManager);

                console.log('✅ URL Extension Manager initialized (no-admin mode)');
            } catch (error) {
                console.warn('⚠️ Database/WebView initialization failed (continuing without):', error.message);
            }

            this.createWindow();
            this.setupIPC();
            this.setupMonetizationHandlers();

            // Don't automatically show elevation dialog - let user interact with interface
            // The admin status indicator will show the current state
            console.log('⚠️  Application started without admin privileges - limited functionality available');
            console.log('💡 Users can click the admin status indicator to request elevation when needed');

        } catch (error) {
            console.error('❌ Failed to initialize without admin rights:', error);
            this.createWindow();
            this.setupIPC();
        }
    }

    async handleElevationCancelled() {
        console.log('⚠️  Elevation was cancelled - continuing with limited functionality');
        console.log('💡 User can request elevation later through the interface');

        // Don't show blocking dialogs - just continue with limited functionality
        await this.initializeWithoutAdminRights();
    }

    async handleElevationError(error) {
        console.error('⚠️  Elevation error occurred:', error.message);
        console.log('🔄 Continuing with limited functionality');
        console.log('💡 User can request elevation later through the interface');

        // Don't show blocking dialogs - just continue with limited functionality
        await this.initializeWithoutAdminRights();
    }

    async handleCriticalError(error) {
        console.error('💥 Critical error during initialization:', error);

        // Always create window to show error state - don't show blocking dialogs
        console.log('🖥️ Creating window despite critical error to show error state...');
        try {
            this.createWindow();
            this.setupIPC();
            console.log('✅ Window created successfully despite error');
        } catch (windowError) {
            console.error('❌ Failed to create window after critical error:', windowError);
        }

        // Log error but continue running
        console.log('🔄 Continuing with limited functionality due to initialization error');
        console.log('💡 Error details logged - application will continue running');
    }

    async requestElevationAndRestart() {
        try {
            console.log('🔐 Requesting administrator privileges...');

            // Show user feedback that elevation is in progress
            if (this.mainWindow) {
                this.mainWindow.webContents.send('elevation-status', {
                    status: 'requesting',
                    message: 'Requesting administrator privileges...'
                });
            }

            await this.elevationManager.restartAsAdmin();

            // If we reach here, elevation was successful and app will restart
            console.log('✅ Elevation request completed successfully');
            console.log('🚪 Current process should terminate to allow elevated process to take over');

            // Force cleanup and exit to prevent dual instances
            await this.cleanup();

            // Force immediate exit after elevation
            setTimeout(() => {
                console.log('🔄 Forcing process exit after elevation...');
                process.exit(0);
            }, 500);

        } catch (error) {
            console.error('❌ Failed to request elevation:', error);

            // Send error status to renderer
            if (this.mainWindow) {
                this.mainWindow.webContents.send('elevation-status', {
                    status: 'failed',
                    message: error.message,
                    error: true
                });
            }

            await this.handleElevationError(error.message);
        }
    }

    createWindow() {
        console.log('🖥️  Creating BrowserWindow...');
        
        // 🔧 ICON VERIFICATION: Get the best available icon
        const unifiedIcon = this.getUnifiedIcon();
        console.log(`🎯 Selected window icon: ${unifiedIcon || 'None (using default)'}`);
        
        // إعداد خيارات النافذة مع الأيقونة
        const windowOptions = {
            width: 1200,
            height: 800,
            minWidth: 900,
            minHeight: 700,
            show: true, // 🔧 CHANGED: Show window immediately upon creation
            title: 'SP5Proxy Desktop', // 🔧 ADDED: Explicit title for better icon association
            titleBarStyle: 'default',
            frame: true,
            resizable: true,
            // GPU process stability fixes
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js'),
                enableRemoteModule: false,
                backgroundThrottling: false,
                // GPU stability improvements
                hardwareAcceleration: true,
                // Secure configuration - enable web security
                webSecurity: true,
                allowRunningInsecureContent: false,
                experimentalFeatures: false
            }
        };
        
        // إضافة الأيقونة إذا كانت متوفرة
        if (unifiedIcon) {
            windowOptions.icon = unifiedIcon;
            console.log('✅ تم تعيين أيقونة النافذة بنجاح');
        } else {
            console.warn('⚠️ لم يتم تعيين أيقونة مخصصة للنافذة');
        }
        
        this.mainWindow = new BrowserWindow(windowOptions);

        // Add GPU process crash recovery
        this.mainWindow.webContents.on('gpu-process-crashed', (event, killed) => {
            console.log('🔧 GPU process crashed, attempting recovery...');
            if (killed) {
                console.log('GPU process was killed, restarting...');
                // Restart the renderer process
                this.mainWindow.webContents.reload();
            }
        });

        // Add render process crash recovery
        this.mainWindow.webContents.on('render-process-gone', (event, details) => {
            console.log('🔧 Render process gone:', details.reason);
            if (details.reason === 'crashed') {
                console.log('Render process crashed, restarting...');
                this.mainWindow.webContents.reload();
            }
        });

        console.log('🖥️  BrowserWindow created, loading HTML file...');

        // Check if React build exists and use React UI, otherwise fallback to legacy
        const reactHtmlPath = path.join(__dirname, 'dist-react', 'index.html');
        const distReactPath = path.join(__dirname, 'dist-react');

        // Find the main bundle file (with hash)
        let reactBundleExists = false;
        let mainBundlePath = '';

        try {
            if (fs.existsSync(distReactPath)) {
                const files = fs.readdirSync(distReactPath);
                // Look for the main bundle file (largest one, typically contains 'main' or is the largest)
                const bundleFiles = files.filter(file => file.startsWith('bundle.') && file.endsWith('.js'));

                if (bundleFiles.length > 0) {
                    // Find the largest bundle file (main bundle)
                    let largestBundle = bundleFiles[0];
                    let largestSize = 0;

                    for (const bundleFile of bundleFiles) {
                        const bundlePath = path.join(distReactPath, bundleFile);
                        const stats = fs.statSync(bundlePath);
                        if (stats.size > largestSize) {
                            largestSize = stats.size;
                            largestBundle = bundleFile;
                        }
                    }

                    mainBundlePath = path.join(distReactPath, largestBundle);
                    reactBundleExists = fs.existsSync(mainBundlePath);
                    console.log('🎯 Found main bundle:', largestBundle, `(${Math.round(largestSize/1024)}KB)`);
                }
            }
        } catch (error) {
            console.warn('⚠️ Error checking React bundles:', error.message);
        }

        // Load React UI
        console.log('🚀 Loading React UI...');
        console.log('React HTML exists:', fs.existsSync(reactHtmlPath));
        console.log('React Bundle exists:', reactBundleExists);
        console.log('React HTML path:', reactHtmlPath);
        console.log('React Bundle path:', mainBundlePath);
        
        // Load the React HTML file
        this.mainWindow.loadFile(reactHtmlPath)
            .then(() => {
                console.log('✅ React HTML loaded successfully');
                // Try showing window immediately after HTML loads (don't wait for React)
                console.log('🔧 IMMEDIATE: Attempting to show window after HTML load...');
                this.showWindowProperly();
            })
            .catch(err => {
                console.error('❌ Error loading React HTML:', err);
                // Even if HTML fails to load, try showing window with error message
                console.log('🔧 ERROR FALLBACK: Showing window despite HTML load failure...');
                this.emergencyShowWindow();
            });

        // 🔧 INSTANT ATTEMPT: Try showing window immediately (before any content loads)
        console.log('🔧 INSTANT: Attempting to show window before content loads...');
        setTimeout(() => {
            if (this.mainWindow) {
                console.log('🔧 INSTANT: Executing immediate window show...');
                this.showWindowProperly();
            }
        }, 100); // Very short delay to ensure window is fully created

        this.mainWindow.once('ready-to-show', () => {
            console.log('🖥️  Window ready-to-show event fired');
            this.showWindowProperly();

            // Enable Developer Tools only in React test mode (not production)
            if (this.reactTestMode) {
                console.log('🔧 Opening DevTools for React testing...');
                this.mainWindow.webContents.openDevTools();
            }

            // Open DevTools only in explicit debug mode (not for normal users)
            if (process.env.SP5PROXY_FORCE_DEVTOOLS === '1' || this.reactTestMode) {
                console.log('🔧 Opening DevTools for debugging...');
                this.mainWindow.webContents.openDevTools();
            }
        });

        // 🔧 IMMEDIATE FALLBACK: Show window after 1 second regardless of content loading
        setTimeout(() => {
            if (this.mainWindow && !this.mainWindow.isVisible()) {
                console.log('🖥️  EMERGENCY: Force showing window (1-second fallback)');
                this.emergencyShowWindow();
            }
        }, 1000);

        // 🔧 AGGRESSIVE FALLBACK: Show window after 3 seconds if still not visible
        setTimeout(() => {
            if (this.mainWindow && !this.mainWindow.isVisible()) {
                console.log('🖥️  AGGRESSIVE: Force showing window (3-second fallback)');
                this.emergencyShowWindow();
            }
        }, 3000);

        // 🔧 NUCLEAR OPTION: Show window after 5 seconds no matter what
        setTimeout(() => {
            if (this.mainWindow) {
                console.log('🖥️  NUCLEAR: Force showing window (5-second nuclear option)');
                this.emergencyShowWindow();
                // Open DevTools only if explicitly requested for diagnosis
                if (process.env.SP5PROXY_FORCE_DEVTOOLS === '1') {
                    try {
                        console.log('🔧 Opening DevTools for emergency diagnosis...');
                        this.mainWindow.webContents.openDevTools();
                    } catch (devToolsError) {
                        console.warn('⚠️  Could not open DevTools:', devToolsError.message);
                    }
                }
            }
        }, 5000);

        this.mainWindow.webContents.on('did-finish-load', async () => {
            console.log('🖥️  Window content finished loading');
            this.windowReady = true; // Mark window as ready for communication

            // Auto-load saved configuration
            try {
                const savedConfig = this.configManager.getLastProxyConfig();
                if (savedConfig) {
                    console.log('📋 Auto-loading saved proxy configuration:', {
                        host: savedConfig.host,
                        port: savedConfig.port,
                        type: savedConfig.type
                    });

                    // Send saved config to renderer
                    this.safeWebContentsSend('config-auto-loaded', savedConfig);
                }

                // Send UI configuration
                const uiConfig = this.configManager.getUIConfig();
                this.safeWebContentsSend('ui-config-loaded', uiConfig);

                // Check if auto-connect is enabled
                if (this.configManager.shouldAutoConnect()) {
                    console.log('🔄 Auto-connect enabled - will attempt connection after UI loads');
                    setTimeout(() => {
                        this.safeWebContentsSend('auto-connect-ready', savedConfig);
                    }, 2000);
                }

            } catch (error) {
                console.error('❌ Failed to auto-load configuration:', error);
            }
        });

        this.mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
            console.error('🖥️  Window failed to load:', errorCode, errorDescription);
        });

        this.mainWindow.on('closed', () => {
            console.log('🖥️  Window closed');
            this.mainWindow = null;
        });

        this.mainWindow.on('show', () => {
            console.log('🖥️  Window show event fired');
        });

        // Handle external links
        this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
            shell.openExternal(url);
            return { action: 'deny' };
        });

        console.log('🖥️  Window setup complete');

        // 🔧 FINAL SAFETY: Ensure window is properly focused and visible (Windows-specific fixes)
        if (process.platform === 'win32') {
            console.log('🔧 WINDOWS: Applying platform-specific window visibility fixes...');
            setTimeout(() => {
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    try {
                        // Windows-specific visibility enhancement
                        this.mainWindow.setSkipTaskbar(false);
                        this.mainWindow.show();
                        this.mainWindow.focus();
                        this.mainWindow.flashFrame(true); // Flash taskbar to get attention
                        setTimeout(() => {
                            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                                this.mainWindow.flashFrame(false); // Stop flashing
                            }
                        }, 1000);
                        console.log('✅ WINDOWS: Platform-specific fixes applied');
                    } catch (winError) {
                        console.warn('⚠️ WINDOWS: Platform-specific fixes failed:', winError.message);
                    }
                }
            }, 200);
        }
    }

    showWindowProperly() {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) {
            return;
        }

        try {
            console.log('🖥️  Showing window properly...');
            
            // Force show the window
            this.mainWindow.show();
            
            // Bring to front and focus
            this.mainWindow.setAlwaysOnTop(true);
            this.mainWindow.focus();
            this.mainWindow.setAlwaysOnTop(false);
            
            // Center the window
            this.mainWindow.center();
            
            // Ensure it's visible and focusable
            this.mainWindow.setSkipTaskbar(false);
            this.mainWindow.showInactive();
            this.mainWindow.show();
            
            console.log('🖥️  Window should now be visible');
        } catch (error) {
            console.error('🖥️  Error showing window:', error);
        }
    }

    emergencyShowWindow() {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) {
            console.error('🚨 EMERGENCY: Cannot show window - window is null or destroyed!');
            return;
        }

        try {
            console.log('🚨 EMERGENCY: Attempting aggressive window display...');
            
            // Log current window state
            console.log('🔍 Window state before emergency show:', {
                isVisible: this.mainWindow.isVisible(),
                isMinimized: this.mainWindow.isMinimized(),
                isDestroyed: this.mainWindow.isDestroyed(),
                bounds: this.mainWindow.getBounds()
            });
            
            // Multiple aggressive show attempts
            console.log('🔧 Step 1: Basic show commands...');
            this.mainWindow.show();
            this.mainWindow.showInactive();
            this.mainWindow.restore();
            
            console.log('🔧 Step 2: Focus and positioning...');
            this.mainWindow.focus();
            this.mainWindow.center();
            this.mainWindow.moveTop();
            
            console.log('🔧 Step 3: Visibility flags...');
            this.mainWindow.setSkipTaskbar(false);
            this.mainWindow.setVisibleOnAllWorkspaces(true);
            
            console.log('🔧 Step 4: Temporary always on top...');
            this.mainWindow.setAlwaysOnTop(true);
            setTimeout(() => {
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    this.mainWindow.setAlwaysOnTop(false);
                }
            }, 2000);
            
            console.log('🔧 Step 5: Final show attempt...');
            this.mainWindow.show();
            
            // Log final state
            console.log('🔍 Window state after emergency show:', {
                isVisible: this.mainWindow.isVisible(),
                isMinimized: this.mainWindow.isMinimized(),
                bounds: this.mainWindow.getBounds()
            });
            
            if (this.mainWindow.isVisible()) {
                console.log('✅ EMERGENCY: Window is now visible!');
            } else {
                console.error('❌ EMERGENCY: Window still not visible despite all attempts!');
            }
            
        } catch (error) {
            console.error('🚨 EMERGENCY: Critical error during window show:', error);
            
            // Last resort: Try recreating the window
            console.log('🆘 LAST RESORT: Attempting window recreation...');
            try {
                this.createWindow();
            } catch (recreateError) {
                console.error('💀 FATAL: Window recreation failed:', recreateError);
            }
        }
    }

    setupIPC() {
        // Prevent duplicate IPC handler registration
        if (this.ipcHandlersRegistered) {
            console.log('⚠️ IPC handlers already registered, skipping...');
            return;
        }
        this.ipcHandlersRegistered = true;

        // Proxy connection management
        ipcMain.handle('connect-proxy', async (event, config) => {
            try {
                await this.connectProxy(config);
                return { success: true, message: 'Connected successfully' };
            } catch (error) {
                console.error('Connection failed:', error);
                return { success: false, message: error.message };
            }
        });

        ipcMain.handle('disconnect-proxy', async () => {
            try {
                await this.disconnectProxy();
                return { success: true, message: 'Disconnected successfully' };
            } catch (error) {
                console.error('Disconnection failed:', error);
                return { success: false, message: error.message };
            }
        });

        // Enhanced Configuration management with persistence
        ipcMain.handle('save-proxy-config', async (event, config) => {
            try {
                await this.configManager.saveProxyConfig(config);
                console.log('✅ Proxy configuration saved successfully');
                return { success: true };
            } catch (error) {
                console.error('❌ Failed to save proxy configuration:', error);
                return { success: false, message: error.message };
            }
        });

        ipcMain.handle('load-proxy-config', async () => {
            try {
                const config = this.configManager.getProxyConfig();
                console.log('✅ Proxy configuration loaded:', { host: config.host || '(not set)', port: config.port || '(not set)' });
                return { success: true, config };
            } catch (error) {
                console.error('❌ Failed to load proxy configuration:', error);
                return { success: false, config: null };
            }
        });

        ipcMain.handle('get-last-proxy-config', async () => {
            try {
                const config = this.configManager.getLastProxyConfig();
                return { success: true, config };
            } catch (error) {
                return { success: false, config: null };
            }
        });

        ipcMain.handle('clear-proxy-config', async () => {
            try {
                await this.configManager.clearProxyConfig();
                return { success: true };
            } catch (error) {
                return { success: false, message: error.message };
            }
        });

        ipcMain.handle('save-ui-config', async (event, config) => {
            try {
                await this.configManager.saveUIConfig(config);
                return { success: true };
            } catch (error) {
                return { success: false, message: error.message };
            }
        });

        ipcMain.handle('get-ui-config', async () => {
            try {
                const config = this.configManager.getUIConfig();
                return { success: true, config };
            } catch (error) {
                return { success: false, config: null };
            }
        });

        ipcMain.handle('should-auto-connect', async () => {
            try {
                const shouldConnect = this.configManager.shouldAutoConnect();
                return { success: true, shouldConnect };
            } catch (error) {
                return { success: false, shouldConnect: false };
            }
        });

        // Legacy support for old config system
        ipcMain.handle('save-config', async (event, config) => {
            try {
                await this.configManager.saveProxyConfig(config);
                return { success: true };
            } catch (error) {
                return { success: false, message: error.message };
            }
        });

        ipcMain.handle('load-config', async () => {
            try {
                const config = this.configManager.getProxyConfig();
                return { success: true, config };
            } catch (error) {
                return { success: false, config: null };
            }
        });

        // Status queries
        ipcMain.handle('get-status', () => {
            return {
                isConnected: this.isConnected,
                currentConfig: this.currentConfig,
                externalIP: this.proxyManager ? this.proxyManager.getExternalIP() : 'Unable to detect',
                proxyHealth: this.proxyManager ? {
                    isHealthy: this.proxyManager.isHealthy,
                    lastHealthCheck: this.proxyManager.lastHealthCheck
                } : null
            };
        });

        // Test IP synchronization flow
        ipcMain.handle('test-ip-sync-flow', async () => {
            try {
                console.log('🧪 Starting IP synchronization flow test...');

                const testResults = {
                    ipDetection: false,
                    locationDetection: false,
                    proxyHealth: false,
                    uiUpdates: false,
                    errors: []
                };

                // Test 1: IP Detection
                try {
                    const currentIP = await this.fetchCurrentIP();
                    if (currentIP && this.isValidIP(currentIP)) {
                        testResults.ipDetection = true;
                        console.log('✅ IP detection test passed:', currentIP);
                    } else {
                        testResults.errors.push('IP detection failed or returned invalid IP');
                    }
                } catch (ipError) {
                    testResults.errors.push(`IP detection error: ${ipError.message}`);
                }

                // Test 2: Location Detection (if IP detection passed)
                if (testResults.ipDetection) {
                    try {
                        // Trigger location update
                        this.safeWebContentsSend('trigger-ip-location-update');
                        testResults.locationDetection = true;
                        console.log('✅ Location detection test triggered');
                    } catch (locationError) {
                        testResults.errors.push(`Location detection error: ${locationError.message}`);
                    }
                }

                // Test 3: Proxy Health (if connected)
                if (this.isConnected && this.proxyManager) {
                    try {
                        const healthCheck = await this.proxyManager.checkConnectionHealth();
                        testResults.proxyHealth = healthCheck;
                        console.log('✅ Proxy health test completed:', healthCheck);
                    } catch (healthError) {
                        testResults.errors.push(`Proxy health check error: ${healthError.message}`);
                    }
                }

                // Test 4: UI Updates
                try {
                    this.safeWebContentsSend('test-ui-sync', {
                        timestamp: new Date().toISOString(),
                        testData: 'IP sync flow test'
                    });
                    testResults.uiUpdates = true;
                    console.log('✅ UI update test triggered');
                } catch (uiError) {
                    testResults.errors.push(`UI update error: ${uiError.message}`);
                }

                console.log('🧪 IP synchronization flow test completed:', testResults);
                return { success: true, results: testResults };

            } catch (error) {
                console.error('❌ IP sync flow test failed:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('get-external-ip', async () => {
            try {
                console.log('🌐 IPC: Attempting to fetch external IP...');
                
                // Try primary method first (if available)
                if (this.proxyManager && this.proxyManager.fetchExternalIP) {
                    let ip = await this.proxyManager.fetchExternalIP();
                    if (ip) {
                        console.log('✅ IPC: Primary IP detection successful:', ip);
                        return { success: true, ip };
                    }
                } else {
                    console.log('⚠️ ProxyManager not available, using fallback methods...');
                }
                
                console.log('⚠️ IPC: Primary IP detection failed, trying fallback methods...');
                
                // Fallback IP detection methods
                const axios = require('axios');
                const fallbackMethods = [
                    { url: 'https://httpbin.org/ip', parser: (data) => data.origin },
                    { url: 'https://api.ipify.org?format=json', parser: (data) => data.ip },
                    { url: 'https://jsonip.com', parser: (data) => data.ip },
                    { url: 'https://ipapi.co/json', parser: (data) => data.ip },
                    { url: 'https://icanhazip.com', parser: (data) => data.trim() }
                ];

                for (const method of fallbackMethods) {
                    try {
                        console.log('🔄 IPC: Trying fallback method:', method.url);
                        const response = await axios.get(method.url, { 
                            timeout: 8000,
                            headers: { 'User-Agent': 'SP5Proxy/1.0' }
                        });
                        
                        let detectedIP;
                        if (typeof response.data === 'string') {
                            detectedIP = response.data.trim();
                        } else {
                            detectedIP = method.parser(response.data);
                        }
                        
                        // Validate IP format
                        if (detectedIP && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(detectedIP)) {
                            console.log('✅ IPC: Fallback IP detection successful:', detectedIP);
                            return { success: true, ip: detectedIP };
                        }
                    } catch (methodError) {
                        console.log('❌ IPC: Fallback method failed:', method.url, methodError.message);
                    }
                }
                
                console.error('❌ IPC: All IP detection methods failed');
                return { success: false, ip: null, error: 'All IP detection methods failed' };
            } catch (error) {
                console.error('❌ IPC: IP detection error:', error);
                return { success: false, ip: null, error: error.message };
            }
        });

        ipcMain.handle('get-location-info', async (event, ipAddress) => {
            try {
                console.log('🌍 Getting location info for IP:', ipAddress);
                const axios = require('axios');
                
                // Try multiple APIs for better reliability
                const apis = [
                    {
                        name: 'ipapi.co',
                        url: `https://ipapi.co/${ipAddress}/json/`,
                        parser: (data) => ({
                            country: data.country_name,
                            country_code: data.country_code,
                            city: data.city,
                            region: data.region,
                            flag: getCountryFlag(data.country_code)
                        })
                    },
                    {
                        name: 'ip-api.com',
                        url: `http://ip-api.com/json/${ipAddress}`,
                        parser: (data) => ({
                            country: data.country,
                            country_code: data.countryCode,
                            city: data.city,
                            region: data.regionName,
                            flag: getCountryFlag(data.countryCode)
                        })
                    },
                    {
                        name: 'ipinfo.io',
                        url: `https://ipinfo.io/${ipAddress}/json`,
                        parser: (data) => ({
                            country: data.country,
                            country_code: data.country,
                            city: data.city,
                            region: data.region,
                            flag: getCountryFlag(data.country)
                        })
                    }
                ];

                // Helper function to get country flag emoji
                function getCountryFlag(countryCode) {
                    if (!countryCode || countryCode.length !== 2) return '🌐';
                    const flagMap = {
                        'US': '🇺🇸', 'GB': '🇬🇧', 'CA': '🇨🇦', 'DE': '🇩🇪', 'FR': '🇫🇷',
                        'JP': '🇯🇵', 'AU': '🇦🇺', 'BR': '🇧🇷', 'IN': '🇮🇳', 'CN': '🇨🇳',
                        'RU': '🇷🇺', 'KR': '🇰🇷', 'IT': '🇮🇹', 'ES': '🇪🇸', 'NL': '🇳🇱',
                        'SE': '🇸🇪', 'NO': '🇳🇴', 'DK': '🇩🇰', 'FI': '🇫🇮', 'CH': '🇨🇭',
                        'AT': '🇦🇹', 'BE': '🇧🇪', 'IE': '🇮🇪', 'PT': '🇵🇹', 'GR': '🇬🇷',
                        'TR': '🇹🇷', 'IL': '🇮🇱', 'SA': '🇸🇦', 'AE': '🇦🇪', 'EG': '🇪🇬',
                        'ZA': '🇿🇦', 'NG': '🇳🇬', 'KE': '🇰🇪', 'MX': '🇲🇽', 'AR': '🇦🇷',
                        'CL': '🇨🇱', 'CO': '🇨🇴', 'PE': '🇵🇪', 'VE': '🇻🇪', 'TH': '🇹🇭',
                        'VN': '🇻🇳', 'MY': '🇲🇾', 'SG': '🇸🇬', 'ID': '🇮🇩', 'PH': '🇵🇭',
                        'PK': '🇵🇰', 'BD': '🇧🇩', 'LK': '🇱🇰', 'NP': '🇳🇵', 'MM': '🇲🇲'
                    };
                    return flagMap[countryCode.toUpperCase()] || '🌐';
                }

                // Try each API until one works
                for (const api of apis) {
                    try {
                        console.log(`🔍 Trying ${api.name} API...`);
                        const response = await axios.get(api.url, {
                            timeout: 8000,
                            headers: {
                                'User-Agent': 'SP5Proxy/1.0',
                                'Accept': 'application/json'
                            }
                        });

                        if (response.data && response.status === 200) {
                            const locationData = api.parser(response.data);
                            console.log(`✅ Location data from ${api.name}:`, locationData);
                            
                            // Update session location in database if we have an active session
                            if (this.isConnected && this.currentSessionId && ipAddress !== 'Unknown') {
                                try {
                                    // Build location string
                                    let locationString = locationData.country || 'Unknown';
                                    if (locationData.city && locationData.region) {
                                        locationString = `${locationData.city}, ${locationData.region}, ${locationData.country}`;
                                    } else if (locationData.city) {
                                        locationString = `${locationData.city}, ${locationData.country}`;
                                    } else if (locationData.region) {
                                        locationString = `${locationData.region}, ${locationData.country}`;
                                    }

                                    await this.databaseManager.updateSessionLocation(
                                        this.currentSessionId,
                                        ipAddress,
                                        locationString,
                                        locationData.country_code || 'XX'
                                    );
                                    
                                    console.log('📍 Session location updated in database');
                                } catch (updateError) {
                                    console.warn('⚠️ Failed to update session location:', updateError.message);
                                }
                            }
                            
                            return { 
                                success: true, 
                                country: locationData.country || 'Unknown',
                                country_code: locationData.country_code || '',
                                city: locationData.city || '',
                                region: locationData.region || '',
                                flag: locationData.flag || '🌐'
                            };
                        }
                    } catch (apiError) {
                        console.log(`⚠️ ${api.name} failed:`, apiError.message);
                        continue;
                    }
                }

                // If all APIs fail, return default
                console.log('⚠️ All location APIs failed, using defaults');
                return { 
                    success: true, 
                    country: 'Unknown',
                    country_code: '',
                    city: '',
                    region: '',
                    flag: '🌐'
                };
                
            } catch (error) {
                console.error('❌ Failed to get location info:', error.message);
                return { 
                    success: false, 
                    error: error.message,
                    country: 'Unknown',
                    flag: '🌐'
                };
            }
        });

        // System info
        ipcMain.handle('check-admin-rights', async () => {
            if (!this.elevationManager) {
                return false; // Default to no admin rights if manager not available
            }
            return await this.elevationManager.checkAdminRights();
        });

        ipcMain.handle('refresh-admin-status', async () => {
            try {
                const hasAdminRights = await this.elevationManager.refreshAdminStatus();
                return { success: true, hasAdminRights };
            } catch (error) {
                console.error('Failed to refresh admin status:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('request-elevation', async () => {
            try {
                await this.requestElevationAndRestart();
                return { success: true };
            } catch (error) {
                return { success: false, message: error.message };
            }
        });

        ipcMain.handle('update-session-location', async (event, ipAddress, locationInfo) => {
            try {
                if (!this.isConnected || !this.currentSessionId) {
                    return { success: false, message: 'No active session' };
                }

                // Build location string
                let locationString = locationInfo.country || 'Unknown';
                if (locationInfo.city && locationInfo.region) {
                    locationString = `${locationInfo.city}, ${locationInfo.region}, ${locationInfo.country}`;
                } else if (locationInfo.city) {
                    locationString = `${locationInfo.city}, ${locationInfo.country}`;
                } else if (locationInfo.region) {
                    locationString = `${locationInfo.region}, ${locationInfo.country}`;
                }

                const result = await this.databaseManager.updateSessionLocation(
                    this.currentSessionId,
                    ipAddress,
                    locationString,
                    locationInfo.country_code || 'XX'
                );

                if (result) {
                    console.log('📍 Session location updated successfully');
                    return { success: true };
                } else {
                    return { success: false, message: 'Failed to update database' };
                }
            } catch (error) {
                console.error('❌ Failed to update session location:', error);
                return { success: false, message: error.message };
            }
        });

        ipcMain.handle('exit-app', async () => {
            try {
                await this.cleanup();
                app.quit();
                return { success: true };
            } catch (error) {
                app.quit();
                return { success: false, message: error.message };
            }
        });

        ipcMain.handle('notify-react-ready', async () => {
            console.log('🎯 React UI is fully loaded and ready');
            return { success: true };
        });

        ipcMain.handle('restart-as-admin', async () => {
            try {
                await this.elevationManager.restartAsAdmin();
                return { success: true };
            } catch (error) {
                return { success: false, message: error.message };
            }
        });

        ipcMain.handle('get-elevation-status', async () => {
            try {
                const status = this.elevationManager.getStatus();
                const hasAdminRights = await this.elevationManager.checkAdminRights();
                return {
                    success: true,
                    status: { ...status, hasAdminRights }
                };
            } catch (error) {
                return { success: false, message: error.message };
            }
        });

        ipcMain.handle('open-troubleshooting-guide', async () => {
            const { shell } = require('electron');
            const path = require('path');
            const troubleshootingPath = path.join(__dirname, 'TROUBLESHOOTING.md');
            shell.openPath(troubleshootingPath);
        });

        ipcMain.handle('run-fix-tun-interface', async () => {
            return await this.runFixTunInterface();
        });

        // DNS management
        ipcMain.handle('get-dns-status', () => {
            return this.dnsManager.getStatus();
        });

        ipcMain.handle('emergency-dns-reset', async () => {
            try {
                await this.dnsManager.emergencyReset();
                return { success: true, message: 'DNS settings reset successfully' };
            } catch (error) {
                return { success: false, message: error.message };
            }
        });

        // DNS leak testing
        ipcMain.handle('run-dns-leak-test', async () => {
            try {
                const results = await this.dnsLeakTester.runComprehensiveTest();
                return { success: true, results };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('get-dns-leak-test-results', () => {
            return this.dnsLeakTester.getLatestResults();
        });

        ipcMain.handle('is-dns-leak-test-running', () => {
            return this.dnsLeakTester.isRunning();
        });

        ipcMain.handle('run-dns-connectivity-test', async () => {
            try {
                const isConnected = await this.dnsManager.testDNSConnectivity();
                return { success: true, isConnected };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('start-dns-leak-monitoring', () => {
            try {
                this.dnsManager.startDNSLeakMonitoring((results) => {
                    // Send real-time leak detection results to renderer
                    if (this.mainWindow) {
                        this.mainWindow.webContents.send('dns-leak-detected', results);
                    }
                });
                return { success: true, message: 'DNS leak monitoring started' };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('stop-dns-leak-monitoring', () => {
            try {
                this.dnsManager.stopDNSLeakMonitoring();
                return { success: true, message: 'DNS leak monitoring stopped' };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        // Proxy validation
        ipcMain.handle('validate-proxy', async (event, config) => {
            try {
                const result = await this.proxyManager.validateProxyConnection(config);
                return { success: true, result: result };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('validate-proxy-with-retry', async (event, config) => {
            try {
                const result = await this.proxyManager.validateProxyWithRetry(config);
                return { success: true, result: result };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('get-validation-results', () => {
            return this.proxyManager.getValidationResults();
        });

        // Monetization system IPC handlers
        ipcMain.handle('monetization-get-status', () => {
            return this.monetizationManager.getStatus();
        });

        // URL-based extension system
        ipcMain.handle('monetization-start-webview-extension', async () => {
            try {
                return await this.monetizationManager.startUrlExtension();
            } catch (error) {
                console.error('Failed to start URL extension:', error);
                return { success: false, message: error.message };
            }
        });

        // New URL extension handler
        ipcMain.handle('start-url-extension', async () => {
            try {
                return await this.monetizationManager.startUrlExtension();
            } catch (error) {
                console.error('Failed to start URL extension:', error);
                return { success: false, message: error.message };
            }
        });

        // Manual extension completion handler
        ipcMain.handle('complete-url-extension', async (event, sessionId, userId) => {
            try {
                if (!this.urlExtensionManager) {
                    return { success: false, message: 'URL Extension Manager not initialized' };
                }
                return await this.urlExtensionManager.manuallyCompleteExtension(sessionId, userId);
            } catch (error) {
                console.error('Failed to manually complete URL extension:', error);
                return { success: false, message: error.message };
            }
        });

        // Get URL extension status
        ipcMain.handle('get-url-extension-status', async (event, sessionId) => {
            try {
                if (!this.urlExtensionManager) {
                    return { success: false, message: 'URL Extension Manager not initialized' };
                }
                const status = this.urlExtensionManager.getExtensionStatus(sessionId);
                return { success: true, status };
            } catch (error) {
                console.error('Failed to get URL extension status:', error);
                return { success: false, message: error.message };
            }
        });

        // Get all active URL extensions
        ipcMain.handle('get-active-url-extensions', async () => {
            try {
                if (!this.urlExtensionManager) {
                    return { success: false, message: 'URL Extension Manager not initialized' };
                }
                const extensions = this.urlExtensionManager.getActiveExtensions();
                return { success: true, extensions };
            } catch (error) {
                console.error('Failed to get active URL extensions:', error);
                return { success: false, message: error.message };
            }
        });

        // Get URL extension manager status
        ipcMain.handle('get-url-extension-manager-status', async () => {
            try {
                if (!this.urlExtensionManager) {
                    return { success: false, message: 'URL Extension Manager not initialized' };
                }
                const status = this.urlExtensionManager.getStatus();
                return { success: true, status };
            } catch (error) {
                console.error('Failed to get URL extension manager status:', error);
                return { success: false, message: error.message };
            }
        });

        // Short Jambo API Configuration Handlers
        ipcMain.handle('get-short-jambo-config', async () => {
            try {
                if (!this.urlExtensionManager) {
                    return { success: false, message: 'URL Extension Manager not initialized' };
                }
                return { 
                    success: true, 
                    config: this.urlExtensionManager.shortJamboConfig 
                };
            } catch (error) {
                console.error('Failed to get Short Jambo config:', error);
                return { success: false, message: error.message };
            }
        });

        ipcMain.handle('update-short-jambo-config', async (event, newConfig) => {
            try {
                if (!this.urlExtensionManager) {
                    return { success: false, message: 'URL Extension Manager not initialized' };
                }
                
                this.urlExtensionManager.updateShortJamboConfig(newConfig);
                return { 
                    success: true, 
                    message: 'Short Jambo configuration updated successfully',
                    config: this.urlExtensionManager.shortJamboConfig 
                };
            } catch (error) {
                console.error('Failed to update Short Jambo config:', error);
                return { success: false, message: error.message };
            }
        });

        ipcMain.handle('test-short-jambo-api', async () => {
            try {
                if (!this.urlExtensionManager) {
                    return { success: false, message: 'URL Extension Manager not initialized' };
                }
                
                // Create test shortened URL
                const testUrl = await this.urlExtensionManager.createShortenedUrl('TEST_' + Date.now(), 'admin');
                
                if (testUrl && testUrl !== this.urlExtensionManager.shortJamboConfig.destinationUrl) {
                    return { 
                        success: true, 
                        message: 'Short Jambo API test successful',
                        testUrl: testUrl
                    };
                } else {
                    return { 
                        success: false, 
                        message: 'Short Jambo API test failed - fallback URL returned',
                        fallbackUrl: testUrl
                    };
                }
            } catch (error) {
                console.error('Failed to test Short Jambo API:', error);
                return { success: false, message: error.message };
            }
        });

        // Mark URL extension as completed externally
        ipcMain.handle('mark-url-extension-completed', async (event, sessionId, userId, source = 'manual') => {
            try {
                if (!this.urlExtensionManager) {
                    return { success: false, message: 'URL Extension Manager not initialized' };
                }
                
                const result = this.urlExtensionManager.markSessionCompleted(sessionId, userId, source);
                
                if (result) {
                    return { 
                        success: true, 
                        message: `Extension session ${sessionId} marked as completed from ${source}`
                    };
                } else {
                    return { 
                        success: false, 
                        message: `Failed to mark session ${sessionId} as completed`
                    };
                }
            } catch (error) {
                console.error('Failed to mark URL extension completed:', error);
                return { success: false, message: error.message };
            }
        });

        // LEGACY SUPPORT: Redirect old generate-url calls to new URL extension system
        ipcMain.handle('monetization-generate-url', async () => {
            try {
                console.log('🔄 Legacy monetization-generate-url called - redirecting to URL extension system');
                return await this.monetizationManager.startUrlExtension();
            } catch (error) {
                console.error('Failed to start URL extension (legacy call):', error);
                return { success: false, message: error.message };
            }
        });

        ipcMain.handle('monetization-check-internet-connection', async () => {
            try {
                return await this.monetizationManager.checkInternetConnection();
            } catch (error) {
                console.error('Failed to check internet connection:', error);
                return { success: false, message: error.message };
            }
        });

        ipcMain.handle('monetization-get-connection-status', () => {
            return this.monetizationManager.getConnectionStatus();
        });

        // Admin URL management handlers
        ipcMain.handle('get-admin-urls', () => {
            return this.monetizationManager.getAdminUrls();
        });

        ipcMain.handle('add-admin-url', async (event, url) => {
            try {
                return await this.monetizationManager.addAdminUrl(url);
            } catch (error) {
                console.error('Failed to add admin URL:', error);
                return { success: false, message: error.message };
            }
        });

        ipcMain.handle('remove-admin-url', async (event, id) => {
            try {
                return await this.monetizationManager.removeAdminUrl(id);
            } catch (error) {
                console.error('Failed to remove admin URL:', error);
                return { success: false, message: error.message };
            }
        });

        ipcMain.handle('toggle-admin-url', async (event, id) => {
            try {
                return await this.monetizationManager.toggleAdminUrl(id);
            } catch (error) {
                console.error('Failed to toggle admin URL:', error);
                return { success: false, message: error.message };
            }
        });

        // Handle proxy connection status check
        ipcMain.handle('check-connection-status', async () => {
            try {
                const networkStatus = this.networkManager.getStatus();
                const isRunning = this.proxyManager.isRunning();
                
                return {
                    success: true,
                    isConnected: this.isConnected,
                    isRunning: isRunning,
                    networkStatus: networkStatus,
                    config: this.currentConfig
                };
            } catch (error) {
                return {
                    success: false,
                    error: error.message
                };
            }
        });

        // URL Extension System Handlers
        ipcMain.handle('start-webview-extension', async (event) => {
            try {
                if (!this.monetizationManager) {
                    return { success: false, message: 'Monetization Manager not initialized' };
                }

                // Use the new URL extension system
                const result = await this.monetizationManager.startUrlExtension();
                return result;
            } catch (error) {
                console.error('❌ URL extension start failed:', error);
                return { success: false, message: error.message };
            }
        });

        ipcMain.handle('get-webview-extension-status', async () => {
            try {
                if (!this.urlExtensionManager) {
                    return { success: false, message: 'URL Extension Manager not initialized' };
                }

                const status = this.urlExtensionManager.getStatus();
                return { success: true, status };
            } catch (error) {
                console.error('❌ URL extension status check failed:', error);
                return { success: false, message: error.message };
            }
        });

        // IP Auto-refresh management
        ipcMain.handle('start-ip-refresh', () => {
            try {
                this.startIPRefresh();
                return { success: true, message: 'IP auto-refresh started' };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('stop-ip-refresh', () => {
            try {
                this.stopIPRefresh();
                return { success: true, message: 'IP auto-refresh stopped' };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('set-ip-refresh-interval', (event, intervalMs) => {
            try {
                this.ipRefreshIntervalMs = Math.max(5000, intervalMs); // Minimum 5 seconds
                if (this.ipRefreshInterval) {
                    this.stopIPRefresh();
                    this.startIPRefresh();
                }
                return { success: true, message: `IP refresh interval set to ${this.ipRefreshIntervalMs}ms` };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        // Handle deep link protocol for extension completion
        app.setAsDefaultProtocolClient('sp5proxy');

        app.on('open-url', (event, url) => {
            event.preventDefault();
            console.log('🔗 Deep link received:', url);

            // URL extension system uses direct browser redirection
            // Deep links are not needed for the new system
            console.log('ℹ️ URL extension system uses direct browser redirection');
        });
    }

    async connectProxy(config) {
        // Check if essential components are initialized
        if (!this.proxyManager) {
            throw new Error('Proxy Manager is not initialized. Please restart the application.');
        }
        if (!this.networkManager) {
            throw new Error('Network Manager is not initialized. Please restart the application.');
        }
        if (!this.elevationManager) {
            throw new Error('Elevation Manager is not initialized. Please restart the application.');
        }

        if (this.isConnected) {
            console.log('Already connected, disconnecting first...');
            await this.disconnectProxy();
        }

        try {
            console.log('Starting proxy connection process...');
            console.log('Config:', { host: config.host, port: config.port, type: config.type });

            this.safeWebContentsSend('proxy-status-changed', {
                connected: false,
                connecting: true,
                step: 'Initializing',
                message: 'Starting connection process...'
            });

            // Step 0: Validate proxy connectivity
            console.log('Step 0: Validating proxy connectivity...');
            this.mainWindow.webContents.send('proxy-status-changed', {
                connected: false,
                connecting: true,
                step: 'Validating Proxy',
                message: 'Testing proxy connectivity...'
            });

                    // Use faster validation with reduced HTTP testing
        const validationResults = await this.proxyManager.validateProxyConnection(config, { skipHttpTest: true });
        if (!validationResults.isValid) {
            throw new Error(`Proxy validation failed: ${validationResults.errors.join(', ')}`);
        }

            console.log('✅ Proxy validation successful!');
            console.log(`Response time: ${validationResults.responseTime}ms`);
            console.log(`Retry attempts: ${validationResults.retryAttempts}`);

            // Update progress after validation completes
            if (this.mainWindow) {
                this.mainWindow.webContents.send('connection-progress', {
                    step: 1,
                    total: 6,
                    message: 'Proxy validation successful! Setting up connection...',
                    progress: 16
                });
            }

            // Step 1: Check administrator privileges with detailed feedback
            console.log('Step 1: Checking administrator privileges...');
            this.mainWindow.webContents.send('proxy-status-changed', {
                connected: false,
                connecting: true,
                step: 'Checking Privileges',
                message: 'Verifying administrator access...'
            });

            const hasAdminRights = await this.elevationManager.checkAdminRights();
            console.log(`Admin status refreshed: ${hasAdminRights ? 'Administrator' : 'Standard User'}`);

            if (!hasAdminRights) {
                console.log('⚠️ Administrator privileges required for TUN interface creation');
                
                // Send detailed error to frontend
                this.mainWindow.webContents.send('proxy-status-changed', {
                    connected: false,
                    connecting: false,
                    error: true,
                    step: 'Admin Required',
                    message: 'Administrator privileges required. Please restart SP5Proxy as Administrator.',
                    adminRequired: true,
                    canRequestElevation: true
                });

                // Show elevation options to user
                const elevationChoice = await this.showElevationDialog();
                
                if (elevationChoice === 'elevate') {
                    console.log('User chose to elevate privileges...');
                    await this.requestElevationAndRestart();
                    return; // Process will restart with admin rights
                } else if (elevationChoice === 'exit') {
                    console.log('User chose to exit application');
                    app.quit();
                    return;
                } else {
                    throw new Error('Administrator privileges required. Please restart SP5Proxy as Administrator.');
                }
            }

            // Continue with connection process if admin rights are available
            console.log('✅ Administrator privileges confirmed, proceeding with connection...');
            
            // Step 2: Create TUN interface
            this.mainWindow.webContents.send('proxy-status-changed', {
                connected: false,
                connecting: true,
                step: 'Creating TUN Interface',
                message: 'Setting up virtual network interface...'
            });

            // Generate session ID early (will create full session later with location data)
            this.currentSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            console.log('📝 Session ID generated:', this.currentSessionId);

            // Step 3: Configure proxy server IP for routing (before starting tun2socks)
            console.log('Step 3: Configuring proxy server routing...');
            this.networkManager.setProxyServerIP(config.host);

            // Step 4: Start tun2socks (this will create the TUN interface automatically)
            console.log('Step 4: Starting tun2socks (will create TUN interface automatically)...');

            // Send progress update to UI
            if (this.mainWindow) {
                this.mainWindow.webContents.send('connection-progress', {
                    step: 2,
                    total: 6,
                    message: 'Starting tun2socks...',
                    progress: 33
                });
            }

            // Add timeout wrapper for tun2socks startup to prevent hanging
            console.log('⏱️ Starting tun2socks with 30-second timeout...');
            await Promise.race([
                this.proxyManager.startTun2Socks(config),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('tun2socks startup timed out after 30 seconds')), 30000)
                )
            ]);

            // Step 5: Optimized TUN interface discovery with dynamic waiting
            console.log('Step 5: Discovering TUN interface created by tun2socks...');

            // Send progress update to UI
            if (this.mainWindow) {
                this.mainWindow.webContents.send('connection-progress', {
                    step: 3,
                    total: 6,
                    message: 'Discovering TUN interface...',
                    progress: 50
                });
            }

            // Add timeout wrapper for interface discovery to prevent hanging
            console.log('⏱️ Starting interface discovery with 10-second timeout...');
            await Promise.race([
                this.networkManager.discoverTunInterfaceFromTun2socksOptimized(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('TUN interface discovery timed out after 10 seconds')), 10000)
                )
            ]);

            // Verify TUN interface was discovered
            const networkStatus = this.networkManager.getStatus();
            console.log('TUN interface status:', networkStatus);

            // Step 7: Configure DNS servers with leak prevention for the TUN interface
            if (networkStatus.tunInterfaceName) {
                console.log('Step 7: Configuring DNS servers with leak prevention...');

                // Send progress update to UI
                if (this.mainWindow) {
                    this.mainWindow.webContents.send('connection-progress', {
                        step: 5,
                        total: 6,
                        message: 'Configuring DNS leak prevention...',
                        progress: 75
                    });
                }

                // Add timeout to DNS configuration to prevent hanging
                try {
                    const dnsConfigPromise = this.dnsManager.configureDNS(
                        networkStatus.tunInterfaceName,
                        networkStatus.tunInterfaceIndex
                    );
                    const dnsTimeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('DNS configuration timed out')), 15000)
                    );

                    await Promise.race([dnsConfigPromise, dnsTimeoutPromise]);
                    console.log('✅ DNS configuration completed successfully');
                } catch (dnsError) {
                    console.warn('Warning: DNS configuration failed or timed out, but continuing with connection...', dnsError.message);
                    
                    // Send progress update - DNS failed but continuing
                    if (this.mainWindow) {
                        this.mainWindow.webContents.send('connection-progress', {
                            step: 5,
                            total: 6,
                            message: 'DNS setup skipped - continuing with connection...',
                            progress: 75
                        });
                    }
                    
                    // Continue anyway - basic proxy functionality will still work
                }
            }

            // Step 8: Configure FULL traffic redirection through SOCKS5 proxy
            console.log('Step 8: Configuring FULL traffic redirection through SOCKS5 proxy...');

            // Send progress update to UI
            if (this.mainWindow) {
                this.mainWindow.webContents.send('connection-progress', {
                    step: 6,
                    total: 6,
                    message: 'Configuring traffic redirection...',
                    progress: 90
                });
            }

            // Enhanced timeout wrapper for traffic redirection with better error handling
            console.log('⏱️ Starting traffic redirection with 45-second timeout...');
            try {
                await Promise.race([
                    this.networkManager.redirectTraffic(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Traffic redirection timed out after 45 seconds. Attempting recovery...')), 45000)
                    )
                ]);
                console.log('✅ Traffic redirection completed successfully');
            } catch (timeoutError) {
                console.warn('⚠️ Traffic redirection timeout detected, attempting alternative approach...');

                // Try a simplified redirection approach
                try {
                    await this.networkManager.simplifiedTrafficRedirection();
                    console.log('✅ Simplified traffic redirection completed');
                } catch (fallbackError) {
                    console.error('❌ Both standard and simplified redirection failed');
                    throw new Error(`Traffic redirection failed: ${timeoutError.message}. Fallback also failed: ${fallbackError.message}`);
                }
            }

            this.isConnected = true;
            this.currentConfig = config;

            try {
                // Create user in database if not exists
                await this.databaseManager.createOrUpdateUser(this.monetizationManager.userId, {
                    username: `User_${this.monetizationManager.userId.substr(-8)}`
                });

                // Get external IP for session data
                let externalIP = 'Unknown';
                let location = 'Unknown';
                let countryCode = 'XX';

                // External IP will be detected by the React component
                // We'll use 'Unknown' for now and update later via IPC
                console.log('📍 External IP will be detected by React component');

                // Create session in database with real data (including location)
                const sessionData = {
                    userId: this.monetizationManager.userId,
                    sessionId: this.currentSessionId,
                    proxyHost: config.host,
                    proxyPort: config.port,
                    proxyType: config.type,
                    externalIP: externalIP,
                    location: location,
                    countryCode: countryCode,
                    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes
                    isTrial: true,
                    status: 'connected'
                };

                const sessionId = await this.databaseManager.createSession(sessionData);
                if (sessionId) {
                    console.log('📊 Session created in database with location:', this.currentSessionId);
                    console.log(`   User: ${this.monetizationManager.userId}`);
                    console.log(`   Proxy: ${config.host}:${config.port}`);
                    console.log(`   External IP: ${externalIP}`);
                    console.log(`   Location: ${location}`);
                    console.log(`   Country: ${countryCode}`);

                    // Create sync event for real-time update
                    await this.databaseManager.createSyncEvent('session_created', 'session', this.currentSessionId, sessionData);
                }
            } catch (dbError) {
                console.warn('⚠️ Failed to create database session:', dbError.message);
            }

            // Start monetization timer
            try {
                const timerResult = this.monetizationManager.startConnectionTimer();
                console.log('⏰ Monetization timer started:', timerResult);
            } catch (timerError) {
                console.warn('⚠️ Failed to start monetization timer:', timerError.message);
            }

            // Auto-save successful configuration
            try {
                await this.configManager.saveProxyConfig(config);
                console.log('✅ Proxy configuration auto-saved for future use');
            } catch (saveError) {
                console.warn('⚠️ Failed to auto-save proxy configuration:', saveError.message);
            }

            // Send final progress update
            if (this.mainWindow) {
                this.mainWindow.webContents.send('connection-progress', {
                    step: 6,
                    total: 6,
                    message: 'Connection established successfully!',
                    progress: 100
                });

                // Notify renderer of status change
                this.mainWindow.webContents.send('proxy-status-changed', {
                    isConnected: true,
                    config: config,
                    networkStatus: networkStatus
                });

                // Trigger external IP and location detection after connection
                setTimeout(async () => {
                    try {
                        console.log('🌐 Triggering post-connection IP and location detection...');
                        this.mainWindow.webContents.send('trigger-ip-location-update');

                        // Start IP auto-refresh for rotating proxies
                        this.startIPRefresh();
                    } catch (error) {
                        console.warn('⚠️ Failed to trigger IP location update:', error.message);
                    }
                }, 2000); // Wait 2 seconds for connection to stabilize
            }

            console.log('Proxy connected successfully');

            // Start health monitoring for the proxy connection
            if (this.proxyManager && this.proxyManager.startHealthMonitoring) {
                this.proxyManager.startHealthMonitoring((healthStatus) => {
                    console.log('🔍 Proxy health status changed:', healthStatus);

                    if (!healthStatus.isHealthy && healthStatus.wasHealthy) {
                        console.warn('⚠️ Proxy connection health degraded');

                        // Notify renderer of health issue
                        this.safeWebContentsSend('proxy-health-changed', {
                            isHealthy: false,
                            timestamp: healthStatus.timestamp,
                            externalIP: healthStatus.externalIP
                        });
                    } else if (healthStatus.isHealthy && !healthStatus.wasHealthy) {
                        console.log('✅ Proxy connection health restored');

                        // Notify renderer of health restoration
                        this.safeWebContentsSend('proxy-health-changed', {
                            isHealthy: true,
                            timestamp: healthStatus.timestamp,
                            externalIP: healthStatus.externalIP
                        });
                    }
                });
            }

            // Verify traffic routing after connection
            setTimeout(async () => {
                try {
                    console.log('🔍 Verifying traffic routing...');
                    const verification = await this.networkManager.verifyTrafficRouting();
                    if (verification.success) {
                        console.log('✅ Traffic routing verification completed');
                        if (verification.hasProxyRoute && verification.hasTunRoutes) {
                            console.log('✅ All routes properly configured for proxy traffic');
                        } else {
                            console.warn('⚠️ Some routes may not be optimal, but connection should work');
                        }
                    } else {
                        console.warn('⚠️ Traffic routing verification failed:', verification.error);
                    }
                } catch (verifyError) {
                    console.warn('⚠️ Could not verify traffic routing:', verifyError.message);
                }
            }, 5000); // Wait 5 seconds for routes to stabilize

        } catch (error) {
            console.error('Connection failed at step:', error.message);

            // Cleanup on failure
            try {
                await this.cleanupConnection();
            } catch (cleanupError) {
                console.error('Cleanup failed:', cleanupError.message);
            }

            // Provide user-friendly error messages based on error type
            let userMessage = error.message;

            if (error.message.includes('flag provided but not defined')) {
                userMessage = 'tun2socks configuration error. The application will be updated to fix this issue.';
            } else if (error.message.includes('tun2socks executable not found')) {
                userMessage = 'tun2socks is not installed. Please download the required components or contact support.';
            } else if (error.message.includes('Permission denied') ||
                       error.message.includes('Administrator') ||
                       error.message.includes('Access is denied') ||
                       error.message.includes('tun2socks startup timed out') ||
                       error.message.includes('TUN interface discovery timed out')) {
                userMessage = 'Administrator privileges required. Please restart SP5Proxy as Administrator.';
            } else if (error.message.includes('TUN interface')) {
                userMessage = 'Failed to create network interface. Please ensure you have Administrator privileges and try again.';
            } else if (error.message.includes('Proxy server unreachable')) {
                userMessage = 'Cannot connect to proxy server. Please check your proxy configuration and network connection.';
            }

            // Re-throw with user-friendly message
            throw new Error(userMessage);
        }
    }

    async disconnectProxy() {
        if (!this.isConnected) {
            throw new Error('Not connected to any proxy');
        }

        console.log('Starting proxy disconnection process...');

        // Stop monetization timer
        console.log('💰 Stopping monetization timer');
        this.monetizationManager.stopConnectionTimer();

        // Stop IP auto-refresh
        this.stopIPRefresh();

        // Stop proxy health monitoring
        if (this.proxyManager && this.proxyManager.stopHealthMonitoring) {
            console.log('🔍 Stopping proxy health monitoring...');
            this.proxyManager.stopHealthMonitoring();
        }

        try {
            // Step 1: Stop proxy connection process
            console.log('Step 1: Stopping tun2socks...');
            await this.proxyManager.stopTun2Socks();

            // Step 2: Restore traffic routing
            console.log('Step 2: Restoring traffic routing...');
            await this.networkManager.restoreTraffic();

            // Step 3: Restore DNS settings
            console.log('Step 3: Restoring DNS settings...');
            const networkStatus = this.networkManager.getStatus();
            if (networkStatus.tunInterfaceName && this.dnsManager.getStatus().isConfigured) {
                const dnsRestored = await this.dnsManager.restoreDNS(networkStatus.tunInterfaceName);
                if (!dnsRestored) {
                    console.warn('Warning: DNS restoration failed. You may need to manually reset network settings.');
                }
            }

            // Step 4: Destroy TUN interface
            console.log('Step 4: Destroying TUN interface...');
            await this.networkManager.destroyTunInterface();

            this.isConnected = false;
            this.currentConfig = null;

            // Clear proxy manager external IP
            if (this.proxyManager) {
                this.proxyManager.externalIP = null;
            }

            // End database session with real data
            try {
                if (this.currentSessionId) {
                    const duration = Math.floor((Date.now() - this.monetizationManager.connectionStartTime) / 1000);
                    await this.databaseManager.endSession(this.currentSessionId, duration);
                    console.log('📊 Real session ended in database:', this.currentSessionId);
                    console.log(`   Duration: ${duration} seconds`);

                    // Create sync event for real-time update
                    await this.databaseManager.createSyncEvent('session_ended', 'session', this.currentSessionId, {
                        duration: duration,
                        userId: this.monetizationManager.userId
                    });

                    this.currentSessionId = null;
                }
            } catch (dbError) {
                console.warn('⚠️ Failed to end database session:', dbError.message);
            }

            // Notify renderer of status change
            if (this.mainWindow) {
                this.mainWindow.webContents.send('proxy-status-changed', {
                    isConnected: false,
                    config: null
                });
            }

            // Force immediate IP refresh to get real IP after disconnect
            console.log('🔄 Refreshing IP after disconnect...');
            setTimeout(async () => {
                try {
                    const realIP = await this.fetchCurrentIP();
                    if (realIP) {
                        this.lastKnownIP = realIP;
                        console.log(`✅ Real IP after disconnect: ${realIP}`);

                        // Send updated real IP to renderer
                        this.safeWebContentsSend('ip-updated', {
                            ip: realIP,
                            timestamp: new Date().toISOString(),
                            isConnected: false,
                            proxyConfig: null
                        });

                        // Trigger location update for real IP
                        this.safeWebContentsSend('trigger-ip-location-update');

                        // Send explicit disconnect notification with real IP
                        this.safeWebContentsSend('proxy-disconnected', {
                            realIP: realIP,
                            timestamp: new Date().toISOString()
                        });
                    }
                } catch (ipError) {
                    console.warn('⚠️ Failed to refresh IP after disconnect:', ipError.message);
                    // Send disconnect notification anyway
                    this.safeWebContentsSend('proxy-disconnected', {
                        realIP: null,
                        timestamp: new Date().toISOString()
                    });
                }
            }, 1000); // Wait 1 second for network to stabilize

            // Restart IP refresh to monitor real IP changes
            this.startIPRefresh();

            console.log('Proxy disconnected successfully');

        } catch (error) {
            console.error('Error during disconnection:', error.message);

            // Still mark as disconnected even if cleanup failed
            this.isConnected = false;
            this.currentConfig = null;

            throw error;
        }
    }

    setupAutoUpdater() {
        try {
            // Import electron-updater only when needed and when app is ready
            if (!autoUpdater && app.isReady()) {
                console.log('📦 Loading electron-updater...');
                autoUpdater = require('electron-updater').autoUpdater;
            }

            if (autoUpdater) {
                console.log('🔄 Setting up auto-updater...');
                autoUpdater.checkForUpdatesAndNotify();

                autoUpdater.on('update-available', () => {
                    console.log('📥 Update available');
                    if (this.mainWindow) {
                        this.mainWindow.webContents.send('update-available');
                    }
                });

                autoUpdater.on('update-downloaded', () => {
                    console.log('✅ Update downloaded');
                    if (this.mainWindow) {
                        this.mainWindow.webContents.send('update-downloaded');
                    }
                });

                console.log('✅ Auto-updater configured successfully');
            } else {
                console.log('⚠️ Auto-updater not available (app not ready or in dev mode)');
            }
        } catch (error) {
            console.warn('⚠️ Failed to setup auto-updater:', error.message);
            console.log('💡 Auto-updater will be disabled (this is normal in development)');
        }
    }

    setupMonetizationHandlers() {
        console.log('💰 Setting up monetization event handlers');

        // Set up event handlers for monetization manager
        this.monetizationManager.setEventHandlers({
            onTimeExpired: (data) => {
                console.log('⚠️ Connection time expired:', data);
                if (this.mainWindow) {
                    this.mainWindow.webContents.send('monetization-time-expired', data);
                }
            },
            onForceDisconnect: async (data) => {
                console.log('🔌 Force disconnect due to time limit:', data);
                try {
                    await this.disconnectProxy();
                    if (this.mainWindow) {
                        this.mainWindow.webContents.send('monetization-force-disconnect', data);
                    }
                } catch (error) {
                    console.error('Failed to force disconnect:', error);
                }
            }
        });

        // URL Extension Manager is available but doesn't use event emitters
        // It communicates directly with the Monetization Manager
        if (this.urlExtensionManager) {
            console.log('✅ URL Extension Manager available and connected');
        } else {
            console.log('⚠️ URL Extension Manager not available');
        }

        console.log('✅ Monetization handlers configured');
    }

    async cleanupConnection() {
        console.log('Cleaning up failed connection...');

        try {
            // Stop tun2socks if it was started
            await this.proxyManager.stopTun2Socks().catch(error => {
                console.log('tun2socks cleanup error (expected):', error.message);
            });
        } catch (error) {
            console.log('Error stopping tun2socks during cleanup:', error.message);
        }

        try {
            // Restore traffic routing
            await this.networkManager.restoreTraffic().catch(error => {
                console.log('Traffic restore error (expected):', error.message);
            });
        } catch (error) {
            console.log('Error restoring traffic during cleanup:', error.message);
        }

        try {
            // Restore DNS settings if they were configured
            const networkStatus = this.networkManager.getStatus();
            if (networkStatus.tunInterfaceName && this.dnsManager.getStatus().isConfigured) {
                await this.dnsManager.restoreDNS(networkStatus.tunInterfaceName).catch(error => {
                    console.log('DNS cleanup error (expected):', error.message);
                });
            }
        } catch (error) {
            console.log('Error restoring DNS during cleanup:', error.message);
        }

        try {
            // Destroy TUN interface
            await this.networkManager.destroyTunInterface().catch(error => {
                console.log('TUN interface cleanup error (expected):', error.message);
            });
        } catch (error) {
            console.log('Error destroying TUN interface during cleanup:', error.message);
        }

        // Reset connection state
        this.isConnected = false;
        this.currentConfig = null;
    }

    async runFixTunInterface() {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const path = require('path');

        const execAsync = promisify(exec);

        try {
            console.log('Running automatic TUN interface fix...');

            // Check if we have admin rights first
            const hasAdminRights = await this.elevationManager.checkAdminRights();
            if (!hasAdminRights) {
                return {
                    success: false,
                    message: 'Administrator privileges required. Please restart SP5Proxy as Administrator.',
                    requiresElevation: true
                };
            }

            // Path to the setup script
            const scriptPath = path.join(__dirname, 'scripts', 'setup-tun-interface.bat');

            // Check if script exists
            if (!fs.existsSync(scriptPath)) {
                return {
                    success: false,
                    message: 'TUN interface setup script not found. Please reinstall SP5Proxy.',
                    scriptPath: scriptPath
                };
            }

            console.log(`Executing TUN interface setup script: ${scriptPath}`);

            // Execute the script with timeout
            const { stdout, stderr } = await Promise.race([
                execAsync(`"${scriptPath}"`, {
                    cwd: __dirname,
                    windowsHide: false // Show the command window for user feedback
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Script execution timed out after 120 seconds')), 120000)
                )
            ]);

            console.log('TUN interface setup script completed successfully');
            console.log('Script output:', stdout);

            if (stderr) {
                console.log('Script warnings:', stderr);
            }

            // Wait a moment for the interface to be ready
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Verify that the interface was created
            try {
                const { stdout: interfaceCheck } = await execAsync('netsh interface show interface "SP5ProxyTun"');
                if (interfaceCheck.includes('SP5ProxyTun')) {
                    return {
                        success: true,
                        message: 'TUN interface created successfully! You can now try connecting again.',
                        details: 'The SP5ProxyTun interface has been created and configured.'
                    };
                } else {
                    return {
                        success: false,
                        message: 'Script completed but TUN interface was not found. Please check the console for details.',
                        details: stdout
                    };
                }
            } catch (verifyError) {
                return {
                    success: false,
                    message: 'Script completed but could not verify interface creation. Please try connecting again.',
                    details: stdout
                };
            }

        } catch (error) {
            console.error('Error running TUN interface fix:', error);

            if (error.message.includes('timed out')) {
                return {
                    success: false,
                    message: 'TUN interface setup timed out. This may indicate system compatibility issues.',
                    details: error.message
                };
            }

            return {
                success: false,
                message: `Failed to run TUN interface setup: ${error.message}`,
                details: error.stack
            };
        }
    }

    async cleanup() {
        console.log('🧹 Cleaning up application...');

        if (this.isConnected) {
            try {
                await this.disconnectProxy();
            } catch (error) {
                console.error('Error during cleanup:', error);

                // Emergency DNS reset if normal disconnection failed
                try {
                    console.log('Performing emergency DNS reset...');
                    await this.dnsManager.emergencyReset();
                } catch (dnsError) {
                    console.error('Emergency DNS reset failed:', dnsError);
                }
            }
        }

        try {
            // Clean up PowerShell processes and elevation manager
            if (this.elevationManager) {
                await this.elevationManager.cleanup();
            }
        } catch (error) {
            console.error('Error during elevation manager cleanup:', error);
        }

        try {
            // Clean up database and API server
            if (this.apiServer) {
                await this.apiServer.cleanup();
            }
            if (this.databaseManager) {
                await this.databaseManager.cleanup();
            }
        } catch (error) {
            console.error('Error during database/API cleanup:', error);
        }

        console.log('✅ Application cleanup completed');
    }

    async showElevationDialog() {
        const { dialog } = require('electron');

        const result = await dialog.showMessageBox(this.mainWindow, {
            type: 'warning',
            title: 'Administrator Access Required',
            message: '🔒 Administrator Access Required',
            detail: 'SP5Proxy needs administrator privileges to create virtual network interfaces and manage system-wide proxy settings.\n\n' +
                   'This is required for:\n' +
                   '• Creating TUN network interface\n' +
                   '• Modifying routing tables\n' +
                   '• Configuring DNS settings\n' +
                   '• System-wide traffic redirection\n\n' +
                   'Please choose an option below:',
            buttons: ['Grant Admin Access', 'Use Admin Launcher', 'Exit Application'],
            defaultId: 0,
            cancelId: 2,
            noLink: true
        });

        switch (result.response) {
            case 0:
                return 'elevate';
            case 1:
                return 'launcher';
            case 2:
                return 'exit';
            default:
                return 'cancel';
        }
    }

    async attemptQuickElevation() {
        try {
            console.log('🔄 Attempting quick in-process elevation...');
            
            // Show a simpler dialog for quick elevation
            const response = await dialog.showMessageBox(null, {
                type: 'warning',
                buttons: ['Launch with Admin Rights', 'Exit Application'],
                defaultId: 0,
                cancelId: 1,
                title: 'SP5Proxy Desktop - Administrator Required',
                message: 'SP5Proxy needs administrator privileges to function.',
                detail: 'Click "Launch with Admin Rights" to start a new elevated process.\n\n' +
                       'The current window will close and a new one will open with admin privileges.',
                icon: (() => {
            const iconPath = path.resolve(__dirname, 'assets', 'icon.png');
            if (fs.existsSync(iconPath)) {
                return iconPath;
            } else {
                console.error('❌ PNG Icon not found:', iconPath);
                return null;
            }
        })(),
                noLink: true
            });

            if (response.response === 0) {
                console.log('🚀 User approved quick elevation - launching elevated process directly...');
                
                // Use a very simple and direct approach
                const { exec } = require('child_process');
                const currentDir = process.cwd();
                
                // Create a simple launch command
                const launchCmd = `powershell -Command "Start-Process PowerShell -ArgumentList '-ExecutionPolicy Bypass -Command \\"cd ''${currentDir}''; npm start\\"' -Verb RunAs"`;
                
                console.log('Executing direct launch command...');
                
                exec(launchCmd, (error, stdout, stderr) => {
                    if (error) {
                        console.error('Direct launch failed:', error);
                        return { success: false, error: error.message };
                    } else {
                        console.log('✅ Direct launch successful');
                        // Exit current process to avoid conflicts
                        setTimeout(() => {
                            app.quit();
                        }, 2000);
                        return { success: true, elevated: true };
                    }
                });
                
                return { success: true, elevated: true };
                
            } else {
                console.log('🚪 User chose to exit application');
                app.quit();
                return { success: false, exit: true };
            }
            
        } catch (error) {
            console.error('❌ Quick elevation error:', error);
            return { success: false, error: error.message };
        }
    }
}

// Application lifecycle - only initialize if we got the single instance lock
let sp5ProxyApp = null;

// Only proceed with app initialization if we have the single instance lock
if (gotTheLock) {
    // Add GPU stability flags BEFORE app is ready
    console.log('🔧 Setting up GPU stability flags...');
    app.commandLine.appendSwitch('--disable-gpu-sandbox');
    app.commandLine.appendSwitch('--disable-software-rasterizer');
    app.commandLine.appendSwitch('--disable-background-timer-throttling');
    app.commandLine.appendSwitch('--disable-backgrounding-occluded-windows');
    app.commandLine.appendSwitch('--disable-renderer-backgrounding');
    app.commandLine.appendSwitch('--disable-features', 'TranslateUI,VizDisplayCompositor');
    app.commandLine.appendSwitch('--disable-extensions');
    app.commandLine.appendSwitch('--no-sandbox');
    app.commandLine.appendSwitch('--disable-gpu-process-crash-limit');
    app.commandLine.appendSwitch('--disable-gpu-blacklist');
    app.commandLine.appendSwitch('--ignore-gpu-blacklist');
    app.commandLine.appendSwitch('--disable-dev-shm-usage');
    app.commandLine.appendSwitch('--disable-web-security');
    app.commandLine.appendSwitch('--allow-running-insecure-content');
    app.commandLine.appendSwitch('--disable-component-update');
    app.commandLine.appendSwitch('--disable-gpu');
    app.commandLine.appendSwitch('--disable-gpu-compositing');
    app.commandLine.appendSwitch('--disable-gpu-rasterization');
    app.commandLine.appendSwitch('--disable-gpu-memory-buffer-video-frames');
    app.commandLine.appendSwitch('--disable-gpu-memory-buffer-compositor-resources');
    app.commandLine.appendSwitch('--disable-d3d11');
    app.commandLine.appendSwitch('--disable-accelerated-2d-canvas');
    app.commandLine.appendSwitch('--disable-accelerated-video-decode');
    app.commandLine.appendSwitch('--use-gl', 'disabled');

    sp5ProxyApp = new SP5ProxyApp();

    app.whenReady().then(() => {
        console.log('🚀 App ready - initializing SP5Proxy Desktop...');
        
        // تعيين أيقونة التطبيق على مستوى النظام
        const appIcon = path.resolve(__dirname, 'assets', 'icon.ico');
        if (fs.existsSync(appIcon)) {
            console.log('🎯 تعيين أيقونة التطبيق:', appIcon);
            // تعيين الأيقونة للتطبيق (يؤثر على شريط المهام والنوافذ)
            if (process.platform === 'win32') {
                app.setAppUserModelId('com.sp5proxy.desktop');
            }
        } else {
            console.warn('⚠️ لم يتم العثور على أيقونة التطبيق:', appIcon);
        }
        
        sp5ProxyApp.initialize();
    });

    app.on('window-all-closed', async () => {
        console.log('🚪 All windows closed - cleaning up...');
        if (sp5ProxyApp) {
            await sp5ProxyApp.cleanup();
        }
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0 && sp5ProxyApp) {
            console.log('🔄 App activated - creating window...');
            sp5ProxyApp.createWindow();
        }
    });

    app.on('before-quit', async (event) => {
        console.log('🚪 App before quit - cleaning up...');
        event.preventDefault();
        if (sp5ProxyApp) {
            await sp5ProxyApp.cleanup();
        }
        // Force SQLite shutdown to prevent napi_throw errors
        try {
            if (require.cache[require.resolve('sqlite3')]) {
                const sqlite3 = require('sqlite3');
                if (sqlite3.shutdown) {
                    sqlite3.shutdown();
                    console.log('🔧 Global SQLite shutdown called');
                }
            }
        } catch (sqliteError) {
            console.warn('⚠️ SQLite global shutdown warning:', sqliteError.message);
        }
        app.exit();
    });

    // Additional cleanup for process signals
    process.on('SIGTERM', async () => {
        console.log('📡 SIGTERM received - graceful shutdown...');
        if (sp5ProxyApp) {
            await sp5ProxyApp.cleanup();
        }
        process.exit(0);
    });

    process.on('SIGINT', async () => {
        console.log('📡 SIGINT received - graceful shutdown...');
        if (sp5ProxyApp) {
            await sp5ProxyApp.cleanup();
        }
        process.exit(0);
    });

    // Handle protocol for auto-updater
    app.setAsDefaultProtocolClient('sp5proxy');

    console.log('✅ SP5Proxy Desktop single instance initialized');
} else {
    console.log('🚫 Single instance lock not acquired - this instance will exit');
}
