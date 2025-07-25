/**
 * Manual Purchase Agent - Part Search
 * Version 10.0.0
 * 
 * Specialized interface for resolving part descriptions to OEM numbers
 * and finding suppliers
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialize event listeners
    initSearchForm();
    initConsoleLog();
    
    // Add initial console log
    addConsoleLog('Part Search interface loaded. Enter part details to begin.', 'info');
    
    // Check for URL parameters
    checkUrlParameters();
});

// Global variables to store state
let currentPartNumber = null;
let currentMake = '';
let currentModel = '';
let currentYear = '';

/**
 * Initialize the search form
 */
function initSearchForm() {
    const searchButton = document.getElementById('search-button');
    searchButton.addEventListener('click', searchPart);
    
    // OEM Only toggle for suppliers
    const oemOnlyToggle = document.getElementById('oem-only');
    oemOnlyToggle.addEventListener('change', function() {
        if (currentPartNumber) {
            fetchSuppliers(currentPartNumber, this.checked);
        }
    });
    
    // Clear results button
    const clearResultsButton = document.getElementById('clear-part-results');
    clearResultsButton.addEventListener('click', function() {
        document.getElementById('part-resolution-container').classList.add('d-none');
        document.getElementById('suppliers-container').classList.add('d-none');
        document.getElementById('enrichment-container').classList.add('d-none');
    });
    
    // Download CSV button
    const downloadButton = document.getElementById('download-part-csv');
    downloadButton.addEventListener('click', downloadPartCSV);
    
    // Clear console button
    const clearConsoleBtn = document.getElementById('clear-console');
    clearConsoleBtn.addEventListener('click', function() {
        document.getElementById('console-log').innerHTML = '';
        addConsoleLog('Console cleared', 'info');
    });
}

/**
 * Check for URL parameters to populate search form
 */
function checkUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Check for part number
    const part = urlParams.get('part');
    if (part) {
        document.getElementById('part-description').value = part;
    }
    
    // Check for make and model
    const make = urlParams.get('make');
    if (make) {
        document.getElementById('make').value = make;
    }
    
    const model = urlParams.get('model');
    if (model) {
        document.getElementById('model').value = model;
    }
    
    const year = urlParams.get('year');
    if (year) {
        document.getElementById('year').value = year;
    }
    
    // If we have at least part, make, and model, automatically search
    if (part && make && model) {
        setTimeout(searchPart, 500); // Small delay to allow page to load
    }
}

/**
 * Search for part based on form inputs
 */
