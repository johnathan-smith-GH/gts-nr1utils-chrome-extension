import React from '../../snowpack/pkg/react.js';
import LogEntry from './LogEntry.js';

const currentLogClass = (thisIdx, idx) => `App-log-item ${idx === thisIdx ? 'App-log-item--selected' : ''}`;

function getAccountIds(req) {
  var ids = [];
  function search(o) {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) {
      for (var i = 0; i < o.length; i++) search(o[i]);
      return;
    }
    for (var key in o) {
      if (key === 'account_ids' && Array.isArray(o[key])) {
        o[key].forEach(function (id) { if (id != null) ids.push(String(id)); });
      }
      if (typeof o[key] === 'object') search(o[key]);
    }
  }
  search(req);
  return ids.filter(function (id, i, arr) { return arr.indexOf(id) === i; });
}

const Log = props => {
  const {
    requests,
    setCurrentQueryIdx,
    currentQueryIdx,
    pageHeightStyle,
    logFilter,
    updateLogFilter,
    showTiming,
    showOnlyErrors,
    setShowOnlyErrors,
    selectedIndices,
    onToggleSelect,
    onSelectAllVisible,
    onClearSelected
  } = props;
  const [showMultiAccountOnly, setShowMultiAccountOnly] = React.useState(false);
  function statusPriority(req) {
    if (req.status === 'pending') return 0;
    if (req.status === 'error' || req.status === 'timeout') return 1;
    if (req.errors) return 1;
    return 2;
  }
  const sortedByStartTime = requests.sort(function (a, b) {
    var pa = statusPriority(a);
    var pb = statusPriority(b);
    if (pa !== pb) return pa - pb;
    var aStart = a.timing ? a.timing.startTime : 0;
    var bStart = b.timing ? b.timing.startTime : 0;
    return bStart - aStart;
  });
  const overallStartTime = sortedByStartTime[0] && sortedByStartTime[0].timing ? sortedByStartTime[0].timing.startTime : 0;
  const overallEndTime = requests.map(function (request) { return request.timing ? request.timing.startTime + request.timing.totalTime : 0; }).sort(function (a, b) { return b - a; })[0] || 0;

  const handleKeyDown = event => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCurrentQueryIdx(currentQueryIdx ? currentQueryIdx - 1 : 0);
    } else if (event.key === 'ArrowDown') {
      if (currentQueryIdx === undefined || currentQueryIdx === requests.length - 1) return;
      event.preventDefault();
      setCurrentQueryIdx(currentQueryIdx === undefined ? 0 : currentQueryIdx + 1);
    }
  };

  // Detect results querying multiple account IDs
  var multiAccountResults = [];
  var allAccountIds = {};
  sortedByStartTime.forEach(function (req) {
    var ids = getAccountIds(req);
    ids.forEach(function (id) { allAccountIds[id] = (allAccountIds[id] || 0) + 1; });
    if (ids.length > 1) multiAccountResults.push(req);
  });
  var uniqueAccountIds = Object.keys(allAccountIds);

  // Apply multi-account filter
  var displayRequests = showMultiAccountOnly
    ? sortedByStartTime.filter(function (req) { return getAccountIds(req).length > 1; })
    : sortedByStartTime;

  const allVisibleIndices = displayRequests.map((_, idx) => idx);
  const allSelected = displayRequests.length > 0 && allVisibleIndices.every(idx => selectedIndices.includes(idx));
  const someSelected = selectedIndices.length > 0;

  const handleSelectAll = () => {
    if (allSelected) {
      onClearSelected();
    } else {
      onSelectAllVisible(allVisibleIndices);
    }
  };

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
  })), multiAccountResults.length > 0 && /*#__PURE__*/React.createElement("div", {
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
    onKeyDown: handleKeyDown
  }, displayRequests.map((req, idx) => /*#__PURE__*/React.createElement(LogEntry, {
    request: req,
    key: (req.requestId || '') + '-' + (req.id || '') + '-' + (req.name || '') + '-' + idx,
    setCurrentQueryIdx: setCurrentQueryIdx,
    className: currentLogClass(idx, currentQueryIdx),
    isSelected: idx === currentQueryIdx,
    isChecked: selectedIndices.includes(idx),
    onToggleSelect: onToggleSelect,
    idx: idx,
    overallStartTime: overallStartTime,
    overallEndTime: overallEndTime
  }))));
};

export default /*#__PURE__*/React.memo(Log);