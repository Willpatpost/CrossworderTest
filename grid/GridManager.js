// grid/GridManager.js
export class GridManager {
    constructor(cellsMap) {
        this.cells = cellsMap; // Shared map of "r,c" -> <td> elements
        this.toggleToBlack = true;
    }

    /**
     * Initial full render of the table.
     * Clears previous references to prevent memory leaks.
     */
    render(grid, container, coordinator) {
        container.innerHTML = '';
        
        // CRITICAL: Clear the shared cells map so we don't reference old DOM nodes
        for (const key in this.cells) {
            delete this.cells[key];
        }

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
        
        // We use a named function or a specific cleanup if we were destroying the app, 
        // but for now, we just ensure the global listener is active.
        window.onmouseup = () => coordinator.handleMouseUp();
        
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
     * Handles the layered display of numbers and letters.
     */
    updateCellDisplay(td, value, slotNumber = null) {
        // We use a fragment or selective updates if performance becomes an issue during visualization,
        // but innerHTML = '' is safe for now.
        td.innerHTML = ''; 

        if (value === "#") {
            td.style.backgroundColor = '#000';
            return;
        }

        td.style.backgroundColor = '#fff';

        // 1. Add the Clue Number (Top-Left)
        if (slotNumber) {
            const numSpan = document.createElement('span');
            numSpan.textContent = slotNumber;
            numSpan.style.position = 'absolute';
            numSpan.style.top = '1px';
            numSpan.style.left = '2px';
            numSpan.style.fontSize = '10px';
            numSpan.style.fontWeight = 'normal';
            numSpan.style.color = '#555';
            numSpan.className = 'cell-number';
            td.appendChild(numSpan);
        }

        // 2. Add the Letter (Center)
        // If the value is a single letter, display it. 
        // Note: we ignore placeholder digits that might be in the raw grid array.
        if (value && /^[A-Z]$/i.test(value)) {
            const letterSpan = document.createElement('span');
            letterSpan.textContent = value.toUpperCase();
            letterSpan.style.display = 'block';
            letterSpan.style.marginTop = '4px';
            td.appendChild(letterSpan);
        }
    }

    /**
     * Synchronizes the internal grid state to the visible DOM cells.
     */
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
                }
            }
        }
    }

    /**
     * Shifts existing manual numbers to make room for a new one.
     */
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

    /**
     * Gets all manually placed numbers in the grid sorted by value.
     */
    _getNumberPositions(grid) {
        const pos = [];
        for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < grid[0].length; c++) {
                const val = parseInt(grid[r][c], 10);
                if (!isNaN(val)) {
                    pos.push({ n: val, r, c });
                }
            }
        }
        return pos.sort((a, b) => a.n - b.n);
    }

    /**
     * Calculates what the index of a new manual number should be based on its 
     * coordinates relative to existing numbers.
     */
    _calculateNewNumberIndex(r, c, positions) {
        let index = 0;
        for (let i = 0; i < positions.length; i++) {
            // Numbers in crosswords generally follow reading order: row then column
            if (r < positions[i].r || (r === positions[i].r && c < positions[i].c)) {
                break;
            }
            index = i + 1;
        }
        return index + 1;
    }

    /**
     * Public method for coordinator to add a manual number.
     */
    addNumberToCell(grid, row, col) {
        const positions = this._getNumberPositions(grid);
        
        // If cell already has a number, we don't add a new one (could implement removal logic later)
        if (!isNaN(parseInt(grid[row][col], 10))) return;

        const newNum = this._calculateNewNumberIndex(row, col, positions);
        this._shiftNumbers(grid, newNum, 1);
        grid[row][col] = newNum.toString();
    }
}