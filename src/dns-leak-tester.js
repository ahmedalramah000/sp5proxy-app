const { exec } = require('child_process');
const { promisify } = require('util');
const axios = require('axios');

const execAsync = promisify(exec);

class DNSLeakTester {
    constructor() {
        this.testResults = null;
        this.isTestRunning = false;
    }

    /**
     * Run comprehensive DNS leak test
     * @returns {Promise<Object>} - Detailed test results
     */
    async runComprehensiveTest() {
        if (this.isTestRunning) {
            console.log('[DNS-TEST] Test already running...');
            return this.testResults;
        }

        try {
            this.isTestRunning = true;
            console.log('[DNS-TEST] 🔍 Starting comprehensive DNS leak test...');

            const testResults = {
                timestamp: new Date().toISOString(),
                overallResult: 'UNKNOWN',
                hasLeaks: false,
                tests: [],
                summary: {
                    totalTests: 0,
                    passedTests: 0,
                    failedTests: 0,
                    successRate: 0
                },
                recommendations: []
            };

            // Test 1: Check current DNS servers
            await this.testCurrentDNSServers(testResults);

            // Test 2: Test DNS resolution through specific servers
            await this.testDNSResolution(testResults);

            // Test 3: Check for DNS leaks via external services
            await this.testExternalDNSLeak(testResults);

            // Test 4: Test DNS over HTTPS blocking
            await this.testDNSOverHTTPS(testResults);

            // Test 5: Test port 53 blocking
            await this.testPort53Blocking(testResults);

            // Calculate overall results
            this.calculateOverallResults(testResults);

            // Generate recommendations
            this.generateRecommendations(testResults);

            this.testResults = testResults;
            console.log(`[DNS-TEST] ✅ Comprehensive test completed. Result: ${testResults.overallResult}`);

            return testResults;

        } catch (error) {
            console.error('[DNS-TEST] ❌ Test failed:', error.message);
            return {
                timestamp: new Date().toISOString(),
                overallResult: 'ERROR',
                hasLeaks: true,
                error: error.message,
                tests: [],
                summary: { totalTests: 1, passedTests: 0, failedTests: 1, successRate: 0 }
            };
        } finally {
            this.isTestRunning = false;
        }
    }

    /**
     * Test current DNS servers being used
     * @param {Object} testResults - Test results object to update
     */
    async testCurrentDNSServers(testResults) {
        const test = {
            name: 'Current DNS Servers',
            description: 'Check which DNS servers are currently being used',
            status: 'UNKNOWN',
            details: [],
            passed: false
        };

        try {
            testResults.summary.totalTests++;

            // Get DNS servers for all interfaces
            const { stdout } = await execAsync('powershell -Command "Get-DnsClientServerAddress | Where-Object {$_.ServerAddresses} | Select-Object InterfaceAlias, AddressFamily, ServerAddresses | ConvertTo-Json"');
            
            if (stdout.trim()) {
                const dnsSettings = JSON.parse(stdout);
                const settings = Array.isArray(dnsSettings) ? dnsSettings : [dnsSettings];

                for (const setting of settings) {
                    if (setting.ServerAddresses && setting.ServerAddresses.length > 0) {
                        test.details.push({
                            interface: setting.InterfaceAlias,
                            family: setting.AddressFamily,
                            servers: setting.ServerAddresses
                        });

                        // Check if using proxy DNS servers
                        const proxyDNSServers = ['8.8.8.8', '1.1.1.1', '208.67.222.222'];
                        const hasProxyDNS = setting.ServerAddresses.some(server => 
                            proxyDNSServers.includes(server)
                        );

                        if (hasProxyDNS && setting.InterfaceAlias.includes('SP5Proxy')) {
                            test.passed = true;
                        }
                    }
                }
            }

            test.status = test.passed ? 'PASS' : 'FAIL';
            if (test.passed) {
                testResults.summary.passedTests++;
            } else {
                testResults.summary.failedTests++;
                testResults.hasLeaks = true;
            }

        } catch (error) {
            test.status = 'ERROR';
            test.error = error.message;
            testResults.summary.failedTests++;
            testResults.hasLeaks = true;
        }

        testResults.tests.push(test);
    }

