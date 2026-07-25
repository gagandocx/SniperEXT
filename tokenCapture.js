// ═══════════════════════════════════════════════════════════════════════════════
// ShiftSniper HYPER INTERCEPTOR v8.9.7.5
// ═══════════════════════════════════════════════════════════════════════════════
// STRATEGY: Two-pronged attack for MAXIMUM speed (2-second cycle)
//
//   PRONG 1 — PASSIVE: Intercept Response.prototype.json() and .text()
//             Catches ANY response from Amazon's own code (0ms delay)
//
//   PRONG 2 — ACTIVE: Steal Amazon's auth headers from their outgoing fetch,
//             then make our OWN direct GraphQL calls every 2 seconds.
//             If WAF blocks us (403), fall back to clicking "All" tab.
//
// This means we get data from BOTH:
//   - Amazon's own periodic calls (passive — free, no risk)
//   - Our own injected calls (active — 2s guaranteed freshness)
// ═══════════════════════════════════════════════════════════════════════════════
(function() {
    'use strict';

    var _realFetch = window.fetch.bind(window);
    var _lastJobData = null;
    var _lastJobDataTs = 0;
    var _jobsFoundCount = 0;
    var _interceptCount = 0;

    // ── Stolen auth context from Amazon's own requests ───────────────────────
    var _stolenHeaders = null;
    var _stolenEndpoint = null;
    var _stolenAt = 0;

    // ═══════════════════════════════════════════════════════════════════════════
    // PRONG 1: Passive interception (same as before — catches Amazon's own calls)
    // ═══════════════════════════════════════════════════════════════════════════
    var _origJson = Response.prototype.json;
    Response.prototype.json = function() {
        var resp = this;
        var result = _origJson.call(this);
        if (resp.url && (resp.url.indexOf('appsync') !== -1 || resp.url.indexOf('graphql') !== -1)) {
            result.then(function(data) {
                _processInterceptedData(data);
            }).catch(function() {});
        }
        return result;
    };

    var _origText = Response.prototype.text;
    Response.prototype.text = function() {
        var resp = this;
        var result = _origText.call(this);
        if (resp.url && (resp.url.indexOf('appsync') !== -1 || resp.url.indexOf('graphql') !== -1)) {
            result.then(function(text) {
                try { _processInterceptedData(JSON.parse(text)); } catch(e) {}
            }).catch(function() {});
        }
        return result;
    };

    function _processInterceptedData(data) {
        _interceptCount++;
        if (data && data.data && data.data.searchJobCardsByLocation) {
            var jobCards = data.data.searchJobCardsByLocation.jobCards || [];
            _lastJobData = jobCards;
            _lastJobDataTs = Date.now();
            _jobsFoundCount = jobCards.length;
            _updateStore(jobCards.length);
            if (jobCards.length > 0) {
                console.log('[SS] 🎯 ' + jobCards.length + ' JOBS FOUND! — STOPPING active poll');
                // STOP active polling immediately — let fetch.js handle the apply
                if (_activeInterval) { clearInterval(_activeInterval); _activeInterval = null; }
                document.dispatchEvent(new CustomEvent('__ss_jobs_found', {
                    detail: { jobCards: jobCards, timestamp: Date.now() }
                }));
            }
        }
        if (data && data.data && data.data.searchScheduleCards) {
            document.dispatchEvent(new CustomEvent('__ss_schedules_found', {
                detail: { scheduleCards: data.data.searchScheduleCards.scheduleCards || [], timestamp: Date.now() }
            }));
        }
    }

    function _updateStore(jobCount) {
        var el = document.getElementById('__ss_token_store');
        if (!el) {
            el = document.createElement('div');
            el.id = '__ss_token_store';
            el.style.display = 'none';
            document.documentElement.appendChild(el);
        }
        el.setAttribute('data-jobs', jobCount.toString());
        el.setAttribute('data-ts', Date.now().toString());
        el.setAttribute('data-intercepts', _interceptCount.toString());
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HEADER THEFT: Capture Amazon's auth headers from their own fetch calls
    // ═══════════════════════════════════════════════════════════════════════════
    var _origFetch = window.fetch;
    window.fetch = function(input, init) {
        var url = (typeof input === 'string') ? input : (input && input.url) || '';
        if (url.indexOf('appsync') !== -1 || url.indexOf('graphql') !== -1) {
            if (init && init.headers) {
                _stolenHeaders = {};
                // Copy headers (could be Headers object or plain object)
                if (init.headers instanceof Headers) {
                    init.headers.forEach(function(val, key) { _stolenHeaders[key] = val; });
                } else {
                    for (var k in init.headers) { _stolenHeaders[k] = init.headers[k]; }
                }
                _stolenEndpoint = url;
                _stolenAt = Date.now();
            }
        }
        return _origFetch.apply(this, arguments);
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // PRONG 2: Active polling — our own GraphQL calls every 2 seconds
    // ═══════════════════════════════════════════════════════════════════════════
    var _activeInterval = null;
    var _activeFails = 0;
    var _useActivePoll = true; // switches to false if WAF blocks us

    function _buildQuery() {
        var today = new Date().toISOString().split('T')[0];
        // Read user's actual search settings from the DOM (set by fetch.js)
        // These are stored in the __ss_token_store element by fetch.js
        var lat = 43.653524, lng = -79.383907, distance = 200, country = 'Canada', locale = 'en-CA';
        try {
            var storeEl = document.getElementById('__ss_token_store');
            if (storeEl) {
                if (storeEl.getAttribute('data-lat')) lat = parseFloat(storeEl.getAttribute('data-lat'));
                if (storeEl.getAttribute('data-lng')) lng = parseFloat(storeEl.getAttribute('data-lng'));
                if (storeEl.getAttribute('data-dist')) distance = parseInt(storeEl.getAttribute('data-dist'));
                if (storeEl.getAttribute('data-country')) country = storeEl.getAttribute('data-country');
                if (storeEl.getAttribute('data-locale')) locale = storeEl.getAttribute('data-locale');
            }
        } catch(e) {}
        return JSON.stringify({
            operationName: 'searchJobCardsByLocation',
            variables: { searchJobRequest: {
                locale: locale, country: country, keyWords: '',
                equalFilters: [], containFilters: [{ key: 'isPrivateSchedule', val: ['false'] }],
                rangeFilters: [{ key: 'hoursPerWeek', range: { minimum: 0, maximum: 80 } }],
                dateFilters: [{ key: 'firstDayOnSite', range: { startDate: today } }],
                excludeFilters: [], orFilters: [], sorters: [], pageSize: 100,
                geoQueryClause: { lat: lat, lng: lng, unit: 'km', distance: distance },
                consolidateSchedule: true
            }},
            query: 'query searchJobCardsByLocation($searchJobRequest: SearchJobRequest!) { searchJobCardsByLocation(searchJobRequest: $searchJobRequest) { nextToken jobCards { jobId language dataSource requisitionType jobTitle jobType employmentType city state postalCode locationName totalPayRateMin totalPayRateMax tagLine bannerText image distance featuredJob bonusJob bonusPay scheduleCount currencyCode geoClusterDescription surgePay jobTypeL10N employmentTypeL10N totalPayRateMinL10N totalPayRateMaxL10N distanceL10N monthlyBasePayMin monthlyBasePayMinL10N monthlyBasePayMax monthlyBasePayMaxL10N virtualLocation poolingEnabled } } }'
        });
    }

    async function _activePoll() {
        if (window['__ss_halted']) return;

        // If we don't have stolen headers OR they're expired (>5 min), use fallback
        if (!_stolenHeaders || !_stolenEndpoint || (Date.now() - _stolenAt > 300000)) {
            _fallbackRefresh();
            return;
        }

        // If active polling failed 3+ times, switch to fallback mode for 30s
        if (!_useActivePoll) return;

        try {
            var resp = await _realFetch(_stolenEndpoint, {
                method: 'POST',
                headers: _stolenHeaders,
                body: _buildQuery()
            });

            if (resp.ok) {
                var data = await resp.json();
                _activeFails = 0;
                _processInterceptedData(data);
            } else if (resp.status === 403 || resp.status === 401) {
                _activeFails++;
                if (_activeFails >= 3) {
                    // WAF is blocking — fall back to tab clicking for 30s
                    console.log('[SS] Active poll blocked (403) — falling back to tab click for 30s');
                    _useActivePoll = false;
                    _stolenHeaders = null;
                    setTimeout(function() { _useActivePoll = true; _activeFails = 0; }, 30000);
                }
                _fallbackRefresh();
            }
        } catch(e) {
            _activeFails++;
            _fallbackRefresh();
        }
    }

    // Fallback: click "All" tab to force Amazon to make its own call
    function _fallbackRefresh() {
        try {
            var btns = document.querySelectorAll('button');
            for (var i = 0; i < btns.length; i++) {
                if (btns[i].textContent.trim() === 'All') { btns[i].click(); return; }
            }
        } catch(e) {}
    }

    // Start the 2-second active poll — ONLY on jobSearch page
    // Don't poll on jobDetail or application pages (interferes with apply flow)
    setTimeout(function() {
        var url = window.location.href;
        if (url.includes('app#/jobSearch') || (url.includes('/app') && !url.includes('jobDetail') && !url.includes('application'))) {
            _activeInterval = setInterval(_activePoll, 2000);
            console.log('[SS] ⚡ Active polling started (every 2s) — jobSearch only');
        } else {
            console.log('[SS] ℹ️ NOT polling — on apply/detail page');
        }
    }, 3000);

    // ═══════════════════════════════════════════════════════════════════════════
    // Handle requests from content script (fetch.js)
    // ═══════════════════════════════════════════════════════════════════════════
    document.addEventListener('__ss_api_request', function(evt) {
        var detail = evt.detail || {};
        if (!detail.requestId) return;

        // Check if this is a schedule request (has body with searchScheduleCards)
        var isScheduleReq = detail.body && detail.body.indexOf('searchScheduleCards') !== -1;

        if (isScheduleReq && _stolenHeaders && _stolenEndpoint) {
            // Forward schedule request using stolen headers
            _realFetch(_stolenEndpoint, {
                method: 'POST',
                headers: _stolenHeaders,
                body: detail.body
            }).then(function(r) { return r.json(); }).then(function(data) {
                document.dispatchEvent(new CustomEvent('__ss_api_response', {
                    detail: { requestId: detail.requestId, ok: true, status: 200, data: data }
                }));
            }).catch(function() {
                document.dispatchEvent(new CustomEvent('__ss_api_response', {
                    detail: { requestId: detail.requestId, ok: true, status: 200, data: { data: { searchScheduleCards: { scheduleCards: [] } } } }
                }));
            });
            return;
        }

        // Job search request — return cached data
        document.dispatchEvent(new CustomEvent('__ss_api_response', {
            detail: {
                requestId: detail.requestId, ok: true, status: 200,
                data: { data: { searchJobCardsByLocation: { jobCards: _lastJobData || [], nextToken: null } } }
            }
        }));
    });

    console.log('[SS] v8.9.7.5 HYPER MODE ready — passive intercept + active 2s poll');
})();
