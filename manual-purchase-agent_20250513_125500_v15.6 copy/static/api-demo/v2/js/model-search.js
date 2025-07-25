/**
 * Manual Purchase Agent - Model Search
 * Version 10.0.0
 * 
 * Specialized interface for searching and processing manuals by make/model
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialize event listeners
    initSearchForm();
    initConsoleLog();
    
    // Add initial console log
    addConsoleLog('Model Search interface loaded. Enter a make and model to begin.', 'info');
});

// Global variables to store state
let searchResults = [];
let selectedManualIds = [];
let manualComponents = {};
let currentMake = '';
let currentModel = '';
let currentYear = '';

/**
 * Initialize the search form
 */
function initSearchForm() {
    const searchButton = document.getElementById('search-button');
    searchButton.addEventListener('click', searchManuals);
    
    const processButton = document.getElementById('process-selected-manuals');
    processButton.addEventListener('click', processSelectedManuals);
    
    const componentsSelector = document.getElementById('components-manual-selector');
    componentsSelector.addEventListener('change', displaySelectedManualComponents);
    
    // Download CSV buttons
    const downloadErrorCodesBtn = document.getElementById('download-error-codes-csv');
    downloadErrorCodesBtn.addEventListener('click', downloadErrorCodesCSV);
    
    const downloadPartNumbersBtn = document.getElementById('download-part-numbers-csv');
    downloadPartNumbersBtn.addEventListener('click', downloadPartNumbersCSV);
    
    // Clear console button
    const clearConsoleBtn = document.getElementById('clear-console');
    clearConsoleBtn.addEventListener('click', function() {
        document.getElementById('console-log').innerHTML = '';
        addConsoleLog('Console cleared', 'info');
    });
}

/**
 * Search for manuals based on form inputs
 */
async function searchManuals() {
    // Get form values
    const make = document.getElementById('make').value.trim();
    const model = document.getElementById('model').value.trim();
    const year = document.getElementById('year').value.trim();
    const manualType = document.getElementById('manual-type').value;
    
    // Validate inputs
    if (!make || !model) {
        addConsoleLog('Please enter both make and model', 'error');
        return;
    }
    
    // Store current search parameters
    currentMake = make;
    currentModel = model;
    currentYear = year;
    
    // Show loading indicator
    showLoading('Searching for manuals...');
    
    // Log the search
    addConsoleLog(`Searching for ${manualType} manuals for ${make} ${model} ${year ? year : ''}`, 'request');
    
    try {
        // Call the API to search for manuals
        const response = await API.fetch('/api/manuals/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                make: make,
                model: model,
                year: year,
                manual_type: manualType
            })
        });
        
        // Hide loading indicator
        hideLoading();
        
        // Process the response
        // The API doesn't return success field, but directly returns the data
        if (response && !response.error) {
            const resultCount = response.count || 0;
            addConsoleLog(`Found ${resultCount} manuals`, 'success');
            searchResults = response.results || [];
            
            // Display results
            displaySearchResults(searchResults);
            
            // Reset selected manuals
            selectedManualIds = [];
            updateProcessButton();
            
            // Fetch enrichment data
            fetchEnrichmentData(make, model, year);
        } else {
            addConsoleLog(`Error: ${response.error || 'Failed to search manuals'}`, 'error');
            document.getElementById('search-results-container').classList.add('d-none');
        }
    } catch (error) {
        hideLoading();
        addConsoleLog(`Error: ${error.message}`, 'error');
        document.getElementById('search-results-container').classList.add('d-none');
    }
}

/**
 * Display search results in the table
 */
