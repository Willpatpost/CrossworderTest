// ui/DisplayManager.js

export class DisplayManager {
    constructor() {
        this.statusDisplay = document.getElementById('status-display');

        this.editorAcrossDisplay = document.getElementById('across-display');
        this.editorDownDisplay = document.getElementById('down-display');

        this.playAcrossDisplay = document.getElementById('play-across-display');
        this.playDownDisplay = document.getElementById('play-down-display');

        this.dropdown = document.getElementById('search-dropdown');
        this.matchesCount = document.getElementById('matches-count');
        this.puzzleSummary = document.getElementById('puzzle-summary');

        this._clueHydrationToken = 0;
        this._activeListMode = 'editor'; // editor | play
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

        const line = `[${timestamp}] ${message}\n`;

        this.statusDisplay.value = append
            ? `${this.statusDisplay.value}${line}`
            : line;

        this.statusDisplay.scrollTop = this.statusDisplay.scrollHeight;
    }

    /* ===============================
       WORD / CLUE LISTS
    =============================== */

    async updateWordLists(
        slots,
        solution = {},
        onWordClick,
        definitionsProvider = null,
        isPlayMode = false,
        clueMap = {}
    ) {
        this._activeListMode = isPlayMode ? 'play' : 'editor';
        const hydrationToken = ++this._clueHydrationToken;

        const acrossSlots = this._getSortedSlots(slots, 'across');
        const downSlots = this._getSortedSlots(slots, 'down');

        const { acrossContainer, downContainer } = this._getContainersForMode(isPlayMode);

        if (!acrossContainer || !downContainer) return;

        this._clearInactiveContainers(isPlayMode);

        this._renderSlotList(
            acrossSlots,
            acrossContainer,
            solution,
            onWordClick,
            isPlayMode,
            clueMap
        );

        this._renderSlotList(
            downSlots,
            downContainer,
            solution,
            onWordClick,
            isPlayMode,
            clueMap
        );

        if (isPlayMode && definitionsProvider) {
            await this._hydrateClues(
                {
                    acrossSlots,
                    downSlots,
                    acrossContainer,
                    downContainer,
                    solution,
                    definitionsProvider,
                    clueMap
                },
                hydrationToken
            );
        }
    }

    _getContainersForMode(isPlayMode) {
        if (isPlayMode) {
            return {
                acrossContainer: this.playAcrossDisplay,
                downContainer: this.playDownDisplay
            };
        }

        return {
            acrossContainer: this.editorAcrossDisplay,
            downContainer: this.editorDownDisplay
        };
    }

    _clearInactiveContainers(isPlayMode) {
        const inactiveAcross = isPlayMode
            ? this.editorAcrossDisplay
            : this.playAcrossDisplay;

        const inactiveDown = isPlayMode
            ? this.editorDownDisplay
            : this.playDownDisplay;

        if (inactiveAcross) inactiveAcross.innerHTML = '';
        if (inactiveDown) inactiveDown.innerHTML = '';
    }

    _getSortedSlots(slots, direction) {
        return Object.values(slots || {})
            .filter((slot) => slot.direction === direction)
            .sort((a, b) => a.number - b.number);
    }

    _renderSlotList(slotsArr, container, solution, onWordClick, isPlayMode, clueMap) {
        container.innerHTML = '';

        if (!slotsArr.length) {
            const emptyState = document.createElement('p');
            emptyState.className = 'list-empty-state muted-text';
            emptyState.textContent = isPlayMode
                ? 'No entries are available in this puzzle yet.'
                : 'No across or down entries yet. Open up the grid to create some.';
            container.appendChild(emptyState);
            return;
        }

        const fragment = document.createDocumentFragment();

        slotsArr.forEach((slot) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'word-list-item';
            item.dataset.slotId = slot.id;
            item.dataset.direction = slot.direction;

            const number = document.createElement('span');
            number.className = 'clue-number';
            number.textContent = String(slot.number);

            const text = document.createElement('span');
            text.className = 'clue-text';

            const word = solution?.[slot.id] || '';

            if (isPlayMode) {
                const authoredClue = clueMap?.[slot.id] || '';

                if (authoredClue) {
                    text.textContent = authoredClue;
                    this._setItemSourceBadge(item, 'Puzzle');
                } else {
                    text.textContent = 'Loading clue...';
                    text.classList.add('muted-text');
                }
            } else {
                text.textContent = this._formatEditorEntry(word, slot.length);
                text.classList.add('builder-word');
            }

            item.appendChild(number);
            item.appendChild(text);

            item.addEventListener('click', () => {
                if (typeof onWordClick === 'function') {
                    onWordClick(slot);
                }
            });

            fragment.appendChild(item);
        });

