/**
 * Manual Purchase Agent - API Demo
 * Version 10.0.0
 */

document.addEventListener('DOMContentLoaded', function() {
    // Navigation functionality
    initNavigation();
    
    // Copy endpoint buttons
    initCopyButtons();
    
    // Form submission handlers
    initFormHandlers();
    
    // Initialize profiles section
    initProfilesSection();
});

/**
 * Initialize navigation functionality
 */
function initNavigation() {
    // Menu item click handler
    const menuItems = document.querySelectorAll('#api-menu a');
    menuItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Update active state
            menuItems.forEach(mi => mi.classList.remove('active'));
            this.classList.add('active');
            
            // Show target section
            const targetId = this.getAttribute('href').substring(1);
            document.querySelectorAll('.api-section').forEach(section => {
                section.style.display = section.id === targetId ? 'block' : 'none';
            });
            
            // Update URL hash
            window.location.hash = targetId;
        });
    });
    
    // Handle initial hash
    if (window.location.hash) {
        const targetId = window.location.hash.substring(1);
        const targetItem = document.querySelector(`#api-menu a[href="#${targetId}"]`);
        if (targetItem) {
            targetItem.click();
        }
    } else {
        // Default to first menu item if no hash
        if (menuItems.length > 0) {
            menuItems[0].click();
        }
    }
}

/**
 * Initialize copy endpoint buttons
 */
function initCopyButtons() {
    const copyButtons = document.querySelectorAll('.copy-endpoint');
    copyButtons.forEach(button => {
        button.addEventListener('click', function() {
            const endpoint = this.getAttribute('data-endpoint');
            
            // Copy to clipboard
            navigator.clipboard.writeText(endpoint)
                .then(() => {
                    // Visual feedback
                    this.classList.add('copied');
                    this.innerHTML = '<i class="fas fa-check"></i> Copied';
                    
                    // Reset after a delay
                    setTimeout(() => {
                        this.classList.remove('copied');
                        this.innerHTML = '<i class="fas fa-copy"></i> Copy';
                    }, 2000);
                })
                .catch(err => {
                    console.error('Failed to copy endpoint:', err);
                });
        });
    });
}

/**
 * Initialize form submission handlers
 */
