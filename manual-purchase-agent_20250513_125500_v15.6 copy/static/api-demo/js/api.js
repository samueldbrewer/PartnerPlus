/**
 * Manual Purchase Agent - API Client Library
 * Version 10.0.0
 */

const API = {
    /**
     * Generic fetch wrapper with error handling and response formatting
     * @param {string} url - API endpoint URL
     * @param {Object} options - Fetch options
     * @returns {Promise<Object>} - Parsed response
     */
    async fetch(url, options = {}) {
        try {
            console.log(`API Request: ${options.method || 'GET'} ${url}`);
            if (options.body) {
                console.log('Request Body:', JSON.parse(options.body));
            }
            
            // Add cache-busting timestamp to GET requests to prevent browser caching
            const urlObj = new URL(url, window.location.origin);
            if (options.method === undefined || options.method === 'GET') {
                urlObj.searchParams.append('_t', Date.now());
            }
            
            // Setup cache-control headers for the request
            if (!options.headers) {
                options.headers = {};
            }
            options.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
            options.headers['Pragma'] = 'no-cache';
            options.headers['Expires'] = '0';
            
            // Make the real API call
            const response = await fetch(urlObj.toString(), options);
            
            // Get response data
            const data = await response.json();
            
            console.log('API Response:', data);
            
            // If API returns an error field, consider it an error
            if (data && data.error) {
                return {
                    success: false,
                    status: response.status,
                    statusText: data.error || response.statusText,
                    error: data.error,
                    data: data
                };
            }

            // For our specific API, we need to merge the data with the response metadata
            // as our endpoints return the data directly
            return {
                ...data, // Spread the data properties
                success: response.ok,
                status: response.status,
                statusText: response.statusText
            };
        } catch (error) {
            console.error('API fetch error:', error);
            
            // Return formatted error
            return {
                success: false,
                status: 0,
                statusText: 'Network Error',
                error: error.message,
                data: null
            };
        }
    },

    /**
     * Format response for display
     * @param {Object} response - API response object
     * @returns {string} - Formatted JSON
     */
    formatResponse(response) {
        return JSON.stringify(response, null, 2);
    },

    // ====================
    // Manual APIs
    // ====================
    
    /**
     * Search for manuals by make and model
     * @param {Object} params - Search parameters
     * @returns {Promise<Object>} - Search results
     */
    async searchManuals(params) {
        return this.fetch('/api/manuals/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });
    },
    
    /**
     * Get list of manuals with optional filters
     * @param {Object} params - Query parameters
     * @returns {Promise<Object>} - List of manuals
     */
    async getManuals(params = {}) {
        const queryParams = new URLSearchParams(params).toString();
        return this.fetch(`/api/manuals?${queryParams}`);
    },
    
    /**
     * Process a manual to extract information
     * @param {number} manualId - ID of the manual to process
     * @returns {Promise<Object>} - Processing results
     */
    async processManual(manualId) {
        return this.fetch(`/api/manuals/${manualId}/process`, {
            method: 'POST'
        });
    },
    
    /**
     * Get a specific manual by ID
     * @param {number} manualId - ID of the manual
     * @returns {Promise<Object>} - Manual details
     */
    async getManual(manualId) {
        return this.fetch(`/api/manuals/${manualId}`);
    },
    
    /**
     * Create a new manual
     * @param {Object} manualData - Manual data
     * @returns {Promise<Object>} - Created manual
     */
    async createManual(manualData) {
        return this.fetch('/api/manuals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(manualData)
        });
    },
    
    /**
     * Delete a manual
     * @param {number} manualId - ID of the manual to delete
     * @returns {Promise<Object>} - Delete result
     */
    async deleteManual(manualId) {
        return this.fetch(`/api/manuals/${manualId}`, {
            method: 'DELETE'
        });
    },
    
    /**
     * Get error codes for a manual
     * @param {number} manualId - ID of the manual
     * @returns {Promise<Object>} - List of error codes
     */
    async getErrorCodes(manualId) {
        return this.fetch(`/api/manuals/${manualId}/error-codes`);
    },
    
    /**
     * Get part numbers for a manual
     * @param {number} manualId - ID of the manual
     * @returns {Promise<Object>} - List of part numbers
     */
    async getPartNumbers(manualId) {
        return this.fetch(`/api/manuals/${manualId}/part-numbers`);
    },
    
    /**
     * Get manual components (exploded view, installation instructions, error code tables, etc.)
     * @param {number} manualId - ID of the manual
     * @returns {Promise<Object>} - Structured components with page numbers
     */
    async getManualComponents(manualId) {
        return this.fetch(`/api/manuals/${manualId}/components`);
    },
    
    /**
     * Process a manual to extract components with custom prompt
     * @param {number} manualId - ID of the manual to process
     * @param {Object} options - Processing options including custom prompt
     * @returns {Promise<Object>} - Processing results with components
     */
    async processManualComponents(manualId, options = {}) {
        return this.fetch(`/api/manuals/${manualId}/process-components`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options)
        });
    },

    // ====================
    // Part APIs
    // ====================
    
    /**
     * Resolve a generic part description to OEM part numbers
     * @param {Object} partData - Part data
     * @returns {Promise<Object>} - Resolved part information
     */
    async resolvePart(partData) {
        return this.fetch('/api/parts/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(partData)
        });
    },
    
    /**
     * Get list of parts with optional filters
     * @param {Object} params - Query parameters
     * @returns {Promise<Object>} - List of parts
     */
    async getParts(params = {}) {
        const queryParams = new URLSearchParams(params).toString();
        return this.fetch(`/api/parts?${queryParams}`);
    },
    
    /**
     * Get a specific part by ID
     * @param {number} partId - ID of the part
     * @returns {Promise<Object>} - Part details
     */
    async getPart(partId) {
        return this.fetch(`/api/parts/${partId}`);
    },
    
    /**
     * Create a new part
     * @param {Object} partData - Part data
     * @returns {Promise<Object>} - Created part
     */
    async createPart(partData) {
        return this.fetch('/api/parts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(partData)
        });
    },

    // ====================
    // Supplier APIs
    // ====================
    
    /**
     * Search for suppliers for a specific part
     * @param {Object} params - Search parameters
     * @returns {Promise<Object>} - List of suppliers
     */
    async searchSuppliers(params) {
        return this.fetch('/api/suppliers/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });
    },
    
    /**
     * Get list of suppliers with optional filters
     * @param {Object} params - Query parameters
     * @returns {Promise<Object>} - List of suppliers
     */
    async getSuppliers(params = {}) {
        const queryParams = new URLSearchParams(params).toString();
        return this.fetch(`/api/suppliers?${queryParams}`);
    },
    
    /**
     * Create a new supplier
     * @param {Object} supplierData - Supplier data
     * @returns {Promise<Object>} - Created supplier
     */
    async createSupplier(supplierData) {
        return this.fetch('/api/suppliers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(supplierData)
        });
    },

    // ====================
    // Profile APIs
    // ====================
    
    /**
     * Get list of billing profiles
     * @param {Object} params - Query parameters
     * @returns {Promise<Object>} - List of profiles
     */
    async getProfiles(params = {}) {
        const queryParams = new URLSearchParams(params).toString();
        return this.fetch(`/api/profiles?${queryParams}`);
    },
    
    /**
     * Create a new billing profile
     * @param {Object} profileData - Profile data
     * @returns {Promise<Object>} - Created profile
     */
    async createProfile(profileData) {
        return this.fetch('/api/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profileData)
        });
    },
    
    /**
     * Get a specific profile by ID
     * @param {number} profileId - ID of the profile
     * @param {boolean} includeSensitive - Whether to include sensitive information
     * @returns {Promise<Object>} - Profile details
     */
    async getProfile(profileId, includeSensitive = false) {
        return this.fetch(`/api/profiles/${profileId}?include_sensitive=${includeSensitive}`);
    },

    // ====================
    // Purchase APIs
    // ====================
    
    /**
     * Create a new purchase
     * @param {Object} purchaseData - Purchase data
     * @returns {Promise<Object>} - Created purchase
     */
    async createPurchase(purchaseData) {
        return this.fetch('/api/purchases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(purchaseData)
        });
    },
    
    /**
     * Get list of purchases
     * @param {Object} params - Query parameters
     * @returns {Promise<Object>} - List of purchases
     */
    async getPurchases(params = {}) {
        const queryParams = new URLSearchParams(params).toString();
        return this.fetch(`/api/purchases?${queryParams}`);
    },
    
    /**
     * Get a specific purchase by ID
     * @param {number} purchaseId - ID of the purchase
     * @returns {Promise<Object>} - Purchase details
     */
    async getPurchase(purchaseId) {
        return this.fetch(`/api/purchases/${purchaseId}`);
    },
    
    /**
     * Cancel a purchase
     * @param {number} purchaseId - ID of the purchase to cancel
     * @returns {Promise<Object>} - Cancel result
     */
    async cancelPurchase(purchaseId) {
        return this.fetch(`/api/purchases/${purchaseId}/cancel`, {
            method: 'POST'
        });
    }
};