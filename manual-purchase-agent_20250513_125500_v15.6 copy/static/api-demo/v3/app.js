// ===== CACHE BUSTING =====
// Clear caches but don't break functionality
(function() {
    console.log('Clearing caches...');
    
    // Clear caches in background without blocking
    if ('caches' in window) {
        caches.keys().then(names => {
            names.forEach(name => {
                caches.delete(name);
            });
            console.log('✅ Caches cleared');
        }).catch(err => {
            console.log('Cache clear error:', err);
        });
    }
})();

// ===== APP STATE & CONFIGURATION =====
class AIPartsAgent {
    constructor() {
        this.baseURL = window.location.origin;
        this.currentSearch = null;
        this.currentPart = null;
        this.currentSuppliers = [];
        this.activePurchase = null;
        this.availableRecordings = [];
        this.currentScreen = 'main';
        this.defaultBillingProfile = null;
        this.similarParts = null;
        this.currentGenericResults = null;
        
        // Progress tracking
        this.steps = ['model', 'manuals', 'part', 'suppliers'];
        this.currentStep = -1;
        
        this.init();
    }

    async init() {
        this.bindEvents();
        this.setupIntersectionObserver();
        this.setupStickyProgress();
        
        this.addLog('info', 'System', 'PartPro initialized successfully');
        
        // Initialize billing profile with dummy data
        this.initializeBillingProfile();
        
        // Fetch available recordings
        try {
            this.addLog('info', 'API', 'Fetching available purchase recordings...');
            const response = await fetch(`${this.baseURL}/api/recordings/available`);
            if (response.ok) {
                const data = await response.json();
                this.availableRecordings = data.domains || [];
                this.addLog('success', 'API', `Found recordings for ${this.availableRecordings.length} domains: ${this.availableRecordings.join(', ')}`, {
                endpoint: '/api/recordings/available',
                domains: this.availableRecordings
            });
                console.log('Available purchase recordings for:', this.availableRecordings);
            }
        } catch (e) {
            this.addLog('error', 'API', `Failed to fetch recordings: ${e.message}`, {
                endpoint: '/api/recordings/available',
                error: e.toString()
            });
            console.error('Failed to fetch available recordings:', e);
            this.availableRecordings = [];
        }
    }

