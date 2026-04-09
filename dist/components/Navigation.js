import React from '../../snowpack/pkg/react.js';
import { PageName } from '../types.js';

// FIXME: Add in classnames
const currentPageClass = (page, thisPage) => page === thisPage ? 'App-nav--currentLink' : '';

const pageNameToLabel = {
  [PageName.GRAPHQL_REQUESTS]: { file: 'nerdgraph-requests', label: 'NerdGraph' },
  [PageName.NRQL_REQUESTS]: { file: 'nrql-requests', label: 'NRQL' },
};

const exportJson = (data, filename) => {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const getTimestamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

const Navigation = props => {
  const {
    setCurrentPage,
    clearLog,
    currentPage,
    preserveLog,
    handlePreserveLog,
    showVerbose,
    setShowVerbose,
    showTiming,
    setShowTiming,
    showOnlyErrors,
    setShowOnlyErrors,
    showOnlyTimeouts,
    setShowOnlyTimeouts,
    logData,
    visibleLogData,
    allRequests,
    selectedIndices,
    selectedCount
  } = props;

  const currentInfo = pageNameToLabel[currentPage] || { file: 'requests', label: 'Results' };

  const handleExportClick = async () => {
    if (selectedCount === 0) return;
    const selectedData = visibleLogData.filter((_, idx) => selectedIndices.includes(idx));
    const json = JSON.stringify(selectedData, null, 2);
    const defaultName = `${currentInfo.file}-${getTimestamp()}.json`;

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
  };

  const isRequestPage = [PageName.GRAPHQL_REQUESTS, PageName.NRQL_REQUESTS].includes(currentPage);

  return /*#__PURE__*/React.createElement("nav", {
    className: "App-nav"
  }, /*#__PURE__*/React.createElement("section", {
    className: "App-navMain"
  }, /*#__PURE__*/React.createElement("a", {
    role: "button",
    className: currentPageClass(currentPage, PageName.GRAPHQL_REQUESTS),
    onClick: () => setCurrentPage(PageName.GRAPHQL_REQUESTS)
  }, "NerdGraph requests"), /*#__PURE__*/React.createElement("a", {
    role: "button",
    className: currentPageClass(currentPage, PageName.NRQL_REQUESTS),
    onClick: () => setCurrentPage(PageName.NRQL_REQUESTS)
  }, "NRQL requests"), /*#__PURE__*/React.createElement("a", {
    role: "button",
    className: currentPageClass(currentPage, PageName.DEBUG_INFO),
    onClick: () => setCurrentPage(PageName.DEBUG_INFO)
  }, "Debug Mode"), /*#__PURE__*/React.createElement("a", {
    role: "button",
    className: "App-guideBtn",
    onClick: function () { window.open(chrome.runtime.getURL('guide.html'), '_blank'); },
    title: "User's Guide"
  }, "User Guide")), isRequestPage && /*#__PURE__*/React.createElement("section", {
    className: "App-navSecondary"
  }, /*#__PURE__*/React.createElement("a", {
    className: "App-clearLog",
    onClick: clearLog
  }, "Clear log"), /*#__PURE__*/React.createElement("a", {
    className: `App-exportBtn ${selectedCount === 0 ? 'App-exportBtn--disabled' : ''}`,
    onClick: handleExportClick,
    title: selectedCount === 0 ? 'Select at least one result to export' : ''
  }, "Export")), /*#__PURE__*/React.createElement("section", {
    className: "App-navControls"
  }, isRequestPage && /*#__PURE__*/React.createElement("span", {
    className: "App-checkBoxOption"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: showOnlyErrors,
    onChange: setShowOnlyErrors
  }), "Errors only"), isRequestPage && /*#__PURE__*/React.createElement("span", {
    className: "App-checkBoxOption"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: showOnlyTimeouts,
    onChange: setShowOnlyTimeouts
  }), "Timeouts only")));
};

export default /*#__PURE__*/React.memo(Navigation);
