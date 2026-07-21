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
        // Read OTP directly from Gmail DOM — no fetch, no auth popup, no CORS
        chrome['tabs']['query']({ 'url': '*://mail.google.com/*' }, function(tabs) {
            if (!tabs || !tabs[0]) {
                console.log('[bg] No Gmail tab open — please keep Gmail open');
                c({ 'otp': null });
                return;
            }
            // Just inject script — refresh is done once from auth.js before polling starts
            chrome['scripting']['executeScript']({
                'target': { 'tabId': tabs[0]['id'] },
                'func': function() {
                    // Method 1: Scan ALL visible text — fastest, catches inbox preview
                    const bodyText = document.body.innerText || '';
                    const lines = bodyText.split('\n');
                    for (let i = 0; i < lines.length; i++) {
                        if (/amazon.{0,20}(verification|code)/i.test(lines[i])) {
                            const chunk = lines.slice(i, i + 5).join(' ');
                            const m = chunk.match(/\b(\d{6})\b/);
                            if (m) return m[1];
                        }
                    }

                    // Method 2: Gmail inbox rows — preview snippet contains OTP
                    const rows = document.querySelectorAll('tr.zA, [data-thread-id], [data-legacy-thread-id]');
                    for (const row of rows) {
                        const txt = row.innerText || '';
                        if (/amazon.*verification|verification.*amazon/i.test(txt)) {
                            const m = txt.match(/\b(\d{6})\b/);
                            if (m) return m[1];
                        }
                    }

                    // Method 3: Open email body
                    const emailBody = document.querySelector('.a3s.aiL, .ii.gt, [data-message-id] .a3s');
                    if (emailBody) {
                        const m = (emailBody.innerText || '').match(/\b(\d{6})\b/);
                        if (m) return m[1];
                    }

                    // Method 4: Brute force — find any 6-digit code near "Amazon" in full page
                    const full = bodyText.replace(/\s+/g, ' ');
                    const amazonIdx = full.toLowerCase().indexOf('amazon jobs verification');
                    if (amazonIdx > -1) {
                        const region = full.slice(amazonIdx, amazonIdx + 200);
                        const m = region.match(/\b(\d{6})\b/);
                        if (m) return m[1];
                    }

                    // Method 5: Find ALL 6-digit codes on the page near "verification code"
                    // Get the LATEST (first matching block — Gmail shows newest first)
                    const allMatches = [...full.matchAll(/verification code for Amazon[^\d]*?(\d{6})/gi)];
                    if (allMatches.length > 0) return allMatches[0][1];

                    return null;
                }
            }, function(results) {
                if (chrome['runtime']['lastError']) {
                    console.error('[bg] Gmail DOM read error:', chrome['runtime']['lastError']['message']);
                    c({ 'otp': null });
                    return;
                }
                const otp = results && results[0] && results[0]['result'];
                console.log('[bg] Gmail OTP from DOM:', otp);
                c({ 'otp': otp || null });
            });
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
