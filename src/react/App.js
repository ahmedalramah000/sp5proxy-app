import React, { useState, useEffect } from 'react';
import './styles/production.css';

// Production SP5Proxy Desktop Component - No demo content

// Production Error Boundary
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        console.error('❌ React Error Boundary caught error:', error);
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('❌ React Error Details:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    minHeight: '100vh',
                    backgroundColor: '#1a1a1a',
                    color: 'white',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'Arial, sans-serif'
                }}>
                    <h1>❌ Application Error</h1>
                    <p>An unexpected error occurred. Please try reloading the application.</p>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Reload
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

// Header Component
const Header = ({ adminStatus, onRequestElevation }) => (
    <>
        {/* Admin Warning Banner */}
        <div className="admin-warning-banner">
            <div className="warning-content">
                <div className="warning-icon">⚠️</div>
                <div className="warning-messages">
                    <div className="warning-message-ar">
                        يجب تشغيل التطبيق كمدير (Administrator) ليعمل معك بشكل صحيح
                    </div>
                    <div className="warning-message-en">
                        This application must be run as Administrator to work properly
                    </div>
                </div>
            </div>
        </div>
        
        <header className="app-header">
            <div className="header-content">
                <div className="header-left">
                    <h1 className="app-title">
                        <span className="app-icon professional-shield-icon"></span>
                        SP5Proxy Desktop
                    </h1>
                </div>
            </div>
        </header>
    </>
);

// Proxy Configuration Component
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
        password: '',
        ...currentConfig
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        if (isConnected) {
            onDisconnect();
        } else {
            onConnect(config);
        }
    };

    const handleSave = () => {
        onSaveConfig(config);
    };

    const handleLoad = async () => {
        const result = await onLoadConfig();
        if (result.success && result.config) {
            setConfig(result.config);
        }
    };

    return (
        <div className="proxy-configuration">
            <div className="config-header">
                <h2>Proxy Configuration</h2>
                <div className="config-actions">
                    <button onClick={handleSave} className="btn-secondary">Save</button>
                    <button onClick={handleLoad} className="btn-secondary">Load</button>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="config-form">
                <div className="form-row">
                    <div className="form-group">
                        <label>Proxy Host</label>
                        <input
                            type="text"
                            value={config.host}
                            onChange={(e) => setConfig({...config, host: e.target.value})}
                            placeholder="proxy.example.com"
                            required
                            disabled={isConnected || isConnecting}
                        />
                    </div>
                    <div className="form-group">
                        <label>Port</label>
                        <input
                            type="number"
                            value={config.port}
                            onChange={(e) => setConfig({...config, port: e.target.value})}
                            placeholder="1080"
                            required
                            disabled={isConnected || isConnecting}
                        />
                    </div>
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label>Proxy Type</label>
                        <select
                            value={config.type}
                            onChange={(e) => setConfig({...config, type: e.target.value})}
                            disabled={isConnected || isConnecting}
                        >
                            <option value="socks5">SOCKS5</option>
                            <option value="http">HTTP</option>
                            <option value="https">HTTPS</option>
                        </select>
                    </div>
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label>Username (Optional)</label>
                        <input
                            type="text"
                            value={config.username}
                            onChange={(e) => setConfig({...config, username: e.target.value})}
                            placeholder="username"
                            disabled={isConnected || isConnecting}
                        />
                    </div>
                    <div className="form-group">
                        <label>Password (Optional)</label>
                        <input
                            type="password"
                            value={config.password}
                            onChange={(e) => setConfig({...config, password: e.target.value})}
                            placeholder="password"
                            disabled={isConnected || isConnecting}
                        />
                    </div>
                </div>

                <div className="form-actions">
                    <button
                        type="submit"
                        className={`btn-primary ${isConnected ? 'disconnect' : 'connect'}`}
                        disabled={isConnecting}
                    >
                        {isConnecting ? 'Connecting...' : isConnected ? 'Disconnect' : 'Connect'}
                    </button>
                </div>
            </form>
        </div>
    );
};

// Connection Status Component
const ConnectionStatus = ({
    isConnected,
    isConnecting,
    currentConfig,
    connectionProgress,
    onRefreshIP
}) => {
    const [externalIP, setExternalIP] = useState('Checking...');

    useEffect(() => {
        if (isConnected) {
            onRefreshIP().then(ip => setExternalIP(ip || 'Unknown'));
        } else {
            setExternalIP('Not Connected');
        }
    }, [isConnected, onRefreshIP]);

    return (
        <div className="connection-status">
            <h2>Connection Status</h2>

            <div className={`status-indicator ${isConnected ? 'connected' : isConnecting ? 'connecting' : 'disconnected'}`}>
                <div className="status-icon">
                    {isConnected ? '🟢' : isConnecting ? '🟡' : '🔴'}
                </div>
                <div className="status-text">
                    {isConnected ? 'Connected' : isConnecting ? 'Connecting' : 'Disconnected'}
                </div>
            </div>

            {isConnecting && connectionProgress && (
                <div className="connection-progress">
                    <div className="progress-bar">
                        <div
                            className="progress-fill"
                            style={{ width: `${connectionProgress.percentage || 0}%` }}
                        />
                    </div>
                    <div className="progress-text">
                        {connectionProgress.message || 'Establishing connection...'}
                    </div>
                </div>
            )}

            {isConnected && currentConfig && (
                <div className="connection-details">
                    <div className="detail-item">
                        <span className="detail-label">Proxy Server:</span>
                        <span className="detail-value">{currentConfig.host}:{currentConfig.port}</span>
                    </div>
                    <div className="detail-item">
                        <span className="detail-label">Protocol:</span>
                        <span className="detail-value">{currentConfig.type.toUpperCase()}</span>
                    </div>
                    <div className="detail-item">
                        <span className="detail-label">External IP:</span>
                        <span className="detail-value">{externalIP}</span>
                    </div>
                </div>
            )}
        </div>
    );
};