function displaySearchResults(results) {
    const container = document.getElementById('search-results-container');
    const resultCount = document.getElementById('result-count');
    const manualsTable = document.getElementById('manuals-table');
    
    // Update result count
    resultCount.textContent = `${results.length} Results`;
    
    // Clear existing results
    manualsTable.innerHTML = '';
    
    // Add results to table
    if (results.length === 0) {
        manualsTable.innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-4">
                    <i class="fas fa-search me-2 text-muted"></i>
                    No manuals found
                </td>
            </tr>
        `;
    } else {
        results.forEach((manual, index) => {
            const row = document.createElement('tr');
            
            // Format source URL
            const sourceUrl = manual.url;
            const displayUrl = sourceUrl.length > 40 ? 
                sourceUrl.substring(0, 37) + '...' : 
                sourceUrl;
            
            // Create row content
            row.innerHTML = `
                <td>
                    <div class="form-check">
                        <input class="form-check-input manual-checkbox" type="checkbox" value="${index}" id="manual-${index}">
                        <label class="form-check-label" for="manual-${index}">
                            ${manual.title}
                        </label>
                    </div>
                </td>
                <td><span class="badge bg-secondary">${manual.manual_type || 'Unknown'}</span></td>
                <td><a href="${sourceUrl}" target="_blank" title="${sourceUrl}">${displayUrl}</a></td>
                <td>
                    <button class="btn btn-sm btn-outline-primary save-manual-btn" data-index="${index}">
                        <i class="fas fa-save"></i> Save
                    </button>
                </td>
            `;
            
            manualsTable.appendChild(row);
        });
        
        // Add event listeners to checkboxes
        const checkboxes = document.querySelectorAll('.manual-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', updateSelectedManuals);
        });
        
        // Add event listeners to save buttons
        const saveButtons = document.querySelectorAll('.save-manual-btn');
        saveButtons.forEach(button => {
            button.addEventListener('click', saveManual);
        });
    }
    
    // Show results container
    container.classList.remove('d-none');
}

/**
 * Update the list of selected manuals
 */
function updateSelectedManuals() {
    // Get all checked checkboxes
    const checkedBoxes = document.querySelectorAll('.manual-checkbox:checked');
    
    // Update the selected manual IDs
    selectedManualIds = Array.from(checkedBoxes).map(checkbox => {
        const index = parseInt(checkbox.value);
        return searchResults[index];
    });
    
    // Update the process button state
    updateProcessButton();
}

/**
 * Update the state of the process button
 */
function updateProcessButton() {
    const processButton = document.getElementById('process-selected-manuals');
    
    if (selectedManualIds.length > 0 && selectedManualIds.length <= 3) {
        processButton.disabled = false;
        processButton.textContent = `Process ${selectedManualIds.length} Selected Manual${selectedManualIds.length > 1 ? 's' : ''}`;
    } else if (selectedManualIds.length > 3) {
        processButton.disabled = true;
        processButton.textContent = 'Maximum 3 Manuals Allowed';
    } else {
        processButton.disabled = true;
        processButton.textContent = 'Process Selected Manuals';
    }
}

/**
 * Save a manual to the database
 */
async function saveManual(event) {
    const button = event.currentTarget;
    const index = parseInt(button.getAttribute('data-index'));
    const manual = searchResults[index];
    
    // Show loading on button
    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Saving...';
    
    try {
        // Call the API to save the manual
        const response = await API.fetch('/api/manuals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: manual.title,
                make: currentMake,
                model: currentModel,
                year: currentYear,
                manual_type: manual.manual_type || 'technical',
                url: manual.url
            })
        });
        
        // Process the response
        if (response.success) {
            addConsoleLog(`Manual "${manual.title}" saved to database with ID: ${response.id}`, 'success');
            
            // Update button to show success
            button.innerHTML = '<i class="fas fa-check"></i> Saved';
            button.classList.remove('btn-outline-primary');
            button.classList.add('btn-success');
            
            // Store the manual ID for processing
            searchResults[index].db_id = response.id;
        } else {
            addConsoleLog(`Error saving manual: ${response.error || 'Unknown error'}`, 'error');
            
            // Restore button
            button.innerHTML = originalHtml;
            button.disabled = false;
        }
    } catch (error) {
        addConsoleLog(`Error: ${error.message}`, 'error');
        
        // Restore button
        button.innerHTML = originalHtml;
        button.disabled = false;
    }
}

/**
 * Process selected manuals
 */
async function processSelectedManuals() {
    // Verify selection
    if (selectedManualIds.length === 0 || selectedManualIds.length > 3) {
        addConsoleLog('Please select 1-3 manuals to process', 'error');
        return;
    }
    
    // Check if manuals have been saved
    const unsavedManuals = selectedManualIds.filter(manual => !manual.db_id);
    
    if (unsavedManuals.length > 0) {
        // First, save any unsaved manuals
        showLoading('Saving manuals to database...');
        
        try {
            // Save each unsaved manual
            for (const manual of unsavedManuals) {
                const response = await API.fetch('/api/manuals', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: manual.title,
                        make: currentMake,
                        model: currentModel,
                        year: currentYear,
                        manual_type: manual.manual_type || 'technical',
                        url: manual.url
                    })
                });
                
                if (response.success) {
                    addConsoleLog(`Manual "${manual.title}" saved with ID: ${response.id}`, 'success');
                    manual.db_id = response.id;
                } else {
                    addConsoleLog(`Error saving manual: ${response.error}`, 'error');
                    hideLoading();
                    return;
                }
            }
        } catch (error) {
            addConsoleLog(`Error saving manuals: ${error.message}`, 'error');
            hideLoading();
            return;
        }
    }
    
    // Now process all manuals
    showLoading('Processing manuals (this may take a few minutes)...');
    
    // Collect the manual IDs
    const manualIds = selectedManualIds.map(manual => manual.db_id);
    
    try {
        // Call the multi-process API
        addConsoleLog(`Processing ${manualIds.length} manuals in parallel...`, 'request');
        
        const response = await API.fetch('/api/manuals/multi-process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                manual_ids: manualIds
            })
        });
        
        // Hide loading
        hideLoading();
        
        // Process the response
        if (response.success) {
            addConsoleLog(`Successfully processed ${manualIds.length} manuals`, 'success');
            
            // Display the results
            displayProcessResults(response.reconciled_results);
            
            // Also fetch the components for each manual
            for (const manualId of manualIds) {
                fetchManualComponents(manualId);
            }
        } else {
            addConsoleLog(`Error processing manuals: ${response.error}`, 'error');
        }
    } catch (error) {
        hideLoading();
        addConsoleLog(`Error: ${error.message}`, 'error');
    }
}

/**
 * Display manual processing results
 */
function displayProcessResults(results) {
    const container = document.getElementById('process-results-container');
    
    // Error codes table
    const errorCodesTable = document.getElementById('error-codes-table');
    const errorCodesCount = document.getElementById('error-codes-count');
    
    // Part numbers table
    const partNumbersTable = document.getElementById('part-numbers-table');
    const partNumbersCount = document.getElementById('part-numbers-count');
    
    // Common problems accordion
    const problemsAccordion = document.getElementById('problems-accordion');
    
    // Maintenance list
    const maintenanceList = document.getElementById('maintenance-list');
    
    // Safety list
    const safetyList = document.getElementById('safety-list');
    
    // Clear existing content
    errorCodesTable.innerHTML = '';
    partNumbersTable.innerHTML = '';
    problemsAccordion.innerHTML = '';
    maintenanceList.innerHTML = '';
    safetyList.innerHTML = '';
    
    // Process error codes
    const errorCodes = results.error_codes || [];
    errorCodesCount.textContent = errorCodes.length;
    
    if (errorCodes.length === 0) {
        errorCodesTable.innerHTML = '<tr><td colspan="3" class="text-center">No error codes found</td></tr>';
    } else {
        errorCodes.forEach(code => {
            const row = document.createElement('tr');
            
            // Create confidence badge
            let confidenceBadge = '';
            if (code.confidence >= 90) {
                confidenceBadge = '<span class="badge bg-success">High</span>';
            } else if (code.confidence >= 70) {
                confidenceBadge = '<span class="badge bg-warning text-dark">Medium</span>';
            } else {
                confidenceBadge = '<span class="badge bg-danger">Low</span>';
            }
            
            row.innerHTML = `
                <td><code>${code.code}</code></td>
                <td>${code.description || 'No description available'}</td>
                <td>${confidenceBadge} ${code.confidence ? Math.round(code.confidence) + '%' : 'N/A'}</td>
            `;
            
            errorCodesTable.appendChild(row);
        });
    }
    
    // Process part numbers
    const partNumbers = results.part_numbers || [];
    partNumbersCount.textContent = partNumbers.length;
    
    if (partNumbers.length === 0) {
        partNumbersTable.innerHTML = '<tr><td colspan="4" class="text-center">No part numbers found</td></tr>';
    } else {
        partNumbers.forEach(part => {
            const row = document.createElement('tr');
            
            // Create confidence badge
            let confidenceBadge = '';
            if (part.confidence >= 90) {
                confidenceBadge = '<span class="badge bg-success">High</span>';
            } else if (part.confidence >= 70) {
                confidenceBadge = '<span class="badge bg-warning text-dark">Medium</span>';
            } else {
                confidenceBadge = '<span class="badge bg-danger">Low</span>';
            }
            
            row.innerHTML = `
                <td><code>${part.code}</code></td>
                <td>${part.description || 'No description available'}</td>
                <td>${confidenceBadge} ${part.confidence ? Math.round(part.confidence) + '%' : 'N/A'}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary lookup-part-btn" data-part="${part.code}">
                        <i class="fas fa-search"></i> Find Suppliers
                    </button>
                </td>
            `;
            
            partNumbersTable.appendChild(row);
        });
        
        // Add event listeners to lookup buttons
        const lookupButtons = document.querySelectorAll('.lookup-part-btn');
        lookupButtons.forEach(button => {
            button.addEventListener('click', function() {
                const partNumber = this.getAttribute('data-part');
                window.location.href = `part-search.html?part=${encodeURIComponent(partNumber)}&make=${encodeURIComponent(currentMake)}&model=${encodeURIComponent(currentModel)}`;
            });
        });
    }
    
    // Process common problems
    const commonProblems = results.common_problems || [];
    
    if (commonProblems.length === 0) {
        problemsAccordion.innerHTML = '<div class="alert alert-info">No common problems found</div>';
    } else {
        commonProblems.forEach((problem, index) => {
            const problemId = `problem-${index}`;
            const accordionItem = document.createElement('div');
            accordionItem.className = 'accordion-item';
            
            accordionItem.innerHTML = `
                <h2 class="accordion-header">
                    <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${problemId}">
                        ${problem.issue || 'Common Problem'}
                    </button>
                </h2>
                <div id="${problemId}" class="accordion-collapse collapse">
                    <div class="accordion-body">
                        ${problem.solution || 'No solution available'}
                    </div>
                </div>
            `;
            
            problemsAccordion.appendChild(accordionItem);
        });
    }
    
    // Process maintenance procedures
    const maintenance = results.maintenance_procedures || [];
    
    if (maintenance.length === 0) {
        maintenanceList.innerHTML = '<div class="alert alert-info">No maintenance procedures found</div>';
    } else {
        maintenance.forEach(procedure => {
            const item = document.createElement('div');
            item.className = 'list-group-item';
            item.innerHTML = procedure;
            maintenanceList.appendChild(item);
        });
    }
    
    // Process safety warnings
    const safety = results.safety_warnings || [];
    
    if (safety.length === 0) {
        safetyList.innerHTML = '<div class="alert alert-info">No safety warnings found</div>';
    } else {
        safety.forEach(warning => {
            const item = document.createElement('div');
            item.className = 'list-group-item list-group-item-warning';
            item.innerHTML = warning;
            safetyList.appendChild(item);
        });
    }
    
    // Process statistics
    const stats = results.statistics || {};
    const processingStats = results.processing_stats || {};
    
    const contentStatsContainer = document.getElementById('content-stats');
    const processingStatsContainer = document.getElementById('processing-stats');
    
    contentStatsContainer.innerHTML = '';
    processingStatsContainer.innerHTML = '';
    
    // Content statistics
    if (Object.keys(stats).length > 0) {
        contentStatsContainer.innerHTML = `
            <li class="list-group-item d-flex justify-content-between align-items-center">
                Manual Count
                <span class="badge bg-primary rounded-pill">${stats.manual_count || 0}</span>
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-center">
                Raw Error Codes
                <span class="badge bg-primary rounded-pill">${stats.raw_error_codes || 0}</span>
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-center">
                Unique Error Codes
                <span class="badge bg-primary rounded-pill">${stats.unique_error_codes || 0}</span>
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-center">
                Raw Part Numbers
                <span class="badge bg-primary rounded-pill">${stats.raw_part_numbers || 0}</span>
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-center">
                Unique Part Numbers
                <span class="badge bg-primary rounded-pill">${stats.unique_part_numbers || 0}</span>
            </li>
        `;
    } else {
        contentStatsContainer.innerHTML = '<li class="list-group-item">No content statistics available</li>';
    }
    
    // Processing statistics
    if (Object.keys(processingStats).length > 0) {
        processingStatsContainer.innerHTML = `
            <li class="list-group-item d-flex justify-content-between align-items-center">
                Download Time
                <span>${processingStats.download_time || 'N/A'}</span>
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-center">
                Processing Time
                <span>${processingStats.processing_time || 'N/A'}</span>
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-center">
                Reconciliation Time
                <span>${processingStats.reconciliation_time || 'N/A'}</span>
            </li>
            <li class="list-group-item d-flex justify-content-between align-items-center">
                Total Time
                <span>${processingStats.total_time || 'N/A'}</span>
            </li>
        `;
    } else {
        processingStatsContainer.innerHTML = '<li class="list-group-item">No processing statistics available</li>';
    }
    
    // Show results container
    container.classList.remove('d-none');
}

/**
 * Fetch enrichment data for the current make/model
 */
async function fetchEnrichmentData(make, model, year) {
    // Show loading
    showLoading('Fetching enrichment data...');
    
    try {
        // Call the enrichment API
        addConsoleLog(`Fetching enrichment data for ${make} ${model} ${year ? year : ''}`, 'request');
        
        const response = await API.fetch('/api/enrichment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                make: make,
                model: model,
                year: year
            })
        });
        
        // Hide loading
        hideLoading();
        
        // Process the response
        // The API doesn't return success field, but directly returns the data
        if (response && !response.error) {
            addConsoleLog('Enrichment data fetched successfully', 'success');
            
            // Log the entire response for debugging
            console.log('Enrichment API response:', response);
            
            // If we have images, log a sample image
            if (response.data && response.data.images && response.data.images.length > 0) {
                console.log('Sample image data:', response.data.images[0]);
            } else if (response.images && response.images.length > 0) {
                console.log('Sample image data:', response.images[0]);
            }
            
            // Display the enrichment data
            displayEnrichmentData(response.data || response);
        } else {
            addConsoleLog(`Error fetching enrichment data: ${response.error}`, 'error');
        }
    } catch (error) {
        hideLoading();
        addConsoleLog(`Error: ${error.message}`, 'error');
    }
}

/**
 * Display enrichment data
 */
function displayEnrichmentData(data) {
    const container = document.getElementById('enrichment-container');
    
    // Make sure we have the right data structure
    // API may return data directly or nested in a 'data' property
    const enrichmentData = data.data || data;
    
    // Process images
    const imagesContainer = document.getElementById('images-container');
    imagesContainer.innerHTML = '';
    
    const images = enrichmentData.images || [];
    
    if (images.length === 0) {
        imagesContainer.innerHTML = '<div class="col-12 text-center py-4 text-muted">No images available</div>';
    } else {
        images.forEach(image => {
            const col = document.createElement('div');
            col.className = 'col-md-4 mb-3';
            
            // Ensure valid URL or use placeholder
            const imgUrl = image.url || '/static/img/pdf-placeholder.svg';
            const imgTitle = image.title || 'Image';
            
            // Handle various source name formats
            let imgSource = '';
            if (image.source_name) imgSource = image.source_name;
            else if (image.source) {
                // If source is a URL, extract domain name
                if (image.source.startsWith('http')) {
                    try {
                        const url = new URL(image.source);
                        imgSource = url.hostname;
                    } catch (e) {
                        imgSource = image.source;
                    }
                } else {
                    imgSource = image.source;
                }
            } else {
                imgSource = 'Unknown source';
            }
            
            // Based on the enrichment_service.py code, source URL is likely in the "source" property
            let sourceUrl = '#';
            if (image.source_url && image.source_url.startsWith('http')) {
                sourceUrl = image.source_url;
            } else if (image.source && image.source.startsWith('http')) {
                sourceUrl = image.source;
            } else if (image.link && image.link.startsWith('http')) {
                sourceUrl = image.link;
            }
            
            // Ensure the URL has a protocol
            if (sourceUrl !== '#' && !sourceUrl.startsWith('http')) {
                sourceUrl = `https://${sourceUrl}`;
            }
            
            const sourceDisplay = sourceUrl !== '#' ? 
                `<a href="${sourceUrl}" class="btn btn-sm btn-outline-primary" target="_blank">View Source</a>` : 
                `<span class="text-muted">No source available</span>`;
            
            col.innerHTML = `
                <div class="card h-100">
                    <img src="${imgUrl}" class="card-img-top" alt="${imgTitle}" onerror="this.src='/static/img/pdf-placeholder.svg';">
                    <div class="card-body">
                        <h6 class="card-title">${imgTitle}</h6>
                        <p class="card-text small">${imgSource}</p>
                        ${sourceDisplay}
                    </div>
                </div>
            `;
            
            imagesContainer.appendChild(col);
        });
    }
    
    // Process videos
    const videosContainer = document.getElementById('videos-container');
    videosContainer.innerHTML = '';
    
    const videos = enrichmentData.videos || [];
    
    if (videos.length === 0) {
        videosContainer.innerHTML = '<div class="col-12 text-center py-4 text-muted">No videos available</div>';
    } else {
        videos.forEach(video => {
            const col = document.createElement('div');
            col.className = 'col-md-4 mb-3';
            
            // Extract YouTube video ID from URL if possible
            const videoUrl = video.url || '';
            let embedUrl = video.embed_url || '';
            
            // If we don't have an embed URL but have a regular URL, try to create one
            if (!embedUrl && videoUrl) {
                // Try to extract YouTube video ID
                const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/i;
                const match = videoUrl.match(youtubeRegex);
                if (match && match[1]) {
                    const videoId = match[1];
                    embedUrl = `https://www.youtube.com/embed/${videoId}`;
                }
            }
            
            // If we still don't have an embed URL, use a placeholder
            if (!embedUrl) {
                // Create a card without an iframe
                col.innerHTML = `
                    <div class="card h-100">
                        <div class="card-body text-center py-5 bg-light">
                            <i class="fas fa-video fa-3x text-muted mb-3"></i>
                            <h6 class="card-title">${video.title || 'Video'}</h6>
                            <p class="card-text small">${video.source || video.channel || 'Unknown source'} ${video.duration ? '• ' + video.duration : ''}</p>
                            ${videoUrl ? `<a href="${videoUrl}" class="btn btn-sm btn-outline-primary" target="_blank">Watch Video</a>` : ''}
                        </div>
                    </div>
                `;
            } else {
                // Create a card with an iframe for the video
                col.innerHTML = `
                    <div class="card h-100">
                        <div class="ratio ratio-16x9">
                            <iframe src="${embedUrl}" title="${video.title || 'Video'}" allowfullscreen></iframe>
                        </div>
                        <div class="card-body">
                            <h6 class="card-title">${video.title || 'Video'}</h6>
                            <p class="card-text small">${video.source || video.channel || 'Unknown source'} ${video.duration ? '• ' + video.duration : ''}</p>
                            ${videoUrl ? `<a href="${videoUrl}" class="btn btn-sm btn-outline-primary" target="_blank">Watch Video</a>` : ''}
                        </div>
                    </div>
                `;
            }
            
            videosContainer.appendChild(col);
        });
    }
    
    // Process articles
    const articlesContainer = document.getElementById('articles-container');
    articlesContainer.innerHTML = '';
    
    const articles = enrichmentData.articles || [];
    
    if (articles.length === 0) {
        articlesContainer.innerHTML = '<div class="text-center py-4 text-muted">No articles available</div>';
    } else {
        articles.forEach(article => {
            // Ensure we have valid URL
            const articleUrl = article.url || '#';
            
            if (articleUrl === '#') {
                // Create a non-link item for articles without URLs
                const div = document.createElement('div');
                div.className = 'list-group-item';
                div.innerHTML = `
                    <div class="d-flex w-100 justify-content-between">
                        <h6 class="mb-1">${article.title || 'Article'}</h6>
                        <small>${article.date || 'Unknown date'}</small>
                    </div>
                    <p class="mb-1">${article.description || article.summary || 'No description available'}</p>
                    <small>${article.source || 'Unknown source'}</small>
                `;
                articlesContainer.appendChild(div);
            } else {
                // Create a link item for articles with URLs
                const item = document.createElement('a');
                item.className = 'list-group-item list-group-item-action';
                item.href = articleUrl;
                item.target = '_blank';
                
                item.innerHTML = `
                    <div class="d-flex w-100 justify-content-between">
                        <h6 class="mb-1">${article.title || 'Article'}</h6>
                        <small>${article.date || 'Unknown date'}</small>
                    </div>
                    <p class="mb-1">${article.description || article.summary || 'No description available'}</p>
                    <small>${article.source || 'Unknown source'}</small>
                `;
                
                articlesContainer.appendChild(item);
            }
        });
    }
    
    // Show enrichment container
    container.classList.remove('d-none');
}