    // ===== EVENT BINDING =====
    bindEvents() {
        const searchForm = document.getElementById('searchForm');
        if (!searchForm) {
            console.error('Search form not found!');
            return;
        }
        console.log('Binding submit event to search form');
        searchForm.addEventListener('submit', (e) => {
            console.log('Form submitted');
            this.handleSearch(e);
        });
        
        // Add smooth scrolling for better UX
        document.addEventListener('click', (e) => {
            if (e.target.matches('[data-scroll-to]')) {
                const target = document.getElementById(e.target.dataset.scrollTo);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        });
    }

    setupIntersectionObserver() {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('fade-in');
                    }
                });
            },
            { threshold: 0.1, rootMargin: '50px' }
        );

        // Observe all cards
        document.querySelectorAll('.card').forEach(card => {
            observer.observe(card);
        });
    }

    setupStickyProgress() {
        const progressSection = document.getElementById('progressSection');
        if (!progressSection) return;

        let lastScroll = 0;
        let ticking = false;

        const updateSticky = () => {
            const scrollY = window.scrollY;
            const rect = progressSection.getBoundingClientRect();
            
            // Add stuck class when the progress bar reaches the top
            if (rect.top <= 0) {
                progressSection.classList.add('stuck');
            } else {
                progressSection.classList.remove('stuck');
            }
            
            lastScroll = scrollY;
            ticking = false;
        };

        // Throttle scroll events for performance
        window.addEventListener('scroll', () => {
            if (!ticking) {
                window.requestAnimationFrame(updateSticky);
                ticking = true;
            }
        });
    }

    // ===== MAIN SEARCH FLOW =====
    async handleSearch(e) {
        console.log('handleSearch called');
        e.preventDefault();
        e.stopPropagation();
        
        const make = document.getElementById('make').value.trim();
        const model = document.getElementById('model').value.trim();
        const partName = document.getElementById('partName').value.trim();
        
        console.log('Search values:', { make, model, partName });
        
        if (!make || !model || !partName) {
            console.log('Missing required fields');
            return;
        }

        this.currentSearch = { make, model, partName };
        this.resetUI();
        this.showProgress();

        try {
            // Execute the complete flow
            await this.executeSearchFlow(make, model, partName);
        } catch (error) {
            console.error('Search flow error:', error);
            this.showError('An error occurred during the search. Please try again.');
        }
    }

    async executeSearchFlow(make, model, partName) {
        // Fire off all initial requests simultaneously
        console.log('🚀 Starting parallel API requests...');
        
        // Immediately show all sections with loading states
        this.showLoadingStates();
        
        // Start all requests at once
        const modelEnrichmentPromise = this.getModelEnrichment(make, model);
        const manualsPromise = this.getManuals(make, model);
        const partResolutionPromise = this.resolvePart(partName, make, model);
        
        // Set initial steps as active/loading
        this.setStepLoading('model');
        this.setStepLoading('manuals'); 
        this.setStepLoading('part');
        this.setStepLoading('suppliers');
        
        // Handle model enrichment as soon as it completes
        modelEnrichmentPromise.then(modelInfo => {
            console.log('✅ Model enrichment completed');
            this.updateModelInfo(modelInfo);
            this.setStepCompleted('model');
        }).catch(error => {
            console.error('❌ Model enrichment failed:', error);
            this.updateModelInfo(null);
            this.setStepCompleted('model');
        });
        
        // Handle manuals as soon as they complete
        manualsPromise.then(manuals => {
            console.log('✅ Manuals search completed');
            this.updateManuals(manuals);
            this.setStepCompleted('manuals');
        }).catch(error => {
            console.error('❌ Manuals search failed:', error);
            this.updateManuals([]);
            this.setStepCompleted('manuals');
        });
        
        // Handle part resolution, then trigger dependent requests
        try {
            const partData = await partResolutionPromise;
            console.log('✅ Part resolution completed');
            
            if (partData && partData.oem_part_number) {
                // Start part enrichment first
                const partEnrichmentPromise = this.getPartEnrichment(partData.oem_part_number);
                
                // Handle part enrichment and THEN start suppliers
                partEnrichmentPromise.then(partInfo => {
                    console.log('✅ Part enrichment completed');
                    
                    // Merge part data with enrichment and ensure alternate parts are included
                    const mergedPartData = { 
                        ...partData, 
                        ...partInfo,
                        // Ensure alternate parts are carried through
                        alternate_part_numbers: partData.alternate_part_numbers || []
                    };
                    
                    console.log('Part data alternates:', partData.alternate_part_numbers);
                    console.log('Merged data alternates:', mergedPartData.alternate_part_numbers);
                    
                    // If we have alternate parts without images, enrich them
                    if (mergedPartData.alternate_part_numbers.length > 0) {
                        mergedPartData.alternate_part_numbers = mergedPartData.alternate_part_numbers.map(alt => {
                            if (typeof alt === 'string') {
                                return {
                                    part_number: alt,
                                    type: 'Alternative',
                                    image_url: null
                                };
                            }
                            return alt;
                        });
                    }
                    
                    this.updatePart(mergedPartData);
                    this.setStepCompleted('part');
                    
                    // NOW start suppliers after part is displayed
                    console.log('🔍 Starting supplier search...');
                    
                    this.getSuppliers(partData.oem_part_number, make, model).then(suppliers => {
                        console.log('✅ Suppliers search completed');
                        this.updateSuppliers(suppliers);
                        this.setStepCompleted('suppliers');
                    }).catch(error => {
                        console.error('❌ Suppliers search failed:', error);
                        this.updateSuppliers([]);
                        this.setStepCompleted('suppliers');
                    });
                    
                }).catch(error => {
                    console.error('❌ Part enrichment failed:', error);
                    this.updatePart(partData);
                    this.setStepCompleted('part');
                    
                    // Still start suppliers even if enrichment failed
                    console.log('🔍 Starting supplier search (after enrichment failure)...');
                    
                    this.getSuppliers(partData.oem_part_number, make, model).then(suppliers => {
                        console.log('✅ Suppliers search completed');
                        this.updateSuppliers(suppliers);
                        this.setStepCompleted('suppliers');
                    }).catch(error => {
                        console.error('❌ Suppliers search failed:', error);
                        this.updateSuppliers([]);
                        this.setStepCompleted('suppliers');
                    });
                });
                
            } else {
                console.error('Part resolution returned null or no OEM part number');
                this.addLog('warning', 'Part Resolution', 'Exact match not found, searching for similar parts...');
                
                // Find similar parts when exact resolution fails
                try {
                    const similarParts = await this.findSimilarParts(partName, make, model);
                    
                    if (similarParts && similarParts.length > 0) {
                        // Show part selection UI
                        this.showSimilarPartsSelection(similarParts);
                    } else {
                        this.showError('No parts found. Please try a different description.');
                        this.setStepCompleted('part');
                        this.setStepCompleted('suppliers');
                    }
                } catch (error) {
                    console.error('Failed to find similar parts:', error);
                    this.showError('Could not find any matching parts');
                    this.setStepCompleted('part');
                    this.setStepCompleted('suppliers');
                }
            }
        } catch (error) {
            console.error('❌ Part resolution failed:', error);
            this.showError('Error during part resolution: ' + error.message);
            this.setStepCompleted('part');
            this.setStepCompleted('suppliers');
        }
    }

    // ===== API CALLS =====
    async getModelEnrichment(make, model) {
        const startTime = Date.now();
        this.addLog('info', 'API', 'Fetching model enrichment data', {
            endpoint: '/api/enrichment',
            params: { make, model }
        });
        try {
            const response = await fetch(`${this.baseURL}/api/enrichment`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                cache: 'no-store',
                body: JSON.stringify({ 
                    make: make,
                    model: model
                })
            });
            
            if (!response.ok) throw new Error('Failed to get model enrichment');
            const data = await response.json();
            
            const elapsed = Date.now() - startTime;
            this.addLog('success', 'API', `Model enrichment completed in ${elapsed}ms`, {
                images_found: data.data?.images?.length || 0
            });
            console.log('Model enrichment response:', data);
            
            // Extract the first image URL if available
            if (data.success && data.data && data.data.images && data.data.images.length > 0) {
                const imageUrl = data.data.images[0].url;
                console.log('Found model image URL:', imageUrl);
                return { image_url: imageUrl };
            }
            console.log('No model images in response');
            return null;
        } catch (error) {
            console.error('Model enrichment error:', error);
            return null;
        }
    }

    async getManuals(make, model) {
        const startTime = Date.now();
        this.addLog('info', 'API', 'Searching for manuals', {
            endpoint: '/api/manuals/search',
            params: { make, model }
        });
        try {
            const response = await fetch(`${this.baseURL}/api/manuals/search`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                cache: 'no-store',
                body: JSON.stringify({ make, model })
            });
            
            if (!response.ok) throw new Error('Failed to get manuals');
            const data = await response.json();
            
            const elapsed = Date.now() - startTime;
            this.addLog('success', 'API', `Manual search completed in ${elapsed}ms`, {
                manuals_found: data.results?.length || 0,
                returning: Math.min(4, data.results?.length || 0)
            });
            return data.results?.slice(0, 4) || [];
        } catch (error) {
            console.error('Manuals error:', error);
            return this.getMockManualsData();
        }
    }

    async resolvePart(description, make, model) {
        try {
            this.addLog('info', 'API', `Resolving part: "${description}" for ${make} ${model}`, {
                endpoint: '/api/parts/resolve',
                method: 'POST',
                request_body: {
                    description,
                    make,
                    model,
                    use_database: false,
                    use_manual_search: true,
                    use_web_search: true
                }
            });
            const startTime = Date.now();
            const response = await fetch(`${this.baseURL}/api/parts/resolve`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                cache: 'no-store',
                body: JSON.stringify({
                    description,
                    make,
                    model,
                    use_database: false,
                    use_manual_search: true,
                    use_web_search: true,
                    save_results: false,
                    bypass_cache: true  // Always get fresh results for demo
                })
            });
            
            if (!response.ok) throw new Error('Failed to resolve part');
            const data = await response.json();
            
            this.addLog('success', 'API', `Part resolved: ${data.recommended_result?.oem_part_number || 'No part found'}`, {
                response_time: `${Date.now() - startTime}ms`,
                search_methods_used: Object.keys(data.results || {}),
                recommendation_reason: data.recommendation_reason
            });
            console.log('Part resolution API response:', data);
            
            // Get the best result from the response
            const results = data.results || {};
            
            console.log('Checking results:', {
                manual_search: results.manual_search,
                ai_web_search: results.ai_web_search,
                database: results.database,
                recommended: data.recommended_result,
                recommendation_reason: data.recommendation_reason
            });
            
            // Collect all alternate parts from all search methods
            const allAlternates = [];
            
            // Collect alternates from each search method
            if (results.manual_search?.alternate_part_numbers) {
                results.manual_search.alternate_part_numbers.forEach(alt => {
                    if (!allAlternates.find(a => a.part_number === (typeof alt === 'string' ? alt : alt.part_number))) {
                        allAlternates.push(typeof alt === 'string' ? { part_number: alt, type: 'Manual Search Alternate' } : alt);
                    }
                });
            }
            
            if (results.ai_web_search?.alternate_part_numbers) {
                results.ai_web_search.alternate_part_numbers.forEach(alt => {
                    if (!allAlternates.find(a => a.part_number === (typeof alt === 'string' ? alt : alt.part_number))) {
                        allAlternates.push(typeof alt === 'string' ? { part_number: alt, type: 'Web Search Alternate' } : alt);
                    }
                });
            }
            
            // Also add the primary results from each method as alternates if they exist and are different
            const recommendedPartNumber = data.recommended_result?.oem_part_number;
            
            if (results.manual_search?.oem_part_number && 
                results.manual_search.oem_part_number !== recommendedPartNumber &&
                !allAlternates.find(a => a.part_number === results.manual_search.oem_part_number)) {
                allAlternates.push({
                    part_number: results.manual_search.oem_part_number,
                    type: 'Manual Search Primary',
                    description: results.manual_search.description
                });
            }
            
            if (results.ai_web_search?.oem_part_number && 
                results.ai_web_search.oem_part_number !== recommendedPartNumber &&
                !allAlternates.find(a => a.part_number === results.ai_web_search.oem_part_number)) {
                allAlternates.push({
                    part_number: results.ai_web_search.oem_part_number,
                    type: 'Web Search Primary',
                    description: results.ai_web_search.description
                });
            }
            
            // Check if similar parts were triggered due to invalid results
            if (data.similar_parts_triggered && data.similar_parts && data.similar_parts.length > 0) {
                console.log('🔍 Similar parts search was triggered:', data.similar_parts);
                console.log('   Reason:', data.recommendation_reason);
                
                // Store similar parts in instance for UI display
                this.similarParts = data.similar_parts;
                
                // Return the first similar part as the main result, with others as alternates
                const mainPart = data.similar_parts[0];
                const alternateFromSimilar = data.similar_parts.slice(1).map(part => ({
                    part_number: part.part_number,
                    type: 'Similar Part',
                    image_url: part.image_url,
                    description: part.description
                }));
                
                return {
                    oem_part_number: mainPart.part_number,
                    description: mainPart.description || `Similar part for ${description}`,
                    image_url: mainPart.image_url,
                    serpapi_validation: { is_valid: false }, // Similar parts are not verified - show similar parts list
                    similar_parts_triggered: true,
                    similar_parts: data.similar_parts, // Include similar parts for UI display
                    alternate_part_numbers: [...allAlternates, ...alternateFromSimilar]
                };
            }
            
            // Use the intelligently recommended result if available
            if (data.recommended_result && data.recommended_result.oem_part_number) {
                console.log('✅ Using AI-recommended result:', data.recommended_result);
                console.log('   Reason:', data.recommendation_reason);
                console.log('   Alternate parts found:', allAlternates);
                
                // Ensure alternates are included
                const result = { ...data.recommended_result };
                result.alternate_part_numbers = allAlternates;
                
                // Include similar parts if they were triggered
                if (data.similar_parts_triggered && data.similar_parts) {
                    result.similar_parts = data.similar_parts;
                    // Keep original verification status - don't force to false
                    // Similar parts can be shown for both verified and unverified parts
                }
                
                return result;
            }
            
            // Fallback to manual checking if no recommendation
            console.log('⚠️ No recommended result, falling back to manual selection');
            
            // Check each result type for a found part
            if (results.manual_search && results.manual_search.found && results.manual_search.oem_part_number) {
                console.log('✅ Using manual search result:', results.manual_search);
                const result = { ...results.manual_search };
                result.alternate_part_numbers = allAlternates;
                return result;
            }
            
            if (results.ai_web_search && results.ai_web_search.found && results.ai_web_search.oem_part_number) {
                console.log('✅ Using AI web search result:', results.ai_web_search);
                const result = { ...results.ai_web_search };
                result.alternate_part_numbers = allAlternates;
                return result;
            }
            
            if (results.database && results.database.found && results.database.oem_part_number) {
                console.log('✅ Using database result:', results.database);
                const result = { ...results.database };
                result.alternate_part_numbers = allAlternates;
                return result;
            }
            
            console.log('❌ No valid results found in any search method');
            return null;
        } catch (error) {
            this.addLog('error', 'API', `Part resolution failed: ${error.message}`, {
                error_type: error.name,
                stack_trace: error.stack
            });
            console.error('Part resolution error:', error);
            return this.getMockPartData();
        }
    }

    async findSimilarParts(description, make, model) {
        try {
            this.addLog('info', 'API', `Finding similar parts for: "${description}"`, {
                endpoint: '/api/parts/find-similar',
                method: 'POST',
                request_body: {
                    description,
                    make,
                    model
                }
            });
            
            const startTime = Date.now();
            const response = await fetch(`${this.baseURL}/api/parts/find-similar`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache'
                },
                body: JSON.stringify({
                    description,
                    make,
                    model,
                    max_results: 10
                })
            });
            
            if (!response.ok) throw new Error('Failed to find similar parts');
            const data = await response.json();
            
            this.addLog('success', 'API', `Found ${data.similar_parts?.length || 0} similar parts`, {
                response_time: `${Date.now() - startTime}ms`
            });
            
            return data.similar_parts || [];
        } catch (error) {
            this.addLog('error', 'API', `Similar parts search failed: ${error.message}`);
            console.error('Similar parts search error:', error);
            return [];
        }
    }

    async getPartEnrichment(partNumber) {
        try {
            // For parts, we should use the actual make/model context
            const requestBody = { 
                make: this.currentSearch.make,
                model: this.currentSearch.model,
                part_number: partNumber
            };
            console.log('Part enrichment request:', requestBody);
            
            const response = await fetch(`${this.baseURL}/api/enrichment`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                cache: 'no-store',
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) throw new Error('Failed to get part enrichment');
            const data = await response.json();
            
            console.log('Part enrichment response:', data);
            
            // Extract the first image URL if available
            if (data.success && data.data && data.data.images && data.data.images.length > 0) {
                const imageUrl = data.data.images[0].url;
                console.log('Found part image URL:', imageUrl);
                return { image_url: imageUrl };
            }
            console.log('No part images in response');
            return { image_url: null };
        } catch (error) {
            console.error('Part enrichment error:', error);
            return { image_url: null };
        }
    }

    async getSuppliers(partNumber, make, model) {
        const startTime = Date.now();
        this.addLog('info', 'API', 'Searching for suppliers', {
            endpoint: '/api/suppliers/search',
            params: { part_number: partNumber, make, model, oem_only: false }
        });
        try {
            const response = await fetch(`${this.baseURL}/api/suppliers/search`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                cache: 'no-store',
                body: JSON.stringify({
                    part_number: partNumber,
                    make,
                    model,
                    oem_only: false
                })
            });
            
            if (!response.ok) throw new Error('Failed to get suppliers');
            const data = await response.json();
            
            const elapsed = Date.now() - startTime;
            this.addLog('success', 'API', `Supplier search completed in ${elapsed}ms`, {
                suppliers_found: data.suppliers?.length || 0,
                with_ai_ranking: data.suppliers?.filter(s => s.ai_ranking).length || 0
            });
            return data.suppliers || [];
        } catch (error) {
            console.error('Suppliers error:', error);
            return this.getMockSuppliersData();
        }
    }

    async initiatePurchase(supplier, partNumber) {
        try {
            this.showPurchaseModal();
            this.updatePurchaseStatus('Checking site compatibility...', 'fas fa-search');
            
            // Check if site has recording available
            await this.delay(1000);
            
            const hasRecording = this.isPurchaseAvailable(supplier.url);
            
            if (!hasRecording) {
                this.updatePurchaseStatus('Automated purchase not available for this site', 'fas fa-exclamation-triangle');
                this.showPurchaseActions([
                    { text: 'View Manually', action: () => window.open(supplier.url, '_blank') }
                ]);
                return;
            }

            this.updatePurchaseStatus('Initializing purchase agent...', 'fas fa-robot');
            await this.delay(1500);
            
            // Get recording name from URL
            const recordingName = this.getRecordingNameFromUrl(supplier.url);
            
            this.updatePurchaseStatus('Loading purchase variables...', 'fas fa-cog');
            await this.delay(500);
            
            // Convert billing profile to variables format
            const variables = this.convertBillingProfileToVariables();
            
            // Get purchase settings
            const purchaseSettings = JSON.parse(localStorage.getItem('purchaseAgentSettings') || '{}');
            
            // Check if real purchases are enabled
            if (!purchaseSettings.enableRealPurchases) {
                this.updatePurchaseStatus('Real purchases are disabled. Enable in settings to proceed.', 'fas fa-exclamation-triangle');
                this.showPurchaseActions([
                    { text: 'Open Settings', action: () => this.showSettings() },
                    { text: 'View Manually', action: () => window.open(supplier.url, '_blank') }
                ]);
                return;
            }
            
            this.updatePurchaseStatus('Executing automated purchase...', 'fas fa-robot');
            
            // Configure options based on settings - align with Node.js timing
            const speedMs = purchaseSettings.purchaseSpeed || 5000;
            
            // Map speed setting to appropriate Node.js options
            // Key insight: Keep scroll actions fast regardless of other timing settings
            let nodeOptions = {};
            if (speedMs <= 1000) {
                // Fast mode - use Node.js defaults with minimal delays
                nodeOptions = {
                    slow_mo: 300, // Faster than default for responsive feel
                    fast: true,
                    click_delay: 0,
                    input_delay: 0,
                    nav_delay: 500
                };
            } else if (speedMs <= 3000) {
                // Medium speed - balanced timing
                nodeOptions = {
                    slow_mo: 500, // Node.js default
                    click_delay: 300,
                    input_delay: 200,
                    nav_delay: 800
                };
            } else {
                // Slow/conservative mode - but keep scrolls fast
                nodeOptions = {
                    slow_mo: 500, // Keep Node.js default for non-delayed actions
                    click_delay: 1000, // Conservative click timing
                    input_delay: 500,  // Conservative input timing
                    nav_delay: 2000    // Conservative navigation timing
                    // Note: Scroll actions will use minimal delays regardless of these settings
                };
            }
            
            const purchaseOptions = {
                headless: purchaseSettings.headlessMode || false,
                ignore_errors: false,
                max_attempts: purchaseSettings.maxPurchaseAttempts || 3,
                capture_screenshots: purchaseSettings.captureScreenshots !== false,
                timeout: Math.max(speedMs * 6, 10000), // Timeout scales with speed
                ...nodeOptions // Apply the appropriate timing options
            };
            
            // Make the actual purchase API call using recording system
            const response = await fetch(`${this.baseURL}/api/recordings/clone`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recording_name: recordingName,
                    url: supplier.url,
                    variables: variables,
                    options: purchaseOptions
                })
            });
            
            if (!response.ok) throw new Error('Purchase failed');
            
            const result = await response.json();
            this.activePurchase = result;
            
            if (result.success) {
                this.updatePurchaseStatus('Purchase automation completed!', 'fas fa-check-circle');
                this.showPurchaseActions([
                    { text: 'View Screenshots', action: () => this.viewPurchaseScreenshots(result) },
                    { text: 'View Site', action: () => window.open(supplier.url, '_blank') }
                ]);
            } else {
                this.updatePurchaseStatus(`Purchase automation failed: ${result.stderr || result.error || 'Unknown error'}`, 'fas fa-exclamation-circle');
                this.showPurchaseActions([
                    { text: 'Try Again', action: () => this.initiatePurchase(supplier, partNumber) },
                    { text: 'View Manually', action: () => window.open(supplier.url, '_blank') }
                ]);
            }
            
        } catch (error) {
            console.error('Purchase error:', error);
            this.updatePurchaseStatus('Purchase failed. Please try again.', 'fas fa-exclamation-circle');
            this.showPurchaseActions([
                { text: 'Retry', action: () => this.initiatePurchase(supplier, partNumber) }
            ]);
        }
    }

    // ===== UI UPDATE METHODS =====
    resetUI() {
        this.currentStep = -1;
        ['modelSection', 'manualsSection', 'partSection', 'suppliersSection'].forEach(id => {
            document.getElementById(id).classList.add('hidden');
        });
        this.resetProgress();
        
        // Hide alternate parts and generic parts sections
        const alternateSection = document.getElementById('alternatePartsSection');
        if (alternateSection) {
            alternateSection.style.display = 'none';
        }
        
        const genericSection = document.getElementById('genericPartsSection');
        if (genericSection) {
            genericSection.style.display = 'none';
        }
        
        // Hide similar parts section
        const similarSection = document.getElementById('similarPartsSection');
        if (similarSection) {
            similarSection.style.display = 'none';
        }
        
        // Hide verified parts actions
        const verifiedActions = document.getElementById('verifiedPartsActions');
        if (verifiedActions) {
            verifiedActions.style.display = 'none';
        }
        
        // Clear alternate parts and similar parts data
        this.originalPartData = null;
        this.similarParts = null;
        this.currentPart = null;
    }

    showProgress() {
        // Progress section is always visible now, just needs to be activated
        // This method is kept for compatibility but doesn't need to do anything
    }

    setStepActive(step) {
        this.currentStep = this.steps.indexOf(step);
        this.updateProgressUI();
    }

    setStepLoading(step) {
        const stepElement = document.querySelector(`[data-step="${step}"]`);
        if (stepElement) {
            stepElement.classList.add('loading');
            stepElement.classList.remove('active', 'completed');
        }
    }

    setStepCompleted(step) {
        const stepIndex = this.steps.indexOf(step);
        const stepElement = document.querySelector(`[data-step="${step}"]`);
        if (stepElement) {
            stepElement.classList.add('completed');
            stepElement.classList.remove('active', 'loading');
        }
        
        // Activate progress line
        const progressLines = document.querySelectorAll('.progress-line');
        if (progressLines[stepIndex]) {
            progressLines[stepIndex].classList.add('completed');
        }
    }

    updateProgressUI() {
        // Reset all steps
        document.querySelectorAll('.progress-step').forEach(step => {
            step.classList.remove('active');
        });
        
        // Set current step as active
        if (this.currentStep >= 0) {
            const currentStepElement = document.querySelector(`[data-step="${this.steps[this.currentStep]}"]`);
            if (currentStepElement) {
                currentStepElement.classList.add('active');
            }
        }
    }

    resetProgress() {
        document.querySelectorAll('.progress-step').forEach(step => {
            step.classList.remove('active', 'completed', 'loading');
        });
        document.querySelectorAll('.progress-line').forEach(line => {
            line.classList.remove('completed');
        });
    }

    // ===== LOADING STATE METHODS =====
    showLoadingStates() {
        // Show all sections immediately with loading content
        this.showModelLoading();
        this.showManualsLoading();
        this.showPartLoading();
        this.showSuppliersLoading();
    }

    showModelLoading() {
        const section = document.getElementById('modelSection');
        const imageElement = document.getElementById('modelImage');
        const nameElement = document.getElementById('modelName');
        const descElement = document.getElementById('modelDescription');
        const specsElement = document.getElementById('modelSpecs');

        // Show loading state
        imageElement.style.display = 'none';
        imageElement.parentElement.querySelector('.model-image-loading').style.display = 'flex';
        imageElement.parentElement.style.display = 'block';

        nameElement.textContent = `${this.currentSearch.make} ${this.currentSearch.model}`;
        descElement.style.display = 'none';
        specsElement.style.display = 'none';

        section.classList.remove('hidden');
    }

    showManualsLoading() {
        const section = document.getElementById('manualsSection');
        const grid = document.getElementById('manualsGrid');
        
        // Show loading skeleton for manuals
        grid.innerHTML = Array(4).fill(0).map(() => `
            <div class="manual-card loading-card">
                <div class="manual-preview">
                    <div class="skeleton-loader"></div>
                </div>
                <div class="manual-info">
                    <div class="skeleton-loader" style="height: 1rem; margin-bottom: 0.5rem;"></div>
                    <div class="skeleton-loader" style="height: 0.8rem; width: 60%;"></div>
                </div>
            </div>
        `).join('');

        section.classList.remove('hidden');
    }

    showPartLoading() {
        const section = document.getElementById('partSection');
        const imageElement = document.getElementById('partImage');
        const numberElement = document.getElementById('partNumber');
        const descElement = document.getElementById('partDescription');
        const detailsElement = document.getElementById('partDetails');

        // Show loading state
        imageElement.style.display = 'none';
        imageElement.parentElement.querySelector('.part-image-loading').style.display = 'flex';
        imageElement.parentElement.style.display = 'block';

        numberElement.innerHTML = '<div class="skeleton-loader" style="height: 1.5rem; width: 200px;"></div>';
        descElement.innerHTML = '<div class="skeleton-loader" style="height: 1rem; width: 150px;"></div>';
        detailsElement.innerHTML = '';

        section.classList.remove('hidden');
    }

    showSuppliersLoading() {
        const section = document.getElementById('suppliersSection');
        const list = document.getElementById('suppliersList');
        
        // Show loading skeleton for suppliers
        list.innerHTML = Array(3).fill(0).map(() => `
            <div class="supplier-card loading-card">
                <div class="supplier-header">
                    <div class="skeleton-loader" style="height: 1.1rem; width: 150px;"></div>
                    <div class="skeleton-loader" style="height: 1.2rem; width: 80px;"></div>
                </div>
                <div class="supplier-details">
                    <div class="skeleton-loader" style="height: 0.9rem; width: 120px;"></div>
                    <div class="skeleton-loader" style="height: 0.9rem; width: 100px;"></div>
                    <div class="skeleton-loader" style="height: 0.9rem; width: 90px;"></div>
                </div>
                <div class="supplier-actions">
                    <div class="skeleton-loader" style="height: 2.5rem; width: 120px; border-radius: 8px;"></div>
                    <div class="skeleton-loader" style="height: 2.5rem; width: 120px; border-radius: 8px;"></div>
                </div>
            </div>
        `).join('');

        section.classList.remove('hidden');
    }

    // ===== UPDATE METHODS (replace loading content) =====
    updateModelInfo(modelInfo) {
        const section = document.getElementById('modelSection');
        const imageElement = document.getElementById('modelImage');
        const nameElement = document.getElementById('modelName');
        const descElement = document.getElementById('modelDescription');
        const specsElement = document.getElementById('modelSpecs');

        // Handle model image with better error handling
        if (modelInfo && modelInfo.image_url) {
            console.log('🖼️ Loading model image:', modelInfo.image_url);
            imageElement.src = modelInfo.image_url;
            imageElement.onload = () => {
                console.log('✅ Model image loaded successfully');
                imageElement.style.display = 'block';
                imageElement.parentElement.querySelector('.model-image-loading').style.display = 'none';
            };
            imageElement.onerror = () => {
                console.log('❌ Model image failed to load');
                imageElement.parentElement.style.display = 'none';
            };
        } else {
            console.log('ℹ️ No model image URL provided');
            // Hide the image container if no image
            imageElement.parentElement.style.display = 'none';
        }

        // Just show the make and model the user entered
        nameElement.textContent = `${this.currentSearch.make} ${this.currentSearch.model}`;
        
        // Hide description and specs
        descElement.style.display = 'none';
        specsElement.style.display = 'none';

        section.classList.remove('hidden');
    }

    updateManuals(manuals) {
        const section = document.getElementById('manualsSection');
        const grid = document.getElementById('manualsGrid');
        
        // Smooth transition from loading to content
        setTimeout(() => {
            grid.innerHTML = manuals.map(manual => `
                <a href="${manual.proxy_url || manual.url}" target="_blank" class="manual-card-link">
                    <div class="manual-card">
                        <div class="manual-preview">
                            ${manual.preview_image ? 
                                `<img src="${manual.preview_image}" alt="Manual preview" class="manual-preview-image">` :
                                manual.thumbnail_url ? 
                                `<img src="${manual.thumbnail_url}" alt="Manual preview">` :
                                `<i class="fas fa-file-pdf fa-2x" style="color: #dc3545;"></i>`
                            }
                        </div>
                        <div class="manual-info">
                            <div class="manual-title">${manual.title || 'Technical Manual'}</div>
                            <div class="manual-meta">
                                <span>${manual.source_domain || manual.type || 'Unknown Source'}</span>
                                <span>${manual.pages ? `${manual.pages} pages` : 'PDF'}</span>
                            </div>
                        </div>
                    </div>
                </a>
            `).join('');
        }, 150);

        section.classList.remove('hidden');
    }

    updatePart(partData) {
        const section = document.getElementById('partSection');
        const imageElement = document.getElementById('partImage');
        const numberElement = document.getElementById('partNumber');
        const descElement = document.getElementById('partDescription');
        const verificationElement = document.getElementById('partVerification');
        const detailsElement = document.getElementById('partDetails');
        const verifiedActionsElement = document.getElementById('verifiedPartsActions');
        const similarPartsSection = document.getElementById('similarPartsSection');

        // Store original part data if not manually selected
        if (!partData.manually_selected && !this.originalPartData) {
            this.originalPartData = partData;
        }

        if (partData.image_url) {
            console.log('🖼️ Loading part image:', partData.image_url);
            imageElement.src = partData.image_url;
            imageElement.onload = () => {
                console.log('✅ Part image loaded successfully');
                imageElement.style.display = 'block';
                imageElement.parentElement.querySelector('.part-image-loading').style.display = 'none';
            };
            imageElement.onerror = () => {
                console.log('❌ Part image failed to load');
                imageElement.parentElement.querySelector('.part-image-loading').style.display = 'none';
            };
        } else {
            console.log('ℹ️ No part image URL provided');
            imageElement.parentElement.querySelector('.part-image-loading').style.display = 'none';
        }

        numberElement.textContent = partData.oem_part_number || 'Unknown Part';
        descElement.textContent = partData.description || this.currentSearch.partName;
        
        // Clear previous details
        detailsElement.innerHTML = '';
        
        // Determine verification status based only on validation
        const validation = partData.serpapi_validation || {};
        const isVerified = validation.is_valid === true;
        
        // Update verification status
        if (isVerified) {
            verificationElement.innerHTML = `
                <i class="fas fa-check-circle" style="color: #4caf50;"></i>
                <span style="color: #4caf50;">Verified</span>
            `;
            // Show verified actions
            verifiedActionsElement.style.display = 'block';
        } else {
            verificationElement.innerHTML = `
                <i class="fas fa-exclamation-triangle" style="color: #ff9800;"></i>
                <span style="color: #ff9800;">Not Verified</span>
            `;
            // Hide verified actions for unverified parts
            verifiedActionsElement.style.display = 'none';
        }
        
        // Show similar parts if available (for both verified and unverified)
        if (partData.similar_parts && partData.similar_parts.length > 0) {
            this.displaySimilarParts(partData.similar_parts);
            similarPartsSection.style.display = 'block';
        } else {
            similarPartsSection.style.display = 'none';
        }

        this.currentPart = partData;
        
        // Handle alternate parts
        this.updateAlternateParts(partData).catch(error => {
            console.error('Error updating alternate parts:', error);
        });
        
        // Show generic parts button for valid OEM parts
        this.updateGenericPartsButton(partData);
        
        section.classList.remove('hidden');
    }

    async updateAlternateParts(partData) {
        const alternateSection = document.getElementById('alternatePartsSection');
        const alternateCount = document.getElementById('alternatePartsCount');
        
        // Get alternate parts from the part data
        const alternateParts = partData.alternate_part_numbers || [];
        
        if (alternateParts.length > 0) {
            alternateCount.textContent = alternateParts.length;
            
            // Store alternate parts data for modal
            this.alternatePartsData = alternateParts;
            this.currentPartData = partData;
            
            // Show the section using inline style
            alternateSection.style.display = 'block';
        } else {
            // Hide the section using inline style
            alternateSection.style.display = 'none';
        }
    }

    displaySimilarParts(similarParts) {
        const similarPartsList = document.getElementById('similarPartsList');
        if (!similarPartsList) return;
        
        similarPartsList.innerHTML = similarParts.map((part, index) => {
            const isCurrentPart = part.part_number === this.currentPart?.oem_part_number;
            return `
                <div class="similar-part-item" style="
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0.75rem;
                    background: ${isCurrentPart ? '#e3f2fd' : '#f5f5f5'};
                    border: 1px solid ${isCurrentPart ? '#2196f3' : '#ddd'};
                    border-radius: 8px;
                    transition: all 0.3s;
                    ${!isCurrentPart ? 'cursor: pointer;' : ''}
                " ${!isCurrentPart ? `onclick="app.selectSimilarPart(${index})"` : ''}>
                    <div>
                        <div style="font-weight: 600; color: #333;">
                            ${part.part_number}
                        </div>
                        <div style="font-size: 0.875rem; color: #666; margin-top: 0.25rem;">
                            ${part.description || 'No description available'}
                        </div>
                        ${part.confidence ? `
                            <div style="font-size: 0.75rem; color: #888; margin-top: 0.25rem;">
                                Confidence: ${Math.round(part.confidence * 100)}%
                            </div>
                        ` : ''}
                    </div>
                    <div style="text-align: center;">
                        ${isCurrentPart ? 
                            '<span style="color: #2196f3; font-size: 0.875rem; font-weight: 600;">Current</span>' :
                            `<button style="padding: 0.5rem 1rem; background: #2196f3; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; transition: background 0.3s;" onmouseover="this.style.background='#1976d2'" onmouseout="this.style.background='#2196f3'" onclick="event.stopPropagation(); app.selectSimilarPart(${index})">Select</button>`
                        }
                    </div>
                </div>
            `;
        }).join('');
        
        // Store similar parts data for selection
        this.similarParts = similarParts;
    }

    async selectSimilarPart(index) {
        if (!this.similarParts || !this.similarParts[index]) return;
        
        const selectedPart = this.similarParts[index];
        
        // Create part data in the expected format
        const partData = {
            oem_part_number: selectedPart.part_number,
            description: selectedPart.description,
            confidence: selectedPart.confidence,
            manually_selected: true,
            similar_parts: this.similarParts,
            serpapi_validation: {
                is_valid: false // Similar parts are not verified by default
            }
        };
        
        // Update the part display
        this.updatePart(partData);
        
        // Search for suppliers with the new part
        await this.searchSuppliers(selectedPart.part_number);
        
        this.addLog('info', 'Similar Part Selected', `Selected part: ${selectedPart.part_number}`);
    }

    async showAlternatePartsModal() {
        const modal = document.getElementById('alternatePartsModal');
        const currentPartDisplay = document.getElementById('currentPartDisplay');
        const alternateGrid = document.getElementById('alternatePartsGrid');
        
        // Show modal
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        
        // Display current part
        currentPartDisplay.innerHTML = `
            <img src="${this.currentPartData.image_url || '/static/img/part-placeholder.svg'}" 
                 alt="${this.currentPartData.oem_part_number}" 
                 class="alternate-part-image"
                 onerror="this.src='/static/img/part-placeholder.svg'">
            <div class="alternate-part-info">
                <div class="alternate-part-number">${this.currentPartData.oem_part_number}</div>
                <div class="alternate-part-description">${this.currentPartData.description || this.currentSearch.partName}</div>
                <div class="alternate-part-type">Currently Selected</div>
            </div>
        `;
        
        // Show loading state
        alternateGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem;">Loading alternate parts...</div>';
        
        // Fetch enrichment and detailed info for each alternate part
        const enrichedParts = await Promise.all(
            this.alternatePartsData.map(async (part) => {
                const partNumber = typeof part === 'string' ? part : part.part_number;
                const originalDescription = typeof part === 'object' ? part.description : '';
                
                try {
                    // Fetch enrichment data
                    const response = await fetch(`${this.baseURL}/api/enrichment`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            make: this.currentSearch.make,
                            model: this.currentSearch.model,
                            part_number: partNumber
                        })
                    });
                    
                    const enrichmentData = await response.json();
                    const imageUrl = enrichmentData.data?.images?.[0]?.url || '/static/img/part-placeholder.svg';
                    
                    // Enhanced description generation
                    let description = '';
                    
                    // First try the original description from part data
                    if (originalDescription && originalDescription.length > 20) {
                        description = originalDescription;
                    }
                    // Then try enrichment subject
                    else if (enrichmentData.subject) {
                        description = enrichmentData.subject;
                    }
                    // Then try image title
                    else if (enrichmentData.data?.images?.[0]?.title) {
                        description = enrichmentData.data.images[0].title;
                    }
                    
                    // If still no good description, generate one based on context
                    if (!description || description.length < 20) {
                        const type = typeof part === 'object' ? part.type : '';
                        if (type.includes('Primary')) {
                            description = `Alternative ${this.currentSearch.partName} from ${type.replace('Primary', '').trim()}`;
                        } else if (type.includes('Alternate')) {
                            description = `Compatible ${this.currentSearch.partName} part ${partNumber}`;
                        } else {
                            description = `${this.currentSearch.partName} - Alternative Option`;
                        }
                    }
                    
                    // Get source/manufacturer info from enrichment
                    let source = '';
                    if (enrichmentData.data?.images?.[0]?.source_name) {
                        source = enrichmentData.data.images[0].source_name;
                    }
                    
                    return {
                        part_number: partNumber,
                        type: typeof part === 'object' ? (part.type || 'Alternative') : 'Alternative',
                        image_url: imageUrl,
                        description: description,
                        source: source
                    };
                } catch (error) {
                    console.error(`Error enriching part ${partNumber}:`, error);
                    return {
                        part_number: partNumber,
                        type: typeof part === 'object' ? (part.type || 'Alternative') : 'Alternative',
                        image_url: '/static/img/part-placeholder.svg',
                        description: originalDescription || `Alternative ${this.currentSearch.partName}`,
                        source: ''
                    };
                }
            })
        );
        
        // Render alternate parts with enhanced data
        alternateGrid.innerHTML = enrichedParts.map(part => `
            <div class="alternate-part-card" onclick="app.selectAlternatePartFromModal('${part.part_number}')">
                <img src="${part.image_url}" 
                     alt="${part.part_number}" 
                     class="alternate-part-image"
                     onerror="this.src='/static/img/part-placeholder.svg'">
                <div class="alternate-part-info">
                    <div class="alternate-part-number">${part.part_number}</div>
                    <div class="alternate-part-description">${part.description}</div>
                    <div class="alternate-part-meta">
                        <span class="alternate-part-type">${part.type}</span>
                        ${part.source ? `<span class="alternate-part-source">• ${part.source}</span>` : ''}
                    </div>
                </div>
                <div class="alternate-part-action">
                    <i class="fas fa-exchange-alt"></i>
                    <span>Select</span>
                </div>
            </div>
        `).join('');
    }

    closeAlternatePartsModal() {
        const modal = document.getElementById('alternatePartsModal');
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }

    async selectAlternatePartFromModal(partNumber) {
        // Close modal
        this.closeAlternatePartsModal();
        
        // Show loading in part section
        this.showSuppliersLoading();
        
        // Get the current part data to swap
        const currentPartNumber = this.currentPart.oem_part_number;
        
        // Find the selected alternate part data
        const selectedPart = this.alternatePartsData.find(alt => 
            (typeof alt === 'string' ? alt : alt.part_number) === partNumber
        );
        
        // Get enrichment data for the selected part
        try {
            const enrichmentResponse = await fetch(`${this.baseURL}/api/enrichment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    make: this.currentSearch.make,
                    model: this.currentSearch.model,
                    part_number: partNumber
                })
            });
            
            const enrichmentData = await enrichmentResponse.json();
            
            // Create updated alternate parts list with swapped parts
            let updatedAlternates = this.alternatePartsData.filter(alt => 
                (typeof alt === 'string' ? alt : alt.part_number) !== partNumber
            );
            
            // Add the current primary part to alternates
            updatedAlternates.unshift({
                part_number: currentPartNumber,
                type: 'Previous Selection',
                description: this.currentPart.description
            });
            
            // Update the part display
            const alternatePartData = {
                oem_part_number: partNumber,
                description: selectedPart?.description || enrichmentData.subject || `${this.currentSearch.partName} - Alternative`,
                image_url: enrichmentData.data?.images?.[0]?.url,
                alternate_part_numbers: updatedAlternates,
                manually_selected: true,
                serpapi_validation: {
                    is_valid: true
                }
            };
            
            this.updatePart(alternatePartData);
            this.setStepCompleted('part');
            
            // Show suppliers section and start new supplier search
            document.getElementById('suppliersSection').classList.remove('hidden');
            
            this.getSuppliers(partNumber, this.currentSearch.make, this.currentSearch.model).then(suppliers => {
                console.log('✅ Suppliers search completed for alternate part');
                this.updateSuppliers(suppliers);
                this.setStepCompleted('suppliers');
            }).catch(error => {
                console.error('❌ Suppliers search failed:', error);
                this.updateSuppliers([]);
                this.setStepCompleted('suppliers');
            });
            
        } catch (error) {
            console.error('Error processing alternate part selection:', error);
            this.showError('Failed to process the selected part');
        }
    }

    async selectAlternatePart(partNumber) {
        console.log('Selecting alternate part:', partNumber);
        
        // Close alternate parts dropdown
        this.toggleAlternateParts();
        
        // Show loading using the existing skeleton loader
        this.showSuppliersLoading();
        
        // Get the current part data to swap
        const currentPartNumber = this.currentPart.oem_part_number;
        
        // Get enrichment data for the alternate part
        try {
            const enrichmentResponse = await fetch(`${this.baseURL}/api/enrichment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    make: this.currentSearch.make,
                    model: this.currentSearch.model,
                    part_number: partNumber
                })
            });
            
            const enrichmentData = await enrichmentResponse.json();
            
            // Create updated alternate parts list with swapped parts
            let updatedAlternates = this.currentPart.alternate_part_numbers || [];
            
            // Remove the selected part from alternates
            updatedAlternates = updatedAlternates.filter(alt => 
                (typeof alt === 'string' ? alt : alt.part_number) !== partNumber
            );
            
            // Add the current primary part to alternates (if not manually selected)
            if (!this.currentPart.manually_selected) {
                updatedAlternates.unshift({
                    part_number: currentPartNumber,
                    type: 'Previous Primary',
                    image_url: this.currentPart.image_url
                });
            }
            
            // Update the part display with manually selected flag
            const alternatePartData = {
                oem_part_number: partNumber,
                description: enrichmentData.description || `Alternate part for ${this.currentSearch.partName}`,
                image_url: enrichmentData.data?.images?.[0]?.url,
                serpapi_validation: { is_valid: true },
                manually_selected: true,
                alternate_part_numbers: updatedAlternates
            };
            
            this.updatePart(alternatePartData);
            
            // Get new suppliers for the alternate part
            const suppliers = await this.getSuppliers(partNumber, this.currentSearch.make, this.currentSearch.model);
            this.updateSuppliers(suppliers);
            
        } catch (error) {
            console.error('Error selecting alternate part:', error);
            const suppliersList = document.getElementById('suppliersList');
            suppliersList.innerHTML = `
                <div class="error-message" style="text-align: center; padding: 2rem; color: #f44336;">
                    <i class="fas fa-exclamation-circle" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
                    <p>Failed to load suppliers for alternate part</p>
                </div>
            `;
        }
    }

    showSimilarPartsSelection(similarParts) {
        const section = document.getElementById('partSection');
        const suppliersSection = document.getElementById('suppliersSection');
        const partContent = section.querySelector('.card');
        
        // Hide suppliers section while showing similar parts
        suppliersSection.classList.add('hidden');
        
        // Create a selection UI for similar parts
        const selectionHTML = `
            <h3 class="card-title">Select a Part</h3>
            <p style="margin-bottom: 1.5rem; color: var(--text-secondary);">
                We couldn't find an exact match, but found ${similarParts.length} similar parts. Please select one:
            </p>
            <div class="similar-parts-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem;">
                ${similarParts.map((part, index) => `
                    <div class="similar-part-card" onclick="window.app.selectSimilarPart(${index})" style="
                        background: var(--bg-secondary);
                        border: 2px solid rgba(0, 0, 0, 0.1);
                        border-radius: var(--border-radius);
                        padding: 1rem;
                        cursor: pointer;
                        transition: var(--transition);
                    " onmouseover="this.style.borderColor='var(--primary-color)'; this.style.transform='translateY(-2px)'" 
                       onmouseout="this.style.borderColor='rgba(0, 0, 0, 0.1)'; this.style.transform='translateY(0)'">
                        ${part.image_url ? `
                            <img src="${part.image_url}" alt="${part.part_number}" style="
                                width: 100%;
                                height: 120px;
                                object-fit: contain;
                                margin-bottom: 0.75rem;
                                background: #f5f5f5;
                                border-radius: var(--border-radius-sm);
                            ">
                        ` : `
                            <div style="
                                width: 100%;
                                height: 120px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                background: #f5f5f5;
                                margin-bottom: 0.75rem;
                                border-radius: var(--border-radius-sm);
                            ">
                                <i class="fas fa-cog fa-2x" style="color: #ccc;"></i>
                            </div>
                        `}
                        <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 0.25rem;">
                            ${part.part_number || 'Unknown Part'}
                        </div>
                        <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.5rem;">
                            ${part.description || 'No description'}
                        </div>
                        ${part.manufacturer ? `
                            <div style="font-size: 0.8rem; color: var(--text-muted);">
                                ${part.manufacturer}
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;
        
        partContent.innerHTML = selectionHTML;
        section.classList.remove('hidden');
        
        // Store similar parts for selection
        this.similarParts = similarParts;
    }

    async selectSimilarPart(index) {
        const selectedPart = this.similarParts[index];
        if (!selectedPart) return;
        
        this.addLog('info', 'User Action', `Selected part: ${selectedPart.part_number}`);
        
        // Process the selected part as if it came from the resolver
        const partData = {
            oem_part_number: selectedPart.part_number,
            description: selectedPart.description,
            manufacturer: selectedPart.manufacturer,
            image_url: selectedPart.image_url,
            manually_selected: true,
            serpapi_validation: {
                is_valid: true
            }
        };
        
        // Continue the flow with the selected part
        this.setStepLoading('part');
        
        // Get enrichment for the selected part
        try {
            const partEnrichmentPromise = this.getPartEnrichment(partData.oem_part_number);
            
            partEnrichmentPromise.then(partInfo => {
                console.log('✅ Part enrichment completed for selected part');
                
                const mergedPartData = { 
                    ...partData, 
                    ...partInfo,
                    manually_selected: true
                };
                
                this.updatePart(mergedPartData);
                this.setStepCompleted('part');
                
                // Show suppliers section again and start supplier search
                document.getElementById('suppliersSection').classList.remove('hidden');
                
                this.getSuppliers(partData.oem_part_number, this.currentSearch.make, this.currentSearch.model).then(suppliers => {
                    console.log('✅ Suppliers search completed');
                    this.updateSuppliers(suppliers);
                    this.setStepCompleted('suppliers');
                }).catch(error => {
                    console.error('❌ Suppliers search failed:', error);
                    this.updateSuppliers([]);
                    this.setStepCompleted('suppliers');
                });
                
            }).catch(error => {
                console.error('❌ Part enrichment failed:', error);
                this.updatePart(partData);
                this.setStepCompleted('part');
                
                // Show suppliers section and start suppliers
                document.getElementById('suppliersSection').classList.remove('hidden');
                
                this.getSuppliers(partData.oem_part_number, this.currentSearch.make, this.currentSearch.model).then(suppliers => {
                    console.log('✅ Suppliers search completed');
                    this.updateSuppliers(suppliers);
                    this.setStepCompleted('suppliers');
                }).catch(error => {
                    console.error('❌ Suppliers search failed:', error);
                    this.updateSuppliers([]);
                    this.setStepCompleted('suppliers');
                });
            });
        } catch (error) {
            console.error('Error processing selected part:', error);
            this.showError('Failed to process the selected part');
        }
    }

    async updateSuppliers(suppliers) {
        const section = document.getElementById('suppliersSection');
        const list = document.getElementById('suppliersList');
        
        this.currentSuppliers = suppliers;
        
        // First, render suppliers with placeholder images
        list.innerHTML = suppliers.map((supplier, index) => {
            // Extract domain for display
            let domain = supplier.domain || '';
            if (!domain && supplier.url) {
                try {
                    domain = new URL(supplier.url).hostname;
                } catch (e) {
                    domain = 'unknown';
                }
            }
            
            return `
                <div class="supplier-card-clean" data-supplier-index="${index}">
                    ${supplier.ai_ranking ? `
                        <div class="ai-rank-badge">
                            <i class="fas fa-brain"></i> #${supplier.ai_ranking}
                        </div>
                    ` : ''}
                    
                    <div class="supplier-screenshot" data-url="${supplier.url}">
                        <div class="screenshot-placeholder">
                            <i class="fas fa-store fa-2x"></i>
                        </div>
                        <img style="display: none;" 
                             alt="${supplier.name} website" 
                             onerror="this.style.display='none'; this.previousElementSibling.innerHTML='<i class=\\'fas fa-store fa-2x\\'></i>';">
                    </div>
                    
                    <div class="supplier-content">
                        <div class="supplier-header-clean">
                            <h3 class="supplier-name">${supplier.name || domain || 'Supplier'}</h3>
                            <span class="supplier-price">${supplier.price || 'Check Price'}</span>
                        </div>
                        
                        <p class="supplier-description">
                            ${supplier.ai_reason || supplier.snippet || 'Quality supplier for equipment parts. Click to view available inventory and pricing.'}
                        </p>
                        
                        <div class="supplier-actions-clean">
                            <a href="${supplier.url}" target="_blank" class="button-view">
                                <i class="fas fa-external-link-alt"></i>
                                View Site
                            </a>
                            ${this.isPurchaseAvailable(supplier.url) ? `
                                <button class="button-purchase" onclick="app.initiatePurchase(${JSON.stringify(supplier).replace(/"/g, '&quot;')}, '${this.currentPart?.oem_part_number}')">
                                    <i class="fas fa-shopping-cart"></i>
                                    Purchase
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        section.classList.remove('hidden');
        
        // Now fetch screenshots for all suppliers
        if (suppliers.length > 0) {
            this.loadSupplierScreenshots(suppliers);
        }
    }

    async loadSupplierScreenshots(suppliers) {
        try {
            // Extract URLs from suppliers
            const urls = suppliers.map(s => s.url).filter(url => url);
            
            if (urls.length === 0) return;
            
            console.log('Loading favicons for', urls.length, 'suppliers');
            
            // Use favicons only for faster, more reliable loading
            urls.forEach((url, index) => {
                const screenshotDiv = document.querySelector(`.supplier-screenshot[data-url="${url}"]`);
                if (screenshotDiv) {
                    const img = screenshotDiv.querySelector('img');
                    const placeholder = screenshotDiv.querySelector('.screenshot-placeholder');
                    
                    try {
                        const urlObj = new URL(url);
                        const domain = urlObj.hostname;
                        
                        // Multiple favicon sources for better reliability
                        const faviconSources = [
                            `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
                            `https://api.faviconkit.com/${domain}/144`,
                            `https://icons.duckduckgo.com/ip3/${domain}.ico`,
                            `https://${domain}/favicon.ico`
                        ];
                        
                        let currentFaviconIndex = 0;
                        
                        const tryNextFavicon = () => {
                            if (currentFaviconIndex >= faviconSources.length) {
                                // All favicon attempts failed, show default icon
                                showDefaultIcon();
                                return;
                            }
                            
                            const faviconImg = new Image();
                            faviconImg.onload = function() {
                                // Successfully loaded favicon
                                if (placeholder) {
                                    placeholder.innerHTML = `
                                        <img src="${this.src}" alt="${domain}" 
                                             style="width: 48px; height: 48px; border-radius: 8px;"
                                             onerror="this.style.display='none'">
                                    `;
                                    placeholder.style.display = 'flex';
                                    placeholder.style.alignItems = 'center';
                                    placeholder.style.justifyContent = 'center';
                                }
                                img.style.display = 'none';
                            };
                            
                            faviconImg.onerror = function() {
                                currentFaviconIndex++;
                                tryNextFavicon();
                            };
                            
                            faviconImg.src = faviconSources[currentFaviconIndex];
                        };
                        
                        const showDefaultIcon = () => {
                            if (placeholder) {
                                // Determine icon based on known domains
                                let iconClass = 'fas fa-store';
                                let iconColor = '#667eea';
                                
                                if (domain.includes('amazon')) {
                                    iconClass = 'fab fa-amazon';
                                    iconColor = '#FF9900';
                                } else if (domain.includes('ebay')) {
                                    iconClass = 'fab fa-ebay';
                                    iconColor = '#E53238';
                                } else if (domain.includes('grainger')) {
                                    iconClass = 'fas fa-tools';
                                    iconColor = '#CC0000';
                                } else if (domain.includes('mcmaster')) {
                                    iconClass = 'fas fa-cog';
                                    iconColor = '#FFD700';
                                } else if (domain.includes('webstaurant')) {
                                    iconClass = 'fas fa-utensils';
                                    iconColor = '#00529B';
                                } else if (domain.includes('partstown')) {
                                    iconClass = 'fas fa-wrench';
                                    iconColor = '#0066CC';
                                }
                                
                                placeholder.innerHTML = `
                                    <i class="${iconClass} fa-2x" style="color: ${iconColor};"></i>
                                `;
                                placeholder.style.display = 'flex';
                                placeholder.style.alignItems = 'center';
                                placeholder.style.justifyContent = 'center';
                            }
                            img.style.display = 'none';
                        };
                        
                        // Start trying to load favicons
                        tryNextFavicon();
                        
                    } catch (e) {
                        // If URL parsing fails, show store icon
                        if (placeholder) {
                            placeholder.innerHTML = '<i class="fas fa-store fa-2x" style="color: #667eea;"></i>';
                            placeholder.style.display = 'flex';
                            placeholder.style.alignItems = 'center';
                            placeholder.style.justifyContent = 'center';
                        }
                        img.style.display = 'none';
                    }
                }
            });
            
        } catch (error) {
            console.error('Error loading supplier screenshots:', error);
        }
    }

    // ===== MODAL METHODS =====
    showPurchaseModal() {
        document.getElementById('purchaseModal').classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    updatePurchaseStatus(message, icon) {
        const statusElement = document.getElementById('purchaseStatus');
        statusElement.querySelector('.status-icon i').className = icon;
        statusElement.querySelector('.status-message').textContent = message;
    }

    showPurchaseDetails(result) {
        const detailsElement = document.getElementById('purchaseDetails');
        detailsElement.innerHTML = `
            <div style="text-align: left; margin: 1rem 0;">
                <h4>Order Details</h4>
                <p><strong>Order ID:</strong> ${result.order_id}</p>
                <p><strong>Part:</strong> ${this.currentPart?.oem_part_number}</p>
                <p><strong>Status:</strong> ${result.success ? 'Completed' : 'Failed'}</p>
                ${result.recording_used ? `<p><strong>Agent:</strong> ${result.recording_used}</p>` : ''}
            </div>
        `;
    }

    showPurchaseActions(actions) {
        // Actions are now disabled per user request - only status and close button remain
        const actionsElement = document.getElementById('purchaseActions');
        actionsElement.innerHTML = '';
        actionsElement.classList.add('hidden');
    }

    // ===== UTILITY METHODS =====
    
    convertBillingProfileToVariables() {
        // Convert billing profile to variables compatible with recording system
        if (!this.defaultBillingProfile) {
            this.addLog('warning', 'Purchase', 'No billing profile found, using default values');
            return this.getDefaultVariables();
        }
        
        const profile = this.defaultBillingProfile;
        
        // Handle both flat structure (from formatProfileFromAPI) and nested structure (from formatProfileForAPI)
        const isNested = profile.billing_address || profile.payment_info;
        const billing = isNested ? (profile.billing_address || {}) : profile;
        const payment = isNested ? (profile.payment_info || {}) : profile;
        
        // Extract state abbreviation from full state name if needed
        const getStateAbbr = (stateName) => {
            // Add a simple state name to abbreviation mapping for common states
            const stateMap = {
                'California': 'CA', 'Texas': 'TX', 'Florida': 'FL', 'New York': 'NY',
                'Illinois': 'IL', 'Pennsylvania': 'PA', 'Ohio': 'OH', 'Georgia': 'GA',
                'North Carolina': 'NC', 'Michigan': 'MI', 'New Jersey': 'NJ', 'Virginia': 'VA',
                'Washington': 'WA', 'Arizona': 'AZ', 'Massachusetts': 'MA', 'Tennessee': 'TN',
                'Indiana': 'IN', 'Missouri': 'MO', 'Maryland': 'MD', 'Wisconsin': 'WI',
                'Colorado': 'CO', 'Minnesota': 'MN', 'South Carolina': 'SC', 'Alabama': 'AL',
                'Louisiana': 'LA', 'Kentucky': 'KY', 'Oregon': 'OR', 'Oklahoma': 'OK',
                'Connecticut': 'CT', 'Utah': 'UT', 'Iowa': 'IA', 'Nevada': 'NV',
                'Arkansas': 'AR', 'Mississippi': 'MS', 'Kansas': 'KS', 'New Mexico': 'NM',
                'Nebraska': 'NE', 'West Virginia': 'WV', 'Idaho': 'ID', 'Hawaii': 'HI',
                'New Hampshire': 'NH', 'Maine': 'ME', 'Montana': 'MT', 'Rhode Island': 'RI',
                'Delaware': 'DE', 'South Dakota': 'SD', 'North Dakota': 'ND', 'Alaska': 'AK',
                'Vermont': 'VT', 'Wyoming': 'WY'
            };
            
            // If it's already an abbreviation, return as-is
            if (stateName && stateName.length === 2) {
                return stateName.toUpperCase();
            }
            
            // Otherwise, try to find the abbreviation
            return stateMap[stateName] || stateName || 'CA';
        };
        
        // Use explicitly provided state abbreviation, fall back to deriving it if needed
        const stateAbr = billing.state_abr || getStateAbbr(billing.state);
        
        const variables = {
            // Personal information
            first_name: billing.first_name || '',
            last_name: billing.last_name || '',
            email: billing.email || '',
            phone_number: billing.phone_number || billing.phone || '',
            company_name: billing.company_name || billing.company || '',
            
            // Address information
            address: billing.address1 || billing.address || '',
            address2: billing.address2 || '',
            city: billing.city || '',
            state: billing.state || '',
            state_abr: stateAbr,
            zip_code: billing.zip || billing.zip_code || '',
            
            // State keypress handling for dropdown selection
            state_keypress_1: stateAbr.charAt(0) || 'C',
            state_keypress_2: stateAbr.charAt(1) || 'A',
            
            // Payment information
            card_number: payment.card_number || '',
            card_name: payment.card_name || payment.name || '',
            card_exp_month: payment.card_exp_month || payment.exp_month || '',
            card_exp_year: payment.card_exp_year || payment.exp_year || '',
            card_cvv: payment.card_cvv || payment.cvv || '',
            
            // Billing address (if different)
            billing_address: billing.billing_address || billing.address1 || billing.address || '',
            billing_city: billing.billing_city || billing.city || '',
            billing_state: billing.billing_state || billing.state || '',
            billing_state_abr: billing.billing_state_abr || getStateAbbr(billing.billing_state || billing.state),
            billing_zip: billing.billing_zip || billing.zip || billing.zip_code || ''
        };
        
        this.addLog('info', 'Purchase', 'Converted billing profile to variables', {
            variables_count: Object.keys(variables).length,
            has_payment_info: !!(variables.card_number && variables.card_exp_month)
        });
        
        return variables;
    }
    
    getDefaultVariables() {
        // Return default variables if no billing profile is available
        return {
            first_name: "John",
            last_name: "Smith", 
            email: "john.smith@example.com",
            phone_number: "555-123-4567",
            company_name: "HVAC Solutions Inc.",
            address: "123 Main Street",
            address2: "",
            city: "Springfield",
            state: "Illinois",
            state_abr: "IL",
            state_keypress_1: "I",
            state_keypress_2: "L",
            zip_code: "62701",
            card_number: "5555 5555 5555 5555",
            card_name: "John Smith",
            card_exp_month: "12",
            card_exp_year: "2028",
            card_cvv: "123",
            billing_address: "123 Main Street",
            billing_city: "Springfield", 
            billing_state: "Illinois",
            billing_state_abr: "IL",
            billing_zip: "62701"
        };
    }

    getRecordingNameFromUrl(url) {
        try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname.replace('www.', '');
            
            // Convert domain to recording name (e.g., etundra.com -> etundra)
            const recordingName = domain.split('.')[0];
            
            return recordingName;
        } catch (e) {
            console.error('Error parsing URL for recording name:', e);
            return 'unknown';
        }
    }

    viewPurchaseScreenshots(result) {
        if (result.stdout && result.stdout.includes('screenshots saved:')) {
            // Extract screenshot paths from stdout
            const lines = result.stdout.split('\n');
            const screenshotLines = lines.filter(line => line.includes('.png'));
            
            if (screenshotLines.length > 0) {
                // Create a modal to show screenshots
                this.showScreenshotsModal(screenshotLines);
            } else {
                alert('Purchase completed but screenshots not available');
            }
        } else {
            alert('Purchase completed - check browser automation results');
        }
    }

    showScreenshotsModal(screenshotPaths) {
        // Create a simple modal to display screenshot information
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Purchase Automation Screenshots</h3>
                <p>Screenshots saved to:</p>
                <ul>
                    ${screenshotPaths.map(path => `<li><code>${path.trim()}</code></li>`).join('')}
                </ul>
                <button onclick="this.closest('.modal').remove()">Close</button>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    isPurchaseAvailable(url) {
        if (!url || !this.availableRecordings || this.availableRecordings.length === 0) {
            return false;
        }
        
        try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname.replace('www.', '');
            
            // Check if domain matches any available recording
            return this.availableRecordings.some(recordingDomain => {
                // Handle exact matches and subdomain matches
                return domain === recordingDomain || 
                       domain.endsWith('.' + recordingDomain) ||
                       recordingDomain === domain.split('.')[0] + '.com';
            });
        } catch (e) {
            console.error('Error checking purchase availability:', e);
            return false;
        }
    }

    scrollToElement(element) {
        setTimeout(() => {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    showError(message) {
        // Simple error display - could be enhanced with toast notifications
        alert(message);
    }

    viewOrder(result) {
        // In a real app, this would navigate to an order details page
        window.open(`${this.baseURL}/orders/${result.purchase_id}`, '_blank');
    }

    // ===== MOCK DATA FOR FALLBACKS =====
    getMockModelData(make, model) {
        return {
            image_url: 'https://via.placeholder.com/300x200?text=HVAC+Unit',
            description: 'High-efficiency HVAC unit designed for commercial and residential applications.',
            specifications: {
                'Capacity': '5 Ton',
                'Efficiency': '16 SEER',
                'Type': 'Split System'
            }
        };
    }

    getMockManualsData() {
        return [
            {
                title: 'Service Manual',
                type: 'Service',
                pages: 45,
                url: '/api/manuals/1/download',
                thumbnail_url: null
            },
            {
                title: 'Installation Guide',
                type: 'Installation',
                pages: 24,
                url: '/api/manuals/2/download',
                thumbnail_url: null
            },
            {
                title: 'Parts Catalog',
                type: 'Parts',
                pages: 67,
                url: '/api/manuals/3/download',
                thumbnail_url: null
            },
            {
                title: 'Troubleshooting Guide',
                type: 'Troubleshooting',
                pages: 32,
                url: '/api/manuals/4/download',
                thumbnail_url: null
            }
        ];
    }

    getMockPartData() {
        return {
            oem_part_number: 'HH18HA499',
            description: 'High limit switch for HVAC safety control',
            serpapi_validation: {
                is_valid: true,
                assessment: 'Verified OEM part for this model'
            }
        };
    }

    getMockSuppliersData() {
        return [
            {
                name: 'HVAC Parts Depot',
                price: '$24.99',
                url: 'https://www.etundra.com/sample-part',
                availability: 'In Stock',
                shipping: 'Same Day',
                rating: '★★★★★'
            },
            {
                name: 'Commercial HVAC Supply',
                price: '$26.50',
                url: 'https://www.webstaurantstore.com/sample-part',
                availability: 'Limited Stock',
                shipping: '1-2 Days',
                rating: '★★★★☆'
            },
            {
                name: 'Industrial Parts Direct',
                price: '$22.75',
                url: 'https://www.example-unsupported.com/sample-part',
                availability: 'In Stock',
                shipping: '2-3 Days',
                rating: '★★★☆☆'
            }
        ];
    }

    // ===== NEW SCREEN METHODS =====
    
    showLogsScreen() {
        // Hide navigation buttons
        document.getElementById('navButtons').style.display = 'none';
        
        // Show logs screen
        document.getElementById('logsScreen').classList.remove('hidden');
        
        this.currentScreen = 'logs';
        this.addLog('info', 'Navigation', 'Opened logs screen');
    }

    showApiDocsScreen() {
        // Hide navigation buttons
        document.getElementById('navButtons').style.display = 'none';
        
        // Show API docs screen
        document.getElementById('apiDocsScreen').classList.remove('hidden');
        
        this.currentScreen = 'api-docs';
        this.populateApiDocs();
        this.addLog('info', 'Navigation', 'Opened API documentation screen');
    }

    showMainScreen() {
        // Hide all screens
        document.getElementById('logsScreen').classList.add('hidden');
        document.getElementById('apiDocsScreen').classList.add('hidden');
        
        // Show navigation buttons
        document.getElementById('navButtons').style.display = 'block';
        
        this.currentScreen = 'main';
        this.addLog('info', 'Navigation', 'Returned to main screen');
    }

    addLog(level, source, message, details = null) {
        const logsContent = document.getElementById('logsContent');
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
        const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
        
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${level}`;
        
        // Build more detailed log message
        let logText = `[${date} ${timestamp}] ${level.toUpperCase()}:${source}:${message}`;
        
        // Add details if provided
        if (details) {
            if (typeof details === 'object') {
                logText += ` | Details: ${JSON.stringify(details, null, 2)}`;
            } else {
                logText += ` | ${details}`;
            }
        }
        
        // Add caller information
        const stack = new Error().stack;
        const caller = stack.split('\n')[2]?.trim() || 'Unknown';
        if (caller && !caller.includes('addLog')) {
            logText += ` | Called from: ${caller.replace(/^at /, '')}`;
        }
        
        logEntry.textContent = logText;
        
        logsContent.appendChild(logEntry);
        logsContent.scrollTop = logsContent.scrollHeight;
        
        // Also log to console for debugging
        console.log(`[${level.toUpperCase()}] ${source}: ${message}`, details || '');
    }

    clearLogs() {
        const logsContent = document.getElementById('logsContent');
        const timestamp = new Date().toLocaleTimeString();
        logsContent.innerHTML = `<div class="log-entry info">[${timestamp}] INFO:System:Logs cleared</div>`;
    }

    populateApiDocs() {
        const apiEndpoints = [
            // Manuals API
            {
                method: 'POST',
                path: '/api/manuals/search',
                description: 'Search for technical manuals using AI-powered relevance scoring and automatic downloads.',
                example: {
                    request: `{
  "make": "Carrier",
  "model": "58STA"
}`,
                    response: `{
  "results": [
    {
      "title": "Service Manual",
      "url": "https://example.com/manual.pdf",
      "pages": 45,
      "verified": true
    }
  ]
}`
                }
            },
            {
                method: 'GET',
                path: '/api/manuals',
                description: 'List all stored manuals with pagination support.',
                example: {
                    request: 'GET /api/manuals?page=1&per_page=10',
                    response: `{
  "manuals": [
    {
      "id": 1,
      "make": "Carrier",
      "model": "58STA",
      "title": "Service Manual",
      "pages": 45
    }
  ],
  "total": 25,
  "page": 1,
  "per_page": 10
}`
                }
            },
            {
                method: 'GET',
                path: '/api/manuals/{id}',
                description: 'Get a specific manual by ID.',
                example: {
                    request: 'GET /api/manuals/123',
                    response: `{
  "id": 123,
  "make": "Carrier",
  "model": "58STA",
  "title": "Service Manual",
  "url": "https://example.com/manual.pdf",
  "proxy_url": "/api/manuals/123/download",
  "pages": 45,
  "created_at": "2025-01-01T12:00:00Z"
}`
                }
            },
            {
                method: 'POST',
                path: '/api/manuals',
                description: 'Create a new manual entry.',
                example: {
                    request: `{
  "make": "Carrier",
  "model": "58STA",
  "title": "Service Manual",
  "url": "https://example.com/manual.pdf",
  "type": "service"
}`,
                    response: `{
  "id": 123,
  "message": "Manual created successfully"
}`
                }
            },
            {
                method: 'POST',
                path: '/api/manuals/{id}/process',
                description: 'Process a manual to extract error codes and part numbers using GPT-4.1-Nano with 1M input token capacity.',
                example: {
                    request: 'POST /api/manuals/123/process',
                    response: `{
  "manual_id": 123,
  "error_codes": [
    {
      "code": "E1",
      "description": "High temperature limit"
    }
  ],
  "part_numbers": [
    {
      "part_number": "HH18HA499",
      "description": "High limit switch"
    }
  ]
}`
                }
            },
            {
                method: 'POST',
                path: '/api/manuals/multi-process',
                description: 'Process multiple manuals in parallel and reconcile duplicate results.',
                example: {
                    request: `{
  "manual_ids": [1, 2, 3]
}`,
                    response: `{
  "results": {
    "error_codes": [...],
    "part_numbers": [...],
    "deduplication_stats": {
      "total_error_codes": 45,
      "unique_error_codes": 32
    }
  }
}`
                }
            },
            {
                method: 'GET',
                path: '/api/manuals/{id}/components',
                description: 'Extract structural components from a manual (TOC, diagrams, etc).',
                example: {
                    request: 'GET /api/manuals/123/components',
                    response: `{
  "components": [
    {
      "type": "table_of_contents",
      "page_range": "2-3",
      "content": "..."
    },
    {
      "type": "exploded_view",
      "page_range": "15",
      "title": "Burner Assembly"
    }
  ]
}`
                }
            },
            {
                method: 'POST',
                path: '/api/manuals/{id}/process-components',
                description: 'Process specific components from a manual.',
                example: {
                    request: `{
  "component_types": ["error_codes", "parts"]
}`,
                    response: `{
  "processed_components": {
    "error_codes": [...],
    "parts": [...]
  },
  "success": true
}`
                }
            },
            {
                method: 'POST',
                path: '/api/manuals/{id}/download',
                description: 'Download and store a manual PDF file.',
                example: {
                    request: 'POST /api/manuals/123/download',
                    response: `{
  "success": true,
  "message": "Manual downloaded successfully",
  "file_path": "/uploads/manual_123.pdf"
}`
                }
            },
            {
                method: 'GET',
                path: '/api/manuals/{id}/error-codes',
                description: 'Get error codes extracted from a manual.',
                example: {
                    request: 'GET /api/manuals/123/error-codes',
                    response: `{
  "error_codes": [
    {
      "code": "E1",
      "description": "High temperature limit"
    }
  ]
}`
                }
            },
            {
                method: 'GET',
                path: '/api/manuals/{id}/part-numbers',
                description: 'Get part numbers extracted from a manual.',
                example: {
                    request: 'GET /api/manuals/123/part-numbers',
                    response: `{
  "part_numbers": [
    {
      "part_number": "HH18HA499",
      "description": "High limit switch"
    }
  ]
}`
                }
            },
            {
                method: 'GET',
                path: '/api/manuals/proxy/{proxy_id}',
                description: 'Proxy manual PDFs to avoid ad blocker issues and provide secure access.',
                example: {
                    request: 'GET /api/manuals/proxy/abc123def456',
                    response: 'PDF content (binary data)'
                }
            },
            {
                method: 'GET',
                path: '/api/manuals/{id}/components-test',
                description: 'Test component extraction from a manual (development endpoint).',
                example: {
                    request: 'GET /api/manuals/123/components-test',
                    response: `{
  "test_results": {...},
  "success": true
}`
                }
            },
            // Parts API
            {
                method: 'POST',
                path: '/api/parts/resolve',
                description: 'Resolve generic part descriptions to OEM part numbers using AI and multiple search methods.',
                example: {
                    request: `{
  "description": "hi limit switch",
  "make": "Carrier",
  "model": "58STA",
  "use_database": false,
  "use_manual_search": true,
  "use_web_search": true,
  "save_results": false
}`,
                    response: `{
  "results": {
    "manual_search": {
      "oem_part_number": "HH18HA499",
      "description": "High limit switch",
      "serpapi_validation": {
        "is_valid": true
      }
    }
  },
  "recommended_result": {...}
}`
                }
            },
            {
                method: 'GET',
                path: '/api/parts',
                description: 'List all stored parts with pagination.',
                example: {
                    request: 'GET /api/parts?page=1&per_page=20',
                    response: `{
  "parts": [
    {
      "id": 1,
      "oem_part_number": "HH18HA499",
      "description": "High limit switch",
      "make": "Carrier",
      "model": "58STA"
    }
  ],
  "total": 150,
  "page": 1,
  "per_page": 20
}`
                }
            },
            {
                method: 'POST',
                path: '/api/parts/find-similar',
                description: 'Find similar or alternative parts when exact resolution fails. Returns multiple options with images and descriptions.',
                example: {
                    request: `{
  "description": "hi limit switch",
  "make": "Carrier",
  "model": "58STA",
  "max_results": 10
}`,
                    response: `{
  "success": true,
  "similar_parts": [
    {
      "part_number": "HH18HA499",
      "description": "High Temperature Limit Switch",
      "manufacturer": "Carrier",
      "image_url": "https://example.com/part.jpg",
      "compatibility": "Direct replacement"
    },
    {
      "part_number": "47-21517-01",
      "description": "Limit Switch - High Temp",
      "manufacturer": "Rheem",
      "image_url": "https://example.com/alt.jpg",
      "compatibility": "Compatible alternative"
    }
  ],
  "total_found": 2
}`
                }
            },
            {
                method: 'POST',
                path: '/api/parts',
                description: 'Create a new part entry.',
                example: {
                    request: `{
  "oem_part_number": "HH18HA499",
  "description": "High limit switch",
  "make": "Carrier",
  "model": "58STA"
}`,
                    response: `{
  "id": 1,
  "message": "Part created successfully"
}`
                }
            },
            {
                method: 'GET',
                path: '/api/parts/{id}',
                description: 'Get a specific part by ID.',
                example: {
                    request: 'GET /api/parts/1',
                    response: `{
  "id": 1,
  "oem_part_number": "HH18HA499",
  "description": "High limit switch",
  "make": "Carrier",
  "model": "58STA",
  "created_at": "2025-01-01T12:00:00Z"
}`
                }
            },
            {
                method: 'PUT',
                path: '/api/parts/{id}',
                description: 'Update a specific part by ID.',
                example: {
                    request: `{
  "description": "Updated High limit switch",
  "model": "58STA-V2"
}`,
                    response: `{
  "id": 1,
  "message": "Part updated successfully"
}`
                }
            },
            {
                method: 'DELETE',
                path: '/api/parts/{id}',
                description: 'Delete a specific part by ID.',
                example: {
                    request: 'DELETE /api/parts/1',
                    response: `{
  "success": true,
  "message": "Part deleted successfully"
}`
                }
            },
            // Generic Parts API
            {
                method: 'POST',
                path: '/api/parts/find-generic',
                description: 'Find generic/aftermarket alternatives to OEM parts using GPT-4.1-Nano with comprehensive compatibility analysis.',
                example: {
                    request: `{
  "make": "Carrier",
  "model": "58STA080",
  "oem_part_number": "HH18HA499",
  "oem_part_description": "Hi Limit Switch",
  "search_options": {
    "include_cross_reference": true,
    "include_aftermarket": true,
    "max_results": 10
  }
}`,
                    response: `{
  "success": true,
  "oem_reference": {
    "part_number": "HH18HA499",
    "description": "Hi Limit Switch",
    "make": "Carrier",
    "model": "58STA080"
  },
  "generic_alternatives": [
    {
      "generic_part_number": "C7027A1049",
      "generic_part_description": "High Limit Switch - Generic",
      "manufacturer": "Honeywell",
      "compatibility_notes": "Direct replacement for Carrier HH18HA499",
      "confidence_score": 9,
      "price_information": "$18.99 (vs $45.99 OEM)",
      "cost_savings_potential": "High (30-50% savings typical)",
      "ai_validated": true,
      "source_website": "https://example.com/part"
    }
  ],
  "search_metadata": {
    "cross_references_found": 15,
    "generic_parts_found": 8,
    "ai_validated": 6
  }
}`
                }
            },
            {
                method: 'POST',
                path: '/api/parts/validate-compatibility',
                description: 'Validate compatibility between an OEM part and a proposed generic alternative using AI analysis.',
                example: {
                    request: `{
  "oem_part_number": "HH18HA499",
  "generic_part_number": "C7027A1049",
  "make": "Carrier",
  "model": "58STA080"
}`,
                    response: `{
  "success": true,
  "compatibility_score": 8.5,
  "compatibility_analysis": {
    "dimensional_match": "High confidence",
    "electrical_specs": "Compatible",
    "mounting_compatibility": "Verified",
    "performance_rating": "Equivalent",
    "warranty_coverage": "Check with supplier"
  },
  "recommendation": "Highly compatible - recommended for cost savings",
  "risk_assessment": "Low risk - well-documented cross-reference"
}`
                }
            },
            // Suppliers API
            {
                method: 'POST',
                path: '/api/suppliers/search',
                description: 'Find suppliers for specific OEM part numbers with AI-powered ranking and validation.',
                example: {
                    request: `{
  "part_number": "HH18HA499",
  "make": "Carrier",
  "model": "58STA",
  "oem_only": false
}`,
                    response: `{
  "suppliers": [
    {
      "name": "HVAC Parts Store",
      "url": "https://example.com/part",
      "price": "$24.99",
      "ai_ranking": 1
    }
  ]
}`
                }
            },
            {
                method: 'GET',
                path: '/api/suppliers',
                description: 'List all stored suppliers.',
                example: {
                    request: 'GET /api/suppliers',
                    response: `{
  "suppliers": [
    {
      "id": 1,
      "name": "HVAC Parts Store",
      "domain": "hvacparts.com",
      "created_at": "2025-01-01T12:00:00Z"
    }
  ]
}`
                }
            },
            {
                method: 'POST',
                path: '/api/suppliers',
                description: 'Create a new supplier entry.',
                example: {
                    request: `{
  "name": "HVAC Parts Store",
  "domain": "hvacparts.com",
  "url": "https://hvacparts.com"
}`,
                    response: `{
  "id": 1,
  "message": "Supplier created successfully"
}`
                }
            },
            {
                method: 'GET',
                path: '/api/suppliers/{id}',
                description: 'Get a specific supplier by ID.',
                example: {
                    request: 'GET /api/suppliers/1',
                    response: `{
  "id": 1,
  "name": "HVAC Parts Store",
  "domain": "hvacparts.com",
  "url": "https://hvacparts.com",
  "created_at": "2025-01-01T12:00:00Z"
}`
                }
            },
            {
                method: 'PUT',
                path: '/api/suppliers/{id}',
                description: 'Update a specific supplier by ID.',
                example: {
                    request: `{
  "name": "Updated HVAC Parts Store",
  "url": "https://new-hvacparts.com"
}`,
                    response: `{
  "id": 1,
  "message": "Supplier updated successfully"
}`
                }
            },
            {
                method: 'DELETE',
                path: '/api/suppliers/{id}',
                description: 'Delete a specific supplier by ID.',
                example: {
                    request: 'DELETE /api/suppliers/1',
                    response: `{
  "success": true,
  "message": "Supplier deleted successfully"
}`
                }
            },
            // Purchases API
            {
                method: 'POST',
                path: '/api/purchases',
                description: 'Automate purchase execution using pre-recorded browser sessions with real billing profiles.',
                example: {
                    request: `{
  "part_number": "HH18HA499",
  "supplier_url": "https://example.com/part",
  "billing_profile_id": 1,
  "quantity": 1
}`,
                    response: `{
  "success": true,
  "purchase_id": 123,
  "order_id": "ORDER-789",
  "confirmation_code": "CONF-456"
}`
                }
            },
            {
                method: 'GET',
                path: '/api/purchases',
                description: 'List all purchases with pagination.',
                example: {
                    request: 'GET /api/purchases?page=1&per_page=10',
                    response: `{
  "purchases": [
    {
      "id": 1,
      "part_number": "HH18HA499",
      "supplier_url": "https://example.com/part",
      "status": "completed",
      "order_id": "ORDER-789"
    }
  ],
  "total": 50,
  "page": 1,
  "per_page": 10
}`
                }
            },
            {
                method: 'GET',
                path: '/api/purchases/{id}',
                description: 'Get a specific purchase by ID.',
                example: {
                    request: 'GET /api/purchases/123',
                    response: `{
  "id": 123,
  "part_number": "HH18HA499",
  "supplier_url": "https://example.com/part",
  "status": "completed",
  "order_id": "ORDER-789",
  "confirmation_code": "CONF-456",
  "created_at": "2025-01-01T12:00:00Z"
}`
                }
            },
            {
                method: 'POST',
                path: '/api/purchases/{id}/cancel',
                description: 'Cancel a pending purchase.',
                example: {
                    request: 'POST /api/purchases/123/cancel',
                    response: `{
  "success": true,
  "message": "Purchase cancelled successfully"
}`
                }
            },
            {
                method: 'POST',
                path: '/api/purchases/{id}/retry',
                description: 'Retry a failed purchase.',
                example: {
                    request: 'POST /api/purchases/123/retry',
                    response: `{
  "success": true,
  "message": "Purchase retry initiated",
  "purchase_id": 123
}`
                }
            },
            // Profiles API
            {
                method: 'POST',
                path: '/api/profiles',
                description: 'Create encrypted billing profile for automated purchases.',
                example: {
                    request: `{
  "name": "Main Office",
  "billing_address": {
    "address1": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zip": "10001"
  },
  "payment_info": {
    "card_number": "4111111111111111",
    "exp_month": "12",
    "exp_year": "2025"
  }
}`,
                    response: `{
  "id": 1,
  "name": "Main Office",
  "message": "Profile created successfully"
}`
                }
            },
            {
                method: 'GET',
                path: '/api/profiles',
                description: 'List all billing profiles.',
                example: {
                    request: 'GET /api/profiles',
                    response: `{
  "profiles": [
    {
      "id": 1,
      "name": "Main Office",
      "created_at": "2025-01-01T12:00:00Z"
    }
  ]
}`
                }
            },
            {
                method: 'GET',
                path: '/api/profiles/{id}',
                description: 'Get a specific billing profile by ID.',
                example: {
                    request: 'GET /api/profiles/1',
                    response: `{
  "id": 1,
  "name": "Main Office",
  "billing_address": {
    "address1": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zip": "10001"
  },
  "created_at": "2025-01-01T12:00:00Z"
}`
                }
            },
            {
                method: 'PUT',
                path: '/api/profiles/{id}',
                description: 'Update a specific billing profile by ID.',
                example: {
                    request: `{
  "name": "Updated Office",
  "billing_address": {
    "address1": "456 New St",
    "city": "Boston",
    "state": "MA",
    "zip": "02101"
  }
}`,
                    response: `{
  "id": 1,
  "message": "Profile updated successfully"
}`
                }
            },
            {
                method: 'DELETE',
                path: '/api/profiles/{id}',
                description: 'Delete a specific billing profile by ID.',
                example: {
                    request: 'DELETE /api/profiles/1',
                    response: `{
  "success": true,
  "message": "Profile deleted successfully"
}`
                }
            },
            // Enrichment API
            {
                method: 'POST',
                path: '/api/enrichment',
                description: 'Enrich part or equipment data with additional multimedia content using GPT-4.1-Nano analysis.',
                example: {
                    request: `{
  "make": "Carrier",
  "model": "58STA",
  "part_number": "HH18HA499"
}`,
                    response: `{
  "success": true,
  "data": {
    "images": [
      {
        "url": "https://example.com/image.jpg",
        "title": "High Limit Switch"
      }
    ]
  }
}`
                }
            },
            // Screenshots API
            {
                method: 'POST',
                path: '/api/screenshots/suppliers',
                description: 'Capture screenshots of supplier websites for preview.',
                example: {
                    request: `{
  "urls": [
    "https://www.etundra.com/part",
    "https://www.webstaurantstore.com/part"
  ]
}`,
                    response: `{
  "success": true,
  "screenshots": {
    "https://www.etundra.com/part": "screenshots/suppliers/etundra_abc123.png"
  }
}`
                }
            },
            {
                method: 'GET',
                path: '/api/screenshots/supplier/{filename}',
                description: 'Serve captured supplier screenshot files.',
                example: {
                    request: 'GET /api/screenshots/supplier/etundra_abc123.png',
                    response: 'Image data (binary PNG/JPEG content)'
                }
            },
            // Recordings API
            {
                method: 'GET',
                path: '/api/recordings/available',
                description: 'Get list of domains with available purchase automation recordings.',
                example: {
                    request: 'GET /api/recordings/available',
                    response: `{
  "domains": [
    "etundra.com",
    "webstaurantstore.com",
    "partstown.com"
  ],
  "count": 3
}`
                }
            },
            {
                method: 'GET',
                path: '/api/recordings/health',
                description: 'Health check endpoint for recording studio service.',
                example: {
                    request: 'GET /api/recordings/health',
                    response: `{
  "status": "healthy",
  "service": "recording_studio",
  "recording_system_path": "/path/to/recording_system",
  "recordings_path": "/path/to/recordings"
}`
                }
            },
            {
                method: 'POST',
                path: '/api/recordings/record',
                description: 'Start a new recording session for e-commerce purchase flow.',
                example: {
                    request: `{
  "url": "https://example.com/product",
  "name": "example",
  "enhanced": false
}`,
                    response: `{
  "status": "recording_started",
  "url": "https://example.com/product",
  "recording_name": "example",
  "output_path": "/recordings/example.json",
  "process_id": 12345,
  "enhanced": false,
  "message": "Recording session started. Interact with the browser and press Ctrl+C to stop."
}`
                }
            },
            {
                method: 'GET',
                path: '/api/recordings/recordings',
                description: 'List all available recordings.',
                example: {
                    request: 'GET /api/recordings/recordings',
                    response: `{
  "recordings": [
    {
      "name": "etundra",
      "file": "etundra.json",
      "start_url": "https://etundra.com",
      "timestamp": "2025-01-01T12:00:00Z",
      "actions_count": 15,
      "version": "1.0"
    }
  ],
  "count": 1
}`
                }
            },
            {
                method: 'GET',
                path: '/api/recordings/recording/{name}',
                description: 'Get details of a specific recording.',
                example: {
                    request: 'GET /api/recordings/recording/etundra',
                    response: `{
  "name": "etundra",
  "data": {
    "startUrl": "https://etundra.com",
    "actions": [...],
    "version": "1.0"
  }
}`
                }
            },
            {
                method: 'POST',
                path: '/api/recordings/play',
                description: 'Play back a recording with variables.',
                example: {
                    request: `{
  "recording_name": "etundra",
  "variables": {
    "first_name": "John",
    "last_name": "Doe"
  },
  "options": {
    "headless": false,
    "slow_mo": 1000
  }
}`,
                    response: `{
  "status": "completed",
  "recording_name": "etundra",
  "return_code": 0,
  "success": true,
  "stdout": "Playback completed successfully",
  "stderr": ""
}`
                }
            },
            {
                method: 'POST',
                path: '/api/recordings/clone',
                description: 'Clone a recording to run on a different URL.',
                example: {
                    request: `{
  "recording_name": "etundra",
  "url": "https://newsite.com/product",
  "variables": {...},
  "options": {...}
}`,
                    response: `{
  "status": "completed",
  "recording_name": "etundra",
  "new_url": "https://newsite.com/product",
  "return_code": 0,
  "success": true
}`
                }
            },
            {
                method: 'GET',
                path: '/api/recordings/variables',
                description: 'Get current variables for purchase automation.',
                example: {
                    request: 'GET /api/recordings/variables',
                    response: `{
  "variables": {
    "first_name": "",
    "last_name": "",
    "email": "",
    "phone": "",
    "company": "",
    "address": "",
    "city": "",
    "state": "",
    "zip_code": "",
    "country": "United States"
  }
}`
                }
            },
            {
                method: 'POST',
                path: '/api/recordings/variables',
                description: 'Update variables for purchase automation.',
                example: {
                    request: `{
  "variables": {
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com"
  }
}`,
                    response: `{
  "status": "updated",
  "variables": {...}
}`
                }
            },
            {
                method: 'DELETE',
                path: '/api/recordings/recording/{name}',
                description: 'Delete a recording.',
                example: {
                    request: 'DELETE /api/recordings/recording/etundra',
                    response: `{
  "status": "deleted",
  "recording_name": "etundra"
}`
                }
            },
            // System API
            {
                method: 'POST',
                path: '/api/system/clear-cache',
                description: 'Clear cached files and temporary data.',
                example: {
                    request: 'POST /api/system/clear-cache',
                    response: `{
  "success": true,
  "message": "Cache cleared successfully",
  "cache_cleared": true
}`
                }
            },
            {
                method: 'POST',
                path: '/api/system/clear-database',
                description: 'Clear all database tables and cached files (use with caution).',
                example: {
                    request: 'POST /api/system/clear-database',
                    response: `{
  "success": true,
  "message": "Database and cache cleared successfully",
  "deleted_tables": [
    "manuals", "error_codes", "part_references", 
    "parts", "suppliers", "billing_profiles", "purchases"
  ],
  "cache_cleared": true
}`
                }
            }
        ];

        const container = document.getElementById('apiEndpoints');
        container.innerHTML = apiEndpoints.map((endpoint, index) => `
            <div class="api-endpoint collapsed" id="endpoint-${index}">
                <div class="endpoint-header" onclick="window.app.toggleEndpoint(${index})">
                    <span class="endpoint-method ${endpoint.method.toLowerCase()}">${endpoint.method}</span>
                    <span class="endpoint-path">${endpoint.path}</span>
                    <i class="fas fa-chevron-down toggle-icon"></i>
                </div>
                <div class="endpoint-description">${endpoint.description}</div>
                <div class="endpoint-details">
                    <div class="detail-section">
                        <div class="detail-title">Request Example</div>
                        <div class="detail-content">${endpoint.example.request}</div>
                    </div>
                    <div class="detail-section">
                        <div class="detail-title">Response Example</div>
                        <div class="detail-content">${endpoint.example.response}</div>
                    </div>
                </div>
            </div>
        `).join('');
        
        // Add recording service documentation link at the bottom
        container.innerHTML += `
            <div class="api-footer" style="margin-top: 2rem; padding: 1.5rem; border-radius: 12px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2);">
                <h3 style="margin: 0 0 1rem 0; color: var(--text-color); font-size: 1.1rem;">📖 Documentation</h3>
                <p style="margin: 0 0 1rem 0; color: var(--text-muted); line-height: 1.6;">
                    For detailed information about recording and testing purchase flows, including dummy values and setup instructions, see:
                </p>
                <a href="recording-docs.html" target="_blank" style="
                    display: inline-flex; 
                    align-items: center; 
                    gap: 0.5rem;
                    padding: 0.75rem 1.5rem; 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white; 
                    text-decoration: none; 
                    border-radius: 8px; 
                    font-weight: 500;
                    transition: transform 0.2s ease;
                    margin-bottom: 0.75rem;
                " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                    <i class="fas fa-book-open"></i>
                    Recording Service Documentation
                    <i class="fas fa-external-link-alt" style="font-size: 0.8rem; opacity: 0.8;"></i>
                </a>
                <a href="/data-navigator" target="_blank" style="
                    display: inline-flex; 
                    align-items: center; 
                    gap: 0.5rem;
                    padding: 0.75rem 1.5rem; 
                    background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                    color: white; 
                    text-decoration: none; 
                    border-radius: 8px; 
                    font-weight: 500;
                    transition: transform 0.2s ease;
                " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                    <i class="fas fa-database"></i>
                    Equipment Data Explorer (300+ Records)
                    <i class="fas fa-external-link-alt" style="font-size: 0.8rem; opacity: 0.8;"></i>
                </a>
            </div>
        `;
    }

    toggleEndpoint(index) {
        const endpointDiv = document.getElementById(`endpoint-${index}`);
        endpointDiv.classList.toggle('collapsed');
        const icon = endpointDiv.querySelector('.toggle-icon');
        icon.classList.toggle('fa-chevron-down');
        icon.classList.toggle('fa-chevron-up');
    }

    // ===== BILLING PROFILE METHODS =====
    async initializeBillingProfile() {
        // Load the default billing profile from the database
        try {
            const response = await fetch(`${this.baseURL}/api/profiles`);
            if (response.ok) {
                const data = await response.json();
                if (data.profiles && data.profiles.length > 0) {
                    // Get the first profile with sensitive data
                    const profileResponse = await fetch(`${this.baseURL}/api/profiles/${data.profiles[0].id}?include_sensitive=true`);
                    if (profileResponse.ok) {
                        const fullProfile = await profileResponse.json();
                        this.defaultBillingProfile = this.formatProfileFromAPI(fullProfile);
                        this.addLog('info', 'System', `Loaded default billing profile: ${this.defaultBillingProfile.first_name} ${this.defaultBillingProfile.last_name}`);
                        return;
                    }
                }
            }
        } catch (error) {
            console.error('Error loading profiles:', error);
        }
        
        // If no profiles exist, set up empty default but don't create it yet
        this.defaultBillingProfile = null;
        this.addLog('warning', 'System', 'No billing profile found. Please create one using the gear icon.');
    }

    showSettings() {
        const modal = document.getElementById('settingsModal');
        
        // Populate billing profile form with pre-loaded data
        if (this.defaultBillingProfile) {
            this.populateBillingForm(this.defaultBillingProfile);
        }
        
        // Initialize Purchase Agent tab
        this.initializePurchaseAgentTab();
        
        // Show the modal (defaults to billing tab)
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        this.addLog('info', 'User Action', 'Opened settings modal');
    }

    showBillingProfile() {
        // Compatibility function - redirect to settings
        this.showSettings();
    }
    
    
    populateProfileDisplay(profile) {
        const profileContent = document.getElementById('profileContent');
        if (!profile) {
            profileContent.innerHTML = '<div class="profile-note">No billing profile found. Please create one using the Edit tab.</div>';
            return;
        }
        
        // Extract billing address from payment_info like in admin interface
        const billing = profile.billing_address || {};
        const payment = profile.payment_info || {};
        
        const categories = {
            'Personal Info': [
                { label: 'FIRST NAME', value: billing.first_name || '' },
                { label: 'LAST NAME', value: billing.last_name || '' },
                { label: 'EMAIL', value: billing.email || '' },
                { label: 'PHONE', value: billing.phone_number || '' },
                { label: 'COMPANY', value: billing.company_name || '' },
                { label: 'COUNTRY', value: billing.country || '' }
            ],
            'Shipping Address': [
                { label: 'ADDRESS', value: billing.address || '' },
                { label: 'ADDRESS 2', value: billing.address2 || '' },
                { label: 'CITY', value: billing.city || '' },
                { label: 'STATE', value: billing.state || '' },
                { label: 'STATE ABR', value: billing.state_abr || '' },
                { label: 'ZIP CODE', value: billing.zip_code || '' }
            ],
            'Billing Address': [
                { label: 'BILLING ADDRESS', value: payment.billing_address || '' },
                { label: 'BILLING CITY', value: payment.billing_city || '' },
                { label: 'BILLING STATE', value: payment.billing_state || '' },
                { label: 'BILLING STATE ABR', value: payment.billing_state_abr || '' },
                { label: 'BILLING ZIP', value: payment.billing_zip || '' }
            ],
            'Payment': [
                { label: 'CARD NUMBER', value: payment.card_number ? `****-****-****-${payment.card_number.slice(-4)}` : '' },
                { label: 'EXP MONTH', value: payment.card_exp_month || '' },
                { label: 'EXP YEAR', value: payment.card_exp_year || '' },
                { label: 'CVV', value: payment.card_cvv ? '***' : '' },
                { label: 'NAME ON CARD', value: payment.card_name || '' }
            ]
        };
        
        let html = '';
        
        Object.entries(categories).forEach(([category, fields]) => {
            const isBilling = category === 'Billing Address';
            html += `<div class="profile-category ${isBilling ? 'billing-section' : ''}">
                <h4>${category}</h4>
                <div class="profile-items">`;
            
            fields.forEach(field => {
                if (field.value) {
                    html += `<div class="profile-item">
                        <strong>${field.label}:</strong>
                        <span class="profile-value">${field.value}</span>
                    </div>`;
                }
            });
            
            html += '</div></div>';
        });
        
        html += '<div class="profile-note">💡 <strong>Note:</strong> This profile data is used for automated purchases. Billing address comes from payment info section.</div>';
        
        profileContent.innerHTML = html;
    }

    populateBillingForm(profile) {
        // Personal Information
        document.getElementById('billingFirstName').value = profile.first_name || '';
        document.getElementById('billingLastName').value = profile.last_name || '';
        document.getElementById('billingEmail').value = profile.email || '';
        document.getElementById('billingPhone').value = profile.phone || '';
        document.getElementById('billingCompany').value = profile.company || '';
        
        // Address Information
        document.getElementById('billingAddress').value = profile.address || '';
        document.getElementById('billingAddress2').value = profile.address2 || '';
        document.getElementById('billingCity').value = profile.city || '';
        document.getElementById('billingState').value = profile.state || '';
        document.getElementById('billingStateAbr').value = profile.state_abr || '';
        document.getElementById('billingZip').value = profile.zip_code || '';
        document.getElementById('billingCountry').value = profile.country || 'United States';
        
        // Billing Address (if different)
        document.getElementById('billingBillFirstName').value = profile.billing_first_name || '';
        document.getElementById('billingBillLastName').value = profile.billing_last_name || '';
        document.getElementById('billingBillAddress').value = profile.billing_address || '';
        document.getElementById('billingBillCity').value = profile.billing_city || '';
        document.getElementById('billingBillState').value = profile.billing_state || '';
        document.getElementById('billingBillStateAbr').value = profile.billing_state_abr || '';
        document.getElementById('billingBillZip').value = profile.billing_zip || '';
        
        // Credit Card Information
        document.getElementById('billingCardNumber').value = profile.card_number || '';
        document.getElementById('billingCardExpMonth').value = profile.card_exp_month || '';
        document.getElementById('billingCardExpYear').value = profile.card_exp_year || '';
        document.getElementById('billingCardCvv').value = profile.card_cvv || '';
        document.getElementById('billingCardName').value = profile.card_name || '';
        
        // Add input formatting for credit card fields
        this.setupCreditCardFormatting();
    }
    
    formatProfileForAPI(profile) {
        // Format the profile data for the API expected structure
        return {
            name: `${profile.first_name} ${profile.last_name}`,
            billing_address: {
                first_name: profile.first_name,
                last_name: profile.last_name,
                email: profile.email,
                phone_number: profile.phone,
                company_name: profile.company,
                address1: profile.address,
                address2: profile.address2,
                city: profile.city,
                state: profile.state,
                state_abr: profile.state_abr,
                zip: profile.zip_code,
                country: profile.country,
                billing_first_name: profile.billing_first_name,
                billing_last_name: profile.billing_last_name,
                billing_address: profile.billing_address,
                billing_city: profile.billing_city,
                billing_state: profile.billing_state,
                billing_state_abr: profile.billing_state_abr,
                billing_zip: profile.billing_zip
            },
            payment_info: {
                card_number: profile.card_number,
                card_exp_month: profile.card_exp_month,
                card_exp_year: profile.card_exp_year,
                card_cvv: profile.card_cvv,
                card_name: profile.card_name,
                billing_zip: profile.zip_code,
                billing_address: profile.address,
                billing_city: profile.city,
                billing_state: profile.state
            }
        };
    }
    
    formatProfileFromAPI(apiProfile) {
        // Convert API profile format back to flat structure for frontend
        const billing = apiProfile.billing_address || {};
        const payment = apiProfile.payment_info || {};
        
        // Parse the name field if it exists
        const fullName = billing.name || '';
        const nameParts = fullName.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        
        return {
            id: apiProfile.id,
            first_name: billing.first_name || firstName,
            last_name: billing.last_name || lastName,
            email: billing.email || '',
            phone: billing.phone_number || billing.phone || '',
            company: billing.company_name || '',
            address: billing.address1 || billing.address || '',
            address2: billing.address2 || '',
            city: billing.city || '',
            state: billing.state || '',
            state_abr: billing.state_abr || '',
            zip_code: billing.zip || billing.zip_code || '',
            country: billing.country || 'United States',
            billing_first_name: billing.billing_first_name || firstName,
            billing_last_name: billing.billing_last_name || lastName,
            billing_address: billing.billing_address || billing.address1 || billing.address || '',
            billing_city: billing.billing_city || billing.city || '',
            billing_state: billing.billing_state || billing.state || '',
            billing_state_abr: billing.billing_state_abr || '',
            billing_zip: billing.billing_zip || billing.zip || billing.zip_code || '',
            card_number: payment.card_number || '',
            card_exp_month: payment.exp_month || payment.card_exp_month || '',
            card_exp_year: payment.exp_year || payment.card_exp_year || '',
            card_cvv: payment.cvv || payment.card_cvv || '',
            card_name: payment.name || payment.card_name || fullName
        };
    }
    
    setupCreditCardFormatting() {
        // Format card number with spaces
        const cardNumberInput = document.getElementById('billingCardNumber');
        cardNumberInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\s/g, '').replace(/[^0-9]/gi, '');
            let formattedValue = value.match(/.{1,4}/g)?.join(' ') || value;
            e.target.value = formattedValue;
        });
        
        // Format expiry month and year (numbers only)
        const expMonthInput = document.getElementById('billingCardExpMonth');
        const expYearInput = document.getElementById('billingCardExpYear');
        
        expMonthInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length > 2) value = value.substring(0, 2);
            e.target.value = value;
        });
        
        expYearInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length > 4) value = value.substring(0, 4);
            e.target.value = value;
        });
        
        // CVV numbers only
        const cvvInput = document.getElementById('billingCardCvv');
        cvvInput.addEventListener('input', function(e) {
            e.target.value = e.target.value.replace(/[^0-9]/gi, '');
        });
    }

    closeSettings() {
        const modal = document.getElementById('settingsModal');
        modal.classList.add('hidden');
        document.body.style.overflow = '';
        this.addLog('info', 'User Action', 'Closed settings modal');
    }

    closeBillingProfile() {
        // Compatibility function - redirect to settings close
        this.closeSettings();
    }

    async saveBillingProfile(event) {
        event.preventDefault();
        
        const formData = {
            first_name: document.getElementById('billingFirstName').value,
            last_name: document.getElementById('billingLastName').value,
            email: document.getElementById('billingEmail').value,
            phone: document.getElementById('billingPhone').value,
            company: document.getElementById('billingCompany').value,
            address: document.getElementById('billingAddress').value,
            address2: document.getElementById('billingAddress2').value,
            city: document.getElementById('billingCity').value,
            state: document.getElementById('billingState').value,
            state_abr: document.getElementById('billingStateAbr').value,
            zip_code: document.getElementById('billingZip').value,
            country: document.getElementById('billingCountry').value,
            billing_first_name: document.getElementById('billingBillFirstName').value,
            billing_last_name: document.getElementById('billingBillLastName').value,
            billing_address: document.getElementById('billingBillAddress').value,
            billing_city: document.getElementById('billingBillCity').value,
            billing_state: document.getElementById('billingBillState').value,
            billing_state_abr: document.getElementById('billingBillStateAbr').value,
            billing_zip: document.getElementById('billingBillZip').value,
            card_number: document.getElementById('billingCardNumber').value,
            card_exp_month: document.getElementById('billingCardExpMonth').value,
            card_exp_year: document.getElementById('billingCardExpYear').value,
            card_cvv: document.getElementById('billingCardCvv').value,
            card_name: document.getElementById('billingCardName').value
        };

        const profileData = this.formatProfileForAPI(formData);

        try {
            // If we have a default profile ID, update it; otherwise create a new one
            const isUpdate = this.defaultBillingProfile && this.defaultBillingProfile.id;
            const method = isUpdate ? 'PUT' : 'POST';
            const url = isUpdate ? `${this.baseURL}/api/profiles/${this.defaultBillingProfile.id}` : `${this.baseURL}/api/profiles`;
            
            this.addLog('info', 'API', `${isUpdate ? 'Updating' : 'Creating'} billing profile...`, {
                endpoint: isUpdate ? `/api/profiles/${this.defaultBillingProfile.id}` : '/api/profiles',
                method: method
            });
            
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(profileData)
            });
            
            if (response.ok) {
                const result = await response.json();
                const profileId = isUpdate ? this.defaultBillingProfile.id : result.id;
                this.addLog('success', 'API', `Billing profile ${isUpdate ? 'updated' : 'saved'} with ID: ${profileId}`);
                
                // Update the stored default profile with the properly formatted data
                this.defaultBillingProfile = { ...profileData, id: profileId };
                
                // Close the modal after successful save
                this.closeSettings();
                
                // Show success message
                this.showSuccess(`Billing profile ${isUpdate ? 'updated' : 'saved'} successfully!`);
            } else {
                throw new Error(`Failed to ${isUpdate ? 'update' : 'save'} profile`);
            }
        } catch (error) {
            this.addLog('error', 'API', `Failed to save billing profile: ${error.message}`);
            console.error('Error saving billing profile:', error);
            this.showError('Failed to save billing profile');
        }
    }

    showSuccess(message) {
        // Simple success notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 2rem;
            right: 2rem;
            background: #4caf50;
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 2000;
            font-weight: 500;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    // ===== SETTINGS TAB METHODS =====
    switchSettingsTab(tabName) {
        // Update tab buttons
        const tabs = document.querySelectorAll('.tab-button');
        tabs.forEach(tab => tab.classList.remove('active'));
        document.getElementById(`${tabName}Tab`).classList.add('active');
        
        // Update tab content
        const contents = document.querySelectorAll('.tab-content');
        contents.forEach(content => content.classList.remove('active'));
        document.getElementById(`${tabName}TabContent`).classList.add('active');
        
        this.addLog('info', 'User Action', `Switched to ${tabName} tab in settings`);
    }

    // Deprecated - replaced by Purchase Agent settings
    async loadPurchaseVariables() {
        // No longer used - Purchase Agent tab handles settings
    }

    // Deprecated - replaced by Purchase Agent settings
    populatePurchaseVariablesForm(variables) {
        const fieldMapping = {
            first_name: 'varFirstName',
            last_name: 'varLastName',
            email: 'varEmail',
            phone: 'varPhone',
            company: 'varCompany',
            address: 'varAddress',
            address2: 'varAddress2',
            city: 'varCity',
            state: 'varState',
            zip_code: 'varZipCode',
            country: 'varCountry',
            credit_card: 'varCreditCard',
            expiry_month: 'varExpiryMonth',
            expiry_year: 'varExpiryYear',
            cvv: 'varCvv',
            billing_first_name: 'varBillingFirstName',
            billing_last_name: 'varBillingLastName',
            billing_address: 'varBillingAddress',
            billing_address2: 'varBillingAddress2',
            billing_city: 'varBillingCity',
            billing_state: 'varBillingState',
            billing_zip: 'varBillingZip'
        };

        Object.keys(fieldMapping).forEach(varKey => {
            const inputId = fieldMapping[varKey];
            const input = document.getElementById(inputId);
            if (input && variables[varKey] !== undefined) {
                input.value = variables[varKey];
            }
        });
    }

    // Deprecated - replaced by Purchase Agent settings
    async savePurchaseVariables(event) {
        event.preventDefault();
        
        try {
            const form = event.target;
            const variables = {
                first_name: form.querySelector('#varFirstName').value,
                last_name: form.querySelector('#varLastName').value,
                email: form.querySelector('#varEmail').value,
                phone: form.querySelector('#varPhone').value,
                company: form.querySelector('#varCompany').value,
                address: form.querySelector('#varAddress').value,
                address2: form.querySelector('#varAddress2').value,
                city: form.querySelector('#varCity').value,
                state: form.querySelector('#varState').value,
                zip_code: form.querySelector('#varZipCode').value,
                country: form.querySelector('#varCountry').value,
                credit_card: form.querySelector('#varCreditCard').value,
                expiry_month: form.querySelector('#varExpiryMonth').value,
                expiry_year: form.querySelector('#varExpiryYear').value,
                cvv: form.querySelector('#varCvv').value,
                billing_first_name: form.querySelector('#varBillingFirstName').value,
                billing_last_name: form.querySelector('#varBillingLastName').value,
                billing_address: form.querySelector('#varBillingAddress').value,
                billing_address2: form.querySelector('#varBillingAddress2').value,
                billing_city: form.querySelector('#varBillingCity').value,
                billing_state: form.querySelector('#varBillingState').value,
                billing_zip: form.querySelector('#varBillingZip').value
            };

            const response = await fetch(`${this.baseURL}/api/recordings/variables`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ variables })
            });

            if (response.ok) {
                this.closeSettings();
                this.showSuccess('Purchase variables saved successfully!');
                this.addLog('success', 'API', 'Purchase variables saved successfully');
            } else {
                throw new Error('Failed to save purchase variables');
            }
        } catch (error) {
            this.addLog('error', 'API', `Failed to save purchase variables: ${error.message}`);
            console.error('Error saving purchase variables:', error);
            this.showError('Failed to save purchase variables');
        }
    }

    // Deprecated - replaced by Purchase Agent settings
    toggleBillingVar() {
        const checkbox = document.getElementById('sameAsShippingVar');
        const billingFields = document.getElementById('billingVarFields');
        
        if (checkbox.checked) {
            // Copy shipping info to billing
            document.getElementById('varBillingFirstName').value = document.getElementById('varFirstName').value;
            document.getElementById('varBillingLastName').value = document.getElementById('varLastName').value;
            document.getElementById('varBillingAddress').value = document.getElementById('varAddress').value;
            document.getElementById('varBillingAddress2').value = document.getElementById('varAddress2').value;
            document.getElementById('varBillingCity').value = document.getElementById('varCity').value;
            document.getElementById('varBillingState').value = document.getElementById('varState').value;
            document.getElementById('varBillingZip').value = document.getElementById('varZipCode').value;
            
            billingFields.style.opacity = '0.5';
            billingFields.style.pointerEvents = 'none';
        } else {
            billingFields.style.opacity = '1';
            billingFields.style.pointerEvents = 'auto';
        }
    }
}

// ===== GLOBAL FUNCTIONS =====
function openPdfViewer(url, title) {
    const modal = document.getElementById('pdfModal');
    const frame = document.getElementById('pdfFrame');
    const titleElement = document.getElementById('pdfTitle');
    
    titleElement.textContent = title || 'Manual Viewer';
    frame.src = url;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closePdfModal() {
    const modal = document.getElementById('pdfModal');
    const frame = document.getElementById('pdfFrame');
    
    frame.src = '';
    modal.classList.add('hidden');
    document.body.style.overflow = '';
}

function closePurchaseModal() {
    const modal = document.getElementById('purchaseModal');
    modal.classList.add('hidden');
    document.body.style.overflow = '';
    
    // Reset modal content
    document.getElementById('purchaseDetails').innerHTML = '';
    document.getElementById('purchaseActions').classList.add('hidden');
}

function viewOrder() {
    if (window.app && window.app.activePurchase) {
        window.app.viewOrder(window.app.activePurchase);
    }
    closePurchaseModal();
}

// ===== PURCHASE AGENT TAB METHODS =====
AIPartsAgent.prototype.initializePurchaseAgentTab = async function() {
    // Update available sites count
    const sitesCount = document.getElementById('availableSitesCount');
    if (sitesCount) {
        sitesCount.textContent = this.availableRecordings.length;
    }
    
    // Populate available sites list
    const sitesList = document.getElementById('availableSitesList');
    if (sitesList) {
        sitesList.innerHTML = '';
        
        if (this.availableRecordings.length > 0) {
            this.availableRecordings.forEach(domain => {
                const siteDiv = document.createElement('div');
                siteDiv.style.cssText = 'padding: 0.75rem; background: var(--glass-bg); border-radius: 6px; border: 1px solid var(--glass-border); display: flex; align-items: center; justify-content: space-between;';
                siteDiv.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <i class="fas fa-check-circle" style="color: #4caf50;"></i>
                        <span style="font-weight: 500;">${domain}</span>
                    </div>
                    <span style="font-size: 0.875rem; color: var(--text-muted);">Recording Available</span>
                `;
                sitesList.appendChild(siteDiv);
            });
        } else {
            sitesList.innerHTML = `
                <div style="padding: 1rem; text-align: center; color: var(--text-muted);">
                    No recordings available. Use the recording system to add support for e-commerce sites.
                </div>
            `;
        }
    }
    
    // Load saved purchase settings
    this.loadPurchaseSettings();
};

