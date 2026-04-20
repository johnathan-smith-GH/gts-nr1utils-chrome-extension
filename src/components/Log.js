import React, { useEffect, useRef } from '../../snowpack/pkg/react.js';
import LogEntry from './LogEntry.js';
import findAccountIds from '../utils/findAccountIds.js';


const currentLogClass = (thisIdx, idx) => `App-log-item ${idx === thisIdx ? 'App-log-item--selected' : ''}`;

const Log = props => {
  const {
    requests,
    setCurrentQueryIdx,
    currentQueryIdx,
    pageHeightStyle,
    logFilter,
    updateLogFilter,
    showOnlyErrors,
    setShowOnlyErrors,
    selectedRequestIds,
    onToggleSelect,
    onSelectAllVisible,
    onClearSelected,
    widgetMap
  } = props;
  const [showMultiAccountOnly, setShowMultiAccountOnly] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());
  const hasPending = requests.some(function (r) { return r.status === 'pending'; });
  useEffect(function () {
    if (!hasPending) return;
    var interval = setInterval(function () { setNow(Date.now()); }, 200);
    return function () { clearInterval(interval); };
  }, [hasPending]);
  // Requests arrive pre-sorted from RequestsPage (by status priority, then
  // start time descending).  Using the same array here keeps list indices
  // consistent with the detail-pane lookup in RequestsPage.
  // Detect results querying multiple account IDs
  var multiAccountResults = [];
  var allAccountIds = {};
  requests.forEach(function (req) {
    var ids = findAccountIds(req);
    ids.forEach(function (id) { allAccountIds[id] = (allAccountIds[id] || 0) + 1; });
    if (ids.length > 1) multiAccountResults.push(req);
  });
  var uniqueAccountIds = Object.keys(allAccountIds);

  // Apply multi-account filter (placeholders are now included in requests from RequestsPage)
  var widgetPlaceholders = requests.filter(function (r) { return r._isPlaceholder; });
  var displayRequests = showMultiAccountOnly
    ? requests.filter(function (req) { return findAccountIds(req).length > 1; })
    : requests;

  const handleKeyDown = event => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCurrentQueryIdx(currentQueryIdx ? currentQueryIdx - 1 : 0);
    } else if (event.key === 'ArrowDown') {
      if (currentQueryIdx === undefined || currentQueryIdx === displayRequests.length - 1) return;
      event.preventDefault();
      setCurrentQueryIdx(currentQueryIdx === undefined ? 0 : currentQueryIdx + 1);
    }
  };

  const allVisibleRids = displayRequests.map(function (req) { return req.requestId || req._rid || ''; });
  const allSelected = displayRequests.length > 0 && allVisibleRids.every(function (rid) { return selectedRequestIds.includes(rid); });
  const someSelected = selectedRequestIds.length > 0;

  const handleSelectAll = () => {
    if (allSelected) {
      onClearSelected();
    } else {
      onSelectAllVisible(allVisibleRids);
    }
  };

  // Windowed virtualization using normal flow + padding (no position: absolute)
  const ITEM_HEIGHT = 56;
  const BUFFER = 10;
  const listRef = useRef(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const handleListScroll = React.useCallback(function (e) {
    setScrollTop(e.target.scrollTop);
  }, []);
  var totalItems = displayRequests.length;
  var listHeight = typeof window !== 'undefined' ? (window.innerHeight - 200) : 400;
  var startIdx = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER);
  var endIdx = Math.min(totalItems, Math.ceil((scrollTop + listHeight) / ITEM_HEIGHT) + BUFFER);
  if (currentQueryIdx !== undefined && currentQueryIdx >= 0 && currentQueryIdx < totalItems) {
    if (currentQueryIdx < startIdx) startIdx = currentQueryIdx;
    if (currentQueryIdx >= endIdx) endIdx = currentQueryIdx + 1;
  }
  // Padding replaces unmounted items above/below the visible window
  var paddingTop = startIdx * ITEM_HEIGHT;
  var paddingBottom = (totalItems - endIdx) * ITEM_HEIGHT;

  return /*#__PURE__*/React.createElement("section", {
    className: "App-logWrapper",
    style: pageHeightStyle
  }, /*#__PURE__*/React.createElement("div", {
    className: "App-logFilter"
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: "Search for results",
    value: logFilter,
    onChange: updateLogFilter
  })), widgetMap && widgetMap.length > 0 && widgetPlaceholders.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "App-dashboardNotice"
  }, /*#__PURE__*/React.createElement("strong", null, "Dashboard detected"), " \u2014 grey entries in results below are widget-defined queries not yet captured as network requests. They will be replaced with live results as widgets are loaded by using the 'Locate on page' within the gray entry, or by scrolling through the dashboard."),
  multiAccountResults.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "App-multiAccountBanner"
  }, /*#__PURE__*/React.createElement("span", {
    className: "App-multiAccountLabel"
  }, multiAccountResults.length + " result" + (multiAccountResults.length !== 1 ? "s" : "") + " found querying more than one account ID: " + uniqueAccountIds.join(', ')),
  /*#__PURE__*/React.createElement("a", {
    className: "App-multiAccountBtn" + (showMultiAccountOnly ? " App-multiAccountBtn--active" : ""),
    onClick: function () { setShowMultiAccountOnly(!showMultiAccountOnly); }
  }, showMultiAccountOnly ? "Show all results" : "Show only multi-account results")),
  displayRequests.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "App-selectAll"
  }, /*#__PURE__*/React.createElement("label", null,
    /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      checked: allSelected,
      ref: function (el) { if (el) el.indeterminate = someSelected && !allSelected; },
      onChange: handleSelectAll
    }),
    `Select all (${displayRequests.length})`
  )), !someSelected && displayRequests.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "App-selectHint"
  }, "Select one or more results to export"), /*#__PURE__*/React.createElement("ul", {
    className: "App-log",
    onKeyDown: handleKeyDown,
    onScroll: handleListScroll,
    ref: listRef
  }, paddingTop > 0 && /*#__PURE__*/React.createElement("li", {
    style: { height: paddingTop, listStyle: 'none', padding: 0, margin: 0 },
    "aria-hidden": "true"
  }), displayRequests.slice(startIdx, endIdx).map(function (req, i) {
    var idx = startIdx + i;
    var rid = req.requestId || req._rid || '';
    return /*#__PURE__*/React.createElement(LogEntry, {
      request: req,
      key: (req.requestId || '') + '-' + (req.id || '') + '-' + (req.name || '') + '-' + idx,
      setCurrentQueryIdx: setCurrentQueryIdx,
      className: currentLogClass(idx, currentQueryIdx),
      isSelected: idx === currentQueryIdx,
      isChecked: selectedRequestIds.includes(rid),
      onToggleSelect: onToggleSelect,
      idx: idx,
      rid: rid,
      now: now
    });
  }), paddingBottom > 0 && /*#__PURE__*/React.createElement("li", {
    style: { height: paddingBottom, listStyle: 'none', padding: 0, margin: 0 },
    "aria-hidden": "true"
  })));
};

export default /*#__PURE__*/React.memo(Log);