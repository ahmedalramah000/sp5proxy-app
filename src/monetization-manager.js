const { shell } = require('electron');
const axios = require('axios');
const crypto = require('crypto');

/**
 * SP5Proxy Monetization Manager
 * Handles connection time limits and WebView-based extension system
 * NO OTP CODES - Uses automatic WebView tracking instead
 */
class MonetizationManager {
    constructor() {
        this.userId = this.generateUserId();
        this.connectionTimer = null;
        this.warningTimer = null;
        this.connectionStartTime = null;
        this.connectionExtendedUntil = null;
        this.isConnected = false;
        this.adminUrls = []; // NO DEFAULT URLS - Admin must add manually
        this.databaseManager = null;
        this.urlExtensionManager = null;
        this.internetConnectionStatus = true;

        // Connection time limits (in milliseconds)
        this.freeTrialTime = 10 * 60 * 1000; // 10 minutes total free trial
        this.warningTime = 2 * 60 * 1000; // 2 minutes warning before disconnect
        this.extensionTime = 4 * 60 * 60 * 1000; // 4 hours extension

        // Target landing page URL for URL shortening services (PRODUCTION)
        this.targetLandingPageUrl = process.env.LANDING_PAGE_URL || 'https://google.com';

        console.log('💰 Monetization Manager initialized with user ID:', this.userId);
        console.log('🎯 Target landing page:', this.targetLandingPageUrl);
        console.log('🌐 WebView-based extension system enabled (NO OTP codes)');
    }

    generateUserId() {
        // Generate a unique user ID based on machine characteristics
        const os = require('os');
        const machineId = crypto.createHash('sha256')
            .update(os.hostname() + os.platform() + os.arch())
            .digest('hex')
            .substring(0, 16);
        return `sp5_${machineId}`;
    }

    /**
     * Get the current user ID
     */
    getUserId() {
        return this.userId;
    }

    /**
     * Start connection timer when proxy connects
     */
    startConnectionTimer() {
        if (this.connectionTimer) {
            this.stopConnectionTimer();
        }

        this.isConnected = true;
        this.connectionStartTime = Date.now();

        // Check for saved extended time first
        this.loadSavedExtensionTime();

        if (this.connectionExtendedUntil && this.connectionExtendedUntil > Date.now()) {
            // User has remaining extended time
            const remainingTime = this.connectionExtendedUntil - Date.now();
            const remainingHours = Math.round(remainingTime / (1000 * 60 * 60) * 10) / 10; // Round to 1 decimal

            console.log(`⏰ Resuming extended connection time`);
            console.log(`   Remaining time: ${remainingHours} hours`);
            console.log(`   Expires at: ${new Date(this.connectionExtendedUntil).toLocaleString()}`);

            // Set warning timer (2 minutes before expiration)
            const warningTime = Math.max(0, remainingTime - this.warningTime);
            this.warningTimer = setTimeout(() => {
                console.log('⚠️ Extension warning: 2 minutes until expiration');
                this.handleExtensionWarning();
            }, warningTime);

            // Set main timer for extension expiration
            this.connectionTimer = setTimeout(() => {
                this.handleExtensionTimeExpired();
            }, remainingTime);

            return {
                success: true,
                extendedTime: remainingTime,
                extendedUntil: this.connectionExtendedUntil,
                startTime: this.connectionStartTime,
                phase: 'extended'
            };
        } else {
            // Start normal 10-minute free trial
            console.log('⏰ Starting 10-minute free trial timer');
            console.log(`   Total trial duration: ${this.freeTrialTime / 1000} seconds`);
            console.log(`   Warning at: ${new Date(Date.now() + (this.freeTrialTime - this.warningTime)).toLocaleString()}`);
            console.log(`   Auto-disconnect at: ${new Date(Date.now() + this.freeTrialTime).toLocaleString()}`);

            // Clear any old extended time
            this.connectionExtendedUntil = null;
            this.clearSavedExtensionTime();

            // Set warning timer (2 minutes before disconnect)
            this.warningTimer = setTimeout(() => {
                console.log('⚠️ Warning timer triggered - 2 minutes until auto-disconnect');
                this.handleWarningNotification();
            }, this.freeTrialTime - this.warningTime);

            // Set main timer for auto-disconnect (10 minutes total)
            this.connectionTimer = setTimeout(() => {
                console.log('🔌 Free trial expired - forcing auto-disconnect');
                this.handleTrialExpired();
            }, this.freeTrialTime);

            return {
                success: true,
                freeTrialTime: this.freeTrialTime,
                warningTime: this.warningTime,
                startTime: this.connectionStartTime,
                phase: 'free_trial'
            };
        }
    }

