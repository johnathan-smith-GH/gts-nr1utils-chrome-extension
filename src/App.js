import React, { useEffect } from '../snowpack/pkg/react.js';
import { connect } from '../snowpack/pkg/react-redux.js';
import './App.css.proxy.js';
import Navigation from './components/Navigation.js';
import rootSlice from './state/rootSlice.js';
import { PageName } from './types.js';
import RequestsPage from './components/RequestsPage.js';
import buildGraphqlRequests from './utils/graphql/buildGraphqlRequests.js';
import buildNrqlRequests from './utils/nrql/buildNrqlRequests.js';
import extractNrqlFromGraphql from './utils/nrql/extractNrqlFromGraphql.js';
import DebugInfoPage from './components/DebugInfoPage.js';
const {
  actions
} = rootSlice;

const mapStateToProps = state => ({
  currentPage: state.currentPage,
  currentQueryIdx: state.currentQueryIdx,
  preserveLog: state.preserveLog,
  windowHeight: state.windowHeight,
  logFilter: state.logFilter,
  gqlRequests: state.gqlRequests,
  nrqlRequests: state.nrqlRequests,
  showVerbose: state.showVerbose,
  showTiming: state.showTiming,
  selectedIndices: state.selectedIndices,
  showOnlyErrors: state.showOnlyErrors,
  showOnlyTimeouts: state.showOnlyTimeouts,
  debugPlatformInfo: state.debugPlatformInfo,
  debugNerdpacks: state.debugNerdpacks,
  debugCurrentNerdletId: state.debugCurrentNerdletId,
  debugEntityGuid: state.debugEntityGuid,
  widgetMap: state.widgetMap
});

const mapDispatchToProps = {
  setCurrentPage: pageName => actions.setCurrentPage(pageName),
  setCurrentQueryIdx: idx => actions.setCurrentQueryIdx(idx),
  setPreserveLog: event => actions.setPreserveLog(event.target.checked),
  setWindowHeight: windowHeight => actions.setWindowHeight(windowHeight),
  setLogFilter: event => actions.setLogFilter(event.target.value),
  updateGqlRequests: reqs => actions.updateGqlRequests(reqs),
  clearLog: () => actions.clearLog(),
  clearAllRequests: () => actions.clearAllRequests(),
  updateNrqlRequests: reqs => actions.updateNrqlRequests(reqs),
  setShowVerbose: event => actions.setShowVerbose(event.target.checked),
  setShowTiming: event => actions.setShowTiming(event.target.checked),
  setShowOnlyErrors: event => actions.setShowOnlyErrors(event.target.checked),
  setShowOnlyTimeouts: event => actions.setShowOnlyTimeouts(event.target.checked),
  toggleSelectedIndex: idx => actions.toggleSelectedIndex(idx),
  selectAllVisible: indices => actions.selectAllVisible(indices),
  clearSelectedIndices: () => actions.clearSelectedIndices(),
  addPendingGqlRequest: req => actions.addPendingGqlRequest(req),
  addPendingNrqlRequest: req => actions.addPendingNrqlRequest(req),
  completeRequest: data => actions.completeRequest(data),
  setDebugPlatformInfo: info => actions.setDebugPlatformInfo(info),
  setDebugNerdpacks: packs => actions.setDebugNerdpacks(packs),
  setDebugCurrentNerdlet: data => actions.setDebugCurrentNerdlet(data),
  resetDebugInfo: () => actions.resetDebugInfo(),
  setWidgetMap: map => actions.setWidgetMap(map)
};

/**
 * Extract a widget map from a GetDashboardEntityQuery response.
 * Returns an array of { widgetId, title, nrqlQueries: [string] } objects.
 */
