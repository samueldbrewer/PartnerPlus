/**
 * Manual Purchase Agent - API Demo v2
 * Version 10.0.0
 * 
 * Simplified single-page interface for API testing
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialize UI components
    initEndpointSelector();
    initButtonHandlers();
    initCopyButtons();
    
    // Add initial console log
    addConsoleLog('API Demo Interface loaded. Select an endpoint to begin.', 'info');
});

/**
 * API endpoint definitions
 */
const API_ENDPOINTS = {
    // System API
    'system-clear': {
        name: "Clear Database",
        method: "POST",
        url: "/api/system/clear-database",
        description: "Clear all data from the database (manuals, parts, profiles, etc.)",
        template: {}
    },
    'system-clear-cache': {
        name: "Clear Cache",
        method: "POST",
        url: "/api/system/clear-cache",
        description: "Clear all cached files and search results",
        template: {}
    },
    'enrichment-data': {
        name: "Get Enrichment Data",
        method: "POST",
        url: "/api/enrichment",
        description: "Get enriched multimedia data for a vehicle or part",
        template: {
            make: "Toyota",
            model: "Camry",
            year: "2023",
            part_number: ""  // Optional
        }
    },
    
    // Manuals API
    'manuals-search': {
        name: "Search Manuals",
        method: "POST",
        url: "/api/manuals/search",
        description: "Search for technical and parts manuals by make, model and year",
        template: {
            make: "Toyota",
            model: "Camry",
            year: "2020",
            manual_type: "technical"
        }
    },
    'manuals-list': {
        name: "List Manuals",
        method: "GET",
        url: "/api/manuals?page=1&per_page=10",
        description: "Get list of saved manuals",
        template: {}
    },
    'manuals-get': {
        name: "Get Manual",
        method: "GET",
        url: "/api/manuals/1",
        description: "Get details for a specific manual",
        template: {}
    },
    'manuals-create': {
        name: "Create Manual",
        method: "POST",
        url: "/api/manuals",
        description: "Save a new manual to the database",
        template: {
            title: "2022 Toyota Camry Repair Manual",
            make: "Toyota",
            model: "Camry",
            year: "2022",
            manual_type: "repair",
            url: "https://example.com/manual.pdf"
        }
    },
    'manuals-process': {
        name: "Process Manual",
        method: "POST",
        url: "/api/manuals/1/process",
        description: "Process a manual to extract part numbers and error codes",
        template: {}
    },
    'manuals-multi-process': {
        name: "Process Multiple Manuals",
        method: "POST",
        url: "/api/manuals/multi-process",
        description: "Process up to 3 manuals simultaneously and reconcile results",
        template: {
            "manual_ids": [1, 2, 3]
        }
    },
    'manuals-components': {
        name: "Get Manual Components",
        method: "GET",
        url: "/api/manuals/1/components",
        description: "Get structured components of a manual",
        template: {}
    },
    'manuals-process-components': {
        name: "Process Components",
        method: "POST",
        url: "/api/manuals/1/process-components",
        description: "Process manual components with a custom prompt",
        template: {
            prompt: "Focus on extracting detailed mechanical component information"
        }
    },

    // Parts API
    'parts-resolve': {
        name: "Resolve Part",
        method: "POST",
        url: "/api/parts/resolve",
        description: "Convert generic part descriptions to OEM part numbers",
        template: {
            description: "Air filter",
            make: "Toyota",
            model: "Camry",
            year: "2020",
            use_database: true,
            use_manual_search: true,
            use_web_search: true,
            save_results: true
        }
    },
    'parts-list': {
        name: "List Parts",
        method: "GET",
        url: "/api/parts?page=1&per_page=10",
        description: "Get list of parts",
        template: {}
    },
    'parts-get': {
        name: "Get Part",
        method: "GET",
        url: "/api/parts/1",
        description: "Get details for a specific part",
        template: {}
    },

    // Suppliers API
    'suppliers-search': {
        name: "Search Suppliers",
        method: "POST",
        url: "/api/suppliers/search",
        description: "Find suppliers for a specific part",
        template: {
            part_number: "17801-0H080",
            make: "Toyota",
            model: "Camry",
            oem_only: false
        }
    },
    'suppliers-list': {
        name: "List Suppliers",
        method: "GET",
        url: "/api/suppliers?page=1&per_page=10",
        description: "Get list of suppliers",
        template: {}
    },

    // Profiles API
    'profiles-create': {
        name: "Create Profile",
        method: "POST",
        url: "/api/profiles",
        description: "Create a new billing profile",
        template: {
            name: "Personal Account",
            billing_address: {
                name: "John Doe",
                address1: "123 Main St",
                city: "Anytown",
                state: "CA",
                zip: "12345",
                phone: "555-123-4567"
            },
            payment_info: {
                card_number: "4111111111111111",
                name: "John Doe",
                exp_month: "12",
                exp_year: "2025",
                cvv: "123"
            }
        }
    },
    'profiles-list': {
        name: "List Profiles",
        method: "GET",
        url: "/api/profiles?page=1&per_page=10",
        description: "Get list of billing profiles",
        template: {}
    },
    'profiles-get': {
        name: "Get Profile",
        method: "GET",
        url: "/api/profiles/1",
        description: "Get a specific billing profile",
        template: {}
    },

    // Purchases API
    'purchases-create': {
        name: "Create Purchase",
        method: "POST",
        url: "/api/purchases",
        description: "Initiate an automated purchase",
        template: {
            part_number: "17801-0H080",
            supplier_url: "https://example.com/product/17801-0H080",
            quantity: 1,
            billing_profile_id: 1
        }
    },
    'purchases-list': {
        name: "List Purchases",
        method: "GET",
        url: "/api/purchases?page=1&per_page=10",
        description: "Get list of purchases",
        template: {}
    },
    'purchases-get': {
        name: "Get Purchase",
        method: "GET",
        url: "/api/purchases/1",
        description: "Get details for a specific purchase",
        template: {}
    },
    'purchases-cancel': {
        name: "Cancel Purchase",
        method: "POST",
        url: "/api/purchases/1/cancel",
        description: "Cancel a pending purchase",
        template: {}
    }
};

