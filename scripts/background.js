/**
 * NR1 Utils - Service Worker (Background Script)
 *
 * Manages request buffering, message routing between
 * content scripts and the side panel.
 */
'use strict';

// ============================================================
// State
// ============================================================
var MAX_BUFFER_SIZE = 1000;
var requestBuffer = [];
var pendingRequests = {};
var MAX_PENDING_REQUESTS = 500;
var PENDING_REQUEST_TTL = 60000; // 60 seconds
var panelPort = null;
var preserveLog = false;
var widgetMap = [];
var debugInfoCache = {
  platformInfo: null,
  nerdpacks: null,
  currentNerdlet: null,
  _lastUpdated: 0
};
var DEBUG_CACHE_TTL = 300000; // 5 minutes

// ============================================================
// Persist buffer across service worker restarts
// ============================================================
var saveTimer = null;
function debouncedSave() {
  // Save request buffer immediately (critical data, avoid loss on unload)
  chrome.storage.session.set({ requestBuffer: requestBuffer, preserveLog: preserveLog, widgetMap: widgetMap });
  // Debounce debug cache (less critical)
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    chrome.storage.session.set({ debugInfoCache: debugInfoCache });
  }, 1000);
}

// Register onMessage handler immediately to avoid dropping early messages
registerOnMessageHandler();

// Restore state from session storage asynchronously
chrome.storage.session.get(['requestBuffer', 'debugInfoCache', 'preserveLog', 'widgetMap'], function (data) {
  if (data.requestBuffer && Array.isArray(data.requestBuffer)) {
    requestBuffer = data.requestBuffer;
  }
  if (data.debugInfoCache) {
    debugInfoCache.platformInfo = data.debugInfoCache.platformInfo || null;
    debugInfoCache.nerdpacks = data.debugInfoCache.nerdpacks || null;
    debugInfoCache.currentNerdlet = data.debugInfoCache.currentNerdlet || null;
  }
  if (data.preserveLog !== undefined) {
    preserveLog = data.preserveLog;
  }
  if (data.widgetMap && Array.isArray(data.widgetMap)) {
    widgetMap = data.widgetMap;
  }
});

// ============================================================
// onInstalled handler
// ============================================================
chrome.runtime.onInstalled.addListener(function (details) {
  console.log('[NR1 Utils] Installed/updated:', details.reason);
});

