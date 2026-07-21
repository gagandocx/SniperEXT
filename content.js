document['addEventListener']('DOMContentLoaded', async function () {
    const a = await new Promise(A => chrome['management']['getSelf'](B => A(B['version'])));
    document['getElementById']('version')['innerText'] = '(version\x20v' + a + ')';
    const b = {
            'Any City': {
                'lat': 43.653524,
                'lng': -79.383907
            },
            'Acheson': {
                'lat': 53.548701,
                'lng': -113.76261
            },
            'Ajax': {
                'lat': 43.850814,
                'lng': -79.020296
            },
            'Balzac': {
                'lat': 51.212985,
                'lng': -114.007862
            },
            'Bolton': {
                'lat': 43.875473,
                'lng': -79.734437
            },
            'Brampton': {
                'lat': 43.685271,
                'lng': -79.759924
            },
            'Calgary': {
                'lat': 51.045113,
                'lng': -114.057141
            },
            'Cambridge': {
                'lat': 43.361621,
                'lng': -80.314429
            },
            'Concord': {
                'lat': 43.80011,
                'lng': -79.48291
            },
            'Dartmouth': {
                'lat': 44.67134,
                'lng': -63.57719
            },
            'Edmonton': {
                'lat': 53.54545,
                'lng': -113.49014
            },
            'Etobicoke': {
                'lat': 43.65421,
                'lng': -79.56711
            },
            'Hamilton': {
                'lat': 43.25549,
                'lng': -79.873376
            },
            'Mississauga': {
                'lat': 43.58882,
                'lng': -79.644378
            },
            'Nisku': {
                'lat': 53.337845,
                'lng': -113.531304
            },
            'Ottawa': {
                'lat': 45.425226,
                'lng': -75.699963
            },
            'Rocky\x20View': {
                'lat': 51.18341,
                'lng': -113.93527
            },
            'Scarborough': {
                'lat': 43.773077,
                'lng': -79.257774
            },
            'Sidney': {
                'lat': 48.650629,
                'lng': -123.398604
            },
            'ST.\x20Thomas': {
                'lat': 42.777414,
                'lng': -81.182973
            },
            'Stoney\x20Creek': {
                'lat': 43.21681,
                'lng': -79.76633
            },
            'Toronto': {
                'lat': 43.653524,
                'lng': -79.383907
            },
            'Vancouver': {
                'lat': 49.261636,
                'lng': -123.11335
            },
            'Vaughan': {
                'lat': 43.849270138,
                'lng': -79.535136594
            },
            'Whitby': {
                'lat': 43.897858,
                'lng': -78.943434
            },
            'Windsor': {
                'lat': 42.317438,
                'lng': -83.035225
            },
            'Belgrade': {
                'lat': 45.776196,
                'lng': -111.177155
            }
        }, c = [
            'Bolton',
            'Brampton',
            'Burnaby',
            'Cambridge',
            'Concord',
            'Toronto',
            'Sidney',
            'Belgrade'
        ], d = await chrome['storage']['local']['get']([
            'selectedCity',
            'distance',
            'jobType',
            '__ap',
            'cityTags',
            'fetchIntervalValue',
            'fetchIntervalUnit'
        ]), e = d['selectedCity'] || 'Toronto', f = d['distance'] || '5', g = d['jobType'] || 'Any', h = d['__ap'] || ![], i = d['cityTags'] || [], j = d['fetchIntervalValue'] || '3', k = d['fetchIntervalUnit'] || 's';
    await chrome['storage']['local']['get']()['then'](A => {
        const B = document['getElementById']('activate');
        if (B) {
            B['checked'] = A['__ap'];
            const _pc = document['getElementById']('power-card');
            if (_pc) _pc['classList']['toggle']('active', !!A['__ap']);
        } else { console['error']('activate element not found'); }
    });
    if (i['length'] === 0x0)
        chrome['storage']['local']['set']({ 'cityTags': c }, function () {
        });
    else {
    }
    const l = document['getElementById']('city'), m = document['getElementById']('distance'), n = document['getElementById']('work_hours'), o = document['getElementById']('activate'), p = document['getElementById']('fetch_interval_value'), q = document['getElementById']('fetch_interval_unit');
    if (l)
        l['value'] = e;
    if (m)
        m['value'] = f;
    if (n)
        n['value'] = g;
    if (o)
        o['checked'] = h;
    if (p)
        p['value'] = j;
    if (q)
        q['value'] = k;
    const {
        lat: r,
        lng: s
    } = b[e];
    chrome['storage']['local']['set']({
        'lat': r,
        'lng': s
    }), document['getElementById']('city')['addEventListener']('change', function () {
        const A = this['value'];
        if (A === 'Any City') {
            chrome['storage']['local']['get']('cityTags', function (tags) {
                const B = tags['cityTags'] || [];
                if (!B['some'](D => D['toLowerCase']() === 'any city')) {
                    document['getElementById']('any-city-btn')['click']();
                }
            });
            const distElem = document['getElementById']('distance');
            if (distElem) {
                distElem['value'] = '25000';
                distElem['dispatchEvent'](new Event('change'));
            }
        }
        const {
                lat: B,
                lng: C
            } = b[A];
        chrome['storage']['local']['set']({
            'selectedCity': A,
            'lat': B,
            'lng': C
        });
    }), document['getElementById']('distance')['addEventListener']('change', function () {
        const A = this['value'];
        chrome['storage']['local']['set']({ 'distance': A });
    }), document['getElementById']('work_hours')['addEventListener']('change', function () {
        const A = this['value'];
        chrome['storage']['local']['set']({ 'jobType': A });
    }), document['getElementById']('fetch_interval_value')['addEventListener']('change', function () {
        const A = this['value'];
        if (A && parseInt(A) > 0) chrome['storage']['local']['set']({ 'fetchIntervalValue': A });
    }), document['getElementById']('fetch_interval_value')['addEventListener']('input', function () {
        const A = this['value'];
        if (A && parseInt(A) > 0) chrome['storage']['local']['set']({ 'fetchIntervalValue': A });
    }), document['getElementById']('fetch_interval_unit')['addEventListener']('change', function () {
        const A = this['value'];
        chrome['storage']['local']['set']({ 'fetchIntervalUnit': A });
    }), (function() {
        // Groq API Key save/load
        chrome['storage']['local']['get'](['groq_api_key'], function (A) {
            const el = document['getElementById']('groq_api_key');
            if (el && A['groq_api_key']) el['value'] = A['groq_api_key'];
        });
        const _gk = document['getElementById']('groq_api_key');
        if (_gk) {
            _gk['addEventListener']('input', function () {
                const val = this['value']['trim']();
                const savedBadge = document['getElementById']('groq_saved');
                const errBadge   = document['getElementById']('groq_error');
                if (!val) {
                    if (savedBadge) savedBadge['style']['display'] = 'none';
                    if (errBadge)   errBadge['style']['display'] = 'none';
                    return;
                }
                // FIXED: key must start with gsk_ and be at least 30 chars
                const isValid = val.startsWith('gsk_') && val.length >= 30;
                if (isValid) {
                    chrome['storage']['local']['set']({ 'groq_api_key': val });
                    if (savedBadge) { savedBadge['style']['display'] = 'flex'; setTimeout(() => { savedBadge['style']['display'] = 'none'; }, 2500); }
                    if (errBadge) errBadge['style']['display'] = 'none';
                } else {
                    if (savedBadge) savedBadge['style']['display'] = 'none';
                    if (errBadge) errBadge['style']['display'] = 'flex';
                }
            });
        }
    })(), document['getElementById']('activate')['addEventListener']('change', async function () {
        chrome['storage']['local']['set']({ '__ap': this['checked'] });
        const _pc = document['getElementById']('power-card');
        if (_pc) _pc['classList']['toggle']('active', this['checked']);
        let [A] = await chrome['tabs']['query']({ 'active': true, 'lastFocusedWindow': true });
        if (A) chrome['tabs']['sendMessage'](A['id'], { 'action': 'activate', 'status': this['checked'] });
    }), document['getElementById']('ais_visa_info')['addEventListener']('submit', async function (A) {
        A['preventDefault']();
        let B = document['getElementById']('reset_info');
        B['setAttribute']('disabled', 'disabled'), await new Promise(C => setTimeout(C, 0x1f4)), await chrome['storage']['local']['clear'](), await chrome['storage']['local']['set']({
            '__ap': !![],
            '__cr': 0x0,
            'selectedCity': 'Toronto',
            'lat': 43.653524,
            'lng': -79.383907,
            'distance': '5',
            'jobType': 'Any',
            'fetchIntervalValue': '3',
            'fetchIntervalUnit': 's'
        }), chrome['runtime']['sendMessage']({ 'action': 'logout' }), B['classList']['toggle']('btn-success'), B['innerText'] = 'Success', await new Promise(C => setTimeout(C, 0x3e8)), B['classList']['toggle']('btn-success'), B['removeAttribute']('disabled'), B['innerText'] = 'Reset';
    });
    function t(A, B = ![]) {
        const C = document['getElementById']('tag-input-box'), D = document['createElement']('div');
        D['classList']['add']('tag'), D['innerHTML'] = A + '\x20<span\x20class=\x22remove-tag\x22>x</span>', C['insertBefore'](D, document['getElementById']('city-input')), document['getElementById']('clear-all')['style']['display'] = 'inline', D['querySelector']('.remove-tag')['addEventListener']('click', function () {
            u(this);
        }), !B && w(A);
    }
    function u(A) {
        const B = A['parentElement'], C = B['textContent']['trim']()['slice'](0x0, -0x1);
        B['remove'](), x(C), !document['querySelector']('.tag') && (document['getElementById']('clear-all')['style']['display'] = 'none');
    }
    function v() {
        const A = document['querySelectorAll']('.tag');
        A['forEach'](B => B['remove']()), y(), document['getElementById']('clear-all')['style']['display'] = 'none';
    }
    function w(A) {
        chrome['storage']['local']['get']('cityTags', function (B) {
            let C = B['cityTags'] || [];
            C['push'](A), chrome['storage']['local']['set']({ 'cityTags': C }, function () {
            });
        });
    }
    function x(A) {
        chrome['storage']['local']['get']('cityTags', function (B) {
            let C = B['cityTags'] || [];
            C = C['filter'](D => D['trim']()['toLowerCase']() !== A['trim']()['toLowerCase']()), chrome['storage']['local']['set']({ 'cityTags': C }, function () {
                chrome['storage']['local']['get']('cityTags', function (D) {
                });
            });
        });
    }
    function y() {
        chrome['storage']['local']['remove']('cityTags', function () {
        });
    }
    function z() {
        const A = document['getElementById']('tag-input-box');
        A['querySelectorAll']('.tag')['forEach'](B => B['remove']()), chrome['storage']['local']['get']('cityTags', function (B) {
            const C = B['cityTags'] || [];
            C['forEach'](D => t(D, !![]));
        });
    }
    document['getElementById']('clear-all')['addEventListener']('click', v), document['getElementById']('any-city-btn')['addEventListener']('click', function () {
        chrome['storage']['local']['get']('cityTags', function (A) {
            const B = A['cityTags'] || [];
            const C = B['some'](D => D['toLowerCase']() === 'any\x20city');
            if (C) {
                v();
                document['getElementById']('any-city-btn')['classList']['remove']('active');
                document['getElementById']('any-city-btn')['innerText'] = 'Any City';
            } else {
                v();
                t('Any\x20City');
                document['getElementById']('any-city-btn')['classList']['add']('active');
                document['getElementById']('any-city-btn')['innerText'] = 'Any City ✓';
            }
        });
    }), document['getElementById']('city-input')['addEventListener']('keyup', function (A) {
        if (A['key'] === 'Enter' && this['value']['trim']() !== '') {
            const B = this['value']['trim']();
            t(B), this['value'] = '';
        }
    }), chrome['runtime']['onMessage']['addListener']((A, B, C) => {
        if (A['action'] === 'playSound') {
            const D = new (window['AudioContext'] || window['webkitAudioContext'])();
            fetch(chrome['runtime']['getURL']('alert.wav'))['then'](E => E['arrayBuffer']())['then'](E => D['decodeAudioData'](E))['then'](E => {
                const F = D['createBufferSource']();
                F['buffer'] = E, F['connect'](D['destination']), F['start'](0x0), setTimeout(() => {
                    const G = D['createBufferSource']();
                    G['buffer'] = E, G['connect'](D['destination']), G['start'](0x0);
                }, 0x3e8), setTimeout(() => {
                    const G = D['createBufferSource']();
                    G['buffer'] = E, G['connect'](D['destination']), G['start'](0x0);
                }, 0x7d0);
            })['catch'](E => {
                console['error']('Failed\x20to\x20play\x20sound\x20via\x20Web\x20Audio\x20API:', E);
                const F = new Audio(chrome['runtime']['getURL']('alert.wav'));
                F['play']()['catch'](G => console['error']('Also\x20failed\x20with\x20HTML5\x20Audio:', G)), chrome['notifications']['create']({
                    'type': 'basic',
                    'iconUrl': chrome['runtime']['getURL']('images/icon128.png'),
                    'title': 'Amazon\x20Job\x20Alert!',
                    'message': 'A\x20matching\x20job\x20has\x20been\x20found!',
                    'priority': 0x2
                });
            });
        }
    }), z();
    chrome['storage']['local']['get']('cityTags', function (A) {
        const B = A['cityTags'] || [];
        if (B['some'](C => C['toLowerCase']() === 'any\x20city')) {
            document['getElementById']('any-city-btn')['classList']['add']('active');
            document['getElementById']('any-city-btn')['innerText'] = 'Any\x20City\x20\u2713';
        }
    });

    // ── Access badge — live trial countdown synced from server DB ──
    (function() {
        const badge = document['getElementById']('access-badge');
        if (!badge) return;

        // Show badge immediately so there's no invisible flash
        badge['style']['display'] = 'inline-block';
        badge['innerHTML'] = '&#8635; syncing...';
        badge['style']['cssText'] = 'display:inline-block;background:rgba(99,102,241,0.12);'
            + 'color:#a5b4fc;border:1px solid rgba(99,102,241,0.25);font-size:8px;font-weight:600;'
            + 'letter-spacing:1px;padding:2px 8px;border-radius:10px;text-transform:uppercase;';

        // Format seconds into readable string
        function fmtTime(sec) {
            if (sec <= 0) return '0s';
            var h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
            if (h > 0) return h + 'h ' + m + 'm';
            if (m > 0) return m + 'm ' + s + 's';
            return s + 's';
        }

        var _expTs = 0, _tick = null;

        function renderCountdown() {
            var rem = _expTs > 0 ? Math.max(0, Math.floor((_expTs - Date.now()) / 1000)) : 0;
            badge['innerHTML'] = '&#9201; ' + fmtTime(rem) + ' left';
            badge['style']['cssText'] = 'display:inline-block;background:rgba(245,158,11,0.12);'
                + 'color:#fbbf24;border:1px solid rgba(245,158,11,0.3);font-size:8px;font-weight:800;'
                + 'letter-spacing:1px;padding:2px 8px;border-radius:10px;';
            if (rem <= 0 && _tick) { clearInterval(_tick); _tick = null; }
        }

        function applyServerData(d) {
            var isPro       = !!d['__isProUser'];
            var canScan     = d['__canScan'] !== undefined ? !!d['__canScan'] : true;
            var trialRemSec = d['__trialRemSec'] || 0;
            var hasNewFields= d['__trialRemSec'] !== undefined; // new server returns this

            if (isPro) {
                // PREMIUM badge
                badge['innerHTML'] = '&#10024; PREMIUM';
                badge['style']['cssText'] = 'display:inline-block;background:linear-gradient(135deg,#16f5ff,#a341ff);'
                    + 'color:#fff;font-size:8px;font-weight:900;letter-spacing:1.5px;padding:2px 8px;'
                    + 'border-radius:10px;text-transform:uppercase;box-shadow:0 0 8px rgba(22,245,255,0.4);';

            } else if (!canScan) {
                // Trial ended
                badge['innerHTML'] = '&#128274; TRIAL ENDED';
                badge['style']['cssText'] = 'display:inline-block;background:rgba(239,68,68,0.15);'
                    + 'color:#f87171;border:1px solid rgba(239,68,68,0.35);font-size:8px;font-weight:800;'
                    + 'letter-spacing:1px;padding:2px 8px;border-radius:10px;';

            } else if (hasNewFields && trialRemSec > 0) {
                // NEW server — show live countdown
                _expTs = Date.now() + (trialRemSec * 1000);
                // Persist for scan gate
                chrome['storage']['local']['set']({
                    '__ss_pro': false, '__ss_trial_exp': _expTs, '__ss_expired': false
                });
                renderCountdown();
                if (_tick) clearInterval(_tick);
                _tick = setInterval(renderCountdown, 1000);
                window['addEventListener']('unload', function() { if(_tick) clearInterval(_tick); });

            } else if (!hasNewFields) {
                // OLD server (no __trialRemSec field) — show generic FREE TRIAL badge
                badge['innerHTML'] = '&#9201; FREE TRIAL';
                badge['style']['cssText'] = 'display:inline-block;background:rgba(34,197,94,0.12);'
                    + 'color:#4ade80;border:1px solid rgba(34,197,94,0.3);font-size:8px;font-weight:800;'
                    + 'letter-spacing:1px;padding:2px 8px;border-radius:10px;';

            } else {
                // New server but trialRemSec = 0 and canScan = true (edge case)
                badge['innerHTML'] = '&#9201; FREE TRIAL';
                badge['style']['cssText'] = 'display:inline-block;background:rgba(34,197,94,0.12);'
                    + 'color:#4ade80;border:1px solid rgba(34,197,94,0.3);font-size:8px;font-weight:800;'
                    + 'letter-spacing:1px;padding:2px 8px;border-radius:10px;';
            }
        }

        // Read email from storage, call server
        chrome['storage']['local']['get'](['__un'], function(stored) {
            var email = stored['__un'] || null;
            if (!email) {
                badge['innerHTML'] = 'NOT LOGGED IN';
                badge['style']['cssText'] = 'display:inline-block;background:rgba(255,255,255,0.05);'
                    + 'color:rgba(199,210,254,0.4);font-size:8px;font-weight:600;'
                    + 'letter-spacing:1px;padding:2px 8px;border-radius:10px;';
                return;
            }

            var ver = '1.0.0';
            try { ver = chrome['runtime']['getManifest']()['version'] || '1.0.0'; } catch(e) {}

            // Server call bypassed — treat every user as pro with unlimited access
            Promise.resolve({ __canScan: true, __isProUser: true, __trialRemSec: 9999999, __token: 'free', __blocked: false, __cr: 0 })
            ['then'](function(d) {
                applyServerData(d);
            })
            ['catch'](function(err) {
                console.log('[badge] server error:', err.message);
                // Fallback: use cached data from last scan
                chrome['storage']['local']['get'](['__ss_pro','__ss_trial_exp','__ss_expired','__isProUser'], function(d) {
                    var expTs  = d['__ss_trial_exp'] || 0;
                    var rem    = expTs > 0 ? Math.max(0, Math.floor((expTs - Date.now()) / 1000)) : 0;
                    var isPro  = !!d['__isProUser'] || !!d['__ss_pro'];
                    var expired= !!d['__ss_expired'];
                    if (isPro) {
                        badge['innerHTML'] = '&#10024; PREMIUM';
                        badge['style']['cssText'] = 'display:inline-block;background:linear-gradient(135deg,#16f5ff,#a341ff);'
                            + 'color:#fff;font-size:8px;font-weight:900;letter-spacing:1.5px;padding:2px 8px;'
                            + 'border-radius:10px;text-transform:uppercase;box-shadow:0 0 8px rgba(22,245,255,0.4);';
                    } else if (expired) {
                        badge['innerHTML'] = '&#128274; TRIAL ENDED';
                        badge['style']['cssText'] = 'display:inline-block;background:rgba(239,68,68,0.15);'
                            + 'color:#f87171;border:1px solid rgba(239,68,68,0.35);font-size:8px;font-weight:800;'
                            + 'letter-spacing:1px;padding:2px 8px;border-radius:10px;';
                    } else if (expTs > 0 && rem > 0) {
                        _expTs = expTs;
                        renderCountdown();
                        _tick = setInterval(renderCountdown, 1000);
                        window['addEventListener']('unload', function() { if(_tick) clearInterval(_tick); });
                    } else {
                        // No cached data at all — show offline indicator
                        badge['innerHTML'] = '&#9654; FREE TRIAL';
                        badge['style']['cssText'] = 'display:inline-block;background:rgba(34,197,94,0.12);'
                            + 'color:#4ade80;border:1px solid rgba(34,197,94,0.3);font-size:8px;font-weight:800;'
                            + 'letter-spacing:1px;padding:2px 8px;border-radius:10px;';
                    }
                });
            });
        });
    })();
    // ─────────────────────────────────────────────────────────────


    // ── Upgrade button in popup ───────────────────────────────────
    (function() {
        const upgradeBtn = document['getElementById']('upgrade-btn');
        if (!upgradeBtn) return;
        upgradeBtn['addEventListener']('click', async function(e) {
            e['preventDefault']();
            upgradeBtn['style']['opacity'] = '0.7';
            upgradeBtn['innerHTML'] = '<span class="btn-svg"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" opacity="0.3"/><path d="M12 2a10 10 0 1 0 10 10"/></svg></span><span>Loading...</span>';
            try {
                chrome['storage']['local']['get'](['__un'], async function(d) {
                    const email = d['__un'];
                    if (!email) {
                        alert('Please log in to your Amazon account first.');
                        upgradeBtn['style']['opacity'] = '1';
                        upgradeBtn['innerHTML'] = '<span class="btn-svg"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg></span><span>Upgrade</span>';
                        return;
                    }
                    try {
                        // stripe/create-checkout call removed
                        alert('Payment is not available in this version.');
                    } catch(err) {
                        alert('Could not connect to server. Check your connection.');
                    }
                    upgradeBtn['style']['opacity'] = '1';
                    upgradeBtn['innerHTML'] = '<span class="btn-svg"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg></span><span>Upgrade</span>';
                });
            } catch(err) {
                upgradeBtn['style']['opacity'] = '1';
            }
        });
    })();
    // ─────────────────────────────────────────────────────────────

    // ── Guide Button ─────────────────────────────────────────────
    const _guideBtn = document['getElementById']('guide-btn');
    if (_guideBtn) {
        _guideBtn['addEventListener']('click', function(e) {
            e['preventDefault']();
            // Send message to Amazon page content script to show guide there
            chrome['tabs']['query']({ 'active': true, 'currentWindow': true }, function(tabs) {
                if (tabs[0] && tabs[0]['url'] && tabs[0]['url']['includes']('hiring.amazon')) {
                    chrome['tabs']['sendMessage'](tabs[0]['id'], { 'action': 'showGuide' });
                    window.close();
                }
            });
        });
    }
    // ─────────────────────────────────────────────────────────────

});