/**
 * Initialize endpoint selector dropdown
 */
function initEndpointSelector() {
    const endpointSelect = document.getElementById('endpoint-selection');
    
    // Endpoint change handler
    endpointSelect.addEventListener('change', function() {
        if (!this.value) return;
        
        const endpointKey = this.value;
        const endpoint = API_ENDPOINTS[endpointKey];
        
        if (!endpoint) return;
        
        // Update request method display
        const methodDisplay = document.getElementById('request-method-display');
        methodDisplay.value = endpoint.method;
        
        // Update request URL
        const urlInput = document.getElementById('request-url');
        urlInput.value = endpoint.url;
        
        // Update request body (if needed)
        const bodyTextarea = document.getElementById('request-body');
        
        if (endpoint.method === 'GET') {
            bodyTextarea.value = '';
            bodyTextarea.disabled = true;
            bodyTextarea.placeholder = 'No request body needed for GET requests';
        } else {
            bodyTextarea.value = JSON.stringify(endpoint.template, null, 2);
            bodyTextarea.disabled = false;
            bodyTextarea.placeholder = '{ "key": "value" }';
        }
        
        // Add log entry
        addConsoleLog(`Selected endpoint: ${endpoint.name} (${endpoint.method} ${endpoint.url})`, 'info');
        addConsoleLog(`Description: ${endpoint.description}`, 'info');
    });
}

/**
 * Initialize button handlers
 */
