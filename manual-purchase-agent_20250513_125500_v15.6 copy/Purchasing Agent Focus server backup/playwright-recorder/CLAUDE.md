# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Playwright-recorder is a browser automation tool that records and replays user interactions using Playwright. It's designed for automating web workflows, testing, and repetitive tasks, particularly focused on e-commerce scenarios.

## Commands

### Build and Development

```bash
# Install dependencies
npm install

# Install Playwright browsers (required after npm install)
npx playwright install

# No build step required - pure JavaScript project
# No linting or testing commands configured
```

### Core Commands

```bash
# Record a browsing session
node index.js record <url> [-o output.json]

# Replay a recording
node index.js play <recording.json> [options]

# Clone recording to different URL
node index.js clone <recording.json> <new-url> [options]

# Start API server
npm run start:api
# Or with custom port
PORT=8080 npm run start:api
```

### Fast Playback Examples

```bash
# Maximum speed playback
node index.js play recording.json --slow-mo 0 --fast

# Headless mode with error handling
node index.js play recording.json --headless --ignore-errors --fast
```

## Architecture

### Recording System (`src/recorder.js` and `src/recorder-enhanced.js`)

The recorder injects JavaScript to capture DOM events:
- **Event Capture**: Clicks (with CSS selectors and coordinates), text input (incremental), keyboard events (Tab, Enter), scrolling, navigation
- **Selector Generation**: Creates robust CSS selectors with fallback to coordinates
- **Storage Format**: JSON with version, timestamp, URL, and action array
- **Video Recording**: Saves .webm files in `recordings/` directory
- **Enhanced Recorder**: Captures detailed element attributes for better replay accuracy

### Playback Engine (`src/player.js`)

Replays recordings with intelligent handling:
- **Variable Substitution**: Replaces `[variable_name]` placeholders and dummy values
- **Smart Action Verification**: Detects if clicks/keypresses actually had an effect
- **Progressive Fallback Strategy**:
  1. Blind click/action at recorded coordinates (fastest)
  2. If no DOM change detected, try selector-based action
  3. If still no effect, search in iframes
  4. Final fallback: try nearby coordinates
- **DOM Change Detection**: Monitors HTML changes to verify action effectiveness
- **Smart Waiting**: Different delays for navigation (3s) vs other actions
- **Error Recovery**: Retry logic with intelligent fallback strategies
- **Performance Mode**: `--fast` flag consolidates input actions and caches elements
- **Iframe Support**: Automatic iframe searching when main frame actions fail

### API Server (`src/api-server.js`)

Express-based API for programmatic automation:
- **POST /api/purchases**: Execute purchase flow on new product URL using existing recording
- **GET /api/recordings**: List all available recordings
- **GET /api/health**: Health check endpoint
- **Recording Matching**: Automatically finds appropriate recording based on base URL
- **Temporary Variable Files**: Creates temp files for variable substitution during API calls

### Key Implementation Details

**Recording JSON Structure**:
```json
{
  "version": "1.0",
  "timestamp": "2025-05-22T16:30:00.000Z",
  "url": "https://example.com",
  "actions": [
    {
      "type": "click",
      "selector": "button.submit",
      "x": 100,
      "y": 200,
      "timestamp": 1000
    }
  ]
}
```

**Variable System**:
- Recording: Use `[variable_name]` or dummy values from `dummy_values.json`
- Playback: Both get replaced from `--vars-file` or `--dummy-values-file`
- Common variables: zip_code, customer_name, phone_number, email
- API calls: Variables passed in request body are written to temporary files

**Performance Optimizations**:
- Element caching in fast mode
- Consolidated input actions (multiple keystrokes combined)
- Reduced wait times with `--no-wait`
- Parallel selector lookups
- Coordinate-based actions as first attempt (fastest)

**Error Handling Patterns**:
- DOM change verification after each action
- Retry with different strategies on failure
- `--ignore-errors` flag for continuous execution
- Detailed error logging with action context

## Important Files

- **recordings/etundra.json**: Pre-recorded purchase flow for etundra.com
- **recordings/webstaurantstore.json**: Pre-recorded purchase flow for webstaurantstore.com
- **recordings/partstown.json**: Pre-recorded purchase flow for partstown.com
- **variables.json**: User data template for form field substitution
- **dummy_values.json**: Placeholder values that get replaced during playback
- **temp-vars-*.json**: Temporary variable files created by API (can be cleaned up)