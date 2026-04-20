function normalizeNrql(s) {
  return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Build an index for fast NRQL → widget lookups.
 * Returns { exactMap: Map<normalizedQuery, widget>, widgets: widgetMap }
 */
function buildWidgetNrqlIndex(widgetMap) {
  var exactMap = {};
  if (!widgetMap || !widgetMap.length) return { exactMap: exactMap, widgets: widgetMap };
  for (var i = 0; i < widgetMap.length; i++) {
    var w = widgetMap[i];
    if (!w.nrqlQueries) continue;
    for (var j = 0; j < w.nrqlQueries.length; j++) {
      var norm = normalizeNrql(w.nrqlQueries[j]);
      if (!exactMap[norm]) exactMap[norm] = w;
    }
  }
  return { exactMap: exactMap, widgets: widgetMap };
}

/**
 * Match a NRQL query string to a dashboard widget by comparing query text.
 * Uses exact match via index first, then falls back to substring containment.
 * Returns the matched widget object or null.
 */
function matchWidgetByNrql(query, widgetMap, index) {
  if (!query || !widgetMap || !widgetMap.length) return null;
  var qn = normalizeNrql(query);

  // Use index for O(1) exact lookup if available
  var idx = index || null;
  if (idx && idx.exactMap) {
    var exact = idx.exactMap[qn];
    if (exact) return exact;
  } else {
    // Fallback: linear exact match
    for (var i = 0; i < widgetMap.length; i++) {
      var w = widgetMap[i];
      if (!w.nrqlQueries) continue;
      for (var j = 0; j < w.nrqlQueries.length; j++) {
        if (qn === normalizeNrql(w.nrqlQueries[j])) return w;
      }
    }
  }

  // Pass 2: substring containment (handles NR1 runtime alias modifications)
  var bestSubMatch = null;
  var bestLenDiff = Infinity;
  for (var si = 0; si < widgetMap.length; si++) {
    var sw = widgetMap[si];
    if (!sw.nrqlQueries) continue;
    for (var sj = 0; sj < sw.nrqlQueries.length; sj++) {
      var wn = normalizeNrql(sw.nrqlQueries[sj]);
      if (qn.length > 40 && wn.length > 40 && (qn.indexOf(wn) !== -1 || wn.indexOf(qn) !== -1)) {
        var lenDiff = Math.abs(qn.length - wn.length);
        if (lenDiff < bestLenDiff) {
          bestLenDiff = lenDiff;
          bestSubMatch = sw;
        }
      }
    }
  }
  if (bestSubMatch) return bestSubMatch;

  return null;
}

export default matchWidgetByNrql;
export { buildWidgetNrqlIndex, normalizeNrql };