/**
 * Fetch components for a manual
 */
async function fetchManualComponents(manualId) {
    try {
        // Call the API
        addConsoleLog(`Fetching components for manual ID ${manualId}`, 'request');
        
        const response = await API.fetch(`/api/manuals/${manualId}/components`, {
            method: 'GET'
        });
        
        // Process the response
        // The API doesn't return success field, but directly returns the data
        if (response && !response.error) {
            addConsoleLog(`Manual components fetched for ID ${manualId}`, 'success');
            
            // Store the components
            manualComponents[manualId] = response;
            
            // Update the components selector
            updateComponentsSelector();
            
            // Display the components if this is the first one
            if (Object.keys(manualComponents).length === 1) {
                displayManualComponents(manualId);
            }
        } else {
            addConsoleLog(`Error fetching components for manual ID ${manualId}: ${response.error}`, 'error');
        }
    } catch (error) {
        addConsoleLog(`Error: ${error.message}`, 'error');
    }
}

/**
 * Update the components selector with available manuals
 */
function updateComponentsSelector() {
    const selector = document.getElementById('components-manual-selector');
    
    // Clear existing options except the first one
    while (selector.options.length > 1) {
        selector.remove(1);
    }
    
    // Add an option for each manual
    for (const manualId in manualComponents) {
        const manual = manualComponents[manualId];
        const option = document.createElement('option');
        option.value = manualId;
        option.textContent = manual.title;
        selector.appendChild(option);
    }
    
    // Show the components container if we have components
    if (Object.keys(manualComponents).length > 0) {
        document.getElementById('components-container').classList.remove('d-none');
    }
}

