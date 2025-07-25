# Manual Purchase Agent API Documentation (v10)

## API Endpoints

### Manuals API

#### Process Multiple Manuals

`POST /api/manuals/multi-process`

Process up to 3 manuals simultaneously and reconcile the results, removing duplicates and selecting the best data where there is overlap.

##### Request Body

```json
{
  "manual_ids": [1, 2, 3]  // Up to 3 manual IDs to process together
}
```

##### Response

```json
{
  "message": "Successfully processed 3 manuals",
  "manuals": [
    {
      "id": 1,
      "title": "2020 Toyota Camry Owner's Manual",
      "make": "Toyota",
      "model": "Camry",
      "year": "2020"
    },
    {
      "id": 2,
      "title": "2020 Toyota Camry Repair Manual",
      "make": "Toyota",
      "model": "Camry",
      "year": "2020"
    },
    {
      "id": 3,
      "title": "2020 Toyota Camry Parts Catalog",
      "make": "Toyota",
      "model": "Camry",
      "year": "2020"
    }
  ],
  "reconciled_results": {
    "error_codes": [
      {
        "code": "P0420",
        "Error Code Number": "P0420",
        "Short Error Description": "Catalyst System Efficiency Below Threshold (Bank 1)",
        "description": "Catalyst System Efficiency Below Threshold (Bank 1)",
        "confidence": 100,
        "manual_count": 3
      }
    ],
    "part_numbers": [
      {
        "code": "17801-0H080",
        "OEM Part Number": "17801-0H080",
        "Short Part Description": "Engine Air Filter for Toyota Camry 2.5L Engine",
        "description": "Engine Air Filter for Toyota Camry 2.5L Engine",
        "confidence": 66.7,
        "manual_count": 2
      }
    ],
    "common_problems": [
      {
        "issue": "Engine oil consumption",
        "solution": "Check PCV valve and oil level regularly"
      }
    ],
    "maintenance_procedures": [
      "Change engine oil and filter every 10,000 miles or 12 months",
      "Replace air filter every 30,000 miles"
    ],
    "safety_warnings": [
      "Disconnect battery before servicing electrical components",
      "Allow engine to cool before servicing hot components"
    ],
    "statistics": {
      "manual_count": 3,
      "raw_error_codes": 45,
      "unique_error_codes": 32,
      "raw_part_numbers": 185,
      "unique_part_numbers": 132
    }
  }
}
```

##### Error Responses

```json
{
  "error": "Missing manual_ids parameter",
  "status": 400
}
```

```json
{
  "error": "Maximum of 3 manual IDs allowed",
  "status": 400
}
```

#### Single Manual Processing

`POST /api/manuals/{id}/process`

Process a single manual to extract error codes and part numbers.

... (other manual endpoints)

### Parts API

#### Resolve Part

`POST /parts/resolve`

Resolves a generic part description to an OEM part number using multiple search methods.

##### Request Body

```json
{
  "description": "front brake pad",           // Required: Generic part description
  "make": "Toyota",                           // Optional: Vehicle/device make
  "model": "Camry",                           // Optional: Vehicle/device model
  "year": "2023",                             // Optional: Vehicle/device year
  "use_database": true,                       // Optional: Whether to search in the database (default: true)
  "use_manual_search": true,                  // Optional: Whether to search in manuals (default: true) 
  "use_web_search": true,                     // Optional: Whether to search on the web (default: true)
  "save_results": true                        // Optional: Whether to save results to database (default: true)
}
```

##### Search Toggle Parameters

The API now supports toggles to control which search methods are used:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| use_database | Boolean | true | Enable or disable database search |
| use_manual_search | Boolean | true | Enable or disable manual search and GPT analysis |
| use_web_search | Boolean | true | Enable or disable web search with GPT |
| save_results | Boolean | true | Enable or disable saving results to the database |

**Notes:**
- At least one search method must be enabled
- Toggle parameters accept boolean values (true/false), strings ("true"/"false"), or integers (1/0)
- If database search finds an exact match, other search methods will not be executed

##### Response

```json
{
  "success": true,
  "part_resolution": {
    "oem_part_number": "04465-33471",
    "manufacturer": "Toyota",
    "description": "Front Brake Pad Set for Toyota Camry 2023",
    "confidence": 0.95,
    "alternate_part_numbers": ["04465-33470", "04465-33450"],
    "source": "manual",
    "manual_analysis": {
      "oem_part_number": "04465-33471",
      "confidence": 0.95,
      "manual_source": "2023 Toyota Camry Parts Catalog",
      "part_found_in_manual": true
    },
    "web_search_analysis": {
      "oem_part_number": "04465-33471",
      "confidence": 0.92,
      "sources": [
        {
          "name": "Toyota Parts Online",
          "url": "https://parts.toyota.com/p/Toyota__/Brake-Pad-Set--Front/63769948/0446533471.html"
        }
      ]
    },
    "matches_web_search": true,
    "search_methods_used": {
      "database": true,
      "manual_search": true,
      "web_search": true
    }
  },
  "message": "Found matching OEM part number in both manual and web search: 04465-33471",
  "search_methods": {
    "database_search": true,
    "manual_search": true,
    "web_search": true,
    "save_to_database": true
  }
}
```

##### Error Responses

```json
{
  "success": false,
  "error": "Description is required",
  "message": "Failed to resolve part"
}
```

```json
{
  "error": "At least one search method must be enabled",
  "message": "Please enable at least one of: database search, manual search, or web search"
}
```

```json
{
  "error": "Invalid parameter format",
  "message": "use_database must be a boolean value, 0/1, or 'true'/'false' string"
}
```

#### Get Parts

`GET /parts`

Gets a list of parts with pagination and optional filtering.

...

#### Create Part

`POST /parts`

Creates a new part entry.

...

#### Get Part

`GET /parts/<part_id>`

Gets a specific part by ID.

...

#### Update Part

`PUT /parts/<part_id>`

Updates a part.

...

#### Delete Part

`DELETE /parts/<part_id>`

Deletes a part.

...

## Usage Examples

### Enable Only Database Search

```json
{
  "description": "air filter",
  "make": "Honda",
  "model": "Accord",
  "year": "2022",
  "use_database": true,
  "use_manual_search": false,
  "use_web_search": false
}
```

### Skip Database, Use Only Web and Manual Search

```json
{
  "description": "timing belt tensioner",
  "make": "Subaru",
  "model": "Outback",
  "year": "2021",
  "use_database": false,
  "use_manual_search": true,
  "use_web_search": true
}
```

### Search Without Saving Results

```json
{
  "description": "cabin air filter",
  "make": "Ford",
  "model": "F-150",
  "year": "2023",
  "save_results": false
}
```