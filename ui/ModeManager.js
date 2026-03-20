// ui/ModeManager.js
export class ModeManager {
    constructor() {
        this.currentMode = 'default';
        this.modes = ['number', 'letter', 'drag'];
        this.isSymmetryEnabled = true; // Default to true as it's standard for crosswords
        this.isPlayMode = false;
    }

    /**
     * Toggles between standard editor modes (letter, number, drag).
     */
    toggle(modeType) {
        // If we are in play mode, we don't allow switching editor modes
        if (this.isPlayMode) return this.currentMode;

        if (this.currentMode === modeType) {
            this.currentMode = 'default';
        } else {
            this.currentMode = modeType;
        }
        this._updateUI();
        return this.currentMode;
    }

    /**
     * Toggles the Play Mode state.
     * This acts as a high-level toggle that hides builder tools and shows game tools.
     */
    togglePlayMode() {
        this.isPlayMode = !this.isPlayMode;
        
        if (this.isPlayMode) {
            this.currentMode = 'play';
        } else {
            this.currentMode = 'default';
        }

        this._updateUI();
        return this.isPlayMode;
    }

    toggleSymmetry() {
        if (this.isPlayMode) return this.isSymmetryEnabled;
        this.isSymmetryEnabled = !this.isSymmetryEnabled;
        this._updateUI();
        return this.isSymmetryEnabled;
    }

    _updateUI() {
        const label = document.getElementById('mode-label');
        if (label) {
            label.textContent = `Mode: ${this.currentMode.charAt(0).toUpperCase() + this.currentMode.slice(1)}`;
        }

        // 1. Update standard editor mode buttons
        this.modes.forEach(m => {
            const btn = document.getElementById(`${m}-entry-button`) || document.getElementById(`${m}-mode-button`);
            if (btn) {
                const isActive = this.currentMode === m;
                btn.style.backgroundColor = isActive ? "#dc3545" : "#0069d9";
                btn.textContent = isActive ? `Exit ${m.charAt(0).toUpperCase() + m.slice(1)} Mode` : `${m.charAt(0).toUpperCase() + m.slice(1)} Mode`;
                
                // Disable editor modes while playing
                btn.disabled = this.isPlayMode;
                btn.style.opacity = this.isPlayMode ? "0.5" : "1";
            }
        });

        // 2. Update Symmetry button
        const symBtn = document.getElementById('symmetry-button');
        if (symBtn) {
            symBtn.style.backgroundColor = this.isSymmetryEnabled ? "#28a745" : "#6c757d";
            symBtn.textContent = `Symmetry: ${this.isSymmetryEnabled ? "ON" : "OFF"}`;
            symBtn.disabled = this.isPlayMode;
        }

        // 3. Update Play Mode Button specifically
        const playBtn = document.getElementById('play-mode-button');
        if (playBtn) {
            playBtn.textContent = this.isPlayMode ? "Exit Play Mode" : "Enter Play Mode";
            playBtn.style.backgroundColor = this.isPlayMode ? "#dc3545" : "#6f42c1";
        }

        // 4. Toggle Visibility of Section Groups
        const builderControls = [
            document.getElementById('solve-crossword-button'),
            document.querySelector('.settings-section'),
            document.querySelector('.word-lookup-section'),
            document.querySelector('.predefined-puzzles-section')
        ];

        const playControls = document.getElementById('play-controls');
        const gameStats = document.getElementById('game-stats');

        if (this.isPlayMode) {
            builderControls.forEach(el => { if (el) el.style.display = 'none'; });
            if (playControls) playControls.style.display = 'flex';
            if (gameStats) gameStats.style.display = 'block';
        } else {
            builderControls.forEach(el => { if (el) el.style.display = 'block'; });
            if (playControls) playControls.style.display = 'none';
            if (gameStats) gameStats.style.display = 'none';
        }
    }
}