/**
 * Display components for the selected manual
 */
function displaySelectedManualComponents() {
    const selector = document.getElementById('components-manual-selector');
    const manualId = selector.value;
    
    if (manualId) {
        displayManualComponents(manualId);
    }
}

/**
 * Display components for a specific manual
 */
function displayManualComponents(manualId) {
    const manual = manualComponents[manualId];
    const components = manual.components || {};
    const container = document.getElementById('components-cards');
    
    // Clear existing components
    container.innerHTML = '';
    
    // If no components, show message
    if (Object.keys(components).length === 0) {
        container.innerHTML = '<div class="col-12 text-center py-4 text-muted">No components found in this manual</div>';
        return;
    }
    
    // Add a card for each component
    for (const key in components) {
        const component = components[key];
        const col = document.createElement('div');
        col.className = 'col-md-4 mb-3';
        
        // Format key information as list items
        let keyInfoHtml = '';
        if (component.key_information && component.key_information.length > 0) {
            keyInfoHtml = '<ul class="small">';
            component.key_information.forEach(info => {
                keyInfoHtml += `<li>${info}</li>`;
            });
            keyInfoHtml += '</ul>';
        }
        
        col.innerHTML = `
            <div class="card h-100">
                <div class="card-header">
                    ${component.title}
                </div>
                <div class="card-body">
                    <p class="card-text">${component.description || 'No description available'}</p>
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-secondary">Pages ${component.start_page}-${component.end_page}</span>
                        <button class="btn btn-sm btn-outline-primary process-component-btn" data-manual-id="${manualId}" data-component="${key}">
                            <i class="fas fa-cogs"></i> Process
                        </button>
                    </div>
                    ${keyInfoHtml}
                </div>
            </div>
        `;
        
        container.appendChild(col);
    }
    
    // Add event listeners to process buttons
    const processButtons = document.querySelectorAll('.process-component-btn');
    processButtons.forEach(button => {
        button.addEventListener('click', function() {
            const manualId = this.getAttribute('data-manual-id');
            const componentKey = this.getAttribute('data-component');
            processManualComponent(manualId, componentKey);
        });
    });
}

