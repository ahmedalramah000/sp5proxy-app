const { BrowserWindow, shell } = require('electron');
const path = require('path');

/**
 * SP5Proxy WebView Extension Manager
 * Handles smart extension system with embedded WebView
 * NO OTP CODES - Automatic tracking and validation
 */
class WebViewExtensionManager {
    constructor(databaseManager) {
        this.databaseManager = databaseManager;
        this.webViewWindow = null;
        this.currentSessionId = null;
        this.currentTargetUrl = null;
        this.currentSelectedService = null;
        this.monetizationManager = null;
        this.isMonitoring = false;
        this.monitoringInterval = null;
        this.internetCheckInterval = null;

        // API Configurations for URL Shortening Services
        this.apiConfigs = {
            shrinkearn: {
                apiToken: 'b127235b7772b16515d598bb168a99ac5ca6f7ee',
                apiEndpoint: 'https://shrinkearn.com/api',
                username: 'Ahmed'
            },
            shortjambo: {
                apiToken: '6420adfaff1f094ed7a472823506f4b7ffc52522',
                apiEndpoint: 'https://short-jambo.com/api',
                username: 'Ahmed'
            }
        };

        console.log('🌐 WebView Extension Manager initialized (NO OTP codes)');
        console.log('🔗 ShrinkEarn API integration enabled');
        console.log('🔗 Short Jambo API integration enabled');
    }

    /**
     * Load predefined shortened URLs from admin panel
     */
    async loadPredefinedUrls() {
        try {
            if (this.databaseManager) {
                const services = await this.databaseManager.getUrlServices();
                this.predefinedUrls = services
                    .filter(service => service.is_active && service.base_url)
                    .map(service => ({
                        id: service.id,
                        name: service.name,
                        url: service.base_url,
                        priority: service.priority
                    }));
                    // No sorting - random selection will handle order
                
                console.log(`✅ Loaded ${this.predefinedUrls.length} predefined URLs:`, 
                    this.predefinedUrls.map(u => u.name));
            } else {
                // No fallback URLs - require admin panel configuration
                this.predefinedUrls = [];
                console.log('⚠️ No database available - URL services must be configured via admin panel');
            }
        } catch (error) {
            console.error('❌ Failed to load predefined URLs:', error);
        }
    }

    /**
     * Shorten URL using ShrinkEarn API
     */
    async shortenUrlWithShrinkEarn(targetUrl) {
        try {
            console.log('🔗 Shortening URL with ShrinkEarn API...');
            console.log(`📎 Target URL: ${targetUrl}`);

            // Build API request URL
            const apiUrl = `${this.apiConfigs.shrinkearn.apiEndpoint}?api=${this.apiConfigs.shrinkearn.apiToken}&url=${encodeURIComponent(targetUrl)}&format=text`;
            console.log(`🌐 ShrinkEarn API Request: ${apiUrl}`);

            // Make API request
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': 'SP5Proxy Desktop/1.0.0'
                }
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }

            const shortenedUrl = await response.text();
            const trimmedUrl = shortenedUrl.trim();

            // Validate the shortened URL
            if (!trimmedUrl || !trimmedUrl.startsWith('http')) {
                throw new Error(`Invalid shortened URL received: ${trimmedUrl}`);
            }

