const { net } = require('electron');

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
 * SP5Proxy URL Completion Tracker
 * Automatically tracks and verifies URL completion for extension system
 * Uses multiple detection methods to ensure accurate completion tracking
 */
class UrlCompletionTracker {
    constructor(databaseManager) {
        this.databaseManager = databaseManager;
        this.adminPanelUrl = 'http://127.0.0.1:3000';
        this.trackingIntervals = new Map(); // Store tracking intervals for each session
        this.completionCallbacks = new Map(); // Store completion callbacks
        
        // Tracking configuration
        this.config = {
            checkInterval: 10000, // Check every 10 seconds
            maxTrackingTime: 30 * 60 * 1000, // Track for maximum 30 minutes
            completionMethods: [
                'url_pattern_match',
                'destination_reached',
                'time_based_completion',
                'manual_verification'
            ]
        };

        console.log('🔍 URL Completion Tracker initialized');
    }

    /**
     * Start tracking URL completion for a session
     */
    startTracking(sessionId, userId, config = {}) {
        console.log(`🔍 Starting completion tracking for session: ${sessionId}`);

        // Merge with default config
        const trackingConfig = {
            ...this.config,
            ...config
        };

        // Clear any existing tracking for this session
        this.stopTracking(sessionId);

        // Start periodic completion checks
        const interval = setInterval(async () => {
            try {
                const completed = await this.checkCompletion(sessionId, userId, trackingConfig);
                
                if (completed) {
                    console.log(`✅ Completion detected for session: ${sessionId}`);
                    this.handleCompletion(sessionId, userId);
                    this.stopTracking(sessionId);
                }
            } catch (error) {
                console.error(`❌ Error checking completion for session ${sessionId}:`, error);
            }
        }, trackingConfig.checkInterval);

        // Store the interval
        this.trackingIntervals.set(sessionId, interval);

        // Set timeout to stop tracking after maximum time
        setTimeout(() => {
            if (this.trackingIntervals.has(sessionId)) {
                console.log(`⏰ Tracking timeout for session: ${sessionId}`);
                this.stopTracking(sessionId);
            }
        }, trackingConfig.maxTrackingTime);

        return {
            success: true,
            sessionId: sessionId,
            trackingStarted: Date.now(),
            maxTrackingTime: trackingConfig.maxTrackingTime
        };
    }

    /**
     * Stop tracking for a specific session
     */
    stopTracking(sessionId) {
        const interval = this.trackingIntervals.get(sessionId);
        if (interval) {
            clearInterval(interval);
            this.trackingIntervals.delete(sessionId);
            console.log(`🛑 Stopped tracking for session: ${sessionId}`);
        }

        // Remove completion callback
        this.completionCallbacks.delete(sessionId);
    }

    /**
     * Check if URL completion has occurred using multiple methods
     */
    async checkCompletion(sessionId, userId, config) {
        try {
            // Method 1: Check via admin panel API
            const apiResult = await this.checkCompletionViaAPI(sessionId, userId);
            if (apiResult) {
                console.log(`✅ Completion detected via API for session: ${sessionId}`);
                return true;
            }

            // Method 2: Check URL pattern matching (if configured)
            if (config.enableUrlPatternMatching) {
                const patternResult = await this.checkUrlPatternCompletion(sessionId, userId);
                if (patternResult) {
                    console.log(`✅ Completion detected via URL pattern for session: ${sessionId}`);
                    return true;
                }
            }

            // Method 3: Time-based completion (if user has been active for minimum time)
            if (config.enableTimeBasedCompletion) {
                const timeResult = await this.checkTimeBasedCompletion(sessionId, userId, config);
                if (timeResult) {
                    console.log(`✅ Completion detected via time-based method for session: ${sessionId}`);
                    return true;
                }
            }

            return false;
        } catch (error) {
            console.error('❌ Error in completion check:', error);
            return false;
        }
    }

