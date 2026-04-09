import { LogRequestType } from '../../types.js';

const parseNrqlListing = query => {
  const parsedQuery = query.match(/from (\S+)(\W)/i) || [null, 'chart', `${query.slice(0, 24)}...`];
  return {
    type: LogRequestType.UNKNOWN,
    name: parsedQuery[1] || ''
  };
};

export default parseNrqlListing;