# GTS NR1 Utils Chrome Extension

A Chrome extension for GTS engineers that intercepts and analyzes NerdGraph and NRQL requests from the New Relic platform and gives easy access to New Relic's Debug Mode.

Consolidates troubleshooting workflows that typically require juggling browser developer tools, the NR1 Debug Mode panel, and information scattered across the New Relic UI into a single side panel.

**Version:** 1.5

## Features

- **NerdGraph Request Capture** — Intercepts all GraphQL queries and mutations, extracts query names, variables, and full responses.
- **NRQL Request Capture** — Captures direct NRQL requests and extracts embedded NRQL queries from GraphQL payloads.
- **Live Request Monitoring** — Requests appear with a pending indicator when fired and update to success/error/timeout along with response timing.
  - ![PENDING](https://img.shields.io/badge/PENDING-eab308?style=flat-square) Request is in flight. The timer counts up in real time showing elapsed time.
  - ![RESPONSE TIME](https://img.shields.io/badge/RESPONSE_TIME-22c55e?style=flat-square) Request completed successfully. Shows the total response time.
  - ![RESPONSE TIME](https://img.shields.io/badge/RESPONSE_TIME-ef4444?style=flat-square) Request returned errors or timed out.
- **Error & Timeout Detection** — Errors are flagged with red status indicators and banners. Timeouts are flagged with red status indicators.
- **Multi-Account Detection** — Warns when NRQL is querying more than one account ID, which can give insight into visualizations that are querying more than one account and help identify a customer user's lack of access to all involved accounts.
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

## Usage

1. After installing, Click the extension icon to open the side panel.
2. Refresh any already-open New Relic page (`*.newrelic.com`) for request capturing to begin.
4. Use the tabs to switch between **NerdGraph**, **NRQL**, and **Debug Mode**.
5. Click any captured request in the left panel to view its details on the right.
6. Use the checkboxes to select results, then click **Export** to save as JSON if desired.

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
