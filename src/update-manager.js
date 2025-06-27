const { autoUpdater } = require('electron-updater');
const { dialog } = require('electron');
const path = require('path');
const fs = require('fs');

class UpdateManager {
    constructor(mainWindow) {
        this.mainWindow = mainWindow;
        this.updateAvailable = false;
        this.updateDownloaded = false;
        this.checkingForUpdates = false;
        this.autoUpdateEnabled = true;
        this.updateCheckInterval = null;
        
        this.setupAutoUpdater();
    }

    setupAutoUpdater() {
        // Configure auto-updater
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;
        
        // Set update server (GitHub releases)
        autoUpdater.setFeedURL({
            provider: 'github',
            owner: 'sp5proxy',
            repo: 'sp5proxy-desktop',
            private: false
        });

        // Event handlers
        autoUpdater.on('checking-for-update', () => {
            console.log('Checking for updates...');
            this.checkingForUpdates = true;
            this.notifyRenderer('update-checking');
        });

        autoUpdater.on('update-available', (info) => {
            console.log('Update available:', info);
            this.updateAvailable = true;
            this.checkingForUpdates = false;
            this.notifyRenderer('update-available', info);
        });

        autoUpdater.on('update-not-available', (info) => {
            console.log('Update not available:', info);
            this.checkingForUpdates = false;
            this.notifyRenderer('update-not-available', info);
        });

        autoUpdater.on('error', (error) => {
            console.error('Update error:', error);
            this.checkingForUpdates = false;
            this.notifyRenderer('update-error', error);
        });

        autoUpdater.on('download-progress', (progress) => {
            console.log('Download progress:', progress);
            this.notifyRenderer('update-download-progress', progress);
        });

        autoUpdater.on('update-downloaded', (info) => {
            console.log('Update downloaded:', info);
            this.updateDownloaded = true;
            this.notifyRenderer('update-downloaded', info);
            
            // Show notification to user
            this.showUpdateReadyDialog();
        });
    }

    async initialize() {
        if (this.autoUpdateEnabled) {
            // Check for updates on startup
            setTimeout(() => {
                this.checkForUpdates();
            }, 5000); // Wait 5 seconds after startup

            // Set up periodic update checks (every hour)
            this.updateCheckInterval = setInterval(() => {
                this.checkForUpdates();
            }, 3600000); // 1 hour
        }
    }

    async checkForUpdates() {
        if (this.checkingForUpdates) {
            console.log('Already checking for updates');
            return;
        }

        try {
            console.log('Manually checking for updates...');
            await autoUpdater.checkForUpdatesAndNotify();
        } catch (error) {
            console.error('Failed to check for updates:', error);
        }
    }

    async downloadUpdate() {
        if (!this.updateAvailable) {
            throw new Error('No update available to download');
        }

        try {
            console.log('Downloading update...');
            await autoUpdater.downloadUpdate();
        } catch (error) {
            console.error('Failed to download update:', error);
            throw error;
        }
    }

    async installUpdate() {
        if (!this.updateDownloaded) {
            throw new Error('No update downloaded to install');
        }

        try {
            console.log('Installing update...');
            autoUpdater.quitAndInstall();
        } catch (error) {
            console.error('Failed to install update:', error);
            throw error;
        }
    }

    showUpdateReadyDialog() {
        if (!this.mainWindow) return;

        const options = {
            type: 'info',
            title: 'Update Ready',
            message: 'A new version of SP5Proxy Desktop has been downloaded.',
            detail: 'The update will be installed when you restart the application. Would you like to restart now?',
            buttons: ['Restart Now', 'Later'],
            defaultId: 0,
            cancelId: 1
        };

        dialog.showMessageBox(this.mainWindow, options).then((result) => {
            if (result.response === 0) {
                // User chose to restart now
                this.installUpdate();
            }
        });
    }

    notifyRenderer(event, data = null) {
        if (this.mainWindow && this.mainWindow.webContents) {
            this.mainWindow.webContents.send(event, data);
        }
    }

    setAutoUpdateEnabled(enabled) {
        this.autoUpdateEnabled = enabled;
        
        if (enabled && !this.updateCheckInterval) {
            this.updateCheckInterval = setInterval(() => {
                this.checkForUpdates();
            }, 3600000);
        } else if (!enabled && this.updateCheckInterval) {
            clearInterval(this.updateCheckInterval);
            this.updateCheckInterval = null;
        }
    }

    getUpdateStatus() {
        return {
            updateAvailable: this.updateAvailable,
            updateDownloaded: this.updateDownloaded,
            checkingForUpdates: this.checkingForUpdates,
            autoUpdateEnabled: this.autoUpdateEnabled,
            currentVersion: require('../package.json').version
        };
    }

    async getLatestVersion() {
        try {
            const axios = require('axios');
            const response = await axios.get('https://api.github.com/repos/sp5proxy/sp5proxy-desktop/releases/latest');
            return response.data.tag_name;
        } catch (error) {
            console.error('Failed to get latest version:', error);
            return null;
        }
    }

    async getUpdateHistory() {
        try {
            const axios = require('axios');
            const response = await axios.get('https://api.github.com/repos/sp5proxy/sp5proxy-desktop/releases');
            return response.data.map(release => ({
                version: release.tag_name,
                name: release.name,
                publishedAt: release.published_at,
                body: release.body,
                downloadUrl: release.assets[0]?.browser_download_url
            }));
        } catch (error) {
            console.error('Failed to get update history:', error);
            return [];
        }
    }

    cleanup() {
        if (this.updateCheckInterval) {
            clearInterval(this.updateCheckInterval);
            this.updateCheckInterval = null;
        }
    }
}

module.exports = UpdateManager;
