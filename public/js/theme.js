/* ============================================
   ZENITH OS - THEME MANAGER
   ============================================ */
(function() {
    // Apply saved theme immediately (before page renders)
    const saved = localStorage.getItem('zenith-theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);

    window.ZenithTheme = {
        current: function() {
            return document.documentElement.getAttribute('data-theme') || 'light';
        },
        set: function(theme) {
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('zenith-theme', theme);
            // Persist to server
            fetch('/api/user/theme', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ theme: theme })
            }).catch(function() {}); // silent fail
        },
        toggle: function() {
            var next = this.current() === 'light' ? 'dark' : 'light';
            this.set(next);
        }
    };
})();
