const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

class TunDiagnostics {
    constructor() {
        this.results = {
            adminRights: false,
            integrityLevel: 'unknown',
            wintunDriver: false,
            requiredServices: {},
            networkInterfaces: [],
            privileges: {},
            securitySoftware: [],
            recommendations: []
        };
    }

    async runFullDiagnostics() {
        console.log('🔍 Running comprehensive TUN interface diagnostics...');
        console.log('=' .repeat(60));

        try {
            await this.checkAdminRights();
            await this.checkIntegrityLevel();
            await this.checkWinTunDriver();
            await this.checkRequiredServices();
            await this.checkNetworkInterfaces();
            await this.checkPrivileges();
            await this.checkSecuritySoftware();
            await this.checkSystemRestrictions();
            
            this.generateRecommendations();
            this.displayResults();
            
            return this.results;
        } catch (error) {
            console.error('❌ Diagnostics failed:', error);
            throw error;
        }
    }

    async checkAdminRights() {
        console.log('\n📋 Checking administrator rights...');
        try {
            const { stdout } = await execAsync('whoami /groups');
            
            const hasAdminGroup = stdout.includes('BUILTIN\\Administrators');
            const isFiltered = stdout.includes('Group used for deny only');
            
            this.results.adminRights = hasAdminGroup && !isFiltered;
            
            console.log(`   Admin Group: ${hasAdminGroup ? '✅' : '❌'}`);
            console.log(`   Filtered Token: ${isFiltered ? '⚠️  Yes' : '✅ No'}`);
            console.log(`   Effective Admin Rights: ${this.results.adminRights ? '✅' : '❌'}`);
        } catch (error) {
            console.log('   ❌ Failed to check admin rights');
            this.results.adminRights = false;
        }
    }

    async checkIntegrityLevel() {
        console.log('\n📋 Checking integrity level...');
        try {
            const { stdout } = await execAsync('whoami /groups');
            
            if (stdout.includes('High Mandatory Level')) {
                this.results.integrityLevel = 'High';
            } else if (stdout.includes('Medium Mandatory Level')) {
                this.results.integrityLevel = 'Medium';
            } else if (stdout.includes('Low Mandatory Level')) {
                this.results.integrityLevel = 'Low';
            } else if (stdout.includes('System Mandatory Level')) {
                this.results.integrityLevel = 'System';
            }
            
            console.log(`   Integrity Level: ${this.results.integrityLevel}`);
            console.log(`   Required for TUN: High or System`);
            console.log(`   Status: ${['High', 'System'].includes(this.results.integrityLevel) ? '✅' : '❌'}`);
        } catch (error) {
            console.log('   ❌ Failed to check integrity level');
        }
    }

    async checkWinTunDriver() {
        console.log('\n📋 Checking WinTun driver...');
        try {
            // Check if wintun.sys exists
            const driverPath = 'C:\\Windows\\System32\\drivers\\wintun.sys';
            const driverExists = fs.existsSync(driverPath);
            
            // Check if wintun.dll exists in our bin directory
            const dllPath = path.join(__dirname, '..', 'bin', 'wintun.dll');
            const dllExists = fs.existsSync(dllPath);
            
            this.results.wintunDriver = driverExists && dllExists;
            
            console.log(`   Driver (wintun.sys): ${driverExists ? '✅' : '❌'}`);
            console.log(`   Library (wintun.dll): ${dllExists ? '✅' : '❌'}`);
            console.log(`   Overall Status: ${this.results.wintunDriver ? '✅' : '❌'}`);
            
            if (driverExists) {
                const stats = fs.statSync(driverPath);
                console.log(`   Driver Size: ${stats.size} bytes`);
                console.log(`   Driver Date: ${stats.mtime.toISOString()}`);
            }
        } catch (error) {
            console.log('   ❌ Failed to check WinTun driver');
            this.results.wintunDriver = false;
        }
    }

    async checkRequiredServices() {
        console.log('\n📋 Checking required Windows services...');
        
        const requiredServices = [
            'BFE',           // Base Filtering Engine
            'Dhcp',          // DHCP Client
            'Dnscache',      // DNS Client
            'PolicyAgent',   // IPsec Policy Agent
            'Netman',        // Network Connections
            'NlaSvc',        // Network List Service
            'nsi',           // Network Store Interface Service
            'RpcSs',         // Remote Procedure Call (RPC)
            'RpcEptMapper',  // RPC Endpoint Mapper
            'Winmgmt'        // Windows Management Instrumentation
        ];

        for (const serviceName of requiredServices) {
            try {
                const { stdout } = await execAsync(`sc query "${serviceName}"`);
                const isRunning = stdout.includes('RUNNING');
                this.results.requiredServices[serviceName] = isRunning;
                console.log(`   ${serviceName}: ${isRunning ? '✅ Running' : '❌ Not Running'}`);
            } catch (error) {
                this.results.requiredServices[serviceName] = false;
                console.log(`   ${serviceName}: ❌ Not Found`);
            }
        }
    }

