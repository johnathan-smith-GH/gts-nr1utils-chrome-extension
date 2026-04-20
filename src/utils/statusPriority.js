/**
 * Returns a sort-priority number for a request based on its status.
 * Lower values sort first: placeholders (-1), pending (0), errors (1), success (2).
 */
export default function statusPriority(req) {
  if (req._isPlaceholder) return -1;
  if (req.status === 'pending') return 0;
  if (req.status === 'error' || req.status === 'timeout') return 1;
  if (req.errors) return 1;
  return 2;
}
