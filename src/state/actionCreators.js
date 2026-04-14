/* eslint-disable no-param-reassign */
const setCurrentPage = (state, action) => {
  state.currentPage = action.payload;
  state.currentQueryIdx = undefined;
  state.selectedIndices = [];
  return state;
};

const setCurrentQueryIdx = (state, action) => {
  state.currentQueryIdx = action.payload;
  return state;
};

const setPreserveLog = (state, action) => {
  state.preserveLog = action.payload;
  localStorage.setItem('preserveLog', `${action.payload}`);
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
  state.gqlRequests = state.gqlRequests.concat(action.payload);
  return state;
};

const clearLog = state => {
  if (state.currentPage === 'GRAPHQL_REQUESTS') {
    state.gqlRequests = [];
  }

  if (state.currentPage === 'NRQL_REQUESTS') {
    state.nrqlRequests = [];
    state.widgetMap = [];
  }

  state.currentQueryIdx = undefined;
  state.selectedIndices = [];
  return state;
};

const updateNrqlRequests = (state, action) => {
  var newReqs = action.payload;
  var wm = state.widgetMap;
  if (wm && wm.length) {
    newReqs.forEach(function (req) {
      if (!req._matchedWidget && req.query) {
        var matched = matchNrqlToWidget(req.query, wm);
        if (matched) {
          req._matchedWidget = { title: matched.title, widgetId: matched.widgetId, pageName: matched.pageName };
        }
      }
    });
  }
  state.nrqlRequests = state.nrqlRequests.concat(newReqs);
  return state;
};

const setUrlParameters = (state, action) => {
  state.urlParameters = action.payload;

  if (!state.preserveLog) {
    state.gqlRequests = [];
    state.nrqlRequests = [];
  }

  return state;
};

const setShowVerbose = (state, action) => {
  state.showVerbose = action.payload;
  localStorage.setItem('showVerbose', `${action.payload}`);
  return state;
};

const setModifiedUrlParameters = (state, action) => {
  state.modifiedUrlParameters = action.payload;
  return state;
};

const setShowTiming = (state, action) => {
  state.showTiming = action.payload;
  localStorage.setItem('showTiming', `${action.payload}`);
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
  state.debugCurrentNerdletId = action.payload.nerdletId;
  state.debugEntityGuid = action.payload.entityGuid || null;
  return state;
};

const clearAllRequests = (state) => {
  state.gqlRequests = [];
  state.nrqlRequests = [];
  state.currentQueryIdx = undefined;
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
  const idx = action.payload;
  const pos = state.selectedIndices.indexOf(idx);
  if (pos === -1) {
    state.selectedIndices = [...state.selectedIndices, idx];
  } else {
    state.selectedIndices = state.selectedIndices.filter(i => i !== idx);
  }
  return state;
};

const selectAllVisible = (state, action) => {
  state.selectedIndices = action.payload;
  return state;
};

const clearSelectedIndices = (state) => {
  state.selectedIndices = [];
  return state;
};

const addPendingGqlRequest = (state, action) => {
  state.gqlRequests = state.gqlRequests.concat(action.payload);
  return state;
};

const addPendingNrqlRequest = (state, action) => {
  var newReqs = action.payload;
  var wm = state.widgetMap;
  if (wm && wm.length) {
    newReqs.forEach(function (req) {
      if (!req._matchedWidget && req.query) {
        var matched = matchNrqlToWidget(req.query, wm);
        if (matched) {
          req._matchedWidget = { title: matched.title, widgetId: matched.widgetId, pageName: matched.pageName };
        }
      }
    });
  }
  state.nrqlRequests = state.nrqlRequests.concat(newReqs);
  return state;
};

const completeRequest = (state, action) => {
  const { requestId, updates } = action.payload;
  var found = false;
  for (var i = 0; i < state.gqlRequests.length; i++) {
    if (state.gqlRequests[i].requestId === requestId) {
      state.gqlRequests[i] = Object.assign({}, state.gqlRequests[i], updates);
      found = true;
      break;
    }
  }
  if (!found) {
    for (var j = 0; j < state.nrqlRequests.length; j++) {
      if (state.nrqlRequests[j].requestId === requestId) {
        var merged = Object.assign({}, state.nrqlRequests[j], updates);
        // Ensure widget matching on completion
        if (!merged._matchedWidget && merged.query && state.widgetMap && state.widgetMap.length) {
          var wMatch = matchNrqlToWidget(merged.query, state.widgetMap);
          if (wMatch) {
            merged._matchedWidget = { title: wMatch.title, widgetId: wMatch.widgetId, pageName: wMatch.pageName };
          }
        }
        state.nrqlRequests[j] = merged;
        break;
      }
    }
  }
  return state;
};

function normalizeNrql(s) {
  return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function matchNrqlToWidget(query, widgetMap) {
  if (!query || !widgetMap || !widgetMap.length) return null;
  var qn = normalizeNrql(query);
  // Pass 1: exact
  for (var i = 0; i < widgetMap.length; i++) {
    var w = widgetMap[i];
    if (!w.nrqlQueries) continue;
    for (var j = 0; j < w.nrqlQueries.length; j++) {
      if (qn === normalizeNrql(w.nrqlQueries[j])) return w;
    }
  }
  // Pass 2: substring
  for (var i2 = 0; i2 < widgetMap.length; i2++) {
    var w2 = widgetMap[i2];
    if (!w2.nrqlQueries) continue;
    for (var j2 = 0; j2 < w2.nrqlQueries.length; j2++) {
      var wn = normalizeNrql(w2.nrqlQueries[j2]);
      if (qn.indexOf(wn) !== -1 || wn.indexOf(qn) !== -1) return w2;
    }
  }
  return null;
}

const setWidgetMap = (state, action) => {
  // Merge new widgets with existing, deduplicating by widgetId
  var existing = state.widgetMap || [];
  var existingIds = {};
  existing.forEach(function (w) { if (w.widgetId) existingIds[w.widgetId] = true; });
  var newWidgets = action.payload.filter(function (w) { return !w.widgetId || !existingIds[w.widgetId]; });
  state.widgetMap = existing.concat(newWidgets);

  // Eagerly match existing NRQL requests to widgets
  var fullMap = state.widgetMap;
  state.nrqlRequests.forEach(function (req) {
    if (!req._matchedWidget && req.query) {
      var matched = matchNrqlToWidget(req.query, fullMap);
      if (matched) {
        req._matchedWidget = {
          title: matched.title,
          widgetId: matched.widgetId,
          pageName: matched.pageName
        };
      }
    }
  });

  return state;
};

export { setCurrentPage, setCurrentQueryIdx, setPreserveLog, setWindowHeight, setLogFilter, updateGqlRequests, clearLog, clearAllRequests, updateNrqlRequests, setUrlParameters, setShowVerbose, setModifiedUrlParameters, setShowTiming, setShowOnlyErrors, setShowOnlyTimeouts, setDebugPlatformInfo, setDebugNerdpacks, setDebugCurrentNerdlet, resetDebugInfo, toggleSelectedIndex, selectAllVisible, clearSelectedIndices, addPendingGqlRequest, addPendingNrqlRequest, completeRequest, setWidgetMap };