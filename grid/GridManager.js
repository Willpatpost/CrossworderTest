// grid/GridManager.js

export class GridManager {
    constructor(cellsMap) {
        this.cells = cellsMap || {};

        // Play Mode State
        this.selectedCell = null; // { r, c }
        this.selectedDirection = 'across';

        this._boundKeyHandler = null;
    }

    /* ===============================
       RENDER GRID
    =============================== */

    render(grid, container, coordinator) {
        container.innerHTML = '';
        this.cells = {};

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

        this._setupKeyboardListeners(coordinator);

        if (coordinator.slots) {
            this._applyNumbering(coordinator.slots);
        }
    }

    _createCell(grid, r, c, coordinator) {
        const td = document.createElement('td');
        td.className = 'grid-cell';
        td.dataset.row = r;
        td.dataset.col = c;

        const value = grid[r][c];

        if (value === '#') {
            td.classList.add('block');
        } else {
            const span = document.createElement('span');
            span.className = 'cell-letter';
            span.textContent = /^[A-Z]$/i.test(value) ? value.toUpperCase() : '';
            td.appendChild(span);
        }

        td.addEventListener('click', (e) => this._handleClick(e, r, c, coordinator));

        return td;
    }

    /* ===============================
       CLICK HANDLING
    =============================== */

    _handleClick(e, r, c, coordinator) {
        if (!coordinator.modes.isPlayMode) {
            coordinator.handleCellClick(e, r, c);
            return;
        }

        if (coordinator.grid[r][c] === '#') return;

        // Toggle direction if same cell
        if (this.selectedCell &&
            this.selectedCell.r === r &&
            this.selectedCell.c === c) {

            this.selectedDirection =
                this.selectedDirection === 'across' ? 'down' : 'across';

        } else {
            this.selectedCell = { r, c };
        }

        this._updateHighlights(coordinator);
    }

    /* ===============================
       KEYBOARD SYSTEM (NYT STYLE)
    =============================== */

    _setupKeyboardListeners(coordinator) {
        if (this._boundKeyHandler) {
            window.removeEventListener('keydown', this._boundKeyHandler);
        }

        this._boundKeyHandler = (e) => {
            if (!coordinator.modes.isPlayMode || !this.selectedCell) return;

            if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

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

                case 'ArrowUp':
                case 'ArrowDown':
                case 'ArrowLeft':
                case 'ArrowRight':
                    this._handleArrow(key, coordinator);
                    e.preventDefault();
                    break;

                case 'Tab':
                    this._jumpToNextWord(coordinator);
                    e.preventDefault();
                    break;
            }
        };

        window.addEventListener('keydown', this._boundKeyHandler);
    }

    /* ===============================
       INPUT HANDLERS
    =============================== */

    _handleLetter(letter, coordinator) {
        const { r, c } = this.selectedCell;

        this._setCell(r, c, letter, coordinator);

        this._moveWithinWord(1, coordinator);
    }

    _handleBackspace(coordinator) {
        let { r, c } = this.selectedCell;

        const current = coordinator.grid[r][c];

        if (!current) {
            this._moveWithinWord(-1, coordinator);
            ({ r, c } = this.selectedCell);
        }

        this._setCell(r, c, '', coordinator);
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

    /* ===============================
       MOVEMENT LOGIC
    =============================== */

    _moveWithinWord(delta, coordinator) {
        const slot = this._getActiveSlot(coordinator);
        if (!slot) return;

        const index = slot.positions.findIndex(
            ([r, c]) => r === this.selectedCell.r && c === this.selectedCell.c
        );

        const nextIndex = index + delta;

        if (slot.positions[nextIndex]) {
            const [r, c] = slot.positions[nextIndex];
            this.selectedCell = { r, c };
            this._updateHighlights(coordinator);
        }
    }

    _jumpToNextWord(coordinator) {
        const slots = Object.values(coordinator.slots)
            .filter(s => s.direction === this.selectedDirection)
            .sort((a, b) => a.number - b.number);

        const current = this._getActiveSlot(coordinator);
        if (!current) return;

        const index = slots.findIndex(s => s.id === current.id);
        const next = slots[(index + 1) % slots.length];

        const [r, c] = next.positions[0];
        this.selectedCell = { r, c };

        this._updateHighlights(coordinator);
    }

    /* ===============================
       CELL OPERATIONS
    =============================== */

    _setCell(r, c, value, coordinator) {
        coordinator.grid[r][c] = value;

        const td = this.cells[`${r},${c}`];
        const span = td?.querySelector('.cell-letter');

        if (span) span.textContent = value;
    }

    _isValidCell(r, c, coordinator) {
        return (
            coordinator.grid[r] &&
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

        return Object.values(coordinator.slots).find(s =>
            s.direction === this.selectedDirection &&
            s.positions.some(([rr, cc]) => rr === r && cc === c)
        );
    }

    /* ===============================
       HIGHLIGHTING
    =============================== */

    _updateHighlights(coordinator) {
        Object.values(this.cells).forEach(td => {
            td.classList.remove('active-cell', 'active-word');
        });

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

            coordinator.display.highlightSlotInList(slot.id);
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
                } else {
                    td.classList.remove('block');

                    let span = td.querySelector('.cell-letter');
                    if (!span) {
                        span = document.createElement('span');
                        span.className = 'cell-letter';
                        td.appendChild(span);
                    }

                    span.textContent = val || '';
                }
            }
        }

        if (slots) this._applyNumbering(slots);
    }

    _applyNumbering(slots) {
        Object.values(this.cells)
            .forEach(td => td.querySelector('.cell-number')?.remove());

        Object.values(slots).forEach(slot => {
            const [r, c] = slot.positions[0];
            const td = this.cells[`${r},${c}`];

            if (!td || td.classList.contains('block') || td.querySelector('.cell-number')) return;

            const num = document.createElement('span');
            num.className = 'cell-number';
            num.textContent = slot.number;

            td.prepend(num);
        });
    }
}