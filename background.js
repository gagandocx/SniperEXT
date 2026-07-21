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
}),

// ── Proxy Fetch — makes API calls from background (no CORS) ─────────────────
// Content scripts send { action: 'proxyFetch', url, options } and get back the
// JSON response. Background service worker is exempt from CORS restrictions.
chrome['runtime']['onMessage']['addListener'](function(msg, sender, sendResponse) {
    if (msg['action'] !== 'proxyFetch') return false;

    var url = msg['url'];
    var options = msg['options'] || {};

    // Ensure we pass through the auth token from storage if available
    (async function() {
        try {
            // Build fetch options — no credentials needed in background (no cookies)
            // but we DO need the auth token
            var fetchOpts = {
                method: options['method'] || 'POST',
                headers: options['headers'] || {},
                body: options['body'] || null
            };

            // If no authorization header provided, try to read from storage
            var hasAuth = false;
            var headerKeys = Object.keys(fetchOpts.headers);
            for (var i = 0; i < headerKeys.length; i++) {
                if (headerKeys[i].toLowerCase() === 'authorization') { hasAuth = true; break; }
            }
            if (!hasAuth) {
                var stored = await chrome['storage']['local']['get']('__ss_auth_token');
                if (stored['__ss_auth_token']) {
                    fetchOpts.headers['authorization'] = stored['__ss_auth_token'];
                }
            }

            var response = await fetch(url, fetchOpts);
            var data = await response.json();
            sendResponse({ ok: response.ok, status: response.status, data: data });
        } catch(err) {
            console.error('[bg] proxyFetch error:', err.message);
            sendResponse({ ok: false, status: 0, error: err.message });
        }
    })();

    return true; // Keep sendResponse channel open for async
}),
// ─────────────────────────────────────────────────────────────────────────────

