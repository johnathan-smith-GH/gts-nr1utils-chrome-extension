import formatGraphql from './formatGraphql.js';
import parseGraphqlListing from './parseGraphqlListing.js';
import parseTextStream from './parseTextStream.js';

const buildGraphqlRequests = (requestPayloadText, data, timing) => {
  if (!requestPayloadText) {
    // No request body (e.g. captured via PerformanceObserver fallback)
    return [{
      id: undefined,
      query: '',
      variables: null,
      response: null,
      errors: null,
      status: 'success',
      type: 'QUERY',
      name: 'Unknown GraphQL Request',
      timing
    }];
  }

  var requestPayload;
  try {
    requestPayload = JSON.parse(requestPayloadText);
  } catch (e) {
    return [{
      id: undefined,
      query: '',
      variables: null,
      response: null,
      errors: null,
      status: 'error',
      type: 'QUERY',
      name: 'Malformed Request',
      timing
    }];
  }
  const requestPayloads = Array.isArray(requestPayload) ? requestPayload : [requestPayload];

  if (!data) {
    // No response body (e.g. cross-origin or very large response) — still capture the request
    return requestPayloads.map((payloadRequest) => {
      const parsedQuery = parseGraphqlListing(payloadRequest.query);
      return {
        id: payloadRequest.id,
        query: formatGraphql(payloadRequest.query),
        variables: payloadRequest.variables,
        response: null,
        errors: null,
        status: 'success',
        type: parsedQuery.type,
        name: parsedQuery.name,
        timing
      };
    });
  }

  const isTextStream = data.match(/^id:.*/);
  var datasets;
  try {
    datasets = isTextStream ? parseTextStream(data) : JSON.parse(data);
  } catch (e) {
    return requestPayloads.map((payloadRequest) => {
      const parsedQuery = parseGraphqlListing(payloadRequest.query);
      return {
        id: payloadRequest.id,
        query: formatGraphql(payloadRequest.query),
        variables: payloadRequest.variables,
        response: null,
        errors: [{ message: 'Failed to parse response body' }],
        status: 'error',
        type: parsedQuery.type,
        name: parsedQuery.name,
        timing
      };
    });
  }

  return requestPayloads.map((payloadRequest, idx) => {
    const parsedQuery = parseGraphqlListing(payloadRequest.query);
    const responsePayload = datasets[payloadRequest.id] ? JSON.parse(datasets[payloadRequest.id]) : datasets;
    const queryResponse = Array.isArray(responsePayload) ? responsePayload[idx].payload : responsePayload;
    return {
      id: payloadRequest.id,
      query: formatGraphql(payloadRequest.query),
      variables: payloadRequest.variables,
      response: queryResponse,
      errors: queryResponse.errors,
      status: queryResponse.errors ? (function () { try { return JSON.stringify(queryResponse.errors).match(/timeout/i) ? 'timeout' : 'error'; } catch (e) { return 'error'; } })() : 'success',
      type: parsedQuery.type,
      name: parsedQuery.name,
      timing
    };
  });
};

export default buildGraphqlRequests;