# Changelog

## 1.13.0
### New Features
- Add static widget detection for hardcoded Mermaid diagrams — `viz.markdown` widgets whose content contains `mermaid` appear as `STATIC` entries in the NRQL tab with a "Hardcoded data" label and a grey static badge; the detail view shows a "Static Hardcoded Widget" banner with the raw diagram source, and the pie-chart title is extracted for Locate on Page
- Add signal evaluation capture — requests to the bork-sniffer signal evaluation endpoint (`/v5`) are now captured and parsed as `CHART` entries in the NRQL tab, enabling placeholder resolution for signal-based dashboard widgets
- Add duplicate widget occurrence index — when multiple widgets share the same title on the same dashboard page, each is assigned an occurrence index (sorted by layout row→column) so Locate on Page always targets the correct instance; requests claim slots in order to prevent two captures from matching the same widget
- Add dashboard page tab auto-switching on Locate on Page — if the matched widget is on a dashboard page tab that is not currently visible, the extension automatically clicks the correct tab before highlighting (600ms delay to allow tab render)
- Add exponential backoff on port reconnection — disconnects now retry with `500ms × 2ⁿ` delay (capped at 30 seconds), up to 10 attempts; outbound messages are queued (up to 200) during reconnection and flushed on reconnect, preventing message loss on service worker restarts
- Add full vs. SPA navigation distinction — full page navigations now trigger `clearAllRequests({ clearWidgets: true })` to reset both requests and the widget map; SPA navigations (popstate/hashchange) send `PAGE_NAVIGATED` without clearing the widget map

### Bug Fixes
- Fix DOM search Strategy 3b missing from widget locate sequence — `textContent.startsWith()` match on small elements is now included as the 4th strategy (between size-bounded textContent and title-attribute strategies), bringing the total to 9 strategies

### Implementation Improvements
- Add 5MB response body cap — response bodies larger than 5MB are replaced with `[Response too large (>5MB)]` in both `early-wrap.js` and `page-script.js` before storing or forwarding
- Add stale pending request eviction — pending entries older than 60 seconds (`PENDING_REQUEST_TTL = 60000ms`) are evicted from the service worker buffer on each new request start; buffer size also capped at 500 pending entries (`MAX_PENDING_REQUESTS`)
- Add `MAX_REQUESTS = 2000` UI-side cap — each NRQL and GQL request array in Redux state is capped at 2000 entries
- Add session storage quota retry — if `chrome.storage.session` write fails due to quota, the oldest 10% of buffered requests are trimmed and the write is retried automatically
- Add token-based poll widget linking — poll completion messages (`progress.completed = true`) inherit `_matchedWidget` from the originating request via token matching in `completeRequest`
- Add page visibility optimization for navigation poll — the URL change poll in `page-script.js` pauses when the tab is hidden (`document.visibilityState === 'hidden'`) and resumes on the `visibilitychange` event
- Add highlight debounce — `HIGHLIGHT_WIDGET` messages are debounced 100ms in `content.js` to prevent double-highlights from rapid Locate on Page button clicks
- Add `nudgeObservers()` post-highlight behavior — after the highlight overlay is shown, a temporary spacer element is injected and the widget container is scrolled to re-trigger NR1's IntersectionObserver, encouraging lazy-loaded widget content to resume rendering

## 1.12.0
### New Features
- Add Pause Listening toggle — pauses acceptance of new requests in the side panel while allowing in-flight requests to resolve normally. Button displays as dark yellow when paused (with "Resume listening" label) and green when active. State persists via localStorage.
- Add FROM-clause + column-overlap fallback for widget correlation — matches captured NRQL to dashboard widgets when NR1 visualization transforms inject extra SELECT columns (e.g., logger.log-table-widget adding columns). Compares FROM tables for equality and checks that all stored SELECT columns appear in the captured query.
- Add Locate on Page support for untitled widgets — the button now appears when a widget has a widgetId even if its title is empty

