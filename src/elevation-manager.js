const { exec } = require('child_process');
const { promisify } = require('util');
const sudo = require('sudo-prompt');
const path = require('path');
const fs = require('fs');
const PowerShellProcessManager = require('./powershell-process-manager');

const execAsync = promisify(exec);

class ElevationManager {
    constructor() {
        this.isElevated = false;
        this.sudoOptions = {
            name: 'SP5Proxy Desktop',
            icns: path.join(__dirname, '..', 'assets', 'icon.icns'),
        };

        // Initialize PowerShell Process Manager for cleanup
        this.psManager = new PowerShellProcessManager();
        console.log('🧹 PowerShell Process Manager initialized for elevation operations');
    }

    async checkAdminRights() {
        try {
            console.log('🔍 Starting comprehensive admin rights verification...');
            
            // Priority 1: Check if we have high integrity level (most reliable for UAC)
            const hasHighIntegrity = await this.checkIntegrityLevel();
            console.log(`[1/5] High Integrity Level: ${hasHighIntegrity ? '✅ PASS' : '❌ FAIL'}`);
            
            // Priority 2: Check admin group membership  
            const hasAdminGroup = await this.checkAdminGroupMembership();
            console.log(`[2/5] Admin Group Membership: ${hasAdminGroup ? '✅ PASS' : '❌ FAIL'}`);
            
            // Priority 3: Check system access capabilities
            const hasSystemAccess = await this.checkSystemAccess();
            console.log(`[3/5] System Access Test: ${hasSystemAccess ? '✅ PASS' : '❌ FAIL'}`);
            
            // Priority 4: Check net session (reliable Windows admin check)
            const hasNetSessionAccess = await this.checkNetSessionAccess();
            console.log(`[4/5] Net Session Access: ${hasNetSessionAccess ? '✅ PASS' : '❌ FAIL'}`);
            
            // Priority 5: Check UAC status for context
            const uacStatus = await this.checkUACStatus();
            console.log(`[5/5] UAC Status: ${uacStatus}`);

            // Determine final admin status based on priority checks
            // HIGH INTEGRITY + at least one other check = FULL ADMIN
            if (hasHighIntegrity && (hasAdminGroup || hasSystemAccess || hasNetSessionAccess)) {
                console.log('✅ RESULT: Full Administrator Rights (High Integrity + Supporting Evidence)');
                this.isElevated = true;
                return true;
            }
            // HIGH INTEGRITY alone (in case other checks are restricted)
            else if (hasHighIntegrity) {
                console.log('✅ RESULT: Administrator Rights (High Integrity Confirmed)');
                this.isElevated = true;
                return true;
            }
            // ADMIN GROUP + SYSTEM ACCESS (but no high integrity = UAC filtered)
            else if (hasAdminGroup && hasSystemAccess) {
                console.log('⚠️  RESULT: Administrator with UAC Limited Token (Can be elevated)');
                this.isElevated = false;
                return 'limited-admin';
            }
            // ADMIN GROUP only (UAC scenario)
            else if (hasAdminGroup) {
                console.log('⚠️  RESULT: Administrator Group Member with Limited Token');
                this.isElevated = false;
                return 'limited-admin';
            }
            // NET SESSION ACCESS (sometimes works even without group membership)
            else if (hasNetSessionAccess) {
                console.log('⚠️  RESULT: Limited Administrator Access (Net Session Only)');
                this.isElevated = false;
                return 'limited-admin';
            }
            // No admin rights detected
            else {
                console.log('❌ RESULT: Standard User (No Administrator Rights)');
                this.isElevated = false;
                return false;
            }
        } catch (error) {
            console.log('❌ Admin check failed with error:', error.message);
            this.isElevated = false;
            return false;
        }
    }

    async checkAdminGroupMembership() {
        try {
            // Use PowerShell which is more reliable in Electron context
            const { stdout } = await execAsync('powershell -Command "([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"', { timeout: 5000 });
            console.log('PowerShell admin check output:', stdout.trim());
            const isAdmin = stdout.trim().toLowerCase() === 'true';
            console.log('Admin group membership result:', isAdmin);
            return isAdmin;
        } catch (error) {
            console.log('PowerShell admin check failed, trying whoami fallback:', error.message);
            
            // Fallback to whoami if PowerShell fails
            try {
                const { stdout } = await execAsync('whoami /groups', { timeout: 5000 });
                const hasAdminGroup = (stdout.includes('BUILTIN\\Administrators') || stdout.includes('BUILTIN\\\\Administrators')) && 
                                     !stdout.includes('Group used for deny only');
                console.log('Whoami fallback result:', hasAdminGroup);
                return hasAdminGroup;
            } catch (whoamiError) {
                console.log('Both PowerShell and whoami failed:', whoamiError.message);
                return false;
            }
        }
    }

