export class PuzzleSummaryDisplay {
    constructor({ puzzleSummary }) {
        this.puzzleSummary = puzzleSummary;
    }

    update(grid, slots, clueMap = {}, metadata = {}) {
        if (!this.puzzleSummary) return;

        if (!Array.isArray(grid) || !grid.length || !Array.isArray(grid[0])) {
            this.puzzleSummary.innerHTML = '';
            return;
        }

        const rows = grid.length;
        const cols = grid[0].length;
        const totalCells = rows * cols;
        let blockCount = 0;
        let filledCells = 0;

        grid.forEach((row) => {
            row.forEach((cell) => {
                if (cell === '#') {
                    blockCount++;
                } else if (/^[A-Z]$/i.test(cell)) {
                    filledCells++;
                }
            });
        });

        const fillableCells = totalCells - blockCount;
        const slotEntries = Object.values(slots || {});
        const acrossCount = slotEntries.filter((slot) => slot.direction === 'across').length;
        const downCount = slotEntries.filter((slot) => slot.direction === 'down').length;
        const authoredClues = Object.keys(clueMap || {}).length;
        const fillPercent = fillableCells
            ? Math.round((filledCells / fillableCells) * 100)
            : 0;
        const title = metadata?.title || 'Untitled';
        const author = metadata?.author || 'Unknown author';

        this.puzzleSummary.replaceChildren();

        if (fillableCells === 0) {
            this.puzzleSummary.appendChild(
                this._createSummaryElement(
                    'No open cells yet',
                    'Add fillable squares or load a bundled puzzle to begin.',
                    true
                )
            );
            return;
        }

        [
            this._createSummaryElement(title, author),
            this._createSummaryElement(`${rows}x${cols}`, 'Grid'),
            this._createSummaryElement(String(blockCount), 'Blocks'),
            this._createSummaryElement(`${acrossCount}/${downCount}`, 'Across/Down'),
            this._createSummaryElement(`${fillPercent}%`, 'Filled'),
            this._createSummaryElement(String(authoredClues), 'Authored clues')
        ].forEach((element) => {
            this.puzzleSummary.appendChild(element);
        });
    }

    _createSummaryElement(value, label, isWide = false) {
        const item = document.createElement('div');
        item.className = `summary-item${isWide ? ' summary-item-wide' : ''}`;

        const valueEl = document.createElement('span');
        valueEl.className = 'summary-value';
        valueEl.textContent = value;

        const labelEl = document.createElement('span');
        labelEl.className = 'summary-label';
        labelEl.textContent = label;

        item.append(valueEl, labelEl);
        return item;
    }
}