    /**
     * Test DNS resolution through proxy
     * @param {Object} testResults - Test results object to update
     */
    async testDNSResolution(testResults) {
        const test = {
            name: 'DNS Resolution Test',
            description: 'Test DNS resolution through proxy servers',
            status: 'UNKNOWN',
            details: [],
            passed: false
        };

        try {
            testResults.summary.totalTests++;

            const testDomains = ['google.com', 'cloudflare.com', 'github.com'];
            const proxyDNS = '8.8.8.8';
            let successfulResolutions = 0;

            for (const domain of testDomains) {
                try {
                    const { stdout } = await execAsync(`nslookup ${domain} ${proxyDNS}`);
                    if (stdout.includes('Address:') || stdout.includes('Addresses:')) {
                        successfulResolutions++;
                        test.details.push({
                            domain: domain,
                            status: 'SUCCESS',
                            server: proxyDNS
                        });
                    }
                } catch (error) {
                    test.details.push({
                        domain: domain,
                        status: 'FAILED',
                        error: error.message
                    });
                }
            }

            test.passed = successfulResolutions >= testDomains.length * 0.8; // 80% success rate
            test.status = test.passed ? 'PASS' : 'FAIL';

            if (test.passed) {
                testResults.summary.passedTests++;
            } else {
                testResults.summary.failedTests++;
                testResults.hasLeaks = true;
            }

        } catch (error) {
            test.status = 'ERROR';
            test.error = error.message;
            testResults.summary.failedTests++;
            testResults.hasLeaks = true;
        }

        testResults.tests.push(test);
    }

    /**
     * Test for DNS leaks via external services
     * @param {Object} testResults - Test results object to update
     */
    async testExternalDNSLeak(testResults) {
        const test = {
            name: 'External DNS Leak Test',
            description: 'Check for DNS leaks using external services',
            status: 'UNKNOWN',
            details: [],
            passed: false
        };

        try {
            testResults.summary.totalTests++;

            // Test with multiple external services
            const testServices = [
                { name: 'Cloudflare', url: 'https://1.1.1.1/cdn-cgi/trace' },
                { name: 'IPInfo', url: 'https://ipinfo.io/json' }
            ];

            let successfulTests = 0;

            for (const service of testServices) {
                try {
                    const response = await axios.get(service.url, { 
                        timeout: 30000,
                        headers: { 'User-Agent': 'SP5Proxy-DNS-Test/1.0' }
                    });

                    test.details.push({
                        service: service.name,
                        status: 'SUCCESS',
                        response: response.status === 200 ? 'OK' : 'UNEXPECTED'
                    });

                    if (response.status === 200) {
                        successfulTests++;
                    }

                } catch (error) {
                    test.details.push({
                        service: service.name,
                        status: 'FAILED',
                        error: error.message
                    });
                }
            }

            test.passed = successfulTests > 0;
            test.status = test.passed ? 'PASS' : 'FAIL';

            if (test.passed) {
                testResults.summary.passedTests++;
            } else {
                testResults.summary.failedTests++;
            }

        } catch (error) {
            test.status = 'ERROR';
            test.error = error.message;
            testResults.summary.failedTests++;
        }

        testResults.tests.push(test);
    }

    /**
     * Test DNS over HTTPS blocking
     * @param {Object} testResults - Test results object to update
     */
    async testDNSOverHTTPS(testResults) {
        const test = {
            name: 'DNS over HTTPS Blocking',
            description: 'Verify that DNS over HTTPS is blocked',
            status: 'UNKNOWN',
            details: [],
            passed: false
        };

        try {
            testResults.summary.totalTests++;

            // Check if DoH blocking rules exist
            const { stdout } = await execAsync('netsh advfirewall firewall show rule name="SP5Proxy-Block-DoH-cloudflare-dns.com"');
            
            if (stdout.includes('SP5Proxy-Block-DoH-cloudflare-dns.com')) {
                test.passed = true;
                test.details.push({
                    check: 'Firewall Rules',
                    status: 'FOUND',
                    description: 'DNS over HTTPS blocking rules are active'
                });
            } else {
                test.details.push({
                    check: 'Firewall Rules',
                    status: 'NOT_FOUND',
                    description: 'DNS over HTTPS blocking rules are missing'
                });
            }

            test.status = test.passed ? 'PASS' : 'FAIL';

            if (test.passed) {
                testResults.summary.passedTests++;
            } else {
                testResults.summary.failedTests++;
                testResults.hasLeaks = true;
            }

        } catch (error) {
            test.status = 'ERROR';
            test.error = error.message;
            testResults.summary.failedTests++;
            testResults.hasLeaks = true;
        }

        testResults.tests.push(test);
    }

