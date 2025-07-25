# Equipment CSV Processing Scripts

These scripts process the `foodservice-equipment-list.csv` file through your API endpoints to enrich the data with photos, manuals, part numbers, and supplier information.

## Files Created

1. **`process_equipment_csv.py`** - Main processing script with enhanced logging and progress bars
2. **`test_process.py`** - Test script for processing first few rows
3. **`foodservice-equipment-list.csv`** - Input data (converted from markdown)
4. **`csv_processing_requirements.txt`** - Python dependencies

## Prerequisites

Install required Python packages:
```bash
pip install -r csv_processing_requirements.txt
```

Or manually:
```bash
pip install requests tqdm
```

## Output Format

The processed CSV will have these columns:
- Make, Model, Part Name (original data)
- Equipment Photo (link to model photo)
- Manual 1-5 (links to up to 5 manuals)
- OEM Part Verified (Verified/Not Verified status)
- OEM Part Number (resolved OEM part number)
- Part Photo (link to part photo)
- Alternate Part Numbers (comma-separated list)
- Supplier 1-5 (links to top 5 suppliers)

## Usage

### Test First (Recommended)
```bash
# Process first 3 rows for testing with enhanced logging
python test_process.py
```

This will show you:
- Real-time progress with emojis and colors
- API call details and timing
- Success/error counts
- Sample output preview

### Process Full Dataset
```bash
# Process all rows (will take ~2 hours for 950+ rows!)
python process_equipment_csv.py foodservice-equipment-list.csv

# Process with custom output and log files
python process_equipment_csv.py foodservice-equipment-list.csv \
  -o full_processed_equipment.csv \
  --log-file full_processing.log

# Process specific range of rows (great for resuming)
python process_equipment_csv.py foodservice-equipment-list.csv \
  --start-row 100 --max-rows 50

# Process with longer delay (if API rate limiting occurs)
python process_equipment_csv.py foodservice-equipment-list.csv --delay 3.0
```

### Enhanced Features

**🎯 Real-time Progress Bar:**
```
Processing...|████████████████████| 25/950 [00:45<28:30, 1.2rows/s]
```

**📊 Live Statistics Every 10 Rows:**
- Success/error counts
- Processing rate (rows/minute)
- ETA (estimated time remaining)

**💾 Immediate CSV Writing:**
- Each row is written and flushed immediately
- Safe to interrupt - all completed work is saved
- Resume from any row with `--start-row`

**📋 Detailed Logging:**
```
2024-01-01 12:00:01 - INFO - 🚀 STARTING ROW 1 | make=Hobart | model=HL600
2024-01-01 12:00:02 - INFO - 🔗 API: Calling /api/enrichment | method=POST
2024-01-01 12:00:03 - INFO - ✅ API call completed | status=200 | elapsed_sec=1.2
2024-01-01 12:00:04 - INFO - ✅ Equipment photo found | url=https://...
```

### Advanced Options
```bash
# See all options
python process_equipment_csv.py --help

# Custom API base URL
python process_equipment_csv.py foodservice-equipment-list.csv --base-url http://localhost:8080

# Resume from specific row
python process_equipment_csv.py foodservice-equipment-list.csv --start-row 100 --max-rows 100
```

## API Endpoints Used

The script replicates v3 demo functionality using these endpoints:

1. **`/api/enrichment`** - Get equipment and part photos
2. **`/api/manuals/search`** - Find technical manuals 
3. **`/api/parts/resolve`** - Resolve part descriptions to OEM numbers
4. **`/api/parts/find-similar`** - Find similar parts when verification fails
5. **`/api/suppliers/search`** - Find suppliers for verified parts

## Processing Logic

For each equipment row:

1. **Equipment Info**: Uses enrichment API to get equipment photo
2. **Manual Search**: Searches for up to 5 manuals using make/model
3. **Part Resolution**: 
   - Tries to resolve part description to OEM part number
   - Uses manual search and web search methods
   - Validates part numbers using SerpAPI
4. **Alternate Parts**: If verification fails, finds similar parts
5. **Supplier Search**: For verified parts, finds top 5 suppliers
6. **Photo Enrichment**: Gets part photos for verified OEM parts

## Performance Notes

- **Processing Time**: ~5-10 seconds per row (with API delays)
- **Total Estimate**: ~950 rows × 7 seconds = ~110 minutes for full dataset
- **Rate Limiting**: 1-2 second delay between API calls (configurable)
- **Error Handling**: Continues processing even if individual rows fail

## Monitoring Progress

The script logs detailed progress:
```
[2024-01-01 12:00:01] Processing: Hobart HL600 - Spiral Dough Hook
[2024-01-01 12:00:02] Getting photo and manuals for Hobart HL600
[2024-01-01 12:00:05] Resolving part: 'Spiral Dough Hook' for Hobart HL600
[2024-01-01 12:00:08] Searching suppliers for part ABC123
[2024-01-01 12:00:10] Completed row 1, processed 1 total
```

## Error Recovery

If processing fails or is interrupted:

1. **Resume from specific row**: Use `--start-row` option
2. **Process in chunks**: Use `--max-rows` to process in batches
3. **Check logs**: All errors are logged with timestamps
4. **Partial data**: Successfully processed rows are saved immediately

## Example Output Row

```csv
Make,Model,Part Name,Equipment Photo,Manual 1,Manual 2,Manual 3,Manual 4,Manual 5,OEM Part Verified,OEM Part Number,Part Photo,Alternate Part Numbers,Supplier 1,Supplier 2,Supplier 3,Supplier 4,Supplier 5
Hobart,HL600,Spiral Dough Hook,https://example.com/hobart-hl600.jpg,https://manuals.com/hobart-hl600-service.pdf,https://manuals.com/hobart-hl600-parts.pdf,,,,,Verified,HOOK-123-HL600,https://parts.com/hook-123.jpg,"ALT-HOOK-456, GENERIC-HOOK-789",https://supplier1.com/hook-123,https://supplier2.com/hook-123,https://supplier3.com/hook-123,,
```

## Requirements

- Python 3.6+
- `requests` library (`pip install requests`)
- API server running on localhost:7777 (or custom URL)
- Valid API keys configured in the server environment

## Troubleshooting

### Common Issues

1. **Connection refused**: Ensure API server is running
2. **Rate limiting**: Increase `--delay` parameter
3. **Memory issues**: Process in smaller chunks with `--max-rows`
4. **Timeout errors**: Check API server logs for performance issues

### API Server Requirements

Make sure these environment variables are set:
- `SERPAPI_KEY` - For part validation
- `OPENAI_API_KEY` - For AI processing
- `ENCRYPTION_KEY` - For secure operations

Start the API server:
```bash
# From project root
./start_services.sh
# OR
flask run --host=0.0.0.0 --port=7777
```