    async checkNetworkInterfaces() {
        console.log('\n📋 Checking network interfaces...');
        try {
            const { stdout } = await execAsync('netsh interface show interface');
            const lines = stdout.split('\n').slice(3); // Skip header lines
            
            for (const line of lines) {
                if (line.trim()) {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 4) {
                        const interfaceName = parts.slice(3).join(' ');
                        this.results.networkInterfaces.push({
                            adminState: parts[0],
                            state: parts[1],
                            type: parts[2],
                            name: interfaceName
                        });
                        console.log(`   ${interfaceName}: ${parts[1]} (${parts[2]})`);
                    }
                }
            }
        } catch (error) {
            console.log('   ❌ Failed to check network interfaces');
        }
    }

    async checkPrivileges() {
        console.log('\n📋 Checking current privileges...');
        try {
            const { stdout } = await execAsync('whoami /priv');
            const lines = stdout.split('\n');
            
            const importantPrivileges = [
                'SeDebugPrivilege',
                'SeLoadDriverPrivilege',
                'SeSystemEnvironmentPrivilege',
                'SeCreateGlobalPrivilege',
                'SeTcbPrivilege',
                'SeImpersonatePrivilege'
            ];

            for (const privilege of importantPrivileges) {
                const line = lines.find(l => l.includes(privilege));
                if (line) {
                    const isEnabled = line.includes('Enabled');
                    this.results.privileges[privilege] = isEnabled;
                    console.log(`   ${privilege}: ${isEnabled ? '✅ Enabled' : '⚠️  Disabled'}`);
                } else {
                    this.results.privileges[privilege] = false;
                    console.log(`   ${privilege}: ❌ Not Available`);
                }
            }
        } catch (error) {
            console.log('   ❌ Failed to check privileges');
        }
    }

    async checkSecuritySoftware() {
        console.log('\n📋 Checking for security software...');
        try {
            const { stdout } = await execAsync('net start');
            const services = stdout.toLowerCase();
            
            const securityKeywords = [
                'antivirus', 'mcafee', 'norton', 'kaspersky', 'avast', 'avg',
                'bitdefender', 'trend', 'sophos', 'eset', 'reason', 'defender',
                'firewall', 'security', 'protection'
            ];

            for (const keyword of securityKeywords) {
                if (services.includes(keyword)) {
                    this.results.securitySoftware.push(keyword);
                }
            }

            if (this.results.securitySoftware.length > 0) {
                console.log('   ⚠️  Security software detected:');
                for (const software of this.results.securitySoftware) {
                    console.log(`      - ${software}`);
                }
            } else {
                console.log('   ✅ No obvious security software interference detected');
            }
        } catch (error) {
            console.log('   ❌ Failed to check security software');
        }
    }

    async checkSystemRestrictions() {
        console.log('\n📋 Checking system restrictions...');
        try {
            // Check if we can create files in system directories
            const testPaths = [
                'C:\\Windows\\Temp\\tun_test.txt',
                'C:\\Windows\\System32\\tun_test.txt'
            ];

            for (const testPath of testPaths) {
                try {
                    fs.writeFileSync(testPath, 'test');
                    fs.unlinkSync(testPath);
                    console.log(`   ${path.dirname(testPath)}: ✅ Write Access`);
                } catch (error) {
                    console.log(`   ${path.dirname(testPath)}: ❌ No Write Access`);
                }
            }
        } catch (error) {
            console.log('   ❌ Failed to check system restrictions');
        }
    }

    generateRecommendations() {
        console.log('\n📋 Generating recommendations...');
        
        if (!this.results.adminRights) {
            this.results.recommendations.push('❌ CRITICAL: Run application as Administrator with UAC elevation');
        }
        
        if (this.results.integrityLevel !== 'High' && this.results.integrityLevel !== 'System') {
            this.results.recommendations.push('❌ CRITICAL: Application needs High Integrity Level - restart with "Run as Administrator"');
        }
        
        if (!this.results.wintunDriver) {
            this.results.recommendations.push('❌ CRITICAL: WinTun driver not properly installed - reinstall WinTun');
        }
        
        const stoppedServices = Object.entries(this.results.requiredServices)
            .filter(([name, running]) => !running)
            .map(([name]) => name);
        
        if (stoppedServices.length > 0) {
            this.results.recommendations.push(`⚠️  Start required services: ${stoppedServices.join(', ')}`);
        }
        
        if (this.results.securitySoftware.length > 0) {
            this.results.recommendations.push('⚠️  Temporarily disable security software or add SP5Proxy to whitelist');
        }
        
        const disabledPrivileges = Object.entries(this.results.privileges)
            .filter(([name, enabled]) => !enabled)
            .map(([name]) => name);
        
        if (disabledPrivileges.length > 0) {
            this.results.recommendations.push(`⚠️  Enable privileges: ${disabledPrivileges.join(', ')}`);
        }
    }

    displayResults() {
        console.log('\n' + '=' .repeat(60));
        console.log('📊 DIAGNOSTIC SUMMARY');
        console.log('=' .repeat(60));
        
        console.log(`Admin Rights: ${this.results.adminRights ? '✅' : '❌'}`);
        console.log(`Integrity Level: ${this.results.integrityLevel} ${['High', 'System'].includes(this.results.integrityLevel) ? '✅' : '❌'}`);
        console.log(`WinTun Driver: ${this.results.wintunDriver ? '✅' : '❌'}`);
        
        const runningServices = Object.values(this.results.requiredServices).filter(Boolean).length;
        const totalServices = Object.keys(this.results.requiredServices).length;
        console.log(`Required Services: ${runningServices}/${totalServices} running`);
        
        console.log('\n🔧 RECOMMENDATIONS:');
        if (this.results.recommendations.length === 0) {
            console.log('✅ No issues detected - TUN interface should work');
        } else {
            for (const recommendation of this.results.recommendations) {
                console.log(`   ${recommendation}`);
            }
        }
    }
}

module.exports = TunDiagnostics;
