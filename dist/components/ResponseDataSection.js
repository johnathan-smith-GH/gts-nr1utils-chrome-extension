import React from '../../snowpack/pkg/react.js';
import ReactJson from '../../snowpack/pkg/react-json-view.js';

const ResponseDataSection = props => {
  const {
    title,
    data,
    showVerbose
  } = props;
  if (data == null) return null;
  const formattedData = typeof data === 'string' ? /*#__PURE__*/React.createElement("code", null, data) : /*#__PURE__*/React.createElement(ReactJson, {
    src: data,
    indentWidth: 2,
    enableClipboard: false,
    displayObjectSize: true,
    displayDataTypes: true,
    theme: window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'summerfruit' : 'summerfruit:inverted',
    style: {
      backgroundColor: 'transparent',
      fontFamily: 'var(--code-font-family)'
    }
  });
  const formatterClass = typeof data === 'string' ? 'App-codeBreak' : 'App-codePre';
  return /*#__PURE__*/React.createElement("section", {
    className: `App-logSelectedQuery App-logSelectedItem ${formatterClass}`
  }, /*#__PURE__*/React.createElement("h2", null, title), /*#__PURE__*/React.createElement("section", {
    className: "App-logCodeWrapper"
  }, formattedData));
};

export default /*#__PURE__*/React.memo(ResponseDataSection);
