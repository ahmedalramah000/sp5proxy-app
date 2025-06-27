const fs = require('fs');
const path = require('path');

function prepareDistribution() {
    const packageJson = require('../package.json');
    const appName = packageJson.build.productName || packageJson.name;
    const version = packageJson.version;
    
    // Check for both possible output directories
    const outputDirs = [
        'dist/win-unpacked',
        'build/win-unpacked'
    ];
    
    let outputDir = null;
    for (const dir of outputDirs) {
        if (fs.existsSync(dir)) {
            outputDir = dir;
            break;
        }
    }
    
    if (!outputDir) {
        console.log('❌ Build output directory not found. Run npm run pack or npm run dist first.');
        return false;
    }
    
    console.log(`📦 Preparing distribution for ${appName} v${version}...`);
    console.log(`📁 Using output directory: ${outputDir}`);
    
    // Create launcher files
    try {
        const { createLaunchers } = require('./create-launchers');
        createLaunchers(appName, outputDir);
    } catch (error) {
        console.log('⚠️  Could not create launcher files:', error.message);
        // Continue with manual creation
        createManualLaunchers(appName, outputDir);
    }
    
    // Create README.txt
    const readmeContent = `${appName} - Installation and Usage Instructions
${'='.repeat(appName.length + 40)}

IMPORTANT: ${appName} requires administrator privileges to function properly.

RECOMMENDED STARTUP METHOD:
1. Double-click "Launch ${appName} as Admin.bat"
2. Click "Yes" when Windows asks for administrator privileges
3. ${appName} will start with full functionality

ALTERNATIVE STARTUP METHODS:
1. Try double-clicking "${appName}.exe" directly
   - If UAC prompt appears, click "Yes"
   - If no UAC prompt, use the batch launcher above

2. Use PowerShell launcher:
   - Right-click "Launch ${appName} as Admin.ps1"
   - Select "Run with PowerShell"
   - Click "Yes" when UAC prompts

3. Manual elevation:
   - Right-click "${appName}.exe"
   - Select "Run as administrator"
   - Click "Yes" when UAC prompts

TROUBLESHOOTING:
- If UAC prompts don't appear, check Windows UAC settings
- If antivirus blocks the application, add it to exclusions
- See TROUBLESHOOTING.txt for detailed help

SYSTEM REQUIREMENTS:
- Windows 7 or later
- Administrator privileges required
- UAC must be enabled

Version: ${version}
Build Date: ${new Date().toISOString().split('T')[0]}
`;
    
    fs.writeFileSync(path.join(outputDir, 'README.txt'), readmeContent);
    console.log('✅ Created README.txt');
    
    // Create TROUBLESHOOTING.txt
    const troubleshootingContent = `${appName} - UAC Elevation Troubleshooting Guide
${'='.repeat(appName.length + 35)}

PROBLEM: No UAC prompt appears when launching ${appName}.exe
SOLUTION:
1. Use "Launch ${appName} as Admin.bat" instead
2. Check Windows UAC settings:
   - Open Control Panel → User Accounts → Change User Account Control settings
   - Ensure UAC is not set to "Never notify"
3. Try running as administrator manually:
   - Right-click ${appName}.exe → "Run as administrator"

PROBLEM: UAC prompt appears but application still lacks admin rights
SOLUTION:
1. Ensure you clicked "Yes" on the UAC prompt
2. Check if you're using a standard user account:
   - Standard users may need to enter admin credentials
3. Verify admin rights in the application:
   - Check application logs or status indicators

PROBLEM: Antivirus software blocks the application
SOLUTION:
1. Add ${appName}.exe to antivirus exclusions
2. Temporarily disable real-time protection for testing
3. Check antivirus quarantine for blocked files

PROBLEM: "Launch ${appName} as Admin.bat" doesn't work
SOLUTION:
1. Try "Launch ${appName} as Admin.ps1" instead
2. Check PowerShell execution policy:
   - Run: powershell -ExecutionPolicy Bypass -File "Launch ${appName} as Admin.ps1"
3. Run Command Prompt as administrator and execute the batch file

PROBLEM: Application crashes after UAC elevation
SOLUTION:
1. Check Windows Event Viewer for error details
2. Ensure all application dependencies are installed
3. Try running in compatibility mode for older Windows versions

PROBLEM: Network/proxy functionality not working
SOLUTION:
1. Verify administrator privileges are properly obtained
2. Check Windows Firewall settings
3. Ensure TUN/TAP drivers are properly installed
4. Check antivirus network protection settings

Version: ${version}
Build Date: ${new Date().toISOString().split('T')[0]}
`;
    
    fs.writeFileSync(path.join(outputDir, 'TROUBLESHOOTING.txt'), troubleshootingContent);
    console.log('✅ Created TROUBLESHOOTING.txt');
    
    console.log('\n🎉 Distribution preparation complete!');
    console.log(`📁 Distribution ready in: ${outputDir}`);
    console.log('\n📋 Distribution includes:');
    console.log(`   - ${appName}.exe (main executable)`);
    console.log(`   - Launch ${appName} as Admin.bat (primary UAC launcher)`);
    console.log(`   - Launch ${appName} as Admin.ps1 (alternative UAC launcher)`);
    console.log('   - README.txt (user instructions)');
    console.log('   - TROUBLESHOOTING.txt (troubleshooting guide)');
    console.log('   - resources/ (application resources)');
    
    return true;
}