AIPartsAgent.prototype.loadPurchaseSettings = function() {
    // Load settings from localStorage
    const settings = JSON.parse(localStorage.getItem('purchaseAgentSettings') || '{}');
    
    // Apply settings to form
    const enableReal = document.getElementById('enableRealPurchases');
    if (enableReal) enableReal.checked = settings.enableRealPurchases || false;
    
    const speed = document.getElementById('purchaseSpeed');
    if (speed) speed.value = settings.purchaseSpeed || 5000;
    
    const attempts = document.getElementById('maxPurchaseAttempts');
    if (attempts) attempts.value = settings.maxPurchaseAttempts || 3;
    
    const screenshots = document.getElementById('captureScreenshots');
    if (screenshots) screenshots.checked = settings.captureScreenshots !== false; // Default true
    
    const headless = document.getElementById('headlessMode');
    if (headless) headless.checked = settings.headlessMode || false;
};

AIPartsAgent.prototype.savePurchaseSettings = function(event) {
    event.preventDefault();
    
    const settings = {
        enableRealPurchases: document.getElementById('enableRealPurchases').checked,
        purchaseSpeed: parseInt(document.getElementById('purchaseSpeed').value),
        maxPurchaseAttempts: parseInt(document.getElementById('maxPurchaseAttempts').value),
        captureScreenshots: document.getElementById('captureScreenshots').checked,
        headlessMode: document.getElementById('headlessMode').checked
    };
    
    // Save to localStorage
    localStorage.setItem('purchaseAgentSettings', JSON.stringify(settings));
    
    this.addLog('success', 'Settings', 'Purchase agent settings saved successfully');
    this.showNotification('Settings saved successfully', 'success');
};