### Bug Fixes
- Fix batch NRQL requests showing as perpetually pending — `/nrql` endpoint responses containing multiple queries now use compound requestIds (`requestId + ':nrql:' + idx`) so each query gets its own pending entry and completion
- Fix widget placeholder (grey DEFINED entry) never resolving to green for batch NRQL requests — placeholder suppression now uses the same FROM-clause + column-overlap matching as widget correlation

## 1.11.0
### New Features
- Add distributed tracing API capture — requests to `distributed-tracing.service.newrelic.com` now appear in the NRQL tab with a TRACE badge
- Split traceGroups API response into separate entries: Trace count, Trace duration (ms), and Trace groups for clear per-visualization tracking
- Add Locate on Page support for DT visualizations — highlights the corresponding chart or table section on the Traces page
- Add TRACE badge styling (orange) to distinguish DT entries from NRQL/GraphQL requests

### Bug Fixes
- Fix list selection showing wrong entry details — Log.js sorted requests by status/time but RequestsPage looked up by unsorted index, causing the detail pane and Locate on Page to reference a different entry than the one clicked
- Fix Locate on Page failing to find "Trace groups" heading — `isInsideControl` helper matched "tab" as substring of "Table" in class names like `nr1_dt-TraceGroupsTableHeader`, causing the H4 element to be incorrectly skipped
- Fix Locate on Page Strategy 0 (CardBase search) highlighting wrong container — now prefers CardBase elements that contain a heading (h1-h6) matching the title, falling back to textContent match for dashboard widgets

### Code Quality
- Move request sort from Log.js to RequestsPage.js so list display order and detail-pane lookup share the same sorted array

## 1.10.0
### New Features
- Add `PANEL_READY` handshake — buffered requests and widget map now sent only after side panel listeners are attached, eliminating the port lifecycle race condition
- Add `preserveLog` sync between UI and service worker — request buffer is now preserved across page navigations when "Preserve Log" is enabled
- Add `widgetMap` persistence to `chrome.storage.session` — dashboard widget correlations survive service worker restarts
- Add prototype pollution protection in `completeRequest` reducer via `safeAssign` helper
- Add sender validation (`sender.id`) to content script's `chrome.runtime.onMessage` handler
- Add message validation in service worker — rejects messages with missing or non-string `action` field
- Add URL protocol check (`https:` only) to `UPDATE_URL` handler
- Add debug cache staleness detection (5-minute TTL) — stale nerdpack metadata is automatically re-fetched
- Add CSS custom property system (`--color-gold`, `--color-highlight`, `--color-info`) replacing 20+ hardcoded color values
- Add `@supports` guard for CSS Custom Highlight API with graceful fallback
- Add z-index hierarchy documentation in CSS
- Add `aria-label` attributes to search input, copy button, and locate button
- Add `.gitignore`, `LICENSE` (MIT), and `package.json` for project metadata

### Bug Fixes
- Fix request buffer cleared on navigation regardless of `preserveLog` setting
- Fix debounced save losing request data on service worker unload — buffer now saves immediately
- Fix `onMessage` handler registered inside async callback, dropping early messages — now registered at module level
- Fix widget map deduplication using `widgetId` only — now uses `widgetId + pageName` to prevent cross-page collisions
- Fix widget substring matching returning first match instead of best match — now scores by query length similarity
- Fix `getLocation` listener accumulating in `messageListeners` — already cleaned up by `removeListener`
- Fix `for...in` loop in `extractWidgetHints` iterating prototype chain — added `hasOwnProperty` guard
- Fix `accountIds[0]` accessed without length check in `buildNrqlFromSignals`
- Fix reconnection race in port connection — added `connecting` flag to prevent duplicate attempts
- Fix content script broad DOM selector — strategies 1-3 now use heading+span subset before falling back to full query
- Fix navigation poll interval not cleared on `pagehide` in `subscribeToNavigation`

