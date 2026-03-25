// ui/ModeManager.js
export class ModeManager {
    constructor() {
        this.currentMode = 'default';
        this.modes = ['number', 'letter', 'drag'];
        this.isSymmetryEnabled = true; 
        this.isPlayMode = false;
    }

    /**
     * Toggles between standard editor modes.
     */
    toggle(modeType) {
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
     * Note: View switching is handled by main.js, 
     * this handles the logic state.
     */
    togglePlayMode() {
        this.isPlayMode = !this.isPlayMode;
        this.currentMode = this.isPlayMode ? 'play' : 'default';
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
        // 1. Update the descriptive mode label
        const label = document.getElementById('mode-label');
        if (label) {
            const displayMode = this.currentMode === 'default' ? 'Toggle Black Squares' : this.currentMode;
            label.textContent = `Mode: ${displayMode.charAt(0).toUpperCase() + displayMode.slice(1)}`;
        }

        // 2. Update Editor Mode Buttons (Drag, Letter, Number)
        this.modes.forEach(m => {
            const btn = document.getElementById(`${m}-entry-button`) || document.getElementById(`${m}-mode-button`);
            if (btn) {
                const isActive = this.currentMode === m;
                // Using classList instead of inline styles for cleaner theme support
                if (isActive) {
                    btn.classList.add('btn-active');
                    btn.style.backgroundColor = "var(--danger)";
                } else {
                    btn.classList.remove('btn-active');
                    btn.style.backgroundColor = "var(--primary)";
                }
                
                btn.disabled = this.isPlayMode;
                btn.style.opacity = this.isPlayMode ? "0.5" : "1";
            }
        });

        // 3. Update Symmetry button
        const symBtn = document.getElementById('symmetry-button');
        if (symBtn) {
            symBtn.style.backgroundColor = this.isSymmetryEnabled ? "var(--success)" : "var(--secondary)";
            symBtn.textContent = `Symmetry: ${this.isSymmetryEnabled ? "ON" : "OFF"}`;
            symBtn.disabled = this.isPlayMode;
            symBtn.style.opacity = this.isPlayMode ? "0.5" : "1";
        }

        // 4. Update Solver Progress / Game Stats Visibility
        const gameStats = document.getElementById('game-stats');
        if (gameStats) {
            // We show stats in both modes now, but differently
            gameStats.classList.toggle('hidden', false); 
        }
    }
}