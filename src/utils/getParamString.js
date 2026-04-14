const decodeUrl = location => {
  const sansQuestionParams = location.search.replace(/^\?/, '');
  const parts = sansQuestionParams.split('&');
  const data = parts.reduce((acc, part) => {
    const key = part.split('=')[0];
    const value = part.replace(`${key}=`, ''); // Lazy way to check for JSON

    try {
      acc[key] = JSON.parse(atob(value));
    } catch {
      acc[key] = value;
    }

    return acc;
  }, {});
  return data;
}; // FIXME: this name is confusing, not returning a string anymore


const getParamString = location => {
  if (!location || !location.host.match(/(one.newrelic.com|one.eu.newrelic.com)/)) {
    return {
      error: 'This only works for newrelic.com domains.'
    };
  }

  try {
    return decodeUrl(location);
  } catch (_) {
    return {
      error: 'Something broke!'
    };
  }
};

export default getParamString;