function createManualLaunchers(appName, outputDir) {
    const executableName = `${appName}.exe`;
    
    // Batch launcher content
    const batchContent = `@echo off
REM ${appName} UAC Launcher
echo ========================================
echo ${appName} - Administrator Launcher
echo ========================================
echo.
echo Starting ${appName} with administrator privileges...
echo.

set "SCRIPT_DIR=%~dp0"
echo Requesting administrator privileges...
powershell -Command "Start-Process -FilePath '%SCRIPT_DIR%${executableName}' -Verb RunAs"

if %errorlevel% equ 0 (
    echo.
    echo ✅ ${appName} started successfully with administrator privileges.
    echo.
    timeout /t 3 /nobreak >nul
) else (
    echo.
    echo ❌ Failed to start ${appName} with administrator privileges.
    echo.
    echo Troubleshooting:
    echo 1. Ensure you clicked "Yes" when UAC prompted
    echo 2. Check if antivirus software is blocking the application
    echo 3. Try running this batch file as administrator
    echo.
    pause
)`;

    // PowerShell launcher content
    const psContent = `# ${appName} UAC Launcher
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "${appName} - Administrator Launcher" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Starting ${appName} with administrator privileges..." -ForegroundColor Yellow
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ExePath = Join-Path $ScriptDir "${executableName}"

if (Test-Path $ExePath) {
    try {
        Write-Host "Requesting administrator privileges..." -ForegroundColor Yellow
        Start-Process -FilePath $ExePath -Verb RunAs
        
        Write-Host ""
        Write-Host "✅ ${appName} started successfully with administrator privileges." -ForegroundColor Green
        Write-Host ""
        Start-Sleep -Seconds 3
        
    } catch [System.ComponentModel.Win32Exception] {
        Write-Host ""
        if ($_.Exception.NativeErrorCode -eq 1223) {
            Write-Host "⚠️  User cancelled UAC elevation." -ForegroundColor Yellow
        } else {
            Write-Host "❌ Failed to start ${appName}: $($_.Exception.Message)" -ForegroundColor Red
        }
        Read-Host "Press Enter to exit"
    } catch {
        Write-Host "❌ Unexpected error: $($_.Exception.Message)" -ForegroundColor Red
        Read-Host "Press Enter to exit"
    }
} else {
    Write-Host "❌ ${appName} executable not found: $ExePath" -ForegroundColor Red
    Read-Host "Press Enter to exit"
}`;

    // Write launcher files
    const batchPath = path.join(outputDir, `Launch ${appName} as Admin.bat`);
    const psPath = path.join(outputDir, `Launch ${appName} as Admin.ps1`);
    
    fs.writeFileSync(batchPath, batchContent);
    fs.writeFileSync(psPath, psContent);
    
    console.log(`✅ Created batch launcher: ${batchPath}`);
    console.log(`✅ Created PowerShell launcher: ${psPath}`);
}

if (require.main === module) {
    prepareDistribution();
}

module.exports = prepareDistribution;