/**
 * Process a specific component of a manual
 */
async function processManualComponent(manualId, componentKey) {
    // Get the component info
    const manual = manualComponents[manualId];
    const component = manual.components[componentKey];
    
    // Show loading
    showLoading(`Processing ${component.title}...`);
    
    try {
        // Build a custom prompt based on the component
        const prompt = `Focus on extracting detailed information from the ${component.title.toLowerCase()} section (pages ${component.start_page}-${component.end_page}) of this ${manual.make} ${manual.model} manual. Look for ${component.key_information.join(', ')}.`;
        
        // Call the API
        addConsoleLog(`Processing ${component.title} from manual ID ${manualId}`, 'request');
        
        const response = await API.fetch(`/api/manuals/${manualId}/process-components`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: prompt
            })
        });
        
        // Hide loading
        hideLoading();
        
        // Process the response
        if (response.success) {
            addConsoleLog(`Successfully processed ${component.title} from manual ID ${manualId}`, 'success');
            
            // Display a dialog or output with the results
            alert(`Successfully processed ${component.title} from ${manual.title}. Check the console for details.`);
            
            // Log the components in the console
            addConsoleLog(`Results for ${component.title}:`, 'info');
            addConsoleLog(JSON.stringify(response.components[componentKey], null, 2), 'info');
        } else {
            addConsoleLog(`Error processing component: ${response.error}`, 'error');
        }
    } catch (error) {
        hideLoading();
        addConsoleLog(`Error: ${error.message}`, 'error');
    }
}

