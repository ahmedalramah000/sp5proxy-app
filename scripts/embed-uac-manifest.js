const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

class UACManifestEmbedder {
    constructor() {
        this.projectRoot = path.resolve(__dirname, '..');
        this.manifestPath = path.join(this.projectRoot, 'assets', 'app.manifest');
        this.executablePaths = [
            path.join(this.projectRoot, 'build', 'win-unpacked', 'SP5Proxy Desktop.exe'),
            path.join(this.projectRoot, 'build', 'SP5Proxy Desktop.exe'),
            path.join(this.projectRoot, 'dist', 'win-unpacked', 'SP5Proxy Desktop.exe'),
            path.join(this.projectRoot, 'dist', 'SP5Proxy Desktop.exe')
        ];
    }

    log(message, level = 'INFO') {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] [${level}] ${message}`);
    }

    async findExecutable() {
        for (const exePath of this.executablePaths) {
            if (fs.existsSync(exePath)) {
                this.log(`Found executable: ${exePath}`, 'SUCCESS');
                return exePath;
            }
        }
        throw new Error(`No executable found in any of the expected locations: ${this.executablePaths.join(', ')}`);
    }

    async verifyManifestFile() {
        if (!fs.existsSync(this.manifestPath)) {
            throw new Error(`Manifest file not found: ${this.manifestPath}`);
        }

        const manifestContent = fs.readFileSync(this.manifestPath, 'utf8');
        if (!manifestContent.includes('requireAdministrator')) {
            throw new Error('Manifest file does not contain requireAdministrator directive');
        }

        this.log('Manifest file verified successfully', 'SUCCESS');
        return manifestContent;
    }

    async embedManifestWithMT() {
        try {
            const exePath = await this.findExecutable();
            
            this.log('Attempting to embed manifest using mt.exe...', 'INFO');
            
            // Use Windows SDK mt.exe tool to embed manifest
            const mtCommand = `mt.exe -manifest "${this.manifestPath}" -outputresource:"${exePath}";1`;
            
            const { stdout, stderr } = await execAsync(mtCommand, { timeout: 30000 });
            
            if (stderr && !stderr.includes('successfully')) {
                throw new Error(`mt.exe error: ${stderr}`);
            }
            
            this.log('Manifest embedded successfully using mt.exe', 'SUCCESS');
            return true;
        } catch (error) {
            this.log(`mt.exe embedding failed: ${error.message}`, 'WARNING');
            return false;
        }
    }

    async embedManifestWithResourceHacker() {
        try {
            const exePath = await this.findExecutable();
            
            this.log('Attempting to embed manifest using ResourceHacker...', 'INFO');
            
            // Try to use ResourceHacker if available
            const rhCommand = `ResourceHacker.exe -open "${exePath}" -save "${exePath}" -action addoverwrite -res "${this.manifestPath}" -mask MANIFEST,1,`;
            
            const { stdout, stderr } = await execAsync(rhCommand, { timeout: 30000 });
            
            this.log('Manifest embedded successfully using ResourceHacker', 'SUCCESS');
            return true;
        } catch (error) {
            this.log(`ResourceHacker embedding failed: ${error.message}`, 'WARNING');
            return false;
        }
    }

    async embedManifestWithPowerShell() {
        try {
            const exePath = await this.findExecutable();
            
            this.log('Attempting to embed manifest using PowerShell...', 'INFO');
            
            const psScript = `
                Add-Type -AssemblyName System.Drawing
                
                # Read the manifest content
                $manifestContent = Get-Content "${this.manifestPath}" -Raw
                