AIPartsAgent.prototype.toggleRealPurchases = function(checkbox) {
    if (checkbox.checked) {
        const confirmed = confirm(
            'WARNING: Enabling real purchases will allow the agent to make actual purchases using your billing profile.\n\n' +
            'Are you sure you want to enable this feature?'
        );
        
        if (!confirmed) {
            checkbox.checked = false;
            return;
        }
        
        this.addLog('warning', 'Settings', 'Real purchases ENABLED - Use with caution!');
    } else {
        this.addLog('info', 'Settings', 'Real purchases disabled (test mode)');
    }
};

// ===== GENERIC PARTS FINDER =====

AIPartsAgent.prototype.findGenericAlternatives = async function() {
    if (!this.currentPart || !this.currentPart.oem_part_number) {
        this.showNotification('No OEM part available to find generic alternatives', 'error');
        return;
    }

    this.updateGenericStatus('Searching for generic alternatives...', 'info');
    this.showGenericPartsModal();

    try {
        const response = await fetch(`${this.baseURL}/api/parts/find-generic`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                oem_part_number: this.currentPart.oem_part_number,
                oem_part_description: this.currentPart.description || this.currentSearch.partName,
                make: this.currentSearch.make,
                model: this.currentSearch.model
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            this.currentGenericResults = result;
            this.displayGenericAlternatives(result);
            this.addLog('success', 'Generic Parts', `Found ${result.generic_alternatives ? result.generic_alternatives.length : 0} generic alternatives`);
        } else {
            throw new Error(result.error || 'Failed to find generic alternatives');
        }

    } catch (error) {
        console.error('Error finding generic alternatives:', error);
        this.updateGenericStatus('Failed to find generic alternatives', 'error');
        this.addLog('error', 'Generic Parts', error.message);
    }
};

