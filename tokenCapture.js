// ── Token Capture + API Proxy — MAIN world script ────────────────────────────
// v8.8.0.3 — Completely new approach
//
// Previous attempts failed because:
// 1. Amazon's React app doesn't always make GraphQL calls on page load
// 2. localStorage tokens may be expired
// 3. The AppSync API needs a SPECIFIC Cognito access token
//
// NEW STRATEGY: Find and use Amazon's internal Apollo/GraphQL client
// that's already authenticated, OR extract the token from the page's
// JavaScript module system (Webpack chunks).
// ─────────────────────────────────────────────────────────────────────────────
(function() {
    'use strict';

    var _capturedToken = null;
    var _tokenCapturedAt = 0;
    var _origFetch = window.fetch;
    var _origXhrOpen = XMLHttpRequest.prototype.open;
    var _origXhrSetHeader = XMLHttpRequest.prototype.setRequestHeader;

    // ── 1. Patch fetch() — intercept token from Amazon's calls ───────────────
    window.fetch = function(input, init) {
        try {
            var url = (typeof input === 'string') ? input : (input && input.url ? input.url : '');
            if (init && init.headers) {
                var headers = init.headers;
                var authHeader = null;
                if (headers instanceof Headers) {
                    authHeader = headers.get('authorization');
                } else if (typeof headers === 'object') {
                    var hkeys = Object.keys(headers);
                    for (var k = 0; k < hkeys.length; k++) {
                        if (hkeys[k].toLowerCase() === 'authorization') {
                            authHeader = headers[hkeys[k]]; break;
                        }
                    }
                }
                if (authHeader && authHeader.length > 50) {
                    _setToken(authHeader, 'fetch-intercept');
                }
            }
        } catch(e) {}
        return _origFetch.apply(this, arguments);
    };

    // ── 2. Patch XHR — some Amazon code might use XHR ────────────────────────
    XMLHttpRequest.prototype.open = function(method, url) {
        this.__ss_url = url;
        return _origXhrOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
        if (name && name.toLowerCase() === 'authorization' && value && value.length > 50) {
            _setToken(value, 'xhr-intercept');
        }
        return _origXhrSetHeader.apply(this, arguments);
    };

    // ── Token storage ────────────────────────────────────────────────────────
    function _setToken(token, source) {
        if (!token || token === _capturedToken || token.indexOf('<TOKEN>') !== -1) return;
        _capturedToken = token;
        _tokenCapturedAt = Date.now();
        console.log('[tokenCapture] Token from ' + source + ' (' + token.length + ' chars)');
        var el = document.getElementById('__ss_token_store');
        if (!el) {
            el = document.createElement('div');
            el.id = '__ss_token_store';
            el.style.display = 'none';
            document.documentElement.appendChild(el);
        }
        el.setAttribute('data-token', token);
        el.setAttribute('data-ts', _tokenCapturedAt.toString());
        // Notify content script
        document.dispatchEvent(new CustomEvent('__ss_token_ready', { detail: { token: token } }));
        // Flush queue
        _flushQueue();
    }

    // ── 3. Deep localStorage scan — find the RIGHT token ─────────────────────
    // Amazon Cognito stores multiple tokens. The one the AppSync API needs is
    // typically the "accessToken" (not idToken).
    function _deepScanStorage() {
        try {
            var candidates = [];
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (!key) continue;
                var val = localStorage.getItem(key);
                if (!val || val.length < 100) continue;

                // JWT check: 3 dot-separated base64 parts
                if (val.split('.').length !== 3) continue;

                // Decode the payload to check token type
                try {
                    var payload = JSON.parse(atob(val.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
                    candidates.push({
                        key: key,
                        token: val,
                        type: payload.token_use || payload.typ || 'unknown',
                        exp: payload.exp || 0,
                        iss: payload.iss || ''
                    });
                } catch(e) { continue; }
            }

            // Prefer: accessToken from Cognito that hasn't expired
            var now = Math.floor(Date.now() / 1000);
            // Sort: prefer access tokens, then by expiry (freshest first)
            candidates.sort(function(a, b) {
                if (a.type === 'access' && b.type !== 'access') return -1;
                if (b.type === 'access' && a.type !== 'access') return 1;
                return (b.exp - a.exp); // freshest first
            });

            for (var j = 0; j < candidates.length; j++) {
                var c = candidates[j];
                if (c.exp > 0 && c.exp < now) {
                    console.log('[tokenCapture] Skipping expired token:', c.key, 'exp:', new Date(c.exp*1000).toISOString());
                    continue;
                }
                console.log('[tokenCapture] Found valid token:', c.key, 'type:', c.type, 'exp:', c.exp ? new Date(c.exp*1000).toISOString() : 'none');
                _setToken('Bearer ' + c.token, 'localStorage-' + c.type);
                return true;
            }

            console.log('[tokenCapture] No valid tokens in localStorage (' + candidates.length + ' candidates checked)');
        } catch(e) {
            console.error('[tokenCapture] Storage scan error:', e.message);
        }
        return false;
    }

    // ── Request queue ────────────────────────────────────────────────────────
    var _pendingRequests = [];

    function _flushQueue() {
        if (!_capturedToken || _pendingRequests.length === 0) return;
        var queue = _pendingRequests.splice(0);
        queue.forEach(_executeRequest);
    }

    function _executeRequest(req) {
        _origFetch(req.url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'authorization': _capturedToken
            },
            body: req.body
        })
        .then(function(resp) {
            return resp.text().then(function(text) {
                var data = null;
                try { data = JSON.parse(text); } catch(e) { data = { raw: text }; }
                document.dispatchEvent(new CustomEvent('__ss_api_response', {
                    detail: { requestId: req.requestId, ok: resp.ok, status: resp.status, data: data }
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
        var d = evt.detail || {};
        if (!d.url || !d.requestId) return;

        var req = { requestId: d.requestId, url: d.url, body: d.body };

        if (_capturedToken) {
            _executeRequest(req);
        } else {
            _pendingRequests.push(req);
            // Try to get token now
            _deepScanStorage();
            if (_capturedToken) {
                _flushQueue();
            } else {
                // Wait up to 12s for Amazon to make a call
                setTimeout(function() {
                    if (!_capturedToken) _deepScanStorage();
                    if (!_capturedToken) {
                        // Respond with error
                        _pendingRequests.forEach(function(r) {
                            document.dispatchEvent(new CustomEvent('__ss_api_response', {
                                detail: { requestId: r.requestId, ok: false, status: 401, error: 'no valid token found', data: null }
                            }));
                        });
                        _pendingRequests = [];
                    } else {
                        _flushQueue();
                    }
                }, 12000);
            }
        }
    });

    // ── Initial scan ─────────────────────────────────────────────────────────
    // Try to find token as early as possible
    function _initScan() {
        if (_capturedToken) return;
        _deepScanStorage();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(_initScan, 1000); });
    } else {
        setTimeout(_initScan, 500);
    }
    // Re-scan periodically in case Cognito refreshes the token
    setTimeout(_initScan, 3000);
    setTimeout(_initScan, 8000);
    setInterval(function() { if (!_capturedToken || (Date.now() - _tokenCapturedAt > 3000000)) _deepScanStorage(); }, 60000);

    console.log('[tokenCapture] v8.8.0.3 ready — deep token scan + intercept');
})();
