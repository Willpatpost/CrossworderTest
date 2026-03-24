// main.js
import { CrosswordSolver } from './CrosswordSolver.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Theme initialization (prevents "flash" of white on dark mode users)
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
    }

    // 2. Initialize the main application
    const app = new CrosswordSolver();
    app.init();

    // 3. Setup the Theme Toggle Button
    setupThemeToggle();
});

/**
 * Handles switching between Light and Dark modes
 * and saves the preference to localStorage.
 */
function setupThemeToggle() {
    const themeBtn = document.getElementById('theme-toggle-button');
    
    if (!themeBtn) return;

    themeBtn.addEventListener('click', () => {
        const isDarkMode = document.body.classList.toggle('dark-mode');
        
        // Save the choice
        if (isDarkMode) {
            localStorage.setItem('theme', 'dark');
        } else {
            localStorage.setItem('theme', 'light');
        }
    });
}