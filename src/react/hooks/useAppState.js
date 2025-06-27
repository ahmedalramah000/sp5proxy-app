import { useState, useCallback } from 'react';

export const useAppState = () => {
    // Connection state
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [currentConfig, setCurrentConfig] = useState(null);
    const [connectionProgress, setConnectionProgress] = useState({ step: 0, total: 0, message: '', progress: 0 });

    // Admin state
    const [adminStatus, setAdminStatus] = useState(false);

    // UI state
    const [notifications, setNotifications] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [theme, setTheme] = useState('dark');

    // Connection status updates
    const updateConnectionStatus = useCallback((status) => {
        if (status.isConnected !== undefined) {
            setIsConnected(status.isConnected);
        }
        if (status.connecting !== undefined) {
            setIsConnecting(status.connecting);
        }
        if (status.config !== undefined) {
            setCurrentConfig(status.config);
        }
    }, []);

    // Admin status updates
    const updateAdminStatus = useCallback((hasAdminRights) => {
        setAdminStatus(hasAdminRights);
    }, []);

    // Progress updates
    const updateProgress = useCallback((progress) => {
        setConnectionProgress(progress);
    }, []);

    // Notification management
    const addNotification = useCallback((message, type = 'info', duration = 5000) => {
        const notification = {
            id: Date.now() + Math.random(),
            message,
            type,
            timestamp: new Date(),
            duration
        };
        
        setNotifications(prev => [...prev, notification]);

        // Auto-remove notification after duration
        if (duration > 0) {
            setTimeout(() => {
                removeNotification(notification.id);
            }, duration);
        }
    }, []);

    const removeNotification = useCallback((id) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    const clearNotifications = useCallback(() => {
        setNotifications([]);
    }, []);

    // Loading state management
    const setLoadingState = useCallback((loading, message = '') => {
        setIsLoading(loading);
        setLoadingMessage(message);
    }, []);

    // Theme management
    const toggleTheme = useCallback(() => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    }, []);

    return {
        // State
        isConnected,
        isConnecting,
        currentConfig,
        connectionProgress,
        adminStatus,
        notifications,
        isLoading,
        loadingMessage,
        theme,

        // Actions
        updateConnectionStatus,
        updateAdminStatus,
        updateProgress,
        addNotification,
        removeNotification,
        clearNotifications,
        setLoading: setLoadingState,
        toggleTheme
    };
};