    /**
     * Stop connection timer when proxy disconnects
     */
    stopConnectionTimer() {
        if (this.connectionTimer) {
            clearTimeout(this.connectionTimer);
            this.connectionTimer = null;
        }
        
        if (this.warningTimer) {
            clearTimeout(this.warningTimer);
            this.warningTimer = null;
        }

        this.isConnected = false;
        this.connectionStartTime = null;
        // Don't clear connectionExtendedUntil here - keep it for next connection
        // this.connectionExtendedUntil = null;
        
        console.log('⏹️ Connection timer stopped (extended time preserved)');
    }

    /**
     * Handle warning notification (2 minutes before disconnect)
     */
    async handleWarningNotification() {
        console.log('⚠️ Warning: 2 minutes until auto-disconnect');

        // Notify the renderer process about upcoming disconnect
        if (this.onTimeExpired) {
            this.onTimeExpired({
                type: 'warning_notification',
                message: 'Your free trial will end in 2 minutes. Complete a shortened URL visit to extend your connection.',
                timeRemaining: this.warningTime,
                action: 'warning_only'
            });
        }
    }

    /**
     * Handle trial expiration - force disconnect after 10 minutes
     */
    async handleTrialExpired() {
        console.log('🔌 Free trial expired - forcing auto-disconnect');
        console.log('⏰ Total connection time: 10 minutes (free trial limit)');
        console.log('🕐 Current time:', new Date().toLocaleString());
        console.log('🔗 Connection started at:', new Date(this.connectionStartTime).toLocaleString());

        // Clear all timers
        if (this.connectionTimer) {
            clearTimeout(this.connectionTimer);
            this.connectionTimer = null;
            console.log('✅ Connection timer cleared');
        }

        if (this.warningTimer) {
            clearTimeout(this.warningTimer);
            this.warningTimer = null;
            console.log('✅ Warning timer cleared');
        }

        // Force disconnect immediately
        if (this.onForceDisconnect) {
            console.log('🔌 Calling onForceDisconnect handler...');
            this.onForceDisconnect({
                type: 'trial_expired',
                message: 'Your 10-minute free trial has ended. Complete a shortened URL visit to extend your connection.',
                reason: 'free_trial_expired',
                totalTime: '10 minutes',
                action: 'force_disconnect'
            });
        } else {
            console.error('❌ onForceDisconnect handler not set! Cannot force disconnect.');

            // Fallback: Try to force disconnect using system commands
            try {
                const { exec } = require('child_process');
                const { promisify } = require('util');
                const execAsync = promisify(exec);

                console.log('🔧 Attempting fallback disconnect...');

                // Kill tun2socks process
                console.log('🔧 Killing tun2socks process...');
                await execAsync('taskkill /F /IM tun2socks.exe').catch((err) => {
                    console.log('ℹ️ tun2socks process not found or already stopped');
                });

                // Remove TUN interface
                console.log('🔧 Removing TUN interface...');
                await execAsync('netsh interface delete interface "SP5ProxyTun"').catch((err) => {
                    console.log('ℹ️ TUN interface not found or already removed');
                });

                // Reset DNS settings
                console.log('🔧 Resetting DNS settings...');
                await execAsync('netsh interface ip set dns "Local Area Connection" dhcp').catch(() => {});
                await execAsync('netsh interface ip set dns "Wi-Fi" dhcp').catch(() => {});
                await execAsync('netsh interface ip set dns "Ethernet" dhcp').catch(() => {});

                // Reset routing table
                console.log('🔧 Resetting routing table...');
                await execAsync('route delete 0.0.0.0').catch(() => {});

                console.log('✅ Fallback disconnect completed');

            } catch (fallbackError) {
                console.error('❌ Fallback disconnect failed:', fallbackError.message);
            }
        }
    }

