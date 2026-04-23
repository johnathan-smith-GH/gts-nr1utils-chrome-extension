# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Loading the Extension

No build step required. Load directly in Chrome:

1. Open `chrome://extensions/` → enable Developer Mode
2. Click "Load unpacked" → select this folder
3. After code changes, click "Reload" on the extension card

## Architecture

**Multi-layer message passing** across four Chrome execution contexts:

```
early-wrap.js  (MAIN world, document_start)  →  window.postMessage
content.js     (isolated world)               →  chrome.runtime.sendMessage
background.js  (service worker)               →  chrome.storage.session
sidepanel      (React/Redux UI)               ←  chrome.runtime.onMessage
```

**Two-phase request capture:**
- `REQUEST_START` fires immediately → creates a pending entry in the UI
- `REQUEST_COMPLETE` fires on response → updates status, timing, parsed data

**Key files:**
- `scripts/early-wrap.js` — Wraps `fetch`/XHR at `document_start` in the MAIN world to intercept requests before the page can modify them
- `scripts/content.js` — Bridges main world ↔ service worker; handles widget highlight messages
- `scripts/background.js` — Service worker: message routing, buffers up to 1,000 requests in `chrome.storage.session`
- `src/App.js` — Main React component; processes raw messages into typed request objects, manages widget map
- `src/state/rootSlice.js` — All Redux state; `widgetMap` and `preserveLog` persist across service worker restarts

**Utilities (`src/utils/`):**
- `graphql/buildGraphqlRequests.js` — Parses GQL request + response pairs into display objects
- `nrql/extractNrqlFromGraphql.js` — Extracts embedded NRQL from GQL variable payloads
- `dt/buildDtRequests.js` — Parses distributed tracing API responses
- `matchWidgetByNrql.js` — Correlates captured NRQL queries to dashboard widget DOM elements

## Dependencies

Pre-bundled in `snowpack/pkg/` — no `npm install` needed. Do not modify files in that directory.
