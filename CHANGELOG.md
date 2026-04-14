# Changelog

## 1.8.13
- Add try-catch around `JSON.parse` calls in `buildNrqlRequests.js` to prevent crashes from malformed NRQL payloads
- Auto-remove XHR event listeners after firing via `{ once: true }` in early-wrap.js and page-script.js to prevent listener accumulation
- Fix widget highlight overlay: prevent double-clearInterval race and guard DOM removal in fade-out callbacks
- Add `[currentQueryIdx]` dependency array to search-reset useEffect in RequestsPage.js (was running every render)
- Clean up CSS Highlight API ranges and matchRangesRef on effect cleanup in RequestsPage.js
- Normalize mixed `const`/`var` declarations in page-script.js to consistent `var`
- Deduplicate `findAccountIds`: remove inline copies in RequestsPage.js and Log.js, import from utils

## 1.8.12
- Add React Error Boundary to prevent blank UI on component errors — shows error message with reload button
- Add Content Security Policy to manifest.json (`script-src 'self'; object-src 'self'`)
- Add parentheses for operator precedence clarity in App.js widget map extraction
- Clean up SPA navigation poll interval on page unload in page-script.js
- Rename `decodeUrl` to `decodeUrlParams` in getParamString.js and remove stale FIXME comments
- Add script.onerror handler in content.js for page-script.js load failures

## 1.8.11
- Enable GitHub Pages to serve User Guide and Under The Hood as rendered HTML
- Update README doc links to point to GitHub Pages URLs instead of raw HTML files

## 1.8.10
- Restructure README as a concise landing page: replace detailed feature descriptions with a summary list pointing to the User Guide and Under The Hood docs
- Slim down README Usage section to a brief paragraph with pointer to User Guide
- Eliminates content duplication between README and User Guide — User Guide is now the single authoritative feature reference

## 1.8.9
- Security: restrict all `postMessage` calls to same-origin (`window.location.origin`) instead of wildcard (`*`) across early-wrap.js, page-script.js, and content.js
- Add try-catch around `JSON.parse` calls in `buildGraphqlRequests.js` to prevent UI crashes from malformed payloads
- Add null checks for `chrome.tabs.query` results in background.js to prevent runtime errors when no active tab is found
- Add `.catch()` handlers to unguarded Promise chains in early-wrap.js to prevent unhandled rejections
- Add XHR `error` and `abort` event handlers in early-wrap.js and page-script.js so failed/aborted requests are tracked instead of silently lost

## 1.8.8
- Fix Debug Mode repo links: convert SSH git URLs (git@host:org/repo.git) to HTTPS for browser navigation
- Remove "Other" section and "Submit a Feature Request" from Debug Mode
- Move Associated Teams section to top of Debug Mode page

## 1.8.7
- Add Entity GUID decoding to Debug Mode: when an entity GUID is detected, the decoded Account ID, Domain, Type, and Domain ID are displayed below it
- Add URL path fallback for entity GUID extraction when navigation state does not provide it (e.g., "entity isn't available in this account" error pages)

## 1.8.6
- Reorganize User Guide: group sections into Toolbar Controls, Dashboard Features; add table of contents with anchor links
- Move Under The Hood callout to prominent position below subtitle
- Rename title from "User's Guide" to "User Guide"
- Remove Keyboard Navigation section

## 1.8.5
- Organize README Features into four categories: Request Capture & Monitoring, Dashboard Intelligence, Troubleshooting Context, Search/Filter & Export

## 1.8.4
- Reconcile README and Under The Hood technical sections: README is now a concise quick-reference with pointer to Under The Hood for full details
- Add Tech Stack section to Under The Hood (React, Redux Toolkit, Snowpack, react-json-view, CSS Custom Highlight API, File System Access API)
- Update README file structure descriptions to reflect current roles (content.js widget highlight, early-wrap.js call stack capture, etc.)
- Update Under The Hood Architecture Overview to document content.js widget highlight role

## 1.8.3
- Update User Guide: add Dashboard Widget Placeholders section, Preserve Log, Keyboard Navigation, scroll-to-lazy-load details for Locate on Page
- Update Under The Hood: rewrite Locate on Page section (content.js architecture, 8 DOM strategies, scroll-to-lazy-load, fallback tab routing, debug logging), add Widget Placeholders and Widget Map Management sections
- Update README: add Preserve Log and Keyboard Navigation features
- Rename "Account IDs Being Queried" to "Account ID Identifiers Being Queried" across all docs

## 1.8.2
- Backfill CHANGELOG with all 1.8.0 features that were missing (placeholder entries, dashboard notice, overlay fixes, widget map merging, etc.)
- Add Dashboard Widget Placeholders to README feature list
- Update Locate on Page README description to mention scroll-to-lazy-load

## 1.8.1
- Fix Locate on Page for lazy-loaded widgets by moving highlight logic to content script
- Add scroll-to-lazy-load: incrementally scrolls dashboard to trigger widget rendering, then highlights
- Add 8 DOM search strategies with debug logging for diagnosing title-matching failures
- Add fallback tab routing when active tab message delivery fails
- Update dashboard notice to mention 'Locate on page' as an option for loading gray entries
- Rename 'Account IDs Being Queried' to 'Account ID Identifiers Being Queried'

## 1.8.0
- Add dashboard widget correlation: match NRQL requests to widgets by comparing NRQL query text from GraphQL dashboard responses
- Add "Locate on Page" feature: button to scroll to and highlight matched dashboard widgets with a purple overlay
- Add grey placeholder entries for widget-defined NRQL queries not yet captured as network requests
- Add "Dashboard detected" notice banner explaining grey entries and how to load them
- Add inaccessible widget detection with amber warning banner and dashboard owner info
- Add call stack capture for source component tracing as fallback widget correlation
- Add fuzzy matching and widget title search in the log filter
- Add widget hint extraction from GraphQL variables (entity GUID, widget ID, dashboard GUID)
- Trigger NR1 lazy loading after Locate on Page scroll via IntersectionObserver nudge
- Merge widget maps instead of replacing to support multi-tab dashboards
- Clear widget map (grey placeholders) when Clear Log is clicked
- Multiple fallback strategies for finding widgets in the DOM (text, innerText, React fiber, TreeWalker)
- Fix Locate on Page overlay positioning and scroll-settle detection
- Fix toolbar button layout to prevent Locate on Page from being hidden
- Fix timing and memoization issues with widgetMap re-render propagation
- Fix dark mode pill colors in User Guide
- Update User Guide and Under The Hood documentation

## 1.7.0
- Fix status badges to accurately reflect extension behavior: error responses show red query pill with green timing pill, timeouts show both red

## 1.6
- Improve status indicator documentation in README and User Guide to show all four states (pending, success, error, timeout) with both query name and timing pill colors

## 1.5
- Add colored status badges to README for Live Request Monitoring indicators

## 1.4
- Fix Back to User Guide button: now fixed top-left (matching Under The Hood placement), blue color, with left arrow

## 1.3
- Update README description and feature details for clarity

## 1.2
- Remove version from extension name (Chrome already displays it)
- Switch to x.y versioning format
- Update extension description
- Add GitHub Action for automatic releases on version bump

## 1.0.1
- Clarify owning team feature only appears when found in JSON response

## 1.0
- Initial release