    async checkIntegrityLevel() {
        try {
            // Use PowerShell to check integrity level - more reliable in Electron
            const { stdout } = await execAsync('powershell -Command "([Security.Principal.WindowsIdentity]::GetCurrent()).Groups | Where-Object {$_.Value -eq \'S-1-16-12288\'} | Measure-Object | Select-Object -ExpandProperty Count"', { timeout: 5000 });
            console.log('PowerShell integrity check output:', stdout.trim());
            const hasHighIntegrity = parseInt(stdout.trim()) > 0;
            console.log('High integrity level result:', hasHighIntegrity);
            return hasHighIntegrity;
        } catch (error) {
            console.log('PowerShell integrity check failed, trying whoami fallback:', error.message);
            
            // Fallback to whoami if PowerShell fails
            try {
                const { stdout } = await execAsync('whoami /groups', { timeout: 5000 });
                const hasHighIntegrity = stdout.includes('High Mandatory Level') || 
                                       stdout.includes('System Mandatory Level') ||
                                       stdout.includes('Mandatory Label\\High Mandatory Level');
                console.log('Whoami integrity fallback result:', hasHighIntegrity);
                return hasHighIntegrity;
            } catch (whoamiError) {
                console.log('Both PowerShell and whoami integrity checks failed:', whoamiError.message);
                return false;
            }
        }
    }

    async checkSystemAccess() {
        try {
            let passedTests = 0;
            const totalTests = 6;

            // Test 1: Try to access Windows temp directory (admin accessible)
            try {
                const fs = require('fs');
                const testPath = 'C:\\Windows\\Temp\\sp5proxy_admin_test.txt';
                fs.writeFileSync(testPath, 'test', { flag: 'w' });
                fs.unlinkSync(testPath);
                passedTests++;
            } catch (error) {
                console.log('  • Windows temp access: FAILED');
            }

            // Test 2: Try to query system services (requires admin)
            try {
                await execAsync('sc query Spooler', { timeout: 5000, stdio: 'pipe' });
                passedTests++;
            } catch (error) {
                console.log('  • Service query access: FAILED');
            }

            // Test 3: Try to access system registry (requires admin)
            try {
                await execAsync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion" /v ProgramFilesDir', { timeout: 5000, stdio: 'pipe' });
                passedTests++;
            } catch (error) {
                console.log('  • Registry access: FAILED');
            }

            // Test 4: Try to list network interfaces (requires admin for full access)
            try {
                await execAsync('netsh interface show interface', { timeout: 5000, stdio: 'pipe' });
                passedTests++;
            } catch (error) {
                console.log('  • Network interface access: FAILED');
            }

            // Test 5: Critical test - try to access network adapters (required for TUN interface)
            try {
                const result = await execAsync('powershell -Command "Get-NetAdapter -ErrorAction SilentlyContinue | Select-Object -First 1"', { timeout: 5000, stdio: 'pipe' });
                if (result.stdout && result.stdout.trim().length > 0) {
                    passedTests++;
                } else {
                    console.log('  • Network adapter access: FAILED - no output');
                }
            } catch (error) {
                console.log('  • Network adapter access: FAILED');
            }

            // Test 6: Try to access the Windows Driver Store (needed for WinTun)
            try {
                await execAsync('pnputil /enum-drivers', { timeout: 5000, stdio: 'pipe' });
                passedTests++;
            } catch (error) {
                console.log('  • Driver store access: FAILED');
            }

            const hasSystemAccess = passedTests >= 3; // Need at least 50% of tests to pass
            console.log(`  • System access tests: ${passedTests}/${totalTests} passed (${hasSystemAccess ? 'SUFFICIENT' : 'INSUFFICIENT'})`);
            
            return hasSystemAccess;
        } catch (error) {
            console.log('System access test failed:', error.message);
            return false;
        }
    }

    async checkNetSessionAccess() {
        try {
            // The 'net session' command is one of the most reliable ways to check for admin rights
            // It requires admin privileges to run successfully
            await execAsync('net session', { timeout: 5000, stdio: 'pipe' });
            return true;
        } catch (error) {
            // Check if it's an access denied error (expected for non-admin)
            const errorMsg = error.message || error.stderr || '';
            if (errorMsg.includes('Access is denied') || errorMsg.includes('System error 5')) {
                console.log('  • Net session: Access denied (not admin)');
                return false;
            } else if (errorMsg.includes('There are no entries in the list')) {
                // This actually means the command worked but no sessions exist - we have admin rights
                return true;
            } else {
                console.log(`  • Net session: Other error - ${errorMsg}`);
                return false;
            }
        }
    }