function extractWidgetMapFromDashboard(graphqlRequests) {
  var widgets = [];
  for (var i = 0; i < graphqlRequests.length; i++) {
    var req = graphqlRequests[i];
    if (!req.name || (req.name.indexOf('DashboardEntity') === -1 && req.name.indexOf('GetDashboard') === -1)) continue;
    var resp = req.response;
    if (!resp || !resp.data) continue;
    var entity = resp.data.actor && resp.data.actor.entity;
    if (!entity || !entity.pages) continue;
    var dashboardAccountId = entity.accountId || null;
    var dashboardOwnerEmail = (entity.owner && entity.owner.email) || null;
    for (var pi = 0; pi < entity.pages.length; pi++) {
      var page = entity.pages[pi];
      var pageName = page.name || '';
      if (!page.widgets) continue;
      for (var wi = 0; wi < page.widgets.length; wi++) {
        var w = page.widgets[wi];
        var raw = w.rawConfiguration || {};
        var viz = w.visualization && w.visualization.id;
        var isInaccessible = viz === 'viz.inaccessible';
        var nrqlQueries = [];
        if (raw.nrqlQueries && Array.isArray(raw.nrqlQueries)) {
          for (var qi = 0; qi < raw.nrqlQueries.length; qi++) {
            if (raw.nrqlQueries[qi].query) nrqlQueries.push(raw.nrqlQueries[qi].query);
          }
        }
        if (nrqlQueries.length > 0 || w.title) {
          widgets.push({
            widgetId: w.id,
            title: w.title || '',
            pageName: pageName,
            nrqlQueries: nrqlQueries,
            layout: w.layout || null,
            inaccessible: isInaccessible,
            dashboardAccountId: dashboardAccountId,
            dashboardOwnerEmail: dashboardOwnerEmail
          });
        }
      }
    }
  }
  return widgets;
}

