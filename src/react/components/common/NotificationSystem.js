import React from 'react';
import './NotificationSystem.css';

const NotificationItem = ({ notification, onRemove }) => {
    const getNotificationIcon = (type) => {
        switch (type) {
            case 'success': return '✅';
            case 'error': return '❌';
            case 'warning': return '⚠️';
            case 'info': return 'ℹ️';
            default: return 'ℹ️';
        }
    };

    const handleRemove = () => {
        onRemove(notification.id);
    };

    return (
        <div className={`notification-item ${notification.type}`}>
            <div className="notification-content">
                <span className="notification-icon">
                    {getNotificationIcon(notification.type)}
                </span>
                <span className="notification-message">
                    {notification.message}
                </span>
            </div>
            <button 
                className="notification-close"
                onClick={handleRemove}
                title="Dismiss notification"
            >
                ×
            </button>
        </div>
    );
};

const NotificationSystem = ({ notifications, onClearNotifications }) => {
    if (!notifications || notifications.length === 0) {
        return null;
    }

    return (
        <div className="notification-system">
            <div className="notification-container">
                {notifications.map((notification) => (
                    <NotificationItem
                        key={notification.id}
                        notification={notification}
                        onRemove={(id) => {
                            // Remove individual notification
                            const updatedNotifications = notifications.filter(n => n.id !== id);
                            if (updatedNotifications.length === 0) {
                                onClearNotifications();
                            }
                        }}
                    />
                ))}
                
                {notifications.length > 1 && (
                    <div className="notification-actions">
                        <button 
                            className="btn btn-small btn-secondary"
                            onClick={onClearNotifications}
                            title="Clear all notifications"
                        >
                            Clear All
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotificationSystem;
