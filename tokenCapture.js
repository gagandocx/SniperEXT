// ── Token Capture + API Proxy — MAIN world script ────────────────────────────
// Runs in MAIN world where it has the SAME origin as hiring.amazon.ca
// This means fetch() calls from here automatically include Amazon's auth cookies
// and the browser treats them as same-origin (no CORS).
//
// Strategy: Content script (fetch.js) sends a CustomEvent with the query,
// this script executes fetch() in the page context, then sends results back.
// ─────────────────────────────────────────────────────────────────────────────
(function() {
    'use strict';

    // ── Listen for API requests from the content script ──────────────────────
    // Content script dispatches '__ss_api_request' events with query details
    // We execute fetch in the page's context (same-origin, with cookies) and
    // return results via '__ss_api_response' events
    document.addEventListener('__ss_api_request', function(evt) {
        var detail = evt.detail || {};
        var requestId = detail.requestId;
        var url = detail.url;
        var body = detail.body;
        var extraHeaders = detail.headers || {};

        if (!url || !requestId) return;

        // Build headers — let browser handle auth cookies automatically
        var headers = {
            'accept': '*/*',
            'accept-language': 'en-US,en;q=0.7',
            'content-type': 'application/json'
        };
        // Merge any extra headers (like country)
        var keys = Object.keys(extraHeaders);
        for (var i = 0; i < keys.length; i++) {
            headers[keys[i]] = extraHeaders[keys[i]];
        }

        // Also try to get the auth token from localStorage (Cognito JWT)
        try {
            for (var j = 0; j < localStorage.length; j++) {
                var key = localStorage.key(j);
                if (key && (key.indexOf('idToken') !== -1 || key.indexOf('accessToken') !== -1) &&
                    key.indexOf('LastAuthUser') === -1 && key.indexOf('clockDrift') === -1) {
                    var val = localStorage.getItem(key);
                    if (val && val.length > 100 && val.split('.').length === 3) {
                        headers['authorization'] = 'Bearer ' + val;
                        break;
                    }
                }
            }
        } catch(e) {}

        // Execute fetch in PAGE context — same origin, cookies included
        fetch(url, {
            method: 'POST',
            headers: headers,
            credentials: 'include', // Include cookies
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
            document.dispatchEvent(new CustomEvent('__ss_api_response', {
                detail: { requestId: requestId, ok: false, status: 0, error: err.message }
            }));
        });
    });

    // ── Also capture token from Amazon's own fetch calls (bonus) ─────────────
    var _origFetch = window.fetch;
    var _capturedToken = null;

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
                    // Store in a DOM element for content script to read
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

    console.log('[tokenCapture] MAIN world API proxy ready');
})();