async function searchPart() {
    // Get form values
    const make = document.getElementById('make').value.trim();
    const model = document.getElementById('model').value.trim();
    const year = document.getElementById('year').value.trim();
    const partDescription = document.getElementById('part-description').value.trim();
    
    // Get search toggle values
    const useDatabase = document.getElementById('use-database').checked;
    const useManualSearch = document.getElementById('use-manual-search').checked;
    const useWebSearch = document.getElementById('use-web-search').checked;
    const saveResults = document.getElementById('save-results').checked;
    
    // Validate inputs
    if (!make || !model || !partDescription) {
        addConsoleLog('Please enter make, model, and part description', 'error');
        return;
    }
    
    // Store current search parameters
    currentMake = make;
    currentModel = model;
    currentYear = year;
    
    // Check if at least one search method is enabled
    if (!useDatabase && !useManualSearch && !useWebSearch) {
        addConsoleLog('Please enable at least one search method', 'error');
        return;
    }
    
    // Show loading indicator
    showLoading('Resolving part number...');
    
    // Log the search
    addConsoleLog(`Resolving part "${partDescription}" for ${make} ${model} ${year ? year : ''}`, 'request');
    addConsoleLog(`Search methods: Database=${useDatabase}, Manual=${useManualSearch}, Web=${useWebSearch}, Save=${saveResults}`, 'info');
    
    try {
        // Check if input is already an OEM part number (simple heuristic)
        const isOemPattern = /^[A-Z0-9](?:[A-Z0-9\-]{4,20})$/i.test(partDescription.replace(/\s/g, ''));
        
        if (isOemPattern) {
            // Already an OEM part number, skip resolution
            addConsoleLog(`Input appears to be an OEM part number: ${partDescription}`, 'info');
            currentPartNumber = partDescription;
            
            // Hide loading indicator
            hideLoading();
            
            // Skip to fetching suppliers and enrichment
            fetchSuppliers(currentPartNumber, document.getElementById('oem-only').checked);
            fetchEnrichmentData(make, model, year, currentPartNumber);
            
            // Show a simplified part resolution result
            displayPartResolution({
                success: true,
                part_resolution: {
                    oem_part_number: currentPartNumber,
                    description: 'User-provided OEM part number',
                    source: 'user',
                    confidence: 100,
                    search_methods: {
                        database_search: false,
                        manual_search: false,
                        web_search: false,
                        save_to_database: false
                    }
                },
                message: `Using provided OEM part number: ${currentPartNumber}`
            });
            
            return;
        }
        
        // Call the API to resolve the part
        const response = await API.fetch('/api/parts/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                description: partDescription,
                make: make,
                model: model,
                year: year,
                use_database: useDatabase,
                use_manual_search: useManualSearch,
                use_web_search: useWebSearch,
                save_results: saveResults
            })
        });
        
        // Hide loading indicator
        hideLoading();
        
        // Process the response
        // The API doesn't return success field, but directly returns the data
        if (response && !response.error) {
            const message = response.message || 'Successfully resolved part';
            addConsoleLog(`${message}`, 'success');
            displayPartResolution(response);
            
            // Store the resolved part number
            if (response.part_resolution && response.part_resolution.oem_part_number) {
                currentPartNumber = response.part_resolution.oem_part_number;
                
                // Fetch suppliers and enrichment data
                fetchSuppliers(currentPartNumber, document.getElementById('oem-only').checked);
                fetchEnrichmentData(make, model, year, currentPartNumber);
            } else {
                addConsoleLog('No OEM part number found in response', 'error');
            }
        } else {
            addConsoleLog(`Error: ${response.error || 'Failed to resolve part'}`, 'error');
            document.getElementById('part-resolution-container').classList.add('d-none');
            document.getElementById('suppliers-container').classList.add('d-none');
            document.getElementById('enrichment-container').classList.add('d-none');
        }
    } catch (error) {
        hideLoading();
        addConsoleLog(`Error: ${error.message}`, 'error');
        document.getElementById('part-resolution-container').classList.add('d-none');
        document.getElementById('suppliers-container').classList.add('d-none');
        document.getElementById('enrichment-container').classList.add('d-none');
    }
}

/**
 * Display part resolution results
 */
