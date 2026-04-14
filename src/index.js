import * as __SNOWPACK_ENV__ from '../snowpack/env.js';
import.meta.env = __SNOWPACK_ENV__;

import React from '../snowpack/pkg/react.js';
import { Provider } from '../snowpack/pkg/react-redux.js';
import ReactDOM from '../snowpack/pkg/react-dom.js';
import store from './state/store.js';
import App from './App.js';
import './index.css.proxy.js';

// ============================================================
// Establish port connection to the service worker
// with automatic reconnection when the service worker restarts
// ============================================================
var port = null;
var messageListeners = [];

function connectPort() {
  port = chrome.runtime.connect({ name: 'nr1-utils-panel' });

  // Re-attach any existing listeners to the new port
  messageListeners.forEach(function (fn) {
    port.onMessage.addListener(fn);
  });

  port.onDisconnect.addListener(function () {
    // Service worker went away — reconnect after a short delay
    setTimeout(function () {
      try {
        connectPort();
      } catch (e) {
        // Extension context invalidated
      }
    }, 500);
  });
}

connectPort();

// ============================================================
// Messaging-based Chrome API (replaces DevTools API)
// ============================================================
const chromeApi = {
  port: {
    postMessage: function (msg) {
      try {
        port.postMessage(msg);
      } catch (e) {
        // Port disconnected, will reconnect automatically
      }
    },
    onMessage: {
      addListener: function (fn) {
        messageListeners.push(fn);
        try { port.onMessage.addListener(fn); } catch (e) {}
      },
      removeListener: function (fn) {
        messageListeners = messageListeners.filter(function (f) { return f !== fn; });
        try { port.onMessage.removeListener(fn); } catch (e) {}
      }
    }
  },
  getLocation: function (callback) {
    var handler = function (message) {
      if (message.action === 'LOCATION_DATA') {
        chromeApi.port.onMessage.removeListener(handler);
        callback({
          href: message.href,
          host: message.host,
          pathname: message.pathname,
          search: message.search
        });
      }
    };
    chromeApi.port.onMessage.addListener(handler);
    chromeApi.port.postMessage({ action: 'GET_LOCATION' });
  },
  updateUrl: function (url) {
    chromeApi.port.postMessage({ action: 'UPDATE_URL', url: url });
  },
  clearLog: function () {
    chromeApi.port.postMessage({ action: 'CLEAR_LOG' });
  }
};

const browserApi = {
  addEventListener: (evt, fn) => window.addEventListener(evt, fn),
  removeEventListener: (evt, fn) => window.removeEventListener(evt, fn)
};

ReactDOM.createRoot(document.getElementById('root')).render( /*#__PURE__*/React.createElement(React.StrictMode, null, /*#__PURE__*/React.createElement(Provider, {
  store: store
}, /*#__PURE__*/React.createElement(App, {
  chromeApi: chromeApi,
  browserApi: browserApi
}))));
