function normalizeNrql(s) {
  return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Build an index for fast NRQL → widget lookups.
 * Returns { exactMap: Map<normalizedQuery, widget[]>, widgets: widgetMap }
 */
function buildWidgetNrqlIndex(widgetMap) {
  var exactMap = {};
  if (!widgetMap || !widgetMap.length) return { exactMap: exactMap, widgets: widgetMap };
  for (var i = 0; i < widgetMap.length; i++) {
    var w = widgetMap[i];
    if (!w.nrqlQueries) continue;
    for (var j = 0; j < w.nrqlQueries.length; j++) {
      var norm = normalizeNrql(w.nrqlQueries[j]);
      if (!exactMap[norm]) exactMap[norm] = [];
      exactMap[norm].push(w);
    }
  }
  return { exactMap: exactMap, widgets: widgetMap };
}

/**
 * Match a NRQL query string to a dashboard widget by comparing query text.
 * Uses exact match via index first, then falls back to substring containment.
 * Returns the first matched widget object or null.
 */
function matchWidgetByNrql(query, widgetMap, index) {
  var all = matchAllWidgetsByNrql(query, widgetMap, index);
  return all.length ? all[0] : null;
}

/**
 * Return ALL widgets whose NRQL query matches the given query string.
 * Uses exact match via index first, then falls back to substring containment.
 */
function matchAllWidgetsByNrql(query, widgetMap, index) {
  if (!query || !widgetMap || !widgetMap.length) return [];
  var qn = normalizeNrql(query);
  var results = [];
  var seen = {};

  var idx = index || null;
  if (idx && idx.exactMap) {
    var arr = idx.exactMap[qn];
    if (arr && arr.length) {
      for (var i = 0; i < arr.length; i++) {
        var w = arr[i];
        var key = w.widgetId || (w.title + '|' + JSON.stringify(w.layout));
        if (!seen[key]) { results.push(w); seen[key] = true; }
      }
      return results;
    }
  } else {
    for (var li = 0; li < widgetMap.length; li++) {
      var lw = widgetMap[li];
      if (!lw.nrqlQueries) continue;
      for (var lj = 0; lj < lw.nrqlQueries.length; lj++) {
        if (qn === normalizeNrql(lw.nrqlQueries[lj])) {
          var lkey = lw.widgetId || (lw.title + '|' + JSON.stringify(lw.layout));
          if (!seen[lkey]) { results.push(lw); seen[lkey] = true; }
        }
      }
    }
    if (results.length) return results;
  }

  // Substring containment fallback (handles NR1 runtime alias modifications)
  var bestLenDiff = Infinity;
  var subResults = [];
  for (var si = 0; si < widgetMap.length; si++) {
    var sw = widgetMap[si];
    if (!sw.nrqlQueries) continue;
    for (var sj = 0; sj < sw.nrqlQueries.length; sj++) {
      var wn = normalizeNrql(sw.nrqlQueries[sj]);
      if (Math.max(qn.length, wn.length) > 40 && Math.min(qn.length, wn.length) > 15
          && (qn.indexOf(wn) !== -1 || wn.indexOf(qn) !== -1)) {
        var lenDiff = Math.abs(qn.length - wn.length);
        if (lenDiff < bestLenDiff) {
          bestLenDiff = lenDiff;
          subResults = [sw];
        } else if (lenDiff === bestLenDiff) {
          var skey = sw.widgetId || (sw.title + '|' + JSON.stringify(sw.layout));
          if (!seen[skey]) subResults.push(sw);
        }
      }
    }
  }
  // FROM-clause + column overlap fallback (handles NR1 visualization transforms
  // that inject/append columns, e.g. logger.log-table-widget)
  if (subResults.length === 0) {
    var qFrom = qn.match(/\bfrom\s+(.+?)(?:\s+where\b|\s+since\b|\s+until\b|\s+limit\b|\s+facet\b|\s+timeseries\b|$)/i);
    if (qFrom) {
      var qFromNorm = qFrom[1].replace(/\s+/g, ' ').trim();
      for (var fi = 0; fi < widgetMap.length; fi++) {
        var fw = widgetMap[fi];
        if (!fw.nrqlQueries) continue;
        for (var fj = 0; fj < fw.nrqlQueries.length; fj++) {
          var fwn = normalizeNrql(fw.nrqlQueries[fj]);
          var wFrom = fwn.match(/\bfrom\s+(.+?)(?:\s+where\b|\s+since\b|\s+until\b|\s+limit\b|\s+facet\b|\s+timeseries\b|$)/i);
          if (!wFrom) continue;
          var wFromNorm = wFrom[1].replace(/\s+/g, ' ').trim();
          if (qFromNorm !== wFromNorm) continue;
          var qSelect = (qn.match(/^select\s+(.+?)\s+from\b/i) || [])[1];
          var wSelect = (fwn.match(/^select\s+(.+?)\s+from\b/i) || [])[1];
          if (!qSelect || !wSelect) continue;
          var wCols = wSelect.split(',').map(function (c) { return c.trim().replace(/\s+as\s+.+$/i, '').trim(); });
          var allFound = wCols.every(function (col) { return col && qSelect.indexOf(col) !== -1; });
          if (allFound) {
            var fkey = fw.widgetId || (fw.title + '|' + JSON.stringify(fw.layout));
            if (!seen[fkey]) { subResults.push(fw); seen[fkey] = true; }
          }
        }
      }
    }
  }

  return subResults;
}

export default matchWidgetByNrql;
export { buildWidgetNrqlIndex, matchAllWidgetsByNrql, normalizeNrql };
