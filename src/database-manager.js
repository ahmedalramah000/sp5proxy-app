const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

/**
 * SP5Proxy Database Manager
 * Handles database connections and synchronization between desktop app and PHP admin panel
 */
class DatabaseManager extends EventEmitter {
    constructor() {
        super();
        this.connection = null;
        // Use SQLite for real-time integration
        this.dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'admin-panel', 'data', 'sp5proxy.db');

        // Check if database should be disabled completely
        // Default: disable database to avoid sqlite3 loading issues
        const enableDatabase = process.env.SP5PROXY_ENABLE_DATABASE === '1';
        if (!enableDatabase) {
            console.log('🚫 Database disabled by default (no sqlite3 dependency issues)');
            console.log('💡 Running in memory-only mode for smooth operation');
            console.log('ℹ️ Use SP5PROXY_ENABLE_DATABASE=1 to enable database features');
            this.databaseDisabled = true;
            this.sqlite3 = null;
            this.isConnected = false;
            this.reconnectAttempts = 0;
            this.maxReconnectAttempts = 5;
            this.syncInterval = null;
            this.wsClient = null;
            this.wsReconnectInterval = null;
            this.adminPanelUrl = 'ws://127.0.0.1:3000';
            this.wsReconnectAttempts = 0;
            this.maxWsReconnectAttempts = 10;
            return;
        }

        // Safe SQLite initialization with detailed error handling
        this.sqlite3 = null;
        this.databaseDisabled = false;
        this.initializeSqlite();

        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.syncInterval = null;

