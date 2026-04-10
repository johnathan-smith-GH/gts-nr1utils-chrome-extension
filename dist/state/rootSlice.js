import { createSlice } from '../../snowpack/pkg/@reduxjs/toolkit.js';
import { PageName } from '../types.js';
import { setCurrentPage, setCurrentQueryIdx, setPreserveLog, setWindowHeight, setLogFilter, updateGqlRequests, clearLog, clearAllRequests, updateNrqlRequests, setUrlParameters, setShowVerbose, setModifiedUrlParameters, setShowTiming, setShowOnlyErrors, setShowOnlyTimeouts, setDebugPlatformInfo, setDebugNerdpacks, setDebugCurrentNerdlet, resetDebugInfo, toggleSelectedIndex, selectAllVisible, clearSelectedIndices, addPendingGqlRequest, addPendingNrqlRequest, completeRequest, setWidgetMap } from './actionCreators.js';
const showVerbose = localStorage.getItem('showVerbose');
const preserveLog = localStorage.getItem('preserveLog');
const showTiming = localStorage.getItem('showTiming');
const initialState = {
  currentPage: PageName.GRAPHQL_REQUESTS,
  currentQueryIdx: undefined,
  preserveLog: preserveLog ? JSON.parse(preserveLog) : false,
  windowHeight: undefined,
  logFilter: '',
  gqlRequests: [],
  nrqlRequests: [],
  showVerbose: showVerbose ? JSON.parse(showVerbose) : false,
  modifiedUrlParameters: '',
  showTiming: showTiming ? JSON.parse(showTiming) : true,
  showOnlyErrors: false,
  showOnlyTimeouts: false,
  debugPlatformInfo: null,
  debugNerdpacks: [],
  debugCurrentNerdletId: null,
  debugEntityGuid: null,
  selectedIndices: [],
  widgetMap: []
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
    setUrlParameters,
    setShowVerbose,
    setModifiedUrlParameters,
    setShowTiming,
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