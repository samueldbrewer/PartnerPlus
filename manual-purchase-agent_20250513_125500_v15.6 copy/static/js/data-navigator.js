// Equipment Data Navigator JavaScript
let equipmentData = [];
let filteredData = [];
let currentPage = 1;
const itemsPerPage = 20;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    loadCSVData();
});

function setupEventListeners() {
    console.log('Setting up event listeners...');
    
    // Search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(filterData, 300));
        console.log('Search input listener added');
    } else {
        console.error('Search input not found');
    }
    
    // Filter dropdowns
    const makeFilter = document.getElementById('makeFilter');
    if (makeFilter) {
        makeFilter.addEventListener('change', filterData);
        console.log('Make filter listener added');
    } else {
        console.error('Make filter not found');
    }
    
    const verificationFilter = document.getElementById('verificationFilter');
    if (verificationFilter) {
        verificationFilter.addEventListener('change', filterData);
        console.log('Verification filter listener added');
    } else {
        console.error('Verification filter not found');
    }
}

// Debounce function for search input
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

async function loadCSVData() {
    showLoading(true);
    
    try {
        const response = await fetch('/data/processed_equipment_list.csv');
        const csvText = await response.text();
        
        // Parse CSV with proper handling of quoted fields
        const allData = parseCSV(csvText);
        console.log(`Parsed ${allData.length} total records from CSV`);
        
        // Filter to only include records with basic data (less strict)
        equipmentData = allData.filter(record => {
            const hasMake = record['Make'] && record['Make'].trim().length > 0;
            const hasModel = record['Model'] && record['Model'].trim().length > 0;
            const hasPart = record['Part Name'] && record['Part Name'].trim().length > 0;
            return hasMake && hasModel && hasPart;
        });
        
        console.log(`Filtered to ${equipmentData.length} records with complete data`);
        
        // Initialize filters and display
        populateFilters();
        updateStats();
        
        // Initialize filtered data and display
        filteredData = [...equipmentData];
        console.log('Initial filteredData length:', filteredData.length);
        displayData();
        
    } catch (error) {
        console.error('Error loading CSV data:', error);
        showError('Failed to load equipment data. Please try again.');
    } finally {
        showLoading(false);
    }
}

function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const headers = parseCSVLine(lines[0]);
    const records = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length > 0) {
            const record = {};
            headers.forEach((header, index) => {
                record[header.trim()] = values[index] ? values[index].trim() : '';
            });
            records.push(record);
        }
    }
    
    return records;
}

function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < line.length) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                // Handle escaped quotes ("")
                current += '"';
                i += 2;
            } else {
                // Toggle quote state
                inQuotes = !inQuotes;
                i++;
            }
        } else if (char === ',' && !inQuotes) {
            values.push(current);
            current = '';
            i++;
        } else {
            current += char;
            i++;
        }
    }
    
    values.push(current);
    return values;
}

function populateFilters() {
    const makes = [...new Set(equipmentData.map(item => item.Make))].filter(Boolean).sort();
    const makeFilter = document.getElementById('makeFilter');
    
    makeFilter.innerHTML = '<option value="">All Makes</option>';
    makes.forEach(make => {
        makeFilter.innerHTML += `<option value="${make}">${make}</option>`;
    });
}

function updateStats() {
    const verifiedCount = equipmentData.filter(item => item['OEM Part Verified'] === 'Verified').length;
    const totalManuals = equipmentData.reduce((count, item) => {
        let manualCount = 0;
        for (let i = 1; i <= 5; i++) {
            if (item[`Manual ${i}`]) manualCount++;
        }
        return count + manualCount;
    }, 0);
    const uniqueMakes = new Set(equipmentData.map(item => item.Make).filter(Boolean)).size;
    
    document.getElementById('totalRecords').textContent = equipmentData.length;
    document.getElementById('verifiedParts').textContent = verifiedCount;
    document.getElementById('totalManuals').textContent = totalManuals;
    document.getElementById('uniqueMakes').textContent = uniqueMakes;
}

