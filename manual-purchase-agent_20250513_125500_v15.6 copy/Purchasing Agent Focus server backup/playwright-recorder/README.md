# Web Recorder

A simple tool to record and replay web browsing sessions using Playwright.

## Features

- Record mouse clicks, key presses, and form inputs
- Save recordings to JSON files
- Replay recordings with customizable playback options
- Support for variables in form inputs
- Cross-browser support via Playwright

## Installation

```bash
# Install dependencies
npm install

# Install browsers for Playwright
npx playwright install
```

## Usage

### Recording a session

```bash
# Start recording from a URL
node index.js record https://example.com -o my-recording.json

# Press Ctrl+C to stop recording
```

### Replaying a session

```bash
# Replay a recording
node index.js play my-recording.json

# Replay with options
node index.js play my-recording.json --slow-mo 1000 --ignore-errors
```

### Cloning a recording to a different URL

You can apply the same actions recorded on one page to a different URL using the clone command:

```bash
# Run a recording on a different URL
node index.js clone my-recording.json https://different-example.com

# Clone with variables and options
node index.js clone my-recording.json https://different-example.com --vars-file variables.json --slow-mo 0
```

This is useful for running the same actions on multiple product pages that share the same layout or on different environments (staging, production) of the same application.

### Using variables in recordings

You can use variables in your recordings by adding placeholders in the form `[variable_name]` when typing into form fields. During playback, these will be replaced with actual values.

For example, when recording, type `[zip_code]` into a form field, and during playback, that will be replaced with the value you provide.

```bash
# Replay with variables from a JSON file
node index.js play my-recording.json --vars-file variables.json

# Replay with variables directly from command line
node index.js play my-recording.json --vars '{"zip_code":"12345","customer_name":"John Doe"}'
```

Example variables.json file:
```json
{
  "customer_name": "John Doe",
  "phone_number": "555-123-4567",
  "email": "john.doe@example.com",
  "zip_code": "94043"
}
```

### Using dummy values during recording

You can now use dummy values during recording that will be automatically replaced during playback. This allows you to record with realistic data that gets substituted with user-provided variables during playback.

For example, if you create a dummy_values.json file:
```json
{
  "zip_code": "40014",
  "customer_name": "Test User"
}
```

During recording, you can type either the literal dummy value "40014" or the placeholder "[zip_code]" into a form field. During playback, both will be replaced with the user-provided value.

```bash
# Replay with dummy values substitution
node index.js play my-recording.json --vars-file variables.json --dummy-values-file dummy_values.json
```

This makes recordings more flexible, as you can use either placeholder syntax or realistic dummy values during recording, and both will be correctly replaced during playback.

## Options

### Recording options

- `-o, --output <path>` - Output file path (default: ./recordings/recording.json)

### Playback options

- `--headless` - Run in headless mode
- `--slow-mo <ms>` - Slow down execution by specified milliseconds (default: 500)
- `--no-wait` - Do not wait for actions to complete
- `--ignore-errors` - Continue playback on errors
- `--keep-open` - Keep browser open after playback
- `--vars <json>` - JSON string with variables (e.g. '{"zip_code":"12345"}')
- `--vars-file <path>` - Path to JSON file containing variables
- `--dummy-values-file <path>` - Path to JSON file with dummy values that should be replaced with variables

## How it works

The recorder injects JavaScript into the page to capture user interactions and navigation events. These events are saved to a JSON file that can later be replayed using Playwright's automation capabilities.

During recording, you can enter special placeholders like `[zip_code]` in form fields. When replaying, these placeholders will be replaced with the values you provide via `--vars` or `--vars-file`.

## Limitations

- Some complex interactions like drag-and-drop may not be recorded accurately
- Recordings are browser-specific and might behave differently across browsers
- Dynamic content might change between recording and playback sessions