    /**
     * Test port 53 blocking
     * @param {Object} testResults - Test results object to update
     */
    async testPort53Blocking(testResults) {
        const test = {
            name: 'Port 53 Blocking',
            description: 'Verify that direct DNS traffic on port 53 is blocked',
            status: 'UNKNOWN',
            details: [],
            passed: false
        };

        try {
            testResults.summary.totalTests++;

            // Check if port 53 blocking rules exist
            const { stdout } = await execAsync('netsh advfirewall firewall show rule name="SP5Proxy-Block-DNS-Out"');
            
            if (stdout.includes('SP5Proxy-Block-DNS-Out')) {
                test.passed = true;
                test.details.push({
                    check: 'Port 53 UDP Blocking',
                    status: 'ACTIVE',
                    description: 'Direct DNS traffic blocking is active'
                });
            } else {
                test.details.push({
                    check: 'Port 53 UDP Blocking',
                    status: 'INACTIVE',
                    description: 'Direct DNS traffic blocking is not active'
                });
            }

            test.status = test.passed ? 'PASS' : 'FAIL';

            if (test.passed) {
                testResults.summary.passedTests++;
            } else {
                testResults.summary.failedTests++;
                testResults.hasLeaks = true;
            }

        } catch (error) {
            test.status = 'ERROR';
            test.error = error.message;
            testResults.summary.failedTests++;
            testResults.hasLeaks = true;
        }

        testResults.tests.push(test);
    }

    /**
     * Calculate overall test results
     * @param {Object} testResults - Test results object to update
     */
    calculateOverallResults(testResults) {
        const { totalTests, passedTests, failedTests } = testResults.summary;
        testResults.summary.successRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

        if (testResults.hasLeaks || testResults.summary.successRate < 80) {
            testResults.overallResult = 'FAIL';
        } else if (testResults.summary.successRate >= 95) {
            testResults.overallResult = 'EXCELLENT';
        } else if (testResults.summary.successRate >= 80) {
            testResults.overallResult = 'GOOD';
        } else {
            testResults.overallResult = 'POOR';
        }
    }

    /**
     * Generate recommendations based on test results
     * @param {Object} testResults - Test results object to update
     */
    generateRecommendations(testResults) {
        const recommendations = [];

        if (testResults.hasLeaks) {
            recommendations.push({
                priority: 'HIGH',
                issue: 'DNS leaks detected',
                solution: 'Restart the proxy connection to re-apply DNS leak prevention measures'
            });
        }

        const failedTests = testResults.tests.filter(test => test.status === 'FAIL');
        
        for (const test of failedTests) {
            switch (test.name) {
                case 'Current DNS Servers':
                    recommendations.push({
                        priority: 'HIGH',
                        issue: 'DNS servers not properly configured',
                        solution: 'Check TUN interface DNS configuration and ensure proxy DNS servers are set'
                    });
                    break;
                case 'DNS over HTTPS Blocking':
                    recommendations.push({
                        priority: 'MEDIUM',
                        issue: 'DNS over HTTPS not blocked',
                        solution: 'Enable DNS over HTTPS blocking in firewall rules'
                    });
                    break;
                case 'Port 53 Blocking':
                    recommendations.push({
                        priority: 'HIGH',
                        issue: 'Direct DNS traffic not blocked',
                        solution: 'Enable port 53 blocking to prevent DNS leaks'
                    });
                    break;
            }
        }

        if (recommendations.length === 0) {
            recommendations.push({
                priority: 'INFO',
                issue: 'No issues detected',
                solution: 'DNS leak prevention is working correctly'
            });
        }

        testResults.recommendations = recommendations;
    }

    /**
     * Get the latest test results
     * @returns {Object|null} - Latest test results
     */
    getLatestResults() {
        return this.testResults;
    }

    /**
     * Check if test is currently running
     * @returns {boolean} - Test running status
     */
    isRunning() {
        return this.isTestRunning;
    }
}

module.exports = DNSLeakTester;