// Monetization Panel Component
const MonetizationPanel = () => {
    const [timeRemaining, setTimeRemaining] = useState(null);
    const [isTrialActive, setIsTrialActive] = useState(false);


    useEffect(() => {
        // Check monetization status
        if (window.electronAPI?.getMonetizationStatus) {
            window.electronAPI.getMonetizationStatus().then(status => {
                setTimeRemaining(status.timeRemaining);
                setIsTrialActive(status.isActive);
            });
        }
    }, []);

    const handleStartTrial = async () => {
        if (window.electronAPI?.startFreeTrial) {
            const result = await window.electronAPI.startFreeTrial();
            if (result.success) {
                setIsTrialActive(true);
                setTimeRemaining(result.timeRemaining);
            }
        }
    };

    // URL-based extension - redirect to configured URL
    const handleExtendTime = async () => {
        try {
            if (window.electronAPI?.startUrlExtension) {
                const result = await window.electronAPI.startUrlExtension();
                if (result.success) {
                    console.log('✅ URL extension started:', result);
                    // Show success notification with clear instructions
                    alert('🔗 Extension process started!\n\n🤖 The system works AUTOMATICALLY - no manual action needed!\n\nA new window has opened and will complete the task automatically in 30-60 seconds. You will then receive 6 hours of additional connection time.\n\n✅ Just wait and watch - it handles everything for you!');
                } else {
                    console.error('❌ URL extension failed:', result.message);
                    alert(`❌ Extension Failed\n\n${result.message}\n\nPlease try again or contact support if the problem persists.`);
                }
            } else {
                console.warn('⚠️ URL extension API not available');
                alert('⚠️ URL extension is not available in this version.\n\nPlease update your application to use this feature.');
            }
        } catch (error) {
            console.error('❌ URL extension error:', error);
            alert(`❌ Extension Error\n\n${error.message}\n\nPlease try again or restart the application.`);
        }
    };

    const formatTime = (seconds) => {
        if (!seconds) return '00:00';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="monetization-panel">
            <h2>Connection Time</h2>

            <div className="time-display">
                <div className="time-remaining">
                    {timeRemaining ? formatTime(timeRemaining) : '--:--'}
                </div>
                <div className="time-label">
                    {isTrialActive ? 'Trial Time Remaining' : 'No Active Session'}
                </div>
            </div>

            {!isTrialActive && (
                <div className="trial-section">
                    <button onClick={handleStartTrial} className="btn-primary">
                        Start 10-Minute Free Trial
                    </button>
                </div>
            )}

            <div className="extension-section">
                <h3>Extend Connection Time</h3>
                <div className="extension-methods">
                    <div className="url-extension">
                        <button
                            onClick={handleExtendTime}
                            className="btn-primary extension-btn"
                            disabled={!isTrialActive}
                        >
                            🔗 Get 6 More Hours
                        </button>
                        <p className="extension-description">
                            Click to open a simple task in a new window. Complete it to automatically receive 6 hours of additional connection time.
                        </p>
                        <div className="extension-info">
                            <small>✅ Automatic completion detection</small>
                            <small>⏱️ Completes in 30-60 seconds</small>
                            <small>🖥️ Opens in embedded window</small>
                        </div>
                        <div className="extension-features" style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                            <span className="feature">🤖 Works automatically</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Notification System Component
const NotificationSystem = ({ notifications, onClearNotifications }) => {
    if (!notifications || notifications.length === 0) return null;

    return (
        <div className="notification-system">
            {notifications.map((notification, index) => (
                <div
                    key={index}
                    className={`notification ${notification.type}`}
                >
                    <div className="notification-content">
                        <span className="notification-icon">
                            {notification.type === 'success' ? '✅' :
                             notification.type === 'error' ? '❌' :
                             notification.type === 'warning' ? '⚠️' : 'ℹ️'}
                        </span>
                        <span className="notification-message">
                            {notification.message}
                        </span>
                    </div>
                </div>
            ))}
            <button
                className="clear-notifications"
                onClick={onClearNotifications}
            >
                Clear All
            </button>
        </div>
    );
};

// Loading Overlay Component
const LoadingOverlay = ({ message }) => (
    <div className="loading-overlay">
        <div className="loading-content">
            <div className="loading-spinner"></div>
            <div className="loading-message">{message || 'Loading...'}</div>
        </div>
    </div>
);

// Production App Component with Full Functionality
const App = () => {
    console.log('🎨 App component rendering...');

    // Application state
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState(null);

    // Proxy configuration state
    const [proxyConfig, setProxyConfig] = useState({
        host: '',
        port: '',
        type: 'socks5',
        username: '',
        password: ''
    });

    // Connection state
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('disconnected');

    // External IP and location state
    const [externalIP, setExternalIP] = useState('Not Connected');
    const [location, setLocation] = useState('Unknown');
    const [countryFlag, setCountryFlag] = useState('🌐');

    // Safe state setters to prevent object rendering errors
    const safeSetExternalIP = (value) => {
        const safeValue = typeof value === 'string' ? value : 'Invalid IP';
        setExternalIP(safeValue);
    };

    const safeSetLocation = (value) => {
        const safeValue = typeof value === 'string' ? value : 'Unknown';
        setLocation(safeValue);
    };

    const safeSetCountryFlag = (value) => {
        const safeValue = typeof value === 'string' ? value : '🌐';
        setCountryFlag(safeValue);
    };

    // Admin status state
    const [adminStatus, setAdminStatus] = useState({
        hasAdminRights: false,
        isLimitedAdmin: true,
        canElevate: true
    });

    // Monetization state
    const [timeRemaining, setTimeRemaining] = useState(null);
    const [isTrialActive, setIsTrialActive] = useState(false);
    const [monetizationTimer, setMonetizationTimer] = useState(null);


    const [showAdminPanel, setShowAdminPanel] = useState(false);
    const [adminUrls, setAdminUrls] = useState([]);

    useEffect(() => {
        console.log('🔄 App component mounted');
        console.log('🔍 App useEffect triggered at:', new Date().toISOString());
        console.log('🔍 Window object available:', typeof window !== 'undefined');
        console.log('🔍 hideLoadingScreen function available:', typeof window.hideLoadingScreen);

        // Initialize application
        const initializeApp = async () => {
            try {
                console.log('🚀 Initializing SP5Proxy Desktop...');

                // Check for Electron API
                if (window.electronAPI) {
                    console.log('✅ Electron API available');

                    // Load initial status
                    try {
                        const status = await window.electronAPI.getStatus();
                        if (status) {
                            setIsConnected(status.isConnected || false);
                            setConnectionStatus(status.isConnected ? 'connected' : 'disconnected');
                        }
                    } catch (apiError) {
                        console.log('⚠️ API call failed, using defaults:', apiError.message);
                    }

                    // Check admin status
                    try {
                        const adminRights = await window.electronAPI.checkAdminRights();
                        setAdminStatus({
                            hasAdminRights: adminRights === true,
                            isLimitedAdmin: adminRights === 'limited-admin',
                            canElevate: adminRights === 'limited-admin' || adminRights === true
                        });
                    } catch (adminError) {
                        console.log('⚠️ Admin check failed, using defaults:', adminError.message);
                    }

                    // Load saved proxy configuration
                    try {
                        const savedConfig = await window.electronAPI.loadProxyConfig();
                        if (savedConfig && savedConfig.success && savedConfig.config) {
                            console.log('📋 Loading saved proxy config:', savedConfig.config);
                            setProxyConfig({
                                host: savedConfig.config.host || '',
                                port: savedConfig.config.port ? savedConfig.config.port.toString() : '',
                                type: savedConfig.config.type || 'socks5',
                                username: savedConfig.config.username || '',
                                password: savedConfig.config.password || ''
                            });
                        }
                    } catch (configError) {
                        console.log('⚠️ Failed to load saved config:', configError.message);
                    }

                    // Get external IP
                    updateExternalIP();

                    // Setup monetization event listeners
                    setupMonetizationListeners();
                } else {
                    console.log('⚠️ Electron API not available, running in browser mode');
                }

                setIsReady(true);
                console.log('✅ App initialized successfully');

                // Hide loading screen now that React app is ready
                setTimeout(() => {
                    console.log('🎯 Calling hideLoadingScreen from React App...');
                    if (window.hideLoadingScreen) {
                        window.hideLoadingScreen();
                    } else {
                        console.error('❌ hideLoadingScreen function not found!');
                        // Fallback: manually hide loading screen
                        document.body.classList.add('app-ready');
                        if (window.electronAPI && window.electronAPI.notifyReactReady) {
                            window.electronAPI.notifyReactReady();
                        }
                    }
                }, 1000); // Increased delay to ensure UI is fully rendered
            } catch (err) {
                console.error('❌ App initialization error:', err);
                setError(err.message);
                setIsReady(true); // Still show UI even if initialization fails

                // Hide loading screen even if initialization fails
                setTimeout(() => {
                    if (window.hideLoadingScreen) {
                        window.hideLoadingScreen();
                    }
                }, 500);
            }
        };

        initializeApp();

        // Cleanup on unmount
        return () => {
            if (monetizationTimer) {
                clearInterval(monetizationTimer);
            }
        };
    }, []);

    // Update external IP
    const updateExternalIP = async () => {
        try {
            if (window.electronAPI?.getExternalIP) {
                const response = await window.electronAPI.getExternalIP();
                console.log('🔍 External IP response:', response);

                // Handle both string and object responses
                let ipAddress = null;
                if (typeof response === 'string') {
                    ipAddress = response;
                } else if (response && typeof response === 'object') {
                    // Handle object response like {success: true, ip: "1.2.3.4"}
                    ipAddress = response.ip || response.address || response.externalIP;
                }

                if (ipAddress && typeof ipAddress === 'string' && ipAddress !== externalIP) {
                    safeSetExternalIP(ipAddress);
                    console.log('✅ External IP updated:', ipAddress);

                    // Get location info
                    if (window.electronAPI?.getLocationInfo) {
                        try {
                            const locationInfo = await window.electronAPI.getLocationInfo(ipAddress);
                            console.log('🌍 Location info received:', locationInfo);
                            
                            if (locationInfo) {
                                // Handle both success and error cases
                                const country = locationInfo.country || 'Unknown';
                                const flag = locationInfo.flag || '🌐';
                                const city = locationInfo.city || '';
                                const region = locationInfo.region || '';
                                
                                // Build location string
                                let locationString = country;
                                if (city && region) {
                                    locationString = `${city}, ${region}, ${country}`;
                                } else if (city) {
                                    locationString = `${city}, ${country}`;
                                } else if (region) {
                                    locationString = `${region}, ${country}`;
                                }
                                
                                safeSetLocation(locationString);
                                safeSetCountryFlag(flag);
                                console.log('✅ Location updated:', locationString, flag);
                                
                                // Update session location in database if connected
                                if (isConnected && window.electronAPI?.updateSessionLocation) {
                                    try {
                                        await window.electronAPI.updateSessionLocation(ipAddress, locationInfo);
                                        console.log('📍 Session location updated in database');
                                    } catch (updateError) {
                                        console.warn('⚠️ Failed to update session location:', updateError.message);
                                    }
                                }
                            }
                        } catch (locationError) {
                            console.log('⚠️ Failed to get location info:', locationError.message);
                            safeSetLocation('Unknown');
                            safeSetCountryFlag('🌐');
                        }
                    }
                } else {
                    console.log('⚠️ Invalid IP response:', response);
                    safeSetExternalIP('Unable to detect');
                }
            }
        } catch (error) {
            console.log('⚠️ Failed to get external IP:', error.message);
            safeSetExternalIP('Error detecting IP');
        }
    };

    // Handle proxy configuration changes
    const handleConfigChange = (field, value) => {
        // Handle port field specially to ensure it's treated as a number
        if (field === 'port') {
            // Keep as string for input display, but validate it's a valid number
            const numValue = parseInt(value);
            if (value === '' || (!isNaN(numValue) && numValue >= 1 && numValue <= 65535)) {
                setProxyConfig(prev => ({
                    ...prev,
                    [field]: value
                }));
            }
            // If invalid, don't update the state (prevents invalid input)
        } else {
            setProxyConfig(prev => ({
                ...prev,
                [field]: value
            }));
        }
    };

    // Handle proxy connection
    const handleConnect = async () => {
        if (isConnecting) return;

        // Handle disconnect if already connected
        if (isConnected) {
            console.log('🔌 Disconnecting proxy...');
            setIsConnecting(true);
            
            try {
                if (window.electronAPI?.disconnectProxy) {
                    // Show immediate UI feedback
                    setConnectionStatus('disconnecting');
                    setExternalIP('Disconnecting...');
                    setLocation('Disconnecting...');
                    setCountryFlag('🔄');

                    const result = await window.electronAPI.disconnectProxy();
                    if (result.success) {
                        setIsConnected(false);
                        setConnectionStatus('disconnected');
                        setIsTrialActive(false);
                        setTimeRemaining(null);

                        // IMPORTANT: Stop monetization timer on disconnect
                        console.log('⏹️ Stopping monetization timer on disconnect');
                        stopMonetizationTimer();

                        // Clear proxy-related UI data immediately
                        setExternalIP('Detecting real IP...');
                        setLocation('Detecting...');
                        setCountryFlag('🌐');

                        console.log('✅ Proxy disconnected successfully');

                        // The proxy-disconnected event handler will update with real IP
                    } else {
                        throw new Error(result.message || 'Disconnect failed');
                    }
                } else {
                    throw new Error('Electron API not available - cannot disconnect proxy');
                }
            } catch (error) {
                console.error('❌ Disconnect failed:', error);
                alert(`Disconnect failed: ${error.message}`);

                // Reset UI state on error
                setConnectionStatus(isConnected ? 'connected' : 'disconnected');
                setExternalIP('Error detecting IP');
                setLocation('Unknown');
                setCountryFlag('❌');
            }
            
            setIsConnecting(false);
            return;
        }

        const port = parseInt(proxyConfig.port);
        if (isNaN(port) || port < 1 || port > 65535) {
            alert('Port must be a number between 1 and 65535');
            return;
        }

        if (!proxyConfig.host.trim()) {
            alert('Please enter a proxy host');
            return;
        }

        setIsConnecting(true);
        setConnectionStatus('connecting');

        try {
            // Prepare config with proper data types
            const configToSend = {
                host: proxyConfig.host.trim(),
                port: port, // Ensure port is a number
                type: proxyConfig.type,
                username: proxyConfig.username.trim(),
                password: proxyConfig.password
            };

            console.log('🔄 Attempting proxy connection with config:', {
                host: configToSend.host,
                port: configToSend.port,
                type: configToSend.type,
                hasUsername: !!configToSend.username,
                hasPassword: !!configToSend.password
            });

            if (window.electronAPI?.connectProxy) {
                const result = await window.electronAPI.connectProxy(configToSend);
                if (result.success) {
                    setIsConnected(true);
                    setConnectionStatus('connected');

                    // Automatically start 10-minute trial timer
                    console.log('🎯 Starting 10-minute trial timer automatically');
                    setIsTrialActive(true);
                    setTimeRemaining(600); // 10 minutes in seconds
                    startMonetizationTimer();

                    // Clear current IP/location to show loading state
                    setExternalIP('Detecting proxy IP...');
                    setLocation('Detecting...');
                    setCountryFlag('🌐');

                    // Update IP after connection with multiple attempts
                    setTimeout(updateExternalIP, 2000);
                    setTimeout(updateExternalIP, 5000); // Second attempt in case first fails
                    console.log('✅ Proxy connection successful - Trial timer started');
                } else {
                    throw new Error(result.message || result.error || 'Connection failed');
                }
            } else {
                throw new Error('Electron API not available - cannot connect to proxy');
            }
        } catch (error) {
            console.error('❌ Connection failed:', error);

            // Provide more specific error messages
            let errorMessage = error.message || 'Unknown connection error';

            // Handle common error cases
            if (errorMessage.includes('timeout')) {
                errorMessage = 'Connection timeout - please check proxy server address and port';
            } else if (errorMessage.includes('ECONNREFUSED')) {
                errorMessage = 'Connection refused - proxy server may be offline or port is incorrect';
            } else if (errorMessage.includes('authentication')) {
                errorMessage = 'Authentication failed - please check username and password';
            } else if (errorMessage.includes('TCP connection failed')) {
                errorMessage = 'Cannot reach proxy server - please check host and port';
            } else if (errorMessage.includes('Port must be a number')) {
                errorMessage = 'Invalid port number - please enter a valid port (1-65535)';
            }

            alert(`Connection failed: ${errorMessage}`);
            setConnectionStatus('disconnected');
        }
        setIsConnecting(false);
    };

    // Handle admin elevation
    const handleRequestElevation = async () => {
        try {
            if (window.electronAPI?.requestElevation) {
                await window.electronAPI.requestElevation();
            } else {
                alert('Admin elevation not available in browser mode');
            }
        } catch (error) {
            console.error('❌ Elevation failed:', error);
            alert(`Elevation failed: ${error.message}`);
        }
    };

    // Setup monetization event listeners
    const setupMonetizationListeners = () => {
        if (window.electronAPI?.onMonetizationTimeExpired) {
            window.electronAPI.onMonetizationTimeExpired((event, data) => {
                console.log('⚠️ Monetization time expired:', data);

                if (data.type === 'warning_notification') {
                    // Show warning notification (2 minutes before disconnect)
                    alert(`⚠️ Warning: ${data.message}`);
                } else if (data.type === 'extension_warning') {
                    // Show extension warning notification
                    alert(`⚠️ Extension Warning: ${data.message}`);
                }
            });
        }

        if (window.electronAPI?.onMonetizationForceDisconnect) {
            window.electronAPI.onMonetizationForceDisconnect((event, data) => {
                console.log('🔌 Force disconnect:', data);

                // Update UI state immediately
                setIsConnected(false);
                setConnectionStatus('disconnected');
                setIsTrialActive(false);
                setTimeRemaining(null);
                stopMonetizationTimer();

                // Show user notification about disconnection
                if (data.type === 'trial_expired') {
                    alert(`🔌 Free Trial Ended: ${data.message}`);
                } else if (data.type === 'extension_expired') {
                    alert(`🔌 Extension Expired: ${data.message}`);
                } else {
                    alert(`🔌 Disconnected: ${data.message}`);
                }

                // Update external IP after disconnection
                setTimeout(updateExternalIP, 2000);
            });
        }

        // Handle proxy disconnection events
        if (window.electronAPI?.onProxyDisconnected) {
            window.electronAPI.onProxyDisconnected((event, data) => {
                console.log('🔌 Proxy disconnected:', data);

                // Update UI state immediately
                setIsConnected(false);
                setConnectionStatus('disconnected');
                setIsTrialActive(false);
                setTimeRemaining(null);
                stopMonetizationTimer();

                // Clear proxy-related UI data
                if (data.realIP) {
                    console.log('✅ Real IP after disconnect:', data.realIP);
                    setExternalIP(data.realIP);
                    // Clear location to force refresh with real IP location
                    setLocation('Detecting...');
                    setCountryFlag('🌐');

                    // Trigger location update for real IP
                    setTimeout(updateExternalIP, 1000);
                } else {
                    // Fallback if no real IP provided
                    setTimeout(updateExternalIP, 2000);
                }
            });
        }

        // Handle IP update events (for proxy rotation)
        if (window.electronAPI?.onIPUpdated) {
            window.electronAPI.onIPUpdated((event, data) => {
                console.log('🔄 IP updated:', data);

                if (data.ip && data.ip !== externalIP) {
                    console.log(`🔄 IP changed: ${externalIP} → ${data.ip}`);
                    setExternalIP(data.ip);

                    // Clear location to force refresh with new IP location
                    setLocation('Detecting...');
                    setCountryFlag('🌐');

                    // Update location for new IP
                    setTimeout(async () => {
                        try {
                            if (window.electronAPI?.getLocationInfo) {
                                const locationInfo = await window.electronAPI.getLocationInfo(data.ip);
                                if (locationInfo) {
                                    const country = locationInfo.country || 'Unknown';
                                    const flag = locationInfo.flag || '🌐';
                                    const city = locationInfo.city || '';
                                    const region = locationInfo.region || '';

                                    let locationString = country;
                                    if (city && region) {
                                        locationString = `${city}, ${region}, ${country}`;
                                    } else if (city) {
                                        locationString = `${city}, ${country}`;
                                    } else if (region) {
                                        locationString = `${region}, ${country}`;
                                    }

                                    setLocation(locationString);
                                    setCountryFlag(flag);
                                    console.log('✅ Location updated for new IP:', locationString, flag);
                                }
                            }
                        } catch (locationError) {
                            console.warn('⚠️ Failed to update location for new IP:', locationError.message);
                            setLocation('Unknown');
                            setCountryFlag('🌐');
                        }
                    }, 500);
                }
            });
        }

        // Handle trigger IP location update events
        if (window.electronAPI?.onTriggerIPLocationUpdate) {
            window.electronAPI.onTriggerIPLocationUpdate(() => {
                console.log('🔄 Triggered IP location update');
                setTimeout(updateExternalIP, 500);
            });
        }

        // Handle proxy health status changes
        if (window.electronAPI?.onProxyHealthChanged) {
            window.electronAPI.onProxyHealthChanged((event, data) => {
                console.log('🔍 Proxy health status changed:', data);

                if (!data.isHealthy) {
                    console.warn('⚠️ Proxy connection health degraded');

                    // Show visual indicator of connection issues
                    if (isConnected) {
                        setConnectionStatus('connected-unstable');

                        // Update IP if provided
                        if (data.externalIP && data.externalIP !== externalIP) {
                            setExternalIP(data.externalIP);
                            console.log('🔄 Updated IP from health check:', data.externalIP);
                        }

                        // Show user notification about connection issues
                        console.warn('⚠️ Connection may be unstable - monitoring...');
                    }
                } else {
                    console.log('✅ Proxy connection health restored');

                    // Restore normal connection status
                    if (isConnected) {
                        setConnectionStatus('connected');

                        // Update IP if provided
                        if (data.externalIP && data.externalIP !== externalIP) {
                            setExternalIP(data.externalIP);
                            console.log('✅ Updated IP from health restoration:', data.externalIP);
                        }

                        console.log('✅ Connection stability restored');
                    }
                }
            });
        }
    };

    // Start monetization timer
    const startMonetizationTimer = () => {
        if (monetizationTimer) {
            clearInterval(monetizationTimer);
        }

        console.log('⏰ Starting monetization countdown timer');

        const timer = setInterval(async () => {
            try {
                if (window.electronAPI?.monetizationGetConnectionStatus) {
                    const status = await window.electronAPI.monetizationGetConnectionStatus();
                    if (status.connected && status.timeRemaining > 0) {
                        setTimeRemaining(Math.floor(status.timeRemaining / 1000)); // Convert to seconds
                    } else {
                        console.log('⏰ Trial time expired - stopping timer');
                        stopMonetizationTimer();
                        // Show extension panel instead of alert
                        console.log('⚠️ Trial expired - extension options available');
                    }
                } else {
                    // No simulation - stop timer if API not available
                    console.warn('⚠️ Electron API not available for timer updates');
                    stopMonetizationTimer();
                }
            } catch (error) {
                console.error('❌ Timer update failed:', error);
            }
        }, 1000);

        setMonetizationTimer(timer);
    };

    // Stop monetization timer
    const stopMonetizationTimer = () => {
        if (monetizationTimer) {
            clearInterval(monetizationTimer);
            setMonetizationTimer(null);
        }
        setIsTrialActive(false);
        setTimeRemaining(null);
        console.log('⏹️ Monetization timer stopped');
    };





    // Admin panel functions
    const loadAdminUrls = async () => {
        try {
            if (window.electronAPI?.getAdminUrls) {
                const urls = await window.electronAPI.getAdminUrls();
                setAdminUrls(urls || []);
            } else {
                console.warn('⚠️ Admin URLs API not available');
                setAdminUrls([]);
            }
        } catch (error) {
            console.error('❌ Failed to load admin URLs:', error);
        }
    };

    const addAdminUrl = async (url) => {
        try {
            if (window.electronAPI?.addAdminUrl) {
                const result = await window.electronAPI.addAdminUrl(url);
                if (result.success) {
                    await loadAdminUrls();
                }
            } else {
                throw new Error('Admin URLs API not available');
            }
        } catch (error) {
            console.error('❌ Failed to add admin URL:', error);
        }
    };

    const removeAdminUrl = async (id) => {
        try {
            if (window.electronAPI?.removeAdminUrl) {
                const result = await window.electronAPI.removeAdminUrl(id);
                if (result.success) {
                    await loadAdminUrls();
                }
            } else {
                throw new Error('Admin URLs API not available');
            }
        } catch (error) {
            console.error('❌ Failed to remove admin URL:', error);
        }
    };

    const toggleAdminUrl = async (id) => {
        try {
            if (window.electronAPI?.toggleAdminUrl) {
                const result = await window.electronAPI.toggleAdminUrl(id);
                if (result.success) {
                    await loadAdminUrls();
                }
            } else {
                throw new Error('Admin URLs API not available');
            }
        } catch (error) {
            console.error('❌ Failed to toggle admin URL:', error);
        }
    };

    // Handle URL extension (updated from WebView)
    const handleWebViewExtension = async () => {
        try {
            console.log('🔗 Starting URL extension...');

            if (window.electronAPI?.startUrlExtension) {
                const result = await window.electronAPI.startUrlExtension();
                if (result.success) {
                    console.log('✅ URL extension started:', result);
                    // Show success notification
                    alert('Extension process started! Please complete the task in your browser to receive 6 hours of additional time.');
                } else {
                    console.error('❌ URL extension failed:', result.message);
                    alert(`Extension failed: ${result.message}`);
                }
            } else {
                console.warn('⚠️ URL extension API not available');
                alert('URL extension is not available in this version');
            }
        } catch (error) {
            console.error('❌ URL extension error:', error);
            alert(`Extension error: ${error.message}`);
        }
    };

    // Handle trial start (manual start - not needed anymore since it's automatic)
    const handleStartTrial = async () => {
        try {
            if (window.electronAPI?.monetizationGetStatus) {
                // Start the monetization timer in Electron
                const result = await window.electronAPI.monetizationGetStatus();
                if (result) {
                    setIsTrialActive(true);
                    setTimeRemaining(600); // 10 minutes
                    startMonetizationTimer();
                }
            } else {
                throw new Error('Trial API not available');
            }
        } catch (error) {
            console.error('❌ Trial start failed:', error);
            alert(`Failed to start trial: ${error.message}`);
        }
    };

    // Handle extend time - URL-based extension system
    const handleExtendTime = async () => {
        try {
            if (window.electronAPI?.startUrlExtension) {
                const result = await window.electronAPI.startUrlExtension();
                if (result.success) {
                    console.log('✅ URL extension started:', result);
                    // Show success notification with clear instructions
                    alert('🔗 Extension process started!\n\n🤖 The system works AUTOMATICALLY - no manual action needed!\n\nA new window has opened and will complete the task automatically in 30-60 seconds. You will then receive 6 hours of additional connection time.\n\n✅ Just wait and watch - it handles everything for you!');
                } else {
                    console.error('❌ URL extension failed:', result.message);
                    alert(`❌ Extension Failed\n\n${result.message}\n\nPlease try again or contact support if the problem persists.`);
                }
            } else {
                console.warn('⚠️ URL extension API not available');
                alert('⚠️ URL extension is not available in this version.\n\nPlease update your application to use this feature.');
            }
        } catch (error) {
            console.error('❌ URL extension error:', error);
            alert(`❌ Extension Error\n\n${error.message}\n\nPlease try again or restart the application.`);
        }
    };

    // Save proxy configuration
    const handleSaveConfig = async (config) => {
        try {
            console.log('💾 Saving proxy configuration:', config);
            if (window.electronAPI?.saveProxyConfig) {
                const result = await window.electronAPI.saveProxyConfig(config);
                if (result.success) {
                    console.log('✅ Proxy configuration saved');
                    alert('Configuration saved successfully!');
                } else {
                    console.error('❌ Failed to save config:', result.error);
                    alert('Failed to save configuration: ' + result.error);
                }
            } else {
                console.log('⚠️ Save config API not available');
                alert('Save configuration not available');
            }
        } catch (error) {
            console.error('❌ Save config error:', error);
            alert('Save configuration error: ' + error.message);
        }
    };

    // Load proxy configuration
    const handleLoadConfig = async () => {
        try {
            console.log('📋 Loading proxy configuration...');
            if (window.electronAPI?.loadProxyConfig) {
                const result = await window.electronAPI.loadProxyConfig();
                if (result.success && result.config) {
                    console.log('✅ Proxy configuration loaded:', result.config);
                    setProxyConfig({
                        host: result.config.host || '',
                        port: result.config.port ? result.config.port.toString() : '',
                        type: result.config.type || 'socks5',
                        username: result.config.username || '',
                        password: result.config.password || ''
                    });
                    alert('Configuration loaded successfully!');
                    return result;
                } else {
                    console.log('⚠️ No saved configuration found');
                    alert('No saved configuration found');
                    return { success: false };
                }
            } else {
                console.log('⚠️ Load config API not available');
                alert('Load configuration not available');
                return { success: false };
            }
        } catch (error) {
            console.error('❌ Load config error:', error);
            alert('Load configuration error: ' + error.message);
            return { success: false };
        }
    };

    // Test IP synchronization flow
    const testIPSyncFlow = async () => {
        try {
            console.log('🧪 Starting IP synchronization flow test...');

            if (window.electronAPI?.testIPSyncFlow) {
                const result = await window.electronAPI.testIPSyncFlow();

                if (result.success) {
                    console.log('✅ IP sync flow test completed:', result.results);

                    const { results } = result;
                    let message = 'IP Synchronization Test Results:\n\n';
                    message += `✅ IP Detection: ${results.ipDetection ? 'PASSED' : 'FAILED'}\n`;
                    message += `✅ Location Detection: ${results.locationDetection ? 'PASSED' : 'FAILED'}\n`;
                    message += `✅ Proxy Health: ${results.proxyHealth ? 'PASSED' : 'FAILED'}\n`;
                    message += `✅ UI Updates: ${results.uiUpdates ? 'PASSED' : 'FAILED'}\n`;

                    if (results.errors.length > 0) {
                        message += '\nErrors:\n' + results.errors.join('\n');
                    }

                    alert(message);
                } else {
                    throw new Error(result.error || 'Test failed');
                }
            } else {
                throw new Error('Test API not available');
            }
        } catch (error) {
            console.error('❌ IP sync flow test failed:', error);
            alert(`Test failed: ${error.message}`);
        }
    };

    // Handle test UI sync events
    React.useEffect(() => {
        if (window.electronAPI?.onTestUISync) {
            window.electronAPI.onTestUISync((event, data) => {
                console.log('🧪 Test UI sync event received:', data);
            });
        }
    }, []);

    if (error) {
        return (
            <ErrorBoundary>
                <div style={{
                    minHeight: '100vh',
                    backgroundColor: '#1a1a1a',
                    color: 'white',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'Arial, sans-serif'
                }}>
                    <h1>❌ Startup Error</h1>
                    <p>The application failed to start properly. Please try reloading.</p>
                    <button onClick={() => window.location.reload()}>Reload Application</button>
                </div>
            </ErrorBoundary>
        );
    }

    if (!isReady) {
        return (
            <ErrorBoundary>
                <div style={{
                    minHeight: '100vh',
                    backgroundColor: '#1a1a1a',
                    color: 'white',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'Arial, sans-serif'
                }}>
                    <h1>🛡️ SP5Proxy Desktop</h1>
                    <p>Loading...</p>
                </div>
            </ErrorBoundary>
        );
    }

    return (
        <ErrorBoundary>
            <div className="app" data-theme="dark">
                {/* Admin Warning Banner */}
                <div className="admin-warning-banner">
                    <div className="warning-content">
                        <div className="warning-icon">⚠️</div>
                        <div className="warning-messages">
                            <div className="warning-message-ar">
                                يجب تشغيل التطبيق كمدير (Administrator) ليعمل معك بشكل صحيح
                            </div>
                            <div className="warning-message-en">
                                This application must be run as Administrator to work properly
                            </div>
                        </div>
                    </div>
                </div>
                
                <header className="app-header">
                    <div className="header-content">
                        <h1 className="app-title">
                            <span className="app-icon">🛡️</span>
                            SP5Proxy Desktop
                        </h1>
                    </div>
                </header>

                <main className="main-content">
                    <div className="content-grid">
                        <div className="primary-panel">
                            <div className="proxy-configuration">
                                <div className="config-header">
                                    <h2>Proxy Configuration</h2>
                                    <div className="config-actions">
                                        <button 
                                            type="button"
                                            className="btn-secondary"
                                            onClick={() => handleSaveConfig(proxyConfig)}
                                        >
                                            Save
                                        </button>
                                        <button 
                                            type="button"
                                            className="btn-secondary"
                                            onClick={handleLoadConfig}
                                        >
                                            Load
                                        </button>
                                    </div>
                                </div>
                                <form className="config-form">
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Proxy Host</label>
                                            <input
                                                type="text"
                                                placeholder="proxy.example.com"
                                                value={proxyConfig.host}
                                                onChange={(e) => handleConfigChange('host', e.target.value)}
                                                disabled={isConnected || isConnecting}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Port</label>
                                            <input
                                                type="number"
                                                placeholder="1080"
                                                value={proxyConfig.port}
                                                onChange={(e) => handleConfigChange('port', e.target.value)}
                                                disabled={isConnected || isConnecting}
                                            />
                                        </div>
                                    </div>

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Proxy Type</label>
                                            <select
                                                value={proxyConfig.type}
                                                onChange={(e) => handleConfigChange('type', e.target.value)}
                                                disabled={isConnected || isConnecting}
                                            >
                                                <option value="socks5">SOCKS5</option>
                                                <option value="http">HTTP</option>
                                                <option value="https">HTTPS</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Username (Optional)</label>
                                            <input
                                                type="text"
                                                placeholder="username"
                                                value={proxyConfig.username}
                                                onChange={(e) => handleConfigChange('username', e.target.value)}
                                                disabled={isConnected || isConnecting}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Password (Optional)</label>
                                            <input
                                                type="password"
                                                placeholder="password"
                                                value={proxyConfig.password}
                                                onChange={(e) => handleConfigChange('password', e.target.value)}
                                                disabled={isConnected || isConnecting}
                                            />
                                        </div>
                                    </div>

                                    <div className="form-actions">
                                        <button
                                            type="button"
                                            className={`btn-primary ${isConnected ? 'disconnect' : 'connect'}`}
                                            onClick={handleConnect}
                                            disabled={isConnecting}
                                        >
                                            {isConnecting ? 'Connecting...' : isConnected ? 'Disconnect' : 'Connect'}
                                        </button>
                                    </div>
                                </form>
                            </div>

                            <div className="connection-status">
                                <h2>Connection Status</h2>
                                <div className={`status-indicator ${connectionStatus}`}>
                                    <div className="status-icon">
                                        {connectionStatus === 'connected' ? '🟢' :
                                         connectionStatus === 'connected-unstable' ? '🟡' :
                                         connectionStatus === 'connecting' ? '🟡' :
                                         connectionStatus === 'disconnecting' ? '🟠' : '🔴'}
                                    </div>
                                    <div className="status-text">
                                        {connectionStatus === 'connected' ? 'Connected' :
                                         connectionStatus === 'connected-unstable' ? 'Connected (Unstable)' :
                                         connectionStatus === 'connecting' ? 'Connecting' :
                                         connectionStatus === 'disconnecting' ? 'Disconnecting' : 'Disconnected'}
                                    </div>
                                </div>

                                {(isConnecting || connectionStatus === 'disconnecting') && (
                                    <div className="connection-progress">
                                        <div className="progress-bar">
                                            <div className="progress-fill" style={{ width: '60%' }} />
                                        </div>
                                        <div className="progress-text">
                                            {connectionStatus === 'disconnecting' ? 'Disconnecting...' : 'Establishing connection...'}
                                        </div>
                                    </div>
                                )}

                                <div className="connection-details">
                                    <div className="detail-item">
                                        <span className="detail-label">External IP:</span>
                                        <span className="detail-value">
                                            <span className="ip-address">{externalIP}</span>
                                            <span className="country-flag">{countryFlag}</span>
                                        </span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="detail-label">Location:</span>
                                        <span className="detail-value">{location}</span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="detail-label">Proxy Server:</span>
                                        <span className="detail-value">
                                            {isConnected && proxyConfig.host ?
                                                `${proxyConfig.host}:${proxyConfig.port}` :
                                                'Not Connected'}
                                        </span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="detail-label">Protocol:</span>
                                        <span className="detail-value">
                                            {isConnected ? proxyConfig.type.toUpperCase() : 'None'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="secondary-panel">
                            <div className="monetization-panel">
                                <h2>Connection Time</h2>
                                <div className="time-display">
                                    <div className="time-remaining">
                                        {timeRemaining ?
                                            `${Math.floor(timeRemaining / 60).toString().padStart(2, '0')}:${(timeRemaining % 60).toString().padStart(2, '0')}` :
                                            '--:--'}
                                    </div>
                                    <div className="time-label">
                                        {isTrialActive ? 'Trial Time Remaining' : 'No Active Session'}
                                    </div>
                                </div>

                                {!isTrialActive && (
                                    <div className="trial-section">
                                        <button
                                            className="btn-primary"
                                            onClick={handleStartTrial}
                                        >
                                            Start 10-Minute Free Trial
                                        </button>
                                    </div>
                                )}

                                <div className="extension-section">
                                    <h3>Extend Connection Time</h3>
                                    <div className="extension-step">
                                        <p>Click to open a simple task in a new window and automatically receive 6 hours of additional time</p>
                                        <button
                                            className="btn-primary"
                                            onClick={handleExtendTime}
                                            disabled={!isTrialActive}
                                        >
                                            🔗 Get 6 More Hours
                                        </button>
                                        <div className="extension-features" style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                                            <span className="feature">🤖 Works automatically</span>
                                        </div>
                                    </div>
                                </div>

                                {adminStatus.hasAdminRights && (
                                    <div className="admin-section">
                                        <button
                                            className="btn-secondary admin-toggle"
                                            onClick={() => {
                                                setShowAdminPanel(!showAdminPanel);
                                                if (!showAdminPanel) {
                                                    loadAdminUrls();
                                                }
                                            }}
                                        >
                                            ⚙️ Admin Panel
                                        </button>
                                        <button
                                            className="btn-secondary test-button"
                                            onClick={testIPSyncFlow}
                                            title="Test IP synchronization flow"
                                        >
                                            🧪 Test IP Sync
                                        </button>
                                    </div>
                                )}
                            </div>

                            {showAdminPanel && (
                                <div className="admin-panel">
                                    <h2>🔧 Admin URL Management</h2>
                                    <div className="admin-content">
                                        <div className="add-url-section">
                                            <h3>Add New URL Service</h3>
                                            <div className="add-url-form">
                                                <input
                                                    type="url"
                                                    placeholder="https://example.com"
                                                    id="new-admin-url"
                                                    className="form-input"
                                                />
                                                <button
                                                    className="btn-primary"
                                                    onClick={() => {
                                                        const input = document.getElementById('new-admin-url');
                                                        if (input.value.trim()) {
                                                            addAdminUrl(input.value.trim());
                                                            input.value = '';
                                                        }
                                                    }}
                                                >
                                                    ➕ Add URL
                                                </button>
                                            </div>
                                        </div>

                                        <div className="url-list-section">
                                            <h3>URL Services ({adminUrls.length})</h3>
                                            <div className="url-list">
                                                {adminUrls.map(url => (
                                                    <div key={url.id} className={`url-item ${url.active ? 'active' : 'inactive'}`}>
                                                        <div className="url-info">
                                                            <span className="url-text">{url.url}</span>
                                                            <span className={`url-status ${url.active ? 'active' : 'inactive'}`}>
                                                                {url.active ? '✅ Active' : '❌ Inactive'}
                                                            </span>
                                                        </div>
                                                        <div className="url-actions">
                                                            <button
                                                                className={`btn-toggle ${url.active ? 'active' : 'inactive'}`}
                                                                onClick={() => toggleAdminUrl(url.id)}
                                                            >
                                                                {url.active ? '⏸️' : '▶️'}
                                                            </button>
                                                            <button
                                                                className="btn-danger"
                                                                onClick={() => {
                                                                    if (confirm(`Remove ${url.url}?`)) {
                                                                        removeAdminUrl(url.id);
                                                                    }
                                                                }}
                                                            >
                                                                🗑️
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            {adminUrls.length === 0 && (
                                                <div className="empty-state">
                                                    <p>No URL services configured</p>
                                                    <small>Add URL shortener services above</small>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Production: Ad integration removed for clean interface */}
                        </div>
                    </div>
                </main>
                
                {/* Support & Contact Footer */}
                <footer className="app-footer">
                    <div className="footer-content">
                        <div className="support-message">
                            <div className="support-icon">💬</div>
                            <div className="support-text">
                                <div className="support-message-ar">
                                    أي مشكلة أو فكرة تطوير؟ تواصل معنا عبر بوت التليجرام
                                </div>
                                <div className="support-message-en">
                                    Got issues or development ideas? Contact us via Telegram bot
                                </div>
                                <a 
                                    href="https://t.me/Sp5_ShopBot" 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="telegram-link"
                                >
                                    📱 @Sp5_ShopBot
                                </a>
                            </div>
                        </div>
                    </div>
                </footer>
            </div>
        </ErrorBoundary>
    );
};

export default App;
