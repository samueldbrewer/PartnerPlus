# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an API scraper specifically designed to extract data from PartsTown.com (www.partstown.com), a commercial equipment parts supplier. The project focuses on discovering and accessing public API endpoints for manufacturers, models, parts data, product images, and documentation.

## Key Architecture

The project appears to be a data collection tool that has successfully mapped out PartsTown's API structure through reconnaissance. It uses Playwright with Chromium to bypass Cloudflare bot detection, which is the primary technical challenge when accessing these APIs.

### Core API Endpoints Discovered:

1. **Manufacturers API**: `/api/manufacturers/` - Returns complete list of 482 manufacturers
2. **Models API**: `/{manufacturer}/parts/models` - Detailed model data with manuals and images
3. **Model Facets API**: `/{manufacturer}/parts/model-facet` - Paginated model data
4. **Part Predictor**: `/part-predictor/{category_code}/models` - Category-specific models
5. **Product Images**: `https://partstown.sirv.com/products/{MANUFACTURER}/{PART_NUMBER}.view` (Sirv CDN)
6. **Documentation**: `/modelManual/{MANUAL_NAME}_{TYPE}.pdf` - Equipment manuals

### Technical Requirements:

- **Browser Automation**: Must use Playwright with Chromium to bypass bot detection
- **Headers**: All API calls require `X-Requested-With: XMLHttpRequest`
- **Timestamps**: Use `v={timestamp}` parameter for cache-busting
- **Authentication**: Not required for read operations on public APIs

## Critical Technical Notes

- **Bot Detection**: PartsTown uses sophisticated Cloudflare protection that blocks curl/requests
- **Bypass Method**: Playwright with Chromium is the only confirmed working approach
- **Site Technology**: Vue.js frontend with AJAX-based API calls
- **Manual Types**: spm (Service & Parts), pm (Parts), wd (Wiring Diagrams), iom (Installation & Operation), sm (Service Manual)

## Security Considerations

This project is designed for legitimate data collection from publicly accessible APIs. All endpoints documented are publicly available and don't require authentication. The tool is defensive in nature, focused on data analysis rather than exploitation.