function initButtonHandlers() {
    // Execute request button
    const executeButton = document.getElementById('execute-request');
    executeButton.addEventListener('click', executeRequest);
    
    // Format JSON button
    const formatButton = document.getElementById('format-json');
    formatButton.addEventListener('click', formatRequestBody);
    
    // Clear console button
    const clearConsoleButton = document.getElementById('clear-console');
    clearConsoleButton.addEventListener('click', function() {
        document.getElementById('console-log').innerHTML = '';
        addConsoleLog('Console cleared', 'info');
    });
    
    // Clear response button
    const clearResponseButton = document.getElementById('clear-response');
    clearResponseButton.addEventListener('click', function() {
        const responseContainer = document.getElementById('response-data');
        responseContainer.innerHTML = `
            <div class="text-center text-muted py-5">
                <i class="fas fa-code fa-2x mb-3"></i>
                <p>Response will appear here after executing a request</p>
            </div>
        `;
        responseContainer.className = 'response-container';
        addConsoleLog('Response cleared', 'info');
    });
    
    // Clear database button
    const clearDatabaseButton = document.getElementById('clear-database-btn');
    if (clearDatabaseButton) {
        clearDatabaseButton.addEventListener('click', function() {
            if (confirm('Are you sure you want to clear all data from the database? This action cannot be undone.')) {
                clearDatabase();
            }
        });
    }
    
    // Clear cache button
    const clearCacheButton = document.getElementById('clear-cache-btn');
    if (clearCacheButton) {
        clearCacheButton.addEventListener('click', function() {
            if (confirm('Are you sure you want to clear the cache? This will remove all cached search results and temporary files.')) {
                clearCache();
            }
        });
    }
}

/**
 * Format the request body JSON
 */
function formatRequestBody() {
    const textarea = document.getElementById('request-body');
    if (textarea.disabled) return;
    
    try {
        const json = JSON.parse(textarea.value || '{}');
        textarea.value = JSON.stringify(json, null, 2);
        addConsoleLog('JSON formatted', 'info');
    } catch (error) {
        addConsoleLog(`JSON format error: ${error.message}`, 'error');
    }
}

/**
 * Execute the API request
 */
async function executeRequest() {
    const endpointSelect = document.getElementById('endpoint-selection');
    if (!endpointSelect.value) {
        addConsoleLog('Please select an API endpoint first', 'error');
        return;
    }
    
    const endpoint = API_ENDPOINTS[endpointSelect.value];
    const method = endpoint.method;
    
    // Get the URL from the editable input field
    const url = document.getElementById('request-url').value;
    
    // Validate URL
    if (!url || !url.startsWith('/api/')) {
        addConsoleLog('Invalid URL. Must start with /api/', 'error');
        return;
    }
    
    const bodyTextarea = document.getElementById('request-body');
    
    // Prepare options
    const options = {
        method: method
    };
    
    // Add request body for non-GET methods
    if (method !== 'GET' && !bodyTextarea.disabled) {
        try {
            const bodyJson = JSON.parse(bodyTextarea.value || '{}');
            options.headers = { 'Content-Type': 'application/json' };
            options.body = JSON.stringify(bodyJson);
            
            addConsoleLog(`Request Body: ${JSON.stringify(bodyJson, null, 2)}`, 'request');
        } catch (error) {
            addConsoleLog(`Invalid JSON in request body: ${error.message}`, 'error');
            return;
        }
    }
    
    // Log the request
    addConsoleLog(`Executing ${method} ${url}`, 'request');
    
    // Update response container
    const responseContainer = document.getElementById('response-data');
    responseContainer.innerHTML = `
        <div class="text-center py-4">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2">Executing request...</p>
        </div>
    `;
    
    try {
        // Execute the request using the API client
        const response = await API.fetch(url, options);
        
        // Update response container
        displayResponse(responseContainer, response);
        
        // Log success or error
        if (response.success) {
            addConsoleLog(`Response: ${response.status} ${response.statusText}`, 'success');
        } else {
            addConsoleLog(`Error: ${response.status} ${response.statusText || response.error}`, 'error');
        }
    } catch (error) {
        // Handle unexpected errors
        displayError(responseContainer, error);
        addConsoleLog(`Error: ${error.message}`, 'error');
    }
}

/**
 * Display the API response
 */