function filterData() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const makeFilter = document.getElementById('makeFilter').value;
    const verificationFilter = document.getElementById('verificationFilter').value;
    
    console.log('Filtering with:', { searchTerm, makeFilter, verificationFilter });
    
    filteredData = equipmentData.filter(item => {
        // Search filter
        const searchMatch = !searchTerm || 
            (item.Make && item.Make.toLowerCase().includes(searchTerm)) ||
            (item.Model && item.Model.toLowerCase().includes(searchTerm)) ||
            (item['Part Name'] && item['Part Name'].toLowerCase().includes(searchTerm)) ||
            (item['OEM Part Number'] && item['OEM Part Number'].toLowerCase().includes(searchTerm));
        
        // Make filter
        const makeMatch = !makeFilter || item.Make === makeFilter;
        
        // Verification filter
        let verificationMatch = true;
        if (verificationFilter === 'verified') {
            verificationMatch = item['OEM Part Verified'] === 'Verified';
        } else if (verificationFilter === 'unverified') {
            verificationMatch = item['OEM Part Verified'] !== 'Verified';
        }
        
        return searchMatch && makeMatch && verificationMatch;
    });
    
    console.log(`Filtered ${equipmentData.length} records to ${filteredData.length} records`);
    
    currentPage = 1;
    displayData();
}

function displayData() {
    console.log('Displaying data...', { currentPage, totalRecords: filteredData.length });
    
    const tableBody = document.getElementById('dataTableBody');
    if (!tableBody) {
        console.error('Table body not found');
        return;
    }
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredData.length);
    const pageData = filteredData.slice(startIndex, endIndex);
    
    console.log('Page data:', { startIndex, endIndex, pageDataLength: pageData.length });
    
    tableBody.innerHTML = '';
    
    pageData.forEach((item, index) => {
        try {
            const row = createTableRow(item, startIndex + index + 1);
            tableBody.appendChild(row);
        } catch (error) {
            console.error('Error creating row:', error, item);
        }
    });
    
    updatePagination();
}

function createTableRow(item, rowNumber) {
    const row = document.createElement('tr');
    
    // Safe data access with defaults
    const make = item.Make || '';
    const model = item.Model || '';
    const partName = item['Part Name'] || '';
    const oemPartNumber = item['OEM Part Number'] || '';
    const equipmentPhoto = item['Equipment Photo'] || '';
    const partPhoto = item['Part Photo'] || '';
    const verified = item['OEM Part Verified'] || '';
    
    const verificationBadge = verified === 'Verified' 
        ? '<span class="badge bg-success">Verified</span>'
        : '<span class="badge bg-warning text-dark">Unverified</span>';
    
    const manualCount = [1,2,3,4,5].filter(i => item[`Manual ${i}`] && item[`Manual ${i}`].trim()).length;
    const supplierCount = [1,2,3,4,5].filter(i => item[`Supplier ${i}`] && item[`Supplier ${i}`].trim()).length;
    
    row.innerHTML = `
        <td>${rowNumber}</td>
        <td>
            <div class="d-flex align-items-center">
                ${equipmentPhoto ? 
                    `<img src="${equipmentPhoto}" class="img-thumbnail me-2" style="width: 40px; height: 40px; object-fit: cover;" 
                         onclick="showImage('${equipmentPhoto}', '${make} ${model}')" 
                         onerror="this.style.display='none'">` : 
                    '<div class="me-2" style="width: 40px; height: 40px; background: #f8f9fa; border-radius: 4px;"></div>'
                }
                <div>
                    <strong>${make} ${model}</strong>
                </div>
            </div>
        </td>
        <td>${partName}</td>
        <td>
            <code>${oemPartNumber || 'N/A'}</code>
            ${partPhoto ? 
                `<br><small><a href="#" onclick="showImage('${partPhoto}', 'Part: ${partName}')">View Part Image</a></small>` : 
                ''
            }
        </td>
        <td>${verificationBadge}</td>
        <td>
            <span class="badge bg-info">${manualCount} Manual${manualCount !== 1 ? 's' : ''}</span>
        </td>
        <td>
            <span class="badge bg-secondary">${supplierCount} Supplier${supplierCount !== 1 ? 's' : ''}</span>
        </td>
        <td>
            <button class="btn btn-sm btn-outline-primary" onclick="showDetails(${rowNumber - 1 + (currentPage - 1) * itemsPerPage})">
                <i class="fas fa-eye"></i>
            </button>
        </td>
    `;
    
    return row;
}

