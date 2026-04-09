/**
 * NR1 Utils - Early Fetch/XHR Wrapper
 *
 * Injected into the main world via manifest at document_start.
 * Wraps fetch() and XMLHttpRequest before any page JS runs.
 * Sends two-phase messages: REQUEST_START immediately, REQUEST_COMPLETE on response.
 */
(function () {
  'use strict';

  if (window.__NR1_UTILS_EARLY_WRAP__) return;
  window.__NR1_UTILS_EARLY_WRAP__ = true;

  var requestCounter = 0;
  function genRequestId() {
    return 'nr1-' + (++requestCounter) + '-' + Date.now();
  }

  function sendRequestStart(data) {
    window.postMessage({
      type: 'NR1_UTILS_REQUEST_START',
      requestId: data.requestId,
      url: data.url,
      requestBody: data.requestBody,
      startTime: data.startTime
    }, '*');
  }

  function sendRequestComplete(data) {
    window.postMessage({
      type: 'NR1_UTILS_REQUEST_COMPLETE',
      requestId: data.requestId,
      url: data.url,
      requestBody: data.requestBody,
      responseBody: data.responseBody,
      timing: data.timing
    }, '*');
  }

  function readBodyAsText(body) {
    if (!body) return Promise.resolve('');
    if (typeof body === 'string') return Promise.resolve(body);
    if (body instanceof Blob) return body.text();
    if (body instanceof ArrayBuffer) {
      try { return Promise.resolve(new TextDecoder().decode(body)); } catch (e) { return Promise.resolve(''); }
    }
    if (body instanceof Uint8Array) {
      try { return Promise.resolve(new TextDecoder().decode(body)); } catch (e) { return Promise.resolve(''); }
    }
    return Promise.resolve('');
  }

  // Save originals before wrapping
  var originalFetch = window.fetch;
  window.__NR1_ORIGINAL_FETCH__ = originalFetch;

  window.fetch = function (input, init) {
    var method = (init && init.method) ? init.method.toUpperCase() : 'GET';
    if (method !== 'POST') return originalFetch.apply(this, arguments);

    var url = (typeof input === 'string') ? input : (input instanceof Request ? input.url : String(input));
    var rawBody = (init && init.body) ? init.body : '';
    var startTime = performance.now();
    var absStartTime = Date.now();
    var requestId = genRequestId();
    var requestBodyPromise = readBodyAsText(rawBody);

    // Phase 1: Send request start immediately
    requestBodyPromise.then(function (reqBody) {
      sendRequestStart({
        requestId: requestId,
        url: url,
        requestBody: reqBody,
        startTime: absStartTime
      });
    });

    var fetchPromise = originalFetch.apply(this, arguments);

    // Phase 2: Send completion when response arrives
    fetchPromise.then(function (response) {
      var totalTime = performance.now() - startTime;
      var clone = response.clone();
      var textWithTimeout = Promise.race([
        clone.text().catch(function () { return ''; }),
        new Promise(function (resolve) { setTimeout(function () { resolve(''); }, 5000); })
      ]);
      Promise.all([requestBodyPromise, textWithTimeout]).then(function (results) {
        try {
          sendRequestComplete({
            requestId: requestId,
            url: url,
            requestBody: results[0],
            responseBody: results[1],
            timing: { startTime: absStartTime, totalTime: totalTime, blockedTime: 0 }
          });
        } catch (e) {}
      });
    }).catch(function () {
      var totalTime = performance.now() - startTime;
      requestBodyPromise.then(function (reqBody) {
        try {
          sendRequestComplete({
            requestId: requestId,
            url: url,
            requestBody: reqBody,
            responseBody: '',
            timing: { startTime: absStartTime, totalTime: totalTime, blockedTime: 0 }
          });
        } catch (e) {}
      });
    });

    return fetchPromise;
  };

  // Wrap XMLHttpRequest
  var XHRProto = XMLHttpRequest.prototype;
  var originalOpen = XHRProto.open;
  var originalSend = XHRProto.send;
  window.__NR1_ORIGINAL_XHR_OPEN__ = originalOpen;
  window.__NR1_ORIGINAL_XHR_SEND__ = originalSend;

  XHRProto.open = function (method, url) {
    this.__nr1_method = method;
    this.__nr1_url = url;
    return originalOpen.apply(this, arguments);
  };

  XHRProto.send = function (body) {
    var xhr = this;
    if (xhr.__nr1_method && xhr.__nr1_method.toUpperCase() === 'POST') {
      var startTime = performance.now();
      var absStartTime = Date.now();
      var requestId = genRequestId();
      var bodyPromise = readBodyAsText(body);

      // Phase 1: Send request start immediately
      bodyPromise.then(function (reqBody) {
        sendRequestStart({
          requestId: requestId,
          url: xhr.__nr1_url,
          requestBody: reqBody,
          startTime: absStartTime
        });
      });

      // Phase 2: Send completion on load
      xhr.addEventListener('load', function () {
        var totalTime = performance.now() - startTime;
        var responseBody;
        try { responseBody = xhr.responseText || ''; } catch (e) { responseBody = ''; }
        bodyPromise.then(function (requestBody) {
          try {
            sendRequestComplete({
              requestId: requestId,
              url: xhr.__nr1_url,
              requestBody: requestBody,
              responseBody: responseBody,
              timing: { startTime: absStartTime, totalTime: totalTime, blockedTime: 0 }
            });
          } catch (e) {}
        }).catch(function () {});
      });
    }
    return originalSend.apply(this, arguments);
  };
})();