AIPartsAgent.prototype.displayGenericAlternatives = function(data) {
    const container = document.getElementById('genericPartsResults');
    
    if (!data.generic_alternatives || data.generic_alternatives.length === 0) {
        container.innerHTML = `
            <div class="no-results">
                <i class="fas fa-search"></i>
                <p>No generic alternatives found for this OEM part</p>
            </div>
        `;
        this.updateGenericStatus('No generic alternatives found', 'warning');
        return;
    }

    // Update status
    this.updateGenericStatus(`Found ${data.generic_alternatives.length} generic alternatives`, 'success');

    // Create comparison table
    const comparisonTable = this.createComparisonTable(data);
    
    container.innerHTML = `
        <div class="generic-summary section-card">
            <div class="summary-header">
                <h4 class="section-title">
                    <i class="fas fa-exchange-alt text-success"></i>
                    Generic Alternatives Found
                </h4>
                <div class="oem-part-info">
                    <span class="oem-label">OEM Part:</span>
                    <span class="oem-part-number">${data.oem_reference.part_number}</span>
                </div>
            </div>
            <p class="part-description">${data.oem_reference.description}</p>
            <div class="summary-stats">
                <div class="stat-item">
                    <i class="fas fa-list-alt"></i>
                    <span class="stat-value">${data.generic_alternatives.length}</span>
                    <span class="stat-label">Alternatives Found</span>
                </div>
                <div class="stat-item savings-stat">
                    <i class="fas fa-dollar-sign"></i>
                    <span class="stat-value">Up to ${this.calculateMaxSavings(data)}%</span>
                    <span class="stat-label">Potential Savings</span>
                </div>
            </div>
        </div>
        ${comparisonTable}
    `;
};

