const express = require('express');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const WebSocket = require('ws');
const http = require('http');
const bcrypt = require('bcrypt');
const session = require('express-session');

/**
 * SP5Proxy Admin Panel Server (Node.js Implementation)
 * Fully migrated from PHP to Node.js for better desktop integration
 */

// Configuration
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';

// Initialize Express App
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files with aggressive cache-busting headers for admin panel assets
app.use('/css', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Last-Modified', new Date().toUTCString());
    res.setHeader('ETag', Date.now().toString());
    console.log(`🎨 Serving CSS: ${req.url} with cache-busting`);
    next();
}, express.static(path.join(__dirname, 'public/css')));

app.use('/js', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Last-Modified', new Date().toUTCString());
    res.setHeader('ETag', Date.now().toString());
    console.log(`📜 Serving JS: ${req.url} with cache-busting`);
    next();
}, express.static(path.join(__dirname, 'public/js')));

app.use('/img', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    console.log(`🖼️ Serving Image: ${req.url} with cache-busting`);
    next();
}, express.static(path.join(__dirname, 'public/img')));

app.use(express.static(path.join(__dirname, 'public')));

// Session middleware (memory store - for production use Redis/MongoDB store)
app.use(session({
    secret: process.env.SESSION_SECRET || require('crypto').randomBytes(64).toString('hex'),
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 86400000 } // 24 hours
}));

// Database setup
const dbPath = path.join(__dirname, 'data', 'sp5proxy.db');
const dataDir = path.dirname(dbPath);

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize SQLite database
const db = new sqlite3.Database(dbPath);

// Initialize database schema
function initializeDatabase() {
    const schema = `
        -- Users table
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
        
        -- Active sessions table
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
            ended_at DATETIME,
            expires_at DATETIME,
            is_trial BOOLEAN DEFAULT 0,
            status TEXT DEFAULT 'connecting',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        -- URL services table
        CREATE TABLE IF NOT EXISTS url_services (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            base_url TEXT NOT NULL,
            shortened_url TEXT,
            target_url TEXT,
            api_endpoint TEXT,
            api_key TEXT,
            is_active BOOLEAN DEFAULT 1,
            priority INTEGER DEFAULT 1,
            success_rate REAL DEFAULT 100.0,
            last_used DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        -- System configuration table
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
        
        -- Admin users table
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
        
        -- Connection logs table
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
            details TEXT,
            status TEXT
        );

        -- URL extension tracking table
        CREATE TABLE IF NOT EXISTS url_extension_tracking (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            session_id TEXT UNIQUE NOT NULL,
            shortened_url TEXT NOT NULL,
            destination_url TEXT NOT NULL,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME,
            completion_verified BOOLEAN DEFAULT 0,
            extension_granted BOOLEAN DEFAULT 0,
            extension_hours INTEGER DEFAULT 6,
            user_ip TEXT,
            user_agent TEXT,
            status TEXT DEFAULT 'pending'
        );
        
        -- Extension logs table
        CREATE TABLE IF NOT EXISTS extension_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            session_id TEXT,
            extension_code TEXT,
            hours_added INTEGER DEFAULT 0,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Sync events table - UPDATED with proper source column
        CREATE TABLE IF NOT EXISTS sync_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            data TEXT,
            source TEXT NOT NULL DEFAULT 'unknown',
            processed BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `;

    db.exec(schema, (err) => {
        if (err) {
            console.error('❌ Failed to initialize database:', err);
        } else {
            console.log('✅ Database initialized successfully');
            
            // Add default admin user if none exists
            db.get("SELECT COUNT(*) as count FROM admin_users", (err, row) => {
                if (err) {
                    console.error('❌ Failed to check admin users:', err);
                    return;
                }
                
                if (row.count === 0) {
                    // Hash default password: admin123
                    bcrypt.hash('admin123', 10, (err, hash) => {
                        if (err) {
                            console.error('❌ Failed to hash password:', err);
                            return;
                        }
                        
                        const sql = `
                            INSERT INTO admin_users (username, email, password_hash, role) 
                            VALUES (?, ?, ?, ?)
                        `;
                        
                        db.run(sql, ['admin', 'admin@sp5proxy.com', hash, 'admin'], (err) => {
                            if (err) {
                                console.error('❌ Failed to create default admin user:', err);
                            } else {
                                console.log('✅ Default admin user created successfully');
                            }
                        });
                    });
                }
            });
            
            // Insert default system configuration if none exists
            db.get("SELECT COUNT(*) as count FROM system_config", (err, row) => {
                if (err) {
                    console.error('❌ Failed to check system config:', err);
                    return;
                }
                
                if (row.count === 0) {
                    console.log('⚙️ Creating default system configuration...');
                    
                    const defaultConfig = [
                        ['trial_duration_minutes', '10', 'number', 'Free trial duration in minutes', 1],
                        ['max_concurrent_sessions', '1', 'number', 'Maximum concurrent sessions per user', 1],
                        ['enable_trial_system', 'true', 'boolean', 'Enable/disable trial system', 1],
                        ['enable_url_extensions', 'true', 'boolean', 'Enable/disable URL extension system', 1],
                        ['shortened_url', '', 'string', 'Shortened URL for extensions', 1],
                        ['destination_url', '', 'string', 'Destination URL after completing shortened URL', 1],
                        ['extension_hours', '6', 'number', 'Hours to add when extension is completed', 1],
                        ['server_maintenance', 'false', 'boolean', 'Server maintenance mode', 1]
                    ];
                    
                    const insertSql = `
                        INSERT INTO system_config (config_key, config_value, config_type, description, is_public)
                        VALUES (?, ?, ?, ?, ?)
                    `;
                    
                    defaultConfig.forEach(config => {
                        db.run(insertSql, config, (err) => {
                            if (err) {
                                console.error(`❌ Failed to insert config ${config[0]}:`, err);
                            }
                        });
                    });
                }
            });
        }
    });
}

// Enhanced authentication middleware
function requireAuth(req, res, next) {
    const sessionId = req.headers['x-session-id'] || req.query.session;
    
    if (!sessionId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    db.get(`
        SELECT * FROM admin_sessions 
        WHERE session_id = ? AND expires_at > datetime('now')
    `, [sessionId], (err, session) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Database error' });
        }
        
        if (!session) {
            return res.status(401).json({ success: false, error: 'Session expired or invalid' });
        }
        
        // Set user in request
        db.get('SELECT * FROM admin_users WHERE id = ?', [session.user_id], (err, user) => {
            if (err || !user) {
                return res.status(401).json({ success: false, error: 'User not found' });
            }
            
            // Remove sensitive data
            delete user.password_hash;
            
            req.user = user;
            next();
        });
    });
}

// Serve the admin panel frontend with cache-busting headers
// Function to serve the main admin panel with cache-busting
function serveAdminPanel(req, res) {
    // Set aggressive cache-busting headers to prevent browser caching issues
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Last-Modified', new Date().toUTCString());
    res.setHeader('ETag', Date.now().toString());

    const indexPath = path.join(__dirname, 'public', 'index.html');
    console.log(`📡 Serving admin panel from: ${indexPath} to ${req.get('host')}${req.originalUrl}`);
    console.log(`📋 File exists: ${require('fs').existsSync(indexPath)}`);
    console.log(`🔄 Cache-busting timestamp: ${Date.now()}`);

    res.sendFile(indexPath);
}

// Serve admin panel for all routes (root, dashboard.html, admin.html, etc.)
app.get('/', serveAdminPanel);
app.get('/dashboard.html', serveAdminPanel);
app.get('/admin.html', serveAdminPanel);
app.get('/index.html', serveAdminPanel);

