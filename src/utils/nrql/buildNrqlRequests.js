import { LogRequestType } from '../../types.js';
import parseNrqlListing from './parseNrqlListing.js';

const buildNrqlRequests = (requestPayloadText, textStream, timing) => {
  const requestPayload = JSON.parse(requestPayloadText);
  const response = JSON.parse(textStream);
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
      errors: response.message,
      status: response.message ? 'error' : 'success',
      type: payloadRequest.raw ? LogRequestType.RAW : LogRequestType.CHART,
      name: parsedQuery.name,
      timing
    };
  });
};

export default buildNrqlRequests;