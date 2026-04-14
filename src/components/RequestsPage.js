import React from '../../snowpack/pkg/react.js';
import { useRef, useEffect } from '../../snowpack/pkg/react.js';
import { LogRequestType } from '../types.js';
import Log from './Log.js';
import ResponseDataSection from './ResponseDataSection.js';
import findAccountIds from '../utils/findAccountIds.js';
import matchWidgetByNrql from '../utils/matchWidgetByNrql.js';

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
    showVerbose,
    showTiming,
    showOnlyErrors,
    setShowOnlyErrors,
    showOnlyTimeouts,
    setShowOnlyTimeouts,
    selectedIndices,
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

  // Build placeholder entries for widget-defined NRQL queries not yet captured
  var widgetPlaceholders = [];
  if (widgetMap && widgetMap.length > 0) {
    var capturedNrqlNormalized = {};
    logData.forEach(function (req) {
      if (req.query) capturedNrqlNormalized[req.query.replace(/\s+/g, ' ').trim().toLowerCase()] = true;
    });
    widgetMap.forEach(function (w) {
      if (w.inaccessible || !w.nrqlQueries) return;
      w.nrqlQueries.forEach(function (nrql) {
        var norm = nrql.replace(/\s+/g, ' ').trim().toLowerCase();
        var alreadyCaptured = false;
        for (var key in capturedNrqlNormalized) {
          if (key === norm || key.indexOf(norm) !== -1 || norm.indexOf(key) !== -1) {
            alreadyCaptured = true;
            break;
          }
        }
        if (!alreadyCaptured) {
          var fromMatch = nrql.match(/from\s+(\S+)/i);
          widgetPlaceholders.push({
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

  var allRequests = widgetPlaceholders.concat(logData);
  const filteredRequests = logFilter.length ? allRequests.filter(function (request) {
    var filterLower = logFilter.toLowerCase();
    if (JSON.stringify(request).toLowerCase().includes(filterLower)) return true;
    // Also search matched widget title/page
    var matched = request._matchedWidget || matchWidgetByNrql(request.query, widgetMap);
    if (matched) {
      var widgetStr = (matched.title + ' ' + matched.pageName + ' ' + matched.widgetId).toLowerCase();
      if (widgetStr.includes(filterLower)) return true;
    }
    return false;
  }) : allRequests;
  var visibleRequests = filteredRequests;
  if (showOnlyErrors) {
    visibleRequests = visibleRequests.filter(function (request) { return !!request.errors; });
  }
  if (showOnlyTimeouts) {
    visibleRequests = visibleRequests.filter(function (request) { return request.errors && JSON.stringify(request.errors).match(/timeout/i); });
  }
  const currentQuery = currentQueryIdx !== undefined ? visibleRequests[currentQueryIdx] : undefined;
  const pageHeightStyle = {
    height: windowHeight ? windowHeight - 45 : 'default'
  };
  const logHeightStyle = {
    height: windowHeight ? windowHeight - 95 : 'default'
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
    if (!CSS.highlights) return;
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
    CSS.highlights.set('search-current', new Highlight(ranges[index - 1]));
    scrollToRange(ranges[index - 1]);
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

  return /*#__PURE__*/React.createElement("section", {
    className: "App-page App-graphQL"
  }, /*#__PURE__*/React.createElement(Log, {
    pageHeightStyle: {},
    requests: visibleRequests,
    setCurrentQueryIdx: setCurrentQueryIdx,
    currentQueryIdx: currentQueryIdx,
    logFilter: logFilter,
    updateLogFilter: updateLogFilter,
    showTiming: showTiming,
    showOnlyErrors: showOnlyErrors,
    setShowOnlyErrors: setShowOnlyErrors,
    selectedIndices: selectedIndices || [],
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
    var matched = currentQuery._matchedWidget || matchWidgetByNrql(currentQuery.query, widgetMap);
    if (!matched) return null;
    return /*#__PURE__*/React.createElement("a", {
      className: "App-locateBtn",
      onClick: function () {
        if (props.onLocateWidget) {
          props.onLocateWidget(matched);
        }
      }
    }, "\uD83D\uDCCD Locate on Page");
  })(), /*#__PURE__*/React.createElement("a", {
    className: "App-copyResultBtn",
    onClick: function () {
      var json = JSON.stringify(currentQuery, null, 2);
      navigator.clipboard.writeText(json).then(function () {
        setCopyLabel('Copied!');
        setTimeout(function () { setCopyLabel('Copy JSON to Clipboard'); }, 1500);
      });
    }
  }, copyLabel))), findOwningTeam(currentQuery) && /*#__PURE__*/React.createElement("div", {
    className: "App-owningTeamBanner"
  }, /*#__PURE__*/React.createElement("span", {
    className: "App-owningTeamLabel"
  }, "Owning Team:"), /*#__PURE__*/React.createElement("span", {
    className: "App-owningTeamValue"
  }, findOwningTeam(currentQuery))),
  (function () {
    var matched = currentQuery._matchedWidget || matchWidgetByNrql(currentQuery.query, widgetMap);
    if (matched) {
      return /*#__PURE__*/React.createElement("div", {
        className: "App-widgetHintsBanner"
      }, /*#__PURE__*/React.createElement("span", {
        className: "App-widgetHintsLabel"
      }, "Dashboard Widget:"), /*#__PURE__*/React.createElement("span", {
        className: "App-widgetHintsItem"
      }, /*#__PURE__*/React.createElement("strong", null, "Title: "), matched.title || '(untitled)'),
      matched.pageName && /*#__PURE__*/React.createElement("span", {
        className: "App-widgetHintsItem"
      }, /*#__PURE__*/React.createElement("strong", null, "Page: "), matched.pageName),
      /*#__PURE__*/React.createElement("span", {
        className: "App-widgetHintsItem"
      }, /*#__PURE__*/React.createElement("strong", null, "Widget ID: "), matched.widgetId));
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
  }, JSON.stringify(currentQuery, null, 2))));
};

export default RequestsPage;