// API Routes

// Session check endpoint
app.get('/api/session-check', (req, res) => {
    const sessionId = req.headers['x-session-id'] || req.query.session;
    
    if (!sessionId) {
        return res.json({ success: false, valid: false });
    }
    
    db.get(`
        SELECT * FROM admin_sessions 
        WHERE session_id = ? AND expires_at > datetime('now')
    `, [sessionId], (err, session) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Database error', valid: false });
        }
        
        if (!session) {
            return res.json({ success: false, valid: false });
        }
        
        // Get user info
        db.get('SELECT id, username, email, role FROM admin_users WHERE id = ?', [session.user_id], (err, user) => {
            if (err || !user) {
                return res.json({ success: false, valid: false });
            }
            
            res.json({ 
                success: true, 
                valid: true, 
                user: user
            });
        });
    });
});

// Login endpoint
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Username and password are required' });
    }
    
    db.get('SELECT * FROM admin_users WHERE username = ? AND is_active = 1', [username], (err, user) => {
        if (err) {
            console.error('Database error during login:', err);
            return res.status(500).json({ success: false, error: 'Database error' });
        }
        
        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
        
        // Compare password
        bcrypt.compare(password, user.password_hash, (err, match) => {
            if (err) {
                return res.status(500).json({ success: false, error: 'Authentication error' });
            }
            
            if (!match) {
                return res.status(401).json({ success: false, error: 'Invalid credentials' });
            }
            
            // Create session
            const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            const sql = `
                INSERT INTO admin_sessions (
                    user_id, session_id, ip_address, user_agent, created_at, expires_at
                ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now', '+1 day'))
            `;
            
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            const userAgent = req.headers['user-agent'];
            
            db.run(sql, [user.id, sessionId, ip, userAgent], function(err) {
                if (err) {
                    console.error('Failed to create session:', err);
                    return res.status(500).json({ success: false, error: 'Failed to create session' });
                }
                
                // Update last login time
                db.run('UPDATE admin_users SET last_login = datetime("now") WHERE id = ?', [user.id]);
                
                // Return session info
                res.json({
                    success: true,
                    sessionId: sessionId,
                    user: {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        role: user.role
                    }
                });
            });
        });
    });
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
    const sessionId = req.headers['x-session-id'] || req.query.session;
    
    if (sessionId) {
        db.run('DELETE FROM admin_sessions WHERE session_id = ?', [sessionId], (err) => {
            if (err) {
                console.error('Failed to logout:', err);
            }
        });
    }
    
    res.json({ success: true, message: 'Logged out successfully' });
});

// Dashboard stats endpoint
app.get('/api/dashboard-stats', requireAuth, (req, res) => {
    Promise.all([
        // Active users
        new Promise((resolve, reject) => {
            db.get("SELECT COUNT(*) as count FROM active_sessions WHERE status = 'connected'", (err, row) => {
                if (err) reject(err);
                else resolve({ activeUsers: row.count || 0 });
            });
        }),
        // Total users
        new Promise((resolve, reject) => {
            db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
                if (err) reject(err);
                else resolve({ totalUsers: row.count || 0 });
            });
        }),
        // Today's connections
        new Promise((resolve, reject) => {
            db.get("SELECT COUNT(*) as count FROM connection_logs WHERE DATE(timestamp) = DATE('now') AND action = 'connect'", (err, row) => {
                if (err) reject(err);
                else resolve({ todayConnections: row.count || 0 });
            });
        }),
        // Extension codes used today
        new Promise((resolve, reject) => {
            db.get("SELECT COUNT(*) as count FROM extension_logs WHERE DATE(timestamp) = DATE('now')", (err, row) => {
                if (err) reject(err);
                else resolve({ extensionsToday: row.count || 0 });
            });
        }),
        // Trial system enabled
        new Promise((resolve, reject) => {
            db.get("SELECT config_value FROM system_config WHERE config_key = 'enable_trial_system'", (err, row) => {
                if (err) reject(err);
                else resolve({ trialSystemEnabled: row && row.config_value === 'true' });
            });
        }),
        // Extension system enabled
        new Promise((resolve, reject) => {
            db.get("SELECT config_value FROM system_config WHERE config_key = 'enable_extensions'", (err, row) => {
                if (err) reject(err);
                else resolve({ extensionSystemEnabled: row && row.config_value === 'true' });
            });
        })
    ])
    .then(results => {
        // Combine all results
        const stats = Object.assign({}, ...results);
        res.json({ success: true, stats });
    })
    .catch(error => {
        console.error('Failed to get dashboard stats:', error);
        res.status(500).json({ success: false, error: 'Failed to get dashboard statistics' });
    });
});

// Get active sessions endpoint
app.get('/api/active-sessions', requireAuth, (req, res) => {
    db.all(`
        SELECT s.*, u.username 
        FROM active_sessions s 
        LEFT JOIN users u ON s.user_id = u.user_id 
        WHERE s.status = 'connected' 
        ORDER BY s.started_at DESC 
        LIMIT 50
    `, [], (err, rows) => {
        if (err) {
            console.error('Failed to get active sessions:', err);
            res.status(500).json({ success: false, error: 'Database error' });
        } else {
            res.json({ success: true, sessions: rows || [] });
        }
    });
});

// Active sessions stats endpoint
app.get('/api/active-sessions/stats', requireAuth, (req, res) => {
    const queries = [
        // Current active sessions
        new Promise((resolve, reject) => {
            db.get("SELECT COUNT(*) as count FROM active_sessions WHERE status = 'connected'", (err, row) => {
                if (err) reject(err);
                else resolve({ active: row.count });
            });
        }),
        
        // Sessions today
        new Promise((resolve, reject) => {
            db.get("SELECT COUNT(*) as count FROM connection_logs WHERE DATE(timestamp) = DATE('now') AND action = 'connect'", (err, row) => {
                if (err) reject(err);
                else resolve({ today: row.count });
            });
        }),
        
        // Disconnections today
        new Promise((resolve, reject) => {
            db.get("SELECT COUNT(*) as count FROM connection_logs WHERE DATE(timestamp) = DATE('now') AND action = 'disconnect'", (err, row) => {
                if (err) reject(err);
                else resolve({ disconnections: row.count });
            });
        }),
        
        // Unique users today
        new Promise((resolve, reject) => {
            db.get("SELECT COUNT(DISTINCT user_id) as count FROM connection_logs WHERE DATE(timestamp) = DATE('now')", (err, row) => {
                if (err) reject(err);
                else resolve({ unique_users: row.count });
            });
        })
    ];
    
    Promise.all(queries)
        .then(results => {
            const stats = {
                active_sessions: results[0].active,
                sessions_today: results[1].today,
                disconnections_today: results[2].disconnections,
                unique_users_today: results[3].unique_users
            };
            
            res.json({ success: true, stats });
        })
        .catch(error => {
            res.status(500).json({ success: false, error: error.message });
        });
});

