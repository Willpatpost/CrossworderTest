export const navigationMethods = {
    setupNavigation() {
        this._navButtons = Array.from(document.querySelectorAll('.nav-btn'));
        this._viewSections = Array.from(document.querySelectorAll('.view-section'));
        this._navLogo = document.getElementById('nav-logo');
        this._homeActionButtons = Array.from(document.querySelectorAll('[data-home-target]'));

        this._navButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                this.switchView(btn.dataset.target);
            });

            btn.addEventListener('keydown', (event) => {
                this._handleNavKeydown(event, btn);
            });
        });

        if (this._navLogo) {
            this._navLogo.addEventListener('click', () => {
                this.switchView('home-screen');
            });
        }

        this._homeActionButtons.forEach((button) => {
            button.addEventListener('click', () => {
                this.switchView(button.dataset.homeTarget, { focusHeading: true });
            });
        });

        const initiallyActive =
            this._navButtons.find((btn) => btn.classList.contains('active'))?.dataset.target
            || this._viewSections.find((view) => !view.classList.contains('hidden'))?.id
            || 'home-screen';

        this.switchView(initiallyActive);
        this._getNavButtonForTarget(initiallyActive)?.setAttribute('aria-selected', 'true');
    },

    switchView(targetId, { focusHeading = false } = {}) {
        if (!targetId) return false;

        document.dispatchEvent(new CustomEvent('crossworder:close-play-menus'));

        if (targetId === 'play-screen') {
            if (!this.modes?.isPlayMode) {
                const entered = this.enterPlayMode();
                if (!entered) {
                    return false;
                }
            }
        } else if (this.modes?.isPlayMode) {
            this.exitPlayMode();
        }

        this._updateNavigationState(targetId);
        this._updateViewState(targetId);

        if (focusHeading) {
            this._focusPrimaryHeading(targetId);
        }

        return true;
    },

    _handleNavKeydown(event, button) {
        const currentIndex = this._navButtons.indexOf(button);

        if (event.key === 'ArrowRight') {
            event.preventDefault();
            const next = this._navButtons[(currentIndex + 1) % this._navButtons.length];
            next?.focus();
        }

        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            const prev =
                this._navButtons[(currentIndex - 1 + this._navButtons.length) % this._navButtons.length];
            prev?.focus();
        }

        if (event.key === 'Home') {
            event.preventDefault();
            this._navButtons[0]?.focus();
        }

        if (event.key === 'End') {
            event.preventDefault();
            this._navButtons[this._navButtons.length - 1]?.focus();
        }

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.switchView(button.dataset.target, { focusHeading: true });
        }
    },

    _getNavButtonForTarget(targetId) {
        return this._navButtons.find((btn) => btn.dataset.target === targetId) || null;
    },

    _updateNavigationState(targetId) {
        this._navButtons.forEach((btn) => {
            const isActive = btn.dataset.target === targetId;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', String(isActive));
            btn.setAttribute('tabindex', isActive ? '0' : '-1');
        });
    },

    _updateViewState(targetId) {
        this._viewSections.forEach((view) => {
            const isTarget = view.id === targetId;
            view.classList.toggle('hidden', !isTarget);
            view.setAttribute('aria-hidden', String(!isTarget));
        });
    },

    _focusPrimaryHeading(targetId) {
        const view = document.getElementById(targetId);
        if (!view) return;

        const heading = view.querySelector('h1, h2');
        if (!heading) return;

        if (!heading.hasAttribute('tabindex')) {
            heading.setAttribute('tabindex', '-1');
        }

        heading.focus({ preventScroll: true });
    }
};