function updatePagination() {
    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    const pagination = document.getElementById('pagination');
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let paginationHTML = '';
    
    // Previous button
    paginationHTML += `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="changePage(${currentPage - 1})">&laquo;</a>
        </li>
    `;
    
    // Page numbers
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    if (startPage > 1) {
        paginationHTML += '<li class="page-item"><a class="page-link" href="#" onclick="changePage(1)">1</a></li>';
        if (startPage > 2) {
            paginationHTML += '<li class="page-item disabled"><span class="page-link">...</span></li>';
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
            <li class="page-item ${i === currentPage ? 'active' : ''}">
                <a class="page-link" href="#" onclick="changePage(${i})">${i}</a>
            </li>
        `;
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            paginationHTML += '<li class="page-item disabled"><span class="page-link">...</span></li>';
        }
        paginationHTML += `<li class="page-item"><a class="page-link" href="#" onclick="changePage(${totalPages})">${totalPages}</a></li>`;
    }
    
    // Next button
    paginationHTML += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="changePage(${currentPage + 1})">&raquo;</a>
        </li>
    `;
    
    pagination.innerHTML = paginationHTML;
}

function changePage(page) {
    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    if (page >= 1 && page <= totalPages) {
        currentPage = page;
        displayData();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function showDetails(index) {
    const item = filteredData[index];
    if (!item) return;
    
    const modal = new bootstrap.Modal(document.getElementById('detailModal'));
    document.getElementById('modalTitle').textContent = `${item.Make} ${item.Model} - ${item['Part Name']}`;
    
    let modalContent = `
        <div class="row">
            <div class="col-md-6">
                <h5>Equipment Information</h5>
                <table class="table table-sm">
                    <tr><td><strong>Make:</strong></td><td>${item.Make}</td></tr>
                    <tr><td><strong>Model:</strong></td><td>${item.Model}</td></tr>
                    <tr><td><strong>Part Name:</strong></td><td>${item['Part Name']}</td></tr>
                    <tr><td><strong>OEM Part Number:</strong></td><td><code>${item['OEM Part Number'] || 'N/A'}</code></td></tr>
                    <tr><td><strong>Verification Status:</strong></td><td>
                        ${item['OEM Part Verified'] === 'Verified' ? 
                            '<span class="badge bg-success">Verified</span>' : 
                            '<span class="badge bg-warning text-dark">Unverified</span>'
                        }
                    </td></tr>
                </table>
                
                ${displayAlternateOrSimilarParts(item)}
            </div>
            
            <div class="col-md-6">
                <h5>Images</h5>
                ${item['Equipment Photo'] ? 
                    `<img src="${item['Equipment Photo']}" class="equipment-image img-fluid mb-3" alt="Equipment Photo" onclick="showImage('${item['Equipment Photo']}', '${item.Make} ${item.Model}')" style="cursor: pointer;">` : 
                    '<p class="text-muted">No equipment photo available</p>'
                }
                
                ${item['Part Photo'] ? 
                    `<img src="${item['Part Photo']}" class="part-image img-fluid" alt="Part Photo" onclick="showImage('${item['Part Photo']}', 'Part: ${item['Part Name']}')" style="cursor: pointer;">` : 
                    '<p class="text-muted">No part photo available</p>'
                }
            </div>
        </div>
        
        <div class="row mt-4">
            <div class="col-12">
                <h5>Manuals</h5>
                <div class="mb-3">
    `;
    
    // Add manuals
    for (let i = 1; i <= 5; i++) {
        if (item[`Manual ${i}`]) {
            modalContent += `<a href="${item[`Manual ${i}`]}" target="_blank" class="manual-link">Manual ${i}</a>`;
        }
    }
    
    modalContent += `
                </div>
                
                <h5>Suppliers</h5>
                <div>
    `;
    
    // Add suppliers
    for (let i = 1; i <= 5; i++) {
        if (item[`Supplier ${i}`]) {
            const url = item[`Supplier ${i}`];
            const domain = extractDomain(url);
            modalContent += `<a href="${url}" target="_blank" class="supplier-link">${domain}</a>`;
        }
    }
    
    modalContent += `
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('modalBody').innerHTML = modalContent;
    modal.show();
}

function displayAlternateOrSimilarParts(item) {
    const isVerified = item['OEM Part Verified'] === 'Verified';
    const alternateData = item['Alternate Part Numbers'] || '';
    const partDescriptions = item['Alternate Part Descriptions'] || '';
    
    if (!alternateData.trim()) {
        return '';
    }
    
    const title = isVerified ? 'Alternate Parts' : 'Similar Parts';
    const bgColor = isVerified ? 'bg-success' : 'bg-info';
    
    let html = `
        <div class="alternate-parts mb-3">
            <h6><span class="badge ${bgColor}">${title}</span></h6>
            <div class="parts-list">
    `;
    
    // Handle different data formats
    if (partDescriptions && partDescriptions.trim()) {
        // New format with separate numbers and descriptions (like test files)
        const numbers = alternateData.split(',').map(n => n.trim()).filter(n => n);
        const descriptions = partDescriptions.split('|').map(d => d.trim()).filter(d => d);
        
        for (let i = 0; i < numbers.length; i++) {
            const number = numbers[i];
            const description = descriptions[i] || 'No description available';
            
            html += `
                <div class="part-item mb-2 p-2 border rounded">
                    <div class="part-number"><strong>Part #:</strong> <code>${number}</code></div>
                    <div class="part-description text-muted"><small>${description}</small></div>
                </div>
            `;
        }
    } else {
        // Legacy format - alternateData contains descriptions or mixed data
        const items = alternateData.split(',').map(n => n.trim()).filter(n => n);
        
        items.forEach(item => {
            // Try to determine if it looks like a part number or description
            const isPartNumber = /^[A-Za-z0-9\-_]+$/.test(item) && item.length < 30;
            
            if (isPartNumber) {
                html += `
                    <div class="part-item mb-2 p-2 border rounded">
                        <div class="part-number"><strong>Part #:</strong> <code>${item}</code></div>
                    </div>
                `;
            } else {
                html += `
                    <div class="part-item mb-2 p-2 border rounded">
                        <div class="part-description text-muted"><small>${item}</small></div>
                    </div>
                `;
            }
        });
    }
    
    html += `
            </div>
        </div>
    `;
    
    return html;
}

function extractDomain(url) {
    try {
        const domain = new URL(url).hostname;
        return domain.replace('www.', '');
    } catch {
        return url.substring(0, 30) + '...';
    }
}

function showImage(imageUrl, title) {
    const modal = new bootstrap.Modal(document.getElementById('detailModal'));
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = `
        <div class="text-center">
            <img src="${imageUrl}" class="img-fluid" alt="${title}" style="max-height: 70vh;">
        </div>
    `;
    modal.show();
}

function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('makeFilter').value = '';
    document.getElementById('verificationFilter').value = '';
    filterData();
}

function exportToCSV() {
    if (filteredData.length === 0) {
        alert('No data to export');
        return;
    }
    
    // Get headers from first item
    const headers = Object.keys(filteredData[0]);
    
    // Create CSV content
    let csvContent = headers.join(',') + '\n';
    
    filteredData.forEach(item => {
        const row = headers.map(header => {
            const value = item[header] || '';
            // Escape quotes and wrap in quotes if contains comma
            return value.includes(',') || value.includes('"') ? 
                `"${value.replace(/"/g, '""')}"` : value;
        });
        csvContent += row.join(',') + '\n';
    });
    
    // Download file
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `equipment-data-filtered-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

function showLoading(show) {
    document.getElementById('loadingSpinner').style.display = show ? 'block' : 'none';
}

function showError(message) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-danger alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x';
    alert.style.zIndex = '9999';
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(alert);
    
    setTimeout(() => {
        if (alert.parentNode) {
            alert.parentNode.removeChild(alert);
        }
    }, 5000);
}