    /**
     * Check completion via admin panel API
     */
    async checkCompletionViaAPI(sessionId, userId) {
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
            return result.success && result.completed === true;
        } catch (error) {
            console.error('❌ API completion check failed:', error);
            return false;
        }
    }

    /**
     * Check completion based on URL pattern matching
     */
    async checkUrlPatternCompletion(sessionId, userId) {
        try {
            // Get the tracking record to check destination URL
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
            
            if (result.success && result.destination_url) {
                // Check if user has reached the destination URL
                // This would require additional tracking mechanisms
                // For now, we rely on the API completion status
                return result.completed === true;
            }

            return false;
        } catch (error) {
            console.error('❌ URL pattern completion check failed:', error);
            return false;
        }
    }

    /**
     * Check completion based on time spent (minimum engagement time)
     */
    async checkTimeBasedCompletion(sessionId, userId, config) {
        try {
            const minimumEngagementTime = config.minimumEngagementTime || 60000; // 1 minute default
            
            // Get session start time from database
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
            
            if (result.success && result.started_at) {
                const startTime = new Date(result.started_at).getTime();
                const currentTime = Date.now();
                const timeSpent = currentTime - startTime;
                
                // Consider completed if user has been engaged for minimum time
                // and the session is still active
                return timeSpent >= minimumEngagementTime && result.status === 'started';
            }

            return false;
        } catch (error) {
            console.error('❌ Time-based completion check failed:', error);
            return false;
        }
    }

    /**
     * Handle completion detection
     */
    async handleCompletion(sessionId, userId) {
        try {
            console.log(`🎉 Processing completion for session: ${sessionId}`);

            // Mark as completed in the database
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
                console.log(`✅ Completion recorded for session: ${sessionId}`);
                
                // Also notify the URL shortener service about completion
                await this.notifyUrlServiceCompletion(sessionId, userId);
                
                // Call completion callback if registered
                const callback = this.completionCallbacks.get(sessionId);
                if (callback && typeof callback === 'function') {
                    callback(sessionId, userId, {
                        success: true,
                        completionTime: Date.now(),
                        method: 'automatic_detection'
                    });
                }
                
                return true;
            } else {
                console.error(`❌ Failed to record completion for session ${sessionId}:`, result.error);
                return false;
            }
        } catch (error) {
            console.error('❌ Error handling completion:', error);
            return false;
        }
    }

    /**
     * Notify the URL shortener service about task completion
     */
    async notifyUrlServiceCompletion(sessionId, userId) {
        try {
            console.log(`📤 Notifying URL service about completion for session: ${sessionId}`);

            // Get session details to find the shortened URL service
            const sessionResponse = await electronFetch(`${this.adminPanelUrl}/api/url-extension/check-completion`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: sessionId,
                    user_id: userId
                })
            });

            const sessionResult = await sessionResponse.json();
            
            if (sessionResult.success && sessionResult.shortened_url) {
                const shortenedUrl = sessionResult.shortened_url;
                console.log(`🔗 Session uses shortened URL: ${shortenedUrl}`);

                // Determine which URL shortener service is being used
                let completionUrl = null;
                let completionData = null;

                if (shortenedUrl.includes('short-jambo.ink')) {
                    // Short-Jambo completion API
                    completionUrl = 'https://short-jambo.ink/api/completion';
                    completionData = {
                        session_id: sessionId,
                        user_id: userId,
                        url: shortenedUrl,
                        completed: true,
                        timestamp: Date.now()
                    };
                } else if (shortenedUrl.includes('linkvertise.com')) {
                    // Linkvertise completion API
                    completionUrl = 'https://linkvertise.com/api/completion';
                    completionData = {
                        session: sessionId,
                        user: userId,
                        link: shortenedUrl,
                        status: 'completed'
                    };
                } else if (shortenedUrl.includes('adfly')) {
                    // AdFly completion API
                    completionUrl = 'https://adf.ly/api/completion';
                    completionData = {
                        session_id: sessionId,
                        user_id: userId,
                        shortened_url: shortenedUrl,
                        completion_status: 'success'
                    };
                }

                // Always try to notify SP5Proxies about completion
                await this.notifyMasterSiteCompletion(sessionId, userId, shortenedUrl);

                // Send completion notification to the URL shortener service
                if (completionUrl && completionData) {
                    try {
                        const completionResponse = await electronFetch(completionUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'User-Agent': 'SP5Proxy-Extension/1.0',
                                'Accept': 'application/json'
                            },
                            body: JSON.stringify(completionData)
                        });

                        if (completionResponse.ok) {
                            const completionResult = await completionResponse.json();
                            console.log(`✅ URL service notified successfully:`, completionResult);
                        } else {
                            console.log(`⚠️ URL service response: ${completionResponse.status}`);
                        }
                    } catch (notifyError) {
                        console.log(`⚠️ Could not notify URL service (this is normal for some services):`, notifyError.message);
                    }
                } else {
                    console.log(`ℹ️ Unknown URL shortener service: ${shortenedUrl}`);
                }

                // Also try generic completion methods
                await this.tryGenericCompletionMethods(sessionId, userId, shortenedUrl);

            } else {
                console.log(`⚠️ Could not get session details for notification`);
            }
        } catch (error) {
            console.error('❌ Error notifying URL service:', error);
        }
    }

    /**
     * Try generic completion methods that work with most URL shorteners
     */
    async tryGenericCompletionMethods(sessionId, userId, shortenedUrl) {
        try {
            console.log(`🔄 Trying generic completion methods for: ${shortenedUrl}`);

            // Method 1: Try to find and call completion API endpoints
            const baseUrl = new URL(shortenedUrl).origin;
            const genericEndpoints = [
                `${baseUrl}/api/complete`,
                `${baseUrl}/api/completion`,
                `${baseUrl}/api/v1/complete`,
                `${baseUrl}/api/v1/completion`,
                `${baseUrl}/complete`,
                `${baseUrl}/completion`
            ];

            for (const endpoint of genericEndpoints) {
                try {
                    const response = await electronFetch(endpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'User-Agent': 'SP5Proxy-Extension/1.0'
                        },
                        body: JSON.stringify({
                            session_id: sessionId,
                            user_id: userId,
                            url: shortenedUrl,
                            status: 'completed',
                            timestamp: Date.now()
                        })
                    });

                    if (response.ok) {
                        console.log(`✅ Generic completion successful via: ${endpoint}`);
                        break;
                    }
                } catch (e) {
                    // Continue to next endpoint
                }
            }

            // Method 2: Try completion via callback parameter
            if (shortenedUrl.includes('?')) {
                const callbackUrl = shortenedUrl + '&completed=1&session=' + sessionId;
                try {
                    await electronFetch(callbackUrl, {
                        method: 'GET',
                        headers: {
                            'User-Agent': 'SP5Proxy-Extension/1.0'
                        }
                    });
                    console.log(`✅ Callback completion attempted: ${callbackUrl}`);
                } catch (e) {
                    // Callback failed, continue
                }
            }

            console.log(`ℹ️ Generic completion methods completed for session: ${sessionId}`);
        } catch (error) {
            console.error('❌ Error in generic completion methods:', error);
        }
    }

    /**
     * Notify SP5Proxies master site about task completion
     */
    async notifyMasterSiteCompletion(sessionId, userId, shortenedUrl) {
        try {
            console.log(`🏠 Notifying SP5Proxies master site about completion: ${sessionId}`);

            // Prepare completion data for SP5Proxies
            const sp5CompletionData = {
                action: 'url_extension_completed',
                session_id: sessionId,
                user_id: userId,
                shortened_url: shortenedUrl,
                completion_time: new Date().toISOString(),
                extension_hours: 6,
                version: '1.0'
            };

            // Try multiple SP5Proxies endpoints for maximum compatibility
            const sp5Endpoints = [
                'https://sp5proxies.com/api/extension/complete',
                'https://sp5proxies.com/extension/complete.php',
                'https://sp5proxies.com/api/url_extension_complete',
                'https://www.sp5proxies.com/api/extension/complete',
                'https://www.sp5proxies.com/extension/complete.php'
            ];

            let completionNotified = false;

            for (const endpoint of sp5Endpoints) {
                try {
                    console.log(`📤 Attempting to notify via: ${endpoint}`);
                    
                    const response = await electronFetch(endpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'User-Agent': 'SP5Proxy-Desktop/1.0',
                            'Accept': 'application/json',
                            'X-SP5-Session': sessionId,
                            'X-SP5-User': userId
                        },
                        body: JSON.stringify(sp5CompletionData)
                    });

                    if (response.ok) {
                        const result = await response.json();
                        console.log(`✅ SP5Proxies notified successfully via ${endpoint}:`, result);
                        completionNotified = true;
                        break;
                    } else {
                        console.log(`⚠️ SP5Proxies endpoint ${endpoint} responded with status: ${response.status}`);
                    }
                } catch (endpointError) {
                    console.log(`⚠️ Could not reach ${endpoint}:`, endpointError.message);
                }
            }

            // Also try GET request with parameters (fallback method)
            if (!completionNotified) {
                try {
                    const getUrl = `https://sp5proxies.com/extension_complete.php?session=${sessionId}&user=${userId}&hours=6&url=${encodeURIComponent(shortenedUrl)}`;
                    console.log(`📤 Trying GET method: ${getUrl}`);
                    
                    const getResponse = await electronFetch(getUrl, {
                        method: 'GET',
                        headers: {
                            'User-Agent': 'SP5Proxy-Desktop/1.0'
                        }
                    });

                    if (getResponse.ok) {
                        console.log(`✅ SP5Proxies notified via GET method`);
                        completionNotified = true;
                    }
                } catch (getError) {
                    console.log(`⚠️ GET method failed:`, getError.message);
                }
            }

            if (completionNotified) {
                console.log(`🎉 SP5Proxies master site successfully notified about completion!`);
            } else {
                console.log(`⚠️ Could not notify SP5Proxies master site (but local completion is recorded)`);
            }

        } catch (error) {
            console.error('❌ Error notifying SP5Proxies master site:', error);
        }
    }

    /**
     * Register a completion callback for a session
     */
    onCompletion(sessionId, callback) {
        this.completionCallbacks.set(sessionId, callback);
    }

    /**
     * Manually mark a session as completed
     */
    async markCompleted(sessionId, userId, method = 'manual') {
        console.log(`✋ Manually marking session as completed: ${sessionId}`);
        
        // Stop automatic tracking
        this.stopTracking(sessionId);
        
        // Handle completion
        return await this.handleCompletion(sessionId, userId);
    }

    /**
     * Get tracking status for a session
     */
    getTrackingStatus(sessionId) {
        const isTracking = this.trackingIntervals.has(sessionId);
        const hasCallback = this.completionCallbacks.has(sessionId);
        
        return {
            isTracking: isTracking,
            hasCallback: hasCallback,
            sessionId: sessionId
        };
    }

    /**
     * Get all active tracking sessions
     */
    getActiveTrackingSessions() {
        return Array.from(this.trackingIntervals.keys());
    }

    /**
     * Cleanup all tracking
     */
    cleanup() {
        console.log('🧹 Cleaning up URL Completion Tracker...');
        
        // Clear all intervals
        for (const [sessionId, interval] of this.trackingIntervals) {
            clearInterval(interval);
        }
        
        // Clear maps
        this.trackingIntervals.clear();
        this.completionCallbacks.clear();
        
        console.log('✅ URL Completion Tracker cleanup completed');
    }
}

module.exports = UrlCompletionTracker;
