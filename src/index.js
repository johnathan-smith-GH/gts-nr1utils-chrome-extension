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
var outboundQueue = [];
var reconnecting = false;
var connecting = false;
var reconnectAttempts = 0;
var MAX_QUEUE_SIZE = 200;
var MAX_RECONNECT_ATTEMPTS = 10;

function connectPort() {
  if (connecting) return;
  connecting = true;
  reconnecting = false;
  reconnectAttempts = 0;
  port = chrome.runtime.connect({ name: 'nr1-utils-panel' });
  connecting = false;

  // Re-attach any existing listeners to the new port
  messageListeners.forEach(function (fn) {
    try { port.onMessage.addListener(fn); } catch (e) {}
  });

  // Flush any messages queued during reconnection
  if (outboundQueue.length > 0) {
    var queued = outboundQueue.slice();
    outboundQueue = [];
    queued.forEach(function (msg) {
      try { port.postMessage(msg); } catch (e) {}
    });
  }

  port.onDisconnect.addListener(function () {
    reconnecting = true;
    reconnectAttempts++;
    if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      // Give up — extension context is likely invalidated
      console.warn('[NR1 Utils] Max reconnect attempts reached. Dropping', outboundQueue.length, 'queued messages.');
      outboundQueue = [];
      reconnecting = false;
      return;
    }
    // Exponential backoff: 500ms, 1s, 2s, 4s...
    var delay = Math.min(500 * Math.pow(2, reconnectAttempts - 1), 30000);
    setTimeout(function () {
      try {
        connectPort();
      } catch (e) {
        // Extension context invalidated — retry if under limit
        reconnecting = false;
        connecting = false;
        if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
          var retryDelay = Math.min(500 * Math.pow(2, reconnectAttempts - 1), 30000);
          setTimeout(function () {
            try { connectPort(); } catch (e2) {
              reconnecting = false;
              connecting = false;
              outboundQueue = [];
            }
          }, retryDelay);
        } else {
          outboundQueue = [];
        }
      }
    }, delay);
  });
}

connectPort();

// ============================================================
// Messaging-based Chrome API (replaces DevTools API)
// ============================================================
const chromeApi = {
  port: {
    postMessage: function (msg) {
      if (reconnecting) {
        if (outboundQueue.length < MAX_QUEUE_SIZE) outboundQueue.push(msg);
        return;
      }
      try {
        port.postMessage(msg);
      } catch (e) {
        // Port disconnected — queue for after reconnect
        if (outboundQueue.length < MAX_QUEUE_SIZE) outboundQueue.push(msg);
      }
    },
    onMessage: {
      addListener: function (fn) {
        if (!messageListeners.includes(fn)) {
          messageListeners.push(fn);
        }
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
  }
};

const browserApi = {
  addEventListener: (evt, fn) => window.addEventListener(evt, fn),
  removeEventListener: (evt, fn) => window.removeEventListener(evt, fn)
};

// ============================================================
// Error Boundary — catches render errors and shows recovery UI
// ============================================================
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error: error };
  }
  componentDidCatch(error, info) {
    console.error('[NR1 Utils] React error:', error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      var self = this;
      return React.createElement('div', {
        style: { padding: '24px', fontFamily: 'system-ui, sans-serif', color: '#333' }
      },
        React.createElement('h2', { style: { color: '#e00', marginBottom: '12px' } }, 'Something went wrong'),
        React.createElement('p', { style: { marginBottom: '12px', fontSize: '14px' } },
          this.state.error ? String(this.state.error) : 'An unexpected error occurred.'
        ),
        React.createElement('button', {
          onClick: function () { self.setState({ hasError: false, error: null }); },
          style: {
            padding: '8px 16px', borderRadius: '6px', border: 'none',
            background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: '13px'
          }
        }, 'Reload Extension UI')
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render( /*#__PURE__*/React.createElement(React.StrictMode, null, /*#__PURE__*/React.createElement(ErrorBoundary, null, /*#__PURE__*/React.createElement(Provider, {
  store: store
}, /*#__PURE__*/React.createElement(App, {
  chromeApi: chromeApi,
  browserApi: browserApi
})))));
