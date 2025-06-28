const config = require('../config-web.js');
const https = require('https');
const http = require('http');

class VPSSync {
    constructor() {
        this.vpsUrl = config.vps.apiUrl;
        this.enabled = config.database.enableRemoteSync;
        console.log('🔄 VPS Sync initialized:', { url: this.vpsUrl, enabled: this.enabled });
    }

    async sendToVPS(endpoint, data) {
        if (!this.enabled) {
            console.log('⚠️ VPS sync disabled');
            return;
        }

        const url = `${this.vpsUrl}${endpoint}`;
        console.log('📤 Sending to VPS:', url, data);

        return new Promise((resolve, reject) => {
            const postData = JSON.stringify(data);
            const options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData),
                },
                timeout: 5000
            };

            const req = http.request(url, options, (res) => {
                let responseData = '';
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                res.on('end', () => {
                    console.log('✅ VPS response:', res.statusCode, responseData);
                    resolve({ status: res.statusCode, data: responseData });
                });
            });

            req.on('error', (err) => {
                console.error('❌ VPS sync error:', err.message);
                resolve(null); // Don't reject, just continue without VPS sync
            });

            req.on('timeout', () => {
                console.error('❌ VPS sync timeout');
                req.destroy();
                resolve(null);
            });

            req.write(postData);
            req.end();
        });
    }

    async syncUser(userData) {
        return await this.sendToVPS('/users', userData);
    }

    async syncSession(sessionData) {
        return await this.sendToVPS('/sessions', sessionData);
    }

    async syncConnection(connectionData) {
        return await this.sendToVPS('/connections', connectionData);
    }

    async endSession(sessionId) {
        return await this.sendToVPS('/sessions/end', { sessionId });
    }
}

module.exports = VPSSync; 