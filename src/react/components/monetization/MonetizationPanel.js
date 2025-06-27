import React, { useState, useEffect } from 'react';
import { useElectronAPI } from '../../hooks/useElectronAPI';
import ShortJamboConfig from './ShortJamboConfig';
import './MonetizationPanel.css';

const MonetizationPanel = () => {
    const [status, setStatus] = useState(null);
    const [isExtending, setIsExtending] = useState(false);
    const [showConfig, setShowConfig] = useState(false);
    const [activeExtensions, setActiveExtensions] = useState([]);
    const [showActiveExtensions, setShowActiveExtensions] = useState(false);
    const { electronAPI } = useElectronAPI();

    useEffect(() => {
        loadMonetizationStatus();
        loadActiveExtensions();
    }, [electronAPI]);

    const loadMonetizationStatus = async () => {
        if (!electronAPI) return;

        try {
            const result = await electronAPI.monetizationGetStatus();
            setStatus(result);
        } catch (error) {
            console.error('Failed to load monetization status:', error);
        }
    };

    const loadActiveExtensions = async () => {
        if (!electronAPI) return;

        try {
            const result = await electronAPI.invoke('get-active-url-extensions');
            if (result.success) {
                setActiveExtensions(result.extensions || []);
            }
        } catch (error) {
            console.error('Failed to load active extensions:', error);
        }
    };

    const handleUrlExtension = async () => {
        if (!electronAPI || isExtending) return;

        setIsExtending(true);
        try {
            const result = await electronAPI.startUrlExtension();
            if (result.success) {
                console.log('✅ URL extension started:', result);
                // Show success message with clear instructions
                alert('🎉 Extension Started!\n\nYour browser will open with a simple task. Complete it to receive 6 hours of additional connection time.\n\nThe system will automatically detect completion and add the time to your account.');

                // Reload status after a short delay to reflect any changes
                setTimeout(() => {
                    loadMonetizationStatus();
                    loadActiveExtensions();
                }, 2000);
            } else {
                console.error('❌ URL extension failed:', result.message);
                alert(`❌ Extension Failed\n\n${result.message}\n\nPlease check your internet connection and try again.`);
            }
        } catch (error) {
            console.error('❌ URL extension error:', error);
            alert(`❌ Extension Error\n\n${error.message}\n\nPlease restart the application and try again.`);
        } finally {
            setIsExtending(false);
        }
    };

    const handleMarkCompleted = async (sessionId, userId) => {
        if (!electronAPI) return;

        try {
            const confirmed = window.confirm(
                '🎯 Confirm Extension Completion\n\n' +
                'Did you successfully complete the URL extension task?\n' +
                'This will add 6 hours of connection time to your account.\n\n' +
                'Only confirm if you actually completed the task!'
            );

            if (!confirmed) return;

            const result = await electronAPI.invoke('mark-url-extension-completed', sessionId, userId, 'manual');
            
            if (result.success) {
                alert('✅ Extension Completed!\n\n6 hours have been added to your connection time.');
                loadMonetizationStatus();
                loadActiveExtensions();
            } else {
                alert(`❌ Failed to mark completion:\n${result.message}`);
            }
        } catch (error) {
            console.error('❌ Error marking completion:', error);
            alert(`❌ Error: ${error.message}`);
        }
    };
    const formatTime = (seconds) => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

    if (!status) {
        return (
            <div className="monetization-panel">
                <div className="panel-header">
                    <h3>Connection Time</h3>
                </div>
                <div className="loading-status">Loading...</div>
            </div>
        );
    }

    return (
        <div className="monetization-panel">
            <div className="panel-header">
                <h3>Connection Time</h3>
            </div>

            <div className="monetization-content">
                {status.hasActiveTime ? (
                    <div className="active-time-display">
                        <div className="time-remaining">
                            <span className="time-label">Time Remaining:</span>
                            <span className="time-value">
                                {formatTime(status.remainingTime)}
                            </span>
                        </div>
                        <div className="time-progress">
                            <div
                                className="progress-bar"
                                style={{
                                    width: `${(status.remainingTime / status.totalTime) * 100}%`
                                }}
                            ></div>
                        </div>
                    </div>
                ) : (
                    <div className="trial-info">
                        <div className="trial-message">
                            <span className="trial-icon">⏱️</span>
                            <span>10-minute free trial available</span>
                        </div>
                    </div>
                )}

                <div className="extension-section">
                    <h4>Extend Connection Time</h4>

                    <div className="url-extension">
                        <button
                            className="btn btn-primary"
                            onClick={handleUrlExtension}
                            disabled={isExtending}
                        >
                            {isExtending ? '🔄 Starting Extension...' : '🔗 Get 6 More Hours'}
                        </button>
                        <p className="extension-description">
                            Click to open a simple task in your browser. Complete it to automatically receive 6 hours of additional connection time.
                        </p>
                        {isExtending && (
                            <p className="extension-status">
                                🌐 Opening browser task...
                            </p>
                        )}
                    </div>
                </div>

                {activeExtensions.length > 0 && (
                    <div className="active-extensions-section">
                        <button
                            className="btn btn-info"
                            onClick={() => setShowActiveExtensions(!showActiveExtensions)}
                        >
                            {showActiveExtensions ? '📱 Hide Active Extensions' : `📱 Show Active Extensions (${activeExtensions.length})`}
                        </button>
                        
                        {showActiveExtensions && (
                            <div className="active-extensions-list">
                                <h4>🔗 Active URL Extensions</h4>
                                {activeExtensions.map(ext => (
                                    <div key={ext.sessionId} className="extension-item">
                                        <div className="extension-info">
                                            <strong>Session:</strong> {ext.sessionId}<br/>
                                            <strong>Status:</strong> {ext.status}<br/>
                                            <strong>Started:</strong> {new Date(ext.startTime).toLocaleTimeString()}<br/>
                                            {ext.shortJamboAlias && (
                                                <>
                                                    <strong>Alias:</strong> <code>{ext.shortJamboAlias}</code><br/>
                                                </>
                                            )}
                                            {ext.redirectUrl && (
                                                <>
                                                    <strong>URL:</strong> 
                                                    <a href={ext.redirectUrl} target="_blank" rel="noopener noreferrer" className="extension-url">
                                                        {ext.redirectUrl.length > 60 ? ext.redirectUrl.substring(0, 60) + '...' : ext.redirectUrl}
                                                    </a>
                                                </>
                                            )}
                                        </div>
                                        {ext.status !== 'completed' && (
                                            <div className="extension-actions">
                                                <button
                                                    className="btn btn-success btn-sm"
                                                    onClick={() => handleMarkCompleted(ext.sessionId, ext.userId)}
                                                >
                                                    ✅ Mark Completed
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="config-section">
                    <button
                        className="btn btn-secondary config-toggle"
                        onClick={() => setShowConfig(!showConfig)}
                    >
                        {showConfig ? '🔧 Hide Configuration' : '⚙️ Configure Short URLs'}
                    </button>
                    
                    {showConfig && <ShortJamboConfig />}
                </div>
            </div>
        </div>
    );
};

export default MonetizationPanel;
