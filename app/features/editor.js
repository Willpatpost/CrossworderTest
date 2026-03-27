export const editorMethods = {
    _getEditorDraftStorageKey() {
        return 'crossworder.editor.draft';
    },

    _captureEditorState() {
        return {
            grid: this.grid.map((row) => [...row]),
            currentSolution: this.currentSolution ? { ...this.currentSolution } : null,
            currentPuzzleClues: { ...this.currentPuzzleClues },
            selectedCell: this.gridManager.selectedCell
                ? { ...this.gridManager.selectedCell }
                : null,
            selectedDirection: this.gridManager.selectedDirection || 'across'
        };
    },

    _restoreEditorState(state) {
        if (!state) return;

        this.grid = state.grid.map((row) => [...row]);
        this.currentSolution = state.currentSolution ? { ...state.currentSolution } : null;
        this.currentPuzzleClues = { ...state.currentPuzzleClues };
        this.gridManager.selectedCell = state.selectedCell ? { ...state.selectedCell } : null;
        this.gridManager.selectedDirection = state.selectedDirection || 'across';
        this.hasCompletedPlayPuzzle = false;

        this.render();
        this.syncActiveGridToDOM();
        this.refreshWordList();
        this._updateUndoRedoButtons();
        this._updateDraftButtons?.();
    },

    _recordEditorSnapshot() {
        this.editorHistory.push(this._captureEditorState());
        if (this.editorHistory.length > 100) {
            this.editorHistory.shift();
        }

        this.editorFuture = [];
        this._updateUndoRedoButtons();
    },

    _resetEditorHistory() {
        this.editorHistory = [];
        this.editorFuture = [];
        this._updateUndoRedoButtons();
    },

    _readSavedEditorDraft() {
        try {
            const raw = localStorage.getItem(this._getEditorDraftStorageKey());
            if (!raw) return null;

            const parsed = JSON.parse(raw);
            return parsed?.grid ? parsed : null;
        } catch (error) {
            console.warn('Could not read saved editor draft.', error);
            return null;
        }
    },

    _hasSavedEditorDraft() {
        return Boolean(this._readSavedEditorDraft());
    },

    _updateDraftButtons() {
        const saveButton = document.getElementById('save-draft-button');
        const loadButton = document.getElementById('load-draft-button');
        const clearButton = document.getElementById('clear-draft-button');
        const isEditorActive = !this.modes?.isPlayMode;
        const hasSavedDraft = this._hasSavedEditorDraft();

        if (saveButton) {
            saveButton.disabled = !isEditorActive || !this.grid.length;
        }

        if (loadButton) {
            loadButton.disabled = !isEditorActive || !hasSavedDraft;
        }

        if (clearButton) {
            clearButton.disabled = !isEditorActive || !hasSavedDraft;
        }
    },

    saveEditorDraft() {
        if (this.modes.isPlayMode || !this.grid.length) return false;

        try {
            localStorage.setItem(
                this._getEditorDraftStorageKey(),
                JSON.stringify({
                    savedAt: new Date().toISOString(),
                    ...this._captureEditorState()
                })
            );
            this._updateDraftButtons();
            this.display.updateStatus('Saved the current editor draft locally.', true);
            return true;
        } catch (error) {
            console.warn('Could not save editor draft.', error);
            this.display.updateStatus('Could not save the editor draft on this device.', true);
            return false;
        }
    },

    loadEditorDraft() {
        if (this.modes.isPlayMode) return false;

        const draft = this._readSavedEditorDraft();
        if (!draft) {
            this._updateDraftButtons();
            this.display.updateStatus('No saved editor draft is available.', true);
            return false;
        }

        try {
            this._assertValidPuzzleGrid?.(draft.grid, 'saved draft');
            this._recordEditorSnapshot();
            this._restoreEditorState(draft);
            this.display.updateStatus('Loaded the saved editor draft.', true);
            this._updateDraftButtons();
            return true;
        } catch (error) {
            console.warn('Could not load saved editor draft.', error);
            this.display.updateStatus('The saved editor draft is invalid and could not be loaded.', true);
            return false;
        }
    },

    clearSavedEditorDraft() {
        try {
            localStorage.removeItem(this._getEditorDraftStorageKey());
            this._updateDraftButtons();
            this.display.updateStatus('Cleared the saved editor draft.', true);
            return true;
        } catch (error) {
            console.warn('Could not clear saved editor draft.', error);
            this.display.updateStatus('Could not clear the saved editor draft on this device.', true);
            return false;
        }
    },

    clearEditorLetters() {
        if (this.modes.isPlayMode || !this.grid.length) return false;

        const hasLetters = this.grid.some((row) => row.some((cell) => /^[A-Z]$/i.test(cell)));
        if (!hasLetters) return false;

        this._recordEditorSnapshot();
        this.grid = this.grid.map((row) =>
            row.map((cell) => (cell === '#' ? '#' : ''))
        );
        this.currentSolution = null;
        this.render();
        this.display.updateStatus('Cleared all entered letters from the editor grid.', true);
        this._updateDraftButtons?.();
        return true;
    },

    clearEditorBlocks() {
        if (this.modes.isPlayMode || !this.grid.length) return false;

        const hasBlocks = this.grid.some((row) => row.some((cell) => cell === '#'));
        if (!hasBlocks) return false;

        this._recordEditorSnapshot();
        this.grid = this.grid.map((row) =>
            row.map((cell) => (cell === '#' ? '' : cell))
        );
        this.currentSolution = null;
        this.currentPuzzleClues = {};
        this.render();
        this.display.updateStatus('Cleared all blocks from the editor grid.', true);
        this._updateDraftButtons?.();
        return true;
    },

    clearEditorGrid() {
        if (this.modes.isPlayMode || !this.grid.length) return false;

        const hasContent = this.grid.some((row) => row.some((cell) => cell));
        if (!hasContent) return false;

        this._recordEditorSnapshot();
        this.grid = this.grid.map((row) => row.map(() => ''));
        this.currentSolution = null;
        this.currentPuzzleClues = {};
        this.gridManager.selectedCell = null;
        this.render();
        this.display.updateStatus('Cleared the entire editor grid.', true);
        this._updateDraftButtons?.();
        return true;
    },

    _updateUndoRedoButtons() {
        const undoButton = document.getElementById('undo-button');
        const redoButton = document.getElementById('redo-button');
        const isEditorActive = !this.modes?.isPlayMode;

        if (undoButton) {
            undoButton.disabled = !isEditorActive || this.editorHistory.length === 0;
        }

        if (redoButton) {
            redoButton.disabled = !isEditorActive || this.editorFuture.length === 0;
        }
    },

    undoEditorChange() {
        if (this.modes.isPlayMode || this.isSolving || !this.editorHistory.length) return;

        this.editorFuture.push(this._captureEditorState());
        const previous = this.editorHistory.pop();
        this._restoreEditorState(previous);
        this.display.updateStatus('Undid the last editor change.', true);
    },

    redoEditorChange() {
        if (this.modes.isPlayMode || this.isSolving || !this.editorFuture.length) return;

        this.editorHistory.push(this._captureEditorState());
        const next = this.editorFuture.pop();
        this._restoreEditorState(next);
        this.display.updateStatus('Redid the last editor change.', true);
    },

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

        this._recordEditorSnapshot();
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

        this._recordEditorSnapshot();
        this.grid[r][c] = '';
        this._finalizeEditorLetterChange();
        this.gridManager._updateHighlights(this);
    },

    handleEditorDelete() {
        const selected = this.gridManager.selectedCell;
        if (!selected) return;

        const { r, c } = selected;
        if (!this._isInBounds(r, c) || this.grid[r][c] === '#') return;

        this._recordEditorSnapshot();
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

        this._recordEditorSnapshot();
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
        this._recordEditorSnapshot();
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
        this._updateUndoRedoButtons();
        this._updateDraftButtons?.();
    }
};
