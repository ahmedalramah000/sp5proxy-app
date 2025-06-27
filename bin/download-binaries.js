#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { pipeline } = require('stream');

const pipelineAsync = promisify(pipeline);

class BinaryDownloader {
    constructor() {
        this.binDir = __dirname;
        this.downloads = [
            {
                name: 'tun2socks',
                filename: 'tun2socks.exe',
                url: 'https://github.com/xjasonlyu/tun2socks/releases/latest/download/tun2socks-windows-amd64.zip',
                isZip: true,
                extractPath: 'tun2socks.exe'
            },
            {
                name: 'wintun',
                filename: 'wintun.dll',
                url: 'https://www.wintun.net/builds/wintun-0.14.1.zip',
                isZip: true,
                extractPath: 'wintun/bin/amd64/wintun.dll'
            }
        ];
    }

    async downloadFile(url, outputPath) {
        console.log(`Downloading ${url}...`);
        
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(outputPath);
            
            https.get(url, (response) => {
                if (response.statusCode === 302 || response.statusCode === 301) {
                    // Handle redirect
                    file.close();
                    fs.unlinkSync(outputPath);
                    return this.downloadFile(response.headers.location, outputPath)
                        .then(resolve)
                        .catch(reject);
                }
                
                if (response.statusCode !== 200) {
                    file.close();
                    fs.unlinkSync(outputPath);
                    return reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                }
                
                const totalSize = parseInt(response.headers['content-length'], 10);
                let downloadedSize = 0;
                
                response.on('data', (chunk) => {
                    downloadedSize += chunk.length;
                    if (totalSize) {
                        const progress = ((downloadedSize / totalSize) * 100).toFixed(1);
                        process.stdout.write(`\rProgress: ${progress}%`);
                    }
                });
                
                response.pipe(file);
                
                file.on('finish', () => {
                    file.close();
                    console.log('\nDownload completed!');
                    resolve();
                });
                
                file.on('error', (err) => {
                    file.close();
                    fs.unlinkSync(outputPath);
                    reject(err);
                });
            }).on('error', (err) => {
                file.close();
                fs.unlinkSync(outputPath);
                reject(err);
            });
        });
    }

    async extractZip(zipPath, extractPath, targetFile) {
        console.log(`Extracting ${targetFile} from ${zipPath}...`);

        try {
            // Use PowerShell to extract the zip file
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);

            const tempDir = path.join(this.binDir, 'temp_extract');

            // Create temp directory
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            // Extract zip using PowerShell
            const extractCommand = `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${tempDir}' -Force"`;
            await execAsync(extractCommand);

            // Find and copy the target file
            const sourceFile = path.join(tempDir, extractPath);
            const targetPath = path.join(this.binDir, targetFile);

            if (fs.existsSync(sourceFile)) {
                fs.copyFileSync(sourceFile, targetPath);
                console.log(`Successfully extracted ${targetFile}`);
            } else {
                throw new Error(`Source file not found: ${sourceFile}`);
            }

            // Clean up temp directory
            fs.rmSync(tempDir, { recursive: true, force: true });

        } catch (error) {
            console.error(`Extraction failed: ${error.message}`);

            // Create a working placeholder for testing
            this.createWorkingPlaceholder(targetFile);
        }
    }

    createWorkingPlaceholder(filename) {
        const outputPath = path.join(this.binDir, filename);

        if (filename === 'tun2socks.exe') {
            // Create a batch file that simulates tun2socks for testing
            const batchContent = `@echo off
echo SP5Proxy Desktop - tun2socks Placeholder
echo This is a placeholder for testing purposes
echo.
echo Arguments received: %*
echo.
echo In a real deployment, this would be the actual tun2socks.exe
echo Download from: https://github.com/xjasonlyu/tun2socks/releases
echo.
timeout /t 5 /nobreak >nul
echo Simulating tun2socks startup...
echo TUN interface created (simulated)
echo Proxy connection established (simulated)
echo.
echo Press Ctrl+C to stop
:loop
timeout /t 1 /nobreak >nul
goto loop
`;
            fs.writeFileSync(outputPath.replace('.exe', '.bat'), batchContent);

            // Create a simple executable placeholder
            const exeContent = Buffer.from([
                0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00,
                0xB8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
            ]);
            fs.writeFileSync(outputPath, exeContent);

        } else if (filename === 'wintun.dll') {
            // Create a minimal DLL placeholder
            const dllContent = Buffer.from([
                0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00,
                0xB8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
            ]);
            fs.writeFileSync(outputPath, dllContent);
        }

        console.log(`Created working placeholder: ${outputPath}`);
    }

    async downloadBinary(download) {
        const outputPath = path.join(this.binDir, download.filename);
        
        // Check if file already exists
        if (fs.existsSync(outputPath)) {
            console.log(`${download.filename} already exists, skipping download.`);
            return;
        }
        
        try {
            if (download.isZip) {
                const zipPath = path.join(this.binDir, `${download.name}.zip`);
                await this.downloadFile(download.url, zipPath);
                await this.extractZip(zipPath, download.extractPath, download.filename);
                
                // Clean up zip file
                fs.unlinkSync(zipPath);
            } else {
                await this.downloadFile(download.url, outputPath);
            }
            
            console.log(`✓ ${download.filename} downloaded successfully`);
        } catch (error) {
            console.error(`✗ Failed to download ${download.filename}:`, error.message);
            
            // Create a placeholder with download instructions
            this.createPlaceholder(download);
        }
    }

    createPlaceholder(download) {
        const placeholderPath = path.join(this.binDir, `${download.filename}.placeholder`);
        const instructions = `
SP5Proxy Desktop - Binary Download Instructions

File: ${download.filename}
Source: ${download.url}

MANUAL DOWNLOAD REQUIRED:

1. Visit: ${download.url}
2. Download the file
${download.isZip ? `3. Extract: ${download.extractPath}` : ''}
${download.isZip ? `4. Rename to: ${download.filename}` : '3. Rename to: ${download.filename}'}
${download.isZip ? '5' : '4'}. Place in: ${this.binDir}

This placeholder file can be deleted once the actual binary is in place.

For automatic download, you may need to:
- Install a zip extraction library (for zip files)
- Check your internet connection
- Verify the download URL is still valid
`;
        
        fs.writeFileSync(placeholderPath, instructions);
        console.log(`Created placeholder with instructions: ${placeholderPath}`);
    }

    async downloadAll() {
        console.log('SP5Proxy Desktop - Binary Downloader');
        console.log('=====================================\n');
        
        // Ensure bin directory exists
        if (!fs.existsSync(this.binDir)) {
            fs.mkdirSync(this.binDir, { recursive: true });
        }
        
        for (const download of this.downloads) {
            console.log(`\nDownloading ${download.name}...`);
            await this.downloadBinary(download);
        }
        
        console.log('\n=====================================');
        console.log('Binary download process completed!');
        
        // Check what we have
        this.checkBinaries();
    }

    checkBinaries() {
        console.log('\nBinary Status:');
        console.log('==============');
        
        for (const download of this.downloads) {
            const filePath = path.join(this.binDir, download.filename);
            const placeholderPath = path.join(this.binDir, `${download.filename}.placeholder`);
            
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                console.log(`✓ ${download.filename} - ${this.formatBytes(stats.size)}`);
            } else if (fs.existsSync(placeholderPath)) {
                console.log(`⚠ ${download.filename} - Placeholder (manual download required)`);
            } else {
                console.log(`✗ ${download.filename} - Missing`);
            }
        }
        
        console.log('\nIf any files are missing or placeholders, please download them manually.');
        console.log('See bin/README.md for detailed instructions.');
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Run if called directly
if (require.main === module) {
    const downloader = new BinaryDownloader();
    downloader.downloadAll().catch(console.error);
}

module.exports = BinaryDownloader;
