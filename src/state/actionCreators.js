/* eslint-disable no-param-reassign */
import matchWidgetByNrql, { buildWidgetNrqlIndex } from '../utils/matchWidgetByNrql.js';

var MAX_REQUESTS = 2000;

function safeAssign(target, source) {
  if (!source || typeof source !== 'object') return target;
  var keys = Object.keys(source);
  for (var k = 0; k < keys.length; k++) {
    if (keys[k] === '__proto__' || keys[k] === 'constructor' || keys[k] === 'prototype') continue;
    target[keys[k]] = source[keys[k]];
  }
  return target;
}

function buildSearchableText(req) {
  var parts = [req.name || '', req.query || '', req.type || '', req.status || ''];
  if (req.errors) {
    try {
      var errStr = JSON.stringify(req.errors);
      parts.push(errStr);
      req._isTimeout = !!errStr.match(/timeout/i);
    } catch (e) {}
  } else {
    req._isTimeout = false;
  }
  if (req.variables) { try { parts.push(JSON.stringify(req.variables)); } catch (e) {} }
  if (req._matchedWidget) {
    parts.push(req._matchedWidget.title || '');
    parts.push(req._matchedWidget.pageName || '');
    parts.push(req._matchedWidget.widgetId || '');
  }
  return parts.join(' ').toLowerCase();
}
const setCurrentPage = (state, action) => {
  state.currentPage = action.payload;
  state.currentQueryIdx = undefined;
  state.selectedRequestIds = [];
  return state;
};

const setCurrentQueryIdx = (state, action) => {
  state.currentQueryIdx = action.payload;
  return state;
};

const setPreserveLog = (state, action) => {
  state.preserveLog = action.payload;
  try { localStorage.setItem('preserveLog', `${action.payload}`); } catch (e) {}
  return state;
};

const setWindowHeight = (state, action) => {
  state.windowHeight = action.payload;
  return state;
};

const setLogFilter = (state, action) => {
  state.logFilter = action.payload;
  state.currentQueryIdx = undefined;
  return state;
};

const updateGqlRequests = (state, action) => {
  var newReqs = action.payload;
  newReqs.forEach(function (req) { req._searchableText = buildSearchableText(req); });
  state.gqlRequests = state.gqlRequests.concat(newReqs);
  if (state.gqlRequests.length > MAX_REQUESTS) {
    state.gqlRequests = state.gqlRequests.slice(-MAX_REQUESTS);
  }
  return state;
};

const clearLog = state => {
  if (state.currentPage === 'GRAPHQL_REQUESTS') {
    state.gqlRequests = [];
  }

  if (state.currentPage === 'NRQL_REQUESTS') {
    state.nrqlRequests = [];
    state.widgetMap = [];
    state._widgetNrqlIndex = null;
  }

  state.currentQueryIdx = undefined;
  state.selectedRequestIds = [];
  return state;
};

const updateNrqlRequests = (state, action) => {
  var newReqs = action.payload;
  var wm = state.widgetMap;
  var wmIdx = state._widgetNrqlIndex || null;
  if (wm && wm.length) {
    newReqs.forEach(function (req) {
      if (!req._matchedWidget && req.query) {
        var matched = matchWidgetByNrql(req.query, wm, wmIdx);
        if (matched) {
          req._matchedWidget = { title: matched.title, widgetId: matched.widgetId, pageName: matched.pageName };
        }
      }
    });
  }
  newReqs.forEach(function (req) { req._searchableText = buildSearchableText(req); });
  state.nrqlRequests = state.nrqlRequests.concat(newReqs);
  if (state.nrqlRequests.length > MAX_REQUESTS) {
    state.nrqlRequests = state.nrqlRequests.slice(-MAX_REQUESTS);
  }
  return state;
};

const setDebugPlatformInfo = (state, action) => {
  state.debugPlatformInfo = action.payload;
  return state;
};

const setDebugNerdpacks = (state, action) => {
  state.debugNerdpacks = action.payload;
  return state;
};

const setDebugCurrentNerdlet = (state, action) => {
  if (!action.payload) return state;
  state.debugCurrentNerdletId = action.payload.nerdletId;
  state.debugEntityGuid = action.payload.entityGuid || null;
  return state;
};

const clearAllRequests = (state, action) => {
  state.gqlRequests = [];
  state.nrqlRequests = [];
  // Preserve widget map across SPA navigations (tab switches) — the DashboardEntity
  // query fires once and is not re-sent on tab switch. Only clear on explicit request.
  if (action && action.payload && action.payload.clearWidgets) {
    state.widgetMap = [];
    state._widgetNrqlIndex = null;
  }
  state.currentQueryIdx = undefined;
  state.selectedRequestIds = [];
  return state;
};

const setShowOnlyErrors = (state, action) => {
  state.showOnlyErrors = action.payload;
  return state;
};

const setShowOnlyTimeouts = (state, action) => {
  state.showOnlyTimeouts = action.payload;
  return state;
};

const resetDebugInfo = (state) => {
  state.debugPlatformInfo = null;
  state.debugNerdpacks = [];
  state.debugCurrentNerdletId = null;
  state.debugEntityGuid = null;
  return state;
};

