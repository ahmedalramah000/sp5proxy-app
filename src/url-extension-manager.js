const { shell, net, BrowserWindow } = require('electron');
const path = require('path');
const UrlCompletionTracker = require('./url-completion-tracker');

// Helper function to replace node-fetch with Electron's net module
function electronFetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        const request = net.request({
            method: options.method || 'GET',
            url: url,
            headers: options.headers || {}
        });

        if (options.body) {
            request.write(options.body);
        }

        request.on('response', (response) => {
            let data = '';
            response.on('data', (chunk) => {
                data += chunk;
            });
            response.on('end', () => {
                resolve({
                    ok: response.statusCode >= 200 && response.statusCode < 300,
                    status: response.statusCode,
                    json: () => Promise.resolve(JSON.parse(data)),
                    text: () => Promise.resolve(data)
                });
            });
        });

        request.on('error', reject);
        request.end();
    });
}

/**
 * SP5Proxy URL Extension Manager
 * Handles URL-based extension system with automatic tracking
 * Replaces the WebView extension system with direct URL redirection
 */
class UrlExtensionManager {
    constructor(databaseManager) {
        this.databaseManager = databaseManager;
        this.extensionWindows = new Map();
        this.monetizationManager = null;
        this.activeExtensions = new Map(); // Track active extension sessions
        this.completionTracker = new UrlCompletionTracker(databaseManager);
        this.adminPanelUrl = 'http://127.0.0.1:3000'; // Admin panel URL for API calls
        this.navigationTimers = new Map(); // Debounce timers for navigation events
        this.lastCheckedUrls = new Map(); // Track last checked URLs to avoid duplicates

        // Short Jambo API Configuration
        this.shortJamboConfig = {
            apiToken: '6420adfaff1f094ed7a472823506f4b7ffc52522',
            apiUrl: 'https://short-jambo.com/api',
            destinationUrl: 'https://sp5proxies.com/home.php', // Updated to exact URL
            enabled: true,
            aliasPrefix: 'SP5_' // Prefix for custom aliases
        };
        
        // Track used aliases to prevent duplicates
        this.usedAliases = new Set();
        
        // Initialize default config if not set
        if (!this.shortJamboConfig.aliasPrefix) {
            this.shortJamboConfig.aliasPrefix = 'SP5_';
        }
        
        // Advanced anti-detection system
        this.antiDetectionConfig = {
            // Randomize these values for each session
            userAgents: [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
            ],
            // Screen resolutions to randomize
            screenResolutions: [
                { width: 1920, height: 1080 },
                { width: 1366, height: 768 },
                { width: 1440, height: 900 },
                { width: 1536, height: 864 },
                { width: 1600, height: 900 },
                { width: 2560, height: 1440 }
            ],
            // Languages to randomize
            languages: [
                'en-US,en;q=0.9',
                'en-GB,en;q=0.9',
                'es-ES,es;q=0.9',
                'fr-FR,fr;q=0.9',
                'de-DE,de;q=0.9',
                'ar-SA,ar;q=0.9'
            ],
            // Timezone offsets
            timezones: [
                'America/New_York',
                'Europe/London', 
                'Europe/Paris',
                'Asia/Tokyo',
                'Australia/Sydney',
                'America/Los_Angeles'
            ]
        };

        console.log('🔧 URL Extension Manager initialized with advanced anti-detection');
        console.log('✅ Embedded WebView extension system enabled');
        console.log('🔍 URL Completion Tracker integrated');
        console.log('🎭 Advanced fingerprint spoofing enabled');
        console.log('🛡️ Multi-layer anti-detection system active');
    }

    /**
     * Generate random fingerprint for anti-detection
     */
    generateRandomFingerprint() {
        const config = this.antiDetectionConfig;
        
        return {
            userAgent: config.userAgents[Math.floor(Math.random() * config.userAgents.length)],
            screen: config.screenResolutions[Math.floor(Math.random() * config.screenResolutions.length)],
            language: config.languages[Math.floor(Math.random() * config.languages.length)],
            timezone: config.timezones[Math.floor(Math.random() * config.timezones.length)],
            cookieId: this.generateRandomString(32),
            sessionId: this.generateRandomString(16),
            deviceId: this.generateRandomString(24),
            canvasFingerprint: this.generateRandomString(64)
        };
    }

    /**
     * Generate random string for IDs
     */
    generateRandomString(length) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * Apply advanced anti-detection measures to bypass tracking
     */
    async applyAntiDetectionMeasures(extensionWindow, fingerprint) {
        console.log('🛡️ Applying advanced anti-detection measures...');

        // Wait for the DOM to be ready
        extensionWindow.webContents.once('dom-ready', () => {
            // Inject fingerprint spoofing script
            const antiDetectionScript = `
                (function() {
                    console.log('🎭 Anti-detection script activated');
                    
                    // Spoof screen properties
                    Object.defineProperty(screen, 'width', {
                        get: function() { return ${fingerprint.screen.width}; }
                    });
                    Object.defineProperty(screen, 'height', {
                        get: function() { return ${fingerprint.screen.height}; }
                    });
                    Object.defineProperty(screen, 'availWidth', {
                        get: function() { return ${fingerprint.screen.width}; }
                    });
                    Object.defineProperty(screen, 'availHeight', {
                        get: function() { return ${fingerprint.screen.height - 40}; }
                    });

                    // Spoof navigator properties
                    Object.defineProperty(navigator, 'userAgent', {
                        get: function() { return '${fingerprint.userAgent}'; }
                    });
                    Object.defineProperty(navigator, 'language', {
                        get: function() { return '${fingerprint.language.split(',')[0]}'; }
                    });
                    Object.defineProperty(navigator, 'languages', {
                        get: function() { return ['${fingerprint.language.split(',')[0]}', 'en']; }
                    });

                    // Spoof timezone safely
                    try {
                        const originalDate = window.Date;
                        const CustomDate = function(...args) {
                            if (args.length === 0) {
                                const date = new originalDate();
                                // Randomize timezone offset slightly
                                const randomOffset = (Math.random() - 0.5) * 120; // ±1 hour variation
                                date.getTimezoneOffset = function() { return 300 + randomOffset; }; // Varies around EST
                                return date;
                            }
                            return new originalDate(...args);
                        };
                        CustomDate.prototype = originalDate.prototype;
                        CustomDate.now = originalDate.now;
                        CustomDate.parse = originalDate.parse;
                        CustomDate.UTC = originalDate.UTC;
                        
                        // Only override if possible
                        if (typeof window.Date !== 'undefined') {
                            window.Date = CustomDate;
                        }
                    } catch (dateError) {
                        console.log('Date spoofing failed (normal):', dateError.message);
                    }

                    // Spoof WebGL fingerprint (if exists)
                    const getParameter = WebGLRenderingContext.prototype.getParameter;
                    WebGLRenderingContext.prototype.getParameter = function(parameter) {
                        if (parameter === 37445) { // UNMASKED_VENDOR_WEBGL
                            return 'Intel Inc.';
                        }
                        if (parameter === 37446) { // UNMASKED_RENDERER_WEBGL
                            return 'Intel Iris OpenGL Engine';
                        }
                        return getParameter.call(this, parameter);
                    };

                    // Spoof Canvas fingerprint
                    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
                    HTMLCanvasElement.prototype.toDataURL = function() {
                        // Add random noise to canvas fingerprint
                        const ctx = this.getContext('2d');
                        if (ctx) {
                            const imageData = ctx.getImageData(0, 0, this.width, this.height);
                            for (let i = 0; i < imageData.data.length; i += 4) {
                                imageData.data[i] += Math.floor(Math.random() * 3) - 1;
                                imageData.data[i + 1] += Math.floor(Math.random() * 3) - 1;
                                imageData.data[i + 2] += Math.floor(Math.random() * 3) - 1;
                            }
                            ctx.putImageData(imageData, 0, 0);
                        }
                        return originalToDataURL.apply(this, arguments);
                    };

                    // Spoof AudioContext fingerprint
                    if (window.AudioContext || window.webkitAudioContext) {
                        const OriginalAudioContext = window.AudioContext || window.webkitAudioContext;
                        window.AudioContext = function() {
                            const ctx = new OriginalAudioContext();
                            const originalCreateOscillator = ctx.createOscillator;
                            ctx.createOscillator = function() {
                                const oscillator = originalCreateOscillator.call(this);
                                const originalStart = oscillator.start;
                                oscillator.start = function() {
                                    // Add slight random frequency variation
                                    oscillator.frequency.value += (Math.random() - 0.5) * 0.01;
                                    return originalStart.apply(this, arguments);
                                };
                                return oscillator;
                            };
                            return ctx;
                        };
                    }

                    // Randomize device memory if available
                    if (navigator.deviceMemory) {
                        Object.defineProperty(navigator, 'deviceMemory', {
                            get: function() { return [4, 8, 16][Math.floor(Math.random() * 3)]; }
                        });
                    }

                    // Spoof hardware concurrency
                    Object.defineProperty(navigator, 'hardwareConcurrency', {
                        get: function() { return [4, 8, 12][Math.floor(Math.random() * 3)]; }
                    });

                    // Clear existing fingerprints and tracking
                    try {
                        // Clear localStorage
                        localStorage.clear();
                        sessionStorage.clear();
                        
                        // Clear cookies (as much as possible)
                        document.cookie.split(";").forEach(function(c) {
                            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
                        });

                        // Clear IndexedDB
                        if (window.indexedDB) {
                            window.indexedDB.databases().then(databases => {
                                databases.forEach(db => {
                                    window.indexedDB.deleteDatabase(db.name);
                                });
                            });
                        }
                    } catch (e) {
                        console.log('Some cleanup failed (normal):', e.message);
                    }

                    // Override common tracking properties
                    Object.defineProperty(window, 'devicePixelRatio', {
                        get: function() { return 1 + (Math.random() * 0.5); }
                    });

                    // Set new fake tracking IDs
                    localStorage.setItem('sp5_device_id', '${fingerprint.deviceId}');
                    localStorage.setItem('sp5_session_id', '${fingerprint.sessionId}');
                    localStorage.setItem('sp5_cookie_id', '${fingerprint.cookieId}');
                    
                    // Set fake visitor ID for tracking systems
                    localStorage.setItem('visitor_id', '${fingerprint.deviceId}');
                    localStorage.setItem('user_id', '${fingerprint.cookieId}');
                    localStorage.setItem('session_token', '${fingerprint.sessionId}');

                    console.log('✅ Anti-detection measures applied successfully');
                })();
            `;

            // Execute the anti-detection script
            extensionWindow.webContents.executeJavaScript(antiDetectionScript)
                .then(() => {
                    console.log('✅ Anti-detection script executed successfully');
                })
                .catch(error => {
                    console.warn('⚠️ Some anti-detection measures failed (normal):', error.message);
                });
        });

        // Set custom headers for requests
        extensionWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
            const headers = details.requestHeaders;
            
            // Randomize headers to avoid detection
            headers['Accept-Language'] = fingerprint.language;
            headers['User-Agent'] = fingerprint.userAgent;
            
            // Add realistic headers
            headers['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8';
            headers['Accept-Encoding'] = 'gzip, deflate, br';
            headers['DNT'] = Math.random() > 0.5 ? '1' : '0';
            headers['Upgrade-Insecure-Requests'] = '1';
            headers['Sec-Fetch-Dest'] = 'document';
            headers['Sec-Fetch-Mode'] = 'navigate';
            headers['Sec-Fetch-Site'] = 'none';
            
            // Remove identifying headers
            delete headers['X-SP5-Session'];
            delete headers['X-SP5-User'];
            delete headers['SP5Proxy'];

            callback({ requestHeaders: headers });
        });

