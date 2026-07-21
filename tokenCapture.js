// ── Token Capture + Response Interceptor — MAIN world script ─────────────────
// v8.8.2.0 — COMPLETELY NEW APPROACH
//
// AWS WAF blocks ALL our own fetch() calls — even from MAIN world with the
// same cookies. WAF uses behavioral/fingerprint detection that distinguishes
// our programmatic requests from Amazon's React-initiated requests.
//
// NEW STRATEGY: Don't make our own API calls. Instead:
// 1. Intercept RESPONSES from Amazon's own GraphQL calls
// 2. Trigger Amazon's page to search for jobs (click search, change filters)
// 3. Read the job data from intercepted responses
// 4. Send results to content script for processing
// ─────────────────────────────────────────────────────────────────────────────
(function() {
    'use strict';

    var _origFetch = window.fetch;
    var _lastJobData = null;
    var _lastJobDataTs = 0;

    // ── Intercept ALL fetch responses — steal job data from Amazon's calls ───
    window.fetch = function(input, init) {
        var url = (typeof input === 'string') ? input : (input && input.url ? input.url : '');
        var result = _origFetch.apply(this, arguments);

        // Only intercept GraphQL responses
        if (url.indexOf('appsync-api') !== -1 || url.indexOf('graphql') !== -1) {
            result.then(function(response) {
                // Clone the response so Amazon's code can still read it
                var clone = response.clone();
                clone.json().then(function(data) {
                    // Check if this response contains job cards
                    if (data && data.data && data.data.searchJobCardsByLocation) {
                        var jobCards = data.data.searchJobCardsByLocation.jobCards || [];
                        console.log('[tokenCapture] Intercepted job data:', jobCards.length, 'jobs');
                        _lastJobData = jobCards;
                        _lastJobDataTs = Date.now();

                        // Send to content script
                        document.dispatchEvent(new CustomEvent('__ss_jobs_found', {
                            detail: {
                                jobCards: jobCards,
                                nextToken: data.data.searchJobCardsByLocation.nextToken,
                                timestamp: Date.now()
                            }
                        }));
                    }
                    // Also check for schedule data
                    if (data && data.data && data.data.searchScheduleCards) {
                        document.dispatchEvent(new CustomEvent('__ss_schedules_found', {
                            detail: {
                                scheduleCards: data.data.searchScheduleCards.scheduleCards || [],
                                timestamp: Date.now()
                            }
                        }));
                    }
                }).catch(function() {});
            }).catch(function() {});
        }

        return result;
    };

    // ── Trigger Amazon's page to make a job search ──────────────────────────
    // Called by content script when it wants fresh job data
    var _lastTriggerMethod = 0;
    document.addEventListener('__ss_trigger_search', function(evt) {
        console.log('[tokenCapture] Triggering page search...');

        // Rotate between methods to avoid caching
        _lastTriggerMethod = (_lastTriggerMethod + 1) % 4;

        if (_lastTriggerMethod === 0) {
            // Method 1: Toggle Recommended → All (forces re-fetch)
            try {
                var recTab = document.querySelector('[data-test-id="recommended-tab"]');
                if (!recTab) {
                    var btns = document.querySelectorAll('button');
                    for (var i = 0; i < btns.length; i++) {
                        if (btns[i].textContent.trim() === 'Recommended') { recTab = btns[i]; break; }
                    }
                }
                if (recTab) {
                    recTab.click();
                    console.log('[tokenCapture] Clicked Recommended tab');
                    // Then click All after 1.5s to trigger fresh search
                    setTimeout(function() {
                        var allTab = document.querySelector('[data-test-id="all-tab"]');
                        if (!allTab) {
                            var btns2 = document.querySelectorAll('button');
                            for (var j = 0; j < btns2.length; j++) {
                                if (btns2[j].textContent.trim() === 'All') { allTab = btns2[j]; break; }
                            }
                        }
                        if (allTab) { allTab.click(); console.log('[tokenCapture] Clicked All tab'); }
                    }, 1500);
                    return;
                }
            } catch(e) {}
        }

        if (_lastTriggerMethod === 1) {
            // Method 2: Navigate to jobSearch with cache-bust param
            try {
                var newHash = '#/jobSearch?_t=' + Date.now();
                if (window.location.hash !== newHash) {
                    window.location.hash = newHash;
                    console.log('[tokenCapture] Hash navigation: ' + newHash);
                    setTimeout(function() { window.location.hash = '#/jobSearch'; }, 800);
                    return;
                }
            } catch(e) {}
        }

        if (_lastTriggerMethod === 2) {
            // Method 3: Full page reload (forces fresh data)
            try {
                console.log('[tokenCapture] Triggering soft reload via hash');
                window.location.href = window.location.pathname + '#/jobSearch';
                // Don't actually reload — just trigger React router
            } catch(e) {}
        }

        // Method 4 (fallback): Click All tab anyway
        try {
            var allTab = document.querySelector('[data-test-id="all-tab"]');
            if (!allTab) {
                var buttons = document.querySelectorAll('button');
                for (var k = 0; k < buttons.length; k++) {
                    if (buttons[k].textContent.trim() === 'All') { allTab = buttons[k]; break; }
                }
            }
            if (allTab) { allTab.click(); console.log('[tokenCapture] Clicked All tab'); }
        } catch(e) {}
    });

    // ── Also respond to direct API request attempts with cached data ─────────
    document.addEventListener('__ss_api_request', function(evt) {
        var detail = evt.detail || {};
        if (!detail.requestId) return;

        // If we have ANY cached data (even 0 jobs), return it — that's valid
        if (_lastJobData !== null && (Date.now() - _lastJobDataTs < 60000)) {
            console.log('[tokenCapture] Returning cached job data (' + _lastJobData.length + ' jobs)');
            document.dispatchEvent(new CustomEvent('__ss_api_response', {
                detail: {
                    requestId: detail.requestId,
                    ok: true,
                    status: 200,
                    data: {
                        data: {
                            searchJobCardsByLocation: {
                                jobCards: _lastJobData,
                                nextToken: null
                            }
                        }
                    }
                }
            }));
            // Also trigger a fresh search in background for next cycle
            document.dispatchEvent(new CustomEvent('__ss_trigger_search', { detail: {} }));
        } else {
            // No cached data — trigger a search and wait
            document.dispatchEvent(new CustomEvent('__ss_trigger_search', { detail: {} }));

            // Wait up to 10s for the intercepted response
            var _waited = 0;
            var _pollInterval = setInterval(function() {
                _waited += 500;
                if (_lastJobData !== null && (Date.now() - _lastJobDataTs < 10000)) {
                    clearInterval(_pollInterval);
                    document.dispatchEvent(new CustomEvent('__ss_api_response', {
                        detail: {
                            requestId: detail.requestId,
                            ok: true,
                            status: 200,
                            data: { data: { searchJobCardsByLocation: { jobCards: _lastJobData, nextToken: null } } }
                        }
                    }));
                } else if (_waited >= 10000) {
                    clearInterval(_pollInterval);
                    // Return empty result instead of error (no jobs is valid)
                    document.dispatchEvent(new CustomEvent('__ss_api_response', {
                        detail: {
                            requestId: detail.requestId,
                            ok: true,
                            status: 200,
                            data: { data: { searchJobCardsByLocation: { jobCards: [], nextToken: null } } }
                        }
                    }));
                }
            }, 500);
        }
    });

    console.log('[tokenCapture] v8.8.2.0 — Response interceptor mode (no own API calls)');
})();
