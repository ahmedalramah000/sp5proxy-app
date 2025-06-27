import React from 'react';
import './ProxyForm.css';

const ProxyForm = ({ config, onChange, disabled, isValid }) => {
    const handleInputChange = (field, value) => {
        onChange({
            ...config,
            [field]: value
        });
    };

    const validatePort = (port) => {
        const portNum = parseInt(port);
        return !isNaN(portNum) && portNum > 0 && portNum <= 65535;
    };

    return (
        <div className="proxy-form">
            <div className="form-grid">
                <div className="form-group">
                    <label htmlFor="proxy-host" className="form-label">
                        Proxy Host *
                    </label>
                    <input
                        id="proxy-host"
                        type="text"
                        className={`form-input ${config.host.trim() === '' ? 'invalid' : 'valid'}`}
                        placeholder="e.g., 192.168.1.100 or proxy.example.com"
                        value={config.host}
                        onChange={(e) => handleInputChange('host', e.target.value)}
                        disabled={disabled}
                        required
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="proxy-port" className="form-label">
                        Port *
                    </label>
                    <input
                        id="proxy-port"
                        type="number"
                        className={`form-input ${!validatePort(config.port) && config.port !== '' ? 'invalid' : 'valid'}`}
                        placeholder="e.g., 1080, 8080"
                        value={config.port}
                        onChange={(e) => handleInputChange('port', e.target.value)}
                        disabled={disabled}
                        min="1"
                        max="65535"
                        required
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="proxy-type" className="form-label">
                        Proxy Type
                    </label>
                    <select
                        id="proxy-type"
                        className="form-select"
                        value={config.type}
                        onChange={(e) => handleInputChange('type', e.target.value)}
                        disabled={disabled}
                    >
                        <option value="socks5">SOCKS5 (Recommended)</option>
                        <option value="http">HTTP</option>
                        <option value="https">HTTPS</option>
                    </select>
                </div>

                <div className="form-group">
                    <label htmlFor="proxy-username" className="form-label">
                        Username (Optional)
                    </label>
                    <input
                        id="proxy-username"
                        type="text"
                        className="form-input"
                        placeholder="Leave empty if no authentication"
                        value={config.username}
                        onChange={(e) => handleInputChange('username', e.target.value)}
                        disabled={disabled}
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="proxy-password" className="form-label">
                        Password (Optional)
                    </label>
                    <input
                        id="proxy-password"
                        type="password"
                        className="form-input"
                        placeholder="Leave empty if no authentication"
                        value={config.password}
                        onChange={(e) => handleInputChange('password', e.target.value)}
                        disabled={disabled}
                    />
                </div>
            </div>

            <div className="form-validation">
                {!isValid && (config.host !== '' || config.port !== '') && (
                    <div className="validation-message error">
                        <span className="validation-icon">⚠️</span>
                        Please enter a valid host and port (1-65535)
                    </div>
                )}
                {isValid && (
                    <div className="validation-message success">
                        <span className="validation-icon">✅</span>
                        Configuration is valid
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProxyForm;
