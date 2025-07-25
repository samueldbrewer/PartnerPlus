# Manual Purchase Agent API Reference

## Manuals API

### 1. Search for Manuals
Find technical and parts manuals by make and model.

**Endpoint:** `/api/manuals/search`  
**Methods:** `GET`, `POST`  
**Parameters:**  
- `make` (required): Manufacturer name (e.g., "Toyota")
- `model` (required): Model name (e.g., "Camry 2020")
- `manual_type`: Type of manual ("technical", "parts", "repair") - default: "technical"

**Example:**
```bash
curl -X POST "http://localhost:7777/api/manuals/search" \
  -H "Content-Type: application/json" \
  -d '{"make":"Toyota", "model":"Camry 2020", "manual_type":"technical"}'
```

### 2. List All Manuals
Get all manuals with pagination and filtering.

**Endpoint:** `/api/manuals`  
**Method:** `GET`  
**Parameters:**  
- `page`: Page number - default: 1
- `per_page`: Items per page - default: 20
- `make`: Filter by make
- `model`: Filter by model
- `year`: Filter by year

**Example:**
```bash
curl "http://localhost:7777/api/manuals?page=1&per_page=10&make=Toyota"
```

### 3. Create Manual Entry
Add a new manual to the database.

**Endpoint:** `/api/manuals`  
**Method:** `POST`  
**Parameters:**  
- `title` (required): Manual title
- `make` (required): Manufacturer
- `model` (required): Vehicle model
- `url` (required): URL to the manual
- `year`: Year of publication
- `file_format`: File format (default: "pdf")

**Example:**
```bash
curl -X POST "http://localhost:7777/api/manuals" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "2020 Toyota Camry Owner Manual",
    "make": "Toyota",
    "model": "Camry",
    "year": "2020",
    "url": "https://example.com/manuals/camry2020.pdf"
  }'
```

### 4. Get Manual by ID
Retrieve details for a specific manual.

**Endpoint:** `/api/manuals/<manual_id>`  
**Method:** `GET`  

**Example:**
```bash
curl "http://localhost:7777/api/manuals/1"
```

### 5. Update Manual
Update manual information.

**Endpoint:** `/api/manuals/<manual_id>`  
**Method:** `PUT`  
**Parameters:** Any manual fields to update

**Example:**
```bash
curl -X PUT "http://localhost:7777/api/manuals/1" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Manual Title",
    "year": "2021"
  }'
```

### 6. Delete Manual
Remove a manual from the database.

**Endpoint:** `/api/manuals/<manual_id>`  
**Method:** `DELETE`  

**Example:**
```bash
curl -X DELETE "http://localhost:7777/api/manuals/1"
```

### 7. Download Manual
Download a manual and save locally.

**Endpoint:** `/api/manuals/<manual_id>/download`  
**Method:** `POST`  

**Example:**
```bash
curl -X POST "http://localhost:7777/api/manuals/1/download"
```

### 8. Process Manual
Extract part numbers and error codes from a manual.

**Endpoint:** `/api/manuals/<manual_id>/process`  
**Method:** `POST`  

**Example:**
```bash
curl -X POST "http://localhost:7777/api/manuals/1/process"
```

### 9. Get Error Codes
Get all error codes extracted from a manual.

**Endpoint:** `/api/manuals/<manual_id>/error-codes`  
**Method:** `GET`  

**Example:**
```bash
curl "http://localhost:7777/api/manuals/1/error-codes"
```

### 10. Get Part Numbers
Get all part numbers extracted from a manual.

**Endpoint:** `/api/manuals/<manual_id>/part-numbers`  
**Method:** `GET`  

**Example:**
```bash
curl "http://localhost:7777/api/manuals/1/part-numbers"
```

### 11. Get Manual Components
Parse a manual into key structural components (exploded views, installation instructions, error code tables, troubleshooting flowcharts, etc.) identified by page number ranges.

