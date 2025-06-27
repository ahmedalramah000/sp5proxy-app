const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Proxy management
    connectProxy: (config) => ipcRenderer.invoke('connect-proxy', config),
    disconnectProxy: () => ipcRenderer.invoke('disconnect-proxy'),
    
    // Enhanced Configuration management
    saveProxyConfig: (config) => ipcRenderer.invoke('save-proxy-config', config),
    loadProxyConfig: () => ipcRenderer.invoke('load-proxy-config'),
    getLastProxyConfig: () => ipcRenderer.invoke('get-last-proxy-config'),
    clearProxyConfig: () => ipcRenderer.invoke('clear-proxy-config'),
    saveUIConfig: (config) => ipcRenderer.invoke('save-ui-config', config),
    getUIConfig: () => ipcRenderer.invoke('get-ui-config'),
    shouldAutoConnect: () => ipcRenderer.invoke('should-auto-connect'),

    // Legacy support
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    loadConfig: () => ipcRenderer.invoke('load-config'),
    
    // Status queries
    getStatus: () => ipcRenderer.invoke('get-status'),
    getExternalIP: () => ipcRenderer.invoke('get-external-ip'),
    getLocationInfo: (ipAddress) => ipcRenderer.invoke('get-location-info', ipAddress),
    updateSessionLocation: (ipAddress, locationInfo) => ipcRenderer.invoke('update-session-location', ipAddress, locationInfo),
    checkConnectionStatus: () => ipcRenderer.invoke('check-connection-status'),
    
    // System info
    checkAdminRights: () => ipcRenderer.invoke('check-admin-rights'),
    refreshAdminStatus: () => ipcRenderer.invoke('refresh-admin-status'),
    requestElevation: () => ipcRenderer.invoke('request-elevation'),
    openTroubleshootingGuide: () => ipcRenderer.invoke('open-troubleshooting-guide'),
    runFixTunInterface: () => ipcRenderer.invoke('run-fix-tun-interface'),

    // Application control
    exitApp: () => ipcRenderer.invoke('exit-app'),
    restartAsAdmin: () => ipcRenderer.invoke('restart-as-admin'),
    getElevationStatus: () => ipcRenderer.invoke('get-elevation-status'),
    notifyReactReady: () => ipcRenderer.invoke('notify-react-ready'),

    // Proxy validation
    validateProxy: (config) => ipcRenderer.invoke('validate-proxy', config),
    validateProxyWithRetry: (config) => ipcRenderer.invoke('validate-proxy-with-retry', config),
    getValidationResults: () => ipcRenderer.invoke('get-validation-results'),

    // DNS management
    getDnsStatus: () => ipcRenderer.invoke('get-dns-status'),
    emergencyDnsReset: () => ipcRenderer.invoke('emergency-dns-reset'),

    // DNS leak testing
    runDnsLeakTest: () => ipcRenderer.invoke('run-dns-leak-test'),
    getDnsLeakTestResults: () => ipcRenderer.invoke('get-dns-leak-test-results'),
    isDnsLeakTestRunning: () => ipcRenderer.invoke('is-dns-leak-test-running'),
    runDnsConnectivityTest: () => ipcRenderer.invoke('run-dns-connectivity-test'),
    startDnsLeakMonitoring: () => ipcRenderer.invoke('start-dns-leak-monitoring'),
    stopDnsLeakMonitoring: () => ipcRenderer.invoke('stop-dns-leak-monitoring'),
    
    // Event listeners
    onProxyStatusChanged: (callback) => {
        ipcRenderer.on('proxy-status-changed', callback);
    },

    onConnectionProgress: (callback) => {
        ipcRenderer.on('connection-progress', callback);
    },
    
    onUpdateAvailable: (callback) => {
        ipcRenderer.on('update-available', callback);
    },
    
    onUpdateDownloaded: (callback) => {
        ipcRenderer.on('update-downloaded', callback);
    },

    onProxyValidationSuccess: (callback) => {
        ipcRenderer.on('proxy-validation-success', callback);
    },

    onProxyValidationFailed: (callback) => {
        ipcRenderer.on('proxy-validation-failed', callback);
    },

    onElevationRequired: (callback) => {
        ipcRenderer.on('elevation-required', callback);
    },

    onElevationStatus: (callback) => {
        ipcRenderer.on('elevation-status', callback);
    },

    // Monetization system
    monetizationGetStatus: () => ipcRenderer.invoke('monetization-get-status'),
    monetizationGenerateUrl: () => ipcRenderer.invoke('monetization-generate-url'), // Legacy - redirects to URL extension
    monetizationGetConnectionStatus: () => ipcRenderer.invoke('monetization-get-connection-status'),

    // Admin URL management
    getAdminUrls: () => ipcRenderer.invoke('get-admin-urls'),
    addAdminUrl: (url) => ipcRenderer.invoke('add-admin-url', url),
    removeAdminUrl: (id) => ipcRenderer.invoke('remove-admin-url', id),
    toggleAdminUrl: (id) => ipcRenderer.invoke('toggle-admin-url', id),

    onMonetizationTimeExpired: (callback) => {
        ipcRenderer.on('monetization-time-expired', callback);
    },

    onMonetizationForceDisconnect: (callback) => {
        ipcRenderer.on('monetization-force-disconnect', callback);
    },

    onDnsLeakDetected: (callback) => {
        ipcRenderer.on('dns-leak-detected', callback);
    },

    onAdminStatusUpdated: (callback) => {
        ipcRenderer.on('admin-status-updated', callback);
    },

    // Configuration event listeners
    onConfigAutoLoaded: (callback) => {
        ipcRenderer.on('config-auto-loaded', callback);
    },

    onUIConfigLoaded: (callback) => {
        ipcRenderer.on('ui-config-loaded', callback);
    },

    onAutoConnectReady: (callback) => {
        ipcRenderer.on('auto-connect-ready', callback);
    },

    // Additional event listeners for React UI
    onConnectionProgress: (callback) => {
        ipcRenderer.on('connection-progress', callback);
    },

    onProxyStatusChanged: (callback) => {
        ipcRenderer.on('proxy-status-changed', callback);
    },

    onProxyDisconnected: (callback) => {
        ipcRenderer.on('proxy-disconnected', callback);
    },

    onIPUpdated: (callback) => {
        ipcRenderer.on('ip-updated', callback);
    },

    onTriggerIPLocationUpdate: (callback) => {
        ipcRenderer.on('trigger-ip-location-update', callback);
    },

    onProxyHealthChanged: (callback) => {
        ipcRenderer.on('proxy-health-changed', callback);
    },

    onTestUISync: (callback) => {
        ipcRenderer.on('test-ui-sync', callback);
    },

    // URL Extension System
    startUrlExtension: () => ipcRenderer.invoke('start-url-extension'),
    startWebViewExtension: () => ipcRenderer.invoke('start-webview-extension'), // Legacy compatibility
    completeUrlExtension: (sessionId, userId) => ipcRenderer.invoke('complete-url-extension', sessionId, userId),
    getUrlExtensionStatus: (sessionId) => ipcRenderer.invoke('get-url-extension-status', sessionId),
    getActiveUrlExtensions: () => ipcRenderer.invoke('get-active-url-extensions'),
    getUrlExtensionManagerStatus: () => ipcRenderer.invoke('get-url-extension-manager-status'),

    // Testing functions
    testIPSyncFlow: () => ipcRenderer.invoke('test-ip-sync-flow'),

    // Remove listeners
    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    }
});
