// ui/PopupManager.js

export class PopupManager {
    constructor(localProvider, fallbackProvider) {
        this.localProvider = localProvider;
        this.fallbackProvider = fallbackProvider;

        this.activeOverlay = null;
        this.boundEscapeHandler = null;
    }

    /* ===============================
       PUBLIC API
    =============================== */

    async show(word) {
        if (!word) return;

        const normalizedWord = word.trim().toUpperCase();
        if (!normalizedWord) return;

        this.close();

        try {
            const localResults = await this.localProvider.lookup(normalizedWord);

            if (Array.isArray(localResults) && localResults.length > 0) {
                this._createPopup(normalizedWord, localResults, 'Local Database');
                return;
            }

            await this._handleFallback(normalizedWord);
        } catch (error) {
            console.error('Popup error:', error);
            await this._handleFallback(normalizedWord);
        }
    }

    close() {
        if (this.activeOverlay && document.body.contains(this.activeOverlay)) {
            document.body.removeChild(this.activeOverlay);
        }

        this.activeOverlay = null;

        if (this.boundEscapeHandler) {
            document.removeEventListener('keydown', this.boundEscapeHandler);
            this.boundEscapeHandler = null;
        }
    }

    /* ===============================
       DATA FALLBACK
    =============================== */

    async _handleFallback(word) {
        try {
            const webResults = await this.fallbackProvider.fetchFallback(word);

            if (Array.isArray(webResults) && webResults.length > 0) {
                this._createPopup(word, webResults, 'Dictionary API');
                return;
            }
        } catch (error) {
            console.error('Fallback lookup error:', error);
        }

        this._createPopup(word, [], 'No results found');
    }

    /* ===============================
       MODAL CREATION
    =============================== */

    _createPopup(word, entries, sourceLabel) {
        const overlay = document.createElement('div');
        overlay.className = 'popup-overlay';
        overlay.setAttribute('role', 'presentation');

        const popup = document.createElement('div');
        popup.className = 'popup-modal';
        popup.setAttribute('role', 'dialog');
        popup.setAttribute('aria-modal', 'true');
        popup.setAttribute('aria-labelledby', 'popup-title');

        const header = document.createElement('div');
        header.className = 'popup-header';

        const title = document.createElement('h2');
        title.className = 'popup-title';
        title.id = 'popup-title';
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

        if (entries.length > 0) {
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
                meta.appendChild(date);

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
                close();
            }
        };

        document.addEventListener('keydown', this.boundEscapeHandler);

        document.body.appendChild(overlay);
        this.activeOverlay = overlay;

        closeBtn.focus();
    }
}