chrome['runtime']['onConnect']['addListener'](function (a) {
    a['onMessage']['addListener'](async function (b) {
        let c = new Object();
        c['action'] = b['action'];
        if (b['action'] == 'fetch_info') {
            let {__un: d} = await chrome['storage']['local']['get']('__un'), {__pw: e} = await chrome['storage']['local']['get']('__pw'), {candidateID: f} = await chrome['storage']['local']['get']('candidateID'), {selectedCity: g} = await chrome['storage']['local']['get']('selectedCity'), {lat: h} = await chrome['storage']['local']['get']('lat'), {lng: i} = await chrome['storage']['local']['get']('lng'), {distance: j} = await chrome['storage']['local']['get']('distance'), {jobType: k} = await chrome['storage']['local']['get']('jobType'), {__ap: l} = await chrome['storage']['local']['get']('__ap'), m = await new Promise(n => chrome['management']['getSelf'](o => n(o['version'])));
            c['data'] = {
                '$username': d,
                '$password': e,
                '$candidateID': f,
                '$selectedCity': g,
                '$lat': h,
                '$lng': i,
                '$distance': j,
                '$jobType': k,
                '$active': l,
                '$version': m
            };
        }
        a['postMessage'](c);
    });
}), chrome['runtime']['onInstalled']['addListener'](async ({reason: a}) => {
    chrome['action']['disable'](), chrome['declarativeContent']['onPageChanged']['removeRules'](undefined, () => {
        let b = {
                'conditions': [new chrome['declarativeContent']['PageStateMatcher']({ 'pageUrl': {} })],
                'actions': [new chrome['declarativeContent']['ShowAction']()]
            }, c = [b];
        chrome['declarativeContent']['onPageChanged']['addRules'](c);
    }), a === 'install' && (await chrome['storage']['local']['set']({
        '__ap': !![],  // Auto-activate on fresh install
        '__cr': 0x0,
        '__fq': 0.5,
        '__gp': 0x3,
        '__tdgp': 0x3
    }), chrome['tabs']['create']({ 'url': 'https://hiring.amazon.ca/app#/jobSearch' })), chrome['storage']['onChanged']['addListener']((b, c) => {
        if (c === 'local' && b['candidateId']) {
            const d = b['candidateId']['newValue'];
        }
    });
}), chrome['tabs']['onUpdated']['addListener']((a, b, c) => {
    b['status'] === 'complete' && ((c['url']['includes']('hiring.amazon.ca/application/us/') || c['url']['includes']('hiring.amazon.com/application/us/')) && c['url']['includes']('jobId=') && chrome['scripting']['executeScript']({
        'target': { 'tabId': a },
        'files': ['Createapp.js']
    }, () => {
    }));
}), chrome['runtime']['onMessage']['addListener']((a, b, c) => {
    // ── CAPTCHA solver via Debugger API ─────────────────────────────────────────
    // Uses screenshot + Groq to identify positions, then debugger for real mouse events
    // This is the ONLY reliable way to click inside cross-origin iframes (AWS WAF CAPTCHA)
    // ── Fast handler 1: just take screenshot and return dataUrl ─────────────
    if (a['action'] === 'takeScreenshot') {
        const _wid = b && b.tab ? b.tab.windowId : null;
        if (!_wid) { c({ error: 'no windowId' }); return true; }
        chrome.tabs.captureVisibleTab(_wid, { format: 'jpeg', quality: 88 }, function(url) {
            if (chrome.runtime.lastError) c({ error: chrome.runtime.lastError.message });
            else c({ dataUrl: url || null });
        });
        return true;
    }

    // ── Fast handler 2: click a list of x,y coords via debugger then detach ─
    if (a['action'] === 'debuggerClick') {
        const _tabId = b && b.tab ? b.tab.id : null;
        const { clicks } = a; // [{x,y}, ...]
        if (!_tabId || !clicks || !clicks.length) { c({ error: 'bad args' }); return true; }
        (async function() {
            try {
                await new Promise(function(res, rej) {
                    chrome.debugger.attach({ tabId: _tabId }, '1.3', function() {
                        if (chrome.runtime.lastError) rej(new Error(chrome.runtime.lastError.message));
                        else res();
                    });
                });
                for (var i = 0; i < clicks.length; i++) {
                    // Honor pauseBefore (used to delay confirm click without detaching)
                    if (clicks[i].pauseBefore) {
                        await new Promise(function(r){ setTimeout(r, clicks[i].pauseBefore); });
                    }
                    var p = { x: Math.round(clicks[i].x), y: Math.round(clicks[i].y), button: 'left', clickCount: 1, modifiers: 0 };
                    await new Promise(function(r){ chrome.debugger.sendCommand({ tabId: _tabId }, 'Input.dispatchMouseEvent', Object.assign({}, p, { type: 'mousePressed' }), r); });
                    await new Promise(function(r){ setTimeout(r, 70); });
                    await new Promise(function(r){ chrome.debugger.sendCommand({ tabId: _tabId }, 'Input.dispatchMouseEvent', Object.assign({}, p, { type: 'mouseReleased' }), r); });
                    await new Promise(function(r){ setTimeout(r, 160 + Math.floor(Math.random() * 80)); });
                }
                await new Promise(function(r){ chrome.debugger.detach({ tabId: _tabId }, r); });
                c({ success: true });
            } catch(e) {
                try { chrome.debugger.detach({ tabId: _tabId }, function(){}); } catch(_) {}
                c({ error: e.message || String(e) });
            }
        })();
        return true;
    }


    // ── Click Confirm button inside AWS WAF captcha iframe via CDP Runtime ──────
    if (a['action'] === 'clickConfirmInIframe') {
        const _tabId = b && b.tab ? b.tab.id : null;
        if (!_tabId) { c({ error: 'no tabId' }); return true; }

        (async function() {
            try {
                await new Promise(function(res, rej) {
                    chrome.debugger.attach({ tabId: _tabId }, '1.3', function() {
                        if (chrome.runtime.lastError) rej(new Error(chrome.runtime.lastError.message));
                        else res();
                    });
                });

                // Get all frames to find the captcha iframe
                const frameTree = await new Promise(function(res) {
                    chrome.debugger.sendCommand({ tabId: _tabId }, 'Page.getFrameTree', {}, res);
                });

                let captchaFrameId = null;
                function findCaptchaFrame(frame) {
                    if (frame.frame && frame.frame.url && frame.frame.url.includes('captcha')) {
                        captchaFrameId = frame.frame.id;
                        return;
                    }
                    if (frame.childFrames) {
                        frame.childFrames.forEach(findCaptchaFrame);
                    }
                }
                if (frameTree && frameTree.frameTree) findCaptchaFrame(frameTree.frameTree);
                console.log('[bg] captcha frameId:', captchaFrameId);

                let clicked = false;
                if (captchaFrameId) {
                    // Get execution context for the captcha iframe
                    const contexts = await new Promise(function(res) {
                        chrome.debugger.sendCommand({ tabId: _tabId }, 'Runtime.evaluate', {
                            expression: '(function() { var frames = document.querySelectorAll("iframe"); for (var i=0; i<frames.length; i++) { if (frames[i].src && frames[i].src.includes("captcha")) return i; } return -1; })()',
                        }, res);
                    });

                    // Try executing in iframe using executeScript approach
                    const result = await new Promise(function(res) {
                        chrome.debugger.sendCommand({ tabId: _tabId }, 'Runtime.evaluate', {
                            expression: '(function() { var iframes = document.querySelectorAll("iframe"); for (var i = 0; i < iframes.length; i++) { try { var btn = iframes[i].contentDocument && iframes[i].contentDocument.querySelector("button"); if (btn) { btn.click(); return "clicked via iframe[" + i + "]"; } } catch(e) {} } return "not found"; })()',
                        }, res);
                    });
                    console.log('[bg] iframe button click result:', JSON.stringify(result));
                    if (result && result.result && result.result.value && result.result.value.startsWith('clicked')) {
                        clicked = true;
                    }
                }

                // Fallback: click at fixed offset from bottom-right of the captcha modal area
                if (!clicked) {
                    const { modalRect } = a;
                    if (modalRect) {
                        var cx = modalRect.left + modalRect.width * 0.69;
                        var cy = modalRect.top + modalRect.height * 0.95;
                        console.log('[bg] Confirm fallback CDP click at', Math.round(cx), Math.round(cy));
                        var p = { x: Math.round(cx), y: Math.round(cy), button: 'left', clickCount: 1, modifiers: 0 };
                        await new Promise(function(r) { chrome.debugger.sendCommand({ tabId: _tabId }, 'Input.dispatchMouseEvent', Object.assign({}, p, { type: 'mousePressed' }), r); });
                        await new Promise(function(r) { setTimeout(r, 80); });
                        await new Promise(function(r) { chrome.debugger.sendCommand({ tabId: _tabId }, 'Input.dispatchMouseEvent', Object.assign({}, p, { type: 'mouseReleased' }), r); });
                        clicked = true;
                    }
                }

                await new Promise(function(r) { chrome.debugger.detach({ tabId: _tabId }, r); });
                c({ success: true, clicked });
            } catch(err) {
                try { chrome.debugger.detach({ tabId: _tabId }, function() {}); } catch(_) {}
                c({ error: err.message || String(err) });
            }
        })();
        return true;
    }

    // ── One session: click cells + Confirm (shadow DOM pierce) ──────────────────
    if (a['action'] === 'clickCellsAndConfirm') {
        const _tabId = b && b.tab ? b.tab.id : null;
        const { cellClicks } = a;
        if (!_tabId) { c({ error: 'no tabId' }); return true; }

        (async function() {
            try {
                // Attach once
                await new Promise(function(res, rej) {
                    chrome.debugger.attach({ tabId: _tabId }, '1.3', function() {
                        if (chrome.runtime.lastError) rej(new Error(chrome.runtime.lastError.message));
                        else res();
                    });
                });

                // Click each cell
                for (var i = 0; i < cellClicks.length; i++) {
                    var p = { x: Math.round(cellClicks[i].x), y: Math.round(cellClicks[i].y), button: 'left', clickCount: 1, modifiers: 0 };
                    await new Promise(function(r) { chrome.debugger.sendCommand({ tabId: _tabId }, 'Input.dispatchMouseEvent', Object.assign({type:'mousePressed'}, p), r); });
                    await new Promise(function(r) { setTimeout(r, 65); });
                    await new Promise(function(r) { chrome.debugger.sendCommand({ tabId: _tabId }, 'Input.dispatchMouseEvent', Object.assign({type:'mouseReleased'}, p), r); });
                    await new Promise(function(r) { setTimeout(r, 170 + Math.floor(Math.random()*80)); });
                }

                // Wait for selections to register
                await new Promise(function(r) { setTimeout(r, 700); });

                // Pierce shadow DOM to click Confirm — no coordinate guessing
                const confirmResult = await new Promise(function(res) {
                    chrome.debugger.sendCommand({ tabId: _tabId }, 'Runtime.evaluate', {
                        expression: [
                            '(function() {',
                            '  var host = document.querySelector("awswaf-captcha");',
                            '  if (host && host.shadowRoot) {',
                            '    var btn = host.shadowRoot.querySelector("#amzn-btn-verify-internal, .btn.btn-primary, button[type=submit]");',
                            '    if (btn) { btn.click(); return "shadow:clicked"; }',
                            '  }',
                            '  var btn2 = document.querySelector("#amzn-btn-verify-internal, button[type=submit]");',
                            '  if (btn2) { btn2.click(); return "dom:clicked"; }',
                            '  return "not-found";',
                            '})()'
                        ].join('\n'),
                        awaitPromise: false
                    }, res);
                });
                console.log('[bg] Confirm click result:', JSON.stringify(confirmResult));

                await new Promise(function(r) { chrome.debugger.detach({ tabId: _tabId }, r); });
                var val = confirmResult && confirmResult.result && confirmResult.result.value;
                c({ success: true, confirmStatus: val });
            } catch(err) {
                console.error('[bg] clickCellsAndConfirm error:', err.message);
                try { chrome.debugger.detach({ tabId: _tabId }, function(){}); } catch(_) {}
                c({ error: err.message || String(err) });
            }
        })();
        return true;
    }

    // ── Re-login in a NEW background tab (v8.9.5.2) ───────────────────────────
    // Opens auth page in a new tab, lets fetch.js + auth.js auto-fill login,
    // then closes the tab once login completes (reaches jobSearch).
    // The original scanning tab is NEVER navigated away.
    if (a['action'] === 'reloginInNewTab') {
        (async function() {
            try {
                // Determine auth URL based on stored country
                var countryData = await chrome['storage']['local']['get']('__country');
                var country = countryData['__country'] || 'Canada';
                var authUrl = country === 'United States'
                    ? 'https://auth.hiring.amazon.com/#/login'
                    : 'https://auth.hiring.amazon.ca/#/login';

                console.log('[bg] reloginInNewTab — opening:', authUrl);

                // Open auth page in a new NON-active tab (won't steal focus)
                var newTab = await new Promise(function(res) {
                    chrome['tabs']['create']({ 'url': authUrl, 'active': false }, res);
                });
                var reloginTabId = newTab['id'];

                // Mark this tab as a re-login tab so auth.js knows to close it
                // instead of redirecting to jobSearch
                chrome['storage']['local']['set']({ '__reloginTabId': reloginTabId });

                // Monitor the tab — when it reaches jobSearch or after 3 min timeout, close it
                var _checkCount = 0;
                var _maxChecks = 90; // 90 × 2s = 3 minutes max
                var _pollTimer = setInterval(function() {
                    _checkCount++;
                    if (_checkCount > _maxChecks) {
                        // Timeout — close tab regardless
                        console.log('[bg] reloginInNewTab — timeout, closing tab');
                        clearInterval(_pollTimer);
                        chrome['tabs']['remove'](reloginTabId, function() {});
                        chrome['storage']['local']['remove']('__reloginTabId');
                        return;
                    }
                    chrome['tabs']['get'](reloginTabId, function(tab) {
                        if (chrome['runtime']['lastError'] || !tab) {
                            // Tab was closed manually or crashed
                            console.log('[bg] reloginInNewTab — tab gone, cleaning up');
                            clearInterval(_pollTimer);
                            chrome['storage']['local']['remove']('__reloginTabId');
                            return;
                        }
                        // Check if tab reached jobSearch (login complete!)
                        if (tab['url'] && tab['url'].includes('app#/jobSearch')) {
                            console.log('[bg] reloginInNewTab — login complete! Closing tab.');
                            clearInterval(_pollTimer);
                            chrome['tabs']['remove'](reloginTabId, function() {});
                            chrome['storage']['local']['remove']('__reloginTabId');
                        }
                    });
                }, 2000);

                c({ success: true, tabId: reloginTabId });
            } catch(err) {
                console.error('[bg] reloginInNewTab error:', err.message);
                c({ error: err.message });
            }
        })();
        return true;
    }

    if (a['action'] === 'refreshGmailTab') {
        chrome['tabs']['query']({ 'url': '*://mail.google.com/*' }, function(tabs) {
            if (!tabs || !tabs[0]) {
                // No Gmail tab open — auto-open one
                console.log('[bg] No Gmail tab found — opening mail.google.com');
                chrome['tabs']['create']({ 'url': 'https://mail.google.com/', 'active': false }, function(newTab) {
                    setTimeout(function() { c({ done: true, opened: true }); }, 5000);
                });
                return;
            }
            // Reload ALL Gmail tabs so the correct one gets fresh emails
            var reloaded = 0;
            for (var i = 0; i < tabs.length; i++) {
                chrome['tabs']['reload'](tabs[i]['id'], { bypassCache: true });
                reloaded++;
            }
            console.log('[bg] Refreshed', reloaded, 'Gmail tabs');
            // Wait for them to load
            var mainTabId = tabs[0]['id'];
            var tries = 0;
            function poll() {
                chrome['tabs']['get'](mainTabId, function(tab) {
                    if (tab && tab['status'] === 'complete') {
                        setTimeout(function() { c({ done: true }); }, 2000);
                    } else if (tries++ < 20) {
                        setTimeout(poll, 500);
                    } else {
                        c({ done: true });
                    }
                });
            }
            poll();
        });
        return true;
    }
    if (a['action'] === 'getTabId') {
        c({ tabId: b && b.tab ? b.tab.id : null });
        return;
    }

    if (a['action'] === 'captureScreen') {
        // Must capture the ACTIVE visible tab — captureVisibleTab only works on active tabs
        chrome['tabs']['query']({ 'active': !![], 'currentWindow': !![] }, function(tabs) {
            if (!tabs || !tabs[0]) { c({ 'dataUrl': null }); return; }
            chrome['tabs']['captureVisibleTab'](tabs[0]['windowId'], { 'format': 'png', 'quality': 100 }, function(dataUrl) {
                if (chrome.runtime.lastError) {
                    console.error('captureVisibleTab error:', chrome.runtime.lastError.message);
                    c({ 'dataUrl': null });
                    return;
                }
                c({ 'dataUrl': dataUrl || null });
            });
        });
        return !![];
    }
    if (a['action'] === 'fetchGmailOTP') {
        // v8.9.6.1: Smart OTP reader — only grabs NEW codes (after requestedAt timestamp)
        // 1. Force-reloads Gmail to get fresh emails
        // 2. Only accepts codes from emails received AFTER the OTP was requested
        // 3. Checks email time labels to filter out old/expired codes

        var requestedAt = a.requestedAt || (Date.now() - 60000); // fallback: last 60s

        chrome['tabs']['query']({ 'url': '*://mail.google.com/*' }, function(tabs) {
            if (!tabs || !tabs.length) {
                console.log('[bg] No Gmail tab open');
                c({ 'otp': null });
                return;
            }

            // Step 1: Force-reload the first Gmail tab to get fresh emails
            var gmailTabId = tabs[0]['id'];
            chrome['tabs']['reload'](gmailTabId, { bypassCache: true });
            console.log('[bg] Force-reloaded Gmail tab:', gmailTabId);

            // Step 2: Wait for Gmail to fully load after reload
            var loadTries = 0;
            function waitForGmailLoad() {
                loadTries++;
                if (loadTries > 15) { // 15 * 1s = 15s max wait
                    proceedToRead();
                    return;
                }
                chrome['tabs']['get'](gmailTabId, function(tab) {
                    if (tab && tab['status'] === 'complete') {
                        // Extra 2s after "complete" for Gmail JS to render
                        setTimeout(proceedToRead, 2000);
                    } else {
                        setTimeout(waitForGmailLoad, 1000);
                    }
                });
            }
            setTimeout(waitForGmailLoad, 1500); // Initial wait before first check

            function proceedToRead() {
                // Remember active tab to restore later
                chrome['tabs']['query']({ 'active': true, 'currentWindow': true }, function(activeTabs) {
                    var previousTabId = activeTabs && activeTabs[0] ? activeTabs[0]['id'] : null;

                    function restoreTab() {
                        if (previousTabId && previousTabId !== gmailTabId) {
                            chrome['tabs']['update'](previousTabId, { 'active': true });
                        }
                    }

                    // Focus Gmail tab to ensure it's not throttled
                    chrome['tabs']['update'](gmailTabId, { 'active': true }, function() {
                        setTimeout(function() {
                            chrome['scripting']['executeScript']({
                                'target': { 'tabId': gmailTabId },
                                'func': function(requestedAtParam) {
                                    // ── SMART OTP READER ────────────────────────────────
                                    // Only grab codes from RECENT emails (within last 3 min)

                                    function isRecentEmail(timeText) {
                                        if (!timeText) return false;
                                        var t = timeText.trim().toLowerCase();
                                        // Gmail shows: "just now", "1 min ago", "2 min ago", "10:35 AM", etc.
                                        if (/just now|moments? ago|now/i.test(t)) return true;
                                        // "X min ago" — accept if <= 4 min
                                        var minMatch = t.match(/(\d+)\s*min/);
                                        if (minMatch && parseInt(minMatch[1]) <= 4) return true;
                                        // "X sec ago"
                                        if (/\d+\s*sec/i.test(t)) return true;
                                        // Absolute time (e.g. "10:35 PM") — check if within last 5 min
                                        var timeMatch = t.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
                                        if (timeMatch) {
                                            var h = parseInt(timeMatch[1]);
                                            var m = parseInt(timeMatch[2]);
                                            var ampm = (timeMatch[3] || '').toLowerCase();
                                            if (ampm === 'pm' && h !== 12) h += 12;
                                            if (ampm === 'am' && h === 12) h = 0;
                                            var emailTime = new Date();
                                            emailTime.setHours(h, m, 0, 0);
                                            var diff = Date.now() - emailTime.getTime();
                                            // Accept if within last 5 minutes
                                            if (diff >= 0 && diff < 5 * 60 * 1000) return true;
                                            // Handle midnight wraparound
                                            if (diff < -20 * 60 * 60 * 1000) {
                                                emailTime.setDate(emailTime.getDate() - 1);
                                                diff = Date.now() - emailTime.getTime();
                                                if (diff >= 0 && diff < 5 * 60 * 1000) return true;
                                            }
                                        }
                                        return false;
                                    }

                                    // Method 1: Check inbox rows — find NEWEST Amazon email with recent timestamp
                                    var rows = document.querySelectorAll('tr.zA, [data-legacy-thread-id], tr[jscontroller]');
                                    for (var row of rows) {
                                        var txt = row.textContent || '';
                                        if (!/amazon.*verif|verif.*amazon|amazon jobs/i.test(txt)) continue;

                                        // Check time label — Gmail shows time in a <span> with title or in .xW
                                        var timeEl = row.querySelector('.xW span[title], td.xW, [data-tooltip], .bog span');
                                        var timeText = '';
                                        if (timeEl) timeText = timeEl.getAttribute('title') || timeEl.textContent || '';

                                        // Also check for relative time spans in the row
                                        if (!timeText) {
                                            var spans = row.querySelectorAll('span');
                                            for (var s of spans) {
                                                if (/\d+\s*(min|sec|:)\s*(ago|am|pm)?/i.test(s.textContent)) {
                                                    timeText = s.textContent;
                                                    break;
                                                }
                                            }
                                        }

                                        var recent = isRecentEmail(timeText);
                                        if (!recent && timeText) continue; // Has time but too old — skip
                                        // If no time found at all, still try (Gmail might not show time for newest)

                                        // Try to extract code from row snippet
                                        var m = txt.match(/\b(\d{6})\b/);
                                        if (m) return { otp: m[1], source: 'inbox-row', time: timeText };

                                        // Need to click to open email
                                        row.click();
                                        return { otp: null, source: 'CLICKED', time: timeText };
                                    }

                                    // Method 2: Check already-open email body
                                    var openBodies = document.querySelectorAll('.a3s.aiL, .ii.gt .a3s, [data-message-id] .a3s');
                                    for (var el of openBodies) {
                                        var bodyTxt = el.textContent || '';
                                        if (!/amazon|verification/i.test(bodyTxt)) continue;
                                        var m2 = bodyTxt.match(/\b(\d{6})\b/);
                                        if (m2) return { otp: m2[1], source: 'open-email' };
                                    }

                                    return { otp: null, source: 'not-found' };
                                },
                                'args': [requestedAt]
                            }, function(results) {
                                if (chrome['runtime']['lastError']) {
                                    restoreTab();
                                    c({ 'otp': null });
                                    return;
                                }
                                var result = results && results[0] && results[0]['result'];

                                if (!result || (!result.otp && result.source !== 'CLICKED')) {
                                    restoreTab();
                                    c({ 'otp': null });
                                    return;
                                }

                                if (result.source === 'CLICKED') {
                                    // Email was clicked — wait 2.5s for render then read code
                                    setTimeout(function() {
                                        chrome['scripting']['executeScript']({
                                            'target': { 'tabId': gmailTabId },
                                            'func': function() {
                                                var bodies = document.querySelectorAll('.a3s.aiL, .ii.gt .a3s, [data-message-id] .a3s');
                                                for (var el of bodies) {
                                                    var t = el.textContent || '';
                                                    if (/amazon|verification/i.test(t)) {
                                                        var m = t.match(/\b(\d{6})\b/);
                                                        if (m) return m[1];
                                                    }
                                                }
                                                // Fallback: any 6-digit number near "verification"
                                                var full = (document.body.innerText || '').replace(/\s+/g, ' ');
                                                var m2 = full.match(/verif[^\d]{0,50}(\d{6})/i);
                                                if (m2) return m2[1];
                                                return null;
                                            }
                                        }, function(r2) {
                                            var otp = r2 && r2[0] && r2[0]['result'];
                                            console.log('[bg] OTP after click:', otp || 'null');
                                            restoreTab();
                                            c({ 'otp': otp || null });
                                        });
                                    }, 2500);
                                } else if (result.otp) {
                                    console.log('[bg] OTP found (fresh):', result.otp, 'source:', result.source, 'time:', result.time);
                                    restoreTab();
                                    c({ 'otp': result.otp });
                                } else {
                                    restoreTab();
                                    c({ 'otp': null });
                                }
                            });
                        }, 1500);
                    });
                });
            }
        });
        return !![];
    }
    if (a['action'] === 'start_fetch')
        chrome['runtime']['sendMessage']({ 'action': 'start_fetch' });
    else {
        if (a['action'] === 'stop_fetch')
            chrome['runtime']['sendMessage']({ 'action': 'stop_fetch' });
        else {
            if (a['action'] === 'playSound') {
                // Always show system notification — no permission prompt needed
                chrome['notifications']['create']('ss_job_' + Date.now(), {
                    'type': 'basic',
                    'iconUrl': chrome['runtime']['getURL']('images/logo.png'),
                    'title': '🎯 ShiftSniper — Job Found!',
                    'message': (a['jobTitle'] || 'A matching warehouse shift') + ' — Applying now...',
                    'priority': 2,
                    'requireInteraction': false
                });
                const d = new Audio(chrome['runtime']['getURL']('alert.wav'));
                return d['play']()['then'](() => {
                    setTimeout(() => {
                        const e = new Audio(chrome['runtime']['getURL']('alert.wav'));
                        e['play']()['catch'](f => console['error']('Failed secondary sound:', f));
                    }, 0x3e8);
                })['catch'](e => {
                    console['error']('Failed to play sound from background:', e);
                }), !![];
            }
        }
    }
}), chrome['runtime']['onMessage']['addListener'](function (a, b, c) {
    if (a['candidateId']) {
        const d = a['candidateId'];
        chrome['storage']['local']['set']({ 'candidateId': d }, function () {
        }), c({ 'status': 'success' });
    }
});