**Endpoint:** `/api/manuals/<manual_id>/components`  
**Method:** `GET`  

**Example:**
```bash
curl "http://localhost:7777/api/manuals/1/components"
```

**Response Format:**
```json
{
  "manual_id": 1,
  "title": "2020 Toyota Camry Owner Manual",
  "make": "Toyota",
  "model": "Camry",
  "components": {
    "table_of_contents": {
      "title": "Table of Contents",
      "start_page": 1,
      "end_page": 4,
      "description": "Lists all sections of the manual with page numbers",
      "key_information": ["Chapter listings", "Page references"]
    },
    "exploded_view": {
      "title": "Component Diagrams",
      "start_page": 23,
      "end_page": 35,
      "description": "Detailed diagrams showing part breakdowns",
      "key_information": ["Engine components", "Transmission parts", "Suspension assembly"]
    },
    "error_code_table": {
      "title": "Diagnostic Trouble Codes",
      "start_page": 87,
      "end_page": 92,
      "description": "Table of error codes with descriptions and resolutions",
      "key_information": ["Engine codes", "Transmission codes", "ABS codes", "Resolution steps"]
    },
    "installation_instructions": {
      "title": "Part Installation Procedures",
      "start_page": 102,
      "end_page": 115,
      "description": "Step-by-step instructions for installing replacement parts",
      "key_information": ["Tools required", "Torque specifications", "Safety precautions"]
    },
    "troubleshooting_guide": {
      "title": "Troubleshooting Guide",
      "start_page": 120,
      "end_page": 135,
      "description": "Flowcharts and guides for diagnosing common problems",
      "key_information": ["Symptom-based diagnosis", "Recommended tests", "Solution paths"]
    }
  }
}
```

## Parts API

### 1. List All Parts
Get all parts with pagination and filtering.

**Endpoint:** `/api/parts`  
**Method:** `GET`  
**Parameters:**  
- `page`: Page number - default: 1
- `per_page`: Items per page - default: 20
- `name`: Filter by part name
- `number`: Filter by part number

**Example:**
```bash
curl "http://localhost:7777/api/parts?page=1&per_page=10&name=filter"
```

### 2. Resolve Generic Part
Convert a generic part description to OEM part numbers.

**Endpoint:** `/api/parts/resolve`  
**Method:** `POST`  
**Parameters:**  
- `description` (required): Generic part description
- `make`: Vehicle make
- `model`: Vehicle model
- `year`: Vehicle year

**Example:**
```bash
curl -X POST "http://localhost:7777/api/parts/resolve" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Air filter",
    "make": "Toyota",
    "model": "Camry",
    "year": "2020"
  }'
```

### 3. Get Part by ID
Retrieve details for a specific part.

**Endpoint:** `/api/parts/<part_id>`  
**Method:** `GET`  

**Example:**
```bash
curl "http://localhost:7777/api/parts/1"
```

### 4. Create Part
Add a new part to the database.

**Endpoint:** `/api/parts`  
**Method:** `POST`  
**Parameters:**  
- `name` (required): Part name
- `number` (required): Part number
- `description`: Part description
- `type`: Part type
- `specifications`: Technical specifications

**Example:**
```bash
curl -X POST "http://localhost:7777/api/parts" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Air Filter",
    "number": "17801-0H080",
    "description": "Engine air filter for Toyota Camry 2020",
    "type": "filter",
    "specifications": "High-flow, OEM replacement"
  }'
```

## Suppliers API

### 1. Search for Suppliers
Find suppliers for a specific part number.

**Endpoint:** `/api/suppliers/search`  
**Methods:** `GET`, `POST`  
**Parameters:**  
- `part_number` (required): OEM or generic part number
- `oem_only`: Limit to OEM parts only (true/false) - default: false
- `make`: Vehicle make
- `model`: Vehicle model

