/**
 * brain.js — ShiftSniper Brain v2.0
 * v8.9.6.0 — AI-Powered Centralized Watchdog
 *
 * 10 ADVANCED FEATURES:
 *  1. Activity Log (last 50 actions)
 *  2. Smart Timing (learns average step durations)
 *  3. Consecutive Failure Detection (skips broken fixes)
 *  4. Session Health Score (0-100)
 *  5. Smarter AI Analysis (full screen analysis + recovery plan)
 *  6. Multi-Tab Awareness (monitors re-login tab)
 *  7. Auto-Expand Search (increases radius if 0 shifts for 30 min)
 *  8. Notification Dashboard (toasts + health in scan ring)
 *  9. Recovery Memory (remembers what worked, persists in storage)
 * 10. Proactive Session Refresh (refreshes before expiry)
 */
(function() {
    'use strict';

    // Early bail-out check — if chrome.storage isn't available, we're in wrong context
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        console.warn('[brain] chrome.storage not available — brain.js cannot run in this context');
        return;
    }

    try { // Wrap entire brain in try-catch to prevent silent crashes

    var LOG_PREFIX = '[brain]';
    var POLL_INTERVAL = 4000;


    // ═══════════════════════════════════════════════════════════════════════════
    // FEATURE 1: ACTIVITY LOG — Last 50 actions with timestamps
    // ═══════════════════════════════════════════════════════════════════════════
    var _activityLog = [];
    var _MAX_LOG = 50;

    function logAction(type, detail, success) {
        var entry = {
            time: new Date().toLocaleTimeString(),
            ts: Date.now(),
            type: type,       // 'fix', 'ai', 'state', 'health', 'refresh'
            detail: detail,
            success: success !== undefined ? success : null,
            state: _currentState
        };
        _activityLog.push(entry);
        if (_activityLog.length > _MAX_LOG) _activityLog.shift();
        console.log(LOG_PREFIX, (success === false ? '❌' : success === true ? '✅' : '📝'),
                    type + ':', detail);
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // FEATURE 2: SMART TIMING — Learn average step durations
    // ═══════════════════════════════════════════════════════════════════════════
    var _timings = {}; // { state: { avg: ms, count: n, last: ms } }
    var _timingsLoaded = false;

    function recordTiming(state, durationMs) {
        if (!_timings[state]) _timings[state] = { avg: durationMs, count: 1, last: durationMs };
        else {
            var t = _timings[state];
            t.count++;
            t.avg = Math.round((t.avg * (t.count - 1) + durationMs) / t.count);
            t.last = durationMs;
        }
        // Persist every 5 recordings
        if ((_timings[state].count % 5) === 0) {
            chrome.storage.local.set({ '__brain_timings': _timings });
        }
    }

    function getSmartTimeout(state) {
        // If we have learned timing, use 2.5x the average as timeout
        if (_timings[state] && _timings[state].count >= 3) {
            return Math.max(_timings[state].avg * 2.5, 8000); // at least 8s
        }
        return STATE_TIMEOUTS[state]; // fallback to defaults
    }

    // Load saved timings
    chrome.storage.local.get(['__brain_timings'], function(d) {
        if (d['__brain_timings']) { _timings = d['__brain_timings']; _timingsLoaded = true; }
    });


    // ═══════════════════════════════════════════════════════════════════════════
    // FEATURE 3: CONSECUTIVE FAILURE DETECTION — Skip broken fixes
    // ═══════════════════════════════════════════════════════════════════════════
    var _failureHistory = {}; // { 'STATE:fixType': { fails: n, lastFail: ts } }

    function recordFixResult(state, fixType, success) {
        var key = state + ':' + fixType;
        if (!_failureHistory[key]) _failureHistory[key] = { fails: 0, successes: 0, lastFail: 0 };
        if (success) {
            _failureHistory[key].successes++;
            _failureHistory[key].fails = Math.max(0, _failureHistory[key].fails - 1);
        } else {
            _failureHistory[key].fails++;
            _failureHistory[key].lastFail = Date.now();
        }
    }

    function shouldSkipFix(state, fixType) {
        var key = state + ':' + fixType;
        var h = _failureHistory[key];
        if (!h) return false;
        // Skip if failed 3+ times in a row and last failure was < 5 min ago
        return h.fails >= 3 && (Date.now() - h.lastFail) < 300000;
    }

    function getAlternativeFix(state) {
        // Return an alternative fix when the primary one keeps failing
        switch (state) {
            case 'LOGIN_PAGE': return 'reload';      // if activate fails → reload
            case 'LOGIN_FILLING': return 'reload';   // if click Continue fails → reload
            case 'REDIRECT': return 'navigate_job';  // if redirect logic fails → direct nav
            case 'AUTH_OTP': return 'reload';         // if Gmail refresh fails → reload auth
            default: return 'reload';
        }
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // FEATURE 4: SESSION HEALTH SCORE (0-100)
    // ═══════════════════════════════════════════════════════════════════════════
    var _health = {
        score: 100,
        lastIntercept: 0,
        interceptsPerMin: 0,
        errorsLast5Min: 0,
        _interceptTimes: [],   // timestamps of last 20 intercepts
        _errorTimes: []        // timestamps of errors
    };

    function updateHealth() {
        var now = Date.now();
        var score = 100;

        // Factor 1: Data freshness (0-50 points) — MOST IMPORTANT
        var storeEl = document.getElementById('__ss_token_store');
        if (storeEl) {
            var lastTs = parseInt(storeEl.getAttribute('data-ts') || '0');
            _health.lastIntercept = lastTs;
            var staleness = now - lastTs;
            if (staleness < 10000) score -= 0;         // < 10s: perfect
            else if (staleness < 20000) score -= 5;    // 10-20s: fine (normal gap)
            else if (staleness < 40000) score -= 15;   // 20-40s: slightly stale
            else if (staleness < 60000) score -= 30;   // 40-60s: concerning
            else if (staleness < 90000) score -= 40;   // 60-90s: likely dying
            else score -= 50;                           // 90s+: dead
        } else {
            score -= 50; // No intercepts at all
        }

        // Factor 2: Intercept rate (0-20 points)
        // Amazon's page only calls API when tab toggles or it decides to refresh
        // Normal operation: 1-5 intercepts per minute is HEALTHY
        _health._interceptTimes = _health._interceptTimes.filter(function(t) { return now - t < 60000; });
        _health.interceptsPerMin = _health._interceptTimes.length;
        if (_health.interceptsPerMin >= 3) score -= 0;       // 3+/min: great
        else if (_health.interceptsPerMin >= 1) score -= 5;  // 1-2/min: normal
        else {
            // 0 intercepts — but only penalize if we've been scanning > 30s
            // (first 30s after page load might have 0 naturally)
            var scanAge = stateAge();
            if (scanAge > 30000) score -= 20;  // 0/min after 30s: problem
            else score -= 0;                    // Still warming up
        }

        // Factor 3: Recent errors (0-30 points)
        _health._errorTimes = _health._errorTimes.filter(function(t) { return now - t < 300000; });
        _health.errorsLast5Min = _health._errorTimes.length;
        if (_health.errorsLast5Min === 0) score -= 0;
        else if (_health.errorsLast5Min <= 2) score -= 10;
        else if (_health.errorsLast5Min <= 5) score -= 20;
        else score -= 30;

        _health.score = Math.max(0, Math.min(100, score));
        return _health.score;
    }

    function recordIntercept() {
        _health._interceptTimes.push(Date.now());
    }

    function recordError() {
        _health._errorTimes.push(Date.now());
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // FEATURE 5: SMARTER AI ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════
    async function _askAI(stuckState) {
        logAction('ai', 'Escalating to AI for state: ' + stuckState);

        var groqKey = '';
        try {
            var data = await new Promise(function(res) {
                chrome.storage.local.get(['groq_api_key'], res);
            });
            groqKey = data.groq_api_key || '';
        } catch(e) {}

        if (!groqKey) {
            logAction('ai', 'No Groq key — falling back to reload', false);
            window.location.reload();
            return;
        }

        var ssRes = await new Promise(function(resolve) {
            chrome.runtime.sendMessage({ action: 'takeScreenshot' }, function(r) {
                if (chrome.runtime.lastError) resolve({ error: chrome.runtime.lastError.message });
                else resolve(r || { error: 'no response' });
            });
        });

        if (ssRes.error || !ssRes.dataUrl) {
            logAction('ai', 'Screenshot failed', false);
            window.location.reload();
            return;
        }

        var pageContext = {
            url: window.location.href,
            title: document.title,
            stuckState: stuckState,
            stuckFor: Math.round(stateAge() / 1000) + 's',
            healthScore: _health.score,
            actionsAttempted: _actionCount,
            recentLog: _activityLog.slice(-5).map(function(e) { return e.type + ':' + e.detail; }),
            visibleButtons: [],
            visibleInputs: [],
            bodySnippet: (document.body.innerText || '').slice(0, 600)
        };

        var btns = document.querySelectorAll('button, [role="button"], a[href]');
        for (var i = 0; i < Math.min(btns.length, 15); i++) {
            var txt = (btns[i].textContent || '').trim().slice(0, 50);
            if (txt) pageContext.visibleButtons.push(txt);
        }
        var inputs = document.querySelectorAll('input, textarea, select');
        for (var j = 0; j < Math.min(inputs.length, 10); j++) {
            pageContext.visibleInputs.push({
                type: inputs[j].type || 'text',
                id: inputs[j].id || inputs[j].getAttribute('data-test-id') || '',
                hasValue: !!inputs[j].value
            });
        }

        try {
            var ctl = new AbortController();
            var tmout = setTimeout(function() { ctl.abort(); }, 20000);
            var gResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                signal: ctl.signal, method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + groqKey },
                body: JSON.stringify({
                    model: 'qwen/qwen3.6-27b', max_tokens: 500, temperature: 0.1,
                    messages: [{
                        role: 'system',
                        content: 'You are ShiftSniper Brain AI. The Amazon job-hunting extension is STUCK. Analyze the screenshot and context. Your goal: get to https://hiring.amazon.ca/app#/jobSearch.\n\nIf you see a CAPTCHA grid ("Choose all the..."): the correct answer is ALWAYS exactly 5 images. Use ACTION: CLICK_BUTTON | Confirm after selecting.\n\nProvide:\n1. DIAGNOSIS: one line describing what you see\n2. ACTION: exactly one of:\n   CLICK_BUTTON | button text\n   CLICK_LINK | link text\n   FILL_INPUT | css-selector | value\n   NAVIGATE | url\n   RELOAD | reason\n   WAIT | seconds\n   RELOGIN | session expired\n\nRecent brain log: ' + pageContext.recentLog.join('; ') + '\nHealth score: ' + pageContext.healthScore + '/100'
                    }, {
                        role: 'user',
                        content: [
                            { type: 'image_url', image_url: { url: ssRes.dataUrl } },
                            { type: 'text', text: 'STUCK: ' + stuckState + ' for ' + pageContext.stuckFor + '\nURL: ' + pageContext.url + '\nButtons: ' + pageContext.visibleButtons.join(', ') + '\nInputs: ' + JSON.stringify(pageContext.visibleInputs) + '\nPage: ' + pageContext.bodySnippet }
                        ]
                    }]
                })
            });
            clearTimeout(tmout);
            var gData = await gResp.json();
            var aiText = (gData.choices && gData.choices[0] && gData.choices[0].message && gData.choices[0].message.content || '').trim();
            logAction('ai', 'AI response: ' + aiText.slice(0, 150));
            _executeAIAction(aiText);
        } catch(e) {
            logAction('ai', 'AI call failed: ' + e.message, false);
            window.location.reload();
        }
    }


    function _executeAIAction(response) {
        var actionMatch = response.match(/ACTION:\s*(CLICK_BUTTON|CLICK_LINK|FILL_INPUT|NAVIGATE|RELOAD|WAIT|RELOGIN)\s*\|\s*(.*)/i);
        if (!actionMatch) {
            logAction('ai', 'Could not parse AI response', false);
            window.location.reload();
            return;
        }
        var actionType = actionMatch[1].toUpperCase();
        var actionParam = actionMatch[2].trim();

        switch (actionType) {
            case 'CLICK_BUTTON':
                var btns = document.querySelectorAll('button, [role="button"], input[type="submit"]');
                var clicked = false;
                for (var i = 0; i < btns.length; i++) {
                    if ((btns[i].textContent || '').trim().toLowerCase().includes(actionParam.toLowerCase())) {
                        btns[i].click(); clicked = true;
                        logAction('ai', 'Clicked: ' + actionParam, true);
                        break;
                    }
                }
                if (!clicked) logAction('ai', 'Button not found: ' + actionParam, false);
                break;
            case 'CLICK_LINK':
                var links = document.querySelectorAll('a, [role="link"]');
                for (var j = 0; j < links.length; j++) {
                    if ((links[j].textContent || '').trim().toLowerCase().includes(actionParam.toLowerCase())) {
                        links[j].click();
                        logAction('ai', 'Clicked link: ' + actionParam, true);
                        break;
                    }
                }
                break;
            case 'FILL_INPUT':
                var parts = actionParam.split('|').map(function(s) { return s.trim(); });
                if (parts.length >= 2) {
                    var el = document.querySelector(parts[0]);
                    if (el) {
                        var ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                        ns.call(el, parts[1]);
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        logAction('ai', 'Filled input', true);
                    }
                }
                break;
            case 'NAVIGATE':
                logAction('ai', 'Navigating to: ' + actionParam, true);
                window.location.href = actionParam;
                break;
            case 'RELOAD':
                logAction('ai', 'Reloading: ' + actionParam, true);
                window.location.reload();
                break;
            case 'RELOGIN':
                logAction('ai', 'AI says session expired — re-logging in', true);
                chrome.runtime.sendMessage({ action: 'reloginInNewTab' });
                setTimeout(function() { window.location.href = 'https://hiring.amazon.ca/app#/jobSearch'; }, 30000);
                break;
            case 'WAIT':
                var sec = parseInt(actionParam) || 5;
                logAction('ai', 'Waiting ' + sec + 's', true);
                setTimeout(function() { _actionCount = 0; _aiEscalated = false; }, sec * 1000);
                break;
        }
        // Record in recovery memory
        _recordRecovery(_currentState, actionType + ':' + actionParam);
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // FEATURE 6: MULTI-TAB AWARENESS
    // ═══════════════════════════════════════════════════════════════════════════
    var _reloginStartedAt = 0;
    var _reloginMaxWait = 150000; // 2.5 min max for re-login tab

    function checkReloginTab() {
        chrome.storage.local.get(['__reloginTabId', '__brain_relogin_ts'], function(d) {
            if (!d.__reloginTabId) return;
            var startTs = d.__brain_relogin_ts || 0;
            if (!startTs) {
                // Mark when we first saw the re-login tab
                chrome.storage.local.set({ '__brain_relogin_ts': Date.now() });
                return;
            }
            var elapsed = Date.now() - startTs;
            if (elapsed > _reloginMaxWait) {
                // Re-login tab is stuck > 2.5 min — kill it and try direct login
                logAction('multi-tab', 'Re-login tab stuck for ' + Math.round(elapsed/1000) + 's — killing it');
                chrome.runtime.sendMessage({ action: 'getTabId' }, function(resp) {
                    // Can't close from content script — just clear the flag
                    chrome.storage.local.remove(['__reloginTabId', '__brain_relogin_ts']);
                    // Force a fresh re-login attempt
                    setTimeout(function() {
                        chrome.runtime.sendMessage({ action: 'reloginInNewTab' });
                        chrome.storage.local.set({ '__brain_relogin_ts': Date.now() });
                    }, 2000);
                });
            }
        });
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // FEATURE 7: AUTO-EXPAND SEARCH
    // ═══════════════════════════════════════════════════════════════════════════
    var _zeroShiftsSince = 0;       // timestamp of when 0-shift streak began
    var _searchExpanded = false;
    var _originalDistance = null;
    var _expandAfterMs = 30 * 60 * 1000;  // 30 minutes of 0 shifts

    function checkAutoExpand() {
        if (_currentState !== 'JOBSEARCH_SCANNING') return;

        var storeEl = document.getElementById('__ss_token_store');
        if (!storeEl) return;
        var jobs = parseInt(storeEl.getAttribute('data-jobs') || '0');

        if (jobs > 0) {
            // Jobs found — reset expand timer
            _zeroShiftsSince = 0;
            if (_searchExpanded) {
                // Revert to original search radius
                logAction('expand', 'Jobs found! Reverting to original search radius');
                if (_originalDistance !== null) {
                    chrome.storage.local.set({ 'distance': _originalDistance });
                }
                _searchExpanded = false;
            }
            return;
        }

        // 0 shifts
        if (!_zeroShiftsSince) _zeroShiftsSince = Date.now();
        var zeroFor = Date.now() - _zeroShiftsSince;

        if (zeroFor > _expandAfterMs && !_searchExpanded) {
            logAction('expand', '0 shifts for ' + Math.round(zeroFor/60000) + ' min — expanding search');
            _searchExpanded = true;
            // Save original and expand
            chrome.storage.local.get(['distance'], function(d) {
                _originalDistance = d.distance || 50;
                var expanded = Math.min(200, _originalDistance * 2); // Double radius, max 200km
                chrome.storage.local.set({ 'distance': expanded });
                logAction('expand', 'Radius: ' + _originalDistance + 'km → ' + expanded + 'km');
            });
        }
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // FEATURE 8: NOTIFICATION DASHBOARD — Toast + health in ring label
    // ═══════════════════════════════════════════════════════════════════════════
    var _lastToastTs = 0;

    function brainToast(html, duration) {
        if (Date.now() - _lastToastTs < 10000) return; // max 1 toast per 10s
        _lastToastTs = Date.now();
        if (typeof Swal === 'undefined') return;
        Swal.fire({
            toast: true,
            position: 'top-end',
            timer: duration || 4000,
            showConfirmButton: false,
            timerProgressBar: true,
            background: 'rgba(8,8,25,0.93)',
            html: '<div style="font-size:12px;font-family:sans-serif;color:rgba(199,210,254,0.9);">🧠 ' + html + '</div>'
        });
    }

    function updateRingWithHealth() {
        var lbl = document.getElementById('ss-lbl');
        if (!lbl) return;
        var ring = document.getElementById('ss-ring');
        if (!ring || ring.style.display === 'none') return;

        // Only update if currently showing a neutral/ok state
        var currentText = lbl.textContent || '';
        if (/Active|Job Checking|0 shifts/i.test(currentText)) {
            var h = _health.score;
            var emoji = h >= 80 ? '✅' : h >= 50 ? '⚡' : '⚠️';
            lbl.textContent = 'Active - 0 shifts ' + emoji + ' ' + h;
        }
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // FEATURE 9: RECOVERY MEMORY — Remember what worked
    // ═══════════════════════════════════════════════════════════════════════════
    var _recoveryMemory = {}; // { state: { action: 'type:param', successCount: n } }
    var _memoryLoaded = false;

    function _recordRecovery(state, actionStr) {
        if (!_recoveryMemory[state]) _recoveryMemory[state] = {};
        if (!_recoveryMemory[state][actionStr]) _recoveryMemory[state][actionStr] = { success: 0, fail: 0 };
        // We'll mark success when state transitions away (checked in setState)
        _recoveryMemory[state]._lastAction = actionStr;
        _recoveryMemory[state]._lastActionTs = Date.now();
    }

    function _markRecoverySuccess(fromState) {
        if (!_recoveryMemory[fromState] || !_recoveryMemory[fromState]._lastAction) return;
        var action = _recoveryMemory[fromState]._lastAction;
        if (_recoveryMemory[fromState][action]) {
            _recoveryMemory[fromState][action].success++;
        }
        // Save to storage every time we have a success
        chrome.storage.local.set({ '__brain_recovery': _recoveryMemory });
    }

    function getBestRecoveryAction(state) {
        if (!_recoveryMemory[state]) return null;
        var best = null, bestScore = -1;
        for (var key in _recoveryMemory[state]) {
            if (key.startsWith('_')) continue; // skip internal keys
            var entry = _recoveryMemory[state][key];
            var score = entry.success - entry.fail;
            if (score > bestScore) { bestScore = score; best = key; }
        }
        return best; // e.g. "CLICK_BUTTON:Search all jobs"
    }

    // Load saved recovery memory
    chrome.storage.local.get(['__brain_recovery'], function(d) {
        if (d['__brain_recovery']) { _recoveryMemory = d['__brain_recovery']; _memoryLoaded = true; }
    });


    // ═══════════════════════════════════════════════════════════════════════════
    // FEATURE 10: SMART SESSION MONITOR — Only re-login when session ACTUALLY dies
    // ═══════════════════════════════════════════════════════════════════════════
    // Instead of blindly re-logging every 35/40 min, we CONTINUOUSLY check if
    // the session is alive by monitoring:
    //  - Fresh 200 responses from API (intercepts are happening)
    //  - No 403 errors
    //  - Page not showing "Problem loading" error
    // If session is alive → do nothing, keep scanning.
    // If session dies → re-login immediately.
    var _lastSessionCheck = 0;
    var _SESSION_CHECK_INTERVAL = 8000; // Check every 8 seconds (was 15s — faster detection)
    var _consecutiveStaleChecks = 0;
    var _reloginInProgress = false;

    function checkSessionAlive() {
        if (_currentState !== 'JOBSEARCH_SCANNING') return;
        if (_reloginInProgress) return;
        if (Date.now() - _lastSessionCheck < _SESSION_CHECK_INTERVAL) return;
        _lastSessionCheck = Date.now();

        // Check 1: Is intercept data fresh?
        var storeEl = document.getElementById('__ss_token_store');
        var lastTs = storeEl ? parseInt(storeEl.getAttribute('data-ts') || '0') : 0;
        var staleness = lastTs > 0 ? (Date.now() - lastTs) : 999999;
        var isFresh = staleness < 15000; // Fresh if last intercept was < 15s ago

        // Check 2: Is the page showing an error?
        var bodyText = (document.body && document.body.innerText) || '';
        var hasError = /problem loading page|server didn't respond|try refreshing/i.test(bodyText);

        // ── Session is ALIVE ─────────────────────────────────────────────────
        if (isFresh && !hasError) {
            _consecutiveStaleChecks = 0;
            return; // All good, keep scanning
        }

        // ── Session might be dying ───────────────────────────────────────────
        _consecutiveStaleChecks++;

        // First stale check: just try tab toggle (might be a hiccup)
        if (_consecutiveStaleChecks === 1 && !hasError) {
            logAction('session', 'Data stale (' + Math.round(staleness/1000) + 's) — trying tab toggle');
            var btns = document.querySelectorAll('button');
            var recTab = null, allTab = null;
            for (var i = 0; i < btns.length; i++) {
                var txt = btns[i].textContent.trim();
                if (txt === 'Recommended') recTab = btns[i];
                if (txt === 'All') allTab = btns[i];
            }
            if (recTab && allTab) { recTab.click(); setTimeout(function() { allTab.click(); }, 1000); }
            else if (allTab) allTab.click();
            return;
        }

        // 2+ consecutive stale checks OR page error → session is DEAD
        if (_consecutiveStaleChecks >= 2 || hasError) {
            _consecutiveStaleChecks = 0;
            _reloginInProgress = true;
            var reason = hasError ? 'page error' : 'stale for ' + Math.round(staleness/1000) + 's';
            logAction('session', '❌ Session DEAD (' + reason + ') — CLEAN SLATE RESTART');

            // HALT everything
            window['__ss_halted'] = true;
            if (window['b']) { clearInterval(window['b']); window['b'] = null; }
            recordError();

            brainToast('⛔ <b style="color:#ef4444;">Session dead — closing all tabs → fresh start in 30s...</b>', 30000);
            console.log(LOG_PREFIX, '⛔ CLEAN SLATE: Session dead, restarting everything');

            // Close all Amazon tabs, wait 30s, open fresh one
            chrome.runtime.sendMessage({ action: 'cleanSlateRestart' });
        }
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // CORE: STATE MACHINE
    // ═══════════════════════════════════════════════════════════════════════════
    var STATE_TIMEOUTS = {
        'LOGIN_PAGE': 20000, 'LOGIN_FILLING': 15000, 'WELCOME_BACK': 5000,
        'HOMEPAGE': 5000, 'CAPTCHA_BEGIN': 3000, 'CAPTCHA_GRID': 45000,
        'AUTH_VERIFY_TYPE': 15000, 'AUTH_CAPTCHA': 45000, 'AUTH_OTP': 90000,
        'REDIRECT': 15000, 'JOBSEARCH_SCANNING': null,
        'JOB_APPLYING': 30000, 'RELOGIN_BG': 180000, 'IDLE': null
    };

    var _currentState = 'IDLE';
    var _stateEnteredAt = Date.now();
    var _lastAction = null;
    var _actionCount = 0;
    var _maxActionsPerState = 3;
    var _aiEscalated = false;

    function setState(newState) {
        if (newState === _currentState) return;
        // Record timing of previous state (how long it took to transition)
        var duration = Date.now() - _stateEnteredAt;
        if (_currentState !== 'IDLE' && _currentState !== 'JOBSEARCH_SCANNING') {
            recordTiming(_currentState, duration);
        }
        // Mark recovery success if we transitioned OUT of a stuck state
        if (_actionCount > 0) _markRecoverySuccess(_currentState);

        logAction('state', _currentState + ' → ' + newState + ' (' + Math.round(duration/1000) + 's)');
        _currentState = newState;
        _stateEnteredAt = Date.now();
        _actionCount = 0;
        _aiEscalated = false;
        chrome.storage.local.set({ '__brain_state': newState, '__brain_ts': _stateEnteredAt });

        // Reset session monitor when we arrive at jobSearch
        if (newState === 'JOBSEARCH_SCANNING') {
            _consecutiveStaleChecks = 0;
            _reloginInProgress = false;
            window['__ss_halted'] = false; // Clear any halt
            sessionStorage.removeItem('__ss_halt_attempts'); // Reset escalation
        }
    }

    function stateAge() { return Date.now() - _stateEnteredAt; }


    // ── State Detection ──────────────────────────────────────────────────────
    function detectState() {
        var url = window.location.href;
        var bodyText = (document.body && document.body.innerText) || '';

        if (url.includes('auth.hiring.amazon')) {
            var captchaCount = 0;
            var imgs = document.querySelectorAll('img');
            for (var i = 0; i < imgs.length; i++) {
                var r = imgs[i].getBoundingClientRect();
                if (r.width >= 60 && r.width <= 350 && r.height >= 60 && r.height <= 350 &&
                    r.bottom > 50 && imgs[i].src && imgs[i].src.startsWith('http')) captchaCount++;
            }
            if (captchaCount >= 6 || document.querySelector('awswaf-captcha, [id*="awswaf"]') ||
                bodyText.includes('confirm you are human')) return 'AUTH_CAPTCHA';
            if (bodyText.includes('verification code has been sent') ||
                document.querySelector('input[data-test-id="input-test-id-code"]')) return 'AUTH_OTP';
            if (bodyText.includes('Where should we send your verification code')) return 'AUTH_VERIFY_TYPE';
            if (url.includes('#/login') || url.includes('/login')) {
                var isWelcome = bodyText.includes('Welcome back') || bodyText.includes('continue where you left');
                var hasSearch = false;
                var els = document.querySelectorAll('button, a');
                for (var w = 0; w < els.length; w++) { if (/search all jobs/i.test(els[w].textContent)) { hasSearch = true; break; } }
                if (isWelcome || (hasSearch && !document.querySelector('input[data-test-id="input-test-id-login"]'))) return 'WELCOME_BACK';
                var pin = document.querySelector('input[data-test-id="input-test-id-pin"]');
                if (pin) return 'LOGIN_FILLING';
                var email = document.querySelector('input[data-test-id="input-test-id-login"]');
                if (email && email.value) return 'LOGIN_FILLING';
                if (email) return 'LOGIN_PAGE';
                return 'LOGIN_PAGE';
            }
            return 'REDIRECT';
        }

        if (url.includes('hiring.amazon')) {
            // ── CAPTCHA / Human Verification page (can appear on ANY hiring.amazon page)
            var hasBeginBtn = false;
            var allPageEls = document.querySelectorAll('button, input[type="submit"], a');
            for (var cb = 0; cb < allPageEls.length; cb++) {
                if (/^begin/i.test((allPageEls[cb].textContent || '').trim())) { hasBeginBtn = true; break; }
            }
            if ((bodyText.includes('confirm you are human') || bodyText.includes('Let\u2019s confirm you are human')) && hasBeginBtn) {
                return 'CAPTCHA_BEGIN';
            }
            // CAPTCHA grid (Choose all the...)
            var captchaImgCount = 0;
            var allImgs = document.querySelectorAll('img');
            for (var ci = 0; ci < allImgs.length; ci++) {
                var cr = allImgs[ci].getBoundingClientRect();
                if (cr.width >= 70 && cr.width <= 250 && cr.height >= 70 && cr.height <= 250 && cr.top > 30) captchaImgCount++;
            }
            if (captchaImgCount >= 6 || bodyText.includes('Choose all')) {
                return 'CAPTCHA_GRID';
            }

            if (url.includes('app#/jobSearch') || url.includes('app#/jobDetail') && !url.includes('jobDetail')) return 'JOBSEARCH_SCANNING';
            if (url.includes('app#/jobDetail') || url.includes('/application/')) return 'JOB_APPLYING';
            if (url.includes('contactInformation')) return 'REDIRECT';
            if (url.includes('#/login')) {
                var isW = bodyText.includes('Welcome back') || bodyText.includes('continue where you left');
                var hasS = false;
                var els2 = document.querySelectorAll('button, a');
                for (var w2 = 0; w2 < els2.length; w2++) { if (/search all jobs/i.test(els2[w2].textContent)) { hasS = true; break; } }
                if (isW || hasS) return 'WELCOME_BACK';
                // Check if actual login form exists — if not, it's the homepage in disguise
                var hasLoginForm = !!document.querySelector('input[data-test-id="input-test-id-login"]');
                var hasPinForm = !!document.querySelector('input[data-test-id="input-test-id-pin"]');
                var hasHomepageContent = bodyText.includes('Ready to earn') || bodyText.includes('Find jobs in Canada') || bodyText.includes('Hourly opportunities');
                if (!hasLoginForm && !hasPinForm && hasHomepageContent) return 'HOMEPAGE';
                return 'LOGIN_PAGE';
            }
            // Homepage (not logged in) — detect by "Find jobs" button or no app# in URL
            if (!url.includes('app#') && !url.includes('#/login')) {
                return 'HOMEPAGE';
            }
            return 'REDIRECT';
        }
        return 'IDLE';
    }


    // ── Corrective Actions ───────────────────────────────────────────────────
    function fixStuckState(state) {
        _actionCount++;
        _lastAction = Date.now();
        var age = Math.round(stateAge() / 1000);

        // Check if primary fix keeps failing — use alternative
        var primaryFix = state; // same as state name for tracking
        if (shouldSkipFix(state, primaryFix)) {
            logAction('fix', 'Primary fix for ' + state + ' keeps failing — using alternative');
            var alt = getAlternativeFix(state);
            if (alt === 'reload') { window.location.reload(); recordFixResult(state, 'alt_reload', true); return; }
            if (alt === 'navigate_job') { window.location.href = 'https://hiring.amazon.ca/app#/jobSearch'; return; }
        }

        // Check recovery memory for a known-good fix
        var remembered = getBestRecoveryAction(state);
        if (remembered && _actionCount === 1) {
            logAction('fix', 'Using remembered fix: ' + remembered);
            _executeAIAction('ACTION: ' + remembered.replace(':', ' | '));
            return;
        }

        // Escalate to AI after max attempts
        if (_actionCount > _maxActionsPerState) {
            if (!_aiEscalated) { _aiEscalated = true; _askAI(state); }
            else { logAction('fix', 'Last resort reload'); window.location.reload(); }
            return;
        }

        logAction('fix', 'Fixing ' + state + ' (action #' + _actionCount + ', age ' + age + 's)');

        switch (state) {
            case 'CAPTCHA_BEGIN':
                // "Let's confirm you are human" with Begin button — just click Begin
                console.log(LOG_PREFIX, '🔧 Human verification page — clicking Begin');
                var beginBtns = document.querySelectorAll('button, input[type="submit"], a');
                for (var bg = 0; bg < beginBtns.length; bg++) {
                    if (/^begin/i.test((beginBtns[bg].textContent || '').trim())) {
                        beginBtns[bg].click();
                        logAction('fix', 'Clicked "Begin" on human verification page', true);
                        break;
                    }
                }
                break;

            case 'CAPTCHA_GRID':
                // CAPTCHA grid showing on main domain — trigger the same solve flow as auth.js
                // auth.js might not be loaded here, so we handle it directly via screenshot + Groq
                console.log(LOG_PREFIX, '🔧 CAPTCHA grid on main domain — triggering AI solve');
                _askAI('CAPTCHA_GRID');
                break;

            case 'HOMEPAGE':
                // On homepage, not logged in — navigate to login page
                console.log(LOG_PREFIX, '🔧 On homepage (not logged in) — redirecting to login');
                // Try clicking Sign In button first
                var signInBtn = document.querySelector('[data-test-id="topPanelSigninLink"]')
                             || [...document.querySelectorAll('a, button')].find(function(el) {
                                    return /sign.?in/i.test((el.textContent || '').trim());
                                });
                if (signInBtn) {
                    signInBtn.click();
                    logAction('fix', 'Clicked Sign In button on homepage');
                } else {
                    window.location.href = 'https://auth.hiring.amazon.ca/#/login';
                    logAction('fix', 'Navigated directly to auth login');
                }
                break;

            case 'WELCOME_BACK':
                var els = document.querySelectorAll('button, a');
                for (var w = 0; w < els.length; w++) {
                    if (/search all jobs/i.test(els[w].textContent)) { els[w].click(); recordFixResult(state, primaryFix, true); return; }
                }
                window.location.href = 'https://hiring.amazon.ca/app#/jobSearch';
                break;
            case 'LOGIN_PAGE':
                chrome.runtime.sendMessage({ action: 'activate', status: true });
                recordFixResult(state, primaryFix, null);
                break;
            case 'LOGIN_FILLING':
                var btn = document.querySelector('button[data-test-id="button-continue"]');
                if (btn) btn.click();
                else {
                    var divs = document.querySelectorAll('div[data-test-component="StencilReactRow"]');
                    for (var d = 0; d < divs.length; d++) { if (divs[d].textContent.trim() === 'Continue') { divs[d].click(); break; } }
                }
                break;
            case 'AUTH_VERIFY_TYPE':
                var radios = document.querySelectorAll('input[type="radio"], [role="radio"]');
                for (var r = 0; r < radios.length; r++) {
                    var lbl = radios[r].closest('label') || radios[r].parentElement;
                    if (lbl && lbl.textContent.toLowerCase().includes('email')) { radios[r].click(); break; }
                }
                setTimeout(function() {
                    var btns = document.querySelectorAll('button');
                    for (var b = 0; b < btns.length; b++) { if (btns[b].textContent.includes('Send verification code')) { btns[b].click(); break; } }
                }, 500);
                break;
            case 'AUTH_CAPTCHA':
                logAction('fix', 'CAPTCHA stuck — waiting for auth.js captchaWatcher');
                setTimeout(function() { if (detectState() === 'AUTH_CAPTCHA' && stateAge() > 60000) window.location.reload(); }, 15000);
                break;
            case 'AUTH_OTP':
                chrome.runtime.sendMessage({ action: 'refreshGmailTab' });
                break;
            case 'REDIRECT':
                window.location.href = 'https://hiring.amazon.ca/app#/jobSearch';
                break;
            case 'JOB_APPLYING':
                var ab = document.querySelector('button[data-test-id="jobDetailApplyButtonDesktop"]');
                var sb = document.querySelector('button[data-test-id="ScheduleCardSelectScheduleLink"]');
                if (ab) ab.click(); else if (sb) sb.click();
                else window.location.href = 'https://hiring.amazon.ca/app#/jobSearch';
                break;
            case 'JOBSEARCH_SCANNING':
                chrome.runtime.sendMessage({ action: 'activate', status: true });
                setTimeout(function() {
                    var btns = document.querySelectorAll('button');
                    for (var n = 0; n < btns.length; n++) { if (btns[n].textContent.trim() === 'All') { btns[n].click(); break; } }
                }, 2000);
                break;
            default:
                window.location.reload();
        }
    }


    // ── Scan Health Check — SMART ADAPTIVE RECOVERY ─────────────────────────
    // Strategy: minimum downtime. Try quickest fix first, escalate only if needed.
    // Level 1 (stale 15s): Just click All tab (0s downtime)
    // Level 2 (stale 30s): Reload page (3s downtime)
    // Level 3 (stale 60s or error): HALT 15s → fresh login (~30s total)
    // Level 4 (repeated failures): HALT 30s → fresh login (~45s total)
    // NEVER halt more than 30s — every second down = missed shifts
    function checkScanHealth() {
        if (_currentState !== 'JOBSEARCH_SCANNING') return;
        if (window['__ss_halted']) return; // Already halting

        // Cooldown: don't take action within 10s of last action
        if (_lastAction && (Date.now() - _lastAction < 10000)) return;

        // ── DON'T halt if jobs were recently found (user might be applying) ──
        // Only resume monitoring when user toggles extension OFF then ON
        if (window['__ss_jobs_active']) {
            return; // User is applying — don't interfere. Toggle OFF/ON to reset.
        }

        var bodyText = (document.body && document.body.innerText) || '';
        var hasPageError = /problem loading page|server didn't respond|try refreshing/i.test(bodyText);

        // Ensure "All" tab selected (instant, no downtime)
        var allTab = null, recTab = null;
        var btns = document.querySelectorAll('button');
        for (var i = 0; i < btns.length; i++) {
            var txt = btns[i].textContent.trim();
            if (txt === 'All') allTab = btns[i];
            if (txt === 'Recommended') recTab = btns[i];
        }
        if (recTab && allTab && recTab.getAttribute('aria-selected') === 'true') {
            allTab.click();
        }

        var storeEl = document.getElementById('__ss_token_store');
        if (!storeEl) return;
        var lastTs = parseInt(storeEl.getAttribute('data-ts') || '0');
        var staleness = lastTs > 0 ? (Date.now() - lastTs) : 999999;

        // ── LEVEL 1: Stale 15-30s → just click All (0s downtime) ──
        if (!hasPageError && staleness > 15000 && staleness <= 30000) {
            logAction('health', 'L1: Stale ' + Math.round(staleness/1000) + 's — clicking All');
            _lastAction = Date.now();
            if (allTab) allTab.click();
            return;
        }

        // ── LEVEL 2: Stale 30-60s → reload page (3s downtime) ──
        if (!hasPageError && staleness > 30000 && staleness <= 60000) {
            logAction('health', 'L2: Stale ' + Math.round(staleness/1000) + 's — reloading page');
            _lastAction = Date.now();
            window.location.href = 'https://hiring.amazon.ca/app#/jobSearch';
            return;
        }

        // ── LEVEL 3: Stale 60s+ OR page error → CLEAN SLATE RESTART ──
        if (hasPageError || staleness > 60000) {
            logAction('health', 'L3: ' + (hasPageError ? 'Page error' : 'Stale ' + Math.round(staleness/1000) + 's') + ' — CLEAN SLATE RESTART');
            _lastAction = Date.now();
            _reloginInProgress = true;
            recordError();

            // HALT everything
            window['__ss_halted'] = true;
            if (window['b']) { clearInterval(window['b']); window['b'] = null; }

            brainToast('⛔ <b style="color:#ef4444;">Closing all tabs → fresh start in 30s...</b>', 30000);
            console.log(LOG_PREFIX, '⛔ CLEAN SLATE: Closing all Amazon tabs → wait 30s → fresh start');

            // Tell background to close ALL Amazon tabs, wait 30s, open fresh one
            chrome.runtime.sendMessage({ action: 'cleanSlateRestart' });
            // This tab will be closed by background.js — nothing more to do here
            return;
        }

        // ── No intercepts ever after 10s → click All ──
        if (lastTs === 0 && stateAge() > 10000) {
            _lastAction = Date.now();
            if (allTab) allTab.click();
        }
    }

    // ── Popup / Blank checks ─────────────────────────────────────────────────
    function checkSignInPopup() {
        var swal = document.querySelector('.swal2-popup.swal2-show, .swal2-container.swal2-shown .swal2-popup');
        if (swal && /sign.?in again|session expired|please sign/i.test(swal.innerText || '')) {
            var ok = swal.querySelector('.swal2-confirm');
            if (ok) { ok.click(); setTimeout(function() { chrome.runtime.sendMessage({ action: 'reloginInNewTab' }); }, 800); }
            return true;
        }
        return false;
    }
    function checkBlankPage() {
        var len = (document.body && document.body.innerText || '').trim().length;
        if (len < 20 && stateAge() > 10000 && _currentState !== 'IDLE') { window.location.reload(); return true; }
        return false;
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // MAIN LOOP
    // ═══════════════════════════════════════════════════════════════════════════
    function tick() {
        // ── FULL HALT: do absolutely nothing while halted ──
        if (window['__ss_halted']) return;

        // ── Don't interfere on jobDetail/application pages (apply flow in progress) ──
        var _tickUrl = window.location.href;
        if (_tickUrl.includes('jobDetail') || _tickUrl.includes('/application/')) return;

        var swalShowing = document.querySelector('.swal2-container.swal2-shown');
        if (swalShowing && !checkSignInPopup()) return;

        // Detect state
        var detected = detectState();
        if (detected !== _currentState) setState(detected);

        // Update health score
        updateHealth();

        // Check for intercept (track for health)
        var storeEl = document.getElementById('__ss_token_store');
        if (storeEl) {
            var ts = parseInt(storeEl.getAttribute('data-ts') || '0');
            if (ts > _health.lastIntercept && ts > 0) recordIntercept();
        }

        if (checkBlankPage()) return;

        // Run all feature checks
        checkScanHealth();
        checkAutoExpand();
        checkReloginTab();
        checkSessionAlive();
        updateRingWithHealth();

        // Check state timeout (using smart timing if available)
        var timeout = getSmartTimeout(_currentState);
        if (timeout && stateAge() > timeout) fixStuckState(_currentState);
    }

    // ── Boot ─────────────────────────────────────────────────────────────────
    setTimeout(function() {
        var initial = detectState();
        setState(initial);
        logAction('state', '🧠 Brain v2 active — state: ' + initial + ' | Health: ' + updateHealth());
        setInterval(tick, POLL_INTERVAL);
    }, 3000);


    // ═══════════════════════════════════════════════════════════════════════════
    // DEBUG CONSOLE API
    // ═══════════════════════════════════════════════════════════════════════════
    window.__ss_brain = {
        // Basic status
        status: function() {
            return {
                state: _currentState,
                age: Math.round(stateAge() / 1000) + 's',
                health: _health.score + '/100',
                interceptsPerMin: _health.interceptsPerMin,
                errorsLast5Min: _health.errorsLast5Min,
                actions: _actionCount,
                aiEscalated: _aiEscalated,
                searchExpanded: _searchExpanded,
                lastAction: _lastAction ? new Date(_lastAction).toLocaleTimeString() : 'never'
            };
        },
        // Activity log
        log: function(n) {
            var entries = _activityLog.slice(-(n || 20));
            console.table(entries);
            return entries;
        },
        // Health details
        health: function() { return _health; },
        // Smart timings learned
        timings: function() { return _timings; },
        // Recovery memory
        memory: function() { return _recoveryMemory; },
        // Failure history
        failures: function() { return _failureHistory; },
        // Manual AI trigger
        askAI: function() { _askAI(_currentState); },
        // Force expand search
        expandSearch: function() { _searchExpanded = false; _zeroShiftsSince = Date.now() - _expandAfterMs - 1; checkAutoExpand(); },
        // Force session check now
        checkSession: function() { _lastSessionCheck = 0; _consecutiveStaleChecks = 0; checkSessionAlive(); },
        // Reset all brain data
        reset: function() {
            _activityLog = []; _timings = {}; _failureHistory = {}; _recoveryMemory = {};
            chrome.storage.local.remove(['__brain_timings', '__brain_recovery', '__brain_state']);
            console.log(LOG_PREFIX, '🧹 Brain reset complete');
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // DOM BRIDGE — Expose brain status to page context (MAIN world)
    // So user can check brain from normal console without switching context
    // ═══════════════════════════════════════════════════════════════════════════
    function _updateBrainBridge() {
        var el = document.getElementById('__ss_brain_status');
        if (!el) {
            el = document.createElement('div');
            el.id = '__ss_brain_status';
            el.style.display = 'none';
            document.documentElement.appendChild(el);
        }
        el.setAttribute('data-state', _currentState);
        el.setAttribute('data-health', _health.score.toString());
        el.setAttribute('data-age', Math.round(stateAge() / 1000).toString());
        el.setAttribute('data-actions', _actionCount.toString());
        el.setAttribute('data-halted', (!!window['__ss_halted']).toString());
        el.setAttribute('data-ts', Date.now().toString());
    }
    // Update bridge every tick
    setInterval(_updateBrainBridge, 4000);

    } catch(e) {
        console.error('[brain] FATAL ERROR during initialization:', e.message, e.stack);
    }

})();
