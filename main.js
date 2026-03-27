// main.js
import { CrosswordApp } from './app/CrosswordApp.js';

document.addEventListener('DOMContentLoaded', async () => {
    initializeTheme();

    const app = new CrosswordApp();
    await app.init();

    setupNavigation(app);
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
   NAVIGATION
================================ */
function setupNavigation(app) {
    const navButtons = Array.from(document.querySelectorAll('.nav-btn'));
    const views = Array.from(document.querySelectorAll('.view-section'));
    const logo = document.getElementById('nav-logo');
    const homeActionButtons = Array.from(document.querySelectorAll('[data-home-target]'));

    const getButtonForTarget = (targetId) =>
        navButtons.find((btn) => btn.dataset.target === targetId) || null;

    const updateNavState = (targetId) => {
        navButtons.forEach((btn) => {
            const isActive = btn.dataset.target === targetId;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', String(isActive));
            btn.setAttribute('tabindex', isActive ? '0' : '-1');
        });
    };

    const updateViewState = (targetId) => {
        views.forEach((view) => {
            const isTarget = view.id === targetId;
            view.classList.toggle('hidden', !isTarget);
            view.setAttribute('aria-hidden', String(!isTarget));
        });
    };

    const focusPrimaryHeading = (targetId) => {
        const view = document.getElementById(targetId);
        if (!view) return;

        const heading = view.querySelector('h1, h2');
        if (!heading) return;

        if (!heading.hasAttribute('tabindex')) {
            heading.setAttribute('tabindex', '-1');
        }

        heading.focus({ preventScroll: true });
    };

    const switchView = (targetId, { focusHeading = false } = {}) => {
        if (!targetId) return;

        document.dispatchEvent(new CustomEvent('crossworder:close-play-menus'));

        if (targetId === 'play-screen') {
            if (!app.modes?.isPlayMode) {
                const entered = app.enterPlayMode();
                if (!entered) {
                    return;
                }
            }
        } else if (app.modes?.isPlayMode) {
            app.exitPlayMode();
        }

        updateNavState(targetId);
        updateViewState(targetId);

        if (focusHeading) {
            focusPrimaryHeading(targetId);
        }
    };

    navButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            switchView(btn.dataset.target);
        });

        btn.addEventListener('keydown', (e) => {
            const currentIndex = navButtons.indexOf(btn);

            if (e.key === 'ArrowRight') {
                e.preventDefault();
                const next = navButtons[(currentIndex + 1) % navButtons.length];
                next?.focus();
            }

            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                const prev =
                    navButtons[(currentIndex - 1 + navButtons.length) % navButtons.length];
                prev?.focus();
            }

            if (e.key === 'Home') {
                e.preventDefault();
                navButtons[0]?.focus();
            }

            if (e.key === 'End') {
                e.preventDefault();
                navButtons[navButtons.length - 1]?.focus();
            }

            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                switchView(btn.dataset.target, { focusHeading: true });
            }
        });
    });

    if (logo) {
        logo.addEventListener('click', () => {
            switchView('home-screen');
        });

        logo.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                switchView('home-screen', { focusHeading: true });
            }
        });
    }

    homeActionButtons.forEach((button) => {
        button.addEventListener('click', () => {
            switchView(button.dataset.homeTarget, { focusHeading: true });
        });
    });

    const initiallyActive =
        navButtons.find((btn) => btn.classList.contains('active'))?.dataset.target ||
        views.find((view) => !view.classList.contains('hidden'))?.id ||
        'home-screen';

    switchView(initiallyActive);

    // Keep nav state correct if browser restores focus weirdly after reloads
    const activeBtn = getButtonForTarget(initiallyActive);
    activeBtn?.setAttribute('aria-selected', 'true');
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
