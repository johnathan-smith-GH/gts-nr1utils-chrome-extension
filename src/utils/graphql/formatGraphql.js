const formatGraphql = query => {
  if (!query || typeof query !== 'string') return '';
  const isKeywordPresent = query.match(/^(query |mutation |subscription )/);
  const keyword = isKeywordPresent ? isKeywordPresent[0] : '';
  const querySansKeyword = isKeywordPresent ? query.replace(keyword, '') : query;
  const chars = querySansKeyword.split('');
  const formattedChars = [];
  let currentIndent = 0;
  let parenDepth = 0;
  const tabSpace = 2;
  chars.forEach((char, idx) => {
    const prevChar = chars[idx - 1];
    const nextChar = chars[idx + 1];

    if (char === '(') {
      parenDepth++;
    }

    if (char === ')') {
      if (parenDepth > 0) parenDepth--;
    }

    if (char === '{' && parenDepth === 0) {
      formattedChars.push('{\n');
      currentIndent += tabSpace;
      formattedChars.push(new Array(Math.max(0, currentIndent - 1)).fill(' ').join(''));
    }

    if (char === '}' && parenDepth === 0) {
      if (prevChar !== '}') {
        formattedChars.push('\n');
      }

      currentIndent = Math.max(0, currentIndent - tabSpace);
      formattedChars.push(new Array(Math.max(0, currentIndent)).fill(' ').join(''));
      formattedChars.push('}\n');

      if (nextChar !== '}') {
        formattedChars.push(new Array(Math.max(0, currentIndent > 0 ? currentIndent - 1 : currentIndent)).fill(' ').join(''));
      }
    }

    if (!['{', '}', ' '].includes(char)) {
      formattedChars.push(char);
    }

    if (char === ' ') {
      const isLetterOrUnderscore = /[a-zA-Z_]/;

      if (nextChar && prevChar && nextChar.match(isLetterOrUnderscore) && prevChar.match(isLetterOrUnderscore)) {
        formattedChars.push('\n ');
        formattedChars.push(new Array(Math.max(0, currentIndent > 0 ? currentIndent - 1 : currentIndent)).fill(' ').join(''));
      } else {
        formattedChars.push(' ');
      }
    }
  });
  const formattedQuery = formattedChars.join('').split('\n').map(c => c.trimEnd()).filter(c => c.trim() !== '').join('\n');
  return `${keyword}${formattedQuery}`;
};

export default formatGraphql;