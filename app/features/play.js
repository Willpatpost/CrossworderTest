import { GridUtils } from '../../utils/GridUtils.js';
import { playSessionMethods } from './playSession.js';

export const playMethods = {
    enterPlayMode() {
        if (this.isSolving) {
            this.abortActiveSolve();
        }

        if (!this.currentSolution) {
            const extractedSolution = this.extractSolutionFromGrid({ requireComplete: true });
            if (!extractedSolution) {
                this.popups.showMessage(
                    'Play Mode Unavailable',
                    'Play mode requires a fully solved grid or an imported puzzle with a saved solution.',
                    'Play Mode'
                );
                return false;
            }

            this.currentSolution = extractedSolution;
        }

        this.editorGridSnapshot = GridUtils.cloneGrid(this.grid);
        this.isPlayPaused = false;
        this.hasCompletedPlayPuzzle = false;
        const pendingSession = this._pendingPlaySessionRestore;
        this._pendingPlaySessionRestore = null;

        this.modes.setPlayMode(true);
        this.blankGridForPlayMode();
        this.render();
        this.refreshWordList();
        this._resetPlayTimer();

        if (pendingSession?.grid?.length) {
            this.grid = GridUtils.cloneGrid(pendingSession.grid);
            this.syncActiveGridToDOM();
            this.playElapsedMs = Math.max(0, Number(pendingSession.elapsedMs) || 0);
            this.hasCompletedPlayPuzzle = Boolean(pendingSession.hasCompleted);
        }

        if (this.hasCompletedPlayPuzzle) {
            this._pausePlayTimer();
        } else {
            this._resumePlayTimer();
        }

        this._updateInstantMistakeUI();
        this._updatePauseUI();
        this._saveRecentPuzzleRecord?.({ silent: true });

        const firstSlot = this._getFirstSlot();
        if (firstSlot) {
            const [r, c] = firstSlot.positions[0];
            this.gridManager.selectedCell = { r, c };
            this.gridManager.selectedDirection = firstSlot.direction;
            this.gridManager._updateHighlights(this);
        }

        this.display.updateStatus('Entered play mode. Good luck!', true);
        if (this.hasCompletedPlayPuzzle) {
            const totalSeconds = Math.max(0, Math.floor(this.playElapsedMs / 1000));
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            this._updatePlayStatusCopy(
                'completed',
                `${minutes}:${String(seconds).padStart(2, '0')}`
            );
        } else {
            this._updatePlayStatusCopy('active');
        }
        return true;
    },

    exitPlayMode() {
        if (this.isSolving) {
            this.abortActiveSolve();
        }

        this._pausePlayTimer();
        this._resetPlayTimer();
        this.isPlayPaused = false;
        this.hasCompletedPlayPuzzle = false;
        this.modes.setPlayMode(false);

        if (this.editorGridSnapshot?.length) {
            this.grid = GridUtils.cloneGrid(this.editorGridSnapshot);
        }

        this.editorGridSnapshot = null;
        this.render();
        this.refreshWordList();
        this._updateInstantMistakeUI();
        this._updatePauseUI();
        this._updateUndoRedoButtons?.();
        this._updateDraftButtons?.();
        this._updateSolveControls?.(false);
        this._updatePlayStatusCopy('idle');
        this.display.updateStatus('Returned to editor mode.', true);
        this._saveRecentPuzzleRecord?.({ silent: true });
    },

    extractSolutionFromGrid({ requireComplete = false } = {}) {
        const solution = {};

        for (const slotId in this.slots) {
            const slot = this.slots[slotId];
            let word = '';

            slot.positions.forEach(([r, c]) => {
                const val = this.grid[r][c];
                if (/^[A-Z]$/i.test(val)) {
                    word += val.toUpperCase();
                    return;
                }

                if (requireComplete) {
                    word = '';
                }
            });

            if (requireComplete && word.length !== slot.length) {
                return null;
            }

            solution[slotId] = word;
        }

        return solution;
    },

    blankGridForPlayMode() {
        for (let r = 0; r < this.grid.length; r++) {
            for (let c = 0; c < this.grid[0].length; c++) {
                if (this.grid[r][c] !== '#') {
                    this.grid[r][c] = '';
                }
            }
        }
    },

    handleCheckSquare() {
        if (!this._canUsePlayTools()) return;

        const selected = this.gridManager.selectedCell;
        if (!selected) return;

        const { r, c } = selected;
        if (this.grid[r][c] === '#') return;

        const expected = this._getSolutionLetterAt(r, c);
        const actual = (this.grid[r][c] || '').toUpperCase();

        const td = this.gridManager.cells[`${r},${c}`];
        if (!td) return;

        this._applyCheckState(td, actual, expected);
    },

    handleCheckWord() {
        if (!this._canUsePlayTools()) return;

        const slot = this.gridManager._getActiveSlot(this);
        if (!slot) return;

        slot.positions.forEach(([r, c]) => {
            const expected = this._getSolutionLetterAt(r, c);
            const actual = (this.grid[r][c] || '').toUpperCase();
            const td = this.gridManager.cells[`${r},${c}`];
            if (!td) return;

            this._applyCheckState(td, actual, expected);
        });
    },

    handleCheckPuzzle() {
        if (!this._canUsePlayTools()) return;

        Object.values(this.slots).forEach((slot) => {
            slot.positions.forEach(([r, c]) => {
                const expected = this._getSolutionLetterAt(r, c);
                const actual = (this.grid[r][c] || '').toUpperCase();
                const td = this.gridManager.cells[`${r},${c}`];
                if (!td) return;

                this._applyCheckState(td, actual, expected);
            });
        });
    },

    handleRevealSquare() {
        if (!this._canUsePlayTools()) return;

        const selected = this.gridManager.selectedCell;
        if (!selected) return;

        const { r, c } = selected;
        const expected = this._getSolutionLetterAt(r, c);
        if (!expected) return;

        this.grid[r][c] = expected;
        this.syncActiveGridToDOM();
        this._refreshInstantMistakeHighlights();
        this._scheduleRecentPuzzleSave?.();
        this._checkForPuzzleCompletion();
    },

    handleRevealWord() {
        if (!this._canUsePlayTools()) return;

        const slot = this.gridManager._getActiveSlot(this);
        if (!slot) return;

        slot.positions.forEach(([r, c]) => {
            const expected = this._getSolutionLetterAt(r, c);
            if (expected) {
                this.grid[r][c] = expected;
            }
        });

        this.syncActiveGridToDOM();
        this._refreshInstantMistakeHighlights();
        this._scheduleRecentPuzzleSave?.();
        this._checkForPuzzleCompletion();
    },

    handleRevealPuzzle() {
        if (!this._canUsePlayTools()) return;

        this.applySolutionToGrid(this.slots, this.currentSolution);
        this.gridManager._updateHighlights(this);
        this._refreshInstantMistakeHighlights();
        this._scheduleRecentPuzzleSave?.();
        this._checkForPuzzleCompletion();
    },

    handleClearPlayGrid() {
        if (!this.modes.isPlayMode || this.isPlayPaused) return;

        for (let r = 0; r < this.grid.length; r++) {
            for (let c = 0; c < this.grid[0].length; c++) {
                if (this.grid[r][c] !== '#') {
                    this.grid[r][c] = '';
                }
            }
        }

        Object.values(this.gridManager.cells).forEach((td) => {
            td.classList.remove('correct', 'incorrect');
        });

        this.hasCompletedPlayPuzzle = false;
        this.syncActiveGridToDOM();
        this._updatePlayStatusCopy('active');
        this.display.updateStatus('Cleared all entered letters from the play grid.', true);
        this._scheduleRecentPuzzleSave?.();
    },

    toggleInstantMistakeMode() {
        if (!this.modes.isPlayMode || this.hasCompletedPlayPuzzle) return false;

        this.isInstantMistakeMode = !this.isInstantMistakeMode;
        this._updateInstantMistakeUI();
        this._refreshInstantMistakeHighlights();
        this.display.updateStatus(
            `Instant mistake mode ${this.isInstantMistakeMode ? 'enabled' : 'disabled'}.`,
            true
        );
        return this.isInstantMistakeMode;
    },

    jumpToNextEmptyPlayCell() {
        if (!this._canUsePlayTools() || this.hasCompletedPlayPuzzle) return false;

        const nextTarget = this._findNextEmptyPlayCell();
        if (!nextTarget) {
            this.display.updateStatus('No empty cells remain in the puzzle.', true);
            return false;
        }

        this.gridManager.selectedCell = { r: nextTarget.r, c: nextTarget.c };
        this.gridManager.selectedDirection = nextTarget.direction;
        this.gridManager._updateHighlights(this);
        this._syncPlayActiveClue();
        this.display.updateStatus(
            `Moved to the next empty cell in ${nextTarget.slot.number} ${nextTarget.slot.direction}.`,
            true
        );
        return true;
    },

    _stepPlayClue(delta) {
        if (!this.modes.isPlayMode || this.isPlayPaused) return false;

        this.gridManager._jumpToNextWord(this, delta);
        this._syncPlayActiveClue();
        return true;
    },

    selectPreviousPlayClue() {
        return this._stepPlayClue(-1);
    },

    selectNextPlayClue() {
        return this._stepPlayClue(1);
    },

    _syncPlayActiveClue() {
        if (!this.modes.isPlayMode) return;

        const slot = this.gridManager._getActiveSlot(this);
        if (!slot) return;

        this.display.highlightSlotInList(slot.id);
    },

    _clearPlayFeedbackStates() {
        Object.values(this.gridManager?.cells || {}).forEach((td) => {
            td?.classList?.remove('correct', 'incorrect');
        });
    },

    _applyInstantMistakeStateAt(r, c) {
        const td = this.gridManager?.cells?.[`${r},${c}`];
        if (!td) return;

        td.classList.remove('correct', 'incorrect');
        if (!this.isInstantMistakeMode || !this.currentSolution) return;

        const actual = (this.grid?.[r]?.[c] || '').toUpperCase();
        const expected = this._getSolutionLetterAt(r, c);
        if (actual && expected && actual !== expected) {
            td.classList.add('incorrect');
        }
    },

    _refreshInstantMistakeHighlights() {
        this._clearPlayFeedbackStates();
        if (!this.isInstantMistakeMode || !this.modes.isPlayMode || !this.currentSolution) return;

        Object.values(this.slots || {}).forEach((slot) => {
            slot.positions.forEach(([r, c]) => {
                this._applyInstantMistakeStateAt(r, c);
            });
        });
    },

    _updateInstantMistakeUI() {
        const button = document.getElementById('instant-mistake-btn');
        if (!button) return;

        button.textContent = `Mistakes: ${this.isInstantMistakeMode ? 'On' : 'Off'}`;
        button.setAttribute('aria-pressed', String(this.isInstantMistakeMode));
        button.disabled = !this.modes.isPlayMode || this.isPlayPaused || this.hasCompletedPlayPuzzle;
    },

    _findNextEmptyPlayCell() {
        const slots = Object.values(this.slots || {})
            .sort((a, b) => a.number - b.number || a.direction.localeCompare(b.direction));
        if (!slots.length) return null;

        const activeSlot = this.gridManager._getActiveSlot(this);
        if (activeSlot && this.gridManager.selectedCell) {
            const activeIndex = activeSlot.positions.findIndex(
                ([r, c]) => r === this.gridManager.selectedCell.r && c === this.gridManager.selectedCell.c
            );

            for (let i = activeIndex + 1; i < activeSlot.positions.length; i++) {
                const [r, c] = activeSlot.positions[i];
                if (!this.grid[r][c]) {
                    return { r, c, direction: activeSlot.direction, slot: activeSlot };
                }
            }
        }

        const startIndex = activeSlot
            ? slots.findIndex((slot) => slot.id === activeSlot.id)
            : -1;

        for (let step = 1; step <= slots.length; step++) {
            const slot = slots[(startIndex + step + slots.length) % slots.length];
            const emptyPosition = slot.positions.find(([r, c]) => !this.grid[r][c]);
            if (emptyPosition) {
                const [r, c] = emptyPosition;
                return { r, c, direction: slot.direction, slot };
            }
        }

        return null;
    },

    _getSolutionLetterAt(r, c) {
        for (const slotId in this.currentSolution) {
            const slot = this.slots[slotId];
            if (!slot) continue;

            const index = slot.positions.findIndex(
                ([rr, cc]) => rr === r && cc === c
            );

            if (index !== -1) {
                const letter = this.currentSolution[slotId]?.[index] || '';
                return /^[A-Z]$/i.test(letter) ? letter.toUpperCase() : '';
            }
        }

        return '';
    },

    _applyCheckState(td, actual, expected) {
        if (!td) return;

        td.classList.remove('correct', 'incorrect');
        if (!actual) return;

        td.classList.add(actual === expected ? 'correct' : 'incorrect');
    },

    _canUsePlayTools() {
        return this.modes.isPlayMode && this.currentSolution && !this.isPlayPaused;
    },
    ...playSessionMethods
};
