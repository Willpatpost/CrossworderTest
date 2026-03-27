import { GridUtils } from '../../utils/GridUtils.js';

export const playMethods = {
    enterPlayMode() {
        if (this.isSolving) {
            this.abortActiveSolve();
        }

        if (!this.currentSolution) {
            const extractedSolution = this.extractSolutionFromGrid({ requireComplete: true });
            if (!extractedSolution) {
                this.display.updateStatus(
                    'Play mode requires a fully solved grid or imported puzzle.',
                    true
                );
                return false;
            }

            this.currentSolution = extractedSolution;
        }

        this.editorGridSnapshot = GridUtils.cloneGrid(this.grid);
        this.isPlayPaused = false;

        this.modes.setPlayMode(true);
        this.blankGridForPlayMode();
        this.render();
        this.refreshWordList();
        this._resetPlayTimer();
        this._resumePlayTimer();
        this._updatePauseUI();

        const firstSlot = this._getFirstSlot();
        if (firstSlot) {
            const [r, c] = firstSlot.positions[0];
            this.gridManager.selectedCell = { r, c };
            this.gridManager.selectedDirection = firstSlot.direction;
            this.gridManager._updateHighlights(this);
        }

        this.display.updateStatus('Entered play mode. Good luck!', true);
        return true;
    },

    exitPlayMode() {
        if (this.isSolving) {
            this.abortActiveSolve();
        }

        this._pausePlayTimer();
        this._resetPlayTimer();
        this.isPlayPaused = false;
        this.modes.setPlayMode(false);

        if (this.editorGridSnapshot?.length) {
            this.grid = GridUtils.cloneGrid(this.editorGridSnapshot);
        }

        this.editorGridSnapshot = null;
        this.render();
        this.refreshWordList();
        this._updatePauseUI();
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
    },

    handleRevealPuzzle() {
        if (!this._canUsePlayTools()) return;

        this.applySolutionToGrid(this.slots, this.currentSolution);
        this.gridManager._updateHighlights(this);
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

        this.syncActiveGridToDOM();
    },

    togglePlayPause() {
        if (!this.modes.isPlayMode) return;

        this.isPlayPaused = !this.isPlayPaused;

        if (this.isPlayPaused) {
            this._pausePlayTimer();
            this.display.updateStatus('Game paused.', true);
        } else {
            this._resumePlayTimer();
            this.display.updateStatus('Game resumed.', true);
        }

        this._updatePauseUI();
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
            'clear-btn'
        ];

        if (pauseBtn) {
            const isPlaying = this.modes.isPlayMode;
            pauseBtn.disabled = !isPlaying;
            pauseBtn.textContent = this.isPlayPaused ? 'Resume' : 'Pause';
            pauseBtn.setAttribute('aria-label', this.isPlayPaused ? 'Resume game' : 'Pause game');
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
            el.disabled = this.isPlayPaused || !this.modes.isPlayMode;
        });
    }
};
