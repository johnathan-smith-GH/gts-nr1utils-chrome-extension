function normalizeNrql(s) {
  return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Match a NRQL query string to a dashboard widget by comparing query text.
 * Uses exact match first, then falls back to substring containment.
 * Returns the matched widget object or null.
 */
function matchWidgetByNrql(query, widgetMap) {
  if (!query || !widgetMap || !widgetMap.length) return null;
  var qn = normalizeNrql(query);

  // Pass 1: exact match
  for (var i = 0; i < widgetMap.length; i++) {
    var w = widgetMap[i];
    if (!w.nrqlQueries) continue;
    for (var j = 0; j < w.nrqlQueries.length; j++) {
      if (qn === normalizeNrql(w.nrqlQueries[j])) return w;
    }
  }

  // Pass 2: substring containment (handles NR1 runtime alias modifications)
  for (var i2 = 0; i2 < widgetMap.length; i2++) {
    var w2 = widgetMap[i2];
    if (!w2.nrqlQueries) continue;
    for (var j2 = 0; j2 < w2.nrqlQueries.length; j2++) {
      var wn = normalizeNrql(w2.nrqlQueries[j2]);
      if (qn.indexOf(wn) !== -1 || wn.indexOf(qn) !== -1) return w2;
    }
  }

  return null;
}

export default matchWidgetByNrql;
