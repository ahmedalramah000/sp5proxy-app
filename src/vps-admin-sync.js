// Direct Admin Panel Sync for SP5Proxy
// This version connects directly to admin panel WebSocket

const WebSocket = require('ws');

class VPSAdminSync {
    constructor() {
        this.adminPanelUrl = 'http://168.231.82.24:8080';
        this.wsUrl = 'ws://168.231.82.24:8080'; // Admin panel WebSocket
        this.ws = null;
        this.reconnectTimeout = null;
        this.isConnected = false;
    }

    connect() {
        try {
            console.log('🔌 Connecting to Admin Panel WebSocket...');
            this.ws = new WebSocket(this.wsUrl);
            
            this.ws.on('open', () => {
                console.log('✅ Connected to Admin Panel WebSocket');
                this.isConnected = true;
                
                // Send initial handshake
                this.send({
                    type: 'desktop_app_connect',
                    data: {
                        version: '1.0.0',
                        platform: process.platform
                    }
                });
            });

            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    console.log('📥 Admin Panel message:', message);
                } catch (err) {
                    console.log('📥 Admin Panel raw message:', data.toString());
                }
            });

            this.ws.on('error', (err) => {
                console.warn('⚠️ Admin Panel WebSocket error:', err.message);
                this.isConnected = false;
            });

            this.ws.on('close', () => {
                console.log('🔌 Admin Panel WebSocket closed');
                this.isConnected = false;
                this.scheduleReconnect();
            });
        } catch (err) {
            console.error('❌ Failed to connect to Admin Panel:', err.message);
            this.scheduleReconnect();
        }
    }

    scheduleReconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }
        
        this.reconnectTimeout = setTimeout(() => {
            console.log('🔄 Attempting to reconnect to Admin Panel...');
            this.connect();
        }, 5000);
    }

    send(data) {
        if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
            return true;
        }
        return false;
    }

    // Send connection info to admin panel
    async syncConnection(data) {
        const message = {
            type: 'user_connected',
            data: {
                userId: data.userId || 'unknown',
                sessionId: data.sessionId,
                proxyHost: data.proxyHost,
                proxyPort: data.proxyPort,
                proxyType: data.proxyType || 'socks5',
                externalIP: data.externalIP || 'detecting...',
                location: data.location || 'detecting...',
                countryCode: data.countryCode || 'XX',
                timestamp: new Date().toISOString(),
                source: 'desktop_app'
            }
        };

        if (this.send(message)) {
            console.log('✅ Connection data sent to Admin Panel');
        } else {
            console.warn('⚠️ Admin Panel not connected, trying HTTP fallback...');
            await this.httpFallback('/api/connections', message.data);
        }
    }

    // Send disconnection info
    async syncDisconnection(sessionId) {
        const message = {
            type: 'user_disconnected',
            data: {
                sessionId: sessionId,
                timestamp: new Date().toISOString(),
                source: 'desktop_app'
            }
        };

        if (this.send(message)) {
            console.log('✅ Disconnection data sent to Admin Panel');
        } else {
            console.warn('⚠️ Admin Panel not connected, trying HTTP fallback...');
            await this.httpFallback('/api/disconnections', message.data);
        }
    }

    // Update session location
    async updateLocation(sessionId, locationData) {
        const message = {
            type: 'location_updated',
            data: {
                sessionId: sessionId,
                externalIP: locationData.externalIP,
                location: locationData.location,
                countryCode: locationData.countryCode,
                timestamp: new Date().toISOString(),
                source: 'desktop_app'
            }
        };

        if (this.send(message)) {
            console.log('✅ Location update sent to Admin Panel');
        }
    }

    // HTTP fallback for when WebSocket is not available
    async httpFallback(endpoint, data) {
        try {
            const http = require('http');
            const postData = JSON.stringify(data);
            
            const options = {
                hostname: '168.231.82.24',
                port: 8080,
                path: endpoint,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            return new Promise((resolve, reject) => {
                const req = http.request(options, (res) => {
                    let responseData = '';
                    res.on('data', chunk => responseData += chunk);
                    res.on('end', () => {
                        console.log(`📤 HTTP fallback response: ${res.statusCode}`);
                        resolve(responseData);
                    });
                });

                req.on('error', (err) => {
                    console.warn('⚠️ HTTP fallback failed:', err.message);
                    reject(err);
                });

                req.write(postData);
                req.end();
            });
        } catch (err) {
            console.warn('⚠️ HTTP fallback error:', err.message);
        }
    }

    // Cleanup
    disconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        this.isConnected = false;
        console.log('🔌 Admin Panel sync disconnected');
    }
}

module.exports = VPSAdminSync; 