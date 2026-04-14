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
  const originalFetch = earlyWrapped ? window.__NR1_ORIGINAL_FETCH__ : window.fetch;
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
    const method = (init && init.method) ? init.method.toUpperCase() : 'GET';

    if (method !== 'POST') {
      return originalFetch.apply(this, arguments);
    }

    const url = (typeof input === 'string') ? input : (input instanceof Request ? input.url : String(input));
    const rawBody = (init && init.body) ? init.body : '';
    const startTime = performance.now();

    // Read the request body before the fetch completes (body may be consumed)
    var requestBodyPromise = readBodyAsText(rawBody);

    return originalFetch.apply(this, arguments).then(function (response) {
      const totalTime = performance.now() - startTime;

      // Clone the response so we can read the body without consuming it
      var clone = response.clone();
      var textWithTimeout = Promise.race([clone.text().catch(function () { return ''; }), new Promise(function (resolve) { setTimeout(function () { resolve(''); }, 5000); })]);
      Promise.all([requestBodyPromise, textWithTimeout]).then(function (results) {
        try {
          sendToContentScript({
            url: url,
            requestBody: results[0],
            responseBody: results[1],
            timing: {
              startTime: Date.now() - totalTime,
              totalTime: totalTime,
              blockedTime: 0
            }
          });
        } catch (e) {
          // Silently ignore errors to avoid breaking the page
        }
      });

      return response;
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
                startTime: Date.now() - totalTime,
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
      });

      xhr.addEventListener('error', function () {
        handleXhrDone('');
      });

      xhr.addEventListener('abort', function () {
        handleXhrDone('');
      });
    }

    return originalSend.apply(this, arguments);
  };
  } // end if (!earlyWrapped) for XHR

  // ============================================================
  // Widget highlight: find and highlight a widget on the page
  // ============================================================
  function highlightWidgetOnPage(widgetTitle, widgetId) {
    var LOG = '[NR1 Utils Locate]';

    // Remove any existing highlight
    var existing = document.getElementById('nr1-utils-widget-highlight');
    if (existing) existing.remove();

    console.log(LOG, 'Looking for widget:', { title: widgetTitle, id: widgetId });

    if (!widgetTitle) {
      console.warn(LOG, 'No widget title provided, cannot locate');
      return;
    }

    var targetElement = null;
    var strategyUsed = '';
    var allElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6, span, div, p, a');
    var titleLower = widgetTitle.toLowerCase().trim();

    // Strategy 1: Exact leaf-node textContent match
    for (var i = 0; i < allElements.length; i++) {
      var el = allElements[i];
      var text = (el.textContent || '').trim().toLowerCase();
      if (text === titleLower && el.children.length === 0) {
        targetElement = el;
        strategyUsed = '1: exact leaf-node textContent';
        break;
      }
    }

    // Strategy 2: innerText match on small elements
    if (!targetElement) {
      for (var j = 0; j < allElements.length; j++) {
        var el2 = allElements[j];
        var innerText = (el2.innerText || '').trim().toLowerCase();
        if (innerText === titleLower && el2.offsetHeight < 100) {
          targetElement = el2;
          strategyUsed = '2: exact innerText on small element';
          break;
        }
      }
    }

    // Strategy 3: textContent match allowing child elements (size-bounded)
    // NR1 widget titles often have child nodes (tooltip icons, info badges)
    if (!targetElement) {
      for (var k = 0; k < allElements.length; k++) {
        var el3 = allElements[k];
        var text3 = (el3.textContent || '').trim().toLowerCase();
        if (text3 === titleLower && el3.offsetHeight < 60 && el3.offsetWidth < 600) {
          targetElement = el3;
          strategyUsed = '3: exact textContent with children (size-bounded)';
          break;
        }
      }
    }

    // Strategy 4: title attribute match (handles truncated/ellipsized titles)
    if (!targetElement) {
      var titled = document.querySelectorAll('[title]');
      for (var t = 0; t < titled.length; t++) {
        var titleAttr = (titled[t].getAttribute('title') || '').trim().toLowerCase();
        if (titleAttr === titleLower) {
          targetElement = titled[t];
          strategyUsed = '4: title attribute';
          break;
        }
      }
    }

    // Strategy 5: aria-label match
    if (!targetElement) {
      var ariaLabeled = document.querySelectorAll('[aria-label]');
      for (var a = 0; a < ariaLabeled.length; a++) {
        var ariaLabel = (ariaLabeled[a].getAttribute('aria-label') || '').trim().toLowerCase();
        if (ariaLabel === titleLower) {
          targetElement = ariaLabeled[a];
          strategyUsed = '5: aria-label';
          break;
        }
      }
    }

    // Strategy 6: startsWith match on innerText (title with appended icon text)
    if (!targetElement) {
      var bestCandidate = null;
      var bestLen = Infinity;
      for (var s = 0; s < allElements.length; s++) {
        var el6 = allElements[s];
        var inner6 = (el6.innerText || '').trim().toLowerCase();
        if (inner6.length > 0 && inner6.length < 200 && el6.offsetHeight < 60) {
          if (inner6.indexOf(titleLower) === 0 && inner6.length < bestLen) {
            bestCandidate = el6;
            bestLen = inner6.length;
          }
        }
      }
      if (bestCandidate) {
        targetElement = bestCandidate;
        strategyUsed = '6: startsWith innerText';
      }
    }

    // Strategy 7: React fiber tree search for widget title in props
    if (!targetElement) {
      var gridItems = document.querySelectorAll('[class*="grid"], [class*="widget"], [class*="Widget"], [class*="card"], [class*="Card"], [data-testid]');
      for (var g = 0; g < gridItems.length; g++) {
        var gridEl = gridItems[g];
        var fiberKey = Object.keys(gridEl).find(function (key) {
          return key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$');
        });
        if (!fiberKey) continue;
        var fiber = gridEl[fiberKey];
        var current = fiber;
        var maxDepth = 15;
        while (current && maxDepth-- > 0) {
          if (current.memoizedProps) {
            var fiberProps = current.memoizedProps;
            var propTitle = fiberProps.title || fiberProps.name || fiberProps.widgetTitle || '';
            if (typeof propTitle === 'string' && propTitle.toLowerCase().trim() === titleLower) {
              targetElement = gridEl;
              strategyUsed = '7: React fiber props';
              break;
            }
          }
          current = current.return;
        }
        if (targetElement) break;
      }
    }

    // Strategy 8: TreeWalker to find title text in any text node
    if (!targetElement) {
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        var node = walker.currentNode;
        if (node.textContent.trim().toLowerCase() === titleLower) {
          targetElement = node.parentElement;
          strategyUsed = '8: TreeWalker text node';
          break;
        }
      }
    }

    if (!targetElement) {
      console.warn(LOG, 'Could not find widget title in DOM:', JSON.stringify(widgetTitle));
      // Log close matches for debugging
      var close = [];
      for (var d = 0; d < allElements.length; d++) {
        var dt = (allElements[d].innerText || '').trim().toLowerCase();
        if (dt.length > 0 && dt.length < 100 && titleLower.length >= 6 && dt.indexOf(titleLower.slice(0, 6)) !== -1) {
          close.push({ tag: allElements[d].tagName, text: dt, children: allElements[d].children.length, h: allElements[d].offsetHeight });
        }
      }
      if (close.length > 0) {
        console.warn(LOG, 'Closest DOM matches:', close.slice(0, 10));
      } else {
        console.warn(LOG, 'No elements found containing even the first 6 chars of the title');
      }
      return;
    }

    console.log(LOG, 'Found via strategy:', strategyUsed, targetElement);

    // Walk up to find the widget container (the chart/visualization wrapper)
    // Look for a parent that looks like a widget card (has reasonable size)
    var container = targetElement;
    var maxWalk = 10;
    while (container.parentElement && maxWalk-- > 0) {
      var parent = container.parentElement;
      var rect = parent.getBoundingClientRect();
      // Stop when we find a container that's at least 200px wide and tall
      // but not the entire page
      if (rect.width >= 200 && rect.height >= 150 && rect.width < window.innerWidth * 0.9) {
        container = parent;
        break;
      }
      container = parent;
    }

    // Find the scrollable parent (the dashboard's scroll container)
    var scrollParent = container.parentElement;
    while (scrollParent && scrollParent !== document.body) {
      var overflow = window.getComputedStyle(scrollParent).overflowY;
      if (overflow === 'auto' || overflow === 'scroll') break;
      scrollParent = scrollParent.parentElement;
    }
    if (!scrollParent) scrollParent = document.documentElement;

    // Scroll the container into view
    container.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Create highlight overlay
    var overlay = document.createElement('div');
    overlay.id = 'nr1-utils-widget-highlight';
    overlay.style.cssText = [
      'position: fixed',
      'pointer-events: none',
      'z-index: 999999',
      'border: 3px solid #7c3aed',
      'border-radius: 8px',
      'box-shadow: 0 0 20px rgba(124, 58, 237, 0.4), inset 0 0 20px rgba(124, 58, 237, 0.05)',
      'transition: opacity 0.5s ease',
      'opacity: 0'
    ].join('; ');

    document.body.appendChild(overlay);

    function positionOverlay() {
      var rect = container.getBoundingClientRect();
      overlay.style.top = rect.top + 'px';
      overlay.style.left = rect.left + 'px';
      overlay.style.width = rect.width + 'px';
      overlay.style.height = rect.height + 'px';
    }

    // Wait for scroll to settle by polling until position stabilizes
    var lastTop = -1;
    var stableCount = 0;
    var pollInterval = setInterval(function () {
      var rect = container.getBoundingClientRect();
      if (Math.abs(rect.top - lastTop) < 1) {
        stableCount++;
      } else {
        stableCount = 0;
      }
      lastTop = rect.top;
      positionOverlay();

      // Position is stable for 3 consecutive checks (150ms) — show the overlay
      if (stableCount >= 3) {
        clearInterval(pollInterval);
        overlay.style.opacity = '1';

        // Nudge the scroll container to trigger IntersectionObservers
        // NR1 lazy-loads widget queries via IntersectionObserver which
        // may not fire from programmatic scrollIntoView alone
        try {
          var savedScrollTop = scrollParent.scrollTop;
          scrollParent.scrollTop = savedScrollTop + 1;
          scrollParent.dispatchEvent(new Event('scroll', { bubbles: true }));
          setTimeout(function () {
            scrollParent.scrollTop = savedScrollTop;
            scrollParent.dispatchEvent(new Event('scroll', { bubbles: true }));
          }, 50);
        } catch (e) {}

        // Fade out after 2 seconds
        setTimeout(function () {
          overlay.style.opacity = '0';
          setTimeout(function () {
            overlay.remove();
          }, 500);
        }, 2000);
      }
    }, 50);

    // Safety: clear poll after 2 seconds if scroll never settles
    setTimeout(function () {
      clearInterval(pollInterval);
      positionOverlay();
      overlay.style.opacity = '1';
      // Nudge scroll for safety timeout path too
      try {
        var savedTop = scrollParent.scrollTop;
        scrollParent.scrollTop = savedTop + 1;
        scrollParent.dispatchEvent(new Event('scroll', { bubbles: true }));
        setTimeout(function () {
          scrollParent.scrollTop = savedTop;
          scrollParent.dispatchEvent(new Event('scroll', { bubbles: true }));
        }, 50);
      } catch (e) {}
      setTimeout(function () {
        overlay.style.opacity = '0';
        setTimeout(function () {
          overlay.remove();
        }, 500);
      }, 2000);
    }, 2000);
  }

  // ============================================================
  // Location request handler
  // ============================================================
  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    if (event.data && event.data.type === 'NR1_UTILS_GET_LOCATION') {
      window.postMessage({
        type: 'NR1_UTILS_LOCATION_RESPONSE',
        href: window.location.href,
        host: window.location.host,
        pathname: window.location.pathname,
        search: window.location.search
      }, window.location.origin);
    }

    if (event.data && event.data.type === 'NR1_UTILS_HIGHLIGHT_WIDGET') {
      highlightWidgetOnPage(event.data.widgetTitle, event.data.widgetId);
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

    var pollForAppShell = setInterval(function () {
      attempts++;

      if (window.UNSTABLE_app_shell && window.UNSTABLE_app_shell.navigationStateContext) {
        clearInterval(pollForAppShell);

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
        clearInterval(pollForAppShell);
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
      console.log('[NR1 Utils page] Starting NerdGraph fetch to', graphqlUrl);
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
          console.log('[NR1 Utils page] NerdGraph fetch SUCCESS, nerdpacks:', versions.length);
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

  var navigationPollId = setInterval(function () {
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      // Re-read platform info on SPA navigation (accountId, nerdlet may change)
      readPlatformInfo();
    }
  }, 1000);

  // Clean up polling when the page unloads
  window.addEventListener('pagehide', function () {
    clearInterval(navigationPollId);
  });

  // ============================================================
  // Debug Info: Initialize after a delay to let NR1 load
  // ============================================================
  setTimeout(function () {
    console.log('[NR1 Utils page] 2s init timer fired, starting debug info collection');
    readPlatformInfo();
    subscribeToNavigation();
    fetchNerdpackMetadata();
  }, 2000);
})();