**Example:**
```bash
curl -X POST "http://localhost:7777/api/suppliers/search" \
  -H "Content-Type: application/json" \
  -d '{
    "part_number": "17801-0H080",
    "oem_only": true,
    "make": "Toyota",
    "model": "Camry"
  }'
```

### 2. List All Suppliers
Get all suppliers with pagination and filtering.

**Endpoint:** `/api/suppliers`  
**Method:** `GET`  
**Parameters:**  
- `page`: Page number - default: 1
- `per_page`: Items per page - default: 20
- `name`: Filter by supplier name
- `domain`: Filter by domain
- `min_reliability`: Filter by minimum reliability score

**Example:**
```bash
curl "http://localhost:7777/api/suppliers?page=1&per_page=10&min_reliability=0.8"
```

### 3. Create Supplier
Add a new supplier to the database.

**Endpoint:** `/api/suppliers`  
**Method:** `POST`  
**Parameters:**  
- `name` (required): Supplier name
- `domain` (required): Domain name
- `website`: Website URL
- `reliability_score`: Reliability score (0-1)

**Example:**
```bash
curl -X POST "http://localhost:7777/api/suppliers" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Premium Auto Parts",
    "domain": "premiumautoparts.com",
    "website": "https://premiumautoparts.com",
    "reliability_score": 0.9
  }'
```

### 4. Get Supplier by ID
Retrieve details for a specific supplier.

**Endpoint:** `/api/suppliers/<supplier_id>`  
**Method:** `GET`  

**Example:**
```bash
curl "http://localhost:7777/api/suppliers/1"
```

### 5. Update Supplier
Update supplier information.

**Endpoint:** `/api/suppliers/<supplier_id>`  
**Method:** `PUT`  
**Parameters:** Any supplier fields to update

**Example:**
```bash
curl -X PUT "http://localhost:7777/api/suppliers/1" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Supplier Name",
    "reliability_score": 0.95
  }'
```

### 6. Delete Supplier
Remove a supplier from the database.

**Endpoint:** `/api/suppliers/<supplier_id>`  
**Method:** `DELETE`  

**Example:**
```bash
curl -X DELETE "http://localhost:7777/api/suppliers/1"
```

## Profiles API

### 1. List All Profiles
Get all billing profiles with pagination.

**Endpoint:** `/api/profiles`  
**Method:** `GET`  
**Parameters:**  
- `page`: Page number - default: 1
- `per_page`: Items per page - default: 20

**Example:**
```bash
curl "http://localhost:7777/api/profiles"
```

### 2. Create Profile
Add a new billing profile.

**Endpoint:** `/api/profiles`  
**Method:** `POST`  
**Parameters:**  
- `name` (required): Profile name
- `billing_address` (required): Billing address object
- `shipping_address`: Shipping address object
- `payment_info` (required): Payment information object

**Example:**
```bash
curl -X POST "http://localhost:7777/api/profiles" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Personal Account",
    "billing_address": {
      "name": "John Doe",
      "address1": "123 Main St",
      "city": "Anytown",
      "state": "CA",
      "zip": "12345",
      "phone": "555-123-4567"
    },
    "shipping_address": {
      "name": "John Doe",
      "address1": "123 Main St",
      "city": "Anytown",
      "state": "CA",
      "zip": "12345",
      "phone": "555-123-4567"
    },
    "payment_info": {
      "card_number": "4111111111111111",
      "name": "John Doe",
      "exp_month": "12",
      "exp_year": "2025",
      "cvv": "123"
    }
  }'
```

### 3. Get Profile by ID
Retrieve details for a specific profile.

**Endpoint:** `/api/profiles/<profile_id>`  
**Method:** `GET`  
**Parameters:**  
- `include_sensitive`: Include sensitive information (true/false) - default: false

**Example:**
```bash
curl "http://localhost:7777/api/profiles/1?include_sensitive=true"
```

### 4. Update Profile
Update profile information.

**Endpoint:** `/api/profiles/<profile_id>`  
**Method:** `PUT`  
**Parameters:** Any profile fields to update

