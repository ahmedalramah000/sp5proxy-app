/**
 * SP5Proxy Admin Panel - Main JavaScript
 * This file contains the main application logic for the Node.js admin panel
 */

// Admin Panel App
const AdminPanel = {
    sessionId: localStorage.getItem('sp5proxy_session'),
    currentPage: 'dashboard',
    serverUrl: '',
    wsConnection: null,
    
    init: function() {
        // Set API URL based on current location
        this.serverUrl = window.location.origin;

        // Production fix: Ensure consistent behavior across localhost and 127.0.0.1
        this.normalizeHostAccess();

        // Show loading overlay
        document.getElementById('loading-overlay').style.display = 'flex';
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Check authentication
        this.checkAuthentication()
            .then(result => {
                if (result.valid) {
                    // User is authenticated
                    document.getElementById('username').textContent = result.user.username;
                    this.loadApp();
                } else {
                    // User needs to login
                    this.showLoginModal();
                }
            })
            .catch(error => {
                console.error('Authentication check failed:', error);
                this.showLoginModal();
            })
            .finally(() => {
                document.getElementById('loading-overlay').style.display = 'none';
            });
    },

    normalizeHostAccess: function() {
        // Production fix: Ensure consistent behavior between localhost and 127.0.0.1
        const currentHost = window.location.hostname;
        const currentPort = window.location.port;

        // Clear any host-specific cached data that might cause inconsistencies
        const cacheKeys = [
            'sp5proxy_session',
            'sp5proxy_admin_session',
            'sp5proxy_admin_username',
            'sp5proxy_current_page',
            'sp5proxy_dashboard_cache',
            'sp5proxy_settings_cache'
        ];

        // Check if we're switching between localhost and 127.0.0.1
        const lastHost = localStorage.getItem('sp5proxy_last_host');
        const currentHostKey = `${currentHost}:${currentPort}`;

        if (lastHost && lastHost !== currentHostKey) {
            console.log(`🔄 Host changed from ${lastHost} to ${currentHostKey}, clearing cache...`);

            // Clear potentially inconsistent cached data
            cacheKeys.forEach(key => {
                const value = localStorage.getItem(key);
                if (value) {
                    console.log(`   Clearing ${key}`);
                    localStorage.removeItem(key);
                }
            });

            // Clear session storage as well
            sessionStorage.clear();

            // Force a fresh session check
            this.sessionId = null;
        }

        // Store current host for future reference
        localStorage.setItem('sp5proxy_last_host', currentHostKey);

        // Ensure consistent session ID retrieval
        this.sessionId = localStorage.getItem('sp5proxy_session');

        console.log(`🌐 Admin panel initialized on ${currentHostKey}`);
    },

    setupEventListeners: function() {
        // Sidebar navigation
        document.querySelectorAll('#sidebar .nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = e.target.closest('.nav-link').dataset.page;
                this.navigateToPage(page);
            });
        });
        
        // Sidebar toggle for mobile
        document.getElementById('sidebar-toggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('active');
            document.getElementById('content').classList.toggle('active');
        });
        
        // Login button
        document.getElementById('login-btn').addEventListener('click', () => {
            this.handleLogin();
        });
        
        // Logout link
        document.getElementById('logout-link').addEventListener('click', (e) => {
            e.preventDefault();
            this.logout();
        });
        
        // Add Enter key support for login
        document.getElementById('password-input').addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                this.handleLogin();
            }
        });
    },
    
    navigateToPage: function(page) {
        // Save current page to localStorage
        localStorage.setItem('sp5proxy_current_page', page);
        this.currentPage = page;
        
        // Update active nav link
        document.querySelectorAll('#sidebar .nav-link').forEach(link => {
            link.classList.remove('active');
        });
        document.querySelector(`#sidebar .nav-link[data-page="${page}"]`).classList.add('active');
        
        // Hide all page content
        document.querySelectorAll('.page-content').forEach(content => {
            content.style.display = 'none';
        });
        
        // Load page content if it doesn't exist yet
        let pageElement = document.getElementById(`page-${page}`);
        if (!pageElement) {
            this.loadPageContent(page);
        } else {
            // Show the page
            pageElement.style.display = 'block';
            
            // Refresh page data
            this.refreshPageData(page);
        }
    },
    
    loadPageContent: function(page) {
        // Show loading overlay
        document.getElementById('loading-overlay').style.display = 'flex';
        
        // Create page container
        const pageContainer = document.createElement('div');
        pageContainer.id = `page-${page}`;
        pageContainer.className = 'page-content';
        document.getElementById('content').appendChild(pageContainer);
        
        // Get template for the page
        const template = document.getElementById(`template-${page}`);
        if (template) {
            pageContainer.innerHTML = template.innerHTML;
        } else {
            // Create a basic container if no template exists
            pageContainer.innerHTML = `<div class="container-fluid"><h3>${page.charAt(0).toUpperCase() + page.slice(1)}</h3><div class="content-placeholder"></div></div>`;
        }
        
        // Add page-specific initialization
        switch(page) {
            case 'dashboard':
                this.initDashboardPage();
                break;
            case 'sessions':
                this.initSessionsPage();
                break;
            case 'users':
                this.initUsersPage();
                break;
            case 'url-services':
                this.initUrlServicesPage();
                break;
            case 'logs':
                this.initLogsPage();
                break;
            case 'settings':
                this.initSettingsPage();
                break;
        }
        
        // Hide loading overlay
        document.getElementById('loading-overlay').style.display = 'none';
    },
    
    checkAuthentication: function() {
        return new Promise((resolve, reject) => {
            if (!this.sessionId) {
                resolve({ valid: false });
                return;
            }
            
            fetch(`${this.serverUrl}/api/session-check`, {
                headers: {
                    'X-Session-Id': this.sessionId
                }
            })
            .then(response => response.json())
            .then(data => resolve(data))
            .catch(error => reject(error));
        });
    },
    
    showLoginModal: function() {
        const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
        loginModal.show();
    },
    
    handleLogin: function() {
        const username = document.getElementById('username-input').value.trim();
        const password = document.getElementById('password-input').value.trim();
        
        if (!username || !password) {
            document.getElementById('login-error').textContent = 'Username and password are required';
            document.getElementById('login-error').classList.remove('d-none');
            return;
        }
        
        // Show loading overlay
        document.getElementById('loading-overlay').style.display = 'flex';
        
        fetch(`${this.serverUrl}/api/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Store session ID
                this.sessionId = data.sessionId;
                localStorage.setItem('sp5proxy_session', data.sessionId);
                
                // Hide login modal
                bootstrap.Modal.getInstance(document.getElementById('loginModal')).hide();
                
                // Set username
                document.getElementById('username').textContent = data.user.username;
                
                // Load the app
                this.loadApp();
            } else {
                document.getElementById('login-error').textContent = data.error || 'Login failed';
                document.getElementById('login-error').classList.remove('d-none');
            }
        })
        .catch(error => {
            console.error('Login error:', error);
            document.getElementById('login-error').textContent = 'Server error. Please try again.';
            document.getElementById('login-error').classList.remove('d-none');
        })
        .finally(() => {
            document.getElementById('loading-overlay').style.display = 'none';
        });
    },
    
    logout: function() {
        // Show loading overlay
        document.getElementById('loading-overlay').style.display = 'flex';
        
        fetch(`${this.serverUrl}/api/logout`, {
            method: 'POST',
            headers: {
                'X-Session-Id': this.sessionId
            }
        })
        .then(response => response.json())
        .then(() => {
            // Clear session
            localStorage.removeItem('sp5proxy_session');
            this.sessionId = null;
            
            // Close WebSocket connection
            if (this.wsConnection) {
                this.wsConnection.close();
                this.wsConnection = null;
            }
            
            // Show login modal
            this.showLoginModal();
        })
        .catch(error => {
            console.error('Logout error:', error);
        })
        .finally(() => {
            document.getElementById('loading-overlay').style.display = 'none';
        });
    },
    
    loadApp: function() {
        // Setup WebSocket connection
        this.setupWebSocket();
        
        // Load page from localStorage if available
        const savedPage = localStorage.getItem('sp5proxy_current_page') || 'dashboard';
        this.navigateToPage(savedPage);
    },
    
    setupWebSocket: function() {
        // Create WebSocket connection
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.wsConnection = new WebSocket(wsUrl);
        
        this.wsConnection.onopen = () => {
            console.log('WebSocket connected');
            document.getElementById('server-status').textContent = 'Connected';
            document.getElementById('server-status-badge').textContent = 'Online';
            document.getElementById('server-status-badge').className = 'badge bg-success';
            
            // Authenticate the WebSocket connection
            this.wsConnection.send(JSON.stringify({
                type: 'authenticate',
                sessionId: this.sessionId
            }));
        };
        
        this.wsConnection.onclose = () => {
            console.log('WebSocket disconnected');
            document.getElementById('server-status').textContent = 'Disconnected';
            document.getElementById('server-status-badge').textContent = 'Offline';
            document.getElementById('server-status-badge').className = 'badge bg-danger';
            
            // Try to reconnect after 5 seconds
            setTimeout(() => this.setupWebSocket(), 5000);
        };
        
        this.wsConnection.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
        
        this.wsConnection.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleWebSocketMessage(data);
            } catch (error) {
                console.error('Failed to parse WebSocket message:', error);
            }
        };
    },
    
    handleWebSocketMessage: function(message) {
        console.log('WebSocket message received:', message);
        
        switch(message.type) {
            case 'welcome':
                console.log('WebSocket welcome message:', message.message);
                break;
                
            case 'authenticated':
                console.log('WebSocket authenticated:', message.message);
                break;
                
            case 'auth_error':
                console.error('WebSocket authentication error:', message.message);
                break;
                
            case 'session_disconnected':
                this.showToast('Session disconnected', 'info');
                this.refreshActiveSessions();
                if (this.currentPage === 'sessions') {
                    this.refreshSessionsStats();
                }
                break;
                
            case 'url_service_added':
            case 'url_service_updated':
            case 'url_service_deleted':
            case 'url_services_reordered':
                if (this.currentPage === 'url-services') {
                    this.refreshUrlServices();
                }
                if (this.currentPage === 'dashboard') {
                    this.refreshUrlServiceStats();
                }
                break;
                
            case 'sync_event':
                this.handleSyncEvent(message);
                break;
                
            case 'config_updated':
                if (this.currentPage === 'settings') {
                    this.refreshSystemConfig();
                }
                break;
        }
    },
    
    handleSyncEvent: function(event) {
        // Handle sync events from desktop app
        const eventType = event.event_type;
        
        switch(eventType) {
            case 'session_connected':
            case 'session_disconnected':
                this.refreshActiveSessions();
                if (this.currentPage === 'dashboard') {
                    this.refreshDashboardStats();
                }
                if (this.currentPage === 'sessions') {
                    this.refreshSessionsStats();
                }
                break;
                
            case 'config_updated':
                if (this.currentPage === 'settings') {
                    this.refreshSystemConfig();
                }
                this.refreshDashboardStats();
                break;
        }
    },
    
    showToast: function(message, type = 'success') {
        const toastContainer = document.querySelector('.toast-container');
        
        const toast = document.createElement('div');
        toast.className = `toast align-items-center text-white border-0 bg-${type}`;
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');
        toast.setAttribute('aria-atomic', 'true');
        
        const toastContent = `
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        `;
        
        toast.innerHTML = toastContent;
        toastContainer.appendChild(toast);
        
        const bsToast = new bootstrap.Toast(toast, {
            delay: 4000
        });
        
        bsToast.show();
        
        // Remove toast from DOM after it's hidden
        toast.addEventListener('hidden.bs.toast', () => {
            toast.remove();
        });
    },
    
    // DASHBOARD PAGE METHODS
    
    initDashboardPage: function() {
        this.refreshDashboardStats();
        this.refreshActiveSessions();
        this.refreshUrlServiceStats();
    },
    
    refreshDashboardStats: function() {
        fetch(`${this.serverUrl}/api/dashboard-stats`, {
            headers: {
                'X-Session-Id': this.sessionId
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                document.getElementById('active-users').textContent = data.stats.activeUsers;
                document.getElementById('total-users').textContent = data.stats.totalUsers;
                document.getElementById('today-connections').textContent = data.stats.todayConnections;
                document.getElementById('extensions-today').textContent = data.stats.extensionsToday;
                
                // Update system settings overview
                const trialSystemStatus = document.getElementById('trial-system-status');
                if (data.stats.trialSystemEnabled) {
                    trialSystemStatus.textContent = 'Enabled';
                    trialSystemStatus.className = 'badge bg-success';
                } else {
                    trialSystemStatus.textContent = 'Disabled';
                    trialSystemStatus.className = 'badge bg-danger';
                }
                
                const extensionSystemStatus = document.getElementById('extension-system-status');
                if (data.stats.extensionSystemEnabled) {
                    extensionSystemStatus.textContent = 'Enabled';
                    extensionSystemStatus.className = 'badge bg-success';
                } else {
                    extensionSystemStatus.textContent = 'Disabled';
                    extensionSystemStatus.className = 'badge bg-danger';
                }
            }
        })
        .catch(error => {
            console.error('Failed to load dashboard stats:', error);
        });
    },
    
    refreshActiveSessions: function() {
        fetch(`${this.serverUrl}/api/active-sessions`, {
            headers: {
                'X-Session-Id': this.sessionId
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const sessionsTable = document.getElementById('active-sessions-table');
                if (!sessionsTable) return;
                
                if (!data.sessions || data.sessions.length === 0) {
                    sessionsTable.innerHTML = `
                        <tr>
                            <td colspan="6" class="text-center">No active sessions</td>
                        </tr>
                    `;
                    return;
                }
                
                let html = '';
                data.sessions.slice(0, 5).forEach(session => {
                    const startedTime = new Date(session.started_at).toLocaleString();
                    
                    html += `
                        <tr>
                            <td>${session.username || 'Anonymous'}</td>
                            <td>${session.proxy_host}:${session.proxy_port}</td>
                            <td>${session.external_ip || 'Unknown'}</td>
                            <td>${session.location || 'Unknown'}</td>
                            <td>${startedTime}</td>
                            <td>
                                <button class="btn btn-sm btn-danger disconnect-btn" data-session="${session.session_id}">
                                    Disconnect
                                </button>
                            </td>
                        </tr>
                    `;
                });
                
                sessionsTable.innerHTML = html;
                
                // Add event listeners to disconnect buttons
                document.querySelectorAll('.disconnect-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const sessionId = e.target.dataset.session;
                        this.disconnectSession(sessionId);
                    });
                });
            }
        })
        .catch(error => {
            console.error('Failed to load active sessions:', error);
        });
    },
    
    refreshUrlServiceStats: function() {
        fetch(`${this.serverUrl}/api/url-services/stats`, {
            headers: {
                'X-Session-Id': this.sessionId
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const activeServicesEl = document.getElementById('active-services');
                const totalServicesEl = document.getElementById('total-services');
                const mostUsedServiceEl = document.getElementById('most-used-service');
                
                if (activeServicesEl) activeServicesEl.textContent = data.stats.active_services;
                if (totalServicesEl) totalServicesEl.textContent = data.stats.total_services;
                if (mostUsedServiceEl) mostUsedServiceEl.textContent = data.stats.most_used_service;
            }
        })
        .catch(error => {
            console.error('Failed to load URL service stats:', error);
        });
    },
    
    disconnectSession: function(sessionId) {
        if (!confirm('Are you sure you want to disconnect this session?')) {
            return;
        }
        
        fetch(`${this.serverUrl}/api/disconnect-session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Id': this.sessionId
            },
            body: JSON.stringify({ sessionId })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.showToast('Session disconnected successfully');
                this.refreshActiveSessions();
                if (this.currentPage === 'dashboard') {
                    this.refreshDashboardStats();
                }
                if (this.currentPage === 'sessions') {
                    this.refreshSessionsStats();
                }
            } else {
                this.showToast(data.error || 'Failed to disconnect session', 'danger');
            }
        })
        .catch(error => {
            console.error('Failed to disconnect session:', error);
            this.showToast('Server error. Please try again.', 'danger');
        });
    },
    
    // SESSIONS PAGE METHODS
    
    initSessionsPage: function() {
        // Add event listener for refresh button
        const refreshBtn = document.getElementById('refresh-sessions');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshActiveSessions();
                this.refreshSessionsStats();
            });
        }
        
        // Load sessions data
        this.refreshSessionsStats();
        setTimeout(() => this.refreshActiveSessions(), 200);
    },
    
    refreshSessionsStats: function() {
        fetch(`${this.serverUrl}/api/active-sessions/stats`, {
            headers: {
                'X-Session-Id': this.sessionId
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const currentSessionsEl = document.getElementById('current-sessions');
                const sessionsTodayEl = document.getElementById('sessions-today');
                const disconnectionsEl = document.getElementById('disconnections-today');
                const uniqueUsersEl = document.getElementById('unique-users-today');
                
                if (currentSessionsEl) currentSessionsEl.textContent = data.stats.active_sessions;
                if (sessionsTodayEl) sessionsTodayEl.textContent = data.stats.sessions_today;
                if (disconnectionsEl) disconnectionsEl.textContent = data.stats.disconnections_today;
                if (uniqueUsersEl) uniqueUsersEl.textContent = data.stats.unique_users_today;
            }
        })
        .catch(error => {
            console.error('Failed to load sessions stats:', error);
        });
    },
    
    // PAGE REFRESH LOGIC
    
    refreshPageData: function(page) {
        switch(page) {
            case 'dashboard':
                this.refreshDashboardStats();
                this.refreshActiveSessions();
                this.refreshUrlServiceStats();
                break;
            case 'sessions':
                this.refreshActiveSessions();
                this.refreshSessionsStats();
                break;
            case 'users':
                this.refreshUsers();
                break;
            case 'url-services':
                this.refreshUrlServices();
                this.refreshUrlServiceStats();
                break;
            case 'logs':
                this.refreshLogs();
                break;
            case 'settings':
                this.refreshSystemConfig();
                break;
        }
    },
    
    // OTHER PAGE STUBS (to be implemented)
    
    initUsersPage: function() {
        console.log('Users page initialized');

        // Add refresh button event listener
        const refreshBtn = document.getElementById('refresh-users');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshUsers();
            });
        }

        // Load initial data
        this.refreshUsers();
    },

    refreshUsers: function() {
        fetch(`${this.serverUrl}/api/users`, {
            headers: {
                'X-Session-Id': this.sessionId
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.updateUsersTable(data.users);
                this.updateUsersStats(data.users);
            } else {
                console.error('Failed to load users:', data.error);
            }
        })
        .catch(error => {
            console.error('Failed to load users:', error);
        });
    },

    updateUsersTable: function(users) {
        const tbody = document.getElementById('users-table');
        if (!tbody) return;

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">No users found</td></tr>';
            return;
        }

        let html = '';
        users.forEach(user => {
            const createdDate = new Date(user.created_at).toLocaleDateString();
            const lastActive = user.last_active ? new Date(user.last_active).toLocaleDateString() : 'Never';
            const statusBadge = user.status === 'active' ? 'bg-success' : 'bg-secondary';
            const trialUsed = user.trial_used ? 'Yes' : 'No';
            const connectionTime = user.total_connection_time ? `${Math.round(user.total_connection_time / 60)} min` : '0 min';

            html += `
                <tr>
                    <td>${user.user_id || user.id}</td>
                    <td>${user.username || 'N/A'}</td>
                    <td>${user.email || 'N/A'}</td>
                    <td><span class="badge ${statusBadge}">${user.status || 'Unknown'}</span></td>
                    <td>${trialUsed}</td>
                    <td>${connectionTime}</td>
                    <td>${createdDate}</td>
                    <td>${lastActive}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    },

    updateUsersStats: function(users) {
        const totalUsers = users.length;
        const activeUsers = users.filter(u => u.status === 'active').length;
        const trialUsers = users.filter(u => u.trial_used).length;
        const today = new Date().toDateString();
        const newToday = users.filter(u => new Date(u.created_at).toDateString() === today).length;

        const totalEl = document.getElementById('total-users-count');
        const activeEl = document.getElementById('active-users-count');
        const trialEl = document.getElementById('trial-users-count');
        const newTodayEl = document.getElementById('new-users-today');

        if (totalEl) totalEl.textContent = totalUsers;
        if (activeEl) activeEl.textContent = activeUsers;
        if (trialEl) trialEl.textContent = trialUsers;
        if (newTodayEl) newTodayEl.textContent = newToday;
    },
    
    initUrlServicesPage: function() {
        console.log('URL Services page initialized');

        // Add refresh button event listener
        const refreshBtn = document.getElementById('refresh-services');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshUrlServices();
            });
        }

        // Add dual URL toggle functionality
        const dualUrlCheckbox = document.getElementById('enable-dual-url');
        const dualUrlFields = document.getElementById('dual-url-fields');

        if (dualUrlCheckbox && dualUrlFields) {
            dualUrlCheckbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    dualUrlFields.style.display = 'block';
                    dualUrlFields.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    // Make dual URL fields required when enabled
                    document.getElementById('service-shortened-url').required = true;
                    document.getElementById('service-target-url').required = true;
                    
                    // Show helpful message
                    this.showToast('✅ تم تفعيل الـ Dual-URL! املي الخانات بالأسفل', 'success');
                } else {
                    dualUrlFields.style.display = 'none';
                    // Remove required attribute when disabled
                    document.getElementById('service-shortened-url').required = false;
                    document.getElementById('service-target-url').required = false;
                    // Clear the fields
                    document.getElementById('service-shortened-url').value = '';
                    document.getElementById('service-target-url').value = '';
                }
            });
        }

        // Add form submit event listener
        const addForm = document.getElementById('add-service-form');
        if (addForm) {
            addForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.addUrlService();
            });
        }

        // Add edit modal functionality
        this.setupEditModal();

        // Initialize dual URL fields as enabled by default
        setTimeout(() => {
            const dualUrlCheckbox = document.getElementById('enable-dual-url');
            const dualUrlFields = document.getElementById('dual-url-fields');
            
            if (dualUrlCheckbox && dualUrlFields) {
                dualUrlCheckbox.checked = true;
                dualUrlFields.style.display = 'block';
                document.getElementById('service-shortened-url').required = true;
                document.getElementById('service-target-url').required = true;
            }
        }, 100);

        // Load initial data
        this.refreshUrlServices();
    },

    refreshUrlServices: function() {
        fetch(`${this.serverUrl}/api/url-services`, {
            headers: {
                'X-Session-Id': this.sessionId
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.updateUrlServicesTable(data.services);
            } else {
                console.error('Failed to load URL services:', data.error);
            }
        })
        .catch(error => {
            console.error('Failed to load URL services:', error);
        });

        // Also refresh stats
        this.refreshUrlServicesStats();
    },

    refreshUrlServicesStats: function() {
        fetch(`${this.serverUrl}/api/url-services/stats`, {
            headers: {
                'X-Session-Id': this.sessionId
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const totalEl = document.getElementById('total-services-count');
                const activeEl = document.getElementById('active-services-count');
                const mostUsedEl = document.getElementById('most-used-service-name');

                if (totalEl) totalEl.textContent = data.stats.total_services || 0;
                if (activeEl) activeEl.textContent = data.stats.active_services || 0;
                if (mostUsedEl) mostUsedEl.textContent = data.stats.most_used_service || 'None';
            }
        })
        .catch(error => {
            console.error('Failed to load URL services stats:', error);
        });
    },

    updateUrlServicesTable: function(services) {
        const tbody = document.getElementById('services-table');
        if (!tbody) return;

        if (services.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">No URL services found</td></tr>';
            return;
        }

        let html = '';
        services.forEach(service => {
            const statusBadge = service.is_active ? 'bg-success' : 'bg-secondary';
            const statusText = service.is_active ? 'Active' : 'Inactive';

            // Determine tracking type
            const hasDualUrl = service.shortened_url && service.target_url;
            const trackingType = hasDualUrl ? 'Dual-URL' : 'Single URL';
            const trackingBadge = hasDualUrl ? 'bg-info' : 'bg-secondary';

            // Format URLs for display
            const formatUrl = (url, maxLength = 40) => {
                if (!url) return 'N/A';
                const displayUrl = url.length > maxLength ? url.substring(0, maxLength) + '...' : url;
                return `<a href="${url}" target="_blank" title="${url}">${displayUrl}</a>`;
            };

            html += `
                <tr>
                    <td><strong>${service.name}</strong></td>
                    <td>${formatUrl(service.base_url)}</td>
                    <td>${formatUrl(service.shortened_url)}</td>
                    <td>${formatUrl(service.target_url)}</td>
                    <td><span class="badge ${trackingBadge}">${trackingType}</span></td>
                                            <td><span class="badge bg-success text-white"><i class='bx bx-shuffle me-1'></i>Random</span></td>
                    <td><span class="badge ${statusBadge}">${statusText}</span></td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary me-1" onclick="AdminPanel.editUrlService(${service.id})" title="Edit Service">
                            <i class='bx bx-edit'></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="AdminPanel.deleteUrlService(${service.id})" title="Delete Service">
                            <i class='bx bx-trash'></i>
                        </button>
                        ${hasDualUrl ? `
                        <button class="btn btn-sm btn-outline-info" onclick="AdminPanel.viewUrlServiceDetails(${service.id})" title="View Tracking Details">
                            <i class='bx bx-info-circle'></i>
                        </button>
                        ` : ''}
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    },

    addUrlService: function() {
        const name = document.getElementById('service-name').value;
        const url = document.getElementById('service-url').value;
        const apiEndpoint = document.getElementById('service-api-endpoint').value;
        const priority = document.getElementById('service-priority').value;

        // Get dual URL fields
        const dualUrlEnabled = document.getElementById('enable-dual-url').checked;
        const shortenedUrl = dualUrlEnabled ? document.getElementById('service-shortened-url').value : null;
        const targetUrl = dualUrlEnabled ? document.getElementById('service-target-url').value : null;

        const requestBody = {
            name: name,
            base_url: shortenedUrl || 'https://auto-generated.com', // Auto-fill from shortened URL
            api_endpoint: apiEndpoint || null,
            priority: parseInt(priority) || 1,
            is_active: true
        };

        // Add dual URL fields if enabled
        if (dualUrlEnabled) {
            requestBody.shortened_url = shortenedUrl;
            requestBody.target_url = targetUrl;
        }

        fetch(`${this.serverUrl}/api/url-services`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Id': this.sessionId
            },
            body: JSON.stringify(requestBody)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const trackingType = dualUrlEnabled ? 'dual-URL tracking' : 'single URL';
                this.showToast(`URL service with ${trackingType} added successfully`, 'success');

                // Reset form but keep dual URL enabled
                document.getElementById('add-service-form').reset();
                document.getElementById('enable-dual-url').checked = true;
                document.getElementById('dual-url-fields').style.display = 'block';
                document.getElementById('service-shortened-url').required = true;
                document.getElementById('service-target-url').required = true;

                this.refreshUrlServices();
            } else {
                this.showToast('Failed to add URL service: ' + data.error, 'error');
            }
        })
        .catch(error => {
            console.error('Failed to add URL service:', error);
            this.showToast('Failed to add URL service', 'error');
        });
    },

    setupEditModal: function() {
        // Setup edit modal dual-URL toggle
        const editDualUrlCheckbox = document.getElementById('edit-enable-dual-url');
        const editDualUrlFields = document.getElementById('edit-dual-url-fields');

        if (editDualUrlCheckbox && editDualUrlFields) {
            editDualUrlCheckbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    editDualUrlFields.style.display = 'block';
                    document.getElementById('edit-service-shortened-url').required = true;
                    document.getElementById('edit-service-target-url').required = true;
                } else {
                    editDualUrlFields.style.display = 'none';
                    document.getElementById('edit-service-shortened-url').required = false;
                    document.getElementById('edit-service-target-url').required = false;
                    document.getElementById('edit-service-shortened-url').value = '';
                    document.getElementById('edit-service-target-url').value = '';
                }
            });
        }

        // Setup save button
        const saveButton = document.getElementById('save-service-changes');
        if (saveButton) {
            saveButton.addEventListener('click', () => {
                this.saveServiceChanges();
            });
        }
    },

    editUrlService: function(serviceId) {
        // Fetch service details
        fetch(`${this.serverUrl}/api/url-services`, {
            headers: {
                'X-Session-Id': this.sessionId
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const service = data.services.find(s => s.id === serviceId);
                if (service) {
                    this.populateEditModal(service);
                    // Show the modal
                    const modal = new bootstrap.Modal(document.getElementById('editServiceModal'));
                    modal.show();
                } else {
                    this.showToast('Service not found', 'error');
                }
            } else {
                this.showToast('Failed to load service details: ' + data.error, 'error');
            }
        })
        .catch(error => {
            console.error('Failed to load service details:', error);
            this.showToast('Failed to load service details', 'error');
        });
    },

    populateEditModal: function(service) {
        // Populate basic fields
        document.getElementById('edit-service-id').value = service.id;
        document.getElementById('edit-service-name').value = service.name;
        document.getElementById('edit-service-url').value = service.base_url;
        document.getElementById('edit-service-api-endpoint').value = service.api_endpoint || '';
        document.getElementById('edit-service-priority').value = service.priority;
        document.getElementById('edit-service-active').checked = service.is_active;

        // Handle dual-URL fields
        const hasDualUrl = service.shortened_url && service.target_url;
        const dualUrlCheckbox = document.getElementById('edit-enable-dual-url');
        const dualUrlFields = document.getElementById('edit-dual-url-fields');

        if (hasDualUrl) {
            dualUrlCheckbox.checked = true;
            dualUrlFields.style.display = 'block';
            document.getElementById('edit-service-shortened-url').value = service.shortened_url;
            document.getElementById('edit-service-target-url').value = service.target_url;
            document.getElementById('edit-service-shortened-url').required = true;
            document.getElementById('edit-service-target-url').required = true;
        } else {
            dualUrlCheckbox.checked = false;
            dualUrlFields.style.display = 'none';
            document.getElementById('edit-service-shortened-url').value = '';
            document.getElementById('edit-service-target-url').value = '';
            document.getElementById('edit-service-shortened-url').required = false;
            document.getElementById('edit-service-target-url').required = false;
        }
    },

    saveServiceChanges: function() {
        const serviceId = document.getElementById('edit-service-id').value;
        const name = document.getElementById('edit-service-name').value;
        const url = document.getElementById('edit-service-url').value;
        const apiEndpoint = document.getElementById('edit-service-api-endpoint').value;
        const priority = document.getElementById('edit-service-priority').value;
        const isActive = document.getElementById('edit-service-active').checked;

        // Get dual URL fields
        const dualUrlEnabled = document.getElementById('edit-enable-dual-url').checked;
        const shortenedUrl = dualUrlEnabled ? document.getElementById('edit-service-shortened-url').value : null;
        const targetUrl = dualUrlEnabled ? document.getElementById('edit-service-target-url').value : null;

        const requestBody = {
            name: name,
            base_url: url,
            api_endpoint: apiEndpoint || null,
            priority: parseInt(priority) || 1,
            is_active: isActive
        };

        // Add dual URL fields if enabled
        if (dualUrlEnabled) {
            requestBody.shortened_url = shortenedUrl;
            requestBody.target_url = targetUrl;
        }

        fetch(`${this.serverUrl}/api/url-services/${serviceId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Id': this.sessionId
            },
            body: JSON.stringify(requestBody)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const trackingType = dualUrlEnabled ? 'dual-URL tracking' : 'single URL';
                this.showToast(`URL service with ${trackingType} updated successfully`, 'success');

                // Hide the modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('editServiceModal'));
                modal.hide();

                // Refresh the services list
                this.refreshUrlServices();
            } else {
                this.showToast('Failed to update URL service: ' + data.error, 'error');
            }
        })
        .catch(error => {
            console.error('Failed to update URL service:', error);
            this.showToast('Failed to update URL service', 'error');
        });
    },

    deleteUrlService: function(serviceId) {
        if (!confirm('Are you sure you want to delete this URL service?')) {
            return;
        }

        fetch(`${this.serverUrl}/api/url-services/${serviceId}`, {
            method: 'DELETE',
            headers: {
                'X-Session-Id': this.sessionId
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.showToast('URL service deleted successfully', 'success');
                this.refreshUrlServices();
            } else {
                this.showToast('Failed to delete URL service: ' + data.error, 'error');
            }
        })
        .catch(error => {
            console.error('Failed to delete URL service:', error);
            this.showToast('Failed to delete URL service', 'error');
        });
    },

    viewUrlServiceDetails: function(serviceId) {
        // Fetch service details and show tracking information
        fetch(`${this.serverUrl}/api/url-services`, {
            headers: {
                'X-Session-Id': this.sessionId
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const service = data.services.find(s => s.id === serviceId);
                if (service) {
                    const details = `
                        Service: ${service.name}

                        Tracking Type: Dual-URL
                        Shortened URL: ${service.shortened_url}
                        Target URL: ${service.target_url}

                        This service tracks user journey from the shortened URL to the target completion page.
                    `;
                    alert(details);
                }
            }
        })
        .catch(error => {
            console.error('Failed to load service details:', error);
        });
    },

    initLogsPage: function() {
        console.log('Logs page initialized');

        // Add refresh button event listener
        const refreshBtn = document.getElementById('refresh-logs');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshLogs();
            });
        }

        // Add filter button event listener
        const filterBtn = document.getElementById('apply-log-filters');
        if (filterBtn) {
            filterBtn.addEventListener('click', () => {
                this.refreshLogs();
            });
        }

        // Load initial data
        this.refreshLogs();
    },

    refreshLogs: function() {
        const action = document.getElementById('log-action-filter')?.value || '';
        const userId = document.getElementById('log-user-filter')?.value || '';
        const limit = document.getElementById('log-limit')?.value || '100';

        let url = `${this.serverUrl}/api/connection-logs?limit=${limit}`;
        if (action) url += `&action=${action}`;
        if (userId) url += `&user_id=${userId}`;

        fetch(url, {
            headers: {
                'X-Session-Id': this.sessionId
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.updateLogsTable(data.logs);
            } else {
                console.error('Failed to load logs:', data.error);
            }
        })
        .catch(error => {
            console.error('Failed to load logs:', error);
        });
    },

    updateLogsTable: function(logs) {
        const tbody = document.getElementById('logs-table');
        if (!tbody) return;

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No logs found</td></tr>';
            return;
        }

        let html = '';
        logs.forEach(log => {
            const timestamp = new Date(log.timestamp).toLocaleString();
            const statusBadge = this.getLogStatusBadge(log.status);

            html += `
                <tr>
                    <td>${timestamp}</td>
                    <td>${log.user_id || 'N/A'}</td>
                    <td>${log.session_id || 'N/A'}</td>
                    <td><span class="badge bg-info">${log.action}</span></td>
                    <td>${log.proxy_host || 'N/A'}</td>
                    <td>${log.proxy_port || 'N/A'}</td>
                    <td><span class="badge ${statusBadge.class}">${statusBadge.text}</span></td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    },

    getLogStatusBadge: function(status) {
        switch(status) {
            case 'connected':
                return { class: 'bg-success', text: 'Connected' };
            case 'disconnected':
                return { class: 'bg-secondary', text: 'Disconnected' };
            case 'failed':
                return { class: 'bg-danger', text: 'Failed' };
            case 'admin_disconnected':
                return { class: 'bg-warning', text: 'Admin Disconnected' };
            default:
                return { class: 'bg-secondary', text: status || 'Unknown' };
        }
    },
    
    initSettingsPage: function() {
        console.log('Settings page initialized');

        // Add save button event listener
        const saveBtn = document.getElementById('save-settings');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.saveSystemSettings();
            });
        }

        // Load initial data
        this.refreshSystemConfig();

        // Load URL extension statistics
        loadUrlExtensionStats();
    },

    refreshSystemConfig: function() {
        fetch(`${this.serverUrl}/api/system-config`, {
            headers: {
                'X-Session-Id': this.sessionId
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.updateSettingsForm(data.config);
            } else {
                console.error('Failed to load system config:', data.error);
            }
        })
        .catch(error => {
            console.error('Failed to load system config:', error);
        });
    },

    updateSettingsForm: function(config) {
        // Trial System Settings
        const enableTrialEl = document.getElementById('enable-trial-system');
        const trialDurationEl = document.getElementById('trial-duration');
        const trialMaxUsersEl = document.getElementById('trial-max-users');

        if (enableTrialEl && config.enable_trial_system) {
            enableTrialEl.checked = config.enable_trial_system.value;
        }
        if (trialDurationEl && config.trial_duration_minutes) {
            trialDurationEl.value = config.trial_duration_minutes.value;
        }
        if (trialMaxUsersEl && config.max_trial_users) {
            trialMaxUsersEl.value = config.max_trial_users.value;
        }

        // URL Extension System Settings
        const enableUrlExtensionsEl = document.getElementById('enable-url-extensions');
        const shortenedUrlEl = document.getElementById('shortened-url');
        const destinationUrlEl = document.getElementById('destination-url');
        const extensionHoursEl = document.getElementById('extension-hours');

        if (enableUrlExtensionsEl && config.enable_url_extensions) {
            enableUrlExtensionsEl.checked = config.enable_url_extensions.value;
        }
        if (shortenedUrlEl && config.shortened_url) {
            shortenedUrlEl.value = config.shortened_url.value;
        }
        if (destinationUrlEl && config.destination_url) {
            destinationUrlEl.value = config.destination_url.value;
        }
        if (extensionHoursEl && config.extension_hours) {
            extensionHoursEl.value = config.extension_hours.value;
        }

        // Server Settings
        const serverMaintenanceEl = document.getElementById('server-maintenance');
        const maxSessionsEl = document.getElementById('max-concurrent-sessions');
        const sessionTimeoutEl = document.getElementById('session-timeout');

        if (serverMaintenanceEl && config.server_maintenance) {
            serverMaintenanceEl.checked = config.server_maintenance.value;
        }
        if (maxSessionsEl && config.max_concurrent_sessions) {
            maxSessionsEl.value = config.max_concurrent_sessions.value;
        }
        if (sessionTimeoutEl && config.session_timeout_minutes) {
            sessionTimeoutEl.value = config.session_timeout_minutes.value;
        }

        // Monetization Settings
        const enableMonetizationEl = document.getElementById('enable-monetization');
        const monetizationRateEl = document.getElementById('monetization-rate');
        const paymentThresholdEl = document.getElementById('payment-threshold');

        if (enableMonetizationEl && config.enable_monetization) {
            enableMonetizationEl.checked = config.enable_monetization.value;
        }
        if (monetizationRateEl && config.monetization_rate_per_hour) {
            monetizationRateEl.value = config.monetization_rate_per_hour.value;
        }
        if (paymentThresholdEl && config.payment_threshold) {
            paymentThresholdEl.value = config.payment_threshold.value;
        }
    },

    saveSystemSettings: function() {
        const settings = {
            enable_trial_system: document.getElementById('enable-trial-system')?.checked || false,
            trial_duration_minutes: parseInt(document.getElementById('trial-duration')?.value) || 30,
            max_trial_users: parseInt(document.getElementById('trial-max-users')?.value) || 100,
            enable_url_extensions: document.getElementById('enable-url-extensions')?.checked || false,
            shortened_url: document.getElementById('shortened-url')?.value || '',
            destination_url: document.getElementById('destination-url')?.value || '',
            extension_hours: parseInt(document.getElementById('extension-hours')?.value) || 6,
            server_maintenance: document.getElementById('server-maintenance')?.checked || false,
            max_concurrent_sessions: parseInt(document.getElementById('max-concurrent-sessions')?.value) || 1000,
            session_timeout_minutes: parseInt(document.getElementById('session-timeout')?.value) || 60,
            enable_monetization: document.getElementById('enable-monetization')?.checked || false,
            monetization_rate_per_hour: parseFloat(document.getElementById('monetization-rate')?.value) || 0.01,
            payment_threshold: parseFloat(document.getElementById('payment-threshold')?.value) || 10.00
        };

        // Save each setting
        const promises = Object.keys(settings).map(key => {
            return fetch(`${this.serverUrl}/api/system-config/${key}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-Id': this.sessionId
                },
                body: JSON.stringify({ value: settings[key] })
            });
        });

        Promise.all(promises)
            .then(responses => Promise.all(responses.map(r => r.json())))
            .then(results => {
                const allSuccessful = results.every(r => r.success);
                if (allSuccessful) {
                    this.showToast('Settings saved successfully', 'success');
                } else {
                    this.showToast('Some settings failed to save', 'warning');
                }
            })
            .catch(error => {
                console.error('Failed to save settings:', error);
                this.showToast('Failed to save settings', 'error');
            });
    }
};

// URL Extension Settings function
function saveUrlExtensionSettings() {
    const settings = {
        enable_url_extensions: document.getElementById('enable-url-extensions')?.checked || false,
        shortened_url: document.getElementById('shortened-url')?.value || '',
        destination_url: document.getElementById('destination-url')?.value || '',
        extension_hours: parseInt(document.getElementById('extension-hours')?.value) || 6
    };

    // Validate URLs if extension system is enabled
    if (settings.enable_url_extensions) {
        if (!settings.shortened_url || !settings.destination_url) {
            AdminPanel.showToast('Please provide both shortened URL and destination URL', 'error');
            return;
        }

        try {
            new URL(settings.shortened_url);
            new URL(settings.destination_url);
        } catch (e) {
            AdminPanel.showToast('Please provide valid URLs', 'error');
            return;
        }
    }

    // Save each setting individually using the proper API
    const promises = Object.keys(settings).map(key => {
        return fetch(`${AdminPanel.serverUrl}/api/system-config/${key}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Id': AdminPanel.sessionId
            },
            body: JSON.stringify({ value: settings[key] })
        });
    });

    Promise.all(promises)
        .then(responses => Promise.all(responses.map(r => r.json())))
        .then(results => {
            const allSuccessful = results.every(r => r.success);
            if (allSuccessful) {
                AdminPanel.showToast('URL extension settings saved successfully!', 'success');
                // Reload stats after saving
                loadUrlExtensionStats();
            } else {
                AdminPanel.showToast('Some URL extension settings failed to save', 'warning');
            }
        })
        .catch(error => {
            console.error('Error saving URL extension settings:', error);
            AdminPanel.showToast('Failed to save URL extension settings: ' + error.message, 'error');
        });
}

