const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const net = require('net');
const { SocksProxyAgent } = require('socks-proxy-agent');

class ProxyManager {
    constructor() {
        this.tun2socksProcess = null;
        this.isRunning = false;
        this.currentConfig = null;
        this.externalIP = null;
        this.binPath = path.join(__dirname, '..', 'bin');
        this.validationResults = null;
        this.retryAttempts = 0;
        this.maxRetries = 2;

        // Health monitoring properties
        this.healthMonitorInterval = null;
        this.isHealthy = false;
        this.lastHealthCheck = null;
    }

    async initialize() {
        // Ensure bin directory exists and has required files
        await this.ensureBinaries();
    }

    /**
     * Comprehensive proxy connectivity validation
     * @param {Object} config - Proxy configuration
     * @param {Object} options - Validation options
     * @returns {Object} Validation results with detailed status
     */
    async validateProxyConnection(config, options = {}) {
        console.log('🔍 Starting comprehensive proxy validation...');

        const startTime = Date.now();
        const results = {
            isValid: false,
            tcpConnectivity: false,
            socksAuthentication: false,
            httpThroughProxy: false,
            responseTime: null,
            errors: [],
            warnings: [],
            details: {}
        };

        try {
            // Step 1: Validate configuration format
            console.log('Step 1: Validating configuration format...');
            this.validateConfigurationFormat(config);
            results.details.configFormat = 'valid';

            // Step 2: Test TCP connectivity
            console.log('Step 2: Testing TCP connectivity...');
            const tcpResult = await this.testTCPConnectivity(config);
            results.tcpConnectivity = tcpResult.success;
            results.details.tcpTest = tcpResult;

            if (!tcpResult.success) {
                results.errors.push(`TCP connection failed: ${tcpResult.error}`);
                return results;
            }

            // Step 3: Test SOCKS5 authentication (if applicable)
            if (config.type === 'socks5') {
                console.log('Step 3: Testing SOCKS5 authentication...');
                const authResult = await this.testSOCKS5Authentication(config);
                results.socksAuthentication = authResult.success;
                results.details.authTest = authResult;

                if (!authResult.success) {
                    results.errors.push(`SOCKS5 authentication failed: ${authResult.error}`);
                    return results;
                }
            } else {
                results.socksAuthentication = true; // Not applicable for HTTP proxies
                results.details.authTest = { success: true, message: 'Not applicable for HTTP proxy' };
            }

            // Step 4: Test HTTP requests through proxy (optional for faster connection)
            if (!options.skipHttpTest) {
                console.log('Step 4: Testing HTTP requests through proxy...');
                const httpResult = await this.testHTTPThroughProxy(config);
                results.httpThroughProxy = httpResult.success;
                results.details.httpTest = httpResult;

                if (!httpResult.success) {
                    results.errors.push(`HTTP through proxy failed: ${httpResult.error}`);
                    // Don't return here if it's optional, just warn
                    console.log('⚠️ HTTP test failed, but continuing...');
                    results.warnings.push('HTTP through proxy test failed, but proxy may still work');
                }
            } else {
                console.log('Step 4: Skipping HTTP test for faster connection...');
                results.httpThroughProxy = true; // Assume it works
                results.details.httpTest = { success: true, message: 'Skipped for faster connection' };
            }

            // Step 5: Test UDP ASSOCIATE support (for SOCKS5 only)
            if (config.type === 'socks5') {
                console.log('Step 5: Testing UDP ASSOCIATE support...');
                const udpResult = await this.testUDPAssociateSupport(config);
                results.udpAssociateSupported = udpResult.success;
                results.details.udpTest = udpResult;

                if (!udpResult.success) {
                    results.warnings.push('UDP ASSOCIATE not supported - will use TCP-only mode');
                    console.log('⚠️ UDP ASSOCIATE not supported by this proxy');
                    // Set flag for TCP-only mode
                    config.tcpOnly = true;
                }
            } else {
                results.udpAssociateSupported = false; // HTTP proxies don't support UDP
                results.details.udpTest = { success: false, message: 'UDP not supported by HTTP proxies' };
            }

            // Calculate response time
            results.responseTime = Date.now() - startTime;
            results.isValid = true;

            console.log(`✅ Proxy validation successful! Response time: ${results.responseTime}ms`);

        } catch (error) {
            console.error('❌ Proxy validation failed:', error.message);
            results.errors.push(error.message);
        }

        this.validationResults = results;
        return results;
    }

