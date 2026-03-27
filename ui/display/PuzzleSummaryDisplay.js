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
            this.puzzleSummary.innerHTML = `
                <div class="summary-item summary-item-wide">
                    <span class="summary-value">No open cells yet</span>
                    <span class="summary-label">Add fillable squares or load a bundled puzzle to begin.</span>
                </div>
            `;
            return;
        }

        this.puzzleSummary.innerHTML = [
            this._createSummaryItem(title, author),
            this._createSummaryItem(`${rows}x${cols}`, 'Grid'),
            this._createSummaryItem(String(blockCount), 'Blocks'),
            this._createSummaryItem(`${acrossCount}/${downCount}`, 'Across/Down'),
            this._createSummaryItem(`${fillPercent}%`, 'Filled'),
            this._createSummaryItem(String(authoredClues), 'Authored clues')
        ].join('');
    }

    _createSummaryItem(value, label) {
        return `
            <div class="summary-item">
                <span class="summary-value">${value}</span>
                <span class="summary-label">${label}</span>
            </div>
        `;
    }
}
