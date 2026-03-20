// grid/GridManager.js
export class GridManager {
    constructor(cellsMap) {
        this.cells = cellsMap; // Shared map of "r,c" -> <td> elements
        this.toggleToBlack = true;
        
        // Play Mode State
        this.selectedCell = null; // {r, c}
        this.selectedDirection = 'across'; // 'across' or 'down'
    }

    /**
     * Initial full render of the table.
     */
    render(grid, container, coordinator) {
        container.innerHTML = '';
        
        for (const key in this.cells) {
            delete this.cells[key];
        }

        const table = document.createElement('table');
        table.id = 'crossword-grid';
        table.className = 'crossword-table';

        for (let r = 0; r < grid.length; r++) {
            const tr = document.createElement('tr');
            for (let c = 0; c < grid[0].length; c++) {
                const td = document.createElement('td');
                td.dataset.row = r;
                td.dataset.col = c;
                
                this._applyBaseStyles(td);

                // Event Listeners
                td.addEventListener('mousedown', (e) => coordinator.handleMouseDown(e, r, c));
                td.addEventListener('mouseover', (e) => coordinator.handleMouseOver(e, r, c));
                td.addEventListener('click', (e) => this._handleInternalClick(e, r, c, coordinator));

                const content = grid[r][c];
                if (content === "#") {
                    td.classList.add('block');
                } else {
                    const letterSpan = document.createElement('span');
                    letterSpan.className = 'cell-letter';
                    // In Play Mode, we start with empty strings in white cells
                    letterSpan.textContent = coordinator.modes.isPlayMode ? "" : (content.trim() || "");
                    td.appendChild(letterSpan);
                }

                this.cells[`${r},${c}`] = td;
                tr.appendChild(td);
            }
            table.appendChild(tr);
        }
        
        container.appendChild(table);
        this._setupKeyboardListeners(coordinator);
    }

    _handleInternalClick(e, r, c, coordinator) {
        if (coordinator.modes.isPlayMode) {
            const cell = coordinator.grid[r][c];
            if (cell === "#") return;

            // Toggle direction if clicking the same cell
            if (this.selectedCell && this.selectedCell.r === r && this.selectedCell.c === c) {
                this.selectedDirection = this.selectedDirection === 'across' ? 'down' : 'across';
            } else {
                this.selectedCell = { r, c };
            }
            this._highlightUI(coordinator);
        } else {
            coordinator.handleCellClick(e, r, c);
        }
    }

    _setupKeyboardListeners(coordinator) {
        // Remove old listener if exists to prevent duplicates
        window.onkeydown = (e) => {
            if (!coordinator.modes.isPlayMode || !this.selectedCell) return;

            const { r, c } = this.selectedCell;
            const key = e.key.toUpperCase();

            if (key.length === 1 && key >= 'A' && key <= 'Z') {
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
    }

    _updateCellValue(r, c, val, coordinator) {
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

        for (let i = 0; i < 20; i++) { // Limit search range
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

    _highlightUI(coordinator) {
        // Clear old highlights
        Object.values(this.cells).forEach(td => {
            td.classList.remove('highlight-active', 'highlight-word');
        });

        if (!this.selectedCell) return;

        const { r, c } = this.selectedCell;
        const activeTd = this.cells[`${r},${c}`];
        if (activeTd) activeTd.classList.add('highlight-active');

        // Highlight full word
        const slot = Object.values(coordinator.slots).find(s => 
            s.direction === this.selectedDirection && 
            s.positions.some(p => p[0] === r && p[1] === c)
        );

        if (slot) {
            slot.positions.forEach(pos => {
                const td = this.cells[`${pos[0]},${pos[1]}`];
                if (td && td !== activeTd) td.classList.add('highlight-word');
            });
        }
    }

    syncGridToDOM(grid, slots) {
        for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < grid[0].length; c++) {
                const td = this.cells[`${r},${c}`];
                if (!td) continue;

                const val = grid[r][c];
                if (val === "#") {
                    td.classList.add('block');
                    td.innerHTML = "";
                } else {
                    td.classList.remove('block');
                    if (!td.querySelector('.cell-letter')) {
                        td.innerHTML = `<span class="cell-letter"></span>`;
                    }
                    td.querySelector('.cell-letter').textContent = (/[A-Z]/i.test(val)) ? val : "";
                }
            }
        }
        this._applyNumbering(grid, slots);
    }

    _applyNumbering(grid, slots) {
        Object.values(this.cells).forEach(td => {
            const existingNum = td.querySelector('.cell-number');
            if (existingNum) existingNum.remove();
        });

        for (const id in slots) {
            const slot = slots[id];
            const [r, c] = slot.positions[0];
            const td = this.cells[`${r},${c}`];
            if (td && !td.querySelector('.cell-number')) {
                const numSpan = document.createElement('span');
                numSpan.className = 'cell-number';
                numSpan.textContent = slot.number;
                td.prepend(numSpan);
            }
        }
    }

    _applyBaseStyles(td) {
        td.classList.add('grid-cell');
        td.style.width = '40px';
        td.style.height = '40px';
        td.style.border = '1px solid #333';
        td.style.textAlign = 'center';
        td.style.verticalAlign = 'middle';
        td.style.fontSize = '20px';
        td.style.fontWeight = 'bold';
        td.style.cursor = 'pointer';
        td.style.backgroundColor = '#fff';
    }

    _getNumberPositions(grid) {
        const pos = [];
        for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < grid[0].length; c++) {
                const val = parseInt(grid[r][c], 10);
                if (!isNaN(val)) pos.push({ n: val, r, c });
            }
        }
        return pos.sort((a, b) => a.n - b.n);
    }

    addNumberToCell(grid, row, col) {
        const positions = this._getNumberPositions(grid);
        if (!isNaN(parseInt(grid[row][col], 10))) return;
        grid[row][col] = this._calculateNewNumberIndex(row, col, positions).toString();
    }

    _calculateNewNumberIndex(r, c, positions) {
        let index = 0;
        for (let i = 0; i < positions.length; i++) {
            if (r < positions[i].r || (r === positions[i].r && c < positions[i].c)) break;
            index = i + 1;
        }
        return index + 1;
    }
}