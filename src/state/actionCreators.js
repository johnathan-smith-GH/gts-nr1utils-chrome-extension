/* eslint-disable no-param-reassign */
import matchWidgetByNrql, { buildWidgetNrqlIndex, matchAllWidgetsByNrql } from '../utils/matchWidgetByNrql.js';

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

function computeOccurrenceIndex(matched, widgetMap) {
  if (!matched || !widgetMap || !widgetMap.length) return 0;
  var title = (matched.title || '').toLowerCase();
  var page = (matched.pageName || '').toLowerCase();
  var siblings = [];
  for (var i = 0; i < widgetMap.length; i++) {
    var w = widgetMap[i];
    if ((w.title || '').toLowerCase() === title && (w.pageName || '').toLowerCase() === page) {
      siblings.push(w);
    }
  }
  if (siblings.length <= 1) return 0;
  siblings.sort(function (a, b) {
    var aRow = (a.layout && a.layout.row) || 0;
    var bRow = (b.layout && b.layout.row) || 0;
    if (aRow !== bRow) return aRow - bRow;
    var aCol = (a.layout && a.layout.column) || 0;
    var bCol = (b.layout && b.layout.column) || 0;
    return aCol - bCol;
  });
  for (var j = 0; j < siblings.length; j++) {
    if (siblings[j].widgetId === matched.widgetId) return j;
  }
  return 0;
}

// Build a set of already-claimed "title|page|occurrenceIndex" slots from matched requests.
function getClaimedSlots(requests) {
  var slots = {};
  for (var i = 0; i < requests.length; i++) {
    var mw = requests[i]._matchedWidget;
    if (mw && mw.title != null && mw.pageName != null && mw.occurrenceIndex != null) {
      var key = (mw.title || '').toLowerCase() + '|' + (mw.pageName || '').toLowerCase() + '|' + mw.occurrenceIndex;
      slots[key] = true;
    }
  }
  return slots;
}

// Match a request to a widget, spreading duplicate-query siblings across occurrence slots.
// claimedSlots is an object updated in-place so callers in the same batch don't double-assign.
function computeMatchWithSlot(query, widgetMap, index, claimedSlots) {
  var candidates = matchAllWidgetsByNrql(query, widgetMap, index);
  if (!candidates || !candidates.length) return null;

  // Sort candidates by layout position (top-left first) so slot 0 = topmost widget
  candidates.sort(function (a, b) {
    var aRow = (a.layout && a.layout.row) || 0;
    var bRow = (b.layout && b.layout.row) || 0;
    if (aRow !== bRow) return aRow - bRow;
    var aCol = (a.layout && a.layout.column) || 0;
    var bCol = (b.layout && b.layout.column) || 0;
    return aCol - bCol;
  });

  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    var occIdx = computeOccurrenceIndex(c, widgetMap);
    var slotKey = (c.title || '').toLowerCase() + '|' + (c.pageName || '').toLowerCase() + '|' + occIdx;
    if (!claimedSlots[slotKey]) {
      claimedSlots[slotKey] = true;
      return { title: c.title, widgetId: c.widgetId, pageName: c.pageName, occurrenceIndex: occIdx };
    }
  }

  // All sibling slots already claimed (e.g. same widget fires multiple requests) — reuse first
  var first = candidates[0];
  return { title: first.title, widgetId: first.widgetId, pageName: first.pageName, occurrenceIndex: computeOccurrenceIndex(first, widgetMap) };
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

const setCapturePaused = (state, action) => {
  state.capturePaused = action.payload;
  try { localStorage.setItem('capturePaused', `${action.payload}`); } catch (e) {}
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
    var claimedSlots = getClaimedSlots(state.nrqlRequests);
    newReqs.forEach(function (req) {
      if (!req._matchedWidget && req.query) {
        var mw = computeMatchWithSlot(req.query, wm, wmIdx, claimedSlots);
        if (mw) req._matchedWidget = mw;
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
    var claimedSlots = getClaimedSlots(state.nrqlRequests);
    newReqs.forEach(function (req) {
      if (!req._matchedWidget && req.query) {
        var mw = computeMatchWithSlot(req.query, wm, wmIdx, claimedSlots);
        if (mw) req._matchedWidget = mw;
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
      // Token-based linking: async poll responses (completed=true) inherit _matchedWidget from
      // the corresponding initial request (same token, completed=false). This corrects the
      // wrong slot assignment made at REQUEST_START time when all widget slots were already claimed.
      var pollToken = updates.response && updates.response[0] && updates.response[0].progress &&
                      updates.response[0].progress.completed === true &&
                      updates.response[0].progress.token;
      if (pollToken) {
        for (var k = 0; k < state.nrqlRequests.length; k++) {
          var r = state.nrqlRequests[k];
          if (r.requestId !== requestId &&
              r.response && r.response[0] && r.response[0].progress &&
              r.response[0].progress.token === pollToken &&
              r.response[0].progress.completed === false &&
              r._matchedWidget) {
            merged._matchedWidget = r._matchedWidget;
            break;
          }
        }
      }
      if (!merged._matchedWidget && merged.query && state.widgetMap && state.widgetMap.length) {
        var completeSlots = getClaimedSlots(state.nrqlRequests);
        var mwComplete = computeMatchWithSlot(merged.query, state.widgetMap, state._widgetNrqlIndex || null, completeSlots);
        if (mwComplete) merged._matchedWidget = mwComplete;
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
  // Pre-claim slots from requests already matched (e.g. on a second setWidgetMap call)
  var eagerSlots = getClaimedSlots(state.nrqlRequests.filter(function (r) { return !!r._matchedWidget; }));
  state.nrqlRequests.forEach(function (req) {
    if (!req._matchedWidget && req.query) {
      var mwEager = computeMatchWithSlot(req.query, fullMap, idx, eagerSlots);
      if (mwEager) {
        req._matchedWidget = mwEager;
        req._searchableText = buildSearchableText(req);
      }
    }
  });

  return state;
};

export { setCurrentPage, setCurrentQueryIdx, setPreserveLog, setCapturePaused, setWindowHeight, setLogFilter, updateGqlRequests, clearLog, clearAllRequests, updateNrqlRequests, setShowOnlyErrors, setShowOnlyTimeouts, setDebugPlatformInfo, setDebugNerdpacks, setDebugCurrentNerdlet, resetDebugInfo, toggleSelectedIndex, selectAllVisible, clearSelectedIndices, addPendingGqlRequest, addPendingNrqlRequest, completeRequest, setWidgetMap };