        container.appendChild(fragment);
    }

    _formatEditorEntry(word, length) {
        if (!word) return '•'.repeat(length);

        const normalized = [...word]
            .map((char) => (/^[A-Z]$/i.test(char) ? char.toUpperCase() : '•'))
            .join('');

        return normalized.padEnd(length, '•').slice(0, length);
    }

    /* ===============================
       CLUE HYDRATION
    =============================== */

    async _hydrateClues(config, hydrationToken) {
        const {
            acrossSlots,
            downSlots,
            acrossContainer,
            downContainer,
            solution,
            definitionsProvider,
            clueMap
        } = config;

        const slotGroups = [
            { slots: acrossSlots, container: acrossContainer },
            { slots: downSlots, container: downContainer }
        ];

        const tasks = [];

        for (const { slots, container } of slotGroups) {
            for (const slot of slots) {
                const word = solution?.[slot.id];
                if (clueMap?.[slot.id]) {
                    continue;
                }

                if (!word || !word.trim()) {
                    this._setClueText(container, slot.id, 'No clue found', true);
                    continue;
                }

                tasks.push(
                    this._hydrateSingleClue(
                        slot,
                        word,
                        container,
                        definitionsProvider,
                        hydrationToken
                    )
                );
            }
        }

        await Promise.all(tasks);
    }

    async _hydrateSingleClue(
        slot,
        word,
        container,
        definitionsProvider,
        hydrationToken
    ) {
        try {
            const results = await definitionsProvider.lookup(word);

            if (hydrationToken !== this._clueHydrationToken) return;

            const result = Array.isArray(results) ? results[0] : null;

            if (!result) {
                this._setClueText(container, slot.id, 'No clue found', true);
                this._setSourceBadge(container, slot.id, '');
                return;
            }

            const clueText = result.clue || 'No clue found';
            this._setClueText(container, slot.id, clueText, !result.clue);
            this._setSourceBadge(container, slot.id, result.source || '');
        } catch {
            if (hydrationToken !== this._clueHydrationToken) return;

            this._setClueText(container, slot.id, '[Error loading clue]', true);
            this._setSourceBadge(container, slot.id, '');
        }
    }

    _setClueText(container, slotId, value, muted = false) {
        const item = this._findSlotItem(container, slotId);
        if (!item) return;

        const text = item.querySelector('.clue-text');
        if (!text) return;

        text.textContent = value;
        text.classList.toggle('muted-text', muted);
    }

    _setSourceBadge(container, slotId, source) {
        const item = this._findSlotItem(container, slotId);
        if (!item) return;

        this._setItemSourceBadge(item, source);
    }

    _setItemSourceBadge(item, source) {
        if (!item) return;

        item.querySelector('.clue-source')?.remove();

        if (!source) return;

        const badge = document.createElement('span');
        badge.className = 'clue-source';
        badge.textContent = source;

        item.appendChild(badge);
    }

    _findSlotItem(container, slotId) {
        if (!container) return null;
        return container.querySelector(`.word-list-item[data-slot-id="${slotId}"]`);
    }

    /* ===============================
       SEARCH DROPDOWN
    =============================== */

    updateSearchResults(matches, onSelect, options = {}) {
        if (!this.dropdown) return;

        const { message = '', showDropdown = matches.length > 0 } = options;

        this.dropdown.innerHTML = '';

        if (!showDropdown || !matches.length) {
            this.dropdown.classList.add('hidden');

            if (this.matchesCount) {
                this.matchesCount.textContent = message;
            }

            return;
        }

        this.dropdown.classList.remove('hidden');

        if (this.matchesCount) {
            this.matchesCount.textContent = message;
        }

        const fragment = document.createDocumentFragment();

        matches.forEach((word) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'search-result-item';
            item.textContent = word;

            item.addEventListener('click', () => {
                this.dropdown.classList.add('hidden');
                if (typeof onSelect === 'function') {
                    onSelect(word);
                }
            });

            fragment.appendChild(item);
        });

        this.dropdown.appendChild(fragment);
    }

    /* ===============================
       ACTIVE CLUE HIGHLIGHT
    =============================== */

    highlightSlotInList(slotId) {
        const containers = this._activeListMode === 'play'
            ? [this.playAcrossDisplay, this.playDownDisplay]
            : [this.editorAcrossDisplay, this.editorDownDisplay];

        containers.forEach((container) => {
            if (!container) return;

            container
                .querySelectorAll('.word-list-item')
                .forEach((el) => el.classList.remove('selected-clue'));
        });

        for (const container of containers) {
            if (!container) continue;

            const target = container.querySelector(
                `.word-list-item[data-slot-id="${slotId}"]`
            );

            if (target) {
                target.classList.add('selected-clue');
                target.scrollIntoView({
                    block: 'nearest',
                    behavior: 'smooth'
                });
                break;
            }
        }
    }

    updatePuzzleSummary(grid, slots, clueMap = {}) {
        if (!this.puzzleSummary) return;

        if (!Array.isArray(grid) || !grid.length || !Array.isArray(grid[0])) {
            this.puzzleSummary.innerHTML = '';
            return;
        }

        const rows = grid.length;
        const cols = grid[0].length;
        const totalCells = rows * cols;
        const blockCount = grid.flat().filter((cell) => cell === '#').length;
        const fillableCells = totalCells - blockCount;
        const filledCells = grid.flat().filter((cell) => /^[A-Z]$/i.test(cell)).length;
        const slotEntries = Object.values(slots || {});
        const acrossCount = slotEntries.filter((slot) => slot.direction === 'across').length;
        const downCount = slotEntries.filter((slot) => slot.direction === 'down').length;
        const authoredClues = Object.keys(clueMap || {}).length;
        const fillPercent = fillableCells
            ? Math.round((filledCells / fillableCells) * 100)
            : 0;

        this.puzzleSummary.innerHTML = [
            this._createSummaryItem(`${rows}x${cols}`, 'Grid'),
            this._createSummaryItem(String(blockCount), 'Blocks'),
            this._createSummaryItem(`${acrossCount}/${downCount}`, 'Across/Down'),
            this._createSummaryItem(`${fillPercent}%`, 'Filled'),
            this._createSummaryItem(String(authoredClues), 'Authored clues')
        ].join('');
    }

    _createSummaryItem(value, label) {
        return `
            <div class="summary-item">
                <span class="summary-value">${value}</span>
                <span class="summary-label">${label}</span>
            </div>
        `;
    }
}