**Example:**
```bash
curl -X PUT "http://localhost:7777/api/profiles/1" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Profile Name",
    "billing_address": {
      "name": "John Smith",
      "address1": "456 New St",
      "city": "Anytown",
      "state": "CA",
      "zip": "12345",
      "phone": "555-123-4567"
    }
  }'
```

### 5. Delete Profile
Remove a profile from the database.

**Endpoint:** `/api/profiles/<profile_id>`  
**Method:** `DELETE`  

**Example:**
```bash
curl -X DELETE "http://localhost:7777/api/profiles/1"
```

## Purchases API

### 1. List All Purchases
Get all purchases with pagination and filtering.

**Endpoint:** `/api/purchases`  
**Method:** `GET`  
**Parameters:**  
- `page`: Page number - default: 1
- `per_page`: Items per page - default: 20
- `status`: Filter by status ("pending", "completed", "failed")

**Example:**
```bash
curl "http://localhost:7777/api/purchases?page=1&per_page=10&status=completed"
```

### 2. Create Purchase
Initiate an automated purchase.

**Endpoint:** `/api/purchases`  
**Method:** `POST`  
**Parameters:**  
- `part_number` (required): Part number to purchase
- `supplier_url` (required): URL of the supplier listing
- `billing_profile_id` (required): ID of the billing profile to use
- `quantity`: Quantity to purchase - default: 1

**Example:**
```bash
curl -X POST "http://localhost:7777/api/purchases" \
  -H "Content-Type: application/json" \
  -d '{
    "part_number": "17801-0H080",
    "supplier_url": "https://www.example.com/part/17801-0H080",
    "billing_profile_id": 1,
    "quantity": 2
  }'
```

### 3. Get Purchase by ID
Retrieve details for a specific purchase.

**Endpoint:** `/api/purchases/<purchase_id>`  
**Method:** `GET`  

**Example:**
```bash
curl "http://localhost:7777/api/purchases/1"
```

### 4. Cancel Purchase
Cancel a pending purchase.

**Endpoint:** `/api/purchases/<purchase_id>/cancel`  
**Method:** `POST`  

**Example:**
```bash
curl -X POST "http://localhost:7777/api/purchases/1/cancel"
```

## Test All Endpoints

Here's a comprehensive script to test all endpoints:

```bash
#!/bin/bash

echo "Testing Manual Purchase Agent API"
echo "================================="

BASE_URL="http://localhost:7777"

# Test manual search
echo -e "\n\nTesting manual search:"
curl -s -X POST "${BASE_URL}/api/manuals/search" \
  -H "Content-Type: application/json" \
  -d '{"make":"Toyota", "model":"Camry 2020", "manual_type":"technical"}' | python -m json.tool

# Test supplier search
echo -e "\n\nTesting supplier search:"
curl -s -X POST "${BASE_URL}/api/suppliers/search" \
  -H "Content-Type: application/json" \
  -d '{"part_number":"17801-0H080", "make":"Toyota", "model":"Camry"}' | python -m json.tool

# Test part resolution
echo -e "\n\nTesting part resolution:"
curl -s -X POST "${BASE_URL}/api/parts/resolve" \
  -H "Content-Type: application/json" \
  -d '{"description":"Air filter", "make":"Toyota", "model":"Camry", "year":"2020"}' | python -m json.tool

# List all manuals
echo -e "\n\nListing all manuals:"
curl -s "${BASE_URL}/api/manuals?page=1&per_page=5" | python -m json.tool

# List all suppliers
echo -e "\n\nListing all suppliers:"
curl -s "${BASE_URL}/api/suppliers?page=1&per_page=5" | python -m json.tool

# List all parts
echo -e "\n\nListing all parts:"
curl -s "${BASE_URL}/api/parts?page=1&per_page=5" | python -m json.tool

echo -e "\n\nAPI tests completed!"
```