// ── Token Capture + API Proxy — MAIN world script ────────────────────────────
// Runs in MAIN world where it has the SAME origin as hiring.amazon.ca
// This means fetch() calls from here are same-origin with Amazon's cookies.
//
// Strategy: Content script (fetch.js) sends a CustomEvent with the query,
// this script executes fetch() in the page context, then sends results back.
//
// IMPORTANT: Amazon's AppSync CORS policy only allows specific headers.
// We must NOT include custom headers like 'country', 'iscanary' etc. in the
// fetch call — those trigger a CORS preflight that gets rejected.
// Only 'content-type' and 'authorization' are in the CORS allowlist.
// ─────────────────────────────────────────────────────────────────────────────
(function() {
    'use strict';

    // ── Capture the auth token from Amazon's own API calls ───────────────────
    var _capturedToken = null;
    var _origFetch = window.fetch;

    window.fetch = function(input, init) {
        try {
            var url = (typeof input === 'string') ? input : (input && input.url ? input.url : '');
            if (url.indexOf('appsync-api') !== -1 || url.indexOf('graphql') !== -1) {
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
                if (authHeader && authHeader.length > 20 && authHeader.indexOf('<TOKEN>') === -1) {
                    _capturedToken = authHeader;
                    console.log('[tokenCapture] Intercepted token from page (' + authHeader.length + ' chars)');
                    // Store in DOM element for content script
                    var el = document.getElementById('__ss_token_store');
                    if (!el) {
                        el = document.createElement('div');
                        el.id = '__ss_token_store';
                        el.style.display = 'none';
                        document.documentElement.appendChild(el);
                    }
                    el.setAttribute('data-token', authHeader);
                    el.setAttribute('data-ts', Date.now().toString());
                }
            }
        } catch(e) {}
        return _origFetch.apply(this, arguments);
    };

    // ── Get auth token: intercepted > localStorage > null ────────────────────
    function getToken() {
        // 1. Use intercepted token from Amazon's own calls (most reliable)
        if (_capturedToken) return _capturedToken;

        // 2. Scan localStorage for Cognito JWT
        try {
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (!key) continue;
                if ((key.indexOf('idToken') !== -1 || key.indexOf('accessToken') !== -1) &&
                    key.indexOf('LastAuthUser') === -1 && key.indexOf('clockDrift') === -1) {
                    var val = localStorage.getItem(key);
                    if (val && val.length > 100 && val.split('.').length === 3) {
                        _capturedToken = 'Bearer ' + val;
                        return _capturedToken;
                    }
                }
            }
        } catch(e) {}

        return null;
    }

    // ── Listen for API requests from content script ──────────────────────────
    document.addEventListener('__ss_api_request', function(evt) {
        var detail = evt.detail || {};
        var requestId = detail.requestId;
        var url = detail.url;
        var body = detail.body;

        if (!url || !requestId) return;

        var token = getToken();

        // CRITICAL: Only use CORS-safe headers!
        // Amazon's AppSync CORS policy only allows:
        //   content-type, authorization, x-amz-user-agent
        // Any other header (country, iscanary, etc.) triggers preflight rejection
        var headers = {
            'content-type': 'application/json'
        };
        if (token) {
            headers['authorization'] = token;
        }

        // Use the ORIGINAL fetch (not our patched version) to avoid recursion
        _origFetch(url, {
            method: 'POST',
            headers: headers,
            body: body
        })
        .then(function(response) {
            var status = response.status;
            var ok = response.ok;
            return response.text().then(function(text) {
                var data = null;
                try { data = JSON.parse(text); } catch(e) { data = { raw: text }; }
                return { ok: ok, status: status, data: data };
            });
        })
        .then(function(result) {
            document.dispatchEvent(new CustomEvent('__ss_api_response', {
                detail: { requestId: requestId, ok: result.ok, status: result.status, data: result.data }
            }));
        })
        .catch(function(err) {
            console.error('[tokenCapture] fetch error:', err.message);
            document.dispatchEvent(new CustomEvent('__ss_api_response', {
                detail: { requestId: requestId, ok: false, status: 0, error: err.message }
            }));
        });
    });

    console.log('[tokenCapture] MAIN world API proxy ready (CORS-safe headers only)');
})();
