// ── ShiftSniper MAIN World — Response Interceptor + Page Refresh ─────────────
// v8.9.1.0 — FIXED: Use Object.defineProperty to intercept ALL fetch calls
//
// Previous versions patched window.fetch directly, but Amazon's React app
// saves its own reference to fetch at module load time (before our patch).
// 37 GraphQL calls returned 200 but we never saw them!
//
// FIX: Use Object.defineProperty with getter/setter so ANY access to
// window.fetch goes through our proxy — even cached references.
// Also add a Response prototype patch as backup.
// ─────────────────────────────────────────────────────────────────────────────
(function() {
    'use strict';

    var _realFetch = window.fetch.bind(window);
    var _lastJobData = null;
    var _lastJobDataTs = 0;
    var _jobsFoundCount = 0;
    var _interceptCount = 0;

    // ── Method 1: Patch Response.prototype.json to intercept ALL responses ───
    // This works regardless of HOW fetch was called or which reference was used
    var _origJson = Response.prototype.json;
    Response.prototype.json = function() {
        var resp = this;
        var result = _origJson.call(this);

        // Check if this response is from the GraphQL endpoint
        if (resp.url && (resp.url.indexOf('appsync') !== -1 || resp.url.indexOf('graphql') !== -1)) {
            result.then(function(data) {
                _interceptCount++;
                if (data && data.data && data.data.searchJobCardsByLocation) {
                    var jobCards = data.data.searchJobCardsByLocation.jobCards || [];
                    _lastJobData = jobCards;
                    _lastJobDataTs = Date.now();
                    _jobsFoundCount = jobCards.length;

                    // Store proof of interception
                    var el = document.getElementById('__ss_token_store');
                    if (!el) {
                        el = document.createElement('div');
                        el.id = '__ss_token_store';
                        el.style.display = 'none';
                        document.documentElement.appendChild(el);
                    }
                    el.setAttribute('data-jobs', jobCards.length.toString());
                    el.setAttribute('data-ts', Date.now().toString());
                    el.setAttribute('data-intercepts', _interceptCount.toString());

                    if (jobCards.length > 0) {
                        console.log('[SS] 🎯 ' + jobCards.length + ' JOBS FOUND!');
                    }

                    // Notify content script
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
        }

        return result;
    };

    // ── Method 2: Also patch text() for cases where json() isn't used ────────
    var _origText = Response.prototype.text;
    Response.prototype.text = function() {
        var resp = this;
        var result = _origText.call(this);

        if (resp.url && (resp.url.indexOf('appsync') !== -1 || resp.url.indexOf('graphql') !== -1)) {
            result.then(function(text) {
                try {
                    var data = JSON.parse(text);
                    _interceptCount++;
                    if (data && data.data && data.data.searchJobCardsByLocation) {
                        var jobCards = data.data.searchJobCardsByLocation.jobCards || [];
                        _lastJobData = jobCards;
                        _lastJobDataTs = Date.now();
                        _jobsFoundCount = jobCards.length;

                        // Store proof
                        var el = document.getElementById('__ss_token_store');
                        if (!el) {
                            el = document.createElement('div');
                            el.id = '__ss_token_store';
                            el.style.display = 'none';
                            document.documentElement.appendChild(el);
                        }
                        el.setAttribute('data-jobs', jobCards.length.toString());
                        el.setAttribute('data-ts', Date.now().toString());
                        el.setAttribute('data-intercepts', _interceptCount.toString());

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
                } catch(e) {}
            }).catch(function() {});
        }

        return result;
    };

    // ── Handle API requests from content script ──────────────────────────────
    document.addEventListener('__ss_api_request', function(evt) {
        var detail = evt.detail || {};
        if (!detail.requestId) return;

        // Return intercepted data if fresh (< 4s — matches scan interval)
        if (_lastJobData !== null && (Date.now() - _lastJobDataTs < 4000)) {
            document.dispatchEvent(new CustomEvent('__ss_api_response', {
                detail: {
                    requestId: detail.requestId, ok: true, status: 200,
                    data: { data: { searchJobCardsByLocation: { jobCards: _lastJobData, nextToken: null } } }
                }
            }));
        } else {
            // Stale — trigger refresh and return what we have
            _triggerRefresh();
            document.dispatchEvent(new CustomEvent('__ss_api_response', {
                detail: {
                    requestId: detail.requestId, ok: true, status: 200,
                    data: { data: { searchJobCardsByLocation: { jobCards: _lastJobData || [], nextToken: null } } }
                }
            }));
        }
    });

    // ── Trigger page refresh ─────────────────────────────────────────────────
    var _lastRefreshTs = 0;
    var _refreshCount = 0;

    function _triggerRefresh() {
        if (Date.now() - _lastRefreshTs < 1000) return;
        _lastRefreshTs = Date.now();
        _refreshCount++;

        // v8.9.5.5: ALWAYS use tab toggle — URL manipulation breaks Amazon's SPA
        // (appending ?r=timestamp causes 400 Bad Request errors)
        try {
            var btns = document.querySelectorAll('button');
            var recTab = null, allTab = null;
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
            // If only "All" tab exists (already selected), click it to force re-fetch
            if (allTab) {
                allTab.click();
                return;
            }
        } catch(e) {}

        // Last resort: scroll to trigger lazy-load (NOT URL change)
        try {
            window.scrollBy(0, 1);
            setTimeout(function() { window.scrollBy(0, -1); }, 300);
        } catch(e) {}
    }

    // ── Auto-refresh loop: ensures Amazon keeps making API calls ────────────
    // In background mode (minimized window), the page might stop making calls.
    // This forces a tab toggle every N seconds to keep data flowing.
    var _autoRefreshInterval = null;

    function startAutoRefresh() {
        if (_autoRefreshInterval) return;
        // Read scan interval from storage, default 3s
        var interval = 3000;
        try {
            var el = document.getElementById('__ss_token_store');
            if (el && el.getAttribute('data-interval')) {
                interval = parseInt(el.getAttribute('data-interval')) || 3000;
            }
        } catch(e) {}

        // Every interval: if data is stale, force tab toggle
        _autoRefreshInterval = setInterval(function() {
            var staleness = Date.now() - _lastJobDataTs;
            // Only refresh if data is older than the interval (stale)
            if (staleness > Math.max(interval, 3000)) {
                _triggerRefresh();
            }
        }, Math.max(interval, 2000));
    }

    // Start auto-refresh after 5s (let page settle)
    setTimeout(startAutoRefresh, 5000);

    console.log('[SS] v8.9.6.2 ready — Response.prototype interceptor + auto-refresh active');
})();
