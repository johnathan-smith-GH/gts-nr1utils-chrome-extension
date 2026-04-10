/**
 * NR1 Utils - Content Script
 *
 * Injected into *.newrelic.com pages.
 * Bridges between the page script (main world) and the service worker.
 */
(function () {
  'use strict';

  // Helper to safely send messages to the service worker.
  // Uses promise-based API to avoid "message port closed" warnings.
  // Catches "Extension context invalidated" errors that occur when
  // the extension is reloaded/reinstalled while the page is still open.
  function safeSendMessage(message) {
    try {
      chrome.runtime.sendMessage(message).catch(function () {});
    } catch (e) {
      // Extension context invalidated — ignore
    }
  }

  // ============================================================
  // Inject page-script.js into the page's main world
  // ============================================================
  var scriptUrl;
  try {
    scriptUrl = chrome.runtime.getURL('page-script.js');
  } catch (e) {
    // Extension context invalidated at load time — bail out entirely.
    return;
  }
  var script = document.createElement('script');
  script.src = scriptUrl;
  script.onload = function () {
    script.remove();
  };
  (document.head || document.documentElement).appendChild(script);

  // ============================================================
  // Listen for messages from the page script
  // ============================================================
  window.addEventListener('message', function (event) {
    if (event.source !== window || !event.data || !event.data.type) return;

    if (event.data.type === 'NR1_UTILS_REQUEST') {
      // Forward intercepted request to service worker (legacy single-phase)
      safeSendMessage({
        action: 'REQUEST_CAPTURED',
        url: event.data.url,
        requestBody: event.data.requestBody,
        responseBody: event.data.responseBody,
        timing: event.data.timing
      });
    }

    if (event.data.type === 'NR1_UTILS_REQUEST_START') {
      safeSendMessage({
        action: 'REQUEST_START',
        requestId: event.data.requestId,
        url: event.data.url,
        requestBody: event.data.requestBody,
        startTime: event.data.startTime,
        componentHint: event.data.componentHint || null,
        stackSummary: event.data.stackSummary || null
      });
    }

    if (event.data.type === 'NR1_UTILS_REQUEST_COMPLETE') {
      safeSendMessage({
        action: 'REQUEST_COMPLETE',
        requestId: event.data.requestId,
        url: event.data.url,
        requestBody: event.data.requestBody,
        responseBody: event.data.responseBody,
        timing: event.data.timing
      });
    }

    if (event.data.type === 'NR1_UTILS_LOCATION_RESPONSE') {
      // Forward location data to service worker
      safeSendMessage({
        action: 'LOCATION_RESPONSE',
        href: event.data.href,
        host: event.data.host,
        pathname: event.data.pathname,
        search: event.data.search
      });
    }

    if (event.data.type === 'NR1_UTILS_PLATFORM_INFO') {
      safeSendMessage({
        action: 'PLATFORM_INFO',
        data: event.data.data
      });
    }

    if (event.data.type === 'NR1_UTILS_NERDPACK_METADATA') {
      safeSendMessage({
        action: 'NERDPACK_METADATA',
        data: event.data.data
      });
    }

    if (event.data.type === 'NR1_UTILS_NERDLET_CHANGED') {
      safeSendMessage({
        action: 'NERDLET_CHANGED',
        data: event.data.data
      });
    }
  });

  // ============================================================
  // Listen for URL changes (SPA navigation)
  // ============================================================
  function sendUrlChange() {
    safeSendMessage({
      action: 'URL_CHANGED',
      href: window.location.href,
      host: window.location.host,
      pathname: window.location.pathname,
      search: window.location.search
    });
  }

  window.addEventListener('popstate', sendUrlChange);
  window.addEventListener('hashchange', sendUrlChange);

  // Also detect pushState/replaceState (NR1 uses these for SPA navigation)
  var originalPushState = history.pushState;
  var originalReplaceState = history.replaceState;

  history.pushState = function () {
    var result = originalPushState.apply(this, arguments);
    sendUrlChange();
    return result;
  };

  history.replaceState = function () {
    var result = originalReplaceState.apply(this, arguments);
    sendUrlChange();
    return result;
  };

  // ============================================================
  // Listen for commands from the service worker
  // ============================================================
  try {
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
      if (message.action === 'GET_LOCATION') {
        // Request location from the page script
        window.postMessage({ type: 'NR1_UTILS_GET_LOCATION' }, '*');
        // The page script will respond via NR1_UTILS_LOCATION_RESPONSE
        // which gets forwarded above
      }

      if (message.action === 'UPDATE_URL') {
        // Navigate the page to the new URL
        window.location.href = message.url;
      }

      if (message.action === 'GET_DEBUG_INFO') {
        // Forward to the page script to re-send cached debug info
        window.postMessage({ type: 'NR1_UTILS_GET_DEBUG_INFO' }, '*');
      }

      if (message.action === 'HIGHLIGHT_WIDGET') {
        window.postMessage({
          type: 'NR1_UTILS_HIGHLIGHT_WIDGET',
          widgetTitle: message.widgetTitle,
          widgetId: message.widgetId,
          pageName: message.pageName
        }, '*');
      }
    });
  } catch (e) {
    // Extension context invalidated
  }

  // Send initial URL on load
  sendUrlChange();
})();