// Disconnect session endpoint
app.post('/api/disconnect-session', requireAuth, (req, res) => {
    const { sessionId } = req.body;
    
    if (!sessionId) {
        return res.status(400).json({ success: false, error: 'Session ID is required' });
    }
    
    db.get('SELECT * FROM active_sessions WHERE session_id = ?', [sessionId], (err, session) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        
        if (!session) {
            return res.status(404).json({ success: false, error: 'Session not found' });
        }
        
        db.run(`
            UPDATE active_sessions 
            SET status = 'disconnected', ended_at = datetime('now'), updated_at = datetime('now') 
            WHERE session_id = ?
        `, [sessionId], function(err) {
            if (err) {
                res.status(500).json({ success: false, error: err.message });
            } else {
                // Create connection log
                db.run(`
                    INSERT INTO connection_logs 
                    (user_id, session_id, action, proxy_host, proxy_port, status, timestamp)
                    VALUES (?, ?, 'disconnect', ?, ?, 'admin_disconnected', datetime('now'))
                `, [session.user_id, sessionId, session.proxy_host, session.proxy_port]);
                
                // Create sync event
                createSyncEvent('session_disconnected', 'session', sessionId, {
                    user_id: session.user_id,
                    disconnected_by: 'admin',
                    admin_username: req.user.username
                });
                
                // Broadcast to WebSocket clients
                broadcastToClients({
                    type: 'session_disconnected',
                    sessionId: sessionId,
                    timestamp: new Date().toISOString()
                });
                
                res.json({ success: true, message: 'Session disconnected successfully' });
            }
        });
    });
});

// Get URL services endpoint
app.get('/api/url-services', requireAuth, (req, res) => {
    db.all("SELECT * FROM url_services ORDER BY name ASC", (err, rows) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.json({ success: true, services: rows || [] });
        }
    });
});

// Add URL service endpoint
app.post('/api/url-services', requireAuth, (req, res) => {
    const { name, base_url, shortened_url, target_url, api_endpoint, api_key, is_active, priority } = req.body;

    if (!name || !base_url) {
        return res.status(400).json({ success: false, error: 'Name and base URL are required' });
    }

    // Validate URLs
    const urlsToValidate = [base_url];
    if (shortened_url) urlsToValidate.push(shortened_url);
    if (target_url) urlsToValidate.push(target_url);

    for (const url of urlsToValidate) {
        try {
            new URL(url);
        } catch (e) {
            return res.status(400).json({ success: false, error: `Invalid URL format: ${url}` });
        }
    }

    // For dual-URL tracking, both shortened_url and target_url should be provided together
    if ((shortened_url && !target_url) || (!shortened_url && target_url)) {
        return res.status(400).json({
            success: false,
            error: 'For dual-URL tracking, both shortened URL and target URL must be provided'
        });
    }

    const sql = `
        INSERT INTO url_services (
            name, base_url, shortened_url, target_url, api_endpoint, api_key, is_active, priority, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `;

    db.run(sql, [
        name,
        base_url,
        shortened_url || null,
        target_url || null,
        api_endpoint || null,
        api_key || null,
        is_active !== undefined ? is_active : 1,
        priority || 1
    ], function(err) {
        if (err) {
            console.error('Failed to add URL service:', err);
            res.status(500).json({ success: false, error: 'Failed to add URL service' });
        } else {
            const id = this.lastID;
            
            // Get the newly created service
            db.get("SELECT * FROM url_services WHERE id = ?", [id], (err, service) => {
                if (err) {
                    res.status(500).json({ success: false, error: 'Service created but failed to retrieve' });
                } else {
                    // Create sync event
                    createSyncEvent('url_service_added', 'url_service', id, service);
                    
                    // Broadcast to WebSocket clients
                    broadcastToClients({
                        type: 'url_service_added',
                        data: service,
                        timestamp: new Date().toISOString()
                    });
                    
                    res.json({ success: true, service });
                }
            });
        }
    });
});

// URL services statistics endpoint
app.get('/api/url-services/stats', requireAuth, (req, res) => {
    const queries = [
        // Total services count
        new Promise((resolve, reject) => {
            db.get("SELECT COUNT(*) as total FROM url_services", (err, row) => {
                if (err) reject(err);
                else resolve({ total_services: row.total });
            });
        }),
        
        // Active services count
        new Promise((resolve, reject) => {
            db.get("SELECT COUNT(*) as active FROM url_services WHERE is_active = 1", (err, row) => {
                if (err) reject(err);
                else resolve({ active_services: row.active });
            });
        }),
        
        // Most used service
        new Promise((resolve, reject) => {
            db.get(`
                SELECT name FROM url_services
                ORDER BY last_used DESC
                LIMIT 1
            `, (err, row) => {
                if (err) reject(err);
                else resolve({ most_used_service: row ? row.name : 'None' });
            });
        })
    ];
    
    Promise.all(queries)
        .then(results => {
            const stats = Object.assign({}, ...results);
            res.json({ success: true, stats });
        })
        .catch(error => {
            res.status(500).json({ success: false, error: error.message });
        });
});

// Update URL service endpoint
app.put('/api/url-services/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const { name, base_url, shortened_url, target_url, api_endpoint, api_key, is_active, priority } = req.body;

    if (!name || !base_url) {
        return res.status(400).json({ success: false, error: 'Name and base URL are required' });
    }

    // Validate URLs
    const urlsToValidate = [base_url];
    if (shortened_url) urlsToValidate.push(shortened_url);
    if (target_url) urlsToValidate.push(target_url);

    for (const url of urlsToValidate) {
        try {
            new URL(url);
        } catch (e) {
            return res.status(400).json({ success: false, error: `Invalid URL format: ${url}` });
        }
    }

    // For dual-URL tracking, both shortened_url and target_url should be provided together
    if ((shortened_url && !target_url) || (!shortened_url && target_url)) {
        return res.status(400).json({
            success: false,
            error: 'For dual-URL tracking, both shortened URL and target URL must be provided'
        });
    }

    const sql = `
        UPDATE url_services
        SET name = ?, base_url = ?, shortened_url = ?, target_url = ?,
            api_endpoint = ?, api_key = ?, is_active = ?, priority = ?, updated_at = datetime('now')
        WHERE id = ?
    `;

    db.run(sql, [
        name,
        base_url,
        shortened_url || null,
        target_url || null,
        api_endpoint || null,
        api_key || null,
        is_active !== undefined ? is_active : 1,
        priority || 1,
        id
    ], function(err) {
        if (err) {
            console.error('Failed to update URL service:', err);
            res.status(500).json({ success: false, error: 'Failed to update URL service' });
        } else if (this.changes === 0) {
            res.status(404).json({ success: false, error: 'URL service not found' });
        } else {
            // Get the updated service
            db.get("SELECT * FROM url_services WHERE id = ?", [id], (err, service) => {
                if (err) {
                    res.status(500).json({ success: false, error: 'Service updated but failed to retrieve' });
                } else {
                    // Create sync event
                    createSyncEvent('url_service_updated', 'url_service', id, service);

                    // Broadcast to WebSocket clients
                    broadcastToClients({
                        type: 'url_service_updated',
                        data: service,
                        timestamp: new Date().toISOString()
                    });

                    res.json({ success: true, service });
                }
            });
        }
    });
});

// Delete URL service endpoint
app.delete('/api/url-services/:id', requireAuth, (req, res) => {
    const { id } = req.params;

    // First get the service for the sync event
    db.get("SELECT * FROM url_services WHERE id = ?", [id], (err, service) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Database error' });
        }

        if (!service) {
            return res.status(404).json({ success: false, error: 'URL service not found' });
        }

        // Delete the service
        db.run("DELETE FROM url_services WHERE id = ?", [id], function(err) {
            if (err) {
                console.error('Failed to delete URL service:', err);
                res.status(500).json({ success: false, error: 'Failed to delete URL service' });
            } else {
                // Create sync event
                createSyncEvent('url_service_deleted', 'url_service', id, service);

                // Broadcast to WebSocket clients
                broadcastToClients({
                    type: 'url_service_deleted',
                    data: { id: parseInt(id), ...service },
                    timestamp: new Date().toISOString()
                });

                res.json({ success: true, message: 'URL service deleted successfully' });
            }
        });
    });
});