    async requestElevation() {
        if (this.isElevated) {
            return { success: true, alreadyElevated: true };
        }

        try {
            console.log('Requesting elevation...');
            
            // Get current process information
            const currentExe = process.execPath;
            const currentWorkingDir = process.cwd();
            const currentArgs = process.argv.slice(1);
            
            // Detect if we're running in development mode (through npm)
            const isNpmRun = process.env.npm_lifecycle_event || process.env.npm_config_user_config || process.env.npm_command;
            const isElectronDev = currentArgs.some(arg => arg.includes('main.js')) || currentExe.includes('electron');
            
            console.log(`Environment detection:
- npm_lifecycle_event: ${process.env.npm_lifecycle_event}
- npm_config_user_config: ${process.env.npm_config_user_config}
- currentExe: ${currentExe}
- currentArgs: ${currentArgs.join(' ')}
- isNpmRun: ${isNpmRun}
- isElectronDev: ${isElectronDev}`);
            
            if (isNpmRun || currentExe.includes('node_modules\\electron')) {
                // Development mode: restart npm process
                console.log('Development mode elevation detected - using npm restart');
                const npmCommand = `npm start`;
                return await this.executeElevationViaPowerShell(npmCommand, currentWorkingDir);
            } else {
                // Production mode: restart the executable
                console.log('Production mode elevation detected - using direct executable restart');
                const exeCommand = `"${currentExe}" ${currentArgs.map(arg => `"${arg}"`).join(' ')}`;
                return await this.executeElevationViaPowerShell(exeCommand, currentWorkingDir);
            }
            
        } catch (error) {
            console.error('Failed to request elevation:', error);
            return { success: false, error: error.message };
        }
    }

    async executeElevationViaPowerShell(command, workingDir) {
        try {
            console.log(`Executing elevation command: ${command}`);
            console.log(`Working directory: ${workingDir}`);
            
            // Create a more robust batch file with better error handling and visibility
            const batchContent = `@echo off
title SP5Proxy Desktop - Elevated Process
color 0A
echo.
echo ================================================================
echo                SP5Proxy Desktop - Elevated Mode
echo ================================================================
echo.
echo Starting SP5Proxy Desktop with administrator privileges...
echo Working directory: ${workingDir}
echo Command: ${command}
echo.

REM Change to the correct directory
cd /d "${workingDir}"

REM Check if we're in the right directory
if not exist "package.json" (
    echo ERROR: Could not find package.json in current directory
    echo Current directory: %CD%
    echo Expected directory: ${workingDir}
    echo.
    pause
    exit /b 1
)

REM Check if npm is available
where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ERROR: npm not found in PATH
    echo.
    echo Trying to find Node.js installation...
    if exist "C:\\Program Files\\nodejs\\npm.cmd" (
        echo Found npm at: C:\\Program Files\\nodejs\\npm.cmd
        set "PATH=C:\\Program Files\\nodejs;%PATH%"
    ) else if exist "C:\\Program Files (x86)\\nodejs\\npm.cmd" (
        echo Found npm at: C:\\Program Files (x86)\\nodejs\\npm.cmd
        set "PATH=C:\\Program Files (x86)\\nodejs;%PATH%"
    ) else (
        echo ERROR: Could not find Node.js installation
        echo Please install Node.js from https://nodejs.org/
        echo.
        pause
        exit /b 1
    )
)

echo npm found, starting application...
echo.

REM Execute the command
${command}

REM Check if the command succeeded
if %ERRORLEVEL% neq 0 (
    echo.
    echo ERROR: Application failed to start
    echo Exit code: %ERRORLEVEL%
    echo.
    echo Please check the error messages above.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo SP5Proxy Desktop elevated process completed.
echo.
pause`;
            
            // Write to temp batch file
            const fs = require('fs');
            const os = require('os');
            const tempBatchFile = path.join(os.tmpdir(), 'sp5proxy_elevation.bat');
            
            console.log(`Creating elevation batch file: ${tempBatchFile}`);
            fs.writeFileSync(tempBatchFile, batchContent);
            
            // Use PowerShell to run the batch file with elevation - don't wait for it to complete
            const elevationCommand = `powershell -Command "Start-Process -FilePath '${tempBatchFile}' -Verb RunAs"`;
            
            console.log(`Executing elevation command: ${elevationCommand}`);
            
            return new Promise((resolve, reject) => {
                const { exec } = require('child_process');
                
                exec(elevationCommand, { 
                    cwd: workingDir,
                    timeout: 15000  // Increased timeout
                }, (error, stdout, stderr) => {
                    if (error) {
                        console.error('PowerShell elevation failed:', error);
                        console.error('stderr:', stderr);
                        
                        // Don't clean up temp file immediately on error - let user see it
                        setTimeout(() => {
                            try {
                                fs.unlinkSync(tempBatchFile);
                            } catch (cleanupError) {
                                console.log('Could not clean up temp file:', cleanupError.message);
                            }
                        }, 30000); // Clean up after 30 seconds
                        
                        resolve({ success: false, error: error.message });
                    } else {
                        console.log('PowerShell elevation initiated successfully');
                        console.log('stdout:', stdout);
                        
                        // Clean up temp file after a delay to allow the elevated process to start
                        setTimeout(() => {
                            try {
                                fs.unlinkSync(tempBatchFile);
                            } catch (cleanupError) {
                                console.log('Could not clean up temp file:', cleanupError.message);
                            }
                        }, 5000); // Clean up after 5 seconds
                        
                        resolve({ success: true, elevated: true });
                    }
                });
            });
            
        } catch (error) {
            console.error('PowerShell elevation execution failed:', error);
            return { success: false, error: error.message };
        }
    }