        console.log('🛡️ Advanced anti-detection measures applied');
    }

    /**
     * Create shortened URL using Short Jambo API with enhanced completion tracking
     */
    async createShortenedUrl(sessionId, userId) {
        try {
            if (!this.shortJamboConfig.enabled) {
                console.log('🔗 Short Jambo API disabled, using default URL');
                return this.shortJamboConfig.destinationUrl;
            }

            console.log(`🔗 Creating shortened URL for session: ${sessionId}`);
            
            // Generate guaranteed unique alias for this session
            let alias;
            try {
                alias = this.generateUniqueAlias(sessionId, userId);
                if (!alias || alias.length === 0) {
                    throw new Error('Generated alias is empty');
                }
            } catch (aliasError) {
                console.error('❌ Alias generation failed:', aliasError);
                // Fallback to simple timestamp-based alias
                alias = `SP5_${sessionId}_${userId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
                console.log(`🔄 Using fallback alias: ${alias}`);
            }
            
            // Create enhanced destination URL with completion tracking
            const enhancedDestinationUrl = this.createTrackingUrl(sessionId, userId);
            
            // Prepare API request URL
            const apiUrl = new URL(this.shortJamboConfig.apiUrl);
            apiUrl.searchParams.set('api', this.shortJamboConfig.apiToken);
            apiUrl.searchParams.set('url', enhancedDestinationUrl);
            apiUrl.searchParams.set('alias', alias);
            apiUrl.searchParams.set('format', 'json');

            console.log(`📡 Short Jambo API Request: ${apiUrl.toString()}`);
            console.log(`🎯 Enhanced destination URL: ${enhancedDestinationUrl}`);

            // Make API request
            const response = await electronFetch(apiUrl.toString(), {
                method: 'GET',
                headers: {
                    'User-Agent': 'SP5Proxy/1.0'
                },
                timeout: 10000 // 10 seconds timeout
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            console.log(`📊 Short Jambo API Response:`, result);

            if (result.status === 'success' && result.shortenedUrl) {
                console.log(`✅ Shortened URL created: ${result.shortenedUrl}`);
                
                // Start monitoring for completion via API polling
                this.startCompletionMonitoring(sessionId, userId, alias);
                
                return result.shortenedUrl;
            } else if (result.status === 'error') {
                console.error(`❌ Short Jambo API Error: ${result.message}`);
                // Fallback to enhanced destination URL
                return enhancedDestinationUrl;
            } else {
                throw new Error('Invalid API response format');
            }

        } catch (error) {
            console.error(`❌ Failed to create shortened URL for session ${sessionId}:`, error);
            console.log(`🔄 Falling back to enhanced destination URL`);
            
            // Fallback to enhanced destination URL if API fails
            return this.createTrackingUrl(sessionId, userId);
        }
    }

    /**
     * Create enhanced tracking URL for completion detection
     */
    createTrackingUrl(sessionId, userId) {
        const baseUrl = new URL(this.shortJamboConfig.destinationUrl);
        
        // Add tracking parameters
        baseUrl.searchParams.set('sp5_session', sessionId);
        baseUrl.searchParams.set('sp5_user', userId);
        baseUrl.searchParams.set('sp5_timestamp', Date.now());
        baseUrl.searchParams.set('sp5_tracking', 'enabled');
        
        console.log(`🔗 Enhanced tracking URL created: ${baseUrl.toString()}`);
        return baseUrl.toString();
    }

    /**
     * Start monitoring completion via Short Jambo statistics API
     */
    startCompletionMonitoring(sessionId, userId, alias) {
        console.log(`📊 Starting completion monitoring for alias: ${alias}`);
        
        const monitoringInterval = setInterval(async () => {
            try {
                // Check if session is still active
                const extensionData = this.activeExtensions.get(sessionId);
                if (!extensionData || extensionData.status === 'completed' || extensionData.status === 'cancelled') {
                    clearInterval(monitoringInterval);
                    return;
                }

                // Check multiple completion sources
                const completionSources = await Promise.allSettled([
                    this.checkShortJamboClicks(alias),
                    this.checkAdminPanelCompletion(sessionId, userId),
                    this.checkManualCompletion(sessionId)
                ]);

                const hasCompletion = completionSources.some(result => 
                    result.status === 'fulfilled' && result.value === true
                );

                if (hasCompletion) {
                    console.log(`✅ Completion detected for session: ${sessionId}`);
                    await this.handleExtensionCompletion(sessionId, userId);
                    clearInterval(monitoringInterval);
                }

            } catch (error) {
                console.error(`❌ Error in completion monitoring:`, error);
            }
        }, 10000); // Check every 10 seconds

        // Stop monitoring after 20 minutes
        setTimeout(() => {
            clearInterval(monitoringInterval);
            console.log(`⏰ Stopped monitoring for session: ${sessionId} (timeout)`);
        }, 20 * 60 * 1000);
    }

    /**
     * Check if Short Jambo link has clicks (simplified check)
     */
    async checkShortJamboClicks(alias) {
        try {
            // This is a simplified approach - in reality, Short Jambo might not provide
            // a public API to check clicks. We'll use other methods for detection.
            console.log(`🔍 Checking clicks for alias: ${alias}`);
            
            // For now, we'll rely on the admin panel completion tracking
            // which should detect users reaching sp5proxies.com
            return false;
        } catch (error) {
            console.error(`❌ Error checking Short Jambo clicks:`, error);
            return false;
        }
    }

    /**
     * Check admin panel for completion status
     */
    async checkAdminPanelCompletion(sessionId, userId) {
        try {
            console.log(`🔍 Checking admin panel completion for session: ${sessionId}`);
            
            const response = await electronFetch(`${this.adminPanelUrl}/api/url-extension/check-completion`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: sessionId,
                    user_id: userId,
                    check_external: true // Flag to check external completions
                }),
                timeout: 5000
            });

            if (!response.ok) {
                return false;
            }

            const result = await response.json();
            
            if (result.success && result.completed) {
                console.log(`✅ Admin panel confirmed completion for session: ${sessionId}`);
                return true;
            }

            return false;

        } catch (error) {
            console.error(`❌ Error checking admin panel completion:`, error);
            return false;
        }
    }

    /**
     * Check if session was manually completed
     */
    async checkManualCompletion(sessionId) {
        try {
            const extensionData = this.activeExtensions.get(sessionId);
            if (extensionData && extensionData.manuallyCompleted) {
                console.log(`✅ Manual completion detected for session: ${sessionId}`);
                return true;
            }
            return false;
        } catch (error) {
            console.error(`❌ Error checking manual completion:`, error);
            return false;
        }
    }

    /**
     * Mark session as manually completed (for external completions)
     */
    markSessionCompleted(sessionId, userId, source = 'external') {
        try {
            const extensionData = this.activeExtensions.get(sessionId);
            if (extensionData) {
                extensionData.manuallyCompleted = true;
                extensionData.completionSource = source;
                extensionData.completedAt = Date.now();
                this.activeExtensions.set(sessionId, extensionData);
                
                console.log(`✅ Session ${sessionId} marked as completed from ${source}`);
                
                // Trigger completion handling
                this.handleExtensionCompletion(sessionId, userId);
                return true;
            }
            return false;
        } catch (error) {
            console.error(`❌ Error marking session completed:`, error);
            return false;
        }
    }

    /**
     * Generate guaranteed unique alias
     */
    generateUniqueAlias(sessionId, userId) {
        let attempts = 0;
        let alias = '';
        
        do {
            attempts++;
            const timestamp = Date.now();
            const randomSuffix = Math.random().toString(36).substring(2, 8);
            const attemptSuffix = attempts > 1 ? `_${attempts}` : '';
            
            // Generate initial alias
            let candidateAlias = `${this.shortJamboConfig.aliasPrefix}${sessionId}_${userId}_${timestamp}_${randomSuffix}${attemptSuffix}`;
            
            // Ensure alias is not too long (Short Jambo has 30 char limit)
            if (candidateAlias.length > 30) {
                // Shorten by using only last 6 chars of sessionId and userId
                const shortSessionId = sessionId.slice(-6);
                const shortUserId = String(userId).slice(-3);
                const shortTimestamp = String(timestamp).slice(-8); // Last 8 digits
                candidateAlias = `SP5_${shortSessionId}_${shortUserId}_${shortTimestamp}_${randomSuffix}${attemptSuffix}`;
                
                // If still too long, make it even shorter
                if (candidateAlias.length > 30) {
                    candidateAlias = `SP5_${shortTimestamp}_${randomSuffix}${attemptSuffix}`;
                }
            }
            
            if (attempts > 10) {
                // Fallback: use just timestamp and random (ensure under 30 chars)
                const shortTimestamp = String(timestamp).slice(-8);
                const extraRandom = Math.random().toString(36).substring(2, 4);
                candidateAlias = `SP5_${shortTimestamp}_${randomSuffix}_${extraRandom}`;
                
                // Ensure it's under 30 characters
                if (candidateAlias.length > 30) {
                    candidateAlias = `SP5_${shortTimestamp}_${randomSuffix}`;
                }
                
                alias = candidateAlias;
                break;
            }
            
            alias = candidateAlias;
            
        } while (this.usedAliases.has(alias));
        
        // Store the alias to prevent future duplicates
        this.usedAliases.add(alias);
        
        // Clean up old aliases if set gets too large (memory management)
        if (this.usedAliases.size > 1000) {
            console.log(`🧹 Cleaning up old aliases (${this.usedAliases.size} entries)`);
            // Keep only the last 500 aliases by converting to array, slicing, and back to Set
            const aliasArray = Array.from(this.usedAliases);
            this.usedAliases = new Set(aliasArray.slice(-500));
        }
        
        console.log(`🏷️ Generated unique alias: ${alias} (attempt ${attempts})`);
        return alias;
    }

    /**
     * Update Short Jambo configuration
     */
    updateShortJamboConfig(newConfig) {
        this.shortJamboConfig = { ...this.shortJamboConfig, ...newConfig };
        console.log('🔧 Short Jambo configuration updated:', this.shortJamboConfig);
    }

    /**
     * Create simple extension window - guaranteed to work
     */
    async createSimpleExtensionWindow(sessionId, redirectUrl, userId) {
        try {
            console.log(`🖥️ Creating simple extension window for session: ${sessionId}`);

            const extensionWindow = new BrowserWindow({
                width: 1200,
                height: 800,
                minWidth: 800,
                minHeight: 600,
                show: true,
                title: '🌐 SP5Proxy Extension - Navigate manually to complete task',
                icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    webSecurity: false, // Allow for better compatibility
                    allowRunningInsecureContent: true
                }
            });

            // Store the window reference
            this.extensionWindows.set(sessionId, extensionWindow);

            // Load the URL directly
            console.log(`🔗 Loading URL: ${redirectUrl}`);
            await extensionWindow.loadURL(redirectUrl);

            // Simple right-click menu for completion
            extensionWindow.webContents.on('context-menu', (event, params) => {
                const { Menu, MenuItem } = require('electron');
                const menu = new Menu();
                
                menu.append(new MenuItem({
                    label: '✅ Complete Task (if you reached sp5proxies.com)',
                    click: async () => {
                        const { dialog } = require('electron');
                        const currentUrl = extensionWindow.webContents.getURL();
                        
                        const choice = dialog.showMessageBoxSync(extensionWindow, {
                            type: 'question',
                            title: 'Complete Extension Task - Get 6 Hours! 🎉',
                            message: 'Did you successfully reach sp5proxies.com?',
                            detail: `Current URL: ${currentUrl}\n\nTarget: sp5proxies.com\n\n✅ If you reached sp5proxies.com, click "Yes" to:\n   • Complete the extension task\n   • Receive 6 hours of additional connection time\n   • Close this window automatically\n\n❌ If you haven't reached the target yet, click "No" to continue.`,
                            buttons: ['✅ Yes, I reached sp5proxies.com - Give me 6 hours!', '❌ No, I need to continue navigating'],
                            defaultId: 0,
                            cancelId: 1
                        });
                        
                        if (choice === 0) {
                            console.log(`🎉 User manually completing extension for session: ${sessionId}`);
                            
                            try {
                                const result = await this.manuallyCompleteExtension(sessionId, userId);
                                
                                if (result.success) {
                                    // Show success message
                                    dialog.showMessageBoxSync(extensionWindow, {
                                        type: 'info',
                                        title: 'Success! 🎉',
                                        message: 'Extension Task Completed!',
                                        detail: '✅ Congratulations! You have successfully completed the extension task.\n\n🕐 6 hours of additional connection time has been added to your account.\n\n🚪 This window will close automatically.',
                                        buttons: ['Awesome!']
                                    });
                                    
                                    setTimeout(() => {
                                        if (!extensionWindow.isDestroyed()) {
                                            extensionWindow.close();
                                        }
                                    }, 1000);
                                } else {
                                    // Show error
                                    dialog.showErrorBox('Completion Error', `Failed to complete extension: ${result.message}`);
                                }
                            } catch (error) {
                                console.error('❌ Error in manual completion:', error);
                                dialog.showErrorBox('Completion Error', 'An error occurred while completing the extension. Please try again.');
                            }
                        }
                    }
                }));

                menu.append(new MenuItem({ type: 'separator' }));
                
                menu.append(new MenuItem({
                    label: '🔄 Reload Page',
                    click: () => {
                        extensionWindow.webContents.reload();
                    }
                }));
                
                menu.append(new MenuItem({
                    label: '❌ Cancel Task',
                    click: () => {
                        const { dialog } = require('electron');
                        const choice = dialog.showMessageBoxSync(extensionWindow, {
                            type: 'warning',
                            title: 'Cancel Extension Task',
                            message: 'Are you sure you want to cancel?',
                            detail: 'You will not receive the 6 hours of additional time if you cancel now.',
                            buttons: ['Cancel Task', 'Continue Working'],
                            defaultId: 1,
                            cancelId: 1
                        });
                        
                        if (choice === 0) {
                            extensionWindow.close();
                        }
                    }
                }));

                menu.popup();
            });

            // Auto-close after 10 minutes with dialog
            setTimeout(() => {
                if (!extensionWindow.isDestroyed() && this.extensionWindows.has(sessionId)) {
                    console.log(`⏰ Session timeout for ${sessionId} - showing completion dialog`);
                    this.showSimpleTimeoutDialog(sessionId, userId, extensionWindow);
                }
            }, 10 * 60 * 1000); // 10 minutes

            // Set up window event handlers
            extensionWindow.on('closed', () => {
                console.log(`🔒 Extension window closed for session: ${sessionId}`);
                this.extensionWindows.delete(sessionId);
                this.handleWindowClosed(sessionId, userId);
            });

            // Monitor URL changes for completion detection
            extensionWindow.webContents.on('did-navigate', (event, navigationUrl) => {
                console.log(`🧭 Navigation detected: ${navigationUrl}`);
                this.handleUrlNavigation(sessionId, userId, navigationUrl);
            });

            extensionWindow.webContents.on('did-navigate-in-page', (event, navigationUrl) => {
                console.log(`🔄 In-page navigation detected: ${navigationUrl}`);
                this.handleUrlNavigation(sessionId, userId, navigationUrl);
            });

            // Additional tracking events for better completion detection
            extensionWindow.webContents.on('did-finish-load', () => {
                const currentUrl = extensionWindow.webContents.getURL();
                console.log(`📄 Page finished loading: ${currentUrl}`);
                this.handleUrlNavigation(sessionId, userId, currentUrl);
            });

            console.log(`✅ Simple extension window created successfully for session: ${sessionId}`);
            return extensionWindow;

        } catch (error) {
            console.error(`❌ Failed to create simple extension window for session ${sessionId}:`, error);
            return null;
        }
    }

    /**
     * Show simple timeout dialog
     */
    showSimpleTimeoutDialog(sessionId, userId, extensionWindow) {
        try {
            const { dialog } = require('electron');
            
            dialog.showMessageBox(extensionWindow, {
                type: 'question',
                title: 'Extension Task Timeout',
                message: '10 minutes have passed. Have you completed the task?',
                detail: 'If you have reached sp5proxies.com and completed the task, click "Yes" to receive your 6 hours of additional time.',
                buttons: [
                    '✅ Yes, task completed',
                    '⏰ Give me 5 more minutes',
                    '❌ Cancel task'
                ],
                defaultId: 0,
                cancelId: 2
            }).then((result) => {
                if (result.response === 0) {
                    // User confirmed completion
                    this.manuallyCompleteExtension(sessionId, userId);
                    extensionWindow.close();
                } else if (result.response === 1) {
                    // Give more time (another 5 minutes)
                    setTimeout(() => {
                        if (!extensionWindow.isDestroyed() && this.extensionWindows.has(sessionId)) {
                            this.showSimpleTimeoutDialog(sessionId, userId, extensionWindow);
                        }
                    }, 5 * 60 * 1000); // 5 more minutes
                } else {
                    // Cancel and close
                    extensionWindow.close();
                }
            }).catch((error) => {
                console.error(`❌ Error in timeout dialog:`, error);
                // Fallback - just close the window
                extensionWindow.close();
            });
            
        } catch (error) {
            console.error(`❌ Error showing simple timeout dialog:`, error);
            // Fallback - close the window
            if (!extensionWindow.isDestroyed()) {
                extensionWindow.close();
            }
        }
    }

    /**
     * Open extension in external browser with completion tracking
     */
    async openInExternalBrowser(sessionId, redirectUrl, userId) {
        try {
            console.log(`🌍 Opening extension in external browser for session: ${sessionId}`);
            console.log(`🔗 Redirect URL: ${redirectUrl}`);
            
            // Start local callback server for completion tracking
            console.log(`📡 Starting callback server...`);
            const callbackPort = await this.startCallbackServer(sessionId, userId);
            console.log(`🔗 Callback server started on port: ${callbackPort}`);
            
            // Enhance URL with tracking parameters and completion callback
            console.log(`🔧 Enhancing URL with tracking...`);
            const enhancedUrl = this.enhanceUrlWithTracking(redirectUrl, sessionId, userId, callbackPort);
            console.log(`🔗 Enhanced URL: ${enhancedUrl}`);
            
            // Open in external browser
            console.log(`🌐 Opening external browser...`);
            const { shell } = require('electron');
            await shell.openExternal(enhancedUrl);
            console.log(`🚀 URL opened in external browser: ${enhancedUrl}`);
            
            // Show monitoring window
            console.log(`📱 Showing monitoring window...`);
            this.showMonitoringWindow(sessionId, userId, callbackPort);
            console.log(`✅ Monitoring window displayed`);
            
            // Set timeout for external browser
            setTimeout(() => {
                if (this.getExtensionStatus(sessionId) === 'active') {
                    console.log(`⏰ External browser session timeout for ${sessionId}`);
                    this.showExternalTimeoutDialog(sessionId, userId, callbackPort);
                }
            }, 10 * 60 * 1000); // 10 minutes timeout
            
            console.log(`✅ External browser session setup complete for ${sessionId}`);
            return { mode: 'external', port: callbackPort };

        } catch (error) {
            console.error(`❌ Failed to open in external browser:`, error);
            console.error(`❌ Error details:`, error.stack);
            return null;
        }
    }

    /**
     * Start local callback server for external browser completion tracking
     */
    async startCallbackServer(sessionId, userId) {
        try {
            const http = require('http');
            const url = require('url');
            
            // Find available port
            const getPort = require('get-port');
            const port = await getPort({ port: getPort.makeRange(3000, 3100) });
            
            const server = http.createServer((req, res) => {
                const parsedUrl = url.parse(req.url, true);
                
                // CORS headers
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
                
                if (req.method === 'OPTIONS') {
                    res.writeHead(200);
                    res.end();
                    return;
                }
                
                // Handle completion callback
                if (parsedUrl.pathname === '/complete') {
                    const query = parsedUrl.query;
                    
                    if (query.session === sessionId && query.user === userId) {
                        console.log(`✅ External browser completion detected for session: ${sessionId}`);
                        
                        // Mark as completed
                        this.handleExtensionCompletion(sessionId, userId);
                        
                        // Send success response
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(`
                            <html>
                                <head><title>SP5Proxy - Task Completed</title></head>
                                <body style="font-family: Arial; text-align: center; padding: 50px;">
                                    <h1>🎉 Task Completed Successfully!</h1>
                                    <p>You have received 6 hours of additional time.</p>
                                    <p>You can close this tab and return to SP5Proxy.</p>
                                    <script>
                                        setTimeout(() => {
                                            window.close();
                                        }, 3000);
                                    </script>
                                </body>
                            </html>
                        `);
                        
                        // Stop server after completion
                        setTimeout(() => {
                            this.stopCallbackServer(port);
                        }, 5000);
                        
                    } else {
                        res.writeHead(400, { 'Content-Type': 'text/plain' });
                        res.end('Invalid session or user');
                    }
                } else if (parsedUrl.pathname === '/status') {
                    // Status check endpoint
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        session: sessionId,
                        status: this.getExtensionStatus(sessionId),
                        active: true
                    }));
                } else {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('Not found');
                }
            });
            
            server.listen(port, 'localhost', () => {
                console.log(`🔗 Callback server listening on port ${port}`);
            });
            
            // Store server reference
            if (!this.callbackServers) {
                this.callbackServers = new Map();
            }
            this.callbackServers.set(port, server);
            
            return port;
            
        } catch (error) {
            console.error(`❌ Failed to start callback server:`, error);
            throw error;
        }
    }

    /**
     * Stop callback server
     */
    stopCallbackServer(port) {
        try {
            if (this.callbackServers && this.callbackServers.has(port)) {
                const server = this.callbackServers.get(port);
                server.close(() => {
                    console.log(`🔌 Callback server stopped on port ${port}`);
                });
                this.callbackServers.delete(port);
            }
        } catch (error) {
            console.error(`❌ Error stopping callback server:`, error);
        }
    }

    /**
     * Enhance URL with tracking parameters for external browser
     */
    enhanceUrlWithTracking(originalUrl, sessionId, userId, callbackPort) {
        try {
            const urlObj = new URL(originalUrl);
            
            // Add SP5Proxy tracking parameters
            urlObj.searchParams.set('sp5_session', sessionId);
            urlObj.searchParams.set('sp5_user', userId);
            urlObj.searchParams.set('sp5_timestamp', Date.now().toString());
            urlObj.searchParams.set('sp5_external', '1');
            urlObj.searchParams.set('sp5_callback', `http://localhost:${callbackPort}/complete`);
            
            // Add completion callback as JavaScript
            const callbackScript = encodeURIComponent(`
                if (window.location.hostname.includes('sp5proxies.com')) {
                    fetch('http://localhost:${callbackPort}/complete?session=${sessionId}&user=${userId}')
                        .then(() => console.log('SP5Proxy: Completion reported'))
                        .catch(() => {});
                }
            `);
            
            urlObj.searchParams.set('sp5_script', callbackScript);
            
            return urlObj.toString();
            
        } catch (error) {
            console.error(`❌ Error enhancing URL:`, error);
            return originalUrl;
        }
    }

    /**
     * Show monitoring window for external browser session
     */
    showMonitoringWindow(sessionId, userId, callbackPort) {
        try {
            const { BrowserWindow } = require('electron');
            
            const monitorWindow = new BrowserWindow({
                width: 400,
                height: 300,
                resizable: false,
                minimizable: false,
                alwaysOnTop: true,
                title: 'SP5Proxy - External Browser Monitor',
                icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false
                }
            });
            
            // Create monitoring HTML
            const monitoringHTML = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>SP5Proxy Monitor</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            padding: 20px;
                            text-align: center;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            margin: 0;
                        }
                        .status {
                            background: rgba(255,255,255,0.1);
                            padding: 15px;
                            border-radius: 10px;
                            margin: 10px 0;
                        }
                        .button {
                            background: #4CAF50;
                            color: white;
                            padding: 10px 20px;
                            border: none;
                            border-radius: 5px;
                            cursor: pointer;
                            margin: 5px;
                        }
                        .button:hover {
                            background: #45a049;
                        }
                        .button.danger {
                            background: #f44336;
                        }
                        .button.danger:hover {
                            background: #da190b;
                        }
                    </style>
                </head>
                <body>
                    <h2>🌍 External Browser Monitor</h2>
                    <div class="status">
                        <h3>📡 Monitoring Session: ${sessionId}</h3>
                        <p>🛡️ Anti-detection: Active</p>
                        <p>📊 Status: Waiting for completion...</p>
                        <p>⏰ Timeout: 10 minutes</p>
                    </div>
                    
                    <div>
                        <button class="button" onclick="manualComplete()">
                            ✅ Mark as Complete
                        </button>
                        <button class="button danger" onclick="cancelTask()">
                            ❌ Cancel Task
                        </button>
                    </div>
                    
                    <div style="margin-top: 20px; font-size: 12px;">
                        <p>Complete the task in your browser,<br>then return here if needed.</p>
                    </div>
                    
                    <script>
                        const { ipcRenderer } = require('electron');
                        
                        function manualComplete() {
                            if (confirm('Did you successfully reach sp5proxies.com?')) {
                                ipcRenderer.send('manual-complete', '${sessionId}', '${userId}');
                                window.close();
                            }
                        }
                        
                        function cancelTask() {
                            if (confirm('Are you sure you want to cancel? You will not receive the 6 hours.')) {
                                ipcRenderer.send('cancel-task', '${sessionId}', '${userId}');
                                window.close();
                            }
                        }
                        
                        // Check completion status periodically
                        setInterval(() => {
                            fetch('http://localhost:${callbackPort}/status')
                                .then(response => response.json())
                                .then(data => {
                                    if (data.status === 'completed') {
                                        document.querySelector('.status p:nth-child(3)').textContent = '📊 Status: Completed! ✅';
                                        setTimeout(() => window.close(), 2000);
                                    }
                                })
                                .catch(() => {});
                        }, 5000);
                    </script>
                </body>
                </html>
            `;
            
            monitorWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(monitoringHTML));
            
            // Handle IPC messages from monitoring window
            const { ipcMain } = require('electron');
            
            ipcMain.once('manual-complete', (event, sessionIdFromWindow, userIdFromWindow) => {
                if (sessionIdFromWindow === sessionId && userIdFromWindow === userId) {
                    this.handleExtensionCompletion(sessionId, userId);
                    this.stopCallbackServer(callbackPort);
                }
            });
            
            ipcMain.once('cancel-task', (event, sessionIdFromWindow, userIdFromWindow) => {
                if (sessionIdFromWindow === sessionId && userIdFromWindow === userId) {
                    this.handleWindowClosed(sessionId, userId);
                    this.stopCallbackServer(callbackPort);
                }
            });
            
            // Auto-close monitoring window on completion
            const checkCompletion = setInterval(() => {
                if (this.getExtensionStatus(sessionId) === 'completed') {
                    clearInterval(checkCompletion);
                    setTimeout(() => {
                        try {
                            monitorWindow.close();
                        } catch (e) {
                            // Window might already be closed
                        }
                    }, 3000);
                }
            }, 2000);
            
            // Clean up on window close
            monitorWindow.on('closed', () => {
                clearInterval(checkCompletion);
            });
            
        } catch (error) {
            console.error(`❌ Error showing monitoring window:`, error);
        }
    }

    /**
     * Show timeout dialog for external browser
     */
    showExternalTimeoutDialog(sessionId, userId, callbackPort) {
        try {
            const { dialog } = require('electron');
            
            const choice = dialog.showMessageBoxSync(null, {
                type: 'warning',
                title: 'External Browser Timeout',
                message: 'Extension task timeout (10 minutes)',
                detail: `Session: ${sessionId}\n\nThe extension task has been running for 10 minutes. What would you like to do?`,
                buttons: ['✅ Mark as Complete', '⏰ Extend Time (+5 min)', '❌ Cancel Task'],
                defaultId: 1,
                cancelId: 2
            });
            
            switch (choice) {
                case 0: // Complete
                    this.handleExtensionCompletion(sessionId, userId);
                    this.stopCallbackServer(callbackPort);
                    break;
                    
                case 1: // Extend
                    setTimeout(() => {
                        if (this.getExtensionStatus(sessionId) === 'active') {
                            this.showExternalTimeoutDialog(sessionId, userId, callbackPort);
                        }
                    }, 5 * 60 * 1000); // 5 more minutes
                    break;
                    
                case 2: // Cancel
                default:
                    this.handleWindowClosed(sessionId, userId);
                    this.stopCallbackServer(callbackPort);
                    break;
            }
            
        } catch (error) {
            console.error(`❌ Error showing external timeout dialog:`, error);
        }
    }



    /**
     * Apply runtime anti-detection measures during navigation
     */
    async applyRuntimeAntiDetection(extensionWindow, fingerprint) {
        try {
            const runtimeScript = `
                (function() {
                    console.log('🔄 Runtime anti-detection activated');
                    
                    // Simulate human-like mouse movements
                    function simulateHumanActivity() {
                        // Random mouse movements
                        const mouseEvent = new MouseEvent('mousemove', {
                            clientX: Math.random() * window.innerWidth,
                            clientY: Math.random() * window.innerHeight,
                            bubbles: true
                        });
                        document.dispatchEvent(mouseEvent);
                        
                        // Random scroll movements
                        if (Math.random() > 0.7) {
                            window.scrollBy(0, (Math.random() - 0.5) * 100);
                        }
                        
                        // Random focus events
                        if (Math.random() > 0.8 && document.activeElement !== document.body) {
                            document.activeElement.blur();
                        }
                    }
                    
                    // Start human activity simulation with faster intervals
                    setInterval(simulateHumanActivity, 1500 + Math.random() * 2000);
                    
                    // Override fetch to add random delays
                    const originalFetch = window.fetch;
                    window.fetch = function(...args) {
                        return new Promise((resolve, reject) => {
                            // Random delay between 100-500ms to simulate network variations
                            const delay = 100 + Math.random() * 400;
                            setTimeout(() => {
                                originalFetch.apply(this, args).then(resolve).catch(reject);
                            }, delay);
                        });
                    };
                    
                    // Override XMLHttpRequest to add delays
                    const originalXHRSend = XMLHttpRequest.prototype.send;
                    XMLHttpRequest.prototype.send = function(...args) {
                        const delay = 50 + Math.random() * 200;
                        setTimeout(() => {
                            originalXHRSend.apply(this, args);
                        }, delay);
                    };
                    
                    // Clear tracking intervals periodically
                    setInterval(() => {
                        try {
                            // Clear any tracking timers or intervals that might be set by the site
                            for (let i = 1; i < 10000; i++) {
                                clearInterval(i);
                                clearTimeout(i);
                            }
                        } catch (e) {
                            // Ignore errors
                        }
                        
                        // Refresh our fake IDs periodically
                        localStorage.setItem('visitor_id_' + Date.now(), '${fingerprint.deviceId}');
                        sessionStorage.setItem('temp_session_' + Date.now(), '${fingerprint.sessionId}');
                        
                    }, 30000); // Every 30 seconds
                    
                    // Monitor for tracking scripts and disable them
                    const observer = new MutationObserver((mutations) => {
                        mutations.forEach((mutation) => {
                            mutation.addedNodes.forEach((node) => {
                                if (node.nodeType === 1) { // Element node
                                    // Check for tracking scripts
                                    if (node.tagName === 'SCRIPT') {
                                        const src = node.src || '';
                                        const content = node.textContent || '';
                                        
                                        // Block known tracking scripts
                                        if (src.includes('google-analytics') ||
                                            src.includes('googletagmanager') ||
                                            src.includes('facebook.net') ||
                                            src.includes('hotjar') ||
                                            content.includes('gtag') ||
                                            content.includes('fbq') ||
                                            content.includes('tracking')) {
                                            console.log('🚫 Blocked tracking script:', src || 'inline');
                                            node.remove();
                                        }
                                    }
                                }
                            });
                        });
                    });
                    
                    observer.observe(document.body, {
                        childList: true,
                        subtree: true
                    });
                    
                    console.log('✅ Runtime anti-detection measures active');
                })();
            `;
            
            await extensionWindow.webContents.executeJavaScript(runtimeScript);
            console.log('🔄 Runtime anti-detection measures applied');
            
        } catch (error) {
            console.warn('⚠️ Some runtime anti-detection measures failed:', error.message);
        }
    }

    /**
     * Set Monetization Manager reference
     */
    setMonetizationManager(monetizationManager) {
        this.monetizationManager = monetizationManager;
        console.log('💰 Monetization Manager connected to URL Extension Manager');
    }

    /**
     * Start URL extension process
     */
    async startExtension(userId) {
        try {
            console.log(`🔗 Starting URL extension for user: ${userId}`);

            // Call admin panel API to start extension process
            const response = await electronFetch(`${this.adminPanelUrl}/api/url-extension/start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ user_id: userId })
            });

            const result = await response.json();

            if (!result.success) {
                console.error('❌ Failed to start URL extension:', result.error);
                return {
                    success: false,
                    message: result.error || 'Failed to start extension process'
                };
            }

            const { session_id, redirect_url: initialRedirectUrl } = result;
            
            // Store active extension session
            this.activeExtensions.set(session_id, {
                userId: userId,
                sessionId: session_id,
                redirectUrl: initialRedirectUrl,
                startTime: Date.now(),
                status: 'started'
            });

            console.log(`✅ Extension session created: ${session_id}`);
            console.log(`🌐 Initial Redirect URL: ${initialRedirectUrl}`);

            // Create shortened URL using Short Jambo API
            console.log(`🔗 Creating shortened URL with Short Jambo API...`);
            const shortenedUrl = await this.createShortenedUrl(session_id, userId);
            
            // Use shortened URL if available, otherwise fallback to original
            const finalUrl = shortenedUrl || initialRedirectUrl;
            console.log(`🌐 Final URL: ${finalUrl} ${shortenedUrl ? '(shortened)' : '(original)'}`);

            // Update database with the shortened URL
            if (shortenedUrl && shortenedUrl !== initialRedirectUrl) {
                try {
                    const updateResponse = await electronFetch(`${this.adminPanelUrl}/api/url-extension/update-shortened-url`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            session_id: session_id,
                            user_id: userId,
                            shortened_url: shortenedUrl
                        })
                    });
                    
                    if (updateResponse.ok) {
                        console.log(`✅ Database updated with shortened URL for session: ${session_id}`);
                    } else {
                        console.warn(`⚠️ Failed to update database with shortened URL: ${updateResponse.status}`);
                    }
                } catch (updateError) {
                    console.error(`❌ Error updating database with shortened URL:`, updateError);
                }
            }

            // Use finalUrl for the actual redirect
            const redirectUrl = finalUrl;

            // Update active extension data with the shortened URL
            const extensionData = this.activeExtensions.get(session_id);
            if (extensionData) {
                extensionData.redirectUrl = redirectUrl;
                extensionData.shortenedUrl = shortenedUrl;
                extensionData.originalUrl = redirectUrl === shortenedUrl ? null : initialRedirectUrl;
                extensionData.shortJamboAlias = shortenedUrl ? 'generated' : null;
                extensionData.createdAt = Date.now();
                this.activeExtensions.set(session_id, extensionData);
            }

            // Create simple extension window
            console.log(`🖥️ Creating simple extension window for session: ${session_id}`);
            const extensionWindow = await this.createSimpleExtensionWindow(session_id, redirectUrl, userId);
            
            if (!extensionWindow) {
                throw new Error('Failed to create extension window');
            }
            
            console.log(`✅ Extension window created successfully for session: ${session_id}`);

            // Start advanced completion tracking
            this.startAdvancedCompletionTracking(session_id, userId);

            return {
                success: true,
                sessionId: session_id,
                redirectUrl: redirectUrl,
                message: 'Extension window opened. Please complete the task to receive 6 hours of additional time.'
            };

        } catch (error) {
            console.error('❌ URL extension start failed:', error);
            return {
                success: false,
                message: `Extension failed: ${error.message}`
            };
        }
    }



    /**
     * Handle URL navigation in extension window with debouncing
     */
    async handleUrlNavigation(sessionId, userId, navigationUrl) {
        try {
            // Skip if URL hasn't changed
            const lastUrl = this.lastCheckedUrls.get(sessionId);
            if (lastUrl === navigationUrl) {
                return;
            }

            console.log(`🔍 Processing navigation for session ${sessionId}: ${navigationUrl}`);

            // Clear existing timer for this session
            const existingTimer = this.navigationTimers.get(sessionId);
            if (existingTimer) {
                clearTimeout(existingTimer);
            }

            // Set up debounced completion check
            const timer = setTimeout(async () => {
                try {
                    // Update last checked URL
                    this.lastCheckedUrls.set(sessionId, navigationUrl);

                    // Get the extension session data
                    const extensionData = this.activeExtensions.get(sessionId);
                    if (!extensionData) {
                        console.log(`⚠️ No extension data found for session: ${sessionId}`);
                        return;
                    }

                    // Skip if already completed
                    if (extensionData.status === 'completed') {
                        console.log(`✅ Session ${sessionId} already completed, skipping check`);
                        return;
                    }

                    console.log(`🔍 Checking navigation for completion: ${navigationUrl}`);

                    // Check if this navigation indicates completion
                    const isCompleted = await this.checkUrlCompletion(sessionId, userId, navigationUrl);

                    if (isCompleted) {
                        console.log(`🎉 Extension completed for session: ${sessionId}`);
                        await this.handleExtensionCompletion(sessionId, userId);
                    }

                } catch (error) {
                    console.error(`❌ Error in debounced URL navigation check for session ${sessionId}:`, error);
                } finally {
                    // Clean up timer
                    this.navigationTimers.delete(sessionId);
                }
            }, 1000); // 1 second debounce

            // Store the timer
            this.navigationTimers.set(sessionId, timer);

        } catch (error) {
            console.error(`❌ Error handling URL navigation for session ${sessionId}:`, error);
        }
    }

    /**
     * Handle extension window closed
     */
    async handleWindowClosed(sessionId, userId) {
        try {
            console.log(`🔒 Handling window closure for session: ${sessionId}`);

            // Clean up timers and tracking data
            const existingTimer = this.navigationTimers.get(sessionId);
            if (existingTimer) {
                clearTimeout(existingTimer);
                this.navigationTimers.delete(sessionId);
            }

            this.lastCheckedUrls.delete(sessionId);

            // Check if extension was completed before window closed
            const extensionData = this.activeExtensions.get(sessionId);
            if (extensionData && extensionData.status !== 'completed') {
                console.log(`⚠️ Extension window closed without completion for session: ${sessionId}`);
                
                // Don't auto-complete on window closure - mark as cancelled
                extensionData.status = 'cancelled';
                extensionData.cancelledAt = Date.now();
                extensionData.cancelReason = 'window_closed_without_completion';
                this.activeExtensions.set(sessionId, extensionData);
                
                console.log(`❌ Session ${sessionId} cancelled - window closed before reaching target`);
            }

        } catch (error) {
            console.error(`❌ Error handling window closure for session ${sessionId}:`, error);
        }
    }

    /**
     * Check if URL navigation indicates completion
     */
    async checkUrlCompletion(sessionId, userId, navigationUrl) {
        try {
            console.log(`🔍 Checking URL completion for session ${sessionId}: ${navigationUrl}`);

            // Get target URL from admin panel configuration
            const response = await electronFetch(`${this.adminPanelUrl}/api/url-extension/check-completion`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: sessionId,
                    user_id: userId,
                    current_url: navigationUrl
                })
            });

            const result = await response.json();

            if (result.success && result.completed) {
                console.log(`✅ API confirmed completion for session: ${sessionId}`);
                return true;
            }

            // Enhanced URL matching logic
            if (result.destination_url && result.shortened_url) {
                const isCompleted = this.performAdvancedUrlMatching(
                    navigationUrl,
                    result.destination_url,
                    result.shortened_url,
                    sessionId
                );

                if (isCompleted) {
                    console.log(`✅ Advanced URL matching detected completion for session: ${sessionId}`);
                    return true;
                }
            }

            return false;

        } catch (error) {
            console.error(`❌ Error checking URL completion:`, error);
            return false;
        }
    }

    /**
     * Perform advanced URL matching to detect completion
     */
    performAdvancedUrlMatching(currentUrl, destinationUrl, shortenedUrl, sessionId) {
        try {
            const currentUrlObj = new URL(currentUrl);
            const destinationUrlObj = new URL(destinationUrl);
            const shortenedUrlObj = new URL(shortenedUrl);

            console.log(`🔍 Advanced URL matching for session ${sessionId}:`);
            console.log(`   Current: ${currentUrl}`);
            console.log(`   Destination: ${destinationUrl}`);
            console.log(`   Shortened: ${shortenedUrl}`);

            // Method 1: Exact URL match
            if (currentUrl === destinationUrl) {
                console.log(`✅ Exact URL match detected`);
                return true;
            }

            // Method 2: Domain and path matching
            if (currentUrlObj.hostname === destinationUrlObj.hostname) {
                // Check if current path contains or matches destination path
                if (currentUrlObj.pathname.includes(destinationUrlObj.pathname) ||
                    destinationUrlObj.pathname.includes(currentUrlObj.pathname)) {
                    console.log(`✅ Domain and path match detected`);
                    return true;
                }
            }

            // Method 3: Check if user has moved beyond the shortened URL
            if (currentUrlObj.hostname !== shortenedUrlObj.hostname &&
                currentUrlObj.hostname === destinationUrlObj.hostname) {
                console.log(`✅ User moved from shortened URL to destination domain`);
                return true;
            }

            // Method 4: Query parameter matching (for tracking URLs)
            if (currentUrlObj.hostname === destinationUrlObj.hostname) {
                const currentParams = new URLSearchParams(currentUrlObj.search);
                const destinationParams = new URLSearchParams(destinationUrlObj.search);

                // Check if important tracking parameters match
                const trackingParams = ['id', 'session', 'ref', 'source', 'utm_source'];
                for (const param of trackingParams) {
                    if (destinationParams.has(param) &&
                        currentParams.get(param) === destinationParams.get(param)) {
                        console.log(`✅ Tracking parameter match detected: ${param}`);
                        return true;
                    }
                }
            }

            // Method 5: Subdomain matching for completion pages
            const currentBaseDomain = this.extractBaseDomain(currentUrlObj.hostname);
            const destinationBaseDomain = this.extractBaseDomain(destinationUrlObj.hostname);

            if (currentBaseDomain === destinationBaseDomain &&
                (currentUrl.includes('complete') || currentUrl.includes('success') ||
                 currentUrl.includes('finish') || currentUrl.includes('done'))) {
                console.log(`✅ Completion page detected on same domain`);
                return true;
            }

            console.log(`❌ No URL completion match found`);
            return false;

        } catch (error) {
            console.error(`❌ Error in advanced URL matching:`, error);
            return false;
        }
    }

    /**
     * Extract base domain from hostname
     */
    extractBaseDomain(hostname) {
        const parts = hostname.split('.');
        if (parts.length >= 2) {
            return parts.slice(-2).join('.');
        }
        return hostname;
    }

    /**
     * Handle extension completion
     */
    async handleExtensionCompletion(sessionId, userId) {
        try {
            console.log(`🎉 Processing extension completion for session: ${sessionId}`);

            // Clean up timers immediately to prevent duplicate processing
            const existingTimer = this.navigationTimers.get(sessionId);
            if (existingTimer) {
                clearTimeout(existingTimer);
                this.navigationTimers.delete(sessionId);
            }

            // Mark extension as completed
            const success = await this.markExtensionCompleted(sessionId, userId);

            if (success) {
                // Update local session data
                const extensionData = this.activeExtensions.get(sessionId);
                if (extensionData) {
                    extensionData.status = 'completed';
                    extensionData.completedAt = Date.now();
                    this.activeExtensions.set(sessionId, extensionData);
                }

                // Clean up tracking data
                this.lastCheckedUrls.delete(sessionId);

                // **IMPORTANT: Grant extension time through monetization manager**
                if (this.monetizationManager) {
                    try {
                        console.log(`💰 Granting extension time for session: ${sessionId}`);
                        const result = await this.monetizationManager.handleUrlExtensionSuccess(sessionId, userId);
                        console.log(`✅ Extension time granted for session: ${sessionId}`, result);
                    } catch (error) {
                        console.error(`❌ Failed to grant extension time for session ${sessionId}:`, error);
                    }
                } else {
                    console.warn(`⚠️ Monetization Manager not available for session: ${sessionId}`);
                }

                // Show success notification before closing window
                this.showCompletionNotification(sessionId);

                // Close the extension window after a short delay to allow user to see completion
                setTimeout(() => {
                    const extensionWindow = this.extensionWindows.get(sessionId);
                    if (extensionWindow && !extensionWindow.isDestroyed()) {
                        extensionWindow.close();
                    }
                }, 3000); // 3 second delay

                console.log(`✅ Extension completion processed successfully for session: ${sessionId}`);
            }

        } catch (error) {
            console.error(`❌ Error handling extension completion for session ${sessionId}:`, error);
        }
    }

    /**
     * Show completion notification
     */
    showCompletionNotification(sessionId) {
        try {
            const { dialog, BrowserWindow } = require('electron');

            // Get the main window to show notification relative to it
            const mainWindow = BrowserWindow.getAllWindows().find(win => !win.isDestroyed() && win.webContents.getURL().includes('index-react.html'));

            const options = {
                type: 'info',
                title: 'SP5Proxy - Extension Completed!',
                message: 'Task Completed Successfully! 🎉',
                detail: 'Congratulations! You have successfully completed the extension task.\n\n✅ 6 hours of additional connection time has been added to your account\n✅ The extension window will close automatically\n✅ You can continue using SP5Proxy with extended time',
                buttons: ['Awesome!'],
                icon: path.join(__dirname, '..', 'assets', 'icon.ico')
            };

            if (mainWindow) {
                dialog.showMessageBox(mainWindow, options);
            } else {
                dialog.showMessageBox(options);
            }

            console.log(`🎉 Completion notification shown for session: ${sessionId}`);

        } catch (error) {
            console.error(`❌ Error showing completion notification:`, error);
        }
    }

    /**
     * Start advanced completion tracking using the completion tracker
     */
    startAdvancedCompletionTracking(sessionId, userId) {
        console.log(`🔍 Starting advanced completion tracking for session: ${sessionId}`);

        // Configure tracking options
        const trackingConfig = {
            enableUrlPatternMatching: true,
            enableTimeBasedCompletion: true,
            minimumEngagementTime: 30000, // 30 seconds minimum engagement
            checkInterval: 8000, // Check every 8 seconds
            maxTrackingTime: 30 * 60 * 1000 // 30 minutes maximum
        };

        // Start tracking with the completion tracker
        this.completionTracker.startTracking(sessionId, userId, trackingConfig);

        // Register completion callback
        this.completionTracker.onCompletion(sessionId, async (sessionId, userId, completionData) => {
            console.log(`🎉 Extension completion callback triggered for session: ${sessionId}`);

            // Update session status
            const session = this.activeExtensions.get(sessionId);
            if (session) {
                session.status = 'completed';
                session.completionTime = completionData.completionTime;
                session.completionMethod = completionData.method;
            }

            // Grant extension time through monetization manager
            if (this.monetizationManager) {
                try {
                    const result = await this.monetizationManager.handleUrlExtensionSuccess(sessionId, userId);
                    console.log(`✅ Extension time granted for session: ${sessionId}`, result);
                } catch (error) {
                    console.error(`❌ Failed to grant extension time for session ${sessionId}:`, error);
                }
            }

            // Remove from active extensions after a delay
            setTimeout(() => {
                this.activeExtensions.delete(sessionId);
                console.log(`🗑️ Cleaned up session: ${sessionId}`);
            }, 60000); // Keep for 1 minute for status queries
        });
    }

    /**
     * Check if extension has been completed
     */
    async checkExtensionCompletion(sessionId, userId) {
        try {
            const response = await electronFetch(`${this.adminPanelUrl}/api/url-extension/check-completion`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    session_id: sessionId, 
                    user_id: userId 
                })
            });

            const result = await response.json();
            
            if (result.success) {
                return result.completed === true;
            }
            
            return false;
        } catch (error) {
            console.error('❌ Error checking extension completion:', error);
            return false;
        }
    }

    /**
     * Mark extension as completed (called by external tracking)
     */
    async markExtensionCompleted(sessionId, userId) {
        try {
            console.log(`✅ Marking extension as completed: ${sessionId}`);

            const response = await electronFetch(`${this.adminPanelUrl}/api/url-extension/complete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    session_id: sessionId, 
                    user_id: userId 
                })
            });

            const result = await response.json();
            
            if (result.success) {
                console.log(`✅ Extension completion recorded: ${sessionId}`);
                return true;
            } else {
                console.error('❌ Failed to mark extension as completed:', result.error);
                return false;
            }
        } catch (error) {
            console.error('❌ Error marking extension as completed:', error);
            return false;
        }
    }

    /**
     * Get extension status
     */
    getExtensionStatus(sessionId) {
        const session = this.activeExtensions.get(sessionId);
        if (!session) {
            return { status: 'not_found' };
        }

        return {
            status: session.status,
            sessionId: session.sessionId,
            userId: session.userId,
            startTime: session.startTime,
            completionTime: session.completionTime || null,
            redirectUrl: session.redirectUrl
        };
    }

    /**
     * Get all active extensions
     */
    getActiveExtensions() {
        const extensions = [];
        for (const [sessionId, session] of this.activeExtensions) {
            extensions.push({
                sessionId: sessionId,
                userId: session.userId,
                status: session.status,
                startTime: session.startTime,
                completionTime: session.completionTime || null,
                completionMethod: session.completionMethod || null
            });
        }
        return extensions;
    }

    /**
     * Show initial instructions to user
     */


    /**
     * Inject helper UI overlay into the extension window
     */
    injectHelperUI(extensionWindow, sessionId, userId) {
        const helperCode = `
            // Create SP5Proxy helper overlay
            (function() {
                if (document.getElementById('sp5-helper-overlay')) return; // Already injected

                const overlay = document.createElement('div');
                overlay.id = 'sp5-helper-overlay';
                overlay.style.cssText = \`
                    position: fixed;
                    top: 0;
                    right: 0;
                    width: 200px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 10px;
                    font-family: Arial, sans-serif;
                    font-size: 12px;
                    z-index: 999999;
                    border-bottom-left-radius: 10px;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                    border: 2px solid #fff;
                \`;

                overlay.innerHTML = \`
                    <div style="text-align: center; margin-bottom: 8px;">
                        <strong>🛡️ Manual Mode Active</strong>
                    </div>
                    <div style="font-size: 10px; margin-bottom: 10px; color: #90EE90;">
                        🎯 Navigate manually to: sp5proxies.com
                    </div>
                    <div style="
                        width: 100%;
                        background: #17a2b8;
                        color: white;
                        padding: 6px;
                        border-radius: 5px;
                        text-align: center;
                        font-size: 10px;
                        margin-bottom: 5px;
                        animation: pulse 2s infinite;
                    ">🎭 Anti-Detection Active</div>
                    <div style="
                        width: 100%;
                        background: #dc3545;
                        color: white;
                        padding: 4px;
                        border-radius: 5px;
                        text-align: center;
                        font-size: 9px;
                        margin-bottom: 5px;
                    ">🚫 Blocking ads & downloads</div>
                    <div style="
                        width: 100%;
                        background: #6f42c1;
                        color: white;
                        padding: 4px;
                        border-radius: 5px;
                        text-align: center;
                        font-size: 8px;
                        margin-bottom: 5px;
                    ">🛡️ Blocking fake security popups</div>
                    <div style="
                        width: 100%;
                        background: #28a745;
                        color: white;
                        padding: 4px;
                        border-radius: 5px;
                        text-align: center;
                        font-size: 8px;
                        margin-bottom: 5px;
                    ">👤 Manual Navigation Required</div>
                    <button id="sp5-complete-btn" style="
                        width: 100%;
                        padding: 6px;
                        background: #6c757d;
                        color: #fff;
                        border: none;
                        border-radius: 5px;
                        cursor: not-allowed;
                        font-size: 10px;
                        margin-bottom: 3px;
                        opacity: 0.5;
                    " disabled>🔒 Progress Required</button>
                    <style>
                        @keyframes pulse {
                            0% { opacity: 1; }
                            50% { opacity: 0.7; }
                            100% { opacity: 1; }
                        }
                    </style>
                \`;

                document.body.appendChild(overlay);

                // Add dynamic button state management
                function updateCompleteButton() {
                    const btn = document.getElementById('sp5-complete-btn');
                    if (!btn) return;
                    
                    // Check current URL and navigation progress
                    const currentUrl = window.location.href.toLowerCase();
                    const hasReachedTarget = currentUrl.includes('sp5proxies.com');
                    const hasNavigationProgress = window.history.length > 2; // More than initial page
                    const isOnShortener = currentUrl.includes('short-jambo.ink') || 
                                         currentUrl.includes('linkvertise') || 
                                         currentUrl.includes('adfly');
                    
                    // Enable button only if user has made legitimate progress
                    if (hasReachedTarget) {
                        // Enable if reached target
                        btn.disabled = false;
                        btn.style.background = '#28a745';
                        btn.style.cursor = 'pointer';
                        btn.style.opacity = '1';
                        btn.textContent = '✅ Complete Task';
                    } else if (hasNavigationProgress && isOnShortener) {
                        // Partially enable if on shortener with progress
                        btn.disabled = false;
                        btn.style.background = '#ffc107';
                        btn.style.color = '#000';
                        btn.style.cursor = 'pointer';
                        btn.style.opacity = '1';
                        btn.textContent = '⚠️ Manual Complete';
                    } else {
                        // Keep disabled if no progress
                        btn.disabled = true;
                        btn.style.background = '#6c757d';
                        btn.style.color = '#fff';
                        btn.style.cursor = 'not-allowed';
                        btn.style.opacity = '0.5';
                        btn.textContent = '🔒 Progress Required';
                    }
                }
                
                // Update button state every 2 seconds
                setInterval(updateCompleteButton, 2000);
                
                // Also update on URL changes
                let lastButtonUrl = window.location.href;
                setInterval(() => {
                    if (window.location.href !== lastButtonUrl) {
                        lastButtonUrl = window.location.href;
                        updateCompleteButton();
                    }
                }, 1000);
                
                // Add event listeners
                document.getElementById('sp5-complete-btn').addEventListener('click', function() {
                    const currentUrl = window.location.href.toLowerCase();
                    const hasReachedTarget = currentUrl.includes('sp5proxies.com');
                    
                    if (this.disabled) {
                        alert('❌ Please navigate manually before using this button.\\n\\n' +
                              '👤 You need to manually navigate through the URL shortener.\\n\\n' +
                              '🎯 Navigate to sp5proxies.com to enable the completion button.\\n\\n' +
                              '🛡️ Anti-detection is active to protect your privacy.');
                        return;
                    }
                    
                    let confirmMessage;
                    if (hasReachedTarget) {
                        confirmMessage = '✅ You have reached the target website!\\n\\nComplete the task now?';
                    } else {
                        confirmMessage = '⚠️ WARNING: You have not reached the target website yet.\\n\\n' +
                                       'Current URL: ' + window.location.href + '\\n\\n' +
                                       'Target: sp5proxies.com\\n\\n' +
                                       'Are you sure you want to complete now?\\n\\n' +
                                       '(This may not grant the full 6 hours if task is incomplete)';
                    }
                    
                    if (confirm(confirmMessage)) {
                        alert('✅ Task completed! You will get 6 hours extension.');
                        // Signal completion to main process
                        window.postMessage({ type: 'SP5_MANUAL_COMPLETE', sessionId: '${sessionId}' }, '*');
                    }
                });

                // Auto-hide after 30 seconds
                setTimeout(() => {
                    overlay.style.opacity = '0.3';
                    overlay.style.transition = 'opacity 0.5s';
                }, 30000);

                // Show countdown timer - 10 minutes for manual mode
                let timeLeft = 600; // 10 minutes
                const timer = setInterval(() => {
                    timeLeft--;
                    const minutes = Math.floor(timeLeft / 60);
                    const seconds = timeLeft % 60;
                    overlay.querySelector('div').innerHTML = \`
                        <strong>🛡️ Manual Mode Active</strong><br>
                        <span style="font-size: 10px;">⏰ \${minutes}:\${seconds.toString().padStart(2, '0')} remaining</span>
                    \`;

                    if (timeLeft <= 0) {
                        clearInterval(timer);
                        overlay.style.background = 'linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)';
                        overlay.querySelector('div').innerHTML = '<strong>⏰ Time expired - Please complete manually</strong>';
                    }
                }, 1000);
            })();
        `;

        // Inject the helper UI
        extensionWindow.webContents.executeJavaScript(helperCode).catch(err => {
            console.log('Note: Could not inject helper UI (this is normal for some sites)');
        });

        // Listen for completion messages (both manual and auto)
        extensionWindow.webContents.on('console-message', (event, level, message) => {
            if (message.includes('SP5_MANUAL_COMPLETE') || message.includes('SP5_AUTO_COMPLETE')) {
                this.manuallyCompleteExtension(sessionId, userId);
            }
        });

        // Add message listener for window.postMessage events
        extensionWindow.webContents.on('did-finish-load', () => {
            extensionWindow.webContents.executeJavaScript(`
                window.addEventListener('message', function(event) {
                    if (event.data && (event.data.type === 'SP5_AUTO_COMPLETE' || event.data.type === 'SP5_MANUAL_COMPLETE')) {
                        console.log('SP5_AUTO_COMPLETE message received');
                    }
                });
            `).catch(() => {});
        });
    }

    /**
     * Start Auto-Skip System
     */
    startAutoSkipSystem(extensionWindow, sessionId, userId) {
        console.log(`🤖 Starting auto-skip system for session: ${sessionId}`);
        
        // Auto-skip injection script
        const autoSkipScript = `
            // SP5Proxy Auto-Skip System
            (function() {
                console.log('🤖 SP5Proxy Auto-Skip System activated');
                
                let skipAttempts = 0;
                let maxSkipAttempts = 100; // Max attempts - increased for multi-step navigation
                let autoSkipInterval;
                let completionCheckInterval;
                let fakePopupCheckInterval;
                let navigationSteps = 0; // Track how many steps we've completed
                let lastUrl = window.location.href; // Track URL changes
                let legitimateProgressMade = false; // Track if user made legitimate progress
                
                // Enhanced popup and fake security alert blocking
                const originalOpen = window.open;
                window.open = function(url, name, features) {
                    console.log(\`🚫 Blocked popup attempt: \${url}\`);
                    
                    // Block all popups - they're usually ads or fake security warnings
                    console.log('🚫 Blocked popup/download attempt');
                    return null;
                };
                
                // Block fake security alerts and malware warnings
                const originalAlert = window.alert;
                window.alert = function(message) {
                    const msg = message.toLowerCase();
                    if (msg.includes('virus') || msg.includes('malware') || msg.includes('infected') ||
                        msg.includes('security') || msg.includes('mcafee') || msg.includes('norton') ||
                        msg.includes('antivirus') || msg.includes('scan') || msg.includes('threat') ||
                        msg.includes('download now') || msg.includes('update now') ||
                        msg.includes('your computer') || msg.includes('system') ||
                        msg.includes('warning') || msg.includes('error')) {
                        console.log(\`🚫 Blocked fake security alert: \${message}\`);
                        updateOverlayStatus('🚫 Blocked fake security popup');
                        return;
                    }
                    return originalAlert.call(window, message);
                };
                
                // Block fake security confirm dialogs
                const originalConfirm = window.confirm;
                window.confirm = function(message) {
                    const msg = message.toLowerCase();
                    if (msg.includes('virus') || msg.includes('malware') || msg.includes('infected') ||
                        msg.includes('scan') || msg.includes('download') || msg.includes('update') ||
                        msg.includes('security') || msg.includes('mcafee') || msg.includes('norton')) {
                        console.log(\`🚫 Blocked fake security confirm: \${message}\`);
                        updateOverlayStatus('🚫 Blocked fake security dialog');
                        return false;
                    }
                    return originalConfirm.call(window, message);
                };
                
                // Block unwanted redirects
                const originalAssign = window.location.assign;
                window.location.assign = function(url) {
                    if (url && (url.includes('opera.com') || url.includes('chrome.com') || 
                               url.includes('firefox.com') || url.includes('.exe') || url.includes('.msi'))) {
                        console.log(\`🚫 Blocked unwanted redirect: \${url}\`);
                        return;
                    }
                    return originalAssign.call(window.location, url);
                };
                
                // Prevent downloads
                document.addEventListener('click', function(e) {
                    if (e.target && e.target.href) {
                        const href = e.target.href.toLowerCase();
                        if (href.includes('.exe') || href.includes('.msi') || href.includes('.dmg') ||
                            href.includes('opera.com') || href.includes('chrome.com') || href.includes('firefox.com')) {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log(\`🚫 Prevented unwanted click: \${e.target.href}\`);
                            return false;
                        }
                    }
                }, true);
                
                // Common skip button selectors
                const skipSelectors = [
                    // Generic skip/continue buttons
                    'button[class*="skip"]', 'a[class*="skip"]',
                    'button[class*="continue"]', 'a[class*="continue"]',
                    'button[class*="next"]', 'a[class*="next"]',
                    'button[class*="proceed"]', 'a[class*="proceed"]',
                    'button[class*="go"]', 'a[class*="go"]',
                    
                    // Common ID patterns
                    '#skip', '#continue', '#next', '#proceed', '#go',
                    '#skip-button', '#continue-button', '#next-button',
                    '#skip_button', '#continue_button', '#next_button',
                    
                    // Text-based selectors - High Priority
                    'button:contains("Get Started")', 'a:contains("Get Started")',
                    'button:contains("Start")', 'a:contains("Start")',
                    'button:contains("Begin")', 'a:contains("Begin")',
                    'button:contains("Enter")', 'a:contains("Enter")',
                    'button:contains("Visit")', 'a:contains("Visit")',
                    'button:contains("Access")', 'a:contains("Access")',
                    'button:contains("Open")', 'a:contains("Open")',
                    
                    // Skip/Continue buttons
                    'button:contains("Skip")', 'a:contains("Skip")',
                    'button:contains("Continue")', 'a:contains("Continue")',
                    'button:contains("Next")', 'a:contains("Next")',
                    'button:contains("Proceed")', 'a:contains("Proceed")',
                    'button:contains("Get Link")', 'a:contains("Get Link")',
                    'button:contains("Go to Link")', 'a:contains("Go to Link")',
                    'button:contains("Continue to")', 'a:contains("Continue to")',
                    'button:contains("Skip Ad")', 'a:contains("Skip Ad")',
                    
                    // Common action buttons
                    'button:contains("Click Here")', 'a:contains("Click Here")',
                    'button:contains("Click to")', 'a:contains("Click to")',
                    'button:contains("Tap to")', 'a:contains("Tap to")',
                    'button:contains("Press")', 'a:contains("Press")',
                    
                    // AdFly and similar services
                    '.skip-btn', '.continue-btn', '.next-btn',
                    '.btn-skip', '.btn-continue', '.btn-next',
                    '.link-skip', '.link-continue',
                    
                    // Countdown bypass
                    '[id*="countdown"]', '[class*="countdown"]',
                    '[id*="timer"]', '[class*="timer"]',
                    
                    // Common shortener patterns
                    '.get-link', '.get_link', '.getlink',
                    '.download-link', '.download_link',
                    '.verification-link', '.verify-link'
                ];
                
                // Function to detect and remove fake security popups
                function removeFakeSecurityPopups() {
                    console.log('🔍 Scanning for fake security popups...');
                    
                    // Look for fake security popup patterns
                    const fakePopupSelectors = [
                        // McAfee fake popups
                        '[class*="mcafee"]', '[id*="mcafee"]',
                        '*[class*="virus"]', '*[id*="virus"]',
                        '*[class*="malware"]', '*[id*="malware"]',
                        '*[class*="infected"]', '*[id*="infected"]',
                        '*[class*="security"]', '*[id*="security"]',
                        '*[class*="warning"]', '*[id*="warning"]',
                        '*[class*="alert"]', '*[id*="alert"]',
                        '*[class*="threat"]', '*[id*="threat"]',
                        '*[class*="scan"]', '*[id*="scan"]',
                        
                        // Generic popup containers
                        '.popup', '.modal', '.overlay', '.dialog',
                        '#popup', '#modal', '#overlay', '#dialog',
                        '[role="dialog"]', '[role="alertdialog"]',
                        
                        // Fixed position elements (often popups)
                        '*[style*="position: fixed"]',
                        '*[style*="position:fixed"]'
                    ];
                    
                    let popupsRemoved = 0;
                    
                    fakePopupSelectors.forEach(selector => {
                        try {
                            const elements = document.querySelectorAll(selector);
                            elements.forEach(element => {
                                if (element && element.offsetParent !== null) {
                                    const text = element.textContent.toLowerCase();
                                    const className = element.className.toLowerCase();
                                    const id = element.id.toLowerCase();
                                    
                                    // Check if this looks like a fake security popup
                                    if (text.includes('virus') || text.includes('malware') || text.includes('infected') ||
                                        text.includes('mcafee') || text.includes('norton') || text.includes('antivirus') ||
                                        text.includes('scan now') || text.includes('click here to scan') ||
                                        text.includes('your computer is infected') || text.includes('threat detected') ||
                                        text.includes('security warning') || text.includes('system alert') ||
                                        className.includes('virus') || className.includes('malware') ||
                                        id.includes('virus') || id.includes('malware') ||
                                        (element.style.position === 'fixed' && element.style.zIndex > 1000)) {
                                        
                                        console.log(\`🗑️ Removing fake security popup: \${text.substring(0, 50)}...\`);
                                        element.style.display = 'none';
                                        element.remove();
                                        popupsRemoved++;
                                        updateOverlayStatus(\`🗑️ Removed fake popup (\${popupsRemoved})\`);
                                    }
                                }
                            });
                        } catch (e) {
                            // Continue to next selector
                        }
                    });
                    
                    // Also look for suspicious iframes (often used for fake popups)
                    const iframes = document.querySelectorAll('iframe');
                    iframes.forEach(iframe => {
                        const src = iframe.src.toLowerCase();
                        if (src.includes('virus') || src.includes('malware') || src.includes('security') ||
                            src.includes('mcafee') || src.includes('norton') || src.includes('scan')) {
                            console.log(\`🗑️ Removing suspicious iframe: \${src}\`);
                            iframe.remove();
                            popupsRemoved++;
                        }
                    });
                    
                    if (popupsRemoved > 0) {
                        console.log(\`✅ Removed \${popupsRemoved} fake security popups\`);
                        updateOverlayStatus(\`✅ Cleaned \${popupsRemoved} fake popups\`);
                    }
                }

                // Auto-skip function
                function autoSkip() {
                    // First, remove any fake security popups
                    removeFakeSecurityPopups();
                    
                    // Don't auto-complete if we haven't tried enough skips yet
                    if (skipAttempts >= maxSkipAttempts) {
                        console.log('🔄 Max skip attempts reached, asking user to complete manually');
                        updateOverlayStatus('⏰ Max attempts reached - please complete manually');
                        
                        // Show timeout dialog instead of auto-completing
                        setTimeout(() => {
                            const shouldComplete = confirm(\`Maximum skip attempts reached after \${navigationSteps} navigation steps.\\n\\nCurrent URL: \${window.location.href}\\n\\nHave you reached the target website (sp5proxies.com)?\\n\\nClick OK if you have completed the task, or Cancel to keep trying.\`);
                            if (shouldComplete) {
                                markAsCompleted('manual_user_confirmation');
                            } else {
                                skipAttempts = 0; // Reset counter to keep trying
                                updateOverlayStatus(\`🔄 Continuing multi-step navigation... (Step \${navigationSteps})\`);
                            }
                        }, 2000);
                        return;
                    }
                    
                    skipAttempts++;
                    
                    // Check if URL changed (indicates we moved to next step)
                    if (window.location.href !== lastUrl) {
                        navigationSteps++;
                        const newUrl = window.location.href;
                        lastUrl = newUrl;
                        
                        // Check if we moved to an ad page
                        if (isUnwantedAdPage(newUrl.toLowerCase())) {
                            console.log(\`🚫 Navigation step \${navigationSteps} led to ad page: \${newUrl}\`);
                            updateOverlayStatus(\`🚫 Step \${navigationSteps}: Detected ad - bypassing...\`);
                            bypassUnwantedAd();
                        } else {
                            console.log(\`🔄 Navigation step \${navigationSteps} completed. New URL: \${newUrl}\`);
                            skipAttempts = Math.max(0, skipAttempts - 10); // Reduce skip attempts when we make progress
                            
                            // Mark legitimate progress if we're moving through shortener services
                            if (newUrl.includes('short-jambo.ink') || newUrl.includes('linkvertise') ||
                                newUrl.includes('adfly') || navigationSteps >= 2) {
                                legitimateProgressMade = true;
                                console.log('✅ Legitimate progress detected');
                            }
                            
                            // Check if we reached the target
                            if (newUrl.includes('sp5proxies.com')) {
                                legitimateProgressMade = true;
                                console.log('🎯 Reached target domain!');
                                updateOverlayStatus('🎯 Target reached!');
                            }
                        }
                    }
                    
                    console.log(\`🤖 Auto-skip attempt \${skipAttempts}/\${maxSkipAttempts} (Step \${navigationSteps})\`);
                    
                    // Update overlay with current status
                    updateOverlayStatus(\`Multi-step navigation... Step \${navigationSteps} (\${skipAttempts}/\${maxSkipAttempts})\`);
                    
                    // Check if we're on an ad page first
                    if (isUnwantedAdPage(window.location.href.toLowerCase())) {
                        console.log('🚫 On ad page, attempting to bypass...');
                        updateOverlayStatus(\`🚫 Step \${navigationSteps}: Bypassing ad page...\`);
                        bypassUnwantedAd();
                        
                        // If we're stuck on an ad page for too long, force navigation back
                        setTimeout(() => {
                            if (isUnwantedAdPage(window.location.href.toLowerCase())) {
                                console.log('🔄 Still stuck on ad page, forcing back navigation...');
                                updateOverlayStatus(\`🔄 Step \${navigationSteps}: Forcing back from ad...\`);
                                window.history.back();
                            }
                        }, 5000);
                        return;
                    }
                    
                    // Try to find and click skip buttons
                    let buttonFound = false;
                    
                    // First, try specific countdown completion detection
                    if (!buttonFound) {
                        const countdownFinished = document.querySelector('[id*="countdown"], [class*="countdown"]');
                        if (countdownFinished && (countdownFinished.textContent.includes('0') || 
                            countdownFinished.textContent.trim() === '' || 
                            countdownFinished.style.display === 'none')) {
                            console.log('⏰ Countdown finished, looking for enabled buttons...');
                            
                            // Wait a bit for page to fully load after countdown
                            setTimeout(() => {
                                // Look for any button that becomes available after countdown
                                const allButtons = document.querySelectorAll('button, a[href], input[type="submit"], input[type="button"], [role="button"]');
                                let foundMultipleOptions = [];
                                
                                for (let btn of allButtons) {
                                    if (btn.offsetParent !== null && !btn.disabled && 
                                        btn.offsetWidth > 0 && btn.offsetHeight > 0) {
                                        
                                        const btnText = btn.textContent.toLowerCase().trim();
                                        
                                        // Skip unwanted buttons
                                        if (btnText.includes('close') || btnText.includes('cancel') || 
                                            btnText.includes('no thanks') || btnText === 'x' ||
                                            btnText.includes('advertisement') || btnText.includes('ad') ||
                                            btnText.includes('download') && btnText.includes('app')) {
                                            continue;
                                        }
                                        
                                        // Collect all potential buttons
                                        if (btnText.includes('get started') || btnText.includes('start') ||
                                            btnText.includes('begin') || btnText.includes('enter') ||
                                            btnText.includes('continue') || btnText.includes('next') ||
                                            btnText.includes('proceed') || btnText.includes('skip') ||
                                            btnText.includes('access') || btnText.includes('visit') ||
                                            btnText.includes('click here') || btnText.includes('go') ||
                                            btnText.includes('open') || btnText.includes('unlock') ||
                                            btnText.includes('verify') || btnText.includes('confirm')) {
                                            
                                            foundMultipleOptions.push({
                                                element: btn,
                                                text: btnText,
                                                priority: btnText.includes('get started') ? 10 :
                                                         btnText.includes('continue') ? 9 :
                                                         btnText.includes('next') ? 8 :
                                                         btnText.includes('proceed') ? 7 :
                                                         btnText.includes('skip') ? 6 : 5
                                            });
                                        }
                                    }
                                }
                                
                                // Sort by priority and click the best option
                                if (foundMultipleOptions.length > 0) {
                                    foundMultipleOptions.sort((a, b) => b.priority - a.priority);
                                    const bestButton = foundMultipleOptions[0];
                                    
                                    console.log(\`🎯 Found \${foundMultipleOptions.length} buttons, clicking best: "\${bestButton.text}" (priority: \${bestButton.priority})\`);
                                    updateOverlayStatus(\`🎯 Multi-step navigation: \${bestButton.text}\`);
                                    
                                    // Enhanced clicking with multiple attempts
                                    bestButton.element.focus();
                                    bestButton.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    
                                    setTimeout(() => {
                                        // Try multiple click methods
                                        bestButton.element.click();
                                        bestButton.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                                        bestButton.element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                                        bestButton.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                                        
                                        // If it's a link, try programmatic navigation
                                        if (bestButton.element.href) {
                                            setTimeout(() => {
                                                if (window.location.href === document.location.href) {
                                                    console.log('🔄 Button click may not have worked, trying direct navigation...');
                                                    window.location.href = bestButton.element.href;
                                                }
                                            }, 1000);
                                        }
                                    }, 500);
                                    buttonFound = true;
                                }
                            }, 800); // Wait for any animations or loading
                        }
                    }
                    
                    // If no countdown button found, try regular selectors
                    if (!buttonFound) {
                        for (let selector of skipSelectors) {
                            try {
                                // Handle :contains() selector manually
                                if (selector.includes(':contains(')) {
                                    const text = selector.match(/:contains\\("([^"]+)"/)[1];
                                    const elements = Array.from(document.querySelectorAll('button, a, input[type="submit"], input[type="button"]'));
                                    const element = elements.find(el => 
                                        el.textContent.trim().toLowerCase().includes(text.toLowerCase()) &&
                                        el.offsetParent !== null && // visible
                                        !el.disabled &&
                                        el.offsetWidth > 0 && el.offsetHeight > 0 // actually visible
                                    );
                                    
                                    if (element) {
                                        console.log(\`🎯 Found skip element by text: "\${text}" on \${element.tagName}\`);
                                        updateOverlayStatus(\`🎯 Clicking: \${text}\`);
                                        
                                        // Enhanced clicking
                                        element.focus();
                                        setTimeout(() => {
                                            element.click();
                                            element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                                            element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                                        }, 200);
                                        buttonFound = true;
                                        break;
                                    }
                                } else {
                                    const elements = document.querySelectorAll(selector);
                                    for (let element of elements) {
                                        if (element && element.offsetParent !== null && 
                                            !element.disabled &&
                                            element.offsetWidth > 0 && element.offsetHeight > 0) {
                                            
                                            // Skip close/cancel buttons
                                            const text = element.textContent.toLowerCase();
                                            if (text.includes('close') || text.includes('cancel') || 
                                                text.includes('no thanks') || text === 'x') {
                                                continue;
                                            }
                                            
                                            console.log(\`🎯 Found skip element: \${selector} with text: "\${element.textContent.trim()}"\`);
                                            updateOverlayStatus(\`🎯 Clicking: \${element.textContent.trim() || selector}\`);
                                            
                                            // Enhanced clicking
                                            element.focus();
                                            setTimeout(() => {
                                                element.click();
                                                element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                                                element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                                            }, 200);
                                            buttonFound = true;
                                            break;
                                        }
                                    }
                                }
                            } catch (e) {
                                // Continue to next selector
                            }
                            
                            if (buttonFound) break;
                        }
                    }
                    
                    // Try to bypass countdown timers
                    if (!buttonFound) {
                        bypassCountdown();
                        
                        // Last resort: look for any large, prominent buttons
                        setTimeout(() => {
                            if (!buttonFound) {
                                console.log('🔍 Last resort: scanning for prominent buttons...');
                                const allClickables = document.querySelectorAll('*');
                                let largestButton = null;
                                let largestSize = 0;
                                
                                for (let element of allClickables) {
                                    // Check if element is likely a button
                                    const isClickable = element.tagName === 'BUTTON' || 
                                                      element.tagName === 'A' ||
                                                      element.onclick ||
                                                      element.getAttribute('role') === 'button' ||
                                                      element.style.cursor === 'pointer' ||
                                                      element.classList.contains('btn') ||
                                                      element.classList.contains('button');
                                    
                                    if (isClickable && element.offsetParent !== null && 
                                        !element.disabled && element.offsetWidth > 0 && element.offsetHeight > 0) {
                                        
                                        const text = element.textContent.toLowerCase().trim();
                                        
                                        // Skip unwanted elements
                                        if (text.includes('close') || text.includes('cancel') || 
                                            text.includes('no thanks') || text === 'x' ||
                                            text.includes('advertisement') || text.includes('ads') ||
                                            text.length > 50) { // Skip very long text
                                            continue;
                                        }
                                        
                                        // Calculate element size
                                        const size = element.offsetWidth * element.offsetHeight;
                                        
                                        // Prefer certain text patterns and larger sizes
                                        let priority = size;
                                        if (text.includes('get started') || text.includes('start')) priority *= 3;
                                        if (text.includes('continue') || text.includes('next')) priority *= 2.5;
                                        if (text.includes('proceed') || text.includes('go')) priority *= 2;
                                        if (text.includes('skip') || text.includes('enter')) priority *= 1.5;
                                        
                                        if (priority > largestSize && size > 1000) { // Minimum size threshold
                                            largestSize = priority;
                                            largestButton = element;
                                        }
                                    }
                                }
                                
                                if (largestButton) {
                                    const btnText = largestButton.textContent.trim();
                                    console.log(\`🎯 Found largest clickable element: "\${btnText}" (size: \${largestButton.offsetWidth}x\${largestButton.offsetHeight})\`);
                                    updateOverlayStatus(\`🎯 Clicking largest button: \${btnText}\`);
                                    
                                    largestButton.focus();
                                    setTimeout(() => {
                                        largestButton.click();
                                        largestButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                                        largestButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                                        largestButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                                    }, 300);
                                    buttonFound = true;
                                }
                            }
                        }, 1000);
                    }
                    
                    // Check if we've reached the target (only complete if truly reached target)
                    if (checkIfCompleted()) {
                        console.log('✅ Target reached automatically!');
                        updateOverlayStatus('🎉 Target reached! Completing task...');
                        markAsCompleted('auto_navigation_success');
                        return;
                    }
                    
                    // Update status if button was found
                    if (buttonFound) {
                        updateOverlayStatus(\`🎯 Step \${navigationSteps}: Button clicked! Waiting for next page... (\${skipAttempts}/\${maxSkipAttempts})\`);
                    } else {
                        updateOverlayStatus(\`⏳ Step \${navigationSteps}: Searching for skip options... (\${skipAttempts}/\${maxSkipAttempts})\`);
                    }
                }
                
                // Bypass countdown timers
                function bypassCountdown() {
                    // Look for countdown elements
                    const countdownElements = document.querySelectorAll('[id*="countdown"], [class*="countdown"], [id*="timer"], [class*="timer"]');
                    
                    countdownElements.forEach(element => {
                        const currentCount = element.textContent.match(/\\d+/);
                        if (currentCount) {
                            console.log(\`⏰ Found countdown: \${currentCount[0]}, attempting to bypass...\`);
                            updateOverlayStatus(\`⏰ Bypassing countdown: \${currentCount[0]}s\`);
                            
                            // Try to set countdown to 0
                            try {
                                // Common countdown bypass techniques
                                if (window.countdown) window.countdown = 0;
                                if (window.timer) window.timer = 0;
                                if (window.count) window.count = 0;
                                if (window.seconds) window.seconds = 0;
                                if (window.timeLeft) window.timeLeft = 0;
                                if (window.time) window.time = 0;
                                
                                // Try global countdown variables
                                const globalVars = ['_countdown', '_timer', '_count', '_seconds', '_timeLeft', '_time'];
                                globalVars.forEach(varName => {
                                    if (window[varName] !== undefined) {
                                        window[varName] = 0;
                                    }
                                });
                                
                                // Try to trigger countdown completion events
                                const events = ['click', 'change', 'input', 'blur', 'focus', 'mousedown', 'mouseup'];
                                events.forEach(eventType => {
                                    try {
                                        element.dispatchEvent(new Event(eventType, { bubbles: true }));
                                        element.dispatchEvent(new MouseEvent(eventType, { bubbles: true }));
                                    } catch (e) {}
                                });
                                
                                // Update element text to 0
                                if (element.textContent.match(/\\d+/)) {
                                    element.textContent = element.textContent.replace(/\\d+/, '0');
                                }
                                
                                // Force update element to show completion
                                element.innerHTML = element.innerHTML.replace(/\\d+/, '0');
                                
                                // Try to trigger any onChange handlers
                                if (element.onchange) element.onchange();
                                if (element.onclick) element.onclick();
                                
                            } catch (e) {
                                console.log('⚠️ Countdown bypass failed:', e);
                            }
                        }
                    });
                    
                    // Also check for countdown in page title or specific text
                    if (document.title.match(/\\d+/) || document.body.textContent.includes('Please wait')) {
                        console.log('⏰ Detected waiting page, checking for skip options...');
                        
                        // Look for any clickable elements that might skip the wait
                        const possibleSkips = document.querySelectorAll('button, a, [onclick], [role="button"]');
                        for (let element of possibleSkips) {
                            const text = element.textContent.toLowerCase();
                            if ((text.includes('skip') || text.includes('continue') || text.includes('next') || 
                                text.includes('proceed') || text.includes('get started')) &&
                                element.offsetParent !== null && !element.disabled) {
                                console.log(\`⚡ Found potential skip element during countdown: "\${text}"\`);
                                updateOverlayStatus(\`⚡ Found skip option: \${text}\`);
                                setTimeout(() => {
                                    element.focus();
                                    element.click();
                                    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                                }, 500);
                                break;
                            }
                        }
                    }
                }
                
                // Check if we've reached the final destination
                function checkIfCompleted() {
                    const currentUrl = window.location.href.toLowerCase();
                    
                    // Check if we're on an unwanted ad page and need to go back/close
                    if (isUnwantedAdPage(currentUrl)) {
                        console.log('🚫 Detected unwanted ad page, attempting to bypass...');
                        bypassUnwantedAd();
                        return false;
                    }
                    
                    // Check if we've reached the actual target domain (sp5proxies.com)
                    const targetDomain = '${destinationUrl}'.toLowerCase();
                    if (currentUrl.includes('sp5proxies.com') && 
                        (currentUrl.includes('home.php') || currentUrl.includes('success') || currentUrl.includes('complete'))) {
                        console.log('✅ Reached target domain: sp5proxies.com');
                        return true;
                    }
                    
                    // Don't complete if still on shortened URL services
                    if (currentUrl.includes('short-jambo.ink') || 
                        currentUrl.includes('adfly') ||
                        currentUrl.includes('linkvertise') ||
                        currentUrl.includes('t.co') ||
                        currentUrl.includes('bit.ly') ||
                        currentUrl.includes('tinyurl')) {
                        console.log('⏳ Still on shortened URL service, waiting...');
                        return false;
                    }
                    
                    // Don't complete if on known ad/redirect pages
                    if (currentUrl.includes('opera.com') ||
                        currentUrl.includes('chrome.com') ||
                        currentUrl.includes('firefox.com') ||
                        currentUrl.includes('microsoft.com') ||
                        currentUrl.includes('download.com')) {
                        console.log('🚫 On ad page, not completing...');
                        return false;
                    }
                    
                    // More strict completion indicators - must have real content
                    const hasRealContent = [
                        // Page must have substantial content
                        document.body.textContent.length > 500,
                        
                        // Must not be a redirect page
                        !document.body.textContent.toLowerCase().includes('please wait'),
                        !document.body.textContent.toLowerCase().includes('redirecting'),
                        !document.body.textContent.toLowerCase().includes('loading'),
                        !document.body.textContent.toLowerCase().includes('countdown'),
                        
                        // Must have typical content elements
                        document.querySelector('article') || 
                        document.querySelector('.content') || 
                        document.querySelector('#content') ||
                        document.querySelector('.main') ||
                        document.querySelector('#main'),
                        
                        // Title should be meaningful
                        document.title.length > 15 && !document.title.toLowerCase().includes('wait'),
                        
                        // Should not be on a timer/countdown page
                        !document.querySelector('[id*="countdown"]') &&
                        !document.querySelector('[class*="countdown"]') &&
                        !document.querySelector('[id*="timer"]') &&
                        !document.querySelector('[class*="timer"]')
                    ];
                    
                    const contentIndicators = hasRealContent.filter(Boolean).length;
                    const isLikelyRealPage = contentIndicators >= 4;
                    
                    if (isLikelyRealPage) {
                        console.log(\`✅ Detected real content page with \${contentIndicators}/\${hasRealContent.length} indicators\`);
                        return true;
                    }
                    
                    console.log(\`⏳ Not enough content indicators (\${contentIndicators}/\${hasRealContent.length}), continuing...\`);
                    return false;
                }
                
                // Check if current page is an unwanted ad
                function isUnwantedAdPage(url) {
                    const adDomains = [
                        'opera.com',
                        'chrome.com', 
                        'firefox.com',
                        'microsoft.com',
                        'download.com',
                        'softonic.com',
                        'cnet.com',
                        'filehippo.com',
                        'google.com/chrome',
                        'mozilla.org',
                        'apple.com',
                        'adobe.com',
                        'mcafee.com',
                        'avg.com',
                        'avast.com',
                        'norton.com',
                        'ccleaner.com'
                    ];
                    
                    const adKeywords = [
                        'thanks', 'download', 'install', 'setup', 'installer',
                        'thanks for downloading', 'download complete', 'installation',
                        'browser', 'antivirus', 'security', 'cleaner', 'optimizer',
                        'vpn', 'proxy', 'extension', 'addon', 'plugin'
                    ];
                    
                    const pageTitle = document.title.toLowerCase();
                    const pageContent = document.body.textContent.toLowerCase();
                    
                    // Check for ad domains
                    if (adDomains.some(domain => url.includes(domain))) {
                        return true;
                    }
                    
                    // Check for ad keywords in URL, title, or content
                    if (adKeywords.some(keyword => 
                        url.includes(keyword) || 
                        pageTitle.includes(keyword) ||
                        pageContent.includes(keyword))) {
                        return true;
                    }
                    
                    // Check for file download pages
                    if (url.includes('.exe') || url.includes('.msi') || url.includes('.dmg') ||
                        pageTitle.includes('download') || pageContent.includes('save as') ||
                        pageContent.includes('file name') || pageContent.includes('installer')) {
                        return true;
                    }
                    
                    return false;
                }
                
                // Bypass unwanted ad pages
                function bypassUnwantedAd() {
                    console.log('🔄 Attempting to bypass unwanted ad page...');
                    updateOverlayStatus('🚫 Detected ad page - bypassing...');
                    
                    // Check if this is a download dialog or file save dialog
                    if (window.location.href.includes('opera.com') && 
                        (document.title.includes('download') || document.title.includes('thanks'))) {
                        console.log('🚫 Detected Opera download page, attempting immediate bypass...');
                        
                        // Try to close any download dialogs
                        setTimeout(() => {
                            // Try pressing Escape key to close dialogs
                            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27 }));
                            document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', keyCode: 27 }));
                            
                            // Try to close the window/tab
                            try {
                                window.close();
                            } catch (e) {
                                console.log('Cannot close window, trying navigation...');
                                // Go back to previous page
                                if (window.history.length > 1) {
                                    window.history.back();
                                } else {
                                    // Try to navigate to a neutral page
                                    window.location.href = 'about:blank';
                                }
                            }
                        }, 500);
                        return;
                    }
                    
                    // Try to find close buttons first
                    const closeSelectors = [
                        '[aria-label*="close"]', '[aria-label*="Close"]',
                        '[title*="close"]', '[title*="Close"]',
                        '.close', '#close', '.Close', '#Close',
                        '.btn-close', '#btn-close',
                        '.modal-close', '.popup-close', '.dialog-close',
                        'button:contains("Close")', 'button:contains("✕")', 'button:contains("×")',
                        'button:contains("No Thanks")', 'button:contains("No, thanks")',
                        'button:contains("Cancel")', 'button:contains("Decline")',
                        'button:contains("Skip")', 'button:contains("Skip Ad")',
                        'button:contains("Maybe Later")', 'button:contains("Not Now")',
                        'a:contains("Close")', 'a:contains("No Thanks")',
                        'a:contains("Cancel")', 'a:contains("Skip")',
                        '[data-dismiss="modal"]', '[data-close]'
                    ];
                    
                    let closed = false;
                    for (let selector of closeSelectors) {
                        try {
                            if (selector.includes(':contains(')) {
                                const text = selector.match(/:contains\\("([^"]+)"/)[1];
                                const elements = Array.from(document.querySelectorAll('button, a, div, span'));
                                const element = elements.find(el => 
                                    el.textContent.trim().toLowerCase().includes(text.toLowerCase()) &&
                                    el.offsetParent !== null &&
                                    el.offsetWidth > 0 && el.offsetHeight > 0
                                );
                                
                                if (element) {
                                    console.log(\`🎯 Found close button: "\${text}"\`);
                                    updateOverlayStatus(\`🎯 Closing ad: \${text}\`);
                                    element.click();
                                    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                                    closed = true;
                                    break;
                                }
                            } else {
                                const elements = document.querySelectorAll(selector);
                                for (let element of elements) {
                                    if (element && element.offsetParent !== null &&
                                        element.offsetWidth > 0 && element.offsetHeight > 0) {
                                        console.log(\`🎯 Found close element: \${selector}\`);
                                        updateOverlayStatus(\`🎯 Closing ad popup\`);
                                        element.click();
                                        element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                                        closed = true;
                                        break;
                                    }
                                }
                            }
                        } catch (e) {}
                        
                        if (closed) break;
                    }
                    
                    // If no close button found, try alternative methods
                    if (!closed) {
                        console.log('🔙 No close button found, trying alternative bypass methods...');
                        updateOverlayStatus('🔄 Ad detected - using advanced bypass...');
                        
                        // Try pressing Escape key multiple times
                        for (let i = 0; i < 3; i++) {
                            setTimeout(() => {
                                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
                                document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', keyCode: 27, bubbles: true }));
                            }, i * 200);
                        }
                        
                        // Try to prevent default on all click events (stop downloads)
                        document.addEventListener('click', function(e) {
                            if (e.target.href && (e.target.href.includes('.exe') || e.target.href.includes('.msi'))) {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log('🚫 Prevented download click');
                                return false;
                            }
                        }, true);
                        
                        setTimeout(() => {
                            try {
                                // Check if we're still on the same ad page
                                if (isUnwantedAdPage(window.location.href.toLowerCase())) {
                                    console.log('🔙 Still on ad page, going back...');
                                    if (window.history.length > 1) {
                                        window.history.back();
                                    } else {
                                        window.location.reload();
                                    }
                                }
                            } catch (e) {
                                console.log('⚠️ Cannot navigate, continuing auto-skip...');
                            }
                        }, 2000);
                    }
                }
                
                // Mark as completed
                function markAsCompleted(method) {
                    console.log(\`✅ Marking as completed via: \${method}\`);
                    clearInterval(autoSkipInterval);
                    clearInterval(completionCheckInterval);
                    clearInterval(fakePopupCheckInterval);
                    
                    updateOverlayStatus('✅ Task completed! Closing in 3 seconds...');
                    
                    // Show success message and auto-close
                    setTimeout(() => {
                        alert('🎉 Task completed successfully!\\n\\n✅ You have received 6 additional hours of connection time.\\n\\n🔄 This window will close automatically.');
                        
                        setTimeout(() => {
                            try {
                                window.close();
                            } catch (e) {
                                console.log('Auto-close completed');
                            }
                        }, 2000);
                    }, 1000);
                    
                                         // Notify completion
                     setTimeout(() => {
                         alert('🎉 Task completed automatically! You will get 6 hours extension.');
                         window.postMessage({ 
                             type: 'SP5_AUTO_COMPLETE', 
                             sessionId: '${sessionId}',
                             method: method
                         }, '*');
                     }, 1000);
                }
                
                // Update overlay status
                function updateOverlayStatus(status) {
                    const overlay = document.getElementById('sp5-helper-overlay');
                    if (overlay) {
                        const statusDiv = overlay.querySelector('div');
                        if (statusDiv) {
                            statusDiv.innerHTML = \`<strong>🤖 \${status}</strong>\`;
                        }
                    }
                }
                
                                 // Start auto-skip system
                 console.log('🚀 Starting auto-skip intervals...');
                 updateOverlayStatus('Auto-skip system active');
                
                // Skip attempts every 2 seconds (faster response)
                autoSkipInterval = setInterval(autoSkip, 2000);
                
                // Completion check every 1.5 seconds (faster detection)
                completionCheckInterval = setInterval(() => {
                    if (checkIfCompleted()) {
                        markAsCompleted('auto_completion_detected');
                    }
                }, 1500);
                
                // Fake popup removal every 3 seconds
                fakePopupCheckInterval = setInterval(removeFakeSecurityPopups, 3000);
                
                // Watch for DOM changes that might add new popups
                const observer = new MutationObserver(function(mutations) {
                    mutations.forEach(function(mutation) {
                        if (mutation.addedNodes) {
                            mutation.addedNodes.forEach(function(node) {
                                if (node.nodeType === 1) { // Element node
                                    const text = node.textContent ? node.textContent.toLowerCase() : '';
                                    if (text.includes('virus') || text.includes('malware') || 
                                        text.includes('mcafee') || text.includes('security') ||
                                        text.includes('infected') || text.includes('scan')) {
                                        console.log('🔍 Detected new popup element, scheduling removal...');
                                        setTimeout(removeFakeSecurityPopups, 500);
                                    }
                                }
                            });
                        }
                    });
                });
                
                // Start observing
                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
                
                // Immediate first attempt (faster start)
                setTimeout(autoSkip, 500);
                
                // Extra attempt after countdown might be complete
                setTimeout(autoSkip, 2500);
                
                console.log('✅ Auto-skip system initialized successfully');
            })();
        `;
        
        // Inject the auto-skip system
        extensionWindow.webContents.executeJavaScript(autoSkipScript).catch(err => {
            console.log('⚠️ Note: Could not inject auto-skip system (trying alternative method)');
            // Fallback to simpler auto-skip
            this.startSimpleAutoSkip(extensionWindow, sessionId, userId);
        });
        
        // Listen for auto-completion messages
        extensionWindow.webContents.on('console-message', (event, level, message) => {
            if (message.includes('SP5_AUTO_COMPLETE')) {
                console.log('🎉 Auto-completion detected!');
                this.manuallyCompleteExtension(sessionId, userId);
            }
        });
    }

    /**
     * Simple auto-skip fallback
     */
    startSimpleAutoSkip(extensionWindow, sessionId, userId) {
        console.log('🔄 Starting simple auto-skip fallback...');
        
        let attempts = 0;
        const maxAttempts = 10;
        
        const simpleSkip = setInterval(() => {
            attempts++;
            
            if (attempts > maxAttempts) {
                clearInterval(simpleSkip);
                console.log('🏁 Auto-skip completed, marking as done');
                setTimeout(() => {
                    this.manuallyCompleteExtension(sessionId, userId);
                }, 2000);
                return;
            }
            
            // Simple navigation attempt
            extensionWindow.webContents.executeJavaScript(`
                // Simple click on common elements
                const buttons = document.querySelectorAll('button, a');
                for (let btn of buttons) {
                    const text = btn.textContent.toLowerCase();
                    if (text.includes('skip') || text.includes('continue') || text.includes('next')) {
                        btn.click();
                        console.log('🎯 Simple skip clicked: ' + text);
                        break;
                    }
                }
            `).catch(() => {});
            
        }, 4000); // Every 4 seconds
    }

    /**
     * Log blocked pop-up for debugging
     */
    logPopupBlocked(sessionId, blockedUrl) {
        console.log(`🚫 Pop-up blocked for session ${sessionId}: ${blockedUrl}`);
        // You could also save this to database for analytics
    }

    /**
     * Show timeout dialog when extension is stuck
     */
    showTimeoutDialog(sessionId, userId, extensionWindow) {
        const { dialog } = require('electron');
        
        dialog.showMessageBox(extensionWindow, {
            type: 'question',
            title: 'Timeout - Have you completed the task?',
            message: '3 minutes have passed since opening the shortened link.\n\nHave you reached the target website and completed the task?',
            buttons: [
                '✅ Yes, task completed',
                '🔄 No, need more time',
                '❌ Cancel and close'
            ],
            defaultId: 0,
            cancelId: 2
        }).then((result) => {
            if (result.response === 0) {
                // User confirmed completion
                this.manuallyCompleteExtension(sessionId, userId);
            } else if (result.response === 1) {
                // Give more time (another 2 minutes)
                setTimeout(() => {
                    if (this.extensionWindows.has(sessionId)) {
                        this.showFinalTimeoutDialog(sessionId, userId, extensionWindow);
                    }
                }, 2 * 60 * 1000);
            } else {
                // Cancel and close
                extensionWindow.close();
            }
        });
    }

    /**
     * Show final timeout dialog
     */
    showFinalTimeoutDialog(sessionId, userId, extensionWindow) {
        const { dialog } = require('electron');
        
        dialog.showMessageBox(extensionWindow, {
            type: 'warning',
            title: 'Final timeout reached',
            message: 'The allowed time for the task has ended.\n\nYou can:\n• Complete the task manually if you reached the target\n• Close the window and try again later',
            buttons: [
                '✅ Task completed',
                '❌ Close'
            ],
            defaultId: 1,
            cancelId: 1
        }).then((result) => {
            if (result.response === 0) {
                this.manuallyCompleteExtension(sessionId, userId);
            } else {
                extensionWindow.close();
            }
        });
    }

    /**
     * Manually verify and complete an extension session
     */
    async manuallyCompleteExtension(sessionId, userId) {
        console.log(`✋ Manually completing extension for session: ${sessionId}`);

        try {
            // Call the manual completion API endpoint
            const response = await electronFetch(`${this.adminPanelUrl}/api/url-extension/manual-complete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: sessionId,
                    user_id: userId
                })
            });

            const result = await response.json();

            if (result.success) {
                console.log(`✅ Manual completion successful for session: ${sessionId}`);
                
                // Update local session status
                const extensionData = this.activeExtensions.get(sessionId);
                if (extensionData) {
                    extensionData.status = 'completed';
                    extensionData.completedAt = Date.now();
                    extensionData.manuallyCompleted = true;
                    this.activeExtensions.set(sessionId, extensionData);
                }

                // Grant extension time through monetization manager
                if (this.monetizationManager) {
                    try {
                        console.log(`💰 Granting extension time for manual completion: ${sessionId}`);
                        const monetizationResult = await this.monetizationManager.handleUrlExtensionSuccess(sessionId, userId);
                        console.log(`✅ Extension time granted for manual completion: ${sessionId}`, monetizationResult);
                    } catch (error) {
                        console.error(`❌ Failed to grant extension time for manual completion ${sessionId}:`, error);
                    }
                } else {
                    console.warn(`⚠️ Monetization Manager not available for manual completion: ${sessionId}`);
                }

                return {
                    success: true,
                    message: result.message || 'Extension manually completed successfully',
                    sessionId: sessionId,
                    extensionHours: result.extension_hours || 6,
                    alreadyCompleted: result.already_completed || false
                };
            } else {
                console.error(`❌ Manual completion failed for session ${sessionId}:`, result.error);
                return {
                    success: false,
                    message: result.error || 'Manual completion failed'
                };
            }

        } catch (error) {
            console.error(`❌ Error manually completing extension for session ${sessionId}:`, error);
            return {
                success: false,
                message: `Manual completion failed: ${error.message}`
            };
        }
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        console.log('🧹 Cleaning up URL Extension Manager...');

        // Close all extension windows
        if (this.extensionWindows) {
            for (const [sessionId, window] of this.extensionWindows) {
                try {
                    window.close();
                } catch (error) {
                    console.warn(`⚠️ Error closing window for session ${sessionId}:`, error.message);
                }
            }
            this.extensionWindows.clear();
        }

        // Stop all callback servers
        if (this.callbackServers) {
            for (const [port, server] of this.callbackServers) {
                try {
                    server.close(() => {
                        console.log(`🔌 Callback server on port ${port} closed during cleanup`);
                    });
                } catch (error) {
                    console.warn(`⚠️ Error closing callback server on port ${port}:`, error.message);
                }
            }
            this.callbackServers.clear();
        }

        // Cleanup completion tracker
        if (this.completionTracker) {
            this.completionTracker.cleanup();
        }

        // Clear active extensions
        this.activeExtensions.clear();

        console.log('✅ URL Extension Manager cleanup completed');
    }

    /**
     * Get manager status
     */
    getStatus() {
        const activeTrackingSessions = this.completionTracker ?
            this.completionTracker.getActiveTrackingSessions() : [];

        return {
            type: 'url-based',
            activeExtensions: this.activeExtensions.size,
            activeTrackingSessions: activeTrackingSessions.length,
            trackingSessions: activeTrackingSessions,
            adminPanelUrl: this.adminPanelUrl,
            isConnected: this.monetizationManager !== null,
            hasCompletionTracker: this.completionTracker !== null
        };
    }
}

module.exports = UrlExtensionManager;
