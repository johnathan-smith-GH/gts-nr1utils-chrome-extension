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
var panelPort = null;
var pendingLocationCallback = null;
var debugInfoCache = {
  platformInfo: null,
  nerdpacks: null,
  currentNerdlet: null
};

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

  // Send buffered requests to the panel
  if (requestBuffer.length > 0) {
    port.postMessage({
      action: 'BUFFERED_REQUESTS',
      requests: requestBuffer
    });
  }

  // Handle messages from the panel
  port.onMessage.addListener(function (message) {
    if (message.action === 'CLEAR_LOG') {
      requestBuffer = [];
      return;
    }

    if (message.action === 'GET_LOCATION') {
      // Forward to the content script of the active tab
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_LOCATION' }).catch(function () {});
        }
      });
      return;
    }

    if (message.action === 'UPDATE_URL') {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs[0]) {
          chrome.tabs.update(tabs[0].id, { url: message.url });
        }
      });
      return;
    }

    if (message.action === 'HIGHLIGHT_WIDGET') {
      console.log('[NR1 Utils bg] HIGHLIGHT_WIDGET received:', message.widgetTitle);
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs[0]) {
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
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_DEBUG_INFO' }).catch(function () {});
          if (!debugInfoCache.nerdpacks) {
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
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  if (!tab.active) return;
  // Only reset on actual page navigations (changeInfo.url present), not sub-frame loads
  if (changeInfo.status === 'loading' && changeInfo.url) {
    requestBuffer = [];
    debugInfoCache.platformInfo = null;
    debugInfoCache.nerdpacks = null;
    debugInfoCache.currentNerdlet = null;
    if (panelPort) {
      panelPort.postMessage({ action: 'PAGE_NAVIGATED' });
      panelPort.postMessage({ action: 'DEBUG_INFO_RESET' });
    }
  }
  if (changeInfo.status === 'complete' && tab.url && tab.url.indexOf('newrelic.com') !== -1) {
    // Re-request debug info from the page after load completes
    setTimeout(function () {
      chrome.tabs.sendMessage(tabId, { action: 'GET_DEBUG_INFO' }).catch(function () {});
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
    func: function () {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', window.location.origin + '/graphql', false);
        xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
        xhr.setRequestHeader('newrelic-requesting-services', 'platform|nr1-ui');
        xhr.setRequestHeader('x-requested-with', 'XMLHttpRequest');
        xhr.withCredentials = true;
        xhr.send(JSON.stringify({
          query: 'query { actor { nerdpacks { effectiveSubscribedVersions(overrides: []) { nerdpackId cliVersion description displayName repositoryUrl sdkVersion subscriptionModel version teams { id name slack slackUrl teamstoreUrl } } } } }'
        }));

        if (xhr.status === 200) {
          var json = JSON.parse(xhr.responseText);
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
      if (panelPort) {
        panelPort.postMessage({ action: 'NERDPACK_METADATA', data: data });
      }
    }
  }).catch(function () {});
}

// ============================================================
// Handle messages from content scripts
// ============================================================
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.action === 'REQUEST_START') {
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
    if (panelPort) {
      panelPort.postMessage({ action: 'PLATFORM_INFO', data: message.data });
    }
    return;
  }

  if (message.action === 'NERDPACK_METADATA') {
    debugInfoCache.nerdpacks = message.data;
    if (panelPort) {
      panelPort.postMessage({ action: 'NERDPACK_METADATA', data: message.data });
    }
    return;
  }

  if (message.action === 'NERDLET_CHANGED') {
    debugInfoCache.currentNerdlet = message.data;
    if (panelPort) {
      panelPort.postMessage({ action: 'NERDLET_CHANGED', data: message.data });
    }
    return;
  }
});
