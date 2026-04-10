# Changelog

## 1.8.1
- Fix Locate on Page for lazy-loaded widgets by moving highlight logic to content script
- Add scroll-to-lazy-load: incrementally scrolls dashboard to trigger widget rendering, then highlights
- Add 8 DOM search strategies with debug logging for diagnosing title-matching failures
- Add fallback tab routing when active tab message delivery fails
- Update dashboard notice to mention 'Locate on page' as an option for loading gray entries
- Rename 'Account IDs Being Queried' to 'Account ID Identifiers Being Queried'

## 1.8.0
- Add dashboard widget correlation: match NRQL results to widgets by query text
- Add "Locate on Page" button to scroll to and highlight matched widgets
- Add inaccessible widget detection with amber warning banner
- Add call stack capture for source component tracing as fallback correlation
- Fix dark mode pill colors in User Guide
- Widget names are now searchable in the filter
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
