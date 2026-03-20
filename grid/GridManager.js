// grid/GridManager.js
export class GridManager {
    constructor(cellsMap) {
        this.cells = cellsMap; 
        this.toggleToBlack = true;
        this.selectedCell = null; // {r, c}
    }

    render(grid, container, coordinator) {
        container.innerHTML = '';
        for (const key in this.cells) delete this.cells[key];

        const table = document.createElement('table');
        table.id = 'crossword-grid';
        table.style.borderCollapse = 'collapse';
        table.style.margin = '0 auto';

        for (let r = 0; r < grid.length; r++) {
            const tr = document.createElement('tr');
            for (let c = 0; c < grid[0].length; c++) {
                const td = document.createElement('td');
                td.dataset.row = r;
                td.dataset.col = c;
                this._applyBaseStyles(td);

                td.addEventListener('mousedown', (e) => coordinator.handleMouseDown(e, r, c));
                td.addEventListener('mouseover', (e) => coordinator.handleMouseOver(e, r, c));
                td.addEventListener('click', (e) => coordinator.handleCellClick(e, r, c));

                this.cells[`${r},${c}`] = td;
                tr.appendChild(td);
            }
            table.appendChild(tr);
        }
        this.syncGridToDOM(grid, coordinator.slots || {});
        container.appendChild(table);
    }

    focusCell(r, c) {
        if (this.selectedCell) {
            const oldTd = this.cells[`${this.selectedCell.r},${this.selectedCell.c}`];
            if (oldTd) oldTd.classList.remove('cell-selected');
        }
        this.selectedCell = { r, c };
        const newTd = this.cells[`${r},${c}`];
        if (newTd) {
            newTd.classList.add('cell-selected');
        }
    }

    _applyBaseStyles(td) {
        td.style.width = '35px';
        td.style.height = '35px';
        td.style.border = '1px solid #333';
        td.style.textAlign = 'center';
        td.style.verticalAlign = 'middle';
        td.style.fontSize = '18px';
        td.style.fontWeight = 'bold';
        td.style.cursor = 'pointer';
        td.style.userSelect = 'none';
        td.style.position = 'relative';
        td.style.backgroundColor = '#fff';
    }

    updateCellDisplay(td, value, slotNumber = null) {
        td.innerHTML = ''; 
        if (value === "#") {
            td.style.backgroundColor = '#000';
            return;
        }
        td.style.backgroundColor = '#fff';

        if (slotNumber) {
            const numSpan = document.createElement('span');
            numSpan.textContent = slotNumber;
            numSpan.className = 'cell-number';
            numSpan.style.position = 'absolute';
            numSpan.style.top = '1px';
            numSpan.style.left = '2px';
            numSpan.style.fontSize = '10px';
            numSpan.style.fontWeight = 'normal';
            numSpan.style.color = '#555';
            td.appendChild(numSpan);
        }

        if (value && /^[A-Z]$/i.test(value)) {
            const letterSpan = document.createElement('span');
            letterSpan.textContent = value.toUpperCase();
            letterSpan.className = 'cell-letter';
            letterSpan.style.display = 'block';
            letterSpan.style.marginTop = '4px';
            td.appendChild(letterSpan);
        }
    }

    syncGridToDOM(grid, slots = {}) {
        const numberMap = {};
        Object.values(slots).forEach(slot => {
            const [r, c] = slot.positions[0];
            numberMap[`${r},${c}`] = slot.number;
        });

        for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < grid[0].length; c++) {
                const td = this.cells[`${r},${c}`];
                if (td) {
                    this.updateCellDisplay(td, grid[r][c], numberMap[`${r},${c}`]);
                    if (this.selectedCell?.r === r && this.selectedCell?.c === c) {
                        td.classList.add('cell-selected');
                    }
                }
            }
        }
    }

    addNumberToCell(grid, row, col) {
        const positions = this._getNumberPositions(grid);
        if (!isNaN(parseInt(grid[row][col], 10))) return;
        const newNum = this._calculateNewNumberIndex(row, col, positions);
        this._shiftNumbers(grid, newNum, 1);
        grid[row][col] = newNum.toString();
    }

    _shiftNumbers(grid, threshold, delta) {
        for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < grid[0].length; c++) {
                const val = parseInt(grid[r][c], 10);
                if (!isNaN(val) && val >= threshold) grid[r][c] = (val + delta).toString();
            }
        }
    }

    _getNumberPositions(grid) {
        const pos = [];
        for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < grid[0].length; c++) {
                if (/\d/.test(grid[r][c])) pos.push({ n: parseInt(grid[r][c]), r, c });
            }
        }
        return pos.sort((a, b) => a.n - b.n);
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