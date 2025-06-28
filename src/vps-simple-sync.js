// Simple VPS Sync for SP5Proxy
// This version doesn't require specific endpoints, just logs to admin panel

const http = require('http');

class SimpleVPSSync {
    constructor() {
        this.adminPanelUrl = 'http://168.231.82.24:8080';
        this.apiUrl = 'http://168.231.82.24:3002';
    }

    // Send connection info directly to admin panel WebSocket
    async syncConnection(data) {
        try {
            // Try to connect via WebSocket
            const WebSocket = require('ws');
            const ws = new WebSocket('ws://168.231.82.24:3002');
            
            ws.on('open', () => {
                ws.send(JSON.stringify({
                    type: 'user_connected',
                    data: {
                        userId: data.userId || 'unknown',
                        sessionId: data.sessionId,
                        proxyHost: data.proxyHost,
                        proxyPort: data.proxyPort,
                        externalIP: data.externalIP || 'detecting...',
                        location: data.location || 'detecting...',
                        timestamp: new Date().toISOString()
                    }
                }));
                console.log('✅ Connection data sent to VPS via WebSocket');
                ws.close();
            });

            ws.on('error', (err) => {
                console.warn('⚠️ WebSocket connection failed:', err.message);
            });
        } catch (err) {
            console.warn('⚠️ Simple VPS sync failed:', err.message);
        }
    }

    // Send disconnection info
    async syncDisconnection(sessionId) {
        try {
            const WebSocket = require('ws');
            const ws = new WebSocket('ws://168.231.82.24:3002');
            
            ws.on('open', () => {
                ws.send(JSON.stringify({
                    type: 'user_disconnected',
                    data: {
                        sessionId: sessionId,
                        timestamp: new Date().toISOString()
                    }
                }));
                console.log('✅ Disconnection data sent to VPS via WebSocket');
                ws.close();
            });

            ws.on('error', (err) => {
                console.warn('⚠️ WebSocket disconnection sync failed:', err.message);
            });
        } catch (err) {
            console.warn('⚠️ Simple VPS disconnection sync failed:', err.message);
        }
    }
}

module.exports = SimpleVPSSync; 