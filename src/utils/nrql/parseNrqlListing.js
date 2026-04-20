import { LogRequestType } from '../../types.js';

const parseNrqlListing = query => {
  if (!query || typeof query !== 'string') return { type: LogRequestType.UNKNOWN, name: '' };
  // Match FROM followed by an identifier (skip subqueries like "FROM (SELECT ...")
  const parsedQuery = query.match(/from\s+([A-Za-z]\w*)(?:\W|$)/i);
  return {
    type: LogRequestType.UNKNOWN,
    name: parsedQuery ? (parsedQuery[1] || '') : `${query.slice(0, 24)}...`
  };
};

export default parseNrqlListing;