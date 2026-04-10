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
  state.nrqlRequests = state.nrqlRequests.concat(action.payload);
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
  state.nrqlRequests = state.nrqlRequests.concat(action.payload);
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
        state.nrqlRequests[j] = Object.assign({}, state.nrqlRequests[j], updates);
        break;
      }
    }
  }
  return state;
};

const setWidgetMap = (state, action) => {
  state.widgetMap = action.payload;
  return state;
};

export { setCurrentPage, setCurrentQueryIdx, setPreserveLog, setWindowHeight, setLogFilter, updateGqlRequests, clearLog, clearAllRequests, updateNrqlRequests, setUrlParameters, setShowVerbose, setModifiedUrlParameters, setShowTiming, setShowOnlyErrors, setShowOnlyTimeouts, setDebugPlatformInfo, setDebugNerdpacks, setDebugCurrentNerdlet, resetDebugInfo, toggleSelectedIndex, selectAllVisible, clearSelectedIndices, addPendingGqlRequest, addPendingNrqlRequest, completeRequest, setWidgetMap };