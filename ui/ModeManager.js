import { ModeUiController } from './ModeUiController.js';

export class ModeManager {
    constructor() {
        this.currentMode = 'none'; // none | drag | letter | play
        this.editorModes = ['drag', 'letter'];

        this.isSymmetryEnabled = true;
        this.isPlayMode = false;
        this.ui = new ModeUiController();
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
        this.ui.update({
            currentMode: this.currentMode,
            editorModes: this.editorModes,
            isSymmetryEnabled: this.isSymmetryEnabled,
            isPlayMode: this.isPlayMode
        });
    }
}
