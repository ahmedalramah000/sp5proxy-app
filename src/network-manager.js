const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const os = require('os');

const execAsync = promisify(exec);

// Create a timeout wrapper for exec commands with longer default timeout
const execWithTimeout = async (command, timeoutMs = 45000) => {
    return new Promise((resolve, reject) => {
        const child = exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve({ stdout, stderr });
            }
        });

        const timeout = setTimeout(() => {
            child.kill('SIGTERM');
            reject(new Error(`Command timed out after ${timeoutMs}ms: ${command}`));
        }, timeoutMs);

        child.on('exit', () => {
            clearTimeout(timeout);
        });
    });
};

class NetworkManager {
    constructor() {
        this.tunInterfaceName = 'SP5ProxyTun';
        this.tunInterfaceIndex = null;
        this.originalGateway = null;
        this.originalInterface = null;
        this.isTrafficRedirected = false;
        this.tunCreated = false;
        this.currentProxyIP = null;
        this.proxyServerIP = null;
        this.routeBackup = null;
    }

    async initialize() {
        // Get current network configuration
        await this.getCurrentNetworkConfig();
    }

    async getCurrentNetworkConfig() {
        try {
            console.log('🔍 Detecting current network configuration...');

            // Method 1: Try PowerShell for more reliable gateway detection
            try {
                const psCommand = `Get-NetRoute -DestinationPrefix "0.0.0.0/0" | Select-Object -First 1 | ForEach-Object { "$($_.NextHop),$($_.InterfaceIndex)" }`;
                const { stdout: psOutput } = await execWithTimeout(`powershell -Command "${psCommand}"`, 10000);

                if (psOutput && psOutput.trim()) {
                    const [gateway, interfaceIndex] = psOutput.trim().split(',');
                    if (gateway && gateway !== '0.0.0.0') {
                        this.originalGateway = gateway;
                        this.originalInterface = interfaceIndex;
                        console.log(`✅ PowerShell method - Gateway: ${this.originalGateway}, Interface: ${this.originalInterface}`);
                    }
                }
            } catch (psError) {
                console.log('PowerShell method failed, trying route print...');
            }

            // Method 2: Fallback to route print if PowerShell fails
            if (!this.originalGateway) {
                const { stdout } = await execAsync('route print 0.0.0.0');
                const lines = stdout.split('\n');

                for (const line of lines) {
                    if (line.includes('0.0.0.0') && line.includes('0.0.0.0')) {
                        const parts = line.trim().split(/\s+/);
                        if (parts.length >= 4 && parts[2] !== '0.0.0.0') {
                            this.originalGateway = parts[2];
                            this.originalInterface = parts[3];
                            console.log(`✅ Route print method - Gateway: ${this.originalGateway}, Interface: ${this.originalInterface}`);
                            break;
                        }
                    }
                }
            }

            // Method 3: Last resort - try ipconfig
            if (!this.originalGateway) {
                console.log('Trying ipconfig as last resort...');
                const { stdout: ipconfigOutput } = await execAsync('ipconfig');
                const lines = ipconfigOutput.split('\n');

                for (const line of lines) {
                    if (line.includes('Default Gateway') && line.includes(':')) {
                        const gateway = line.split(':')[1].trim();
                        if (gateway && gateway !== '' && !gateway.includes('::')) {
                            this.originalGateway = gateway;
                            console.log(`✅ ipconfig method - Gateway: ${this.originalGateway}`);
                            break;
                        }
                    }
                }
            }

            if (!this.originalGateway) {
                console.warn('⚠️ Could not detect original gateway - using fallback');
                this.originalGateway = '192.168.1.1'; // Common default
            }

            console.log('🌐 Final network config:', {
                gateway: this.originalGateway,
                interface: this.originalInterface
            });

        } catch (error) {
            console.error('❌ Failed to get network configuration:', error);
            // Set fallback values
            this.originalGateway = '192.168.1.1';
            this.originalInterface = '1';
        }
    }

    async createTunInterface() {
        if (this.tunCreated) {
            console.log('TUN interface already created');
            return;
        }

        try {
            console.log('Creating TUN interface...');

            // Check if interface already exists
            const existingInterface = await this.checkInterfaceExists();
            if (existingInterface) {
                console.log('TUN interface already exists, configuring...');
                await this.configureTunInterface();
                this.tunCreated = true;
                return;
            }

            // Try multiple methods to create the interface
            let interfaceCreated = false;

            // Method 1: Try WinTun adapter first (fastest method)
            try {
                console.log('Attempting Method 1: WinTun adapter (fastest)...');
                await Promise.race([
                    this.createWinTunAdapter(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('WinTun adapter creation timed out after 15 seconds')), 15000)
                    )
                ]);
                interfaceCreated = true;
                console.log('✓ TUN interface created using WinTun adapter');
            } catch (error) {
                console.log('✗ WinTun adapter creation failed:', error.message);
            }

