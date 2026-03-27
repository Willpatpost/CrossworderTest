// grid/GridManager.js

export class GridManager {
    constructor(cellsMap = {}) {
        this.cells = cellsMap;
        this.container = null;

        // Play mode state
        this.selectedCell = null; // { r, c }
        this.selectedDirection = 'across';

        // Editor interaction state
        this.isPointerDown = false;

        // Global listeners
        this._boundKeyHandler = null;
        this._boundPointerUpHandler = null;
    }

    /* ===============================
       RENDER GRID
    =============================== */

    render(grid, container, coordinator) {
        if (!container) return;

        this.container = container;
        this.cells = {};
        container.innerHTML = '';

        const table = document.createElement('table');
        table.className = 'crossword-table';

        for (let r = 0; r < grid.length; r++) {
            const tr = document.createElement('tr');

            for (let c = 0; c < grid[0].length; c++) {
                const td = this._createCell(grid, r, c, coordinator);
                this.cells[`${r},${c}`] = td;
                tr.appendChild(td);
            }

            table.appendChild(tr);
        }

        container.appendChild(table);

        this._setupGlobalListeners(coordinator);

        if (coordinator.slots) {
            this._applyNumbering(coordinator.slots);
        }

        if (coordinator.modes?.isPlayMode) {
            this._restoreOrInitializePlaySelection(coordinator);
            this._updateHighlights(coordinator);
        } else if (
            coordinator.modes?.currentMode === 'letter' &&
            this.selectedCell &&
            this._isValidCell(this.selectedCell.r, this.selectedCell.c, coordinator)
        ) {
            this._updateHighlights(coordinator);
        } else {
            this.clearHighlights();
        }
    }

    _createCell(grid, r, c, coordinator) {
        const td = document.createElement('td');
        td.className = 'grid-cell';
        td.dataset.row = String(r);
        td.dataset.col = String(c);

        const value = grid[r][c];

        if (value === '#') {
            td.classList.add('block');
        } else {
            td.appendChild(this._createLetterSpan(this._displayLetter(value)));
        }

        this._bindCellEvents(td, r, c, coordinator);

        return td;
    }

    _createLetterSpan(value = '') {
        const span = document.createElement('span');
        span.className = 'cell-letter';
        span.textContent = value;
        return span;
    }

    _bindCellEvents(td, r, c, coordinator) {
        td.addEventListener('click', (e) => this._handleClick(e, r, c, coordinator));

        td.addEventListener('mousedown', (e) => this._handleMouseDown(e, r, c, coordinator));
        td.addEventListener('mouseenter', (e) => this._handleMouseEnter(e, r, c, coordinator));

        td.addEventListener('dragstart', (e) => e.preventDefault());
    }

    /* ===============================
       EVENT ROUTING
    =============================== */

    _handleClick(e, r, c, coordinator) {
        if (!coordinator?.modes?.isPlayMode) {
            if (
                coordinator?.modes?.currentMode === 'letter' &&
                this._isValidCell(r, c, coordinator)
            ) {
                if (
                    this.selectedCell &&
                    this.selectedCell.r === r &&
                    this.selectedCell.c === c
                ) {
                    this.selectedDirection =
                        this.selectedDirection === 'across' ? 'down' : 'across';
                } else {
                    this.selectedCell = { r, c };
                }

                this._updateHighlights(coordinator);
            }

            if (typeof coordinator.handleCellClick === 'function') {
                coordinator.handleCellClick(e, r, c);
            }
            return;
        }

        if (coordinator?.isPlayPaused) return;

        if (!this._isValidCell(r, c, coordinator)) return;

        if (
            this.selectedCell &&
            this.selectedCell.r === r &&
            this.selectedCell.c === c
        ) {
            this.selectedDirection =
                this.selectedDirection === 'across' ? 'down' : 'across';
        } else {
            this.selectedCell = { r, c };
        }

        this._updateHighlights(coordinator);
    }

    _handleMouseDown(e, r, c, coordinator) {
        this.isPointerDown = true;

        if (coordinator?.modes?.isPlayMode) {
            return;
        }

        if (typeof coordinator.handleMouseDown === 'function') {
            coordinator.handleMouseDown(e, r, c);
        }
    }

