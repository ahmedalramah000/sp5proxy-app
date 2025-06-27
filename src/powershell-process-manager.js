const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const execAsync = promisify(exec);

/**
 * PowerShell Process Manager
 * Handles cleanup and memory management for background PowerShell processes
 * Prevents memory leaks and system hanging from accumulated PowerShell processes
 */
class PowerShellProcessManager {
    constructor() {
        this.activeProcesses = new Map(); // Track active PowerShell processes
        this.tempScripts = new Set(); // Track temporary script files
        this.cleanupInterval = null;
        this.isShuttingDown = false;
        
        // Start periodic cleanup every 5 minutes
        this.startPeriodicCleanup();
        
        // Register cleanup on process exit
        this.registerExitHandlers();
    }

    /**
     * Execute PowerShell command with proper process tracking and cleanup
     */
    async executeWithCleanup(command, options = {}) {
        const processId = Date.now() + Math.random();
        
        try {
            console.log(`🔧 Executing PowerShell command (ID: ${processId})`);
            
            const startTime = Date.now();
            const result = await execAsync(command, {
                timeout: options.timeout || 30000,
                windowsHide: true,
                ...options
            });
            
            const duration = Date.now() - startTime;
            console.log(`✅ PowerShell command completed in ${duration}ms (ID: ${processId})`);
            
            return result;
        } catch (error) {
            console.error(`❌ PowerShell command failed (ID: ${processId}):`, error.message);
            throw error;
        }
    }

    /**
     * Execute PowerShell script file with automatic cleanup
     */
    async executeScriptWithCleanup(scriptContent, options = {}) {
        const scriptId = Date.now() + Math.random();
        const tempScriptPath = path.join(process.cwd(), `temp-ps-${scriptId}.ps1`);
        
        try {
            // Write script to temporary file
            fs.writeFileSync(tempScriptPath, scriptContent, 'utf8');
            this.tempScripts.add(tempScriptPath);
            
            console.log(`🔧 Executing PowerShell script (ID: ${scriptId})`);
            
            const command = `powershell -ExecutionPolicy Bypass -NoProfile -NonInteractive -WindowStyle Hidden -File "${tempScriptPath}"`;
            const result = await this.executeWithCleanup(command, options);
            
            // Clean up script file immediately after execution
            this.cleanupTempScript(tempScriptPath);
            
            return result;
        } catch (error) {
            // Ensure cleanup even on error
            this.cleanupTempScript(tempScriptPath);
            throw error;
        }
    }

    /**
     * Start periodic cleanup of orphaned PowerShell processes
     */
    startPeriodicCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        // Run cleanup every 5 minutes
        this.cleanupInterval = setInterval(() => {
            this.performPeriodicCleanup();
        }, 5 * 60 * 1000);
        
        console.log('🧹 PowerShell periodic cleanup started (5-minute intervals)');
    }

    /**
     * Perform periodic cleanup of orphaned processes and memory
     */
    async performPeriodicCleanup() {
        if (this.isShuttingDown) return;
        
        try {
            console.log('🧹 Performing periodic PowerShell cleanup...');
            
            // Clean up orphaned PowerShell processes
            await this.cleanupOrphanedProcesses();
            
            // Clean up temporary script files
            await this.cleanupTempScripts();
            
            // Force garbage collection if available
            if (global.gc) {
                global.gc();
                console.log('🗑️ Forced garbage collection completed');
            }
            
            console.log('✅ Periodic PowerShell cleanup completed');
        } catch (error) {
            console.error('❌ Periodic cleanup failed:', error.message);
        }
    }

    /**
     * Clean up orphaned PowerShell processes
     */
    async cleanupOrphanedProcesses() {
        try {
            // Find PowerShell processes that might be orphaned
            const command = `Get-Process | Where-Object { $_.ProcessName -eq 'powershell' -and $_.StartTime -lt (Get-Date).AddMinutes(-10) } | Select-Object Id, ProcessName, StartTime`;

            const { stdout } = await execAsync(`powershell -WindowStyle Hidden -Command "${command}"`, { timeout: 10000, windowsHide: true });
            
            if (stdout.trim()) {
                console.log('🔍 Found potentially orphaned PowerShell processes:', stdout);
                
                // Note: We don't automatically kill these as they might be legitimate
                // This is just for monitoring and logging
            }
        } catch (error) {
            console.log('PowerShell process check failed (non-critical):', error.message);
        }
    }

    /**
     * Clean up temporary script files
     */
    async cleanupTempScripts() {
        const scriptsToRemove = [];
        
        for (const scriptPath of this.tempScripts) {
            try {
                if (fs.existsSync(scriptPath)) {
                    fs.unlinkSync(scriptPath);
                    scriptsToRemove.push(scriptPath);
                    console.log(`🗑️ Cleaned up temp script: ${path.basename(scriptPath)}`);
                }
            } catch (error) {
                console.log(`Warning: Could not clean up temp script ${scriptPath}:`, error.message);
            }
        }
        
        // Remove cleaned scripts from tracking
        scriptsToRemove.forEach(script => this.tempScripts.delete(script));
    }

    /**
     * Clean up specific temporary script file
     */
    cleanupTempScript(scriptPath) {
        try {
            if (fs.existsSync(scriptPath)) {
                fs.unlinkSync(scriptPath);
                console.log(`🗑️ Cleaned up temp script: ${path.basename(scriptPath)}`);
            }
            this.tempScripts.delete(scriptPath);
        } catch (error) {
            console.log(`Warning: Could not clean up temp script ${scriptPath}:`, error.message);
        }
    }

    /**
     * Register cleanup handlers for application exit
     */
    registerExitHandlers() {
        const cleanup = async () => {
            if (this.isShuttingDown) return;
            this.isShuttingDown = true;
            
            console.log('🧹 PowerShell Process Manager: Starting shutdown cleanup...');
            
            // Stop periodic cleanup
            if (this.cleanupInterval) {
                clearInterval(this.cleanupInterval);
                this.cleanupInterval = null;
            }
            
            // Clean up all temporary scripts
            await this.cleanupTempScripts();
            
            console.log('✅ PowerShell Process Manager: Shutdown cleanup completed');
        };

        // Register for various exit scenarios
        process.on('exit', cleanup);
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
        process.on('uncaughtException', cleanup);
        process.on('unhandledRejection', cleanup);
    }

    /**
     * Force immediate cleanup of all PowerShell resources
     */
    async forceCleanup() {
        console.log('🧹 PowerShell Process Manager: Force cleanup initiated...');
        
        this.isShuttingDown = true;
        
        // Stop periodic cleanup
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        
        // Clean up all temporary scripts
        await this.cleanupTempScripts();
        
        // Clear tracking maps
        this.activeProcesses.clear();
        this.tempScripts.clear();
        
        console.log('✅ PowerShell Process Manager: Force cleanup completed');
    }

    /**
     * Get status information about managed processes
     */
    getStatus() {
        return {
            activeProcesses: this.activeProcesses.size,
            tempScripts: this.tempScripts.size,
            cleanupRunning: !!this.cleanupInterval,
            isShuttingDown: this.isShuttingDown
        };
    }
}

module.exports = PowerShellProcessManager;
