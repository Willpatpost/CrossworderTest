import { GridUtils } from '../../utils/GridUtils.js';

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

        this.modes.setPlayMode(true);
        this.blankGridForPlayMode();
        this.render();
        this.refreshWordList();
        this._resetPlayTimer();
        this._resumePlayTimer();
        this._updateInstantMistakeUI();
        this._updatePauseUI();

        const firstSlot = this._getFirstSlot();
        if (firstSlot) {
            const [r, c] = firstSlot.positions[0];
            this.gridManager.selectedCell = { r, c };
            this.gridManager.selectedDirection = firstSlot.direction;
            this.gridManager._updateHighlights(this);
        }

        this.display.updateStatus('Entered play mode. Good luck!', true);
        this._updatePlayStatusCopy('active');
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
        this._updatePlayStatusCopy('idle');
        this.display.updateStatus('Returned to editor mode.', true);
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
        this._checkForPuzzleCompletion();
    },

    handleRevealPuzzle() {
        if (!this._canUsePlayTools()) return;

        this.applySolutionToGrid(this.slots, this.currentSolution);
        this.gridManager._updateHighlights(this);
        this._refreshInstantMistakeHighlights();
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

    togglePlayPause() {
        if (!this.modes.isPlayMode) return;

        this.isPlayPaused = !this.isPlayPaused;

        if (this.isPlayPaused) {
            this._pausePlayTimer();
            this._updatePlayStatusCopy('paused');
            this.display.updateStatus('Game paused.', true);
        } else {
            this._resumePlayTimer();
            this._updatePlayStatusCopy('active');
            this.display.updateStatus('Game resumed.', true);
        }

        this._updatePauseUI();
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

    _checkForPuzzleCompletion() {
        if (!this.modes.isPlayMode || !this.currentSolution || this.hasCompletedPlayPuzzle) {
            return false;
        }

        const isComplete = Object.values(this.slots || {}).every((slot) => {
            return slot.positions.every(([r, c], index) => {
                const actual = (this.grid[r][c] || '').toUpperCase();
                const expected = this.currentSolution[slot.id]?.[index] || '';
                return expected && actual === expected;
            });
        });

        if (!isComplete) {
            return false;
        }

        this.hasCompletedPlayPuzzle = true;
        this._pausePlayTimer();
        this._updatePauseUI();

        const totalSeconds = Math.max(0, Math.floor(this.playElapsedMs / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const timeLabel = `${minutes}:${String(seconds).padStart(2, '0')}`;

        this.display.updateStatus(`Puzzle complete! Final time: ${timeLabel}.`, true);
        this._updatePlayStatusCopy('completed', timeLabel);
        this.popups.showMessage(
            'Puzzle Complete',
            `You finished the puzzle in ${timeLabel}.`,
            'Play Mode'
        );
        return true;
    },

    _updatePlayStatusCopy(state = 'idle', timeLabel = '') {
        const copy = document.querySelector('.play-status-copy');
        if (!copy) return;

        if (state === 'completed') {
            copy.textContent = `Puzzle finished in ${timeLabel}. Use clue navigation to review the finished grid, or return to the editor to keep building.`;
            return;
        }

        if (state === 'paused') {
            copy.textContent = 'The puzzle is paused. Resume when you are ready to keep solving.';
            return;
        }

        if (state === 'active') {
            copy.textContent =
                `Use the play tools to check or reveal entries while solving.${this.isInstantMistakeMode ? ' Wrong letters are flagged immediately.' : ''} The timer runs until you finish or pause.`;
            return;
        }

        copy.textContent =
            'Use the play tools to check or reveal entries while solving.';
    },

    _pausePlayTimer() {
        if (this.playTimerStartedAt !== null) {
            this.playElapsedMs = Date.now() - this.playTimerStartedAt;
        }

        if (this.playTimerInterval) {
            window.clearInterval(this.playTimerInterval);
            this.playTimerInterval = null;
        }

        this.playTimerStartedAt = null;
        this._updateTimerDisplay();
    },

    _resumePlayTimer() {
        if (!this.modes.isPlayMode || this.isPlayPaused) return;
        if (this.playTimerInterval) return;

        this.playTimerStartedAt = Date.now() - this.playElapsedMs;
        this.playTimerInterval = window.setInterval(() => {
            this.playElapsedMs = Date.now() - this.playTimerStartedAt;
            this._updateTimerDisplay();
        }, 1000);

        this._updateTimerDisplay();
    },

    _resetPlayTimer() {
        if (this.playTimerInterval) {
            window.clearInterval(this.playTimerInterval);
            this.playTimerInterval = null;
        }

        this.playElapsedMs = 0;
        this.playTimerStartedAt = null;
        this._updateTimerDisplay();
    },

    _updateTimerDisplay() {
        const timer = document.getElementById('timer');
        if (!timer) return;

        const totalSeconds = Math.max(0, Math.floor(this.playElapsedMs / 1000));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        timer.textContent = hours > 0
            ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
            : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    },

    _updatePauseUI() {
        const pauseBtn = document.getElementById('pause-btn');
        const overlay = document.getElementById('play-paused-overlay');
        const gridContainer = document.getElementById('play-grid-container');
        const disableWhilePaused = [
            'check-menu-btn',
            'reveal-menu-btn',
            'check-square-btn',
            'check-word-btn',
            'check-puzzle-btn',
            'reveal-square-btn',
            'reveal-word-btn',
            'reveal-puzzle-btn',
            'clear-btn',
            'next-empty-btn',
            'instant-mistake-btn'
        ];

        if (pauseBtn) {
            const isPlaying = this.modes.isPlayMode;
            pauseBtn.disabled = !isPlaying || this.hasCompletedPlayPuzzle;
            pauseBtn.textContent = this.hasCompletedPlayPuzzle ? 'Complete' : (this.isPlayPaused ? 'Resume' : 'Pause');
            pauseBtn.setAttribute(
                'aria-label',
                this.hasCompletedPlayPuzzle ? 'Puzzle complete' : (this.isPlayPaused ? 'Resume game' : 'Pause game')
            );
        }

        if (overlay) {
            overlay.classList.toggle(
                'hidden',
                !(this.modes.isPlayMode && this.isPlayPaused)
            );
        }

        if (gridContainer) {
            gridContainer.classList.toggle('paused-grid', this.isPlayPaused);
        }

        disableWhilePaused.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.disabled = this.isPlayPaused || !this.modes.isPlayMode || this.hasCompletedPlayPuzzle;
        });

        ['previous-clue-button', 'next-clue-button'].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.disabled = this.isPlayPaused || !this.modes.isPlayMode;
        });

        this._updateInstantMistakeUI();
    }
};
