/**
 * NR1 Utils - Page Script
 *
 * Injected into the page's main world by content.js.
 * Wraps fetch() and XMLHttpRequest to intercept POST requests
 * and capture request/response bodies + timing.
 */
(function () {
  'use strict';

  // Avoid double-injection
  if (window.__NR1_UTILS_INJECTED__) return;
  window.__NR1_UTILS_INJECTED__ = true;

  // Check if early-wrap.js already set up fetch/XHR interception
  var earlyWrapped = !!window.__NR1_UTILS_EARLY_WRAP__;

  /**
   * Send intercepted request data to the content script.
   */
  function sendToContentScript(data) {
    window.postMessage({
      type: 'NR1_UTILS_REQUEST',
      url: data.url,
      requestBody: data.requestBody,
      responseBody: data.responseBody,
      timing: data.timing
    }, window.location.origin);
  }

  // ============================================================
  // Wrap fetch() — skip if early-wrap.js already did it
  // ============================================================
  var originalFetch = earlyWrapped ? window.__NR1_ORIGINAL_FETCH__ : window.fetch;
  if (!earlyWrapped) {

  /**
   * Read a fetch body into a string regardless of its type.
   * Handles String, Blob, ArrayBuffer, Uint8Array, and falls back to ''.
   */
  function readBodyAsText(body) {
    if (!body) return Promise.resolve('');
    if (typeof body === 'string') return Promise.resolve(body);
    if (body instanceof Blob) return body.text();
    if (body instanceof ArrayBuffer) {
      try { return Promise.resolve(new TextDecoder().decode(body)); } catch (e) { return Promise.resolve(''); }
    }
    if (body instanceof Uint8Array) {
      try { return Promise.resolve(new TextDecoder().decode(body)); } catch (e) { return Promise.resolve(''); }
    }
    return Promise.resolve('');
  }

  window.fetch = function (input, init) {
    var method = (init && init.method) ? init.method.toUpperCase() : 'GET';

    if (method !== 'POST') {
      return originalFetch.apply(this, arguments);
    }

    var url = (typeof input === 'string') ? input : (input instanceof Request ? input.url : String(input));
    var rawBody = (init && init.body) ? init.body : '';
    var startTime = performance.now();
    var absStartTime = Date.now();

    // Read the request body before the fetch completes (body may be consumed)
    var requestBodyPromise = readBodyAsText(rawBody);

    return originalFetch.apply(this, arguments).then(function (response) {
      var totalTime = performance.now() - startTime;

      // Clone the response so we can read the body without consuming it
      var clone = response.clone();
      var MAX_BODY_SIZE = 5 * 1024 * 1024; // 5MB cap on captured response bodies
      var textWithTimeout = Promise.race([clone.text().then(function (t) { return t.length > MAX_BODY_SIZE ? '[Response too large (>5MB)]' : t; }).catch(function () { return ''; }), new Promise(function (resolve) { setTimeout(function () { resolve(''); }, 5000); })]);
      Promise.all([requestBodyPromise, textWithTimeout]).then(function (results) {
        try {
          sendToContentScript({
            url: url,
            requestBody: results[0],
            responseBody: results[1],
            timing: {
              startTime: absStartTime,
              totalTime: totalTime,
              blockedTime: 0
            }
          });
        } catch (e) {
          // Silently ignore errors to avoid breaking the page
        }
      }).catch(function (e) { console.warn('[NR1 Utils page-script]', e); });

      return response;
    }).catch(function (err) {
      // Post an error-state message so failed fetches appear in the log
      requestBodyPromise.then(function (reqBody) {
        try {
          sendToContentScript({
            url: url,
            requestBody: reqBody,
            responseBody: '',
            timing: {
              startTime: absStartTime,
              totalTime: performance.now() - startTime,
              blockedTime: 0
            }
          });
        } catch (e) {}
      }).catch(function (e) { console.warn('[NR1 Utils page-script]', e); });
      throw err; // Re-throw so the caller still gets the error
    });
  };
  } // end if (!earlyWrapped) for fetch

  // ============================================================
  // Wrap XMLHttpRequest — skip if early-wrap.js already did it
  // ============================================================
  var XHRProto = XMLHttpRequest.prototype;
  var originalOpen = earlyWrapped ? window.__NR1_ORIGINAL_XHR_OPEN__ : XHRProto.open;
  var originalSend = earlyWrapped ? window.__NR1_ORIGINAL_XHR_SEND__ : XHRProto.send;
  if (!earlyWrapped) {
  XHRProto.open = function (method, url) {
    this.__nr1_method = method;
    this.__nr1_url = url;
    return originalOpen.apply(this, arguments);
  };

  XHRProto.send = function (body) {
    var xhr = this;

    if (xhr.__nr1_method && xhr.__nr1_method.toUpperCase() === 'POST') {
      var startTime = performance.now();
      var absStartTime = Date.now();
      var bodyPromise = readBodyAsText(body);

      function handleXhrDone(responseBody) {
        var totalTime = performance.now() - startTime;
        bodyPromise.then(function (requestBody) {
          try {
            sendToContentScript({
              url: xhr.__nr1_url,
              requestBody: requestBody,
              responseBody: responseBody,
              timing: {
                startTime: absStartTime,
                totalTime: totalTime,
                blockedTime: 0
              }
            });
          } catch (e) {
            // Silently ignore
          }
        }).catch(function () {});
      }

      xhr.addEventListener('load', function () {
        var responseBody;
        try { responseBody = xhr.responseText || ''; } catch (e) { responseBody = ''; }
        handleXhrDone(responseBody);
      }, { once: true });

      xhr.addEventListener('error', function () {
        handleXhrDone('');
      }, { once: true });

      xhr.addEventListener('abort', function () {
        handleXhrDone('');
      }, { once: true });
    }

    return originalSend.apply(this, arguments);
  };
  } // end if (!earlyWrapped) for XHR

  // ============================================================
  // Location request handler
  // ============================================================
  window.addEventListener('message', function (event) {
    if (event.source !== window || event.origin !== window.location.origin) return;
    if (event.data && event.data.type === 'NR1_UTILS_GET_LOCATION') {
      window.postMessage({
        type: 'NR1_UTILS_LOCATION_RESPONSE',
        href: window.location.href,
        host: window.location.host,
        pathname: window.location.pathname,
        search: window.location.search
      }, window.location.origin);
    }

    if (event.data && event.data.type === 'NR1_UTILS_GET_DEBUG_INFO') {
      // Re-send cached debug info when the side panel requests it
      if (debugInfoCache.platformInfo) {
        window.postMessage({
          type: 'NR1_UTILS_PLATFORM_INFO',
          data: debugInfoCache.platformInfo
        }, window.location.origin);
      } else {
        // Platform info not cached yet — try reading it now
        readPlatformInfo();
      }
      if (debugInfoCache.nerdpacks) {
        window.postMessage({
          type: 'NR1_UTILS_NERDPACK_METADATA',
          data: debugInfoCache.nerdpacks
        }, window.location.origin);
      } else {
        // Nerdpack data not cached yet — trigger a fresh fetch
        fetchNerdpackMetadata();
      }
      if (debugInfoCache.currentNerdlet) {
        window.postMessage({
          type: 'NR1_UTILS_NERDLET_CHANGED',
          data: debugInfoCache.currentNerdlet
        }, window.location.origin);
      }
    }
  });

  // ============================================================
  // Debug Info: Cache for re-sending on demand
  // ============================================================
  var debugInfoCache = {
    platformInfo: null,
    nerdpacks: null,
    currentNerdlet: null
  };

  // ============================================================
  // Debug Info: Read platform info from window.__nr
  // ============================================================
  function readPlatformInfo() {
    try {
      var nr = window.__nr || {};

      var info = {
        version: nr.version || null,
        platformVersion: nr.platformVersion || null,
        env: nr.env || null,
        region: null,
        userId: null,
        accountId: null
      };

      // Determine region from hostname
      var hostname = window.location.hostname;
      if (hostname.indexOf('.eu.') !== -1 || hostname.indexOf('eu.newrelic') !== -1) {
        info.region = 'EU';
      } else {
        info.region = 'US';
      }

      // Try multiple paths to find userId and accountId
      if (nr.initialState) {
        info.userId = nr.initialState.userId || nr.initialState.user_id || null;
        info.accountId = nr.initialState.accountId || nr.initialState.account_id || null;
      }

      // Fallback: check __nr directly
      if (!info.userId && nr.userId) {
        info.userId = nr.userId;
      }
      if (!info.accountId && nr.accountId) {
        info.accountId = nr.accountId;
      }

      // Fallback: try to get accountId from URL path or query params
      if (!info.accountId) {
        var pathMatch = window.location.pathname.match(/\/accounts\/(\d+)/);
        if (pathMatch) {
          info.accountId = pathMatch[1];
        }
      }
      if (!info.accountId) {
        var searchParams = new URLSearchParams(window.location.search);
        var acctParam = searchParams.get('account') || searchParams.get('accountId');
        if (acctParam) {
          info.accountId = acctParam;
        }
      }

      // Fallback: try UNSTABLE_app_shell for accountId
      if (!info.accountId && window.UNSTABLE_app_shell) {
        try {
          var appShell = window.UNSTABLE_app_shell;
          if (appShell.navigationStateContext && appShell.navigationStateContext.getValue) {
            var navVal = appShell.navigationStateContext.getValue();
            if (navVal && navVal.accountId) {
              info.accountId = navVal.accountId;
            }
          }
        } catch (e) { /* ignore */ }
      }

      // Fallback: try newrelic global or __hurlState
      if (!info.userId && window.__hurlState && window.__hurlState.userId) {
        info.userId = window.__hurlState.userId;
      }
      if (!info.accountId && window.__hurlState && window.__hurlState.accountId) {
        info.accountId = window.__hurlState.accountId;
      }

      // Fallback: check newrelic.initialPage data
      if (window.newrelic) {
        if (!info.userId && window.newrelic.userId) {
          info.userId = window.newrelic.userId;
        }
        if (!info.accountId && window.newrelic.accountId) {
          info.accountId = window.newrelic.accountId;
        }
      }

      debugInfoCache.platformInfo = info;
      window.postMessage({
        type: 'NR1_UTILS_PLATFORM_INFO',
        data: info
      }, window.location.origin);
    } catch (e) {
      // Silently ignore
    }
  }

  // ============================================================
  // Debug Info: Subscribe to navigation state changes
  // ============================================================
  function subscribeToNavigation() {
    var attempts = 0;
    var maxAttempts = 60; // 30 seconds at 500ms intervals

    appShellPollId = setInterval(function () {
      attempts++;

      if (window.UNSTABLE_app_shell && window.UNSTABLE_app_shell.navigationStateContext) {
        clearInterval(appShellPollId);
        appShellPollId = null;

        try {
          var navCtx = window.UNSTABLE_app_shell.navigationStateContext;

          // Extract entity GUID from URL path as fallback
          function entityGuidFromUrl() {
            try {
              var segments = window.location.pathname.split('/');
              for (var s = 0; s < segments.length; s++) {
                if (segments[s].length >= 16) {
                  var decoded = atob(segments[s]);
                  if (/^\d+\|[A-Z]+\|[A-Z_]+\|.+$/.test(decoded)) return segments[s];
                }
              }
            } catch (e) {}
            return null;
          }

          // Subscribe to navigation state changes
          navCtx.subscribe(function (navState) {
            if (navState && navState.mainNerdletId) {
              var data = {
                nerdletId: navState.mainNerdletId,
                entityGuid: navState.mainEntityGuid || entityGuidFromUrl() || null
              };
              debugInfoCache.currentNerdlet = data;
              window.postMessage({
                type: 'NR1_UTILS_NERDLET_CHANGED',
                data: data
              }, window.location.origin);
            }
          });

          // Also read the current value immediately
          var currentValue = navCtx.getValue ? navCtx.getValue() : null;
          if (currentValue && currentValue.mainNerdletId) {
            var data = {
              nerdletId: currentValue.mainNerdletId,
              entityGuid: currentValue.mainEntityGuid || entityGuidFromUrl() || null
            };
            debugInfoCache.currentNerdlet = data;
            window.postMessage({
              type: 'NR1_UTILS_NERDLET_CHANGED',
              data: data
            }, window.location.origin);
          }
        } catch (e) {
          // Silently ignore subscription errors
        }

        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(appShellPollId);
        appShellPollId = null;
      }
    }, 500);
  }

  // ============================================================
  // Debug Info: Fetch nerdpack metadata via NerdGraph
  // ============================================================
  function fetchNerdpackMetadata() {
    var retryCount = 0;
    var maxRetries = 3;
    var retryDelay = 2000;

    function doFetch() {
      var graphqlUrl = window.location.origin + '/graphql';
      console.debug('[NR1 Utils page] Starting NerdGraph fetch to', graphqlUrl);
      originalFetch(graphqlUrl, {
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
      }).then(function (response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.json();
      }).then(function (json) {
        if (json.errors) {
          console.warn('[NR1 Utils] NerdGraph errors:', json.errors);
        }
        if (json && json.data && json.data.actor && json.data.actor.nerdpacks) {
          var versions = json.data.actor.nerdpacks.effectiveSubscribedVersions || [];
          console.debug('[NR1 Utils page] NerdGraph fetch SUCCESS, nerdpacks:', versions.length);
          debugInfoCache.nerdpacks = versions;
          window.postMessage({
            type: 'NR1_UTILS_NERDPACK_METADATA',
            data: versions
          }, window.location.origin);
        } else {
          console.warn('[NR1 Utils] Unexpected NerdGraph response:', json);
        }
      }).catch(function (e) {
        console.warn('[NR1 Utils] NerdGraph fetch failed (attempt ' + (retryCount + 1) + '):', e.message);
        retryCount++;
        if (retryCount <= maxRetries) {
          setTimeout(doFetch, retryDelay * retryCount);
        }
      });
    }

    doFetch();
  }

  // ============================================================
  // Debug Info: Re-read on SPA navigation
  // ============================================================
  var lastHref = window.location.href;

  var navigationPollId = null;
  var appShellPollId = null;

  function startNavigationPoll() {
    if (navigationPollId) return;
    navigationPollId = setInterval(function () {
      if (window.location.href !== lastHref) {
        lastHref = window.location.href;
        // Re-read platform info on SPA navigation (accountId, nerdlet may change)
        readPlatformInfo();
      }
    }, 1000);
  }

  function stopNavigationPoll() {
    if (navigationPollId) {
      clearInterval(navigationPollId);
      navigationPollId = null;
    }
  }

  startNavigationPoll();

  // Pause polling when tab is hidden, resume when visible
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stopNavigationPoll();
    } else {
      lastHref = window.location.href;
      startNavigationPoll();
    }
  });

  // Clean up polling when the page unloads
  window.addEventListener('pagehide', function () {
    if (appShellPollId) { clearInterval(appShellPollId); appShellPollId = null; }
    stopNavigationPoll();
  });

  // ============================================================
  // Debug Info: Initialize after a delay to let NR1 load
  // ============================================================
  setTimeout(function () {
    console.debug('[NR1 Utils page] 2s init timer fired, starting debug info collection');
    readPlatformInfo();
    subscribeToNavigation();
    fetchNerdpackMetadata();
  }, 2000);
})();