    _handleMouseEnter(e, r, c, coordinator) {
        if (!this.isPointerDown) return;
        if (coordinator?.modes?.isPlayMode) return;

        if (typeof coordinator.handleMouseOver === 'function') {
            coordinator.handleMouseOver(e, r, c);
        }
    }

    _handleGlobalPointerUp(coordinator) {
        if (!this.isPointerDown) return;

        this.isPointerDown = false;

        if (coordinator?.modes?.isPlayMode) return;

        if (typeof coordinator.handleMouseUp === 'function') {
            coordinator.handleMouseUp();
        }
    }

    /* ===============================
       GLOBAL LISTENERS
    =============================== */

    _setupGlobalListeners(coordinator) {
        if (this._boundKeyHandler) {
            window.removeEventListener('keydown', this._boundKeyHandler);
        }

        if (this._boundPointerUpHandler) {
            window.removeEventListener('mouseup', this._boundPointerUpHandler);
        }

        this._boundKeyHandler = (e) => {
            const tagName = e.target?.tagName;
            if (tagName && ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName)) return;

            if ((e.metaKey || e.ctrlKey) && !e.altKey && !coordinator?.modes?.isPlayMode) {
                const key = e.key.toLowerCase();

                if (key === 'z') {
                    if (e.shiftKey) {
                        coordinator.redoEditorChange?.();
                    } else {
                        coordinator.undoEditorChange?.();
                    }
                    e.preventDefault();
                    return;
                }

                if (key === 'y') {
                    coordinator.redoEditorChange?.();
                    e.preventDefault();
                    return;
                }
            }

            if (e.metaKey || e.ctrlKey || e.altKey) return;

            if (!this.selectedCell) return;

            if (!coordinator?.modes?.isPlayMode) {
                if (coordinator?.modes?.currentMode !== 'letter') return;

                const key = e.key;

                if (/^[a-zA-Z]$/.test(key)) {
                    coordinator.handleEditorLetterInput?.(key.toUpperCase());
                    e.preventDefault();
                    return;
                }

                switch (key) {
                    case 'Backspace':
                        coordinator.handleEditorBackspace?.();
                        e.preventDefault();
                        break;

                    case 'Delete':
                        coordinator.handleEditorDelete?.();
                        e.preventDefault();
                        break;

                    case 'ArrowUp':
                    case 'ArrowDown':
                    case 'ArrowLeft':
                    case 'ArrowRight':
                        coordinator.handleEditorArrow?.(key);
                        e.preventDefault();
                        break;

                    case 'Tab':
                        this._jumpToNextWord(coordinator, e.shiftKey ? -1 : 1);
                        e.preventDefault();
                        break;

                    case ' ':
                    case 'Spacebar':
                        this._toggleDirection();
                        this._updateHighlights(coordinator);
                        e.preventDefault();
                        break;
                }

                return;
            }

            if (coordinator?.isPlayPaused) return;

            const key = e.key;

            if (/^[a-zA-Z]$/.test(key)) {
                this._handleLetter(key.toUpperCase(), coordinator);
                e.preventDefault();
                return;
            }

            switch (key) {
                case 'Backspace':
                    this._handleBackspace(coordinator);
                    e.preventDefault();
                    break;

                case 'Delete':
                    this._handleDelete(coordinator);
                    e.preventDefault();
                    break;

                case ' ':
                case 'Spacebar':
                    this._toggleDirection();
                    this._updateHighlights(coordinator);
                    e.preventDefault();
                    break;

                case 'ArrowUp':
                case 'ArrowDown':
                case 'ArrowLeft':
                case 'ArrowRight':
                    this._handleArrow(key, coordinator);
                    e.preventDefault();
                    break;

                case 'Tab':
                    this._jumpToNextWord(coordinator, e.shiftKey ? -1 : 1);
                    e.preventDefault();
                    break;
            }
        };

        this._boundPointerUpHandler = () => {
            this._handleGlobalPointerUp(coordinator);
        };