// ============================================================
// Side Panel setup - open on extension icon click
// ============================================================
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ============================================================
// Handle port connections from the side panel
// ============================================================
chrome.runtime.onConnect.addListener(function (port) {
  if (port.name !== 'nr1-utils-panel') return;

  panelPort = port;

  // Handle messages from the panel
  port.onMessage.addListener(function (message) {
    // Panel signals it's ready — send any buffered/restored data now
    if (message.action === 'PANEL_READY') {
      if (requestBuffer.length > 0) {
        port.postMessage({
          action: 'BUFFERED_REQUESTS',
          requests: requestBuffer
        });
      }
      if (widgetMap.length > 0) {
        port.postMessage({
          action: 'RESTORED_WIDGET_MAP',
          data: widgetMap
        });
      }
      return;
    }

    if (message.action === 'SET_PRESERVE_LOG') {
      preserveLog = !!message.value;
      chrome.storage.session.set({ preserveLog: preserveLog });
      return;
    }

    if (message.action === 'WIDGET_MAP_UPDATE') {
      if (Array.isArray(message.data)) {
        widgetMap = message.data;
        debouncedSave();
      }
      return;
    }

    if (message.action === 'CLEAR_LOG') {
      requestBuffer = [];
      debouncedSave();
      return;
    }

    if (message.action === 'GET_LOCATION') {
      // Forward to the content script of the active tab
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs && tabs.length > 0) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_LOCATION' }).catch(function (e) { console.warn('[NR1 Utils bg] sendMessage failed:', e.message || e); });
        }
      });
      return;
    }

    if (message.action === 'UPDATE_URL') {
      try {
        var parsed = new URL(message.url);
        if (parsed.protocol !== 'https:') return;
        if (parsed.hostname !== 'newrelic.com' && !parsed.hostname.endsWith('.newrelic.com')) return;
      } catch (e) { return; }
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs && tabs.length > 0) {
          chrome.tabs.update(tabs[0].id, { url: message.url });
        }
      });
      return;
    }

    if (message.action === 'HIGHLIGHT_WIDGET') {
      console.log('[NR1 Utils bg] HIGHLIGHT_WIDGET received:', message.widgetTitle);
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs && tabs.length > 0) {
          console.log('[NR1 Utils bg] Sending to tab:', tabs[0].id, tabs[0].url);
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'HIGHLIGHT_WIDGET',
            widgetTitle: message.widgetTitle,
            widgetId: message.widgetId,
            pageName: message.pageName
          }).catch(function (err) {
            console.warn('[NR1 Utils bg] sendMessage failed:', err.message || err);
            // Fallback: try all NR tabs
            chrome.tabs.query({ url: '*://*.newrelic.com/*' }, function (nrTabs) {
              for (var i = 0; i < nrTabs.length; i++) {
                console.log('[NR1 Utils bg] Fallback trying tab:', nrTabs[i].id, nrTabs[i].url);
                chrome.tabs.sendMessage(nrTabs[i].id, {
                  action: 'HIGHLIGHT_WIDGET',
                  widgetTitle: message.widgetTitle,
                  widgetId: message.widgetId,
                  pageName: message.pageName
                }).catch(function () {});
              }
            });
          });
        } else {
          console.warn('[NR1 Utils bg] No active tab found');
        }
      });
      return;
    }

    if (message.action === 'GET_DEBUG_INFO') {
      var cacheStale = (Date.now() - debugInfoCache._lastUpdated) > DEBUG_CACHE_TTL;
      // Send cached debug info immediately
      if (debugInfoCache.platformInfo) {
        port.postMessage({ action: 'PLATFORM_INFO', data: debugInfoCache.platformInfo });
      }
      if (debugInfoCache.nerdpacks) {
        port.postMessage({ action: 'NERDPACK_METADATA', data: debugInfoCache.nerdpacks });
      }
      if (debugInfoCache.currentNerdlet) {
        port.postMessage({ action: 'NERDLET_CHANGED', data: debugInfoCache.currentNerdlet });
      }

      // Ask the page script for fresh data
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs && tabs.length > 0) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_DEBUG_INFO' }).catch(function (e) { console.warn('[NR1 Utils bg] sendMessage failed:', e.message || e); });
          if (!debugInfoCache.nerdpacks || cacheStale) {
            fetchNerdpackMetadataViaTab(tabs[0].id);
          }
        }
      });
      return;
    }
  });

  port.onDisconnect.addListener(function () {
    panelPort = null;
  });
});

