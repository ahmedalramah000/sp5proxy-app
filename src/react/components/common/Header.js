import React from 'react';
import AdminStatusIndicator from '../status/AdminStatusIndicator';
import './Header.css';

const Header = ({ adminStatus, onRequestElevation }) => {
    return (
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
                    <div className="app-branding">
                        <div className="app-icon professional-shield-icon"></div>
                        <div className="app-title">
                            <h1>SP5Proxy Desktop</h1>
                            <span className="app-subtitle">Secure Proxy Connection Manager</span>
                        </div>
                    </div>
                    
                    <div className="header-controls">
                        <AdminStatusIndicator 
                            adminStatus={adminStatus}
                            onRequestElevation={onRequestElevation}
                        />
                    </div>
                </div>
            </header>
        </>
    );
};

export default Header;
