import { LogRequestType } from '../../types.js';

const typeMap = {
  'query': LogRequestType.QUERY,
  'mutation': LogRequestType.MUTATION,
  'subscription': LogRequestType.QUERY
};

const parseGraphqlListing = query => {
  const parsedQuery = query.match(/(query|mutation|subscription)\s+([\w]+)/) || query.match(/(query|mutation|subscription)\s*[\(\{]/);
  if (parsedQuery) {
    return {
      type: typeMap[parsedQuery[1]] || LogRequestType.QUERY,
      name: parsedQuery[2] || `${query.replace(/[ \n]{2,}/g, ' ').slice(0, 24)}...`
    };
  }
  return {
    type: LogRequestType.QUERY,
    name: `${query.replace(/[ \n]{2,}/g, ' ').slice(0, 24)}...`
  };
};

export default parseGraphqlListing;