function initFormHandlers() {
    // 1. Search Manuals Form
    const searchManualsForm = document.getElementById('search-manuals-form');
    if (searchManualsForm) {
        // Function to update the example code
        function updateSearchManualsExample() {
            const make = document.getElementById('search-make').value || "Toyota";
            const model = document.getElementById('search-model').value || "Camry";
            const manualType = document.getElementById('search-manual-type').value || "technical";
            
            // Create example request
            const exampleCode = 
`fetch('/api/manuals/search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    make: "${make}",
    model: "${model}",
    manual_type: "${manualType}"
  })
})
.then(response => response.json())
.then(data => console.log(data));`;
            
            // Find the example code container
            const exampleContainer = document.querySelector('#manuals-section .example-code pre code');
            if (exampleContainer) {
                exampleContainer.textContent = exampleCode;
                // Re-highlight code
                if (window.Prism) {
                    Prism.highlightElement(exampleContainer);
                }
            }
        }
        
        // Add input event listeners to form fields
        document.getElementById('search-make').addEventListener('input', updateSearchManualsExample);
        document.getElementById('search-model').addEventListener('input', updateSearchManualsExample);
        document.getElementById('search-manual-type').addEventListener('change', updateSearchManualsExample);
        
        // Initial update
        updateSearchManualsExample();
        
        searchManualsForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const make = document.getElementById('search-make').value;
            const model = document.getElementById('search-model').value;
            const manualType = document.getElementById('search-manual-type').value;
            
            const responseContainer = document.getElementById('search-manuals-response');
            responseContainer.innerHTML = '<div class="text-center"><div class="loading-spinner"></div><p class="mt-2">Searching for manuals...</p></div>';
            
            try {
                const response = await API.searchManuals({
                    make: make,
                    model: model,
                    manual_type: manualType
                });
                
                // Display formatted response
                displayResponse(responseContainer, response);
            } catch (error) {
                displayError(responseContainer, error);
            }
        });
    }
    
    // 2. List Manuals Form
    const listManualsForm = document.getElementById('list-manuals-form');
    if (listManualsForm) {
        // Function to update the example code
        function updateListManualsExample() {
            const page = document.getElementById('list-page').value || "1";
            const perPage = document.getElementById('list-per-page').value || "10";
            const make = document.getElementById('list-make').value || "";
            
            // Create base URL
            let url = `/api/manuals?page=${page}&per_page=${perPage}`;
            
            // Add make parameter if present
            if (make) {
                url += `&make=${make}`;
            }
            
            // Create example request
            const exampleCode = 
`fetch('${url}')
.then(response => response.json())
.then(data => console.log(data));`;
            
            // Find the example code container
            const exampleContainer = document.querySelector('#manuals-section .example-code:nth-of-type(2) pre code');
            if (exampleContainer) {
                exampleContainer.textContent = exampleCode;
                // Re-highlight code
                if (window.Prism) {
                    Prism.highlightElement(exampleContainer);
                }
            }
        }
        
        // Add input event listeners to form fields
        document.getElementById('list-page').addEventListener('input', updateListManualsExample);
        document.getElementById('list-per-page').addEventListener('input', updateListManualsExample);
        document.getElementById('list-make').addEventListener('input', updateListManualsExample);
        
        // Initial update
        updateListManualsExample();
        
        listManualsForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const page = document.getElementById('list-page').value;
            const perPage = document.getElementById('list-per-page').value;
            const make = document.getElementById('list-make').value;
            
            const params = {
                page: page,
                per_page: perPage
            };
            
            if (make) {
                params.make = make;
            }
            
            const responseContainer = document.getElementById('list-manuals-response');
            responseContainer.innerHTML = '<div class="text-center"><div class="loading-spinner"></div><p class="mt-2">Fetching manuals...</p></div>';
            
            try {
                const response = await API.getManuals(params);
                
                // Display formatted response
                displayResponse(responseContainer, response);
            } catch (error) {
                displayError(responseContainer, error);
            }
        });
    }
    
    // 3. Process Manual Form
    const processManualForm = document.getElementById('process-manual-form');
    if (processManualForm) {
        // Function to update the example code
        function updateProcessManualExample() {
            const manualId = document.getElementById('process-manual-id').value || "1";
            
            // Create example request
            const exampleCode = 
`fetch('/api/manuals/${manualId}/process', {
  method: 'POST'
})
.then(response => response.json())
.then(data => console.log(data));`;
            
            // Find the example code container
            const exampleContainer = document.querySelector('#manuals-section .example-code:nth-of-type(3) pre code');
            if (exampleContainer) {
                exampleContainer.textContent = exampleCode;
                // Re-highlight code
                if (window.Prism) {
                    Prism.highlightElement(exampleContainer);
                }
            }
        }
        
        // Add input event listeners to form fields
        document.getElementById('process-manual-id').addEventListener('input', updateProcessManualExample);
        
        // Initial update
        updateProcessManualExample();
        
        processManualForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const manualId = document.getElementById('process-manual-id').value;
            
            const responseContainer = document.getElementById('process-manual-response');
            responseContainer.innerHTML = '<div class="text-center"><div class="loading-spinner"></div><p class="mt-2">Processing manual...</p></div>';
            
            try {
                const response = await API.processManual(manualId);
                
                // Check if we have comprehensive results to display in a more structured way
                if (response.success && response.data && 
                   (response.data.common_problems || 
                    response.data.maintenance_procedures || 
                    response.data.safety_warnings)) {
                    
                    // Display enhanced UI for comprehensive results
                    displayEnhancedProcessingResults(responseContainer, response);
                } else {
                    // Fall back to standard JSON display
                    displayResponse(responseContainer, response);
                }
            } catch (error) {
                displayError(responseContainer, error);
            }
        });
    }
    
    // 4. Extract Manual Components Form (New in v10)
    const extractComponentsForm = document.getElementById('extract-components-form');
    if (extractComponentsForm) {
        // Function to update the example code
        function updateExtractComponentsExample() {
            const manualId = document.getElementById('components-manual-id').value || "1";
            
            // Create example request
            const exampleCode = 
`fetch('/api/manuals/${manualId}/components')
.then(response => response.json())
.then(data => console.log(data));`;
            
            // Find the example code container
            const exampleContainer = document.querySelector('#manuals-section .example-code:nth-of-type(4) pre code');
            if (exampleContainer) {
                exampleContainer.textContent = exampleCode;
                // Re-highlight code
                if (window.Prism) {
                    Prism.highlightElement(exampleContainer);
                }
            }
        }
        
        // Add input event listeners to form fields
        document.getElementById('components-manual-id').addEventListener('input', updateExtractComponentsExample);
        
        // Initial update
        updateExtractComponentsExample();
        
        extractComponentsForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const manualId = document.getElementById('components-manual-id').value;
            
            const responseContainer = document.getElementById('extract-components-response');
            responseContainer.innerHTML = '<div class="text-center"><div class="loading-spinner"></div><p class="mt-2">Extracting manual components using GPT-4.1-Nano...</p></div>';
            
            try {
                // Use the real API endpoint to get manual components
                const response = await API.getManualComponents(manualId);
                
                // Check if we have components to display in an enhanced UI
                if (response.success && response.data && response.data.components) {
                    // Display enhanced UI for manual components
                    displayManualComponentsResults(responseContainer, response);
                } else {
                    // Fall back to standard JSON display
                    displayResponse(responseContainer, response);
                }
            } catch (error) {
                displayError(responseContainer, error);
            }
        });
    }
    
    // 5. Process Manual Components with Custom Prompt Form (New in v10)
    const processComponentsForm = document.getElementById('process-components-form');
    if (processComponentsForm) {
        // Function to update the example code
        function updateProcessComponentsExample() {
            const manualId = document.getElementById('process-components-manual-id').value || "1";
            const focus = document.getElementById('process-components-focus').value;
            let customPrompt = document.getElementById('process-components-prompt').value;
            
            // Set default custom prompt based on focus if none provided
            if (!customPrompt && focus) {
                if (focus === 'mechanical') {
                    customPrompt = "Focus on extracting detailed mechanical component information including materials, tolerances, and assembly instructions";
                } else if (focus === 'electrical') {
                    customPrompt = "Focus on extracting electrical system information including wiring diagrams, circuit descriptions, and electrical specifications";
                } else if (focus === 'diagnostic') {
                    customPrompt = "Focus on extracting diagnostic procedures including troubleshooting steps, testing methods, and decision flows";
                }
            } else if (!customPrompt) {
                customPrompt = "Focus on extracting detailed mechanical component information...";
            }
            
            // Create example request
            const exampleCode = 
`fetch('/api/manuals/${manualId}/process-components', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    prompt: "${customPrompt}"
  })
})
.then(response => response.json())
.then(data => console.log(data));`;
            
            // Find the example code container
            const exampleContainer = document.querySelector('#manuals-section .example-code:nth-of-type(5) pre code');
            if (exampleContainer) {
                exampleContainer.textContent = exampleCode;
                // Re-highlight code
                if (window.Prism) {
                    Prism.highlightElement(exampleContainer);
                }
            }
        }
        
        // Add input event listeners to form fields
        document.getElementById('process-components-manual-id').addEventListener('input', updateProcessComponentsExample);
        document.getElementById('process-components-focus').addEventListener('change', updateProcessComponentsExample);
        document.getElementById('process-components-prompt').addEventListener('input', updateProcessComponentsExample);
        
        // Update prompt field when focus is selected
        document.getElementById('process-components-focus').addEventListener('change', function() {
            const focus = this.value;
            const promptField = document.getElementById('process-components-prompt');
            
            // Only update if the prompt field is empty or has a standard value
            if (!promptField.value || promptField.value.startsWith("Focus on extracting")) {
                if (focus === 'mechanical') {
                    promptField.value = "Focus on extracting detailed mechanical component information including materials, tolerances, and assembly instructions";
                } else if (focus === 'electrical') {
                    promptField.value = "Focus on extracting electrical system information including wiring diagrams, circuit descriptions, and electrical specifications";
                } else if (focus === 'diagnostic') {
                    promptField.value = "Focus on extracting diagnostic procedures including troubleshooting steps, testing methods, and decision flows";
                } else {
                    promptField.value = "";
                }
            }
            
            // Update example code
            updateProcessComponentsExample();
        });
        
        // Initial update
        updateProcessComponentsExample();
        
        processComponentsForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const manualId = document.getElementById('process-components-manual-id').value;
            const customPrompt = document.getElementById('process-components-prompt').value;
            
            const responseContainer = document.getElementById('extract-components-response');
            responseContainer.innerHTML = '<div class="text-center"><div class="loading-spinner"></div><p class="mt-2">Processing manual components with custom prompt using GPT-4.1-Nano...</p></div>';
            
            try {
                // Use the custom prompt API endpoint
                const response = await API.processManualComponents(manualId, {
                    prompt: customPrompt
                });
                
                // Check if we have components to display in an enhanced UI
                if (response.success && response.data && response.data.components) {
                    // Display enhanced UI for manual components
                    displayManualComponentsResults(responseContainer, response);
                } else {
                    // Fall back to standard JSON display
                    displayResponse(responseContainer, response);
                }
            } catch (error) {
                displayError(responseContainer, error);
            }
        });
    }
    
    // 5. Resolve Part Form
    const resolvePartForm = document.getElementById('resolve-part-form');
    if (resolvePartForm) {
        // Update example request based on form changes
        function updateExampleRequest() {
            const description = document.getElementById('part-description').value || "Air filter";
            const make = document.getElementById('part-make').value || "Toyota";
            const model = document.getElementById('part-model').value || "Camry";
            const year = document.getElementById('part-year').value || "2020";
            
            // Get toggle states
            const useDatabase = document.getElementById('search-db-toggle').checked;
            const useManualSearch = document.getElementById('search-manual-toggle').checked;
            const useWebSearch = document.getElementById('search-web-toggle').checked;
            const saveResults = document.getElementById('save-results-toggle').checked;
            
            // Create example request body
            const exampleData = {
                description: description,
                make: make,
                model: model,
                year: year,
                use_database: useDatabase,
                use_manual_search: useManualSearch,
                use_web_search: useWebSearch,
                save_results: saveResults
            };
            
            // Format the example request
            const exampleCode = 
`fetch('/api/parts/resolve', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(${JSON.stringify(exampleData, null, 4)})
})
.then(response => response.json())
.then(data => console.log(data));`;
            
            // Update the example code in the UI
            const exampleContainer = document.querySelector('#parts-section .example-code pre code');
            if (exampleContainer) {
                exampleContainer.textContent = exampleCode;
                // Re-highlight the code
                if (window.Prism) {
                    Prism.highlightElement(exampleContainer);
                }
            }
        }
        
        // Add change event listeners to all form fields to update example
        document.getElementById('part-description').addEventListener('input', updateExampleRequest);
        document.getElementById('part-make').addEventListener('input', updateExampleRequest);
        document.getElementById('part-model').addEventListener('input', updateExampleRequest);
        document.getElementById('part-year').addEventListener('input', updateExampleRequest);
        document.getElementById('search-db-toggle').addEventListener('change', updateExampleRequest);
        document.getElementById('search-manual-toggle').addEventListener('change', updateExampleRequest);
        document.getElementById('search-web-toggle').addEventListener('change', updateExampleRequest);
        document.getElementById('save-results-toggle').addEventListener('change', updateExampleRequest);
        
        // Initial update of example request
        updateExampleRequest();
        
        // Handle form submission
        resolvePartForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const description = document.getElementById('part-description').value;
            const make = document.getElementById('part-make').value;
            const model = document.getElementById('part-model').value;
            const year = document.getElementById('part-year').value;
            
            // Get toggle states
            const useDatabase = document.getElementById('search-db-toggle').checked;
            const useManualSearch = document.getElementById('search-manual-toggle').checked;
            const useWebSearch = document.getElementById('search-web-toggle').checked;
            const saveResults = document.getElementById('save-results-toggle').checked;
            
            const data = {
                description: description,
                make: make,
                model: model,
                use_database: useDatabase,
                use_manual_search: useManualSearch,
                use_web_search: useWebSearch,
                save_results: saveResults
            };
            
            if (year) {
                data.year = year;
            }
            
            const responseContainer = document.getElementById('resolve-part-response');
            responseContainer.innerHTML = '<div class="text-center"><div class="loading-spinner"></div><p class="mt-2">Resolving part...</p></div>';
            
            try {
                const response = await API.resolvePart(data);
                
                // Check if we have the new part resolution format
                if (response.success && response.part_resolution) {
                    // Display enhanced UI for part resolution
                    displayPartResolutionResults(responseContainer, response);
                } else {
                    // Fall back to standard JSON display
                    displayResponse(responseContainer, response);
                }
            } catch (error) {
                displayError(responseContainer, error);
            }
        });
    }
    
    // 5. Search Suppliers Form
    const searchSuppliersForm = document.getElementById('search-suppliers-form');
    if (searchSuppliersForm) {
        // Function to update the example code
        function updateSearchSuppliersExample() {
            const partNumber = document.getElementById('supplier-part-number').value || "17801-0H080";
            const make = document.getElementById('supplier-make').value || "Toyota";
            const model = document.getElementById('supplier-model').value || "Camry";
            const oemOnly = document.getElementById('oem-only').checked;
            
            // Create data object
            const data = {
                part_number: partNumber,
                oem_only: oemOnly
            };
            
            if (make) {
                data.make = make;
            }
            
            if (model) {
                data.model = model;
            }
            
            // Create example request
            const exampleCode = 
`fetch('/api/suppliers/search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(${JSON.stringify(data, null, 2)})
})
.then(response => response.json())
.then(data => console.log(data));`;
            
            // Find the example code container
            const exampleContainer = document.querySelector('#suppliers-section .example-code pre code');
            if (exampleContainer) {
                exampleContainer.textContent = exampleCode;
                // Re-highlight code
                if (window.Prism) {
                    Prism.highlightElement(exampleContainer);
                }
            }
        }
        
        // Add input event listeners to form fields
        document.getElementById('supplier-part-number').addEventListener('input', updateSearchSuppliersExample);
        document.getElementById('supplier-make').addEventListener('input', updateSearchSuppliersExample);
        document.getElementById('supplier-model').addEventListener('input', updateSearchSuppliersExample);
        document.getElementById('oem-only').addEventListener('change', updateSearchSuppliersExample);
        
        // Initial update
        updateSearchSuppliersExample();
        
        searchSuppliersForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const partNumber = document.getElementById('supplier-part-number').value;
            const make = document.getElementById('supplier-make').value;
            const model = document.getElementById('supplier-model').value;
            const oemOnly = document.getElementById('oem-only').checked;
            
            const data = {
                part_number: partNumber,
                oem_only: oemOnly
            };
            
            if (make) {
                data.make = make;
            }
            
            if (model) {
                data.model = model;
            }
            
            const responseContainer = document.getElementById('search-suppliers-response');
            responseContainer.innerHTML = '<div class="text-center"><div class="loading-spinner"></div><p class="mt-2">Searching for suppliers...</p></div>';
            
            try {
                const response = await API.searchSuppliers(data);
                
                // Display formatted response
                displayResponse(responseContainer, response);
            } catch (error) {
                displayError(responseContainer, error);
            }
        });
    }
    
    // 6. Create Profile Form
    const createProfileForm = document.getElementById('create-profile-form');
    if (createProfileForm) {
        // Function to update the example code
        function updateCreateProfileExample() {
            // Get values with defaults for the example
            const profileName = document.getElementById('profile-name').value || "Personal Account";
            const billingName = document.getElementById('billing-name').value || "John Doe";
            const address1 = document.getElementById('billing-address1').value || "123 Main St";
            const city = document.getElementById('billing-city').value || "Anytown";
            const state = document.getElementById('billing-state').value || "CA";
            const zip = document.getElementById('billing-zip').value || "12345";
            const phone = document.getElementById('billing-phone').value || "555-123-4567";
            
            // Create example data
            const exampleData = {
                name: profileName,
                billing_address: {
                    name: billingName,
                    address1: address1,
                    city: city,
                    state: state,
                    zip: zip,
                    phone: phone
                },
                payment_info: {
                    card_number: "4111111111111111",
                    name: billingName,
                    exp_month: "12",
                    exp_year: "2025",
                    cvv: "123"
                }
            };
            
            // Create example request
            const exampleCode = 
`fetch('/api/profiles', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(${JSON.stringify(exampleData, null, 2)})
})
.then(response => response.json())
.then(data => console.log(data));`;
            
            // Find the example code container
            const exampleContainer = document.querySelector('#profiles-section .example-code pre code');
            if (exampleContainer) {
                exampleContainer.textContent = exampleCode;
                // Re-highlight code
                if (window.Prism) {
                    Prism.highlightElement(exampleContainer);
                }
            }
        }
        
        // Add input event listeners to form fields for real-time updates
        document.getElementById('profile-name').addEventListener('input', updateCreateProfileExample);
        document.getElementById('billing-name').addEventListener('input', updateCreateProfileExample);
        document.getElementById('billing-address1').addEventListener('input', updateCreateProfileExample);
        document.getElementById('billing-city').addEventListener('input', updateCreateProfileExample);
        document.getElementById('billing-state').addEventListener('input', updateCreateProfileExample);
        document.getElementById('billing-zip').addEventListener('input', updateCreateProfileExample);
        document.getElementById('billing-phone').addEventListener('input', updateCreateProfileExample);
        
        // Initial update
        updateCreateProfileExample();
        
        createProfileForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            // Profile name
            const profileName = document.getElementById('profile-name').value;
            
            // Billing address
            const billingAddress = {
                name: document.getElementById('billing-name').value,
                address1: document.getElementById('billing-address1').value,
                address2: document.getElementById('billing-address2').value || '',
                city: document.getElementById('billing-city').value,
                state: document.getElementById('billing-state').value,
                zip: document.getElementById('billing-zip').value,
                phone: document.getElementById('billing-phone').value
            };
            
            // Payment info
            const paymentInfo = {
                card_number: document.getElementById('payment-card-number').value,
                name: document.getElementById('payment-name').value,
                exp_month: document.getElementById('payment-exp-month').value,
                exp_year: document.getElementById('payment-exp-year').value,
                cvv: document.getElementById('payment-cvv').value
            };
            
            // Combine data
            const profileData = {
                name: profileName,
                billing_address: billingAddress,
                payment_info: paymentInfo,
                shipping_address: billingAddress // Use same address for shipping
            };
            
            const responseContainer = document.getElementById('create-profile-response');
            responseContainer.innerHTML = '<div class="text-center"><div class="loading-spinner"></div><p class="mt-2">Creating profile...</p></div>';
            
            try {
                const response = await API.createProfile(profileData);
                
                // Display formatted response
                displayResponse(responseContainer, response);
                
                if (response.success) {
                    // Show success message above the response
                    const successAlert = document.createElement('div');
                    successAlert.className = 'alert alert-success mb-3';
                    successAlert.innerHTML = `
                        <i class="fas fa-check-circle me-2"></i>
                        Profile created successfully! Profile ID: ${response.data.id}
                    `;
                    responseContainer.parentNode.insertBefore(successAlert, responseContainer);
                    
                    // Reset the form
                    createProfileForm.reset();
                    
                    // Refresh the profiles list if available
                    const loadProfilesBtn = document.getElementById('load-profiles-btn');
                    if (loadProfilesBtn) {
                        // Wait a moment to ensure the profile is saved in the database
                        setTimeout(() => {
                            loadProfilesBtn.click();
                        }, 500);
                    }
                    
                    // Auto-remove the success message after 10 seconds
                    setTimeout(() => {
                        successAlert.classList.add('fade');
                        setTimeout(() => {
                            if (successAlert.parentNode) {
                                successAlert.parentNode.removeChild(successAlert);
                            }
                        }, 500);
                    }, 10000);
                }
            } catch (error) {
                displayError(responseContainer, error);
            }
        });
    }
    
    // 7. Create Purchase Form
    const createPurchaseForm = document.getElementById('create-purchase-form');
    if (createPurchaseForm) {
        // Function to update the example code
        function updateCreatePurchaseExample() {
            // Get values with defaults for the example
            const partNumber = document.getElementById('purchase-part-number').value || "17801-0H080";
            const quantity = document.getElementById('purchase-quantity').value || "1";
            const supplierUrl = document.getElementById('purchase-supplier-url').value || "https://www.example.com/product/17801-0H080";
            const profileId = document.getElementById('purchase-profile-id').value || "1";
            
            // Create example data
            const purchaseData = {
                part_number: partNumber,
                quantity: parseInt(quantity),
                supplier_url: supplierUrl,
                billing_profile_id: parseInt(profileId)
            };
            
            // Create example request
            const exampleCode = 
`fetch('/api/purchases', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(${JSON.stringify(purchaseData, null, 2)})
})
.then(response => response.json())
.then(data => console.log(data));`;
            
            // Find the example code container
            const exampleContainer = document.querySelector('#purchases-section .example-code pre code');
            if (exampleContainer) {
                exampleContainer.textContent = exampleCode;
                // Re-highlight code
                if (window.Prism) {
                    Prism.highlightElement(exampleContainer);
                }
            }
        }
        
        // Add input event listeners to form fields for real-time updates
        document.getElementById('purchase-part-number').addEventListener('input', updateCreatePurchaseExample);
        document.getElementById('purchase-quantity').addEventListener('input', updateCreatePurchaseExample);
        document.getElementById('purchase-supplier-url').addEventListener('input', updateCreatePurchaseExample);
        document.getElementById('purchase-profile-id').addEventListener('input', updateCreatePurchaseExample);
        
        // Initial update
        updateCreatePurchaseExample();
        
        createPurchaseForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const partNumber = document.getElementById('purchase-part-number').value;
            const quantity = document.getElementById('purchase-quantity').value;
            const supplierUrl = document.getElementById('purchase-supplier-url').value;
            const profileId = document.getElementById('purchase-profile-id').value;
            
            const purchaseData = {
                part_number: partNumber,
                quantity: parseInt(quantity),
                supplier_url: supplierUrl,
                billing_profile_id: parseInt(profileId)
            };
            
            const responseContainer = document.getElementById('create-purchase-response');
            responseContainer.innerHTML = '<div class="text-center"><div class="loading-spinner"></div><p class="mt-2">Creating purchase...</p></div>';
            
            try {
                const response = await API.createPurchase(purchaseData);
                
                // Display formatted response
                displayResponse(responseContainer, response);
            } catch (error) {
                displayError(responseContainer, error);
            }
        });
    }
}

