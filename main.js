// main.js
import { CrosswordSolver } from './CrosswordSolver.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Theme initialization
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
    }

    // 2. Initialize the core application logic
    const app = new CrosswordSolver();
    app.init();

    // 3. Setup UI systems
    setupThemeToggle();
    setupNavigation(app);
    setupNYTToolbar();
});

/**
 * Handles the Single Page Application (SPA) view switching.
 * Moves the shared game container between the Editor and Play screens.
 */
function setupNavigation(app) {
    const navButtons = document.querySelectorAll('.nav-btn');
    const views = document.querySelectorAll('.view-section');
    const sharedAssets = document.getElementById('shared-assets');
    const gameContainer = document.getElementById('game-container');
    const playMainContent = document.getElementById('play-main-content');
    const editorScreen = document.getElementById('editor-screen');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');

            // 1. Update active button UI
            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // 2. Switch visibility of main sections
            views.forEach(view => {
                view.classList.add('hidden');
                if (view.id === targetId) {
                    view.classList.remove('hidden');
                }
            });

            // 3. Handle Shared Asset DOM relocation
            // If going to Editor, move grid/clues back to the editor flow
            if (targetId === 'editor-screen') {
                editorScreen.appendChild(gameContainer);
                if (app.modes.isPlayMode) {
                    app.modes.togglePlayMode(); // Exit play mode logic if active
                }
            } 
            // If going to Play, move grid/clues into the Play Screen layout
            else if (targetId === 'play-screen') {
                playMainContent.appendChild(gameContainer);
                if (!app.modes.isPlayMode) {
                    app.modes.togglePlayMode(); // Enter play mode logic (clues, checking)
                }
            } 
            // If going Home, tuck them away
            else {
                sharedAssets.appendChild(gameContainer);
            }
        });
    });
}

/**
 * Handles the logic for the NYT-style toolbar in the Play screen.
 */
function setupNYTToolbar() {
    const checkBtn = document.getElementById('check-menu-btn');
    const revealBtn = document.getElementById('reveal-menu-btn');
    const checkDropdown = document.getElementById('check-dropdown');
    const revealDropdown = document.getElementById('reveal-dropdown');

    // Simple dropdown toggling
    const toggleDropdown = (dropdown) => {
        const isHidden = dropdown.classList.contains('hidden');
        // Close others
        document.querySelectorAll('.toolbar-dropdown').forEach(d => d.classList.add('hidden'));
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

    // Close dropdowns when clicking anywhere else
    document.addEventListener('click', () => {
        document.querySelectorAll('.toolbar-dropdown').forEach(d => d.classList.add('hidden'));
    });
}

/**
 * Handles switching between Light and Dark modes
 */
function setupThemeToggle() {
    const themeBtn = document.getElementById('theme-toggle-button');
    if (!themeBtn) return;

    themeBtn.addEventListener('click', () => {
        const isDarkMode = document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    });
}