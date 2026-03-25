// main.js
import { CrosswordSolver } from './CrosswordSolver.js';

document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();

    // Initialize app
    const app = new CrosswordSolver();
    app.init();

    setupNavigation(app);
    setupThemeToggle();
    setupNYTToolbar();
});

/* ===============================
   THEME INITIALIZATION (FIXED)
================================ */
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
    }
}

/* ===============================
   NAVIGATION (SIMPLIFIED + FIXED)
================================ */
function setupNavigation(app) {
    const navButtons = document.querySelectorAll('.nav-btn');
    const views = document.querySelectorAll('.view-section');
    const logo = document.getElementById('nav-logo');

    const switchView = (targetId) => {
        // Update active nav button
        navButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.target === targetId);
        });

        // Show/hide views
        views.forEach(view => {
            view.classList.toggle('hidden', view.id !== targetId);
        });

        // Handle Play Mode toggle cleanly
        if (targetId === 'play-screen') {
            if (!app.modes?.isPlayMode) {
                app.modes?.togglePlayMode();
            }
        } else {
            if (app.modes?.isPlayMode) {
                app.modes?.togglePlayMode();
            }
        }
    };

    // Nav button clicks
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            switchView(btn.dataset.target);
        });
    });

    // Logo click → Home
    if (logo) {
        logo.addEventListener('click', () => switchView('home-screen'));

        // Accessibility (keyboard)
        logo.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                switchView('home-screen');
            }
        });
    }
}

/* ===============================
   NYT TOOLBAR (CLEANED)
================================ */
function setupNYTToolbar() {
    const checkBtn = document.getElementById('check-menu-btn');
    const revealBtn = document.getElementById('reveal-menu-btn');
    const checkDropdown = document.getElementById('check-dropdown');
    const revealDropdown = document.getElementById('reveal-dropdown');

    const closeAll = () => {
        document.querySelectorAll('.toolbar-dropdown')
            .forEach(d => d.classList.add('hidden'));
    };

    const toggleDropdown = (dropdown) => {
        const isHidden = dropdown.classList.contains('hidden');
        closeAll();
        if (isHidden) dropdown.classList.remove('hidden');
    };

    checkBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown(checkDropdown);
    });

    revealBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown(revealDropdown);
    });

    document.addEventListener('click', closeAll);
}

/* ===============================
   THEME TOGGLE
================================ */
function setupThemeToggle() {
    const themeBtn = document.getElementById('theme-toggle-button');
    if (!themeBtn) return;

    themeBtn.addEventListener('click', () => {
        const isDarkMode = document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    });
}