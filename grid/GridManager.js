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

        if (coordinator.slots) {
            this._applyNumbering(coordinator.slots);
        }
    }

    _createCell(grid, r, c, coordinator) {
        const td = document.createElement('td');
        td.dataset.row = r;
        td.dataset.col = c;
        td.classList.add('grid-cell');

        td.addEventListener('mousedown', (e) => coordinator.handleMouseDown(e, r, c));
        td.addEventListener('mouseover', (e) => coordinator.handleMouseOver(e, r, c));
        td.addEventListener('click', (e) => this._handleInternalClick(e, r, c, coordinator));

        const value = grid[r][c];
        if (value === "#") {
            td.classList.add('block');
        } else {
            const span = document.createElement('span');
            span.className = 'cell-letter';
            span.textContent = (typeof value === 'string' && /^[A-Z]$/i.test(value)) 
                ? value.toUpperCase() : "";
            td.appendChild(span);
        }
        return td;
    }

    _handleInternalClick(e, r, c, coordinator) {
        if (!coordinator.modes.isPlayMode) {
            coordinator.handleCellClick(e, r, c);
            return;
        }

        if (coordinator.grid[r][c] === "#") return;

        if (this.selectedCell && this.selectedCell.r === r && this.selectedCell.c === c) {
            this.selectedDirection = (this.selectedDirection === 'across') ? 'down' : 'across';
        } else {
            this.selectedCell = { r, c };
        }

        this._highlightUI(coordinator);
    }

    _setupKeyboardListeners(coordinator) {
        if (this._boundKeyHandler) {
            window.removeEventListener('keydown', this._boundKeyHandler);
        }

        this._boundKeyHandler = (e) => {
            if (!coordinator.modes.isPlayMode || !this.selectedCell) return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            const { r, c } = this.selectedCell;
            const key = e.key.toUpperCase();

            if (/^[A-Z]$/.test(key)) {
                this._updateCellValue(r, c, key, coordinator);
                this._moveCursor(1, coordinator);
                e.preventDefault();
            } else if (key === 'BACKSPACE') {
                // If cell is empty, move back first, then clear
                if (coordinator.grid[r][c] === "" || coordinator.grid[r][c] === " ") {
                    this._moveCursor(-1, coordinator);
                    const newPos = this.selectedCell;
                    this._updateCellValue(newPos.r, newPos.c, "", coordinator);
                } else {
                    this._updateCellValue(r, c, "", coordinator);
                }
                e.preventDefault();
            } else if (key.startsWith('ARROW')) {
                this._handleArrowNavigation(key, coordinator);
                e.preventDefault();
            }
        };

        window.addEventListener('keydown', this._boundKeyHandler);
    }

    _updateCellValue(r, c, val, coordinator) {
        coordinator.grid[r][c] = val;
        const td = this.cells[`${r},${c}`];
        if (td) {
            const span = td.querySelector('.cell-letter');
            if (span) span.textContent = val;
        }
    }

    _moveCursor(delta, coordinator) {
        if (!this.selectedCell) return;
        let { r, c } = this.selectedCell;
        const grid = coordinator.grid;

        // NYT Style: Don't wrap around, just stop at the end of the word/grid
        const nextC = this.selectedDirection === 'across' ? c + delta : c;
        const nextR = this.selectedDirection === 'down' ? r + delta : r;

        if (grid[nextR] && grid[nextR][nextC] !== undefined && grid[nextR][nextC] !== "#") {
            this.selectedCell = { r: nextR, c: nextC };
            this._highlightUI(coordinator);
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

    _highlightUI(coordinator) {
        Object.values(this.cells).forEach(td => {
            td.classList.remove('highlight-active', 'highlight-word');
        });

        if (!this.selectedCell) return;

        const { r, c } = this.selectedCell;
        const activeTd = this.cells[`${r},${c}`];
        if (activeTd) activeTd.classList.add('highlight-active');

        const slot = this._findSlotAt(r, c, this.selectedDirection, coordinator.slots);

        if (slot) {
            slot.positions.forEach(([rr, cc]) => {
                const td = this.cells[`${rr},${cc}`];
                if (td && td !== activeTd) td.classList.add('highlight-word');
            });
            // Sync the sidebar list scroll
            coordinator.display.highlightSlotInList(slot.id);
        }
    }

    _findSlotAt(r, c, dir, slots) {
        return Object.values(slots).find(s => 
            s.direction === dir && s.positions.some(p => p[0] === r && p[1] === c)
        );
    }

    syncGridToDOM(grid, slots) {
        for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < grid[0].length; c++) {
                const td = this.cells[`${r},${c}`];
                if (!td) continue;
                const val = grid[r][c];
                
                if (val === "#") {
                    td.classList.add('block');
                } else {
                    td.classList.remove('block');
                    let span = td.querySelector('.cell-letter') || document.createElement('span');
                    span.className = 'cell-letter';
                    span.textContent = (/[A-Z]/i.test(val)) ? val.toUpperCase() : "";
                    if (!span.parentElement) td.appendChild(span);
                }
            }
        }
        if (slots) this._applyNumbering(slots);
    }

    _applyNumbering(slots) {
        Object.values(this.cells).forEach(td => td.querySelector('.cell-number')?.remove());
        Object.values(slots).forEach(slot => {
            const [r, c] = slot.positions[0];
            const td = this.cells[`${r},${c}`];
            if (!td || td.classList.contains('block') || td.querySelector('.cell-number')) return;

            const numSpan = document.createElement('span');
            numSpan.className = 'cell-number';
            numSpan.textContent = slot.number;
            td.prepend(numSpan);
        });
    }
}