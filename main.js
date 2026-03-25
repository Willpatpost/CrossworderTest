// main.js
import { CrosswordSolver } from './CrosswordSolver.js';

document.addEventListener('DOMContentLoaded', async () => {
    initializeTheme();

    const app = new CrosswordSolver();
    await app.init();

    setupNavigation(app);
    setupThemeToggle();
    setupNYTToolbar();
});

/* ===============================
   THEME INITIALIZATION
================================ */
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
    }
}

/* ===============================
   NAVIGATION
================================ */
function setupNavigation(app) {
    const navButtons = document.querySelectorAll('.nav-btn');
    const views = document.querySelectorAll('.view-section');
    const logo = document.getElementById('nav-logo');

    const switchView = (targetId) => {
        // Update nav button active state
        navButtons.forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.target === targetId);
        });

        // Show/hide sections
        views.forEach((view) => {
            view.classList.toggle('hidden', view.id !== targetId);
        });

        // Route play/editor transitions through the orchestrator
        if (targetId === 'play-screen') {
            if (!app.modes?.isPlayMode) {
                app.enterPlayMode();
            }
        } else {
            if (app.modes?.isPlayMode) {
                app.exitPlayMode();
            }
        }
    };

    navButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            switchView(btn.dataset.target);
        });
    });

    if (logo) {
        logo.addEventListener('click', () => {
            switchView('home-screen');
        });

        logo.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                switchView('home-screen');
            }
        });
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

    const closeAll = () => {
        document.querySelectorAll('.toolbar-dropdown').forEach((dropdown) => {
            dropdown.classList.add('hidden');
        });
    };

    const toggleDropdown = (dropdown) => {
        if (!dropdown) return;

        const wasHidden = dropdown.classList.contains('hidden');
        closeAll();

        if (wasHidden) {
            dropdown.classList.remove('hidden');
        }
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