            console.log(`✅ ShrinkEarn API success: ${trimmedUrl}`);
            return trimmedUrl;

        } catch (error) {
            console.error('❌ ShrinkEarn API error:', error);
            return null;
        }
    }

    /**
     * Shorten URL using Short Jambo API
     */
    async shortenUrlWithShortJambo(targetUrl) {
        try {
            console.log('🔗 Shortening URL with Short Jambo API...');
            console.log(`📎 Target URL: ${targetUrl}`);

            // Build API request URL
            const apiUrl = `${this.apiConfigs.shortjambo.apiEndpoint}?api=${this.apiConfigs.shortjambo.apiToken}&url=${encodeURIComponent(targetUrl)}&format=text`;
            console.log(`🌐 Short Jambo API Request: ${apiUrl}`);

            // Make API request
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': 'SP5Proxy Desktop/1.0.0'
                }
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }

            const shortenedUrl = await response.text();
            const trimmedUrl = shortenedUrl.trim();

            // Validate the shortened URL
            if (!trimmedUrl || !trimmedUrl.startsWith('http')) {
                throw new Error(`Invalid shortened URL received: ${trimmedUrl}`);
            }

            console.log(`✅ Short Jambo API success: ${trimmedUrl}`);
            return trimmedUrl;

        } catch (error) {
            console.error('❌ Short Jambo API error:', error);
            return null;
        }
    }

    /**
     * Start extension process with URL shortening service
     */
    async startExtension(extensionData) {
        try {
            console.log('🌐 Starting WebView extension process...');
            console.log('📊 Extension data:', extensionData);

            // Store extension data
            this.currentSessionId = extensionData.sessionId;
            this.currentTargetUrl = extensionData.targetUrl;
            this.currentSelectedService = extensionData.selectedService;

            console.log(`🎯 Session ID: ${this.currentSessionId}`);
            console.log(`🔗 Target URL: ${this.currentTargetUrl}`);
            console.log(`🏢 Service: ${this.currentSelectedService.name}`);

            // Create WebView window
            await this.createWebViewWindow();

            // Determine which API to use based on service name
            const serviceName = this.currentSelectedService.name.toLowerCase();
            let shortenedUrl = null;

            if (serviceName.includes('shrinkearn')) {
                console.log('🔗 Using ShrinkEarn API integration...');
                shortenedUrl = await this.shortenUrlWithShrinkEarn(this.currentTargetUrl);
            } else if (serviceName.includes('jambo') || serviceName.includes('short-jambo')) {
                console.log('🔗 Using Short Jambo API integration...');
                shortenedUrl = await this.shortenUrlWithShortJambo(this.currentTargetUrl);
            }

            // Load the shortened URL or fallback to service URL
            if (shortenedUrl) {
                console.log(`✅ URL shortened successfully: ${shortenedUrl}`);
                await this.loadUrlInWebView(shortenedUrl);
            } else {
                console.log('❌ Failed to shorten URL or no API available, loading service directly');
                const serviceUrl = this.currentSelectedService.url || this.currentSelectedService.base_url;
                console.log(`🌐 Loading URL shortening service: ${serviceUrl}`);
                await this.loadUrlInWebView(serviceUrl);
            }

            // Start monitoring WebView for completion
            this.startWebViewMonitoring();

            // Start internet connection monitoring
            this.startInternetConnectionMonitoring();

            return {
                success: true,
                sessionId: this.currentSessionId,
                selectedService: this.currentSelectedService,
                message: 'Extension process started. Complete the task in the WebView window.'
            };

        } catch (error) {
            console.error('❌ Failed to start extension:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * Create WebView window
     */
    async createWebViewWindow() {
        return new Promise((resolve, reject) => {
            try {
                this.webViewWindow = new BrowserWindow({
                    width: 1000,
                    height: 700,
                    title: 'SP5Proxy - Extend Connection Time',
                    icon: path.join(__dirname, '../assets/icon.png'),
                    webPreferences: {
                        nodeIntegration: false,
                        contextIsolation: true,
                        enableRemoteModule: false,
                        webSecurity: true,
                        allowRunningInsecureContent: false
                    },
                    show: false,
                    resizable: true,
                    minimizable: true,
                    maximizable: true,
                    closable: true,
                    alwaysOnTop: false,
                    skipTaskbar: false
                });

                // Show window when ready
                this.webViewWindow.once('ready-to-show', () => {
                    this.webViewWindow.show();
                    this.webViewWindow.focus();
                    resolve();
                });

                // Handle window closed
                this.webViewWindow.on('closed', () => {
                    this.cleanup();
                });

                // Handle navigation
                this.webViewWindow.webContents.on('will-navigate', (event, url) => {
                    this.handleNavigation(url);
                });

                this.webViewWindow.webContents.on('did-navigate', (event, url) => {
                    this.handleNavigation(url);
                });

                // Handle page load completion
                this.webViewWindow.webContents.on('did-finish-load', () => {
                    this.checkPageCompletion();
                });

                // Handle network errors
                this.webViewWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
                    if (errorCode === -106) { // No internet connection
                        this.showNoInternetPage();
                    }
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Load URL in WebView
     */
    async loadUrlInWebView(url) {
        try {
            console.log(`🌐 Loading URL in WebView: ${url}`);
            await this.webViewWindow.loadURL(url);
        } catch (error) {
            console.error('❌ Failed to load URL:', error);
            if (error.message.includes('net::ERR_INTERNET_DISCONNECTED')) {
                this.showNoInternetPage();
            }
        }
    }

    /**
     * Select random URL from predefined list
     */
    selectRandomUrl() {
        const randomIndex = Math.floor(Math.random() * this.predefinedUrls.length);
        return this.predefinedUrls[randomIndex];
    }

    /**
     * Generate unique session ID
     */
    generateSessionId() {
        return 'S' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5).toUpperCase();
    }

    /**
     * Handle navigation events
     */
    handleNavigation(url) {
        console.log(`🔄 Navigation: ${url}`);
        
        // Check if this is our deep link (new protocol)
        if (url.startsWith('sp5proxy://extension-completed')) {
            this.handleDeepLink(url);
            return;
        }

        // Check for completion indicators
        this.checkUrlForCompletion(url);
    }

    /**
     * Check URL for completion indicators
     */
    checkUrlForCompletion(url) {
        const completionIndicators = [
            'completed',
            'success',
            'unlocked',
            'finished',
            'done',
            'sp5proxy',
            this.currentSessionId
        ];

        const urlLower = url.toLowerCase();
        const hasCompletionIndicator = completionIndicators.some(indicator => 
            urlLower.includes(indicator.toLowerCase())
        );

        if (hasCompletionIndicator) {
            console.log('✅ Completion indicator detected in URL');
            this.handleExtensionSuccess();
        }
    }

    /**
     * Check page content for completion
     */
    async checkPageCompletion() {
        try {
            if (!this.webViewWindow || this.webViewWindow.isDestroyed()) return;

            // Execute script to check page content
            const result = await this.webViewWindow.webContents.executeJavaScript(`
                (function() {
                    const bodyText = document.body.innerText.toLowerCase();
                    const currentUrl = window.location.href.toLowerCase();
                    
                    // Check for completion keywords
                    const completionKeywords = [
                        'completed', 'success', 'unlocked', 'finished', 'done',
                        'congratulations', 'well done', 'task completed',
                        'sp5proxy', '${this.currentSessionId.toLowerCase()}'
                    ];
                    
                    const hasKeyword = completionKeywords.some(keyword => 
                        bodyText.includes(keyword) || currentUrl.includes(keyword)
                    );
                    
                    return {
                        hasKeyword: hasKeyword,
                        url: window.location.href,
                        title: document.title,
                        bodyLength: document.body.innerText.length
                    };
                })()
            `);

            if (result.hasKeyword) {
                console.log('✅ Completion keyword detected in page content');
                this.handleExtensionSuccess();
            }

        } catch (error) {
            console.error('❌ Failed to check page completion:', error);
        }
    }

    /**
     * Start WebView monitoring
     */
    startWebViewMonitoring() {
        if (this.isMonitoring) return;

        this.isMonitoring = true;
        this.monitoringInterval = setInterval(() => {
            this.checkPageCompletion();
        }, 3000); // Check every 3 seconds

        console.log('🔍 Started WebView monitoring');
    }

    /**
     * Stop WebView monitoring
     */
    stopWebViewMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        this.isMonitoring = false;
        console.log('⏹️ Stopped WebView monitoring');
    }

    /**
     * Handle deep link (new protocol)
     */
    handleDeepLink(url) {
        try {
            const urlObj = new URL(url);
            const sessionId = urlObj.searchParams.get('session');
            const timestamp = urlObj.searchParams.get('timestamp');
            const source = urlObj.searchParams.get('source');

            console.log(`🔗 Deep link received: ${url}`);
            console.log(`🔑 Session ID: ${sessionId}`);
            console.log(`⏰ Timestamp: ${timestamp}`);
            console.log(`🏢 Source: ${source}`);

            if (sessionId === this.currentSessionId) {
                console.log('✅ Session ID matches - Extension successful!');
                this.handleExtensionSuccess();
            } else {
                console.log('❌ Session ID mismatch - Extension failed');
                console.log(`Expected: ${this.currentSessionId}, Received: ${sessionId}`);
                this.handleExtensionFailure('Invalid session ID');
            }
        } catch (error) {
            console.error('❌ Failed to handle deep link:', error);
            this.handleExtensionFailure('Invalid deep link format');
        }
    }

    /**
     * Handle extension success
     */
    async handleExtensionSuccess() {
        console.log('🎉 Extension completed successfully!');

        // Stop monitoring
        this.stopWebViewMonitoring();
        this.stopInternetConnectionMonitoring();

        // Notify monetization manager about successful completion
        if (this.monetizationManager) {
            try {
                const result = await this.monetizationManager.handleWebViewExtensionSuccess(this.currentSessionId);
                console.log('✅ Monetization manager notified:', result);
            } catch (error) {
                console.error('❌ Failed to notify monetization manager:', error);
            }
        }

        // Show success message
        this.showSuccessPage();

        // Close window after delay
        setTimeout(() => {
            this.cleanup();
        }, 5000);
    }

    /**
     * Set monetization manager reference
     */
    setMonetizationManager(monetizationManager) {
        this.monetizationManager = monetizationManager;
        console.log('💰 Monetization Manager connected to WebView Extension Manager');
    }

    /**
     * Start internet connection monitoring
     */
    startInternetConnectionMonitoring() {
        if (this.internetCheckInterval) return;

        this.internetCheckInterval = setInterval(async () => {
            try {
                // Simple connectivity check
                const response = await fetch('https://www.google.com/favicon.ico', {
                    method: 'HEAD',
                    mode: 'no-cors',
                    cache: 'no-cache'
                });
                // If we reach here, internet is working
            } catch (error) {
                console.warn('⚠️ Internet connection lost during WebView extension');
                this.showNoInternetPage();
            }
        }, 10000); // Check every 10 seconds

        console.log('🌐 Started internet connection monitoring');
    }

    /**
     * Stop internet connection monitoring
     */
    stopInternetConnectionMonitoring() {
        if (this.internetCheckInterval) {
            clearInterval(this.internetCheckInterval);
            this.internetCheckInterval = null;
        }
        console.log('🌐 Stopped internet connection monitoring');
    }

    /**
     * Handle extension failure
     */
    handleExtensionFailure(reason) {
        console.log(`❌ Extension failed: ${reason}`);
        
        // Emit failure event
        if (this.databaseManager) {
            this.databaseManager.emit('extensionFailed', {
                sessionId: this.currentSessionId,
                success: false,
                reason: reason
            });
        }
    }

    /**
     * Show no internet page
     */
    showNoInternetPage() {
        const noInternetHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>No Internet Connection</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        text-align: center; 
                        padding: 50px; 
                        background: #f5f5f5; 
                    }
                    .error-container { 
                        background: white; 
                        padding: 40px; 
                        border-radius: 10px; 
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
                        max-width: 500px; 
                        margin: 0 auto; 
                    }
                    .error-icon { font-size: 64px; margin-bottom: 20px; }
                    .error-title { font-size: 24px; color: #e74c3c; margin-bottom: 15px; }
                    .error-message { font-size: 16px; color: #666; margin-bottom: 25px; }
                    .retry-btn { 
                        background: #3498db; 
                        color: white; 
                        border: none; 
                        padding: 12px 24px; 
                        border-radius: 5px; 
                        cursor: pointer; 
                        font-size: 16px; 
                    }
                    .retry-btn:hover { background: #2980b9; }
                </style>
            </head>
            <body>
                <div class="error-container">
                    <div class="error-icon">❌</div>
                    <div class="error-title">No Internet Connection</div>
                    <div class="error-message">
                        Unable to load the extension page. Please check your internet connection and try again.
                    </div>
                    <button class="retry-btn" onclick="window.location.reload()">Try Again</button>
                </div>
            </body>
            </html>
        `;
        
        this.webViewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(noInternetHtml)}`);
    }

    /**
     * Show success page
     */
    showSuccessPage() {
        const successHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Extension Successful</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        text-align: center; 
                        padding: 50px; 
                        background: #f5f5f5; 
                    }
                    .success-container { 
                        background: white; 
                        padding: 40px; 
                        border-radius: 10px; 
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
                        max-width: 500px; 
                        margin: 0 auto; 
                    }
                    .success-icon { font-size: 64px; margin-bottom: 20px; }
                    .success-title { font-size: 24px; color: #27ae60; margin-bottom: 15px; }
                    .success-message { font-size: 16px; color: #666; margin-bottom: 25px; }
                </style>
            </head>
            <body>
                <div class="success-container">
                    <div class="success-icon">✅</div>
                    <div class="success-title">Extension Successful!</div>
                    <div class="success-message">
                        Your connection has been extended by 4 hours. This window will close automatically.
                    </div>
                </div>
            </body>
            </html>
        `;
        
        this.webViewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(successHtml)}`);
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        this.stopWebViewMonitoring();
        this.stopInternetConnectionMonitoring();

        if (this.webViewWindow && !this.webViewWindow.isDestroyed()) {
            this.webViewWindow.close();
        }

        this.webViewWindow = null;
        this.currentSessionId = null;
        this.currentTargetUrl = null;
        this.currentSelectedService = null;

        console.log('🧹 WebView extension manager cleaned up');
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            isActive: this.webViewWindow && !this.webViewWindow.isDestroyed(),
            sessionId: this.currentSessionId,
            predefinedUrlsCount: this.predefinedUrls.length,
            isMonitoring: this.isMonitoring
        };
    }
}

module.exports = WebViewExtensionManager; 