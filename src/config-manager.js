const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class ConfigManager {
    constructor() {
        // Store config in user's AppData directory for persistence
        this.configDir = path.join(os.homedir(), 'AppData', 'Roaming', 'SP5Proxy');
        this.configFile = path.join(this.configDir, 'config.json');
        this.defaultConfig = {
            proxy: {
                host: '',
                port: '',
                type: 'socks5',
                username: '',
                password: '',
                lastConnected: null
            },
            ui: {
                theme: 'dark',
                autoConnect: false,
                minimizeToTray: true,
                showNotifications: true
            },
            network: {
                dnsServers: ['8.8.8.8', '1.1.1.1'],
                enableDnsLeakPrevention: true,
                connectionTimeout: 45000
            },
            monetization: {
                userId: null,
                lastTrialStart: null,
                extensionCodes: []
            }
        };
        this.config = { ...this.defaultConfig };
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        try {
            console.log('🔧 Initializing configuration manager...');
            
            // Ensure config directory exists
            await this.ensureConfigDirectory();
            
            // Load existing configuration
            await this.loadConfig();
            
            this.initialized = true;
            console.log('✅ Configuration manager initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize configuration manager:', error);
            // Use default config if initialization fails
            this.config = { ...this.defaultConfig };
            this.initialized = true;
        }
    }

    async ensureConfigDirectory() {
        try {
            await fs.access(this.configDir);
        } catch (error) {
            // Directory doesn't exist, create it
            await fs.mkdir(this.configDir, { recursive: true });
            console.log('📁 Created configuration directory:', this.configDir);
        }
    }

    async loadConfig() {
        try {
            const configData = await fs.readFile(this.configFile, 'utf8');
            const loadedConfig = JSON.parse(configData);
            
            // Merge with default config to ensure all properties exist
            this.config = this.mergeConfigs(this.defaultConfig, loadedConfig);
            
            console.log('✅ Configuration loaded successfully');
            console.log('📊 Loaded proxy config:', {
                host: this.config.proxy.host || '(not set)',
                port: this.config.proxy.port || '(not set)',
                type: this.config.proxy.type
            });
            
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('📄 No existing configuration found, using defaults');
                await this.saveConfig(); // Create initial config file
            } else {
                console.error('❌ Failed to load configuration:', error);
                throw error;
            }
        }
    }

    async saveConfig() {
        try {
            const configData = JSON.stringify(this.config, null, 2);
            await fs.writeFile(this.configFile, configData, 'utf8');
            console.log('💾 Configuration saved successfully');
        } catch (error) {
            console.error('❌ Failed to save configuration:', error);
            throw error;
        }
    }

    mergeConfigs(defaultConfig, loadedConfig) {
        const merged = { ...defaultConfig };
        
        for (const key in loadedConfig) {
            if (typeof loadedConfig[key] === 'object' && !Array.isArray(loadedConfig[key])) {
                merged[key] = { ...defaultConfig[key], ...loadedConfig[key] };
            } else {
                merged[key] = loadedConfig[key];
            }
        }
        
        return merged;
    }

    // Proxy configuration methods
    async saveProxyConfig(proxyConfig) {
        this.config.proxy = {
            ...this.config.proxy,
            ...proxyConfig,
            lastConnected: new Date().toISOString()
        };
        await this.saveConfig();
        console.log('✅ Proxy configuration saved');
    }

    getProxyConfig() {
        return { ...this.config.proxy };
    }

    async clearProxyConfig() {
        this.config.proxy = { ...this.defaultConfig.proxy };
        await this.saveConfig();
        console.log('🗑️ Proxy configuration cleared');
    }

    // UI configuration methods
    async saveUIConfig(uiConfig) {
        this.config.ui = { ...this.config.ui, ...uiConfig };
        await this.saveConfig();
    }

    getUIConfig() {
        return { ...this.config.ui };
    }

    // Network configuration methods
    async saveNetworkConfig(networkConfig) {
        this.config.network = { ...this.config.network, ...networkConfig };
        await this.saveConfig();
    }

    getNetworkConfig() {
        return { ...this.config.network };
    }

    // Monetization configuration methods
    async saveMonetizationConfig(monetizationConfig) {
        this.config.monetization = { ...this.config.monetization, ...monetizationConfig };
        await this.saveConfig();
    }

    getMonetizationConfig() {
        return { ...this.config.monetization };
    }

    // Utility methods
    getFullConfig() {
        return { ...this.config };
    }

    async resetToDefaults() {
        this.config = { ...this.defaultConfig };
        await this.saveConfig();
        console.log('🔄 Configuration reset to defaults');
    }

    // Auto-connect functionality
    shouldAutoConnect() {
        return this.config.ui.autoConnect && 
               this.config.proxy.host && 
               this.config.proxy.port;
    }

    getLastProxyConfig() {
        if (this.config.proxy.host && this.config.proxy.port) {
            return {
                host: this.config.proxy.host,
                port: this.config.proxy.port,
                type: this.config.proxy.type,
                username: this.config.proxy.username,
                password: this.config.proxy.password
            };
        }
        return null;
    }

    // Validation methods
    validateProxyConfig(config) {
        const errors = [];
        
        if (!config.host || config.host.trim() === '') {
            errors.push('Proxy host is required');
        }
        
        if (!config.port || isNaN(config.port) || config.port < 1 || config.port > 65535) {
            errors.push('Valid proxy port (1-65535) is required');
        }
        
        if (!['socks5', 'http', 'https'].includes(config.type)) {
            errors.push('Proxy type must be socks5, http, or https');
        }
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    // Export/Import functionality
    async exportConfig() {
        return JSON.stringify(this.config, null, 2);
    }

    async importConfig(configString) {
        try {
            const importedConfig = JSON.parse(configString);
            this.config = this.mergeConfigs(this.defaultConfig, importedConfig);
            await this.saveConfig();
            console.log('✅ Configuration imported successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to import configuration:', error);
            return false;
        }
    }

    // Get config file path for debugging
    getConfigPath() {
        return this.configFile;
    }
}

module.exports = ConfigManager;