AIPartsAgent.prototype.createComparisonTable = function(data) {
    const alternatives = data.generic_alternatives;
    
    return `
        <div class="comparison-section">
            <h5 class="table-title">
                <i class="fas fa-table"></i>
                Detailed Comparison
            </h5>
            <div class="comparison-table-wrapper">
                <div class="comparison-table">
                    <div class="table-header">
                        <div class="col-part">
                            <i class="fas fa-barcode"></i>
                            Part Details
                        </div>
                        <div class="col-description">
                            <i class="fas fa-info-circle"></i>
                            Description & Features
                        </div>
                        <div class="col-price">
                            <i class="fas fa-tag"></i>
                            Pricing
                        </div>
                        <div class="col-savings">
                            <i class="fas fa-percentage"></i>
                            Savings
                        </div>
                        <div class="col-confidence">
                            <i class="fas fa-shield-alt"></i>
                            Confidence
                        </div>
                        <div class="col-actions">
                            <i class="fas fa-tools"></i>
                            Actions
                        </div>
                    </div>
                    
                    ${alternatives.map((alt, index) => `
                <div class="table-row ${index === 0 ? 'best-match' : ''}" data-part-number="${alt.generic_part_number || alt.part_number}">
                    <div class="col-part">
                        <div class="part-header">
                            ${index === 0 ? '<span class="best-match-badge"><i class="fas fa-star"></i> Best Match</span>' : ''}
                            <strong class="part-number">${alt.generic_part_number || alt.part_number || 'N/A'}</strong>
                        </div>
                        ${alt.manufacturer ? `<div class="manufacturer-info">
                            <i class="fas fa-industry"></i>
                            <span>${alt.manufacturer}</span>
                        </div>` : ''}
                    </div>
                    <div class="col-description">
                        <div class="description-text">${alt.generic_part_description || alt.description || 'Generic replacement part'}</div>
                        ${alt.compatibility_notes ? `<div class="compatibility-notes">
                            <i class="fas fa-info-circle"></i>
                            <small>${alt.compatibility_notes}</small>
                        </div>` : ''}
                    </div>
                    <div class="col-price">
                        <div class="price-info">
                            ${this.formatPriceInfo(alt.price_information)}
                        </div>
                    </div>
                    <div class="col-savings">
                        <div class="savings-container">
                            <span class="savings-badge ${this.getSavingsClass((alt.confidence_score || 0) * 10)}">
                                ${alt.cost_savings_potential || 'N/A'}
                            </span>
                        </div>
                    </div>
                    <div class="col-confidence">
                        <div class="confidence-container">
                            <div class="confidence-meter">
                                <div class="confidence-bar ${this.getConfidenceClass(alt.confidence_score)}" style="width: ${(alt.confidence_score || 0) * 10}%"></div>
                            </div>
                            <span class="confidence-text">${alt.confidence_score || 0}/10</span>
                            <small class="confidence-label">${this.getConfidenceLabel(alt.confidence_score)}</small>
                        </div>
                    </div>
                    <div class="col-actions">
                        <div class="action-buttons">
                            <button class="btn-validate" onclick="app.validateCompatibility('${alt.generic_part_number || alt.part_number}')">
                                <i class="fas fa-check-circle"></i> 
                                <span>Validate</span>
                            </button>
                            ${alt.source_website ? `
                                <a href="${alt.source_website}" target="_blank" class="btn-view">
                                    <i class="fas fa-external-link-alt"></i> 
                                    <span>View</span>
                                </a>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
};

AIPartsAgent.prototype.validateCompatibility = async function(partNumber) {
    const row = document.querySelector(`[data-part-number="${partNumber}"]`);
    if (!row) return;

    const validateBtn = row.querySelector('.btn-validate');
    const originalText = validateBtn.innerHTML;
    validateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Validating...';
    validateBtn.disabled = true;

    try {
        const response = await fetch(`${this.baseURL}/api/parts/validate-compatibility`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                oem_part_number: this.currentPart.oem_part_number,
                generic_part_number: partNumber,
                make: this.currentSearch.make,
                model: this.currentSearch.model
            })
        });

        const result = await response.json();

        if (response.ok && result.status === 'success') {
            // Update confidence display
            const confidenceElement = row.querySelector('.confidence-bar');
            const confidenceText = row.querySelector('.confidence-text');
            const newConfidence = result.data.compatibility_score;
            
            confidenceElement.style.width = `${newConfidence * 100}%`;
            confidenceText.textContent = `${Math.round(newConfidence * 100)}%`;
            
            // Show validation result
            validateBtn.innerHTML = `<i class="fas fa-check"></i> ${result.data.is_compatible ? 'Compatible' : 'Not Compatible'}`;
            validateBtn.className = `btn-validate ${result.data.is_compatible ? 'validated-good' : 'validated-bad'}`;
            
            this.addLog('success', 'Generic Parts', `Validated compatibility for ${partNumber}: ${Math.round(newConfidence * 100)}%`);
            
        } else {
            throw new Error(result.message || 'Validation failed');
        }

    } catch (error) {
        console.error('Error validating compatibility:', error);
        validateBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error';
        validateBtn.className = 'btn-validate validated-error';
        this.addLog('error', 'Generic Parts', `Validation error for ${partNumber}: ${error.message}`);
    } finally {
        validateBtn.disabled = false;
    }
};

AIPartsAgent.prototype.showGenericPartsModal = function() {
    const modal = document.getElementById('genericPartsModal');
    modal.classList.remove('hidden');
    modal.style.display = 'block';
};

AIPartsAgent.prototype.closeGenericPartsModal = function() {
    const modal = document.getElementById('genericPartsModal');
    modal.classList.add('hidden');
    modal.style.display = 'none';
    this.currentGenericResults = null;
};

AIPartsAgent.prototype.updateGenericStatus = function(message, type = 'info') {
    const statusElement = document.getElementById('genericStatus');
    if (!statusElement) return;
    
    const statusMessage = statusElement.querySelector('.status-message');
    if (statusMessage) {
        statusMessage.className = `status-message ${type}`;
        statusMessage.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
            ${message}
        `;
    }
};

