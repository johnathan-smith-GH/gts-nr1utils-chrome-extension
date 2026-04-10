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
  // Widget highlight: find and highlight a widget on the page
  // Runs in content script (same DOM access as page script)
  // ============================================================
  function highlightWidgetOnPage(widgetTitle, widgetId) {
    var LOG = '[NR1 Utils Locate]';

    var existing = document.getElementById('nr1-utils-widget-highlight');
    if (existing) existing.remove();

    console.log(LOG, 'Looking for widget:', { title: widgetTitle, id: widgetId });

    if (!widgetTitle) {
      console.warn(LOG, 'No widget title provided');
      return;
    }

    var titleLower = widgetTitle.toLowerCase().trim();

    function findTitleInDom() {
      var targetElement = null;
      var strategyUsed = '';
      var allElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6, span, div, p, a');

      // Strategy 1: Exact leaf-node textContent match
      for (var i = 0; i < allElements.length; i++) {
        var el = allElements[i];
        var text = (el.textContent || '').trim().toLowerCase();
        if (text === titleLower && el.children.length === 0) {
          return { el: el, strategy: '1: exact leaf-node textContent' };
        }
      }

      // Strategy 2: innerText match on small elements
      for (var j = 0; j < allElements.length; j++) {
        var el2 = allElements[j];
        var innerText = (el2.innerText || '').trim().toLowerCase();
        if (innerText === titleLower && el2.offsetHeight < 100) {
          return { el: el2, strategy: '2: exact innerText on small element' };
        }
      }

      // Strategy 3: textContent match allowing child elements (size-bounded)
      for (var k = 0; k < allElements.length; k++) {
        var el3 = allElements[k];
        var text3 = (el3.textContent || '').trim().toLowerCase();
        if (text3 === titleLower && el3.offsetHeight < 60 && el3.offsetWidth < 600) {
          return { el: el3, strategy: '3: exact textContent with children (size-bounded)' };
        }
      }

      // Strategy 4: title attribute match
      var titled = document.querySelectorAll('[title]');
      for (var t = 0; t < titled.length; t++) {
        var titleAttr = (titled[t].getAttribute('title') || '').trim().toLowerCase();
        if (titleAttr === titleLower) {
          return { el: titled[t], strategy: '4: title attribute' };
        }
      }

      // Strategy 5: aria-label match
      var ariaLabeled = document.querySelectorAll('[aria-label]');
      for (var a = 0; a < ariaLabeled.length; a++) {
        var ariaLabel = (ariaLabeled[a].getAttribute('aria-label') || '').trim().toLowerCase();
        if (ariaLabel === titleLower) {
          return { el: ariaLabeled[a], strategy: '5: aria-label' };
        }
      }

      // Strategy 6: startsWith match on innerText
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
        return { el: bestCandidate, strategy: '6: startsWith innerText' };
      }

      // Strategy 7: TreeWalker text node
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        var node = walker.currentNode;
        if (node.textContent.trim().toLowerCase() === titleLower) {
          return { el: node.parentElement, strategy: '7: TreeWalker text node' };
        }
      }

      return null;
    }

    function showHighlight(targetElement) {
      // Walk up to find the widget container
      var container = targetElement;
      var maxWalk = 15;
      while (container.parentElement && maxWalk-- > 0) {
        var parent = container.parentElement;
        var rect = parent.getBoundingClientRect();
        if (rect.width >= 200 && rect.height >= 100 && rect.width < window.innerWidth * 0.9) {
          container = parent;
          break;
        }
        container = parent;
      }

      console.log(LOG, 'Widget container:', container.tagName, container.getBoundingClientRect());

      container.scrollIntoView({ behavior: 'smooth', block: 'center' });

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
        var r = container.getBoundingClientRect();
        overlay.style.top = r.top + 'px';
        overlay.style.left = r.left + 'px';
        overlay.style.width = r.width + 'px';
        overlay.style.height = r.height + 'px';
      }

      var lastTop = -1;
      var stableCount = 0;
      var pollInterval = setInterval(function () {
        var r = container.getBoundingClientRect();
        if (Math.abs(r.top - lastTop) < 1) { stableCount++; } else { stableCount = 0; }
        lastTop = r.top;
        positionOverlay();
        if (stableCount >= 3) {
          clearInterval(pollInterval);
          overlay.style.opacity = '1';
          setTimeout(function () {
            overlay.style.opacity = '0';
            setTimeout(function () { overlay.remove(); }, 500);
          }, 2000);
        }
      }, 50);

      setTimeout(function () {
        clearInterval(pollInterval);
        positionOverlay();
        overlay.style.opacity = '1';
        setTimeout(function () {
          overlay.style.opacity = '0';
          setTimeout(function () { overlay.remove(); }, 500);
        }, 2000);
      }, 2000);
    }

    // First attempt
    var result = findTitleInDom();
    if (result) {
      console.log(LOG, 'Found via strategy:', result.strategy, result.el);
      showHighlight(result.el);
      return;
    }

    // Widget not found — likely below the fold (NR1 lazy-renders).
    // Scroll to the bottom of the dashboard to trigger rendering, then retry.
    console.log(LOG, 'Title not in DOM, scrolling to trigger lazy render...');

    // Find the dashboard scroll container
    var scrollContainer = null;
    var candidates = document.querySelectorAll('[class*="scroll"], [class*="grid"], [class*="dashboard"], [class*="Dashboard"]');
    for (var sc = 0; sc < candidates.length; sc++) {
      var style = window.getComputedStyle(candidates[sc]);
      if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && candidates[sc].scrollHeight > candidates[sc].clientHeight) {
        scrollContainer = candidates[sc];
        break;
      }
    }
    if (!scrollContainer) {
      // Fallback: try document.documentElement or body
      if (document.documentElement.scrollHeight > document.documentElement.clientHeight) {
        scrollContainer = document.documentElement;
      } else {
        scrollContainer = document.body;
      }
    }

    // Scroll down incrementally to trigger IntersectionObservers
    var originalScroll = scrollContainer.scrollTop;
    var maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
    var scrollStep = Math.max(500, scrollContainer.clientHeight);
    var currentScroll = scrollContainer.scrollTop;
    var retryAttempts = 0;
    var maxRetries = 10;

    function scrollAndRetry() {
      retryAttempts++;
      currentScroll = Math.min(currentScroll + scrollStep, maxScroll);
      scrollContainer.scrollTop = currentScroll;
      // Dispatch scroll event to trigger IntersectionObservers
      scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));

      setTimeout(function () {
        var retryResult = findTitleInDom();
        if (retryResult) {
          console.log(LOG, 'Found after scroll (attempt ' + retryAttempts + ') via:', retryResult.strategy, retryResult.el);
          showHighlight(retryResult.el);
          return;
        }
        if (retryAttempts < maxRetries && currentScroll < maxScroll) {
          scrollAndRetry();
        } else {
          console.warn(LOG, 'Could not find widget title in DOM after scrolling:', JSON.stringify(widgetTitle));
          // Restore scroll position
          scrollContainer.scrollTop = originalScroll;
          // Log close matches for debugging
          var allElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6, span, div, p, a');
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
        }
      }, 300);
    }

    scrollAndRetry();
  }

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
        console.log('[NR1 Utils content] HIGHLIGHT_WIDGET received:', message.widgetTitle);
        highlightWidgetOnPage(message.widgetTitle, message.widgetId);
      }
    });
  } catch (e) {
    // Extension context invalidated
  }

  // Send initial URL on load
  sendUrlChange();
})();