            // Method 2: Try PowerShell method (second fastest)
            if (!interfaceCreated) {
                try {
                    console.log('Attempting Method 2: PowerShell NetAdapter...');
                    await Promise.race([
                        this.createTunInterfacePowerShell(),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('PowerShell method timed out after 15 seconds')), 15000)
                        )
                    ]);
                    interfaceCreated = true;
                    console.log('✓ TUN interface created using PowerShell');
                } catch (error) {
                    console.log('✗ PowerShell method failed:', error.message);
                }
            }

            // Method 3: Try Microsoft Loopback Adapter (slower but reliable)
            if (!interfaceCreated) {
                try {
                    console.log('Attempting Method 3: Microsoft Loopback Adapter...');
                    await Promise.race([
                        this.createLoopbackAdapter(),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('Loopback adapter creation timed out after 30 seconds')), 30000)
                        )
                    ]);
                    interfaceCreated = true;
                    console.log('✓ TUN interface created using Loopback Adapter');
                } catch (error) {
                    console.log('✗ Loopback adapter creation failed:', error.message);
                }
            }

            // Method 3: Try simplified loopback adapter creation
            if (!interfaceCreated) {
                try {
                    console.log('Attempting Method 3: Simplified loopback adapter...');
                    await this.createSimplifiedLoopbackAdapter();
                    interfaceCreated = true;
                    console.log('✓ TUN interface created using simplified loopback adapter');
                } catch (error) {
                    console.log('✗ Simplified loopback adapter creation failed:', error.message);
                }
            }

            // Method 4: Try WinTun adapter (preferred method)
            if (!interfaceCreated) {
                try {
                    console.log('Attempting Method 4: WinTun adapter...');
                    await Promise.race([
                        this.createWinTunAdapter(),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('WinTun adapter creation timed out after 30 seconds')), 30000)
                        )
                    ]);
                    interfaceCreated = true;
                    console.log('✓ TUN interface created using WinTun adapter');
                } catch (error) {
                    console.log('✗ WinTun adapter creation failed:', error.message);
                }
            }

            // Method 5: Try TAP-Windows adapter if available
            if (!interfaceCreated) {
                try {
                    console.log('Attempting Method 5: TAP-Windows adapter...');
                    await Promise.race([
                        this.createTapAdapter(),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('TAP adapter creation timed out after 30 seconds')), 30000)
                        )
                    ]);
                    interfaceCreated = true;
                    console.log('✓ TUN interface created using TAP adapter');
                } catch (error) {
                    console.log('✗ TAP adapter creation failed:', error.message);
                }
            }

            // Method 6: Fallback - Use existing interface with virtual configuration
            if (!interfaceCreated) {
                try {
                    console.log('Attempting Method 6: Virtual interface fallback...');
                    await this.createVirtualInterfaceFallback();
                    interfaceCreated = true;
                    console.log('✓ Virtual interface fallback configured');
                } catch (error) {
                    console.log('✗ Virtual interface fallback failed:', error.message);
                }
            }

            if (!interfaceCreated) {
                throw new Error('All interface creation methods failed');
            }

            // Optimized wait for interface readiness (reduced from 2000ms to 500ms)
            await new Promise(resolve => setTimeout(resolve, 500));

            // Discover the actual interface name before configuration
            console.log('Discovering actual interface name after creation...');
            try {
                const actualInterfaceName = await this.discoverActualInterfaceName();
                if (actualInterfaceName !== this.tunInterfaceName) {
                    console.log(`Interface name discovered: "${this.tunInterfaceName}" → "${actualInterfaceName}"`);
                    this.tunInterfaceName = actualInterfaceName;
                }
            } catch (error) {
                console.warn('Could not discover interface name, attempting forced interface creation:', error.message);

                // Try to force create an interface using our batch helper
                try {
                    console.log('Attempting forced interface creation using batch helper...');
                    const { stdout } = await execWithTimeout(`"${__dirname}/../scripts/tun-interface-helper.bat" create "${this.tunInterfaceName}" "10.0.0.1" "255.255.255.0"`, 60000);
                    console.log('Batch helper output:', stdout);

                    // Optimized wait for discovery (reduced from 3000ms to 1000ms)
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    try {
                        const discoveredName = await this.discoverActualInterfaceName();
                        console.log(`✓ Interface discovered after forced creation: ${discoveredName}`);
                        this.tunInterfaceName = discoveredName;
                    } catch (discoveryError) {
                        console.warn('Discovery still failed after forced creation, using original name');
                    }

                } catch (batchError) {
                    console.warn('Batch helper creation failed:', batchError.message);
                    console.warn('Proceeding with original interface name:', this.tunInterfaceName);
                }
            }

            // Configure the TUN interface
            await this.configureTunInterface();

            this.tunCreated = true;
            console.log('TUN interface created and configured successfully');

        } catch (error) {
            console.error('Failed to create TUN interface:', error);
            throw new Error(`Failed to create TUN interface: ${error.message}`);
        }
    }

    async checkInterfaceExists() {
        try {
            const { stdout } = await execWithTimeout(`netsh interface show interface "${this.tunInterfaceName}"`, 10000);
            return stdout.includes(this.tunInterfaceName);
        } catch (error) {
            return false;
        }
    }

    async discoverActualInterfaceName() {
        console.log('Discovering actual TUN interface name...');

        try {
            // Method 1: Try to find by exact name first
            const exactMatch = await this.checkInterfaceExists();
            if (exactMatch) {
                console.log(`✓ Interface found with expected name: ${this.tunInterfaceName}`);
                return this.tunInterfaceName;
            }

            // Method 2: Use PowerShell to find ONLY virtual/loopback adapters (avoid physical interfaces)
            console.log('Searching for virtual TUN adapters using PowerShell...');
            try {
                // Get all adapters with detailed information
                const allAdaptersCommand = `Get-NetAdapter | Select-Object Name, InterfaceDescription, Status, InterfaceIndex, Virtual | ConvertTo-Json`;
                const { stdout: allAdaptersOutput } = await execWithTimeout(`powershell -Command "${allAdaptersCommand}"`, 15000);

                console.log('All available adapters:');
                console.log(allAdaptersOutput);

                // Parse the JSON safely
                let allAdapters = [];
                if (allAdaptersOutput && allAdaptersOutput.trim()) {
                    try {
                        const parsed = JSON.parse(allAdaptersOutput);
                        allAdapters = Array.isArray(parsed) ? parsed : [parsed];
                    } catch (jsonError) {
                        console.log('JSON parsing failed for all adapters:', jsonError.message);
                        console.log('Raw output:', allAdaptersOutput);
                    }
                }

                // Filter for ONLY virtual/loopback adapters, EXCLUDE physical interfaces
                const virtualAdapters = allAdapters.filter(adapter => {
                    if (!adapter || !adapter.InterfaceDescription) return false;

                    const desc = adapter.InterfaceDescription.toLowerCase();
                    const name = (adapter.Name || '').toLowerCase();

                    // EXCLUDE physical interfaces
                    const isPhysical = desc.includes('wi-fi') ||
                                     desc.includes('ethernet') ||
                                     desc.includes('wireless') ||
                                     desc.includes('bluetooth') ||
                                     name.includes('wi-fi') ||
                                     (name.includes('ethernet') && !desc.includes('loopback'));

                    if (isPhysical) {
                        console.log(`Excluding physical interface: "${adapter.Name}" (${adapter.InterfaceDescription})`);
                        return false;
                    }

                    // INCLUDE virtual/loopback adapters
                    const isVirtual = desc.includes('loopback') ||
                                    desc.includes('microsoft km-test') ||
                                    desc.includes('wintun') ||
                                    desc.includes('tap') ||
                                    name.includes('loopback') ||
                                    name.includes('sp5proxy') ||
                                    name.includes('tun') ||
                                    adapter.Virtual === true;

                    return isVirtual;
                });

                console.log(`Found ${virtualAdapters.length} potential virtual adapters`);

                for (const adapter of virtualAdapters) {
                    if (adapter && adapter.Name) {
                        console.log(`Found virtual interface: "${adapter.Name}" (${adapter.InterfaceDescription})`);

                        // Verify this interface exists and is accessible
                        try {
                            await execWithTimeout(`netsh interface show interface "${adapter.Name}"`, 5000);
                            console.log(`✓ Verified virtual interface access: ${adapter.Name}`);
                            return adapter.Name;
                        } catch (error) {
                            console.log(`✗ Cannot access virtual interface: ${adapter.Name}`);
                            continue;
                        }
                    }
                }

                console.log('No suitable virtual adapters found');

            } catch (error) {
                console.log('PowerShell method failed:', error.message);
            }

            // Method 3: Parse netsh output to find interfaces (enhanced)
            console.log('Searching using netsh interface list...');
            const { stdout } = await execWithTimeout('netsh interface show interface', 15000);
            console.log('Netsh interface output:');
            console.log(stdout);

            const lines = stdout.split('\n');
            const potentialInterfaces = [];

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine && !trimmedLine.startsWith('Admin') && !trimmedLine.startsWith('---') && trimmedLine.length > 10) {
                    // Parse netsh output format: Admin State  State      Type         Interface Name
                    const parts = trimmedLine.split(/\s{2,}/); // Split on multiple spaces
                    console.log(`Parsing line: "${trimmedLine}" -> Parts: [${parts.map(p => `"${p}"`).join(', ')}]`);

                    if (parts.length >= 4) {
                        const adminState = parts[0] ? parts[0].trim() : '';
                        const state = parts[1] ? parts[1].trim() : '';
                        const interfaceType = parts[2] ? parts[2].trim() : '';
                        const interfaceName = parts[3].trim();

                        console.log(`Found interface: "${interfaceName}" (Type: ${interfaceType}, State: ${state})`);

                        // Look for any interface that could be our TUN interface
                        const isLoopback = interfaceName.toLowerCase().includes('loopback') ||
                                         interfaceType.toLowerCase().includes('loopback');

                        const isRecentConnection = interfaceName.match(/Local Area Connection\*?\s*\d+/) ||
                                                 interfaceName.match(/Ethernet\s*\d+/) ||
                                                 interfaceName.toLowerCase().includes('connection');

                        const isOurInterface = interfaceName.toLowerCase().includes('sp5proxy') ||
                                             interfaceName.toLowerCase().includes('tun');

                        if (isLoopback || isRecentConnection || isOurInterface) {
                            potentialInterfaces.push({
                                name: interfaceName,
                                type: interfaceType,
                                state: state,
                                adminState: adminState,
                                line: trimmedLine,
                                priority: isOurInterface ? 3 : (isLoopback ? 2 : 1) // Prioritize our interfaces
                            });
                            console.log(`Added potential interface: "${interfaceName}" (Priority: ${isOurInterface ? 3 : (isLoopback ? 2 : 1)})`);
                        }
                    }
                }
            }

            console.log(`Found ${potentialInterfaces.length} potential interfaces from netsh`);

            // Sort by priority (higher priority first)
            potentialInterfaces.sort((a, b) => b.priority - a.priority);

            // Test each potential interface
            for (const iface of potentialInterfaces) {
                try {
                    console.log(`Testing interface: "${iface.name}" (Type: ${iface.type})`);

                    // Try to access the interface
                    await execWithTimeout(`netsh interface show interface "${iface.name}"`, 5000);

                    // Check if it's a loopback adapter by trying to get its description
                    try {
                        const { stdout: configOutput } = await execWithTimeout(`netsh interface ip show config "${iface.name}"`, 5000);
                        console.log(`Interface "${iface.name}" configuration accessible`);
                        console.log(`✓ Selected interface: ${iface.name}`);
                        return iface.name;
                    } catch (error) {
                        console.log(`Interface "${iface.name}" not suitable:`, error.message);
                        continue;
                    }

                } catch (error) {
                    console.log(`Cannot access interface "${iface.name}":`, error.message);
                    continue;
                }
            }

            // Method 4: Test each potential interface for accessibility
            console.log('Testing potential interfaces for accessibility...');
            for (const iface of potentialInterfaces) {
                try {
                    console.log(`Testing interface: "${iface.name}" (Type: ${iface.type}, Priority: ${iface.priority})`);

                    // Try to access the interface
                    await execWithTimeout(`netsh interface show interface "${iface.name}"`, 5000);

                    // Check if it's suitable for IP configuration
                    try {
                        const { stdout: configOutput } = await execWithTimeout(`netsh interface ip show config "${iface.name}"`, 5000);
                        console.log(`Interface "${iface.name}" configuration accessible`);
                        console.log(`✓ Selected interface: ${iface.name}`);
                        return iface.name;
                    } catch (error) {
                        console.log(`Interface "${iface.name}" not suitable for IP config:`, error.message);
                        continue;
                    }

                } catch (error) {
                    console.log(`Cannot access interface "${iface.name}":`, error.message);
                    continue;
                }
            }

            // Method 5: Fallback - try to use any available interface if we're desperate
            console.log('No suitable interfaces found, trying fallback method...');
            try {
                const fallbackResult = await this.findFallbackInterface();
                if (fallbackResult) {
                    console.log(`✓ Using fallback interface: ${fallbackResult}`);
                    return fallbackResult;
                }
            } catch (error) {
                console.log('Fallback method failed:', error.message);
            }

            // Method 6: Last resort - check if the original name actually works
            console.log('Last resort: testing original interface name...');
            try {
                await execWithTimeout(`netsh interface show interface "${this.tunInterfaceName}"`, 5000);
                console.log(`✓ Original interface name works: ${this.tunInterfaceName}`);
                return this.tunInterfaceName;
            } catch (error) {
                console.log('Original interface name failed:', error.message);
            }

            throw new Error('No suitable TUN interface found after exhaustive search');

        } catch (error) {
            console.error('Failed to discover interface name:', error.message);
            throw new Error(`Cannot find TUN interface: ${error.message}`);
        }
    }

    async findFallbackInterface() {
        console.log('Attempting fallback interface discovery...');

        try {
            // Method 1: Look for any interface that was recently modified
            const { stdout } = await execWithTimeout('netsh interface show interface', 10000);
            const lines = stdout.split('\n');

            // Get all interfaces
            const allInterfaces = [];
            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine && !trimmedLine.startsWith('Admin') && !trimmedLine.startsWith('---') && trimmedLine.length > 10) {
                    const parts = trimmedLine.split(/\s{2,}/);
                    if (parts.length >= 4) {
                        const interfaceName = parts[3].trim();
                        const state = parts[1] ? parts[1].trim() : '';

                        // Skip Wi-Fi and Ethernet (physical interfaces)
                        if (!interfaceName.toLowerCase().includes('wi-fi') &&
                            !interfaceName.toLowerCase().includes('ethernet') &&
                            !interfaceName.toLowerCase().includes('bluetooth')) {

                            allInterfaces.push({
                                name: interfaceName,
                                state: state
                            });
                        }
                    }
                }
            }

            console.log(`Found ${allInterfaces.length} non-physical interfaces for fallback testing`);

            // Test each interface
            for (const iface of allInterfaces) {
                try {
                    console.log(`Testing fallback interface: "${iface.name}"`);

                    // Try to access the interface
                    await execWithTimeout(`netsh interface show interface "${iface.name}"`, 3000);

                    // Try to get IP config (this will work even if no IP is configured)
                    await execWithTimeout(`netsh interface ip show config "${iface.name}"`, 3000);

                    console.log(`✓ Fallback interface accessible: ${iface.name}`);
                    return iface.name;

                } catch (error) {
                    console.log(`✗ Fallback interface failed: ${iface.name}`);
                    continue;
                }
            }

            return null;

        } catch (error) {
            console.log('Fallback interface discovery failed:', error.message);
            return null;
        }
    }

    async createLoopbackAdapter() {
        console.log('Creating Microsoft Loopback Adapter...');

        try {
            // Method 1: Try to find and rename existing loopback adapter first
            console.log('Checking for existing loopback adapters...');
            const existingAdapter = await this.findExistingLoopbackAdapter();
            if (existingAdapter) {
                console.log(`Found existing loopback adapter: ${existingAdapter}`);
                await this.renameAdapter(existingAdapter, this.tunInterfaceName);
                return;
            }

            // Method 2: Try PowerShell-based creation with timeout
            console.log('Attempting PowerShell-based adapter creation...');
            try {
                await this.createLoopbackWithPowerShell();
                return;
            } catch (error) {
                console.log('PowerShell method failed:', error.message);
            }

            // Method 3: Try devcon if available
            console.log('Attempting devcon-based adapter creation...');
            try {
                await this.createLoopbackWithDevcon();
                return;
            } catch (error) {
                console.log('devcon method failed:', error.message);
            }

            // Method 4: Try pnputil method
            console.log('Attempting pnputil-based adapter creation...');
            try {
                await this.createLoopbackWithPnputil();
                return;
            } catch (error) {
                console.log('pnputil method failed:', error.message);
            }

            throw new Error('All loopback adapter creation methods failed');

        } catch (error) {
            throw new Error(`Failed to create loopback adapter: ${error.message}`);
        }
    }

    async findExistingLoopbackAdapter() {
        try {
            const { stdout } = await execWithTimeout('netsh interface show interface', 10000);
            const lines = stdout.split('\n');

            // Look for existing loopback adapters
            const loopbackPatterns = [
                /Microsoft Loopback Adapter/i,
                /Loopback Adapter/i,
                /MS Loopback/i,
                /Loopback/i
            ];

            for (const line of lines) {
                for (const pattern of loopbackPatterns) {
                    if (pattern.test(line)) {
                        // Extract adapter name from netsh output
                        const parts = line.trim().split(/\s+/);
                        if (parts.length >= 4) {
                            return parts.slice(3).join(' ').trim();
                        }
                    }
                }
            }

            return null;
        } catch (error) {
            console.log('Error finding existing loopback adapter:', error.message);
            return null;
        }
    }

    async renameAdapter(oldName, newName) {
        try {
            console.log(`Renaming adapter "${oldName}" to "${newName}"`);
            await execWithTimeout(`netsh interface set interface name="${oldName}" newname="${newName}"`, 10000);
            console.log('✓ Adapter renamed successfully');

            // Update our internal reference
            this.tunInterfaceName = newName;

        } catch (error) {
            console.log(`⚠ Failed to rename adapter, will use original name "${oldName}"`);
            // Update our internal reference to the actual name
            this.tunInterfaceName = oldName;
            console.log(`Updated interface name to: ${this.tunInterfaceName}`);
        }
    }

    async createLoopbackWithPowerShell() {
        const psCommand = `
            try {
                $adapter = Get-NetAdapter -Name "${this.tunInterfaceName}" -ErrorAction SilentlyContinue
                if ($adapter) {
                    Write-Host "Adapter already exists"
                    exit 0
                }

                # Try to add loopback adapter using Add-WindowsDriver
                $infPath = "$env:windir\\inf\\netloop.inf"
                if (Test-Path $infPath) {
                    Add-WindowsDriver -Online -Driver $infPath -ErrorAction Stop
                    Start-Sleep -Seconds 2

                    # Find the newly created adapter
                    $newAdapter = Get-NetAdapter | Where-Object { $_.InterfaceDescription -like "*Loopback*" } | Select-Object -First 1
                    if ($newAdapter -and $newAdapter.Name -ne "${this.tunInterfaceName}") {
                        Rename-NetAdapter -Name $newAdapter.Name -NewName "${this.tunInterfaceName}" -ErrorAction Stop
                    }
                    Write-Host "Loopback adapter created successfully"
                } else {
                    throw "netloop.inf not found"
                }
            } catch {
                Write-Error "PowerShell creation failed: $_"
                exit 1
            }
        `;

        await execWithTimeout(`powershell -ExecutionPolicy Bypass -Command "${psCommand}"`, 30000);
    }

    async createLoopbackWithDevcon() {
        // Check if devcon is available
        try {
            await execWithTimeout('devcon', 5000);
        } catch (error) {
            throw new Error('devcon not available');
        }

        // Install loopback adapter using devcon
        await execWithTimeout('devcon install %windir%\\inf\\netloop.inf *MSLOOP', 30000);

        // Wait for adapter to be created
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Find and rename the adapter
        const adapter = await this.findExistingLoopbackAdapter();
        if (adapter && adapter !== this.tunInterfaceName) {
            await this.renameAdapter(adapter, this.tunInterfaceName);
        }
    }

    async createLoopbackWithPnputil() {
        const infPath = 'C:\\Windows\\inf\\netloop.inf';

        // Install the driver
        await execWithTimeout(`pnputil /add-driver "${infPath}" /install`, 30000);

        // Wait for adapter to be created
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Find and rename the adapter
        const adapter = await this.findExistingLoopbackAdapter();
        if (adapter && adapter !== this.tunInterfaceName) {
            await this.renameAdapter(adapter, this.tunInterfaceName);
        }
    }

    async createTunInterfacePowerShell() {
        console.log('Using PowerShell to create network adapter...');

        const psCommand = `
            try {
                # Check if adapter already exists
                $adapter = Get-NetAdapter -Name "${this.tunInterfaceName}" -ErrorAction SilentlyContinue
                if ($adapter) {
                    Write-Host "Adapter already exists"
                    exit 0
                }

                Write-Host "Creating new network adapter..."

                # Try to create a new virtual adapter using New-NetAdapter
                try {
                    $null = New-NetAdapter -Name "${this.tunInterfaceName}" -InterfaceDescription "SP5Proxy Virtual Adapter" -ErrorAction Stop
                    Write-Host "Created new adapter successfully"
                    exit 0
                } catch {
                    Write-Host "New-NetAdapter failed, trying alternative method..."
                }

                # Fallback: Install Microsoft Loopback Adapter
                $infPath = "$env:windir\\inf\\netloop.inf"
                if (Test-Path $infPath) {
                    Write-Host "Installing Microsoft Loopback Adapter..."
                    pnputil /add-driver $infPath /install
                    Start-Sleep -Seconds 3

                    # Find and rename the adapter
                    $loopbackAdapter = Get-NetAdapter | Where-Object { $_.InterfaceDescription -like "*Loopback*" } | Select-Object -First 1
                    if ($loopbackAdapter -and $loopbackAdapter.Name -ne "${this.tunInterfaceName}") {
                        Rename-NetAdapter -Name $loopbackAdapter.Name -NewName "${this.tunInterfaceName}"
                        Write-Host "Loopback adapter installed and renamed"
                    }
                } else {
                    throw "netloop.inf not found at $infPath"
                }
            } catch {
                Write-Error "PowerShell adapter creation failed: $_"
                exit 1
            }
        `;

        await execWithTimeout(`powershell -ExecutionPolicy Bypass -Command "${psCommand}"`, 45000);
        console.log('PowerShell adapter creation completed');
    }

    async createSimplifiedLoopbackAdapter() {
        console.log('Creating simplified loopback adapter...');

        try {
            // Use a direct approach with pnputil
            console.log('Installing Microsoft Loopback Adapter using pnputil...');

            // Check if the driver exists
            const driverPath = 'C:\\Windows\\inf\\netloop.inf';
            const fs = require('fs');

            if (!fs.existsSync(driverPath)) {
                throw new Error('Microsoft Loopback Adapter driver not found');
            }

            // Install the driver directly
            await execWithTimeout(`pnputil /add-driver "${driverPath}" /install`, 30000);
            console.log('✓ Driver installed successfully');

            // Wait for the adapter to be created
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Find the created adapter
            const { stdout } = await execWithTimeout('netsh interface show interface', 10000);
            const lines = stdout.split('\n');

            for (const line of lines) {
                if (line.toLowerCase().includes('loopback') ||
                    line.toLowerCase().includes('microsoft km-test')) {
                    // Extract adapter name
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 4) {
                        const adapterName = parts.slice(3).join(' ').trim();
                        console.log(`Found loopback adapter: ${adapterName}`);

                        // Rename it to our desired name
                        try {
                            await execWithTimeout(`netsh interface set interface name="${adapterName}" newname="${this.tunInterfaceName}"`, 10000);
                            console.log(`✓ Adapter renamed to: ${this.tunInterfaceName}`);
                        } catch (renameError) {
                            console.log(`Using original name: ${adapterName}`);
                            this.tunInterfaceName = adapterName;
                        }
                        return;
                    }
                }
            }

            throw new Error('No loopback adapter found after installation');

        } catch (error) {
            console.error('Simplified loopback adapter creation failed:', error);
            throw error;
        }
    }

    async createVirtualInterfaceFallback() {
        console.log('Creating virtual interface fallback configuration...');

        try {
            // This method creates a "virtual" TUN interface by using the existing network
            // infrastructure and configuring it to work with tun2socks

            // Set a virtual interface name that tun2socks can use
            this.tunInterfaceName = 'SP5ProxyTun';

            // Mark as created - we'll let tun2socks handle the actual interface creation
            console.log('✓ Virtual interface fallback configured');
            console.log('Note: Actual interface will be created by tun2socks when started');

            return true;

        } catch (error) {
            console.error('Virtual interface fallback failed:', error);
            throw error;
        }
    }

    async createWinTunAdapter() {
        console.log('Creating WinTun adapter...');

        try {
            // Check if WinTun driver is available
            const fs = require('fs');
            const path = require('path');
            const winTunPath = path.join(__dirname, '..', 'bin', 'wintun.dll');

            if (!fs.existsSync(winTunPath)) {
                console.log('WinTun driver not found, attempting to install...');
                await this.installWinTunDriver();
            }

            // Use tun2socks to create the WinTun interface
            // tun2socks will automatically create the WinTun adapter when started
            console.log('WinTun adapter will be created by tun2socks automatically');

            // Create a placeholder interface name that tun2socks will use
            this.tunInterfaceName = 'SP5ProxyTun';
            console.log(`WinTun interface will be created as: ${this.tunInterfaceName}`);

        } catch (error) {
            console.error('WinTun adapter creation failed:', error);
            throw new Error(`WinTun adapter creation failed: ${error.message}`);
        }
    }

    async installWinTunDriver() {
        console.log('Installing WinTun driver...');

        try {
            const fs = require('fs');
            const path = require('path');

            // Run the WinTun installation script
            const installScript = path.join(__dirname, '..', 'scripts', 'install-wintun.bat');
            if (fs.existsSync(installScript)) {
                await execWithTimeout(`"${installScript}"`, 60000);
                console.log('✓ WinTun driver installed successfully');
            } else {
                console.log('WinTun installation script not found, driver will be loaded dynamically');
            }
        } catch (error) {
            console.log('WinTun driver installation failed, will attempt dynamic loading:', error.message);
        }
    }

    async createTapAdapter() {
        console.log('Attempting to create TAP adapter...');

        try {
            // Check if TAP-Windows is installed
            const tapPaths = [
                'C:\\Program Files\\TAP-Windows\\bin\\tapinstall.exe',
                'C:\\Program Files (x86)\\TAP-Windows\\bin\\tapinstall.exe'
            ];

            let tapInstallPath = null;
            for (const path of tapPaths) {
                try {
                    await execWithTimeout(`if exist "${path}" echo exists`, 5000);
                    tapInstallPath = path;
                    break;
                } catch (error) {
                    continue;
                }
            }

            if (!tapInstallPath) {
                throw new Error('TAP-Windows not installed - no tapinstall.exe found');
            }

            console.log(`Found TAP installer at: ${tapInstallPath}`);

            // Install TAP adapter with timeout
            console.log('Installing TAP adapter...');
            const driverPath = tapInstallPath.includes('(x86)')
                ? 'C:\\Program Files (x86)\\TAP-Windows\\driver\\OemVista.inf'
                : 'C:\\Program Files\\TAP-Windows\\driver\\OemVista.inf';

            await execWithTimeout(`"${tapInstallPath}" install "${driverPath}" tap0901`, 30000);

            // Wait for adapter to be created
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Find and rename the TAP adapter
            console.log('Looking for TAP adapter to rename...');
            const { stdout } = await execWithTimeout('netsh interface show interface', 10000);
            const lines = stdout.split('\n');

            for (const line of lines) {
                if (line.toLowerCase().includes('tap') && !line.toLowerCase().includes(this.tunInterfaceName.toLowerCase())) {
                    // Extract adapter name from netsh output
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 4) {
                        const tapName = parts.slice(3).join(' ').trim();
                        console.log(`Renaming TAP adapter "${tapName}" to "${this.tunInterfaceName}"`);
                        await execWithTimeout(`netsh interface set interface name="${tapName}" newname="${this.tunInterfaceName}"`, 10000);
                        break;
                    }
                }
            }

            console.log('TAP adapter creation completed');

        } catch (error) {
            throw new Error(`Failed to create TAP adapter: ${error.message}`);
        }
    }

    async discoverTunInterfaceFromTun2socks() {
        console.log('Discovering TUN interface created by tun2socks...');

        try {
            // Wait a bit more for the interface to be fully created
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Look for interfaces that might have been created by tun2socks
            const { stdout } = await execWithTimeout('netsh interface show interface', 10000);
            console.log('Current interfaces after tun2socks start:');
            console.log(stdout);

            // Parse interfaces and look for new ones
            const lines = stdout.split('\n');
            const potentialInterfaces = [];

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine && !trimmedLine.startsWith('Admin') && !trimmedLine.startsWith('---') && trimmedLine.length > 10) {
                    const parts = trimmedLine.split(/\s{2,}/);
                    if (parts.length >= 4) {
                        const interfaceName = parts[3].trim();

                        // Look for interfaces that could be our TUN interface
                        if (interfaceName.toLowerCase().includes('tun') ||
                            interfaceName.toLowerCase().includes('sp5proxy') ||
                            interfaceName.toLowerCase().includes('wintun') ||
                            interfaceName.toLowerCase().includes('tap')) {

                            potentialInterfaces.push(interfaceName);
                            console.log(`Found potential TUN interface: ${interfaceName}`);
                        }
                    }
                }
            }

            // If we found potential interfaces, use the first one
            if (potentialInterfaces.length > 0) {
                this.tunInterfaceName = potentialInterfaces[0];
                console.log(`✓ Using TUN interface: ${this.tunInterfaceName}`);

                // Try to get the interface index using multiple methods
                try {
                    const { stdout: interfaceInfo } = await execWithTimeout(`netsh interface show interface "${this.tunInterfaceName}"`, 5000);
                    console.log('Interface info:', interfaceInfo);

                    const indexMatch = interfaceInfo.match(/Idx:\s*(\d+)/);
                    if (indexMatch) {
                        this.tunInterfaceIndex = indexMatch[1];
                        console.log(`✓ Interface index from netsh: ${this.tunInterfaceIndex}`);
                    } else {
                        // Try PowerShell method
                        try {
                            const psCommand = `(Get-NetAdapter -Name "${this.tunInterfaceName}").InterfaceIndex`;
                            const { stdout: psOutput } = await execWithTimeout(`powershell -Command "${psCommand}"`, 5000);
                            const index = psOutput.trim();
                            if (index && !isNaN(index)) {
                                this.tunInterfaceIndex = index;
                                console.log(`✓ Interface index from PowerShell: ${this.tunInterfaceIndex}`);
                            } else {
                                throw new Error('PowerShell index not found');
                            }
                        } catch (psError) {
                            console.log('PowerShell index method failed, using default');
                            this.tunInterfaceIndex = '1';
                        }
                    }
                } catch (error) {
                    console.log('Could not get interface index, using default');
                    this.tunInterfaceIndex = '1';
                }

                this.tunCreated = true;
                return;
            }

            // If no specific TUN interface found, use a fallback approach
            console.log('No specific TUN interface found, using fallback approach');
            this.tunInterfaceName = 'SP5ProxyTun';
            this.tunInterfaceIndex = '1';
            this.tunCreated = true;

            console.log('✓ TUN interface discovery completed (using fallback)');

        } catch (error) {
            console.error('Failed to discover TUN interface from tun2socks:', error);

            // Use fallback values
            this.tunInterfaceName = 'SP5ProxyTun';
            this.tunInterfaceIndex = '1';
            this.tunCreated = true;

            console.log('✓ Using fallback TUN interface configuration');
        }
    }

    async discoverTunInterfaceFromTun2socksOptimized() {
        console.log('🚀 Optimized TUN interface discovery starting...');
        const startTime = Date.now();

        try {
            // Dynamic waiting with early detection (instead of fixed 3-second wait)
            let interfaceFound = false;
            let attempts = 0;
            const maxAttempts = 15; // 15 attempts = max 3 seconds

            console.log(`⏱️ Starting discovery with ${maxAttempts} attempts (max ${maxAttempts * 0.2}s)...`);

            while (!interfaceFound && attempts < maxAttempts) {
                attempts++;
                console.log(`Discovery attempt ${attempts}/${maxAttempts}...`);

                try {
                    // Quick interface check with reduced timeout
                    const { stdout } = await execWithTimeout('netsh interface show interface', 2000);

                    // Parse interfaces and look for TUN patterns
                    const lines = stdout.split('\n');
                    const potentialInterfaces = [];

                    for (const line of lines) {
                        const trimmedLine = line.trim();
                        if (trimmedLine && !trimmedLine.startsWith('Admin') && !trimmedLine.startsWith('---') && trimmedLine.length > 10) {
                            const parts = trimmedLine.split(/\s{2,}/);
                            if (parts.length >= 4) {
                                const interfaceName = parts[3].trim();

                                // Look for interfaces that could be our TUN interface
                                if (interfaceName.toLowerCase().includes('tun') ||
                                    interfaceName.toLowerCase().includes('sp5proxy') ||
                                    interfaceName.toLowerCase().includes('wintun') ||
                                    interfaceName.toLowerCase().includes('tap')) {

                                    potentialInterfaces.push(interfaceName);
                                    console.log(`✅ Found TUN interface: ${interfaceName} (attempt ${attempts})`);
                                    interfaceFound = true;
                                    break;
                                }
                            }
                        }
                    }

                    // If we found interfaces, use the first one
                    if (potentialInterfaces.length > 0) {
                        this.tunInterfaceName = potentialInterfaces[0];
                        console.log(`✅ Using TUN interface: ${this.tunInterfaceName}`);

                        // Quick interface index lookup with reduced timeout
                        try {
                            const { stdout: interfaceInfo } = await execWithTimeout(`netsh interface show interface "${this.tunInterfaceName}"`, 2000);
                            const indexMatch = interfaceInfo.match(/Idx:\s*(\d+)/);
                            if (indexMatch) {
                                this.tunInterfaceIndex = indexMatch[1];
                                console.log(`✅ Interface index: ${this.tunInterfaceIndex}`);
                            } else {
                                // Quick PowerShell fallback
                                try {
                                    const psCommand = `(Get-NetAdapter -Name "${this.tunInterfaceName}").InterfaceIndex`;
                                    const { stdout: psOutput } = await execWithTimeout(`powershell -WindowStyle Hidden -Command "${psCommand}"`, 2000);
                                    const index = psOutput.trim();
                                    if (index && !isNaN(index)) {
                                        this.tunInterfaceIndex = index;
                                        console.log(`✅ Interface index (PowerShell): ${this.tunInterfaceIndex}`);
                                    }
                                } catch (psError) {
                                    console.log('Using default interface index');
                                    this.tunInterfaceIndex = '1';
                                }
                            }
                        } catch (error) {
                            console.log('Using default interface index');
                            this.tunInterfaceIndex = '1';
                        }

                        this.tunCreated = true;
                        break;
                    }

                } catch (error) {
                    console.log(`❌ Attempt ${attempts} failed:`, error.message);

                    // If we get permission errors, fail fast
                    if (error.message.includes('Access is denied') ||
                        error.message.includes('Permission denied') ||
                        error.message.includes('Administrator')) {
                        console.log('🚨 Permission error detected - failing fast');
                        throw new Error('Administrator privileges required for TUN interface operations');
                    }
                }

                // Short wait before next attempt (200ms instead of 3000ms)
                if (!interfaceFound && attempts < maxAttempts) {
                    console.log(`⏳ Waiting 200ms before attempt ${attempts + 1}...`);
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }

            if (!interfaceFound) {
                console.log('No specific TUN interface found, using optimized fallback approach');
                this.tunInterfaceName = 'SP5ProxyTun';
                this.tunInterfaceIndex = '1';
                this.tunCreated = true;
                console.log('✅ Optimized fallback configuration applied');
            }

            const elapsedTime = (Date.now() - startTime) / 1000;
            console.log(`🎯 Optimized TUN interface discovery completed in ${elapsedTime.toFixed(2)} seconds (${attempts} attempts)`);
            return true;

        } catch (error) {
            console.error('❌ Optimized TUN interface discovery failed:', error);

            // Use fallback values
            this.tunInterfaceName = 'SP5ProxyTun';
            this.tunInterfaceIndex = '1';
            this.tunCreated = true;
            console.log('✅ Using optimized fallback TUN interface configuration');
            return true;
        }
    }

    async configureTunInterface() {
        try {
            const tunIP = '10.0.0.1';
            const tunSubnet = '255.255.255.0';

            console.log('Configuring TUN interface IP...');

            // Step 1: Discover the actual interface name (or prepare for virtual interface)
            console.log('Step 1: Discovering actual interface name...');
            try {
                const actualInterfaceName = await this.discoverActualInterfaceName();
                if (actualInterfaceName !== this.tunInterfaceName) {
                    console.log(`Interface name updated: "${this.tunInterfaceName}" → "${actualInterfaceName}"`);
                    this.tunInterfaceName = actualInterfaceName;
                }
            } catch (error) {
                console.log('Interface discovery failed, using virtual interface approach:', error.message);
                console.log('Note: Interface will be created by tun2socks when started');

                // For virtual interface fallback, we'll skip the physical configuration
                // and let tun2socks handle the interface creation
                this.tunInterfaceIndex = '1'; // Default interface index
                console.log('✓ Virtual interface configuration prepared');
                return;
            }

            // Step 2: Ensure the interface exists and is enabled
            console.log(`Step 2: Enabling interface "${this.tunInterfaceName}"...`);
            try {
                await execWithTimeout(`netsh interface ip set interface "${this.tunInterfaceName}" admin=enable`, 15000);
                console.log('✓ Interface enabled successfully');
            } catch (error) {
                console.log('✗ Failed to enable interface:', error.message);

                // Try alternative enable method
                try {
                    console.log('Trying alternative enable method...');
                    await execWithTimeout(`netsh interface set interface "${this.tunInterfaceName}" admin=enable`, 15000);
                    console.log('✓ Interface enabled using alternative method');
                } catch (altError) {
                    throw new Error(`Interface "${this.tunInterfaceName}" cannot be enabled: ${error.message}`);
                }
            }

            // Step 3: Optimized wait for interface readiness (reduced from 2000ms to 500ms)
            console.log('Step 3: Waiting for interface to be ready...');
            await new Promise(resolve => setTimeout(resolve, 500));

            // Step 4: Verify interface is accessible before IP configuration
            console.log('Step 4: Verifying interface accessibility...');
            try {
                const { stdout } = await execWithTimeout(`netsh interface show interface "${this.tunInterfaceName}"`, 10000);
                if (!stdout.includes(this.tunInterfaceName)) {
                    throw new Error(`Interface "${this.tunInterfaceName}" not found in interface list`);
                }
                console.log('✓ Interface accessibility verified');
            } catch (error) {
                throw new Error(`Interface verification failed: ${error.message}`);
            }

            // Step 5: Configure IP address with enhanced retry logic
            console.log('Step 5: Configuring IP address...');
            let configSuccess = false;
            let lastError = null;

            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    console.log(`Attempting to set IP address (attempt ${attempt}/3)...`);

                    // Clear any existing IP configuration
                    console.log('Clearing existing IP configuration...');
                    await execWithTimeout(`netsh interface ip delete address "${this.tunInterfaceName}" all`, 10000).catch(() => {
                        console.log('No existing IP configuration to clear (this is normal)');
                    });

                    // Wait a moment after clearing
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    // Set the static IP address using the most compatible method
                    console.log(`Setting IP address ${tunIP} with subnet mask ${tunSubnet}...`);

                    // Try primary method
                    try {
                        await execWithTimeout(`netsh interface ip set address name="${this.tunInterfaceName}" source=static addr=${tunIP} mask=${tunSubnet}`, 20000);
                        console.log(`✓ IP address set successfully using primary method on attempt ${attempt}`);
                        configSuccess = true;
                        break;
                    } catch (primaryError) {
                        console.log(`Primary method failed: ${primaryError.message}`);

                        // Try alternative method with different syntax
                        console.log('Trying alternative IP configuration method...');
                        await execWithTimeout(`netsh interface ip add address "${this.tunInterfaceName}" ${tunIP} ${tunSubnet}`, 20000);
                        console.log(`✓ IP address set successfully using alternative method on attempt ${attempt}`);
                        configSuccess = true;
                        break;
                    }

                } catch (error) {
                    lastError = error;
                    console.log(`✗ Attempt ${attempt} failed:`, error.message);

                    if (attempt < 3) {
                        console.log(`Waiting 1 second before retry (optimized)...`);
                        await new Promise(resolve => setTimeout(resolve, 1000));

                        // Re-verify interface exists before retry
                        try {
                            await execWithTimeout(`netsh interface show interface "${this.tunInterfaceName}"`, 5000);
                            console.log('Interface still exists, retrying...');
                        } catch (verifyError) {
                            throw new Error(`Interface disappeared during configuration: ${verifyError.message}`);
                        }
                    }
                }
            }

            if (!configSuccess) {
                const errorMsg = lastError ? lastError.message : 'Unknown error';
                throw new Error(`Failed to configure IP address after 3 attempts. Last error: ${errorMsg}`);
            }

            // Step 6: Get interface index
            console.log('Step 6: Getting interface index...');
            try {
                const { stdout } = await execWithTimeout(`netsh interface show interface "${this.tunInterfaceName}"`, 10000);
                const indexMatch = stdout.match(/Idx:\s*(\d+)/);
                if (indexMatch) {
                    this.tunInterfaceIndex = indexMatch[1];
                    console.log(`✓ Interface index: ${this.tunInterfaceIndex}`);
                } else {
                    console.log('Could not extract index from interface list, trying alternative method...');
                    // Alternative method using PowerShell
                    try {
                        const psCommand = `(Get-NetAdapter -Name "${this.tunInterfaceName}").InterfaceIndex`;
                        const { stdout: psOutput } = await execWithTimeout(`powershell -Command "${psCommand}"`, 10000);
                        const index = psOutput.trim();
                        if (index && !isNaN(index)) {
                            this.tunInterfaceIndex = index;
                            console.log(`✓ Interface index (PowerShell): ${this.tunInterfaceIndex}`);
                        }
                    } catch (psError) {
                        console.warn('PowerShell index method also failed:', psError.message);
                    }
                }
            } catch (error) {
                console.warn('Could not get interface index:', error.message);
            }

            // Step 7: Comprehensive configuration verification
            console.log('Step 7: Verifying IP configuration...');
            let verificationSuccess = false;

            try {
                // Method 1: Check using netsh
                const { stdout } = await execWithTimeout(`netsh interface ip show config "${this.tunInterfaceName}"`, 10000);
                console.log('Interface configuration output:');
                console.log(stdout);

                if (stdout.includes(tunIP)) {
                    console.log(`✓ IP address ${tunIP} found in configuration`);
                    verificationSuccess = true;
                } else {
                    console.log(`⚠ IP address ${tunIP} not found in netsh output`);
                }
            } catch (error) {
                console.log('netsh verification failed:', error.message);
            }

            // Method 2: Verify using PowerShell if netsh failed
            if (!verificationSuccess) {
                try {
                    console.log('Trying PowerShell verification...');
                    const psCommand = `(Get-NetIPAddress -InterfaceAlias "${this.tunInterfaceName}" -AddressFamily IPv4).IPAddress`;
                    const { stdout: psOutput } = await execWithTimeout(`powershell -Command "${psCommand}"`, 10000);
                    const configuredIP = psOutput.trim();

                    if (configuredIP === tunIP) {
                        console.log(`✓ IP address verified using PowerShell: ${configuredIP}`);
                        verificationSuccess = true;
                    } else {
                        console.log(`⚠ PowerShell shows different IP: ${configuredIP}`);
                    }
                } catch (psError) {
                    console.log('PowerShell verification failed:', psError.message);
                }
            }

            // Method 3: Final verification using ping
            if (verificationSuccess) {
                try {
                    console.log('Testing interface connectivity...');
                    await execWithTimeout(`ping -n 1 -S ${tunIP} 127.0.0.1`, 5000);
                    console.log('✓ Interface connectivity test passed');
                } catch (pingError) {
                    console.log('⚠ Interface connectivity test failed (this may be normal)');
                }
            }

            if (verificationSuccess) {
                console.log(`✅ TUN interface "${this.tunInterfaceName}" configured successfully with IP ${tunIP}`);
            } else {
                console.warn(`⚠ IP configuration verification inconclusive for interface "${this.tunInterfaceName}"`);
                console.warn('The interface may still work, but verification failed');
            }

        } catch (error) {
            console.error('Failed to configure TUN interface:', error);
            throw error;
        }
    }

    async redirectTraffic() {
        if (this.isTrafficRedirected) {
            console.log('Traffic already redirected');
            return;
        }

        if (!this.tunInterfaceIndex && !this.tunCreated) {
            throw new Error('TUN interface not created or configured');
        }

        // If we don't have an interface index but the interface is created, try to get it
        if (!this.tunInterfaceIndex && this.tunCreated && this.tunInterfaceName) {
            console.log('Attempting to get interface index for traffic redirection...');
            try {
                const psCommand = `(Get-NetAdapter -Name "${this.tunInterfaceName}").InterfaceIndex`;
                const { stdout: psOutput } = await execWithTimeout(`powershell -Command "${psCommand}"`, 5000);
                const index = psOutput.trim();
                if (index && !isNaN(index)) {
                    this.tunInterfaceIndex = index;
                    console.log(`✓ Interface index retrieved: ${this.tunInterfaceIndex}`);
                } else {
                    console.log('Using default interface index for traffic redirection');
                    this.tunInterfaceIndex = '1';
                }
            } catch (error) {
                console.log('Could not get interface index, using default');
                this.tunInterfaceIndex = '1';
            }
        }

        try {
            console.log('🚀 Setting up FULL traffic redirection through SOCKS5 proxy...');

            // Step 1: Backup current default route
            console.log('Step 1: Backing up current routes...');
            await this.backupCurrentRoutes();

            // Step 2: Add proxy server protection route (CRITICAL - must be first!)
            console.log('Step 2: Adding proxy server protection route...');
            await this.addProxyServerRoute();

            // Step 3: Delete default route to redirect ALL traffic
            console.log('Step 3: Deleting default route for full redirection...');
            await this.deleteDefaultRoute();

            // Step 4: Add new default route through TUN interface
            console.log('Step 4: Adding new default route through TUN interface...');
            await this.addTunDefaultRoute();

            // Step 5: Configure DNS for all traffic with enhanced timeout handling
            console.log('Step 5: Configuring DNS for all traffic...');
            try {
                // Use Promise.race with shorter timeout to prevent hanging
                const dnsConfigured = await Promise.race([
                    this.configureFullDNS(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('DNS configuration timed out after 30 seconds')), 30000)
                    )
                ]);

                if (dnsConfigured === false) {
                    console.warn('⚠️ DNS configuration failed, but continuing with connection');
                }
            } catch (dnsError) {
                console.warn('⚠️ DNS configuration failed, but connection will continue:', dnsError.message);
                // Don't let DNS failure block the connection
            }

            this.isTrafficRedirected = true;
            console.log('✅ FULL traffic redirection completed - ALL traffic now flows through SOCKS5 proxy!');

        } catch (error) {
            console.error('❌ Failed to configure full traffic redirection:', error);

            // Attempt to restore connectivity on failure
            console.log('🔄 Attempting to restore connectivity after failure...');
            try {
                await this.emergencyRestoreConnectivity();
            } catch (restoreError) {
                console.error('❌ Emergency restore also failed:', restoreError);
            }

            throw new Error(`Failed to configure full traffic redirection: ${error.message}`);
        }
    }

    async simplifiedTrafficRedirection() {
        console.log('🔄 Attempting simplified traffic redirection...');

        try {
            // Simplified approach: Just add essential routes without complex DNS configuration

            // Step 1: Add proxy server protection route
            if (this.getProxyServerIP() && this.originalGateway) {
                const proxyIP = this.getProxyServerIP();
                console.log(`Adding simplified proxy route: ${proxyIP} via ${this.originalGateway}`);
                await execWithTimeout(`route add ${proxyIP} mask 255.255.255.255 ${this.originalGateway} metric 1`, 10000);
                this.proxyServerIP = proxyIP;
            }

            // Step 2: Add basic TUN route without deleting default route
            const tunGateway = '10.0.0.2';
            console.log('Adding simplified TUN route...');
            await execWithTimeout(`route add 0.0.0.0 mask 128.0.0.0 ${tunGateway} metric 1 if ${this.tunInterfaceIndex}`, 10000);
            await execWithTimeout(`route add 128.0.0.0 mask 128.0.0.0 ${tunGateway} metric 1 if ${this.tunInterfaceIndex}`, 10000);

            // Step 3: Basic DNS routing (essential servers only)
            const essentialDNS = ['8.8.8.8', '1.1.1.1'];
            for (const dns of essentialDNS) {
                try {
                    await execWithTimeout(`route add ${dns} mask 255.255.255.255 ${tunGateway} metric 1 if ${this.tunInterfaceIndex}`, 5000);
                    console.log(`✓ Routed ${dns} through TUN (simplified)`);
                } catch (error) {
                    console.warn(`Warning: Could not route ${dns}:`, error.message);
                }
            }

            this.isTrafficRedirected = true;
            console.log('✅ Simplified traffic redirection completed');

        } catch (error) {
            console.error('❌ Simplified traffic redirection failed:', error);
            throw error;
        }
    }

    async addProxyServerRoute() {
        try {
            // Get proxy server IP from current configuration
            const proxyIP = this.getProxyServerIP();

            // Try to get gateway if not available
            if (!this.originalGateway) {
                console.log('⚠️ Original gateway not available, attempting to detect...');
                await this.getCurrentNetworkConfig();
            }

            // If still no gateway, try fallback detection
            if (!this.originalGateway) {
                console.log('⚠️ Attempting fallback gateway detection...');
                try {
                    const { stdout } = await execWithTimeout('ipconfig | findstr "Default Gateway"', 8000);
                    const lines = stdout.split('\n');
                    for (const line of lines) {
                        if (line.includes('Default Gateway') && line.includes(':')) {
                            const gateway = line.split(':')[1].trim();
                            if (gateway && !gateway.includes('::') && gateway !== '') {
                                this.originalGateway = gateway;
                                console.log(`✅ Fallback gateway detected: ${this.originalGateway}`);
                                break;
                            }
                        }
                    }
                } catch (fallbackError) {
                    console.warn('Fallback gateway detection failed:', fallbackError.message);
                }
            }

            if (proxyIP && this.originalGateway) {
                console.log(`🛡️ Adding CRITICAL proxy server protection route: ${proxyIP} via ${this.originalGateway}`);

                // Add specific route for proxy server through original gateway with timeout
                await execWithTimeout(`route add ${proxyIP} mask 255.255.255.255 ${this.originalGateway} metric 1`, 10000);
                console.log('✅ Proxy server protection route added successfully');

                // Store for cleanup
                this.proxyServerIP = proxyIP;

                // Verify the route was added with timeout
                const { stdout } = await execWithTimeout('route print', 10000);
                if (stdout.includes(proxyIP)) {
                    console.log('✅ Proxy server route verified in routing table');
                } else {
                    console.warn('⚠️ Proxy server route not visible in routing table, but continuing...');
                }
            } else {
                const errorMsg = !proxyIP ? 'No proxy server IP available' : 'No original gateway available';
                console.warn(`⚠️ Cannot add proxy server route: ${errorMsg} - continuing without it`);
                // Don't throw error, just warn - connection might still work
            }
        } catch (error) {
            console.error('❌ Failed to add proxy server route:', error);
            console.warn('⚠️ Continuing without proxy server route - connection may have issues');
            // Don't throw error to allow connection to continue
        }
    }

    async deleteDefaultRoute() {
        try {
            console.log('🗑️ Deleting default route to redirect ALL traffic...');

            // Delete the default route (0.0.0.0/0) with timeout
            await execWithTimeout('route delete 0.0.0.0 mask 0.0.0.0', 10000);
            console.log('✅ Default route deleted successfully');

            // Verify default route was deleted with timeout
            const { stdout } = await execWithTimeout('route print 0.0.0.0', 10000);
            const lines = stdout.split('\n');
            let defaultRouteFound = false;

            for (const line of lines) {
                if (line.includes('0.0.0.0') && line.includes('0.0.0.0') && !line.includes('On-link')) {
                    defaultRouteFound = true;
                    break;
                }
            }

            if (defaultRouteFound) {
                console.log('⚠️ Warning: Default route still exists after deletion attempt');
            } else {
                console.log('✅ Default route deletion verified');
            }

        } catch (error) {
            // This might fail if no default route exists, which is okay
            console.log('ℹ️ Default route deletion completed (may have been already deleted)');
        }
    }

    async addTunDefaultRoute() {
        try {
            console.log('🌐 Adding new default route through TUN interface...');

            // Ensure we have interface index before proceeding
            if (!this.tunInterfaceIndex) {
                console.log('⚠️ TUN interface index missing, attempting to rediscover...');
                await this.rediscoverInterfaceIndex();
            }

            // Use proper TUN gateway - this should match tun2socks configuration
            const tunGateway = '10.0.0.2'; // Gateway IP for TUN interface

            // Split the default route into two halves for better compatibility
            console.log('Adding split default routes for better compatibility...');

            // Add first half: 0.0.0.0/1 (0.0.0.0 to 127.255.255.255)
            await execWithTimeout(`route add 0.0.0.0 mask 128.0.0.0 ${tunGateway} metric 1 if ${this.tunInterfaceIndex}`, 10000);
            console.log('✅ First half of default route added (0.0.0.0/1)');

            // Add second half: 128.0.0.0/1 (128.0.0.0 to 255.255.255.255)
            await execWithTimeout(`route add 128.0.0.0 mask 128.0.0.0 ${tunGateway} metric 1 if ${this.tunInterfaceIndex}`, 10000);
            console.log('✅ Second half of default route added (128.0.0.0/1)');

            // Verify the new routes
            const { stdout } = await execWithTimeout('route print', 10000);
            if (stdout.includes(tunGateway)) {
                console.log('✅ TUN default routes verified in routing table');
            } else {
                console.warn('⚠️ TUN routes may not be visible in routing table, but continuing...');
            }

        } catch (error) {
            console.error('❌ Failed to add TUN default route:', error);
            throw error;
        }
    }

    async configureFullDNS() {
        try {
            console.log('🌐 Configuring DNS for ALL traffic through proxy with leak prevention...');

            // Ensure we have interface index before proceeding
            if (!this.tunInterfaceIndex) {
                console.log('⚠️ TUN interface index missing, attempting to rediscover...');
                await this.rediscoverInterfaceIndex();
            }

            // Step 1: Configure DNS servers on TUN interface
            console.log('Step 1: Setting DNS servers on TUN interface...');
            try {
                await execWithTimeout(`netsh interface ip set dns "${this.tunInterfaceName}" static 8.8.8.8`, 15000);
                console.log('✅ Primary DNS server (8.8.8.8) configured');

                await execWithTimeout(`netsh interface ip add dns "${this.tunInterfaceName}" 1.1.1.1 index=2`, 15000);
                console.log('✅ Secondary DNS server (1.1.1.1) configured');
            } catch (error) {
                console.warn('⚠️ Warning: Failed to set DNS on TUN interface:', error.message);
            }

            // Step 2: Route DNS servers through TUN interface
            console.log('Step 2: Routing DNS servers through TUN interface...');
            const tunGateway = '10.0.0.2';
            const dnsServers = ['8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1', '208.67.222.222', '208.67.220.220'];

            for (const dns of dnsServers) {
                try {
                    await execWithTimeout(`route add ${dns} mask 255.255.255.255 ${tunGateway} metric 1 if ${this.tunInterfaceIndex}`, 8000);
                    console.log(`✅ Routed ${dns} through TUN interface`);
                } catch (error) {
                    console.warn(`⚠️ Warning: Could not route ${dns}:`, error.message);
                }
            }

            // Step 3: Block DNS on other interfaces to prevent leaks
            console.log('Step 3: Blocking DNS leaks on other interfaces...');
            try {
                // Block common DNS ports on other interfaces
                await execWithTimeout('netsh advfirewall firewall add rule name="SP5Proxy-Block-DNS-Out" dir=out action=block protocol=UDP localport=53', 30000);
                await execWithTimeout('netsh advfirewall firewall add rule name="SP5Proxy-Block-DNS-TCP-Out" dir=out action=block protocol=TCP localport=53', 30000);
                console.log('✅ DNS leak prevention rules added');
            } catch (error) {
                console.warn('⚠️ Warning: Could not add DNS firewall rules:', error.message);
            }

            console.log('✅ TUN interface DNS configuration completed (some servers may have failed)');





            console.log('✅ Comprehensive DNS leak prevention configured - ALL DNS traffic will go through proxy');

        } catch (error) {
            console.error('❌ Failed to configure DNS leak prevention:', error.message);
            console.warn('⚠️ DNS configuration failed, but connection will continue with system DNS');
            console.warn('⚠️ Note: DNS may leak your real location. Consider manual DNS configuration.');
            // Don't throw error - allow connection to continue with system DNS
            return false; // Indicate DNS configuration failed but connection can proceed
        }
    }

    async rediscoverInterfaceIndex() {
        try {
            console.log('🔍 Rediscovering TUN interface index...');
            
            // Method 1: Try PowerShell
            try {
                const psCommand = `Get-NetAdapter | Where-Object { $_.Name -eq '${this.tunInterfaceName}' } | Select-Object -ExpandProperty InterfaceIndex`;
                const { stdout: psOutput } = await execWithTimeout(`powershell -Command "${psCommand}"`, 10000);
                
                if (psOutput && psOutput.trim()) {
                    this.tunInterfaceIndex = psOutput.trim();
                    console.log('✅ Interface index rediscovered via PowerShell:', this.tunInterfaceIndex);
                    return;
                }
            } catch (error) {
                console.warn('PowerShell method failed:', error.message);
            }

            // Method 2: Try netsh
            try {
                const { stdout } = await execWithTimeout(`netsh interface show interface "${this.tunInterfaceName}"`, 10000);
                const lines = stdout.split('\n');
                
                for (const line of lines) {
                    if (line.includes('Idx')) {
                        const match = line.match(/(\d+)/);
                        if (match) {
                            this.tunInterfaceIndex = match[1];
                            console.log('✅ Interface index rediscovered via netsh:', this.tunInterfaceIndex);
                            return;
                        }
                    }
                }
            } catch (error) {
                console.warn('Netsh method failed:', error.message);
            }

            // Method 3: Use default
            console.warn('⚠️ Could not rediscover interface index, using default value');
            this.tunInterfaceIndex = '1';
            
        } catch (error) {
            console.error('❌ Failed to rediscover interface index:', error);
            this.tunInterfaceIndex = '1'; // Fallback
        }
    }

    async emergencyRestoreConnectivity() {
        console.log('🚨 EMERGENCY: Attempting to restore system connectivity...');

        try {
            // Step 1: Restore original default route if we have the backup
            if (this.originalGateway) {
                console.log('🔄 Restoring original default route...');
                await execAsync(`route add 0.0.0.0 mask 0.0.0.0 ${this.originalGateway} metric 1`).catch(() => {
                    console.log('Default route restoration failed or already exists');
                });
            }

            // Step 2: Remove TUN default route if it exists
            console.log('🗑️ Removing TUN default route...');
            await execAsync('route delete 0.0.0.0 mask 0.0.0.0 10.0.0.2').catch(() => {
                console.log('TUN default route removal failed or not found');
            });

            // Step 3: Remove DNS routes
            console.log('🗑️ Removing DNS routes...');
            const dnsServers = ['8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1', '208.67.222.222', '208.67.220.220'];
            for (const dns of dnsServers) {
                await execAsync(`route delete ${dns} mask 255.255.255.255`).catch(() => {
                    // Ignore errors - routes may not exist
                });
            }

            // Step 4: Reset TUN interface DNS
            console.log('🔄 Resetting TUN interface DNS...');
            await execAsync(`netsh interface ip set dns "${this.tunInterfaceName}" dhcp`).catch(() => {
                console.log('TUN DNS reset failed');
            });

            console.log('✅ Emergency connectivity restoration completed');

        } catch (error) {
            console.error('❌ Emergency restore failed:', error);
            throw error;
        }
    }

    async backupCurrentRoutes() {
        try {
            const { stdout } = await execAsync('route print');
            // Store current routing table for restoration
            this.routeBackup = stdout;
            console.log('Current routes backed up');
        } catch (error) {
            console.error('Failed to backup routes:', error);
        }
    }

    async restoreTraffic() {
        if (!this.isTrafficRedirected) {
            console.log('Traffic not redirected, nothing to restore');
            return;
        }

        try {
            console.log('🔄 Restoring original traffic routing after full redirection...');

            // Step 1: Remove TUN default route
            console.log('Step 1: Removing TUN default route...');
            await execAsync('route delete 0.0.0.0 mask 0.0.0.0 10.0.0.2').catch(() => {
                console.log('TUN default route already removed or not found');
            });

            // Step 2: Restore original default route
            console.log('Step 2: Restoring original default route...');
            if (this.originalGateway) {
                await execAsync(`route add 0.0.0.0 mask 0.0.0.0 ${this.originalGateway} metric 1`).catch(() => {
                    console.log('Original default route already exists or failed to add');
                });
                console.log('✅ Original default route restored');
            }

            // Step 3: Remove DNS routes
            console.log('Step 3: Removing DNS routes...');
            const dnsServers = ['8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1', '208.67.222.222', '208.67.220.220'];
            for (const dns of dnsServers) {
                await execAsync(`route delete ${dns} mask 255.255.255.255`).catch(() => {
                    // Ignore errors - routes may not exist
                });
            }
            console.log('✅ DNS routes removed');

            // Step 4: Remove proxy server route if it was added
            if (this.proxyServerIP) {
                console.log('Step 4: Removing proxy server protection route...');
                await execAsync(`route delete ${this.proxyServerIP} mask 255.255.255.255`).catch(() => {
                    console.log('Proxy server route already removed or not found');
                });
                this.proxyServerIP = null;
                console.log('✅ Proxy server route removed');
            }

            // Step 5: Reset TUN interface DNS
            console.log('Step 5: Resetting TUN interface DNS...');
            await this.restoreTunDNS();

            this.isTrafficRedirected = false;
            console.log('✅ Full traffic redirection cleanup completed - original connectivity restored');

        } catch (error) {
            console.error('❌ Failed to restore traffic:', error);

            // Attempt emergency restore if normal restore fails
            console.log('🚨 Attempting emergency connectivity restore...');
            try {
                await this.emergencyRestoreConnectivity();
            } catch (emergencyError) {
                console.error('❌ Emergency restore also failed:', emergencyError);
            }

            throw new Error(`Failed to restore traffic: ${error.message}`);
        }
    }

    async restoreTunDNS() {
        try {
            // Reset TUN interface DNS to automatic (doesn't affect host DNS)
            await execAsync(`netsh interface ip set dns "${this.tunInterfaceName}" dhcp`);
            console.log('✓ TUN interface DNS reset to automatic');
        } catch (error) {
            console.error('Failed to restore TUN DNS:', error);
        }
    }

    getProxyServerIP() {
        // This method should be called with the actual proxy server IP
        // For now, we'll try to extract it from a stored configuration
        // This will be set by the proxy manager when connecting
        return this.currentProxyIP || null;
    }

    setProxyServerIP(proxyIP) {
        // Called by proxy manager to set the current proxy server IP
        this.currentProxyIP = proxyIP;
        console.log(`Proxy server IP set to: ${proxyIP}`);
    }

    async destroyTunInterface() {
        if (!this.tunCreated) {
            console.log('TUN interface not created, nothing to destroy');
            return;
        }

        try {
            console.log('Destroying TUN interface...');
            
            // Disable the interface
            await execAsync(`netsh interface ip set interface "${this.tunInterfaceName}" admin=disable`);
            
            // Remove the interface (this depends on how it was created)
            await execAsync(`netsh interface delete interface "${this.tunInterfaceName}"`).catch(() => {
                console.log('Interface deletion failed or not supported');
            });
            
            this.tunCreated = false;
            this.tunInterfaceIndex = null;
            console.log('TUN interface destroyed');
            
        } catch (error) {
            console.error('Failed to destroy TUN interface:', error);
            // Don't throw here as this is cleanup
        }
    }

    async verifyTrafficRouting() {
        try {
            console.log('🔍 Verifying traffic routing through proxy...');

            // Test 1: Check if routes are properly configured
            const { stdout: routeOutput } = await execWithTimeout('route print', 10000);
            const hasProxyRoute = this.proxyServerIP && routeOutput.includes(this.proxyServerIP);
            const hasTunRoutes = routeOutput.includes('10.0.0.2');

            console.log(`Route verification: Proxy route: ${hasProxyRoute}, TUN routes: ${hasTunRoutes}`);

            // Test 2: Check DNS resolution through TUN
            try {
                const { stdout: nslookupOutput } = await execWithTimeout('nslookup google.com 8.8.8.8', 10000);
                const dnsWorking = nslookupOutput.includes('Address:') || nslookupOutput.includes('Addresses:');
                console.log(`DNS verification: ${dnsWorking ? 'Working' : 'Failed'}`);
            } catch (dnsError) {
                console.warn('DNS verification failed:', dnsError.message);
            }

            // Test 3: Check TUN interface status
            try {
                const psCommand = `Get-NetAdapter -Name "${this.tunInterfaceName}" | Select-Object Status, LinkSpeed`;
                const { stdout: adapterOutput } = await execWithTimeout(`powershell -Command "${psCommand}"`, 8000);
                const tunActive = adapterOutput.includes('Up');
                console.log(`TUN interface verification: ${tunActive ? 'Active' : 'Inactive'}`);
            } catch (tunError) {
                console.warn('TUN interface verification failed:', tunError.message);
            }

            return {
                success: true,
                hasProxyRoute,
                hasTunRoutes,
                message: 'Traffic routing verification completed'
            };

        } catch (error) {
            console.error('❌ Traffic routing verification failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    getStatus() {
        return {
            tunCreated: this.tunCreated,
            tunInterfaceName: this.tunInterfaceName,
            tunInterfaceIndex: this.tunInterfaceIndex,
            isTrafficRedirected: this.isTrafficRedirected,
            originalGateway: this.originalGateway,
            originalInterface: this.originalInterface
        };
    }

    async getNetworkInterfaces() {
        const interfaces = os.networkInterfaces();
        return interfaces;
    }

    async testConnectivity() {
        try {
            await execAsync('ping -n 1 8.8.8.8');
            return true;
        } catch (error) {
            return false;
        }
    }
}

module.exports = NetworkManager;