AIPartsAgent.prototype.exportGenericParts = function() {
    if (!this.currentGenericResults) {
        this.showNotification('No generic parts data to export', 'error');
        return;
    }

    try {
        // Create CSV content
        const csvHeaders = [
            'OEM Part Number',
            'OEM Description', 
            'Generic Part Number',
            'Generic Description',
            'Manufacturer',
            'Price',
            'Savings Percentage',
            'Compatibility Score',
            'Link'
        ];

        const csvRows = [csvHeaders.join(',')];
        
        this.currentGenericResults.generic_alternatives.forEach(alt => {
            const row = [
                this.currentGenericResults.oem_reference.part_number,
                this.currentGenericResults.oem_reference.description || '',
                alt.generic_part_number || alt.part_number || '',
                alt.generic_part_description || alt.description || '',
                alt.manufacturer || '',
                alt.price_information || '',
                alt.cost_savings_potential || '',
                alt.confidence_score || 0,
                alt.source_website || ''
            ].map(field => `"${String(field).replace(/"/g, '""')}"`);
            
            csvRows.push(row.join(','));
        });

        // Download CSV
        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `generic_parts_${this.currentGenericResults.oem_part.part_number}_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        this.showNotification('Generic parts data exported successfully', 'success');
        this.addLog('success', 'Generic Parts', 'Exported generic parts comparison to CSV');
        
    } catch (error) {
        console.error('Error exporting generic parts:', error);
        this.showNotification('Failed to export generic parts data', 'error');
    }
};

AIPartsAgent.prototype.calculateMaxSavings = function(data) {
    if (!data.generic_alternatives || data.generic_alternatives.length === 0) return 0;
    
    const maxSavings = Math.max(...data.generic_alternatives
        .map(alt => {
            // Extract percentage from cost_savings_potential like "High (30-50% savings typical)"
            const savingsText = alt.cost_savings_potential || '';
            const match = savingsText.match(/(\d+)-?(\d+)?%/);
            return match ? parseInt(match[2] || match[1]) : 0;
        })
        .filter(savings => savings > 0)
    );
    
    return maxSavings > 0 ? Math.round(maxSavings) : 0;
};

AIPartsAgent.prototype.getSavingsClass = function(percentage) {
    if (!percentage || percentage <= 0) return 'no-savings';
    if (percentage < 15) return 'low-savings';
    if (percentage < 30) return 'medium-savings';
    return 'high-savings';
};

AIPartsAgent.prototype.updateGenericPartsButton = function(partData) {
    const genericSection = document.getElementById('genericPartsSection');
    if (genericSection && partData && partData.oem_part_number && !partData.similar_parts_triggered) {
        genericSection.style.display = 'block';
        this.addLog('info', 'Generic Parts', 'Generic parts section shown - OEM part found');
    } else {
        genericSection.style.display = 'none';
        this.addLog('debug', 'Generic Parts', 'Generic parts section hidden - no valid OEM part or similar parts already triggered');
    }
};

AIPartsAgent.prototype.openRecordingDocs = function() {
    window.open('/static/api-demo/v3/recording-docs.html', '_blank');
    this.addLog('info', 'User Action', 'Opened recording system documentation');
};

// Admin panel function removed - no longer needed

AIPartsAgent.prototype.showNotification = function(message, type = 'info') {
    // Simple notification (you can enhance this with a proper toast notification)
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 2rem;
        right: 2rem;
        padding: 1rem 1.5rem;
        background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
};

// Helper functions for generic parts formatting
AIPartsAgent.prototype.formatPriceInfo = function(priceInfo) {
    if (!priceInfo || priceInfo === 'N/A') {
        return '<div class="price-unavailable"><i class="fas fa-question-circle"></i> Price varies</div>';
    }
    return `<div class="price-info"><i class="fas fa-dollar-sign"></i> ${priceInfo}</div>`;
};

AIPartsAgent.prototype.getConfidenceClass = function(score) {
    if (!score) return 'confidence-unknown';
    if (score >= 8) return 'confidence-high';
    if (score >= 6) return 'confidence-medium';
    if (score >= 4) return 'confidence-low';
    return 'confidence-very-low';
};

AIPartsAgent.prototype.getConfidenceLabel = function(score) {
    if (!score) return 'Unknown';
    if (score >= 8) return 'High';
    if (score >= 6) return 'Medium';
    if (score >= 4) return 'Low';
    return 'Very Low';
};

// ===== INITIALIZE APP =====
let app;
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded fired - initializing app');
    try {
        app = new AIPartsAgent();
        window.app = app; // Make globally accessible for onclick handlers
        console.log('✅ App initialized successfully');
    } catch (error) {
        console.error('❌ Error initializing app:', error);
    }
});