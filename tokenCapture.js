// ── ShiftSniper MAIN World — Response Interceptor + Page Refresh ─────────────
// v8.9.0.0 — Optimized for CATCHING SHIFTS
//
// WAF blocks all our own API calls. The ONLY way to get fresh data is to
// let Amazon's own code make the GraphQL call. We:
// 1. Intercept responses from Amazon's own GraphQL calls
// 2. Periodically trigger a page-level refresh to get fresh data
// 3. When jobs are found, immediately notify the content script
// ─────────────────────────────────────────────────────────────────────────────
(function() {
    'use strict';

    var _origFetch = window.fetch;
    var _lastJobData = null;
    var _lastJobDataTs = 0;
    var _jobsFoundCount = 0;

    // ── Intercept all fetch responses — steal job data ───────────────────────
    window.fetch = function(input, init) {
        var url = (typeof input === 'string') ? input : (input && input.url ? input.url : '');
        var result = _origFetch.apply(this, arguments);

        if (url.indexOf('appsync-api') !== -1 || url.indexOf('graphql') !== -1) {
            result.then(function(response) {
                var clone = response.clone();
                clone.json().then(function(data) {
                    if (data && data.data && data.data.searchJobCardsByLocation) {
                        var jobCards = data.data.searchJobCardsByLocation.jobCards || [];
                        _lastJobData = jobCards;
                        _lastJobDataTs = Date.now();
                        _jobsFoundCount = jobCards.length;
                        if (jobCards.length > 0) {
                            console.log('[SS] 🎯 ' + jobCards.length + ' JOBS FOUND!');
                        }
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

    // ── Handle API requests from content script ──────────────────────────────
    document.addEventListener('__ss_api_request', function(evt) {
        var detail = evt.detail || {};
        if (!detail.requestId) return;

        // Return cached data if fresh (< 15s)
        if (_lastJobData !== null && (Date.now() - _lastJobDataTs < 15000)) {
            document.dispatchEvent(new CustomEvent('__ss_api_response', {
                detail: {
                    requestId: detail.requestId, ok: true, status: 200,
                    data: { data: { searchJobCardsByLocation: { jobCards: _lastJobData, nextToken: null } } }
                }
            }));
        } else {
            // Stale cache — trigger refresh and return what we have
            _triggerRefresh();
            document.dispatchEvent(new CustomEvent('__ss_api_response', {
                detail: {
                    requestId: detail.requestId, ok: true, status: 200,
                    data: { data: { searchJobCardsByLocation: { jobCards: _lastJobData || [], nextToken: null } } }
                }
            }));
        }
    });

    // ── Trigger Amazon to fetch fresh data ───────────────────────────────────
    var _lastRefreshTs = 0;
    var _refreshCount = 0;

    function _triggerRefresh() {
        // Don't refresh more than once per 8 seconds
        if (Date.now() - _lastRefreshTs < 8000) return;
        _lastRefreshTs = Date.now();
        _refreshCount++;

        // Alternate between methods
        if (_refreshCount % 3 === 1) {
            // Method 1: Toggle tabs (Recommended → All)
            try {
                var recTab = null, allTab = null;
                var btns = document.querySelectorAll('button');
                for (var i = 0; i < btns.length; i++) {
                    var txt = btns[i].textContent.trim();
                    if (txt === 'Recommended') recTab = btns[i];
                    if (txt === 'All') allTab = btns[i];
                }
                if (recTab && allTab) {
                    recTab.click();
                    setTimeout(function() { allTab.click(); }, 800);
                    return;
                }
            } catch(e) {}
        }

        // Method 2: Navigate to force React re-render
        if (window.location.hash.includes('jobSearch')) {
            var base = window.location.href.split('?')[0];
            window.location.replace(base + '?r=' + Date.now());
        }
    }

    console.log('[SS] v8.9.0.0 ready — shift sniper active');
})();