        window.addEventListener('keydown', this._boundKeyHandler);
        window.addEventListener('mouseup', this._boundPointerUpHandler);
    }

    destroy() {
        if (this._boundKeyHandler) {
            window.removeEventListener('keydown', this._boundKeyHandler);
            this._boundKeyHandler = null;
        }

        if (this._boundPointerUpHandler) {
            window.removeEventListener('mouseup', this._boundPointerUpHandler);
            this._boundPointerUpHandler = null;
        }

        this.isPointerDown = false;
        this.selectedCell = null;
        this.container = null;
        this.cells = {};
    }

    /* ===============================
       PLAY MODE INPUT
    =============================== */

    _handleLetter(letter, coordinator) {
        const { r, c } = this.selectedCell;
        this._setCell(r, c, letter, coordinator);
        this._moveWithinWord(1, coordinator);
    }

    _handleBackspace(coordinator) {
        let { r, c } = this.selectedCell;
        const current = coordinator.grid?.[r]?.[c];

        if (!current) {
            this._moveWithinWord(-1, coordinator);
            if (!this.selectedCell) return;
            ({ r, c } = this.selectedCell);
        }

        this._setCell(r, c, '', coordinator);
        this._updateHighlights(coordinator);
    }

    _handleDelete(coordinator) {
        const { r, c } = this.selectedCell;
        this._setCell(r, c, '', coordinator);
        this._updateHighlights(coordinator);
    }

    _handleArrow(key, coordinator) {
        const dirMap = {
            ArrowUp: 'down',
            ArrowDown: 'down',
            ArrowLeft: 'across',
            ArrowRight: 'across'
        };

        const movement = {
            ArrowUp: [-1, 0],
            ArrowDown: [1, 0],
            ArrowLeft: [0, -1],
            ArrowRight: [0, 1]
        };

        this.selectedDirection = dirMap[key];

        const [dr, dc] = movement[key];
        const { r, c } = this.selectedCell;
        const nr = r + dr;
        const nc = c + dc;

        if (this._isValidCell(nr, nc, coordinator)) {
            this.selectedCell = { r: nr, c: nc };
            this._updateHighlights(coordinator);
        }
    }

    _toggleDirection() {
        this.selectedDirection =
            this.selectedDirection === 'across' ? 'down' : 'across';
    }

    /* ===============================
       MOVEMENT LOGIC
    =============================== */

    _moveWithinWord(delta, coordinator) {
        const slot = this._getActiveSlot(coordinator);
        if (!slot || !this.selectedCell) return;

        const index = slot.positions.findIndex(
            ([r, c]) => r === this.selectedCell.r && c === this.selectedCell.c
        );

        if (index === -1) return;

        const nextIndex = index + delta;
        if (!slot.positions[nextIndex]) return;

        const [r, c] = slot.positions[nextIndex];
        this.selectedCell = { r, c };
        this._updateHighlights(coordinator);
    }

    _jumpToNextWord(coordinator, delta = 1) {
        const slots = Object.values(coordinator.slots || {})
            .filter((slot) => slot.direction === this.selectedDirection)
            .sort((a, b) => a.number - b.number);

        if (!slots.length) return;

        const current = this._getActiveSlot(coordinator);

        if (!current) {
            const [r, c] = slots[0].positions[0];
            this.selectedCell = { r, c };
            this._updateHighlights(coordinator);
            return;
        }

        const currentIndex = slots.findIndex((slot) => slot.id === current.id);
        const nextIndex = (currentIndex + delta + slots.length) % slots.length;
        const next = slots[nextIndex];

        const [r, c] = next.positions[0];
        this.selectedCell = { r, c };
        this._updateHighlights(coordinator);
    }

    _restoreOrInitializePlaySelection(coordinator) {
        if (
            this.selectedCell &&
            this._isValidCell(this.selectedCell.r, this.selectedCell.c, coordinator)
        ) {
            return;
        }

        const firstSlot = Object.values(coordinator.slots || {})
            .filter((slot) => slot.direction === 'across')
            .sort((a, b) => a.number - b.number)[0]
            || Object.values(coordinator.slots || {})
                .sort((a, b) => a.number - b.number)[0];

        if (firstSlot?.positions?.length) {
            const [r, c] = firstSlot.positions[0];
            this.selectedCell = { r, c };
            this.selectedDirection = firstSlot.direction || 'across';
        } else {
            this.selectedCell = null;
            this.selectedDirection = 'across';
        }
    }

    /* ===============================
       CELL OPERATIONS
    =============================== */

    _setCell(r, c, value, coordinator) {
        if (!this._isValidCell(r, c, coordinator)) return;

        const normalized = this._normalizeLetter(value);
        coordinator.grid[r][c] = normalized;

        const td = this.cells[`${r},${c}`];
        if (!td || td.classList.contains('block')) return;

        let span = td.querySelector('.cell-letter');
        if (!span) {
            span = this._createLetterSpan();
            td.appendChild(span);
        }

        span.textContent = normalized;
        td.classList.remove('correct', 'incorrect');
        coordinator._applyInstantMistakeStateAt?.(r, c);
        coordinator._scheduleRecentPuzzleSave?.();
    }

    _normalizeLetter(value) {
        if (!value) return '';
        return /^[A-Z]$/i.test(value) ? value.toUpperCase() : '';
    }

    _displayLetter(value) {
        return /^[A-Z]$/i.test(value) ? value.toUpperCase() : '';
    }

    _isValidCell(r, c, coordinator) {
        return Boolean(
            coordinator?.grid?.[r] &&
            coordinator.grid[r][c] !== undefined &&
            coordinator.grid[r][c] !== '#'
        );
    }

    /* ===============================
       SLOT HELPERS
    =============================== */

    _getActiveSlot(coordinator) {
        if (!this.selectedCell) return null;

        const { r, c } = this.selectedCell;

        return Object.values(coordinator.slots || {}).find((slot) =>
            slot.direction === this.selectedDirection &&
            slot.positions.some(([rr, cc]) => rr === r && cc === c)
        ) || null;
    }

    /* ===============================
       HIGHLIGHTING
    =============================== */

    clearHighlights() {
        Object.values(this.cells).forEach((td) => {
            td.classList.remove('active-cell', 'active-word');
        });
    }

    _updateHighlights(coordinator) {
        this.clearHighlights();

        if (!this.selectedCell) return;

        const { r, c } = this.selectedCell;
        const active = this.cells[`${r},${c}`];
        active?.classList.add('active-cell');

        const slot = this._getActiveSlot(coordinator);

        if (slot) {
            slot.positions.forEach(([rr, cc]) => {
                const td = this.cells[`${rr},${cc}`];
                if (td) td.classList.add('active-word');
            });

            if (coordinator.display?.highlightSlotInList) {
                coordinator.display.highlightSlotInList(slot.id);
            }
        }
    }

    /* ===============================
       SYNC + NUMBERING
    =============================== */

    syncGridToDOM(grid, slots) {
        for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < grid[0].length; c++) {
                const td = this.cells[`${r},${c}`];
                if (!td) continue;

                const val = grid[r][c];

                if (val === '#') {
                    td.classList.add('block');
                    const letter = td.querySelector('.cell-letter');
                    if (letter) letter.textContent = '';
                    continue;
                }

                td.classList.remove('block');

                let span = td.querySelector('.cell-letter');
                if (!span) {
                    span = this._createLetterSpan();
                    td.appendChild(span);
                }

                span.textContent = this._displayLetter(val);
            }
        }

        if (slots) {
            this._applyNumbering(slots);
        }
    }

    _applyNumbering(slots) {
        Object.values(this.cells).forEach((td) => {
            td.querySelector('.cell-number')?.remove();
        });

        Object.values(slots || {}).forEach((slot) => {
            const [r, c] = slot.positions[0];
            const td = this.cells[`${r},${c}`];

            if (!td) return;
            if (td.classList.contains('block')) return;
            if (td.querySelector('.cell-number')) return;

            const num = document.createElement('span');
            num.className = 'cell-number';
            num.textContent = String(slot.number);

            td.prepend(num);
        });
    }
}
