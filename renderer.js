// SP5Proxy Desktop - Renderer Process
class SP5ProxyRenderer {
    constructor() {
        this.isConnected = false;
        this.currentConfig = null;
        this.elevationInProgress = false;
        this.adminStatusCheckInterval = null;
        this.elements = {};
        this.autoSaveTimeout = null;
        this.initializeElements();
        this.setupEventListeners();
        this.setupElevationHandlers();
        this.setupMonetizationHandlers();
        this.loadInitialState();
        this.startAdminStatusMonitoring();

        // Monetization state
        this.monetizationTimer = null;
        this.currentUrlData = null;
    }

    initializeElements() {
        // Form elements
        this.elements.proxyType = document.getElementById('proxy-type');
        this.elements.proxyHost = document.getElementById('proxy-host');
        this.elements.proxyPort = document.getElementById('proxy-port');
        this.elements.proxyUsername = document.getElementById('proxy-username');
        this.elements.proxyPassword = document.getElementById('proxy-password');

        // Buttons
        this.elements.connectBtn = document.getElementById('connect-btn');
        this.elements.disconnectBtn = document.getElementById('disconnect-btn');
        this.elements.testProxyBtn = document.getElementById('test-proxy-btn');
        // Save/Load config buttons removed as requested
        // this.elements.saveConfigBtn = document.getElementById('save-config-btn');
        // this.elements.loadConfigBtn = document.getElementById('load-config-btn');
        this.elements.refreshIpBtn = document.getElementById('refresh-ip-btn');


        // Status elements
        this.elements.connectionStatus = document.getElementById('connection-status');
        this.elements.adminStatus = document.getElementById('admin-status');
        this.elements.currentIp = document.getElementById('current-ip');
        this.elements.proxyStatus = document.getElementById('proxy-status');

        // System status elements
        this.elements.tunStatus = document.getElementById('tun-status');
        this.elements.routeStatus = document.getElementById('route-status');
        this.elements.dnsStatus = document.getElementById('dns-status');
        this.elements.tun2socksStatus = document.getElementById('tun2socks-status');



        // Utility elements
        this.elements.loadingOverlay = document.getElementById('loading-overlay');
        this.elements.loadingMessage = document.getElementById('loading-message');
        this.elements.notificationToast = document.getElementById('notification-toast');
        this.elements.notificationMessage = document.getElementById('notification-message');
        this.elements.notificationClose = document.getElementById('notification-close');
        this.elements.updateStatus = document.getElementById('update-status');

        // Monetization elements
        this.elements.connectionTimer = document.getElementById('connection-timer');
        this.elements.timerText = document.getElementById('timer-text');
        this.elements.timerPhase = document.getElementById('timer-phase');
        this.elements.timerProgressBar = document.getElementById('timer-progress-bar');
        this.elements.countryFlag = document.getElementById('country-flag');
        this.elements.countryName = document.getElementById('country-name');
        this.elements.extensionPanel = document.getElementById('extension-panel');
        this.elements.openUrlBtn = document.getElementById('open-url-btn');
        this.elements.extensionCode = document.getElementById('extension-code');
        this.elements.validateCodeBtn = document.getElementById('validate-code-btn');
        this.elements.closeExtensionBtn = document.getElementById('close-extension-btn');

        // DNS leak testing elements
        this.elements.dnsProtectionStatus = document.getElementById('dns-protection-status');
        this.elements.lastLeakTest = document.getElementById('last-leak-test');
        this.elements.runDnsLeakTestBtn = document.getElementById('run-dns-leak-test-btn');
        this.elements.dnsConnectivityTestBtn = document.getElementById('dns-connectivity-test-btn');
        this.elements.startDnsMonitoringBtn = document.getElementById('start-dns-monitoring-btn');
        this.elements.stopDnsMonitoringBtn = document.getElementById('stop-dns-monitoring-btn');
        this.elements.dnsTestResults = document.getElementById('dns-test-results');
        this.elements.dnsTestSummary = document.getElementById('dns-test-summary');
        this.elements.dnsTestDetails = document.getElementById('dns-test-details');
        this.elements.dnsRecommendations = document.getElementById('dns-recommendations');
    }

