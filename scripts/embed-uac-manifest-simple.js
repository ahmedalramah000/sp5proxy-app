const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function log(message, level = 'INFO') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] [${level}] ${message}`);
}

function findExecutable() {
    const possiblePaths = [
        'build/win-unpacked/SP5Proxy Desktop.exe',
        'dist/win-unpacked/SP5Proxy Desktop.exe'
    ];

    for (const exePath of possiblePaths) {
        if (fs.existsSync(exePath)) {
            log(`Found executable: ${exePath}`, 'SUCCESS');
            return path.resolve(exePath);
        }
    }

    throw new Error('No executable found. Please run npm run pack first.');
}

function createLaunchers(executablePath) {
    const execDir = path.dirname(executablePath);
    
    // Create batch launcher
    const batchContent = `@echo off
REM SP5Proxy Desktop UAC Launcher
echo Starting SP5Proxy Desktop with administrator privileges...

REM Get the directory of this batch file
set "SCRIPT_DIR=%~dp0"

REM Launch the main executable with elevation
powershell -Command "Start-Process -FilePath '%SCRIPT_DIR%SP5Proxy Desktop.exe' -Verb RunAs"

if %errorlevel% equ 0 (
    echo SP5Proxy Desktop started successfully.
) else (
    echo Failed to start with administrator privileges.
    pause
)
`;

    const batchPath = path.join(execDir, 'Launch SP5Proxy as Admin.bat');
    fs.writeFileSync(batchPath, batchContent);
    log(`Created batch launcher: ${batchPath}`, 'SUCCESS');

    // Create PowerShell launcher
    const psContent = `# SP5Proxy Desktop UAC Launcher
Write-Host "Starting SP5Proxy Desktop with administrator privileges..." -ForegroundColor Cyan

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ExePath = Join-Path $ScriptDir "SP5Proxy Desktop.exe"

if (Test-Path $ExePath) {
    try {
        Start-Process -FilePath $ExePath -Verb RunAs
        Write-Host "SP5Proxy Desktop started successfully." -ForegroundColor Green
    } catch {
        Write-Host "Failed to start with administrator privileges: $($_.Exception.Message)" -ForegroundColor Red
        Read-Host "Press Enter to exit"
    }
} else {
    Write-Host "Executable not found: $ExePath" -ForegroundColor Red
    Read-Host "Press Enter to exit"
}
`;

    const psPath = path.join(execDir, 'Launch SP5Proxy as Admin.ps1');
    fs.writeFileSync(psPath, psContent);
    log(`Created PowerShell launcher: ${psPath}`, 'SUCCESS');

    return { batchPath, psPath };
}

function embedManifest(executablePath) {
    const manifestPath = path.resolve('assets/app.manifest');
    
    if (!fs.existsSync(manifestPath)) {
        throw new Error(`Manifest file not found: ${manifestPath}`);
    }

    log('Attempting to embed UAC manifest...', 'INFO');

    try {
        // Try using mt.exe (Windows SDK tool)
        const mtCommand = `mt.exe -manifest "${manifestPath}" -outputresource:"${executablePath}";1`;
        execSync(mtCommand, { stdio: 'inherit', timeout: 30000 });
        log('UAC manifest embedded successfully using mt.exe', 'SUCCESS');
        return true;
    } catch (error) {
        log(`mt.exe failed: ${error.message}`, 'WARNING');
        
        try {
            // Try using ResourceHacker if available
            const rhCommand = `ResourceHacker.exe -open "${executablePath}" -save "${executablePath}" -action addoverwrite -res "${manifestPath}" -mask MANIFEST,1,`;
            execSync(rhCommand, { stdio: 'inherit', timeout: 30000 });
            log('UAC manifest embedded successfully using ResourceHacker', 'SUCCESS');
            return true;
        } catch (rhError) {
            log(`ResourceHacker failed: ${rhError.message}`, 'WARNING');
            return false;
        }
    }
}

function verifyManifest(executablePath) {
    try {
        // Use findstr to check for UAC manifest
        const result = execSync(`findstr /C:"requireAdministrator" "${executablePath}"`, { encoding: 'utf8' });
        return result && result.trim().length > 0;
    } catch (error) {
        return false;
    }
}

function main() {
    try {
        log('🚀 Starting UAC manifest embedding...', 'START');

        // Find the executable
        const executablePath = findExecutable();

        // Try to embed the manifest
        const embedded = embedManifest(executablePath);

        // Verify embedding
        const verified = embedded && verifyManifest(executablePath);

        if (verified) {
            log('✅ UAC manifest successfully embedded and verified!', 'SUCCESS');
            log('The executable should now automatically prompt for UAC elevation', 'SUCCESS');
        } else {
            log('⚠️  Direct manifest embedding failed, creating launcher alternatives...', 'WARNING');
            const launchers = createLaunchers(executablePath);
            
            log('🎯 Alternative launchers created:', 'INFO');
            log(`   Batch: ${launchers.batchPath}`, 'INFO');
            log(`   PowerShell: ${launchers.psPath}`, 'INFO');
            log('   Users can use these to launch the app with admin privileges', 'INFO');
        }

        log('🎉 UAC setup completed!', 'SUCCESS');
        return true;

    } catch (error) {
        log(`💥 Error: ${error.message}`, 'ERROR');
        return false;
    }
}

if (require.main === module) {
    const success = main();
    process.exit(success ? 0 : 1);
}

module.exports = { main, embedManifest, createLaunchers };
