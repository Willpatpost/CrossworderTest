// grid/GridManager.js
export class GridManager {
    constructor(cellsMap) {
        this.cells = cellsMap;
        this.toggleToBlack = true;

        // Play Mode State
        this.selectedCell = null; // { r, c }
        this.selectedDirection = 'across';

        this._boundKeyHandler = null;
    }

    /**
     * Initial render of the grid table.
     */
    render(grid, container, coordinator) {
        container.innerHTML = '';
        this.cells = {};

        const table = document.createElement('table');
        table.id = 'crossword-grid';
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

        // Render clue numbers immediately if slots exist
        if (coordinator.slots) {
            this._applyNumbering(coordinator.slots);
        }
    }

    /**
     * Create a single cell TD and its children.
     */
    _createCell(grid, r, c, coordinator) {
        const td = document.createElement('td');
        td.dataset.row = r;
        td.dataset.col = c;
        td.classList.add('grid-cell');

        // Mouse Events
        td.addEventListener('mousedown', (e) => coordinator.handleMouseDown(e, r, c));
        td.addEventListener('mouseover', (e) => coordinator.handleMouseOver(e, r, c));
        td.addEventListener('click', (e) => this._handleInternalClick(e, r, c, coordinator));

        const value = grid[r][c];

        if (value === "#") {
            td.classList.add('block');
        } else {
            const span = document.createElement('span');
            span.className = 'cell-letter';

            // Sanitized letter rendering
            span.textContent = (typeof value === 'string' && /^[A-Z]$/i.test(value)) 
                ? value.toUpperCase() 
                : "";

            td.appendChild(span);
        }

        return td;
    }

    /**
     * Handles selection and direction toggling.
     */
    _handleInternalClick(e, r, c, coordinator) {
        // Builder mode logic is handled by the main coordinator
        if (!coordinator.modes.isPlayMode) {
            coordinator.handleCellClick(e, r, c);
            return;
        }

        const cellVal = coordinator.grid[r][c];
        if (cellVal === "#") return;

        // If clicking the same cell, toggle direction
        if (this.selectedCell && this.selectedCell.r === r && this.selectedCell.c === c) {
            this.selectedDirection = (this.selectedDirection === 'across') ? 'down' : 'across';
        } else {
            this.selectedCell = { r, c };
        }

        this._highlightUI(coordinator);
    }

    /**
     * Keyboard input for Play Mode.
     */
    _setupKeyboardListeners(coordinator) {
        if (this._boundKeyHandler) {
            window.removeEventListener('keydown', this._boundKeyHandler);
        }

        this._boundKeyHandler = (e) => {
            if (!coordinator.modes.isPlayMode || !this.selectedCell) return;

            // Don't capture keys if typing in a search box or input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            const { r, c } = this.selectedCell;
            const key = e.key.toUpperCase();

            if (/^[A-Z]$/.test(key)) {
                this._updateCellValue(r, c, key, coordinator);
                this._moveCursor(1, coordinator);
                e.preventDefault();
            } else if (key === 'BACKSPACE') {
                this._updateCellValue(r, c, "", coordinator);
                this._moveCursor(-1, coordinator);
                e.preventDefault();
            } else if (key.startsWith('ARROW')) {
                this._handleArrowNavigation(key, coordinator);
                e.preventDefault();
            }
        };

        window.addEventListener('keydown', this._boundKeyHandler);
    }

    _updateCellValue(r, c, val, coordinator) {
        // Update the data model
        coordinator.grid[r][c] = val;

        // Update the UI
        const td = this.cells[`${r},${c}`];
        if (!td) return;

        const span = td.querySelector('.cell-letter');
        if (span) span.textContent = val;
    }

    _moveCursor(delta, coordinator) {
        if (!this.selectedCell) return;

        let { r, c } = this.selectedCell;
        const grid = coordinator.grid;

        // Scan ahead for the next valid white cell in the current direction
        for (let i = 0; i < Math.max(grid.length, grid[0].length); i++) {
            if (this.selectedDirection === 'across') c += delta;
            else r += delta;

            if (grid[r] && grid[r][c] !== undefined && grid[r][c] !== "#") {
                this.selectedCell = { r, c };
                this._highlightUI(coordinator);
                return;
            }
        }
    }

    _handleArrowNavigation(key, coordinator) {
        let { r, c } = this.selectedCell;

        if (key === 'ARROWUP') r--;
        if (key === 'ARROWDOWN') r++;
        if (key === 'ARROWLEFT') c--;
        if (key === 'ARROWRIGHT') c++;

        if (coordinator.grid[r] && coordinator.grid[r][c] !== undefined && coordinator.grid[r][c] !== "#") {
            this.selectedCell = { r, c };
            this._highlightUI(coordinator);
        }
    }

    /**
     * Highlights the active cell and the current word track.
     */
    _highlightUI(coordinator) {
        Object.values(this.cells).forEach(td => {
            td.classList.remove('highlight-active', 'highlight-word');
        });

        if (!this.selectedCell) return;

        const { r, c } = this.selectedCell;
        const activeTd = this.cells[`${r},${c}`];
        if (activeTd) activeTd.classList.add('highlight-active');

        // Find the slot the cursor is currently in
        const slot = Object.values(coordinator.slots).find(s =>
            s.direction === this.selectedDirection &&
            s.positions.some(p => p[0] === r && p[1] === c)
        );

        if (slot) {
            slot.positions.forEach(([rr, cc]) => {
                const td = this.cells[`${rr},${cc}`];
                if (td && td !== activeTd) {
                    td.classList.add('highlight-word');
                }
            });
        }
    }

    /**
     * Syncs the entire data model to the DOM.
     * Used after solving or loading a puzzle.
     */
    syncGridToDOM(grid, slots) {
        for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < grid[0].length; c++) {
                const td = this.cells[`${r},${c}`];
                if (!td) continue;

                const val = grid[r][c];

                if (val === "#") {
                    td.classList.add('block');
                    const span = td.querySelector('.cell-letter');
                    if (span) span.textContent = "";
                    continue;
                }

                td.classList.remove('block');

                let span = td.querySelector('.cell-letter');
                if (!span) {
                    span = document.createElement('span');
                    span.className = 'cell-letter';
                    td.appendChild(span);
                }

                span.textContent = (typeof val === 'string' && /^[A-Z]$/i.test(val)) 
                    ? val.toUpperCase() 
                    : "";
            }
        }

        if (slots) {
            this._applyNumbering(slots);
        }
    }

    /**
     * Renders the small clue numbers in the corners of cells.
     */
    _applyNumbering(slots) {
        // 1. Clear all existing numbers
        Object.values(this.cells).forEach(td => {
            const oldNum = td.querySelector('.cell-number');
            if (oldNum) oldNum.remove();
        });

        // 2. Add new numbers based on slot start positions
        Object.values(slots).forEach(slot => {
            const [r, c] = slot.positions[0];
            const td = this.cells[`${r},${c}`];

            if (!td || td.classList.contains('block')) return;

            // Prevent double-numbering a cell that starts both Across and Down
            if (td.querySelector('.cell-number')) return;

            const numSpan = document.createElement('span');
            numSpan.className = 'cell-number';
            numSpan.textContent = slot.number;

            td.prepend(numSpan);
        });
    }
}