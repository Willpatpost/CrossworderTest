export const playSessionMethods = {
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
        this._saveRecentPuzzleRecord?.({ silent: true });
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
        this._recordCompletedPuzzle?.(timeLabel);
        this.popups.showMessage(
            'Puzzle Complete',
            `You finished the puzzle in ${timeLabel}.`,
            'Play Mode'
        );
        return true;
    },

    _scheduleRecentPuzzleSave() {
        if (this._recentPuzzleUpdateTimer) {
            window.clearTimeout(this._recentPuzzleUpdateTimer);
        }

        this._recentPuzzleUpdateTimer = window.setTimeout(() => {
            this._recentPuzzleUpdateTimer = null;
            this._saveRecentPuzzleRecord?.({ silent: true });
        }, 180);
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
                `Use the play tools to check or reveal entries while solving.${this.isInstantMistakeMode ? ' Wrong letters are flagged immediately.' : ''} The timer runs until you finish or pause, and clue navigation follows your active selection.`;
            return;
        }

        copy.textContent =
            'Use the play tools to check or reveal entries while solving, or return to the editor if you want to keep constructing.';
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
        const gamePanels = Array.from(
            document.querySelectorAll('#game-container > aside, #game-container > section.grid-panel')
        );
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
            const showOverlay = this.modes.isPlayMode && this.isPlayPaused;
            overlay.classList.toggle('hidden', !showOverlay);
            overlay.setAttribute('aria-hidden', String(!showOverlay));
        }

        if (gridContainer) {
            gridContainer.classList.toggle('paused-grid', this.isPlayPaused);
        }

        gamePanels.forEach((panel) => {
            if (this.modes.isPlayMode && this.isPlayPaused) {
                panel.setAttribute('aria-hidden', 'true');
                panel.inert = true;
            } else {
                panel.removeAttribute('aria-hidden');
                panel.inert = false;
            }
        });

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
