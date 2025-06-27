const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const DatabaseManager = require('./database-manager');

/**
 * SP5Proxy API Server
 * Provides REST API and WebSocket communication between desktop app and PHP admin panel
 */
class APIServer {
    constructor(port = 3002) {
        this.port = port;
        this.app = express();
        this.server = null;
        this.wss = null;
        this.dbManager = new DatabaseManager();
        this.clients = new Map(); // Track WebSocket clients
        this.isRunning = false;
    }

    /**
     * Initialize and start the API server
     */
    async initialize() {
        try {
            console.log('🚀 Initializing API server...');
            
            // Initialize database
            await this.dbManager.initialize();
            
            // Setup Express middleware
            this.setupMiddleware();
            
            // Setup routes
            this.setupRoutes();
            
            // Start server
            await this.startServer();
            
            // Setup WebSocket
            this.setupWebSocket();
            
            // Setup database event listeners
            this.setupDatabaseListeners();
            
            console.log(`✅ API server running on port ${this.port}`);
            this.isRunning = true;
        } catch (error) {
            console.error('❌ Failed to initialize API server:', error);
            throw error;
        }
    }

    /**
     * Setup Express middleware
     */
    setupMiddleware() {
        this.app.use(cors({
            origin: ['http://localhost', 'http://127.0.0.1', 'http://localhost:8080'],
            credentials: true
        }));
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true }));
        
        // Request logging
        this.app.use((req, res, next) => {
            console.log(`📡 ${req.method} ${req.path} - ${req.ip}`);
            next();
        });
    }

    /**
     * Setup API routes
     */
    setupRoutes() {
        // Health check
        this.app.get('/api/health', (req, res) => {
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                database: this.dbManager.isConnected
            });
        });

        // User management
        this.app.post('/api/users', async (req, res) => {
            try {
                const { userId, userData } = req.body;
                const result = await this.dbManager.createOrUpdateUser(userId, userData);
                res.json({ success: result });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Connection tracking
        this.app.post('/api/connections', async (req, res) => {
            try {
                const connectionData = req.body;
                // Broadcast to WebSocket clients for real-time updates
                this.broadcast({
                    type: 'new_connection',
                    data: connectionData
                });
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Session management
        this.app.post('/api/sessions', async (req, res) => {
            try {
                const sessionId = await this.dbManager.createSession(req.body);
                res.json({ success: !!sessionId, sessionId });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.put('/api/sessions/:sessionId', async (req, res) => {
            try {
                const { sessionId } = req.params;
                const result = await this.dbManager.updateSession(sessionId, req.body);
                res.json({ success: result });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.delete('/api/sessions/:sessionId', async (req, res) => {
            try {
                const { sessionId } = req.params;
                const { duration } = req.body;
                const result = await this.dbManager.endSession(sessionId, duration);
                res.json({ success: result });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Alternative endpoint for ending sessions (used by VPS sync)
        this.app.post('/api/sessions/end', async (req, res) => {
            try {
                const { sessionId } = req.body;
                const result = await this.dbManager.endSession(sessionId);
                res.json({ success: result });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // URL services management
        this.app.get('/api/url-services', async (req, res) => {
            try {
                const services = await this.dbManager.getUrlServices();
                res.json(services);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.put('/api/url-services/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const result = await this.dbManager.updateUrlService(id, req.body);
                res.json({ success: result });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // System configuration
        this.app.get('/api/config', async (req, res) => {
            try {
                const [configs] = await this.dbManager.connection.execute(
                    'SELECT config_key, config_value, config_type FROM system_config WHERE is_public = TRUE'
                );
                
                const configObj = {};
                configs.forEach(config => {
                    let value = config.config_value;
                    switch (config.config_type) {
                        case 'number':
                            value = parseFloat(value);
                            break;
                        case 'boolean':
                            value = value === 'true';
                            break;
                        case 'json':
                            value = JSON.parse(value);
                            break;
                    }
                    configObj[config.config_key] = value;
                });
                
                res.json(configObj);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Extension codes
        this.app.post('/api/extension-codes', async (req, res) => {
            try {
                const { userId, code, urlServiceId, shortenedUrl, expiresAt } = req.body;
                
                const [result] = await this.dbManager.connection.execute(
                    `INSERT INTO extension_codes 
                     (user_id, code, url_service_id, shortened_url, expires_at) 
                     VALUES (?, ?, ?, ?, ?)`,
                    [userId, code, urlServiceId, shortenedUrl, expiresAt]
                );
                
                res.json({ success: true, id: result.insertId });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/extension-codes/validate', async (req, res) => {
            try {
                const { code, userId } = req.body;
                
                const [codes] = await this.dbManager.connection.execute(
                    `SELECT * FROM extension_codes 
                     WHERE code = ? AND user_id = ? AND is_used = FALSE AND expires_at > NOW()`,
                    [code, userId]
                );
                
                if (codes.length > 0) {
                    // Mark as used
                    await this.dbManager.connection.execute(
                        'UPDATE extension_codes SET is_used = TRUE, used_at = NOW() WHERE id = ?',
                        [codes[0].id]
                    );
                    
                    res.json({ 
                        success: true, 
                        extensionHours: codes[0].extension_hours 
                    });
                } else {
                    res.json({ success: false, message: 'Invalid or expired code' });
                }
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Statistics for admin panel
        this.app.get('/api/stats', async (req, res) => {
            try {
                const [activeUsers] = await this.dbManager.connection.execute(
                    'SELECT COUNT(*) as count FROM active_sessions WHERE status = "connected"'
                );
                
                const [totalUsers] = await this.dbManager.connection.execute(
                    'SELECT COUNT(*) as count FROM users'
                );
                
                const [todayConnections] = await this.dbManager.connection.execute(
                    'SELECT COUNT(*) as count FROM connection_logs WHERE DATE(timestamp) = CURDATE()'
                );
                
                res.json({
                    activeUsers: activeUsers[0].count,
                    totalUsers: totalUsers[0].count,
                    todayConnections: todayConnections[0].count
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
    }

    /**
     * Start HTTP server
     */
    async startServer() {
        return new Promise((resolve, reject) => {
            this.server = http.createServer(this.app);
            
            this.server.listen(this.port, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Setup WebSocket server for real-time communication
     */
    setupWebSocket() {
        this.wss = new WebSocket.Server({ server: this.server });
        
        this.wss.on('connection', (ws, req) => {
            const clientId = this.generateClientId();
            this.clients.set(clientId, ws);
            
            console.log(`🔌 WebSocket client connected: ${clientId}`);
            
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    this.handleWebSocketMessage(clientId, data);
                } catch (error) {
                    console.error('❌ Invalid WebSocket message:', error);
                }
            });
            
            ws.on('close', () => {
                this.clients.delete(clientId);
                console.log(`🔌 WebSocket client disconnected: ${clientId}`);
            });
            
            // Send welcome message
            ws.send(JSON.stringify({
                type: 'connected',
                clientId: clientId,
                timestamp: new Date().toISOString()
            }));
        });
    }

    /**
     * Handle WebSocket messages
     */
    handleWebSocketMessage(clientId, data) {
        console.log(`📨 WebSocket message from ${clientId}:`, data.type);
        
        switch (data.type) {
            case 'subscribe':
                // Handle subscription to specific events
                break;
            case 'ping':
                this.sendToClient(clientId, { type: 'pong', timestamp: new Date().toISOString() });
                break;
        }
    }

    /**
     * Send message to specific client
     */
    sendToClient(clientId, message) {
        const client = this.clients.get(clientId);
        if (client && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    }

    /**
     * Broadcast message to all connected clients
     */
    broadcast(message) {
        this.clients.forEach((client, clientId) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(message));
            }
        });
    }

    /**
     * Setup database event listeners for real-time sync
     */
    setupDatabaseListeners() {
        this.dbManager.on('urlServiceUpdated', (data) => {
            this.broadcast({
                type: 'urlServiceUpdated',
                data: data,
                timestamp: new Date().toISOString()
            });
        });

        this.dbManager.on('configUpdated', (data) => {
            this.broadcast({
                type: 'configUpdated',
                data: data,
                timestamp: new Date().toISOString()
            });
        });

        this.dbManager.on('userStatusChanged', (data) => {
            this.broadcast({
                type: 'userStatusChanged',
                data: data,
                timestamp: new Date().toISOString()
            });
        });
    }

    /**
     * Generate unique client ID
     */
    generateClientId() {
        return 'client_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Cleanup and stop server
     */
    async cleanup() {
        try {
            console.log('🛑 Stopping API server...');
            
            if (this.wss) {
                this.wss.close();
            }
            
            if (this.server) {
                this.server.close();
            }
            
            await this.dbManager.cleanup();
            
            this.isRunning = false;
            console.log('✅ API server stopped');
        } catch (error) {
            console.error('❌ API server cleanup error:', error);
        }
    }
}

module.exports = APIServer;