    async executeElevated(command) {
        if (!this.isElevated) {
            throw new Error('Admin rights required for this operation');
        }

        try {
            const { stdout, stderr } = await execAsync(command);
            return { stdout, stderr };
        } catch (error) {
            console.error('Elevated command failed:', error);
            throw error;
        }
    }

    async executeElevatedWithSudo(command) {
        return new Promise((resolve, reject) => {
            sudo.exec(command, this.sudoOptions, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    resolve({ stdout, stderr });
                }
            });
        });
    }

    async checkUACStatus() {
        try {
            const { stdout } = await execAsync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" /v EnableLUA');
            const uacEnabled = stdout.includes('0x1');
            return uacEnabled;
        } catch (error) {
            console.error('Failed to check UAC status:', error);
            return true; // Assume UAC is enabled if we can't check
        }
    }

    async isRunningAsAdmin() {
        try {
            // Method 1: Check if we can write to Windows temp directory
            try {
                await execAsync('echo test > %WINDIR%\\temp\\sp5proxy_admin_test.txt && del %WINDIR%\\temp\\sp5proxy_admin_test.txt', { timeout: 5000 });
                return true;
            } catch (error) {
                console.log('Windows temp write test failed, trying alternative...');
            }

            // Method 2: Check if we can query system services
            try {
                await execAsync('sc query Spooler', { timeout: 5000 });
                return true;
            } catch (error) {
                console.log('Service query test failed, trying alternative...');
            }

            // Method 3: Check if we can access system registry
            try {
                await execAsync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion" /v ProgramFilesDir', { timeout: 5000 });
                return true;
            } catch (error) {
                console.log('Registry access test failed');
            }

            return false;
        } catch (error) {
            console.log('Admin check failed:', error.message);
            return false;
        }
    }

    async enableRequiredPrivileges() {
        try {
            console.log('🔐 Enabling required Windows privileges for TUN interface creation...');

            // List of privileges required for network interface creation
            const requiredPrivileges = [
                'SeCreateGlobalPrivilege',      // Create global objects
                'SeLoadDriverPrivilege',        // Load and unload device drivers
                'SeSystemEnvironmentPrivilege', // Modify firmware environment values
                'SeManageVolumePrivilege',      // Manage volume
                'SeImpersonatePrivilege',       // Impersonate a client after authentication
                'SeCreateTokenPrivilege',       // Create a token object
                'SeTcbPrivilege',              // Act as part of the operating system
                'SeDebugPrivilege',            // Debug programs
                'SeSecurityPrivilege',         // Manage auditing and security log
                'SeSystemtimePrivilege',       // Change the system time
                'SeShutdownPrivilege',         // Shut down the system
                'SeRemoteShutdownPrivilege',   // Force shutdown from a remote system
                'SeTakeOwnershipPrivilege',    // Take ownership of files or other objects
                'SeIncreaseQuotaPrivilege',    // Increase scheduling priority
                'SeIncreaseBasePriorityPrivilege', // Increase scheduling priority
                'SeCreatePagefilePrivilege',   // Create a pagefile
                'SeCreatePermanentPrivilege',  // Create permanent shared objects
                'SeBackupPrivilege',           // Back up files and directories
                'SeRestorePrivilege',          // Restore files and directories
                'SeProfileSingleProcessPrivilege', // Profile single process
                'SeSystemProfilePrivilege',    // Profile system performance
                'SeAssignPrimaryTokenPrivilege', // Replace a process level token
                'SeAuditPrivilege',            // Generate security audits
                'SeChangeNotifyPrivilege',     // Bypass traverse checking
                'SeUndockPrivilege',           // Remove computer from docking station
                'SeEnableDelegationPrivilege', // Enable computer and user accounts to be trusted for delegation
                'SeLockMemoryPrivilege',       // Lock pages in memory
                'SeIncreaseWorkingSetPrivilege', // Increase a process working set
                'SeTimeZonePrivilege',         // Change the time zone
                'SeCreateSymbolicLinkPrivilege' // Create symbolic links
            ];

            // Try to enable each privilege
            for (const privilege of requiredPrivileges) {
                try {
                    await this.enablePrivilege(privilege);
                } catch (error) {
                    // Some privileges may not be available, continue with others
                    console.log(`⚠️  Could not enable ${privilege}: ${error.message}`);
                }
            }

            console.log('✅ Privilege enablement completed');
            return true;
        } catch (error) {
            console.error('❌ Failed to enable required privileges:', error);
            return false;
        }
    }

    async enablePrivilege(privilegeName) {
        try {
            // Use PowerShell to enable the privilege
            const psScript = `
                Add-Type -TypeDefinition @"
                using System;
                using System.Runtime.InteropServices;
                using System.Security.Principal;

                public class PrivilegeHelper {
                    [DllImport("advapi32.dll", SetLastError = true)]
                    public static extern bool OpenProcessToken(IntPtr ProcessHandle, uint DesiredAccess, out IntPtr TokenHandle);

                    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
                    public static extern bool LookupPrivilegeValue(string lpSystemName, string lpName, out long lpLuid);

                    [DllImport("advapi32.dll", SetLastError = true)]
                    public static extern bool AdjustTokenPrivileges(IntPtr TokenHandle, bool DisableAllPrivileges, ref TOKEN_PRIVILEGES NewState, uint BufferLength, IntPtr PreviousState, IntPtr ReturnLength);

                    [DllImport("kernel32.dll")]
                    public static extern IntPtr GetCurrentProcess();

                    [DllImport("kernel32.dll", SetLastError = true)]
                    public static extern bool CloseHandle(IntPtr hObject);

                    [StructLayout(LayoutKind.Sequential)]
                    public struct TOKEN_PRIVILEGES {
                        public uint PrivilegeCount;
                        public long Luid;
                        public uint Attributes;
                    }

                    public const uint TOKEN_ADJUST_PRIVILEGES = 0x0020;
                    public const uint TOKEN_QUERY = 0x0008;
                    public const uint SE_PRIVILEGE_ENABLED = 0x00000002;

                    public static bool EnablePrivilege(string privilegeName) {
                        IntPtr tokenHandle = IntPtr.Zero;
                        try {
                            if (!OpenProcessToken(GetCurrentProcess(), TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, out tokenHandle)) {
                                return false;
                            }

                            long luid;
                            if (!LookupPrivilegeValue(null, privilegeName, out luid)) {
                                return false;
                            }

                            TOKEN_PRIVILEGES tokenPrivileges = new TOKEN_PRIVILEGES();
                            tokenPrivileges.PrivilegeCount = 1;
                            tokenPrivileges.Luid = luid;
                            tokenPrivileges.Attributes = SE_PRIVILEGE_ENABLED;

                            return AdjustTokenPrivileges(tokenHandle, false, ref tokenPrivileges, 0, IntPtr.Zero, IntPtr.Zero);
                        } finally {
                            if (tokenHandle != IntPtr.Zero) {
                                CloseHandle(tokenHandle);
                            }
                        }
                    }
                }
"@

                try {
                    $result = [PrivilegeHelper]::EnablePrivilege("${privilegeName}")
                    if ($result) {
                        Write-Host "✅ Enabled privilege: ${privilegeName}"
                    } else {
                        Write-Host "⚠️  Failed to enable privilege: ${privilegeName}"
                    }
                } catch {
                    Write-Host "❌ Error enabling privilege ${privilegeName}: $($_.Exception.Message)"
                }
            `;

            await execAsync(`powershell -Command "${psScript}"`, { timeout: 10000 });
            return true;
        } catch (error) {
            throw new Error(`Failed to enable privilege ${privilegeName}: ${error.message}`);
        }
    }

    async getElevationMethod() {
        const isAdmin = await this.isRunningAsAdmin();
        const uacEnabled = await this.checkUACStatus();
        
        return {
            isAdmin,
            uacEnabled,
            method: isAdmin ? 'already_admin' : uacEnabled ? 'uac_prompt' : 'run_as_admin'
        };
    }

    async restartAsAdmin() {
        try {
            // Enhanced development mode detection
            const isDev = process.env.NODE_ENV === 'development' ||
                         process.argv.includes('--dev') ||
                         process.execPath.includes('node') ||
                         process.argv[0].includes('npm') ||
                         process.cwd().includes('sp5proxy') && !process.pkg;

            console.log('🚀 Requesting administrator access...');
            console.log('⚠️  Please click "Yes" when prompted to grant administrator access');

            let elevatedProcess;
            if (isDev) {
                // In development mode, use the batch script for true high integrity
                console.log('Development mode detected - using high integrity batch script');
                elevatedProcess = await this.restartDevModeAsAdmin();
            } else {
                // In production mode, restart the executable with high integrity admin privileges
                console.log('Production mode detected - restarting executable with HIGH INTEGRITY admin privileges');
                elevatedProcess = await this.restartProductionAsAdmin();
            }

            // Wait a moment to ensure the elevated process starts successfully
            console.log('⏳ Starting with administrator access...');
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Verify the elevated process is running (optional check)
            if (elevatedProcess && elevatedProcess.pid) {
                console.log(`✅ Administrator access granted successfully with PID: ${elevatedProcess.pid}`);
            }

            // Exit current process after successful restart
            console.log('🔄 Restarting with administrator privileges...');
            console.log('🚪 Terminating current non-elevated process...');

            // Force immediate exit of the current process to prevent dual instances
            // The elevated process is already running with the new PID
            try {
                // Clean up any resources before exit
                if (this.psManager) {
                    await this.psManager.forceCleanup();
                }

                // Force immediate process termination
                console.log('✅ Cleanup completed, exiting non-elevated process...');
                process.exit(0);
            } catch (error) {
                console.error('Error during cleanup, forcing exit:', error);
                process.exit(1);
            }

        } catch (error) {
            console.error('❌ Failed to restart as admin:', error);

            // Handle specific UAC cancellation
            if (error.message.includes('1223') || error.message.toLowerCase().includes('cancelled')) {
                throw new Error('User cancelled UAC elevation prompt');
            }

            throw new Error(`Failed to restart as admin: ${error.message}`);
        }
    }

    async restartDevModeAsAdmin() {
        // Use PowerShell Process Manager for better reliability and cleanup
        console.log('🔧 Applying system settings...');

        const escapedCwd = process.cwd();

        const psScriptContent = `
# SP5Proxy Development Elevation Script
# Suppress all progress and verbose output
$ProgressPreference = 'SilentlyContinue'
$VerbosePreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'
$InformationPreference = 'SilentlyContinue'
$ErrorActionPreference = 'SilentlyContinue'

try {
    # Start elevated process with proper working directory (hidden window)
    $proc = Start-Process -FilePath "powershell" -ArgumentList "-Command", "cd '${escapedCwd}'; npm start" -Verb RunAs -PassThru -WindowStyle Hidden -WorkingDirectory "${escapedCwd}"
    if ($proc) {
        # Wait a moment to ensure the process starts properly
        Start-Sleep -Milliseconds 2000

        # Verify the process is still running
        if (Get-Process -Id $proc.Id -ErrorAction SilentlyContinue) {
            "SUCCESS:$($proc.Id)"
        } else {
            "ERROR:Elevated process failed to start or exited immediately"
        }
    } else {
        "ERROR:Failed to start elevated development process"
    }
} catch {
    if ($_.Exception.Message -like "*1223*" -or $_.Exception.Message -like "*cancelled*") {
        "ERROR:User cancelled UAC (1223)"
    } else {
        "ERROR:$($_.Exception.Message)"
    }
}
`;

        try {
            console.log('🔧 Configuring connection...');
            const { stdout, stderr } = await this.psManager.executeScriptWithCleanup(psScriptContent, { timeout: 30000 });

            // Enhanced output parsing to handle potential contamination
            const rawOutput = stdout.trim();
            console.log('📋 PowerShell script raw output:', JSON.stringify(rawOutput));
            if (stderr) {
                console.log('⚠️  PowerShell script stderr:', stderr);
            }

            // Extract the actual result from potentially mixed output
            const lines = rawOutput.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            let resultLine = null;

            // Look for SUCCESS: or ERROR: lines
            for (const line of lines) {
                if (line.startsWith('SUCCESS:') || line.startsWith('ERROR:')) {
                    resultLine = line;
                    break;
                }
            }

            if (resultLine && resultLine.startsWith('SUCCESS:')) {
                const pid = resultLine.split(':')[1];
                console.log(`✅ Administrator access granted successfully, PID: ${pid}`);
                return { pid: parseInt(pid) };
            } else if (resultLine && resultLine.startsWith('ERROR:')) {
                const errorMsg = resultLine.split(':')[1] || 'Access request failed';
                throw new Error(errorMsg);
            } else if (rawOutput === '') {
                throw new Error('Administrator access request failed - please try again');
            } else {
                console.log('🔍 Full PowerShell output for debugging:', {
                    stdout: stdout,
                    stderr: stderr,
                    lines: lines,
                    resultLine: resultLine,
                    rawOutput: rawOutput
                });
                throw new Error('Administrator access request failed - please try again');
            }
        } catch (error) {
            console.error('❌ Administrator access request failed:', error);

            // Enhanced error handling for common issues
            if (error.message.includes('execution policy')) {
                throw new Error('Administrator access failed - please try again');
            } else if (error.message.includes('cannot be loaded')) {
                throw new Error('Administrator access failed - please try again');
            } else if (error.message.includes('ENOENT') || error.message.includes('not found')) {
                throw new Error('Administrator access failed - PowerShell not available');
            } else if (error.message.includes('timeout')) {
                throw new Error('Administrator access failed - request timed out');
            }

            // Return a clean error message for any other issues
            throw new Error('Administrator access failed - please try again');
        }
        // PowerShell Process Manager handles cleanup automatically
    }

    async restartProductionAsAdmin() {
        const currentExe = process.execPath;
        const currentArgs = process.argv.slice(1);

        const psScriptContent = `
# SP5Proxy Production Elevation Script
# Suppress all progress and verbose output
$ProgressPreference = 'SilentlyContinue'
$VerbosePreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'
$InformationPreference = 'SilentlyContinue'
$ErrorActionPreference = 'SilentlyContinue'

try {
    $proc = Start-Process -FilePath "${currentExe}" -ArgumentList "${currentArgs.join(' ')}" -Verb RunAs -PassThru -WindowStyle Hidden
    if ($proc) {
        "SUCCESS:$($proc.Id)"
    } else {
        "ERROR:Failed to start process"
    }
} catch {
    if ($_.Exception.Message -like "*1223*" -or $_.Exception.Message -like "*cancelled*") {
        "ERROR:User cancelled UAC (1223)"
    } else {
        "ERROR:$($_.Exception.Message)"
    }
}
`;

        try {
            console.log('🔧 Applying network settings...');
            const { stdout, stderr } = await this.psManager.executeScriptWithCleanup(psScriptContent, { timeout: 30000 });

            // Enhanced output parsing to handle potential contamination
            const rawOutput = stdout.trim();
            console.log('📋 PowerShell script raw output:', JSON.stringify(rawOutput));
            if (stderr) {
                console.log('⚠️  PowerShell script stderr:', stderr);
            }

            // Extract the actual result from potentially mixed output
            const lines = rawOutput.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            let resultLine = null;

            // Look for SUCCESS: or ERROR: lines
            for (const line of lines) {
                if (line.startsWith('SUCCESS:') || line.startsWith('ERROR:')) {
                    resultLine = line;
                    break;
                }
            }

            if (resultLine && resultLine.startsWith('SUCCESS:')) {
                const pid = resultLine.split(':')[1];
                console.log(`✅ Administrator access granted successfully, PID: ${pid}`);
                return { pid: parseInt(pid) };
            } else if (resultLine && resultLine.startsWith('ERROR:')) {
                const errorMsg = resultLine.split(':')[1] || 'Access request failed';
                throw new Error(errorMsg);
            } else if (rawOutput === '') {
                throw new Error('Administrator access request failed - please try again');
            } else {
                console.log('🔍 Full PowerShell output for debugging:', {
                    stdout: stdout,
                    stderr: stderr,
                    lines: lines,
                    resultLine: resultLine,
                    rawOutput: rawOutput
                });
                throw new Error('Administrator access request failed - please try again');
            }
        } catch (error) {
            console.error('❌ Administrator access request failed:', error);

            // Enhanced error handling for common issues
            if (error.message.includes('execution policy')) {
                throw new Error('Administrator access failed - please try again');
            } else if (error.message.includes('cannot be loaded')) {
                throw new Error('Administrator access failed - please try again');
            } else if (error.message.includes('ENOENT') || error.message.includes('not found')) {
                throw new Error('Administrator access failed - PowerShell not available');
            } else if (error.message.includes('timeout')) {
                throw new Error('Administrator access failed - request timed out');
            }

            // Return a clean error message for any other issues
            throw new Error('Administrator access failed - please try again');
        }
        // PowerShell Process Manager handles cleanup automatically
    }

    async createDevElevationScript(scriptPath) {
        const fs = require('fs');
        const scriptContent = `@echo off
REM SP5Proxy Development Mode Elevation Script
REM This script ensures high integrity administrator privileges

echo Starting SP5Proxy in Development Mode with High Integrity Admin Privileges...
echo.

REM Change to the project directory
cd /d "${process.cwd()}"

REM Start the application with npm
echo Running: npm start
npm start

REM Keep window open if there's an error
if errorlevel 1 (
    echo.
    echo An error occurred. Press any key to close...
    pause >nul
)
`;

        fs.writeFileSync(scriptPath, scriptContent, 'utf8');
        console.log(`Created development elevation script: ${scriptPath}`);
    }

    async createElevatedTask(taskName, command) {
        try {
            // Create a scheduled task that runs with highest privileges
            const createTaskCommand = `
                schtasks /create /tn "${taskName}" /tr "${command}" /sc once /st 00:00 /rl highest /f
            `;
            
            await this.executeElevatedWithSudo(createTaskCommand);
            console.log(`Elevated task '${taskName}' created successfully`);
        } catch (error) {
            console.error('Failed to create elevated task:', error);
            throw error;
        }
    }

    async runElevatedTask(taskName) {
        try {
            await this.executeElevatedWithSudo(`schtasks /run /tn "${taskName}"`);
            console.log(`Elevated task '${taskName}' executed successfully`);
        } catch (error) {
            console.error('Failed to run elevated task:', error);
            throw error;
        }
    }

    async deleteElevatedTask(taskName) {
        try {
            await this.executeElevatedWithSudo(`schtasks /delete /tn "${taskName}" /f`);
            console.log(`Elevated task '${taskName}' deleted successfully`);
        } catch (error) {
            console.error('Failed to delete elevated task:', error);
            // Don't throw here as this is cleanup
        }
    }

    async checkServicePermissions() {
        try {
            // Check if we can manage Windows services
            await execAsync('sc query Spooler');
            return true;
        } catch (error) {
            return false;
        }
    }

    async checkNetworkPermissions() {
        try {
            // Check if we can modify network settings
            await execAsync('netsh interface show interface');
            return true;
        } catch (error) {
            return false;
        }
    }

    async checkRegistryPermissions() {
        try {
            // Check if we can read system registry keys
            await execAsync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion"');
            return true;
        } catch (error) {
            return false;
        }
    }

    async getPermissionStatus() {
        const [
            isAdmin,
            servicePerms,
            networkPerms,
            registryPerms
        ] = await Promise.all([
            this.isRunningAsAdmin(),
            this.checkServicePermissions(),
            this.checkNetworkPermissions(),
            this.checkRegistryPermissions()
        ]);

        return {
            isAdmin,
            servicePermissions: servicePerms,
            networkPermissions: networkPerms,
            registryPermissions: registryPerms,
            allPermissions: isAdmin && servicePerms && networkPerms && registryPerms
        };
    }

    async waitForElevation(timeout = 30000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            if (await this.checkAdminRights()) {
                return true;
            }
            
            // Wait 1 second before checking again
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        throw new Error('Elevation timeout - admin rights not granted within timeout period');
    }

    async handleAutomaticElevation() {
        try {
            console.log('🔍 Checking if automatic elevation is needed...');

            const hasAdminRights = await this.checkAdminRights();
            if (hasAdminRights) {
                console.log('✅ Already running with administrator privileges');
                return { success: true, alreadyElevated: true };
            }

            const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

            // Check if this is the first run or if user has previously declined elevation
            const elevationPreference = await this.getElevationPreference();

            if (elevationPreference === 'declined' && isDev) {
                console.log('⚠️  User previously declined elevation in development mode');
                return { success: false, userDeclined: true, isDev: true };
            }

            if (isDev) {
                console.log('🔧 Development mode: Showing elevation dialog instead of automatic restart');
                return { success: false, needsElevation: true, isDev: true };
            }

            // Production mode: Attempt automatic elevation
            console.log('🚀 Production mode: Attempting automatic elevation...');
            await this.restartAsAdmin();

            // This line should not be reached if restart is successful
            return { success: true, restarted: true };

        } catch (error) {
            console.error('❌ Automatic elevation failed:', error);

            if (error.message.includes('1223') || error.message.includes('cancelled')) {
                return { success: false, userCancelled: true };
            }

            return { success: false, error: error.message };
        }
    }

    async getElevationPreference() {
        try {
            const fs = require('fs');
            const path = require('path');
            const configPath = path.join(process.cwd(), 'config', 'elevation-preference.json');

            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                return config.preference || 'ask';
            }
        } catch (error) {
            console.log('Could not read elevation preference:', error.message);
        }
        return 'ask';
    }

    async setElevationPreference(preference) {
        try {
            const fs = require('fs');
            const path = require('path');
            const configDir = path.join(process.cwd(), 'config');
            const configPath = path.join(configDir, 'elevation-preference.json');

            // Ensure config directory exists
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }

            const config = { preference, timestamp: new Date().toISOString() };
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

            console.log(`Elevation preference set to: ${preference}`);
        } catch (error) {
            console.error('Failed to save elevation preference:', error);
        }
    }

    async showElevationDialog() {
        const { dialog } = require('electron');

        const result = await dialog.showMessageBox(null, {
            type: 'warning',
            title: 'Administrator Access Required',
            message: '🔒 Administrator Access Required',
            detail: 'SP5Proxy needs administrator permission to apply system settings and ensure full functionality.',
            buttons: ['Request Access', 'Exit'],
            defaultId: 0,
            cancelId: 1
        });

        return {
            response: result.response,
            rememberChoice: false
        };
    }

    /**
     * Force refresh admin status - useful after elevation
     * @returns {Promise<boolean>} - Current admin status
     */
    async refreshAdminStatus() {
        console.log('🔄 Refreshing admin status...');
        const hasAdminRights = await this.checkAdminRights();
        console.log(`🔍 Admin status refreshed: ${hasAdminRights ? 'Administrator' : 'Standard User'}`);
        return hasAdminRights;
    }

    /**
     * Check if the current process was started with elevated privileges
     * @returns {Promise<boolean>} - True if process was elevated
     */
    async wasProcessElevated() {
        try {
            // Check if this process was started with RunAs
            const { stdout } = await execAsync('whoami /groups', { timeout: 5000 });

            // Look for elevation indicators
            const hasElevationIndicators = stdout.includes('High Mandatory Level') ||
                                         stdout.includes('System Mandatory Level') ||
                                         (stdout.includes('BUILTIN\\Administrators') && !stdout.includes('Group used for deny only'));

            return hasElevationIndicators;
        } catch (error) {
            console.log('Could not check process elevation status:', error.message);
            return false;
        }
    }

    getStatus() {
        return {
            isElevated: this.isElevated,
            processId: process.pid,
            platform: process.platform,
            arch: process.arch,
            hasAdminRights: this.isElevated,
            psManagerStatus: this.psManager.getStatus()
        };
    }

    /**
     * Cleanup all PowerShell processes and resources
     * Called when application exits or proxy disconnects
     */
    async cleanup() {
        console.log('🧹 ElevationManager: Starting cleanup...');

        if (this.psManager) {
            await this.psManager.forceCleanup();
        }

        console.log('✅ ElevationManager: Cleanup completed');
    }
}

module.exports = ElevationManager;
