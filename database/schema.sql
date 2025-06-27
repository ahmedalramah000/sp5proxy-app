-- SP5Proxy Desktop & PHP Admin Panel Shared Database Schema
-- This database enables real-time synchronization between the desktop app and web admin panel

-- Users table for managing desktop app users
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(50) UNIQUE NOT NULL,
    username VARCHAR(100),
    email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    status ENUM('active', 'inactive', 'banned') DEFAULT 'active',
    trial_used BOOLEAN DEFAULT FALSE,
    total_connection_time INT DEFAULT 0,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status)
);

-- Active sessions table for real-time monitoring
CREATE TABLE IF NOT EXISTS active_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    session_id VARCHAR(100) UNIQUE NOT NULL,
    proxy_host VARCHAR(255),
    proxy_port INT,
    proxy_type ENUM('socks5', 'http', 'https') DEFAULT 'socks5',
    external_ip VARCHAR(45),
    location VARCHAR(255),
    country_code VARCHAR(10),
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    is_trial BOOLEAN DEFAULT FALSE,
    status ENUM('connecting', 'connected', 'disconnected') DEFAULT 'connecting',
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_session_id (session_id),
    INDEX idx_status (status)
);

-- URL shortener services management
CREATE TABLE IF NOT EXISTS url_services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    base_url VARCHAR(255) NOT NULL,
    api_endpoint VARCHAR(255),
    api_key VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    priority INT DEFAULT 1,
    success_rate DECIMAL(5,2) DEFAULT 100.00,
    last_used TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_active (is_active),
    INDEX idx_priority (priority)
);

-- Extension codes and URL tracking
CREATE TABLE IF NOT EXISTS extension_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    url_service_id INT,
    shortened_url VARCHAR(500),
    original_url VARCHAR(500),
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    used_at TIMESTAMP NULL,
    is_used BOOLEAN DEFAULT FALSE,
    extension_hours INT DEFAULT 4,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (url_service_id) REFERENCES url_services(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_code (code),
    INDEX idx_expires (expires_at),
    INDEX idx_used (is_used)
);

-- System configuration shared between desktop and admin panel
CREATE TABLE IF NOT EXISTS system_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value TEXT,
    config_type ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string',
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(100),
    INDEX idx_key (config_key),
    INDEX idx_public (is_public)
);

-- Connection logs for monitoring and analytics
CREATE TABLE IF NOT EXISTS connection_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    session_id VARCHAR(100),
    action ENUM('connect', 'disconnect', 'extend', 'expire') NOT NULL,
    proxy_host VARCHAR(255),
    proxy_port INT,
    external_ip VARCHAR(45),
    location VARCHAR(255),
    duration_seconds INT,
    is_trial BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    details JSON,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_action (action),
    INDEX idx_timestamp (timestamp)
);

-- Admin users for the PHP panel
CREATE TABLE IF NOT EXISTS admin_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'moderator', 'viewer') DEFAULT 'viewer',
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username),
    INDEX idx_role (role),
    INDEX idx_active (is_active)
);

-- Real-time events for synchronization
CREATE TABLE IF NOT EXISTS sync_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    data JSON,
    source ENUM('desktop', 'admin_panel') NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_event_type (event_type),
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_processed (processed),
    INDEX idx_created (created_at)
);

-- NO DEFAULT URL SERVICES - Admin must add manually

-- Insert default system configuration
INSERT IGNORE INTO system_config (config_key, config_value, config_type, description, is_public) VALUES
('trial_duration_minutes', '10', 'number', 'Free trial duration in minutes', TRUE),
('extension_duration_hours', '4', 'number', 'Extension duration in hours', TRUE),
('max_concurrent_sessions', '1', 'number', 'Maximum concurrent sessions per user', TRUE),
('enable_trial_system', 'true', 'boolean', 'Enable/disable trial system', TRUE),
('enable_extensions', 'true', 'boolean', 'Enable/disable extension system', TRUE),
('server_maintenance', 'false', 'boolean', 'Server maintenance mode', TRUE);

-- Create default admin user (password: admin123)
INSERT IGNORE INTO admin_users (username, email, password_hash, role) VALUES
('admin', 'admin@sp5proxy.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin');
