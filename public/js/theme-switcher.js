document.addEventListener('DOMContentLoaded', () => {
    const themeToggler = document.getElementById('theme-toggler');
    const currentTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

    // Function to apply the theme
    function applyTheme(theme) {
        if (theme === 'dark') {
            document.body.classList.add('dark-theme');
            if (themeToggler) themeToggler.textContent = '☀️'; // Sun icon for dark mode
        } else {
            document.body.classList.remove('dark-theme');
            if (themeToggler) themeToggler.textContent = '🌙'; // Moon icon for light mode
        }
    }

    // Initialize theme based on saved preference or system preference
    if (currentTheme) {
        applyTheme(currentTheme);
    } else if (systemPrefersDark) {
        applyTheme('dark');
        localStorage.setItem('theme', 'dark'); // Save system preference as user choice
    } else {
        applyTheme('light'); // Default to light if no preference and no system preference for dark
    }

    // Event listener for the toggler button
    if (themeToggler) {
        themeToggler.addEventListener('click', () => {
            let newTheme;
            if (document.body.classList.contains('dark-theme')) {
                document.body.classList.remove('dark-theme');
                newTheme = 'light';
            } else {
                document.body.classList.add('dark-theme');
                newTheme = 'dark';
            }
            localStorage.setItem('theme', newTheme);
            localStorage.setItem('theme-manual-override', 'true'); // User has made a manual choice
            applyTheme(newTheme); // Update button text/icon
        });
    }

    // Listen for changes in system preference
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        // Only change if user hasn't manually set a theme by clicking the toggle
        if (localStorage.getItem('theme-manual-override') !== 'true') {
            const newSystemTheme = e.matches ? 'dark' : 'light';
            applyTheme(newSystemTheme);
            localStorage.setItem('theme', newSystemTheme);
            // Do NOT set manual-override here, as this is a system change
        }
    });
});
