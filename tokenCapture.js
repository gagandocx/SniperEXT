// ── Token Capture — MAIN world script ────────────────────────────────────────
// Intercepts fetch() calls to Amazon's AppSync GraphQL API and captures the
// real Authorization Bearer token. Exposes it to content scripts via a custom
// DOM element attribute + CustomEvent.
//
// Runs at document_start in MAIN world so it patches fetch() BEFORE Amazon's
// app code executes.
// ─────────────────────────────────────────────────────────────────────────────
(function() {
    'use strict';

    var _capturedToken = null;
    var _tokenEl = null;

    function ensureTokenElement() {
        if (!_tokenEl) {
            _tokenEl = document.getElementById('__ss_token_store');
            if (!_tokenEl) {
                _tokenEl = document.createElement('div');
                _tokenEl.id = '__ss_token_store';
                _tokenEl.style.display = 'none';
                (document.documentElement || document.body || document.head).appendChild(_tokenEl);
            }
        }
        return _tokenEl;
    }

    function broadcastToken(token) {
        if (!token || token === _capturedToken) return;
        _capturedToken = token;
        var el = ensureTokenElement();
        el.setAttribute('data-token', token);
        el.setAttribute('data-ts', Date.now().toString());
        // Also dispatch event so content script can listen in real-time
        document.dispatchEvent(new CustomEvent('__ss_token', { detail: { token: token, ts: Date.now() } }));
        console.log('[tokenCapture] Token captured:', token.slice(0, 20) + '...' + token.slice(-10));
    }

    // ── Method 1: Patch window.fetch to intercept auth headers ───────────────
    var _origFetch = window.fetch;
    window.fetch = function(input, init) {
        try {
            var url = (typeof input === 'string') ? input : (input && input.url ? input.url : '');
            // Only intercept calls to Amazon's AppSync GraphQL endpoint
            if (url.indexOf('appsync-api') !== -1 && url.indexOf('graphql') !== -1) {
                var headers = (init && init.headers) || {};
                var authHeader = null;

                if (headers instanceof Headers) {
                    authHeader = headers.get('authorization') || headers.get('Authorization');
                } else if (typeof headers === 'object') {
                    authHeader = headers['authorization'] || headers['Authorization'] ||
                                 headers['AUTHORIZATION'] || null;
                }

                if (authHeader && authHeader.length > 20 && !authHeader.includes('<TOKEN>')) {
                    broadcastToken(authHeader);
                }
            }
        } catch(e) {
            // Never break the original request
        }
        return _origFetch.apply(this, arguments);
    };

    // ── Method 2: Patch XMLHttpRequest as fallback ───────────────────────────
    var _origXhrOpen = XMLHttpRequest.prototype.open;
    var _origXhrSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    var _origXhrSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
        this.__ss_url = url;
        return _origXhrOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
        if (this.__ss_url && this.__ss_url.indexOf('appsync-api') !== -1 &&
            this.__ss_url.indexOf('graphql') !== -1) {
            if ((name.toLowerCase() === 'authorization') && value && value.length > 20 && !value.includes('<TOKEN>')) {
                broadcastToken(value);
            }
        }
        return _origXhrSetHeader.apply(this, arguments);
    };

    // ── Method 3: Try to read token from localStorage (AWS Amplify stores it there)
    function scanLocalStorage() {
        try {
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                // AWS Amplify/Cognito typically stores tokens with these patterns
                if (key && (key.indexOf('idToken') !== -1 || key.indexOf('accessToken') !== -1 ||
                            key.indexOf('CognitoIdentityServiceProvider') !== -1)) {
                    var val = localStorage.getItem(key);
                    if (val && val.length > 100 && val.indexOf('.') !== -1) {
                        // Looks like a JWT
                        broadcastToken('Bearer ' + val);
                        return;
                    }
                }
            }
        } catch(e) {}
    }

    // Scan localStorage after a delay (page needs time to populate it)
    setTimeout(scanLocalStorage, 2000);
    setTimeout(scanLocalStorage, 5000);
    setTimeout(scanLocalStorage, 10000);

    // Also scan when page becomes visible (tab switch back)
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) setTimeout(scanLocalStorage, 500);
    });

})();
