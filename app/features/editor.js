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
            this.handleLetterEntry(r, c);
            return;
        }

        if (mode === 'drag') {
            return;
        }

        this.paintCell(r, c, this.grid[r][c] === '#' ? '' : '#');
    },

    handleLetterEntry(r, c) {
        if (this.grid[r][c] === '#') return;

        const input = window.prompt('Enter a letter:');
        if (input === null) return;

        const letter = input.trim().toUpperCase().charAt(0);

        if (!letter) {
            this.grid[r][c] = '';
        } else if (/^[A-Z]$/.test(letter)) {
            this.grid[r][c] = letter;
        } else {
            this.display.updateStatus('Please enter a single letter A-Z.', true);
            return;
        }

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
