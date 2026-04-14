const formatGraphql = query => {
  const isKeywordPresent = query.match(/^(query |mutation )/);
  const keyword = isKeywordPresent ? isKeywordPresent[0] : '';
  const querySansKeyword = isKeywordPresent ? query.replace(keyword, '') : query;
  const chars = querySansKeyword.split('');
  const formattedChars = [];
  let currentIndent = 0;
  let isInParens = false;
  const tabSpace = 2;
  chars.forEach((char, idx) => {
    const prevChar = chars[idx - 1];
    const nextChar = chars[idx + 1];

    if (char === '(') {
      isInParens = true;
    }

    if (char === ')') {
      isInParens = false;
    }

    if (char === '{' && !isInParens) {
      formattedChars.push('{\n');
      currentIndent += tabSpace;
      formattedChars.push(new Array(currentIndent - 1).fill(' ').join(''));
    }

    if (char === '}' && !isInParens) {
      if (prevChar !== '}') {
        formattedChars.push('\n');
      }

      currentIndent -= tabSpace;
      formattedChars.push(new Array(currentIndent).fill(' ').join(''));
      formattedChars.push('}\n');

      if (nextChar !== '}') {
        formattedChars.push(new Array(currentIndent > 0 ? currentIndent - 1 : currentIndent).fill(' ').join(''));
      }
    }

    if (!['{', '}', ' '].includes(char)) {
      formattedChars.push(char);
    }

    if (char === ' ') {
      const isLetterOrUnderscore = /[a-zA-Z_]/;

      if (nextChar.match(isLetterOrUnderscore) && prevChar.match(isLetterOrUnderscore)) {
        formattedChars.push('\n ');
        formattedChars.push(new Array(currentIndent > 0 ? currentIndent - 1 : currentIndent).fill(' ').join(''));
      } else {
        formattedChars.push(' ');
      }
    }
  });
  const formattedQuery = formattedChars.join('').split('\n').map(c => c.trimEnd()).filter(c => c.trim() !== '').join('\n');
  return `${keyword}${formattedQuery}`;
};

export default formatGraphql;