        // WebSocket for real-time sync
        this.wsClient = null;
        this.wsReconnectInterval = null;
        this.adminPanelUrl = 'ws://127.0.0.1:3000';
        this.wsReconnectAttempts = 0;
        this.maxWsReconnectAttempts = 10;
    }

    /**
     * Initialize SQLite module safely
     */
    async initializeSqlite() {
        try {
            console.log('📦 Loading sqlite3 module...');

            // Try different sqlite3 loading methods
            let sqlite3Module = null;

            // Method 1: Standard require
            try {
                sqlite3Module = require('sqlite3');
                console.log('✅ sqlite3 loaded via standard require');
            } catch (error1) {
                console.warn('⚠️ Standard sqlite3 require failed:', error1.message);

                // Method 2: Try better-sqlite3 as fallback
                try {
                    const Database = require('better-sqlite3');
                    console.log('✅ Using better-sqlite3 as fallback');
                    this.useBetterSqlite = true;
                    this.Database = Database;
                    return;
                } catch (error2) {
                    console.warn('⚠️ better-sqlite3 fallback failed:', error2.message);

                    // Method 3: Disable database functionality
                    console.warn('⚠️ No SQLite module available - running without database');
                    this.sqlite3 = null;
                    this.databaseDisabled = true;
                    return;
                }
            }

            if (sqlite3Module) {
                this.sqlite3 = sqlite3Module.verbose();
                console.log('✅ sqlite3 module loaded successfully');
            }

        } catch (error) {
            console.error('❌ Failed to initialize SQLite:', error.message);
            console.warn('⚠️ Running without database functionality');
            this.sqlite3 = null;
            this.databaseDisabled = true;
        }
    }

    /**
     * Initialize database connection
     */
    async initialize() {
        try {
            console.log('🗄️ Initializing database connection...');

            // Check if database is disabled
            if (this.databaseDisabled) {
                console.warn('⚠️ Database functionality disabled - running in memory-only mode');
                this.isConnected = false;
                return;
            }

            // Wait for SQLite initialization to complete
            if (!this.sqlite3 && !this.Database && !this.databaseDisabled) {
                console.log('⏳ Waiting for SQLite initialization...');
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            if (this.sqlite3 || this.Database) {
                await this.connect();
                await this.setupTables();
                this.startSyncMonitoring();
                this.connectWebSocket();
                this.startSessionCleanup();
                console.log('✅ Database manager initialized successfully');
            } else {
                console.warn('⚠️ No database module available - running without database');
                this.isConnected = false;
            }
        } catch (error) {
            console.error('❌ Failed to initialize database manager:', error);
            console.warn('⚠️ Continuing without database functionality');
            this.isConnected = false;
            this.databaseDisabled = true;
        }
    }

    /**
     * Connect to admin panel WebSocket for real-time sync
     */
    connectWebSocket() {
        try {
            if (this.wsClient && this.wsClient.readyState === WebSocket.OPEN) {
                return;
            }

            console.log('🔌 Connecting to admin panel WebSocket...');
            this.wsClient = new WebSocket(this.adminPanelUrl);

            this.wsClient.on('open', () => {
                console.log('✅ WebSocket connected to admin panel');
                this.wsReconnectAttempts = 0;

                // Send identification
                this.wsClient.send(JSON.stringify({
                    type: 'identify',
                    source: 'desktop_app',
                    timestamp: new Date().toISOString()
                }));
            });

            this.wsClient.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleWebSocketMessage(message);
                } catch (error) {
                    console.error('❌ Failed to parse WebSocket message:', error);
                }
            });

            this.wsClient.on('close', () => {
                console.log('🔌 WebSocket connection closed');
                this.scheduleWebSocketReconnect();
            });

            this.wsClient.on('error', (error) => {
                console.error('❌ WebSocket error:', error);
                this.scheduleWebSocketReconnect();
            });

        } catch (error) {
            console.error('❌ Failed to connect WebSocket:', error);
            this.scheduleWebSocketReconnect();
        }
    }

    /**
     * Handle WebSocket messages from admin panel
     */
    handleWebSocketMessage(message) {
        switch (message.type) {
            case 'url_service_updated':
                this.handleUrlServiceUpdate(message.data);
                break;
            case 'url_service_added':
                this.handleUrlServiceAdded(message.data);
                break;
            case 'url_service_deleted':
                this.handleUrlServiceDeleted(message.data);
                break;
            case 'config_updated':
                this.emit('configUpdated', message.data);
                break;
            case 'welcome':
                console.log('🤝 WebSocket welcome message received');
                break;
            case 'sync_event':
                console.log('🔄 Sync event received:', message.data);
                break;
            case 'ping':
                // Send pong response
                this.sendWebSocketMessage('pong', { timestamp: Date.now() });
                break;
            default:
                console.log(`🔄 Unknown WebSocket message type: ${message.type}`);
        }
    }

    /**
     * Schedule WebSocket reconnection
     */
    scheduleWebSocketReconnect() {
        if (this.wsReconnectAttempts >= this.maxWsReconnectAttempts) {
            console.error('❌ Max WebSocket reconnection attempts reached');
            return;
        }

        if (this.wsReconnectInterval) {
            clearTimeout(this.wsReconnectInterval);
        }

        this.wsReconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.wsReconnectAttempts), 30000);

        console.log(`🔄 Scheduling WebSocket reconnection (${this.wsReconnectAttempts}/${this.maxWsReconnectAttempts}) in ${delay}ms...`);

        this.wsReconnectInterval = setTimeout(() => {
            this.connectWebSocket();
        }, delay);
    }

    /**
     * Send WebSocket message to admin panel
     */
    sendWebSocketMessage(type, data) {
        if (this.wsClient && this.wsClient.readyState === WebSocket.OPEN) {
            this.wsClient.send(JSON.stringify({
                type,
                data,
                source: 'desktop_app',
                timestamp: new Date().toISOString()
            }));
        }
    }

    /**
     * Establish database connection
     */
    async connect() {
        try {
            // Check if any database module is available
            if (!this.sqlite3 && !this.Database) {
                throw new Error('No database module available - database functionality disabled');
            }

            console.log('📁 Database path:', this.dbPath);

            // Ensure data directory exists
            const dataDir = path.dirname(this.dbPath);
            console.log('📁 Data directory:', dataDir);

            if (!require('fs').existsSync(dataDir)) {
                console.log('📁 Creating data directory...');
                require('fs').mkdirSync(dataDir, { recursive: true });
                console.log('✅ Data directory created');
            }

            console.log('🔌 Connecting to SQLite database...');

            if (this.useBetterSqlite && this.Database) {
                // Use better-sqlite3
                this.connection = new this.Database(this.dbPath);
                console.log('✅ better-sqlite3 database connected successfully');
            } else if (this.sqlite3) {
                // Use sqlite3
                this.connection = new this.sqlite3.Database(this.dbPath);
                console.log('✅ sqlite3 database connected successfully');
            } else {
                throw new Error('No database module available');
            }

            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.emit('connected');
        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
            console.error('📋 Error details:', error);
            this.isConnected = false;
            throw error;
        }
    }

    /**
     * Handle connection errors and reconnection
     */
    async handleConnectionError(error) {
        console.error('🔌 Database connection error:', error);
        this.isConnected = false;
        this.emit('disconnected', error);
        
        if (error.code === 'PROTOCOL_CONNECTION_LOST' || error.code === 'ECONNRESET') {
            await this.handleReconnect();
        }
    }

    /**
     * Attempt to reconnect to database
     */
    async handleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ Max reconnection attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        
        console.log(`🔄 Attempting database reconnection (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms...`);
        
        setTimeout(async () => {
            try {
                await this.connect();
            } catch (error) {
                console.error('❌ Reconnection failed:', error);
            }
        }, delay);
    }

    /**
     * Setup database tables if they don't exist
     */
    async setupTables() {
        return new Promise((resolve, reject) => {
            const schema = `
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT UNIQUE NOT NULL,
                    username TEXT,
                    email TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
                    status TEXT DEFAULT 'active',
                    trial_used BOOLEAN DEFAULT 0,
                    total_connection_time INTEGER DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS active_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    session_id TEXT UNIQUE NOT NULL,
                    proxy_host TEXT,
                    proxy_port INTEGER,
                    proxy_type TEXT DEFAULT 'socks5',
                    external_ip TEXT,
                    location TEXT,
                    country_code TEXT,
                    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    expires_at DATETIME,
                    is_trial BOOLEAN DEFAULT 0,
                    status TEXT DEFAULT 'connecting'
                );

                CREATE TABLE IF NOT EXISTS url_services (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    base_url TEXT NOT NULL,
                    api_endpoint TEXT,
                    api_key TEXT,
                    is_active BOOLEAN DEFAULT 1,
                    priority INTEGER DEFAULT 1,
                    success_rate REAL DEFAULT 100.0,
                    last_used DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS extension_codes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    code TEXT UNIQUE NOT NULL,
                    url_service_id INTEGER,
                    shortened_url TEXT,
                    original_url TEXT,
                    generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    expires_at DATETIME,
                    used_at DATETIME,
                    is_used BOOLEAN DEFAULT 0,
                    extension_hours INTEGER DEFAULT 4
                );

                CREATE TABLE IF NOT EXISTS system_config (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    config_key TEXT UNIQUE NOT NULL,
                    config_value TEXT,
                    config_type TEXT DEFAULT 'string',
                    description TEXT,
                    is_public BOOLEAN DEFAULT 0,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_by TEXT
                );

                CREATE TABLE IF NOT EXISTS connection_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    session_id TEXT,
                    action TEXT NOT NULL,
                    proxy_host TEXT,
                    proxy_port INTEGER,
                    external_ip TEXT,
                    location TEXT,
                    duration_seconds INTEGER,
                    is_trial BOOLEAN DEFAULT 0,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    details TEXT
                );

                CREATE TABLE IF NOT EXISTS admin_users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT DEFAULT 'viewer',
                    is_active BOOLEAN DEFAULT 1,
                    last_login DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS sync_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_type TEXT NOT NULL,
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    data TEXT,
                    source TEXT NOT NULL,
                    processed BOOLEAN DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            `;

            this.connection.exec(schema, (err) => {
                if (err) {
                    console.error('❌ Failed to setup database tables:', err);
                    reject(err);
                } else {
                    console.log('✅ Database tables created successfully');
                    
                    // Apply database migrations
                    this.applyMigrations()
                        .then(() => this.insertInitialData())
                        .then(resolve)
                        .catch(reject);
                }
            });
        });
    }

    /**
     * Apply database migrations
     */
    async applyMigrations() {
        return new Promise((resolve, reject) => {
            console.log('🔄 Applying database migrations...');
            
            // Migration 1: Add updated_at column to users table
            const migrations = [
                `PRAGMA foreign_keys = OFF;`,
                `ALTER TABLE users ADD COLUMN updated_at TEXT;`,
                `UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;`,
                `PRAGMA foreign_keys = ON;`
            ];

            let completed = 0;
            migrations.forEach((migration, index) => {
                this.connection.exec(migration, (err) => {
                    if (err && !err.message.includes('duplicate column name')) {
                        console.warn(`⚠️ Migration ${index + 1} warning:`, err.message);
                    } else {
                        console.log(`✅ Migration ${index + 1} completed`);
                    }
                    
                    completed++;
                    if (completed === migrations.length) {
                        console.log('✅ All database migrations completed');
                        resolve();
                    }
                });
            });
        });
    }

    /**
     * Insert initial configuration data (not demo data)
     */
    async insertInitialData() {
        return new Promise((resolve, reject) => {
            // Only insert essential system configuration - NO DUMMY URL SERVICES
            const initialData = `
                INSERT OR IGNORE INTO system_config (config_key, config_value, config_type, description, is_public) VALUES
                ('trial_duration_minutes', '10', 'number', 'Free trial duration in minutes', 1),
                ('extension_duration_hours', '4', 'number', 'Extension duration in hours', 1),
                ('max_concurrent_sessions', '1', 'number', 'Maximum concurrent sessions per user', 1),
                ('enable_trial_system', 'true', 'boolean', 'Enable/disable trial system', 1),
                ('enable_extensions', 'true', 'boolean', 'Enable/disable extension system', 1),
                ('server_maintenance', 'false', 'boolean', 'Server maintenance mode', 1);

                INSERT OR IGNORE INTO admin_users (username, email, password_hash, role) VALUES
                ('admin', 'admin@sp5proxy.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin');
            `;

            this.connection.exec(initialData, (err) => {
                if (err) {
                    console.error('❌ Failed to insert initial data:', err);
                    reject(err);
                } else {
                    console.log('✅ Real configuration data inserted successfully (no dummy data)');
                    resolve();
                }
            });
        });
    }

    /**
     * Start monitoring for sync events
     */
    startSyncMonitoring() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }

        this.syncInterval = setInterval(async () => {
            try {
                await this.processSyncEvents();
            } catch (error) {
                console.error('❌ Sync monitoring error:', error);
            }
        }, 5000); // Check every 5 seconds

        console.log('🔄 Sync monitoring started');
    }

    /**
     * Process pending sync events
     */
    async processSyncEvents() {
        if (!this.isConnected) return;

        return new Promise((resolve, reject) => {
            this.connection.all(
                `SELECT * FROM sync_events
                 WHERE processed = 0
                 ORDER BY created_at ASC LIMIT 10`,
                [],
                (err, events) => {
                    if (err) {
                        console.error('❌ Failed to process sync events:', err);
                        resolve();
                        return;
                    }

                    if (events.length === 0) {
                        resolve();
                        return;
                    }

                    let processed = 0;
                    events.forEach(event => {
                        this.handleSyncEvent(event);

                        // Mark as processed
                        this.connection.run(
                            'UPDATE sync_events SET processed = 1 WHERE id = ?',
                            [event.id],
                            (err) => {
                                if (err) {
                                    console.error('❌ Failed to mark sync event as processed:', err);
                                }
                                processed++;
                                if (processed === events.length) {
                                    resolve();
                                }
                            }
                        );
                    });
                }
            );
        });
    }

    /**
     * Handle individual sync event
     */
    async handleSyncEvent(event) {
        try {
            const data = JSON.parse(event.data);
            
            switch (event.event_type) {
                case 'url_service_updated':
                    this.emit('urlServiceUpdated', data);
                    break;
                case 'config_updated':
                    this.emit('configUpdated', data);
                    break;
                case 'user_status_changed':
                    this.emit('userStatusChanged', data);
                    break;
                default:
                    console.log(`🔄 Unknown sync event: ${event.event_type}`);
            }
        } catch (error) {
            console.error('❌ Failed to handle sync event:', error);
        }
    }

    /**
     * Create a sync event
     */
    async createSyncEvent(eventType, entityType, entityId, data) {
        if (!this.isConnected) return;

        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO sync_events (event_type, entity_type, entity_id, data, source)
                VALUES (?, ?, ?, ?, ?)
            `;

            this.connection.run(sql, [
                eventType,
                entityType,
                entityId,
                JSON.stringify(data),
                'desktop_app'  // Default source value
            ], function(err) {
                if (err) {
                    console.error('❌ Failed to create sync event:', err);
                } else {
                    console.log(`✅ Sync event created: ${eventType}`);
                }
                resolve();
            });
        });
    }

    /**
     * User management methods
     */
    async createOrUpdateUser(userId, userData = {}) {
        if (!this.isConnected || this.databaseDisabled) {
            console.warn('⚠️ Database not available - createOrUpdateUser skipped');
            
            // Try VPS sync instead
            try {
                const VPSSync = require('./vps-sync');
                const vpsSync = new VPSSync();
                await vpsSync.syncUser({ userId, ...userData });
                console.log('📤 User data sent to VPS:', userId);
            } catch (err) {
                console.warn('⚠️ VPS sync failed for user:', err.message);
            }
            
            return { id: userId, ...userData };
        }

        return new Promise((resolve, reject) => {
            const sql = `
                INSERT OR REPLACE INTO users (user_id, username, email, updated_at)
                VALUES (?, ?, ?, datetime('now'))
            `;

            this.connection.run(sql, [
                userId,
                userData.username || null,
                userData.email || null
            ], function(err) {
                if (err) {
                    console.error('❌ Failed to create/update user:', err);
                    resolve(false);
                } else {
                    console.log(`✅ User created/updated: ${userId}`);
                    resolve(true);
                }
            });
        });
    }

    /**
     * Session management methods
     */
    async createSession(sessionData) {
        if (!this.isConnected || this.databaseDisabled) {
            console.warn('⚠️ Database not available - createSession skipped');
            
            // Try VPS sync instead
            try {
                const VPSAdminSync = require('./vps-admin-sync');
                const adminSync = new VPSAdminSync();
                adminSync.connect();
                await adminSync.syncConnection(sessionData);
                console.log('📤 Session data sent to Admin Panel:', sessionData.sessionId);
                
                // Update location when available
                if (sessionData.externalIP && sessionData.location) {
                    await adminSync.updateLocation(sessionData.sessionId, {
                        externalIP: sessionData.externalIP,
                        location: sessionData.location,
                        countryCode: sessionData.countryCode
                    });
                }
            } catch (err) {
                console.warn('⚠️ Admin Panel sync failed for session:', err.message);
            }
            
            return { id: Date.now().toString(), ...sessionData };
        }

        return new Promise((resolve, reject) => {
            // First, clean up any existing sessions for this user
            this.connection.run(
                `UPDATE active_sessions SET status = 'disconnected' 
                 WHERE user_id = ? AND status = 'connected'`,
                [sessionData.userId],
                (err) => {
                    if (err) {
                        console.warn('⚠️ Failed to cleanup old sessions:', err);
                    } else {
                        console.log(`🧹 Cleaned up old sessions for user: ${sessionData.userId}`);
                    }

                    // Now create the new session
                    const sql = `
                        INSERT INTO active_sessions
                        (user_id, session_id, proxy_host, proxy_port, proxy_type,
                         external_ip, location, country_code, started_at, expires_at, is_trial, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)
                    `;

                    this.connection.run(sql, [
                        sessionData.userId,
                        sessionData.sessionId,
                        sessionData.proxyHost,
                        sessionData.proxyPort,
                        sessionData.proxyType || 'socks5',
                        sessionData.externalIP,
                        sessionData.location,
                        sessionData.countryCode,
                        sessionData.expiresAt,
                        sessionData.isTrial ? 1 : 0,
                        sessionData.status || 'connecting'
                    ], function(err) {
                        if (err) {
                            console.error('❌ Failed to create session:', err);
                            resolve(null);
                        } else {
                            console.log(`✅ Session created: ${sessionData.sessionId}`);
                            
                            // Create sync event for real-time update
                            this.createSyncEvent('session_created', 'session', sessionData.sessionId, {
                                userId: sessionData.userId,
                                sessionId: sessionData.sessionId,
                                proxyHost: sessionData.proxyHost,
                                proxyPort: sessionData.proxyPort,
                                status: sessionData.status || 'connecting'
                            }).catch(syncErr => {
                                console.warn('⚠️ Failed to create sync event:', syncErr);
                            });
                            
                            resolve(this.lastID);
                        }
                    }.bind(this));
                }
            );
        });
    }

    /**
     * Clean up old sessions for a user
     */
    async cleanupUserSessions(userId) {
        if (!this.isConnected) return false;

        return new Promise((resolve, reject) => {
            this.connection.run(
                `UPDATE active_sessions SET status = 'disconnected' 
                 WHERE user_id = ? AND status IN ('connected', 'connecting')`,
                [userId],
                function(err) {
                    if (err) {
                        console.error('❌ Failed to cleanup user sessions:', err);
                        resolve(false);
                    } else {
                        if (this.changes > 0) {
                            console.log(`🧹 Cleaned up ${this.changes} old sessions for user: ${userId}`);
                        }
                        resolve(true);
                    }
                }
            );
        });
    }

    /**
     * Remove expired sessions
     */
    async removeExpiredSessions() {
        if (!this.isConnected) return false;

        return new Promise((resolve, reject) => {
            const now = new Date().toISOString();
            
            this.connection.run(
                `UPDATE active_sessions SET status = 'expired' 
                 WHERE expires_at < ? AND status = 'connected'`,
                [now],
                function(err) {
                    if (err) {
                        console.error('❌ Failed to remove expired sessions:', err);
                        resolve(false);
                    } else {
                        if (this.changes > 0) {
                            console.log(`⏰ Marked ${this.changes} sessions as expired`);
                        }
                        resolve(true);
                    }
                }
            );
        });
    }

    async updateSession(sessionId, updates) {
        if (!this.isConnected) return false;

        return new Promise((resolve, reject) => {
            const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
            const values = Object.values(updates);
            values.push(sessionId);

            const sql = `UPDATE active_sessions SET ${setClause} WHERE session_id = ?`;

            this.connection.run(sql, values, function(err) {
                if (err) {
                    console.error('❌ Failed to update session:', err);
                    resolve(false);
                } else {
                    console.log(`✅ Session updated: ${sessionId}`);
                    
                    // Create sync event for real-time update if location was updated
                    if (updates.location || updates.external_ip) {
                        this.createSyncEvent('session_updated', 'session', sessionId, updates).catch(syncErr => {
                            console.warn('⚠️ Failed to create sync event for session update:', syncErr);
                        });
                    }
                    
                    resolve(true);
                }
            }.bind(this));
        });
    }

    /**
     * Update active session (alias for updateSession)
     */
    async updateActiveSession(sessionId, updates) {
        return await this.updateSession(sessionId, updates);
    }

    /**
     * Update session location and external IP
     */
    async updateSessionLocation(sessionId, externalIP, location, countryCode) {
        if (!this.isConnected) return false;

        const updates = {
            external_ip: externalIP,
            location: location,
            country_code: countryCode
        };

        console.log(`📍 Updating session location: ${sessionId}`);
        console.log(`   External IP: ${externalIP}`);
        console.log(`   Location: ${location}`);
        console.log(`   Country Code: ${countryCode}`);

        const result = await this.updateSession(sessionId, updates);
        
        if (result) {
            // Send WebSocket update to admin panel
            this.sendWebSocketMessage('session_location_updated', {
                sessionId: sessionId,
                externalIP: externalIP,
                location: location,
                countryCode: countryCode
            });
        }

        return result;
    }

    async endSession(sessionId, duration = null) {
        if (!this.isConnected || this.databaseDisabled) {
            console.warn('⚠️ Database not available - endSession skipped');
            
            // Try VPS sync instead
            try {
                const VPSAdminSync = require('./vps-admin-sync');
                const adminSync = new VPSAdminSync();
                adminSync.connect();
                await adminSync.syncDisconnection(sessionId);
                console.log('📤 Session end sent to Admin Panel:', sessionId);
            } catch (err) {
                console.warn('⚠️ Admin Panel sync failed for session end:', err.message);
            }
            
            return true;
        }

        return new Promise((resolve, reject) => {
            // First update the session status
            this.connection.run(
                `UPDATE active_sessions SET status = 'disconnected' WHERE session_id = ?`,
                [sessionId],
                (err) => {
                    if (err) {
                        console.error('❌ Failed to end session:', err);
                        resolve(false);
                        return;
                    }

                    // Log the disconnection if duration provided
                    if (duration !== null) {
                        this.connection.get(
                            'SELECT user_id, is_trial FROM active_sessions WHERE session_id = ?',
                            [sessionId],
                            (err, session) => {
                                if (!err && session) {
                                    this.connection.run(
                                        `INSERT INTO connection_logs
                                         (user_id, session_id, action, duration_seconds, is_trial)
                                         VALUES (?, ?, 'disconnect', ?, ?)`,
                                        [session.user_id, sessionId, duration, session.is_trial],
                                        (err) => {
                                            if (err) {
                                                console.error('❌ Failed to log disconnection:', err);
                                            } else {
                                                console.log(`✅ Session ended and logged: ${sessionId}`);
                                            }
                                        }
                                    );
                                }
                            }
                        );
                    }

                    console.log(`✅ Session ended: ${sessionId}`);
                    resolve(true);
                }
            );
        });
    }

    /**
     * Get URL services
     */
    async getUrlServices() {
        if (!this.isConnected) return [];

        return new Promise((resolve, reject) => {
            this.connection.all(
                'SELECT * FROM url_services ORDER BY name ASC',
                [],
                (err, rows) => {
                    if (err) {
                        console.error('❌ Failed to get URL services:', err);
                        resolve([]);
                    } else {
                        resolve(rows);
                    }
                }
            );
        });
    }

    /**
     * Add URL service
     */
    async addUrlService(serviceData) {
        if (!this.isConnected) return null;

        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO url_services (name, url, base_url, api_endpoint, api_key, is_active, priority)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;

            this.connection.run(sql, [
                serviceData.name,
                serviceData.base_url,  // Populate required url field
                serviceData.base_url,
                serviceData.api_endpoint || null,
                serviceData.api_key || null,
                serviceData.is_active !== undefined ? serviceData.is_active : 1,
                serviceData.priority || 1
            ], async (err) => {
                if (err) {
                    console.error('❌ Failed to add URL service:', err);
                    resolve(null);
                } else {
                    const newId = this.lastID;
                    console.log(`✅ URL service added: ${serviceData.name}`);

                    // Create sync event
                    await this.createSyncEvent('url_service_added', 'url_service', newId, {
                        id: newId,
                        ...serviceData
                    });

                    // Send WebSocket notification
                    this.sendWebSocketMessage('url_service_added', {
                        id: newId,
                        ...serviceData
                    });

                    resolve(newId);
                }
            });
        });
    }

    /**
     * Update URL service
     */
    async updateUrlService(id, updates) {
        if (!this.isConnected) return false;

        return new Promise((resolve, reject) => {
            const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
            const values = Object.values(updates);
            values.push(id);

            const sql = `UPDATE url_services SET ${setClause}, updated_at = datetime('now') WHERE id = ?`;

            this.connection.run(sql, values, async (err) => {
                if (err) {
                    console.error('❌ Failed to update URL service:', err);
                    resolve(false);
                } else {
                    console.log(`✅ URL service updated: ${id}`);

                    // Get updated service data
                    const updatedService = await this.getUrlServiceById(id);

                    // Create sync event
                    await this.createSyncEvent('url_service_updated', 'url_service', id, updatedService);

                    // Send WebSocket notification
                    this.sendWebSocketMessage('url_service_updated', updatedService);

                    resolve(true);
                }
            });
        });
    }

    /**
     * Delete URL service
     */
    async deleteUrlService(id) {
        if (!this.isConnected) return false;

        return new Promise(async (resolve, reject) => {
            // Get service data before deletion for sync event
            const serviceData = await this.getUrlServiceById(id);

            this.connection.run(
                'DELETE FROM url_services WHERE id = ?',
                [id],
                async (err) => {
                    if (err) {
                        console.error('❌ Failed to delete URL service:', err);
                        resolve(false);
                    } else {
                        console.log(`✅ URL service deleted: ${id}`);

                        // Create sync event
                        await this.createSyncEvent('url_service_deleted', 'url_service', id, serviceData);

                        // Send WebSocket notification
                        this.sendWebSocketMessage('url_service_deleted', { id, ...serviceData });

                        resolve(true);
                    }
                }
            );
        });
    }

    /**
     * Get URL service by ID
     */
    async getUrlServiceById(id) {
        if (!this.isConnected) return null;

        return new Promise((resolve, reject) => {
            this.connection.get(
                'SELECT * FROM url_services WHERE id = ?',
                [id],
                (err, row) => {
                    if (err) {
                        console.error('❌ Failed to get URL service:', err);
                        resolve(null);
                    } else {
                        resolve(row);
                    }
                }
            );
        });
    }

    /**
     * Update URL service priority
     */
    async updateUrlServicePriority(id, priority) {
        return this.updateUrlService(id, { priority });
    }

    /**
     * Toggle URL service active status
     */
    async toggleUrlServiceStatus(id, isActive) {
        return this.updateUrlService(id, { is_active: isActive ? 1 : 0 });
    }

    /**
     * Update URL service success rate
     */
    async updateUrlServiceSuccessRate(id, successRate) {
        return this.updateUrlService(id, {
            success_rate: successRate,
            last_used: new Date().toISOString()
        });
    }

    /**
     * Handle URL service update from admin panel
     */
    async handleUrlServiceUpdate(data) {
        try {
            console.log('🔄 Handling URL service update from admin panel:', data);

            // Update local database without triggering sync events
            const setClause = Object.keys(data).filter(key => key !== 'id').map(key => `${key} = ?`).join(', ');
            const values = Object.keys(data).filter(key => key !== 'id').map(key => data[key]);
            values.push(data.id);

            const sql = `UPDATE url_services SET ${setClause}, updated_at = datetime('now') WHERE id = ?`;

            return new Promise((resolve, reject) => {
                this.connection.run(sql, values, (err) => {
                    if (err) {
                        console.error('❌ Failed to handle URL service update:', err);
                        resolve(false);
                    } else {
                        console.log(`✅ URL service updated from admin panel: ${data.id}`);
                        this.emit('urlServiceUpdated', data);
                        resolve(true);
                    }
                });
            });
        } catch (error) {
            console.error('❌ Error handling URL service update:', error);
        }
    }

    /**
     * Handle URL service addition from admin panel
     */
    async handleUrlServiceAdded(data) {
        try {
            console.log('🔄 Handling URL service addition from admin panel:', data);

            // Add to local database without triggering sync events
            const sql = `
                INSERT OR REPLACE INTO url_services (id, name, url, base_url, api_endpoint, api_key, is_active, priority)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;

            return new Promise((resolve, reject) => {
                this.connection.run(sql, [
                    data.id,
                    data.name,
                    data.base_url,  // Populate required url field
                    data.base_url,
                    data.api_endpoint || null,
                    data.api_key || null,
                    data.is_active !== undefined ? data.is_active : 1,
                    data.priority || 1
                ], (err) => {
                    if (err) {
                        console.error('❌ Failed to handle URL service addition:', err);
                        resolve(false);
                    } else {
                        console.log(`✅ URL service added from admin panel: ${data.name}`);
                        this.emit('urlServiceAdded', data);
                        resolve(true);
                    }
                });
            });
        } catch (error) {
            console.error('❌ Error handling URL service addition:', error);
        }
    }

    /**
     * Handle URL service deletion from admin panel
     */
    async handleUrlServiceDeleted(data) {
        try {
            console.log('🔄 Handling URL service deletion from admin panel:', data);

            // Delete from local database without triggering sync events
            return new Promise((resolve, reject) => {
                this.connection.run(
                    'DELETE FROM url_services WHERE id = ?',
                    [data.id],
                    (err) => {
                        if (err) {
                            console.error('❌ Failed to handle URL service deletion:', err);
                            resolve(false);
                        } else {
                            console.log(`✅ URL service deleted from admin panel: ${data.id}`);
                            this.emit('urlServiceDeleted', data);
                            resolve(true);
                        }
                    }
                );
            });
        } catch (error) {
            console.error('❌ Error handling URL service deletion:', error);
        }
    }

    /**
     * Start automatic session cleanup
     */
    startSessionCleanup() {
        // Clean up expired sessions every 5 minutes
        this.cleanupInterval = setInterval(async () => {
            try {
                await this.removeExpiredSessions();
            } catch (error) {
                console.error('❌ Session cleanup error:', error);
            }
        }, 5 * 60 * 1000); // 5 minutes

        console.log('🧹 Automatic session cleanup started');
    }

    /**
     * Stop automatic session cleanup
     */
    stopSessionCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            console.log('🧹 Automatic session cleanup stopped');
        }
    }

    /**
     * Cleanup and close connection
     */
    async cleanup() {
        try {
            console.log('🗄️ Starting database cleanup...');

            // Clear all intervals first
            if (this.syncInterval) {
                clearInterval(this.syncInterval);
                this.syncInterval = null;
                console.log('🧹 Sync interval cleared');
            }

            if (this.cleanupInterval) {
                clearInterval(this.cleanupInterval);
                this.cleanupInterval = null;
                console.log('🧹 Cleanup interval cleared');
            }

            if (this.wsReconnectInterval) {
                clearTimeout(this.wsReconnectInterval);
                this.wsReconnectInterval = null;
                console.log('🧹 WebSocket reconnect timeout cleared');
            }

            // Close WebSocket connection
            if (this.wsClient) {
                this.wsClient.removeAllListeners();
                this.wsClient.close();
                this.wsClient = null;
                console.log('🔌 WebSocket connection closed');
            }

            // Close database connection safely
            if (this.connection) {
                await new Promise((resolve) => {
                    this.connection.close((err) => {
                        if (err) {
                            console.error('❌ Error closing database:', err);
                        } else {
                            console.log('🗄️ Database connection closed successfully');
                        }
                        resolve();
                    });
                });
                this.connection = null;
            }

            // Call SQLite shutdown if available
            if (this.sqlite3 && typeof this.sqlite3.shutdown === 'function') {
                try {
                    this.sqlite3.shutdown();
                    console.log('🔧 SQLite shutdown called');
                } catch (shutdownError) {
                    console.warn('⚠️ SQLite shutdown warning:', shutdownError.message);
                }
            }

            this.isConnected = false;
            console.log('✅ Database manager cleaned up successfully');
        } catch (error) {
            console.error('❌ Database cleanup error:', error);
        }
    }

    /**
     * Close database connection (public method)
     */
    async close() {
        return await this.cleanup();
    }
}

module.exports = DatabaseManager;