chrome['runtime']['onInstalled']['addListener'](async ({reason: a}) => {
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

    if (a['action'] === 'refreshGmailTab') {
        chrome['tabs']['query']({ 'url': '*://mail.google.com/*' }, function(tabs) {
            if (!tabs || !tabs[0]) {
                // No Gmail tab open — auto-open one
                console.log('[bg] No Gmail tab found — opening mail.google.com');
                chrome['tabs']['create']({ 'url': 'https://mail.google.com/', 'active': false }, function(newTab) {
                    // Wait 5s for Gmail to load then signal done
                    setTimeout(function() { c({ done: true, opened: true }); }, 5000);
                });
                return;
            }
            chrome['tabs']['reload'](tabs[0]['id'], { bypassCache: true }, function() {
                // Poll until loaded
                var tabId = tabs[0]['id'];
                var tries = 0;
                function poll() {
                    chrome['tabs']['get'](tabId, function(tab) {
                        if (tab && tab['status'] === 'complete') {
                            setTimeout(function() { c({ done: true }); }, 2000); // +2s for Gmail render
                        } else if (tries++ < 20) {
                            setTimeout(poll, 500);
                        } else {
                            c({ done: true }); // timeout
                        }
                    });
                }
                poll();
            });
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
        chrome['tabs']['query']({ 'url': '*://mail.google.com/*' }, function(tabs) {
            if (!tabs || !tabs[0]) {
                // Auto-open Gmail tab and signal to retry
                console.log('[bg] fetchGmailOTP: no Gmail tab — opening one');
                chrome['tabs']['create']({ 'url': 'https://mail.google.com/', 'active': false }, function() {
                    c({ 'otp': null, 'gmailOpened': true });
                });
                return;
            }
            var tabId = tabs[0]['id'];

            chrome['scripting']['executeScript']({
                'target': { 'tabId': tabId },
                'func': function() {
                    // Strategy: find and click the Amazon OTP email thread,
                    // then read all codes from the thread body (newest = last)

                    function extractCodes(text) {
                        var codes = [];
                        var matches = text.matchAll(/verification code for Amazon[^0-9]{0,30}(\d{6})/gi);
                        for (var m of matches) codes.push(m[1]);
                        // Also grab standalone 6-digit numbers near "Amazon"
                        var lines = text.split('\n');
                        for (var i = 0; i < lines.length; i++) {
                            if (/amazon.{0,40}(verification|jobs)/i.test(lines[i])) {
                                var chunk = lines.slice(Math.max(0,i-1), i+4).join(' ');
                                var m2 = chunk.match(/(\d{6})/);
                                if (m2) codes.push(m2[1]);
                            }
                        }
                        return codes;
                    }

                    // First check if an Amazon OTP email is already open
                    var openBodies = document.querySelectorAll('.a3s.aiL, .ii.gt .a3s');
                    var allCodesFromOpen = [];
                    openBodies.forEach(function(el) {
                        var t = el.textContent || '';
                        if (/amazon.*verification|verification.*amazon/i.test(t)) {
                            extractCodes(t).forEach(function(c) { allCodesFromOpen.push(c); });
                        }
                    });
                    if (allCodesFromOpen.length > 0) {
                        console.log('[gmail] Found codes in open email:', allCodesFromOpen);
                        return allCodesFromOpen[allCodesFromOpen.length - 1]; // newest = last
                    }

                    // Find and click the Amazon OTP thread row to open it
                    var rows = document.querySelectorAll('tr.zA, [data-legacy-thread-id]');
                    var amazonRow = null;
                    for (var row of rows) {
                        var t = row.textContent || '';
                        if (/amazon.*verification code|verification code.*amazon/i.test(t) &&
                            /no-reply.*jobs\.amazon/i.test(t)) {
                            amazonRow = row;
                            break;
                        }
                        // Fallback: any row with "Amazon Jobs verification"
                        if (/amazon jobs verification/i.test(t)) {
                            amazonRow = row;
                            break;
                        }
                    }

                    if (amazonRow) {
                        // Check if code visible in preview (inbox list)
                        var previewText = amazonRow.textContent || '';
                        var codesInPreview = extractCodes(previewText);
                        var previewMatch = previewText.match(/Amazon Jobs\.\s+(\d{6})/);
                        if (previewMatch) codesInPreview.push(previewMatch[1]);

                        // Click to open the thread
                        amazonRow.click();
                        console.log('[gmail] Clicked Amazon OTP thread row');

                        // Return preview code immediately, background will re-read after open
                        if (codesInPreview.length > 0) {
                            return 'CLICK:' + codesInPreview[codesInPreview.length - 1];
                        }
                        return 'CLICK:wait';
                    }

                    // Last resort: scan all visible text
                    var allCodes = extractCodes(document.body.textContent || '');
                    console.log('[gmail] Scanned body, codes:', allCodes);
                    return allCodes.length > 0 ? allCodes[allCodes.length - 1] : null;
                }
            }, function(results) {
                if (chrome['runtime']['lastError']) { c({ 'otp': null }); return; }
                var raw = results && results[0] && results[0]['result'];
                console.log('[bg] Gmail raw result:', raw);

                if (raw && raw.toString().startsWith('CLICK:')) {
                    var immediate = raw.replace('CLICK:', '');
                    if (immediate === 'wait' || immediate.length !== 6) {
                        // Thread was clicked, wait 2s for it to open then re-read
                        setTimeout(function() {
                            chrome['scripting']['executeScript']({
                                'target': { 'tabId': tabId },
                                'func': function() {
                                    var bodies = document.querySelectorAll('.a3s.aiL, .ii.gt .a3s, [data-message-id] .a3s');
                                    var codes = [];
                                    bodies.forEach(function(el) {
                                        var t = el.textContent || '';
                                        var m = t.match(/(\d{6})/);
                                        if (m && /amazon|verification/i.test(t)) codes.push(m[1]);
                                    });
                                    return codes.length > 0 ? codes[codes.length - 1] : null;
                                }
                            }, function(r2) {
                                var otp = r2 && r2[0] && r2[0]['result'];
                                console.log('[bg] Gmail re-read after click:', otp);
                                c({ 'otp': otp || null });
                            });
                        }, 2000);
                        return;
                    }
                    c({ 'otp': immediate });
                } else {
                    c({ 'otp': raw || null });
                }
            });
        });
        return true;
    }

    if (a['action'] === 'refreshGmailTab') {
        chrome['tabs']['query']({ 'url': '*://mail.google.com/*' }, function(tabs) {
            if (!tabs || !tabs[0]) { c({ done: false, error: 'no gmail tab' }); return; }
            chrome['tabs']['reload'](tabs[0]['id'], { bypassCache: true }, function() {
                // Poll until loaded
                var tabId = tabs[0]['id'];
                var tries = 0;
                function poll() {
                    chrome['tabs']['get'](tabId, function(tab) {
                        if (tab && tab['status'] === 'complete') {
                            setTimeout(function() { c({ done: true }); }, 2000); // +2s for Gmail render
                        } else if (tries++ < 20) {
                            setTimeout(poll, 500);
                        } else {
                            c({ done: true }); // timeout
                        }
                    });
                }
                poll();
            });
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
        // Read OTP from Gmail DOM — briefly focus tab so Gmail fully renders, then restore
        chrome['tabs']['query']({ 'url': '*://mail.google.com/*' }, function(tabs) {
            if (!tabs || !tabs[0]) {
                console.log('[bg] No Gmail tab open — please keep Gmail open');
                c({ 'otp': null });
                return;
            }
            var gmailTabId = tabs[0]['id'];

            // Remember which tab is currently active so we can restore it after
            chrome['tabs']['query']({ 'active': true, 'currentWindow': true }, function(activeTabs) {
                var previousTabId = activeTabs && activeTabs[0] ? activeTabs[0]['id'] : null;

                function runScript() {
                    chrome['scripting']['executeScript']({
                        'target': { 'tabId': gmailTabId },
                        'func': function() {
                            // Method 1: Open email body (most reliable when email is open)
                            var openBodies = document.querySelectorAll('.a3s.aiL, .ii.gt .a3s, [data-message-id] .a3s');
                            for (var el of openBodies) {
                                var t = el.textContent || '';
                                if (/amazon|verification/i.test(t)) {
                                    var m = t.match(/\b(\d{6})\b/);
                                    if (m) return m[1];
                                }
                            }

                            // Method 2: Gmail inbox rows — preview snippet
                            var rows = document.querySelectorAll('tr.zA, [data-thread-id], [data-legacy-thread-id]');
                            for (var row of rows) {
                                var txt = row.textContent || '';
                                if (/amazon.*verification|verification.*amazon/i.test(txt)) {
                                    var m2 = txt.match(/\b(\d{6})\b/);
                                    if (m2) return m2[1];
                                }
                            }

                            // Method 3: Brute force full page scan
                            var full = (document.body.textContent || '').replace(/\s+/g, ' ');
                            var allMatches = [...full.matchAll(/verification code for Amazon[^\d]*?(\d{6})/gi)];
                            if (allMatches.length > 0) return allMatches[0][1];

                            // Method 4: Any 6-digit code near "Amazon" anywhere on page
                            var idx = full.toLowerCase().indexOf('amazon jobs');
                            if (idx > -1) {
                                var region = full.slice(idx, idx + 300);
                                var m3 = region.match(/\b(\d{6})\b/);
                                if (m3) return m3[1];
                            }

                            return null;
                        }
                    }, function(results) {
                        // Restore previous tab immediately after reading
                        if (previousTabId && previousTabId !== gmailTabId) {
                            chrome['tabs']['update'](previousTabId, { 'active': true });
                        }
                        if (chrome['runtime']['lastError']) {
                            console.error('[bg] Gmail DOM read error:', chrome['runtime']['lastError']['message']);
                            c({ 'otp': null });
                            return;
                        }
                        var otp = results && results[0] && results[0]['result'];
                        console.log('[bg] Gmail OTP from DOM:', otp);
                        c({ 'otp': otp || null });
                    });
                }

                // Focus Gmail tab, wait for it to FULLY wake up, then read
                // Chrome throttles background tabs — Gmail needs a reload + focus
                if (previousTabId !== gmailTabId) {
                    // Focus first
                    chrome['tabs']['update'](gmailTabId, { 'active': true }, function() {
                        // Wait 2s for tab to wake from throttle
                        setTimeout(function() {
                            // Reload to ensure fresh inbox content
                            chrome['tabs']['reload'](gmailTabId, { bypassCache: false }, function() {
                                // Wait another 2s for Gmail to render
                                setTimeout(runScript, 2000);
                            });
                        }, 500);
                    });
                } else {
                    // Gmail is already active — still reload to get fresh emails
                    chrome['tabs']['reload'](gmailTabId, { bypassCache: false }, function() {
                        setTimeout(runScript, 1500);
                    });
                }
            });
        });
        return true;
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