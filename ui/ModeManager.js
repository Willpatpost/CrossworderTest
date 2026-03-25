// ui/ModeManager.js

export class ModeManager {
    constructor() {
        this.currentMode = 'none'; // none | drag | letter | play
        this.editorModes = ['drag', 'letter'];

        this.isSymmetryEnabled = true;
        this.isPlayMode = false;
    }

    /* ===============================
       MODE SWITCHING
    =============================== */

    setMode(mode) {
        if (this.isPlayMode) return this.currentMode;

        // Toggle behavior
        this.currentMode = (this.currentMode === mode) ? 'none' : mode;

        this._updateUI();
        return this.currentMode;
    }

    /* ===============================
       PLAY MODE
    =============================== */

    setPlayMode(enabled) {
        this.isPlayMode = enabled;
        this.currentMode = enabled ? 'play' : 'none';

        this._updateUI();
        return this.isPlayMode;
    }

    togglePlayMode() {
        return this.setPlayMode(!this.isPlayMode);
    }

    /* ===============================
       SYMMETRY
    =============================== */

    toggleSymmetry() {
        if (this.isPlayMode) return this.isSymmetryEnabled;

        this.isSymmetryEnabled = !this.isSymmetryEnabled;
        this._updateUI();

        return this.isSymmetryEnabled;
    }

    /* ===============================
       UI UPDATES (CLEAN + CLASS-BASED)
    =============================== */

    _updateUI() {
        this._updateModeLabel();
        this._updateModeButtons();
        this._updateSymmetryButton();
        this._updateGlobalStates();
    }

    /* ---------- Mode Label ---------- */

    _updateModeLabel() {
        const label = document.getElementById('mode-label');
        if (!label) return;

        let text = 'Toggle Black Squares';

        if (this.currentMode === 'drag') text = 'Drag';
        if (this.currentMode === 'letter') text = 'Letter';
        if (this.currentMode === 'play') text = 'Play Mode';

        label.textContent = `Mode: ${text}`;
    }

    /* ---------- Mode Buttons ---------- */

    _updateModeButtons() {
        this.editorModes.forEach(mode => {
            const btn = document.getElementById(`${mode}-mode-button`);
            if (!btn) return;

            const isActive = this.currentMode === mode;

            btn.classList.toggle('active-mode', isActive);
            btn.disabled = this.isPlayMode;
        });
    }

    /* ---------- Symmetry ---------- */

    _updateSymmetryButton() {
        const btn = document.getElementById('symmetry-button');
        if (!btn) return;

        btn.textContent = `Symmetry: ${this.isSymmetryEnabled ? 'ON' : 'OFF'}`;

        btn.classList.toggle('symmetry-on', this.isSymmetryEnabled);
        btn.classList.toggle('symmetry-off', !this.isSymmetryEnabled);

        btn.disabled = this.isPlayMode;
    }

    /* ---------- Global UI States ---------- */

    _updateGlobalStates() {
        document.body.classList.toggle('is-playing', this.isPlayMode);

        // Optional: dim editor controls during play
        const editorControls = document.querySelectorAll('#editor-screen .btn');
        editorControls.forEach(btn => {
            btn.disabled = this.isPlayMode;
        });

        // Solver stats always visible now (clean behavior)
        const gameStats = document.getElementById('game-stats');
        if (gameStats) {
            gameStats.classList.remove('hidden');
        }
    }
}