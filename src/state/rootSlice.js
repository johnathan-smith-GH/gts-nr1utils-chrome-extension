import { createSlice } from '../../snowpack/pkg/@reduxjs/toolkit.js';
import { PageName } from '../types.js';
import { setCurrentPage, setCurrentQueryIdx, setPreserveLog, setWindowHeight, setLogFilter, updateGqlRequests, clearLog, clearAllRequests, updateNrqlRequests, setShowOnlyErrors, setShowOnlyTimeouts, setDebugPlatformInfo, setDebugNerdpacks, setDebugCurrentNerdlet, resetDebugInfo, toggleSelectedIndex, selectAllVisible, clearSelectedIndices, addPendingGqlRequest, addPendingNrqlRequest, completeRequest, setWidgetMap } from './actionCreators.js';

function safeParseBool(key, defaultValue) {
  try {
    var raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

const initialState = {
  currentPage: PageName.GRAPHQL_REQUESTS,
  currentQueryIdx: undefined,
  preserveLog: safeParseBool('preserveLog', false),
  windowHeight: undefined,
  logFilter: '',
  gqlRequests: [],
  nrqlRequests: [],
  showOnlyErrors: false,
  showOnlyTimeouts: false,
  debugPlatformInfo: null,
  debugNerdpacks: [],
  debugCurrentNerdletId: null,
  debugEntityGuid: null,
  selectedRequestIds: [],
  widgetMap: [],
  _widgetNrqlIndex: null
};
const rootSlice = createSlice({
  name: 'root',
  initialState,
  reducers: {
    setCurrentPage,
    setCurrentQueryIdx,
    setPreserveLog,
    setWindowHeight,
    setLogFilter,
    updateGqlRequests,
    clearLog,
    clearAllRequests,
    updateNrqlRequests,
    setShowOnlyErrors,
    setShowOnlyTimeouts,
    setDebugPlatformInfo,
    setDebugNerdpacks,
    setDebugCurrentNerdlet,
    resetDebugInfo,
    toggleSelectedIndex,
    selectAllVisible,
    clearSelectedIndices,
    addPendingGqlRequest,
    addPendingNrqlRequest,
    completeRequest,
    setWidgetMap
  }
});
export default rootSlice;