import React, { useEffect, useRef } from '../snowpack/pkg/react.js';
import { connect } from '../snowpack/pkg/react-redux.js';
import './App.css.proxy.js';
import Navigation from './components/Navigation.js';
import rootSlice from './state/rootSlice.js';
import { PageName } from './types.js';
import RequestsPage from './components/RequestsPage.js';
import buildGraphqlRequests from './utils/graphql/buildGraphqlRequests.js';
import buildNrqlRequests from './utils/nrql/buildNrqlRequests.js';
import buildNrqlFromSignals from './utils/nrql/buildNrqlFromSignals.js';
import extractNrqlFromGraphql from './utils/nrql/extractNrqlFromGraphql.js';
import buildDtRequests from './utils/dt/buildDtRequests.js';
import DebugInfoPage from './components/DebugInfoPage.js';
import statusPriority from './utils/statusPriority.js';
const {
  actions
} = rootSlice;

var SIGNAL_EVAL_HOST = 'bork-sniffer';
var _legacyRidCounter = 0;

function parseRequestUrl(urlString, origin) {
  try {
    return new URL(urlString);
  } catch (_) {
    return new URL(urlString, origin || 'https://one.newrelic.com');
  }
}

const mapStateToProps = state => ({
  currentPage: state.currentPage,
  currentQueryIdx: state.currentQueryIdx,
  preserveLog: state.preserveLog,
  capturePaused: state.capturePaused,
  windowHeight: state.windowHeight,
  logFilter: state.logFilter,
  gqlRequests: state.gqlRequests,
  nrqlRequests: state.nrqlRequests,
  selectedRequestIds: state.selectedRequestIds,
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
  setCapturePaused: value => actions.setCapturePaused(value),
  setWindowHeight: windowHeight => actions.setWindowHeight(windowHeight),
  setLogFilter: event => actions.setLogFilter(event.target.value),
  updateGqlRequests: reqs => actions.updateGqlRequests(reqs),
  clearLog: () => actions.clearLog(),
  clearAllRequests: (opts) => actions.clearAllRequests(opts),
  updateNrqlRequests: reqs => actions.updateNrqlRequests(reqs),
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
    if (!resp || !resp.data || !resp.data.actor) continue;
    var entity = resp.data.actor.entity;
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
        var isStaticMermaid = viz === 'viz.markdown' && typeof raw.text === 'string' && raw.text.indexOf('mermaid') !== -1;
        var nrqlQueries = [];
        if (raw.nrqlQueries && Array.isArray(raw.nrqlQueries)) {
          for (var qi = 0; qi < raw.nrqlQueries.length; qi++) {
            if (raw.nrqlQueries[qi].query) nrqlQueries.push(raw.nrqlQueries[qi].query);
          }
        }
        if (nrqlQueries.length > 0 || w.title || isStaticMermaid) {
          var entry = {
            widgetId: w.id,
            title: w.title || '',
            pageName: pageName,
            nrqlQueries: nrqlQueries,
            layout: w.layout || null,
            inaccessible: isInaccessible,
            dashboardAccountId: dashboardAccountId,
            dashboardOwnerEmail: dashboardOwnerEmail
          };
          if (isStaticMermaid) {
            entry._staticMermaid = true;
            entry._mermaidContent = raw.text;
          }
          widgets.push(entry);
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

  // Ref to avoid stale closure when reading preserveLog inside mount-only effect
  const preserveLogRef = useRef(props.preserveLog);
  preserveLogRef.current = props.preserveLog;
  const capturePausedRef = useRef(props.capturePaused);
  capturePausedRef.current = props.capturePaused;

  const processRequestRef = useRef(null);
  const processRequestStartRef = useRef(null);
  const processRequestCompleteRef = useRef(null);
  const propsRef = useRef(props);
  propsRef.current = props;

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

    if (!data.url || !data.timing) return;
    const url = parseRequestUrl(data.url, data.origin);
    if (!url) return;
    const requestPayloadText = data.requestBody;
    const responseText = data.responseBody;
    const timing = {
      startTime: Number(data.timing.startTime) || 0,
      blockedTime: Number(data.timing.blockedTime) || 0,
      totalTime: Number(data.timing.totalTime) || 0
    };

    try {
      if (url.pathname.includes('/graphql')) {
        const graphqlRequests = buildGraphqlRequests(requestPayloadText, responseText, timing);
        graphqlRequests.forEach(function (r) { if (!r.requestId) r.requestId = 'legacy-' + (++_legacyRidCounter); });
        updateGqlRequests(graphqlRequests);

        const nrqlFromGraphql = extractNrqlFromGraphql(graphqlRequests);
        if (nrqlFromGraphql.length > 0) {
          nrqlFromGraphql.forEach(function (r) { if (!r.requestId) r.requestId = 'legacy-' + (++_legacyRidCounter); });
          updateNrqlRequests(nrqlFromGraphql);
        }

        var legacyDashboardWidgets = extractWidgetMapFromDashboard(graphqlRequests);
        if (legacyDashboardWidgets.length > 0) {
          props.setWidgetMap(legacyDashboardWidgets);
        }
      }

      if (url.pathname.includes('/nrql')) {
        const nrqlRequests = buildNrqlRequests(requestPayloadText, responseText, timing);
        nrqlRequests.forEach(function (r) { if (!r.requestId) r.requestId = 'legacy-' + (++_legacyRidCounter); });
        updateNrqlRequests(nrqlRequests);
      }

      if (url.hostname && url.hostname.indexOf(SIGNAL_EVAL_HOST) !== -1) {
        const signalNrqlRequests = buildNrqlFromSignals(requestPayloadText, responseText, timing);
        signalNrqlRequests.forEach(function (r) { if (!r.requestId) r.requestId = 'legacy-' + (++_legacyRidCounter); });
        if (signalNrqlRequests.length > 0) updateNrqlRequests(signalNrqlRequests);
      }

      if (url.hostname && url.hostname.includes('distributed-tracing')) {
        const dtRequests = buildDtRequests(requestPayloadText, responseText, timing, url.pathname);
        dtRequests.forEach(function (r) { if (!r.requestId) r.requestId = 'legacy-' + (++_legacyRidCounter); });
        if (dtRequests.length > 0) updateNrqlRequests(dtRequests);
      }
    } catch (e) {
      console.warn('[NR1 Utils]', 'Error processing request:', e);
    }
  };

  const processRequestStart = data => {
    const { addPendingGqlRequest, addPendingNrqlRequest } = props;
    if (!data.url) return;
    const url = parseRequestUrl(data.url, data.origin);
    if (!url) return;
    try {
      const requestPayloadText = data.requestBody;

      if (url.pathname.includes('/graphql')) {
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

      if (url.pathname.includes('/nrql')) {
        try {
          var nrqlPayload = JSON.parse(requestPayloadText);
          var nrqlPayloads = Array.isArray(nrqlPayload) ? nrqlPayload : [nrqlPayload];
          var pendingNrqlList = nrqlPayloads.map(function (payload, idx) {
            var q = payload.nrql || payload.query || '';
            var fromMatch = q.match(/from\s+(\S+)/i);
            var obj = {
              requestId: nrqlPayloads.length > 1 ? data.requestId + ':nrql:' + idx : data.requestId,
              id: -1,
              variables: { accountId: payload.account_id },
              query: q,
              response: null,
              errors: null,
              type: payload.raw ? 'RAW' : 'CHART',
              name: fromMatch ? fromMatch[1] : q.slice(0, 24) || 'Pending NRQL',
              status: 'pending',
              timing: { startTime: data.startTime, totalTime: 0, blockedTime: 0 }
            };
            if (data.componentHint) obj.componentHint = data.componentHint;
            if (data.stackSummary) obj.stackSummary = data.stackSummary;
            return obj;
          });
          addPendingNrqlRequest(pendingNrqlList);
        } catch (e) {}
      }

      // DT requests are handled in processRequestComplete — no pending entry needed
      // since the traceGroups response splits into multiple entries on completion
    } catch (e) {
      console.warn('[NR1 Utils]', 'Error processing request start:', e);
    }
  };

  const processRequestComplete = data => {
    const { completeRequest, updateGqlRequests, updateNrqlRequests } = props;
    if (!data.url || !data.timing) return;
    const url = parseRequestUrl(data.url, data.origin);
    if (!url) return;
    try {
      const requestPayloadText = data.requestBody;
      const responseText = data.responseBody;
      const timing = {
        startTime: Number(data.timing.startTime) || 0,
        blockedTime: Number(data.timing.blockedTime) || 0,
        totalTime: Number(data.timing.totalTime) || 0
      };

      if (url.pathname.includes('/graphql')) {
        const graphqlRequests = buildGraphqlRequests(requestPayloadText, responseText, timing);
        // Update each pending request with full data
        graphqlRequests.forEach(function (req) {
          var isTimeout = req.errors && JSON.stringify(req.errors).match(/timeout/i);
          completeRequest({
            requestId: data.requestId,
            id: req.id,
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

      if (url.pathname.includes('/nrql')) {
        const nrqlRequests = buildNrqlRequests(requestPayloadText, responseText, timing);
        nrqlRequests.forEach(function (req, idx) {
          var effectiveId = nrqlRequests.length > 1 ? data.requestId + ':nrql:' + idx : data.requestId;
          completeRequest({
            requestId: effectiveId,
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

      if (url.hostname && url.hostname.indexOf(SIGNAL_EVAL_HOST) !== -1) {
        const signalNrqlRequests = buildNrqlFromSignals(requestPayloadText, responseText, timing);
        if (signalNrqlRequests.length > 0) updateNrqlRequests(signalNrqlRequests);
      }

      if (url.hostname && url.hostname.includes('distributed-tracing')) {
        const dtRequests = buildDtRequests(requestPayloadText, responseText, timing, url.pathname);
        if (dtRequests.length > 0) updateNrqlRequests(dtRequests);
      }
    } catch (e) {
      console.warn('[NR1 Utils]', 'Error processing request complete:', e);
    }
  };

  processRequestRef.current = processRequest;
  processRequestStartRef.current = processRequestStart;
  processRequestCompleteRef.current = processRequestComplete;

  useEffect(() => {
    resizeWindow();

    // Listen for messages from the service worker via port
    const onPortMessage = message => {
      // Drop new request messages while capture is paused (but allow completions
      // for in-flight requests so pending entries resolve normally)
      if (capturePausedRef.current && (
        message.action === 'NEW_REQUEST_START' ||
        message.action === 'NEW_REQUEST' ||
        message.action === 'BUFFERED_REQUESTS'
      )) return;

      if (message.action === 'NEW_REQUEST_START') {
        processRequestStartRef.current(message);
      }

      if (message.action === 'NEW_REQUEST_COMPLETE') {
        processRequestCompleteRef.current(message);
      }

      if (message.action === 'NEW_REQUEST') {
        processRequestRef.current(message);
      }

      if (message.action === 'BUFFERED_REQUESTS') {
        message.requests.forEach(req => processRequestRef.current(req));
      }

      if (message.action === 'PAGE_NAVIGATED') {
        if (!preserveLogRef.current && message.fullNavigation) {
          propsRef.current.clearAllRequests({ clearWidgets: true });
        }
      }

      if (message.action === 'DEBUG_INFO_RESET') {
        propsRef.current.resetDebugInfo();
      }

      if (message.action === 'PLATFORM_INFO' && message.data) {
        propsRef.current.setDebugPlatformInfo(message.data);
      }

      if (message.action === 'NERDPACK_METADATA' && Array.isArray(message.data)) {
        propsRef.current.setDebugNerdpacks(message.data);
      }

      if (message.action === 'NERDLET_CHANGED' && message.data) {
        propsRef.current.setDebugCurrentNerdlet(message.data);
      }

      if (message.action === 'RESTORED_WIDGET_MAP') {
        if (Array.isArray(message.data) && message.data.length > 0) {
          propsRef.current.setWidgetMap(message.data);
        }
        return;
      }
    };

    chromeApi.port.onMessage.addListener(onPortMessage);
    browserApi.addEventListener('resize', resizeWindow);

    // Signal background that listeners are ready — triggers buffered data send
    chromeApi.port.postMessage({ action: 'PANEL_READY' });
    // Request cached debug info from the background script
    chromeApi.port.postMessage({ action: 'GET_DEBUG_INFO' });

    return () => {
      chromeApi.port.onMessage.removeListener(onPortMessage);
      browserApi.removeEventListener('resize', resizeWindow);
    };
  }, []);

  useEffect(function () {
    props.chromeApi.port.postMessage({ action: 'SET_PRESERVE_LOG', value: props.preserveLog });
  }, [props.preserveLog]);

  const widgetMapInitRef = useRef(false);
  useEffect(function () {
    // Skip the initial mount — don't overwrite background's stored map before PANEL_READY restores it
    if (!widgetMapInitRef.current) {
      widgetMapInitRef.current = true;
      return;
    }
    var map = props.widgetMap || [];
    props.chromeApi.port.postMessage({ action: 'WIDGET_MAP_UPDATE', data: map });
  }, [props.widgetMap]);

  const {
    currentPage,
    currentQueryIdx,
    logFilter,
    preserveLog,
    capturePaused,
    setCapturePaused,
    windowHeight,
    gqlRequests,
    nrqlRequests,
    setCurrentPage,
    clearLog,
    setCurrentQueryIdx,
    setPreserveLog,
    setLogFilter,
    selectedRequestIds,
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
      return (request._searchableText || '').includes(filterLower);
    });
  }
  if (showOnlyErrors) {
    visibleLogData = visibleLogData.filter(function (request) { return !!request.errors; });
  }
  if (showOnlyTimeouts) {
    visibleLogData = visibleLogData.filter(function (request) { return !!request._isTimeout; });
  }
  visibleLogData = [...visibleLogData].sort(function (a, b) {
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
    showOnlyErrors: showOnlyErrors,
    setShowOnlyErrors: setShowOnlyErrors,
    showOnlyTimeouts: showOnlyTimeouts,
    setShowOnlyTimeouts: setShowOnlyTimeouts,
    logData: currentLogData,
    visibleLogData: visibleLogData,
    allRequests: { gqlRequests: gqlRequests, nrqlRequests: nrqlRequests },
    selectedRequestIds: selectedRequestIds,
    selectedCount: selectedRequestIds.length,
    capturePaused: capturePaused,
    handleCapturePaused: setCapturePaused
  }), currentPage === PageName.GRAPHQL_REQUESTS && /*#__PURE__*/React.createElement(RequestsPage, {
    windowHeight: windowHeight,
    logData: gqlRequests,
    setCurrentQueryIdx: setCurrentQueryIdx,
    currentQueryIdx: currentQueryIdx,
    logFilter: logFilter,
    updateLogFilter: setLogFilter,
    showOnlyErrors: showOnlyErrors,
    setShowOnlyErrors: setShowOnlyErrors,
    showOnlyTimeouts: showOnlyTimeouts,
    setShowOnlyTimeouts: setShowOnlyTimeouts,
    selectedRequestIds: selectedRequestIds,
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
    showOnlyErrors: showOnlyErrors,
    setShowOnlyErrors: setShowOnlyErrors,
    showOnlyTimeouts: showOnlyTimeouts,
    setShowOnlyTimeouts: setShowOnlyTimeouts,
    selectedRequestIds: selectedRequestIds,
    toggleSelectedIndex: toggleSelectedIndex,
    selectAllVisible: selectAllVisible,
    clearSelectedIndices: clearSelectedIndices,
    widgetMap: widgetMap,
    onLocateWidget: function (widget) {
      chromeApi.port.postMessage({
        action: 'HIGHLIGHT_WIDGET',
        widgetTitle: widget.title,
        widgetId: widget.widgetId,
        pageName: widget.pageName,
        occurrenceIndex: widget.occurrenceIndex || 0
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