// ============================================================
// Navigation handling: reset debug state on page navigation
// ============================================================
var lastPageBase = '';
function getPageBase(url) {
  try { var u = new URL(url); return u.origin + u.pathname; } catch (e) { return url; }
}

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  if (!tab.active) return;
  // Only reset on actual page navigations (changeInfo.url present), not sub-frame loads
  if (changeInfo.status === 'loading' && changeInfo.url) {
    var newBase = getPageBase(changeInfo.url);
    var isFullNavigation = lastPageBase !== '' && newBase !== lastPageBase;
    lastPageBase = newBase;

    if (isFullNavigation) {
      // Full navigation (different page) — clear everything
      if (!preserveLog) {
        requestBuffer = [];
        widgetMap = [];
      }
      pendingRequests = {};
      debugInfoCache.platformInfo = null;
      debugInfoCache.nerdpacks = null;
      debugInfoCache.currentNerdlet = null;
      debouncedSave();
      if (panelPort) {
        panelPort.postMessage({ action: 'PAGE_NAVIGATED', fullNavigation: true });
        panelPort.postMessage({ action: 'DEBUG_INFO_RESET' });
      }
    } else {
      // SPA navigation (same page, different query/hash — e.g., dashboard tab switch)
      // Only reset debug info, keep requests and widget map intact
      pendingRequests = {};
      debugInfoCache.currentNerdlet = null;
      if (panelPort) {
        panelPort.postMessage({ action: 'DEBUG_INFO_RESET' });
      }
    }
  }
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('newrelic.com')) {
    // Re-request debug info from the page after load completes
    setTimeout(function () {
      chrome.tabs.sendMessage(tabId, { action: 'GET_DEBUG_INFO' }).catch(function (e) { console.warn('[NR1 Utils bg] sendMessage failed:', e.message || e); });
      if (!debugInfoCache.nerdpacks) {
        fetchNerdpackMetadataViaTab(tabId);
      }
    }, 3000);
  }
});

// ============================================================
// Fetch nerdpack metadata by injecting a fetch into the page
// ============================================================
function fetchNerdpackMetadataViaTab(tabId) {
  if (debugInfoCache.nerdpacks) return;

  chrome.scripting.executeScript({
    target: { tabId: tabId },
    world: 'MAIN',
    func: async function () {
      try {
        var response = await fetch(window.location.origin + '/graphql', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'newrelic-requesting-services': 'platform|nr1-ui',
            'x-requested-with': 'XMLHttpRequest'
          },
          body: JSON.stringify({
            query: 'query { actor { nerdpacks { effectiveSubscribedVersions(overrides: []) { nerdpackId cliVersion description displayName repositoryUrl sdkVersion subscriptionModel version teams { id name slack slackUrl teamstoreUrl } } } } }'
          })
        });

        if (response.ok) {
          var json = await response.json();
          if (json && json.data && json.data.actor && json.data.actor.nerdpacks) {
            return json.data.actor.nerdpacks.effectiveSubscribedVersions || [];
          }
        }
        return null;
      } catch (e) {
        return null;
      }
    }
  }).then(function (results) {
    var data = results && results[0] && results[0].result;
    if (data && Array.isArray(data) && data.length > 0) {
      debugInfoCache.nerdpacks = data;
      debouncedSave();
      if (panelPort) {
        panelPort.postMessage({ action: 'NERDPACK_METADATA', data: data });
      }
    } else {
      console.log('[NR1 Utils bg] Nerdpack GraphQL query returned no data');
    }
  }).catch(function (e) { console.warn('[NR1 Utils bg] executeScript failed:', e.message || e); });
}

