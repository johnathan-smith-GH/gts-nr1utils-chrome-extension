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
    scriptUrl = chrome.runtime.getURL('scripts/page-script.js');
  } catch (e) {
    // Extension context invalidated at load time — bail out entirely.
    return;
  }
  var script = document.createElement('script');
  script.src = scriptUrl;
  script.onload = function () {
    script.remove();
  };
  script.onerror = function () {
    script.remove();
  };
  (document.head || document.documentElement).appendChild(script);

  // ============================================================
  // Listen for messages from the page script
  // ============================================================
  window.addEventListener('message', function (event) {
    if (event.source !== window || event.origin !== window.location.origin) return;
    if (!event.data || !event.data.type) return;

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


  // ============================================================
  // Widget highlight: find and highlight a widget on the page
  // Runs in content script (same DOM access as page script)
  // ============================================================
  var _isHighlighting = false;
  var _listenersRegistered = false;
  var _highlightDebounce = null;

  function highlightWidgetOnPage(widgetTitle, widgetId, pageName, occurrenceIndex) {
    // Cancel any in-progress highlight and start fresh
    _isHighlighting = true;
    var LOG = '[NR1 Utils Locate]';
    occurrenceIndex = (occurrenceIndex === undefined || occurrenceIndex === null) ? 0 : occurrenceIndex;

    var existing = document.getElementById('nr1-utils-widget-highlight');
    if (existing) existing.remove();

    console.log(LOG, 'Looking for widget:', { title: widgetTitle, id: widgetId, page: pageName });

    if (!widgetTitle) {
      console.warn(LOG, 'No widget title provided');
      _isHighlighting = false;
      return;
    }

    // If pageName is provided, switch to the correct dashboard page tab first
    if (pageName) {
      var pnLower = pageName.toLowerCase().trim();
      var tabs = document.querySelectorAll('[role="tab"]');
      for (var ti = 0; ti < tabs.length; ti++) {
        var tabText = (tabs[ti].textContent || '').trim().toLowerCase();
        if (tabText === pnLower && tabs[ti].getAttribute('aria-selected') !== 'true') {
          console.log(LOG, 'Switching to dashboard page tab:', pageName);
          tabs[ti].click();
          // Re-run after page renders (omit pageName to avoid infinite loop)
          _isHighlighting = false;
          setTimeout(function () { highlightWidgetOnPage(widgetTitle, widgetId, undefined, occurrenceIndex); }, 600);
          return;
        }
      }
    }

    var titleLower = widgetTitle.toLowerCase().trim();

    function findTitleInDom() {
      var targetElement = null;
      var strategyUsed = '';
      var headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6, span');
      var allElements = null; // lazy-init for broader search
      function getAllElements() { if (!allElements) allElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6, span, div, p, a'); return allElements; }

      // Strategy 0: Find the smallest NR1 card/section that has a heading
      // (h1-h6) matching the title.  Requiring a heading avoids false positives
      // like a CardBase that merely contains the title text inside a button or tab.
      // Falls back to a textContent-only check for dashboard widgets that may
      // not use headings.
      var cards = document.querySelectorAll('[class*="CardBase"], [class*="card-base"], section, article');
      var allCardsWithHeading = [];
      var allCardsWithText = [];
      for (var ci = 0; ci < cards.length; ci++) {
        var card = cards[ci];
        var cardRect = card.getBoundingClientRect();
        if (cardRect.width < 100 || cardRect.height < 60) continue;
        if (cardRect.width > window.innerWidth * 0.6) continue;
        var cardText = card.textContent.toLowerCase();
        if (cardText.indexOf(titleLower) === -1) continue;
        // Check if a heading inside the card matches the title
        var headings = card.querySelectorAll('h1,h2,h3,h4,h5,h6');
        var hasHeading = false;
        for (var hi = 0; hi < headings.length; hi++) {
          if (headings[hi].textContent.trim().toLowerCase() === titleLower) {
            hasHeading = true;
            break;
          }
        }
        if (hasHeading) {
          allCardsWithHeading.push(card);
        } else {
          allCardsWithText.push(card);
        }
      }
      var cardPool = allCardsWithHeading.length > 0 ? allCardsWithHeading : allCardsWithText;
      if (cardPool.length > 0) {
        cardPool.sort(function (a, b) {
          return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
        });
        var cardIdx = Math.min(occurrenceIndex, cardPool.length - 1);
        return { el: cardPool[cardIdx], strategy: '0: card title (occurrence ' + cardIdx + ')', _isContainer: true };
      }

      // Helper: skip elements inside buttons, tabs, or navigation controls
      function isInsideControl(el) {
        var p = el.parentElement;
        for (var ci = 0; ci < 5 && p; ci++) {
          if (p.tagName === 'BUTTON' || p.tagName === 'NAV') return true;
          var cls = (typeof p.className === 'string' ? p.className : (p.className && p.className.baseVal) || '').toLowerCase();
          if (cls.indexOf('segmentedcontrol') !== -1 || cls.indexOf('tablist') !== -1 || cls.indexOf('tab-') !== -1 || cls.indexOf('-tabs') !== -1) return true;
          if (p.getAttribute && (p.getAttribute('role') === 'tab' || p.getAttribute('role') === 'tablist')) return true;
          p = p.parentElement;
        }
        return false;
      }

      // Strategy 1: Exact leaf-node textContent match (skip nav/button elements)
      var leafMatches = [];
      for (var i = 0; i < headingElements.length; i++) {
        var el = headingElements[i];
        var text = (el.textContent || '').trim().toLowerCase();
        if (text === titleLower && el.children.length === 0 && !isInsideControl(el)) {
          leafMatches.push(el);
        }
      }
      if (leafMatches.length > 0) {
        leafMatches.sort(function (a, b) {
          return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
        });
        var leafIdx = Math.min(occurrenceIndex, leafMatches.length - 1);
        return { el: leafMatches[leafIdx], strategy: '1: exact leaf-node textContent (occurrence ' + leafIdx + ')' };
      }

      // Strategy 2: innerText match on small elements
      for (var j = 0; j < headingElements.length; j++) {
        var el2 = headingElements[j];
        var innerText = (el2.innerText || '').trim().toLowerCase();
        if (innerText === titleLower && el2.offsetHeight < 100 && !isInsideControl(el2)) {
          return { el: el2, strategy: '2: exact innerText on small element' };
        }
      }

      // Strategy 3: textContent match allowing child elements (size-bounded)
      // Search all element types (NR1 uses divs for chart titles on non-dashboard pages)
      for (var k = 0; k < getAllElements().length; k++) {
        var el3 = getAllElements()[k];
        var text3 = (el3.textContent || '').trim().toLowerCase();
        if (text3 === titleLower && el3.offsetHeight < 60 && el3.offsetWidth < 600 && !isInsideControl(el3)) {
          return { el: el3, strategy: '3: exact textContent with children (size-bounded)' };
        }
      }

      // Strategy 3b: textContent starts with title, small element (handles titles with info icons)
      var best3b = null;
      var best3bLen = Infinity;
      for (var kb = 0; kb < getAllElements().length; kb++) {
        var el3b = getAllElements()[kb];
        var text3b = (el3b.textContent || '').trim().toLowerCase();
        if (text3b.indexOf(titleLower) === 0 && text3b.length < titleLower.length + 10
            && el3b.offsetHeight < 50 && el3b.offsetHeight > 0
            && el3b.offsetWidth < 400 && el3b.offsetWidth > 0
            && text3b.length < best3bLen
            && !isInsideControl(el3b)) {
          best3b = el3b;
          best3bLen = text3b.length;
        }
      }
      if (best3b) {
        return { el: best3b, strategy: '3b: textContent startsWith on small element' };
      }

      // Strategy 4: title attribute match
      var titled = document.querySelectorAll('[title]');
      for (var t = 0; t < titled.length; t++) {
        var titleAttr = (titled[t].getAttribute('title') || '').trim().toLowerCase();
        if (titleAttr === titleLower) {
          return { el: titled[t], strategy: '4: title attribute' };
        }
      }

      // Strategy 5: aria-label match (skip nav/button controls)
      var ariaLabeled = document.querySelectorAll('[aria-label]');
      for (var a = 0; a < ariaLabeled.length; a++) {
        var ariaLabel = (ariaLabeled[a].getAttribute('aria-label') || '').trim().toLowerCase();
        if (ariaLabel === titleLower && !isInsideControl(ariaLabeled[a]) && ariaLabeled[a].tagName !== 'BUTTON') {
          return { el: ariaLabeled[a], strategy: '5: aria-label' };
        }
      }

      // Strategy 6: startsWith match on innerText (skip nav/button controls)
      var bestCandidate = null;
      var bestLen = Infinity;
      for (var s = 0; s < getAllElements().length; s++) {
        var el6 = getAllElements()[s];
        var inner6 = (el6.innerText || '').trim().toLowerCase();
        if (inner6.length > 0 && inner6.length < 200 && el6.offsetHeight < 60 && !isInsideControl(el6)) {
          if (inner6.indexOf(titleLower) === 0 && inner6.length < bestLen) {
            bestCandidate = el6;
            bestLen = inner6.length;
          }
        }
      }
      if (bestCandidate) {
        return { el: bestCandidate, strategy: '6: startsWith innerText' };
      }

      // Strategy 7: TreeWalker text node (skip nav/button controls)
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        var node = walker.currentNode;
        if (node.textContent.trim().toLowerCase() === titleLower && node.parentElement && !isInsideControl(node.parentElement)) {
          return { el: node.parentElement, strategy: '7: TreeWalker text node' };
        }
      }

      return null;
    }

    function showHighlight(targetElement, isAlreadyContainer) {
      var container;
      if (isAlreadyContainer) {
        // Strategy 0 found the container directly — no walk-up needed
        container = targetElement;
      } else {
        // Walk up to find the widget container
        container = targetElement;
        var maxWalk = 15;
        var bestContainer = null;
        while (container.parentElement && maxWalk-- > 0) {
          var parent = container.parentElement;
          var rect = parent.getBoundingClientRect();
          if (rect.width > window.innerWidth * 0.7) break;
          if (rect.width >= 150 && rect.height >= 80) {
            bestContainer = parent;
            break;
          }
          container = parent;
        }
        container = bestContainer || container;
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
      var highlightShown = false;

      // Force NR1's IntersectionObserver to re-fire by scrolling the
      // widget fully out of view and back.  We inject a temporary spacer
      // so there is always enough scroll room — even on short dashboards
      // where all widgets are already visible.
      function nudgeObservers() {
        var scrollEl = null;
        var el = container.parentElement;
        while (el && el !== document.body) {
          var cs = window.getComputedStyle(el);
          if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
            scrollEl = el;
            break;
          }
          el = el.parentElement;
        }
        if (!scrollEl) scrollEl = document.scrollingElement || document.documentElement;

        console.log(LOG, 'Nudging scroll container for IntersectionObserver:', scrollEl.tagName);

        // Add a spacer so the container can always scroll past the widget
        var spacer = document.createElement('div');
        spacer.style.cssText = 'height:' + (window.innerHeight + 500) + 'px;pointer-events:none';
        scrollEl.appendChild(spacer);

        var origTop = scrollEl.scrollTop;
        var jumpDistance = (scrollEl.clientHeight || window.innerHeight) + 200;
        scrollEl.scrollTop = origTop + jumpDistance;

        setTimeout(function () {
          scrollEl.scrollTop = origTop;
          spacer.remove();
          scrollEl.dispatchEvent(new Event('scroll', { bubbles: true }));
        }, 400);
      }

      function showOverlayAndFade() {
        if (highlightShown) return;
        highlightShown = true;
        _isHighlighting = false;
        clearInterval(pollInterval);
        positionOverlay();
        overlay.style.opacity = '1';
        nudgeObservers();
        setTimeout(function () {
          if (overlay.parentNode) {
            overlay.style.opacity = '0';
            setTimeout(function () { if (overlay.parentNode) overlay.remove(); }, 500);
          }
        }, 2000);
      }

      var pollInterval = setInterval(function () {
        if (highlightShown) { clearInterval(pollInterval); return; }
        var r = container.getBoundingClientRect();
        if (Math.abs(r.top - lastTop) < 1) { stableCount++; } else { stableCount = 0; }
        lastTop = r.top;
        positionOverlay();
        if (stableCount >= 3) {
          showOverlayAndFade();
        }
      }, 50);

      // Safety: force display after 2 seconds if scroll never settles
      setTimeout(function () {
        clearInterval(pollInterval);
        showOverlayAndFade();
      }, 2000);
    }

    // First attempt
    var result = findTitleInDom();
    if (result) {
      var foundRect = result.el.getBoundingClientRect();
      console.log(LOG, 'Found via strategy:', result.strategy);
      console.log(LOG, 'Element:', result.el.tagName, 'textContent:', JSON.stringify((result.el.textContent || '').slice(0, 80)));
      console.log(LOG, 'Element rect:', { top: Math.round(foundRect.top), left: Math.round(foundRect.left), width: Math.round(foundRect.width), height: Math.round(foundRect.height) });
      // Log parent chain for debugging
      var debugEl = result.el;
      for (var di = 0; di < 5 && debugEl.parentElement; di++) {
        debugEl = debugEl.parentElement;
        var dr = debugEl.getBoundingClientRect();
        var debugCls = typeof debugEl.className === 'string' ? debugEl.className : (debugEl.className && debugEl.className.baseVal) || '';
        console.log(LOG, 'Parent ' + (di + 1) + ':', debugEl.tagName, debugCls ? ('.' + debugCls.split(' ')[0]) : '', { top: Math.round(dr.top), left: Math.round(dr.left), width: Math.round(dr.width), height: Math.round(dr.height) });
      }
      showHighlight(result.el, result._isContainer);
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
          showHighlight(retryResult.el, retryResult._isContainer);
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
          _isHighlighting = false;
        }
      }, 300);
    }

    scrollAndRetry();
  }

  // ============================================================
  // Listen for commands from the service worker
  // ============================================================
  if (!_listenersRegistered) {
    _listenersRegistered = true;
    try {
      chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
        if (sender.id !== chrome.runtime.id) return;

        if (message.action === 'GET_LOCATION') {
          // Request location from the page script
          window.postMessage({ type: 'NR1_UTILS_GET_LOCATION' }, window.location.origin);
          // The page script will respond via NR1_UTILS_LOCATION_RESPONSE
          // which gets forwarded above
        }

        if (message.action === 'GET_DEBUG_INFO') {
          // Forward to the page script to re-send cached debug info
          window.postMessage({ type: 'NR1_UTILS_GET_DEBUG_INFO' }, window.location.origin);
        }

        if (message.action === 'HIGHLIGHT_WIDGET') {
          // Debounce rapid-fire highlight requests (clicking Locate can send duplicates)
          clearTimeout(_highlightDebounce);
          _highlightDebounce = setTimeout(function () {
            console.log('[NR1 Utils content] HIGHLIGHT_WIDGET received:', message.widgetTitle);
            highlightWidgetOnPage(message.widgetTitle, message.widgetId, message.pageName, message.occurrenceIndex || 0);
          }, 100);
        }
      });
    } catch (e) {
      // Extension context invalidated
    }
  }

  // Send initial URL on load
  sendUrlChange();
})();
