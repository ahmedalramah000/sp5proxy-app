import { useEffect, useState } from 'react';

export const useElectronAPI = () => {
    const [electronAPI, setElectronAPI] = useState(null);

    useEffect(() => {
        // Access the Electron API from the global window object
        if (window.electronAPI) {
            setElectronAPI(window.electronAPI);
        } else {
            console.error('Electron API not available');
        }
    }, []);

    // Wrapper functions for common API calls with error handling
    const safeAPICall = async (apiFunction, ...args) => {
        try {
            if (!electronAPI) {
                throw new Error('Electron API not available');
            }
            return await apiFunction(...args);
        } catch (error) {
            console.error('API call failed:', error);
            throw error;
        }
    };

    const wrappedAPI = electronAPI ? {
        // Proxy operations
        connectProxy: (config) => safeAPICall(electronAPI.connectProxy, config),
        disconnectProxy: () => safeAPICall(electronAPI.disconnectProxy),
        validateProxy: (config) => safeAPICall(electronAPI.validateProxy, config),

        // Configuration management
        saveProxyConfig: (config) => safeAPICall(electronAPI.saveProxyConfig, config),
        loadProxyConfig: () => safeAPICall(electronAPI.loadProxyConfig),
        getLastProxyConfig: () => safeAPICall(electronAPI.getLastProxyConfig),
        clearProxyConfig: () => safeAPICall(electronAPI.clearProxyConfig),
        saveUIConfig: (config) => safeAPICall(electronAPI.saveUIConfig, config),
        getUIConfig: () => safeAPICall(electronAPI.getUIConfig),

        // Status queries
        getStatus: () => safeAPICall(electronAPI.getStatus),
        getExternalIP: () => safeAPICall(electronAPI.getExternalIP),
        getLocationInfo: (ip) => safeAPICall(electronAPI.getLocationInfo, ip),

        // Admin operations
        checkAdminRights: () => safeAPICall(electronAPI.checkAdminRights),
        refreshAdminStatus: () => safeAPICall(electronAPI.refreshAdminStatus),
        requestElevation: () => safeAPICall(electronAPI.requestElevation),

        // DNS operations
        runDnsLeakTest: () => safeAPICall(electronAPI.runDnsLeakTest),
        emergencyDnsReset: () => safeAPICall(electronAPI.emergencyDnsReset),

        // Monetization
        monetizationGetStatus: () => safeAPICall(electronAPI.monetizationGetStatus),
        monetizationGenerateUrl: () => safeAPICall(electronAPI.monetizationGenerateUrl),
        monetizationValidateCode: (code) => safeAPICall(electronAPI.monetizationValidateCode, code),

        // Event listeners (these don't need wrapping as they're synchronous)
        onAdminStatusUpdated: electronAPI.onAdminStatusUpdated || (() => {}),
        onProxyStatusChanged: electronAPI.onProxyStatusChanged || (() => {}),
        onConnectionProgress: electronAPI.onConnectionProgress || (() => {}),
        onConfigAutoLoaded: electronAPI.onConfigAutoLoaded || (() => {}),
        onUIConfigLoaded: electronAPI.onUIConfigLoaded || (() => {}),
        onAutoConnectReady: electronAPI.onAutoConnectReady || (() => {}),
        onMonetizationTimeExpired: electronAPI.onMonetizationTimeExpired || (() => {}),
        onMonetizationForceDisconnect: electronAPI.onMonetizationForceDisconnect || (() => {}),
        onDnsLeakDetected: electronAPI.onDnsLeakDetected || (() => {}),

        // IP Auto-refresh listeners
        onIPUpdated: electronAPI.onIPUpdated || (() => {}),
        onTriggerIPLocationUpdate: electronAPI.onTriggerIPLocationUpdate || (() => {}),
        removeIPUpdatedListener: electronAPI.removeIPUpdatedListener || (() => {}),
        removeTriggerIPLocationUpdateListener: electronAPI.removeTriggerIPLocationUpdateListener || (() => {}),

        // IP Auto-refresh controls
        startIPRefresh: () => safeAPICall(electronAPI.startIPRefresh),
        stopIPRefresh: () => safeAPICall(electronAPI.stopIPRefresh),
        setIPRefreshInterval: (intervalMs) => safeAPICall(electronAPI.setIPRefreshInterval, intervalMs),

        // Utility
        exitApp: () => safeAPICall(electronAPI.exitApp)
    } : null;

    return {
        electronAPI: wrappedAPI,
        isAPIReady: !!electronAPI
    };
};