// Get users endpoint
app.get('/api/users', requireAuth, (req, res) => {
    db.all(`
        SELECT id, user_id, username, email, created_at, last_active, status, 
               trial_used, total_connection_time
        FROM users
        ORDER BY created_at DESC
        LIMIT 100
    `, [], (err, rows) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.json({ success: true, users: rows || [] });
        }
    });
});

// Get user sessions history endpoint
app.get('/api/user-sessions/:userId', requireAuth, (req, res) => {
    const userId = req.params.userId;
    
    db.all(`
        SELECT * FROM connection_logs
        WHERE user_id = ?
        ORDER BY timestamp DESC
        LIMIT 50
    `, [userId], (err, rows) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.json({ success: true, sessions: rows || [] });
        }
    });
});

// Get system configuration endpoint
app.get('/api/system-config', requireAuth, (req, res) => {
    db.all(`
        SELECT config_key, config_value, config_type, description, is_public 
        FROM system_config 
        ORDER BY config_key
    `, [], (err, rows) => {
        if (err) {
            console.error('Failed to get system config:', err);
            res.status(500).json({ error: 'Failed to get system configuration' });
        } else {
            const config = {};
            rows.forEach(row => {
                let value = row.config_value;
                
                // Convert value based on type
                switch (row.config_type) {
                    case 'number':
                        value = parseFloat(value);
                        break;
                    case 'boolean':
                        value = value === 'true';
                        break;
                    case 'json':
                        try {
                            value = JSON.parse(value);
                        } catch (e) {
                            console.error(`Failed to parse JSON config value for ${row.config_key}:`, e);
                            value = null;
                        }
                        break;
                }
                
                config[row.config_key] = {
                    value: value,
                    type: row.config_type,
                    description: row.description,
                    is_public: row.is_public === 1
                };
            });
            res.json({ success: true, config });
        }
    });
});

// Update system configuration endpoint
app.put('/api/system-config/:key', requireAuth, (req, res) => {
    const key = req.params.key;
    const { value } = req.body;
    
    if (value === undefined) {
        return res.status(400).json({ success: false, error: 'Value is required' });
    }
    
    // Get current config to determine type
    db.get("SELECT * FROM system_config WHERE config_key = ?", [key], (err, config) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Database error' });
        }
        
        if (!config) {
            return res.status(404).json({ success: false, error: 'Configuration key not found' });
        }
        
        // Convert value based on type
        let storedValue = value;
        switch (config.config_type) {
            case 'boolean':
                storedValue = value ? 'true' : 'false';
                break;
            case 'json':
                storedValue = JSON.stringify(value);
                break;
            default:
                storedValue = String(value);
        }
        
        db.run(`
            UPDATE system_config 
            SET config_value = ?, updated_at = datetime('now'), updated_by = ? 
            WHERE config_key = ?
        `, [storedValue, req.user.username, key], function(err) {
            if (err) {
                res.status(500).json({ success: false, error: 'Failed to update configuration' });
            } else {
                // Create sync event
                createSyncEvent('config_updated', 'config', key, {
                    key,
                    value: storedValue,
                    updated_by: req.user.username
                });
                
                // Broadcast to WebSocket clients
                broadcastToClients({
                    type: 'config_updated',
                    data: {
                        key,
                        value: storedValue,
                        updated_by: req.user.username
                    },
                    timestamp: new Date().toISOString()
                });
                
                res.json({ success: true, message: 'Configuration updated successfully' });
            }
        });
    });
});

// Get connection logs endpoint
app.get('/api/connection-logs', requireAuth, (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const action = req.query.action;
    const userId = req.query.user_id;
    
    let query = `
        SELECT c.*, u.username 
        FROM connection_logs c
        LEFT JOIN users u ON c.user_id = u.user_id
        WHERE 1=1
    `;
    
    const params = [];
    
    if (action) {
        query += ' AND c.action = ?';
        params.push(action);
    }
    
    if (userId) {
        query += ' AND c.user_id = ?';
        params.push(userId);
    }
    
    query += ' ORDER BY c.timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.json({ success: true, logs: rows || [] });
        }
    });
});

// Get extension logs endpoint
app.get('/api/extension-logs', requireAuth, (req, res) => {
    db.all(`
        SELECT e.*, u.username 
        FROM extension_logs e
        LEFT JOIN users u ON e.user_id = u.user_id
        ORDER BY timestamp DESC
        LIMIT 100
    `, [], (err, rows) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.json({ success: true, logs: rows || [] });
        }
    });
});

// Helper Functions

// Create sync event
function createSyncEvent(eventType, entityType, entityId, data) {
    // First check if the sync_events table exists
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_events'", [], (err, tableInfo) => {
        if (err || !tableInfo) {
            console.error('❌ Sync events table does not exist when creating event:', err);
            
            // Create the table and retry
            createSyncEventsTable();
            setTimeout(() => {
                console.log(`🔄 Retrying sync event creation for ${eventType} after table creation...`);
                createSyncEvent(eventType, entityType, entityId, data);
            }, 500);
            return;
        }
        
        // Check the columns to determine which query to use
        db.all("PRAGMA table_info(sync_events)", [], (err, columns) => {
            if (err) {
                console.error('❌ Error checking sync_events columns before creating event:', err);
                return;
            }
            
            try {
                const columnNames = columns.map(col => col.name);
                const hasCreatedAt = columnNames.includes('created_at');
                const hasSource = columnNames.includes('source');
                const dataJson = typeof data === 'object' ? JSON.stringify(data) : String(data);
                
                // If any required column is missing, fix the table first
                if (!hasCreatedAt || !hasSource) {
                    console.log(`⚠️ Missing columns in sync_events table when creating event: ${!hasSource ? 'source' : ''} ${!hasCreatedAt ? 'created_at' : ''}`);
                    
                    // Fix the table structure
                    fixSyncEventsTable();
                    
                    // Retry after a delay
                    setTimeout(() => {
                        console.log(`🔄 Retrying sync event creation for ${eventType} after fixing table...`);
                        createSyncEvent(eventType, entityType, entityId, data);
                    }, 1000);
                    return;
                }
                
                // All columns exist, proceed with insert
                const sql = `
                    INSERT INTO sync_events (event_type, entity_type, entity_id, data, source, created_at)
                    VALUES (?, ?, ?, ?, ?, datetime('now'))
                `;
                
                db.run(sql, [
                    eventType,
                    entityType,
                    entityId,
                    dataJson,
                    'admin_panel'
                ], err => {
                    if (err) {
                        console.error(`❌ Failed to create sync event ${eventType}:`, err);
                        
                        // If database is locked or schema changed
                        if (err.message.includes('database is locked') || 
                            err.message.includes('database schema has changed')) {
                            // Wait a bit and retry
                            setTimeout(() => {
                                console.log(`🔄 Retrying sync event creation for ${eventType} after lock...`);
                                createSyncEvent(eventType, entityType, entityId, data);
                            }, 500);
                        }
                    } else {
                        console.log(`✅ Created sync event: ${eventType}`);
                    }
                });
            } catch (error) {
                console.error('❌ Error in createSyncEvent:', error);
            }
        });
    });
}

