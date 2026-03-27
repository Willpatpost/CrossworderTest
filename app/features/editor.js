export const editorMethods = {
    handleMouseDown(_event, r, c) {
        if (this.modes.isPlayMode) return;
        if (this.modes.currentMode !== 'drag') return;
        if (!this._isInBounds(r, c)) return;

        this.abortActiveSolve();

        this.isDragging = true;
        this.dragPaintValue = this.grid[r][c] === '#' ? '' : '#';

        this.paintCell(r, c, this.dragPaintValue);
    },

    handleMouseOver(_event, r, c) {
        if (!this.isDragging) return;
        if (this.modes.isPlayMode) return;
        if (this.modes.currentMode !== 'drag') return;
        if (!this._isInBounds(r, c)) return;

        this.paintCell(r, c, this.dragPaintValue);
    },

    handleMouseUp() {
        this.isDragging = false;
    },

    handleCellClick(_event, r, c) {
        if (this.isSolving) {
            this.abortActiveSolve();
        }

        if (this.modes.isPlayMode) return;
        if (!this._isInBounds(r, c)) return;

        const mode = this.modes.currentMode;

        if (mode === 'letter') {
            this.setEditorSelection(r, c);
            return;
        }

        if (mode === 'drag') {
            return;
        }

        this.paintCell(r, c, this.grid[r][c] === '#' ? '' : '#');
    },

    setEditorSelection(r, c) {
        if (!this._isInBounds(r, c) || this.grid[r][c] === '#') return;

        const selected = this.gridManager.selectedCell;
        if (selected?.r === r && selected?.c === c) {
            this.gridManager.selectedDirection =
                this.gridManager.selectedDirection === 'across' ? 'down' : 'across';
        } else {
            this.gridManager.selectedCell = { r, c };

            const matchingSlot = Object.values(this.slots || {}).find((slot) =>
                slot.direction === this.gridManager.selectedDirection &&
                slot.positions.some(([rr, cc]) => rr === r && cc === c)
            );

            if (!matchingSlot) {
                const acrossSlot = Object.values(this.slots || {}).find((slot) =>
                    slot.direction === 'across' &&
                    slot.positions.some(([rr, cc]) => rr === r && cc === c)
                );
                this.gridManager.selectedDirection = acrossSlot ? 'across' : 'down';
            }
        }

        this.gridManager._updateHighlights(this);
        this.display.updateStatus(
            'Letter mode active. Type to fill, use arrows to move, and Backspace/Delete to clear.',
            true
        );
    },

    handleEditorLetterInput(letter) {
        const selected = this.gridManager.selectedCell;
        if (!selected) return;

        const normalized = String(letter || '').trim().toUpperCase().charAt(0);
        if (!/^[A-Z]$/.test(normalized)) {
            this.display.updateStatus('Please enter a single letter A-Z.', true);
            return;
        }

        const { r, c } = selected;
        if (!this._isInBounds(r, c) || this.grid[r][c] === '#') return;

        this.grid[r][c] = normalized;
        this._finalizeEditorLetterChange();
        this.gridManager._moveWithinWord(1, this);
    },

    handleEditorBackspace() {
        const selected = this.gridManager.selectedCell;
        if (!selected) return;

        let { r, c } = selected;
        if (!this._isInBounds(r, c) || this.grid[r][c] === '#') return;

        if (!this.grid[r][c]) {
            this.gridManager._moveWithinWord(-1, this);
            if (!this.gridManager.selectedCell) return;
            ({ r, c } = this.gridManager.selectedCell);
        }

        this.grid[r][c] = '';
        this._finalizeEditorLetterChange();
        this.gridManager._updateHighlights(this);
    },

    handleEditorDelete() {
        const selected = this.gridManager.selectedCell;
        if (!selected) return;

        const { r, c } = selected;
        if (!this._isInBounds(r, c) || this.grid[r][c] === '#') return;

        this.grid[r][c] = '';
        this._finalizeEditorLetterChange();
        this.gridManager._updateHighlights(this);
    },

    handleEditorArrow(key) {
        this.gridManager._handleArrow(key, this);
    },

    _finalizeEditorLetterChange() {
        this.rebuildGridState();
        this.syncActiveGridToDOM();
        this.refreshWordList();
        this.currentSolution = null;
    },

    paintCell(r, c, value) {
        if (!this._isInBounds(r, c)) return;

        const nextValue = value === '#' ? '#' : '';

        if (this.grid[r][c] === nextValue) return;

        this.grid[r][c] = nextValue;

        if (this.modes.isSymmetryEnabled) {
            const mirrorR = this.grid.length - 1 - r;
            const mirrorC = this.grid[0].length - 1 - c;
            this.grid[mirrorR][mirrorC] = nextValue;
        }

        this.rebuildGridState();
        this.syncActiveGridToDOM();
        this.refreshWordList();
        this.currentSolution = null;
        this.currentPuzzleClues = {};
    },

    generateNewGrid(rows, cols) {
        this.grid = Array.from({ length: rows }, () => Array(cols).fill(''));
        this.currentSolution = null;
        this.currentPuzzleClues = {};
        this.editorGridSnapshot = null;
        this.hasCompletedPlayPuzzle = false;
        this.render();
        this.display.updateStatus(
            `Generated ${rows}×${cols} grid. Add blocks, type letters, or load a bundled puzzle to get started.`,
            true
        );
    }
};
