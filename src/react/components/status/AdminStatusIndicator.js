import React, { useState, useEffect } from 'react';
import { useElectronAPI } from '../../hooks/useElectronAPI';
import './AdminStatusIndicator.css';

const AdminStatusIndicator = () => {
    const [adminStatus, setAdminStatus] = useState({
        isAdmin: false,
        canElevate: false,
        details: 'Checking...'
    });
    const [isLoading, setIsLoading] = useState(true);
    const { electronAPI } = useElectronAPI();

    useEffect(() => {
        checkAdminStatus();
    }, [electronAPI]);

    const checkAdminStatus = async () => {
        if (!electronAPI) return;

        setIsLoading(true);
        try {
            const result = await electronAPI.checkAdminStatus();
            if (result.success) {
                setAdminStatus(result.status);
            } else {
                setAdminStatus({
                    isAdmin: false,
                    canElevate: false,
                    details: 'Unable to check admin status'
                });
            }
        } catch (error) {
            console.error('Failed to check admin status:', error);
            setAdminStatus({
                isAdmin: false,
                canElevate: false,
                details: 'Error checking admin status'
            });
        } finally {
            setIsLoading(false);
        }
    };

    const getStatusInfo = () => {
        if (isLoading) {
            return {
                status: 'Checking',
                className: 'admin-status-loading',
                iconClass: 'admin-icon-warning',
                message: 'Verifying administrator privileges...'
            };
        }

        if (adminStatus.isAdmin) {
            return {
                status: 'Administrator',
                className: 'admin-status-elevated',
                iconClass: 'admin-icon-success',
                message: 'Running with full administrator privileges'
            };
        } else if (adminStatus.canElevate) {
            return {
                status: 'Limited Admin',
                className: 'admin-status-limited',
                iconClass: 'admin-icon-warning',
                message: 'Can be elevated to administrator when needed'
            };
        } else {
            return {
                status: 'Standard User',
                className: 'admin-status-user',
                iconClass: 'admin-icon-error',
                message: 'Limited functionality - administrator privileges required for system-wide proxy'
            };
        }
    };

    const handleElevate = async () => {
        if (!electronAPI || !adminStatus.canElevate) return;

        try {
            const result = await electronAPI.requestElevation();
            if (result.success) {
                // Recheck status after elevation
                setTimeout(checkAdminStatus, 1000);
            }
        } catch (error) {
            console.error('Failed to request elevation:', error);
        }
    };

    const statusInfo = getStatusInfo();

    return (
        <div className="admin-status-indicator">
            <div className="admin-status-content">
                <div className={`admin-status-badge ${statusInfo.className}`}>
                    <span className={`admin-icon ${statusInfo.iconClass}`}></span>
                    <div className="admin-status-info">
                        <span className="admin-status-title">{statusInfo.status}</span>
                        <span className="admin-status-details">{statusInfo.message}</span>
                    </div>
                </div>

                {adminStatus.canElevate && !adminStatus.isAdmin && !isLoading && (
                    <button 
                        className="btn btn-warning btn-small admin-elevate-btn"
                        onClick={handleElevate}
                        title="Request administrator privileges"
                    >
                        <span className="btn-icon icon-shield"></span>
                        Elevate
                    </button>
                )}

                <button 
                    className="btn btn-secondary btn-small admin-refresh-btn"
                    onClick={checkAdminStatus}
                    disabled={isLoading}
                    title="Refresh admin status"
                >
                    <span className={`icon-refresh ${isLoading ? 'spinning' : ''}`}></span>
                    {isLoading ? 'Checking...' : 'Refresh'}
                </button>
            </div>

            {adminStatus.details && (
                <div className="admin-status-extended">
                    <small className="admin-status-technical">
                        Technical: {adminStatus.details}
                    </small>
                </div>
            )}
        </div>
    );
};

export default AdminStatusIndicator;
