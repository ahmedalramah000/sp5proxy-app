import React from 'react';
import './ProgressIndicator.css';

const ProgressIndicator = ({ progress, message, step, total, showSteps = true }) => {
    const progressPercentage = Math.min(Math.max(progress || 0, 0), 100);

    return (
        <div className="progress-indicator">
            {showSteps && step && total && (
                <div className="progress-steps">
                    <span className="step-info">Step {step} of {total}</span>
                </div>
            )}
            
            <div className="progress-bar-container">
                <div className="progress-bar">
                    <div 
                        className="progress-fill"
                        style={{ width: `${progressPercentage}%` }}
                    >
                        <div className="progress-shine"></div>
                    </div>
                </div>
                <div className="progress-percentage">
                    {Math.round(progressPercentage)}%
                </div>
            </div>
            
            {message && (
                <div className="progress-message">
                    {message}
                </div>
            )}
        </div>
    );
};

export default ProgressIndicator;