// Load URL Extension Statistics
function loadUrlExtensionStats() {
    fetch(`${AdminPanel.serverUrl}/api/url-extension/stats`, {
        headers: {
            'X-Session-Id': AdminPanel.sessionId
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const stats = data.stats;
            document.getElementById('total-extensions').textContent = stats.total_extensions || 0;
            document.getElementById('completed-extensions').textContent = stats.completed_extensions || 0;
            document.getElementById('completion-rate').textContent = (stats.completion_rate || 0) + '%';
            document.getElementById('avg-completion-time').textContent = (stats.avg_completion_time_minutes || 0) + ' min';
        } else {
            console.error('Failed to load URL extension stats:', data.error);
            // Set default values
            document.getElementById('total-extensions').textContent = '0';
            document.getElementById('completed-extensions').textContent = '0';
            document.getElementById('completion-rate').textContent = '0%';
            document.getElementById('avg-completion-time').textContent = '0 min';
        }
    })
    .catch(error => {
        console.error('Error loading URL extension stats:', error);
        // Set error indicators
        document.getElementById('total-extensions').textContent = 'Error';
        document.getElementById('completed-extensions').textContent = 'Error';
        document.getElementById('completion-rate').textContent = 'Error';
        document.getElementById('avg-completion-time').textContent = 'Error';
    });
}

// Initialize the admin panel when the page loads
document.addEventListener('DOMContentLoaded', () => {
    AdminPanel.init();
    // Load URL extension stats on page load
    loadUrlExtensionStats();
}); 