function displayResponse(container, response) {
    // Check if this is a parts/resolve response with the new enhanced format
    const currentUrl = document.getElementById('request-url').value;
    if (currentUrl && currentUrl.includes('/api/parts/resolve')) {
        // Check if it's the new format (has 'results' property) or old format (has 'part_resolution')
        if (response.results) {
            displayEnhancedPartResolveResponse(container, response);
            return;
        } else if (response.part_resolution) {
            // Handle old format by converting to new format
            const convertedResponse = convertOldToNewFormat(response);
            displayEnhancedPartResolveResponse(container, convertedResponse);
            return;
        }
    }
    
    // Set container class based on response success
    container.className = response.success ? 
        'response-container success' : 
        'response-container error';
    
    // Format the response JSON
    const formattedJson = JSON.stringify(response, null, 2);
    
    // Display the formatted response
    container.innerHTML = `<pre><code class="language-json">${formattedJson}</code></pre>`;
    
    // Apply syntax highlighting if Prism is available
    if (window.Prism) {
        Prism.highlightAllUnder(container);
    }
}

/**
 * Convert old part resolve format to new format
 */
function convertOldToNewFormat(oldResponse) {
    const partRes = oldResponse.part_resolution || {};
    
    // Create new format response
    const newResponse = {
        success: oldResponse.success,
        query: {
            description: partRes.description || '',
            make: partRes.manufacturer || '',
            model: '',
            year: ''
        },
        results: {
            database: null,
            manual_search: null,
            ai_web_search: null
        },
        search_methods_used: partRes.search_methods_used || {},
        summary: oldResponse.message || ''
    };
    
    // Determine source and populate appropriate result
    if (partRes.source === 'database') {
        newResponse.results.database = {
            found: true,
            oem_part_number: partRes.oem_part_number,
            manufacturer: partRes.manufacturer,
            description: partRes.description,
            confidence: partRes.confidence || 1.0,
            alternate_part_numbers: partRes.alternate_part_numbers || []
        };
    } else if (partRes.source === 'manual' || partRes.manual_analysis) {
        newResponse.results.manual_search = {
            found: partRes.manual_analysis && partRes.manual_analysis.oem_part_number ? true : false,
            oem_part_number: partRes.manual_analysis ? partRes.manual_analysis.oem_part_number : partRes.oem_part_number,
            manufacturer: partRes.manufacturer,
            description: partRes.description,
            confidence: partRes.manual_analysis ? partRes.manual_analysis.confidence : partRes.confidence,
            manual_source: partRes.manual_analysis ? partRes.manual_analysis.manual_source : 'Unknown',
            alternate_part_numbers: partRes.alternate_part_numbers || []
        };
    }
    
    // Handle web search results
    if (partRes.web_search_analysis || partRes.source === 'web') {
        newResponse.results.ai_web_search = {
            found: partRes.web_search_analysis && partRes.web_search_analysis.oem_part_number ? true : false,
            oem_part_number: partRes.web_search_analysis ? partRes.web_search_analysis.oem_part_number : partRes.oem_part_number,
            manufacturer: partRes.manufacturer,
            description: partRes.description,
            confidence: partRes.web_search_analysis ? partRes.web_search_analysis.confidence : partRes.confidence,
            sources: partRes.web_search_analysis ? partRes.web_search_analysis.sources : [],
            alternate_part_numbers: partRes.alternate_part_numbers || []
        };
    }
    
    // Add comparison if available
    if (partRes.matches_web_search !== undefined) {
        newResponse.comparison = {
            part_numbers_match: partRes.matches_web_search,
            manual_part_number: partRes.manual_analysis ? partRes.manual_analysis.oem_part_number : null,
            ai_part_number: partRes.web_search_analysis ? partRes.web_search_analysis.oem_part_number : null
        };
    }
    
    return newResponse;
}

/**
 * Display enhanced part resolve response with visual formatting
 */
