export const editorMethods = {
    _getEditorDraftStorageKey() {
        return 'crossworder.editor.draft';
    },

    _scheduleEditorAutosave() {
        if (this.modes?.isPlayMode || !this.grid.length) return false;

        if (this._draftAutosaveTimer) {
            window.clearTimeout(this._draftAutosaveTimer);
        }

        this._draftAutosaveTimer = window.setTimeout(() => {
            this._draftAutosaveTimer = null;
            this.saveEditorDraft({ silent: true });
        }, 400);

        return true;
    },

    _captureEditorState() {
        return {
            grid: this.grid.map((row) => [...row]),
            currentSolution: this.currentSolution ? { ...this.currentSolution } : null,
            currentPuzzleClues: { ...this.currentPuzzleClues },
            currentPuzzleMetadata: { ...this.currentPuzzleMetadata },
            activePuzzleSource: this.activePuzzleSource ? { ...this.activePuzzleSource } : null,
            slotBlacklist: Object.fromEntries(
                Object.entries(this.slotBlacklist || {}).map(([slotId, words]) => [
                    slotId,
                    Array.isArray(words) ? [...words] : Array.from(words || [])
                ])
            ),
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
        this.currentPuzzleMetadata = { ...(state.currentPuzzleMetadata || {}) };
        this.activePuzzleSource = state.activePuzzleSource ? { ...state.activePuzzleSource } : null;
        this.slotBlacklist = Object.fromEntries(
            Object.entries(state.slotBlacklist || {}).map(([slotId, words]) => [
                slotId,
                Array.isArray(words) ? [...words] : []
            ])
        );
        this.gridManager.selectedCell = state.selectedCell ? { ...state.selectedCell } : null;
        this.gridManager.selectedDirection = state.selectedDirection || 'across';
        this.hasCompletedPlayPuzzle = false;

        this.render();
        this.syncActiveGridToDOM();
        this.refreshWordList();
        this.syncPuzzleMetadataInputs?.();
        this._updateUndoRedoButtons();
        this._updateDraftButtons?.();
        this._scheduleEditorAutosave?.();
        this._updateRecentPuzzleUI?.();
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

    saveEditorDraft({ silent = false } = {}) {
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
            this._saveRecentPuzzleRecord?.({ silent: true });
            if (!silent) {
                this.display.updateStatus('Saved the current editor draft locally.', true);
            }
            return true;
        } catch (error) {
            console.warn('Could not save editor draft.', error);
            const message = silent
                ? 'Autosave could not update the local editor draft on this device.'
                : 'Could not save the editor draft on this device.';
            this.display.updateStatus(message, true);
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
            if (this._draftAutosaveTimer) {
                window.clearTimeout(this._draftAutosaveTimer);
                this._draftAutosaveTimer = null;
            }
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

    syncPuzzleMetadataInputs() {
        const fieldMap = {
            title: document.getElementById('puzzle-title-input'),
            author: document.getElementById('puzzle-author-input'),
            difficulty: document.getElementById('puzzle-difficulty-input'),
            notes: document.getElementById('puzzle-notes-input')
        };

        Object.entries(fieldMap).forEach(([key, input]) => {
            if (!input) return;
            input.value = this.currentPuzzleMetadata?.[key] || '';
        });
    },

    updatePuzzleMetadataFromInputs() {
        if (this.modes?.isPlayMode) return false;

        const nextMetadata = {
            title: document.getElementById('puzzle-title-input')?.value?.trim() || '',
            author: document.getElementById('puzzle-author-input')?.value?.trim() || '',
            difficulty: document.getElementById('puzzle-difficulty-input')?.value?.trim() || '',
            notes: document.getElementById('puzzle-notes-input')?.value?.trim() || ''
        };

        const current = this.currentPuzzleMetadata || {};
        const changed = ['title', 'author', 'difficulty', 'notes'].some(
            (key) => (current[key] || '') !== (nextMetadata[key] || '')
        );

        if (!changed) return false;

        this._recordEditorSnapshot?.();
        this.currentPuzzleMetadata = nextMetadata;
        this.display.updateStatus('Updated puzzle metadata.', true);
        this._updateDraftButtons?.();
        this._updateRecentPuzzleUI?.();
        this._scheduleEditorAutosave?.();
        return true;
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
        this.currentPuzzleMetadata = {};
        this.render();
        this.display.updateStatus('Cleared all entered letters from the editor grid.', true);
        this._updateDraftButtons?.();
        this._scheduleEditorAutosave?.();
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
        this.currentPuzzleMetadata = {};
        this.slotBlacklist = {};
        this.render();
        this.display.updateStatus('Cleared all blocks from the editor grid.', true);
        this._updateDraftButtons?.();
        this._scheduleEditorAutosave?.();
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
        this.currentPuzzleMetadata = {};
        this.slotBlacklist = {};
        this.gridManager.selectedCell = null;
        this.render();
        this.display.updateStatus('Cleared the entire editor grid.', true);
        this._updateDraftButtons?.();
        this._scheduleEditorAutosave?.();
        return true;
    },

    _clearEditorLine(axis) {
        if (this.modes.isPlayMode || !this.grid.length) return false;

        const selected = this.gridManager?.selectedCell;
        if (!selected || !this._isInBounds(selected.r, selected.c)) {
            this.display.updateStatus('Select a cell in the editor before clearing a row or column.', true);
            return false;
        }

        const index = axis === 'row' ? selected.r : selected.c;
        const hasContent = this.grid.some((row, r) =>
            row.some((cell, c) => (axis === 'row' ? r === index : c === index) && Boolean(cell))
        );
        if (!hasContent) return false;

        this._recordEditorSnapshot();
        this.grid = this.grid.map((row, r) =>
            row.map((cell, c) => ((axis === 'row' ? r === index : c === index) ? '' : cell))
        );
        this.currentSolution = null;
        this.currentPuzzleClues = {};
        this.render();
        this.display.updateStatus(
            `Cleared editor ${axis} ${index + 1}.`,
            true
        );
        this._updateDraftButtons?.();
        this._scheduleEditorAutosave?.();
        return true;
    },

    clearEditorRow() {
        return this._clearEditorLine('row');
    },

    clearEditorColumn() {
        return this._clearEditorLine('column');
    },

    _getSelectedEditorSlot() {
        if (!this.gridManager?.selectedCell) return null;
        return this.gridManager._getActiveSlot?.(this) || null;
    },

    updateEditorClueComposer() {
        const slotLabel = document.getElementById('editor-clue-slot-label');
        const preview = document.getElementById('editor-clue-preview');
        const input = document.getElementById('editor-clue-input');
        const saveButton = document.getElementById('save-clue-button');
        const clearButton = document.getElementById('clear-clue-button');
        const slot = this._getSelectedEditorSlot?.();
        const isEditorActive = !this.modes?.isPlayMode;

        if (!slotLabel || !preview || !input) return;

        if (!isEditorActive || !slot) {
            slotLabel.textContent = 'Select an entry to add or edit its clue.';
            slotLabel.classList.add('muted-text');
            preview.textContent = 'Entry preview will appear here.';
            preview.classList.add('muted-text');
            input.value = '';
            input.disabled = true;
            if (saveButton) saveButton.disabled = true;
            if (clearButton) clearButton.disabled = true;
            return;
        }

        const clue = this.currentPuzzleClues?.[slot.id] || '';
        const entryPreview = this._extractSlotWord?.(slot) || '';
        slotLabel.textContent = `${slot.number} ${slot.direction}`;
        slotLabel.classList.remove('muted-text');
        preview.textContent = entryPreview
            ? `${entryPreview} (${slot.length})`
            : `${'•'.repeat(slot.length)} (${slot.length})`;
        preview.classList.toggle('muted-text', !entryPreview);
        input.disabled = false;
        input.value = clue;
        if (saveButton) saveButton.disabled = false;
        if (clearButton) clearButton.disabled = !clue;
    },

    focusEditorSlot(slot, { announce = true } = {}) {
        if (!slot?.positions?.length) return false;

        const [r, c] = slot.positions[0];
        this.gridManager.selectedCell = { r, c };
        this.gridManager.selectedDirection = slot.direction;
        this.gridManager._updateHighlights(this);
        this.updateEditorClueComposer?.();

        if (announce) {
            this.display.updateStatus(`Selected ${slot.number} ${slot.direction} in the editor.`, true);
        }

        return true;
    },

    saveSelectedEditorClue() {
        if (this.modes.isPlayMode) return false;

        const slot = this._getSelectedEditorSlot?.();
        const input = document.getElementById('editor-clue-input');
        if (!slot || !input) {
            this.display.updateStatus('Select an entry before saving a clue.', true);
            return false;
        }

        const nextClue = input.value.trim();
        if (!nextClue) {
            this.display.updateStatus('Enter clue text before saving.', true);
            return false;
        }

        this._recordEditorSnapshot();
        this.currentPuzzleClues = {
            ...this.currentPuzzleClues,
            [slot.id]: nextClue
        };
        this.refreshWordList();
        this.updateEditorClueComposer?.();
        this.display.updateStatus(`Saved a clue for ${slot.number} ${slot.direction}.`, true);
        this._updateDraftButtons?.();
        this._scheduleEditorAutosave?.();
        return true;
    },

    clearSelectedEditorClue() {
        if (this.modes.isPlayMode) return false;

        const slot = this._getSelectedEditorSlot?.();
        if (!slot || !this.currentPuzzleClues?.[slot.id]) {
            this.display.updateStatus('No authored clue is set for the selected entry.', true);
            return false;
        }

        this._recordEditorSnapshot();
        const nextClues = { ...this.currentPuzzleClues };
        delete nextClues[slot.id];
        this.currentPuzzleClues = nextClues;
        this.refreshWordList();
        this.updateEditorClueComposer?.();
        this.display.updateStatus(`Cleared the clue for ${slot.number} ${slot.direction}.`, true);
        this._updateDraftButtons?.();
        this._scheduleEditorAutosave?.();
        return true;
    },

    _serializeCurrentPuzzle() {
        const clueExport = { across: {}, down: {} };
        const slotList = Object.values(this.slots || {});
        const filledCount = this.grid.reduce(
            (count, row) => count + row.filter((cell) => /^[A-Z]$/i.test(cell)).length,
            0
        );
        const openCount = this.grid.reduce(
            (count, row) => count + row.filter((cell) => cell !== '#').length,
            0
        );

        slotList.forEach((slot) => {
            const clue = this.currentPuzzleClues?.[slot.id];
            if (!clue) return;
            clueExport[slot.direction][String(slot.number)] = clue;
        });

        const hasAcrossClues = Object.keys(clueExport.across).length > 0;
        const hasDownClues = Object.keys(clueExport.down).length > 0;

        return {
            schemaVersion: 2,
            packageType: 'crossworder-puzzle',
            title: this.currentPuzzleMetadata?.title || 'Crossworder Export',
            author: this.currentPuzzleMetadata?.author || '',
            difficulty: this.currentPuzzleMetadata?.difficulty || '',
            notes: this.currentPuzzleMetadata?.notes || '',
            exportedAt: new Date().toISOString(),
            grid: this.grid.map((row) =>
                row.map((cell) => {
                    if (cell === '#') return '.';
                    if (/^[A-Z]$/i.test(cell)) return cell.toUpperCase();
                    return ' ';
                })
            ),
            clues: hasAcrossClues || hasDownClues ? clueExport : {},
            metadata: {
                title: this.currentPuzzleMetadata?.title || '',
                author: this.currentPuzzleMetadata?.author || '',
                difficulty: this.currentPuzzleMetadata?.difficulty || '',
                notes: this.currentPuzzleMetadata?.notes || '',
                packageType: 'crossworder-puzzle',
                schemaVersion: 2
            },
            source: this.activePuzzleSource ? { ...this.activePuzzleSource } : null,
            stats: {
                rows: this.grid.length,
                columns: this.grid[0]?.length || 0,
                totalSlots: slotList.length,
                acrossSlots: slotList.filter((slot) => slot.direction === 'across').length,
                downSlots: slotList.filter((slot) => slot.direction === 'down').length,
                filledCells: filledCount,
                openCells: openCount
            },
            solution: this.extractSolutionFromGrid?.({ requireComplete: false }) || null
        };
    },

    exportCurrentPuzzle() {
        if (this.modes.isPlayMode || !this.grid.length) return false;

        try {
            const payload = JSON.stringify(this._serializeCurrentPuzzle(), null, 2);
            const blob = new Blob([`${payload}\n`], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');

            link.href = url;
            link.download = `crossworder-export-${stamp}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            this.display.updateStatus('Exported the current puzzle as JSON.', true);
            return true;
        } catch (error) {
            console.warn('Could not export puzzle.', error);
            this.display.updateStatus('Could not export the current puzzle.', true);
            return false;
        }
    },

    async importPuzzleFile(file) {
        if (this.modes.isPlayMode || !file) return false;

        try {
            const raw = await file.text();
            const puzzleData = JSON.parse(raw);
            this._assertValidPuzzleGrid?.(puzzleData?.grid, file.name || 'imported puzzle');

            this.importPuzzleGrid(puzzleData.grid, {
                sourceLabel: file.name || 'imported puzzle'
            });
            this.activePuzzleSource = {
                kind: 'imported',
                id: file.name || 'imported-puzzle',
                label: file.name || 'Imported puzzle'
            };
            this.currentPuzzleClues = this._extractPuzzleClues?.(puzzleData) || {};
            this.currentPuzzleMetadata = this._extractPuzzleMetadata?.(puzzleData) || {};
            this.currentSolution = puzzleData?.solution && typeof puzzleData.solution === 'object'
                ? { ...puzzleData.solution }
                : null;
            if (puzzleData?.source && typeof puzzleData.source === 'object') {
                this.activePuzzleSource = {
                    ...this.activePuzzleSource,
                    ...puzzleData.source,
                    kind: puzzleData.source.kind || 'imported'
                };
            }
            this.slotBlacklist = {};
            this.syncPuzzleMetadataInputs?.();
            this._updateRecentPuzzleUI?.();
            this._saveRecentPuzzleRecord?.({ silent: true });
            this.display.updateStatus(`Imported puzzle from ${file.name || 'JSON file'}.`, true);
            return true;
        } catch (error) {
            console.warn('Could not import puzzle.', error);
            this.display.updateStatus(
                this._formatPuzzleLoadError?.(file?.name || 'imported puzzle', error)
                    || 'Could not import the selected puzzle file.',
                true
            );
            return false;
        }
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

        const exportButton = document.getElementById('export-puzzle-button');
        const importButton = document.getElementById('import-puzzle-button');
        if (exportButton) {
            exportButton.disabled = !isEditorActive || !this.grid.length;
        }
        if (importButton) {
            importButton.disabled = !isEditorActive;
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
        this.updateEditorClueComposer?.();
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
        const previousCell = { r, c };
        this.gridManager._moveWithinWord(1, this);
        if (
            this.gridManager.selectedCell &&
            this.gridManager.selectedCell.r === previousCell.r &&
            this.gridManager.selectedCell.c === previousCell.c
        ) {
            this.gridManager._jumpToNextWord?.(this, 1);
        }
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
        this._scheduleEditorAutosave?.();
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
        this._scheduleEditorAutosave?.();
    },

    generateNewGrid(rows, cols) {
        this._recordEditorSnapshot();
        this.grid = Array.from({ length: rows }, () => Array(cols).fill(''));
        this.currentSolution = null;
        this.currentPuzzleClues = {};
        this.currentPuzzleMetadata = {};
        this.activePuzzleSource = {
            kind: 'workspace',
            label: 'Custom workspace'
        };
        this.slotBlacklist = {};
        this.editorGridSnapshot = null;
        this.hasCompletedPlayPuzzle = false;
        this.render();
        this.display.updateStatus(
            `Generated ${rows}×${cols} grid. Add blocks, type letters, or load a bundled puzzle to get started.`,
            true
        );
        this._updateUndoRedoButtons();
        this._updateDraftButtons?.();
        this._updateRecentPuzzleUI?.();
        this._scheduleEditorAutosave?.();
    }
};
