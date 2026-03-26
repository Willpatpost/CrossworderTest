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
        if (!this.editorModes.includes(mode)) return this.currentMode;

        this.currentMode = this.currentMode === mode ? 'none' : mode;
        this._updateUI();

        return this.currentMode;
    }

    clearMode() {
        if (this.isPlayMode) return this.currentMode;

        this.currentMode = 'none';
        this._updateUI();

        return this.currentMode;
    }

    /* ===============================
       PLAY MODE
    =============================== */

    setPlayMode(enabled) {
        this.isPlayMode = Boolean(enabled);
        this.currentMode = this.isPlayMode ? 'play' : 'none';

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
       UI UPDATES
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

        let text = 'Default (Toggle Black Squares)';

        if (this.currentMode === 'drag') text = 'Drag';
        if (this.currentMode === 'letter') text = 'Letter';
        if (this.currentMode === 'play') text = 'Play Mode';

        label.textContent = `Mode: ${text}`;
    }

    /* ---------- Mode Buttons ---------- */

    _updateModeButtons() {
        this.editorModes.forEach((mode) => {
            const btn = document.getElementById(`${mode}-mode-button`);
            if (!btn) return;

            const isActive = !this.isPlayMode && this.currentMode === mode;

            btn.classList.toggle('active-mode', isActive);
            btn.setAttribute('aria-pressed', String(isActive));
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
        btn.setAttribute('aria-pressed', String(this.isSymmetryEnabled));
        btn.disabled = this.isPlayMode;
    }

    /* ---------- Global UI States ---------- */

    _updateGlobalStates() {
        document.body.classList.toggle('is-playing', this.isPlayMode);

        this._setDisabled('generate-grid-button', this.isPlayMode);
        this._setDisabled('load-easy-button', this.isPlayMode);
        this._setDisabled('load-medium-button', this.isPlayMode);
        this._setDisabled('load-hard-button', this.isPlayMode);
        this._setDisabled('random-puzzle-button', this.isPlayMode);
        this._setDisabled('rows-input', this.isPlayMode);
        this._setDisabled('columns-input', this.isPlayMode);
        this._setDisabled('auto-number-button', this.isPlayMode);
        this._setDisabled('word-search-input', this.isPlayMode);
        this._setDisabled('allow-reuse-toggle', this.isPlayMode);
        this._setDisabled('visualize-solve-toggle', this.isPlayMode);
        this._setDisabled('solve-crossword-button', this.isPlayMode);

        const cancelSolveBtn = document.getElementById('cancel-solve-button');
        if (cancelSolveBtn) {
            const isVisible = !cancelSolveBtn.classList.contains('hidden');
            cancelSolveBtn.disabled = this.isPlayMode && !isVisible;
        }

        const gameStats = document.getElementById('game-stats');
        if (gameStats) {
            gameStats.classList.toggle('hidden', false);
        }
    }

    _setDisabled(id, disabled) {
        const el = document.getElementById(id);
        if (!el) return;
        el.disabled = disabled;
    }
}