                # Use .NET to embed the manifest
                try {
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes($manifestContent)
                    
                    # This is a simplified approach - in practice, you'd need more complex resource manipulation
                    Write-Host "Manifest content prepared for embedding"
                    Write-Host "Manifest size: $($bytes.Length) bytes"
                    
                    # Note: Full implementation would require P/Invoke to UpdateResource API
                    # For now, we'll rely on electron-builder's built-in mechanism
                    
                    return $true
                } catch {
                    Write-Error "Failed to process manifest: $($_.Exception.Message)"
                    return $false
                }
            `;
            
            const { stdout, stderr } = await execAsync(`powershell -Command "${psScript}"`, { timeout: 30000 });
            
            this.log('PowerShell manifest processing completed', 'INFO');
            return true;
        } catch (error) {
            this.log(`PowerShell embedding failed: ${error.message}`, 'WARNING');
            return false;
        }
    }

    async verifyManifestEmbedding() {
        try {
            const exePath = await this.findExecutable();
            
            this.log('Verifying manifest embedding...', 'INFO');
            
            // Method 1: Check with PowerShell
            const psCommand = `powershell -Command "Get-Content '${exePath}' -Raw | Select-String 'requireAdministrator'"`;
            const { stdout: psResult } = await execAsync(psCommand, { timeout: 10000 });
            
            if (psResult && psResult.trim().length > 0) {
                this.log('✅ Manifest embedding verified with PowerShell', 'SUCCESS');
                return true;
            }
            
            // Method 2: Check with findstr
            const findstrCommand = `findstr /C:"requireAdministrator" "${exePath}"`;
            try {
                const { stdout: findstrResult } = await execAsync(findstrCommand, { timeout: 10000 });
                if (findstrResult && findstrResult.trim().length > 0) {
                    this.log('✅ Manifest embedding verified with findstr', 'SUCCESS');
                    return true;
                }
            } catch (findstrError) {
                // findstr returns non-zero exit code when no match found
            }
            
            this.log('❌ Manifest embedding verification failed', 'ERROR');
            return false;
        } catch (error) {
            this.log(`Verification failed: ${error.message}`, 'ERROR');
            return false;
        }
    }

    async testUACPrompt() {
        try {
            const exePath = await this.findExecutable();
            
            this.log('Testing UAC prompt behavior...', 'INFO');
            
            // Create a test script that launches the executable
            const testScript = `
                $processInfo = New-Object System.Diagnostics.ProcessStartInfo
                $processInfo.FileName = "${exePath}"
                $processInfo.UseShellExecute = $true
                $processInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
                
                try {
                    $process = [System.Diagnostics.Process]::Start($processInfo)
                    if ($process) {
                        Start-Sleep -Seconds 2
                        $process.Kill()
                        Write-Host "UAC prompt test: Process started successfully (UAC likely prompted)"
                        return $true
                    } else {
                        Write-Host "UAC prompt test: Process failed to start"
                        return $false
                    }
                } catch [System.ComponentModel.Win32Exception] {
                    if ($_.Exception.NativeErrorCode -eq 1223) {
                        Write-Host "UAC prompt test: User cancelled UAC (UAC prompt appeared)"
                        return $true
                    } else {
                        Write-Host "UAC prompt test: Win32 error - $($_.Exception.Message)"
                        return $false
                    }
                } catch {
                    Write-Host "UAC prompt test: Unexpected error - $($_.Exception.Message)"
                    return $false
                }
            `;
            
            const { stdout } = await execAsync(`powershell -Command "${testScript}"`, { timeout: 15000 });
            
            this.log(`UAC test result: ${stdout.trim()}`, 'INFO');
            return stdout.includes('successfully') || stdout.includes('cancelled UAC');
        } catch (error) {
            this.log(`UAC test failed: ${error.message}`, 'WARNING');
            return false;
        }
    }

    async run() {
        try {
            this.log('🚀 Starting UAC manifest embedding process...', 'START');
            
            // Step 1: Verify manifest file
            await this.verifyManifestFile();
            
            // Step 2: Find executable
            const exePath = await this.findExecutable();
            
            // Step 3: Try different embedding methods
            let embedded = false;
            
            // Try mt.exe first (most reliable)
            if (!embedded) {
                embedded = await this.embedManifestWithMT();
            }
            
            // Try ResourceHacker as fallback
            if (!embedded) {
                embedded = await this.embedManifestWithResourceHacker();
            }
            
            // Try PowerShell approach
            if (!embedded) {
                embedded = await this.embedManifestWithPowerShell();
            }
            
            // Step 4: Verify embedding
            const verified = await this.verifyManifestEmbedding();
            
            // Step 5: Test UAC prompt (optional)
            // const uacTested = await this.testUACPrompt();
            
            if (verified) {
                this.log('🎉 UAC manifest embedding completed successfully!', 'SUCCESS');
                this.log(`✅ Executable: ${exePath}`, 'SUCCESS');
                this.log('✅ Manifest embedded and verified', 'SUCCESS');
                this.log('✅ UAC prompt should appear when executable is launched', 'SUCCESS');
                return true;
            } else {
                this.log('❌ UAC manifest embedding failed verification', 'ERROR');
                this.log('⚠️  The executable may not prompt for UAC elevation', 'WARNING');
                return false;
            }
            
        } catch (error) {
            this.log(`💥 Critical error: ${error.message}`, 'ERROR');
            return false;
        }
    }
}

// Run the embedder if this script is executed directly
if (require.main === module) {
    const embedder = new UACManifestEmbedder();
    embedder.run().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('💥 Embedder execution failed:', error);
        process.exit(1);
    });
}

module.exports = UACManifestEmbedder;
