/**
 * Manual Purchase Agent - Mobile API Demo
 * Version 10.0.0
 * 
 * Mobile-specific enhancements for the API demo interface
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialize mobile-specific UI components
    initMobileTabNavigation();
    initFloatingActionButton();
    initMobileMenuHandlers();
    initMobileConfirmDialog();
    initTabAutoSwitch();
    
    // Add initial console log
    addConsoleLog('Mobile API Demo Interface loaded', 'info');
});

/**
 * Initialize mobile tab navigation
 */
function initMobileTabNavigation() {
    const tabs = document.querySelectorAll('#mobileTabs button');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            // Update active state
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // Show target tab
            const targetId = this.getAttribute('data-bs-target');
            const tabContent = document.querySelector(targetId);
            
            document.querySelectorAll('.tab-pane').forEach(pane => {
                pane.classList.remove('show', 'active');
            });
            
            tabContent.classList.add('show', 'active');
        });
    });
    
    // Go to request tab button
    const goToRequestBtn = document.getElementById('go-to-request-btn');
    if (goToRequestBtn) {
        goToRequestBtn.addEventListener('click', function() {
            document.querySelector('[data-bs-target="#request-tab"]').click();
        });
    }
}

/**
 * Initialize floating action button
 */
function initFloatingActionButton() {
    const fabButton = document.getElementById('execute-fab');
    
    if (fabButton) {
        fabButton.addEventListener('click', function() {
            // Execute the API request
            executeRequest();
            
            // Switch to response tab
            setTimeout(() => {
                document.querySelector('[data-bs-target="#response-tab"]').click();
            }, 300);
        });
    }
}

/**
 * Initialize mobile menu handlers
 */
function initMobileMenuHandlers() {
    // Clear console from menu
    const clearConsoleNav = document.getElementById('clear-console-nav');
    if (clearConsoleNav) {
        clearConsoleNav.addEventListener('click', function(e) {
            e.preventDefault();
            document.getElementById('console-log').innerHTML = '';
            addConsoleLog('Console cleared', 'info');
            
            // Close the offcanvas menu
            const offcanvas = bootstrap.Offcanvas.getInstance(document.getElementById('navbarOffcanvas'));
            if (offcanvas) {
                offcanvas.hide();
            }
            
            // Switch to console tab
            document.querySelector('[data-bs-target="#console-tab"]').click();
        });
    }
    
    // Clear response from menu
    const clearResponseNav = document.getElementById('clear-response-nav');
    if (clearResponseNav) {
        clearResponseNav.addEventListener('click', function(e) {
            e.preventDefault();
            const responseContainer = document.getElementById('response-data');
            responseContainer.innerHTML = `
                <div class="text-center text-muted py-5">
                    <i class="fas fa-code fa-2x mb-3"></i>
                    <p>Response will appear here</p>
                </div>
            `;
            responseContainer.className = 'response-container mobile-response';
            addConsoleLog('Response cleared', 'info');
            
            // Close the offcanvas menu
            const offcanvas = bootstrap.Offcanvas.getInstance(document.getElementById('navbarOffcanvas'));
            if (offcanvas) {
                offcanvas.hide();
            }
            
            // Switch to response tab
            document.querySelector('[data-bs-target="#response-tab"]').click();
        });
    }
    
    // Clear database from menu
    const clearDatabaseNav = document.getElementById('clear-database-nav');
    if (clearDatabaseNav) {
        clearDatabaseNav.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Show mobile confirm dialog
            showMobileConfirm(
                'Clear Database', 
                'Are you sure you want to clear all data from the database? This action cannot be undone.',
                function() {
                    // Clear database on confirm
                    clearDatabase();
                    
                    // Close the offcanvas menu
                    const offcanvas = bootstrap.Offcanvas.getInstance(document.getElementById('navbarOffcanvas'));
                    if (offcanvas) {
                        offcanvas.hide();
                    }
                    
                    // Switch to response tab
                    document.querySelector('[data-bs-target="#response-tab"]').click();
                }
            );
        });
    }
    
    // Clear cache from menu
    const clearCacheNav = document.getElementById('clear-cache-nav');
    if (clearCacheNav) {
        clearCacheNav.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Show mobile confirm dialog
            showMobileConfirm(
                'Clear Cache', 
                'Are you sure you want to clear the cache? This will remove all cached search results and temporary files.',
                function() {
                    // Clear cache on confirm
                    clearCache();
                    
                    // Close the offcanvas menu
                    const offcanvas = bootstrap.Offcanvas.getInstance(document.getElementById('navbarOffcanvas'));
                    if (offcanvas) {
                        offcanvas.hide();
                    }
                    
                    // Switch to response tab
                    document.querySelector('[data-bs-target="#response-tab"]').click();
                }
            );
        });
    }
}

