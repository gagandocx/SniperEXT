// ── Notification Permission Blocker ──────────────────────────────
// Runs in MAIN world at document_start — before Amazon's page code
// Silently overrides requestPermission so the prompt NEVER appears
// User never misses a shift due to a permission popup
(function() {
    if (typeof Notification === 'undefined') return;
    // Store original in case needed
    var _orig = Notification.requestPermission.bind(Notification);
    // Override: return 'default' silently — no prompt shown
    Notification.requestPermission = function() {
        return Promise.resolve('default');
    };
    // Also block the constructor from throwing if permission denied
    var _OrigNotif = Notification;
    try {
        Object.defineProperty(window, 'Notification', {
            get: function() { return _OrigNotif; },
            configurable: true
        });
    } catch(e) {}
})();