// ============================================================
// Handle messages from content scripts
// ============================================================
function registerOnMessageHandler() {
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (sender.id !== chrome.runtime.id) return;
  if (!message || typeof message.action !== 'string') return;
  // Evict stale pending requests older than TTL
  var now = Date.now();
  for (var pid in pendingRequests) {
    if (pendingRequests[pid].startTime && (now - pendingRequests[pid].startTime) > PENDING_REQUEST_TTL) {
      delete pendingRequests[pid];
    }
  }

  if (message.action === 'REQUEST_START') {
    // Guard against unbounded growth (#33)
    if (Object.keys(pendingRequests).length > MAX_PENDING_REQUESTS) {
      return;
    }
    var partial = {
      requestId: message.requestId,
      url: message.url,
      requestBody: message.requestBody,
      startTime: message.startTime,
      componentHint: message.componentHint || null,
      stackSummary: message.stackSummary || null,
      status: 'pending'
    };
    pendingRequests[message.requestId] = partial;
    requestBuffer.push(partial);
    if (requestBuffer.length > MAX_BUFFER_SIZE) {
      requestBuffer.shift();
    }
    debouncedSave();
    if (panelPort) {
      panelPort.postMessage({
        action: 'NEW_REQUEST_START',
        requestId: message.requestId,
        url: message.url,
        requestBody: message.requestBody,
        startTime: message.startTime,
        componentHint: message.componentHint || null,
        stackSummary: message.stackSummary || null
      });
    }
    return;
  }

  if (message.action === 'REQUEST_COMPLETE') {
    var pending = pendingRequests[message.requestId];
    var merged = {
      requestId: message.requestId,
      url: message.url,
      requestBody: message.requestBody,
      responseBody: message.responseBody,
      timing: message.timing,
      componentHint: pending ? pending.componentHint : null,
      stackSummary: pending ? pending.stackSummary : null,
      status: 'complete'
    };
    delete pendingRequests[message.requestId];
    // Update the pending entry in requestBuffer in-place
    var replaced = false;
    for (var i = 0; i < requestBuffer.length; i++) {
      if (requestBuffer[i].requestId === message.requestId && requestBuffer[i].status === 'pending') {
        requestBuffer[i] = merged;
        replaced = true;
        break;
      }
    }
    // Only push if we didn't find a pending entry to replace
    if (!replaced) {
      requestBuffer.push(merged);
      if (requestBuffer.length > MAX_BUFFER_SIZE) {
        requestBuffer.shift();
      }
    }
    debouncedSave();
    if (panelPort) {
      panelPort.postMessage({
        action: 'NEW_REQUEST_COMPLETE',
        requestId: message.requestId,
        url: message.url,
        requestBody: message.requestBody,
        responseBody: message.responseBody,
        timing: message.timing
      });
    }
    return;
  }

  if (message.action === 'REQUEST_CAPTURED') {
    var request = {
      url: message.url,
      requestBody: message.requestBody,
      responseBody: message.responseBody,
      timing: message.timing
    };

    // Buffer the request
    requestBuffer.push(request);
    if (requestBuffer.length > MAX_BUFFER_SIZE) {
      requestBuffer.shift();
    }
    debouncedSave();

    // Forward to side panel if connected
    if (panelPort) {
      panelPort.postMessage({
        action: 'NEW_REQUEST',
        url: request.url,
        requestBody: request.requestBody,
        responseBody: request.responseBody,
        timing: request.timing
      });
    }
    return;
  }

  if (message.action === 'LOCATION_RESPONSE') {
    // Forward location data to the side panel
    if (panelPort) {
      panelPort.postMessage({
        action: 'LOCATION_DATA',
        href: message.href,
        host: message.host,
        pathname: message.pathname,
        search: message.search
      });
    }
    return;
  }

  if (message.action === 'URL_CHANGED') {
    // Forward URL change to the side panel
    if (panelPort) {
      panelPort.postMessage({
        action: 'URL_CHANGED',
        href: message.href,
        host: message.host,
        pathname: message.pathname,
        search: message.search
      });
    }
    return;
  }

  if (message.action === 'PLATFORM_INFO') {
    debugInfoCache.platformInfo = message.data;
    debugInfoCache._lastUpdated = Date.now();
    debouncedSave();
    if (panelPort) {
      panelPort.postMessage({ action: 'PLATFORM_INFO', data: message.data });
    }
    return;
  }

  if (message.action === 'NERDPACK_METADATA') {
    debugInfoCache.nerdpacks = message.data;
    debugInfoCache._lastUpdated = Date.now();
    debouncedSave();
    if (panelPort) {
      panelPort.postMessage({ action: 'NERDPACK_METADATA', data: message.data });
    }
    return;
  }

  if (message.action === 'NERDLET_CHANGED') {
    debugInfoCache.currentNerdlet = message.data;
    debugInfoCache._lastUpdated = Date.now();
    debouncedSave();
    if (panelPort) {
      panelPort.postMessage({ action: 'NERDLET_CHANGED', data: message.data });
    }
    return;
  }
});
} // end registerOnMessageHandler