function displayEnhancedPartResolveResponse(container, response) {
    container.className = response.success ? 
        'response-container success' : 
        'response-container error';
    
    let html = '<div class="enhanced-response p-3">';
    
    // Query section
    html += '<div class="mb-4">';
    html += '<h5 class="text-primary mb-3">Query Information</h5>';
    html += '<div class="bg-light p-3 rounded">';
    html += `<p class="mb-1"><strong>Description:</strong> ${response.query.description}</p>`;
    html += `<p class="mb-1"><strong>Make:</strong> ${response.query.make || 'Not specified'}</p>`;
    html += `<p class="mb-1"><strong>Model:</strong> ${response.query.model || 'Not specified'}</p>`;
    html += `<p class="mb-0"><strong>Year:</strong> ${response.query.year || 'Not specified'}</p>`;
    html += '</div>';
    html += '</div>';
    
    // Summary section
    if (response.summary) {
        html += '<div class="mb-4">';
        html += '<h5 class="text-primary mb-3">Summary</h5>';
        html += `<div class="alert alert-info mb-0">${response.summary}</div>`;
        html += '</div>';
    }
    
    // Results section
    html += '<div class="mb-4">';
    html += '<h5 class="text-primary mb-3">Search Results</h5>';
    
    // Database result
    if (response.results.database) {
        html += createResultCard('Database Search', response.results.database, 'database');
    }
    
    // Manual search result
    if (response.results.manual_search) {
        html += createResultCard('Manual Search', response.results.manual_search, 'manual');
    }
    
    // AI web search result
    if (response.results.ai_web_search) {
        html += createResultCard('AI Web Search', response.results.ai_web_search, 'ai');
    }
    
    html += '</div>';
    
    // Comparison section
    if (response.comparison) {
        html += '<div class="mb-4">';
        html += '<h5 class="text-primary mb-3">Comparison</h5>';
        html += '<div class="bg-light p-3 rounded">';
        
        if (response.comparison.part_numbers_match) {
            html += '<div class="alert alert-success mb-0">';
            html += '<i class="fas fa-check-circle me-2"></i>';
            html += 'Manual and AI results match - high confidence in accuracy';
            html += '</div>';
        } else {
            html += '<div class="alert alert-warning">';
            html += '<i class="fas fa-exclamation-triangle me-2"></i>';
            html += 'Manual and AI returned different part numbers:';
            html += `<ul class="mb-0 mt-2">`;
            html += `<li>Manual: ${response.comparison.manual_part_number}</li>`;
            html += `<li>AI: ${response.comparison.ai_part_number}</li>`;
            html += `</ul>`;
            html += '</div>';
            
            // Show difference analysis if available
            if (response.comparison.difference_analysis) {
                const analysis = response.comparison.difference_analysis;
                html += '<div class="mt-3 border-top pt-3">';
                html += '<h6 class="text-muted mb-2">Part Difference Analysis</h6>';
                
                // Key differences
                html += '<div class="mb-3">';
                html += `<strong>Key Differences:</strong><br/>`;
                html += `<span class="text-muted">${analysis.key_differences}</span>`;
                html += '</div>';
                
                // Recommendation
                html += '<div class="mb-3">';
                html += `<strong>Recommendation:</strong><br/>`;
                html += `<div class="alert alert-info py-2 mb-0">${analysis.recommendation}</div>`;
                html += '</div>';
                
                // Interchangeable status
                html += '<div class="mb-3">';
                html += `<strong>Interchangeable:</strong> `;
                html += analysis.interchangeable ? 
                    '<span class="badge bg-success">Yes</span>' : 
                    '<span class="badge bg-danger">No</span>';
                html += '</div>';
                
                // Detailed explanation
                if (analysis.explanation) {
                    html += '<div class="mb-0">';
                    html += `<strong>Detailed Explanation:</strong><br/>`;
                    html += `<p class="text-muted mb-0">${analysis.explanation}</p>`;
                    html += '</div>';
                }
                
                html += '</div>';
            }
        }
        
        html += '</div>';
        html += '</div>';
    }
    
    // Raw JSON toggle
    html += '<div class="mt-4">';
    html += '<button class="btn btn-sm btn-outline-secondary" onclick="toggleRawJson(this)">Show Raw JSON</button>';
    html += '<div class="raw-json-container d-none mt-3">';
    html += `<pre><code class="language-json">${JSON.stringify(response, null, 2)}</code></pre>`;
    html += '</div>';
    html += '</div>';
    
    html += '</div>';
    
    container.innerHTML = html;
    
    // Apply syntax highlighting if Prism is available
    if (window.Prism) {
        Prism.highlightAllUnder(container);
    }
}

/**
 * Create a result card for part resolution display
 */
