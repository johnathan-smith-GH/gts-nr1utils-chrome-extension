import React from '../../snowpack/pkg/react.js';
import { PageName } from '../types.js';

const currentPageClass = (page, thisPage) => page === thisPage ? 'App-nav--currentLink' : '';

const pageNameToLabel = {
  [PageName.GRAPHQL_REQUESTS]: { file: 'nerdgraph-requests', label: 'NerdGraph' },
  [PageName.NRQL_REQUESTS]: { file: 'nrql-requests', label: 'NRQL' },
};

const getTimestamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

const Navigation = props => {
  const {
    setCurrentPage,
    clearLog,
    currentPage,
    preserveLog,
    handlePreserveLog,
    showOnlyErrors,
    setShowOnlyErrors,
    showOnlyTimeouts,
    setShowOnlyTimeouts,
    logData,
    visibleLogData,
    allRequests,
    selectedRequestIds,
    selectedCount
  } = props;

  const handleTabKeyDown = (e, action) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action();
    }
  };

  const currentInfo = pageNameToLabel[currentPage] || { file: 'requests', label: 'Results' };

  const handleExportClick = async () => {
    if (selectedCount === 0) return;
    const selectedData = visibleLogData.filter(function (req) {
      var rid = req.requestId || req._rid || '';
      return selectedRequestIds.includes(rid);
    });
    const json = JSON.stringify(selectedData, null, 2);
    const defaultName = `${currentInfo.file}-${getTimestamp()}.json`;

    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: defaultName,
          types: [{
            description: 'JSON File',
            accept: { 'application/json': ['.json'] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
      } catch (e) {
        // User cancelled the save dialog — ignore
      }
    } else {
      try {
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = defaultName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {
        console.warn('[NR1 Utils] Export fallback failed:', e);
      }
    }
  };

  const isRequestPage = [PageName.GRAPHQL_REQUESTS, PageName.NRQL_REQUESTS].includes(currentPage);

  return /*#__PURE__*/React.createElement("nav", {
    className: "App-nav"
  }, /*#__PURE__*/React.createElement("section", {
    className: "App-navMain"
  }, /*#__PURE__*/React.createElement("a", {
    role: "button",
    tabIndex: "0",
    className: currentPageClass(currentPage, PageName.GRAPHQL_REQUESTS),
    onClick: () => setCurrentPage(PageName.GRAPHQL_REQUESTS),
    onKeyDown: (e) => handleTabKeyDown(e, () => setCurrentPage(PageName.GRAPHQL_REQUESTS))
  }, "NerdGraph requests"), /*#__PURE__*/React.createElement("a", {
    role: "button",
    tabIndex: "0",
    className: currentPageClass(currentPage, PageName.NRQL_REQUESTS),
    onClick: () => setCurrentPage(PageName.NRQL_REQUESTS),
    onKeyDown: (e) => handleTabKeyDown(e, () => setCurrentPage(PageName.NRQL_REQUESTS))
  }, "NRQL requests"), /*#__PURE__*/React.createElement("a", {
    role: "button",
    tabIndex: "0",
    className: currentPageClass(currentPage, PageName.DEBUG_INFO),
    onClick: () => setCurrentPage(PageName.DEBUG_INFO),
    onKeyDown: (e) => handleTabKeyDown(e, () => setCurrentPage(PageName.DEBUG_INFO))
  }, "Debug Mode"), /*#__PURE__*/React.createElement("a", {
    role: "button",
    tabIndex: "0",
    className: "App-guideBtn",
    onClick: function () { window.open(chrome.runtime.getURL('docs/guide.html'), '_blank'); },
    onKeyDown: (e) => handleTabKeyDown(e, () => window.open(chrome.runtime.getURL('docs/guide.html'), '_blank')),
    title: "User's Guide"
  }, "User Guide")), isRequestPage && /*#__PURE__*/React.createElement("section", {
    className: "App-navSecondary"
  }, /*#__PURE__*/React.createElement("a", {
    role: "button",
    tabIndex: "0",
    className: "App-clearLog",
    onClick: clearLog,
    onKeyDown: (e) => handleTabKeyDown(e, clearLog)
  }, "Clear log"), /*#__PURE__*/React.createElement("a", {
    role: "button",
    tabIndex: "0",
    className: `App-exportBtn ${selectedCount === 0 ? 'App-exportBtn--disabled' : ''}`,
    onClick: handleExportClick,
    onKeyDown: (e) => handleTabKeyDown(e, handleExportClick),
    title: selectedCount === 0 ? 'Select at least one result to export' : ''
  }, "Export")), /*#__PURE__*/React.createElement("section", {
    className: "App-navControls"
  }, isRequestPage && /*#__PURE__*/React.createElement("label", {
    className: "App-checkBoxOption"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: showOnlyErrors,
    onChange: setShowOnlyErrors
  }), "Errors only"), isRequestPage && /*#__PURE__*/React.createElement("label", {
    className: "App-checkBoxOption"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: showOnlyTimeouts,
    onChange: setShowOnlyTimeouts
  }), "Timeouts only")));
};

export default /*#__PURE__*/React.memo(Navigation);
