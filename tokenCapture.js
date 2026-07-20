// ── Token Capture + API Proxy — MAIN world script ────────────────────────────
// Runs in MAIN world (same JS context as Amazon's React app).
//
// v8.8.0.2 approach: Instead of trying to find the token ourselves, we
// INTERCEPT Amazon's own fetch calls, steal the exact authorization header
// they use, and replay it in our own calls.
//
// The key insight: Amazon's app makes API calls on page load (for
// "Recommended jobs", translations, etc). We capture the auth header from
// those calls and reuse it.
// ─────────────────────────────────────────────────────────────────────────────
(function() {
    'use strict';

    var _capturedToken = null;
    var _tokenCapturedAt = 0;
    var _pendingRequests = []; // Queue requests until token is available
    var _origFetch = window.fetch;

    // ── Patch fetch to intercept Amazon's auth token ─────────────────────────
    window.fetch = function(input, init) {
        try {
            var url = (typeof input === 'string') ? input : (input && input.url ? input.url : '');
            // Capture token from ANY Amazon API call (not just graphql)
            if (url.indexOf('appsync-api') !== -1 || url.indexOf('graphql') !== -1 ||
                url.indexOf('hiring.amazon') !== -1) {
                var headers = (init && init.headers) || {};
                var authHeader = null;
                if (headers instanceof Headers) {
                    authHeader = headers.get('authorization') || headers.get('Authorization');
                } else if (typeof headers === 'object') {
                    var hkeys = Object.keys(headers);
                    for (var k = 0; k < hkeys.length; k++) {
                        if (hkeys[k].toLowerCase() === 'authorization') {
                            authHeader = headers[hkeys[k]]; break;
                        }
                    }
                }
                if (authHeader && authHeader.length > 50 && authHeader.indexOf('<TOKEN>') === -1) {
                    var isNew = (_capturedToken !== authHeader);
                    _capturedToken = authHeader;
                    _tokenCapturedAt = Date.now();
                    if (isNew) {
                        console.log('[tokenCapture] Got token from Amazon (' + authHeader.length + ' chars):', authHeader.slice(0, 30) + '...');
                        // Store in DOM for content script
                        var el = document.getElementById('__ss_token_store');
                        if (!el) {
                            el = document.createElement('div');
                            el.id = '__ss_token_store';
                            el.style.display = 'none';
                            document.documentElement.appendChild(el);
                        }
                        el.setAttribute('data-token', authHeader);
                        el.setAttribute('data-ts', _tokenCapturedAt.toString());
                        // Process any queued requests
                        _flushQueue();
                    }
                }
            }
        } catch(e) {}
        return _origFetch.apply(this, arguments);
    };

    // ── Process queued requests ──────────────────────────────────────────────
    function _flushQueue() {
        if (!_capturedToken || _pendingRequests.length === 0) return;
        console.log('[tokenCapture] Flushing ' + _pendingRequests.length + ' queued requests');
        var queue = _pendingRequests.slice();
        _pendingRequests = [];
        queue.forEach(function(req) { _executeRequest(req); });
    }

    // ── Execute a proxied API request ────────────────────────────────────────
    function _executeRequest(req) {
        var headers = { 'content-type': 'application/json' };
        if (_capturedToken) {
            headers['authorization'] = _capturedToken;
        }

        _origFetch(req.url, {
            method: 'POST',
            headers: headers,
            body: req.body
        })
        .then(function(response) {
            return response.text().then(function(text) {
                var data = null;
                try { data = JSON.parse(text); } catch(e) { data = { raw: text }; }
                document.dispatchEvent(new CustomEvent('__ss_api_response', {
                    detail: { requestId: req.requestId, ok: response.ok, status: response.status, data: data }
                }));
            });
        })
        .catch(function(err) {
            document.dispatchEvent(new CustomEvent('__ss_api_response', {
                detail: { requestId: req.requestId, ok: false, status: 0, error: err.message }
            }));
        });
    }

    // ── Listen for API requests from content script ──────────────────────────
    document.addEventListener('__ss_api_request', function(evt) {
        var detail = evt.detail || {};
        if (!detail.url || !detail.requestId) return;

        var req = { requestId: detail.requestId, url: detail.url, body: detail.body };

        if (_capturedToken) {
            // Token available — execute immediately
            _executeRequest(req);
        } else {
            // No token yet — queue and wait for Amazon's code to make a call
            console.log('[tokenCapture] No token yet — queuing request. Waiting for Amazon to authenticate...');
            _pendingRequests.push(req);

            // Also try to force Amazon's page to make an API call (triggers auth)
            _triggerPageApiCall();

            // Timeout: if no token after 10s, try localStorage as last resort
            setTimeout(function() {
                if (!_capturedToken) {
                    _tryLocalStorage();
                    if (_capturedToken) _flushQueue();
                    else {
                        // Still nothing — respond with error so fetch.js retries
                        _pendingRequests.forEach(function(r) {
                            document.dispatchEvent(new CustomEvent('__ss_api_response', {
                                detail: { requestId: r.requestId, ok: false, status: 401, error: 'no token available' }
                            }));
                        });
                        _pendingRequests = [];
                    }
                }
            }, 10000);
        }
    });

    // ── Try to trigger Amazon's page to make an API call ─────────────────────
    function _triggerPageApiCall() {
        try {
            // Click the "All" tab or trigger a search to force the page to call the API
            var allTab = document.querySelector('[data-test-id="all-tab"], button[data-test-id*="all"]');
            if (allTab && !allTab.classList.contains('active')) {
                // Don't actually click — just dispatch a minor interaction that forces data fetch
            }
            // Scroll slightly to trigger lazy loading
            window.scrollBy(0, 1);
            setTimeout(function() { window.scrollBy(0, -1); }, 100);
        } catch(e) {}
    }

    // ── localStorage fallback ────────────────────────────────────────────────
    function _tryLocalStorage() {
        try {
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (!key) continue;
                if ((key.indexOf('idToken') !== -1 || key.indexOf('accessToken') !== -1) &&
                    key.indexOf('LastAuthUser') === -1 && key.indexOf('clockDrift') === -1) {
                    var val = localStorage.getItem(key);
                    if (val && val.length > 100 && val.split('.').length === 3) {
                        _capturedToken = 'Bearer ' + val;
                        _tokenCapturedAt = Date.now();
                        console.log('[tokenCapture] Fallback: token from localStorage (' + val.length + ' chars)');
                        return;
                    }
                }
            }
        } catch(e) {}
    }

    // ── Initial token scan (in case Amazon already made calls) ───────────────
    // Run after a delay to let Amazon's code initialize
    setTimeout(function() {
        if (!_capturedToken) _tryLocalStorage();
        if (_capturedToken) _flushQueue();
    }, 3000);

    setTimeout(function() {
        if (!_capturedToken) _tryLocalStorage();
        if (_capturedToken) _flushQueue();
    }, 6000);

    console.log('[tokenCapture] MAIN world proxy ready — waiting to capture token from Amazon...');
})();
