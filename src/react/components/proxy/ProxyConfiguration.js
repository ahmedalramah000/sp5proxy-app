import React, { useState, useEffect } from 'react';
import ProxyForm from './ProxyForm';
import ConnectionControls from './ConnectionControls';
import './ProxyConfiguration.css';

const ProxyConfiguration = ({ 
    isConnected, 
    isConnecting, 
    currentConfig, 
    onConnect, 
    onDisconnect,
    onSaveConfig,
    onLoadConfig 
}) => {
    const [config, setConfig] = useState({
        host: '',
        port: '',
        type: 'socks5',
        username: '',
        password: ''
    });
    const [isValidConfig, setIsValidConfig] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Load configuration on component mount
    useEffect(() => {
        const loadInitialConfig = async () => {
            try {
                const result = await onLoadConfig();
                if (result.success && result.config) {
                    setConfig(result.config);
                }
            } catch (error) {
                console.error('Failed to load initial config:', error);
            }
        };

        loadInitialConfig();
    }, [onLoadConfig]);

    // Update config when currentConfig changes
    useEffect(() => {
        if (currentConfig) {
            setConfig(currentConfig);
        }
    }, [currentConfig]);

    // Validate configuration
    useEffect(() => {
        const isValid = config.host.trim() !== '' && 
                       config.port.trim() !== '' && 
                       !isNaN(config.port) && 
                       parseInt(config.port) > 0 && 
                       parseInt(config.port) <= 65535;
        setIsValidConfig(isValid);
    }, [config]);

    const handleConfigChange = (newConfig) => {
        setConfig(newConfig);
    };

    const handleConnect = async () => {
        if (!isValidConfig || isConnecting) return;
        
        try {
            await onConnect(config);
        } catch (error) {
            console.error('Connection failed:', error);
        }
    };

    const handleDisconnect = async () => {
        if (!isConnected) return;
        
        try {
            await onDisconnect();
        } catch (error) {
            console.error('Disconnection failed:', error);
        }
    };

    const handleSaveConfig = async () => {
        if (!isValidConfig || isSaving) return;
        
        setIsSaving(true);
        try {
            await onSaveConfig(config);
        } catch (error) {
            console.error('Failed to save config:', error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="proxy-configuration">
            <div className="panel-header">
                <h2>Proxy Configuration</h2>
                <div className="panel-actions">
                    <button 
                        className="btn btn-secondary btn-small"
                        onClick={handleSaveConfig}
                        disabled={!isValidConfig || isSaving || isConnecting}
                        title="Save current configuration"
                    >
                        {isSaving ? '💾 Saving...' : '💾 Save'}
                    </button>
                </div>
            </div>

            <ProxyForm 
                config={config}
                onChange={handleConfigChange}
                disabled={isConnected || isConnecting}
                isValid={isValidConfig}
            />

            <ConnectionControls 
                isConnected={isConnected}
                isConnecting={isConnecting}
                isValidConfig={isValidConfig}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
            />
        </div>
    );
};

export default ProxyConfiguration;