const App = props => {
  const {
    chromeApi,
    browserApi
  } = props;
  /**
   * Resizes page to match window height so that CSS works properly with fixed nav
   */

  const resizeWindow = () => {
    const {
      innerHeight
    } = window;
    const {
      windowHeight,
      setWindowHeight
    } = props;

    if (windowHeight === innerHeight) {
      return;
    }

    setWindowHeight(innerHeight);
  };
  /**
   * Processes an intercepted network request from the service worker.
   * Replaces the old DevTools-based logRequest which used HAR objects.
   *
   * @param data Object with {url, requestBody, responseBody, timing}
   */


  const processRequest = data => {
    const {
      updateGqlRequests,
      updateNrqlRequests
    } = props;

    try {
      if (!data.url || !data.timing) return;
      const url = new URL(data.url);
      const requestPayloadText = data.requestBody;
      const responseText = data.responseBody;
      const timing = {
        startTime: data.timing.startTime,
        blockedTime: data.timing.blockedTime || 0,
        totalTime: data.timing.totalTime
      };

      if (url.pathname.match('graphql')) {
        const graphqlRequests = buildGraphqlRequests(requestPayloadText, responseText, timing);
        updateGqlRequests(graphqlRequests);

        // Also extract NRQL queries embedded in GraphQL requests
        const nrqlFromGraphql = extractNrqlFromGraphql(graphqlRequests);
        if (nrqlFromGraphql.length > 0) {
          updateNrqlRequests(nrqlFromGraphql);
        }

        // Extract widget map from dashboard entity queries
        var legacyDashboardWidgets = extractWidgetMapFromDashboard(graphqlRequests);
        if (legacyDashboardWidgets.length > 0) {
          props.setWidgetMap(legacyDashboardWidgets);
        }
      }

      if (url.pathname.match('nrql')) {
        const nrqlRequests = buildNrqlRequests(requestPayloadText, responseText, timing);
        updateNrqlRequests(nrqlRequests);
      }

    } catch (e) {
      // Silently ignore — expected for relative or malformed URLs
    }
  };

  const processRequestStart = data => {
    const { addPendingGqlRequest, addPendingNrqlRequest } = props;
    try {
      if (!data.url) return;
      const url = new URL(data.url);
      const requestPayloadText = data.requestBody;

      if (url.pathname.match('graphql')) {
        var pendingRequests;
        try {
          const requestPayload = JSON.parse(requestPayloadText);
          const requestPayloads = Array.isArray(requestPayload) ? requestPayload : [requestPayload];
          pendingRequests = requestPayloads.map(function (payloadRequest) {
            var queryText = payloadRequest.query || '';
            var nameMatch = queryText.match(/(query|mutation|subscription)\s+([\w]+)/);
            var name = nameMatch ? nameMatch[2] : queryText.slice(0, 24);
            var type = nameMatch ? nameMatch[1].toUpperCase() : 'QUERY';
            var pendingObj = {
              requestId: data.requestId,
              id: payloadRequest.id,
              query: queryText,
              variables: payloadRequest.variables,
              response: null,
              errors: null,
              type: type,
              name: name,
              status: 'pending',
              timing: { startTime: data.startTime, totalTime: 0, blockedTime: 0 }
            };
            if (data.componentHint) pendingObj.componentHint = data.componentHint;
            if (data.stackSummary) pendingObj.stackSummary = data.stackSummary;
            return pendingObj;
          });
        } catch (e) {
          pendingRequests = [{
            requestId: data.requestId,
            id: undefined,
            query: '',
            variables: null,
            response: null,
            errors: null,
            type: 'QUERY',
            name: 'Pending Request',
            status: 'pending',
            timing: { startTime: data.startTime, totalTime: 0, blockedTime: 0 }
          }];
        }
        addPendingGqlRequest(pendingRequests);
      }

      if (url.pathname.match('nrql')) {
        var nrqlQuery = '';
        var nrqlName = 'Pending NRQL';
        var nrqlVars = {};
        var nrqlType = 'RAW';
        try {
          var nrqlPayload = JSON.parse(requestPayloadText);
          var nrqlPayloads = Array.isArray(nrqlPayload) ? nrqlPayload : [nrqlPayload];
          var firstPayload = nrqlPayloads[0];
          nrqlQuery = firstPayload.nrql || firstPayload.query || '';
          nrqlVars = { accountId: firstPayload.account_id };
          nrqlType = firstPayload.raw ? 'RAW' : 'CHART';
          var fromMatch = nrqlQuery.match(/from\s+(\S+)/i);
          nrqlName = fromMatch ? fromMatch[1] : nrqlQuery.slice(0, 24) || 'Pending NRQL';
        } catch (e) {}
        var nrqlPendingObj = {
          requestId: data.requestId,
          id: -1,
          variables: nrqlVars,
          query: nrqlQuery,
          response: null,
          errors: null,
          type: nrqlType,
          name: nrqlName,
          status: 'pending',
          timing: { startTime: data.startTime, totalTime: 0, blockedTime: 0 }
        };
        if (data.componentHint) nrqlPendingObj.componentHint = data.componentHint;
        if (data.stackSummary) nrqlPendingObj.stackSummary = data.stackSummary;
        addPendingNrqlRequest([nrqlPendingObj]);
      }
    } catch (e) {}
  };

  const processRequestComplete = data => {
    const { completeRequest, updateGqlRequests, updateNrqlRequests } = props;
    try {
      if (!data.url || !data.timing) return;
      const url = new URL(data.url);
      const requestPayloadText = data.requestBody;
      const responseText = data.responseBody;
      const timing = {
        startTime: data.timing.startTime,
        blockedTime: data.timing.blockedTime || 0,
        totalTime: data.timing.totalTime
      };

      if (url.pathname.match('graphql')) {
        const graphqlRequests = buildGraphqlRequests(requestPayloadText, responseText, timing);
        // Update each pending request with full data
        graphqlRequests.forEach(function (req) {
          var isTimeout = req.errors && JSON.stringify(req.errors).match(/timeout/i);
          completeRequest({
            requestId: data.requestId,
            updates: {
              query: req.query,
              variables: req.variables,
              response: req.response,
              errors: req.errors,
              type: req.type,
              name: req.name,
              status: isTimeout ? 'timeout' : (req.errors ? 'error' : 'success'),
              timing: timing
            }
          });
        });

        // Extract NRQL from GraphQL
        const nrqlFromGraphql = extractNrqlFromGraphql(graphqlRequests);
        if (nrqlFromGraphql.length > 0) {
          updateNrqlRequests(nrqlFromGraphql);
        }

        // Extract widget map from dashboard entity queries
        var dashboardWidgets = extractWidgetMapFromDashboard(graphqlRequests);
        if (dashboardWidgets.length > 0) {
          props.setWidgetMap(dashboardWidgets);
        }
      }

      if (url.pathname.match('nrql')) {
        const nrqlRequests = buildNrqlRequests(requestPayloadText, responseText, timing);
        nrqlRequests.forEach(function (req) {
          completeRequest({
            requestId: data.requestId,
            updates: {
              query: req.query,
              variables: req.variables,
              response: req.response,
              errors: req.errors,
              type: req.type,
              name: req.name,
              status: req.errors ? 'error' : 'success',
              timing: timing
            }
          });
        });
      }
    } catch (e) {}
  };

  useEffect(() => {
    resizeWindow();

    // Listen for messages from the service worker via port
    const onPortMessage = message => {
      if (message.action === 'NEW_REQUEST_START') {
        processRequestStart(message);
      }

      if (message.action === 'NEW_REQUEST_COMPLETE') {
        processRequestComplete(message);
      }

      if (message.action === 'NEW_REQUEST') {
        processRequest(message);
      }

      if (message.action === 'BUFFERED_REQUESTS') {
        message.requests.forEach(req => processRequest(req));
      }

      if (message.action === 'DEBUG_INFO_RESET') {
        props.resetDebugInfo();
      }

      if (message.action === 'PLATFORM_INFO' && message.data) {
        props.setDebugPlatformInfo(message.data);
      }

      if (message.action === 'NERDPACK_METADATA' && Array.isArray(message.data)) {
        props.setDebugNerdpacks(message.data);
      }

      if (message.action === 'NERDLET_CHANGED' && message.data) {
        props.setDebugCurrentNerdlet(message.data);
      }
    };

    chromeApi.port.onMessage.addListener(onPortMessage);
    browserApi.addEventListener('resize', resizeWindow);

    // Request cached debug info from the background script
    chromeApi.port.postMessage({ action: 'GET_DEBUG_INFO' });

    return () => {
      chromeApi.port.onMessage.removeListener(onPortMessage);
      browserApi.removeEventListener('resize', resizeWindow);
    };
  }, []);

  const {
    currentPage,
    currentQueryIdx,
    logFilter,
    preserveLog,
    windowHeight,
    gqlRequests,
    nrqlRequests,
    showVerbose,
    setCurrentPage,
    clearLog,
    setCurrentQueryIdx,
    setPreserveLog,
    setLogFilter,
    setShowVerbose,
    showTiming,
    setShowTiming,
    selectedIndices,
    showOnlyErrors,
    setShowOnlyErrors,
    showOnlyTimeouts,
    setShowOnlyTimeouts,
    toggleSelectedIndex,
    selectAllVisible,
    clearSelectedIndices,
    debugPlatformInfo,
    debugNerdpacks,
    debugCurrentNerdletId,
    debugEntityGuid,
    widgetMap
  } = props;
  const currentLogData = currentPage === PageName.GRAPHQL_REQUESTS ? gqlRequests
    : currentPage === PageName.NRQL_REQUESTS ? nrqlRequests
    : [];

  // Compute visible (filtered + sorted) requests once, shared by Navigation and RequestsPage
  var visibleLogData = currentLogData;
  if (logFilter.length) {
    var filterLower = logFilter.toLowerCase();
    visibleLogData = visibleLogData.filter(function (request) {
      return JSON.stringify(request).toLowerCase().includes(filterLower);
    });
  }
  if (showOnlyErrors) {
    visibleLogData = visibleLogData.filter(function (request) { return !!request.errors; });
  }
  if (showOnlyTimeouts) {
    visibleLogData = visibleLogData.filter(function (request) { return request.errors && JSON.stringify(request.errors).match(/timeout/i); });
  }
  function statusPriority(req) {
    if (req.status === 'pending') return 0;
    if (req.status === 'error' || req.status === 'timeout') return 1;
    if (req.errors) return 1;
    return 2;
  }
  visibleLogData = visibleLogData.sort(function (a, b) {
    var pa = statusPriority(a);
    var pb = statusPriority(b);
    if (pa !== pb) return pa - pb;
    var aStart = a.timing ? a.timing.startTime : 0;
    var bStart = b.timing ? b.timing.startTime : 0;
    return bStart - aStart;
  });

  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Navigation, {
    currentPage: currentPage,
    setCurrentPage: setCurrentPage,
    clearLog: clearLog,
    preserveLog: preserveLog,
    handlePreserveLog: setPreserveLog,
    showVerbose: showVerbose,
    setShowVerbose: setShowVerbose,
    showTiming: showTiming,
    setShowTiming: setShowTiming,
    showOnlyErrors: showOnlyErrors,
    setShowOnlyErrors: setShowOnlyErrors,
    showOnlyTimeouts: showOnlyTimeouts,
    setShowOnlyTimeouts: setShowOnlyTimeouts,
    logData: currentLogData,
    visibleLogData: visibleLogData,
    allRequests: { gqlRequests: gqlRequests, nrqlRequests: nrqlRequests },
    selectedIndices: selectedIndices,
    selectedCount: selectedIndices.length
  }), currentPage === PageName.GRAPHQL_REQUESTS && /*#__PURE__*/React.createElement(RequestsPage, {
    windowHeight: windowHeight,
    logData: gqlRequests,
    setCurrentQueryIdx: setCurrentQueryIdx,
    currentQueryIdx: currentQueryIdx,
    logFilter: logFilter,
    updateLogFilter: setLogFilter,
    showVerbose: showVerbose,
    showTiming: showTiming,
    showOnlyErrors: showOnlyErrors,
    setShowOnlyErrors: setShowOnlyErrors,
    showOnlyTimeouts: showOnlyTimeouts,
    setShowOnlyTimeouts: setShowOnlyTimeouts,
    selectedIndices: selectedIndices,
    toggleSelectedIndex: toggleSelectedIndex,
    selectAllVisible: selectAllVisible,
    clearSelectedIndices: clearSelectedIndices
  }), currentPage === PageName.NRQL_REQUESTS && /*#__PURE__*/React.createElement(RequestsPage, {
    windowHeight: windowHeight,
    logData: nrqlRequests,
    setCurrentQueryIdx: setCurrentQueryIdx,
    currentQueryIdx: currentQueryIdx,
    logFilter: logFilter,
    updateLogFilter: setLogFilter,
    showVerbose: showVerbose,
    showTiming: showTiming,
    showOnlyErrors: showOnlyErrors,
    setShowOnlyErrors: setShowOnlyErrors,
    showOnlyTimeouts: showOnlyTimeouts,
    setShowOnlyTimeouts: setShowOnlyTimeouts,
    selectedIndices: selectedIndices,
    toggleSelectedIndex: toggleSelectedIndex,
    selectAllVisible: selectAllVisible,
    clearSelectedIndices: clearSelectedIndices,
    widgetMap: widgetMap,
    onLocateWidget: function (widget) {
      chromeApi.port.postMessage({
        action: 'HIGHLIGHT_WIDGET',
        widgetTitle: widget.title,
        widgetId: widget.widgetId,
        pageName: widget.pageName
      });
    }
  }), currentPage === PageName.DEBUG_INFO && /*#__PURE__*/React.createElement(DebugInfoPage, {
    debugPlatformInfo: debugPlatformInfo,
    debugNerdpacks: debugNerdpacks,
    debugCurrentNerdletId: debugCurrentNerdletId,
    debugEntityGuid: debugEntityGuid
  }));
};

export default connect(mapStateToProps, mapDispatchToProps)(App);
