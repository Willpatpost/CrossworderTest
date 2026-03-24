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
     * Initial render
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
    }

    /**
     * Create a single cell
     */
    _createCell(grid, r, c, coordinator) {
        const td = document.createElement('td');
        td.dataset.row = r;
        td.dataset.col = c;
        td.classList.add('grid-cell');

        // Events
        td.addEventListener('mousedown', (e) => coordinator.handleMouseDown(e, r, c));
        td.addEventListener('mouseover', (e) => coordinator.handleMouseOver(e, r, c));
        td.addEventListener('click', (e) => this._handleInternalClick(e, r, c, coordinator));

        const value = grid[r][c];

        if (value === "#") {
            td.classList.add('block');
        } else {
            const span = document.createElement('span');
            span.className = 'cell-letter';

            span.textContent = coordinator.modes.isPlayMode
                ? ""
                : (value?.trim?.() || "");

            td.appendChild(span);
        }

        return td;
    }

    /**
     * Click behavior
     */
    _handleInternalClick(e, r, c, coordinator) {
        if (!coordinator.modes.isPlayMode) {
            coordinator.handleCellClick(e, r, c);
            return;
        }

        const cell = coordinator.grid[r][c];
        if (cell === "#") return;

        if (this.selectedCell && this.selectedCell.r === r && this.selectedCell.c === c) {
            this.selectedDirection =
                this.selectedDirection === 'across' ? 'down' : 'across';
        } else {
            this.selectedCell = { r, c };
        }

        this._highlightUI(coordinator);
    }

    /**
     * Keyboard input (Play Mode)
     */
    _setupKeyboardListeners(coordinator) {
        if (this._boundKeyHandler) {
            window.removeEventListener('keydown', this._boundKeyHandler);
        }

        this._boundKeyHandler = (e) => {
            if (!coordinator.modes.isPlayMode || !this.selectedCell) return;

            const { r, c } = this.selectedCell;
            const key = e.key.toUpperCase();

            if (/^[A-Z]$/.test(key)) {
                this._updateCellValue(r, c, key);
                this._moveCursor(1, coordinator);
                e.preventDefault();
            } else if (key === 'BACKSPACE') {
                this._updateCellValue(r, c, "");
                this._moveCursor(-1, coordinator);
                e.preventDefault();
            } else if (key.startsWith('ARROW')) {
                this._handleArrowNavigation(key, coordinator);
                e.preventDefault();
            }
        };

        window.addEventListener('keydown', this._boundKeyHandler);
    }

    _updateCellValue(r, c, val) {
        const td = this.cells[`${r},${c}`];
        if (!td) return;

        const span = td.querySelector('.cell-letter');
        if (span) span.textContent = val;
    }

    /**
     * Cursor movement
     */
    _moveCursor(delta, coordinator) {
        if (!this.selectedCell) return;

        let { r, c } = this.selectedCell;
        const grid = coordinator.grid;

        for (let i = 0; i < 50; i++) {
            if (this.selectedDirection === 'across') c += delta;
            else r += delta;

            if (
                grid[r] &&
                grid[r][c] !== undefined &&
                grid[r][c] !== "#"
            ) {
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

        if (
            coordinator.grid[r] &&
            coordinator.grid[r][c] !== undefined &&
            coordinator.grid[r][c] !== "#"
        ) {
            this.selectedCell = { r, c };
            this._highlightUI(coordinator);
        }
    }

    /**
     * Highlight active + word
     */
    _highlightUI(coordinator) {
        Object.values(this.cells).forEach(td => {
            td.classList.remove('highlight-active', 'highlight-word');
        });

        if (!this.selectedCell) return;

        const { r, c } = this.selectedCell;
        const activeTd = this.cells[`${r},${c}`];
        if (activeTd) activeTd.classList.add('highlight-active');

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
     * Sync model → DOM
     */
    syncGridToDOM(grid, slots) {
        for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < grid[0].length; c++) {
                const td = this.cells[`${r},${c}`];
                if (!td) continue;

                const val = grid[r][c];

                if (val === "#") {
                    td.classList.add('block');
                    td.innerHTML = "";
                    continue;
                }

                td.classList.remove('block');

                let span = td.querySelector('.cell-letter');
                if (!span) {
                    span = document.createElement('span');
                    span.className = 'cell-letter';
                    td.appendChild(span);
                }

                span.textContent = /[A-Z]/i.test(val) ? val : "";
            }
        }

        this._applyNumbering(slots);
    }

    /**
     * Apply clue numbers
     */
    _applyNumbering(slots) {
        // Clear old
        Object.values(this.cells).forEach(td => {
            td.querySelector('.cell-number')?.remove();
        });

        // Add new
        Object.values(slots).forEach(slot => {
            const [r, c] = slot.positions[0];
            const td = this.cells[`${r},${c}`];

            if (!td || td.classList.contains('block')) return;

            const num = document.createElement('span');
            num.className = 'cell-number';
            num.textContent = slot.number;

            td.prepend(num);
        });
    }

    /**
     * Manual numbering support
     */
    addNumberToCell(grid, row, col) {
        if (!isNaN(parseInt(grid[row][col], 10))) return;

        const positions = this._getNumberPositions(grid);
        const newNum = this._calculateNewNumberIndex(row, col, positions);

        grid[row][col] = newNum.toString();
    }

    _getNumberPositions(grid) {
        const positions = [];

        for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < grid[0].length; c++) {
                const val = parseInt(grid[r][c], 10);
                if (!isNaN(val)) {
                    positions.push({ n: val, r, c });
                }
            }
        }

        return positions.sort((a, b) => a.n - b.n);
    }

    _calculateNewNumberIndex(r, c, positions) {
        let index = 0;

        for (let i = 0; i < positions.length; i++) {
            if (
                r < positions[i].r ||
                (r === positions[i].r && c < positions[i].c)
            ) break;

            index = i + 1;
        }

        return index + 1;
    }
}