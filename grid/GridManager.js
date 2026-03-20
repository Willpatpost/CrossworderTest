// ui/GridManager.js
export class GridManager {
    constructor(cells) {
        this.cells = cells; // Reference to the cells object from Coordinator
    }

    render(grid, container, cellClickHandler) {
        container.innerHTML = '';
        const table = document.createElement('table');
        table.style.borderCollapse = 'collapse';

        for (let r = 0; r < grid.length; r++) {
            const tr = document.createElement('tr');
            for (let c = 0; c < grid[0].length; c++) {
                const td = document.createElement('td');
                this._applyCellStyle(td, grid[r][c]);
                td.dataset.row = r;
                td.dataset.col = c;
                td.addEventListener('click', cellClickHandler);
                this.cells[`${r},${c}`] = td;
                tr.appendChild(td);
            }
            table.appendChild(tr);
        }
        container.appendChild(table);
    }

    _applyCellStyle(td, value) {
        td.style.cssText = 'border:1px solid #ccc; width:30px; height:30px; text-align:center; vertical-align:middle; font-size:16px; font-weight:bold; cursor:pointer;';
        if (value === "#") {
            td.style.backgroundColor = '#000';
            td.style.color = '#000';
        } else {
            td.style.backgroundColor = '#fff';
            td.style.color = '#444';
            if (/\d/.test(value)) td.textContent = value;
        }
    }

    // Your specific Number-Shifting Logic
    addNumberToCell(grid, row, col) {
        const positions = this._getNumberPositions(grid);
        const newNum = this._calculateNewNumberIndex(row, col, positions);
        this._shiftNumbers(grid, newNum, 1); // Shift up
        grid[row][col] = newNum.toString();
        return newNum;
    }

    removeNumberFromCell(grid, row, col) {
        const removed = parseInt(grid[row][col], 10);
        grid[row][col] = " ";
        this._shiftNumbers(grid, removed, -1); // Shift down
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