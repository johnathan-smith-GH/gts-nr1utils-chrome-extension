import React from '../../snowpack/pkg/react.js';
import { useRef, useEffect } from '../../snowpack/pkg/react.js';
import { LogRequestType } from '../types.js';
import Log from './Log.js';
import findAccountIds from '../utils/findAccountIds.js';
import matchWidgetByNrql from '../utils/matchWidgetByNrql.js';
import statusPriority from '../utils/statusPriority.js';

/**
 * Walk all text nodes inside a container and return Range objects
 * for every occurrence of `term` (case-insensitive).
 */
function findMatchRanges(container, term) {
  var ranges = [];
  if (!container || !term) return ranges;
  var lowerTerm = term.toLowerCase();
  var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    var node = walker.currentNode;
    var text = node.textContent.toLowerCase();
    var pos = 0;
    while ((pos = text.indexOf(lowerTerm, pos)) !== -1) {
      var range = new Range();
      range.setStart(node, pos);
      range.setEnd(node, pos + term.length);
      ranges.push(range);
      pos += term.length;
    }
  }
  return ranges;
}

function findOwningTeam(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (var i = 0; i < obj.length; i++) {
      var r = findOwningTeam(obj[i]);
      if (r) return r;
    }
    return null;
  }
  if (obj.owningTeam) return obj.owningTeam;
  for (var key in obj) {
    var r = findOwningTeam(obj[key]);
    if (r) return r;
  }
  return null;
}

