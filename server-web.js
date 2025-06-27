const express = require('express');
const path = require('path');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');

// Import managers (adapt from existing Electron app)
const DatabaseManager = require('./src/database-manager.js');
const ConfigManager = require('./src/config-manager.js');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const ADMIN_PORT = process.env.ADMIN_PORT || 3002;

console.log('🚀 Starting SP5Proxy Web Server...');

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'http://168.231.82.24', 'https://168.231.82.24'],
    credentials: true
}));
app.use(express.json());
app.use(express.static('dist-react'));
app.use('/admin', express.static('admin-panel/public'));

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
    next();
});

// Initialize managers
let databaseManager;
let configManager;

async function initializeApp() {
    try {
        console.log('📦 Initializing components...');
        
        // Initialize config manager
        configManager = new ConfigManager();
        console.log('✅ ConfigManager initialized');
        
        // Initialize database manager
        databaseManager = new DatabaseManager();
        await databaseManager.initialize();
        console.log('✅ DatabaseManager initialized');
        
        console.log('🎯 All components initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize components:', error);
        process.exit(1);
    }
}

// API Routes
app.get('/api/status', (req, res) => {
    res.json({
        status: 'running',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

app.get('/api/config', (req, res) => {
    try {
        const config = configManager ? configManager.getProxyConfig() : {};
        res.json({ success: true, config });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/config', (req, res) => {
    try {
        if (configManager) {
            configManager.saveProxyConfig(req.body);
            res.json({ success: true });
        } else {
            throw new Error('Config manager not initialized');
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/external-ip', async (req, res) => {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        res.json({ success: true, ip: data.ip });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/location/:ip', async (req, res) => {
    try {
        const { ip } = req.params;
        const response = await fetch(`http://ip-api.com/json/${ip}`);
        const data = await response.json();
        
        if (data.status === 'success') {
            res.json({
                success: true,
                location: {
                    country: data.country,
                    countryCode: data.countryCode,
                    city: data.city,
                    region: data.regionName,
                    flag: getCountryFlag(data.countryCode)
                }
            });
        } else {
            throw new Error('Location lookup failed');
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Helper function for country flags
function getCountryFlag(countryCode) {
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt());
    return String.fromCodePoint(...codePoints);
}

// WebSocket for real-time updates
wss.on('connection', (ws) => {
    console.log('📡 New WebSocket connection');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('📨 WebSocket message:', data);
            
            // Handle different message types
            switch (data.type) {
                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                    break;
                case 'status':
                    ws.send(JSON.stringify({ 
                        type: 'status', 
                        data: { connected: false, ip: '0.0.0.0' } 
                    }));
                    break;
                default:
                    console.log('Unknown message type:', data.type);
            }
        } catch (error) {
            console.error('❌ WebSocket message error:', error);
        }
    });
    
    ws.on('close', () => {
        console.log('📡 WebSocket connection closed');
    });
});

// Serve React app
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index-react.html'));
});

// Serve admin panel
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-panel/public/index.html'));
});

// Handle React Router (SPA)
app.get('*', (req, res) => {
    if (req.path.startsWith('/admin')) {
        res.sendFile(path.join(__dirname, 'admin-panel/public/index.html'));
    } else if (req.path.startsWith('/api')) {
        res.status(404).json({ error: 'API endpoint not found' });
    } else {
        res.sendFile(path.join(__dirname, 'index-react.html'));
    }
});

// Start server
async function startServer() {
    await initializeApp();
    
    server.listen(PORT, '0.0.0.0', () => {
        console.log('🌐 SP5Proxy Web Server started!');
        console.log(`📱 Main App: http://168.231.82.24:${PORT}`);
        console.log(`🔧 Admin Panel: http://168.231.82.24:${PORT}/admin`);
        console.log(`🚀 Server running on port ${PORT}`);
        console.log('✅ Ready to serve web clients!');
    });
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    server.close(() => {
        console.log('✅ Server closed');
        if (databaseManager) {
            databaseManager.cleanup();
        }
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully...');
    server.close(() => {
        console.log('✅ Server closed');
        if (databaseManager) {
            databaseManager.cleanup();
        }
        process.exit(0);
    });
});

// Start the server
startServer().catch(error => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
}); 