### Code Quality
- Replace all empty `.catch()` and `catch (e) {}` blocks with `console.warn` logging across all script files
- Replace `console.log` with `console.debug` for non-error messages in page-script.js
- Replace `indexOf` with `includes` for substring/membership checks across multiple files
- Replace loose equality (`!=`) with strict equality in `extractNrqlFromGraphql.js`
- Remove all `!important` declarations from CSS (16 instances)
- Remove dead `chromeApi.clearLog()` method from index.js
- Remove duplicate icon block from manifest.json `action` section
- Add `short_name`, `author`, and `homepage_url` to manifest.json
- Expand CSP with explicit `default-src`, `style-src`, and `img-src` directives
- Tighten component hint regex — removed overly generic patterns (Table, Line, Bar, Pie, Area, Markdown)
- Add safe integer modulo to request counter preventing theoretical overflow
- Fix release workflow to use `python3` instead of `jq` for version extraction
- Fix CHANGELOG inaccuracy about `ResponseDataSection`
- Update README file structure to include all source files
- Add try/catch to export fallback path in Navigation.js
- Rename CSS variable `--color-accent` to `--color-gold` for clarity (distinct from `--accent-color`)
- Wrap export fallback in try/catch in Navigation.js

## 1.9.0
- Remove unused `webNavigation` and `cookies` permissions from manifest (least privilege)
- Add sender validation (`sender.id`) to `chrome.runtime.onMessage` handler in background.js
- Fix relative URL handling in App.js — requests with relative paths (e.g., `/graphql`) are now captured
- Fix stale closures in App.js `useEffect` — process functions and props now accessed via refs
- Add `console.warn` to catch blocks in App.js so processing errors are no longer silently swallowed
- Fix `Date.now` vs `Date.now()` in Log.js — eliminates `NaNms` flash on first render of pending requests
- Extract all NRQL strings from GraphQL variables (not just the first) in extractNrqlFromGraphql.js
- Also check variable values for NRQL when query text doesn't contain "nrql"
- Fix `completeRequest` to search both GQL and NRQL arrays when completing a request by requestId
- Distinguish extension-side JSON parse errors from real API errors in buildNrqlRequests.js
- Fix `buildGraphqlRequests.js` dataset type check — already-parsed objects no longer double-parsed
- Fix `parseNrqlListing.js` regex to handle NRQL ending with table name (no trailing character)
- Add `subscription` keyword support to `formatGraphql.js`
- Add keyboard accessibility (tabIndex, Enter/Space) to all navigation links
- Wrap filter checkboxes in `<label>` elements for proper click association
- Add null guard on `visibleRequests[currentQueryIdx]` in RequestsPage.js
- Add `.catch()` to clipboard `writeText` call in RequestsPage.js
- Add `.catch()` to fetch wrapper in page-script.js so failed fetches appear in the log
- Remove ~280 lines of dead `highlightWidgetOnPage` code from page-script.js
- Remove dead `history.pushState/replaceState` patches from content.js
- Remove dead `URL_PARAMETERS` page, `getParamString.js`, and related state/reducers
- Remove unused `ResponseDataSection` import and unused props from RequestsPage.js
- Remove `overallEndTime` dead prop from LogEntry.js
- Extract `bork-sniffer` hostname to `SIGNAL_EVAL_HOST` constant
- Clean up HTML titles (remove `[DEV]`) and Snowpack boilerplate from index.html
- Remove unused `ResponseDataSection` reference from README file structure

## 1.8.15
- Fix `parseTextStream.js` initial accumulator: change from `0` to `null` to prevent spurious data association when a `data:` line appears before any `id:` line

## 1.8.14
- Add missing `.catch()` on `Promise.all` chain in page-script.js fetch wrapper
- Fix `requests.sort()` mutating props array in Log.js — now copies before sorting
- Guard `parseTextStream.js` against NaN from non-numeric stream IDs
- Extract shared `matchWidgetByNrql` util — deduplicate widget matching logic from RequestsPage.js and actionCreators.js

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
