# GTS NR1 Utils Chrome Extension

A Chrome extension for GTS engineers that intercepts and analyzes NerdGraph and NRQL requests from the New Relic platform. Consolidates troubleshooting workflows that typically require juggling DevTools, the NR1 debug panel, and the NerdGraph API Explorer into a single side panel.

**Version:** 1.0.1

## Features

- **NerdGraph Request Capture** — Intercepts all GraphQL queries and mutations, extracts query names, variables, and full responses including errors and owning team metadata.
- **NRQL Request Capture** — Captures direct NRQL requests and extracts embedded NRQL queries from GraphQL payloads.
- **Live Request Monitoring** — Requests appear with a pending indicator when fired and update to success/error/timeout when the response arrives, with response timing.
- **Error & Timeout Detection** — Errors are flagged with red status indicators and banners. Timeout errors are detected and filterable separately.
- **Multi-Account Detection** — Warns when results span multiple account IDs, which may indicate misconfiguration.
- **Owning Team Identification** — Extracts and displays the owning team when an `owningTeam` field is found in the JSON response, for faster escalation. This banner only appears when the field is present — not all responses include it.
- **Search & Filter** — Full-text search across queries, variables, and responses. Filter by errors only or timeouts only.
- **Export** — Select results and export as clean JSON with full context (query, variables, response, timing, metadata).
- **Debug Mode** — Displays platform info (version, region, user ID, account ID), subscribed nerdpack details, and current nerdlet metadata. Updates on SPA navigation.

## Installation

1. Clone or download this repository.
2. Open `chrome://extensions/` in Chrome.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the root directory of this project.
5. The GTS NR1 Utils icon will appear in your Chrome toolbar.

After installing, refresh any already-open New Relic tabs for request capturing to begin. New tabs opened after installation work automatically.

## Usage

1. Navigate to any New Relic page (`*.newrelic.com`).
2. Click the extension icon to open the side panel.
3. Use the tabs to switch between **NerdGraph**, **NRQL**, and **Debug Mode**.
4. Click any captured request in the left panel to view its details on the right.
5. Use the checkboxes to select results, then click **Export** to save as JSON.

## Architecture

The extension uses Chrome Manifest V3 with a multi-layer message passing architecture:

```
early-wrap.js (main world, wraps fetch/XHR at document_start)
  ↓ window.postMessage
content.js (isolated world, bridges main world ↔ service worker)
  ↓ chrome.runtime.sendMessage
background.js (service worker, routes messages + buffers up to 1,000 requests)
  ↓ port.postMessage
Side Panel UI (React + Redux)
```

Request interception is two-phase: a `REQUEST_START` message fires immediately when a request is made (creating a pending entry in the UI), and a `REQUEST_COMPLETE` message fires when the response arrives (updating status, timing, and parsed data).

## File Structure

```
├── manifest.json                # Manifest V3 configuration
├── background.js                # Service worker (message routing, request buffering)
├── content.js                   # Content script (main world ↔ service worker bridge)
├── page-script.js               # Page script (collects debug/platform info)
├── early-wrap.js                # Early fetch/XHR interception (document_start)
├── index.html / sidepanel.html  # Entry points
├── guide.html                   # User guide
├── under-the-hood.html          # Technical architecture documentation
├── icons/                       # Extension icons (16, 48, 128px)
├── dist/                        # Built application
│   ├── App.js                   # Main React component
│   ├── components/              # UI components (Navigation, Log, LogEntry, etc.)
│   ├── state/                   # Redux store, slice, and action creators
│   └── utils/                   # GraphQL/NRQL parsing and helper utilities
└── snowpack/                    # Snowpack-bundled dependencies
```

## Tech Stack

- **React** + **Redux Toolkit** — UI and state management
- **Snowpack** — ESM-first build tooling
- **react-json-view** — JSON rendering in the detail panel
- **Chrome Manifest V3** — Service worker, content scripts, side panel API