function createResultCard(title, result, type) {
    let html = '<div class="card mb-3">';
    html += `<div class="card-header bg-${getCardColor(type)} text-white">`;
    html += `<strong>${title}</strong>`;
    html += '</div>';
    html += '<div class="card-body">';
    
    if (result.found) {
        // Part information
        html += '<div class="row mb-3">';
        html += '<div class="col-md-6">';
        html += `<p class="mb-1"><strong>OEM Part Number:</strong> <code>${result.oem_part_number}</code></p>`;
        html += `<p class="mb-1"><strong>Manufacturer:</strong> ${result.manufacturer || 'Unknown'}</p>`;
        html += `<p class="mb-1"><strong>Confidence:</strong> ${(result.confidence * 100).toFixed(0)}%</p>`;
        html += '</div>';
        html += '<div class="col-md-6">';
        if (result.manual_source) {
            html += `<p class="mb-1"><strong>Source:</strong> ${result.manual_source}</p>`;
        }
        if (result.alternate_part_numbers && result.alternate_part_numbers.length > 0) {
            html += `<p class="mb-1"><strong>Alternates:</strong> ${result.alternate_part_numbers.join(', ')}</p>`;
        }
        html += '</div>';
        html += '</div>';
        
        if (result.description) {
            html += `<p class="mb-2"><strong>Description:</strong> ${result.description}</p>`;
        }
        
        // SerpAPI validation
        if (result.serpapi_validation) {
            const validation = result.serpapi_validation;
            html += '<div class="border-top pt-3 mt-3">';
            html += '<h6 class="text-muted mb-2">Market Validation</h6>';
            
            if (validation.is_valid) {
                html += `<div class="alert alert-success py-2 mb-2">`;
                html += `<strong>✓ Valid Part Number</strong> `;
                html += `(confidence: ${(validation.confidence_score * 100).toFixed(0)}%)`;
                html += '</div>';
                
                if (validation.part_description) {
                    html += `<p class="mb-2"><strong>Part Type:</strong> ${validation.part_description}</p>`;
                }
                
                if (validation.assessment) {
                    html += `<p class="small mb-0 text-muted">${validation.assessment}</p>`;
                }
            } else {
                html += '<div class="alert alert-warning py-2 mb-0">';
                html += '<strong>✗ Part number could not be validated</strong>';
                if (validation.assessment) {
                    html += `<br/><span class="small">${validation.assessment}</span>`;
                }
                html += '</div>';
            }
            
            html += '</div>';
        }
    } else {
        html += '<div class="alert alert-warning mb-0">';
        html += `<i class="fas fa-exclamation-circle me-2"></i>`;
        html += result.error || 'No results found';
        html += '</div>';
    }
    
    html += '</div>';
    html += '</div>';
    
    return html;
}

/**
 * Get card color based on result type
 */
function getCardColor(type) {
    switch (type) {
        case 'database': return 'success';
        case 'manual': return 'primary';
        case 'ai': return 'info';
        default: return 'secondary';
    }
}


/**
 * Toggle raw JSON display
 */
window.toggleRawJson = function(button) {
    const container = button.nextElementSibling;
    if (container.classList.contains('d-none')) {
        container.classList.remove('d-none');
        button.textContent = 'Hide Raw JSON';
    } else {
        container.classList.add('d-none');
        button.textContent = 'Show Raw JSON';
    }
}

/**
 * Display an error message
 */
function displayError(container, error) {
    container.className = 'response-container error';
    
    // Format error object
    const errorObj = {
        success: false,
        error: error.message || 'Unknown error',
        stack: error.stack || null
    };
    
    // Display the formatted error
    container.innerHTML = `<pre><code class="language-json">${JSON.stringify(errorObj, null, 2)}</code></pre>`;
    
    // Apply syntax highlighting if Prism is available
    if (window.Prism) {
        Prism.highlightAllUnder(container);
    }
}

/**
 * Add a log entry to the console
 */