function displayPartResolution(response) {
    const container = document.getElementById('part-resolution-container');
    const partData = response.part_resolution;
    
    // Fill in part details with proper formatting
    const oemPartNumber = document.getElementById('oem-part-number');
    const partDescription = document.getElementById('part-description-display');
    
    // Format the OEM part number with emphasis on the pattern
    if (partData.oem_part_number) {
        // Check if it follows a standard OEM pattern with numbers and letters/dashes
        const isComplexNumber = /^[A-Z0-9]+-?[A-Z0-9]+-?[A-Z0-9]+$/i.test(partData.oem_part_number);
        
        if (isComplexNumber) {
            // For complex part numbers, add proper spacing and formatting
            const formattedNumber = partData.oem_part_number.replace(/(-)/g, '<span class="text-muted">$1</span>');
            oemPartNumber.innerHTML = formattedNumber;
        } else {
            // Simple format for simple part numbers
            oemPartNumber.textContent = partData.oem_part_number;
        }
    } else {
        oemPartNumber.textContent = 'Not Found';
    }
    
    // Format the part description
    partDescription.textContent = partData.description || 'No description available';
    
    // Set part source
    const sourceElement = document.getElementById('part-source');
    if (partData.source) {
        let sourceName = '';
        switch (partData.source) {
            case 'database':
                sourceName = 'Database Match';
                break;
            case 'manual_search':
                sourceName = 'Manual Analysis';
                break;
            case 'web_search':
                sourceName = 'Web Search';
                break;
            case 'user':
                sourceName = 'User Provided';
                break;
            default:
                sourceName = partData.source;
        }
        sourceElement.textContent = sourceName;
    } else {
        sourceElement.textContent = 'Unknown Source';
    }
    
    // Set confidence
    const confidenceValue = partData.confidence || 0;
    const confidenceBar = document.getElementById('confidence-bar');
    const confidenceText = document.getElementById('confidence-text');
    
    confidenceBar.style.width = `${confidenceValue}%`;
    confidenceText.textContent = `${Math.round(confidenceValue)}% Confidence`;
    
    // Set confidence bar color
    if (confidenceValue >= 80) {
        confidenceBar.className = 'progress-bar bg-success';
    } else if (confidenceValue >= 60) {
        confidenceBar.className = 'progress-bar bg-info';
    } else if (confidenceValue >= 40) {
        confidenceBar.className = 'progress-bar bg-warning';
    } else {
        confidenceBar.className = 'progress-bar bg-danger';
    }
    
    // Update search methods used
    const searchMethods = partData.search_methods || {};
    
    // Database search
    const databaseCheck = document.getElementById('database-check');
    const databaseX = document.getElementById('database-x');
    if (searchMethods.database_search) {
        databaseCheck.classList.remove('d-none');
        databaseX.classList.add('d-none');
    } else {
        databaseCheck.classList.add('d-none');
        databaseX.classList.remove('d-none');
    }
    
    // Manual search
    const manualCheck = document.getElementById('manual-check');
    const manualX = document.getElementById('manual-x');
    if (searchMethods.manual_search) {
        manualCheck.classList.remove('d-none');
        manualX.classList.add('d-none');
    } else {
        manualCheck.classList.add('d-none');
        manualX.classList.remove('d-none');
    }
    
    // Web search
    const webCheck = document.getElementById('web-check');
    const webX = document.getElementById('web-x');
    if (searchMethods.web_search) {
        webCheck.classList.remove('d-none');
        webX.classList.add('d-none');
    } else {
        webCheck.classList.add('d-none');
        webX.classList.remove('d-none');
    }
    
    // Display alternative parts if any
    displayAlternativeParts(partData);
    
    // Show the part resolution container
    container.classList.remove('d-none');
}

/**
 * Display alternative parts
 */
