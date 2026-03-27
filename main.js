// main.js
import { CrosswordApp } from './app/CrosswordApp.js';

document.addEventListener('DOMContentLoaded', async () => {
    initializeTheme();

    const app = new CrosswordApp();
    await app.init();

    app.setupNavigation();
    setupThemeToggle();
    setupNYTToolbar();
});

/* ===============================
   THEME INITIALIZATION
================================ */
function initializeTheme() {
    const savedTheme = safelyReadThemePreference();

    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
}

/* ===============================
   NYT TOOLBAR
================================ */
function setupNYTToolbar() {
    const checkBtn = document.getElementById('check-menu-btn');
    const revealBtn = document.getElementById('reveal-menu-btn');
    const checkDropdown = document.getElementById('check-dropdown');
    const revealDropdown = document.getElementById('reveal-dropdown');

    const allDropdowns = [checkDropdown, revealDropdown].filter(Boolean);

    const setExpanded = (button, expanded) => {
        if (!button) return;
        button.setAttribute('aria-expanded', String(expanded));
    };

    const closeAll = () => {
        allDropdowns.forEach((dropdown) => {
            dropdown.classList.add('hidden');
        });

        setExpanded(checkBtn, false);
        setExpanded(revealBtn, false);
    };

    const openDropdown = (button, dropdown) => {
        if (!button || !dropdown) return;

        closeAll();
        dropdown.classList.remove('hidden');
        setExpanded(button, true);
    };

    const toggleDropdown = (button, dropdown) => {
        if (!button || !dropdown) return;

        const isHidden = dropdown.classList.contains('hidden');

        if (isHidden) {
            openDropdown(button, dropdown);
        } else {
            closeAll();
        }
    };

    checkBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown(checkBtn, checkDropdown);
    });

    revealBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown(revealBtn, revealDropdown);
    });

    document.addEventListener('click', (e) => {
        const target = e.target;
        const clickedInsideDropdown = allDropdowns.some((dropdown) =>
            dropdown.contains(target)
        );
        const clickedTrigger =
            checkBtn?.contains(target) || revealBtn?.contains(target);

        if (!clickedInsideDropdown && !clickedTrigger) {
            closeAll();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAll();
        }
    });

    document.addEventListener('crossworder:close-play-menus', () => {
        closeAll();
    });

    allDropdowns.forEach((dropdown) => {
        dropdown.addEventListener('click', () => {
            closeAll();
        });
    });

    closeAll();
}

/* ===============================
   THEME TOGGLE
================================ */
function setupThemeToggle() {
    const themeBtn = document.getElementById('theme-toggle-button');
    if (!themeBtn) return;

    themeBtn.addEventListener('click', () => {
        const isDarkMode = document.body.classList.toggle('dark-mode');
        try {
            localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
        } catch (error) {
            console.warn('Theme preference could not be saved.', error);
        }
    });
}

function safelyReadThemePreference() {
    try {
        return localStorage.getItem('theme');
    } catch (error) {
        console.warn('Theme preference could not be read.', error);
        return null;
    }
}
