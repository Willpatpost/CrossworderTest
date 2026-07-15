export class PuzzleSummaryDisplay {
    constructor({ puzzleSummary }) {
        this.puzzleSummary = puzzleSummary;
    }

    update(grid, slots, clueMap = {}, metadata = {}) {
        if (!this.puzzleSummary) return;

        if (!Array.isArray(grid) || !grid.length || !Array.isArray(grid[0])) {
            this.puzzleSummary.replaceChildren();
            return;
        }

        const rows = grid.length;
        const cols = grid[0].length;
        const totalCells = rows * cols;
        const blockCount = grid.flat().filter((cell) => cell === '#').length;
        const fillableCells = totalCells - blockCount;
        const filledCells = grid.flat().filter((cell) => /^[A-Z]$/i.test(cell)).length;
        const slotEntries = Object.values(slots || {});
        const acrossCount = slotEntries.filter((slot) => slot.direction === 'across').length;
        const downCount = slotEntries.filter((slot) => slot.direction === 'down').length;
        const authoredClues = Object.keys(clueMap || {}).length;
        const fillPercent = fillableCells
            ? Math.round((filledCells / fillableCells) * 100)
            : 0;
        const title = metadata?.title || 'Untitled';
        const author = metadata?.author || 'Unknown author';

        if (fillableCells === 0) {
            const emptyItem = this._createSummaryItem(
                'No open cells yet',
                'Add fillable squares or load a bundled puzzle to begin.'
            );
            emptyItem.classList.add('summary-item-wide');
            this.puzzleSummary.replaceChildren(emptyItem);
            return;
        }

        this.puzzleSummary.replaceChildren(
            this._createSummaryItem(title, author),
            this._createSummaryItem(`${rows}x${cols}`, 'Grid'),
            this._createSummaryItem(String(blockCount), 'Blocks'),
            this._createSummaryItem(`${acrossCount}/${downCount}`, 'Across/Down'),
            this._createSummaryItem(`${fillPercent}%`, 'Filled'),
            this._createSummaryItem(String(authoredClues), 'Authored clues')
        );
    }

    _createSummaryItem(value, label) {
        const item = document.createElement('div');
        item.className = 'summary-item';

        const valueElement = document.createElement('span');
        valueElement.className = 'summary-value';
        valueElement.textContent = value;

        const labelElement = document.createElement('span');
        labelElement.className = 'summary-label';
        labelElement.textContent = label;

        item.append(valueElement, labelElement);
        return item;
    }
}