/**
 * Download error codes as CSV
 */
function downloadErrorCodesCSV() {
    // Get the error codes table
    const table = document.getElementById('error-codes-table');
    
    // Check if there are error codes
    if (!table || table.rows.length === 0) {
        addConsoleLog('No error codes to download', 'error');
        return;
    }
    
    // Create CSV content
    let csv = 'Error Code,Description,Confidence\n';
    
    // Iterate through table rows
    for (let i = 0; i < table.rows.length; i++) {
        const row = table.rows[i];
        
        // Skip rows with colspan (like "No error codes found")
        if (row.cells.length < 3) continue;
        
        // Get cell values
        const code = row.cells[0].textContent.trim();
        const description = row.cells[1].textContent.trim();
        const confidence = row.cells[2].textContent.trim().replace(/[^\d]/g, ''); // Extract just the number
        
        // Add to CSV
        csv += `"${code}","${description}",${confidence}\n`;
    }
    
    // Create blob and download
    downloadCSV(csv, `error-codes-${currentMake}-${currentModel}.csv`);
}

/**
 * Download part numbers as CSV
 */
function downloadPartNumbersCSV() {
    // Get the part numbers table
    const table = document.getElementById('part-numbers-table');
    
    // Check if there are part numbers
    if (!table || table.rows.length === 0) {
        addConsoleLog('No part numbers to download', 'error');
        return;
    }
    
    // Create CSV content
    let csv = 'OEM Part Number,Short Part Description,Confidence\n';
    
    // Iterate through table rows
    for (let i = 0; i < table.rows.length; i++) {
        const row = table.rows[i];
        
        // Skip rows with colspan (like "No part numbers found")
        if (row.cells.length < 3) continue;
        
        // Get cell values
        const partNumber = row.cells[0].textContent.trim();
        const description = row.cells[1].textContent.trim();
        const confidence = row.cells[2].textContent.trim().replace(/[^\d]/g, ''); // Extract just the number
        
        // Add to CSV
        csv += `"${partNumber}","${description}",${confidence}\n`;
    }
    
    // Create blob and download
    downloadCSV(csv, `part-numbers-${currentMake}-${currentModel}.csv`);
}

/**
 * Helper function to download a CSV file
 */
function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    addConsoleLog(`Downloaded ${filename}`, 'success');
}

/**
 * Show loading indicator
 */
function showLoading(message = 'Loading...') {
    const container = document.getElementById('loading-container');
    const messageElement = document.getElementById('loading-message');
    
    messageElement.textContent = message;
    container.classList.remove('d-none');
}

/**
 * Hide loading indicator
 */
function hideLoading() {
    const container = document.getElementById('loading-container');
    container.classList.add('d-none');
}

/**
 * Initialize console log
 */
function initConsoleLog() {
    const clearButton = document.getElementById('clear-console');
    clearButton.addEventListener('click', function() {
        document.getElementById('console-log').innerHTML = '';
        addConsoleLog('Console cleared', 'info');
    });
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