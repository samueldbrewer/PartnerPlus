/**
 * Main JavaScript for Manual Purchase Agent Web UI
 * Version 4.0.0
 */

// API client for interacting with backend
const API = {
    // Generic fetch wrapper with error handling
    async fetch(url, options = {}) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('API fetch error:', error);
            throw error;
        }
    },

    // API endpoints
    async getManuals(params = {}) {
        const queryParams = new URLSearchParams(params).toString();
        return this.fetch(`/api/manuals?${queryParams}`);
    },

    async searchManuals(make, model, manualType = 'technical', year = null) {
        const body = {
            make: make,
            model: model,
            manual_type: manualType,
        };
        if (year) body.year = year;

        return this.fetch('/api/manuals/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    },

    async getManual(id) {
        return this.fetch(`/api/manuals/${id}`);
    },

    async createManual(manualData) {
        return this.fetch('/api/manuals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(manualData)
        });
    },

    async processManual(id) {
        return this.fetch(`/api/manuals/${id}/process`, {
            method: 'POST'
        });
    },

    async deleteManual(id) {
        return this.fetch(`/api/manuals/${id}`, {
            method: 'DELETE'
        });
    },

    // Suppliers API
    async searchSuppliers(partNumber, options = {}) {
        const body = {
            part_number: partNumber,
            ...options
        };

        return this.fetch('/api/suppliers/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    },

    // Parts API
    async resolvePart(description, make, model, year = null) {
        const body = {
            description: description,
            make: make,
            model: model
        };
        if (year) body.year = year;

        return this.fetch('/api/parts/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    }
};

// Initialize on DOM content loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize all tooltips
    initTooltips();
    
    // Initialize any charts with real data when possible
    initCharts();
    
    // Set up workflow step navigation
    initWorkflowSteps();
    
    // Handle demo mode if available
    initDemoMode();
    
    // Setup event listeners for common components
    setupEventListeners();
});

/**
 * Initialize Bootstrap tooltips
 */
function initTooltips() {
    const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
}

/**
 * Initialize any Chart.js charts on the page
 */
function initCharts() {
    // Only initialize charts if Chart.js is available and charts exist
    if (typeof Chart !== 'undefined') {
        // Activity chart initialization
        const activityChartEl = document.getElementById('activityChart');
        if (activityChartEl) {
            // First try to fetch real activity data from API
            fetchActivityData()
                .then(data => {
                    initActivityChart(activityChartEl, data);
                })
                .catch(error => {
                    console.error('Error fetching activity data, using empty data:', error);
                    // Use empty data if API fails
                    const emptyData = {
                        labels: getLast30Days(),
                        datasets: [
                            {
                                label: 'Manuals Processed',
                                data: Array(30).fill(0),
                                borderColor: '#0d6efd',
                                backgroundColor: 'rgba(13, 110, 253, 0.1)',
                                tension: 0.4,
                                fill: true
                            },
                            {
                                label: 'Parts Identified',
                                data: Array(30).fill(0),
                                borderColor: '#198754',
                                backgroundColor: 'rgba(25, 135, 84, 0.1)',
                                tension: 0.4,
                                fill: true
                            },
                            {
                                label: 'Purchases',
                                data: Array(30).fill(0),
                                borderColor: '#ffc107',
                                backgroundColor: 'rgba(255, 193, 7, 0.1)',
                                tension: 0.4,
                                fill: true
                            }
                        ]
                    };
                    initActivityChart(activityChartEl, emptyData);
                });
        }
    }
}

/**
 * Fetch real activity data from API
 */
async function fetchActivityData() {
    try {
        // This would fetch from a real API endpoint
        // For now, return empty data since the endpoint may not exist
        return {
            labels: getLast30Days(),
            datasets: [
                {
                    label: 'Manuals Processed',
                    data: Array(30).fill(0),
                    borderColor: '#0d6efd',
                    backgroundColor: 'rgba(13, 110, 253, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Parts Identified',
                    data: Array(30).fill(0),
                    borderColor: '#198754',
                    backgroundColor: 'rgba(25, 135, 84, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Purchases',
                    data: Array(30).fill(0),
                    borderColor: '#ffc107',
                    backgroundColor: 'rgba(255, 193, 7, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        };
    } catch (error) {
        console.error('Error fetching activity data:', error);
        throw error;
    }
}

/**
 * Initialize activity chart with data
 */
function initActivityChart(chartElement, chartData) {
    new Chart(chartElement, {
        type: 'line',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            return context[0].label;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

/**
 * Initialize workflow step navigation
 */
function initWorkflowSteps() {
    const workflowSteps = document.querySelectorAll('.workflow-step');
    const progressBar = document.querySelector('.workflow-progress .progress-bar');
    
    if (workflowSteps.length && progressBar) {
        workflowSteps.forEach((step, index) => {
            step.addEventListener('click', () => {
                // Mark this step as active
                workflowSteps.forEach(s => s.classList.remove('active'));
                step.classList.add('active');
                
                // Update progress bar
                const progressPercent = ((index + 1) / workflowSteps.length) * 100;
                progressBar.style.width = `${progressPercent}%`;
                
                // In a real app, you would load the step content here
            });
        });
    }
}

/**
 * Initialize demo mode functionality
 */
function initDemoMode() {
    const demoContainer = document.getElementById('demo-step-container');
    
    if (demoContainer) {
        const demoControls = {
            autoAdvance: document.getElementById('switch-auto-advance'),
            showDetails: document.getElementById('switch-show-details'),
            simulateErrors: document.getElementById('switch-simulated-errors'),
            speed: document.getElementById('demo-speed')
        };
        
        // Set up demo controls
        if (demoControls.autoAdvance) {
            demoControls.autoAdvance.addEventListener('change', function() {
                // Toggle auto-advance setting
                console.log('Auto-advance:', this.checked);
            });
        }
        
        if (demoControls.showDetails) {
            demoControls.showDetails.addEventListener('change', function() {
                // Toggle detail visibility
                const details = document.querySelectorAll('.demo-details');
                details.forEach(detail => {
                    detail.style.display = this.checked ? 'block' : 'none';
                });
            });
        }
        
        if (demoControls.simulateErrors) {
            demoControls.simulateErrors.addEventListener('change', function() {
                // Toggle error simulation
                console.log('Simulate errors:', this.checked);
            });
        }
    }
}

/**
 * Set up event listeners for common components
 */
function setupEventListeners() {
    // Manual search form
    const searchForm = document.getElementById('manual-search-form');
    if (searchForm) {
        searchForm.addEventListener('submit', function(e) {
            e.preventDefault();
            // In a real app, you would submit this form via AJAX
            console.log('Searching for manuals...');
        });
    }
    
    // Filter change handlers
    const filters = document.querySelectorAll('[id$="-filter"]');
    filters.forEach(filter => {
        filter.addEventListener('change', function() {
            // In a real app, you would filter the content based on selection
            console.log('Filter changed:', this.id, this.value);
        });
    });
}

/**
 * Helper: Generate array of last 30 days as strings
 */
function getLast30Days() {
    const dates = [];
    const now = new Date();
    
    for (let i = 29; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        dates.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    }
    
    return dates;
}

/**
 * Helper: Generate random data points within range
 */
function generateRandomData(count, min, max) {
    return Array.from({ length: count }, () => 
        Math.floor(Math.random() * (max - min + 1)) + min
    );
}