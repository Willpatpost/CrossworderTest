// ui/GridManager.js
export class GridManager {
    constructor(cellsMap) {
        this.cells = cellsMap; // Shared map of "r,c" -> <td> elements
        this.isDragging = false;
        this.toggleToBlack = true;
    }

    /**
     * Initial full render of the table.
     * Maps to OG: renderGrid()
     */
    render(grid, container, coordinator) {
        container.innerHTML = '';
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
                
                // Set initial appearance
                this.updateCellDisplay(td, grid[r][c]);

                // Event Listeners for Modes
                td.addEventListener('mousedown', (e) => coordinator.handleMouseDown(e, r, c));
                td.addEventListener('mouseover', (e) => coordinator.handleMouseOver(e, r, c));
                td.addEventListener('click', (e) => coordinator.handleCellClick(e, r, c));

                this.cells[`${r},${c}`] = td;
                tr.appendChild(td);
            }
            table.appendChild(tr);
        }
        
        // Global mouseup to stop dragging anywhere
        window.addEventListener('mouseup', () => coordinator.handleMouseUp());
        container.appendChild(table);
    }

    /**
     * THE PERFORMANCE FIX: Targeted updates instead of re-rendering everything.
     * Maps to OG: updateCell()
     */
    updateCellDisplay(td, value, fg = null, bg = null) {
        // Base Styling
        td.style.width = '30px';
        td.style.height = '30px';
        td.style.border = '1px solid #ccc';
        td.style.textAlign = 'center';
        td.style.verticalAlign = 'middle';
        td.style.fontSize = '16px';
        td.style.fontWeight = 'bold';
        td.style.cursor = 'pointer';
        td.style.userSelect = 'none';

        if (value === "#") {
            td.style.backgroundColor = bg || '#000';
            td.style.color = '#000';
            td.textContent = "";
        } else {
            td.style.backgroundColor = bg || '#fff';
            td.style.color = fg || '#444';
            // Only show numbers or letters
            td.textContent = (value.trim() !== "") ? value : "";
        }
    }

    /**
     * Logic for shifting numbers when one is inserted mid-sequence.
     * Preserved from your OG implementation.
     */
    addNumberToCell(grid, row, col) {
        const positions = this._getNumberPositions(grid);
        const newNum = this._calculateNewNumberIndex(row, col, positions);
        this._shiftNumbers(grid, newNum, 1);
        grid[row][col] = newNum.toString();
        this.syncGridToDOM(grid); 
    }

    removeNumberFromCell(grid, row, col) {
        const val = parseInt(grid[row][col], 10);
        grid[row][col] = " ";
        this._shiftNumbers(grid, val, -1);
        this.syncGridToDOM(grid);
    }

    /**
     * Syncs the internal array state to the existing DOM <td> elements
     * without destroying the table.
     */
    syncGridToDOM(grid) {
        for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < grid[0].length; c++) {
                const td = this.cells[`${r},${c}`];
                if (td) this.updateCellDisplay(td, grid[r][c]);
            }
        }
    }

    _shiftNumbers(grid, threshold, delta) {
        for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < grid[0].length; c++) {
                const val = parseInt(grid[r][c], 10);
                if (!isNaN(val) && val >= threshold) {
                    grid[r][c] = (val + delta).toString();
                }
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