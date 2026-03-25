// ui/DisplayManager.js

export class DisplayManager {
    constructor() {
        this.statusDisplay = document.getElementById('status-display');
        this.acrossDisplay = document.getElementById('across-display');
        this.downDisplay = document.getElementById('down-display');
        this.dropdown = document.getElementById('search-dropdown');
        this.matchesCount = document.getElementById('matches-count');
    }

    /* ===============================
       STATUS LOG
    =============================== */

    updateStatus(message, append = false) {
        if (!this.statusDisplay) return;

        const timestamp = new Date().toLocaleTimeString([], {
            hour12: false,
            minute: '2-digit',
            second: '2-digit'
        });

        const text = `[${timestamp}] ${message}\n`;

        this.statusDisplay.value = append
            ? this.statusDisplay.value + text
            : text;

        this.statusDisplay.scrollTop = this.statusDisplay.scrollHeight;
    }

    /* ===============================
       WORD LIST RENDERING (FAST + CLEAN)
    =============================== */

    async updateWordLists(
        slots,
        solution = {},
        onWordClick,
        definitionsProvider = null,
        isPlayMode = false
    ) {
        if (!this.acrossDisplay || !this.downDisplay) return;

        const acrossSlots = this._getSortedSlots(slots, 'across');
        const downSlots = this._getSortedSlots(slots, 'down');

        // Render immediately (fast UI)
        this._renderSlotList(acrossSlots, this.acrossDisplay, solution, onWordClick, isPlayMode);
        this._renderSlotList(downSlots, this.downDisplay, solution, onWordClick, isPlayMode);

        // Then hydrate clues async (non-blocking)
        if (isPlayMode && definitionsProvider) {
            this._hydrateClues([...acrossSlots, ...downSlots], solution, definitionsProvider);
        }
    }

    _getSortedSlots(slots, direction) {
        return Object.values(slots)
            .filter(s => s.direction === direction)
            .sort((a, b) => a.number - b.number);
    }

    _renderSlotList(slotsArr, container, solution, onWordClick, isPlayMode) {
        container.innerHTML = '';

        const fragment = document.createDocumentFragment();

        slotsArr.forEach(slot => {
            const word = solution[slot.id];

            const item = document.createElement('div');
            item.className = 'word-list-item';
            item.dataset.slotId = slot.id;

            const number = document.createElement('span');
            number.className = 'clue-number';
            number.textContent = slot.number;

            const text = document.createElement('span');
            text.className = 'clue-text';

            // Instant render (no waiting)
            if (isPlayMode) {
                text.textContent = 'Loading clue...';
                text.classList.add('muted-text');
            } else {
                text.textContent = word || '•'.repeat(slot.length);
                text.classList.add('builder-word');
            }

            item.appendChild(number);
            item.appendChild(text);

            item.addEventListener('click', () => onWordClick(slot));

            fragment.appendChild(item);
        });

        container.appendChild(fragment);
    }

    /* ===============================
       ASYNC CLUE HYDRATION (FAST)
    =============================== */

    async _hydrateClues(slots, solution, definitionsProvider) {
        const promises = slots.map(async (slot) => {
            const word = solution[slot.id];
            if (!word) return;

            try {
                const results = await definitionsProvider.lookup(word);
                return { slotId: slot.id, result: results?.[0] };
            } catch {
                return { slotId: slot.id, error: true };
            }
        });

        const results = await Promise.all(promises);

        results.forEach(({ slotId, result, error }) => {
            const item = document.querySelector(`.word-list-item[data-slot-id="${slotId}"]`);
            if (!item) return;

            const text = item.querySelector('.clue-text');

            if (error) {
                text.textContent = '[Error loading clue]';
                return;
            }

            if (!result) {
                text.textContent = 'No clue found';
                text.classList.add('muted-text');
                return;
            }

            text.textContent = result.clue;

            // Optional source badge
            if (result.source) {
                const badge = document.createElement('span');
                badge.className = 'clue-source';
                badge.textContent = result.source;
                item.appendChild(badge);
            }
        });
    }

    /* ===============================
       SEARCH DROPDOWN
    =============================== */

    updateSearchResults(matches, onSelect) {
        if (!this.dropdown) return;

        this.dropdown.innerHTML = '';

        if (!matches.length) {
            this.dropdown.classList.add('hidden');
            if (this.matchesCount) {
                this.matchesCount.textContent = 'No matches found';
            }
            return;
        }

        this.dropdown.classList.remove('hidden');

        if (this.matchesCount) {
            this.matchesCount.textContent = `${matches.length} match${matches.length > 1 ? 'es' : ''}`;
        }

        const fragment = document.createDocumentFragment();

        matches.forEach(word => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.textContent = word;

            item.addEventListener('click', () => {
                this.dropdown.classList.add('hidden');
                onSelect(word);
            });

            fragment.appendChild(item);
        });

        this.dropdown.appendChild(fragment);
    }

    /* ===============================
       ACTIVE CLUE HIGHLIGHT
    =============================== */

    highlightSlotInList(slotId) {
        document.querySelectorAll('.word-list-item')
            .forEach(el => el.classList.remove('selected-clue'));

        const target = document.querySelector(`.word-list-item[data-slot-id="${slotId}"]`);

        if (target) {
            target.classList.add('selected-clue');
            target.scrollIntoView({
                block: 'nearest',
                behavior: 'smooth'
            });
        }
    }
}