function addConsoleLog(message, type = 'info') {
    const consoleLog = document.getElementById('console-log');
    const entry = document.createElement('div');
    
    // Format timestamp
    const timestamp = new Date().toISOString().substring(11, 23); // HH:MM:SS.mmm
    
    // Set entry class and content
    entry.className = `console-entry console-${type}`;
    entry.textContent = `[${timestamp}] ${message}`;
    
    // Add to console
    consoleLog.appendChild(entry);
    
    // Auto-scroll to bottom
    consoleLog.scrollTop = consoleLog.scrollHeight;
}

/**
 * Clear the database using the API
 */
async function clearDatabase() {
    addConsoleLog('Clearing database...', 'request');
    
    // Show loading state on the button
    const clearButton = document.getElementById('clear-database-btn');
    const originalBtnText = clearButton.innerHTML;
    clearButton.disabled = true;
    clearButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Clearing...';
    
    // Update response container
    const responseContainer = document.getElementById('response-data');
    responseContainer.innerHTML = `
        <div class="text-center py-4">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2">Clearing database...</p>
        </div>
    `;
    
    try {
        // Execute the request using the API client
        const response = await API.fetch('/api/system/clear-database', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        // Update response container
        displayResponse(responseContainer, response);
        
        // Log success or error
        if (response.success) {
            addConsoleLog(`Database cleared successfully: ${response.status} ${response.statusText}`, 'success');
        } else {
            addConsoleLog(`Error clearing database: ${response.status} ${response.statusText || response.error}`, 'error');
        }
    } catch (error) {
        // Handle unexpected errors
        displayError(responseContainer, error);
        addConsoleLog(`Error: ${error.message}`, 'error');
    } finally {
        // Reset button state
        clearButton.disabled = false;
        clearButton.innerHTML = originalBtnText;
    }
}

/**
 * Clear the cache using the API
 */
async function clearCache() {
    addConsoleLog('Clearing cache...', 'request');
    
    // Show loading state on the button
    const clearButton = document.getElementById('clear-cache-btn');
    const originalBtnText = clearButton.innerHTML;
    clearButton.disabled = true;
    clearButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Clearing...';
    
    // Update response container
    const responseContainer = document.getElementById('response-data');
    responseContainer.innerHTML = `
        <div class="text-center py-4">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2">Clearing cache...</p>
        </div>
    `;
    
    try {
        // Execute the request using the API client with cache-busting headers
        const response = await API.fetch('/api/system/clear-cache', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'X-Cache-Bust': Date.now()
            }
        });
        
        // Update response container
        displayResponse(responseContainer, response);
        
        // Log success or error
        if (response.success) {
            addConsoleLog(`Cache cleared successfully: ${response.status} ${response.statusText}`, 'success');
        } else {
            addConsoleLog(`Error clearing cache: ${response.status} ${response.statusText || response.error}`, 'error');
        }
    } catch (error) {
        // Handle unexpected errors
        displayError(responseContainer, error);
        addConsoleLog(`Error: ${error.message}`, 'error');
    } finally {
        // Reset button state
        clearButton.disabled = false;
        clearButton.innerHTML = originalBtnText;
    }
}

/**
 * Initialize copy buttons
 */
function initCopyButtons() {
    const copyButtons = document.querySelectorAll('.copy-button');
    
    copyButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const targetElement = document.getElementById(targetId);
            
            // Check if element exists
            if (!targetElement) return;
            
            // Get text to copy
            let textToCopy = '';
            
            if (targetElement.tagName === 'TEXTAREA' || targetElement.tagName === 'INPUT') {
                textToCopy = targetElement.value;
            } else {
                textToCopy = targetElement.textContent;
            }
            
            // Copy to clipboard
            navigator.clipboard.writeText(textToCopy)
                .then(() => {
                    // Visual feedback
                    this.classList.add('copied');
                    const originalHTML = this.innerHTML;
                    this.innerHTML = '<i class="fas fa-check"></i>';
                    
                    // Log
                    addConsoleLog(`Copied ${targetId} to clipboard`, 'info');
                    
                    // Reset after delay
                    setTimeout(() => {
                        this.classList.remove('copied');
                        this.innerHTML = originalHTML;
                    }, 1500);
                })
                .catch(err => {
                    addConsoleLog(`Failed to copy: ${err}`, 'error');
                });
        });
    });
}