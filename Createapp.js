(async function () {
    function a(d) {
        const e = new MouseEvent('click', {
            'view': window,
            'bubbles': !![],
            'cancelable': !![]
        });
        d['dispatchEvent'](e), setTimeout(() => {
            d['click']();
        }, 0x1f4);
    }
    function b() {
        setTimeout(() => {
            window['location']['href'] = 'https://hiring.amazon.ca/app#/jobSearch';
        }, 0x2710);
    }
    const c = new MutationObserver(() => {
        const d = document['querySelectorAll']('button');
        d['forEach'](f => {
            const g = f['querySelector']('div[data-test-component=\x22StencilReactRow\x22]')?.['textContent']?.['trim']();
            if (g === 'Next') {
                a(f), c['disconnect'](), setTimeout(() => {
                    const h = [...document['querySelectorAll']('button')]['find'](i => i['querySelector']('div[data-test-component=\x22StencilReactRow\x22]')?.['textContent']?.['trim']() === 'Create\x20Application');
                    if (h)
                        a(h), c['disconnect'](), b();
                    else {
                    }
                }, 0x7d0);
                return;
            } else {
            }
        });
        const e = [...document['querySelectorAll']('button')]['find'](f => f['querySelector']('div[data-test-component=\x22StencilReactRow\x22]')?.['textContent']?.['trim']() === 'Create\x20Application');
        if (e)
            a(e), c['disconnect'](), b();
        else {
        }
    });
    c['observe'](document['body'], {
        'childList': !![],
        'subtree': !![]
    });
}());