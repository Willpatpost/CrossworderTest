// ui/GridManager.js
export class GridManager {
    constructor(cellsMap) {
        this.cells = cellsMap; // Shared map of "r,c" -> <td> elements
        this.toggleToBlack = true;
    }

    /**
     * Initial full render of the table.
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
                
                // Initialize cell styling
                this._applyBaseStyles(td);

                // Event Listeners for Modes
                td.addEventListener('mousedown', (e) => coordinator.handleMouseDown(e, r, c));
                td.addEventListener('mouseover', (e) => coordinator.handleMouseOver(e, r, c));
                td.addEventListener('click', (e) => coordinator.handleCellClick(e, r, c));

                this.cells[`${r},${c}`] = td;
                tr.appendChild(td);
            }
            table.appendChild(tr);
        }
        
        // Final sync to show current numbers/letters
        this.syncGridToDOM(grid, coordinator.slots || {});
        
        window.addEventListener('mouseup', () => coordinator.handleMouseUp());
        container.appendChild(table);
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
        td.style.position = 'relative'; // Crucial for corner numbers
        td.style.backgroundColor = '#fff';
    }

    /**
     * UPDATED: Specifically handles the "Layered" display of numbers and letters.
     */
    updateCellDisplay(td, value, slotNumber = null) {
        td.innerHTML = ''; // Clear existing content

        if (value === "#") {
            td.style.backgroundColor = '#000';
            return;
        }

        td.style.backgroundColor = '#fff';

        // 1. Add the Clue Number (if applicable)
        if (slotNumber) {
            const numSpan = document.createElement('span');
            numSpan.textContent = slotNumber;
            numSpan.style.position = 'absolute';
            numSpan.style.top = '1px';
            numSpan.style.left = '2px';
            numSpan.style.fontSize = '10px';
            numSpan.style.fontWeight = 'normal';
            numSpan.style.color = '#555';
            td.appendChild(numSpan);
        }

        // 2. Add the Letter (if value is a letter and not just a placeholder number)
        if (value && /[A-Z]/.test(value)) {
            const letterSpan = document.createElement('span');
            letterSpan.textContent = value;
            letterSpan.style.display = 'block';
            letterSpan.style.marginTop = '4px';
            td.appendChild(letterSpan);
        }
    }

    /**
     * UPDATED: Generates a mapping of coordinates to numbers so the 
     * UI knows where to put clue numbers without using the cell's main value.
     */
    syncGridToDOM(grid, slots = {}) {
        // Create a lookup for which cells need a number label
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
                }
            }
        }
    }

    // ... (rest of the shift/index logic from your version)
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

    addNumberToCell(grid, row, col) {
        const positions = this._getNumberPositions(grid);
        const newNum = this._calculateNewNumberIndex(row, col, positions);
        this._shiftNumbers(grid, newNum, 1);
        grid[row][col] = newNum.toString();
        // Since we modified numbers, we need the coordinator to rebuild slots 
        // if we want the clue numbers to update instantly.
    }
}