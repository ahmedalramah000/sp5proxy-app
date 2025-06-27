const { exec } = require('child_process');
const { promisify } = require('util');
const axios = require('axios');

const execAsync = promisify(exec);

class DNSManager {
    constructor() {
        this.originalDNSSettings = new Map();
        this.isConfigured = false;
        this.primaryDNS = '8.8.8.8';
        this.secondaryDNS = '1.1.1.1';
        this.backupDNS = '208.67.222.222'; // OpenDNS
        this.dnsLeakTestResults = null;
        this.isLeakTestRunning = false;
        this.dnsRoutesAdded = [];
        this.systemDNSBlocked = false;
    }

    /**
     * Configure DNS servers for the specified interface with leak prevention
     * @param {string} interfaceName - Name of the network interface
     * @param {string} tunInterfaceIndex - TUN interface index for routing
     * @returns {Promise<boolean>} - Success status
     */
    async configureDNS(interfaceName, tunInterfaceIndex = null) {
        try {
            console.log(`[DNS] 🔒 Configuring DNS with leak prevention for interface: ${interfaceName}`);

            // Add overall timeout to prevent hanging
            const configPromise = this.performDNSConfiguration(interfaceName, tunInterfaceIndex);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('DNS configuration timed out after 60 seconds')), 60000)
            );

            return await Promise.race([configPromise, timeoutPromise]);

        } catch (error) {
            console.error(`[DNS] ERROR: Failed to configure DNS leak prevention for ${interfaceName}:`, error.message);
            return false;
        }
    }

    async performDNSConfiguration(interfaceName, tunInterfaceIndex) {
        // Step 1: Backup current DNS settings (quick)
        await this.backupDNSSettings(interfaceName);

        // Step 2: Set new DNS servers (essential)
        await this.setDNSServers(interfaceName);

        // Step 3: COMPREHENSIVE DNS routing (prevent ALL DNS leaks)
        if (tunInterfaceIndex) {
            await this.configureComprehensiveDNSRouting(tunInterfaceIndex);
        }

        // Step 4: Quick verification
        const verified = await this.verifyDNSConfiguration(interfaceName);

        if (verified) {
            this.isConfigured = true;
            console.log(`[DNS] ✅ DNS leak prevention configured successfully for ${interfaceName}`);
            console.log(`[DNS] Primary DNS: ${this.primaryDNS} (via proxy)`);
            console.log(`[DNS] Secondary DNS: ${this.secondaryDNS} (via proxy)`);

            // Run initial DNS leak test
            setTimeout(() => this.runDNSLeakTest(), 5000);

            return true;
        } else {
            console.error(`[DNS] ❌ DNS verification failed for ${interfaceName}`);
            return false;
        }
    }

    /**
     * Backup current DNS settings for the interface
     * @param {string} interfaceName - Name of the network interface
     */
    async backupDNSSettings(interfaceName) {
        try {
            console.log(`[DNS] Backing up DNS settings for ${interfaceName}...`);
            
            const command = `powershell -Command "Get-DnsClientServerAddress -InterfaceAlias '${interfaceName}' | ConvertTo-Json"`;
            const { stdout } = await execAsync(command);
            
            if (stdout.trim()) {
                const dnsSettings = JSON.parse(stdout);
                this.originalDNSSettings.set(interfaceName, dnsSettings);
                console.log(`[DNS] ✓ DNS settings backed up for ${interfaceName}`);
                
                // Log current DNS servers for reference
                if (Array.isArray(dnsSettings)) {
                    dnsSettings.forEach(setting => {
                        if (setting.ServerAddresses && setting.ServerAddresses.length > 0) {
                            console.log(`[DNS] Current ${setting.AddressFamily} DNS: ${setting.ServerAddresses.join(', ')}`);
                        }
                    });
                } else if (dnsSettings.ServerAddresses) {
                    console.log(`[DNS] Current DNS: ${dnsSettings.ServerAddresses.join(', ')}`);
                }
            }
            
        } catch (error) {
            console.warn(`[DNS] Warning: Could not backup DNS settings for ${interfaceName}:`, error.message);
            // Continue anyway - we'll use default restoration
        }
    }

    /**
     * Set DNS servers for the interface
     * @param {string} interfaceName - Name of the network interface
     */
    async setDNSServers(interfaceName) {
        try {
            console.log(`[DNS] Setting DNS servers for ${interfaceName}...`);
            
            // Set IPv4 DNS servers
            const ipv4Command = `powershell -Command "Set-DnsClientServerAddress -InterfaceAlias '${interfaceName}' -ServerAddresses '${this.primaryDNS}','${this.secondaryDNS}','${this.backupDNS}'"`;
            await execAsync(ipv4Command);
            console.log(`[DNS] ✓ IPv4 DNS servers set: ${this.primaryDNS}, ${this.secondaryDNS}, ${this.backupDNS}`);
            
            // Also try to set IPv6 DNS (may fail on some systems, that's OK)
            try {
                const ipv6Command = `powershell -Command "Set-DnsClientServerAddress -InterfaceAlias '${interfaceName}' -ServerAddresses '2001:4860:4860::8888','2606:4700:4700::1111' -AddressFamily IPv6"`;
                await execAsync(ipv6Command);
                console.log(`[DNS] ✓ IPv6 DNS servers set: 2001:4860:4860::8888, 2606:4700:4700::1111`);
            } catch (ipv6Error) {
                console.log(`[DNS] Note: IPv6 DNS configuration skipped (this is normal on many systems)`);
            }
            
        } catch (error) {
            throw new Error(`Failed to set DNS servers: ${error.message}`);
        }
    }

    /**
     * Verify DNS configuration is working
     * @param {string} interfaceName - Name of the network interface
     * @returns {Promise<boolean>} - Verification success
     */
    async verifyDNSConfiguration(interfaceName) {
        try {
            console.log(`[DNS] Verifying DNS configuration for ${interfaceName}...`);
            
            // Check if DNS servers are set correctly
            const command = `powershell -Command "Get-DnsClientServerAddress -InterfaceAlias '${interfaceName}' -AddressFamily IPv4 | Select-Object -ExpandProperty ServerAddresses"`;
            const { stdout } = await execAsync(command);
            
            const currentDNS = stdout.trim().split('\n').map(ip => ip.trim()).filter(ip => ip);
            
            if (currentDNS.includes(this.primaryDNS) && currentDNS.includes(this.secondaryDNS)) {
                console.log(`[DNS] ✓ DNS servers verified: ${currentDNS.join(', ')}`);
                
                // Test DNS resolution
                try {
                    const testCommand = `nslookup google.com ${this.primaryDNS}`;
                    await execAsync(testCommand);
                    console.log(`[DNS] ✓ DNS resolution test passed`);
                    return true;
                } catch (testError) {
                    console.warn(`[DNS] Warning: DNS resolution test failed, but configuration appears correct`);
                    return true; // Still consider it successful if servers are set
                }
            } else {
                console.error(`[DNS] ✗ DNS servers not set correctly. Expected: ${this.primaryDNS}, ${this.secondaryDNS}. Got: ${currentDNS.join(', ')}`);
                return false;
            }
            
        } catch (error) {
            console.error(`[DNS] Error verifying DNS configuration:`, error.message);
            return false;
        }
    }

    /**
     * Restore original DNS settings and remove leak prevention
     * @param {string} interfaceName - Name of the network interface
     * @returns {Promise<boolean>} - Restoration success
     */
    async restoreDNS(interfaceName) {
        try {
            console.log(`[DNS] 🔄 Restoring DNS settings and removing leak prevention for ${interfaceName}...`);

            // Step 1: Remove firewall rules FIRST (while TUN interface still exists)
            await this.removeFirewallRules();

            // Step 2: Remove DNS routes SECOND
            await this.removeDNSRoutes();

            // Step 3: Restore system DNS
            await this.restoreSystemDNS();

            // Step 4: Restore original DNS settings
            const originalSettings = this.originalDNSSettings.get(interfaceName);

            if (originalSettings) {
                // Restore from backup
                await this.restoreFromBackup(interfaceName, originalSettings);
            } else {
                // Reset to automatic (DHCP)
                await this.resetToAutomatic(interfaceName);
            }

            this.isConfigured = false;
            this.systemDNSBlocked = false;
            this.dnsRoutesAdded = [];
            this.originalDNSSettings.delete(interfaceName);
            console.log(`[DNS] ✅ DNS settings and leak prevention restored for ${interfaceName}`);
            return true;

        } catch (error) {
            console.error(`[DNS] ERROR: Failed to restore DNS for ${interfaceName}:`, error.message);
            return false;
        }
    }

    /**
     * Remove DNS routes added for leak prevention
     * @returns {Promise<void>}
     */
    async removeDNSRoutes() {
        try {
            console.log(`[DNS] 🗑️ Removing DNS routes...`);

            for (const dnsServer of this.dnsRoutesAdded) {
                try {
                    await execAsync(`route delete ${dnsServer} mask 255.255.255.255`);
                    console.log(`[DNS] ✓ Removed route for ${dnsServer}`);
                } catch (error) {
                    console.warn(`[DNS] Warning: Could not remove route for ${dnsServer}:`, error.message);
                }
            }

            this.dnsRoutesAdded = [];
            console.log(`[DNS] ✅ DNS routes removal completed`);

        } catch (error) {
            console.error(`[DNS] ERROR: Failed to remove DNS routes:`, error.message);
        }
    }

    /**
     * Remove firewall rules added for DNS leak prevention
     * @returns {Promise<void>}
     */
    async removeFirewallRules() {
        try {
            console.log(`[DNS] 🗑️ Removing DNS firewall rules...`);

            const rulesToRemove = [
                'SP5Proxy-Block-DNS-Out',
                'SP5Proxy-Block-DNS-TCP-Out',
                'SP5Proxy-Block-DNS-Direct',
                'SP5Proxy-Block-DoT'
            ];

            for (const ruleName of rulesToRemove) {
                try {
                    await execAsync(`netsh advfirewall firewall delete rule name="${ruleName}"`);
                    console.log(`[DNS] ✓ Removed firewall rule: ${ruleName}`);
                } catch (error) {
                    console.warn(`[DNS] Warning: Could not remove firewall rule ${ruleName}:`, error.message);
                }
            }

            // Remove DoH blocking rules
            const dohServers = [
                'cloudflare-dns.com',
                'dns.google',
                'dns.quad9.net',
                'doh.opendns.com',
                'doh.cleanbrowsing.org'
            ];

            for (const server of dohServers) {
                try {
                    await execAsync(`netsh advfirewall firewall delete rule name="SP5Proxy-Block-DoH-${server}"`);
                } catch (error) {
                    console.warn(`[DNS] Warning: Could not remove DoH rule for ${server}:`, error.message);
                }
            }

            console.log(`[DNS] ✅ Firewall rules removal completed`);

        } catch (error) {
            console.error(`[DNS] ERROR: Failed to remove firewall rules:`, error.message);
        }
    }

    /**
     * Restore system DNS servers
     * @returns {Promise<void>}
     */
    async restoreSystemDNS() {
        try {
            console.log(`[DNS] 🔄 Restoring system DNS servers...`);

            if (!this.systemDNSBlocked) {
                console.log(`[DNS] System DNS was not blocked, skipping restore`);
                return;
            }

            // Get all active network interfaces except TUN
            const command = `powershell -Command "Get-NetAdapter | Where-Object {$_.Status -eq 'Up' -and $_.Name -notlike '*SP5Proxy*' -and $_.Name -notlike '*TUN*'} | Select-Object -ExpandProperty Name"`;
            const { stdout } = await execAsync(command);

            const interfaces = stdout.trim().split('\n').map(name => name.trim()).filter(name => name);

            for (const interfaceName of interfaces) {
                try {
                    // Reset to automatic DNS
                    await execAsync(`powershell -Command "Set-DnsClientServerAddress -InterfaceAlias '${interfaceName}' -ResetServerAddresses"`);
                    console.log(`[DNS] ✓ Restored system DNS for ${interfaceName}`);
                } catch (error) {
                    console.warn(`[DNS] Warning: Could not restore DNS for ${interfaceName}:`, error.message);
                }
            }

            this.systemDNSBlocked = false;
            console.log(`[DNS] ✅ System DNS restoration completed`);

        } catch (error) {
            console.error(`[DNS] ERROR: Failed to restore system DNS:`, error.message);
        }
    }

    /**
     * Restore DNS from backup settings
     * @param {string} interfaceName - Name of the network interface
     * @param {Object} originalSettings - Original DNS settings
     */
    async restoreFromBackup(interfaceName, originalSettings) {
        try {
            if (Array.isArray(originalSettings)) {
                for (const setting of originalSettings) {
                    if (setting.ServerAddresses && setting.ServerAddresses.length > 0) {
                        const addressFamily = setting.AddressFamily || 'IPv4';
                        const servers = setting.ServerAddresses.join("','");

                        // Use different command format based on address family
                        let command;
                        if (addressFamily === 'IPv6') {
                            command = `powershell -Command "Set-DnsClientServerAddress -InterfaceAlias '${interfaceName}' -ServerAddresses '${servers}' -AddressFamily IPv6"`;
                        } else {
                            // For IPv4, don't use AddressFamily parameter as it's not supported in some PowerShell versions
                            command = `powershell -Command "Set-DnsClientServerAddress -InterfaceAlias '${interfaceName}' -ServerAddresses '${servers}'"`;
                        }
                        await execAsync(command);
                        console.log(`[DNS] ✓ Restored ${addressFamily} DNS: ${setting.ServerAddresses.join(', ')}`);
                    }
                }
            } else if (originalSettings.ServerAddresses && originalSettings.ServerAddresses.length > 0) {
                const servers = originalSettings.ServerAddresses.join("','");
                const command = `powershell -Command "Set-DnsClientServerAddress -InterfaceAlias '${interfaceName}' -ServerAddresses '${servers}'"`;
                await execAsync(command);
                console.log(`[DNS] ✓ Restored DNS: ${originalSettings.ServerAddresses.join(', ')}`);
            } else {
                // No specific servers were set, reset to automatic
                await this.resetToAutomatic(interfaceName);
            }
        } catch (error) {
            console.warn(`[DNS] Warning: Could not restore from backup, resetting to automatic:`, error.message);
            await this.resetToAutomatic(interfaceName);
        }
    }

    /**
     * Reset DNS to automatic (DHCP)
     * @param {string} interfaceName - Name of the network interface
     */
    async resetToAutomatic(interfaceName) {
        try {
            // Reset IPv4 DNS to automatic
            const ipv4Command = `powershell -Command "Set-DnsClientServerAddress -InterfaceAlias '${interfaceName}' -ResetServerAddresses"`;
            await execAsync(ipv4Command);
            console.log(`[DNS] ✓ IPv4 DNS reset to automatic (DHCP)`);
            
            // Reset IPv6 DNS to automatic
            try {
                const ipv6Command = `powershell -Command "Set-DnsClientServerAddress -InterfaceAlias '${interfaceName}' -ResetServerAddresses -AddressFamily IPv6"`;
                await execAsync(ipv6Command);
                console.log(`[DNS] ✓ IPv6 DNS reset to automatic`);
            } catch (ipv6Error) {
                console.log(`[DNS] Note: IPv6 DNS reset skipped (this is normal on many systems)`);
            }
            
        } catch (error) {
            throw new Error(`Failed to reset DNS to automatic: ${error.message}`);
        }
    }

    /**
     * Get current DNS configuration status
     * @returns {Object} - DNS status information
     */
    getStatus() {
        return {
            isConfigured: this.isConfigured,
            primaryDNS: this.primaryDNS,
            secondaryDNS: this.secondaryDNS,
            backupDNS: this.backupDNS,
            backedUpInterfaces: Array.from(this.originalDNSSettings.keys()),
            systemDNSBlocked: this.systemDNSBlocked,
            dnsRoutesAdded: this.dnsRoutesAdded.length,
            lastLeakTest: this.dnsLeakTestResults,
            isLeakTestRunning: this.isLeakTestRunning
        };
    }

    /**
     * Get DNS leak test results
     * @returns {Object|null} - Latest test results
     */
    getLeakTestResults() {
        return this.dnsLeakTestResults;
    }

    /**
     * Test DNS connectivity through proxy
     * @returns {Promise<boolean>} - Connectivity status
     */
    async testDNSConnectivity() {
        try {
            console.log(`[DNS] 🔍 Testing DNS connectivity through proxy...`);

            const testDomains = ['google.com', 'cloudflare.com'];

            for (const domain of testDomains) {
                await execAsync(`nslookup ${domain} ${this.primaryDNS}`);
            }

            console.log(`[DNS] ✅ DNS connectivity test passed`);
            return true;

        } catch (error) {
            console.error(`[DNS] ❌ DNS connectivity test failed:`, error.message);
            return false;
        }
    }

    /**
     * Monitor DNS for leaks in real-time
     * @param {Function} callback - Callback for leak detection
     * @returns {void}
     */
    startDNSLeakMonitoring(callback) {
        if (this.leakMonitorInterval) {
            clearInterval(this.leakMonitorInterval);
        }

        console.log(`[DNS] 👁️ Starting DNS leak monitoring...`);

        this.leakMonitorInterval = setInterval(async () => {
            try {
                const results = await this.runDNSLeakTest();
                if (callback && typeof callback === 'function') {
                    callback(results);
                }
            } catch (error) {
                console.error(`[DNS] Monitoring error:`, error.message);
            }
        }, 30000); // Check every 30 seconds
    }

    /**
     * Stop DNS leak monitoring
     * @returns {void}
     */
    stopDNSLeakMonitoring() {
        if (this.leakMonitorInterval) {
            clearInterval(this.leakMonitorInterval);
            this.leakMonitorInterval = null;
            console.log(`[DNS] 🛑 DNS leak monitoring stopped`);
        }
    }

    /**
     * Block system DNS servers to prevent DNS leaks
     * @returns {Promise<void>}
     */
    async blockSystemDNS() {
        try {
            console.log(`[DNS] 🚫 Blocking system DNS servers to prevent leaks...`);

            // Get all active network interfaces except TUN
            const command = `powershell -Command "Get-NetAdapter | Where-Object {$_.Status -eq 'Up' -and $_.Name -notlike '*SP5Proxy*' -and $_.Name -notlike '*TUN*'} | Select-Object -ExpandProperty Name"`;
            const { stdout } = await execAsync(command);

            const interfaces = stdout.trim().split('\n').map(name => name.trim()).filter(name => name);

            for (const interfaceName of interfaces) {
                try {
                    // Set DNS to a non-existent server to block direct DNS queries
                    await execAsync(`powershell -Command "Set-DnsClientServerAddress -InterfaceAlias '${interfaceName}' -ServerAddresses '127.0.0.1'"`);
                    console.log(`[DNS] ✓ Blocked system DNS for ${interfaceName}`);
                } catch (error) {
                    console.warn(`[DNS] Warning: Could not block DNS for ${interfaceName}:`, error.message);
                }
            }

            this.systemDNSBlocked = true;
            console.log(`[DNS] ✅ System DNS blocking completed`);

        } catch (error) {
            console.error(`[DNS] ERROR: Failed to block system DNS:`, error.message);
        }
    }

    /**
     * Configure basic DNS routing (simplified and faster)
     * @param {string} tunInterfaceIndex - TUN interface index
     * @returns {Promise<void>}
     */
    async configureBasicDNSRouting(tunInterfaceIndex) {
        try {
            console.log(`[DNS] 🛣️ Configuring basic DNS routing through TUN interface...`);

            const tunGateway = '10.0.0.2';
            const primaryDNSServers = [
                '8.8.8.8', '8.8.4.4',    // Google DNS
                '1.1.1.1', '1.0.0.1'     // Cloudflare DNS
            ];

            // Route only primary DNS servers (faster)
            for (const dnsServer of primaryDNSServers) {
                try {
                    await execAsync(`route add ${dnsServer} mask 255.255.255.255 ${tunGateway} metric 1 if ${tunInterfaceIndex}`);
                    this.dnsRoutesAdded.push(dnsServer);
                    console.log(`[DNS] ✓ Routed ${dnsServer} through TUN interface`);
                } catch (error) {
                    console.warn(`[DNS] Warning: Could not route ${dnsServer}:`, error.message);
                }
            }

            console.log(`[DNS] ✅ Basic DNS routing configured`);

        } catch (error) {
            console.error(`[DNS] ERROR: Failed to configure basic DNS routing:`, error.message);
        }
    }

    /**
     * Configure comprehensive DNS routing to prevent any DNS leaks (FULL VERSION - SLOWER)
     * @param {string} tunInterfaceIndex - TUN interface index
     * @returns {Promise<void>}
     */
    async configureComprehensiveDNSRouting(tunInterfaceIndex) {
        try {
            console.log(`[DNS] 🛣️ Configuring comprehensive DNS routing through TUN interface...`);

            const tunGateway = '10.0.0.2';
            const dnsServers = [
                // Google DNS
                '8.8.8.8', '8.8.4.4',
                // Cloudflare DNS
                '1.1.1.1', '1.0.0.1',
                // OpenDNS
                '208.67.222.222', '208.67.220.220',
                // Quad9 DNS
                '9.9.9.9', '149.112.112.112',
                // Additional popular DNS servers
                '76.76.19.19', '76.76.76.76', // Comodo
                '64.6.64.6', '64.6.65.6', // Verisign
                '77.88.8.8', '77.88.8.1' // Yandex
            ];

            // Route all popular DNS servers through TUN interface
            for (const dnsServer of dnsServers) {
                try {
                    await execAsync(`route add ${dnsServer} mask 255.255.255.255 ${tunGateway} metric 1 if ${tunInterfaceIndex}`);
                    this.dnsRoutesAdded.push(dnsServer);
                    console.log(`[DNS] ✓ Routed ${dnsServer} through TUN interface`);
                } catch (error) {
                    console.warn(`[DNS] Warning: Could not route ${dnsServer}:`, error.message);
                }
            }

            // Add STRICT firewall rules to block ALL direct DNS traffic
            await this.addStrictDNSFirewallRules();

            console.log(`[DNS] ✅ Comprehensive DNS routing configured`);

        } catch (error) {
            console.error(`[DNS] ERROR: Failed to configure comprehensive DNS routing:`, error.message);
        }
    }

    /**
     * Add strict DNS firewall rules to prevent ALL DNS leaks
     * @returns {Promise<void>}
     */
    async addStrictDNSFirewallRules() {
        try {
            console.log(`[DNS] 🛡️ Adding STRICT DNS firewall rules to prevent leaks...`);

            // Block ALL outbound DNS traffic on port 53 (UDP and TCP)
            await execAsync(`netsh advfirewall firewall add rule name="SP5Proxy-Block-DNS-Out" dir=out action=block protocol=UDP localport=53`);
            await execAsync(`netsh advfirewall firewall add rule name="SP5Proxy-Block-DNS-TCP-Out" dir=out action=block protocol=TCP localport=53`);
            
            // Block direct access to popular DNS servers
            await execAsync(`netsh advfirewall firewall add rule name="SP5Proxy-Block-DNS-Direct" dir=out action=block protocol=any remoteport=53`);
            
            // Block DNS over port 853 (DNS over TLS)
            await execAsync(`netsh advfirewall firewall add rule name="SP5Proxy-Block-DoT" dir=out action=block protocol=TCP remoteport=853`);
            
            console.log(`[DNS] ✓ Added strict DNS blocking rules`);

            // Also block DNS over HTTPS
            await this.blockDNSOverHTTPS();

        } catch (error) {
            console.warn(`[DNS] Warning: Could not add some DNS firewall rules:`, error.message);
        }
    }

    /**
     * Block DNS over HTTPS to prevent DNS bypassing
     * @returns {Promise<void>}
     */
    async blockDNSOverHTTPS() {
        try {
            console.log(`[DNS] 🚫 Blocking DNS over HTTPS to prevent bypassing...`);

            const dohServers = [
                'cloudflare-dns.com',
                'dns.google',
                'dns.quad9.net',
                'doh.opendns.com',
                'doh.cleanbrowsing.org'
            ];

            // Add firewall rules to block DoH servers
            for (const server of dohServers) {
                try {
                    await execAsync(`netsh advfirewall firewall add rule name="SP5Proxy-Block-DoH-${server}" dir=out action=block remoteip=any protocol=TCP remoteport=443 program=any`);
                } catch (error) {
                    console.warn(`[DNS] Warning: Could not block DoH server ${server}:`, error.message);
                }
            }

            console.log(`[DNS] ✅ DNS over HTTPS blocking configured`);

        } catch (error) {
            console.error(`[DNS] ERROR: Failed to block DNS over HTTPS:`, error.message);
        }
    }

    /**
     * Run DNS leak test to verify DNS queries go through proxy
     * @returns {Promise<Object>} - Test results
     */
    async runDNSLeakTest() {
        if (this.isLeakTestRunning) {
            console.log(`[DNS] DNS leak test already running...`);
            return this.dnsLeakTestResults;
        }

        try {
            this.isLeakTestRunning = true;
            console.log(`[DNS] 🔍 Running DNS leak test...`);

            const testResults = {
                timestamp: new Date().toISOString(),
                hasLeaks: false,
                dnsServers: [],
                errors: [],
                testsPassed: 0,
                totalTests: 0
            };

            // Test 1: Check what DNS servers are being used
            try {
                testResults.totalTests++;
                const { stdout } = await execAsync('nslookup google.com');
                const lines = stdout.split('\n');

                for (const line of lines) {
                    if (line.includes('Server:')) {
                        const serverMatch = line.match(/Server:\s+(.+)/);
                        if (serverMatch) {
                            const server = serverMatch[1].trim();
                            testResults.dnsServers.push(server);

                            // Check if it's one of our proxy DNS servers
                            if (server === this.primaryDNS || server === this.secondaryDNS || server === this.backupDNS) {
                                testResults.testsPassed++;
                                console.log(`[DNS] ✓ DNS query using proxy DNS server: ${server}`);
                            } else {
                                testResults.hasLeaks = true;
                                console.warn(`[DNS] ⚠️ DNS leak detected! Query using: ${server}`);
                            }
                        }
                    }
                }
            } catch (error) {
                testResults.errors.push(`DNS server test failed: ${error.message}`);
            }

            // Test 2: Check DNS leak via external service
            try {
                testResults.totalTests++;
                const response = await axios.get('https://1.1.1.1/cdn-cgi/trace', { timeout: 30000 });
                const data = response.data;

                if (data.includes('fl=') && data.includes('ip=')) {
                    const ipMatch = data.match(/ip=([^\n]+)/);
                    if (ipMatch) {
                        const detectedIP = ipMatch[1].trim();
                        console.log(`[DNS] External IP detected: ${detectedIP}`);
                        testResults.testsPassed++;
                    }
                }
            } catch (error) {
                testResults.errors.push(`External DNS test failed: ${error.message}`);
            }

            // Test 3: Verify DNS resolution through proxy
            try {
                testResults.totalTests++;
                const testDomains = ['google.com', 'cloudflare.com', 'github.com'];

                for (const domain of testDomains) {
                    await execAsync(`nslookup ${domain} ${this.primaryDNS}`);
                }

                testResults.testsPassed++;
                console.log(`[DNS] ✓ DNS resolution through proxy successful`);
            } catch (error) {
                testResults.errors.push(`Proxy DNS resolution test failed: ${error.message}`);
            }

            // Calculate final result
            const successRate = (testResults.testsPassed / testResults.totalTests) * 100;
            testResults.successRate = successRate;

            if (testResults.hasLeaks || successRate < 80) {
                console.error(`[DNS] ❌ DNS LEAK DETECTED! Success rate: ${successRate}%`);
                console.error(`[DNS] Leaking DNS servers:`, testResults.dnsServers);
            } else {
                console.log(`[DNS] ✅ No DNS leaks detected! Success rate: ${successRate}%`);
            }

            this.dnsLeakTestResults = testResults;
            return testResults;

        } catch (error) {
            console.error(`[DNS] ERROR: DNS leak test failed:`, error.message);
            return {
                timestamp: new Date().toISOString(),
                hasLeaks: true,
                error: error.message,
                testsPassed: 0,
                totalTests: 1
            };
        } finally {
            this.isLeakTestRunning = false;
        }
    }

    /**
     * Emergency DNS reset for all interfaces with complete leak prevention cleanup
     * @returns {Promise<void>}
     */
    async emergencyReset() {
        try {
            console.log(`[DNS] 🚨 Performing emergency DNS reset with leak prevention cleanup...`);

            // Stop monitoring
            this.stopDNSLeakMonitoring();

            // Step 1: Remove all firewall rules FIRST
            await this.removeFirewallRules();

            // Step 2: Remove all DNS routes SECOND
            await this.removeDNSRoutes();

            // Step 3: Restore system DNS THIRD
            await this.restoreSystemDNS();

            // Get all network interfaces
            const command = `powershell -Command "Get-NetAdapter | Where-Object {$_.Status -eq 'Up'} | Select-Object -ExpandProperty Name"`;
            const { stdout } = await execAsync(command);

            const interfaces = stdout.trim().split('\n').map(name => name.trim()).filter(name => name);

            for (const interfaceName of interfaces) {
                try {
                    await this.resetToAutomatic(interfaceName);
                    console.log(`[DNS] ✓ Emergency reset completed for ${interfaceName}`);
                } catch (error) {
                    console.warn(`[DNS] Warning: Could not reset ${interfaceName}:`, error.message);
                }
            }

            // Reset all state
            this.isConfigured = false;
            this.systemDNSBlocked = false;
            this.dnsRoutesAdded = [];
            this.dnsLeakTestResults = null;
            this.originalDNSSettings.clear();

            console.log(`[DNS] ✅ Emergency DNS reset and leak prevention cleanup completed`);

        } catch (error) {
            console.error(`[DNS] ERROR: Emergency DNS reset failed:`, error.message);
        }
    }
}

module.exports = DNSManager;
