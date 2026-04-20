# GTS NR1 Utils Chrome Extension

A Chrome extension for GTS engineers that intercepts and analyzes NerdGraph and NRQL requests from the New Relic platform and gives easy access to New Relic's Debug Mode.

Consolidates troubleshooting workflows that typically require juggling browser developer tools, the NR1 Debug Mode panel, and information scattered across the New Relic UI into a single side panel.

**Version:** 1.11.0

## Features

- NerdGraph and NRQL request capture with live status monitoring
- Distributed tracing API capture with TRACE badge and Locate on Page
- Dashboard widget correlation with Locate on Page highlighting
- Error, timeout, and multi-account detection
- Owning team identification and source component tracing
- Debug Mode with platform info, nerdpack metadata, and entity GUID decoding
- Full-text search, filtering, and JSON export

For full feature documentation, see the **[User Guide](https://johnathan-smith-gh.github.io/gts-nr1utils-chrome-extension/docs/guide.html)**.
For implementation details, see **[Under The Hood](https://johnathan-smith-gh.github.io/gts-nr1utils-chrome-extension/docs/under-the-hood.html)**.

Both guides are also available locally in the `docs/` folder.

## Installation

1. Clone or download this repository.
2. Open `chrome://extensions/` in Chrome.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the root directory of this project.
5. The GTS NR1 Utils icon will appear in your Chrome toolbar.

## Usage

Click the extension icon to open the side panel. Refresh any already-open New Relic pages for capturing to begin. Use the tabs to switch between **NerdGraph**, **NRQL**, and **Debug Mode**.

See the **[User Guide](https://johnathan-smith-gh.github.io/gts-nr1utils-chrome-extension/docs/guide.html)** for detailed usage instructions.

## Architecture

The extension uses Chrome Manifest V3 with a multi-layer message passing architecture:

```
early-wrap.js (main world, wraps fetch/XHR at document_start)
  ↓ window.postMessage
content.js (isolated world, bridges main world ↔ service worker, widget highlighting)
  ↓ chrome.runtime.sendMessage
background.js (service worker, routes messages + buffers up to 1,000 requests)
  ↓ port.postMessage
Side Panel UI (React + Redux)
```

Request interception is two-phase: a `REQUEST_START` message fires immediately when a request is made (creating a pending entry in the UI), and a `REQUEST_COMPLETE` message fires when the response arrives (updating status, timing, and parsed data).

For full implementation details, see **[Under The Hood](https://johnathan-smith-gh.github.io/gts-nr1utils-chrome-extension/docs/under-the-hood.html)**.

## File Structure

```
├── manifest.json                # Manifest V3 configuration
├── package.json                 # Project metadata
├── sidepanel.html / index.html  # UI entry points
├── scripts/                     # Extension pipeline scripts
│   ├── background.js            # Service worker (message routing, request buffering)
│   ├── content.js               # Content script (message bridge, widget highlight)
│   ├── page-script.js           # Page script (debug/platform info collection)
│   └── early-wrap.js            # Early fetch/XHR interception (document_start)
├── src/                         # React UI source
│   ├── index.js                 # Entry point, port connection, error boundary
│   ├── App.js                   # Main component, request processing, widget map
│   ├── App.css                  # All styling (dark mode, status badges, layout)
│   ├── types.js                 # PageName and LogRequestType enums
│   ├── state/                   # Redux store, slice, and action creators
│   │   ├── store.js
│   │   ├── rootSlice.js
│   │   └── actionCreators.js
│   ├── components/              # UI components
│   │   ├── Navigation.js        # Tabs, filters, export
│   │   ├── Log.js               # Virtualized request list
│   │   ├── LogEntry.js          # Individual request row
│   │   ├── RequestsPage.js      # Request detail panel
│   │   └── DebugInfoPage.js     # Debug mode display
│   └── utils/                   # Parsing and matching utilities
│       ├── findAccountIds.js
│       ├── matchWidgetByNrql.js
│       ├── statusPriority.js
│       ├── graphql/             # GraphQL request parsing
│       ├── nrql/                # NRQL request parsing
│       └── dt/                  # Distributed tracing request parsing
├── docs/                        # Documentation (HTML)
│   ├── guide.html               # User guide
│   └── under-the-hood.html      # Technical architecture
├── icons/                       # Extension icons (16, 48, 128px)
└── snowpack/                    # Snowpack-bundled dependencies
```

## Tech Stack

- **React** + **Redux Toolkit** — UI and state management
- **Snowpack** — ESM-first build tooling
- **react-json-view** — JSON rendering in the detail panel
- **Chrome Manifest V3** — Service worker, content scripts, side panel API