// Broadcast to WebSocket clients
function broadcastToClients(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// WebSocket connection handler
wss.on('connection', (ws, req) => {
    console.log('🔌 WebSocket client connected');
    
    // Handle incoming messages
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('📩 WebSocket message received:', data);
            
            // Process message based on type
            if (data.type === 'authenticate') {
                authenticateWebSocket(ws, data.sessionId);
            }
        } catch (error) {
            console.error('❌ WebSocket message error:', error);
        }
    });
    
    // Handle disconnection
    ws.on('close', () => {
        console.log('🔌 WebSocket client disconnected');
    });
    
    // Send welcome message
    ws.send(JSON.stringify({
        type: 'welcome',
        message: 'Connected to SP5Proxy Admin Panel WebSocket',
        timestamp: new Date().toISOString()
    }));
});

// Authenticate WebSocket connection
function authenticateWebSocket(ws, sessionId) {
    if (!sessionId) {
        ws.send(JSON.stringify({
            type: 'auth_error',
            message: 'Authentication required',
            timestamp: new Date().toISOString()
        }));
        return;
    }
    
    db.get(`
        SELECT * FROM admin_sessions 
        WHERE session_id = ? AND expires_at > datetime('now')
    `, [sessionId], (err, session) => {
        if (err || !session) {
            ws.send(JSON.stringify({
                type: 'auth_error',
                message: 'Invalid or expired session',
                timestamp: new Date().toISOString()
            }));
            return;
        }
        
        // Session is valid, store user ID on ws object
        ws.userId = session.user_id;
        ws.isAuthenticated = true;
        
        ws.send(JSON.stringify({
            type: 'authenticated',
            message: 'Authentication successful',
            timestamp: new Date().toISOString()
        }));
    });
}

// Monitor database for sync events
function startSyncEventMonitoring() {
    console.log('🔄 Starting sync event monitoring...');
    
    // Let's check if the sync_events table has all required columns first
    verifyFixedSyncEventsTable();
    
    setInterval(() => {
        // First check if the sync_events table exists
        db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='sync_events'", [], (err, tableInfo) => {
            if (err) {
                console.error('❌ Error checking sync_events table:', err);
                return;
            }
            
            if (!tableInfo) {
                console.error('❌ sync_events table does not exist');
                createSyncEventsTable(); // Create the table if it doesn't exist
                return;
            }
            
            // Check if created_at column exists to determine which query to use
            db.all("PRAGMA table_info(sync_events)", [], (err, columns) => {
                if (err) {
                    console.error('❌ Failed to get sync_events columns:', err);
                    return;
                }
                
                const columnNames = columns.map(col => col.name);
                const hasCreatedAt = columnNames.includes('created_at');
                const hasSource = columnNames.includes('source');
                
                let query;
                
                // Choose appropriate query based on available columns
                if (hasCreatedAt && hasSource) {
                    // All required columns exist
                    query = `
                        SELECT * FROM sync_events 
                        WHERE processed = 0 AND source != 'admin_panel' 
                        ORDER BY created_at ASC LIMIT 10
                    `;
                } else if (hasSource && !hasCreatedAt) {
                    // Missing created_at, but source exists
                    query = `
                        SELECT * FROM sync_events 
                        WHERE processed = 0 AND source != 'admin_panel' 
                        ORDER BY id ASC LIMIT 10
                    `;
                    
                    // Schedule a table fix since created_at is missing
                    recreateSyncEventsTable();
                } else if (!hasSource && !hasCreatedAt) {
                    // Missing both columns
                    query = `
                        SELECT * FROM sync_events 
                        WHERE processed = 0
                        ORDER BY id ASC LIMIT 10
                    `;
                    
                    // Schedule a table fix since both columns are missing
                    recreateSyncEventsTable();
                } else {
                    // Only source is missing (unlikely but handled)
                    query = `
                        SELECT * FROM sync_events 
                        WHERE processed = 0
                        ORDER BY created_at ASC LIMIT 10
                    `;
                    
                    // Try to add source column only
                    db.exec("ALTER TABLE sync_events ADD COLUMN source TEXT NOT NULL DEFAULT 'unknown'", (err) => {
                        if (err && !err.message.includes('duplicate column')) {
                            console.error('❌ Failed to add source column to sync_events table:', err);
                        }
                    });
                }
                
                // Execute the appropriate query
                db.all(query, [], (err, events) => {
                    if (err) {
                        console.error('❌ Failed to check sync events:', err);
                        return;
                    }
                    
                    if (!events || events.length === 0) {
                        // No events to process
                        return;
                    }
                    
                    console.log(`Found ${events.length} sync events to process`);
                    
                    events.forEach(event => {
                        try {
                            // Parse data JSON
                            const eventData = JSON.parse(event.data || '{}');
                            
                            // Use default source if not available
                            const source = event.source || 'unknown';
                            
                            // Broadcast to WebSocket clients
                            broadcastToClients({
                                type: 'sync_event',
                                event_type: event.event_type,
                                entity_type: event.entity_type,
                                entity_id: event.entity_id,
                                data: eventData,
                                source: source,
                                timestamp: new Date().toISOString()
                            });
                            
                            // Mark as processed
                            db.run('UPDATE sync_events SET processed = 1 WHERE id = ?', [event.id], err => {
                                if (err) {
                                    console.error(`❌ Failed to mark sync event ${event.id} as processed:`, err);
                                }
                            });
                        } catch (error) {
                            console.error(`❌ Failed to process sync event ${event.id}:`, error);
                            
                            // Mark problematic events as processed so they don't cause repeated errors
                            db.run('UPDATE sync_events SET processed = 1 WHERE id = ?', [event.id]);
                        }
                    });
                });
            });
        });
    }, 2000);
}

// Create admin_sessions table if it doesn't exist
function setupAdminSessionsTable() {
    const schema = `
        CREATE TABLE IF NOT EXISTS admin_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            session_id TEXT UNIQUE NOT NULL,
            ip_address TEXT,
            user_agent TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
        )
    `;
    
    db.exec(schema, err => {
        if (err) {
            console.error('Failed to create admin_sessions table:', err);
        } else {
            console.log('✅ Admin sessions table created or already exists');
        }
    });
}

// Fix the sync_events table by adding any missing columns
function fixSyncEventsTable() {
    console.log('🔧 Checking sync_events table schema...');
    
    // First check if table exists at all
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_events'", [], (err, table) => {
        if (err) {
            console.error('❌ Error checking for sync_events table:', err);
            return;
        }
        
        if (!table) {
            console.error('❌ sync_events table does not exist!');
            createSyncEventsTable();
            return;
        }
        
        // Table exists, now check for missing columns
        db.all("PRAGMA table_info(sync_events)", [], (err, columns) => {
            if (err) {
                console.error('❌ Failed to get sync_events columns:', err);
                return;
            }
            
            const columnNames = columns.map(col => col.name);
            
            // Check for source column
            if (!columnNames.includes('source')) {
                console.log('⚠️ Missing "source" column in sync_events table');
                
                // Add the source column safely
                db.exec("ALTER TABLE sync_events ADD COLUMN source TEXT NOT NULL DEFAULT 'unknown'", (err) => {
                    if (err) {
                        // Ignore "duplicate column" errors as they mean another process already added it
                        if (!err.message.includes('duplicate column')) {
                            console.error('❌ Failed to add source column to sync_events table:', err);
                        }
                    } else {
                        console.log('✅ Successfully added "source" column to sync_events table');
                    }
                });
            }
            
            // Check for created_at column - use a different approach due to SQLite limitations
            if (!columnNames.includes('created_at')) {
                console.log('⚠️ Missing "created_at" column in sync_events table');
                
                // For created_at, we need to recreate the table due to SQLite limitations with DEFAULT CURRENT_TIMESTAMP
                recreateSyncEventsTable();
            }
        });
    });
}