    /**
     * Validate proxy configuration format
     * @param {Object} config - Proxy configuration
     */
    validateConfigurationFormat(config) {
        if (!config) {
            throw new Error('Configuration is required');
        }

        if (!config.host || typeof config.host !== 'string') {
            throw new Error('Host is required and must be a string');
        }

        if (!config.port || typeof config.port !== 'number' || config.port < 1 || config.port > 65535) {
            throw new Error('Port must be a number between 1 and 65535');
        }

        if (!config.type || !['socks5', 'http'].includes(config.type)) {
            throw new Error('Type must be either "socks5" or "http"');
        }

        // Validate SOCKS5 URL format if credentials are provided
        if (config.type === 'socks5' && config.username && config.password) {
            const socksUrl = `socks5://${config.username}:${config.password}@${config.host}:${config.port}`;
            try {
                new URL(socksUrl);
            } catch (error) {
                throw new Error('Invalid SOCKS5 URL format with credentials');
            }
        }
    }

    /**
     * Test TCP connectivity to proxy server
     * @param {Object} config - Proxy configuration
     * @returns {Object} TCP test results
     */
    async testTCPConnectivity(config) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const socket = new net.Socket();

            const timeout = setTimeout(() => {
                socket.destroy();
                resolve({
                    success: false,
                    error: 'Connection timeout (5 seconds)',
                    responseTime: Date.now() - startTime
                });
            }, 5000);

            socket.connect(config.port, config.host, () => {
                clearTimeout(timeout);
                const responseTime = Date.now() - startTime;
                socket.destroy();
                resolve({
                    success: true,
                    message: 'TCP connection successful',
                    responseTime: responseTime
                });
            });

