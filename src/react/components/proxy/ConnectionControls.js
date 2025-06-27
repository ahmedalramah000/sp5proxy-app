import React from 'react';
import './ConnectionControls.css';

const ConnectionControls = ({ 
    isConnected, 
    isConnecting, 
    isValidConfig, 
    onConnect, 
    onDisconnect 
}) => {
    const getConnectButtonState = () => {
        if (isConnecting) {
            return {
                text: '🔄 Connecting...',
                disabled: true,
                className: 'btn-connecting'
            };
        } else if (isConnected) {
            return {
                text: '✅ Connected',
                disabled: true,
                className: 'btn-connected'
            };
        } else if (!isValidConfig) {
            return {
                text: '🔌 Connect',
                disabled: true,
                className: 'btn-disabled'
            };
        } else {
            return {
                text: '🔌 Connect',
                disabled: false,
                className: 'btn-primary'
            };
        }
    };

    const getDisconnectButtonState = () => {
        if (isConnecting) {
            return {
                text: '⏹️ Cancel',
                disabled: false,
                className: 'btn-secondary'
            };
        } else if (isConnected) {
            return {
                text: '🔌 Disconnect',
                disabled: false,
                className: 'btn-danger'
            };
        } else {
            return {
                text: '🔌 Disconnect',
                disabled: true,
                className: 'btn-disabled'
            };
        }
    };

    const connectButtonState = getConnectButtonState();
    const disconnectButtonState = getDisconnectButtonState();

    return (
        <div className="connection-controls">
            <div className="control-buttons">
                <button
                    className={`btn ${connectButtonState.className}`}
                    onClick={onConnect}
                    disabled={connectButtonState.disabled}
                    title={
                        !isValidConfig 
                            ? 'Please enter valid proxy configuration' 
                            : isConnecting 
                                ? 'Connection in progress...' 
                                : isConnected 
                                    ? 'Already connected' 
                                    : 'Connect to proxy server'
                    }
                >
                    {connectButtonState.text}
                </button>

                <button
                    className={`btn ${disconnectButtonState.className}`}
                    onClick={onDisconnect}
                    disabled={disconnectButtonState.disabled}
                    title={
                        isConnecting 
                            ? 'Cancel connection attempt' 
                            : isConnected 
                                ? 'Disconnect from proxy server' 
                                : 'Not connected'
                    }
                >
                    {disconnectButtonState.text}
                </button>
            </div>

            <div className="connection-info">
                {!isValidConfig && (
                    <div className="info-message warning">
                        <span className="info-icon">⚠️</span>
                        Please configure proxy settings above
                    </div>
                )}
                
                {isValidConfig && !isConnected && !isConnecting && (
                    <div className="info-message info">
                        <span className="info-icon">ℹ️</span>
                        Ready to connect - Click Connect to start
                    </div>
                )}
                
                {isConnecting && (
                    <div className="info-message connecting">
                        <span className="info-icon">🔄</span>
                        Establishing secure connection...
                    </div>
                )}
                
                {isConnected && (
                    <div className="info-message success">
                        <span className="info-icon">✅</span>
                        Secure connection established
                    </div>
                )}
            </div>
        </div>
    );
};

export default ConnectionControls;
