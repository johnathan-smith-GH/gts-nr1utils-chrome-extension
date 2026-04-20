import { LogRequestType } from '../../types.js';

var TRACE_GROUPS_VIZS = [
  { name: 'Trace count', vizTitle: 'Trace count' },
  { name: 'Trace duration (ms)', vizTitle: 'Trace duration (ms)' },
  { name: 'Trace groups', vizTitle: 'Trace groups' }
];

var ERRORS_VIZS = [
  { name: 'Trace errors', vizTitle: 'Error rate' }
];

function getEndpointType(pathname) {
  if (pathname.includes('traceGroups')) return 'traceGroups';
  if (pathname.includes('errors')) return 'errors';
  return null;
}

function countFilters(filter) {
  if (!filter) return 0;
  var count = 0;
  if (filter.indexQuery && filter.indexQuery.conditionSets && filter.indexQuery.conditionSets.length) count += filter.indexQuery.conditionSets.length;
  if (filter.spanQuery && filter.spanQuery.conditionSets && filter.spanQuery.conditionSets.length) count += filter.spanQuery.conditionSets.length;
  return count;
}

function buildQuery(endpointType, body) {
  const durationMs = body.durationMs || body.duration || 0;
  const durationMin = durationMs ? `${Math.round(durationMs / 60000)}min` : 'unknown';
  let query;

  if (endpointType === 'traceGroups') {
    const limit = body.limit || '?';
    const sort = body.sortBy || body.sort || 'unknown';
    query = `${limit} trace groups over ${durationMin}, sorted by ${sort}`;
  } else {
    query = `Trace errors over ${durationMin}`;
  }

  const filterCount = countFilters(body.filter);
  if (filterCount > 0) query += `, filtered by ${filterCount} conditions`;

  return query;
}

export default function buildDtRequests(requestPayloadText, responseText, timing, pathname) {
  let body = {};
  let parsedResponse = null;

  try { body = JSON.parse(requestPayloadText); } catch {}
  try { parsedResponse = JSON.parse(responseText); } catch {}

  var endpointType = getEndpointType(pathname);
  var vizList = endpointType === 'traceGroups' ? TRACE_GROUPS_VIZS
    : endpointType === 'errors' ? ERRORS_VIZS
    : [{ name: pathname.split('/').pop() || 'trace', vizTitle: null }];
  var queryStr = buildQuery(endpointType, body);
  var hasError = parsedResponse && parsedResponse.error;

  // For large responses (traceGroups can be >1MB), only attach full response
  // to the last entry to avoid duplicating large objects in Redux state
  var lastIdx = vizList.length - 1;
  return vizList.map(function (viz, idx) {
    return {
      id: -1,
      variables: {},
      query: queryStr,
      response: idx === lastIdx ? parsedResponse : { _summary: 'See "' + vizList[lastIdx].name + '" entry for full response' },
      errors: hasError ? [parsedResponse.error] : null,
      status: hasError ? 'error' : 'success',
      type: LogRequestType.TRACE,
      name: viz.name,
      timing: timing,
      _dtVisualizationTitle: viz.vizTitle,
    };
  });
}
