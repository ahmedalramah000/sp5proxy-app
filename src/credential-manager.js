const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const forge = require('node-forge');

class CredentialManager {
    constructor() {
        this.configDir = path.join(os.homedir(), '.sp5proxy');
        this.configFile = path.join(this.configDir, 'config.enc');
        this.keyFile = path.join(this.configDir, 'key.dat');
        this.encryptionKey = null;
    }

    async initialize() {
        // Ensure config directory exists
        try {
            await fs.mkdir(this.configDir, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }

        // Initialize or load encryption key
        await this.initializeEncryptionKey();
    }

    async initializeEncryptionKey() {
        try {
            // Try to load existing key
            const keyData = await fs.readFile(this.keyFile);
            this.encryptionKey = keyData;
        } catch (error) {
            if (error.code === 'ENOENT') {
                // Generate new key
                this.encryptionKey = crypto.randomBytes(32);
                await fs.writeFile(this.keyFile, this.encryptionKey, { mode: 0o600 });
                console.log('New encryption key generated');
            } else {
                throw error;
            }
        }
    }

    encrypt(data) {
        try {
            const algorithm = 'aes-256-gcm';
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv(algorithm, this.encryptionKey, iv);

            let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
            encrypted += cipher.final('hex');

            const authTag = cipher.getAuthTag();

            return {
                encrypted,
                iv: iv.toString('hex'),
                authTag: authTag.toString('hex')
            };
        } catch (error) {
            console.error('Encryption failed:', error);
            throw new Error(`Encryption failed: ${error.message}`);
        }
    }

    decrypt(encryptedData) {
        try {
            if (!encryptedData || !encryptedData.encrypted || !encryptedData.iv || !encryptedData.authTag) {
                throw new Error('Invalid encrypted data format');
            }

            const algorithm = 'aes-256-gcm';
            const iv = Buffer.from(encryptedData.iv, 'hex');
            const decipher = crypto.createDecipheriv(algorithm, this.encryptionKey, iv);

            decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

            let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return JSON.parse(decrypted);
        } catch (error) {
            console.error('Decryption failed:', error);
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }

    async saveConfig(config) {
        try {
            // Validate config
            this.validateConfig(config);
            
            // Encrypt sensitive data
            const encryptedConfig = this.encrypt(config);
            
            // Save to file
            await fs.writeFile(this.configFile, JSON.stringify(encryptedConfig), { mode: 0o600 });
            
            console.log('Configuration saved successfully');
        } catch (error) {
            console.error('Failed to save configuration:', error);
            throw new Error(`Failed to save configuration: ${error.message}`);
        }
    }

    async loadConfig() {
        try {
            // Read encrypted config
            const encryptedData = await fs.readFile(this.configFile, 'utf8');
            const encryptedConfig = JSON.parse(encryptedData);

            // Decrypt config
            const config = this.decrypt(encryptedConfig);

            console.log('Configuration loaded successfully');
            return config;
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('No saved configuration found');
                return null;
            }

            // If decryption fails (likely due to old format), delete the corrupted file
            if (error.message.includes('Decryption failed') || error.message.includes('Unsupported state')) {
                console.log('Corrupted or legacy configuration detected, cleaning up...');
                try {
                    await fs.unlink(this.configFile);
                    console.log('Corrupted configuration file removed');
                } catch (unlinkError) {
                    console.error('Failed to remove corrupted config:', unlinkError);
                }
                return null;
            }

            console.error('Failed to load configuration:', error);
            throw new Error(`Failed to load configuration: ${error.message}`);
        }
    }

    validateConfig(config) {
        if (!config) {
            throw new Error('Configuration is required');
        }

        if (!config.host || typeof config.host !== 'string') {
            throw new Error('Host is required and must be a string');
        }

        if (!config.port || typeof config.port !== 'number' || config.port < 1 || config.port > 65535) {
            throw new Error('Port is required and must be a number between 1 and 65535');
        }

        if (!config.type || !['socks5', 'http'].includes(config.type)) {
            throw new Error('Type is required and must be either "socks5" or "http"');
        }

        // Username and password are optional but if provided must be strings
        if (config.username && typeof config.username !== 'string') {
            throw new Error('Username must be a string');
        }

        if (config.password && typeof config.password !== 'string') {
            throw new Error('Password must be a string');
        }
    }

    async deleteConfig() {
        try {
            await fs.unlink(this.configFile);
            console.log('Configuration deleted successfully');
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('Failed to delete configuration:', error);
                throw new Error(`Failed to delete configuration: ${error.message}`);
            }
        }
    }

    async exportConfig(exportPath) {
        try {
            const config = await this.loadConfig();
            if (!config) {
                throw new Error('No configuration to export');
            }

            // Create export data (without sensitive info for security)
            const exportData = {
                host: config.host,
                port: config.port,
                type: config.type,
                username: config.username || '',
                // Don't export password for security
                exportedAt: new Date().toISOString(),
                version: '1.0.0'
            };

            await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2));
            console.log('Configuration exported successfully');
        } catch (error) {
            console.error('Failed to export configuration:', error);
            throw new Error(`Failed to export configuration: ${error.message}`);
        }
    }

    async importConfig(importPath) {
        try {
            const importData = await fs.readFile(importPath, 'utf8');
            const config = JSON.parse(importData);

            // Validate imported config
            this.validateConfig(config);

            // Save imported config
            await this.saveConfig(config);
            
            console.log('Configuration imported successfully');
            return config;
        } catch (error) {
            console.error('Failed to import configuration:', error);
            throw new Error(`Failed to import configuration: ${error.message}`);
        }
    }

    async getConfigHistory() {
        // This could be extended to maintain a history of configurations
        try {
            const historyFile = path.join(this.configDir, 'history.json');
            const historyData = await fs.readFile(historyFile, 'utf8');
            return JSON.parse(historyData);
        } catch (error) {
            return [];
        }
    }

    async addToHistory(config) {
        try {
            const history = await this.getConfigHistory();
            
            // Add current config to history (without password)
            const historyEntry = {
                host: config.host,
                port: config.port,
                type: config.type,
                username: config.username || '',
                savedAt: new Date().toISOString()
            };

            history.unshift(historyEntry);
            
            // Keep only last 10 entries
            if (history.length > 10) {
                history.splice(10);
            }

            const historyFile = path.join(this.configDir, 'history.json');
            await fs.writeFile(historyFile, JSON.stringify(history, null, 2));
        } catch (error) {
            console.error('Failed to add to history:', error);
        }
    }

    async clearHistory() {
        try {
            const historyFile = path.join(this.configDir, 'history.json');
            await fs.unlink(historyFile);
            console.log('Configuration history cleared');
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('Failed to clear history:', error);
            }
        }
    }

    async getStorageInfo() {
        try {
            const stats = await fs.stat(this.configDir);
            const configExists = await fs.access(this.configFile).then(() => true).catch(() => false);
            
            return {
                configDir: this.configDir,
                configExists,
                createdAt: stats.birthtime,
                modifiedAt: stats.mtime
            };
        } catch (error) {
            return {
                configDir: this.configDir,
                configExists: false,
                createdAt: null,
                modifiedAt: null
            };
        }
    }

    // Secure memory cleanup
    clearSensitiveData() {
        if (this.encryptionKey) {
            this.encryptionKey.fill(0);
            this.encryptionKey = null;
        }
    }
}

module.exports = CredentialManager;
