// SP5Proxy Web Server Configuration

module.exports = {
  // Server Configuration
  server: {
    port: process.env.PORT || 3000,
    adminPort: process.env.ADMIN_PORT || 3002,
    host: '0.0.0.0',
    env: process.env.NODE_ENV || 'production',
    disableLocalAPI: process.env.DISABLE_LOCAL_API === 'true'
  },

  // VPS Configuration
  vps: {
    ip: '168.231.82.24',
    domain: process.env.VPS_DOMAIN || '168.231.82.24',
    location: 'France - Paris',
    apiUrl: process.env.VPS_API_URL || 'http://168.231.82.24:3002'
  },

  // Database Configuration
  database: {
    path: './admin-panel/data/sp5proxy.db',
    backupInterval: 24 * 60 * 60 * 1000, // 24 hours
    maxConnections: 10,
    remoteUrl: process.env.VPS_DB_URL || 'http://168.231.82.24:3002/api',
    enableRemoteSync: true
  },

  // Security Configuration
  security: {
    jwtSecret: process.env.JWT_SECRET || 'sp5proxy-default-secret-change-in-production',
    sessionSecret: process.env.SESSION_SECRET || 'sp5proxy-session-secret',
    adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
    corsOrigins: [
      'http://168.231.82.24',
      'https://168.231.82.24',
      'http://localhost:3000',
      'http://localhost:3002'
    ],
    rateLimiting: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100 // requests per window
    }
  },

  // External Services
  external: {
    telegramBot: 'https://t.me/Sp5_ShopBot',
    extensionLanding: 'https://google.com',
    ipServices: [
      'https://api.ipify.org?format=json',
      'https://ipapi.co/json/',
      'http://ip-api.com/json/'
    ]
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: './logs/sp5proxy.log',
    maxSize: '10M',
    maxFiles: '5d'
  },

  // SSL/TLS Configuration
  ssl: {
    enabled: process.env.SSL_ENABLED === 'true',
    certPath: process.env.SSL_CERT_PATH || null,
    keyPath: process.env.SSL_KEY_PATH || null
  },

  // Application Features
  features: {
    enableWebSocket: true,
    enableAdminPanel: true,
    enableMonetization: true,
    enableExtensionSystem: true,
    enableRealTimeUpdates: true
  },

  // API Configuration
  api: {
    prefix: '/api',
    version: 'v1',
    timeout: 30000,
    maxRequestSize: '10mb'
  },

  // Static Files
  static: {
    maxAge: '7d',
    etag: true,
    compression: true
  }
}; 