const toggleSelectedIndex = (state, action) => {
  const id = action.payload;
  const pos = state.selectedRequestIds.indexOf(id);
  if (pos === -1) {
    state.selectedRequestIds = [...state.selectedRequestIds, id];
  } else {
    state.selectedRequestIds = state.selectedRequestIds.filter(i => i !== id);
  }
  return state;
};

const selectAllVisible = (state, action) => {
  state.selectedRequestIds = action.payload;
  return state;
};

const clearSelectedIndices = (state) => {
  state.selectedRequestIds = [];
  return state;
};

const addPendingGqlRequest = (state, action) => {
  var newReqs = action.payload;
  newReqs.forEach(function (req) { req._searchableText = buildSearchableText(req); });
  state.gqlRequests = state.gqlRequests.concat(newReqs);
  if (state.gqlRequests.length > MAX_REQUESTS) {
    state.gqlRequests = state.gqlRequests.slice(-MAX_REQUESTS);
  }
  return state;
};

const addPendingNrqlRequest = (state, action) => {
  var newReqs = action.payload;
  var wm = state.widgetMap;
  var wmIdx = state._widgetNrqlIndex || null;
  if (wm && wm.length) {
    newReqs.forEach(function (req) {
      if (!req._matchedWidget && req.query) {
        var matched = matchWidgetByNrql(req.query, wm, wmIdx);
        if (matched) {
          req._matchedWidget = { title: matched.title, widgetId: matched.widgetId, pageName: matched.pageName };
        }
      }
    });
  }
  newReqs.forEach(function (req) { req._searchableText = buildSearchableText(req); });
  state.nrqlRequests = state.nrqlRequests.concat(newReqs);
  if (state.nrqlRequests.length > MAX_REQUESTS) {
    state.nrqlRequests = state.nrqlRequests.slice(-MAX_REQUESTS);
  }
  return state;
};

const completeRequest = (state, action) => {
  const { requestId, id, updates } = action.payload;
  for (var i = 0; i < state.gqlRequests.length; i++) {
    if (state.gqlRequests[i].requestId === requestId) {
      if (id !== undefined && id !== -1 && state.gqlRequests[i].id !== id) continue;
      var gqlMerged = safeAssign(Object.assign({}, state.gqlRequests[i]), updates);
      gqlMerged._searchableText = buildSearchableText(gqlMerged);
      state.gqlRequests[i] = gqlMerged;
    }
  }
  var nrqlUpdated = false;
  for (var j = 0; j < state.nrqlRequests.length; j++) {
    if (state.nrqlRequests[j].requestId === requestId && !nrqlUpdated) {
      var merged = safeAssign(Object.assign({}, state.nrqlRequests[j]), updates);
      if (!merged._matchedWidget && merged.query && state.widgetMap && state.widgetMap.length) {
        var wMatch = matchWidgetByNrql(merged.query, state.widgetMap, state._widgetNrqlIndex || null);
        if (wMatch) {
          merged._matchedWidget = { title: wMatch.title, widgetId: wMatch.widgetId, pageName: wMatch.pageName };
        }
      }
      merged._searchableText = buildSearchableText(merged);
      state.nrqlRequests[j] = merged;
      nrqlUpdated = true;
    }
  }
  return state;
};


const setWidgetMap = (state, action) => {
  // Merge new widgets with existing, deduplicating by widgetId
  var existing = state.widgetMap || [];
  var existingIds = {};
  existing.forEach(function (w) { if (w.widgetId) existingIds[w.widgetId + '|' + (w.pageName || '')] = true; });
  var newWidgets = action.payload.filter(function (w) { return !w.widgetId || !existingIds[w.widgetId + '|' + (w.pageName || '')]; });
  state.widgetMap = existing.concat(newWidgets);

  // Build index for fast NRQL lookups
  state._widgetNrqlIndex = buildWidgetNrqlIndex(state.widgetMap);

  // Eagerly match existing NRQL requests to widgets
  var fullMap = state.widgetMap;
  var idx = state._widgetNrqlIndex;
  state.nrqlRequests.forEach(function (req) {
    if (!req._matchedWidget && req.query) {
      var matched = matchWidgetByNrql(req.query, fullMap, idx);
      if (matched) {
        req._matchedWidget = {
          title: matched.title,
          widgetId: matched.widgetId,
          pageName: matched.pageName
        };
        req._searchableText = buildSearchableText(req);
      }
    }
  });

  return state;
};

export { setCurrentPage, setCurrentQueryIdx, setPreserveLog, setWindowHeight, setLogFilter, updateGqlRequests, clearLog, clearAllRequests, updateNrqlRequests, setShowOnlyErrors, setShowOnlyTimeouts, setDebugPlatformInfo, setDebugNerdpacks, setDebugCurrentNerdlet, resetDebugInfo, toggleSelectedIndex, selectAllVisible, clearSelectedIndices, addPendingGqlRequest, addPendingNrqlRequest, completeRequest, setWidgetMap };