import { LogRequestType } from '../../types.js';
import parseNrqlListing from './parseNrqlListing.js';

/**
 * Check if a string looks like an NRQL query.
 */
function isNrqlString(value) {
  if (typeof value !== 'string') return false;
  return /\bSELECT\b/i.test(value) && /\bFROM\b/i.test(value)
    || /\bSHOW\b/i.test(value) && /\bFROM\b/i.test(value)
    || /\bFROM\b/i.test(value) && /\bSINCE\b/i.test(value);
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
  if (variables.accountId != null) return variables.accountId;
  if (variables.account_id != null) return variables.account_id;
  if (Array.isArray(variables.accountIds) && variables.accountIds.length > 0) return variables.accountIds[0];
  if (Array.isArray(variables.account_ids) && variables.account_ids.length > 0) return variables.account_ids[0];
  return null;
}

/**
 * Given an array of built GraphQL request objects (from buildGraphqlRequests),
 * extract any embedded NRQL queries and return them as NRQL request objects
 * suitable for the NRQL requests tab.
 */
const extractNrqlFromGraphql = (graphqlRequests) => {
  const nrqlRequests = [];

  for (const gqlReq of graphqlRequests) {
    if (!gqlReq.query || !/nrql/i.test(gqlReq.query)) continue;

    // Try to find the NRQL string in variables
    let nrqlQuery = null;
    if (gqlReq.variables) {
      for (const value of Object.values(gqlReq.variables)) {
        if (isNrqlString(value)) {
          nrqlQuery = value;
          break;
        }
      }
    }

    // Fallback: try to extract inline NRQL from the query text
    if (!nrqlQuery) {
      const inlineMatch = gqlReq.query.match(/nrql\s*\([^)]*query\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (inlineMatch) {
        nrqlQuery = inlineMatch[1].replace(/\\"/g, '"');
      }
    }

    if (!nrqlQuery) continue;

    const accountId = extractAccountId(gqlReq.variables);
    const responseData = gqlReq.response ? gqlReq.response.data : null;
    const nrqlData = findNrqlData(responseData);
    const parsedQuery = parseNrqlListing(nrqlQuery);

    nrqlRequests.push({
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
    });
  }

  return nrqlRequests;
};

export default extractNrqlFromGraphql;
