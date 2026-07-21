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
    document.addEventListener('__ss_trigger_search', function(evt) {
        var detail = evt.detail || {};
        console.log('[tokenCapture] Triggering page search...');

        // Strategy 1: Click the "All" tab to trigger a fresh search
        try {
            var allTab = document.querySelector('[data-test-id="all-tab"]');
            if (!allTab) {
                var buttons = document.querySelectorAll('button');
                for (var i = 0; i < buttons.length; i++) {
                    if (buttons[i].textContent.trim() === 'All') {
                        allTab = buttons[i]; break;
                    }
                }
            }
            if (allTab) {
                allTab.click();
                console.log('[tokenCapture] Clicked All tab');
                return;
            }
        } catch(e) {}

        // Strategy 2: Click "Search all jobs" button
        try {
            var searchBtn = document.querySelector('[data-test-id="search-all-jobs-button"]');
            if (!searchBtn) {
                var links = document.querySelectorAll('a, button');
                for (var j = 0; j < links.length; j++) {
                    if (/search all jobs/i.test(links[j].textContent)) {
                        searchBtn = links[j]; break;
                    }
                }
            }
            if (searchBtn) {
                searchBtn.click();
                console.log('[tokenCapture] Clicked Search All Jobs');
                return;
            }
        } catch(e) {}

        // Strategy 3: Trigger a URL hash change to force React to re-fetch
        try {
            var hash = window.location.hash;
            if (hash.includes('jobSearch')) {
                window.location.hash = '#/jobSearch?_r=' + Date.now();
                setTimeout(function() {
                    window.location.hash = '#/jobSearch';
                }, 300);
                console.log('[tokenCapture] Triggered hash navigation');
            }
        } catch(e) {}
    });

    // ── Also respond to direct API request attempts with cached data ─────────
    document.addEventListener('__ss_api_request', function(evt) {
        var detail = evt.detail || {};
        if (!detail.requestId) return;

        // If we have recent job data (< 30s old), return it immediately
        if (_lastJobData && (Date.now() - _lastJobDataTs < 30000)) {
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
        } else {
            // No cached data — trigger a search and wait
            document.dispatchEvent(new CustomEvent('__ss_trigger_search', { detail: {} }));

            // Wait up to 8s for the intercepted response
            var _waited = 0;
            var _pollInterval = setInterval(function() {
                _waited += 500;
                if (_lastJobData && (Date.now() - _lastJobDataTs < 5000)) {
                    clearInterval(_pollInterval);
                    document.dispatchEvent(new CustomEvent('__ss_api_response', {
                        detail: {
                            requestId: detail.requestId,
                            ok: true,
                            status: 200,
                            data: { data: { searchJobCardsByLocation: { jobCards: _lastJobData, nextToken: null } } }
                        }
                    }));
                } else if (_waited >= 8000) {
                    clearInterval(_pollInterval);
                    document.dispatchEvent(new CustomEvent('__ss_api_response', {
                        detail: { requestId: detail.requestId, ok: false, status: 0, error: 'no job data intercepted' }
                    }));
                }
            }, 500);
        }
    });

    console.log('[tokenCapture] v8.8.2.0 — Response interceptor mode (no own API calls)');
})();
