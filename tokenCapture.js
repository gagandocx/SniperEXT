// ── Token Capture + Silent API Proxy — MAIN world script ─────────────────────
// v8.8.3.0 — Silent scanning (NO page reloads)
//
// The original extension called the API silently without touching the page.
// Our earlier versions triggered tab clicks and URL changes which caused
// visible page reloads — bad UX.
//
// NEW APPROACH:
// 1. Intercept the auth token from Amazon's first GraphQL call on page load
// 2. Use that token for our own SILENT fetch() calls (no UI interaction)
// 3. Use _origFetch (unpatched) with only content-type + authorization headers
// 4. If WAF blocks us, serve cached data (don't trigger page changes)
// ─────────────────────────────────────────────────────────────────────────────
(function() {
    'use strict';

    var _origFetch = window.fetch;
    var _capturedToken = null;
    var _capturedTokenTs = 0;
    var _lastJobData = null;
    var _lastJobDataTs = 0;
    var _wafBlocked = false;
    var _wafBlockCount = 0;

    // ── Intercept fetch — capture token + steal responses ────────────────────
    window.fetch = function(input, init) {
        var url = (typeof input === 'string') ? input : (input && input.url ? input.url : '');
        var result = _origFetch.apply(this, arguments);

        // Capture auth token from ANY request
        try {
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
                if (authHeader && authHeader.length > 100) {
                    _capturedToken = authHeader;
                    _capturedTokenTs = Date.now();
                    _wafBlocked = false; // Token refreshed, reset WAF flag
                    _wafBlockCount = 0;
                }
            }
        } catch(e) {}

        // Intercept GraphQL responses
        if (url.indexOf('appsync-api') !== -1 || url.indexOf('graphql') !== -1) {
            result.then(function(response) {
                var clone = response.clone();
                clone.json().then(function(data) {
                    if (data && data.data && data.data.searchJobCardsByLocation) {
                        var jobCards = data.data.searchJobCardsByLocation.jobCards || [];
                        _lastJobData = jobCards;
                        _lastJobDataTs = Date.now();
                        console.log('[tokenCapture] Intercepted job data:', jobCards.length, 'jobs');
                        document.dispatchEvent(new CustomEvent('__ss_jobs_found', {
                            detail: { jobCards: jobCards, timestamp: Date.now() }
                        }));
                    }
                    if (data && data.data && data.data.searchScheduleCards) {
                        document.dispatchEvent(new CustomEvent('__ss_schedules_found', {
                            detail: { scheduleCards: data.data.searchScheduleCards.scheduleCards || [], timestamp: Date.now() }
                        }));
                    }
                }).catch(function() {});
            }).catch(function() {});
        }

        return result;
    };

    // ── Silent API call (no page interaction) ────────────────────────────────
    // Uses the captured token to make our own fetch calls silently.
    // If WAF blocks repeatedly, we just serve cached/empty data.
    function _silentFetch(body) {
        if (!_capturedToken) {
            return Promise.resolve({ ok: false, status: 401, data: null });
        }
        return _origFetch('https://e5mquma77feepi2bdn4d6h3mpu.appsync-api.us-east-1.amazonaws.com/graphql', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'authorization': _capturedToken
            },
            body: body
        }).then(function(response) {
            if (response.status === 403) {
                _wafBlockCount++;
                if (_wafBlockCount >= 3) _wafBlocked = true;
                return { ok: false, status: 403, data: null };
            }
            _wafBlockCount = 0;
            _wafBlocked = false;
            return response.json().then(function(data) {
                // Cache successful response
                if (data && data.data && data.data.searchJobCardsByLocation) {
                    _lastJobData = data.data.searchJobCardsByLocation.jobCards || [];
                    _lastJobDataTs = Date.now();
                }
                return { ok: response.ok, status: response.status, data: data };
            });
        }).catch(function(err) {
            // CORS or network error — likely WAF
            _wafBlockCount++;
            if (_wafBlockCount >= 3) _wafBlocked = true;
            return { ok: false, status: 0, error: err.message };
        });
    }

    // ── Handle API requests from content script ──────────────────────────────
    document.addEventListener('__ss_api_request', function(evt) {
        var detail = evt.detail || {};
        if (!detail.requestId) return;

        function respond(result) {
            document.dispatchEvent(new CustomEvent('__ss_api_response', {
                detail: {
                    requestId: detail.requestId,
                    ok: result.ok,
                    status: result.status,
                    data: result.data
                }
            }));
        }

        // If WAF is blocking us, just serve cached data silently
        if (_wafBlocked && _lastJobData !== null) {
            console.log('[tokenCapture] WAF blocked — serving cached data (' + _lastJobData.length + ' jobs)');
            respond({
                ok: true, status: 200,
                data: { data: { searchJobCardsByLocation: { jobCards: _lastJobData, nextToken: null } } }
            });
            return;
        }

        // Try silent fetch with captured token
        if (_capturedToken && !_wafBlocked) {
            _silentFetch(detail.body).then(function(result) {
                if (result.ok && result.data) {
                    respond(result);
                } else if (_lastJobData !== null) {
                    // Silent call failed but we have cache — use it
                    respond({
                        ok: true, status: 200,
                        data: { data: { searchJobCardsByLocation: { jobCards: _lastJobData, nextToken: null } } }
                    });
                } else {
                    // No cache, no success — return empty (no page disruption)
                    respond({
                        ok: true, status: 200,
                        data: { data: { searchJobCardsByLocation: { jobCards: [], nextToken: null } } }
                    });
                }
            });
        } else if (_lastJobData !== null) {
            // No token yet but have cached data
            respond({
                ok: true, status: 200,
                data: { data: { searchJobCardsByLocation: { jobCards: _lastJobData, nextToken: null } } }
            });
        } else {
            // No token, no cache — return empty silently
            respond({
                ok: true, status: 200,
                data: { data: { searchJobCardsByLocation: { jobCards: [], nextToken: null } } }
            });
        }
    });

    // ── Also listen for trigger events but do them SILENTLY ──────────────────
    document.addEventListener('__ss_trigger_search', function(evt) {
        // Don't trigger page interactions — just try a silent fetch
        // The scan cycle in fetch.js handles the polling
    });

    console.log('[tokenCapture] v8.8.3.0 — Silent mode (no page reloads)');
})();