// Create a completely new sync_events table
function createSyncEventsTable() {
    console.log('📝 Creating new sync_events table with all required columns...');
    
    const createTableSQL = `
        CREATE TABLE IF NOT EXISTS sync_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            data TEXT,
            source TEXT NOT NULL DEFAULT 'unknown',
            processed BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `;
    
    db.exec(createTableSQL, (err) => {
        if (err) {
            console.error('❌ Failed to create sync_events table:', err);
        } else {
            console.log('✅ Created sync_events table with all required columns');
        }
    });
}

// Recreate the sync_events table with correct schema, preserving data
function recreateSyncEventsTable() {
    console.log('🔄 Recreating sync_events table with all required columns...');
    
    // Execute operations in a transaction to ensure atomicity
    db.exec('BEGIN TRANSACTION', (err) => {
        if (err) {
            console.error('❌ Failed to begin transaction:', err);
            return;
        }
        
        const steps = [
            // 1. Rename the current table
            `ALTER TABLE sync_events RENAME TO sync_events_old`,
            
            // 2. Create the new table with the correct schema
            `CREATE TABLE sync_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                data TEXT,
                source TEXT NOT NULL DEFAULT 'unknown',
                processed BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // 3. Copy data from old to new, handling missing columns
            `INSERT INTO sync_events (id, event_type, entity_type, entity_id, data, source, processed)
             SELECT id, event_type, entity_type, entity_id, data, 
                   COALESCE(source, 'unknown') as source, 
                   COALESCE(processed, 0) as processed
             FROM sync_events_old`,
            
            // 4. Drop the old table
            `DROP TABLE sync_events_old`
        ];
        
        // Execute each step, with error handling
        let currentStep = 0;
        
        function executeNextStep() {
            if (currentStep >= steps.length) {
                // All steps completed, commit transaction
                db.exec('COMMIT', (err) => {
                    if (err) {
                        console.error('❌ Failed to commit transaction:', err);
                        rollbackTransaction();
                    } else {
                        console.log('✅ Successfully recreated sync_events table with all required columns');
                    }
                });
                return;
            }
            
            db.exec(steps[currentStep], (err) => {
                if (err) {
                    console.error(`❌ Failed at step ${currentStep + 1}:`, err);
                    rollbackTransaction();
                    return;
                }
                
                currentStep++;
                executeNextStep();
            });
        }
        
        function rollbackTransaction() {
            db.exec('ROLLBACK', (err) => {
                if (err) {
                    console.error('❌ Failed to rollback transaction:', err);
                } else {
                    console.log('↩️ Transaction rolled back due to errors');
                    
                    // As a fallback, try to create the table from scratch
                    console.log('🔄 Attempting to create sync_events table from scratch...');
                    
                    // Check if the old table still exists after failed transaction
                    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_events_old'", [], (err, oldTable) => {
                        if (!err && oldTable) {
                            // The old table still exists, try to restore its name
                            db.exec("DROP TABLE IF EXISTS sync_events", (err) => {
                                if (!err) {
                                    db.exec("ALTER TABLE sync_events_old RENAME TO sync_events", (err) => {
                                        if (err) {
                                            console.error('❌ Failed to restore original table name:', err);
                                        } else {
                                            console.log('✅ Restored original table name');
                                        }
                                    });
                                }
                            });
                        }
                    });
                    
                    // If recreating fails, just create a new empty table with correct schema
                    createSyncEventsTable();
                }
            });
        }
        
        // Start executing steps
        executeNextStep();
    });
}

// Verify that the sync_events table has all required columns after fixing
function verifyFixedSyncEventsTable() {
    setTimeout(() => {
        db.all("PRAGMA table_info(sync_events)", [], (err, columns) => {
            if (err) {
                console.error('❌ Failed to verify sync_events columns:', err);
                return;
            }
            
            const columnNames = columns.map(col => col.name);
            const requiredColumns = ['id', 'event_type', 'entity_type', 'entity_id', 'data', 'source', 'processed', 'created_at'];
            const missingColumns = requiredColumns.filter(col => !columnNames.includes(col));
            
            if (missingColumns.length === 0) {
                console.log('✅ sync_events table now has all required columns');
            } else {
                console.error(`❌ sync_events table is still missing required columns: ${missingColumns.join(', ')}`);
                console.log('🔄 Consider recreating the table from scratch if issues persist');
            }
        });
    }, 500);
}

// Verify database integrity after initialization
function verifyDatabaseIntegrity() {
    console.log('🔍 Verifying database integrity...');
    
    // List of tables and their required columns to check
    const tableChecks = [
        {
            name: 'sync_events',
            requiredColumns: ['id', 'event_type', 'entity_type', 'entity_id', 'data', 'source', 'processed', 'created_at'],
            fixFunction: fixSyncEventsTable
        },
        {
            name: 'active_sessions',
            requiredColumns: ['id', 'user_id', 'session_id', 'status', 'started_at']
        },
        {
            name: 'admin_sessions',
            requiredColumns: ['id', 'user_id', 'session_id', 'created_at', 'expires_at']
        }
    ];
    
    // Track which tables have already been checked to avoid duplicate repairs
    const checkedTables = new Set();
    
    // Check each table
    tableChecks.forEach(table => {
        // First check if table exists
        db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [table.name], (err, tableInfo) => {
            if (err) {
                console.error(`❌ Error checking if table ${table.name} exists:`, err);
                return;
            }
            
            if (!tableInfo) {
                console.error(`❌ Table ${table.name} does not exist`);
                
                if (table.fixFunction && !checkedTables.has(table.name)) {
                    console.log(`🔄 Attempting to create missing table ${table.name}...`);
                    table.fixFunction();
                    checkedTables.add(table.name);
                }
                return;
            }
            
            // Table exists, check its columns
            db.all(`PRAGMA table_info(${table.name})`, [], (err, columns) => {
                if (err) {
                    console.error(`❌ Error checking table ${table.name}:`, err);
                    return;
                }
                
                if (!columns || columns.length === 0) {
                    console.error(`❌ Table ${table.name} exists but has no columns`);
                    return;
                }
                
                const columnNames = columns.map(col => col.name);
                const missingColumns = table.requiredColumns.filter(col => !columnNames.includes(col));
                
                if (missingColumns.length > 0) {
                    console.error(`❌ Table ${table.name} is missing required columns: ${missingColumns.join(', ')}`);
                    
                    // For tables that have fix functions, attempt to repair
                    if (table.fixFunction && !checkedTables.has(table.name)) {
                        console.log(`🔄 Attempting to fix missing columns in table ${table.name}...`);
                        table.fixFunction();
                        checkedTables.add(table.name);
                    }
                } else {
                    console.log(`✅ Table ${table.name} has all required columns`);
                }
            });
        });
    });
}

// URL Extension System API Endpoints

// Start URL extension process
app.post('/api/url-extension/start', (req, res) => {
    const { user_id } = req.body;

    if (!user_id) {
        return res.status(400).json({ success: false, error: 'User ID is required' });
    }

    // Check for existing sessions - allow reuse of incomplete sessions within 1 hour
    db.get(`
        SELECT * FROM url_extension_tracking
        WHERE user_id = ? AND status IN ('started', 'pending')
        AND started_at >= datetime('now', '-1 hour')
        ORDER BY started_at DESC
        LIMIT 1
    `, [user_id], (err, existingSession) => {
        if (err) {
            console.error('Failed to check existing sessions:', err);
            return res.status(500).json({ success: false, error: 'Database error' });
        }

        // If there's an existing incomplete session, reuse it
        if (existingSession) {
            console.log(`🔄 Reusing incomplete session for user ${user_id}: ${existingSession.session_id}`);
            return res.json({
                success: true,
                session_id: existingSession.session_id,
                redirect_url: existingSession.shortened_url,
                message: `Continuing previous extension session. Redirecting to URL...`,
                is_existing_session: true
            });
        }

        // Check recent completions to prevent too frequent requests (cooldown 5 minutes)
        db.get(`
            SELECT * FROM url_extension_tracking
            WHERE user_id = ? AND completion_verified = 1
            AND completed_at >= datetime('now', '-5 minutes')
            ORDER BY completed_at DESC
            LIMIT 1
        `, [user_id], (err, recentCompletion) => {
            if (err) {
                console.error('Failed to check recent completions:', err);
                return res.status(500).json({ success: false, error: 'Database error' });
            }

            // If user completed a task very recently, apply cooldown
            if (recentCompletion) {
                const completedTime = new Date(recentCompletion.completed_at);
                const cooldownEnd = new Date(completedTime.getTime() + 5 * 60 * 1000); // 5 minutes
                const remainingMinutes = Math.ceil((cooldownEnd - new Date()) / 60000);
                
                console.log(`⏰ Cooldown active for user ${user_id}, ${remainingMinutes} minutes remaining`);
                return res.status(429).json({ 
                    success: false, 
                    error: `Please wait ${remainingMinutes} minutes before starting a new extension task.`,
                    cooldown_remaining: remainingMinutes 
                });
            }

            // Get destination URL configuration from url_services table
            db.all(`
                SELECT target_url, name, id
                FROM url_services
                WHERE is_active = 1
                ORDER BY RANDOM()
                LIMIT 1
            `, [], (err, urlServices) => {
                if (err) {
                    console.error('Failed to get URL services:', err);
                    return res.status(500).json({ success: false, error: 'Failed to get URL services' });
                }

                // Check if URL services are available
                if (!urlServices || urlServices.length === 0) {
                    return res.status(400).json({ success: false, error: 'No active URL services configured. Please add URLs in admin panel.' });
                }

                const selectedService = urlServices[0];
                
                // Check if destination URL is properly configured
                if (!selectedService.target_url) {
                    return res.status(400).json({ success: false, error: 'Selected URL service has no target URL configured' });
                }

                // Generate unique session ID
                const session_id = 'URL_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5).toUpperCase();

                // Create tracking record with destination URL (shortened URL will be added later by URL Extension Manager)
                const sql = `
                    INSERT INTO url_extension_tracking (
                        user_id, session_id, shortened_url, destination_url, extension_hours, status
                    ) VALUES (?, ?, ?, ?, ?, 'started')
                `;

                db.run(sql, [
                    user_id,
                    session_id,
                    selectedService.target_url, // Use target URL as initial redirect, will be replaced with shortened URL
                    selectedService.target_url,
                    6 // Default 6 hours extension
                ], function(err) {
                    if (err) {
                        console.error('Failed to create URL extension tracking:', err);
                        return res.status(500).json({ success: false, error: 'Failed to start extension process' });
                    }

                    console.log(`✅ URL extension started for user ${user_id}, session: ${session_id}`);
                    console.log(`🎯 Target destination: ${selectedService.target_url}`);
                    console.log(`📝 URL Extension Manager will create unique shortened URL for this session`);
                    
                    res.json({
                        success: true,
                        session_id: session_id,
                        redirect_url: selectedService.target_url, // URL Extension Manager will replace this with shortened URL
                        target_url: selectedService.target_url,
                        message: `Extension process started. Creating unique shortened URL for this session...`,
                        is_existing_session: false
                    });
                });
            });
        });
    });
});

// Update shortened URL for a session
app.post('/api/url-extension/update-shortened-url', (req, res) => {
    const { session_id, user_id, shortened_url } = req.body;

    if (!session_id || !user_id || !shortened_url) {
        return res.status(400).json({ success: false, error: 'Session ID, User ID, and shortened URL are required' });
    }

    // Update the tracking record with the new shortened URL
    db.run(`
        UPDATE url_extension_tracking 
        SET shortened_url = ? 
        WHERE session_id = ? AND user_id = ?
    `, [shortened_url, session_id, user_id], function(err) {
        if (err) {
            console.error('Failed to update shortened URL:', err);
            return res.status(500).json({ success: false, error: 'Database error' });
        }

        if (this.changes === 0) {
            return res.status(404).json({ success: false, error: 'Session not found' });
        }

        console.log(`✅ Updated shortened URL for session ${session_id}: ${shortened_url}`);
        res.json({ 
            success: true, 
            message: 'Shortened URL updated successfully',
            session_id: session_id,
            shortened_url: shortened_url
        });
    });
});

// Check URL extension completion
app.post('/api/url-extension/check-completion', (req, res) => {
    const { session_id, user_id, current_url } = req.body;

    if (!session_id || !user_id) {
        return res.status(400).json({ success: false, error: 'Session ID and User ID are required' });
    }

    // Get tracking record
    db.get(`
        SELECT * FROM url_extension_tracking
        WHERE session_id = ? AND user_id = ?
    `, [session_id, user_id], (err, record) => {
        if (err) {
            console.error('Failed to get URL extension tracking:', err);
            return res.status(500).json({ success: false, error: 'Database error' });
        }

        if (!record) {
            return res.status(404).json({ success: false, error: 'Extension session not found' });
        }

        let isCompleted = record.completion_verified === 1;

        // If current_url is provided and extension not yet completed, check for completion
        if (current_url && !isCompleted && record.destination_url) {
            try {
                const currentUrlObj = new URL(current_url);
                const destinationUrlObj = new URL(record.destination_url);

                // Check if user has reached the destination URL
                if (currentUrlObj.hostname === destinationUrlObj.hostname) {
                    // Check if path matches or is a subpath
                    if (current_url.includes(record.destination_url) ||
                        currentUrlObj.pathname.startsWith(destinationUrlObj.pathname)) {

                        console.log(`✅ URL completion detected for session ${session_id}: ${current_url}`);
                        isCompleted = true;

                        // Auto-complete the extension
                        db.run(`
                            UPDATE url_extension_tracking
                            SET completed_at = datetime('now'),
                                completion_verified = 1,
                                extension_granted = 1,
                                status = 'completed'
                            WHERE session_id = ? AND user_id = ?
                        `, [session_id, user_id], (updateErr) => {
                            if (updateErr) {
                                console.error('Failed to auto-complete extension:', updateErr);
                            } else {
                                console.log(`✅ Extension auto-completed for session: ${session_id}`);
                            }
                        });
                    }
                }
            } catch (urlError) {
                console.error('Error parsing URLs for completion check:', urlError);
            }
        }

        res.json({
            success: true,
            status: isCompleted ? 'completed' : record.status,
            completed: isCompleted,
            extension_granted: record.extension_granted === 1,
            extension_hours: record.extension_hours,
            destination_url: record.destination_url,
            shortened_url: record.shortened_url
        });
    });
});

// Manual completion endpoint for URL extensions
app.post('/api/url-extension/manual-complete', (req, res) => {
    const { session_id, user_id } = req.body;

    if (!session_id || !user_id) {
        return res.status(400).json({ success: false, error: 'Session ID and User ID are required' });
    }

    // Check if session exists and is not already completed
    db.get(`
        SELECT * FROM url_extension_tracking
        WHERE session_id = ? AND user_id = ?
    `, [session_id, user_id], (err, record) => {
        if (err) {
            console.error('Failed to get URL extension tracking:', err);
            return res.status(500).json({ success: false, error: 'Database error' });
        }

        if (!record) {
            return res.status(404).json({ success: false, error: 'Session not found' });
        }

        if (record.completion_verified === 1) {
            return res.json({
                success: true,
                message: 'Extension already completed',
                session_id: session_id,
                extension_hours: record.extension_hours || 6,
                already_completed: true
            });
        }

        // Mark as manually completed
        db.run(`
            UPDATE url_extension_tracking
            SET completed_at = datetime('now'),
                completion_verified = 1,
                extension_granted = 1,
                status = 'completed'
            WHERE session_id = ? AND user_id = ?
        `, [session_id, user_id], function(completeErr) {
            if (completeErr) {
                console.error('Failed to complete URL extension:', completeErr);
                return res.status(500).json({ success: false, error: 'Failed to mark as completed' });
            }

            // Log extension completion for tracking
            const logSql = `
                INSERT INTO extension_logs (user_id, session_id, extension_code, hours_added, timestamp)
                VALUES (?, ?, 'manual_completion', ?, datetime('now'))
            `;

            db.run(logSql, [user_id, session_id, record.extension_hours || 6], (logErr) => {
                if (logErr) {
                    console.error('Failed to log extension:', logErr);
                }
            });

            console.log(`✅ URL extension manually completed for session: ${session_id}`);
            
            res.json({
                success: true,
                message: 'Extension manually completed successfully! You have been granted additional connection time.',
                session_id: session_id,
                extension_hours: record.extension_hours || 6,
                already_completed: false
            });
        });
    });
});

// Mark URL extension as completed (called by tracking system)
app.post('/api/url-extension/complete', (req, res) => {
    const { session_id, user_id } = req.body;

    if (!session_id || !user_id) {
        return res.status(400).json({ success: false, error: 'Session ID and User ID are required' });
    }

    // First check if session exists and can be completed
    db.get(`
        SELECT * FROM url_extension_tracking
        WHERE session_id = ? AND user_id = ?
    `, [session_id, user_id], (err, record) => {
        if (err) {
            console.error('Failed to get URL extension tracking:', err);
            return res.status(500).json({ success: false, error: 'Database error' });
        }

        if (!record) {
            return res.status(404).json({ success: false, error: 'Extension session not found' });
        }

        // Allow completion regardless of previous completion status for legitimate use
        // This enables repeated visits to work correctly
        const sql = `
            UPDATE url_extension_tracking
            SET completed_at = datetime('now'),
                completion_verified = 1,
                extension_granted = 1,
                status = 'completed'
            WHERE session_id = ? AND user_id = ?
        `;

        db.run(sql, [session_id, user_id], function(err) {
            if (err) {
                console.error('Failed to mark URL extension as completed:', err);
                return res.status(500).json({ success: false, error: 'Failed to complete extension' });
            }

            // Log extension completion for tracking
            const logSql = `
                INSERT INTO extension_logs (user_id, session_id, extension_code, hours_added, timestamp)
                VALUES (?, ?, 'url_completion', ?, datetime('now'))
            `;

            db.run(logSql, [user_id, session_id, record.extension_hours || 6], (logErr) => {
                if (logErr) {
                    console.error('Failed to log extension:', logErr);
                }
            });

            console.log(`✅ URL extension completed for user ${user_id}, session: ${session_id} (${record.completion_verified ? 'repeat' : 'first'} completion)`);
            
            res.json({
                success: true,
                message: 'Extension completed successfully',
                extension_granted: true,
                extension_hours: record.extension_hours || 6,
                is_repeat: record.completion_verified === 1
            });
        });
    });
});

// Get URL extension statistics
app.get('/api/url-extension/stats', requireAuth, (req, res) => {
    const sql = `
        SELECT
            COUNT(*) as total_extensions,
            COUNT(CASE WHEN completion_verified = 1 THEN 1 END) as completed_extensions,
            COUNT(CASE WHEN status = 'started' THEN 1 END) as pending_extensions,
            AVG(CASE WHEN completed_at IS NOT NULL AND started_at IS NOT NULL
                THEN (julianday(completed_at) - julianday(started_at)) * 24 * 60 END) as avg_completion_time_minutes
        FROM url_extension_tracking
        WHERE started_at >= datetime('now', '-30 days')
    `;

    db.get(sql, [], (err, stats) => {
        if (err) {
            console.error('Failed to get URL extension stats:', err);
            return res.status(500).json({ success: false, error: 'Failed to get statistics' });
        }

        res.json({
            success: true,
            stats: {
                total_extensions: stats.total_extensions || 0,
                completed_extensions: stats.completed_extensions || 0,
                pending_extensions: stats.pending_extensions || 0,
                completion_rate: stats.total_extensions > 0 ?
                    ((stats.completed_extensions / stats.total_extensions) * 100).toFixed(2) : 0,
                avg_completion_time_minutes: stats.avg_completion_time_minutes ?
                    Math.round(stats.avg_completion_time_minutes) : 0
            }
        });
    });
});

// Initialize the database and start the server
initializeDatabase();

// Add database migration for URL services dual-URL support
function migrateUrlServicesTable() {
    console.log('🔄 Checking URL services table for dual-URL migration...');

    // Check if new columns exist
    db.all("PRAGMA table_info(url_services)", (err, columns) => {
        if (err) {
            console.error('❌ Failed to check url_services table structure:', err);
            return;
        }

        const hasShortened = columns.some(col => col.name === 'shortened_url');
        const hasTarget = columns.some(col => col.name === 'target_url');

        if (!hasShortened || !hasTarget) {
            console.log('🔧 Adding dual-URL columns to url_services table...');

            const migrations = [];

            if (!hasShortened) {
                migrations.push("ALTER TABLE url_services ADD COLUMN shortened_url TEXT");
            }

            if (!hasTarget) {
                migrations.push("ALTER TABLE url_services ADD COLUMN target_url TEXT");
            }

            // Execute migrations
            let completed = 0;
            migrations.forEach((migration, index) => {
                db.run(migration, (err) => {
                    if (err) {
                        console.error(`❌ Migration ${index + 1} failed:`, err);
                    } else {
                        console.log(`✅ Migration ${index + 1} completed: ${migration}`);
                    }

                    completed++;
                    if (completed === migrations.length) {
                        console.log('✅ URL services table migration completed');
                    }
                });
            });
        } else {
            console.log('✅ URL services table already has dual-URL support');
        }
    });
}

// Wait a bit before running table-specific initializations to avoid race conditions
setTimeout(() => {
    setupAdminSessionsTable();

    // Run database integrity check
    verifyDatabaseIntegrity();

    // Run URL services migration
    migrateUrlServicesTable();

    // Start sync event monitoring with a delay to allow database fixes to complete
    setTimeout(() => {
        startSyncEventMonitoring();
        console.log('✅ Sync event monitoring started');
    }, 2000); // 2 second delay to allow fixes to complete
}, 1000); // 1 second delay after initial database setup

// Start server
server.listen(PORT, HOST, () => {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                SP5Proxy Admin Panel Server                     ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log(`🚀 Server running at http://${HOST}:${PORT}/`);
    console.log('🔄 WebSocket server active');
    console.log('✋ Press Ctrl+C to stop the server');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    db.close(() => {
        console.log('✅ Database connection closed');
        process.exit(0);
    });
});

module.exports = app; 