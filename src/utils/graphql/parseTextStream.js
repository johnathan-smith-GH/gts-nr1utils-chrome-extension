const parseTextStream = textStream => {
  const datasets = {};
  textStream.split('\n').map(queryResult => queryResult.match(/(id|data): (.+)/)).reduce((latestId, pieces) => {
    if (pieces === null) {
      return latestId;
    }

    if (pieces[1] === 'data') {
      if (latestId !== null) {
        // eslint-disable-next-line prefer-destructuring
        datasets[latestId] = pieces[2];
        return null;
      }
    }

    var parsed = +pieces[2];
    return isNaN(parsed) ? latestId : parsed;
  }, null);
  return datasets;
};

export default parseTextStream;