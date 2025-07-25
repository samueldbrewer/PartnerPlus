# Version History

## Version 6.0.0 (2025-05-13)
- Implemented full PDF processing using GPT-4.1-Nano's million-token context window
- Enhanced manual parsing to send entire PDF content without chunking
- Added standardized fields for error codes and part numbers
- Improved merging of regex and AI-extracted information
- Enhanced CSV export functionality for all extracted data
- Added search functionality for part numbers
- Enhanced UI display with better formatting and organization
- Implemented consistent short descriptions for technical information

## Version 5.0.0 (2025-05-13)
- Removed all simulated/dummy data throughout the application
- Implemented real API functionality in the demo interface
- Enhanced PDF text extraction with better error handling
- Improved API response formatting
- Added basic CSV export functionality
- Added sample processing capability

## Version 4.0.0 (2025-05-13)
- Enhanced API endpoints to support both GET and POST methods
- Added comprehensive API documentation and reference
- Created testing scripts for all API endpoints
- Added support for real API functionality without prefetched data
- Improved error handling and logging
- Added environment configuration for enabling/disabling real purchases
- Fixed Fernet encryption key validation
- Added utility script for generating secure encryption keys

## Version 3.0.0-dev (2025-05-13)
- Added comprehensive web UI with Bootstrap 5 and Vue.js
- Created interactive dashboard with real-time statistics
- Implemented demo mode for enterprise demonstrations
- Added visual workflow for manual processing and part extraction
- Enhanced visualization with Chart.js integration
- Improved navigation and user experience
- Added support for mobile devices
- Added comprehensive documentation

## Version 2.0.0-dev (2025-05-13)
- Updated OpenAI compatibility from v1.6.0 to v0.28.1
- Fixed API client initialization for older API version
- Updated token counting implementation
- Changed port from 5000 to 7777 for better compatibility
- Updated Docker configuration

## Version 1.0.0-dev (2025-05-13)
- Initial implementation of Manual Purchase Agent
- Core functionality for manual finding, parsing, and part resolution
- Basic supplier search and purchase automation
- RESTful API for all components
- SQLite database for development
- Docker support for deployment