import React, { useState, useEffect } from 'react';
import './ShortJamboConfig.css';

const ShortJamboConfig = () => {
    const [config, setConfig] = useState({
        apiToken: '',
        apiUrl: 'https://short-jambo.com/api',
        destinationUrl: 'https://sp5proxies.com',
        enabled: true,
        aliasPrefix: 'SP5_'
    });
    const [loading, setLoading] = useState(false);
    const [testing, setTesting] = useState(false);
    const [message, setMessage] = useState('');
    const [testResult, setTestResult] = useState(null);

    // Load configuration on component mount
    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const result = await window.electronAPI.invoke('get-short-jambo-config');
            if (result.success) {
                setConfig(result.config);
            } else {
                setMessage(`❌ Failed to load config: ${result.message}`);
            }
        } catch (error) {
            setMessage(`❌ Error loading config: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const updateConfig = async () => {
        setLoading(true);
        setMessage('');
        try {
            const result = await window.electronAPI.invoke('update-short-jambo-config', config);
            if (result.success) {
                setMessage('✅ Configuration updated successfully!');
                setConfig(result.config);
            } else {
                setMessage(`❌ Failed to update: ${result.message}`);
            }
        } catch (error) {
            setMessage(`❌ Error updating config: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const testAPI = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const result = await window.electronAPI.invoke('test-short-jambo-api');
            setTestResult(result);
        } catch (error) {
            setTestResult({
                success: false,
                message: `Error testing API: ${error.message}`
            });
        } finally {
            setTesting(false);
        }
    };

    const handleInputChange = (field, value) => {
        setConfig(prev => ({
            ...prev,
            [field]: value
        }));
    };

    if (loading && !config.apiToken) {
        return (
            <div className="short-jambo-config loading">
                <div className="loading-spinner"></div>
                <p>Loading Short Jambo configuration...</p>
            </div>
        );
    }

    return (
        <div className="short-jambo-config">
            <div className="config-header">
                <h3>🔗 Short Jambo API Configuration</h3>
                <p>Configure automatic shortened URL generation for URL Extension system</p>
            </div>

            <div className="config-form">
                <div className="form-group">
                    <label htmlFor="enabled">
                        <input
                            type="checkbox"
                            id="enabled"
                            checked={config.enabled}
                            onChange={(e) => handleInputChange('enabled', e.target.checked)}
                        />
                        Enable Short Jambo API
                    </label>
                    <small>When enabled, new shortened URLs will be created for each extension session</small>
                </div>

                <div className="form-group">
                    <label htmlFor="apiToken">API Token:</label>
                    <input
                        type="password"
                        id="apiToken"
                        value={config.apiToken}
                        onChange={(e) => handleInputChange('apiToken', e.target.value)}
                        placeholder="Enter your Short Jambo API token"
                        disabled={!config.enabled}
                    />
                    <small>Your API token from Short Jambo dashboard</small>
                </div>

                <div className="form-group">
                    <label htmlFor="apiUrl">API URL:</label>
                    <input
                        type="url"
                        id="apiUrl"
                        value={config.apiUrl}
                        onChange={(e) => handleInputChange('apiUrl', e.target.value)}
                        disabled={!config.enabled}
                    />
                    <small>Short Jambo API endpoint URL</small>
                </div>

                <div className="form-group">
                    <label htmlFor="destinationUrl">Destination URL:</label>
                    <input
                        type="url"
                        id="destinationUrl"
                        value={config.destinationUrl}
                        onChange={(e) => handleInputChange('destinationUrl', e.target.value)}
                        disabled={!config.enabled}
                    />
                    <small>Target URL where users should navigate to complete tasks</small>
                </div>

                <div className="form-group">
                    <label htmlFor="aliasPrefix">Alias Prefix:</label>
                    <input
                        type="text"
                        id="aliasPrefix"
                        value={config.aliasPrefix}
                        onChange={(e) => handleInputChange('aliasPrefix', e.target.value)}
                        placeholder="SP5_"
                        disabled={!config.enabled}
                    />
                    <small>Prefix for shortened URL aliases (helps with organization)</small>
                </div>

                <div className="form-actions">
                    <button 
                        onClick={updateConfig} 
                        disabled={loading}
                        className="update-btn"
                    >
                        {loading ? 'Updating...' : '💾 Update Configuration'}
                    </button>
                    
                    <button 
                        onClick={testAPI} 
                        disabled={testing || !config.enabled || !config.apiToken}
                        className="test-btn"
                    >
                        {testing ? 'Testing...' : '🧪 Test API'}
                    </button>
                </div>

                {message && (
                    <div className={`message ${message.includes('✅') ? 'success' : 'error'}`}>
                        {message}
                    </div>
                )}

                {testResult && (
                    <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
                        <h4>🧪 API Test Result:</h4>
                        <p>{testResult.message}</p>
                        {testResult.testUrl && (
                            <div className="test-url">
                                <strong>Generated URL:</strong> 
                                <a href={testResult.testUrl} target="_blank" rel="noopener noreferrer">
                                    {testResult.testUrl}
                                </a>
                            </div>
                        )}
                        {testResult.fallbackUrl && (
                            <div className="fallback-url">
                                <strong>Fallback URL:</strong> {testResult.fallbackUrl}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="config-info">
                <h4>ℹ️ How it works:</h4>
                <ul>
                    <li>✅ Each URL Extension session gets a unique shortened URL</li>
                    <li>🎯 Users navigate through the shortened URL to reach the destination</li>
                    <li>📊 Each visit is tracked separately, preventing repeat visit detection</li>
                    <li>🔄 If API fails, system automatically falls back to destination URL</li>
                    <li>🛡️ Anti-detection measures still apply to protect against tracking</li>
                </ul>
            </div>
        </div>
    );
};

export default ShortJamboConfig; 