    setupEventListeners() {
        // Connection buttons
        this.elements.connectBtn.addEventListener('click', () => this.connectProxy());
        this.elements.disconnectBtn.addEventListener('click', () => this.disconnectProxy());
        this.elements.testProxyBtn.addEventListener('click', () => this.testProxyConnectivity());

        // Configuration buttons removed as requested
        // this.elements.saveConfigBtn.addEventListener('click', () => this.saveConfiguration());
        // this.elements.loadConfigBtn.addEventListener('click', () => this.loadConfiguration());

        // Utility buttons
        this.elements.refreshIpBtn.addEventListener('click', () => {
            console.log('🔄 Manual IP refresh requested by user');
            this.refreshExternalIP();
        });

        // Monetization buttons
        this.elements.openUrlBtn.addEventListener('click', () => this.openExtensionUrl());
        this.elements.validateCodeBtn.addEventListener('click', () => this.validateExtensionCode());
        this.elements.closeExtensionBtn.addEventListener('click', () => this.closeExtensionPanel());
        this.elements.extensionCode.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.validateExtensionCode();
            }
        });

        // DNS leak testing buttons
        this.elements.runDnsLeakTestBtn.addEventListener('click', () => this.runDNSLeakTest());
        this.elements.dnsConnectivityTestBtn.addEventListener('click', () => this.testDNSConnectivity());
        this.elements.startDnsMonitoringBtn.addEventListener('click', () => this.startDNSMonitoring());
        this.elements.stopDnsMonitoringBtn.addEventListener('click', () => this.stopDNSMonitoring());

        // Notification close
        this.elements.notificationClose.addEventListener('click', () => this.hideNotification());

        // Form validation and auto-save
        this.elements.proxyType.addEventListener('change', () => {
            this.validateForm();
            this.autoSaveConfiguration();
        });
        this.elements.proxyHost.addEventListener('input', () => {
            this.validateForm();
            this.autoSaveConfiguration();
        });
        this.elements.proxyPort.addEventListener('input', () => {
            this.validateForm();
            this.autoSaveConfiguration();
        });
        this.elements.proxyUsername.addEventListener('input', () => {
            this.validateForm();
            this.autoSaveConfiguration();
        });
        this.elements.proxyPassword.addEventListener('input', () => {
            this.validateForm();
            this.autoSaveConfiguration();
        });

        // IPC event listeners
        window.electronAPI.onProxyStatusChanged((event, status) => {
            this.updateConnectionStatus(status);
        });

        // Listen for connection progress updates
        window.electronAPI.onConnectionProgress((event, data) => {
            if (data.message) {
                this.updateLoadingProgress(data.message, data.step, data.total);
                
                // Auto-hide loading and show success if we reach 100% progress
                if (data.progress >= 100) {
                    setTimeout(() => {
                        this.hideLoading();
                        this.showNotification('✅ Connection established successfully!', 'success');
                    }, 1500); // Give users time to see the completion message
                }
            }
        });

        window.electronAPI.onUpdateAvailable(() => {
            this.showNotification('Update available! It will be downloaded in the background.', 'info');
            this.elements.updateStatus.textContent = 'Update available';
        });

        window.electronAPI.onUpdateDownloaded(() => {
            this.showNotification('Update downloaded! Restart the application to apply.', 'success');
            this.elements.updateStatus.textContent = 'Update ready';
        });

        // Configuration auto-loading handlers
        if (window.electronAPI.onConfigAutoLoaded) {
            window.electronAPI.onConfigAutoLoaded((event, config) => {
                console.log('📋 Auto-loading saved configuration:', config);
                this.loadConfigurationIntoUI(config);
                this.showNotification('✅ Previous configuration loaded automatically', 'success');
            });
        }

        if (window.electronAPI.onUIConfigLoaded) {
            window.electronAPI.onUIConfigLoaded((event, uiConfig) => {
                console.log('🎨 Loading UI configuration:', uiConfig);
                this.applyUIConfiguration(uiConfig);
            });
        }

        if (window.electronAPI.onAutoConnectReady) {
            window.electronAPI.onAutoConnectReady((event, config) => {
                console.log('🔄 Auto-connect ready with config:', config);
                this.showNotification('🔄 Auto-connecting with saved configuration...', 'info');
                setTimeout(() => {
                    this.connectProxy();
                }, 1000);
            });
        }

        // Force admin status check immediately after window loads
        setTimeout(async () => {
            console.log('🔄 Emergency admin status check after window load...');
            try {
                const hasAdminRights = await window.electronAPI.checkAdminRights();
                console.log('🛡️ Emergency admin check result:', hasAdminRights);
                this.updateAdminStatus(hasAdminRights);
            } catch (error) {
                console.log('Emergency admin check failed:', error.message);
            }
        }, 500); // Check immediately after 500ms

        // Proxy validation event listeners
        window.electronAPI.onProxyValidationSuccess((event, data) => {
            console.log('Proxy validation successful:', data);
            this.updateLoadingProgress('Proxy validation successful! Creating TUN interface...', 1, 4);
        });

        window.electronAPI.onProxyValidationFailed((event, data) => {
            console.log('Proxy validation failed:', data);
            this.hideLoading();

            const errorMessage = `🔌 Proxy Validation Failed\n\n${data.message}\n\n` +
                               'Please check your proxy configuration and try again.';

            this.showNotification(errorMessage, 'error', {
                text: 'Test Proxy',
                action: () => this.testProxyConnectivity(data.config)
            });
        });

        // DNS leak detection event listeners
        if (window.electronAPI.onDnsLeakDetected) {
            window.electronAPI.onDnsLeakDetected((event, results) => {
                console.log('DNS leak detected:', results);
                if (results.hasLeaks) {
                    this.showNotification('🔴 DNS LEAK DETECTED! Your real IP may be exposed via DNS queries. Comprehensive DNS leak prevention is now being applied.', 'error', {
                        text: 'Fix DNS Leaks',
                        action: () => this.fixDNSLeaks()
                    });
                }
                this.updateDNSStatus(results);
            });
        }

        // Admin status update event listener
        if (window.electronAPI.onAdminStatusUpdated) {
            window.electronAPI.onAdminStatusUpdated((event, hasAdminRights) => {
                console.log('Admin status updated:', hasAdminRights);
                this.updateAdminStatus(hasAdminRights);
                if (hasAdminRights) {
                    this.showNotification('✅ Administrator privileges granted successfully!', 'success');
                }
            });
        }
    }

    setupElevationHandlers() {
        // Listen for elevation required events from main process
        if (window.electronAPI.onElevationRequired) {
            window.electronAPI.onElevationRequired((event, data) => {
                this.handleElevationRequired(data);
            });
        }
    }

    setupMonetizationHandlers() {
        // Listen for monetization events from main process
        if (window.electronAPI.onMonetizationTimeExpired) {
            window.electronAPI.onMonetizationTimeExpired((event, data) => {
                this.handleTimeExpired(data);
            });
        }

        if (window.electronAPI.onMonetizationForceDisconnect) {
            window.electronAPI.onMonetizationForceDisconnect((event, data) => {
                this.handleForceDisconnect(data);
            });
        }
    }

    async handleElevationRequired(data) {
        console.log('Elevation required:', data);

        // Only show blocking dialog if this is a critical operation failure
        // For normal startup without admin, just update the status indicator
        if (data.critical || data.forceDialog) {
            // Simplified elevation dialog for all modes
            const message = `🔒 Administrator Access Required\n\n` +
                          `SP5Proxy needs administrator permission to apply system settings and ensure full functionality.`;

            this.showElevationDialog(message, data.isDev);
        } else {
            // Non-critical elevation needed - just show a notification
            console.log('💡 Admin privileges needed but not critical - interface remains accessible');
            this.showNotification('Administrator access required for full functionality. Click the admin status to request access.', 'info');
        }
    }

    showElevationDialog(message, isDev) {
        // Create a more prominent elevation dialog
        const existingDialog = document.querySelector('.elevation-dialog');
        if (existingDialog) {
            existingDialog.remove();
        }

        const dialog = document.createElement('div');
        dialog.className = 'elevation-dialog';
        dialog.innerHTML = `
            <div class="elevation-dialog-content">
                <div class="elevation-icon">🔒</div>
                <h3>Administrator Access Required</h3>
                <div class="elevation-message">${message.replace(/\n/g, '<br>')}</div>
                <div class="elevation-buttons">
                    <button class="btn btn-primary elevation-btn-primary" onclick="sp5ProxyApp.requestElevation()">
                        Request Access
                    </button>
                    <button class="btn btn-danger" onclick="sp5ProxyApp.exitApplication()">
                        Exit
                    </button>
                </div>
            </div>
            <div class="elevation-overlay"></div>
        `;

        document.body.appendChild(dialog);

        // Add CSS for the elevation dialog
        if (!document.querySelector('#elevation-dialog-styles')) {
            const style = document.createElement('style');
            style.id = 'elevation-dialog-styles';
            style.textContent = `
                .elevation-dialog {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    z-index: 10000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .elevation-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.7);
                    backdrop-filter: blur(5px);
                }

                .elevation-dialog-content {
                    position: relative;
                    background: #2c3e50;
                    border: 2px solid #3498db;
                    border-radius: 10px;
                    padding: 30px;
                    max-width: 500px;
                    text-align: center;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
                }

                .elevation-icon {
                    font-size: 48px;
                    margin-bottom: 20px;
                }

                .elevation-dialog h3 {
                    color: #3498db;
                    margin-bottom: 20px;
                    font-size: 24px;
                }

                .elevation-message {
                    color: #ecf0f1;
                    margin-bottom: 30px;
                    line-height: 1.6;
                    text-align: left;
                }

                .elevation-buttons {
                    display: flex;
                    gap: 10px;
                    justify-content: center;
                    flex-wrap: wrap;
                }

                .elevation-btn-primary {
                    background: #27ae60 !important;
                    border-color: #27ae60 !important;
                    font-weight: bold;
                    animation: pulse 2s infinite;
                }

                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 rgba(39, 174, 96, 0.7); }
                    70% { box-shadow: 0 0 0 10px rgba(39, 174, 96, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(39, 174, 96, 0); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    showElevationOptions() {
        // Show a non-blocking elevation options dialog
        const message = `🔒 Administrator Access Required\n\n` +
                      `SP5Proxy needs administrator permission to apply system settings and ensure full functionality.\n\n` +
                      `You can continue using basic features or request access for full functionality.`;

        this.showNotification(message, 'warning', {
            text: 'Request Access',
            action: () => this.requestElevation()
        });
    }

    dismissElevationDialog() {
        const dialog = document.querySelector('.elevation-dialog');
        if (dialog) {
            dialog.remove();
        }
    }

    async exitApplication() {
        // Clean up monitoring intervals
        this.stopAdminStatusMonitoring();

        if (window.electronAPI.exitApp) {
            await window.electronAPI.exitApp();
        } else {
            window.close();
        }
    }

    async requestElevation() {
        // Prevent multiple simultaneous elevation requests
        if (this.elevationInProgress) {
            console.log('Elevation already in progress, ignoring duplicate request');
            return;
        }

        try {
            this.elevationInProgress = true;
            this.showLoading('Requesting administrator access...');

            // Set up elevation status listener
            this.setupElevationStatusListener();

            const result = await window.electronAPI.requestElevation();

            if (result.success) {
                this.showNotification('Please click "Yes" when prompted to grant administrator access.', 'info');
                // Don't hide loading here - wait for elevation status events
            } else {
                throw new Error(result.message || 'Access request failed');
            }
        } catch (error) {
            console.error('Elevation request failed:', error);
            this.showNotification(`Failed to request administrator access. Please try again.`, 'error');
            this.hideLoading();
            this.elevationInProgress = false;
        }
    }

    setupElevationStatusListener() {
        // Remove any existing listener
        window.electronAPI.removeAllListeners('elevation-status');

        // Add new listener for elevation status updates
        window.electronAPI.onElevationStatus((event, data) => {
            console.log('Elevation status update:', data);

            switch (data.status) {
                case 'requesting':
                    this.showLoading(data.message || 'Requesting administrator access...');
                    break;

                case 'failed':
                    this.hideLoading();
                    this.elevationInProgress = false; // Reset flag
                    if (data.message.includes('cancelled') || data.message.includes('1223')) {
                        this.showNotification('Administrator access was cancelled.', 'warning');
                    } else {
                        this.showNotification('Administrator access failed. Please try again.', 'error');
                    }
                    break;

                case 'success':
                    this.showNotification('Administrator access granted. Application will restart...', 'success');
                    // Keep loading indicator as app will restart
                    // Don't reset elevationInProgress flag as app will restart

                    // Update admin status immediately to show success
                    this.updateAdminStatus(true);
                    break;

                default:
                    console.log('Unknown elevation status:', data);
            }
        });
    }

    startAdminStatusMonitoring() {
        // Check admin status every 60 seconds to reduce system load (was 30 seconds)
        this.adminStatusCheckInterval = setInterval(async () => {
            try {
                const hasAdminRights = await window.electronAPI.checkAdminRights();
                this.updateAdminStatus(hasAdminRights);
            } catch (error) {
                // Silently handle errors to avoid spam
                console.log('Admin status check failed:', error.message);
            }
        }, 60000); // Increased from 30 to 60 seconds

        // Also check more frequently for the first minute after app start (reduced from 2 minutes)
        this.adminStatusFastCheckInterval = setInterval(async () => {
            try {
                const result = await window.electronAPI.refreshAdminStatus();
                if (result.success) {
                    this.updateAdminStatus(result.hasAdminRights);
                }
            } catch (error) {
                console.log('Fast admin status check failed:', error.message);
            }
        }, 10000); // Increased from 5 to 10 seconds

        // Stop fast checking after 1 minute (reduced from 2 minutes)
        setTimeout(() => {
            if (this.adminStatusFastCheckInterval) {
                clearInterval(this.adminStatusFastCheckInterval);
                this.adminStatusFastCheckInterval = null;
                console.log('Stopped fast admin status checking');
            }
        }, 60000); // Reduced from 120000 (2 minutes) to 60000 (1 minute)
    }

    stopAdminStatusMonitoring() {
        if (this.adminStatusCheckInterval) {
            clearInterval(this.adminStatusCheckInterval);
            this.adminStatusCheckInterval = null;
        }
        if (this.adminStatusFastCheckInterval) {
            clearInterval(this.adminStatusFastCheckInterval);
            this.adminStatusFastCheckInterval = null;
        }
    }

    async loadInitialState() {
        try {
            this.showLoading('Initializing application...');
            this.isInitialLoad = true; // Flag to prevent notification spam

            // Force immediate admin rights check with refresh
            console.log('🔄 Forcing immediate admin status check...');
            const refreshResult = await window.electronAPI.refreshAdminStatus();
            if (refreshResult && refreshResult.success) {
                console.log('✅ Admin status refresh result:', refreshResult.hasAdminRights);
                this.updateAdminStatus(refreshResult.hasAdminRights);
            } else {
                // Fallback to regular check
                const hasAdminRights = await window.electronAPI.checkAdminRights();
                console.log('🔄 Fallback admin check result:', hasAdminRights);
                this.updateAdminStatus(hasAdminRights);
            }

            // Load saved configuration
            console.log('📄 Loading saved configuration...');
            await this.loadConfiguration();

            // Get current status
            console.log('📊 Getting current application status...');
            const status = await window.electronAPI.getStatus();
            this.updateConnectionStatus(status);

            // Refresh external IP (should work even when not connected)
            console.log('🌐 Refreshing external IP address...');
            await this.refreshExternalIP();
            
            // Force a second IP refresh if the first one failed
            if (this.elements.currentIp.textContent === 'Checking...' || 
                this.elements.currentIp.textContent === 'Network error' ||
                this.elements.currentIp.textContent === 'Unable to detect IP') {
                console.log('🔄 First IP detection failed, retrying in 2 seconds...');
                setTimeout(async () => {
                    console.log('🔄 Retrying IP detection...');
                    await this.refreshExternalIP();
                }, 2000);
            }

            this.isInitialLoad = false; // Reset flag
            this.hideLoading();
            console.log('✅ Initial state loaded successfully');
        } catch (error) {
            console.error('Failed to load initial state:', error);
            this.showNotification('Failed to initialize application', 'error');
            this.isInitialLoad = false;
            this.hideLoading();
        }
    }

    async connectProxy() {
        try {
            const config = this.getFormConfiguration();
            this.validateConfiguration(config);

            this.showLoading('Validating proxy connectivity...');
            this.elements.connectBtn.disabled = true;

            // Set a fallback timeout to hide loading if UI gets stuck
            const fallbackTimeout = setTimeout(async () => {
                try {
                    const status = await window.electronAPI.checkConnectionStatus();
                    if (status.success && status.isConnected) {
                        console.log('Connection successful but UI stuck - hiding loading overlay');
                        this.hideLoading();
                        this.showNotification('✅ Connection established successfully!', 'success');
                        this.isConnected = true;
                        this.currentConfig = config;
                        this.updateConnectionUI(true);
                        this.startMonetizationTimer();
                        setTimeout(() => this.refreshExternalIP(), 2000);
                    }
                } catch (error) {
                    console.error('Fallback status check failed:', error);
                }
            }, 45000); // 45 second fallback

            const result = await window.electronAPI.connectProxy(config);

            // Clear the fallback timeout since we got a result
            clearTimeout(fallbackTimeout);

            if (result.success) {
                this.showNotification('Connected successfully!', 'success');
                this.isConnected = true;
                this.currentConfig = config;
                this.updateConnectionUI(true);

                // Start monetization timer display
                this.startMonetizationTimer();

                // Refresh IP after connection
                setTimeout(() => this.refreshExternalIP(), 2000);
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('Connection failed:', error);

            // Enhanced error handling with specific guidance
            let errorMessage = error.message;
            let actionButton = null;

            if (error.message.includes('Proxy server unreachable')) {
                errorMessage = '🔌 Proxy Server Unreachable\n\n' +
                             'The proxy server cannot be reached. This could be due to:\n' +
                             '• Incorrect proxy server address or port\n' +
                             '• Proxy server is offline or not responding\n' +
                             '• Network connectivity issues\n' +
                             '• Firewall blocking the connection\n\n' +
                             'Click "Test Proxy" to run detailed diagnostics.';
                actionButton = {
                    text: 'Test Proxy',
                    action: () => this.testProxyConnectivity(config)
                };
            } else if (error.message.includes('TUN interface') || error.message.includes('netsh interface')) {
                errorMessage = 'TUN interface creation failed. This usually happens when:\n' +
                             '• SP5Proxy is not running as Administrator\n' +
                             '• TUN interface was not created properly\n\n' +
                             'Click "Fix TUN Interface" to resolve this issue.';
                actionButton = {
                    text: 'Fix TUN Interface',
                    action: () => this.showTunInterfaceHelp()
                };
            } else if (error.message.includes('Administrator') || error.message.includes('admin')) {
                errorMessage = 'Administrator privileges required.\n\n' +
                             'Please restart SP5Proxy as Administrator:\n' +
                             '1. Close SP5Proxy\n' +
                             '2. Right-click on SP5Proxy\n' +
                             '3. Select "Run as administrator"';
            } else if (error.message.includes('authentication') || error.message.includes('SOCKS5')) {
                errorMessage = '🔐 Proxy Authentication Failed\n\n' +
                             'The proxy server rejected the authentication credentials.\n' +
                             'Please check:\n' +
                             '• Username and password are correct\n' +
                             '• Proxy server supports the authentication method\n' +
                             '• Account is not locked or expired';
                actionButton = {
                    text: 'Test Proxy',
                    action: () => this.testProxyConnectivity(config)
                };
            }

            this.showNotification(errorMessage, 'error', actionButton);
        } finally {
            this.hideLoading();
            this.elements.connectBtn.disabled = false;
        }
    }

    async testProxyConnectivity(config = null) {
        if (!config) {
            config = this.getFormConfiguration();
        }

        try {
            this.validateConfiguration(config);
            this.showLoading('Testing proxy connectivity...');

            const result = await window.electronAPI.validateProxyWithRetry(config);

            if (result.success && result.result.isValid) {
                const validationResult = result.result;
                const message = `✅ Proxy Test Successful!\n\n` +
                              `Response Time: ${validationResult.responseTime}ms\n` +
                              `Retry Attempts: ${validationResult.retryAttempts}\n` +
                              `TCP Connectivity: ${validationResult.tcpConnectivity ? '✅' : '❌'}\n` +
                              `Authentication: ${validationResult.socksAuthentication ? '✅' : '❌'}\n` +
                              `HTTP Through Proxy: ${validationResult.httpThroughProxy ? '✅' : '❌'}`;

                this.showNotification(message, 'success');
            } else {
                const validationResult = result.result || {};
                let errorDetails = 'Test failed with the following results:\n\n';

                errorDetails += `TCP Connectivity: ${validationResult.tcpConnectivity ? '✅' : '❌'}\n`;
                errorDetails += `Authentication: ${validationResult.socksAuthentication ? '✅' : '❌'}\n`;
                errorDetails += `HTTP Through Proxy: ${validationResult.httpThroughProxy ? '✅' : '❌'}\n\n`;

                if (validationResult.errors && validationResult.errors.length > 0) {
                    errorDetails += 'Errors:\n' + validationResult.errors.map(err => `• ${err}`).join('\n');
                }

                this.showNotification(`❌ Proxy Test Failed\n\n${errorDetails}`, 'error');
            }
        } catch (error) {
            console.error('Proxy test failed:', error);
            this.showNotification(`❌ Proxy test failed: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async disconnectProxy() {
        try {
            this.showLoading('Disconnecting from proxy...');
            this.elements.disconnectBtn.disabled = true;

            const result = await window.electronAPI.disconnectProxy();

            if (result.success) {
                this.showNotification('Disconnected successfully!', 'success');
                this.isConnected = false;
                this.currentConfig = null;
                this.updateConnectionUI(false);

                // Stop monetization timer display
                this.stopMonetizationTimer();

                // Refresh IP after disconnection
                setTimeout(() => this.refreshExternalIP(), 2000);
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('Disconnection failed:', error);
            this.showNotification(`Disconnection failed: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
            this.elements.disconnectBtn.disabled = false;
        }
    }

    async saveConfiguration() {
        try {
            const config = this.getFormConfiguration();
            this.validateConfiguration(config);

            const result = await window.electronAPI.saveConfig(config);

            if (result.success) {
                this.showNotification('Configuration saved successfully!', 'success');
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('Failed to save configuration:', error);
            this.showNotification(`Failed to save configuration: ${error.message}`, 'error');
        }
    }

    async autoSaveConfiguration() {
        // Clear any existing timeout
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }

        // Debounce auto-save by 1 second to avoid excessive saves while typing
        this.autoSaveTimeout = setTimeout(async () => {
            try {
                const config = this.getFormConfiguration();
                
                // Only auto-save if we have at least host and port
                if (!config.host || !config.port) {
                    return; // Don't save incomplete configurations
                }

                this.validateConfiguration(config);

                const result = await window.electronAPI.saveConfig(config);

                if (result.success) {
                    // Silently save - no notification to avoid spam
                    console.log('✅ Configuration auto-saved:', config);
                } else {
                    console.log('❌ Auto-save failed:', result.message);
                }
            } catch (error) {
                // Silently fail auto-save to avoid interrupting user experience
                console.log('Auto-save skipped:', error.message);
            }
        }, 1000); // Wait 1 second after user stops typing
    }

    async loadConfiguration() {
        try {
            console.log('🔄 Attempting to load saved configuration...');
            const result = await window.electronAPI.loadProxyConfig();

            console.log('📄 Load config result:', result);

            if (result.success && result.config) {
                console.log('✅ Configuration loaded successfully:', result.config);
                this.loadConfigurationIntoUI(result.config);
                this.validateForm(); // Enable buttons if config is valid
                console.log('📝 Form updated with loaded configuration');
                // Don't show notification during initial load to avoid spam
                if (this.isInitialLoad !== true) {
                    this.showNotification('Configuration loaded successfully!', 'success');
                }
            } else {
                console.log('ℹ️ No saved configuration found or failed to load - using empty form');
                console.log('📄 Load result details:', result);
                // Clear any placeholder values and show empty form
                this.loadConfigurationIntoUI({
                    type: 'socks5',
                    host: '',
                    port: '',
                    username: '',
                    password: ''
                });
                this.validateForm(); // Validate empty form
            }
        } catch (error) {
            console.error('❌ Failed to load configuration:', error);
            this.showNotification(`Failed to load configuration: ${error.message}`, 'error');
            // Clear form on error
            this.setFormConfiguration({
                type: 'socks5',
                host: '',
                port: '',
                username: '',
                password: ''
            });
            this.validateForm();
        }
    }

    async refreshExternalIP() {
        try {
            this.elements.refreshIpBtn.disabled = true;
            this.elements.currentIp.textContent = 'Checking...';

            console.log('🔄 Attempting to fetch external IP...');
            const result = await window.electronAPI.getExternalIP();

            if (result.success && result.ip) {
                this.elements.currentIp.textContent = result.ip;
                console.log('✅ External IP fetched:', result.ip);
                
                // Update location information after getting IP
                await this.updateLocationInfo(result.ip);
            } else {
                console.warn('Primary IP fetch failed, trying fallback methods...');
                
                // Fallback IP detection methods
                const fallbackMethods = [
                    'https://httpbin.org/ip',
                    'https://api.ipify.org?format=json',
                    'https://jsonip.com',
                    'https://ipapi.co/json'
                ];

                let ipFound = false;
                for (const method of fallbackMethods) {
                    try {
                        console.log('🔄 Trying fallback method:', method);
                        const response = await fetch(method, { timeout: 10000 });
                        const data = await response.json();
                        
                        let ip = null;
                        if (data.origin) ip = data.origin; // httpbin.org
                        else if (data.ip) ip = data.ip; // ipify, ipapi
                        else if (data.IP) ip = data.IP; // Some other services
                        
                        if (ip) {
                            this.elements.currentIp.textContent = ip;
                            console.log('✅ Fallback IP detection successful:', ip);
                            await this.updateLocationInfo(ip);
                            ipFound = true;
                            break;
                        }
                    } catch (fallbackError) {
                        console.log('❌ Fallback method failed:', method, fallbackError.message);
                    }
                }

                if (!ipFound) {
                    this.elements.currentIp.textContent = 'Unable to detect IP';
                    console.error('❌ All IP detection methods failed');
                }
            }
        } catch (error) {
            console.error('Failed to refresh IP:', error);
            this.elements.currentIp.textContent = 'Network error';
        } finally {
            this.elements.refreshIpBtn.disabled = false;
        }
    }

    async updateLocationInfo(ipAddress) {
        try {
            // Get location data from main process
            const locationResult = await window.electronAPI.getLocationInfo(ipAddress);
            
            if (locationResult.success) {
                const location = locationResult.data;
                
                // Update country display
                if (location.country) {
                    this.elements.countryName.textContent = location.country;
                }
                
                // Update country flag based on country code
                if (location.country_code) {
                    const flag = this.getCountryFlag(location.country_code);
                    this.elements.countryFlag.textContent = flag;
                }
                
                console.log('Location updated:', location);
            } else {
                console.warn('Failed to get location info:', locationResult.error);
            }
        } catch (error) {
            console.error('Error updating location info:', error);
        }
    }

    getCountryFlag(countryCode) {
        // Convert country code to flag emoji
        const flags = {
            'US': '🇺🇸', 'DE': '🇩🇪', 'GB': '🇬🇧', 'FR': '🇫🇷', 'JP': '🇯🇵',
            'CN': '🇨🇳', 'CA': '🇨🇦', 'AU': '🇦🇺', 'BR': '🇧🇷', 'IN': '🇮🇳',
            'RU': '🇷🇺', 'IT': '🇮🇹', 'ES': '🇪🇸', 'KR': '🇰🇷', 'MX': '🇲🇽',
            'NL': '🇳🇱', 'CH': '🇨🇭', 'SE': '🇸🇪', 'NO': '🇳🇴', 'DK': '🇩🇰',
            'FI': '🇫🇮', 'BE': '🇧🇪', 'AT': '🇦🇹', 'IE': '🇮🇪', 'NZ': '🇳🇿',
            'SG': '🇸🇬', 'HK': '🇭🇰', 'TW': '🇹🇼', 'TH': '🇹🇭', 'MY': '🇲🇾',
            'ID': '🇮🇩', 'PH': '🇵🇭', 'VN': '🇻🇳', 'AE': '🇦🇪', 'SA': '🇸🇦',
            'IL': '🇮🇱', 'TR': '🇹🇷', 'GR': '🇬🇷', 'PT': '🇵🇹', 'CZ': '🇨🇿',
            'PL': '🇵🇱', 'HU': '🇭🇺', 'RO': '🇷🇴', 'BG': '🇧🇬', 'HR': '🇭🇷',
            'SK': '🇸🇰', 'SI': '🇸🇮', 'EE': '🇪🇪', 'LV': '🇱🇻', 'LT': '🇱🇹'
        };
        
        return flags[countryCode.toUpperCase()] || '🌍';
    }



    getFormConfiguration() {
        return {
            type: this.elements.proxyType.value,
            host: this.elements.proxyHost.value.trim(),
            port: parseInt(this.elements.proxyPort.value),
            username: this.elements.proxyUsername.value.trim() || null,
            password: this.elements.proxyPassword.value || null
        };
    }

    setFormConfiguration(config) {
        this.elements.proxyType.value = config.type || 'socks5';
        this.elements.proxyHost.value = config.host || '';
        this.elements.proxyPort.value = config.port || '';
        this.elements.proxyUsername.value = config.username || '';
        this.elements.proxyPassword.value = config.password || '';
    }

    validateConfiguration(config) {
        if (!config.host) {
            throw new Error('Host is required');
        }

        if (!config.port || config.port < 1 || config.port > 65535) {
            throw new Error('Valid port number is required (1-65535)');
        }

        if (!['socks5', 'http'].includes(config.type)) {
            throw new Error('Invalid proxy type');
        }
    }

    validateForm() {
        const config = this.getFormConfiguration();
        const isValid = config.host && config.port && config.port >= 1 && config.port <= 65535;
        
        this.elements.connectBtn.disabled = !isValid || this.isConnected;
        // Save Config button was removed - auto-save handles configuration saving
    }

    updateConnectionStatus(status) {
        this.isConnected = status.isConnected;
        this.currentConfig = status.config;
        
        this.updateConnectionUI(this.isConnected);
        this.updateSystemStatus(status);
    }

    updateConnectionUI(connected) {
        if (connected) {
            this.elements.connectionStatus.textContent = 'Connected';
            this.elements.connectionStatus.className = 'status-badge connected';
            this.elements.proxyStatus.textContent = 'Active';
            this.elements.connectBtn.disabled = true;
            this.elements.disconnectBtn.disabled = false;
        } else {
            this.elements.connectionStatus.textContent = 'Disconnected';
            this.elements.connectionStatus.className = 'status-badge disconnected';
            this.elements.proxyStatus.textContent = 'Inactive';
            this.elements.connectBtn.disabled = false;
            this.elements.disconnectBtn.disabled = true;
        }
    }

    updateAdminStatus(hasAdminRights) {
        console.log('🔄 Updating admin status in UI. Admin rights:', hasAdminRights, 'Type:', typeof hasAdminRights);
        
        // Clear existing classes first
        this.elements.adminStatus.classList.remove('admin-active', 'admin-required');

        if (hasAdminRights === true || hasAdminRights === 'true') {
            console.log('✅ Setting UI to ADMINISTRATOR STATUS');
            this.elements.adminStatus.textContent = '🛡️ Administrator';
            this.elements.adminStatus.classList.add('admin-active');
            this.elements.adminStatus.style.cursor = 'default';
            this.elements.adminStatus.style.color = '#28a745'; // Green color for admin status
            this.elements.adminStatus.style.pointerEvents = 'none'; // Completely disable clicking
            this.elements.adminStatus.title = 'Running with administrator privileges - Full functionality enabled';

            // Completely remove any existing click handler and event listeners
            this.elements.adminStatus.onclick = null;
            this.elements.adminStatus.removeEventListener('click', this.elevationClickHandler);

            // Add visual indicator that it's not clickable
            this.elements.adminStatus.style.opacity = '1';
            this.elements.adminStatus.style.fontWeight = 'bold';

            // Show success notification for elevation (only once)
            if (this.elevationInProgress) {
                this.showNotification('✅ Administrator access granted! Full functionality is now available.', 'success');
                this.elevationInProgress = false;

                // Stop admin status monitoring since we have admin rights
                this.stopAdminStatusMonitoring();
                console.log('🛡️ Admin status monitoring stopped - administrator privileges confirmed');
            }
        } else if (hasAdminRights === 'limited-admin') {
            console.log('⚠️ Setting UI to LIMITED ADMIN STATUS');
            this.elements.adminStatus.textContent = '⚠️ Limited Admin';
            this.elements.adminStatus.classList.add('admin-required');
            this.elements.adminStatus.style.cursor = 'pointer';
            this.elements.adminStatus.style.color = '#ff9800'; // Orange color for limited admin
            this.elements.adminStatus.style.pointerEvents = 'auto';
            this.elements.adminStatus.title = 'Limited administrator privileges - Click to request full elevation';
            
            this.elevationClickHandler = () => {
                if (!this.elevationInProgress) {
                    this.showElevationOptions();
                }
            };
            this.elements.adminStatus.onclick = this.elevationClickHandler;
        } else {
            console.log('❌ Setting UI to ACCESS REQUIRED STATUS');
            this.elements.adminStatus.textContent = '🔑 Access Required';
            this.elements.adminStatus.classList.add('admin-required');
            this.elements.adminStatus.style.cursor = 'pointer';
            this.elements.adminStatus.style.color = '#ffc107'; // Yellow color for warning
            this.elements.adminStatus.style.pointerEvents = 'auto'; // Enable clicking
            this.elements.adminStatus.style.opacity = '0.9';
            this.elements.adminStatus.style.fontWeight = 'normal';
            this.elements.adminStatus.title = 'Click to request administrator access for full functionality';

            // Create and store the click handler for proper removal later
            this.elevationClickHandler = () => {
                if (!this.elevationInProgress) {
                    this.showElevationOptions();
                }
            };

            // Add click handler for elevation request (only if not already elevated)
            this.elements.adminStatus.onclick = this.elevationClickHandler;
        }
    }

    async testAdminStatusManually() {
        console.log('🔍 MANUAL ADMIN STATUS TEST STARTED');
        this.showLoading('Testing administrator privileges...');
        
        try {
            // Test 1: Basic admin check
            console.log('Test 1: Basic admin check...');
            const basicCheck = await window.electronAPI.checkAdminRights();
            console.log('✅ Basic admin check result:', basicCheck, 'Type:', typeof basicCheck);
            
            // Test 2: Refresh admin status
            console.log('Test 2: Refresh admin status...');
            const refreshResult = await window.electronAPI.refreshAdminStatus();
            console.log('✅ Refresh result:', refreshResult);
            
            // Test 3: Get elevation status
            console.log('Test 3: Get elevation status...');
            const elevationStatus = await window.electronAPI.getElevationStatus();
            console.log('✅ Elevation status:', elevationStatus);
            
            // Update UI based on results
            if (basicCheck === true) {
                console.log('🎉 ADMIN PRIVILEGES CONFIRMED - Updating UI');
                this.updateAdminStatus(true);
                this.showNotification('✅ Administrator privileges confirmed!', 'success');
            } else if (basicCheck === 'limited-admin') {
                console.log('⚠️ LIMITED ADMIN DETECTED - Updating UI');
                this.updateAdminStatus(false);
                this.showNotification('⚠️ Limited admin privileges detected. Some features may require elevation.', 'warning');
            } else {
                console.log('❌ NO ADMIN PRIVILEGES - Updating UI');
                this.updateAdminStatus(false);
                this.showNotification('❌ No administrator privileges detected.', 'error');
            }
            
        } catch (error) {
            console.error('❌ Manual admin test failed:', error);
            this.showNotification(`Admin test failed: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    updateSystemStatus(status) {
        // Update system status indicators
        this.elements.tunStatus.textContent = status.tunCreated ? 'Created' : 'Not created';
        this.elements.routeStatus.textContent = status.isTrafficRedirected ? 'Redirected' : 'Default';
        this.elements.dnsStatus.textContent = status.isTrafficRedirected ? 'Proxy DNS' : 'System DNS';
        this.elements.tun2socksStatus.textContent = status.isConnected ? 'Running' : 'Stopped';
    }

    showLoading(message, progress = null) {
        this.elements.loadingMessage.textContent = message;
        this.elements.loadingOverlay.classList.remove('hidden');

        // Add progress indicator if provided
        if (progress) {
            const progressElement = this.elements.loadingOverlay.querySelector('.progress-indicator');
            if (progressElement) {
                progressElement.textContent = progress;
            } else {
                // Create progress indicator if it doesn't exist
                const progressDiv = document.createElement('div');
                progressDiv.className = 'progress-indicator';
                progressDiv.textContent = progress;
                this.elements.loadingOverlay.appendChild(progressDiv);
            }
        }
    }

    updateLoadingProgress(message, step = null, total = null) {
        if (this.elements.loadingOverlay.classList.contains('hidden')) {
            this.showLoading(message);
        } else {
            this.elements.loadingMessage.textContent = message;
        }

        if (step && total) {
            const progressText = `Step ${step} of ${total}`;
            const progressElement = this.elements.loadingOverlay.querySelector('.progress-indicator');
            if (progressElement) {
                progressElement.textContent = progressText;
            }
        }
    }

    hideLoading() {
        this.elements.loadingOverlay.classList.add('hidden');
    }

    showNotification(message, type = 'info', actionButton = null) {
        // Clear any existing action button
        const existingActionBtn = this.elements.notificationToast.querySelector('.notification-action');
        if (existingActionBtn) {
            existingActionBtn.remove();
        }

        this.elements.notificationMessage.innerHTML = message.replace(/\n/g, '<br>');
        this.elements.notificationToast.className = `notification-toast ${type}`;
        this.elements.notificationToast.classList.remove('hidden');

        // Add action button if provided
        if (actionButton) {
            const actionBtn = document.createElement('button');
            actionBtn.className = 'notification-action';
            actionBtn.textContent = actionButton.text;
            actionBtn.onclick = () => {
                actionButton.action();
                this.hideNotification();
            };
            this.elements.notificationToast.appendChild(actionBtn);
        }

        // Auto-hide after longer time for error messages
        const timeout = type === 'error' ? 10000 : 5000;
        setTimeout(() => this.hideNotification(), timeout);
    }

    hideNotification() {
        this.elements.notificationToast.classList.add('hidden');
    }

    showTunInterfaceHelp() {
        const helpMessage = `
            <h3>TUN Interface Setup Required</h3>
            <p>Choose how you'd like to fix the TUN interface issue:</p>

            <div class="fix-options">
                <div class="fix-option automatic">
                    <h4>🔧 Automatic Fix (Recommended)</h4>
                    <p>Let SP5Proxy automatically create and configure the TUN interface for you.</p>
                    <button class="btn btn-success auto-fix-btn" id="autoFixBtn">
                        <span class="btn-text">Run Automatic Fix</span>
                        <span class="btn-spinner hidden">🔄 Fixing...</span>
                    </button>
                </div>

                <div class="fix-option manual">
                    <h4>📋 Manual Instructions</h4>
                    <p>Follow these steps to fix the issue manually:</p>
                    <ol>
                        <li><strong>Close SP5Proxy</strong></li>
                        <li><strong>Right-click on SP5Proxy Desktop</strong></li>
                        <li><strong>Select "Run as administrator"</strong></li>
                        <li><strong>Try connecting again</strong></li>
                    </ol>
                    <p>If the issue persists:</p>
                    <ul>
                        <li>Run the setup script: <code>scripts\\setup-tun-interface.bat</code></li>
                        <li>Check the troubleshooting guide: <code>TROUBLESHOOTING.md</code></li>
                    </ul>
                </div>
            </div>
        `;

        // Create a modal dialog
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content tun-help-modal">
                <div class="modal-header">
                    <h2>TUN Interface Help</h2>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    ${helpMessage}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" onclick="window.electronAPI.openTroubleshootingGuide()">Open Troubleshooting Guide</button>
                    <button class="btn btn-secondary modal-close-btn">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close modal functionality
        const closeModal = () => {
            document.body.removeChild(modal);
        };

        modal.querySelector('.modal-close').onclick = closeModal;
        modal.querySelector('.modal-close-btn').onclick = closeModal;
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };

        // Auto-fix functionality
        const autoFixBtn = modal.querySelector('#autoFixBtn');
        const btnText = autoFixBtn.querySelector('.btn-text');
        const btnSpinner = autoFixBtn.querySelector('.btn-spinner');

        autoFixBtn.onclick = async () => {
            try {
                // Show loading state
                btnText.classList.add('hidden');
                btnSpinner.classList.remove('hidden');
                autoFixBtn.disabled = true;

                console.log('Running automatic TUN interface fix...');
                const result = await window.electronAPI.runFixTunInterface();

                if (result.success) {
                    // Success notification
                    this.showNotification(
                        `✅ ${result.message}\n\n${result.details || ''}`,
                        'success'
                    );
                    closeModal();
                } else {
                    // Error notification
                    let errorMessage = `❌ ${result.message}`;
                    if (result.details) {
                        errorMessage += `\n\nDetails: ${result.details}`;
                    }

                    if (result.requiresElevation) {
                        errorMessage += '\n\nPlease restart SP5Proxy as Administrator and try again.';
                    }

                    this.showNotification(errorMessage, 'error');
                }

            } catch (error) {
                console.error('Error running automatic fix:', error);
                this.showNotification(
                    `❌ Failed to run automatic fix: ${error.message}\n\nPlease try the manual instructions instead.`,
                    'error'
                );
            } finally {
                // Reset button state
                btnText.classList.remove('hidden');
                btnSpinner.classList.add('hidden');
                autoFixBtn.disabled = false;
            }
        };
    }

    // Monetization System Methods

    async startMonetizationTimer() {
        console.log('💰 Starting monetization timer display');

        // Show connection timer
        this.elements.connectionTimer.classList.remove('hidden');

        // Start timer update interval
        this.monetizationTimer = setInterval(async () => {
            await this.updateTimerDisplay();
        }, 1000);

        // Initial update
        await this.updateTimerDisplay();
    }

    stopMonetizationTimer() {
        console.log('💰 Stopping monetization timer display');

        if (this.monetizationTimer) {
            clearInterval(this.monetizationTimer);
            this.monetizationTimer = null;
        }

        // Hide connection timer
        this.elements.connectionTimer.classList.add('hidden');

        // Hide extension panel
        this.elements.extensionPanel.classList.add('hidden');
    }

    async updateTimerDisplay() {
        try {
            const status = await window.electronAPI.monetizationGetConnectionStatus();

            if (!status.connected) {
                this.stopMonetizationTimer();
                return;
            }

            const timeRemaining = status.timeRemaining;
            const minutes = Math.floor(timeRemaining / 60000);
            const seconds = Math.floor((timeRemaining % 60000) / 1000);

            // Update timer text
            this.elements.timerText.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

            // Update phase
            if (status.phase === 'extended') {
                this.elements.timerPhase.textContent = 'Extended (4 Hours)';
            } else {
                this.elements.timerPhase.textContent = 'Free Trial';
            }

            // Update progress bar
            const totalTime = status.phase === 'extended' ? 4 * 60 * 60 * 1000 : 10 * 60 * 1000;
            const progress = (timeRemaining / totalTime) * 100;

            this.elements.timerProgressBar.style.width = `${progress}%`;

            // Update progress bar color based on time remaining
            this.elements.timerProgressBar.classList.remove('warning', 'danger');
            if (progress < 20) {
                this.elements.timerProgressBar.classList.add('danger');
            } else if (progress < 50) {
                this.elements.timerProgressBar.classList.add('warning');
            }

        } catch (error) {
            console.error('Failed to update timer display:', error);
        }
    }

    handleTimeExpired(data) {
        console.log('⚠️ Time expired event received:', data);

        // Show extension panel
        this.elements.extensionPanel.classList.remove('hidden');

        // Show notification
        this.showNotification(data.message, 'warning', {
            text: 'Extend Connection',
            action: () => {
                this.elements.extensionPanel.classList.remove('hidden');
                this.elements.extensionPanel.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }

    handleForceDisconnect(data) {
        console.log('🔌 Force disconnect event received:', data);

        // Stop timer
        this.stopMonetizationTimer();

        // Update UI
        this.updateConnectionUI(false);

        // Show notification
        this.showNotification(data.message, 'error', {
            text: 'Extend & Reconnect',
            action: () => {
                this.elements.extensionPanel.classList.remove('hidden');
                this.elements.extensionPanel.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }

    async openExtensionUrl() {
        try {
            this.elements.openUrlBtn.disabled = true;
            this.elements.openUrlBtn.innerHTML = '<span class="btn-icon">⏳</span> Generating...';

            // Generate shortened URL
            const result = await window.electronAPI.monetizationGenerateUrl();

            if (result.success) {
                this.currentUrlData = result;

                // Open URL in browser
                const openResult = await window.electronAPI.monetizationOpenUrl(result);

                if (openResult.success) {
                    this.showNotification('✅ Extension URL opened in browser. Complete the process and return with your code!', 'success');

                    // Update button text
                    this.elements.openUrlBtn.innerHTML = '<span class="btn-icon">✅</span> URL Opened';

                    // Focus on code input
                    this.elements.extensionCode.focus();
                } else {
                    throw new Error(openResult.message);
                }
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('Failed to open extension URL:', error);
            this.showNotification(`❌ Failed to open extension URL: ${error.message}`, 'error');
        } finally {
            this.elements.openUrlBtn.disabled = false;
            setTimeout(() => {
                this.elements.openUrlBtn.innerHTML = '<span class="btn-icon">🌐</span> Open Extension URL';
            }, 3000);
        }
    }

    async validateExtensionCode() {
        const code = this.elements.extensionCode.value.trim();

        if (!code) {
            this.showNotification('Please enter your extension code', 'warning');
            this.elements.extensionCode.focus();
            return;
        }

        try {
            this.elements.validateCodeBtn.disabled = true;
            this.elements.validateCodeBtn.innerHTML = '<span class="btn-icon">⏳</span> Validating...';

            const result = await window.electronAPI.monetizationValidateCode(code);

            if (result.success) {
                this.showNotification(`✅ ${result.message}`, 'success');

                // Hide extension panel
                this.elements.extensionPanel.classList.add('hidden');

                // Clear code input
                this.elements.extensionCode.value = '';

                // Update timer display
                await this.updateTimerDisplay();

            } else {
                this.showNotification(`❌ ${result.message}`, 'error');
                this.elements.extensionCode.focus();
                this.elements.extensionCode.select();
            }
        } catch (error) {
            console.error('Failed to validate extension code:', error);
            this.showNotification(`❌ Failed to validate code: ${error.message}`, 'error');
        } finally {
            this.elements.validateCodeBtn.disabled = false;
            this.elements.validateCodeBtn.innerHTML = '<span class="btn-icon">✅</span> Validate';
        }
    }

    closeExtensionPanel() {
        this.elements.extensionPanel.classList.add('hidden');
        this.elements.extensionCode.value = '';
        this.currentUrlData = null;
    }

    // DNS Leak Testing Methods
    async runDNSLeakTest() {
        try {
            this.elements.runDnsLeakTestBtn.disabled = true;
            this.elements.runDnsLeakTestBtn.innerHTML = '<span class="btn-icon">⏳</span> Testing...';

            this.showLoading('Running comprehensive DNS leak test...');

            const result = await window.electronAPI.runDnsLeakTest();

            if (result.success) {
                this.showDNSTestResults(result.results);
                this.updateLastLeakTestTime();

                if (result.results.hasLeaks) {
                    this.showNotification('⚠️ DNS leaks detected! Check the results below.', 'error');
                } else {
                    this.showNotification('✅ No DNS leaks detected! Your connection is secure.', 'success');
                }
            } else {
                throw new Error(result.error || 'DNS leak test failed');
            }

        } catch (error) {
            console.error('DNS leak test failed:', error);
            this.showNotification(`❌ DNS leak test failed: ${error.message}`, 'error');
        } finally {
            this.elements.runDnsLeakTestBtn.disabled = false;
            this.elements.runDnsLeakTestBtn.innerHTML = '<span class="btn-icon">🔍</span> Test for DNS Leaks';
            this.hideLoading();
        }
    }

    async testDNSConnectivity() {
        try {
            this.elements.dnsConnectivityTestBtn.disabled = true;
            this.elements.dnsConnectivityTestBtn.innerHTML = '<span class="btn-icon">⏳</span> Testing...';

            const result = await window.electronAPI.runDnsConnectivityTest();

            if (result.success) {
                if (result.isConnected) {
                    this.showNotification('✅ DNS connectivity test passed!', 'success');
                } else {
                    this.showNotification('❌ DNS connectivity test failed!', 'error');
                }
            } else {
                throw new Error(result.error || 'DNS connectivity test failed');
            }

        } catch (error) {
            console.error('DNS connectivity test failed:', error);
            this.showNotification(`❌ DNS connectivity test failed: ${error.message}`, 'error');
        } finally {
            this.elements.dnsConnectivityTestBtn.disabled = false;
            this.elements.dnsConnectivityTestBtn.innerHTML = '<span class="btn-icon">🌐</span> Test DNS Connectivity';
        }
    }

    async startDNSMonitoring() {
        try {
            const result = await window.electronAPI.startDnsLeakMonitoring();

            if (result.success) {
                this.elements.startDnsMonitoringBtn.disabled = true;
                this.elements.stopDnsMonitoringBtn.disabled = false;
                this.showNotification('👁️ DNS leak monitoring started', 'info');
                this.updateDNSProtectionStatus('Monitoring Active');
            } else {
                throw new Error(result.error || 'Failed to start DNS monitoring');
            }

        } catch (error) {
            console.error('Failed to start DNS monitoring:', error);
            this.showNotification(`❌ Failed to start DNS monitoring: ${error.message}`, 'error');
        }
    }

    async stopDNSMonitoring() {
        try {
            const result = await window.electronAPI.stopDnsLeakMonitoring();

            if (result.success) {
                this.elements.startDnsMonitoringBtn.disabled = false;
                this.elements.stopDnsMonitoringBtn.disabled = true;
                this.showNotification('🛑 DNS leak monitoring stopped', 'info');
                this.updateDNSProtectionStatus('Not Monitoring');
            } else {
                throw new Error(result.error || 'Failed to stop DNS monitoring');
            }

        } catch (error) {
            console.error('Failed to stop DNS monitoring:', error);
            this.showNotification(`❌ Failed to stop DNS monitoring: ${error.message}`, 'error');
        }
    }

    showDNSTestResults(results) {
        if (!results) return;

        // Show the results panel
        this.elements.dnsTestResults.classList.remove('hidden');

        // Update summary
        const summaryHtml = `
            <div class="test-summary-header">
                <h4 class="result-${results.overallResult.toLowerCase()}">
                    ${this.getDNSResultIcon(results.overallResult)} ${results.overallResult}
                </h4>
                <p class="test-timestamp">Tested: ${new Date(results.timestamp).toLocaleString()}</p>
            </div>
            <div class="test-stats">
                <div class="stat-item">
                    <span class="stat-label">Success Rate:</span>
                    <span class="stat-value">${results.summary.successRate.toFixed(1)}%</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Tests Passed:</span>
                    <span class="stat-value">${results.summary.passedTests}/${results.summary.totalTests}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">DNS Leaks:</span>
                    <span class="stat-value ${results.hasLeaks ? 'leak-detected' : 'no-leaks'}">
                        ${results.hasLeaks ? 'DETECTED' : 'NONE'}
                    </span>
                </div>
            </div>
        `;
        this.elements.dnsTestSummary.innerHTML = summaryHtml;

        // Update details
        const detailsHtml = results.tests.map(test => `
            <div class="test-detail-item">
                <div class="test-header">
                    <h5 class="test-name">
                        ${this.getTestStatusIcon(test.status)} ${test.name}
                    </h5>
                    <span class="test-status status-${test.status.toLowerCase()}">${test.status}</span>
                </div>
                <p class="test-description">${test.description}</p>
                ${test.details && test.details.length > 0 ? `
                    <div class="test-details">
                        ${test.details.map(detail => `
                            <div class="detail-item">
                                <strong>${detail.interface || detail.service || detail.check || detail.domain}:</strong>
                                <span class="detail-status">${detail.status}</span>
                                ${detail.servers ? `<span class="detail-info">(${detail.servers.join(', ')})</span>` : ''}
                                ${detail.error ? `<span class="detail-error">${detail.error}</span>` : ''}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                ${test.error ? `<div class="test-error">Error: ${test.error}</div>` : ''}
            </div>
        `).join('');
        this.elements.dnsTestDetails.innerHTML = detailsHtml;

        // Update recommendations
        const recommendationsHtml = results.recommendations.map(rec => `
            <div class="recommendation-item priority-${rec.priority.toLowerCase()}">
                <div class="recommendation-header">
                    <span class="priority-badge">${rec.priority}</span>
                    <strong>${rec.issue}</strong>
                </div>
                <p class="recommendation-solution">${rec.solution}</p>
            </div>
        `).join('');
        this.elements.dnsRecommendations.innerHTML = recommendationsHtml;

        // Scroll to results
        this.elements.dnsTestResults.scrollIntoView({ behavior: 'smooth' });
    }

    getDNSResultIcon(result) {
        switch (result) {
            case 'EXCELLENT': return '🟢';
            case 'GOOD': return '🟡';
            case 'POOR': return '🟠';
            case 'FAIL': return '🔴';
            default: return '⚪';
        }
    }

    getTestStatusIcon(status) {
        switch (status) {
            case 'PASS': return '✅';
            case 'FAIL': return '❌';
            case 'ERROR': return '⚠️';
            default: return '⚪';
        }
    }

    updateDNSStatus(results) {
        if (results && results.hasLeaks) {
            this.updateDNSProtectionStatus('LEAKS DETECTED', 'error');
        } else if (results && !results.hasLeaks) {
            this.updateDNSProtectionStatus('Protected', 'success');
        }
    }

    updateDNSProtectionStatus(status, type = 'info') {
        this.elements.dnsProtectionStatus.textContent = status;
        this.elements.dnsProtectionStatus.className = `status-text status-${type}`;
    }

    updateLastLeakTestTime() {
        const now = new Date();
        this.elements.lastLeakTest.textContent = now.toLocaleTimeString();
    }

    async fixDNSLeaks() {
        try {
            this.showLoading('Applying comprehensive DNS leak prevention...');
            
            // Disconnect and reconnect with comprehensive DNS protection
            if (this.isConnected) {
                await this.disconnectProxy();
                // Wait a moment for cleanup
                await new Promise(resolve => setTimeout(resolve, 2000));
                // Reconnect with enhanced protection
                await this.connectProxy();
            }
            
            this.showNotification('✅ Comprehensive DNS leak prevention applied!', 'success');
        } catch (error) {
            this.showNotification(`Failed to fix DNS leaks: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    handleUDPAssociateError() {
        this.showNotification('ℹ️ UDP ASSOCIATE not supported by this proxy. Application will use TCP-only mode for optimal compatibility.', 'info', {
            text: 'Learn More',
            action: () => this.showUDPInfo()
        });
    }

    showUDPInfo() {
        this.showNotification('UDP ASSOCIATE is a SOCKS5 feature for UDP traffic. Many proxies only support TCP. TCP-only mode provides the same functionality for most applications.', 'info');
    }

    loadConfigurationIntoUI(config) {
        if (!config) return;

        this.elements.proxyHost.value = config.host || '';
        this.elements.proxyPort.value = config.port || '';
        this.elements.proxyType.value = config.type || 'socks5';
        this.elements.proxyUsername.value = config.username || '';
        this.elements.proxyPassword.value = config.password || '';

        console.log('✅ Configuration loaded into UI:', {
            host: config.host || '(empty)',
            port: config.port || '(empty)',
            type: config.type || 'socks5'
        });
    }

    applyUIConfiguration(uiConfig) {
        if (!uiConfig) return;

        // Apply theme if specified
        if (uiConfig.theme) {
            document.body.setAttribute('data-theme', uiConfig.theme);
        }

        console.log('✅ UI configuration applied:', uiConfig);
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.sp5ProxyApp = new SP5ProxyRenderer();
});