const RequestsPage = props => {
  const {
    logData,
    setCurrentQueryIdx,
    currentQueryIdx,
    logFilter,
    updateLogFilter,
    windowHeight,
    showOnlyErrors,
    setShowOnlyErrors,
    showOnlyTimeouts,
    setShowOnlyTimeouts,
    selectedRequestIds,
    toggleSelectedIndex,
    selectAllVisible,
    clearSelectedIndices,
    widgetMap
  } = props;
  const [jsonSearch, setJsonSearch] = React.useState('');
  const [matchCount, setMatchCount] = React.useState(0);
  const [currentMatch, setCurrentMatch] = React.useState(0);
  const [copyLabel, setCopyLabel] = React.useState('Copy JSON to Clipboard');
  const matchRangesRef = useRef([]);
  const resultsRef = useRef(null);
  const selectedQueryRef = useRef(null);

  // Build placeholder entries for widget-defined NRQL queries not yet captured
  var widgetPlaceholders = React.useMemo(function () {
    var placeholders = [];
    if (widgetMap && widgetMap.length > 0) {
      // Build Set of normalized captured queries for O(1) exact lookup
      var capturedExactSet = new Set();
      var capturedNormList = [];
      logData.forEach(function (req) {
        if (req.query) {
          var n = req.query.replace(/\s+/g, ' ').trim().toLowerCase();
          capturedExactSet.add(n);
          capturedNormList.push(n);
        }
      });
      widgetMap.forEach(function (w) {
        if (w.inaccessible || !w.nrqlQueries) return;
        w.nrqlQueries.forEach(function (nrql) {
          var norm = nrql.replace(/\s+/g, ' ').trim().toLowerCase();
          // Fast exact check first
          if (capturedExactSet.has(norm)) return;
          // Substring fallback only when needed
          var alreadyCaptured = false;
          for (var ci = 0; ci < capturedNormList.length; ci++) {
            if (capturedNormList[ci].indexOf(norm) !== -1 || norm.indexOf(capturedNormList[ci]) !== -1) {
              alreadyCaptured = true;
              break;
            }
          }
          // FROM-clause + column overlap fallback (visualization-transformed NRQL)
          if (!alreadyCaptured) {
            var wFrom = norm.match(/\bfrom\s+(.+?)(?:\s+where\b|\s+since\b|\s+until\b|\s+limit\b|\s+facet\b|\s+timeseries\b|$)/i);
            if (wFrom) {
              var wFromNorm = wFrom[1].replace(/\s+/g, ' ').trim();
              var wSelect = (norm.match(/^select\s+(.+?)\s+from\b/i) || [])[1];
              if (wSelect) {
                var wCols = wSelect.split(',').map(function (c) { return c.trim().replace(/\s+as\s+.+$/i, '').trim(); });
                for (var fi = 0; fi < capturedNormList.length; fi++) {
                  var cFrom = capturedNormList[fi].match(/\bfrom\s+(.+?)(?:\s+where\b|\s+since\b|\s+until\b|\s+limit\b|\s+facet\b|\s+timeseries\b|$)/i);
                  if (!cFrom) continue;
                  if (cFrom[1].replace(/\s+/g, ' ').trim() !== wFromNorm) continue;
                  var cSelect = (capturedNormList[fi].match(/^select\s+(.+?)\s+from\b/i) || [])[1];
                  if (!cSelect) continue;
                  var colsMatch = wCols.every(function (col) { return col && cSelect.indexOf(col) !== -1; });
                  if (colsMatch) { alreadyCaptured = true; break; }
                }
              }
            }
          }
          if (!alreadyCaptured) {
            var fromMatch = nrql.match(/from\s+(\S+)/i);
            placeholders.push({
              _rid: 'placeholder-' + (w.widgetId || '') + '-' + nrql.slice(0, 20),
              id: -1,
              query: nrql,
              variables: {},
              response: null,
              errors: null,
              status: 'defined',
              type: 'CHART',
              name: fromMatch ? fromMatch[1] : nrql.slice(0, 24),
              timing: null,
              _widgetTitle: w.title,
              _widgetId: w.widgetId,
              _isPlaceholder: true,
              _matchedWidget: { title: w.title, widgetId: w.widgetId, pageName: w.pageName }
            });
          }
        });
      });
    }
    return placeholders;
  }, [widgetMap, logData]);

  var allRequests = widgetPlaceholders.concat(logData);
  const filteredRequests = logFilter.length ? allRequests.filter(function (request) {
    var filterLower = logFilter.toLowerCase();
    if (request._searchableText && request._searchableText.includes(filterLower)) return true;
    // Fallback for placeholders (no pre-computed text)
    var matched = request._matchedWidget || matchWidgetByNrql(request.query, widgetMap);
    if (matched) {
      var widgetStr = (matched.title + ' ' + matched.pageName + ' ' + matched.widgetId).toLowerCase();
      if (widgetStr.includes(filterLower)) return true;
    }
    // Last resort: check query text directly
    if (request.query && request.query.toLowerCase().includes(filterLower)) return true;
    return false;
  }) : allRequests;
  var visibleRequests = filteredRequests;
  if (showOnlyErrors) {
    visibleRequests = visibleRequests.filter(function (request) { return !!request.errors; });
  }
  if (showOnlyTimeouts) {
    visibleRequests = visibleRequests.filter(function (request) { return !!request._isTimeout; });
  }
  // Sort requests the same way Log.js will display them so that
  // currentQueryIdx (set when the user clicks a list row) maps to the
  // correct entry in both the rendered list and this detail pane.
  var sortedRequests = React.useMemo(function () {
    return [...visibleRequests].sort(function (a, b) {
      var pa = statusPriority(a);
      var pb = statusPriority(b);
      if (pa !== pb) return pa - pb;
      var aStart = a.timing ? a.timing.startTime : 0;
      var bStart = b.timing ? b.timing.startTime : 0;
      return bStart - aStart;
    });
  }, [visibleRequests]);
  var currentItemKey = currentQueryIdx !== undefined && sortedRequests[currentQueryIdx]
    ? (sortedRequests[currentQueryIdx].requestId || sortedRequests[currentQueryIdx]._rid || sortedRequests[currentQueryIdx].query || '')
    : '';

  // Track the query of the currently selected entry so we can follow it
  // when placeholder resolution causes list indices to shift
  useEffect(function () {
    if (currentQueryIdx !== undefined && sortedRequests[currentQueryIdx]) {
      selectedQueryRef.current = sortedRequests[currentQueryIdx] ? sortedRequests[currentQueryIdx].query || null : null;
    }
  }, [currentQueryIdx]);

  // Correct selection index when placeholder resolution shifts the list
  useEffect(function () {
    if (selectedQueryRef.current === null || selectedQueryRef.current === undefined || currentQueryIdx === undefined) return;
    var currentItem = sortedRequests[currentQueryIdx];
    if (currentItem && currentItem.query === selectedQueryRef.current) return;
    var tracked = selectedQueryRef.current.replace(/\s+/g, ' ').trim().toLowerCase();
    var bestIdx = -1;
    for (var i = 0; i < sortedRequests.length; i++) {
      var norm = (sortedRequests[i].query || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (norm === tracked || norm.indexOf(tracked) !== -1 || tracked.indexOf(norm) !== -1) {
        bestIdx = i;
        if (!sortedRequests[i]._isPlaceholder) break;
      }
    }
    if (bestIdx !== -1 && bestIdx !== currentQueryIdx) {
      setCurrentQueryIdx(bestIdx);
    }
  }, [currentQueryIdx, currentItemKey]);

  const currentQuery = currentQueryIdx !== undefined ? sortedRequests[currentQueryIdx] : undefined;
  const pageHeightStyle = {
    height: windowHeight ? windowHeight - 45 : 'default'
  };

  // Reset search when selecting a different query
  const prevQueryIdx = useRef(currentQueryIdx);
  useEffect(function () {
    if (prevQueryIdx.current !== currentQueryIdx) {
      setJsonSearch('');
      setCopyLabel('Copy JSON to Clipboard');
      prevQueryIdx.current = currentQueryIdx;
    }
  }, [currentQueryIdx]);

  // Highlight matches using CSS Custom Highlight API
  useEffect(function () {
    if (typeof CSS === 'undefined' || !CSS.highlights) return;
    CSS.highlights.delete('search-results');
    CSS.highlights.delete('search-current');

    if (!jsonSearch || !resultsRef.current) {
      matchRangesRef.current = [];
      setMatchCount(0);
      setCurrentMatch(0);
      return;
    }

    // Small delay to let react-json-view render
    var timer = setTimeout(function () {
      var ranges = findMatchRanges(resultsRef.current, jsonSearch);
      matchRangesRef.current = ranges;
      setMatchCount(ranges.length);
      setCurrentMatch(ranges.length > 0 ? 1 : 0);

      if (ranges.length > 0) {
        CSS.highlights.set('search-results', new Highlight(...ranges));
        CSS.highlights.set('search-current', new Highlight(ranges[0]));
        // Scroll first match into view
        scrollToRange(ranges[0]);
      }
    }, 50);
    return function () {
      clearTimeout(timer);
      if (CSS.highlights) {
        CSS.highlights.delete('search-results');
        CSS.highlights.delete('search-current');
      }
      matchRangesRef.current = [];
    };
  }, [jsonSearch, currentQueryIdx]);

  function scrollToRange(range) {
    var container = resultsRef.current;
    if (!container) return;
    var toolbar = container.querySelector('.App-resultToolbar');
    var toolbarHeight = toolbar ? toolbar.offsetHeight : 0;
    var rangeRect = range.getBoundingClientRect();
    var containerRect = container.getBoundingClientRect();
    var visibleTop = containerRect.top + toolbarHeight;
    if (rangeRect.top < visibleTop || rangeRect.bottom > containerRect.bottom) {
      var targetScroll = container.scrollTop + (rangeRect.top - visibleTop) - (containerRect.height - toolbarHeight) / 2;
      container.scrollTo({ top: targetScroll, behavior: 'smooth' });
    }
  }

  function goToMatch(index) {
    var ranges = matchRangesRef.current;
    if (ranges.length === 0 || !CSS.highlights) return;
    setCurrentMatch(index);
    if (ranges[index - 1]) { CSS.highlights.set('search-current', new Highlight(ranges[index - 1])); scrollToRange(ranges[index - 1]); }
  }

  function handlePrev() {
    if (matchCount === 0) return;
    var next = currentMatch <= 1 ? matchCount : currentMatch - 1;
    goToMatch(next);
  }

  function handleNext() {
    if (matchCount === 0) return;
    var next = currentMatch >= matchCount ? 1 : currentMatch + 1;
    goToMatch(next);
  }

  function handleClear() {
    setJsonSearch('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) { handlePrev(); } else { handleNext(); }
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      handleClear();
    }
  }

  // Pre-compute widget match and owning team to avoid redundant calls in JSX
  var currentWidgetMatch = null;
  if (currentQuery) {
    // DT trace requests get their own visualization title — check first
    if (currentQuery._dtVisualizationTitle) {
      currentWidgetMatch = { title: currentQuery._dtVisualizationTitle, widgetId: null, pageName: null };
    } else {
      currentWidgetMatch = currentQuery._matchedWidget || matchWidgetByNrql(currentQuery.query, widgetMap);
    }
  }
  var owningTeam = currentQuery ? findOwningTeam(currentQuery) : null;

  // Safely stringify currentQuery for the raw JSON display
  var currentQueryJson = '';
  if (currentQuery) {
    try {
      currentQueryJson = JSON.stringify(currentQuery, null, 2);
    } catch (e) {
      currentQueryJson = '{"error": "Could not serialize query (possible circular reference)"}';
    }
  }

  return /*#__PURE__*/React.createElement("section", {
    className: "App-page App-graphQL"
  }, /*#__PURE__*/React.createElement(Log, {
    pageHeightStyle: {},
    requests: sortedRequests,
    setCurrentQueryIdx: setCurrentQueryIdx,
    currentQueryIdx: currentQueryIdx,
    logFilter: logFilter,
    updateLogFilter: updateLogFilter,
    showOnlyErrors: showOnlyErrors,
    setShowOnlyErrors: setShowOnlyErrors,
    selectedRequestIds: selectedRequestIds || [],
    onToggleSelect: toggleSelectedIndex,
    onSelectAllVisible: selectAllVisible,
    onClearSelected: clearSelectedIndices,
    widgetMap: widgetMap
  }), (function () {
    // Show inaccessible widgets banner when widgets exist that the user can't access
    if (!widgetMap || !widgetMap.length) return null;
    var inaccessible = widgetMap.filter(function (w) { return w.inaccessible; });
    if (inaccessible.length === 0) return null;
    return /*#__PURE__*/React.createElement("div", {
      className: "App-inaccessibleBanner"
    }, /*#__PURE__*/React.createElement("span", {
      className: "App-inaccessibleLabel"
    }, "\u26A0\uFE0F " + inaccessible.length + " widget" + (inaccessible.length > 1 ? "s" : "") + " on this dashboard " + (inaccessible.length > 1 ? "were" : "was") + " added from an account the current user does not have access to."),
    /*#__PURE__*/React.createElement("span", {
      className: "App-inaccessibleNote"
    }, "The source account is not exposed by the platform for inaccessible widgets. To identify it, check with the dashboard owner (" + (function () {
      var owner = widgetMap.find(function (w) { return w.dashboardOwnerEmail; });
      return owner ? owner.dashboardOwnerEmail : 'unknown';
    })() + ") or an admin with access to edit this dashboard."),
    /*#__PURE__*/React.createElement("div", {
      className: "App-inaccessibleWidgets"
    }, /*#__PURE__*/React.createElement("span", {
      className: "App-inaccessibleWidgetsHeading"
    }, "Affected widgets:"), inaccessible.map(function (w) {
      return /*#__PURE__*/React.createElement("span", {
        key: w.widgetId,
        className: "App-inaccessibleWidgetName"
      }, w.title || '(untitled)');
    })));
  })(), currentQuery !== undefined && /*#__PURE__*/React.createElement("section", {
    className: "App-logSelected",
    ref: resultsRef
  }, /*#__PURE__*/React.createElement("div", {
    className: "App-resultToolbar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "App-jsonSearch"
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: "Search within result",
    "aria-label": "Search within JSON result",
    value: jsonSearch,
    onChange: function (e) { setJsonSearch(e.target.value); },
    onKeyDown: handleKeyDown
  }), jsonSearch && /*#__PURE__*/React.createElement("span", {
    className: "App-jsonSearchCount"
  }, matchCount > 0 ? (currentMatch + '/' + matchCount) : '0/0'), jsonSearch && /*#__PURE__*/React.createElement("button", {
    className: "App-jsonSearchNav",
    onClick: handlePrev,
    title: "Previous match (Shift+Enter)"
  }, "\u2303"), jsonSearch && /*#__PURE__*/React.createElement("button", {
    className: "App-jsonSearchNav",
    onClick: handleNext,
    title: "Next match (Enter)"
  }, "\u2304"), jsonSearch && /*#__PURE__*/React.createElement("button", {
    className: "App-jsonSearchNav",
    onClick: handleClear,
    title: "Close (Escape)"
  }, "\u2715")), /*#__PURE__*/React.createElement("div", {
    className: "App-copyResultBar"
  }, (function () {
    if (!currentWidgetMatch || (!currentWidgetMatch.title && !currentWidgetMatch.widgetId)) return null;
    return /*#__PURE__*/React.createElement("a", {
      className: "App-locateBtn",
      "aria-label": "Locate widget on page",
      onClick: function () {
        if (props.onLocateWidget) {
          props.onLocateWidget(currentWidgetMatch);
        }
      }
    }, "\uD83D\uDCCD Locate on Page");
  })(), /*#__PURE__*/React.createElement("a", {
    className: "App-copyResultBtn",
    "aria-label": "Copy JSON to clipboard",
    onClick: function () {
      navigator.clipboard.writeText(currentQueryJson).then(function () {
        setCopyLabel('Copied!');
        setTimeout(function () { setCopyLabel('Copy JSON to Clipboard'); }, 1500);
      }).catch(function (e) { console.warn('[NR1 Utils] Clipboard write failed:', e); });
    }
  }, copyLabel))), owningTeam && /*#__PURE__*/React.createElement("div", {
    className: "App-owningTeamBanner"
  }, /*#__PURE__*/React.createElement("span", {
    className: "App-owningTeamLabel"
  }, "Owning Team:"), /*#__PURE__*/React.createElement("span", {
    className: "App-owningTeamValue"
  }, owningTeam)),
  (function () {
    if (currentWidgetMatch) {
      return /*#__PURE__*/React.createElement("div", {
        className: "App-widgetHintsBanner"
      }, /*#__PURE__*/React.createElement("span", {
        className: "App-widgetHintsLabel"
      }, "Dashboard Widget:"), /*#__PURE__*/React.createElement("span", {
        className: "App-widgetHintsItem"
      }, /*#__PURE__*/React.createElement("strong", null, "Title: "), currentWidgetMatch.title || '(untitled)'),
      currentWidgetMatch.pageName && /*#__PURE__*/React.createElement("span", {
        className: "App-widgetHintsItem"
      }, /*#__PURE__*/React.createElement("strong", null, "Page: "), currentWidgetMatch.pageName),
      /*#__PURE__*/React.createElement("span", {
        className: "App-widgetHintsItem"
      }, /*#__PURE__*/React.createElement("strong", null, "Widget ID: "), currentWidgetMatch.widgetId));
    }
    // Fallback: show component hint from call stack if available
    if (currentQuery.componentHint) {
      return /*#__PURE__*/React.createElement("div", {
        className: "App-widgetHintsBanner"
      }, /*#__PURE__*/React.createElement("span", {
        className: "App-widgetHintsLabel"
      }, "Source Component:"), /*#__PURE__*/React.createElement("span", {
        className: "App-widgetHintsItem"
      }, currentQuery.componentHint));
    }
    return null;
  })(),
  findAccountIds(currentQuery).length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "App-accountIdBanner"
  }, /*#__PURE__*/React.createElement("span", {
    className: "App-accountIdLabel"
  }, "Account ID Identifiers Being Queried:"), /*#__PURE__*/React.createElement("span", {
    className: "App-accountIdValue"
  }, findAccountIds(currentQuery).join(', '))),
  currentQuery.errors && /*#__PURE__*/React.createElement("div", {
    className: "App-errorBanner"
  }, /*#__PURE__*/React.createElement("span", {
    className: "App-errorBannerLabel"
  }, Array.isArray(currentQuery.errors) && currentQuery.errors.length > 1
    ? "Errors found in response below:"
    : "Error found in response below:"),
  Array.isArray(currentQuery.errors) ? currentQuery.errors.map(function (err, i) {
    return /*#__PURE__*/React.createElement("div", { key: i, className: "App-errorBannerItem" },
      err.message || JSON.stringify(err));
  }) : /*#__PURE__*/React.createElement("div", { className: "App-errorBannerItem" },
    typeof currentQuery.errors === 'string' ? currentQuery.errors : JSON.stringify(currentQuery.errors))),
  /*#__PURE__*/React.createElement("pre", {
    className: "App-rawJson"
  }, currentQueryJson)));
};

export default RequestsPage;