    /**
     * Start URL extension process (Direct URL redirection)
     */
    async startUrlExtension() {
        try {
            console.log('🔗 Starting URL extension process...');

            // Check internet connection first
            if (!this.internetConnectionStatus) {
                return this.showInternetConnectionError();
            }

            // Start URL extension with the URL extension manager
            if (this.urlExtensionManager) {
                const result = await this.urlExtensionManager.startExtension(this.userId);

                if (result.success) {
                    console.log('✅ URL extension started successfully');
                    return {
                        success: true,
                        sessionId: result.sessionId,
                        redirectUrl: result.redirectUrl,
                        message: 'Extension process started. Please complete the task in your browser.'
                    };
                } else {
                    console.error('❌ URL extension failed:', result.message);
                    return this.showUrlExtensionError(result.message);
                }
            } else {
                console.error('❌ URL Extension Manager not available');
                return this.showUrlExtensionError('URL extension system not initialized');
            }

        } catch (error) {
            console.error('❌ Failed to start URL extension:', error.message);
            return this.showUrlExtensionError(error.message);
        }
    }

    /**
     * Legacy method for backward compatibility
     */
    async startWebViewExtension() {
        console.log('⚠️ WebView extension method called - redirecting to URL extension');
        return this.startUrlExtension();
    }

    /**
     * Build target URL for URL shortening services
     */
    buildTargetUrl(sessionId, selectedService) {
        // Build the target landing page URL with session ID
        const targetUrl = `${this.targetLandingPageUrl}?id=${sessionId}&source=${encodeURIComponent(selectedService.name)}`;

        console.log(`🎯 Target URL for shortening: ${targetUrl}`);
        return targetUrl;
    }