/**
 * Display formatted response in container
 * @param {HTMLElement} container - Response container element
 * @param {Object} response - API response
 */
function displayResponse(container, response) {
    // Set container class based on response success
    container.className = 'response-container';
    container.classList.add(response.success ? 'success' : 'error');
    
    // Check if this is a supplier search response to add enhanced UI
    if (response.data && response.data.suppliers && container.id === 'search-suppliers-response') {
        // Create a more interactive display for supplier search results
        const suppliers = response.data.suppliers;
        const partNumber = response.data.part_number;
        const count = response.data.count;
        
        // Display initial summary
        let content = `
            <div class="alert alert-success mb-3">
                <h5>Found ${count} suppliers for part: ${partNumber}</h5>
            </div>
            <div class="search-results mb-4">
        `;
        
        // Add each supplier with action buttons
        suppliers.forEach((supplier, index) => {
            content += `
                <div class="card mb-2 search-result-item">
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-2 text-center">
                                ${supplier.thumbnail ? `<img src="${supplier.thumbnail}" alt="${supplier.name}" class="img-fluid mb-2" style="max-height: 60px;">` : 
                                `<div class="border rounded p-2 text-center"><i class="fas fa-store fa-2x text-secondary"></i></div>`}
                            </div>
                            <div class="col-md-7">
                                <h5 class="card-title">${supplier.name || 'Unnamed Supplier'}</h5>
                                <p class="card-text">${supplier.title || partNumber}</p>
                                <div>
                                    <span class="badge ${supplier.in_stock ? 'bg-success' : 'bg-danger'} me-2">
                                        ${supplier.in_stock ? 'In Stock' : 'Out of Stock'}
                                    </span>
                                    <span class="badge bg-primary">${supplier.price || 'Price not available'}</span>
                                </div>
                            </div>
                            <div class="col-md-3 d-flex flex-column justify-content-center align-items-end">
                                ${supplier.url ? `
                                <a href="${supplier.url}" target="_blank" class="btn btn-sm btn-outline-primary mb-2 w-100">
                                    <i class="fas fa-external-link-alt me-1"></i>Visit Store
                                </a>` : ''}
                                <button class="btn btn-sm btn-outline-success w-100 use-for-purchase" 
                                    data-supplier-name="${supplier.name || 'Unnamed Supplier'}"
                                    data-supplier-url="${supplier.url || ''}">
                                    <i class="fas fa-shopping-cart me-1"></i>Buy Part
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        content += `</div>`;
        
        // Add raw response toggle
        content += `
            <div class="d-grid gap-2 mb-3">
                <button class="btn btn-sm btn-outline-secondary" id="toggle-raw-suppliers-response">
                    <i class="fas fa-code me-1"></i>Toggle Raw JSON Response
                </button>
            </div>
            <div class="raw-response" style="display: none;">
                <pre>${formatJsonSyntax(API.formatResponse(response))}</pre>
            </div>
        `;
        
        // Set content and add event listeners
        container.innerHTML = content;
        
        // Toggle raw response
        document.getElementById('toggle-raw-suppliers-response').addEventListener('click', function() {
            const rawResponse = container.querySelector('.raw-response');
            rawResponse.style.display = rawResponse.style.display === 'none' ? 'block' : 'none';
            this.innerHTML = rawResponse.style.display === 'none' ? 
                '<i class="fas fa-code me-1"></i>Toggle Raw JSON Response' : 
                '<i class="fas fa-code me-1"></i>Hide Raw JSON Response';
        });
        
        // Add listeners for "Buy Part" buttons
        document.querySelectorAll('.use-for-purchase').forEach(button => {
            button.addEventListener('click', function() {
                const supplierName = this.getAttribute('data-supplier-name');
                const supplierUrl = this.getAttribute('data-supplier-url');
                
                if (!supplierUrl) {
                    alert('No URL available for this supplier.');
                    return;
                }
                
                // Navigate to the purchase section
                document.querySelector('a[href="#purchases-section"]').click();
                
                // Fill in the purchase form
                document.getElementById('purchase-part-number').value = partNumber;
                document.getElementById('purchase-supplier-url').value = supplierUrl;
                
                // Show a message to the user
                alert(`Ready to purchase ${partNumber} from ${supplierName}. Please review the purchase information and complete the form.`);
                
                // Scroll to the purchase form
                document.getElementById('create-purchase-form').scrollIntoView({
                    behavior: 'smooth'
                });
            });
        });
    }
    // Check if this is a manual search response to add enhanced UI
    else if (response.data && response.data.results && container.id === 'search-manuals-response') {
        // Create a more interactive display for manual search results
        const searchResults = response.data.results;
        
        // Display initial summary
        let content = `
            <div class="alert alert-success mb-3">
                <h5>Found ${searchResults.length} ${response.data.type || ''} manuals for ${response.data.make} ${response.data.model}</h5>
            </div>
            <div class="search-results mb-4">
        `;
        
        // Add each manual with action buttons
        searchResults.forEach((manual, index) => {
            content += `
                <div class="card mb-2 search-result-item">
                    <div class="card-body">
                        <h5 class="card-title">${manual.title}</h5>
                        <p class="card-text">${manual.snippet || 'No description available'}</p>
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <span class="badge bg-primary me-2">${manual.file_format || 'PDF'}</span>
                                <span class="badge bg-secondary">${manual.make} ${manual.model}</span>
                            </div>
                            <div>
                                <a href="${manual.url}" target="_blank" class="btn btn-sm btn-outline-primary">
                                    <i class="fas fa-external-link-alt me-1"></i>View Original
                                </a>
                                <button class="btn btn-sm btn-outline-success use-for-processing" 
                                    data-manual-title="${manual.title}"
                                    data-manual-url="${manual.url}">
                                    <i class="fas fa-cog me-1"></i>Save & Process
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        content += `</div>`;
        
        // Add raw response toggle
        content += `
            <div class="d-grid gap-2 mb-3">
                <button class="btn btn-sm btn-outline-secondary" id="toggle-raw-response">
                    <i class="fas fa-code me-1"></i>Toggle Raw JSON Response
                </button>
            </div>
            <div class="raw-response" style="display: none;">
                <pre>${formatJsonSyntax(API.formatResponse(response))}</pre>
            </div>
        `;
        
        // Set content and add event listeners
        container.innerHTML = content;
        
        // Toggle raw response
        document.getElementById('toggle-raw-response').addEventListener('click', function() {
            const rawResponse = container.querySelector('.raw-response');
            rawResponse.style.display = rawResponse.style.display === 'none' ? 'block' : 'none';
            this.innerHTML = rawResponse.style.display === 'none' ? 
                '<i class="fas fa-code me-1"></i>Toggle Raw JSON Response' : 
                '<i class="fas fa-code me-1"></i>Hide Raw JSON Response';
        });
        
        // Add listeners for "Save & Process" buttons
        document.querySelectorAll('.use-for-processing').forEach(button => {
            button.addEventListener('click', async function() {
                const title = this.getAttribute('data-manual-title');
                const url = this.getAttribute('data-manual-url');
                
                // Create a new manual entry first
                try {
                    const createResponse = await API.createManual({
                        title: title,
                        make: response.data.make,
                        model: response.data.model,
                        url: url,
                        file_format: 'PDF'
                    });
                    
                    if (createResponse.success) {
                        // Auto-navigate to the process section
                        document.querySelector('a[href="#manuals-section"]').click();
                        
                        // Get the created manual ID
                        const manualId = createResponse.data.id;
                        
                        // Focus the process form and fill in the ID
                        const processIdInput = document.getElementById('process-manual-id');
                        processIdInput.value = manualId;
                        
                        // Show a success message
                        alert(`Manual saved with ID ${manualId}. You can now process it using the "Process Manual" form.`);
                        
                        // Optional: Scroll to the process section
                        document.getElementById('process-manual-form').scrollIntoView({
                            behavior: 'smooth'
                        });
                    } else {
                        alert('Failed to save manual: ' + (createResponse.error || 'Unknown error'));
                    }
                } catch (error) {
                    alert('Error saving manual: ' + error.message);
                }
            });
        });
    } else {
        // Format response as pretty JSON for all other responses
        const formattedResponse = API.formatResponse(response);
        
        // Apply syntax highlighting to JSON
        const highlightedJson = formatJsonSyntax(formattedResponse);
        
        // Add formatted response to container
        container.innerHTML = `<pre>${highlightedJson}</pre>`;
    }
}

/**
 * Apply syntax highlighting to JSON string
 * @param {string} jsonString - JSON string to format
 * @returns {string} - HTML with syntax highlighting
 */
function formatJsonSyntax(jsonString) {
    // Simple JSON syntax highlighter
    return jsonString
        .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
        .replace(/"([^"]*)"/g, '<span class="json-string">"$1"</span>')
        .replace(/\b(true|false)\b/g, '<span class="json-boolean">$1</span>')
        .replace(/\b(null)\b/g, '<span class="json-null">$1</span>')
        .replace(/\b(\d+\.?\d*)\b/g, '<span class="json-number">$1</span>');
}

/**
 * Display enhanced processing results in a more structured, user-friendly format
 * @param {HTMLElement} container - Response container element
 * @param {Object} response - API response with comprehensive manual processing results
 */
function displayEnhancedProcessingResults(container, response) {
    // Extract data
    const data = response.data;
    
    // Set container class
    container.className = 'response-container success';
    
    // Build structured UI with focus on the three key areas
    let content = `
        <div class="alert alert-success mb-3">
            <h5><i class="fas fa-check-circle me-2"></i>${data.message}</h5>
            <div class="d-flex justify-content-between align-items-center">
                <p class="mb-0"><strong>Manual Subject:</strong> ${data.manual_subject}</p>
                <span class="badge bg-primary">v5 Processing</span>
            </div>
        </div>
        
        <div class="row mb-3">
            <div class="col-md-4">
                <div class="card text-white bg-danger">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h5 class="mb-0"><i class="fas fa-exclamation-circle me-2"></i>Error Codes</h5>
                        <span class="badge bg-light text-danger">${data.error_codes_count}</span>
                    </div>
                    <div class="card-body bg-light text-dark">
                        <p class="card-text">Found ${data.error_codes_count} error codes in this manual</p>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card text-white bg-primary">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h5 class="mb-0"><i class="fas fa-tools me-2"></i>Part Numbers</h5>
                        <span class="badge bg-light text-primary">${data.part_numbers_count}</span>
                    </div>
                    <div class="card-body bg-light text-dark">
                        <p class="card-text">Identified ${data.part_numbers_count} part numbers in this manual</p>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card text-white bg-warning">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h5 class="mb-0"><i class="fas fa-exclamation-triangle me-2"></i>Common Problems</h5>
                        <span class="badge bg-light text-warning">${data.common_problems ? data.common_problems.length : 0}</span>
                    </div>
                    <div class="card-body bg-light text-dark">
                        <p class="card-text">Found ${data.common_problems ? data.common_problems.length : 0} common issues and solutions</p>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="accordion" id="processingResultsAccordion">
    `;
    
    // Add Error Codes section - Always show this, even if empty
    content += `
        <div class="accordion-item">
            <h2 class="accordion-header" id="headingErrors">
                <button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#collapseErrors" aria-expanded="true" aria-controls="collapseErrors">
                    <i class="fas fa-exclamation-circle me-2"></i>Error Codes (${data.error_codes_count})
                </button>
            </h2>
            <div id="collapseErrors" class="accordion-collapse collapse show" aria-labelledby="headingErrors" data-bs-parent="#processingResultsAccordion">
                <div class="accordion-body">
    `;

    if (data.error_codes && data.error_codes.length > 0) {
        content += `<div class="table-responsive"><table class="table table-striped table-hover">
            <thead class="table-dark">
                <tr>
                    <th>Error Code</th>
                    <th>Description</th>
                </tr>
            </thead>
            <tbody>`;
        
        // Sort error codes alphabetically for better readability
        const sortedErrors = [...data.error_codes].sort((a, b) => 
            (a['Error Code Number'] || a.code).localeCompare(b['Error Code Number'] || b.code)
        );
        
        sortedErrors.forEach(error => {
            // Use standardized field names if available, fall back to original
            const errorCode = error['Error Code Number'] || error.code;
            // Limit description length for display
            let description = error['Short Error Description'] || error.description || 'No description available';
            if (description.length > 300) {
                description = description.substring(0, 300) + '...';
            }
            
            content += `
                <tr>
                    <td><span class="badge bg-danger">${errorCode}</span></td>
                    <td>${description}</td>
                </tr>
            `;
        });
        
        content += `</tbody></table></div>`;
        
        // Add export button for error codes
        content += `
            <div class="d-grid gap-2 mt-2">
                <button class="btn btn-sm btn-outline-danger export-error-codes">
                    <i class="fas fa-file-download me-2"></i>Export Error Codes Only
                </button>
            </div>
        `;
    } else {
        content += `<div class="alert alert-info">No error codes were found in this manual.</div>`;
    }
    
    content += `
                </div>
            </div>
        </div>
    `;
    
    // Add Part Numbers section - Always show this, even if empty
    content += `
        <div class="accordion-item">
            <h2 class="accordion-header" id="headingParts">
                <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseParts" aria-expanded="false" aria-controls="collapseParts">
                    <i class="fas fa-tools me-2"></i>Part Numbers (${data.part_numbers_count})
                </button>
            </h2>
            <div id="collapseParts" class="accordion-collapse collapse" aria-labelledby="headingParts" data-bs-parent="#processingResultsAccordion">
                <div class="accordion-body">
    `;
    
    if (data.part_numbers && data.part_numbers.length > 0) {
        content += `<div class="table-responsive"><table class="table table-striped table-hover">
            <thead class="table-primary">
                <tr>
                    <th width="30%">Part Number</th>
                    <th width="70%">Description</th>
                </tr>
            </thead>
            <tbody>`;
        
        // Sort part numbers alphabetically for easier reference
        const sortedParts = [...data.part_numbers].sort((a, b) => 
            (a['OEM Part Number'] || a.code).localeCompare(b['OEM Part Number'] || b.code)
        );
        
        sortedParts.forEach(part => {
            // Use standardized field names if available, fall back to original
            const partNumber = part['OEM Part Number'] || part.code;
            // Limit description length for display
            let description = part['Short Part Description'] || part.description || 'No description available';
            if (description.length > 300) {
                description = description.substring(0, 300) + '...';
            }
            
            content += `
                <tr>
                    <td><span class="badge bg-primary">${partNumber}</span></td>
                    <td>${description}</td>
                </tr>
            `;
        });
        
        content += `</tbody></table></div>`;
        
        // Add search and filter options for part numbers
        content += `
            <div class="row mt-2">
                <div class="col-md-8">
                    <div class="input-group">
                        <input type="text" class="form-control form-control-sm" id="part-search" placeholder="Search part numbers...">
                        <button class="btn btn-sm btn-outline-primary" id="part-search-btn">
                            <i class="fas fa-search"></i>
                        </button>
                    </div>
                </div>
                <div class="col-md-4">
                    <button class="btn btn-sm btn-outline-primary w-100 export-parts">
                        <i class="fas fa-file-download me-2"></i>Export Parts Only
                    </button>
                </div>
            </div>
        `;
    } else {
        content += `<div class="alert alert-info">No part numbers were found in this manual.</div>`;
    }
    
    content += `
                </div>
            </div>
        </div>
    `;
    
    // Add Common Problems section if available
    content += `
        <div class="accordion-item">
            <h2 class="accordion-header" id="headingProblems">
                <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseProblems" aria-expanded="false" aria-controls="collapseProblems">
                    <i class="fas fa-exclamation-triangle me-2"></i>Common Problems (${data.common_problems ? data.common_problems.length : 0})
                </button>
            </h2>
            <div id="collapseProblems" class="accordion-collapse collapse" aria-labelledby="headingProblems" data-bs-parent="#processingResultsAccordion">
                <div class="accordion-body">
    `;
    
    if (data.common_problems && data.common_problems.length > 0) {
        content += `<div class="list-group">`;
        
        data.common_problems.forEach((problem, index) => {
            content += `
                <div class="list-group-item list-group-item-action">
                    <div class="d-flex w-100 justify-content-between">
                        <h5 class="mb-1 text-warning"><i class="fas fa-exclamation-triangle me-2"></i>${problem.issue || 'Unknown Issue'}</h5>
                    </div>
                    <p class="mb-1 mt-2">${problem.solution || 'No solution provided'}</p>
                </div>
            `;
        });
        
        content += `</div>`;
    } else {
        content += `<div class="alert alert-info">No common problems were found in this manual.</div>`;
    }
    
    content += `
                </div>
            </div>
        </div>
    `;
    
    // Add additional sections in a collapsed card
    content += `
        <div class="card mt-3">
            <div class="card-header">
                <button class="btn btn-sm btn-outline-secondary w-100" type="button" data-bs-toggle="collapse" data-bs-target="#additionalInfo">
                    <i class="fas fa-info-circle me-2"></i>Additional Information
                </button>
            </div>
            <div class="collapse" id="additionalInfo">
                <div class="card-body">
                    <div class="row">
    `;
    
    // Add Maintenance Procedures if available
    if (data.maintenance_procedures && data.maintenance_procedures.length > 0) {
        content += `
            <div class="col-md-6 mb-3">
                <div class="card h-100">
                    <div class="card-header bg-info text-white">
                        <h5 class="mb-0"><i class="fas fa-tools me-2"></i>Maintenance Procedures</h5>
                    </div>
                    <div class="card-body">
                        <ol class="list-group list-group-numbered">
        `;
        
        data.maintenance_procedures.forEach((procedure) => {
            content += `<li class="list-group-item">${procedure}</li>`;
        });
        
        content += `
                        </ol>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Add Safety Warnings if available
    if (data.safety_warnings && data.safety_warnings.length > 0) {
        content += `
            <div class="col-md-6 mb-3">
                <div class="card h-100">
                    <div class="card-header bg-danger text-white">
                        <h5 class="mb-0"><i class="fas fa-shield-alt me-2"></i>Safety Warnings</h5>
                    </div>
                    <div class="card-body">
                        <div class="list-group">
        `;
        
        data.safety_warnings.forEach((warning) => {
            content += `
                <div class="list-group-item list-group-item-danger">
                    <i class="fas fa-exclamation-circle me-2"></i>${warning}
                </div>
            `;
        });
        
        content += `
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    content += `
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Close accordion
    content += `</div>`;
    
    // Add export and raw response options
    content += `
        <div class="row mt-4">
            <div class="col-md-6">
                <button class="btn btn-success w-100" id="export-results" data-manual-id="${data.manual_id}">
                    <i class="fas fa-file-export me-2"></i>Export Results to CSV
                </button>
            </div>
            <div class="col-md-6">
                <button class="btn btn-outline-secondary w-100" id="toggle-raw-processing">
                    <i class="fas fa-code me-2"></i>View Raw JSON Response
                </button>
            </div>
        </div>
        <div class="raw-response mt-3" style="display: none;">
            <pre>${formatJsonSyntax(API.formatResponse(response))}</pre>
        </div>
    `;
    
    // Set content first
    container.innerHTML = content;
    
    // Add toggle handler for raw response
    document.getElementById('toggle-raw-processing').addEventListener('click', function() {
        const rawResponse = container.querySelector('.raw-response');
        rawResponse.style.display = rawResponse.style.display === 'none' ? 'block' : 'none';
        this.innerHTML = rawResponse.style.display === 'none' ? 
            '<i class="fas fa-code me-2"></i>View Raw JSON Response' : 
            '<i class="fas fa-code me-2"></i>Hide Raw JSON Response';
    });
    
    // Add export functionality for all results
    document.getElementById('export-results').addEventListener('click', function() {
        // Create CSV content
        let csv = 'Type,Code,Description\n';
        
        // Add error codes
        if (data.error_codes && data.error_codes.length > 0) {
            data.error_codes.forEach(error => {
                csv += `"Error Code","${error['Error Code Number'] || error.code}","${(error['Short Error Description'] || error.description || '').replace(/"/g, '""')}"\n`;
            });
        }
        
        // Add part numbers
        if (data.part_numbers && data.part_numbers.length > 0) {
            data.part_numbers.forEach(part => {
                csv += `"Part Number","${part['OEM Part Number'] || part.code}","${(part['Short Part Description'] || part.description || '').replace(/"/g, '""')}"\n`;
            });
        }
        
        // Add common problems
        if (data.common_problems && data.common_problems.length > 0) {
            data.common_problems.forEach(problem => {
                csv += `"Problem","${(problem.issue || '').replace(/"/g, '""')}","${(problem.solution || '').replace(/"/g, '""')}"\n`;
            });
        }
        
        // Create download link
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `manual_${data.manual_id}_analysis.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
    
    // Add export functionality for error codes only
    const exportErrorCodesBtn = container.querySelector('.export-error-codes');
    if (exportErrorCodesBtn) {
        exportErrorCodesBtn.addEventListener('click', function() {
            // Create CSV content
            let csv = 'Error Code Number,Short Error Description\n';
            
            // Add error codes
            if (data.error_codes && data.error_codes.length > 0) {
                data.error_codes.forEach(error => {
                    csv += `"${error['Error Code Number'] || error.code}","${(error['Short Error Description'] || error.description || '').replace(/"/g, '""')}"\n`;
                });
            }
            
            // Create download link
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `manual_${data.manual_id}_error_codes.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }
    
    // Add export functionality for parts only
    const exportPartsBtn = container.querySelector('.export-parts');
    if (exportPartsBtn) {
        exportPartsBtn.addEventListener('click', function() {
            // Create CSV content
            let csv = 'OEM Part Number,Short Part Description\n';
            
            // Add part numbers
            if (data.part_numbers && data.part_numbers.length > 0) {
                data.part_numbers.forEach(part => {
                    csv += `"${part['OEM Part Number'] || part.code}","${(part['Short Part Description'] || part.description || '').replace(/"/g, '""')}"\n`;
                });
            }
            
            // Create download link
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `manual_${data.manual_id}_parts.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }
    
    // Add part search functionality
    const partSearchBtn = container.querySelector('#part-search-btn');
    if (partSearchBtn) {
        partSearchBtn.addEventListener('click', function() {
            const searchTerm = container.querySelector('#part-search').value.toLowerCase();
            const tableRows = container.querySelectorAll('#collapseParts table tbody tr');
            
            tableRows.forEach(row => {
                const partNumber = row.querySelector('td:first-child').textContent.toLowerCase();
                const description = row.querySelector('td:last-child').textContent.toLowerCase();
                
                if (partNumber.includes(searchTerm) || description.includes(searchTerm)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
        
        // Add enter key support for search
        container.querySelector('#part-search').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                partSearchBtn.click();
            }
        });
    }
}

/**
 * Display enhanced part resolution results in a structured format
 * @param {HTMLElement} container - Response container element
 * @param {Object} response - API response with part resolution results
 */
function displayPartResolutionResults(container, response) {
    // Extract data
    const data = response.part_resolution;
    
    // Set container class
    container.className = 'response-container success';
    
    // Build structured UI for part resolution
    let content = `
        <div class="alert ${data.matches_web_search === true ? 'alert-success' : (data.matches_web_search === false ? 'alert-warning' : 'alert-info')} mb-3">
            <h5><i class="${data.matches_web_search === true ? 'fas fa-check-circle' : (data.matches_web_search === false ? 'fas fa-exclamation-triangle' : 'fas fa-info-circle')} me-2"></i>${response.message}</h5>
        </div>
        
        <div class="row mb-3">
            <div class="col-md-6">
                <div class="card border-primary h-100">
                    <div class="card-header bg-primary text-white">
                        <h5 class="mb-0">
                            <i class="fas fa-cog me-2"></i>Part Information
                            ${data.confidence ? `<span class="badge bg-light text-primary float-end">${Math.round(data.confidence * 100)}% Confidence</span>` : ''}
                        </h5>
                    </div>
                    <div class="card-body">
                        <div class="mb-3">
                            <h6 class="card-subtitle mb-2 text-muted">OEM Part Number</h6>
                            <p class="card-text">
                                <span class="badge bg-primary fs-5">${data.oem_part_number || 'Not found'}</span>
                            </p>
                        </div>
                        <div class="mb-3">
                            <h6 class="card-subtitle mb-2 text-muted">Manufacturer</h6>
                            <p class="card-text">${data.manufacturer || 'Unknown'}</p>
                        </div>
                        <div class="mb-3">
                            <h6 class="card-subtitle mb-2 text-muted">Description</h6>
                            <p class="card-text">${data.description || 'No description available'}</p>
                        </div>
                        <div class="mb-3">
                            <h6 class="card-subtitle mb-2 text-muted">Source</h6>
                            <p class="card-text">
                                <span class="badge ${data.source === 'database' ? 'bg-success' : (data.source === 'manual' ? 'bg-info' : 'bg-warning')}">
                                    ${data.source === 'database' ? 'Database Match' : (data.source === 'manual' ? 'Parts Manual' : 'Web Search')}
                                </span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card h-100">
                    <div class="card-header ${data.matches_web_search === true ? 'bg-success text-white' : (data.matches_web_search === false ? 'bg-warning' : 'bg-light')}">
                        <h5 class="mb-0">
                            <i class="${data.matches_web_search === true ? 'fas fa-check-double' : (data.matches_web_search === false ? 'fas fa-exclamation-triangle' : 'fas fa-search')} me-2"></i>
                            Sources Comparison
                        </h5>
                    </div>
                    <div class="card-body">
                        <div class="row mb-3">
                            <div class="col-6">
                                <div class="card">
                                    <div class="card-header bg-info text-white d-flex justify-content-between align-items-center">
                                        <h6 class="mb-0">Manual Analysis</h6>
                                        ${data.search_methods_used && data.search_methods_used.manual_search !== undefined ? 
                                            `<span class="badge bg-light text-${data.search_methods_used.manual_search ? 'success' : 'secondary'}">
                                                ${data.search_methods_used.manual_search ? 'Enabled' : 'Disabled'}
                                            </span>` : ''}
                                    </div>
                                    <div class="card-body">
                                        <p><strong>Part Number:</strong> ${data.manual_analysis.oem_part_number || 'Not found'}</p>
                                        <p><strong>Confidence:</strong> ${Math.round(data.manual_analysis.confidence * 100)}%</p>
                                        <p><strong>Source:</strong> ${data.manual_analysis.manual_source || 'No manual'}</p>
                                    </div>
                                </div>
                            </div>
                            <div class="col-6">
                                <div class="card">
                                    <div class="card-header bg-warning text-white d-flex justify-content-between align-items-center">
                                        <h6 class="mb-0">Web Search</h6>
                                        ${data.search_methods_used && data.search_methods_used.web_search !== undefined ? 
                                            `<span class="badge bg-light text-${data.search_methods_used.web_search ? 'success' : 'secondary'}">
                                                ${data.search_methods_used.web_search ? 'Enabled' : 'Disabled'}
                                            </span>` : ''}
                                    </div>
                                    <div class="card-body">
                                        <p><strong>Part Number:</strong> ${data.web_search_analysis.oem_part_number || 'Not found'}</p>
                                        <p><strong>Confidence:</strong> ${Math.round(data.web_search_analysis.confidence * 100)}%</p>
                                        <p><strong>Sources:</strong> ${data.web_search_analysis.sources && data.web_search_analysis.sources.length ? data.web_search_analysis.sources.length : 'None'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="alert ${data.matches_web_search === true ? 'alert-success' : (data.matches_web_search === false ? 'alert-warning' : 'alert-info')}">
                            ${data.matches_web_search === true ? 
                                '<i class="fas fa-check-circle me-2"></i>Manual and web search results match!' : 
                                (data.matches_web_search === false ? 
                                    '<i class="fas fa-exclamation-triangle me-2"></i>Manual and web search results differ. Using most confident result.' : 
                                    '<i class="fas fa-info-circle me-2"></i>Only one source found part information.')}
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        ${data.alternate_part_numbers && data.alternate_part_numbers.length > 0 ? `
        <div class="card mb-3">
            <div class="card-header">
                <h5 class="mb-0"><i class="fas fa-exchange-alt me-2"></i>Alternate Part Numbers</h5>
            </div>
            <div class="card-body">
                <div class="d-flex flex-wrap">
                    ${data.alternate_part_numbers.map(part => `<span class="badge bg-secondary m-1 p-2">${part}</span>`).join('')}
                </div>
            </div>
        </div>
        ` : ''}
        
        <!-- Search Methods Used Section -->
        <div class="card mb-3">
            <div class="card-header">
                <h5 class="mb-0"><i class="fas fa-search me-2"></i>Search Methods Used</h5>
            </div>
            <div class="card-body">
                <div class="row">
                    <div class="col-md-4">
                        <div class="d-flex align-items-center mb-2">
                            <i class="fas fa-database me-2 ${data.search_methods_used && data.search_methods_used.database ? 'text-success' : 'text-secondary'}"></i>
                            <span>Database Search:</span>
                            <span class="ms-auto badge ${data.search_methods_used && data.search_methods_used.database ? 'bg-success' : 'bg-secondary'}">
                                ${data.search_methods_used && data.search_methods_used.database ? 'Enabled' : 'Disabled'}
                            </span>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="d-flex align-items-center mb-2">
                            <i class="fas fa-book me-2 ${data.search_methods_used && data.search_methods_used.manual_search ? 'text-success' : 'text-secondary'}"></i>
                            <span>Manual Search:</span>
                            <span class="ms-auto badge ${data.search_methods_used && data.search_methods_used.manual_search ? 'bg-success' : 'bg-secondary'}">
                                ${data.search_methods_used && data.search_methods_used.manual_search ? 'Enabled' : 'Disabled'}
                            </span>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="d-flex align-items-center mb-2">
                            <i class="fas fa-globe me-2 ${data.search_methods_used && data.search_methods_used.web_search ? 'text-success' : 'text-secondary'}"></i>
                            <span>Web Search:</span>
                            <span class="ms-auto badge ${data.search_methods_used && data.search_methods_used.web_search ? 'bg-success' : 'bg-secondary'}">
                                ${data.search_methods_used && data.search_methods_used.web_search ? 'Enabled' : 'Disabled'}
                            </span>
                        </div>
                    </div>
                </div>
                
                ${response.search_methods ? `
                <div class="alert alert-info mt-3 mb-0">
                    <small><i class="fas fa-info-circle me-1"></i> Search toggles allow you to customize which methods are used to find part information. This can help balance between accuracy, speed, and resource usage.</small>
                </div>
                ` : ''}
            </div>
        </div>
        
        <div class="d-grid gap-2 mt-3">
            <button class="btn btn-sm btn-outline-secondary" id="toggle-raw-part-response">
                <i class="fas fa-code me-1"></i>Toggle Raw JSON Response
            </button>
        </div>
        <div class="raw-response mt-3" style="display: none;">
            <pre>${formatJsonSyntax(API.formatResponse(response))}</pre>
        </div>
    `;
    
    // Set content
    container.innerHTML = content;
    
    // Add toggle handler for raw response
    document.getElementById('toggle-raw-part-response').addEventListener('click', function() {
        const rawResponse = container.querySelector('.raw-response');
        rawResponse.style.display = rawResponse.style.display === 'none' ? 'block' : 'none';
        this.innerHTML = rawResponse.style.display === 'none' ? 
            '<i class="fas fa-code me-1"></i>Toggle Raw JSON Response' : 
            '<i class="fas fa-code me-1"></i>Hide Raw JSON Response';
    });
}

/**
 * Display error in container
 * @param {HTMLElement} container - Response container element
 * @param {Error} error - Error object
 */
function displayError(container, error) {
    container.className = 'response-container error';
    container.innerHTML = `<pre>Error: ${error.message}</pre>`;
}

/**
 * Display formatted manual components results with an enhanced, interactive UI
 * @param {HTMLElement} container - Response container element
 * @param {Object} response - API response with manual components data
 */
function displayManualComponentsResults(container, response) {
    // Extract data
    const data = response.data;
    const components = data.components;
    
    // Set container class
    container.className = 'response-container success';
    
    // Create header section with manual info
    let content = `
        <div class="alert alert-success mb-3">
            <h5><i class="fas fa-puzzle-piece me-2"></i>Manual Component Analysis</h5>
            <div class="d-flex justify-content-between align-items-center">
                <p class="mb-0"><strong>Manual:</strong> ${data.title || 'Unknown Title'}</p>
                <span class="badge bg-primary">${data.make || ''} ${data.model || ''}</span>
            </div>
        </div>
    `;
    
    // Create overview card showing component count
    content += `
        <div class="card mb-3">
            <div class="card-header bg-primary text-white">
                <h5 class="mb-0"><i class="fas fa-th-large me-2"></i>Components Overview</h5>
            </div>
            <div class="card-body">
                <div class="row">
    `;
    
    // Add component count cards
    const componentTypes = {
        'table_of_contents': { icon: 'fas fa-list', color: 'info', title: 'Contents' },
        'exploded_view': { icon: 'fas fa-tools', color: 'primary', title: 'Exploded Views' },
        'installation_instructions': { icon: 'fas fa-hammer', color: 'success', title: 'Installation' },
        'error_code_table': { icon: 'fas fa-exclamation-circle', color: 'danger', title: 'Error Codes' },
        'troubleshooting': { icon: 'fas fa-sitemap', color: 'warning', title: 'Troubleshooting' },
        'maintenance': { icon: 'fas fa-cogs', color: 'secondary', title: 'Maintenance' },
        'parts_list': { icon: 'fas fa-list-alt', color: 'info', title: 'Parts List' },
        'safety_warnings': { icon: 'fas fa-exclamation-triangle', color: 'danger', title: 'Safety' },
        'technical_specifications': { icon: 'fas fa-microchip', color: 'dark', title: 'Tech Specs' },
        'wiring_diagram': { icon: 'fas fa-project-diagram', color: 'primary', title: 'Wiring' }
    };
    
    // Count how many components of each type are found
    let componentCount = 0;
    for (const type in components) {
        componentCount++;
        
        // Get icon and color for this component type
        const typeInfo = componentTypes[type] || { icon: 'fas fa-file-alt', color: 'secondary', title: 'Other' };
        
        // Add card for this component type
        content += `
            <div class="col-md-3 mb-3">
                <div class="card h-100 border-${typeInfo.color} component-card" data-component="${type}">
                    <div class="card-body text-center">
                        <i class="${typeInfo.icon} fa-2x text-${typeInfo.color} mb-2"></i>
                        <h6 class="card-title">${typeInfo.title}</h6>
                        <p class="card-text small text-muted">Pages ${components[type].start_page}-${components[type].end_page}</p>
                    </div>
                </div>
            </div>
        `;
    }
    
    // If no components were found, show a message
    if (componentCount === 0) {
        content += `
            <div class="col-12">
                <div class="alert alert-info mb-0">
                    <i class="fas fa-info-circle me-2"></i>No manual components were found in this document.
                </div>
            </div>
        `;
    }
    
    // Close the overview card
    content += `
                </div>
            </div>
        </div>
    `;
    
    // Add component details accordion
    if (componentCount > 0) {
        content += `
            <div class="accordion" id="componentDetailsAccordion">
                <div class="accordion-item">
                    <h2 class="accordion-header" id="headingDetails">
                        <button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#collapseDetails" aria-expanded="true" aria-controls="collapseDetails">
                            <i class="fas fa-info-circle me-2"></i>Component Details
                        </button>
                    </h2>
                    <div id="collapseDetails" class="accordion-collapse collapse show" aria-labelledby="headingDetails" data-bs-parent="#componentDetailsAccordion">
                        <div class="accordion-body">
                            <div class="table-responsive">
                                <table class="table table-striped table-hover">
                                    <thead class="table-dark">
                                        <tr>
                                            <th width="25%">Component</th>
                                            <th width="15%">Pages</th>
                                            <th width="60%">Description & Key Information</th>
                                        </tr>
                                    </thead>
                                    <tbody>
        `;
        
        // Add rows for each component
        for (const type in components) {
            const component = components[type];
            const typeInfo = componentTypes[type] || { icon: 'fas fa-file-alt', color: 'secondary', title: type };
            
            // Create formatted title
            const title = component.title || typeInfo.title;
            
            // Create page range
            const pageRange = `${component.start_page}-${component.end_page}`;
            
            // Create description and key information
            let description = component.description || 'No description available';
            let keyInfo = '';
            
            if (component.key_information && component.key_information.length > 0) {
                keyInfo = `
                    <div class="mt-2">
                        <strong>Key Information:</strong>
                        <ul class="mb-0 ps-3">
                            ${component.key_information.map(info => `<li>${info}</li>`).join('')}
                        </ul>
                    </div>
                `;
            }
            
            // Add row for this component
            content += `
                <tr>
                    <td>
                        <div class="d-flex align-items-center">
                            <i class="${typeInfo.icon} text-${typeInfo.color} me-2"></i>
                            <strong>${title}</strong>
                        </div>
                    </td>
                    <td><span class="badge bg-${typeInfo.color}">${pageRange}</span></td>
                    <td>
                        <p class="mb-1">${description}</p>
                        ${keyInfo}
                    </td>
                </tr>
            `;
        }
        
        // Close the table and accordion
        content += `
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Add export and visualization options
        content += `
            <div class="row mt-4">
                <div class="col-md-6">
                    <button class="btn btn-success w-100" id="export-components" data-manual-id="${data.manual_id}">
                        <i class="fas fa-file-export me-2"></i>Export Components to CSV
                    </button>
                </div>
                <div class="col-md-6">
                    <button class="btn btn-outline-secondary w-100" id="toggle-raw-components">
                        <i class="fas fa-code me-2"></i>View Raw JSON Response
                    </button>
                </div>
            </div>
        `;
    }
    
    // Add raw response container (hidden by default)
    content += `
        <div class="raw-response mt-3" style="display: none;">
            <pre>${formatJsonSyntax(API.formatResponse(response))}</pre>
        </div>
    `;
    
    // Set container content
    container.innerHTML = content;
    
    // Add event listeners for interactive components
    const toggleRawBtn = document.getElementById('toggle-raw-components');
    if (toggleRawBtn) {
        toggleRawBtn.addEventListener('click', function() {
            const rawResponse = container.querySelector('.raw-response');
            rawResponse.style.display = rawResponse.style.display === 'none' ? 'block' : 'none';
            this.innerHTML = rawResponse.style.display === 'none' ? 
                '<i class="fas fa-code me-2"></i>View Raw JSON Response' : 
                '<i class="fas fa-code me-2"></i>Hide Raw JSON Response';
        });
    }
    
    // Add export functionality
    const exportBtn = document.getElementById('export-components');
    if (exportBtn) {
        exportBtn.addEventListener('click', function() {
            // Create CSV content
            let csv = 'Component Type,Title,Start Page,End Page,Description\n';
            
            // Add each component to the CSV
            for (const type in components) {
                const component = components[type];
                
                // Add the component to the CSV, escaping quotes in text
                csv += `"${type}","${(component.title || '').replace(/"/g, '""')}",${component.start_page},${component.end_page},"${(component.description || '').replace(/"/g, '""')}"\n`;
            }
            
            // Create download link
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `manual_${data.manual_id}_components.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }
    
    // Add click handlers for component cards to highlight corresponding table row
    const componentCards = container.querySelectorAll('.component-card');
    if (componentCards.length > 0) {
        componentCards.forEach(card => {
            card.addEventListener('click', function() {
                const componentType = this.getAttribute('data-component');
                
                // Find the corresponding table row
                const tableRows = container.querySelectorAll('tbody tr');
                tableRows.forEach((row, index) => {
                    row.classList.remove('table-active');
                });
                
                // Get index of this component type
                let index = 0;
                for (const type in components) {
                    if (type === componentType) {
                        break;
                    }
                    index++;
                }
                
                // Highlight the corresponding row
                const targetRow = container.querySelector(`tbody tr:nth-child(${index + 1})`);
                if (targetRow) {
                    targetRow.classList.add('table-active');
                    
                    // Ensure the details accordion is expanded
                    const detailsAccordion = container.querySelector('#collapseDetails');
                    if (detailsAccordion && !detailsAccordion.classList.contains('show')) {
                        container.querySelector('.accordion-button').click();
                    }
                    
                    // Scroll to the row
                    targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        });
    }
}

/**
 * Initialize the profiles section with the load button and display functionality
 */
function initProfilesSection() {
    const loadProfilesBtn = document.getElementById('load-profiles-btn');
    const profilesContainer = document.getElementById('profiles-container');
    
    if (loadProfilesBtn) {
        loadProfilesBtn.addEventListener('click', async function() {
            // Show loading indicator
            profilesContainer.innerHTML = '<div class="text-center"><div class="loading-spinner"></div><p class="mt-2">Loading profiles...</p></div>';
            
            try {
                // Fetch profiles from the API
                const response = await API.getProfiles();
                
                if (response.success && response.data && response.data.profiles) {
                    const profiles = response.data.profiles;
                    
                    if (profiles.length === 0) {
                        // No profiles found
                        profilesContainer.innerHTML = `
                            <div class="alert alert-info">
                                <i class="fas fa-info-circle me-2"></i>No billing profiles found in the database.
                                Create a new profile using the form below.
                            </div>
                        `;
                    } else {
                        // Display profiles in a table
                        let tableHtml = `
                            <div class="table-responsive">
                                <table class="table table-striped table-hover">
                                    <thead class="table-dark">
                                        <tr>
                                            <th>ID</th>
                                            <th>Name</th>
                                            <th>Billing Name</th>
                                            <th>Location</th>
                                            <th>Created</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                        `;
                        
                        // Add each profile to the table
                        profiles.forEach(profile => {
                            const billingAddress = profile.billing_address || {};
                            const location = [
                                billingAddress.city, 
                                billingAddress.state, 
                                billingAddress.zip
                            ].filter(Boolean).join(', ');
                            
                            // Format the date
                            const createdDate = new Date(profile.created_at);
                            const formattedDate = createdDate.toLocaleDateString();
                            
                            tableHtml += `
                                <tr>
                                    <td>${profile.id}</td>
                                    <td>${profile.name}</td>
                                    <td>${billingAddress.name || 'N/A'}</td>
                                    <td>${location || 'N/A'}</td>
                                    <td>${formattedDate}</td>
                                    <td>
                                        <button class="btn btn-sm btn-outline-primary view-profile-btn" data-profile-id="${profile.id}">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                    </td>
                                </tr>
                            `;
                        });
                        
                        // Close the table
                        tableHtml += `
                                    </tbody>
                                </table>
                            </div>
                            <div class="alert alert-info mt-3">
                                <i class="fas fa-shield-alt me-2"></i>
                                Note: Payment information is encrypted in the database for security.
                                Card details are only partially visible when viewing a profile.
                            </div>
                        `;
                        
                        // Set the HTML
                        profilesContainer.innerHTML = tableHtml;
                        
                        // Add event listeners to view buttons
                        document.querySelectorAll('.view-profile-btn').forEach(button => {
                            button.addEventListener('click', async function() {
                                const profileId = this.getAttribute('data-profile-id');
                                try {
                                    // Show loading in the details container
                                    if (!document.getElementById('profile-details-container')) {
                                        const detailsContainer = document.createElement('div');
                                        detailsContainer.id = 'profile-details-container';
                                        detailsContainer.className = 'mt-4 border rounded p-3 bg-light';
                                        profilesContainer.appendChild(detailsContainer);
                                    }
                                    
                                    const detailsContainer = document.getElementById('profile-details-container');
                                    detailsContainer.innerHTML = '<div class="text-center"><div class="loading-spinner"></div><p class="mt-2">Loading profile details...</p></div>';
                                    
                                    // Fetch profile details
                                    const profileResponse = await API.getProfile(profileId, false);
                                    
                                    if (profileResponse.success && profileResponse.data) {
                                        const profile = profileResponse.data;
                                        const billingAddress = profile.billing_address || {};
                                        
                                        // Format credit card number to show only last 4 digits
                                        let maskedCardNumber = '************';
                                        if (profile.payment_info && profile.payment_info.card_number_masked) {
                                            maskedCardNumber = profile.payment_info.card_number_masked;
                                        }
                                        
                                        // Display profile details
                                        detailsContainer.innerHTML = `
                                            <div class="d-flex justify-content-between align-items-center mb-3">
                                                <h5 class="mb-0"><i class="fas fa-id-card me-2"></i>Profile Details: ${profile.name}</h5>
                                                <button class="btn btn-sm btn-outline-secondary close-details-btn">
                                                    <i class="fas fa-times"></i>
                                                </button>
                                            </div>
                                            <div class="row">
                                                <div class="col-md-6">
                                                    <h6 class="border-bottom pb-2">Billing Information</h6>
                                                    <div class="mb-2">
                                                        <strong>Name:</strong> ${billingAddress.name || 'N/A'}
                                                    </div>
                                                    <div class="mb-2">
                                                        <strong>Address:</strong> ${billingAddress.address1 || 'N/A'}
                                                        ${billingAddress.address2 ? `, ${billingAddress.address2}` : ''}
                                                    </div>
                                                    <div class="mb-2">
                                                        <strong>City, State, ZIP:</strong> ${billingAddress.city || 'N/A'}, 
                                                        ${billingAddress.state || 'N/A'} ${billingAddress.zip || 'N/A'}
                                                    </div>
                                                    <div class="mb-2">
                                                        <strong>Phone:</strong> ${billingAddress.phone || 'N/A'}
                                                    </div>
                                                </div>
                                                <div class="col-md-6">
                                                    <h6 class="border-bottom pb-2">Payment Information</h6>
                                                    <div class="mb-2">
                                                        <strong>Card Type:</strong> 
                                                        <i class="fab fa-cc-visa text-primary me-1"></i>
                                                        Visa
                                                    </div>
                                                    <div class="mb-2">
                                                        <strong>Card Number:</strong> ${maskedCardNumber}
                                                    </div>
                                                    <div class="mb-2">
                                                        <strong>Expiration:</strong> 
                                                        ${profile.payment_info ? `${profile.payment_info.exp_month || 'XX'}/${profile.payment_info.exp_year || 'XXXX'}` : 'XX/XXXX'}
                                                    </div>
                                                    <div class="mb-2 text-muted small">
                                                        <i class="fas fa-lock me-1"></i> Full payment details are encrypted
                                                    </div>
                                                </div>
                                            </div>
                                        `;
                                        
                                        // Add close button functionality
                                        document.querySelector('.close-details-btn').addEventListener('click', function() {
                                            detailsContainer.remove();
                                        });
                                    } else {
                                        detailsContainer.innerHTML = `
                                            <div class="alert alert-danger">
                                                <i class="fas fa-exclamation-circle me-2"></i>
                                                Failed to load profile details: ${profileResponse.error || 'Unknown error'}
                                            </div>
                                        `;
                                    }
                                } catch (error) {
                                    console.error('Error fetching profile details:', error);
                                    const detailsContainer = document.getElementById('profile-details-container');
                                    if (detailsContainer) {
                                        detailsContainer.innerHTML = `
                                            <div class="alert alert-danger">
                                                <i class="fas fa-exclamation-circle me-2"></i>
                                                Error loading profile details: ${error.message}
                                            </div>
                                        `;
                                    }
                                }
                            });
                        });
                    }
                } else {
                    // API error
                    profilesContainer.innerHTML = `
                        <div class="alert alert-danger">
                            <i class="fas fa-exclamation-circle me-2"></i>
                            ${response.error || 'Failed to load profiles. Please try again.'}
                        </div>
                    `;
                }
            } catch (error) {
                console.error('Error loading profiles:', error);
                profilesContainer.innerHTML = `
                    <div class="alert alert-danger">
                        <i class="fas fa-exclamation-circle me-2"></i>
                        Error loading profiles: ${error.message}
                    </div>
                `;
            }
        });
        
        // Load profiles when the Profiles section is first shown
        document.querySelector('#api-menu a[href="#profiles-section"]').addEventListener('click', function() {
            // Automatically click the load button when the profiles section is shown
            setTimeout(() => {
                loadProfilesBtn.click();
            }, 100);
        });
    }
}