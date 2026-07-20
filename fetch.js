(async function (a) {
    // Load Nunito font for consistent Swal dialog typography (matches popup theme)
    if (!document.querySelector('link[href*="Nunito"]')) {
        var _fl = document.createElement('link');
        _fl.rel = 'stylesheet';
        _fl.href = 'https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800&display=swap';
        document.head.appendChild(_fl);
    }
    // Swal override styles now in css/swal_theme.css (injected via manifest content_scripts)
    // ── Scan Ring Pill — spinning arc + text label ──────────────────────────
    (function() {
        if (document.getElementById('ss-scan-style')) return;
        var st = document.createElement('style');
        st.id = 'ss-scan-style';
        st.textContent =
            '#ss-ring{position:fixed;bottom:16px;left:16px;display:none;align-items:center;gap:10px;' +
            'padding:10px 18px 10px 12px;border-radius:28px;' +
            'background:rgba(8,8,25,0.93);border:1px solid rgba(22,245,255,0.3);' +
            'box-shadow:0 4px 16px rgba(0,0,0,0.45),0 0 10px rgba(22,245,255,0.08);' +
            'z-index:2147483647;pointer-events:none;font-family:Inter,system-ui,sans-serif;}' +
            '#ss-ring.ss-warn{border-color:rgba(245,158,11,0.5);box-shadow:0 4px 16px rgba(0,0,0,0.45),0 0 10px rgba(245,158,11,0.12);}' +
            '#ss-ring.ss-err{border-color:rgba(239,68,68,0.5);box-shadow:0 4px 16px rgba(0,0,0,0.45),0 0 10px rgba(239,68,68,0.12);}' +
            '#ss-ring .ss-w{position:relative;width:30px;height:30px;flex-shrink:0;}' +
            '#ss-ring svg{position:absolute;top:0;left:0;width:100%;height:100%;transform:rotate(-90deg);}' +
            '#ss-ring .ss-trk{fill:none;stroke:rgba(22,245,255,0.15);stroke-width:3;}' +
            '#ss-ring .ss-arc{fill:none;stroke:url(#ssG);stroke-width:3;stroke-linecap:round;' +
            'stroke-dasharray:60;stroke-dashoffset:60;animation:ssSweep var(--ss-dur,2s) linear infinite;}' +
            '#ss-ring.ss-warn .ss-arc{stroke:url(#ssGW);}' +
            '#ss-ring.ss-err .ss-arc{stroke:url(#ssGE);}' +
            '#ss-ring .ss-ico{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:12px;}' +
            '#ss-ring .ss-lbl{font-size:13.5px;font-weight:600;color:rgba(199,210,254,0.9);white-space:nowrap;letter-spacing:0.2px;}' +
            '#ss-ring.ss-warn .ss-lbl{color:rgba(253,186,116,0.9);}' +
            '#ss-ring.ss-err .ss-lbl{color:rgba(252,165,165,0.9);}' +
            '@keyframes ssSweep{0%{stroke-dashoffset:60}100%{stroke-dashoffset:0}}';
        document.head.appendChild(st);
        var el = document.createElement('div');
        el.id = 'ss-ring';
        el.innerHTML =
            '<div class="ss-w">' +
            '<svg viewBox="0 0 22 22"><defs>' +
            '<linearGradient id="ssG" x1="0%" y1="0%" x2="100%" y2="0%">' +
            '<stop offset="0%" stop-color="#16f5ff"/><stop offset="100%" stop-color="#a341ff"/></linearGradient>' +
            '<linearGradient id="ssGW" x1="0%" y1="0%" x2="100%" y2="0%">' +
            '<stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#fbbf24"/></linearGradient>' +
            '<linearGradient id="ssGE" x1="0%" y1="0%" x2="100%" y2="0%">' +
            '<stop offset="0%" stop-color="#ef4444"/><stop offset="100%" stop-color="#f87171"/></linearGradient>' +
            '</defs>' +
            '<circle class="ss-trk" cx="11" cy="11" r="9"/>' +
            '<circle class="ss-arc" cx="11" cy="11" r="9"/>' +
            '</svg><span class="ss-ico">⚡</span></div>' +
            '<span class="ss-lbl" id="ss-lbl">Job Checking...</span>';
        document.body.appendChild(el);
    })();

    var _ss_countdown = null;
    function _showRing(ms) {
        if (!p) return;
        var el = document.getElementById('ss-ring');
        if (!el) return;
        // Force CSS animation restart so it syncs exactly with each API call
        var arc = el.querySelector('.ss-arc');
        if (arc) {
            arc.style.animation = 'none';
            void arc.offsetHeight; // Trigger reflow — resets animation
            arc.style.animation = '';
        }
        el.style.setProperty('--ss-dur', (ms/1000).toFixed(2) + 's');
        el.className = '';
        el.style.display = 'flex';
        var lbl = document.getElementById('ss-lbl');
        if (lbl) lbl.textContent = 'Job Checking...';
    }
    function _hideRing() {
        var el = document.getElementById('ss-ring');
        if (_ss_countdown) { clearInterval(_ss_countdown); _ss_countdown = null; }
        if (el) el.style.display = 'none';
    }
    // _ringState(state, label, durationMs)
    // durationMs: if provided, updates the arc animation speed to match
    function _ringState(state, label, durationMs) {
        if (!p) { _hideRing(); return; } // Hide immediately if deactivated
        var el = document.getElementById('ss-ring');
        var lbl = document.getElementById('ss-lbl');
        if (!el || el.style.display === 'none') return;
        if (_ss_countdown) { clearInterval(_ss_countdown); _ss_countdown = null; }
        el.className = state ? 'ss-' + state : '';
        if (lbl) lbl.textContent = label || (state === 'warn' ? 'Rate limited...' : state === 'err' ? 'Server error' : 'Job Checking...');
        // Update arc animation speed to match the actual retry delay
        if (durationMs) {
            el.style.setProperty('--ss-dur', (durationMs/1000).toFixed(2) + 's');
        }
        // Start countdown for rate-limited state
        if (state === 'warn' && label) {
            var m = label.match(/(\d+)s/);
            if (m) {
                var s = parseInt(m[1]);
                _ss_countdown = setInterval(function() {
                    s--;
                    if (s <= 0) { clearInterval(_ss_countdown); _ss_countdown = null; return; }
                    if (lbl) lbl.textContent = 'Rate limited — retry in ' + s + 's';
                }, 1000);
            }
        }
    }
    // ─────────────────────────────────────────────────────────────────────────


    let b = null, c = 0x7d0;

    // ── Token retrieval — reads real auth token from tokenCapture.js ─────────
    var _cachedToken = null;
    var _tokenLastRead = 0;

    function _getAuthToken() {
        // Try reading from the DOM element set by tokenCapture.js (MAIN world)
        try {
            var el = document.getElementById('__ss_token_store');
            if (el) {
                var tok = el.getAttribute('data-token');
                if (tok && tok.length > 20 && tok.indexOf('<TOKEN>') === -1) {
                    if (tok !== _cachedToken) {
                        _cachedToken = tok;
                        _tokenLastRead = Date.now();
                        // Sync to chrome.storage for background.js
                        chrome['storage']['local']['set']({ '__ss_auth_token': tok });
                    }
                    return tok;
                }
            }
        } catch(e) {}

        // Return cached if available
        if (_cachedToken && _cachedToken.indexOf('<TOKEN>') === -1) return _cachedToken;
        return null;
    }

    // Listen for token events from tokenCapture.js (MAIN world)
    document.addEventListener('__ss_token_ready', function(evt) {
        if (evt.detail && evt.detail.token) {
            _cachedToken = evt.detail.token;
            _tokenLastRead = Date.now();
            console.log('[fetch.js] Token received via event (' + _cachedToken.length + ' chars)');
            // Store in chrome.storage for background.js proxy
            chrome['storage']['local']['set']({ '__ss_auth_token': _cachedToken });
        }
    });

    // ── Proxy fetch — routes through background.js (NO CORS) ───────────────
    // MAIN world proxy gets CORS blocked because appsync-api is cross-origin.
    // Background service worker has NO CORS restrictions.
    // Token is stored in chrome.storage so background can use it.
    var _pendingRequests = {};
    var _reqCounter = 0;

    function _bgFetch(url, options) {
        return new Promise(function(resolve) {
            // First, ensure the token from DOM/MAIN world is in chrome.storage
            var tokenEl = document.getElementById('__ss_token_store');
            var token = tokenEl ? tokenEl.getAttribute('data-token') : null;

            function doFetch() {
                chrome.runtime.sendMessage({
                    action: 'proxyFetch',
                    url: url,
                    options: {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: options['body'] || null
                    }
                }, function(response) {
                    if (chrome.runtime.lastError) {
                        resolve({ ok: false, status: 0, error: chrome.runtime.lastError.message });
                    } else {
                        resolve(response || { ok: false, status: 0, error: 'no response' });
                    }
                });
            }

            if (token) {
                chrome['storage']['local']['set']({ '__ss_auth_token': token }, doFetch);
            } else {
                doFetch();
            }
        });
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── Token refresh: force Amazon page to make a request so we can capture fresh token ──
    function _invalidateAndRefreshToken() {
        _cachedToken = null;
        _tokenLastRead = 0;
        console.log('[fetch.js] Attempting token refresh...');

        // Method 1: Navigate Amazon's internal SPA route to trigger a new API call
        // This makes the page's own code fetch fresh data with a valid token
        // which tokenCapture.js will intercept
        try {
            // Trigger a minor SPA navigation that will cause Amazon's app to call the API
            var currentUrl = window.location.href;
            if (currentUrl.includes('jobSearch')) {
                // Force React to re-render by toggling hash slightly
                window.location.hash = '#/jobSearch?_t=' + Date.now();
                setTimeout(function() {
                    window.location.hash = '#/jobSearch';
                }, 500);
            }
        } catch(e) {
            console.log('[fetch.js] SPA nav refresh failed:', e.message);
        }

        // Method 2: Re-scan localStorage after a short delay
        // AWS Amplify may have refreshed the token in the background
        setTimeout(function() {
            try {
                for (var i = 0; i < localStorage.length; i++) {
                    var key = localStorage.key(i);
                    if (key && (key.indexOf('idToken') !== -1 || key.indexOf('accessToken') !== -1 ||
                                key.indexOf('CognitoIdentityServiceProvider') !== -1) &&
                        key.indexOf('LastAuthUser') === -1) {
                        var val = localStorage.getItem(key);
                        if (val && val.length > 100 && val.indexOf('.') !== -1 &&
                            val.split('.').length === 3) {
                            _cachedToken = 'Bearer ' + val;
                            _tokenLastRead = Date.now();
                            console.log('[fetch.js] Token refreshed from localStorage:', key);
                            // Also update the DOM element for consistency
                            var el = document.getElementById('__ss_token_store');
                            if (el) {
                                el.setAttribute('data-token', _cachedToken);
                                el.setAttribute('data-ts', Date.now().toString());
                            }
                            return;
                        }
                    }
                }
            } catch(e) {}
            console.log('[fetch.js] Token refresh from localStorage failed — waiting for tokenCapture.js');
        }, 2000);

        // Method 3: If still no token after 8s, reload page to force full re-auth
        setTimeout(function() {
            if (!_cachedToken && p) {
                console.log('[fetch.js] Token still missing after 8s — reloading page for fresh session');
                window.location.reload();
            }
        }, 8000);
    }
    // ─────────────────────────────────────────────────────────────────────────
    const d = [
        'already-applied-but-can-be-reset',
        'consent'
    ];
    function e() {
        const O = window['location']['href'];
        return d['some'](P => O['includes'](P));
    }
    if (e())
        return;
    async function f() {
        const O = 0x2710, P = 0xfa;
        let Q = 0x0;
        while (Q < O) {
            const S = document['querySelector']('input[data-test-id=\x22input-test-id-emailId\x22]');
            if (S && S['value'])
                return S;
            await new Promise(T => setTimeout(T, P)), Q += P;
        }
        await Swal['fire']({
            'title': 'Session Expired',
            'html': 'Your session has ended. Please sign in again to resume hunting.',
            'allowEscapeKey': ![],
            'allowEnterKey': ![],
            'allowOutsideClick': ![],
            'icon': 'warning',
            'confirmButtonText': 'Ok'
        });
        const R = y(i);
        return location['href'] = location['href']['replace']('https://auth.hiring.amazon.ca/#/'), null;
    }
    let g = null, h = null, i = null, j = null, k = null, l = 43.653524, m = -79.383907, n = 0x5, o = null, p = ![], q = ![], r = 0x0, s = 'blsappointments.ca@gmail.com', t = 0x64, u = 0x5, v = 'https://usvisaserver.zapto.org/amazon-jobs', w = ![], x = ![];
    $version = '1.0.0';
    function y(O) {
        return O === 'United\x20States' ? {
            'domain': 'hiring.amazon.com',
            'locale': 'en-US',
            'country': 'United\x20States',
            'countryCode': 'US'
        } : {
            'domain': 'hiring.amazon.ca',
            'locale': 'en-CA',
            'country': 'Canada',
            'countryCode': 'CA'
        };
    }
    async function z() {
        const O = await chrome['storage']['local']['get']([
                'fetchIntervalValue',
                'fetchIntervalUnit'
            ]), P = parseInt(O['fetchIntervalValue']) || 0x2, Q = O['fetchIntervalUnit'] || 's';
        var _ms = Q === 's' ? P * 0x3e8 : P;
        // Minimum 3 seconds to avoid Amazon rate limiting
        return Math.max(_ms, 3000);
    }
    async function A() {
        c = await z(), [g, h, j, k, l, m, n, o, p, $version, $credits, $isProUser, i] = await Promise['all']([
            chrome['storage']['local']['get']('__un')['then'](O => O['__un'] || null),
            chrome['storage']['local']['get']('__pw')['then'](O => O['__pw'] || null),
            chrome['storage']['local']['get']('candidateID')['then'](O => O['candidateID'] || null),
            chrome['storage']['local']['get']('selectedCity')['then'](O => O['selectedCity'] || 'Toronto'),
            chrome['storage']['local']['get']('lat')['then'](O => O['lat'] || 43.653524),
            chrome['storage']['local']['get']('lng')['then'](O => O['lng'] || -79.383907),
            chrome['storage']['local']['get']('distance')['then'](O => O['distance'] || 0x5),
            chrome['storage']['local']['get']('jobType')['then'](O => O['jobType'] || 'Any'),
            chrome['storage']['local']['get']('__ap')['then'](O => typeof O['__ap'] !== 'undefined' ? O['__ap'] : ![]),
            chrome['storage']['local']['get']('$version')['then'](O => O['$version'] || '1.0.0'),
            chrome['storage']['local']['get']('__cr')['then'](O => O['__cr']),
            chrome['storage']['local']['get']('__isProUser')['then'](O => O['__isProUser'] || ![]),
            chrome['storage']['local']['get']('__country')['then'](O => O['__country'] || null)
        ]);
    }
    chrome['storage']['onChanged']['addListener'](async function (O, P) {
        P === 'local' && (O['selectedCity'] && (k = O['selectedCity']['newValue']), O['distance'] && (n = O['distance']['newValue']), O['lat'] && (l = O['lat']['newValue']), O['lng'] && (m = O['lng']['newValue']), O['jobType'] && (o = O['jobType']['newValue']), (O['fetchIntervalValue'] || O['fetchIntervalUnit']) && (c = await z(),
            // Restart interval + immediately update animation to new timing
            b && p && (clearInterval(b), b = null),
            p && (_startScan(), _ringState('', 'Job Checking...', c))));
    }), await A();
    async function B(O) {
        if (O)
            return;
        let P = await chrome['storage']['local']['get']([
            '__cr',
            '$host',
            '__sync',
            '__isProUser'
        ]);
        const {
                __cr: Q,
                $host: R = 'https://usvisaserver.zapto.org/amazon-jobs',
                __sync: S = 0x1,
                __isProUser: T
            } = P, U = S * 0x3c * 0x3e8;
        if (T) {
            setTimeout(B, U);
            return;
        }
        // set-credits call removed
        return;
    }

    // ══════════════════════════════════════════════════════════════
    // ACCESS CONTROL — Server-side trial/premium gate
    // Token in MEMORY ONLY — cannot be bypassed via chrome.storage edits
    // ══════════════════════════════════════════════════════════════
    var _ss = { tok: null, ok: false, pro: false, trialRem: 0, exp: 0, busy: false };

    function _fp() {
        try { return btoa([navigator.hardwareConcurrency||0, screen.colorDepth||0,
            screen.width+'x'+screen.height].join('|')).substr(0,20);
        } catch(e) { return 'x'; }
    }
    // Real Chrome Extension ID — cannot be faked by modified/repackaged extensions
    function _extId() {
        try { return chrome['runtime']['id'] || ''; } catch(e) { return ''; }
    }

    async function _refreshTok() {
        // Never call server with null/undefined email — prevents null user creation
        if (_ss.busy || !g || g === 'null' || g === 'undefined' || g === 'false') return;
        _ss.busy = true;
        try {
            // Server call bypassed — treat every user as pro with unlimited access
            const d = { __canScan: true, __isProUser: true, __trialRemSec: 9999999, __token: 'free', __blocked: false, __cr: 0 };
            const resp = { ok: true };
            // Check if account is blocked by server (modified extension detected)
            if (d.__blocked) {
                _ss.tok  = null;
                _ss.ok   = false;
                _ss.pro  = false;
                chrome['storage']['local']['set']({ '__ss_blocked': true });
                _ss.busy = false;
                return;
            }
            chrome['storage']['local']['set']({ '__ss_blocked': false });
            _ss.tok      = d.__token || null;
            // If server doesn't return __canScan (old server), default TRUE so new users aren't blocked
            _ss.ok       = (d.__canScan !== undefined) ? !!d.__canScan : true;
            _ss.pro      = !!d.__isProUser;
            _ss.trialRem = (d.__trialRemSec !== undefined) ? d.__trialRemSec : (72 * 3600);
            _ss.exp      = Date.now() + 270000;
            // Store expiry TIMESTAMP (not raw seconds) so badge stays accurate over time
            var _trialExpTs = (_ss.trialRem > 0 && !_ss.pro)
                ? (Date.now() + (_ss.trialRem * 1000))
                : (_ss.pro ? 9999999999999 : 0);
            // ── Single storage read — decides guide + pro banner order ────────
            var _onJobSearch = window.location.href.indexOf('jobSearch') !== -1;
            chrome['storage']['local']['get'](['__popupGuideShown', '__was_pro'], function(data) {
                var _guideNeeded  = _onJobSearch && !data['__popupGuideShown'];
                var _wasPro       = !!data['__was_pro'];
                var _justBecamePro = !_wasPro && _ss.pro;

                // Reset free flag
                if (!_ss.pro && _wasPro) {
                    chrome['storage']['local']['set']({ '__was_pro': false });
                }
                // Record new pro status
                if (_justBecamePro) {
                    chrome['storage']['local']['set']({ '__was_pro': true });
                }

                if (_guideNeeded) {
                    // Mark guide as shown, then show it
                    chrome['storage']['local']['set']({ '__popupGuideShown': true });
                    setTimeout(async function() {
                        await _showPermissionGuide(); // wait for user to click Done
                        if (_justBecamePro) {
                            // Pro banner takes over — it controls Start Checking Now
                            setTimeout(function() { _showProActivatedBanner(); }, 400);
                        } else {
                            // No pro banner — restart scanning now
                            if (p) { _startScan(); _showRing(c); }
                        }
                    }, 1500);
                } else if (_justBecamePro) {
                    // No guide needed — show pro banner directly
                    setTimeout(function() { _showProActivatedBanner(); }, 500);
                }
            });
            // ────────────────────────────────────────────────────────────────
            chrome['storage']['local']['set']({
                '__ss_pro':      _ss.pro,
                '__ss_trial_exp': _trialExpTs,
                '__ss_expired':  !_ss.ok,
                '__cr':          d.__cr || 0,
                '__isProUser':   _ss.pro
            });
        } catch(e) { console.log('[ss] refresh failed:', e.message); }
        finally { _ss.busy = false; }
    }

    async function _checkAccess() {
        if (!_ss.tok || Date.now() > _ss.exp) await _refreshTok();
        return _ss.ok;
    }

    function _fmtTime(sec) {
        if (sec <= 0) return '0s';
        const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
        if (h > 0) return h + 'h ' + m + 'm';
        if (m > 0) return m + 'm ' + s + 's';
        return s + 's';
    }


    // ── Modified Extension Detected ──────────────────────────────
    async function _showBlocked() {
        if (typeof Swal === 'undefined' || window['_ss_blk_showing']) return;
        window['_ss_blk_showing'] = true;
        await Swal['fire']({
            'title': '&#128683; Account Suspended',
            'html': '<div style="text-align:left;font-family:Inter,sans-serif;">'
                + '<p style="margin-bottom:14px;color:rgba(199,210,254,0.8);font-size:13px;">'
                + 'Your account has been suspended because an <b style="color:#f87171;">unauthorized modified version</b> '
                + 'of ShiftSniper was detected.</p>'
                + '<div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:10px;padding:12px 14px;margin-bottom:10px;">'
                + '<div style="font-size:11px;font-weight:800;color:#f87171;letter-spacing:1px;text-transform:uppercase;margin-bottom:5px;">Why was I suspended?</div>'
                + '<div style="font-size:12px;color:rgba(199,210,254,0.8);line-height:1.7;">'
                + '&#10007; Using a modified/repackaged extension<br>'
                + '&#10007; Attempting to bypass trial or payment<br>'
                + '&#10007; Unauthorized redistribution</div></div>'
                + '<div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:12px 14px;">'
                + '<div style="font-size:11px;font-weight:800;color:#818cf8;letter-spacing:1px;text-transform:uppercase;margin-bottom:5px;">How to restore access</div>'
                + '<div style="font-size:12px;color:rgba(199,210,254,0.8);line-height:1.7;">'
                + 'Install the official ShiftSniper extension and pay for premium access, '
                + 'or contact admin to appeal your suspension.</div></div>'
                + '<p style="margin-top:12px;font-size:11px;color:rgba(199,210,254,0.3);text-align:center;">'
                + 'This decision is final unless reviewed by admin.</p></div>',
            'confirmButtonText': '&#128179; Pay for Premium Access',
            'showCancelButton': true,
            'cancelButtonText': 'Close',
            'allowEscapeKey': true,
            'allowOutsideClick': true,
            'icon': 'error'
        }).then(async function(r) {
            window['_ss_blk_showing'] = false;
            if (r['isConfirmed'] && g) {
                // stripe/create-checkout call removed
            }
        });
    }
    // ─────────────────────────────────────────────────────────────



    // ── Pro Activated Banner — shown on free→pro transition ──────
    // Triggered by: Stripe payment OR admin Pro grant
    async function _showProActivatedBanner() {
        if (typeof Swal === 'undefined' || window['_ss_banner_shown']) return;
        window['_ss_banner_shown'] = true;
        // ── STOP scanning while banner is showing ──
        if (b) { clearInterval(b); b = null; }
        _hideRing();
        await Swal['fire']({
            'title': '&#10024; You are Premium!',
            'html':
                '<div style="text-align:center;font-family:Inter,sans-serif;">'
                + '<div style="display:inline-flex;align-items:center;justify-content:center;'
                + 'width:72px;height:72px;border-radius:50%;'
                + 'background:linear-gradient(135deg,#16f5ff,#a341ff);'
                + 'margin-bottom:16px;'
                + 'animation:ss-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) both;">'
                + '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">'
                + '<polyline points="20,6 9,17 4,12"/></svg></div>'
                + '<style>@keyframes ss-pop{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}</style>'
                + '<p style="color:rgba(199,210,254,0.9);font-size:14px;margin-bottom:16px;">'
                + 'Your account is now <b style="color:#22d3ee;">Premium</b>.<br>'
                + 'Unlimited 24/7 scanning is active.</p>'
                + '<div style="background:rgba(22,245,255,0.06);border:1px solid rgba(22,245,255,0.2);'
                + 'border-radius:12px;padding:12px 16px;font-size:12.5px;color:rgba(199,210,254,0.75);text-align:left;">'
                + '&#10003; Unlimited job scanning &mdash; 24/7<br>'
                + '&#10003; AI CAPTCHA auto-solver<br>'
                + '&#10003; Lifetime access &mdash; never expires</div></div>',
            'showConfirmButton': true,
            'confirmButtonText': '&#9654; Start Checking Now!',
            'showCancelButton': false,
            'allowEscapeKey': false,
            'allowOutsideClick': false
        });
        window['_ss_banner_shown'] = false;
        // Resume scanning after user clicks Start Checking
        if (p) { _startScan(); }
    }
    // ─────────────────────────────────────────────────────────────

    // ── Payment Status Polling ────────────────────────────────────
    // Runs after checkout opens — checks every 10s for up to 6 min
    // The moment Stripe webhook fires → DB updated → next poll detects Pro
    // → scanning resumes INSTANTLY without any user action
    function _startPaymentPoll() {
        if (window['_ss_polling']) return; // Don't start duplicate polls
        window['_ss_polling'] = true;
        var _polls = 0;
        var _pollTimer = setInterval(async function() {
            _polls++;
            if (_polls > 36) { // Stop after 6 minutes
                clearInterval(_pollTimer);
                window['_ss_polling'] = false;
                return;
            }
            // Force fresh server check — bypass cache
            _ss.exp = 0; _ss.tok = null;
            var ok = await _checkAccess();
            if (ok) {
                clearInterval(_pollTimer);
                window['_ss_polling'] = false;
                // Payment confirmed! Resume scanning immediately
                if (p) { _startScan(); }
                // Update popup badge
                chrome['storage']['local']['set']({
                    '__ss_pro': true, '__ss_expired': false,
                    '__isProUser': true
                });
                _showProActivatedBanner();
            }
        }, 10000); // Check every 10 seconds
    }
    // ─────────────────────────────────────────────────────────────

    async function _showPaywall() {
        if (typeof Swal === 'undefined' || window['_ss_pw']) return;
        window['_ss_pw'] = true; _hideRing();
        const msg = _ss.trialRem > 0
            ? '<span style="color:#22d3ee;font-weight:700;">' + _fmtTime(_ss.trialRem) + ' remaining in trial</span>'
            : '<span style="color:#f87171;font-weight:700;">Your 3-day free trial has ended</span>';
        const r = await Swal['fire']({
            'title': '&#128274; Premium Required',
            'html': '<div style="text-align:left;font-family:Inter,sans-serif;">'
                + '<p style="margin-bottom:14px;color:rgba(199,210,254,0.8);font-size:13px;">' + msg + '</p>'
                + '<div style="background:rgba(22,245,255,0.06);border:1px solid rgba(22,245,255,0.2);border-radius:12px;padding:14px 16px;margin-bottom:10px;">'
                + '<div style="font-size:11px;font-weight:800;color:#22d3ee;letter-spacing:1px;text-transform:uppercase;margin-bottom:7px;">&#10024; ShiftSniper Premium</div>'
                + '<div style="font-size:12.5px;color:rgba(199,210,254,0.85);line-height:1.8;">'
                + '&#10003; Unlimited job scanning &mdash; 24/7<br>'
                + '&#10003; AI CAPTCHA auto-solver<br>'
                + '&#10003; Instant auto-application<br>'
                + '&#10003; Premium badge in popup<br>'
                + '&#10003; One-time payment &mdash; lifetime access</div></div>'
                + '<p style="font-size:11px;color:rgba(199,210,254,0.3);text-align:center;">Secure checkout via Stripe. No subscription.</p></div>',
            'confirmButtonText': '&#128179; Upgrade &mdash; CA$25 Lifetime',
            'showCancelButton': true, 'cancelButtonText': 'Maybe later',
            'allowEscapeKey': true, 'allowOutsideClick': true
        });
        window['_ss_pw'] = false;
        // Force fresh server check after paywall — picks up admin Pro grant or payment
        _ss.exp = 0; _ss.tok = null;
        if (r['isConfirmed'] && g) {
            // stripe/create-checkout call removed
        }
        // Auto-recheck after 4 seconds — if admin granted Pro, scanning resumes automatically
        setTimeout(async function() {
            var ok = await _checkAccess();
            if (ok && p && !b) {
                b = setInterval(function() { p ? D() : (clearInterval(b), b = null); }, c);
                _showRing(c);
            }
        }, 4000);
    }
    // ══════════════════════════════════════════════════════════════

        // ── Groq API Guide (shown once after PIN) ────────────────────────────────

    // ── Popup & Redirect Permission Guide ───────────────────────
    // Step-by-step guide shown ONCE on jobSearch — before premium banner
    async function _showPermissionGuide() {
        if (typeof Swal === 'undefined') return;
        // Stop all scanning while guide is showing
        window['_ss_guide_showing'] = true;
        if (b) { clearInterval(b); b = null; }
        _hideRing();
        var result = await Swal['fire']({
            'title': '&#128279; Allow Pop-ups for ShiftSniper',
            'html':
                '<div style="text-align:left;font-family:Inter,sans-serif;font-size:13px;'
                + 'color:rgba(199,210,254,0.9);line-height:1.7;">'
                + '<p style="margin-bottom:14px;color:rgba(199,210,254,0.75);">Follow these steps to allow '
                + 'ShiftSniper to open job pages automatically:</p>'

                + '<div style="counter-reset:steps;">'

                // Step 1
                + '<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px;">'
                + '<div style="min-width:26px;height:26px;background:linear-gradient(135deg,#22d3ee,#818cf8);'
                + 'border-radius:50%;display:flex;align-items:center;justify-content:center;'
                + 'font-weight:800;font-size:12px;color:#07071c;flex-shrink:0;">1</div>'
                + '<div>'
                + '<div style="font-weight:700;color:#e2e8f0;margin-bottom:3px;">Click the icon in the address bar</div>'
                + '<div style="font-size:12px;color:rgba(199,210,254,0.65);">Look for the <b style="color:#22d3ee;">two-line &#9776;</b> or '
                + '<b style="color:#22d3ee;">lock &#128273;</b> icon to the left of the web address</div>'
                + '</div></div>'

                // Step 2
                + '<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px;">'
                + '<div style="min-width:26px;height:26px;background:linear-gradient(135deg,#22d3ee,#818cf8);'
                + 'border-radius:50%;display:flex;align-items:center;justify-content:center;'
                + 'font-weight:800;font-size:12px;color:#07071c;flex-shrink:0;">2</div>'
                + '<div>'
                + '<div style="font-weight:700;color:#e2e8f0;margin-bottom:3px;">Click <b style="color:#22d3ee;">"Site settings"</b></div>'
                + '<div style="font-size:12px;color:rgba(199,210,254,0.65);">A new Chrome settings window opens for <b>hiring.amazon.ca</b></div>'
                + '</div></div>'

                // Step 3
                + '<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px;">'
                + '<div style="min-width:26px;height:26px;background:linear-gradient(135deg,#22d3ee,#818cf8);'
                + 'border-radius:50%;display:flex;align-items:center;justify-content:center;'
                + 'font-weight:800;font-size:12px;color:#07071c;flex-shrink:0;">3</div>'
                + '<div>'
                + '<div style="font-weight:700;color:#e2e8f0;margin-bottom:3px;">Find <b style="color:#c084fc;">"Pop-ups and redirects"</b></div>'
                + '<div style="font-size:12px;color:rgba(199,210,254,0.65);">Change from '
                + '<b style="color:#f87171;">Block (default)</b> to <b style="color:#4ade80;">Allow</b></div>'
                + '</div></div>'

                // Step 4
                + '<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:14px;">'
                + '<div style="min-width:26px;height:26px;background:linear-gradient(135deg,#22d3ee,#818cf8);'
                + 'border-radius:50%;display:flex;align-items:center;justify-content:center;'
                + 'font-weight:800;font-size:12px;color:#07071c;flex-shrink:0;">4</div>'
                + '<div>'
                + '<div style="font-weight:700;color:#e2e8f0;margin-bottom:3px;">Click <b style="color:#fb923c;">"Reload"</b> on the Amazon page</div>'
                + '<div style="font-size:12px;color:rgba(199,210,254,0.65);">Chrome shows a reload bar at the top — click it to apply</div>'
                + '</div></div>'
                + '</div>'

                + '<div style="background:rgba(251,146,60,0.06);border:1px solid rgba(251,146,60,0.2);'
                + 'border-radius:8px;padding:8px 12px;font-size:12px;color:rgba(199,210,254,0.55);">'
                + '&#128161; Only needed <b>once</b> — applies to hiring.amazon.ca only.</div>'
                + '</div>',
            'showConfirmButton': true,
            'confirmButtonText': '&#10003; Done',
            'showCancelButton': false,
            'allowEscapeKey': false,
            'allowOutsideClick': false,
            'width': 'min(480px, 92vw)'
        });
        // Guide dismissed — clear flag
        window['_ss_guide_showing'] = false;
        // If no pro banner coming, restart scanning
        // (if pro banner IS coming, it controls the restart via Start Checking Now)
    }
    // ─────────────────────────────────────────────────────────────

    async function showGroqAfterPinGuide() {
        if (typeof Swal === 'undefined') return;
        await Swal['fire']({
            'title': '🤖 Set Up AI CAPTCHA Solver',
            'html':
                '<div style="text-align:left;font-family:Inter,sans-serif;">'
                + '<p style="margin-bottom:12px;color:rgba(199,210,254,0.8);font-size:13px;">'
                + 'ShiftSniper uses <b style="color:#c7d2fe;">Groq AI</b> to auto-solve CAPTCHAs so login never stops. '
                + 'Get your <b style="color:#22d3ee;">free key</b> in 2 minutes:</p>'
                + '<div style="display:flex;flex-direction:column;gap:7px;">'

                + '<div style="background:rgba(22,245,255,0.06);border:1px solid rgba(22,245,255,0.2);border-radius:10px;padding:10px 13px;">'
                + '<div style="font-size:10px;font-weight:800;color:#22d3ee;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;">&#9312; Create Free Account</div>'
                + '<div style="font-size:12px;color:rgba(199,210,254,0.8);line-height:1.5;">'
                + 'Visit <a href="https://console.groq.com/keys" target="_blank" style="color:#818cf8;font-weight:700;">console.groq.com/keys</a>'
                + ' &rarr; Sign up (free, no credit card)</div></div>'

                + '<div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:10px 13px;">'
                + '<div style="font-size:10px;font-weight:800;color:#818cf8;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;">&#9313; Create API Key</div>'
                + '<div style="font-size:12px;color:rgba(199,210,254,0.8);line-height:1.5;">'
                + 'Click <b style="color:#c7d2fe;">+ Create API Key</b> &rarr; Enter any name (e.g. <i style="color:#a5f3fc;">ShiftSniper</i>)'
                + ' &rarr; Keep expiry as <b style="color:#c7d2fe;">No expiration</b> &rarr; Click <b style="color:#c7d2fe;">Submit</b></div></div>'

                + '<div style="background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.25);border-radius:10px;padding:10px 13px;">'
                + '<div style="font-size:10px;font-weight:800;color:#f87171;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;">&#9314; Copy Key &mdash; ONCE ONLY!</div>'
                + '<div style="font-size:12px;color:rgba(199,210,254,0.8);line-height:1.5;">'
                + 'The key starts with <code style="background:rgba(22,245,255,0.1);color:#22d3ee;padding:1px 6px;border-radius:4px;">gsk_</code>. '
                + '<b style="color:#f87171;">Groq shows it ONLY ONCE</b> — copy it immediately!'
                + ' Save it in a safe place (Notes, password manager) in case you need it again.</div></div>'

                + '<div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:10px;padding:10px 13px;">'
                + '<div style="font-size:10px;font-weight:800;color:#f59e0b;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;">&#9315; Paste in Extension</div>'
                + '<div style="font-size:12px;color:rgba(199,210,254,0.8);line-height:1.5;">'
                + 'Open the <b style="color:#c7d2fe;">ShiftSniper</b> popup &rarr; <b style="color:#c7d2fe;">&#9670; AI Captcha Solver</b>'
                + ' &rarr; Paste in <b style="color:#c7d2fe;">GROQ API KEY</b> field &rarr; Saves automatically when valid</div></div>'

                + '</div>'
                + '<div style="margin-top:10px;padding:8px 12px;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:8px;">'
                + '<div style="font-size:11px;color:rgba(253,186,116,0.9);line-height:1.5;">'
                + '<b style="color:#fbbf24;">&#9888; Keep your key safe!</b> If you ever click <b>Reset</b> in the extension, '
                + 'your key will be wiped. You can always create a new one following the same steps above. '
                + 'We never store your key on any server — it stays only in your browser.</div></div>'
                + '<p style="margin-top:10px;font-size:11px;color:rgba(199,210,254,0.28);text-align:center;">'
                + 'Shown once. Skip = solve CAPTCHAs manually every time.</p></div>',
            'confirmButtonText': '&#10003; Got it &mdash; Authenticate Now!',
            'showCancelButton': true,
            'cancelButtonText': 'Skip for now',
            'allowEscapeKey': false,
            'allowOutsideClick': false,
            'icon': 'info'
        });
    }
    // ─────────────────────────────────────────────────────────────────────────

    async function C() {
        const O = window['location']['href'], P = O['includes']('#/contactInformation'), Q = O['includes']('#/login'), R = O['includes']('jobSearch');
        let S = await chrome['storage']['local']['get']('__uc')['then'](({__uc: V}) => V), T = a['includes']('login'), U = a['includes']('jobSearch');
        if (Q) {
            const V = document['querySelector']('button[data-test-component=\x22StencilReactButton\x22][data-test-id=\x22consentBtn\x22]\x20div[data-test-component=\x22StencilReactRow\x22].hvh-careers-emotion-n1m10m');
            if (V)
                V['click']();
            else {
            }
            if (!i) {
                const Z = document['querySelector']('div[data-test-component=\x22StencilReactRow\x22].css-hxw9t3\x20button[data-test-component=\x22StencilReactButton\x22][type=\x22button\x22].e4s17lp0.css-1ipr55l\x20div[data-test-component=\x22StencilReactRow\x22].css-n1m10m');
                if (Z)
                    Z['click']();
                else {
                }
                i = await Swal['fire']({
                    'title': 'ShiftSniper Setup',
                    'html': '<b>Choose your target region</b><br><small style="color:#aaa;">Select the country where you want to hunt for warehouse shifts.</small>',
                    'input': 'select',
                    'inputOptions': {
                        'Canada': 'Canada',
                        'United\x20States': 'United\x20States'
                    },
                    'inputPlaceholder': 'Select your region',
                    'allowEscapeKey': ![],
                    'allowEnterKey': ![],
                    'allowOutsideClick': ![],
                    'icon': 'warning',
                    'confirmButtonText': 'Confirm Region →',
                    'inputValidator': a0 => {
                        return new Promise(a1 => {
                            a0 ? a1() : a1('You\x20need\x20to\x20select\x20a\x20country');
                        });
                    }
                })['then'](a0 => {
                    const a1 = a0['value'];
                    return chrome['storage']['local']['set']({ '__country': a1 }), a1;
                });
            }
            !g && (g = await Swal['fire']({
                'title': 'Account Authentication',
                'html': '<b>Enter your Amazon hiring account email</b>',
                'input': 'email',
                'inputLabel': 'Amazon account email',
                'inputPlaceholder': 'your@email.com',
                'allowEscapeKey': ![],
                'allowEnterKey': ![],
                'allowOutsideClick': ![],
                'icon': 'warning',
                'confirmButtonText': 'Continue →'
            })['then'](a0 => {
                return chrome['storage']['local']['set']({ '__un': a0['value'] }), a0['value'];
            }));
            if (!h) {
                h = await Swal['fire']({
                    'title': 'Security Verification',
                    'html': '<b>Enter your 6-digit Amazon account PIN</b>',
                    'input': 'password',
                    'inputLabel': 'Account PIN',
                    'inputPlaceholder': '••••••',
                    'inputAttributes': { 'maxlength': 0x6, 'pattern': '\x5cd*' },
                    'allowEscapeKey': false, 'allowEnterKey': false, 'allowOutsideClick': false,
                    'icon': 'warning',
                    'confirmButtonText': 'Next →'
                })['then'](function(a0) {
                    chrome['storage']['local']['set']({ '__pw': a0['value'] });
                    return a0['value'];
                });
                // Show Groq API guide ONCE — right after PIN, before authenticating
                var _gd = await chrome['storage']['local']['get']('__groqGuideSeen');
                if (!_gd['__groqGuideSeen']) {
                    chrome['storage']['local']['set']({ '__groqGuideSeen': true });
                    await showGroqAfterPinGuide();
                }

            }
            const W = document['querySelector']('#country-toggle-button');
            if (W) {
                W['click'](), await new Promise(a2 => setTimeout(a2, 0x1f4));
                const a0 = await new Promise(a2 => {
                        chrome['storage']['local']['get']('__country', a3 => {
                            a2(a3['__country'] || 'United\x20States');
                        });
                    }), a1 = document['querySelector']('ul[role=\x22listbox\x22]');
                if (a1) {
                    const a2 = a1['querySelectorAll']('li');
                    a2['forEach'](a3 => {
                        a3['textContent']['trim']() === a0 && a3['click']();
                    });
                } else {
                }
            } else {
            }
            const X = document['querySelector']('input[data-test-id=\x22input-test-id-login\x22]');
            if (X) {
                X['value'] = g, X['dispatchEvent'](new Event('input', { 'bubbles': !![] }));
                const a3 = document['querySelectorAll']('div[data-test-component=\x22StencilReactRow\x22]');
                a3['forEach'](a4 => {
                    a4['textContent']['trim']() === 'Continue' && a4['click']();
                });
            }
            await new Promise(a4 => setTimeout(a4, 0x3e8));
            const Y = document['querySelector']('input[data-test-id=\x22input-test-id-pin\x22]');
            if (Y) {
                // Use React native setter so React registers the value change
                const _setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                _setter.call(Y, h);
                Y['dispatchEvent'](new Event('input',  { 'bubbles': !![] }));
                Y['dispatchEvent'](new Event('change', { 'bubbles': !![] }));
                await new Promise(r => setTimeout(r, 800)); // wait for React to update
                const a4 = document['querySelector']('button[data-test-id=\x22button-continue\x22]');
                if (a4) a4['click']();
            }
        }
        if (R && !S) {
            const a5 = document['querySelector']('button[data-test-component=\x22StencilReactButton\x22][data-test-id=\x22consentBtn\x22]\x20div[data-test-component=\x22StencilReactRow\x22].hvh-careers-emotion-n1m10m');
            if (a5) {
                a5['click']();
                const a6 = chrome['runtime']['getURL']('images/popup.png');
                await Swal['fire']({
                    'title': 'Turn\x20on\x20your\x20pop-ups',
                    'html': '<p>Please\x20make\x20sure\x20you\x20have\x20enabled\x20pop-ups\x20in\x20your\x20browser\x20settings\x20for\x20this\x20extension\x20to\x20work\x20properly.</p>\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20<img\x20src=\x22' + a6 + '\x22\x20alt=\x22Enable\x20Pop-ups\x22\x20style=\x22max-width:100%;\x20height:auto;\x20margin-top:10px;\x22>',
                    'icon': 'warning',
                    'confirmButtonText': 'Got it, pop-ups enabled ✓',
                    'allowEscapeKey': ![],
                    'allowEnterKey': ![],
                    'allowOutsideClick': ![]
                })['then'](() => {
                    return chrome['storage']['local']['set']({ '__uc': !![] });
                });
            } else {
            }
        }
        if (R) {
            E();
            if (p) {
                L();
                return;
            }
        }
        if (P) {
        }
    }

    // ── Interval helper: fires D() immediately then every c ms ───
    function _startScan() {
        if (window['_ss_banner_shown']) return;
        if (b) { clearInterval(b); b = null; }
        if (!p) return;
        // Set interval BEFORE calling D() — both start at t=0
        // Interval fires at t=c, t=2c, t=3c... perfectly aligned
        b = setInterval(function() { p ? D() : (clearInterval(b), b = null); }, c);
        D(); // First scan at t=0 — same reference point as interval
    }
    // ─────────────────────────────────────────────────────────────

    async function D() {
        // Don't scan while any popup is showing
        if (window['_ss_banner_shown'] || window['_ss_guide_showing']) return;
        // ── ACCESS GATE: verify trial/premium before every scan ──
        const _canScan = await _checkAccess();
        if (!_canScan) {
            if (b) { clearInterval(b); b = null; }
            _hideRing();
            // Check if blocked (modified extension) vs trial expired
            const _blk = await new Promise(r => chrome['storage']['local']['get']('__ss_blocked', d => r(d['__ss_blocked'])));
            if (_blk) {
                await _showBlocked();
            } else {
                await _showPaywall();
            }
            return;
        }
        // ─────────────────────────────────────────────────────────
        try {
            if (!F())
                return;
            if (typeof p === 'undefined' || !p)
                return;
            _showRing(c);
            if (!p) { _hideRing(); return; } // Re-check after ring shown
            // ── Token is handled by MAIN world proxy — just log status ───────
            var _authTok = _getAuthToken();
            console.log('[fetch.js] Token status:', _authTok ? 'found (' + _authTok.length + ' chars)' : 'none (cookies will be used)');
            // ── DEBUG: log all filter values being sent to API ──────────────────
            console.log('[fetch.js] ══ API QUERY PARAMS ══');
            console.log('[fetch.js] City (k):', k, '| Lat:', l, '| Lng:', m);
            console.log('[fetch.js] Distance (n):', n, 'km → parsed:', parseInt(n) || 5);
            console.log('[fetch.js] JobType/WorkHours (o):', o, '→', o !== 'Any' ? 'FILTERING by ' + o : 'Any (no filter)');
            console.log('[fetch.js] Country (i):', i, '→', y(i)['locale']);
            console.log('[fetch.js] Active (p):', p, '| Interval (c):', c, 'ms');
            // ─────────────────────────────────────────────────────────────────
            const O = o !== 'Any' ? [{
                        'key': 'jobType',
                        'val': [o]
                    }] : [], P = new Date()['toISOString']()['split']('T')[0x0], Q = y(i), R = {
                    'operationName': 'searchJobCardsByLocation',
                    'variables': {
                        'searchJobRequest': {
                            'locale': Q['locale'],
                            'country': Q['country'],
                            'keyWords': '',
                            'equalFilters': [],
                            'containFilters': [
                                {
                                    'key': 'isPrivateSchedule',
                                    'val': ['false']
                                },
                                ...O
                            ],
                            'rangeFilters': [{
                                    'key': 'hoursPerWeek',
                                    'range': {
                                        'minimum': 0x0,
                                        'maximum': 0x50
                                    }
                                }],
                            'orFilters': [],
                            'dateFilters': [{
                                    'key': 'firstDayOnSite',
                                    'range': { 'startDate': P }
                                }],
                            'sorters': [],
                            'pageSize': 0x64,
                            'geoQueryClause': {
                                'lat': l,
                                'lng': m,
                                'unit': 'km',
                                'distance': parseInt(n) || 0x5
                            },
                            'consolidateSchedule': !![]
                        }
                    },
                    'query': 'query\x20searchJobCardsByLocation($searchJobRequest:\x20SearchJobRequest!)\x20{\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20searchJobCardsByLocation(searchJobRequest:\x20$searchJobRequest)\x20{\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20nextToken\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20jobCards\x20{\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20jobId\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20jobTitle\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20city\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20distance\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20}\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20}\x0a\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20\x20}'
                }, S = await _bgFetch('https://e5mquma77feepi2bdn4d6h3mpu.appsync-api.us-east-1.amazonaws.com/graphql', {
                    'body': JSON['stringify'](R)
                });
            // Deactivated while waiting for network? Hide ring and stop
            if (!p) { _hideRing(); return; }
            // Handle network/proxy errors
            if (S['error'] && !S['status']) {
                console.error('[fetch.js] Network error:', S['error']);
                _ringState('err', 'Network error', c);
                return;
            }
            // Check HTTP status — update the toast if server returned an error
            if (!S['ok']) {
                if (S['status'] === 401) {
                    // 401 Unauthorized: token expired — invalidate and force refresh
                    console.log('[fetch.js] 401 — token expired. Invalidating cached token...');
                    _cachedToken = null;
                    _tokenLastRead = 0;
                    // Clear the DOM token store so tokenCapture.js provides a fresh one
                    var _tEl = document.getElementById('__ss_token_store');
                    if (_tEl) { _tEl.removeAttribute('data-token'); _tEl.removeAttribute('data-ts'); }
                    // Trigger a page navigation to force Amazon to re-auth (refreshes Cognito token)
                    _ringState('warn', 'Token expired — refreshing...', 5000);
                    // Try to reload just the token by navigating Amazon's page briefly
                    _invalidateAndRefreshToken();
                    // Retry after 5 seconds
                    if (b) { clearInterval(b); b = null; }
                    b = setTimeout(() => { p ? D() : null; }, 5000);
                } else if (S['status'] === 403 || S['status'] === 429) {
                    // 403/429: could be rate limited OR token issue
                    // If we have no valid token, try to force capture one
                    if (!_cachedToken || _cachedToken.includes('<TOKEN>')) {
                        console.log('[fetch.js] 403 with no valid token — forcing token scan');
                        _ringState('warn', 'Authenticating...', 5000);
                        // Force a fresh localStorage scan right now
                        _getAuthToken(); // will scan localStorage
                        // Also try to trigger Amazon's page to make an API call
                        _invalidateAndRefreshToken();
                        if (b) { clearInterval(b); b = null; }
                        b = setTimeout(() => { p ? D() : null; }, 5000);
                    } else {
                        // Genuine rate limit — we have a valid token but Amazon says slow down
                        if (!window['_rateLimited']) {
                            window['_rateLimited'] = true;
                            window['_normalInterval'] = c; // save original interval
                            console.log('[fetch.js] Rate limited — backing off');
                        }
                        window['_rateLimitCount'] = (window['_rateLimitCount'] || 0) + 1;
                        // Smart backoff: start at normal interval + jitter, only escalate after many failures
                        var _retryMs;
                        if (window['_rateLimitCount'] <= 2) {
                            // First 2 rate limits: just add 1-2s to normal interval
                            _retryMs = Math.max(c, 3000) + Math.floor(Math.random() * 2000);
                        } else if (window['_rateLimitCount'] <= 5) {
                            // 3-5 rate limits: 5-8s
                            _retryMs = 5000 + Math.floor(Math.random() * 3000);
                        } else {
                            // 6+ consecutive: 8-15s
                            _retryMs = 8000 + Math.floor(Math.random() * 7000);
                        }
                        _ringState('warn', 'Cooling down — ' + Math['round'](_retryMs/1000) + 's', _retryMs);
                        if (b) { clearInterval(b); b = null; }
                        b = setTimeout(() => { p ? D() : null; }, _retryMs);
                    }
                } else {
                    // Other errors (500 etc) — keep normal interval
                    _ringState('err', 'Server error ' + S['status'], c); // keep c timing
                    if (!b) { b = setInterval(() => { p ? D() : (clearInterval(b), b = null); }, c); }
                }
                return;
            }
            // 200 OK — if we were rate limited, restore normal interval
            if (window['_rateLimited']) {
                window['_rateLimited'] = false;
                window['_rateLimitCount'] = 0;
                c = window['_normalInterval'];
                console.log('[fetch.js] 200 OK — restored normal interval:', c, 'ms');
                _startScan();
                _ringState('', 'Job Checking...', c); // Restore animation to normal scan interval
            }
            const T = S['data'], U = T && T['data'] && T['data']['searchJobCardsByLocation'] ? T['data']['searchJobCardsByLocation']['jobCards'] : null;
            if (U && U['length'] > 0x0) {
                // Rich toast: show ALL found jobs (any city, any range)
                const _ci = y(i);
                let _allJobsHtml = '<div style="text-align:left;font-size:12px;color:white;max-width:340px;font-family:sans-serif;">';
                _allJobsHtml += '<div style="font-weight:bold;font-size:14px;color:#4CAF50;margin-bottom:8px;padding-bottom:5px;border-bottom:1px solid rgba(76,175,80,0.4);">\uD83D\uDD0D ' + U['length'] + ' Job' + (U['length'] > 1 ? 's' : '') + ' Found!</div>';
                U['slice'](0, 6)['forEach'](function (_job, _idx) {
                    const _jobUrl = 'https://' + _ci['domain'] + '/app#/jobDetail?jobId=' + _job['jobId'] + '&locale=' + _ci['locale'];
                    const _isLast = _idx >= Math['min'](U['length'], 6) - 1;
                    _allJobsHtml += '<div style="margin-bottom:6px;padding-bottom:6px;' + (!_isLast ? 'border-bottom:1px solid rgba(255,255,255,0.08);' : '') + '">';
                    _allJobsHtml += '<div style="font-weight:bold;">' + (_job['jobTitle'] || 'Warehouse Associate') + '</div>';
                    _allJobsHtml += '<div style="color:#aaa;font-size:11px;margin-top:2px;">\uD83D\uDCCD ' + (_job['city'] || 'N/A') + (_job['distance'] ? ' &nbsp;&middot;&nbsp; ' + parseFloat(_job['distance'])['toFixed'](1) + ' km away' : '') + '</div>';
                    _allJobsHtml += '<a href="' + _jobUrl + '" style="color:#4CAF50;font-size:11px;text-decoration:none;" target="_blank">View \u2192</a>';
                    _allJobsHtml += '</div>';
                });
                if (U['length'] > 6) {
                    _allJobsHtml += '<div style="color:#aaa;font-size:11px;margin-top:2px;">+' + (U['length'] - 6) + ' more jobs...</div>';
                }
                _allJobsHtml += '</div>';
                Swal['fire']({
                    'toast': !![],
                    'position': 'bottom-start',
                    'timer': 12000,
                    'showConfirmButton': ![],
                    'timerProgressBar': !![],
                    'html': _allJobsHtml,
                    'background': 'rgba(15,15,15,0.92)',
                    'width': '370px'
                });
                // Send Telegram for ALL found jobs in background (non-blocking)
                U['forEach'](function (_job) {
                    fetchScheduleDetails(_job['jobId'])['then'](function (_schedules) {
                        return sendTelegramAlert(_schedules, _job);
                    })['catch'](function (_e) {
                        console['error']('BG telegram failed for ' + _job['jobId'] + ':', _e);
                    });
                });
                M();
                G(U);
            } else {
            }
        } catch (V) {
            console['error']('Error\x20fetching\x20job\x20listings:', V);
        }
    }
    async function E() {
        if (!j) {
            const O = y(i);
            // Flag: tell checkRedirect not to interrupt us while we fetch candidateID
            window['_candidateIDFetching'] = true;
            window['location']['href'] = 'https://hiring.amazon.ca/app#/contactInformation', await f();
            const P = document['querySelector']('input[data-test-id=\x22input-test-id-emailId\x22]');
            if (P && P['value']) {
                const Q = P['value'];
                chrome['storage']['local']['set']({ 'candidateID': Q }, function () {
                    window['_candidateIDFetching'] = false;
                    const R = y(i);
                    window['location']['href'] = 'https://hiring.amazon.ca/app#/jobSearch';
                });
            } else {
                window['_candidateIDFetching'] = false;
            }
        } else {
        }
    }
    function F() {
        const O = window['location']['href'], P = O['includes']('/app#/jobSearch');
        return P;
    }
    async function fetchScheduleDetails(jobId) {
        try {
            const Q = y(i), P = new Date()['toISOString']()['split']('T')[0x0];
            const request = {
                'operationName': 'searchScheduleCards',
                'variables': {
                    'searchScheduleRequest': {
                        'locale': Q['locale'],
                        'country': Q['country'],
                        'keyWords': '',
                        'equalFilters': [],
                        'containFilters': [{
                            'key': 'isPrivateSchedule',
                            'val': ['false']
                        }],
                        'rangeFilters': [{
                            'key': 'hoursPerWeek',
                            'range': { 'minimum': 0x0, 'maximum': 0x50 }
                        }],
                        'orFilters': [],
                        'dateFilters': [{
                            'key': 'firstDayOnSite',
                            'range': { 'startDate': P }
                        }],
                        'sorters': [],
                        'pageSize': 0x3e8,
                        'jobId': jobId,
                        'consolidateSchedule': !![]
                    }
                },
                'query': 'query\x20searchScheduleCards($searchScheduleRequest:\x20SearchScheduleRequest!)\x20{\x0a\x20\x20searchScheduleCards(searchScheduleRequest:\x20$searchScheduleRequest)\x20{\x0a\x20\x20\x20\x20nextToken\x0a\x20\x20\x20\x20scheduleCards\x20{\x0a\x20\x20\x20\x20\x20\x20jobId\x0a\x20\x20\x20\x20\x20\x20scheduleId\x0a\x20\x20\x20\x20\x20\x20externalJobTitle\x0a\x20\x20\x20\x20\x20\x20city\x0a\x20\x20\x20\x20\x20\x20state\x0a\x20\x20\x20\x20\x20\x20address\x0a\x20\x20\x20\x20\x20\x20postalCode\x0a\x20\x20\x20\x20\x20\x20basePay\x0a\x20\x20\x20\x20\x20\x20basePayL10N\x0a\x20\x20\x20\x20\x20\x20signOnBonus\x0a\x20\x20\x20\x20\x20\x20signOnBonusL10N\x0a\x20\x20\x20\x20\x20\x20surgePay\x0a\x20\x20\x20\x20\x20\x20totalPayRate\x0a\x20\x20\x20\x20\x20\x20totalPayRateL10N\x0a\x20\x20\x20\x20\x20\x20hoursPerWeek\x0a\x20\x20\x20\x20\x20\x20firstDayOnSite\x0a\x20\x20\x20\x20\x20\x20firstDayOnSiteL10N\x0a\x20\x20\x20\x20\x20\x20scheduleText\x0a\x20\x20\x20\x20\x20\x20scheduleType\x0a\x20\x20\x20\x20\x20\x20scheduleTypeL10N\x0a\x20\x20\x20\x20\x20\x20employmentType\x0a\x20\x20\x20\x20\x20\x20employmentTypeL10N\x0a\x20\x20\x20\x20\x20\x20currencyCode\x0a\x20\x20\x20\x20\x20\x20distance\x0a\x20\x20\x20\x20\x20\x20distanceL10N\x0a\x20\x20\x20\x20\x20\x20scheduleBannerText\x0a\x20\x20\x20\x20\x20\x20scheduleBusinessCategory\x0a\x20\x20\x20\x20\x20\x20scheduleBusinessCategoryL10N\x0a\x20\x20\x20\x20\x20\x20hireStartDate\x0a\x20\x20\x20\x20\x20\x20monthlyBasePay\x0a\x20\x20\x20\x20\x20\x20monthlyBasePayL10N\x0a\x20\x20\x20\x20}\x0a\x20\x20}\x0a}'
            };
            const response = await _bgFetch('https://e5mquma77feepi2bdn4d6h3mpu.appsync-api.us-east-1.amazonaws.com/graphql', {
                'body': JSON['stringify'](request)
            });
            const data = response['data'];
            return data && data['data'] && data['data']['searchScheduleCards'] ? data['data']['searchScheduleCards']['scheduleCards'] || [] : [];
        } catch (err) {
            console['error']('Error\x20fetching\x20schedule\x20details:', err);
            return [];
        }
    }
    async function sendTelegramAlert(schedules, matchedJob) {
        try {
            const Q = y(i);
            const jobUrl = 'https://' + Q['domain'] + '/app#/jobDetail?jobId=' + matchedJob['jobId'] + '&locale=' + Q['locale'];
            const payload = {
                'jobId': matchedJob['jobId'],
                'jobTitle': matchedJob['jobTitle'],
                'city': matchedJob['city'],
                'jobUrl': jobUrl,
                'country': Q['country'],
                'schedules': schedules['map'](s => ({
                    'scheduleId': s['scheduleId'],
                    'externalJobTitle': s['externalJobTitle'],
                    'city': s['city'],
                    'state': s['state'],
                    'address': s['address'],
                    'postalCode': s['postalCode'],
                    'basePay': s['basePayL10N'] || s['basePay'],
                    'signOnBonus': s['signOnBonusL10N'] || s['signOnBonus'],
                    'surgePay': s['surgePay'],
                    'totalPayRate': s['totalPayRateL10N'] || s['totalPayRate'],
                    'hoursPerWeek': s['hoursPerWeek'],
                    'firstDayOnSite': s['firstDayOnSiteL10N'] || s['firstDayOnSite'],
                    'hireStartDate': s['hireStartDate'],
                    'scheduleText': s['scheduleText'],
                    'scheduleType': s['scheduleTypeL10N'] || s['scheduleType'],
                    'employmentType': s['employmentTypeL10N'] || s['employmentType'],
                    'scheduleBannerText': s['scheduleBannerText'],
                    'scheduleBusinessCategory': s['scheduleBusinessCategoryL10N'] || s['scheduleBusinessCategory']
                }))
            };
            // job-found call removed
        } catch (err) {
            console['error']('Error\x20sending\x20Telegram\x20alert:', err);
        }
    }
    async function G(O) {
        const P = await chrome['storage']['local']['get']([
                'cityTags',
                '__cr',
                '__isProUser'
            ]), Q = P['cityTags'] || [];
        let R = P['__cr'] || 0x0;
        const S = P['__isProUser'] || ![];
        if (Q['length'] === 0x0)
            return;
        const isAnyCity = Q['some'](V => V['toLowerCase']()['replace'](/[^a-zA-Z]/g, '') === 'anycity');
        const T = Q['map'](V => V['toLowerCase']()['replace'](/[^a-zA-Z]/g, ''));
        let U = null;
        for (const V of O) {
            if (!V['city']) {
                const W = await chrome['storage']['local']['get'](['cityTags']), X = W['cityTags'] || [], Y = X['map'](Z => Z['toLowerCase']()['replace'](/[^a-zA-Z]/g, ''));
                T['push'](...Y);
            }
            // City match only — distance is already filtered by the API geoQueryClause
            // Work hours (jobType) is filtered by containFilters in the API call
            const cityMatched = isAnyCity || (V['city'] && T['some'](a0 => V['city']['toLowerCase']()['replace'](/[^a-zA-Z]/g, '')['includes'](a0)));
            console.log('[fetch.js] Job:', V['jobTitle'], '| City:', V['city'] || 'N/A', '| CityMatch:', cityMatched);
            if (cityMatched) {
                    chrome['runtime']['sendMessage']({ 'action': 'playSound' });
                    try {
                        const a0 = new Audio(chrome['runtime']['getURL']('alert.wav'));
                        a0['volume'] = 0x1, a0['play']()['catch'](a1 => console['log']('Direct\x20play\x20failed,\x20background\x20handler\x20will\x20take\x20over'));
                    } catch (a1) {
                    }
                    // job-found inline call removed
                    Swal['fire']({
                        'toast': !![],
                        'position': 'bottom-start',
                        'showConfirmButton': ![],
                        'timerProgressBar': !![],
                        'timer': 5000,
                        'background': 'rgba(15,15,15,0.92)',
                        'html': '<div style="color:white;font-size:13px;"><b style="color:#00d4ff;">🎯 TARGET ACQUIRED!</b><br><span style="color:#aaa;font-size:12px;">Deploying application to ' + (V['city'] || 'matched city') + '...</span></div>'
                    });
                    U = V;
                    break;
            }
        }
        if (U) {
            const a2 = y(i), a3 = 'https://' + a2['domain'] + '/app#/jobDetail?jobId=' + U['jobId'] + '&locale=' + a2['locale'];
            // Telegram already sent for all jobs (including this one) in the D() fetch loop above.
            window['location']['href'] = a3, H();
        } else
            if (!b) _startScan();
    }
    function H() {
        const O = new MutationObserver((Q, R) => {
            const S = document['querySelectorAll']('button[data-test-id=\x22ScheduleCardSelectScheduleLink\x22]');
            if (S['length'] > 0x0) {
                const U = Math['floor'](Math['random']() * S['length']), V = S[U];
                V['click'](), R['disconnect']();
                return;
            }
            const T = document['querySelector']('button[data-test-id=\x22jobDetailSelectScheduleButton\x22]');
            if (T) {
                T['click'](), R['disconnect'](), setTimeout(() => H(), 0x64);
                return;
            }
        });
        O['observe'](document['body'], {
            'childList': !![],
            'subtree': !![]
        });
        const P = document['querySelectorAll']('button[data-test-id=\x22ScheduleCardSelectScheduleLink\x22]');
        if (P['length'] > 0x0) {
            const Q = Math['floor'](Math['random']() * P['length']);
            P[Q]['click'](), O['disconnect']();
            return;
        }
        setTimeout(() => {
            O['disconnect']();
            const R = document['querySelector']('div[data-test-component=\x22StencilText\x22]\x20em');
            R && (R['click'](), setTimeout(() => I(), 0x64));
        }, 0x1388);
    }
    function I() {
        const O = new MutationObserver((Q, R) => {
            const S = document['querySelectorAll']('.scheduleCardLabelText');
            if (S['length'] > 0x0) {
                const T = Math['floor'](Math['random']() * S['length']), U = S[T];
                U['click'](), R['disconnect'](), J();
            }
        });
        O['observe'](document['body'], {
            'childList': !![],
            'subtree': !![]
        });
        const P = document['querySelectorAll']('.scheduleCardLabelText');
        if (P['length'] > 0x0) {
            const Q = Math['floor'](Math['random']() * P['length']);
            P[Q]['click'](), O['disconnect'](), J();
        }
    }
    function J() {
        const O = new MutationObserver((Q, R) => {
            const S = document['querySelector']('button[data-test-id=\x22jobDetailApplyButtonDesktop\x22]');
            S && (S['click'](), R['disconnect']());
        });
        O['observe'](document['body'], {
            'childList': !![],
            'subtree': !![]
        });
        const P = document['querySelector']('button[data-test-id=\x22jobDetailApplyButtonDesktop\x22]');
        P && (P['click'](), O['disconnect']());
    }
    function K(O) {
        return new Promise((P, Q) => {
            chrome['storage']['local']['get'](O, R => {
                chrome['runtime']['lastError'] ? Q(chrome['runtime']['lastError']) : P(R);
            });
        });
    }

    // ── First-Time Setup Wizard ───────────────────────────────────────────────
    // Shows after first successful login — stays open until user clicks "All Set"
    async function showFirstTimeWizard() {
        if (typeof Swal === 'undefined') return;
        await Swal['fire']({
            'title': '🎯 Welcome to ShiftSniper!',
            'html':
                '<div style="text-align:left;font-family:Inter,sans-serif;">'
                + '<p style="margin-bottom:14px;color:rgba(199,210,254,0.8);font-size:13px;">'
                + 'You are logged in! Here is what happens next &mdash; and one thing you <b style="color:#c7d2fe;">must set up</b> for full automation:</p>'
                + '<div style="display:flex;flex-direction:column;gap:8px;">'

                + '<div style="background:rgba(34,211,238,0.07);border:1px solid rgba(34,211,238,0.22);border-radius:10px;padding:11px 13px;">'
                + '<div style="font-size:10px;font-weight:800;color:#22d3ee;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:5px;">① What ShiftSniper Does</div>'
                + '<div style="font-size:12.5px;color:rgba(199,210,254,0.8);">'
                + 'Automatically scans Amazon Jobs every <b style="color:#c7d2fe;">2 seconds</b>, finds matching shifts, and applies for you — hands free.</div></div>'

                + '<div style="background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.25);border-radius:10px;padding:11px 13px;">'
                + '<div style="font-size:10px;font-weight:800;color:#fbbf24;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:5px;">② Set Up Groq API Key (Required for CAPTCHA)</div>'
                + '<div style="font-size:12.5px;color:rgba(199,210,254,0.8);">'
                + 'When Amazon shows a CAPTCHA, ShiftSniper uses <b style="color:#c7d2fe;">Groq AI</b> to solve it automatically. '
                + 'Without a key, you must solve CAPTCHAs manually every time.<br><br>'
                + '<b style="color:#fbbf24;">→ Get your free key:</b> Visit <a href="https://console.groq.com/keys" target="_blank" '
                + 'style="color:#818cf8;font-weight:700;">console.groq.com/keys</a> → Sign up free → Create API Key → '
                + 'Copy the key (starts with <code style="background:rgba(99,102,241,0.2);color:#a5f3fc;padding:1px 6px;border-radius:4px;">gsk_</code>)'
                + '</div></div>'

                + '<div style="background:rgba(139,92,246,0.07);border:1px solid rgba(139,92,246,0.22);border-radius:10px;padding:11px 13px;">'
                + '<div style="font-size:10px;font-weight:800;color:#a78bfa;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:5px;">③ Paste Key in Extension</div>'
                + '<div style="font-size:12.5px;color:rgba(199,210,254,0.8);">'
                + 'Click the <b style="color:#c7d2fe;">ShiftSniper</b> icon in your toolbar → Find <b style="color:#c7d2fe;">◈ AI Captcha Solver</b> '
                + '→ Paste your key in the <b style="color:#c7d2fe;">GROQ API KEY</b> field → It saves automatically when valid.</div></div>'

                + '</div>'
                + '<p style="margin-top:12px;font-size:11px;color:rgba(199,210,254,0.35);text-align:center;">'
                + 'You can open this guide anytime from the Guide button.</p></div>',
            'confirmButtonText': '✅ All Set — Start Hunting!',
            'showCancelButton': false,
            'allowEscapeKey': false,
            'allowOutsideClick': false,
            'icon': 'info'
        });
    }
    // ─────────────────────────────────────────────────────────────────────────

    async function L() {
        if (!b) {
            // First-time wizard removed — Groq guide is shown after PIN in C()
            if (!g) {
                const O = y(i);
                window['location']['href'] = 'https://auth.hiring.amazon.ca/#/login';
                return;
            }
            if (g) {
                const P = y(i);
                // Flag: tell checkRedirect not to interrupt us while we fetch candidateID
                window['_candidateIDFetching'] = true;
                window['location']['href'] = 'https://hiring.amazon.ca/app#/contactInformation', await f();
                let Q = null;
                const R = document['querySelector']('input[data-test-id=\x22input-test-id-emailId\x22]');
                if (R && R['value']) {
                    Q = R['value'];
                    window['location']['href'] = 'https://hiring.amazon.ca/app#/jobSearch';
                }
                window['_candidateIDFetching'] = false;
                if (p) {
                    // get-config call removed
                }
                if (p) { _startScan(); }
                else {
                }
            } else {
            }
        }
    }
    function M() {
        b && (clearInterval(b), b = null);
            _hideRing();
    }
    chrome['runtime']['onMessage']['addListener'](function (O, P, Q) {
        if (O['action'] == 'activate') {
            p = O['status'];
            if (p)
                C();
        }
        Q(!![]);
    });
    const N = chrome['runtime']['connect']({ 'name': 'amazon-shifts-extension' });
    N['onMessage']['addListener'](async function (O) {
        if (O['action'] == 'fetch_info') {
            g = O['data']['$username'], h = O['data']['$password'], j = O['data']['$candidateID'], k = O['data']['$selectedCity'], l = O['data']['$lat'], m = O['data']['$lng'], n = O['data']['$distance'], o = O['data']['$jobType'], p = O['data']['$active'], $version = O['data']['$version'];
            if (p) {
                C();
                return;
            }
        }
    }), N['postMessage']({ 'action': 'fetch_info' });

    // ── Recovery watchdog ─────────────────────────────────────────────────────
    // If the extension is active and on jobSearch but the fetch loop hasn't
    // started (b is still null), restart L(). This catches cases where L()
    // was interrupted by navigation timing or the activate message was missed.
    setInterval(function() {
        // Do NOT restart if any popup is showing
        if (window['_ss_banner_shown'] || window['_ss_guide_showing'] || window['_ss_polling'] || window['_ss_blk_showing']) return;
        if (p && F() && !b && !window['_candidateIDFetching']) {
            console.log('[fetch.js] Recovery watchdog: restarting loop');
            L();
        }
    }, 5000);



    // ── Login page detection: wait 30s then reload for fresh login ──
    (function() {
        var url = window.location.href;
        var isLoginPage = url.includes('#/login') || url.includes('/login');
        if (!isLoginPage || !p) return;
        // Already logged in — skip
        if (g && g !== 'null') return;
        // On login page with hunter ON — wait 30s then reload
        setTimeout(function() {
            if (p && (!g || g === 'null')) {
                window.location.reload();
            }
        }, 30000);
    })();
    // ─────────────────────────────────────────────────────────────

    // ── Auto-redirect: homepage → jobSearch in 5s when hunter is ON ────
    var _homeRedirTimer = null;
    function _checkHomeRedirect() {
        if (!p || !g) { // Only when hunter ON and logged in
            if (_homeRedirTimer) { clearTimeout(_homeRedirTimer); _homeRedirTimer = null; }
            return;
        }
        var url = window.location.href;
        var isHome = url === 'https://hiring.amazon.ca/' || url === 'https://hiring.amazon.ca'
                  || url === 'https://hiring.amazon.com/' || url === 'https://hiring.amazon.com';
        if (!isHome) {
            if (_homeRedirTimer) { clearTimeout(_homeRedirTimer); _homeRedirTimer = null; }
            return;
        }
        if (_homeRedirTimer) return; // Already counting down
        _homeRedirTimer = setTimeout(function() {
            _homeRedirTimer = null;
            if (p && g) window.location.href = 'https://hiring.amazon.ca/app#/jobSearch';
        }, 5000); // 5 seconds
    }
    _checkHomeRedirect(); // Check on page load
    // Re-check on every URL change (SPA navigation)
    (function() {
        var _prevUrl = location.href;
        setInterval(function() {
            if (location.href !== _prevUrl) { _prevUrl = location.href; _checkHomeRedirect(); }
        }, 800);
    })();
    // ─────────────────────────────────────────────────────────────────────


// ── Guide modal — triggered from extension popup ─────────────────
chrome['runtime']['onMessage']['addListener'](function(msg, sender, sendResponse) {
    if (msg['action'] !== 'showGuide') return;
    if (typeof Swal === 'undefined') return;
    Swal['fire']({
        'title': '',
        'html': `<div style="font-family:Inter,sans-serif;">
  <div style="background:linear-gradient(135deg,rgba(22,245,255,0.12),rgba(163,65,255,0.12));border-radius:14px;padding:16px 18px;margin-bottom:14px;border:1px solid rgba(22,245,255,0.2);text-align:center;">
    <div style="font-size:26px;margin-bottom:4px;">🎯</div>
    <div style="font-size:18px;font-weight:800;color:#e2e8f0;">How to Get Shifts Fast</div>
    <div style="font-size:12px;color:rgba(199,210,254,0.55);margin-top:3px;">ShiftSniper Setup Guide</div>
  </div>
  <div style="background:rgba(22,245,255,0.05);border-left:3px solid #22d3ee;border-radius:0 10px 10px 0;padding:11px 14px;margin-bottom:10px;text-align:left;">
    <div style="font-weight:800;color:#22d3ee;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:6px;">🌍 REGION — Search Center</div>
    <div style="font-size:12.5px;color:rgba(199,210,254,0.85);line-height:1.65;">Pick the <b style="color:#e2e8f0;">city closest to where you want to work</b>. Amazon searches jobs near its GPS coordinates.</div>
    <div style="margin-top:7px;background:rgba(0,0,0,0.3);border-radius:8px;padding:7px 10px;font-family:monospace;font-size:11px;color:rgba(199,210,254,0.6);">REGION: Toronto ▼ &nbsp;|&nbsp; RADIUS: 150km ▼ &nbsp;|&nbsp; Any ▼</div>
  </div>
  <div style="background:rgba(163,65,255,0.05);border-left:3px solid #a855f7;border-radius:0 10px 10px 0;padding:11px 14px;margin-bottom:10px;text-align:left;">
    <div style="font-weight:800;color:#c084fc;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:6px;">🏙️ TARGET CITIES — Result Filter</div>
    <div style="font-size:12.5px;color:rgba(199,210,254,0.85);line-height:1.65;">Filters which jobs get applied to. <b style="color:#4ade80;">Any City ✓</b> = apply to everything in the radius.</div>
    <div style="margin-top:7px;display:flex;gap:6px;flex-wrap:wrap;">
      <span style="background:rgba(163,65,255,0.15);border:1px solid rgba(163,65,255,0.3);padding:3px 9px;border-radius:20px;font-size:11px;color:#c084fc;">Bolton ×</span>
      <span style="background:rgba(163,65,255,0.15);border:1px solid rgba(163,65,255,0.3);padding:3px 9px;border-radius:20px;font-size:11px;color:#c084fc;">Whitby ×</span>
      <span style="background:rgba(74,222,128,0.15);border:1px solid rgba(74,222,128,0.3);padding:3px 9px;border-radius:20px;font-size:11px;color:#4ade80;">Any City ✓</span>
    </div>
  </div>
  <div style="background:rgba(34,197,94,0.05);border-left:3px solid #22c55e;border-radius:0 10px 10px 0;padding:11px 14px;margin-bottom:10px;text-align:left;">
    <div style="font-weight:800;color:#4ade80;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:8px;">⚙️ HOW IT WORKS</div>
    <div style="font-size:12px;color:rgba(199,210,254,0.7);line-height:2;background:rgba(0,0,0,0.25);border-radius:8px;padding:9px 12px;">
      <span style="color:#22d3ee;font-weight:700;">REGION</span> Toronto + <span style="color:#a855f7;font-weight:700;">RADIUS</span> 50km + <span style="color:#4ade80;font-weight:700;">CITIES</span> Any<br>
      ↓ Amazon returns jobs within 50km of Toronto<br>
      ↓ Extension applies to <b style="color:#4ade80;">ALL jobs found ✓</b>
    </div>
  </div>
  <div style="background:linear-gradient(135deg,rgba(251,146,60,0.08),rgba(251,146,60,0.03));border:1px solid rgba(251,146,60,0.25);border-radius:10px;padding:12px 14px;text-align:left;">
    <div style="font-weight:800;color:#fb923c;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:9px;">⚡ BEST SETTINGS FOR FASTEST RESULTS</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
      <div style="background:rgba(0,0,0,0.25);border-radius:8px;padding:7px 10px;">
        <div style="color:rgba(199,210,254,0.4);font-size:10px;margin-bottom:2px;">REGION</div>
        <div style="font-weight:700;color:#e2e8f0;font-size:12.5px;">Nearest city</div>
      </div>
      <div style="background:rgba(0,0,0,0.25);border-radius:8px;padding:7px 10px;">
        <div style="color:rgba(199,210,254,0.4);font-size:10px;margin-bottom:2px;">RADIUS</div>
        <div style="font-weight:700;color:#e2e8f0;font-size:12.5px;">50–150 km</div>
      </div>
      <div style="background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.2);border-radius:8px;padding:7px 10px;">
        <div style="color:rgba(199,210,254,0.4);font-size:10px;margin-bottom:2px;">TARGET CITIES</div>
        <div style="font-weight:700;color:#4ade80;font-size:12.5px;">Any City ✓</div>
      </div>
      <div style="background:rgba(251,146,60,0.12);border:1px solid rgba(251,146,60,0.3);border-radius:8px;padding:7px 10px;">
        <div style="color:rgba(199,210,254,0.4);font-size:10px;margin-bottom:2px;">SCAN INTERVAL</div>
        <div style="font-weight:700;color:#fb923c;font-size:12.5px;">2 seconds ⚡</div>
      </div>
    </div>
    <div style="background:rgba(0,0,0,0.2);border-radius:7px;padding:8px 11px;font-size:11.5px;color:rgba(199,210,254,0.6);">
      ⚡ <b style="color:#fb923c;">2 sec interval</b> = 30 checks/min = fastest possible detection.
    </div>
  </div>
</div>`,
        'showConfirmButton': true,
        'confirmButtonText': '✕  Close Guide',
        'showCancelButton': false,
        'allowEscapeKey': true,
        'allowOutsideClick': true,
        'width': 'min(560px, 94vw)',
        'customClass': { 'htmlContainer': 'ss-guide-body' }
    });
});
// ─────────────────────────────────────────────────────────────────

}(location['pathname']));




// ── Auto-handle "Please sign-in again" popup + redirect to login ──────────────
(function() {
    'use strict';
    function checkSignInAgain() {
        // Check for SweetAlert "Please sign-in again" popup
        const swalPopup = document.querySelector('.swal2-popup.swal2-show, .swal2-container.swal2-shown .swal2-popup');
        if (swalPopup) {
            const text = swalPopup.innerText || '';
            if (/sign.?in again|session expired|please sign/i.test(text)) {
                console.log('[fetch.js] Detected sign-in again popup — auto-clicking Ok');
                const okBtn = swalPopup.querySelector('.swal2-confirm');
                if (okBtn) {
                    okBtn.click();
                    setTimeout(function() {
                        // Redirect to auth page after clicking Ok
                        const authDomain = window.location.hostname.includes('.ca')
                            ? 'https://auth.hiring.amazon.ca/#/login'
                            : 'https://auth.hiring.amazon.com/#/login';
                        console.log('[fetch.js] Redirecting to auth:', authDomain);
                        window.location.href = authDomain;
                    }, 800);
                }
                return;
            }
        }
        // Also check for inline "Please sign-in again" text in page body
        const bodyText = document.body && document.body.innerText || '';
        if (/please sign-in again|attention please|session expired/i.test(bodyText)) {
            const btns = [...(document.querySelectorAll('button'))];
            const okBtn = btns.find(b => /^ok$/i.test(b.textContent.trim()));
            if (okBtn) {
                okBtn.click();
                setTimeout(function() {
                    const authDomain = window.location.hostname.includes('.ca')
                        ? 'https://auth.hiring.amazon.ca/#/login'
                        : 'https://auth.hiring.amazon.com/#/login';
                    window.location.href = authDomain;
                }, 800);
            }
        }
    }

    // Check every 2 seconds
    setInterval(checkSignInAgain, 2000);

    // Also watch for DOM changes (SweetAlert injects dynamically)
    const _obs = new MutationObserver(function() { checkSignInAgain(); });
    if (document.body) _obs.observe(document.body, { childList: true, subtree: true });
})();


// ── Post-login redirect: after OTP verified, go to jobSearch ─────────────────
(function() {
    // Always use .ca — the extension targets Canadian Amazon Jobs
    var _jobSearchUrl = 'https://hiring.amazon.ca/app#/jobSearch';

    function doRedirect(reason) {
        console.log('[fetch.js] Redirecting to jobSearch. Reason:', reason);
        chrome.storage.local.remove('_pendingJobRedirect');
        chrome.storage.local.set({ '_pendingJobReloadUntil': Date.now() + 3 * 60 * 1000 });
        window.location.replace(_jobSearchUrl);
        // Reload page after 1 minute to fully start job checking
        setTimeout(function() {
            if (window.location.href.includes('app#/jobSearch')) {
                console.log('[fetch.js] 1-min post-login reload to start job checking');
                window.location.reload();
            }
        }, 60000);
    }

    // After jobSearch page loads: handle post-login activation
    if (window.location.href.includes('app#/jobSearch')) {
        chrome.storage.local.get(['_pendingJobReloadUntil', '__ap'], function(d) {
            var now = Date.now();

            // Case 1: Fresh post-login load — set the reload flag if not already activated
            if (d._pendingJobReloadUntil && now < d._pendingJobReloadUntil) {
                chrome.storage.local.remove('_pendingJobReloadUntil');
                if (!d.__ap) {
                    // Extension is not activated yet — reload page to trigger popup
                    console.log('[fetch.js] Post-login: extension not activated, reloading in 3s');
                    setTimeout(function() { window.location.reload(); }, 3000);
                } else {
                    // Extension IS activated — just send activate message to start D()
                    console.log('[fetch.js] Post-login: extension activated, sending activate msg');
                    chrome.runtime.sendMessage({ action: 'activate', status: true });
                }
                return;
            }

            // Case 2: Normal load — if activated but not running, send activate
            if (d.__ap) {
                console.log('[fetch.js] jobSearch loaded with active=true — sending activate');
                setTimeout(function() {
                    chrome.runtime.sendMessage({ action: 'activate', status: true });
                }, 1000);
            }
        });
    }

    function checkRedirect() {
        var url = window.location.href;

        // Already at destination — nothing to do
        if (url.includes('app#/jobSearch') || url.includes('app#/jobDetail')) {
            chrome.storage.local.remove('_pendingJobRedirect');
            return;
        }

        chrome.storage.local.get(['_pendingJobRedirect'], function(data) {
            console.log('[fetch.js] checkRedirect: flag=', !!data._pendingJobRedirect, 'url=', url.slice(0,70));

            // Redirect from contactInformation → but NOT if E()/L() is currently
            // fetching the candidateID there (they set window._candidateIDFetching = true).
            if (url.includes('contactInformation')) {
                if (window['_candidateIDFetching']) {
                    // E()/L() is working here — come back in 4s to check again
                    console.log('[fetch.js] checkRedirect: candidateID fetch in progress — waiting');
                    setTimeout(checkRedirect, 4000);
                    return;
                }
                console.log('[fetch.js] On contactInformation — redirecting to jobSearch');
                var saveBtn = [...document.querySelectorAll('button')]
                    .find(function(b) { return /^save$/i.test(b.textContent.trim()) && !b.disabled; });
                if (saveBtn) {
                    saveBtn.click();
                    setTimeout(function() { doRedirect('contactInfo-saved'); }, 1500);
                } else {
                    doRedirect('contactInfo-direct');
                }
                return;
            }

            // ALWAYS redirect from homepage if logged in (email in nav = logged in)
            if ((url === 'https://hiring.amazon.ca/' || url === 'https://hiring.amazon.ca' ||
                 url.includes('hiring.amazon.ca/#') || url === 'https://hiring.amazon.com/' ||
                 url.includes('hiring.amazon.com/#')) && !url.includes('app#')) {
                var loggedIn = document.querySelector('[data-test-id="my-account"], .hvh-header__account, [class*="myAccount"]');
                if (loggedIn || data._pendingJobRedirect) {
                    console.log('[fetch.js] On homepage after login — redirecting to jobSearch');
                    doRedirect('homepage-post-login');
                    return;
                }
            }

            if (!data._pendingJobRedirect) return;

            // .com domain — redirect to .ca
            if (url.includes('hiring.amazon.com') && !url.includes('auth.')) {
                doRedirect('com-to-ca');
                return;
            }

            // Any other page with flag set
            doRedirect('post-login: ' + (url.split('#')[1] || url.split('/').pop()));
        });
    }

    // Check on page load (for direct navigations)
    setTimeout(checkRedirect, 2500);

    // Check on SPA route changes
    var _prevUrl = window.location.href;
    setInterval(function() {
        var cur = window.location.href;
        if (cur !== _prevUrl) {
            _prevUrl = cur;
            setTimeout(checkRedirect, 1500);
        }
    }, 800);
})();


// ── Health Monitor ───────────────────────────────────────────────────────────
(function() {
    'use strict';

    // 1. Hourly reload to detect session expiry
    setTimeout(function() {
        if (!window['_ss_wizard_active']) {
            console.log('[health] Hourly refresh');
            window.location.reload();
        }
    }, 60 * 60 * 1000);

    // 2. Bug 1 fix: Stuck on homepage without login → redirect to auth login
    function checkLoginRequired() {
        var url = window.location.href;
        // On homepage or non-app page
        // Only match actual homepage — NOT login page or app pages
        var isHomepage = (url === 'https://hiring.amazon.ca/' || url === 'https://hiring.amazon.ca' ||
                          /hiring\.amazon\.ca\/?$/.test(url));
        if (!isHomepage) return;

        // Check if logged in — look for My Account nav or welcome text
        var loggedIn = document.querySelector('[aria-label*="My Account"], [data-test-id*="account"], .hvh-header__account-name');
        var welcomeText = document.body.innerText || '';
        var hasWelcome = /welcome back/i.test(welcomeText);

        if (!loggedIn && !hasWelcome) {
            console.log('[health] Homepage without login — clicking Sign In button');
            // Use Sign In button on the page (correct auth flow with tokens)
            var signInBtn = document.querySelector('[data-test-id="topPanelSigninLink"]')
                         || document.querySelector('[aria-label="Sign In"]')
                         || [...document.querySelectorAll('a, button')]
                            .find(function(el) { return /^sign.?in$/i.test((el.textContent || '').trim()); });
            if (signInBtn) {
                console.log('[health] Clicking Sign In button');
                signInBtn.click();
            } else {
                window.location.href = 'https://hiring.amazon.ca/app#/login';
            }
        }
    }

    // 3. Bug 4 fix handled above (10s reload after jobSearch load)
    function triggerActivationOnJobSearch() { /* handled by reload */ }

    // 4. Stuck page watchdog
    var _lastUrl = window.location.href;
    var _stuckCount = 0;

    setInterval(function() {
        var url = window.location.href;
        checkLoginRequired();

        var isStuck = url.includes('contactInformation') || url === 'https://hiring.amazon.ca/' ||
                      url === 'https://hiring.amazon.ca' || (url.includes('hiring.amazon.ca') && !url.includes('app#'));
        if (url === _lastUrl && isStuck) {
            _stuckCount++;
            console.log('[health] Stuck on', url.split('/').pop() || 'homepage', '— count:', _stuckCount);
            if (_stuckCount >= 3) { // 90s stuck
                _stuckCount = 0;
                console.log('[health] Force redirect to login via Sign In click');
                var signInBtn = document.querySelector('[data-test-id="topPanelSigninLink"]')
                             || document.querySelector('[aria-label="Sign In"]')
                             || [...document.querySelectorAll('a')].find(function(el){ return /^sign.?in$/i.test((el.textContent||'').trim()); });
                if (signInBtn) { signInBtn.click(); }
                else { window.location.href = 'https://hiring.amazon.ca/app#/login'; }
            }
        } else {
            _stuckCount = 0;
            _lastUrl = url;
            if (url.includes('app#/jobSearch')) triggerActivationOnJobSearch();
        }
    }, 30000);

    // Also trigger immediately on jobSearch page load (Bug 4)
    setTimeout(function() {
        if (window.location.href.includes('app#/jobSearch')) {
            triggerActivationOnJobSearch();
        }
    }, 3000);
})();
