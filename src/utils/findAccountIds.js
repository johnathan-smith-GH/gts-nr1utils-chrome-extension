function findAccountIds(obj) {
  var ids = [];
  function search(o) {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) {
      for (var i = 0; i < o.length; i++) search(o[i]);
      return;
    }
    for (var key in o) {
      if (key === 'account_ids' && Array.isArray(o[key])) {
        o[key].forEach(function (id) { if (id !== null && id !== undefined) ids.push(String(id)); });
      }
      if (typeof o[key] === 'object') search(o[key]);
    }
  }
  search(obj);
  return ids.filter(function (id, i, arr) { return arr.indexOf(id) === i; });
}

export default findAccountIds;