    /**
     * Generate session ID for WebView extension
     */
    generateSessionId() {
        return 'S' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5).toUpperCase();
    }

    /**
     * Set URL Extension Manager reference
     */
    setUrlExtensionManager(urlExtensionManager) {
        this.urlExtensionManager = urlExtensionManager;
        console.log('🔗 URL Extension Manager connected to Monetization Manager');
    }

    /**
     * Handle successful URL extension completion
     */
    async handleUrlExtensionSuccess(sessionId, userId) {
        try {
            console.log(`✅ URL extension completed successfully: ${sessionId}`);

            // Extend connection time by 6 hours (updated from 4 hours)
            const extensionResult = this.extendConnection(6);

            if (extensionResult.success) {
                console.log('⏰ Connection extended by 6 hours via URL completion');
                return {
                    success: true,
                    message: 'Extension completed! You now have 6 additional hours.',
                    extensionHours: 6
                };
            } else {
                console.error('❌ Failed to extend connection time');
                return {
                    success: false,
                    message: 'Extension completed but failed to add time'
                };
            }
        } catch (error) {
            console.error('❌ Error handling URL extension success:', error);
            return {
                success: false,
                message: 'Extension completed but an error occurred'
            };
        }
    }

    /**
     * Handle successful WebView extension completion (legacy)
     */
    async handleWebViewExtensionSuccess(sessionId) {
        try {
            console.log(`✅ WebView extension completed successfully: ${sessionId}`);

            // Extend connection time by 4 hours
            const extensionResult = this.extendConnection();

            if (extensionResult.success) {
                console.log('⏰ Connection extended by 4 hours via WebView completion');

                // Store completion in database for tracking
                if (this.databaseManager) {
                    try {
                        await this.databaseManager.connection.run(
                            `INSERT INTO extension_completions (user_id, session_id, completion_method, extension_hours, completed_at)
                             VALUES (?, ?, ?, ?, ?)`,
                            [this.userId, sessionId, 'webview', 4, Date.now()]
                        );
                        console.log('💾 WebView extension completion logged');
                    } catch (dbError) {
                        console.warn('⚠️ Failed to log extension completion:', dbError.message);
                    }
                }

                return {
                    success: true,
                    message: 'Connection extended by 4 hours',
                    extensionHours: 4,
                    expiresAt: this.connectionExtendedUntil
                };
            } else {
                console.error('❌ Failed to extend connection after WebView completion');
                return {
                    success: false,
                    message: 'Extension completion detected but failed to extend connection'
                };
            }

        } catch (error) {
            console.error('❌ Failed to handle WebView extension success:', error.message);
            return {
                success: false,
                message: 'Failed to process extension completion'
            };
        }
    }

    /**
     * Check internet connection status
     */
    async checkInternetConnection() {
        try {
            const response = await axios.get('https://www.google.com', { timeout: 5000 });
            this.internetConnectionStatus = true;
            return true;
        } catch (error) {
            this.internetConnectionStatus = false;
            return false;
        }
    }

    /**
     * Show internet connection error
     */
    showInternetConnectionError() {
        return {
            success: false,
            error: 'NO_INTERNET_CONNECTION',
            message: 'Internet connection lost. Please check your connection and try again.',
            action: 'check_connection'
        };
    }

    /**
     * Show URL extension error
     */
    showUrlExtensionError(errorMessage) {
        return {
            success: false,
            error: 'URL_EXTENSION_FAILED',
            message: `URL extension failed: ${errorMessage}`,
            action: 'retry_later'
        };
    }

    /**
     * Show WebView extension error (legacy)
     */
    showWebViewExtensionError(errorMessage) {
        return {
            success: false,
            error: 'WEBVIEW_EXTENSION_FAILED',
            message: `WebView extension failed: ${errorMessage}`,
            action: 'retry_later'
        };
    }

    /**
     * Show error when no active services available
     */
    showNoActiveServicesError() {
        return {
            success: false,
            error: 'NO_ACTIVE_SERVICES',
            message: 'No active URL shortening services available. Please contact administrator.',
            action: 'contact_admin'
        };
    }

    /**
     * Show URL generation error
     */
    showUrlGenerationError(errorMessage) {
        return {
            success: false,
            error: 'URL_GENERATION_FAILED',
            message: `Failed to generate extension URL: ${errorMessage}`,
            action: 'retry_later'
        };
    }

    /**
     * Ensure code server is running
     */
    async ensureCodeServerRunning() {
        try {
            const response = await axios.get(`${this.serverUrl}/api/health`, { timeout: 5000 });
            if (response.data.success) {
                console.log('✅ Code server is running');
                return true;
            }
        } catch (error) {
            console.log('⚠️ Code server not responding, will attempt to start...');
            return false;
        }
    }

    /**
     * Start the code server
     */
    async startCodeServer() {
        try {
            console.log('🚀 Starting SP5Proxy code server...');
            
            // Try to start the server using Node.js
            const { spawn } = require('child_process');
            const serverProcess = spawn('node', ['server/code-generator.js'], {
                detached: true,
                stdio: 'ignore'
            });
            
            serverProcess.unref();
            
            // Wait a moment for server to start
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Check if server is now running
            return await this.ensureCodeServerRunning();
        } catch (error) {
            console.error('❌ Failed to start code server:', error);
            return false;
        }
    }

    /**
     * Show server connection error instead of fake URL
     */
    showServerConnectionError() {
        console.error('❌ Cannot connect to code server - no fake URLs will be generated');
        
        return {
            success: false,
            error: 'CODE_SERVER_OFFLINE',
            message: 'Code server is offline. Please ensure the SP5Proxy code server is running on port 3001.',
            instructions: [
                '1. Open terminal in project directory',
                '2. Run: cd server',
                '3. Run: node code-generator.js',
                '4. Try generating URL again'
            ]
        };
    }

    /**
     * Fallback code generation - REMOVED FAKE URLs
     */
    async generateFallbackCode() {
        console.log('❌ Fallback code generation disabled - no fake URLs');
        
        return {
            success: false,
            error: 'NO_FALLBACK',
            message: 'Real code server required. Fake URLs have been disabled.',
            instructions: [
                'Please start the real code server:',
                '1. cd server',
                '2. node code-generator.js',
                '3. Try again'
            ]
        };
    }

    /**
     * Open shortened URL in browser
     */
    async openShortenedUrl(urlData) {
        try {
            console.log(`🌐 Opening shortened URL: ${urlData.url}`);
            await shell.openExternal(urlData.url);
            
            return {
                success: true,
                message: 'URL opened in browser. Please complete the process and return with your code.'
            };
        } catch (error) {
            console.error('❌ Failed to open URL:', error);
            return {
                success: false,
                message: 'Failed to open URL in browser'
            };
        }
    }

    /**
     * Validate extension code with security checks
     */
    async validateExtensionCode(code, providedToken = null) {
        console.log('⚠️ DEPRECATED: OTP code validation called - SP5Proxy now uses WebView-based automatic validation');
        return {
            success: false,
            message: 'OTP code system has been replaced with automatic WebView validation. Please use the extension button instead.',
            deprecated: true,
            useWebViewInstead: true
        };
    }

    /**
     * Validate fallback codes when server is unavailable
     */
    validateFallbackCode(code) {
        // Simple fallback validation - accept any 8-character hex code
        const hexPattern = /^[A-F0-9]{8}$/i;
        return hexPattern.test(code.trim());
    }

    /**
     * Extend connection time by specified hours (default 6 hours)
     */
    extendConnection(hours = 6) {
        // Clear existing timers
        if (this.connectionTimer) {
            clearTimeout(this.connectionTimer);
            this.connectionTimer = null;
        }

        if (this.warningTimer) {
            clearTimeout(this.warningTimer);
            this.warningTimer = null;
        }

        // Calculate extension time in milliseconds
        const extensionTimeMs = hours * 60 * 60 * 1000; // hours to milliseconds

        // If user already has extended time, add to it; otherwise set new time
        if (this.connectionExtendedUntil && this.connectionExtendedUntil > Date.now()) {
            // Add to existing extended time
            this.connectionExtendedUntil += extensionTimeMs;
            console.log(`⏰ Added ${hours} more hours to existing extension`);
        } else {
            // Set new expiration time
            this.connectionExtendedUntil = Date.now() + extensionTimeMs;
            console.log(`⏰ Connection extended by ${hours} hours`);
        }

        console.log(`   New expiration time: ${new Date(this.connectionExtendedUntil).toLocaleString()}`);

        // Save extended time persistently
        this.saveExtensionTime();

        // Calculate remaining time for timers
        const remainingTime = this.connectionExtendedUntil - Date.now();

        // Set warning timer for extension (2 minutes before expiration)
        const warningTime = Math.max(0, remainingTime - this.warningTime);
        this.warningTimer = setTimeout(() => {
            console.log('⚠️ Extension warning: 2 minutes until expiration');
            this.handleExtensionWarning();
        }, warningTime);

        // Set main timer for extension expiration
        this.connectionTimer = setTimeout(() => {
            this.handleExtensionTimeExpired();
        }, remainingTime);

        return {
            success: true,
            extendedUntil: this.connectionExtendedUntil,
            remainingTime: remainingTime,
            addedHours: hours
        };
    }

    /**
     * Save extended time to file for persistence
     */
    saveExtensionTime() {
        try {
            const fs = require('fs');
            const path = require('path');
            
            const extensionData = {
                userId: this.userId,
                extendedUntil: this.connectionExtendedUntil,
                savedAt: Date.now()
            };
            
            const dataDir = path.join(__dirname, '..', 'data');
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            
            const filePath = path.join(dataDir, `extension-time-${this.userId}.json`);
            fs.writeFileSync(filePath, JSON.stringify(extensionData, null, 2));
            
            console.log(`💾 Extension time saved: ${new Date(this.connectionExtendedUntil).toLocaleString()}`);
        } catch (error) {
            console.error('❌ Failed to save extension time:', error);
        }
    }

    /**
     * Load saved extended time from file
     */
    loadSavedExtensionTime() {
        try {
            const fs = require('fs');
            const path = require('path');
            
            const filePath = path.join(__dirname, '..', 'data', `extension-time-${this.userId}.json`);
            
            if (fs.existsSync(filePath)) {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                
                if (data.userId === this.userId && data.extendedUntil) {
                    this.connectionExtendedUntil = data.extendedUntil;
                    console.log(`📂 Loaded saved extension time: ${new Date(this.connectionExtendedUntil).toLocaleString()}`);
                }
            }
        } catch (error) {
            console.error('❌ Failed to load extension time:', error);
            this.connectionExtendedUntil = null;
        }
    }

    /**
     * Clear saved extension time
     */
    clearSavedExtensionTime() {
        try {
            const fs = require('fs');
            const path = require('path');
            
            const filePath = path.join(__dirname, '..', 'data', `extension-time-${this.userId}.json`);
            
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log('🗑️ Cleared saved extension time');
            }
        } catch (error) {
            console.error('❌ Failed to clear extension time:', error);
        }
    }

    /**
     * Handle extension warning (2 minutes before extension expires)
     */
    async handleExtensionWarning() {
        console.log('⚠️ Extension warning: 2 minutes until expiration');

        // Notify the renderer process about upcoming extension expiration
        if (this.onTimeExpired) {
            this.onTimeExpired({
                type: 'extension_warning',
                message: 'Your 4-hour extension will expire in 2 minutes. Complete another shortened URL visit to extend further.',
                timeRemaining: this.warningTime,
                action: 'warning_only'
            });
        }
    }

    /**
     * Handle 4-hour extension expiration
     */
    async handleExtensionTimeExpired() {
        console.log('🔌 Extension expired - forcing auto-disconnect');
        console.log('🕐 Current time:', new Date().toLocaleString());
        console.log('🔗 Extension expired at:', new Date(this.connectionExtendedUntil).toLocaleString());

        // Clear all timers
        if (this.connectionTimer) {
            clearTimeout(this.connectionTimer);
            this.connectionTimer = null;
        }

        if (this.warningTimer) {
            clearTimeout(this.warningTimer);
            this.warningTimer = null;
        }

        // Clear saved extension time since it expired
        this.clearSavedExtensionTime();
        this.connectionExtendedUntil = null;

        // Force disconnect immediately
        if (this.onForceDisconnect) {
            console.log('🔌 Calling onForceDisconnect handler for extension expiration...');
            this.onForceDisconnect({
                type: 'extension_expired',
                message: 'Your 4-hour extension has expired. Complete another shortened URL visit to extend your connection.',
                reason: 'extension_expired',
                totalTime: '4 hours',
                action: 'force_disconnect'
            });
        } else {
            console.error('❌ onForceDisconnect handler not set! Cannot force disconnect.');

            // Use the same fallback disconnect logic
            try {
                const { exec } = require('child_process');
                const { promisify } = require('util');
                const execAsync = promisify(exec);

                console.log('🔧 Attempting fallback disconnect for extension expiration...');

                // Kill tun2socks process
                await execAsync('taskkill /F /IM tun2socks.exe').catch(() => {});

                // Remove TUN interface
                await execAsync('netsh interface delete interface "SP5ProxyTun"').catch(() => {});

                // Reset DNS and routing
                await execAsync('netsh interface ip set dns "Local Area Connection" dhcp').catch(() => {});
                await execAsync('netsh interface ip set dns "Wi-Fi" dhcp').catch(() => {});
                await execAsync('netsh interface ip set dns "Ethernet" dhcp').catch(() => {});
                await execAsync('route delete 0.0.0.0').catch(() => {});

                console.log('✅ Fallback disconnect completed for extension expiration');

            } catch (fallbackError) {
                console.error('❌ Fallback disconnect failed for extension expiration:', fallbackError.message);
            }
        }
    }

    /**
     * Get current connection status
     */
    getConnectionStatus() {
        if (!this.isConnected) {
            return {
                connected: false,
                timeRemaining: 0,
                phase: 'disconnected'
            };
        }

        const now = Date.now();
        let timeRemaining = 0;
        let phase = 'free_trial';

        if (this.connectionExtendedUntil) {
            // In extended period (4-hour extension)
            timeRemaining = Math.max(0, this.connectionExtendedUntil - now);
            phase = 'extended';
        } else if (this.connectionStartTime) {
            // In free trial period (10 minutes)
            const trialExpiry = this.connectionStartTime + this.freeTrialTime;
            timeRemaining = Math.max(0, trialExpiry - now);
            phase = 'free_trial';
        }

        return {
            connected: true,
            timeRemaining,
            phase,
            startTime: this.connectionStartTime,
            extendedUntil: this.connectionExtendedUntil,
            freeTrialTime: this.freeTrialTime
        };
    }

    /**
     * Set event handlers
     */
    setEventHandlers(handlers) {
        this.onTimeExpired = handlers.onTimeExpired;
        this.onForceDisconnect = handlers.onForceDisconnect;
    }

    /**
     * Get monetization status
     */
    getStatus() {
        return {
            userId: this.userId,
            isConnected: this.isConnected,
            connectionStatus: this.getConnectionStatus(),
            serverUrl: this.serverUrl,
            availableServices: this.urlServices
        };
    }

    /**
     * Set database manager for sync
     */
    setDatabaseManager(databaseManager) {
        this.databaseManager = databaseManager;
        this.syncUrlServicesFromDatabase();

        // Listen for real-time URL service updates
        this.databaseManager.on('urlServiceUpdated', (data) => {
            console.log('🔄 URL service updated:', data);
            this.syncUrlServicesFromDatabase();
        });

        this.databaseManager.on('urlServiceAdded', (data) => {
            console.log('🔄 URL service added:', data);
            this.syncUrlServicesFromDatabase();
        });

        this.databaseManager.on('urlServiceDeleted', (data) => {
            console.log('🔄 URL service deleted:', data);
            this.syncUrlServicesFromDatabase();
        });
    }

    /**
     * Sync URL services from database
     */
    async syncUrlServicesFromDatabase() {
        if (!this.databaseManager) return;

        try {
            const services = await this.databaseManager.getUrlServices();
            this.adminUrls = services.map(service => ({
                id: service.id,
                url: service.base_url,
                active: service.is_active,
                name: service.name,
                priority: service.priority,
                api_endpoint: service.api_endpoint,
                api_key: service.api_key,
                success_rate: service.success_rate
            }));

            // Update urlServices array for backward compatibility  
            this.urlServices = services
                .filter(service => service.is_active)
                .map(service => service.name.toLowerCase().replace(/\s+/g, ''));
                // No sorting - random selection will handle order

            console.log('✅ URL services synced from database:', this.urlServices);
        } catch (error) {
            console.error('❌ Failed to sync URL services from database:', error);
        }
    }

    /**
     * Admin URL Management Methods
     */
    getAdminUrls() {
        return this.adminUrls;
    }

    async addAdminUrl(url) {
        try {
            if (this.databaseManager) {
                // Add to database
                const id = await this.databaseManager.connection.execute(
                    'INSERT INTO url_services (name, url, base_url, is_active, priority) VALUES (?, ?, ?, ?, ?)',
                    [url.split('//')[1] || url, url.trim(), url.trim(), true, this.adminUrls.length + 1]
                );

                const newUrl = {
                    id: id[0].insertId,
                    url: url.trim(),
                    active: true
                };

                await this.syncUrlServicesFromDatabase();
                console.log(`✅ Added admin URL to database: ${url}`);
                return { success: true, url: newUrl };
            } else {
                // Fallback to local storage
                const newUrl = {
                    id: Date.now(),
                    url: url.trim(),
                    active: true
                };
                this.adminUrls.push(newUrl);
                console.log(`✅ Added admin URL locally: ${url}`);
                return { success: true, url: newUrl };
            }
        } catch (error) {
            console.error('❌ Failed to add admin URL:', error);
            return { success: false, message: error.message };
        }
    }

    async removeAdminUrl(id) {
        try {
            const index = this.adminUrls.findIndex(url => url.id === id);
            if (index !== -1) {
                const removedUrl = this.adminUrls.splice(index, 1)[0];
                console.log(`✅ Removed admin URL: ${removedUrl.url}`);
                return { success: true, removedUrl };
            } else {
                return { success: false, message: 'URL not found' };
            }
        } catch (error) {
            console.error('❌ Failed to remove admin URL:', error);
            return { success: false, message: error.message };
        }
    }

    async toggleAdminUrl(id) {
        try {
            if (this.databaseManager) {
                // Update in database
                const url = this.adminUrls.find(url => url.id === id);
                if (url) {
                    const newStatus = !url.active;
                    await this.databaseManager.updateUrlService(id, { is_active: newStatus });
                    await this.syncUrlServicesFromDatabase();
                    console.log(`✅ Toggled admin URL in database ${url.url}: ${newStatus ? 'active' : 'inactive'}`);
                    return { success: true, url: { ...url, active: newStatus } };
                } else {
                    return { success: false, message: 'URL not found' };
                }
            } else {
                // Fallback to local storage
                const url = this.adminUrls.find(url => url.id === id);
                if (url) {
                    url.active = !url.active;
                    console.log(`✅ Toggled admin URL locally ${url.url}: ${url.active ? 'active' : 'inactive'}`);
                    return { success: true, url };
                } else {
                    return { success: false, message: 'URL not found' };
                }
            }
        } catch (error) {
            console.error('❌ Failed to toggle admin URL:', error);
            return { success: false, message: error.message };
        }
    }
}

module.exports = MonetizationManager;
