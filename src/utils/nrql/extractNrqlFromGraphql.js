import { LogRequestType } from '../../types.js';
import parseNrqlListing from './parseNrqlListing.js';

/**
 * Check if a string looks like an NRQL query.
 */
function isNrqlString(value) {
  if (typeof value !== 'string') return false;
  return (/\bSELECT\b/i.test(value) && /\bFROM\b/i.test(value))
    || (/\bSHOW\b/i.test(value) && /\bFROM\b/i.test(value))
    || (/\bFROM\b/i.test(value) && /\bSINCE\b/i.test(value));
}

/**
 * Recursively search an object for a key named 'nrql' or 'nrqlQueryProgress'
 * and return its value (the NRQL result data).
 */
function findNrqlData(obj) {
  if (!obj || typeof obj !== 'object') return null;

  if (obj.nrqlQueryProgress) return obj.nrqlQueryProgress;
  if (obj.nrql && typeof obj.nrql === 'object') return obj.nrql;

  for (const key of Object.keys(obj)) {
    const found = findNrqlData(obj[key]);
    if (found) return found;
  }
  return null;
}

/**
 * Extract an accountId from a GraphQL request's variables.
 */
function extractAccountId(variables) {
  if (!variables) return null;
  if (variables.accountId !== null && variables.accountId !== undefined) return variables.accountId;
  if (variables.account_id !== null && variables.account_id !== undefined) return variables.account_id;
  if (Array.isArray(variables.accountIds) && variables.accountIds.length > 0) return variables.accountIds[0];
  if (Array.isArray(variables.account_ids) && variables.account_ids.length > 0) return variables.account_ids[0];
  return null;
}

/**
 * Extract widget-identifying hints from GraphQL variables and query text.
 * Returns an object with any available identifiers, or null if none found.
 */
function extractWidgetHints(variables, query) {
  var hints = {};
  var found = false;

  // Known widget-identifying keys to look for in variables
  var knownKeys = {
    entityGuid: 'entityGuid',
    entity_guid: 'entityGuid',
    guid: 'entityGuid',
    widgetId: 'widgetId',
    widget_id: 'widgetId',
    dashboardGuid: 'dashboardGuid',
    dashboard_guid: 'dashboardGuid',
    layoutId: 'layoutId',
    layout_id: 'layoutId'
  };

  if (variables && typeof variables === 'object') {
    // Check known keys directly
    for (var key in knownKeys) {
      if (variables[key] != null) {
        hints[knownKeys[key]] = variables[key];
        found = true;
      }
    }

    // Check for title in variables
    if (variables.title) {
      hints.title = variables.title;
      found = true;
    }

    // Scan all keys for widget/layout-related identifiers
    for (var vKey in variables) {
      if (!variables.hasOwnProperty(vKey)) continue;
      if (vKey in knownKeys) continue; // already handled
      var lk = vKey.toLowerCase();
      if ((lk.indexOf('widget') !== -1 || lk.indexOf('layout') !== -1) && variables[vKey] != null) {
        hints[vKey] = variables[vKey];
        found = true;
      }
    }
  }

  // Extract operation name from query text
  if (query) {
    var opMatch = query.match(/(query|mutation|subscription)\s+([\w]+)/);
    if (opMatch) {
      hints.operationName = opMatch[2];
      found = true;
    }
  }

  return found ? hints : null;
}

/**
 * Given an array of built GraphQL request objects (from buildGraphqlRequests),
 * extract any embedded NRQL queries and return them as NRQL request objects
 * suitable for the NRQL requests tab.
 */
const extractNrqlFromGraphql = (graphqlRequests) => {
  const nrqlRequests = [];

  for (const gqlReq of graphqlRequests) {
    if (!gqlReq.query) continue;
    if (/nrqlQueriedEntities/i.test(gqlReq.query || '')) continue;

    // Collect ALL NRQL strings from variables
    var nrqlQueries = [];
    if (gqlReq.variables) {
      for (const value of Object.values(gqlReq.variables)) {
        if (isNrqlString(value)) {
          nrqlQueries.push(value);
        }
      }
    }

    // Fallback: try to extract inline NRQL from the query text
    if (nrqlQueries.length === 0 && /nrql/i.test(gqlReq.query)) {
      // Match formats like: query(nrql:"SELECT...") or nrql(query:"SELECT...")
      var inlineRegex = /(?:query\s*\(\s*nrql\s*:\s*"|nrql\s*\([^]*?query\s*:\s*")((?:[^"\\]|\\.)*)"/g;
      var inlineMatch;
      while ((inlineMatch = inlineRegex.exec(gqlReq.query)) !== null) {
        var extracted = inlineMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
        if (isNrqlString(extracted)) {
          nrqlQueries.push(extracted);
        }
      }
    }

    if (nrqlQueries.length === 0) continue;

    const accountId = extractAccountId(gqlReq.variables);
    const responseData = gqlReq.response ? gqlReq.response.data : null;
    // Skip entity correlation lookups — NR1 embeds NRQL in variables for these but they
    // return entity metadata, not chart data, and would otherwise produce duplicate entries.
    if (responseData && responseData.actor && responseData.actor.nrqlQueriedEntities) continue;
    const nrqlData = findNrqlData(responseData);
    const widgetHints = extractWidgetHints(gqlReq.variables, gqlReq.query);

    for (var qi = 0; qi < nrqlQueries.length; qi++) {
      var nrqlQuery = nrqlQueries[qi];
      const parsedQuery = parseNrqlListing(nrqlQuery);
      var nrqlReqObj = {
        id: -1,
        requestId: gqlReq.requestId,
        variables: { accountId: accountId },
        query: nrqlQuery,
        response: nrqlData || responseData,
        errors: gqlReq.errors,
        status: gqlReq.errors ? 'error' : 'success',
        type: LogRequestType.CHART,
        name: parsedQuery.name,
        timing: gqlReq.timing
      };
      if (widgetHints) nrqlReqObj.widgetHints = widgetHints;
      nrqlRequests.push(nrqlReqObj);
    }
  }

  return nrqlRequests;
};

export default extractNrqlFromGraphql;
