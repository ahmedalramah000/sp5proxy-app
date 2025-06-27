import React from 'react';
import './LoadingOverlay.css';

const LoadingOverlay = ({ message = 'Loading...', isVisible = true }) => {
    if (!isVisible) return null;

    return (
        <div className="loading-overlay">
            <div className="loading-content">
                <div className="loading-spinner">
                    <div className="spinner-ring"></div>
                    <div className="spinner-ring"></div>
                    <div className="spinner-ring"></div>
                </div>
                <div className="loading-message">
                    {message}
                </div>
            </div>
        </div>
    );
};

export default LoadingOverlay;
