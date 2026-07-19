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
        }
        if (!_tokenEl) {
            _tokenEl = document.createElement('div');
            _tokenEl.id = '__ss_token_store';
            _tokenEl.style.display = 'none';
            (document.documentElement || document.body || document.head).appendChild(_tokenEl);
        }
        return _tokenEl;
    }

    function broadcastToken(token) {
        if (!token || token === _capturedToken) return;
        // Normalize: ensure "Bearer " prefix
        if (!token.startsWith('Bearer ') && !token.startsWith('bearer ')) {
            token = 'Bearer ' + token;
        }
        _capturedToken = token;
        var el = ensureTokenElement();
        el.setAttribute('data-token', token);
        el.setAttribute('data-ts', Date.now().toString());
        // Also dispatch event so content script can listen in real-time
        document.dispatchEvent(new CustomEvent('__ss_token', { detail: { token: token, ts: Date.now() } }));
        console.log('[tokenCapture] Token captured (' + token.length + ' chars):', token.slice(0, 30) + '...');
    }

    // ── Method 1: Patch window.fetch to intercept auth headers ───────────────
    var _origFetch = window.fetch;
    window.fetch = function(input, init) {
        try {
            var url = (typeof input === 'string') ? input : (input && input.url ? input.url : '');
            // Intercept calls to Amazon's AppSync GraphQL endpoint
            if (url.indexOf('appsync-api') !== -1 || url.indexOf('graphql') !== -1) {
                var headers = (init && init.headers) || {};
                var authHeader = null;

                if (headers instanceof Headers) {
                    authHeader = headers.get('authorization') || headers.get('Authorization');
                } else if (typeof headers === 'object') {
                    // Check all possible casing
                    var keys = Object.keys(headers);
                    for (var k = 0; k < keys.length; k++) {
                        if (keys[k].toLowerCase() === 'authorization') {
                            authHeader = headers[keys[k]];
                            break;
                        }
                    }
                }

                if (authHeader && authHeader.length > 20 && authHeader.indexOf('<TOKEN>') === -1) {
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

    XMLHttpRequest.prototype.open = function(method, url) {
        this.__ss_url = url;
        return _origXhrOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
        if (this.__ss_url && (this.__ss_url.indexOf('appsync-api') !== -1 ||
            this.__ss_url.indexOf('graphql') !== -1)) {
            if ((name.toLowerCase() === 'authorization') && value && value.length > 20 && value.indexOf('<TOKEN>') === -1) {
                broadcastToken(value);
            }
        }
        return _origXhrSetHeader.apply(this, arguments);
    };

    // ── Method 3: Scan localStorage for Cognito/Amplify JWT tokens ───────────
    function scanLocalStorage() {
        try {
            var bestToken = null;
            var bestLen = 0;
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (!key) continue;
                // AWS Amplify/Cognito stores tokens with these key patterns
                var isTokenKey = (key.indexOf('idToken') !== -1 ||
                                  key.indexOf('accessToken') !== -1 ||
                                  (key.indexOf('CognitoIdentityServiceProvider') !== -1 &&
                                   key.indexOf('LastAuthUser') === -1 &&
                                   key.indexOf('clockDrift') === -1));
                if (isTokenKey) {
                    var val = localStorage.getItem(key);
                    if (val && val.length > 100 && val.indexOf('.') !== -1 &&
                        val.split('.').length === 3 && val.length > bestLen) {
                        // Looks like a JWT token — keep the longest (most complete)
                        bestToken = val;
                        bestLen = val.length;
                    }
                }
            }
            if (bestToken) {
                broadcastToken(bestToken);
                return true;
            }
        } catch(e) {
            console.log('[tokenCapture] localStorage scan error:', e.message);
        }
        return false;
    }

    // ── Method 4: Hook into AWS Amplify's Auth module if available ────────────
    function scanAmplifyAuth() {
        try {
            // Check if AWS Amplify Auth is available on window
            if (window.aws_amplify && window.aws_amplify.Auth) {
                window.aws_amplify.Auth.currentSession().then(function(session) {
                    var token = session.getIdToken().getJwtToken();
                    if (token) broadcastToken(token);
                }).catch(function() {});
                return;
            }
            // Also check for the Amplify v6 pattern
            if (window.__amplify_token) {
                broadcastToken(window.__amplify_token);
                return;
            }
        } catch(e) {}
    }

    // ── Method 5: Watch for the token in meta tags or script data ─────────────
    function scanPageForToken() {
        try {
            // Some Amazon pages embed the token in a script tag or data attribute
            var scripts = document.querySelectorAll('script[type="application/json"]');
            for (var i = 0; i < scripts.length; i++) {
                var text = scripts[i].textContent || '';
                if (text.indexOf('eyJ') !== -1) { // JWT tokens start with eyJ (base64 of {"...)
                    var match = text.match(/"(?:token|idToken|accessToken|authorization)"\s*:\s*"(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)"/);
                    if (match && match[1]) {
                        broadcastToken(match[1]);
                        return;
                    }
                }
            }
        } catch(e) {}
    }

    // Run scans at various delays to catch token whenever it becomes available
    function runAllScans() {
        if (!scanLocalStorage()) {
            scanAmplifyAuth();
            scanPageForToken();
        }
    }

    // Immediate + delayed scans
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(runAllScans, 500);
            setTimeout(runAllScans, 2000);
        });
    } else {
        setTimeout(runAllScans, 200);
        setTimeout(runAllScans, 1500);
    }
    setTimeout(runAllScans, 3000);
    setTimeout(runAllScans, 5000);
    setTimeout(runAllScans, 8000);
    setTimeout(runAllScans, 15000);

    // Re-scan when tab regains focus
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) setTimeout(runAllScans, 500);
    });

    // Periodic re-scan every 30s to catch token refreshes
    setInterval(runAllScans, 30000);

})();
