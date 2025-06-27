const express = require('express');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

/**
 * SP5Proxy Monetization Server
 * Generates and validates temporary OTP codes for connection extensions
 */
class SP5ProxyCodeGenerator {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3001;
        this.codesFile = path.join(__dirname, 'temp-codes.json');
        this.codes = new Map();
        this.setupMiddleware();
        this.setupRoutes();
        this.loadCodes();
        this.startCleanupInterval();
    }

    setupMiddleware() {
        this.app.use(cors({
            origin: ['http://localhost:3000', 'https://sp5proxy.com'],
            credentials: true
        }));
        this.app.use(express.json());
        this.app.use(express.static('public'));
        
        // Security headers
        this.app.use((req, res, next) => {
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');
            res.setHeader('X-XSS-Protection', '1; mode=block');
            next();
        });
    }

    setupRoutes() {
        // Generate new temporary code
        this.app.post('/api/generate-code', async (req, res) => {
            try {
                const { userId, urlService } = req.body;
                
                if (!userId || !urlService) {
                    return res.status(400).json({
                        success: false,
                        message: 'Missing required parameters'
                    });
                }

                const code = await this.generateCode(userId, urlService);
                
                res.json({
                    success: true,
                    code: code.code,
                    expiresAt: code.expiresAt,
                    urlService: urlService
                });
            } catch (error) {
                console.error('Code generation error:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to generate code'
                });
            }
        });

        // Validate and consume code
        this.app.post('/api/validate-code', async (req, res) => {
            try {
                const { code, userId } = req.body;
                
                if (!code || !userId) {
                    return res.status(400).json({
                        success: false,
                        message: 'Missing code or user ID'
                    });
                }

                const result = await this.validateCode(code, userId);
                
                if (result.valid) {
                    res.json({
                        success: true,
                        message: 'Code validated successfully',
                        extensionHours: 4,
                        validatedAt: new Date().toISOString()
                    });
                } else {
                    res.status(400).json({
                        success: false,
                        message: result.reason || 'Invalid code'
                    });
                }
            } catch (error) {
                console.error('Code validation error:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to validate code'
                });
            }
        });

        // Get shortened URL for code generation
        this.app.post('/api/get-shortened-url', async (req, res) => {
            try {
                const { userId, service } = req.body;
                
                if (!userId || !service) {
                    return res.status(400).json({
                        success: false,
                        message: 'Missing required parameters'
                    });
                }

                const shortenedUrl = await this.createShortenedUrl(userId, service);
                
                res.json({
                    success: true,
                    url: shortenedUrl.url,
                    service: service,
                    codeId: shortenedUrl.codeId
                });
            } catch (error) {
                console.error('URL shortening error:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to create shortened URL'
                });
            }
        });

        // Health check endpoint
        this.app.get('/api/health', (req, res) => {
            res.json({
                success: true,
                status: 'healthy',
                timestamp: new Date().toISOString(),
                activeCodes: this.codes.size
            });
        });
    }

    async generateCode(userId, urlService) {
        // Generate unique 8-character alphanumeric code
        const code = crypto.randomBytes(4).toString('hex').toUpperCase();
        const codeId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes expiry

        const codeData = {
            code,
            codeId,
            userId,
            urlService,
            createdAt: new Date().toISOString(),
            expiresAt: expiresAt.toISOString(),
            used: false,
            usedAt: null
        };

        this.codes.set(code, codeData);
        await this.saveCodes();

        console.log(`Generated code ${code} for user ${userId} via ${urlService}`);
        
        return codeData;
    }

    async validateCode(code, userId) {
        const codeData = this.codes.get(code.toUpperCase());
        
        if (!codeData) {
            return { valid: false, reason: 'Code not found' };
        }

        if (codeData.used) {
            return { valid: false, reason: 'Code already used' };
        }

        if (new Date() > new Date(codeData.expiresAt)) {
            // Clean up expired code
            this.codes.delete(code.toUpperCase());
            await this.saveCodes();
            return { valid: false, reason: 'Code expired' };
        }

        if (codeData.userId !== userId) {
            return { valid: false, reason: 'Code not valid for this user' };
        }

        // Mark code as used
        codeData.used = true;
        codeData.usedAt = new Date().toISOString();
        
        // Remove code after use (single-use only)
        this.codes.delete(code.toUpperCase());
        await this.saveCodes();

        console.log(`Code ${code} validated and consumed for user ${userId}`);
        
        return { valid: true, codeData };
    }

    async createShortenedUrl(userId, service) {
        const codeData = await this.generateCode(userId, service);
        
        // Create the shortened URL based on service
        const baseUrl = `${req.protocol}://${req.get('host')}/claim/${codeData.codeId}`;
        
        let shortenedUrl;
        switch (service) {
            case 'shrinkearn.com':
                shortenedUrl = `https://shrinkearn.com/ref/sp5proxy?url=${encodeURIComponent(baseUrl)}`;
                break;
            case 'exe.io':
                shortenedUrl = `https://exe.io/ref/sp5proxy?url=${encodeURIComponent(baseUrl)}`;
                break;
            case 'cuty.io':
                shortenedUrl = `https://cuty.io/ref/sp5proxy?url=${encodeURIComponent(baseUrl)}`;
                break;
            default:
                shortenedUrl = baseUrl; // Fallback to direct URL
        }

        return {
            url: shortenedUrl,
            codeId: codeData.codeId,
            code: codeData.code
        };
    }

    async loadCodes() {
        try {
            const data = await fs.readFile(this.codesFile, 'utf8');
            const codesArray = JSON.parse(data);
            this.codes = new Map(codesArray);
            console.log(`Loaded ${this.codes.size} codes from storage`);
        } catch (error) {
            console.log('No existing codes file found, starting fresh');
            this.codes = new Map();
        }
    }

    async saveCodes() {
        try {
            const codesArray = Array.from(this.codes.entries());
            await fs.writeFile(this.codesFile, JSON.stringify(codesArray, null, 2));
        } catch (error) {
            console.error('Failed to save codes:', error);
        }
    }

    startCleanupInterval() {
        // Clean up expired codes every 5 minutes
        setInterval(async () => {
            const now = new Date();
            let cleanedCount = 0;
            
            for (const [code, codeData] of this.codes.entries()) {
                if (new Date(codeData.expiresAt) < now) {
                    this.codes.delete(code);
                    cleanedCount++;
                }
            }
            
            if (cleanedCount > 0) {
                await this.saveCodes();
                console.log(`Cleaned up ${cleanedCount} expired codes`);
            }
        }, 5 * 60 * 1000);
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`SP5Proxy Code Generator Server running on port ${this.port}`);
            console.log(`Health check: http://localhost:${this.port}/api/health`);
        });
    }
}

// Start server if run directly
if (require.main === module) {
    const server = new SP5ProxyCodeGenerator();
    server.start();
}

module.exports = SP5ProxyCodeGenerator;
