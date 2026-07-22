/**
 * brain.js — Centralized Watchdog / State Machine Monitor
 * v8.9.5.4 — ShiftSniper "Brain"
 *
 * Runs on ALL hiring.amazon.* and auth.hiring.amazon.* pages.
 * Monitors the entire extension lifecycle and self-heals stuck states.
 *
 * STATE MACHINE:
 *   IDLE                → Extension loaded but not active
 *   LOGIN_PAGE          → On auth login page, waiting for form to appear
 *   LOGIN_FILLING       → Auto-filling email/PIN
 *   AUTH_VERIFY_TYPE    → "Where to send code?" page
 *   AUTH_CAPTCHA        → CAPTCHA puzzle showing
 *   AUTH_OTP            → Waiting for / filling OTP code
 *   REDIRECT            → Navigating between pages (post-login, etc.)
 *   JOBSEARCH_SCANNING  → On jobSearch, scan loop active
 *   JOB_APPLYING        → Found a job, auto-apply in progress
 *   RELOGIN_BG          → Background tab re-login (this tab is the bg tab)
 *
 * Each state has a MAX DURATION. If exceeded → corrective action.
 */
(function() {
    'use strict';

    // ── Config ───────────────────────────────────────────────────────────────
    var POLL_INTERVAL = 4000;  // Check state every 4 seconds
    var LOG_PREFIX = '[brain]';

    // Max time allowed in each state before intervention (milliseconds)
    var STATE_TIMEOUTS = {
        'LOGIN_PAGE':       20000,   // 20s — page should load and fill quickly
        'LOGIN_FILLING':    15000,   // 15s — filling email/PIN shouldn't take long
        'WELCOME_BACK':     5000,    // 5s — just need to click "Search all jobs"
        'AUTH_VERIFY_TYPE': 15000,   // 15s — should auto-select email and click Send
        'AUTH_CAPTCHA':     45000,   // 45s — Groq call + click + verify takes time
        'AUTH_OTP':         90000,   // 90s — waiting for email can be slow
        'REDIRECT':         15000,   // 15s — page transitions
        'JOBSEARCH_SCANNING': null,  // No timeout — this is the target state
        'JOB_APPLYING':     30000,   // 30s — apply flow
        'RELOGIN_BG':       180000,  // 3 min — full re-login in background
        'IDLE':             null     // No timeout — user hasn't activated
    };

    // ── State tracking ───────────────────────────────────────────────────────
    var _currentState = 'IDLE';
    var _stateEnteredAt = Date.now();
    var _lastAction = null;
    var _actionCount = 0;        // How many corrective actions taken in this state
    var _maxActionsPerState = 3; // Don't hammer — max 3 fixes per state then escalate to AI
    var _aiEscalated = false;    // Whether AI has already been called for this state

    function setState(newState) {
        if (newState === _currentState) return;
        console.log(LOG_PREFIX, _currentState, '→', newState);
        _currentState = newState;
        _stateEnteredAt = Date.now();
        _actionCount = 0;
        _aiEscalated = false;
        // Persist state for cross-tab visibility (background tab can read it)
        chrome.storage.local.set({ '__brain_state': newState, '__brain_ts': _stateEnteredAt });
    }

    function stateAge() {
        return Date.now() - _stateEnteredAt;
    }

    // ── State Detection — figures out WHERE we are right now ─────────────────
    function detectState() {
        var url = window.location.href;
        var bodyText = (document.body && document.body.innerText) || '';

        // ── Check if this is a re-login background tab
        // (handled by checking __reloginTabId match — but we can't easily get our tab ID here,
        //  so we check if the page is NOT focused/visible as a proxy)
        // Actually, let's just detect by the state of things:

        // ── Auth pages ──────────────────────────────────────────────────────
        if (url.includes('auth.hiring.amazon')) {
            // CAPTCHA visible?
            var captchaImgs = document.querySelectorAll('img');
            var captchaCount = 0;
            for (var i = 0; i < captchaImgs.length; i++) {
                var r = captchaImgs[i].getBoundingClientRect();
                if (r.width >= 60 && r.width <= 350 && r.height >= 60 && r.height <= 350 &&
                    r.bottom > 50 && captchaImgs[i].src && captchaImgs[i].src.startsWith('http')) {
                    captchaCount++;
                }
            }
            var hasAwsWaf = !!document.querySelector('awswaf-captcha, [id*="awswaf"], [class*="awswaf"]');
            if (captchaCount >= 6 || hasAwsWaf || bodyText.includes('confirm you are human')) {
                return 'AUTH_CAPTCHA';
            }

            // OTP page?
            if (bodyText.includes('verification code has been sent') ||
                document.querySelector('input[data-test-id="input-test-id-code"]') ||
                document.querySelector('input[maxlength="6"]')) {
                return 'AUTH_OTP';
            }

            // Verify type page?
            if (bodyText.includes('Where should we send your verification code')) {
                return 'AUTH_VERIFY_TYPE';
            }

            // Login page with form?
            if (url.includes('#/login') || url.includes('/login')) {
                // v8.9.5.5: "Welcome back" page — already logged in, just needs "Search all jobs" click
                var bodyText2 = (document.body && document.body.innerText) || '';
                var isWelcomeBack = bodyText2.includes('Welcome back') || bodyText2.includes('continue where you left');
                var hasSearchBtn = false;
                var allEls = document.querySelectorAll('button, a');
                for (var wb = 0; wb < allEls.length; wb++) {
                    if (/search all jobs/i.test(allEls[wb].textContent)) { hasSearchBtn = true; break; }
                }
                if (isWelcomeBack || (hasSearchBtn && !document.querySelector('input[data-test-id="input-test-id-login"]'))) {
                    return 'WELCOME_BACK';
                }

                var emailInput = document.querySelector('input[data-test-id="input-test-id-login"]');
                var pinInput = document.querySelector('input[data-test-id="input-test-id-pin"]');
                if (pinInput) return 'LOGIN_FILLING'; // On PIN step
                if (emailInput) {
                    if (emailInput.value) return 'LOGIN_FILLING'; // Already typed
                    return 'LOGIN_PAGE'; // Empty form waiting
                }
                return 'LOGIN_PAGE';
            }

            // Some other auth page — probably transitioning
            return 'REDIRECT';
        }

        // ── Main hiring pages ───────────────────────────────────────────────
        if (url.includes('hiring.amazon')) {
            // On jobSearch with scan ring visible = scanning
            if (url.includes('app#/jobSearch')) {
                var ring = document.getElementById('ss-ring');
                if (ring && ring.style.display !== 'none') {
                    return 'JOBSEARCH_SCANNING';
                }
                // On jobSearch but ring not showing — might still be activating
                return 'JOBSEARCH_SCANNING'; // Close enough — the real check is the ring
            }

            // On job detail page = applying
            if (url.includes('app#/jobDetail') || url.includes('/application/')) {
                return 'JOB_APPLYING';
            }

            // On contactInformation = redirect/setup step
            if (url.includes('contactInformation')) {
                return 'REDIRECT';
            }

            // On login page (non-auth domain)
            if (url.includes('#/login')) {
                return 'LOGIN_PAGE';
            }

            // Homepage or other
            return 'REDIRECT';
        }

        return 'IDLE';
    }

    // ── Corrective Actions — what to do when stuck ──────────────────────────
    function fixStuckState(state) {
        _actionCount++;
        _lastAction = Date.now();
        var age = Math.round(stateAge() / 1000);

        console.log(LOG_PREFIX, '⚠️ STUCK in', state, 'for', age + 's — action #' + _actionCount);

        // If we've tried too many times in this state, escalate to AI
        if (_actionCount > _maxActionsPerState) {
            if (!_aiEscalated) {
                console.log(LOG_PREFIX, '🤖 Max actions reached — escalating to AI');
                _aiEscalated = true;
                _askAI(state);
            } else {
                // AI already tried — last resort: reload
                console.log(LOG_PREFIX, '🔄 AI already tried — last resort reload');
                window.location.reload();
            }
            return;
        }

        switch (state) {
            case 'WELCOME_BACK':
                // Post-login "Welcome back" page — click "Search all jobs"
                console.log(LOG_PREFIX, '🔧 Welcome back page — clicking "Search all jobs"');
                var allEls = document.querySelectorAll('button, a');
                var clicked = false;
                for (var wb = 0; wb < allEls.length; wb++) {
                    if (/search all jobs/i.test(allEls[wb].textContent)) {
                        allEls[wb].click();
                        clicked = true;
                        console.log(LOG_PREFIX, '✅ Clicked "Search all jobs"');
                        break;
                    }
                }
                if (!clicked) {
                    // Fallback: navigate directly
                    console.log(LOG_PREFIX, '🔧 Button not found — navigating directly to jobSearch');
                    window.location.href = 'https://hiring.amazon.ca/app#/jobSearch';
                }
                break;

            case 'LOGIN_PAGE':
                // Login form not being filled — trigger C() via activate message
                console.log(LOG_PREFIX, '🔧 Triggering login fill via activate');
                chrome.runtime.sendMessage({ action: 'activate', status: true });
                break;

            case 'LOGIN_FILLING':
                // Stuck on filling — maybe PIN didn't submit. Try clicking Continue.
                console.log(LOG_PREFIX, '🔧 Clicking Continue button');
                var continueBtn = document.querySelector('button[data-test-id="button-continue"]');
                if (continueBtn) {
                    continueBtn.click();
                } else {
                    // Maybe the "Continue" div-button
                    var divBtns = document.querySelectorAll('div[data-test-component="StencilReactRow"]');
                    for (var i = 0; i < divBtns.length; i++) {
                        if (divBtns[i].textContent.trim() === 'Continue') {
                            divBtns[i].click();
                            break;
                        }
                    }
                }
                break;

            case 'AUTH_VERIFY_TYPE':
                // Stuck on "Where to send code" — try clicking email radio + send
                console.log(LOG_PREFIX, '🔧 Selecting Email and clicking Send');
                var radios = document.querySelectorAll('input[type="radio"], [role="radio"]');
                for (var j = 0; j < radios.length; j++) {
                    var label = radios[j].closest('label') || radios[j].parentElement;
                    if (label && label.textContent.toLowerCase().includes('email')) {
                        radios[j].click();
                        break;
                    }
                }
                setTimeout(function() {
                    var btns = document.querySelectorAll('button');
                    for (var k = 0; k < btns.length; k++) {
                        if (btns[k].textContent.includes('Send verification code')) {
                            btns[k].click();
                            break;
                        }
                    }
                }, 500);
                break;

            case 'AUTH_CAPTCHA':
                // CAPTCHA stuck — Groq might have failed. If no Groq key, nothing we can do.
                // Otherwise, the captchaWatcher in auth.js should retry.
                // Our fix: check if captchaWatcher might be dead, restart detection
                console.log(LOG_PREFIX, '🔧 CAPTCHA stuck — will reload if no progress in 15s');
                setTimeout(function() {
                    if (detectState() === 'AUTH_CAPTCHA' && stateAge() > 60000) {
                        console.log(LOG_PREFIX, '🔄 CAPTCHA still stuck after 60s — reloading');
                        window.location.reload();
                    }
                }, 15000);
                break;

            case 'AUTH_OTP':
                // OTP stuck — Gmail might not have the email yet.
                // Trigger another Gmail refresh
                console.log(LOG_PREFIX, '🔧 OTP stuck — refreshing Gmail tab');
                chrome.runtime.sendMessage({ action: 'refreshGmailTab' });
                break;

            case 'REDIRECT':
                // Stuck in transition — figure out where to go
                console.log(LOG_PREFIX, '🔧 Stuck in redirect — navigating to jobSearch');
                var url = window.location.href;
                if (url.includes('contactInformation')) {
                    // Try clicking Save then redirect
                    var saveBtn = document.querySelector('button');
                    var found = false;
                    var allBtns = document.querySelectorAll('button');
                    for (var m = 0; m < allBtns.length; m++) {
                        if (/^save$/i.test(allBtns[m].textContent.trim())) {
                            allBtns[m].click();
                            found = true;
                            break;
                        }
                    }
                    setTimeout(function() {
                        window.location.href = 'https://hiring.amazon.ca/app#/jobSearch';
                    }, found ? 1500 : 500);
                } else if (url.includes('hiring.amazon') && !url.includes('auth.')) {
                    window.location.href = 'https://hiring.amazon.ca/app#/jobSearch';
                } else {
                    // On auth domain but not on a recognized step — reload
                    window.location.reload();
                }
                break;

            case 'JOB_APPLYING':
                // Apply flow stuck — might be on a page that needs a click
                console.log(LOG_PREFIX, '🔧 Apply stuck — checking for buttons');
                var applyBtn = document.querySelector('button[data-test-id="jobDetailApplyButtonDesktop"]');
                var schedBtn = document.querySelector('button[data-test-id="ScheduleCardSelectScheduleLink"]');
                var selectBtn = document.querySelector('button[data-test-id="jobDetailSelectScheduleButton"]');
                if (applyBtn) { applyBtn.click(); }
                else if (schedBtn) { schedBtn.click(); }
                else if (selectBtn) { selectBtn.click(); }
                else {
                    // Nothing clickable — go back to scanning
                    console.log(LOG_PREFIX, '🔧 No apply buttons found — returning to jobSearch');
                    window.location.href = 'https://hiring.amazon.ca/app#/jobSearch';
                }
                break;

            case 'JOBSEARCH_SCANNING':
                // This shouldn't timeout (null), but if scan ring is red/gone, restart
                console.log(LOG_PREFIX, '🔧 Scan might be dead — sending activate');
                chrome.runtime.sendMessage({ action: 'activate', status: true });
                // Also click "All" tab in case it's on Recommended
                setTimeout(function() {
                    var btns = document.querySelectorAll('button');
                    for (var n = 0; n < btns.length; n++) {
                        if (btns[n].textContent.trim() === 'All') {
                            btns[n].click();
                            break;
                        }
                    }
                }, 2000);
                break;

            default:
                console.log(LOG_PREFIX, '🔧 Unknown state — reloading');
                window.location.reload();
        }
    }

    // ── Additional check: is scan loop healthy? ─────────────────────────────
    function checkScanHealth() {
        if (_currentState !== 'JOBSEARCH_SCANNING') return;

        var storeEl = document.getElementById('__ss_token_store');
        if (!storeEl) return; // tokenCapture.js not loaded yet

        var lastTs = parseInt(storeEl.getAttribute('data-ts') || '0');
        var staleness = Date.now() - lastTs;

        // If no intercept for 30+ seconds while on jobSearch, something is wrong
        if (lastTs > 0 && staleness > 30000) {
            console.log(LOG_PREFIX, '⚠️ Data stale for', Math.round(staleness/1000) + 's — triggering refresh');
            // Click Recommended then All to trigger new API call
            var btns = document.querySelectorAll('button');
            var recTab = null, allTab = null;
            for (var i = 0; i < btns.length; i++) {
                var txt = btns[i].textContent.trim();
                if (txt === 'Recommended') recTab = btns[i];
                if (txt === 'All') allTab = btns[i];
            }
            if (recTab && allTab) {
                recTab.click();
                setTimeout(function() { allTab.click(); }, 1000);
            } else if (allTab) {
                // Just re-click All to force a re-fetch
                allTab.click();
            }
        }

        // If no intercept has EVER happened after 15s on jobSearch, click All tab
        if (lastTs === 0 && stateAge() > 15000) {
            console.log(LOG_PREFIX, '⚠️ No intercepts ever — clicking All tab');
            var btns2 = document.querySelectorAll('button');
            for (var j = 0; j < btns2.length; j++) {
                if (btns2[j].textContent.trim() === 'All') {
                    btns2[j].click();
                    break;
                }
            }
        }
    }

    // ── Additional check: "Please sign-in again" popup ──────────────────────
    function checkSignInPopup() {
        // SweetAlert popup
        var swalPopup = document.querySelector('.swal2-popup.swal2-show, .swal2-container.swal2-shown .swal2-popup');
        if (swalPopup) {
            var text = swalPopup.innerText || '';
            if (/sign.?in again|session expired|please sign/i.test(text)) {
                console.log(LOG_PREFIX, '⚠️ "Sign in again" popup — auto-dismissing');
                var okBtn = swalPopup.querySelector('.swal2-confirm');
                if (okBtn) {
                    okBtn.click();
                    setTimeout(function() {
                        chrome.runtime.sendMessage({ action: 'reloginInNewTab' });
                    }, 800);
                }
                return true;
            }
        }
        return false;
    }

    // ── Additional check: blank/white page ──────────────────────────────────
    function checkBlankPage() {
        var bodyLen = (document.body && document.body.innerText || '').trim().length;
        // If page is basically empty after 10 seconds, reload
        if (bodyLen < 20 && stateAge() > 10000 && _currentState !== 'IDLE') {
            console.log(LOG_PREFIX, '⚠️ Blank page detected — reloading');
            window.location.reload();
            return true;
        }
        return false;
    }

    // ── AI Escalation — when pre-programmed fixes fail ─────────────────────
    // Takes a screenshot, sends to Groq AI with full context, gets instructions
    // on what to click/type/navigate, then executes them.
    async function _askAI(stuckState) {
        console.log(LOG_PREFIX, '🤖 AI escalation — taking screenshot...');

        // Get Groq key
        var groqKey = '';
        try {
            var data = await new Promise(function(res) {
                chrome.storage.local.get(['groq_api_key'], res);
            });
            groqKey = data.groq_api_key || '';
        } catch(e) {}

        if (!groqKey) {
            console.log(LOG_PREFIX, '🤖 No Groq key — falling back to reload');
            window.location.reload();
            return;
        }

        // Take screenshot
        var ssRes = await new Promise(function(resolve) {
            chrome.runtime.sendMessage({ action: 'takeScreenshot' }, function(r) {
                if (chrome.runtime.lastError) resolve({ error: chrome.runtime.lastError.message });
                else resolve(r || { error: 'no response' });
            });
        });

        if (ssRes.error || !ssRes.dataUrl) {
            console.log(LOG_PREFIX, '🤖 Screenshot failed — reloading');
            window.location.reload();
            return;
        }

        // Gather page context
        var pageContext = {
            url: window.location.href,
            title: document.title,
            stuckState: stuckState,
            stuckFor: Math.round(stateAge() / 1000) + 's',
            actionsAttempted: _actionCount,
            visibleButtons: [],
            visibleInputs: [],
            bodySnippet: (document.body.innerText || '').slice(0, 500)
        };

        // Collect visible buttons
        var btns = document.querySelectorAll('button, [role="button"], a[href]');
        for (var i = 0; i < Math.min(btns.length, 15); i++) {
            var txt = (btns[i].textContent || '').trim().slice(0, 50);
            if (txt) pageContext.visibleButtons.push(txt);
        }

        // Collect visible inputs
        var inputs = document.querySelectorAll('input, textarea, select');
        for (var j = 0; j < Math.min(inputs.length, 10); j++) {
            pageContext.visibleInputs.push({
                type: inputs[j].type || 'text',
                id: inputs[j].id || inputs[j].getAttribute('data-test-id') || '',
                value: inputs[j].value ? '(has value)' : '(empty)',
                placeholder: inputs[j].placeholder || ''
            });
        }

        console.log(LOG_PREFIX, '🤖 Asking Groq AI for help...', JSON.stringify(pageContext).slice(0, 200));

        // Call Groq AI
        try {
            var ctl = new AbortController();
            var timeout = setTimeout(function() { ctl.abort(); }, 20000);

            var gResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                signal: ctl.signal,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + groqKey
                },
                body: JSON.stringify({
                    model: 'qwen/qwen3.6-27b',
                    max_tokens: 400,
                    temperature: 0.1,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a browser automation assistant for an Amazon warehouse job application extension called ShiftSniper. The extension is STUCK and needs your help to proceed. Your ULTIMATE GOAL is to get to https://hiring.amazon.ca/app#/jobSearch where the extension scans for shifts.\n\nYou will see a screenshot and context about the current page. Tell me EXACTLY what action to take.\n\nRespond in this EXACT format (one action only):\nACTION: CLICK_BUTTON | text of button to click\nACTION: CLICK_LINK | text of link to click\nACTION: FILL_INPUT | selector | value to type\nACTION: NAVIGATE | full URL to go to\nACTION: RELOAD | reason\nACTION: WAIT | seconds to wait\n\nRules:\n- Only give ONE action at a time\n- Be specific about button text (exact match)\n- If you see a login form, the extension has saved credentials — suggest NAVIGATE to trigger auto-fill\n- If you see an error message, suggest how to dismiss it\n- If totally lost, suggest NAVIGATE | https://hiring.amazon.ca/app#/jobSearch'
                        },
                        {
                            role: 'user',
                            content: [
                                { type: 'image_url', image_url: { url: ssRes.dataUrl } },
                                { type: 'text', text: 'The extension is STUCK in state: ' + stuckState + ' for ' + pageContext.stuckFor + '.\n\nURL: ' + pageContext.url + '\nPage title: ' + pageContext.title + '\nVisible buttons: ' + pageContext.visibleButtons.join(', ') + '\nVisible inputs: ' + JSON.stringify(pageContext.visibleInputs) + '\nBody text (first 500 chars): ' + pageContext.bodySnippet + '\n\nWhat single action should I take to proceed toward jobSearch?' }
                            ]
                        }
                    ]
                })
            });

            clearTimeout(timeout);
            var gData = await gResp.json();
            var aiResponse = (gData.choices && gData.choices[0] && gData.choices[0].message && gData.choices[0].message.content || '').trim();
            console.log(LOG_PREFIX, '🤖 AI says:', aiResponse);

            // Parse and execute AI instruction
            _executeAIAction(aiResponse);

        } catch(e) {
            console.error(LOG_PREFIX, '🤖 AI call failed:', e.message);
            // Last resort
            window.location.reload();
        }
    }

    // ── Execute AI's instruction ─────────────────────────────────────────────
    function _executeAIAction(response) {
        // Parse the ACTION line
        var actionMatch = response.match(/ACTION:\s*(CLICK_BUTTON|CLICK_LINK|FILL_INPUT|NAVIGATE|RELOAD|WAIT)\s*\|\s*(.*)/i);
        if (!actionMatch) {
            console.log(LOG_PREFIX, '🤖 Could not parse AI response — reloading');
            window.location.reload();
            return;
        }

        var actionType = actionMatch[1].toUpperCase();
        var actionParam = actionMatch[2].trim();

        switch (actionType) {
            case 'CLICK_BUTTON':
                console.log(LOG_PREFIX, '🤖 Executing: click button "' + actionParam + '"');
                var btns = document.querySelectorAll('button, [role="button"], input[type="submit"]');
                var clicked = false;
                for (var i = 0; i < btns.length; i++) {
                    var btnText = (btns[i].textContent || btns[i].value || '').trim();
                    if (btnText.toLowerCase().includes(actionParam.toLowerCase())) {
                        btns[i].click();
                        clicked = true;
                        console.log(LOG_PREFIX, '🤖 ✅ Clicked button:', btnText);
                        break;
                    }
                }
                if (!clicked) {
                    console.log(LOG_PREFIX, '🤖 ❌ Button not found:', actionParam);
                }
                break;

            case 'CLICK_LINK':
                console.log(LOG_PREFIX, '🤖 Executing: click link "' + actionParam + '"');
                var links = document.querySelectorAll('a, [role="link"]');
                for (var j = 0; j < links.length; j++) {
                    if ((links[j].textContent || '').trim().toLowerCase().includes(actionParam.toLowerCase())) {
                        links[j].click();
                        console.log(LOG_PREFIX, '🤖 ✅ Clicked link');
                        break;
                    }
                }
                break;

            case 'FILL_INPUT':
                var parts = actionParam.split('|').map(function(s) { return s.trim(); });
                if (parts.length >= 2) {
                    var selector = parts[0];
                    var value = parts[1];
                    console.log(LOG_PREFIX, '🤖 Executing: fill "' + selector + '" with value');
                    var input = document.querySelector(selector);
                    if (input) {
                        var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                        nativeSetter.call(input, value);
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        console.log(LOG_PREFIX, '🤖 ✅ Filled input');
                    } else {
                        console.log(LOG_PREFIX, '🤖 ❌ Input not found:', selector);
                    }
                }
                break;

            case 'NAVIGATE':
                console.log(LOG_PREFIX, '🤖 Executing: navigate to', actionParam);
                window.location.href = actionParam;
                break;

            case 'RELOAD':
                console.log(LOG_PREFIX, '🤖 Executing: reload —', actionParam);
                window.location.reload();
                break;

            case 'WAIT':
                var waitSec = parseInt(actionParam) || 5;
                console.log(LOG_PREFIX, '🤖 Executing: wait', waitSec + 's');
                // After waiting, reset action count so brain retries
                setTimeout(function() {
                    _actionCount = 0;
                    _aiEscalated = false;
                    console.log(LOG_PREFIX, '🤖 Wait complete — resuming monitoring');
                }, waitSec * 1000);
                break;

            default:
                console.log(LOG_PREFIX, '🤖 Unknown action type:', actionType);
                window.location.reload();
        }
    }

    // ── Main loop ────────────────────────────────────────────────────────────
    function tick() {
        // Skip if Swal dialog is showing (don't interfere with user interaction)
        var swalShowing = document.querySelector('.swal2-container.swal2-shown');
        if (swalShowing && !checkSignInPopup()) return;

        // Detect current state
        var detected = detectState();
        if (detected !== _currentState) {
            setState(detected);
        }

        // Check for blank page
        if (checkBlankPage()) return;

        // Check scan health specifically
        checkScanHealth();

        // Check if we've exceeded the timeout for current state
        var timeout = STATE_TIMEOUTS[_currentState];
        if (timeout && stateAge() > timeout) {
            fixStuckState(_currentState);
        }
    }

    // ── Boot ─────────────────────────────────────────────────────────────────
    // Wait 3s before starting (let fetch.js and auth.js initialize first)
    setTimeout(function() {
        var initialState = detectState();
        setState(initialState);
        console.log(LOG_PREFIX, '🧠 Brain active — initial state:', initialState);

        // Run tick every POLL_INTERVAL
        setInterval(tick, POLL_INTERVAL);
    }, 3000);

    // ── Expose for debugging ─────────────────────────────────────────────────
    window.__ss_brain = {
        getState: function() { return _currentState; },
        getAge: function() { return Math.round(stateAge() / 1000) + 's'; },
        getActions: function() { return _actionCount; },
        aiEscalated: function() { return _aiEscalated; },
        status: function() {
            return {
                state: _currentState,
                age: Math.round(stateAge() / 1000) + 's',
                actions: _actionCount,
                aiEscalated: _aiEscalated,
                lastAction: _lastAction ? new Date(_lastAction).toLocaleTimeString() : 'never'
            };
        },
        // Manual trigger: force AI to analyze current screen
        askAI: function() { _askAI(_currentState); }
    };

})();
