// ui/PopupManager.js

export class PopupManager {
    constructor(localProvider, fallbackProvider) {
        this.localProvider = localProvider;
        this.fallbackProvider = fallbackProvider;

        this.activeOverlay = null;
        this.activePopup = null;
        this.boundEscapeHandler = null;
        this.boundFocusHandler = null;
        this.previouslyFocusedElement = null;
        this.currentRequestToken = 0;
    }

    /* ===============================
       PUBLIC API
    =============================== */

    async show(word) {
        if (!word) return;

        const normalizedWord = word.trim().toUpperCase();
        if (!normalizedWord) return;

        const requestToken = ++this.currentRequestToken;

        this.close({ invalidateRequest: false });

        try {
            const localResults = await this.localProvider.lookup(normalizedWord);

            if (requestToken !== this.currentRequestToken) return;

            if (Array.isArray(localResults) && localResults.length > 0) {
                this._createPopup(normalizedWord, localResults, 'Local Database');
                return;
            }

            await this._handleFallback(normalizedWord, requestToken);
        } catch (error) {
            console.error('Popup error:', error);

            if (requestToken !== this.currentRequestToken) return;
            await this._handleFallback(normalizedWord, requestToken);
        }
    }

    close({ invalidateRequest = true } = {}) {
        if (invalidateRequest) {
            this.currentRequestToken++;
        }

        if (this.activeOverlay && document.body.contains(this.activeOverlay)) {
            document.body.removeChild(this.activeOverlay);
        }

        if (this.boundEscapeHandler) {
            document.removeEventListener('keydown', this.boundEscapeHandler);
            this.boundEscapeHandler = null;
        }

        if (this.boundFocusHandler) {
            document.removeEventListener('focusin', this.boundFocusHandler);
            this.boundFocusHandler = null;
        }

        this.activeOverlay = null;
        this.activePopup = null;

        if (
            this.previouslyFocusedElement &&
            typeof this.previouslyFocusedElement.focus === 'function' &&
            document.contains(this.previouslyFocusedElement)
        ) {
            this.previouslyFocusedElement.focus();
        }

        this.previouslyFocusedElement = null;
    }

    /* ===============================
       DATA FALLBACK
    =============================== */

    async _handleFallback(word, requestToken) {
        try {
            const webResults = await this.fallbackProvider.fetchFallback(word);

            if (requestToken !== this.currentRequestToken) return;

            if (Array.isArray(webResults) && webResults.length > 0) {
                this._createPopup(word, webResults, 'Dictionary API');
                return;
            }
        } catch (error) {
            console.error('Fallback lookup error:', error);

            if (requestToken !== this.currentRequestToken) return;
        }

        if (requestToken !== this.currentRequestToken) return;
        this._createPopup(word, [], 'No results found');
    }

    /* ===============================
       MODAL CREATION
    =============================== */

    _createPopup(word, entries, sourceLabel) {
        this.close({ invalidateRequest: false });
        this.previouslyFocusedElement = document.activeElement;

        const overlay = document.createElement('div');
        overlay.className = 'popup-overlay';
        overlay.setAttribute('role', 'presentation');

        const popup = document.createElement('div');
        popup.className = 'popup-modal';
        popup.setAttribute('role', 'dialog');
        popup.setAttribute('aria-modal', 'true');

        const titleId = `popup-title-${Date.now()}`;
        popup.setAttribute('aria-labelledby', titleId);

        const header = document.createElement('div');
        header.className = 'popup-header';

        const title = document.createElement('h2');
        title.className = 'popup-title';
        title.id = titleId;
        title.textContent = word;

        const closeBtn = document.createElement('button');
        closeBtn.className = 'popup-close-btn';
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'Close popup');
        closeBtn.textContent = 'Close';

        header.appendChild(title);
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.className = 'popup-body';

        if (Array.isArray(entries) && entries.length > 0) {
            entries.forEach((item, index) => {
                const entry = document.createElement('div');
                entry.className = 'popup-entry';

                if (index < entries.length - 1) {
                    entry.classList.add('popup-entry-bordered');
                }

                const clue = document.createElement('p');
                clue.className = 'popup-clue';
                clue.textContent = item?.clue || 'No clue text available';

                const meta = document.createElement('div');
                meta.className = 'popup-meta';

                const source = document.createElement('span');
                source.className = 'popup-source';
                source.textContent = item?.source || sourceLabel;

                const date = document.createElement('span');
                date.className = 'popup-date';
                date.textContent = item?.date || '';

                meta.appendChild(source);

                if (date.textContent) {
                    meta.appendChild(date);
                }

                entry.appendChild(clue);
                entry.appendChild(meta);
                body.appendChild(entry);
            });
        } else {
            const empty = document.createElement('p');
            empty.className = 'popup-empty';
            empty.textContent = 'No historical clues or definitions found for this word.';
            body.appendChild(empty);
        }

        const footer = document.createElement('div');
        footer.className = 'popup-footer';

        const sourceLabelEl = document.createElement('small');
        sourceLabelEl.className = 'popup-footer-source';
        sourceLabelEl.textContent = `Source: ${sourceLabel}`;

        footer.appendChild(sourceLabelEl);

        popup.appendChild(header);
        popup.appendChild(body);
        popup.appendChild(footer);
        overlay.appendChild(popup);

        const close = () => this.close();

        closeBtn.addEventListener('click', close);

        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                close();
            }
        });

        this.boundEscapeHandler = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                close();
            }

            if (event.key === 'Tab') {
                this._trapTabKey(event, popup);
            }
        };

        this.boundFocusHandler = (event) => {
            if (!this.activePopup) return;
            if (this.activePopup.contains(event.target)) return;

            const firstFocusable = this._getFocusableElements(this.activePopup)[0];
            firstFocusable?.focus();
        };

        document.addEventListener('keydown', this.boundEscapeHandler);
        document.addEventListener('focusin', this.boundFocusHandler);

        document.body.appendChild(overlay);

        this.activeOverlay = overlay;
        this.activePopup = popup;

        closeBtn.focus();
    }

    /* ===============================
       FOCUS MANAGEMENT
    =============================== */

    _getFocusableElements(container) {
        if (!container) return [];

        const selectors = [
            'button:not([disabled])',
            '[href]',
            'input:not([disabled])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            '[tabindex]:not([tabindex="-1"])'
        ];

        return Array.from(container.querySelectorAll(selectors.join(','))).filter(
            (el) =>
                !el.hasAttribute('disabled') &&
                el.getAttribute('aria-hidden') !== 'true'
        );
    }

    _trapTabKey(event, popup) {
        const focusable = this._getFocusableElements(popup);
        if (!focusable.length) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (event.shiftKey) {
            if (active === first || !popup.contains(active)) {
                event.preventDefault();
                last.focus();
            }
            return;
        }

        if (active === last) {
            event.preventDefault();
            first.focus();
        }
    }
}