function displayAlternativeParts(partData) {
    const container = document.getElementById('alt-parts-container');
    
    // Clear existing content
    container.innerHTML = '';
    
    // Get alternatives
    const alternatives = partData.alternative_part_numbers || [];
    
    // If no alternatives, show message
    if (alternatives.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center text-muted py-3">
                No alternative parts found
            </div>
        `;
        return;
    }
    
    // Add each alternative part
    alternatives.forEach(alt => {
        const col = document.createElement('div');
        col.className = 'col-md-4 mb-3';
        
        // Create confidence badge
        let confidenceBadge = '';
        if (alt.confidence >= 80) {
            confidenceBadge = '<span class="badge bg-success">High Confidence</span>';
        } else if (alt.confidence >= 60) {
            confidenceBadge = '<span class="badge bg-info">Medium Confidence</span>';
        } else {
            confidenceBadge = '<span class="badge bg-danger">Low Confidence</span>';
        }
        
        col.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <h6 class="card-title">${alt.part_number}</h6>
                    <p class="card-text small">${alt.description || 'No description available'}</p>
                    <div class="d-flex justify-content-between align-items-center">
                        ${confidenceBadge}
                        <button class="btn btn-sm btn-outline-primary use-alt-part-btn" data-part="${alt.part_number}">
                            Use This Part
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        container.appendChild(col);
    });
    
    // Add event listeners to buttons
    const useButtons = document.querySelectorAll('.use-alt-part-btn');
    useButtons.forEach(button => {
        button.addEventListener('click', function() {
            const partNumber = this.getAttribute('data-part');
            currentPartNumber = partNumber;
            
            // Update the display
            document.getElementById('oem-part-number').textContent = partNumber;
            document.getElementById('part-source').textContent = 'Alternative Part';
            
            // Fetch suppliers and enrichment data for this part
            fetchSuppliers(partNumber, document.getElementById('oem-only').checked);
            fetchEnrichmentData(currentMake, currentModel, currentYear, partNumber);
            
            addConsoleLog(`Switched to alternative part: ${partNumber}`, 'info');
        });
    });
}

/**
 * Fetch suppliers for a part number
 */
async function fetchSuppliers(partNumber, oemOnly = false) {
    // Show loading
    showLoading('Finding suppliers...');
    
    try {
        // Call the suppliers API
        addConsoleLog(`Searching for suppliers for part ${partNumber}`, 'request');
        
        const response = await API.fetch('/api/suppliers/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                part_number: partNumber,
                make: currentMake,
                model: currentModel,
                oem_only: oemOnly
            })
        });
        
        // Hide loading
        hideLoading();
        
        // Process the response
        // The API doesn't return success field, but directly returns the data
        if (response && !response.error) {
            const suppliers = response.suppliers || [];
            addConsoleLog(`Found ${suppliers.length} suppliers for part ${partNumber}`, 'success');
            
            // Display suppliers
            displaySuppliers(suppliers);
        } else {
            addConsoleLog(`Error searching suppliers: ${response.error}`, 'error');
            document.getElementById('suppliers-container').classList.add('d-none');
        }
    } catch (error) {
        hideLoading();
        addConsoleLog(`Error: ${error.message}`, 'error');
        document.getElementById('suppliers-container').classList.add('d-none');
    }
}

/**
 * Display suppliers
 */
function displaySuppliers(suppliers) {
    const container = document.getElementById('suppliers-container');
    const suppliersList = document.getElementById('suppliers-list');
    const noSuppliersMessage = document.getElementById('no-suppliers-message');
    
    // Clear existing content
    suppliersList.innerHTML = '';
    
    // Check if we have suppliers
    if (suppliers.length === 0) {
        noSuppliersMessage.classList.remove('d-none');
        suppliersList.innerHTML = '';
    } else {
        noSuppliersMessage.classList.add('d-none');
        
        // Add each supplier
        suppliers.forEach(supplier => {
            const col = document.createElement('div');
            col.className = 'col-md-4 mb-4';
            
            // Create supplier card
            const card = document.createElement('div');
            card.className = 'card h-100 result-card';
            
            // Format price if available
            let priceDisplay = '';
            if (supplier.price) {
                // Handle price formatting for numeric or string values
                let priceValue = supplier.price;
                if (typeof priceValue === 'string') {
                    // Remove dollar sign if present
                    priceValue = priceValue.replace(/[\$,]/g, '');
                    priceValue = parseFloat(priceValue);
                }
                
                if (!isNaN(priceValue)) {
                    priceDisplay = `<div class="h5 mb-0 text-primary">$${priceValue.toFixed(2)}</div>`;
                } else {
                    // Keep original string if parsing failed
                    priceDisplay = `<div class="h5 mb-0 text-primary">${supplier.price}</div>`;
                }
            } else {
                priceDisplay = '<span class="text-muted">Price not available</span>';
            }
            
            // Create in stock badge
            let stockBadge = '';
            if (supplier.in_stock === true) {
                stockBadge = '<span class="badge bg-success">In Stock</span>';
            } else if (supplier.in_stock === false) {
                stockBadge = '<span class="badge bg-danger">Out of Stock</span>';
            } else {
                stockBadge = '<span class="badge bg-secondary">Stock Unknown</span>';
            }
            
            // Generate logo placeholder if needed
            const logoUrl = supplier.logo_url || `https://via.placeholder.com/150x60.png?text=${encodeURIComponent(supplier.name)}`;
            
            // Determine the product URL with proper fallbacks
            let productUrl = '';
            
            // Check for various URL fields in different formats
            if (supplier.product_url && supplier.product_url.startsWith('http')) {
                productUrl = supplier.product_url;
            } else if (supplier.url && supplier.url.startsWith('http')) {
                productUrl = supplier.url;
            } else if (supplier.link && supplier.link.startsWith('http')) {
                productUrl = supplier.link;
            } else if (supplier.domain) {
                // If only domain is available, create a URL from it
                productUrl = `https://${supplier.domain}`;
            } else {
                // Last resort fallback
                const domain = `${supplier.name.toLowerCase().replace(/\s+/g, '')}.com`;
                productUrl = `https://www.${domain}`;
            }
            
            // Ensure we have a proper description
            const description = supplier.description || supplier.snippet || supplier.title || 'No description available';
            
            card.innerHTML = `
                <div class="card-body">
                    <img src="${logoUrl}" alt="${supplier.name}" class="supplier-logo">
                    <h5 class="card-title">${supplier.name}</h5>
                    <p class="card-text small">${description}</p>
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        ${priceDisplay}
                        ${stockBadge}
                    </div>
                </div>
                <div class="card-footer bg-light">
                    <div class="d-grid">
                        <a href="${productUrl}" target="_blank" class="btn btn-sm btn-outline-primary">
                            <i class="fas fa-external-link-alt me-1"></i> View Product
                        </a>
                    </div>
                </div>
            `;
            
            col.appendChild(card);
            suppliersList.appendChild(col);
        });
    }
    
    // Show the suppliers container
    container.classList.remove('d-none');
}

