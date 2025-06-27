import React, { useState, useEffect } from 'react';
import ProgressIndicator from '../common/ProgressIndicator';
import { useElectronAPI } from '../../hooks/useElectronAPI';
import './ConnectionStatus.css';

const ConnectionStatus = ({ 
    isConnected, 
    isConnecting, 
    currentConfig, 
    connectionProgress,
    onRefreshIP 
}) => {
    const [externalIP, setExternalIP] = useState('Checking...');
    const [locationInfo, setLocationInfo] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const { electronAPI } = useElectronAPI();

    // Refresh IP on connection status change
    useEffect(() => {
        refreshExternalIP();
    }, [isConnected]);

    // Listen for automatic IP updates from main process
    useEffect(() => {
        if (!electronAPI) return;

        const handleIPUpdate = (data) => {
            console.log('🔄 Received IP update:', data);
            setExternalIP(data.ip);
            // Trigger location update
            refreshLocationInfo(data.ip);
        };

        const handleTriggerUpdate = () => {
            console.log('🔄 Triggered IP refresh from main process');
            refreshExternalIP();
        };

        // Listen for IP updates
        if (electronAPI.onIPUpdated) {
            electronAPI.onIPUpdated(handleIPUpdate);
        }

        // Listen for trigger updates
        if (electronAPI.onTriggerIPLocationUpdate) {
            electronAPI.onTriggerIPLocationUpdate(handleTriggerUpdate);
        }

        // Cleanup listeners on unmount
        return () => {
            if (electronAPI.removeIPUpdatedListener) {
                electronAPI.removeIPUpdatedListener(handleIPUpdate);
            }
            if (electronAPI.removeTriggerIPLocationUpdateListener) {
                electronAPI.removeTriggerIPLocationUpdateListener(handleTriggerUpdate);
            }
        };
    }, [electronAPI]);

    const refreshLocationInfo = async (ip) => {
        if (!electronAPI || !ip) return;

        try {
            const locationResult = await electronAPI.getLocationInfo(ip);
            if (locationResult.success) {
                setLocationInfo(locationResult.data);
            }
        } catch (locationError) {
            console.warn('Failed to get location info:', locationError);
        }
    };

    const refreshExternalIP = async () => {
        if (!electronAPI) return;

        setIsRefreshing(true);
        try {
            const result = await electronAPI.getExternalIP();
            if (result.success && result.ip) {
                setExternalIP(result.ip);

                // Get location info for the IP
                await refreshLocationInfo(result.ip);
            } else {
                setExternalIP('Unable to detect');
            }
        } catch (error) {
            console.error('Failed to refresh IP:', error);
            setExternalIP('Network error');
        } finally {
            setIsRefreshing(false);
        }
    };

    const getConnectionStatusInfo = () => {
        if (isConnecting) {
            return {
                status: 'Connecting',
                className: 'status-connecting',
                iconClass: 'status-icon-connecting'
            };
        } else if (isConnected) {
            return {
                status: 'Connected',
                className: 'status-connected',
                iconClass: 'status-icon-connected'
            };
        } else {
            return {
                status: 'Disconnected',
                className: 'status-disconnected',
                iconClass: 'status-icon-disconnected'
            };
        }
    };

    const statusInfo = getConnectionStatusInfo();

    return (
        <div className="connection-status">
            <div className="panel-header">
                <h2>Connection Status</h2>
                <button 
                    className="btn btn-secondary btn-small"
                    onClick={refreshExternalIP}
                    disabled={isRefreshing}
                    title="Refresh IP address"
                >
                    <span className={`icon-refresh ${isRefreshing ? 'spinning' : ''}`}></span>
                    Refresh
                </button>
            </div>

            <div className="status-content">
                <div className="status-indicator">
                    <div className={`status-badge ${statusInfo.className}`}>
                        <span className={`status-icon ${statusInfo.iconClass}`}></span>
                        <span className="status-text">{statusInfo.status}</span>
                    </div>
                </div>

                {isConnecting && connectionProgress && (
                    <div className="connection-progress">
                        <ProgressIndicator 
                            progress={connectionProgress.progress}
                            message={connectionProgress.message}
                            step={connectionProgress.step}
                            total={connectionProgress.total}
                        />
                    </div>
                )}

                <div className="status-details">
                    <div className="detail-item">
                        <label>External IP:</label>
                        <span className={`ip-address ${isRefreshing ? 'refreshing' : ''}`}>
                            {externalIP}
                        </span>
                    </div>

                    {locationInfo && (
                        <div className="detail-item">
                            <label>Location:</label>
                            <span className="location-info">
                                {locationInfo.city}, {locationInfo.region}, {locationInfo.country}
                                {locationInfo.org && (
                                    <small className="org-info">({locationInfo.org})</small>
                                )}
                            </span>
                        </div>
                    )}

                    {currentConfig && isConnected && (
                        <div className="detail-item">
                            <label>Proxy Server:</label>
                            <span className="proxy-info">
                                {currentConfig.host}:{currentConfig.port} ({currentConfig.type.toUpperCase()})
                            </span>
                        </div>
                    )}
                </div>

                {isConnected && (
                    <div className="connection-features">
                        <div className="feature-item active">
                            <span className="feature-icon icon-shield"></span>
                            <span className="feature-text">Traffic Encrypted</span>
                        </div>
                        <div className="feature-item active">
                            <span className="feature-icon icon-globe"></span>
                            <span className="feature-text">DNS Leak Protection</span>
                        </div>
                        <div className="feature-item active">
                            <span className="feature-icon icon-lock"></span>
                            <span className="feature-text">IP Address Hidden</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ConnectionStatus;
