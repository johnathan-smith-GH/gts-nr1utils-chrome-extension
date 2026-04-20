import { LogRequestType } from '../../types.js';
import parseNrqlListing from './parseNrqlListing.js';

const buildNrqlRequests = (requestPayloadText, textStream, timing) => {
  var requestPayload, response;
  try {
    requestPayload = JSON.parse(requestPayloadText);
  } catch (e) {
    return [{ id: -1, variables: null, query: '', response: null, errors: [{ message: 'Failed to parse request body' }], status: 'error', type: LogRequestType.UNKNOWN, name: 'Malformed Request', timing }];
  }
  try {
    response = textStream ? JSON.parse(textStream) : null;
  } catch (e) {
    response = { _parseError: true, message: 'Failed to parse response body' };
  }
  const requestPayloads = Array.isArray(requestPayload) ? requestPayload : [requestPayload];
  return requestPayloads.map(payloadRequest => {
    const parsedQuery = parseNrqlListing(payloadRequest.nrql);
    return {
      id: -1,
      // unused in NRQL responses
      variables: {
        accountId: payloadRequest.account_id
      },
      query: payloadRequest.nrql || payloadRequest.query,
      response: response,
      errors: response && response._parseError ? [{ message: response.message }] : (response && response.error ? [{ message: response.error }] : null),
      status: response && response._parseError ? 'error' : (response && response.error ? 'error' : 'success'),
      type: payloadRequest.raw ? LogRequestType.RAW : LogRequestType.CHART,
      name: parsedQuery.name,
      timing
    };
  });
};

export default buildNrqlRequests;