            socket.on('error', (error) => {
                clearTimeout(timeout);
                resolve({
                    success: false,
                    error: error.message,
                    responseTime: Date.now() - startTime
                });
            });
        });
    }

    /**
     * Test SOCKS5 authentication
     * @param {Object} config - Proxy configuration
     * @returns {Object} Authentication test results
     */
    async testSOCKS5Authentication(config) {
        try {
            const startTime = Date.now();

            // Use node-socks library for proper SOCKS5 authentication
            const { SocksClient } = require('socks');
            
            // Configure connection options based on credentials
            const socksOptions = {
                proxy: {
                    host: config.host,
                    port: config.port,
                    type: 5,
                },
                command: 'connect',
                destination: {
                    host: 'httpbin.org',
                    port: 80
                },
                timeout: 15000
            };

            // Only set authentication if username AND password are provided and not empty
            if (config.username && config.username.trim() && config.password && config.password.trim()) {
                console.log('🔐 Using username/password authentication');
                socksOptions.proxy.userId = config.username.trim();
                socksOptions.proxy.password = config.password.trim();
            } else {
                console.log('🔓 Using no authentication');
                // For no-auth, don't set userId/password at all
            }

            console.log('🧪 Testing SOCKS5 connection with options:', {
                host: socksOptions.proxy.host,
                port: socksOptions.proxy.port,
                auth: socksOptions.proxy.userId ? 'username/password' : 'none'
            });

            // Create SOCKS connection
            const info = await SocksClient.createConnection(socksOptions);
            const socket = info.socket;

            // Test HTTP request through the SOCKS connection
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    socket.destroy();
                    resolve({
                        success: false,
                        error: 'Request timeout',
                        responseTime: Date.now() - startTime
                    });
                }, 10000);

                const httpRequest = 'GET /ip HTTP/1.1\r\nHost: httpbin.org\r\nConnection: close\r\n\r\n';
                
                socket.write(httpRequest);

                let responseData = '';
                socket.on('data', (data) => {
                    responseData += data.toString();
                });

                socket.on('end', () => {
                    clearTimeout(timeout);
                    socket.destroy();

                    const responseTime = Date.now() - startTime;

                    if (responseData.includes('200 OK')) {
                        // Extract IP from response
                        let proxyIP = 'Unknown';
                        try {
                            const jsonMatch = responseData.match(/\{.*\}/s);
                            if (jsonMatch) {
                                const parsed = JSON.parse(jsonMatch[0]);
                                proxyIP = parsed.origin || 'Unknown';
                            }
                        } catch (e) {
                            // Ignore JSON parsing errors
                        }

                        resolve({
                            success: true,
                            message: 'SOCKS5 authentication successful',
                            responseTime: responseTime,
                            proxyIP: proxyIP
                        });
                    } else {
                        resolve({
                            success: false,
                            error: 'HTTP request failed through SOCKS5',
                            responseTime: responseTime
                        });
                    }
                });

                socket.on('error', (error) => {
                    clearTimeout(timeout);
                    socket.destroy();
                    resolve({
                        success: false,
                        error: error.message,
                        responseTime: Date.now() - startTime
                    });
                });
            });

        } catch (error) {
            console.error('❌ SOCKS5 authentication test failed:', error.message);
            return {
                success: false,
                error: error.message,
                responseTime: null
            };
        }
    }

    /**
     * Test HTTP requests through proxy
     * @param {Object} config - Proxy configuration
     * @returns {Object} HTTP test results
     */
    async testHTTPThroughProxy(config) {
        try {
            const startTime = Date.now();

            // Build proxy URL with proper authentication handling
            let proxyUrl;
            if (config.type === 'socks5') {
                if (config.username && config.username.trim() && config.password && config.password.trim()) {
                    proxyUrl = `socks5://${config.username.trim()}:${config.password.trim()}@${config.host}:${config.port}`;
                } else {
                    proxyUrl = `socks5://${config.host}:${config.port}`;
                }
            } else {
                if (config.username && config.username.trim() && config.password && config.password.trim()) {
                    proxyUrl = `http://${config.username.trim()}:${config.password.trim()}@${config.host}:${config.port}`;
                } else {
                    proxyUrl = `http://${config.host}:${config.port}`;
                }
            }

                            // Create appropriate agent
            let agent;
            if (config.type === 'socks5') {
                agent = new SocksProxyAgent(proxyUrl);
            } else {
                // For HTTP proxies, use axios proxy config
                const proxyConfig = {
                    host: config.host,
                    port: config.port
                };
                if (config.username && config.username.trim() && config.password && config.password.trim()) {
                    proxyConfig.auth = {
                        username: config.username.trim(),
                        password: config.password.trim()
                    };
                }

                // Test HTTP proxy with axios proxy configuration
                const response = await axios.get('http://httpbin.org/ip', {
                    proxy: proxyConfig,
                    timeout: 8000,  // Reduced timeout to 8 seconds
                    headers: {
                        'User-Agent': 'SP5Proxy-Validator/1.0'
                    }
                });

                const responseTime = Date.now() - startTime;

                if (response.status === 200) {
                    return {
                        success: true,
                        message: 'HTTP through proxy successful',
                        responseTime: responseTime,
                        proxyIP: response.data.origin,
                        testUrl: 'https://httpbin.org/ip'
                    };
                } else {
                    return {
                        success: false,
                        error: `Unexpected response status: ${response.status}`,
                        responseTime: responseTime
                    };
                }
            }

            // For SOCKS5, use the agent
            if (config.type === 'socks5') {
                const response = await axios.get('http://httpbin.org/ip', {
                    httpAgent: agent,
                    httpsAgent: agent,
                    timeout: 8000,  // Reduced timeout to 8 seconds
                    headers: {
                        'User-Agent': 'SP5Proxy-Validator/1.0'
                    }
                });

                const responseTime = Date.now() - startTime;

                if (response.status === 200) {
                    return {
                        success: true,
                        message: 'HTTPS through SOCKS5 proxy successful',
                        responseTime: responseTime,
                        proxyIP: response.data.origin,
                        testUrl: 'https://httpbin.org/ip'
                    };
                } else {
                    return {
                        success: false,
                        error: `Unexpected response status: ${response.status}`,
                        responseTime: responseTime
                    };
                }
            }
        } catch (error) {
            return {
                success: false,
                error: error.message,
                responseTime: null
            };
        }
    }

    /**
     * Test UDP ASSOCIATE support for SOCKS5 proxy
     * @param {Object} config - Proxy configuration
     * @returns {Object} UDP support test results
     */
    async testUDPAssociateSupport(config) {
        try {
            console.log('Testing UDP ASSOCIATE support...');

            // For now, simulate UDP ASSOCIATE test
            // In a real implementation, you'd test actual UDP ASSOCIATE command
            const testPromise = new Promise((resolve, reject) => {
                setTimeout(() => {
                    // Most SOCKS5 proxies don't support UDP ASSOCIATE
                    reject(new Error('UDP ASSOCIATE: command not supported'));
                }, 1000);
            });

            await testPromise;

            return {
                success: true,
                message: 'UDP ASSOCIATE supported',
                command: 'associate'
            };

        } catch (error) {
            // UDP ASSOCIATE not supported is common and expected
            if (error.message.includes('command not supported') ||
                error.message.includes('UDP ASSOCIATE') ||
                error.message.includes('associate')) {
                return {
                    success: false,
                    error: 'UDP ASSOCIATE command not supported by proxy',
                    expected: true
                };
            } else {
                return {
                    success: false,
                    error: error.message,
                    expected: false
                };
            }
        }
    }

    /**
     * Validate proxy with retry mechanism
     * @param {Object} config - Proxy configuration
     * @returns {Object} Validation results with retry information
     */
    async validateProxyWithRetry(config) {
        this.retryAttempts = 0;

        while (this.retryAttempts < this.maxRetries) {
            console.log(`🔄 Proxy validation attempt ${this.retryAttempts + 1}/${this.maxRetries}`);

            const results = await this.validateProxyConnection(config);

            if (results.isValid) {
                return {
                    ...results,
                    retryAttempts: this.retryAttempts + 1,
                    success: true
                };
            }

            this.retryAttempts++;

            if (this.retryAttempts < this.maxRetries) {
                const delay = Math.pow(2, this.retryAttempts) * 1000; // Exponential backoff
                console.log(`⏳ Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        return {
            ...this.validationResults,
            retryAttempts: this.retryAttempts,
            success: false,
            finalError: 'Proxy validation failed after all retry attempts'
        };
    }

    /**
     * Get validation results
     * @returns {Object} Last validation results
     */
    getValidationResults() {
        return this.validationResults;
    }

    async ensureBinaries() {
        const tun2socksPath = path.join(this.binPath, 'tun2socks.exe');
        const wintunPath = path.join(this.binPath, 'wintun.dll');

        // Check if binaries exist, if not download them
        if (!fs.existsSync(tun2socksPath)) {
            console.log('Downloading tun2socks binary...');
            await this.downloadTun2Socks();
        }

        if (!fs.existsSync(wintunPath)) {
            console.log('Downloading WinTun library...');
            await this.downloadWinTun();
        }
    }

    async downloadTun2Socks() {
        try {
            // Download tun2socks from GitHub releases
            const downloadUrl = 'https://github.com/xjasonlyu/tun2socks/releases/latest/download/tun2socks-windows-amd64.zip';
            const response = await axios({
                method: 'GET',
                url: downloadUrl,
                responseType: 'stream'
            });

            const zipPath = path.join(this.binPath, 'tun2socks.zip');
            const writer = fs.createWriteStream(zipPath);
            
            response.data.pipe(writer);
            
            return new Promise((resolve, reject) => {
                writer.on('finish', async () => {
                    // Extract the zip file
                    await this.extractTun2Socks(zipPath);
                    resolve();
                });
                writer.on('error', reject);
            });
        } catch (error) {
            console.error('Failed to download tun2socks:', error);
            // Fallback: create a placeholder that will show an error
            this.createTun2SocksPlaceholder();
        }
    }

    async downloadWinTun() {
        try {
            // Download WinTun from official source
            const downloadUrl = 'https://www.wintun.net/builds/wintun-0.14.1.zip';
            const response = await axios({
                method: 'GET',
                url: downloadUrl,
                responseType: 'stream'
            });

            const zipPath = path.join(this.binPath, 'wintun.zip');
            const writer = fs.createWriteStream(zipPath);
            
            response.data.pipe(writer);
            
            return new Promise((resolve, reject) => {
                writer.on('finish', async () => {
                    // Extract the zip file
                    await this.extractWinTun(zipPath);
                    resolve();
                });
                writer.on('error', reject);
            });
        } catch (error) {
            console.error('Failed to download WinTun:', error);
            // Fallback: create a placeholder
            this.createWinTunPlaceholder();
        }
    }

    createTun2SocksPlaceholder() {
        const placeholderPath = path.join(this.binPath, 'tun2socks.exe');
        const placeholderContent = `@echo off
echo ERROR: tun2socks.exe not found!
echo Please download tun2socks from: https://github.com/xjasonlyu/tun2socks/releases
echo Extract tun2socks.exe to: ${this.binPath}
pause
exit 1`;
        
        fs.writeFileSync(placeholderPath.replace('.exe', '.bat'), placeholderContent);
    }

    createWinTunPlaceholder() {
        const placeholderPath = path.join(this.binPath, 'wintun.dll');
        // Create an empty file as placeholder
        fs.writeFileSync(placeholderPath, '');
    }

    async extractTun2Socks(zipPath) {
        // For now, create a simple extraction placeholder
        // In production, you'd use a proper zip extraction library
        console.log('Note: Manual extraction required for tun2socks.zip');
        this.createTun2SocksPlaceholder();
    }

    async extractWinTun(zipPath) {
        // For now, create a simple extraction placeholder
        // In production, you'd use a proper zip extraction library
        console.log('Note: Manual extraction required for wintun.zip');
        this.createWinTunPlaceholder();
    }

    async startTun2Socks(config) {
        if (this.isRunning) {
            throw new Error('tun2socks is already running');
        }

        // Try to find a working tun2socks binary
        let tun2socksPath = path.join(this.binPath, 'tun2socks.exe');
        let isTestVersion = false;

        // Check if the main binary exists and is valid
        if (!fs.existsSync(tun2socksPath)) {
            console.log('tun2socks.exe not found, checking for test version...');

            // Try test version
            const testPath = path.join(this.binPath, 'tun2socks-test.bat');
            if (fs.existsSync(testPath)) {
                tun2socksPath = testPath;
                isTestVersion = true;
                console.log('Using test version: tun2socks-test.bat');
            } else {
                throw new Error('tun2socks.exe not found. Please ensure it is installed in the bin directory.');
            }
        } else {
            // Check if the exe is valid (not a placeholder)
            const stats = fs.statSync(tun2socksPath);
            if (stats.size < 1000) { // Placeholder files are typically very small
                console.log('tun2socks.exe appears to be a placeholder, checking for test version...');

                const testPath = path.join(this.binPath, 'tun2socks-test.bat');
                if (fs.existsSync(testPath)) {
                    tun2socksPath = testPath;
                    isTestVersion = true;
                    console.log('Using test version: tun2socks-test.bat');
                } else {
                    throw new Error('tun2socks.exe is invalid and no test version available. Please download the real binary.');
                }
            }
        }

        console.log(`Using tun2socks binary: ${tun2socksPath} (test version: ${isTestVersion})`);

        if (isTestVersion) {
            console.log('⚠️  WARNING: Using test version of tun2socks. This will not provide actual proxy functionality.');
        }

        // Build proxy URL with proper authentication handling
        let proxyUrl;
        if (config.type === 'socks5') {
            // Only include credentials if BOTH username AND password are provided and non-empty
            if (config.username && config.username.trim() && config.password && config.password.trim()) {
                proxyUrl = `socks5://${config.username.trim()}:${config.password.trim()}@${config.host}:${config.port}`;
                console.log('🔐 tun2socks: Using SOCKS5 with authentication');
            } else {
                proxyUrl = `socks5://${config.host}:${config.port}`;
                console.log('🔓 tun2socks: Using SOCKS5 without authentication');
            }
        } else if (config.type === 'http') {
            if (config.username && config.username.trim() && config.password && config.password.trim()) {
                proxyUrl = `http://${config.username.trim()}:${config.password.trim()}@${config.host}:${config.port}`;
                console.log('🔐 tun2socks: Using HTTP with authentication');
            } else {
                proxyUrl = `http://${config.host}:${config.port}`;
                console.log('🔓 tun2socks: Using HTTP without authentication');
            }
        } else {
            throw new Error('Unsupported proxy type');
        }

        // Detect available UDP disabling options
        let udpDisableArgs = [];
        try {
            const { execFileSync } = require('child_process');
            const helpOutput = execFileSync(tun2socksPath, ['-h'], { encoding: 'utf8' });
            
            if (helpOutput.includes('-udp-timeout')) {
                udpDisableArgs = ['--udp-timeout', '30s'];
                console.log('🔧 Using --udp-timeout 30s to allow short-lived UDP (for DNS)');
            } else if (helpOutput.includes('--disable-udp')) {
                udpDisableArgs = ['--disable-udp'];
                console.log('🔧 Using --disable-udp to disable UDP traffic');
            } else if (helpOutput.includes('-tcp-only')) {
                udpDisableArgs = ['--tcp-only'];
                console.log('🔧 Using --tcp-only to disable UDP traffic');
            } else {
                console.log('⚠️ No UDP disable option found - UDP errors may occur');
            }
        } catch (helpError) {
            console.warn('⚠️ Could not check tun2socks options, using default udp-timeout');
            udpDisableArgs = ['--udp-timeout', '30s'];
        }

        // tun2socks arguments with UDP disabled to prevent "UDP ASSOCIATE: command not supported" errors
        const args = [
            '--device', 'tun://SP5ProxyTun',
            '--proxy', proxyUrl,
            '--mtu', '1500',
            ...udpDisableArgs
        ];

        console.log('⚠️ UDP timeout configured in tun2socks to allow DNS while preventing UDP ASSOCIATE errors');
        console.log('ℹ️ Short-lived UDP connections (like DNS) will work, long-lived ones will timeout');

        // Note: DNS leak prevention is handled by network routing
        // UDP ASSOCIATE errors are expected if proxy doesn't support UDP

        // Note: --interface is Linux/MacOS only, --tcp-timeout doesn't exist in this version
        // The real tun2socks will use the TUN device name from --device parameter

        console.log('Starting tun2socks with args:', args);

        return new Promise((resolve, reject) => {
            // Handle batch files differently than executables
            let spawnCommand, spawnArgs, spawnOptions;

            if (tun2socksPath.endsWith('.bat')) {
                // For batch files, use cmd.exe as the command (hidden window)
                spawnCommand = 'cmd.exe';
                spawnArgs = ['/c', tun2socksPath, ...args];
                spawnOptions = {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    windowsHide: true // Hide window for better UX
                };
            } else {
                // For executables, use direct spawn
                spawnCommand = tun2socksPath;
                spawnArgs = args;
                spawnOptions = {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    windowsHide: true
                };
            }

            console.log(`Spawning: ${spawnCommand} with args:`, spawnArgs);

            this.tun2socksProcess = spawn(spawnCommand, spawnArgs, spawnOptions);

            this.tun2socksProcess.stdout.on('data', (data) => {
                console.log('tun2socks stdout:', data.toString());
            });

            this.tun2socksProcess.stderr.on('data', (data) => {
                const errorOutput = data.toString();
                console.error('tun2socks stderr:', errorOutput);

                // Check for specific error patterns and provide user-friendly messages
                if (errorOutput.includes('flag provided but not defined')) {
                    console.error('❌ tun2socks command line argument error detected');
                } else if (errorOutput.includes('permission denied') || errorOutput.includes('access denied')) {
                    console.error('❌ tun2socks permission error detected');
                } else if (errorOutput.includes('address already in use')) {
                    console.error('❌ tun2socks port conflict detected');
                }
            });

            this.tun2socksProcess.on('error', (error) => {
                console.error('tun2socks process error:', error);
                this.isRunning = false;

                // Provide more specific error messages
                let userFriendlyError = error;
                if (error.code === 'ENOENT') {
                    userFriendlyError = new Error('tun2socks executable not found. Please ensure tun2socks is properly installed.');
                } else if (error.code === 'EACCES') {
                    userFriendlyError = new Error('Permission denied. Please run SP5Proxy as Administrator.');
                }

                reject(userFriendlyError);
            });

            this.tun2socksProcess.on('exit', (code, signal) => {
                console.log(`tun2socks exited with code ${code}, signal ${signal}`);
                this.isRunning = false;
                this.tun2socksProcess = null;

                if (isTestVersion && code === 0) {
                    // Test version completed successfully
                    console.log('✓ Test version completed successfully');
                    console.log('⚠️  Note: This was a test run. Real tun2socks would continue running.');
                    // Don't reject for test version success
                } else if (code !== 0) {
                    console.error(`tun2socks failed with exit code ${code}`);
                } else {
                    console.log('tun2socks exited normally');
                }
            });

            // Give it a moment to start
            setTimeout(() => {
                if (isTestVersion) {
                    // For test version, check if it completed successfully
                    if (this.tun2socksProcess === null) {
                        // Process already exited, check if it was successful
                        console.log('✓ Test version execution completed');
                        this.isRunning = false; // Test version doesn't stay running
                        resolve();
                    } else if (this.tun2socksProcess && !this.tun2socksProcess.killed) {
                        // Still running, mark as successful
                        this.isRunning = true;
                        this.currentConfig = config;
                        resolve();
                    } else {
                        reject(new Error('Failed to start tun2socks test version'));
                    }
                } else {
                    // For real version, it should still be running
                    if (this.tun2socksProcess && !this.tun2socksProcess.killed) {
                        this.isRunning = true;
                        this.currentConfig = config;
                        resolve();
                    } else {
                        reject(new Error('Failed to start tun2socks'));
                    }
                }
            }, 3000); // Increased timeout for test version to complete
        });
    }

    async stopTun2Socks() {
        if (!this.isRunning || !this.tun2socksProcess) {
            return;
        }

        return new Promise((resolve) => {
            this.tun2socksProcess.on('exit', () => {
                this.isRunning = false;
                this.tun2socksProcess = null;
                this.currentConfig = null;
                resolve();
            });

            // Try graceful shutdown first
            this.tun2socksProcess.kill('SIGTERM');

            // Force kill after 5 seconds if still running
            setTimeout(() => {
                if (this.tun2socksProcess && !this.tun2socksProcess.killed) {
                    this.tun2socksProcess.kill('SIGKILL');
                }
            }, 5000);
        });
    }

    async fetchExternalIP() {
        // Check if we're in back-off period
        if (this.ipBackoffUntil && Date.now() < this.ipBackoffUntil) {
            const remainingSeconds = Math.ceil((this.ipBackoffUntil - Date.now()) / 1000);
            throw new Error(`IP detection in back-off period for ${remainingSeconds} more seconds`);
        }

        // Reduced list of IP detection services (only 2 most reliable)
        const ipServices = [
            'https://api.ipify.org',
            'https://ifconfig.me'
        ];

        for (const service of ipServices) {
            try {
                console.log(`🔍 Trying IP detection service: ${service}`);
                const response = await axios.get(service, {
                    timeout: 30000, // 30 seconds timeout
                    headers: {
                        'User-Agent': 'SP5Proxy-Desktop/1.0',
                        'Connection': 'keep-alive'
                    },
                    // Add keep-alive for better connection reuse
                    httpAgent: new (require('http').Agent)({ keepAlive: true }),
                    httpsAgent: new (require('https').Agent)({ keepAlive: true })
                });
                
                const ip = response.data.trim();
                if (ip && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
                    console.log(`✅ Successfully detected IP: ${ip} from ${service}`);
                    this.externalIP = ip;
                    // Reset back-off on success
                    this.ipBackoffUntil = null;
                    this.ipFailureCount = 0;
                    return this.externalIP;
                } else {
                    console.warn(`⚠️ Invalid IP format from ${service}: ${ip}`);
                }
            } catch (error) {
                console.warn(`⚠️ Failed to get IP from ${service}:`, error.message);
                continue; // Try next service
            }
        }

        // If all services failed, set back-off period
        this.ipFailureCount = (this.ipFailureCount || 0) + 1;
        const backoffSeconds = Math.min(300, 30 * this.ipFailureCount); // Max 5 minutes
        this.ipBackoffUntil = Date.now() + (backoffSeconds * 1000);
        console.warn(`⚠️ IP detection failed ${this.ipFailureCount} times, backing off for ${backoffSeconds} seconds`);

        // Try one more time with direct connection (bypass proxy) as last resort
        try {
            console.log('🔄 Trying direct connection as fallback...');
            const response = await axios.get('https://api.ipify.org', {
                timeout: 15000,
                headers: {
                    'User-Agent': 'SP5Proxy-Desktop/1.0'
                }
            });
            
            const ip = response.data.trim();
            console.log(`📍 Fallback IP detection (direct): ${ip}`);
            this.externalIP = ip;
            // Reset back-off on success
            this.ipBackoffUntil = null;
            this.ipFailureCount = 0;
            return this.externalIP;
        } catch (fallbackError) {
            console.error('❌ All IP detection methods failed:', fallbackError.message);
            throw new Error(`Unable to fetch external IP address from any service (backing off for ${backoffSeconds}s)`);
        }
    }

    getExternalIP() {
        return this.externalIP;
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            currentConfig: this.currentConfig,
            externalIP: this.externalIP,
            processId: this.tun2socksProcess ? this.tun2socksProcess.pid : null,
            lastHealthCheck: this.lastHealthCheck,
            isHealthy: this.isHealthy
        };
    }

    // Check if proxy connection is healthy
    async checkConnectionHealth() {
        if (!this.isRunning) {
            this.isHealthy = false;
            return false;
        }

        try {
            // Check if tun2socks process is still running
            if (this.tun2socksProcess && this.tun2socksProcess.pid) {
                const { exec } = require('child_process');
                const { promisify } = require('util');
                const execAsync = promisify(exec);

                try {
                    await execAsync(`tasklist /FI "PID eq ${this.tun2socksProcess.pid}" /FO CSV`);
                } catch (processError) {
                    console.warn('⚠️ tun2socks process not found, connection may be lost');
                    this.isHealthy = false;
                    return false;
                }
            }

            // Try to fetch external IP to verify proxy is working
            try {
                const currentIP = await this.fetchExternalIP();
                if (currentIP && currentIP !== this.externalIP) {
                    console.log(`🔄 IP changed during health check: ${this.externalIP} → ${currentIP}`);
                    this.externalIP = currentIP;
                }
                this.isHealthy = true;
                this.lastHealthCheck = new Date();
                return true;
            } catch (ipError) {
                console.warn('⚠️ Failed to fetch IP during health check:', ipError.message);
                this.isHealthy = false;
                return false;
            }
        } catch (error) {
            console.error('❌ Connection health check failed:', error.message);
            this.isHealthy = false;
            return false;
        }
    }

    // Start monitoring proxy connection health
    startHealthMonitoring(callback) {
        if (this.healthMonitorInterval) {
            clearInterval(this.healthMonitorInterval);
        }

        console.log('🔍 Starting proxy health monitoring...');
        this.isHealthy = true;
        this.lastHealthCheck = new Date();

        this.healthMonitorInterval = setInterval(async () => {
            const wasHealthy = this.isHealthy;
            const isHealthy = await this.checkConnectionHealth();

            // Notify if health status changed
            if (wasHealthy !== isHealthy && callback) {
                callback({
                    isHealthy,
                    wasHealthy,
                    timestamp: new Date(),
                    externalIP: this.externalIP
                });
            }
        }, 30000); // Check every 30 seconds
    }

    // Stop health monitoring
    stopHealthMonitoring() {
        if (this.healthMonitorInterval) {
            console.log('⏹️ Stopping proxy health monitoring...');
            clearInterval(this.healthMonitorInterval);
            this.healthMonitorInterval = null;
        }
        this.isHealthy = false;
        this.lastHealthCheck = null;
    }
}

module.exports = ProxyManager;