/**
 * Initialize mobile confirm dialog
 */
function initMobileConfirmDialog() {
    // Create the dialog container if it doesn't exist
    if (!document.getElementById('mobile-confirm-dialog')) {
        const dialogContainer = document.createElement('div');
        dialogContainer.id = 'mobile-confirm-dialog';
        dialogContainer.className = 'mobile-confirm-dialog d-none';
        document.body.appendChild(dialogContainer);
    }
}

/**
 * Show mobile confirm dialog
 * @param {string} title - Dialog title
 * @param {string} message - Dialog message
 * @param {Function} onConfirm - Callback on confirm
 */
function showMobileConfirm(title, message, onConfirm) {
    const container = document.getElementById('mobile-confirm-dialog');
    
    // Set dialog content
    container.innerHTML = `
        <div class="dialog-content">
            <div class="dialog-body">
                <h5>${title}</h5>
                <p class="mb-0">${message}</p>
            </div>
            <div class="dialog-footer">
                <button class="btn btn-outline-secondary" id="mobile-confirm-cancel">Cancel</button>
                <button class="btn btn-danger" id="mobile-confirm-ok">OK</button>
            </div>
        </div>
    `;
    
    // Show dialog
    container.classList.remove('d-none');
    
    // Add event listeners
    document.getElementById('mobile-confirm-cancel').addEventListener('click', function() {
        container.classList.add('d-none');
    });
    
    document.getElementById('mobile-confirm-ok').addEventListener('click', function() {
        container.classList.add('d-none');
        if (typeof onConfirm === 'function') {
            onConfirm();
        }
    });
}

/**
 * Show toast notification
 * @param {string} message - Toast message
 * @param {string} type - 'success', 'error', 'info'
 */
function showToast(message, type = 'info') {
    // Create toast container if it doesn't exist
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }
    
    // Create toast element
    const toastId = 'toast-' + Date.now();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.id = toastId;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    
    // Determine icon based on type
    let icon = 'info-circle';
    let bgColor = 'bg-info';
    
    if (type === 'success') {
        icon = 'check-circle';
        bgColor = 'bg-success';
    } else if (type === 'error') {
        icon = 'exclamation-circle';
        bgColor = 'bg-danger';
    }
    
    // Set toast content
    toast.innerHTML = `
        <div class="toast-header">
            <span class="rounded-circle ${bgColor} text-white p-1 me-2">
                <i class="fas fa-${icon} fa-sm"></i>
            </span>
            <strong class="me-auto">API Demo</strong>
            <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
        <div class="toast-body">
            ${message}
        </div>
    `;
    
    // Add to container
    toastContainer.appendChild(toast);
    
    // Initialize and show the toast
    const bsToast = new bootstrap.Toast(toast, { delay: 3000 });
    bsToast.show();
    
    // Remove after hiding
    toast.addEventListener('hidden.bs.toast', function() {
        this.remove();
    });
}

/**
 * Automatically switch to appropriate tab based on action
 */
function initTabAutoSwitch() {
    // Override executeRequest to switch tabs
    const originalExecuteRequest = window.executeRequest;
    
    if (typeof originalExecuteRequest === 'function') {
        window.executeRequest = function() {
            // Call the original function
            originalExecuteRequest();
            
            // Switch to response tab after a short delay
            setTimeout(() => {
                document.querySelector('[data-bs-target="#response-tab"]').click();
            }, 300);
        };
    }
    
    // Format JSON should switch to request tab
    const formatButton = document.getElementById('format-json');
    if (formatButton) {
        formatButton.addEventListener('click', function() {
            // Format the JSON (using original function)
            window.formatRequestBody();
            
            // Ensure we stay on request tab
            document.querySelector('[data-bs-target="#request-tab"]').click();
        });
    }
    
    // Endpoint selection should show request tab next
    const endpointSelect = document.getElementById('endpoint-selection');
    if (endpointSelect) {
        const originalChange = endpointSelect.onchange;
        
        endpointSelect.addEventListener('change', function() {
            // Show "continue to request" button when an endpoint is selected
            const continueButton = document.getElementById('go-to-request-btn');
            if (continueButton) {
                if (this.value) {
                    continueButton.classList.remove('d-none');
                } else {
                    continueButton.classList.add('d-none');
                }
            }
        });
    }
}

/**
 * Override original addConsoleLog function to handle mobile display
 */
const originalAddConsoleLog = window.addConsoleLog;

if (typeof originalAddConsoleLog === 'function') {
    window.addConsoleLog = function(message, type = 'info') {
        // Call original function
        originalAddConsoleLog(message, type);
        
        // Show toast for important messages
        if (type === 'error') {
            showToast(message, 'error');
        } else if (type === 'success') {
            showToast(message, 'success');
        }
    };
}