/**
 * Fetch enrichment data for the part
 */
async function fetchEnrichmentData(make, model, year, partNumber) {
    // Show loading
    showLoading('Fetching enrichment data...');
    
    try {
        // Call the enrichment API
        addConsoleLog(`Fetching enrichment data for ${make} ${model} part ${partNumber}`, 'request');
        
        const response = await API.fetch('/api/enrichment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                make: make,
                model: model,
                year: year,
                part_number: partNumber
            })
        });
        
        // Hide loading
        hideLoading();
        
        // Process the response
        // The API doesn't return success field, but directly returns the data
        if (response && !response.error) {
            addConsoleLog('Enrichment data fetched successfully', 'success');
            
            // Display the enrichment data
            displayEnrichmentData(response.data || response);
        } else {
            addConsoleLog(`Error fetching enrichment data: ${response.error}`, 'error');
            document.getElementById('enrichment-container').classList.add('d-none');
        }
    } catch (error) {
        hideLoading();
        addConsoleLog(`Error: ${error.message}`, 'error');
        document.getElementById('enrichment-container').classList.add('d-none');
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
    const imagesContainer = document.getElementById('part-images-container');
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
    const videosContainer = document.getElementById('part-videos-container');
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
    const articlesContainer = document.getElementById('part-articles-container');
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
 * Download part data as CSV
 */
function downloadPartCSV() {
    if (!currentPartNumber) {
        addConsoleLog('No part data to download', 'error');
        return;
    }
    
    // Get part data
    const partNumber = document.getElementById('oem-part-number').textContent;
    const description = document.getElementById('part-description-display').textContent;
    const source = document.getElementById('part-source').textContent;
    const confidence = document.getElementById('confidence-text').textContent.split('%')[0].trim();
    
    // Create CSV content
    let csv = 'OEM Part Number,Short Part Description,Source,Confidence\n';
    csv += `"${partNumber}","${description}","${source}",${confidence}\n`;
    
    // Create blob and download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `part-${partNumber}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    addConsoleLog(`Downloaded part-${partNumber}.csv`, 'success');
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