import { LogRequestType } from '../../types.js';
import parseNrqlListing from './parseNrqlListing.js';

/**
 * Build NRQL request entries from a bork-sniffer /v5 signal evaluation
 * request+response pair.  Each signalType in the request becomes a separate
 * NRQL entry whose query is reconstructed from the signal's selectClause,
 * eventType, whereClause and facetAttribute — matching the NRQL stored in
 * the dashboard widget's rawConfiguration so that placeholders are resolved.
 */
const buildNrqlFromSignals = (requestPayloadText, responseText, timing) => {
  var requestPayload, response;
  try {
    requestPayload = JSON.parse(requestPayloadText);
  } catch (e) {
    return [];
  }

  var signalTypes = requestPayload.signalTypes;
  if (!Array.isArray(signalTypes) || signalTypes.length === 0) return [];

  try {
    response = JSON.parse(responseText);
  } catch (e) {
    response = null;
  }

  var reports = (response && Array.isArray(response.reports)) ? response.reports : [];
  var accountIds = requestPayload.accountIds || [];
  var accountId = Array.isArray(accountIds) && accountIds.length > 0 ? accountIds[0] : null;

  return signalTypes.map(function (signal) {
    var sc = signal.signalClass || {};
    var selectClause = sc.selectClause || '';
    var eventType = sc.eventType || 'Metric';
    var whereClause = sc.whereClause;
    var facetAttr = signal.facetAttribute;

    // Reconstruct the NRQL query to match the widget rawConfiguration form
    var nrql = 'SELECT ' + selectClause + ' FROM ' + eventType;
    if (whereClause) nrql += ' WHERE ' + whereClause;
    if (facetAttr) nrql += ' FACET ' + facetAttr;

    // Find the matching report by selectClause
    var matchedReport = null;
    for (var ri = 0; ri < reports.length; ri++) {
      var rsc = reports[ri].signalType && reports[ri].signalType.signalClass;
      if (rsc && rsc.selectClause === selectClause) {
        matchedReport = reports[ri];
        break;
      }
    }

    var parsedQuery = parseNrqlListing(nrql);

    return {
      id: -1,
      variables: { accountId: accountId },
      query: nrql,
      response: matchedReport || response,
      errors: null,
      status: matchedReport ? 'success' : (response ? 'success' : 'error'),
      type: LogRequestType.CHART,
      name: parsedQuery.name,
      timing: timing
    };
  });
};

export default buildNrqlFromSignals;
