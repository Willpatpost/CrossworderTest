const DISABLED_IN_PLAY_MODE = [
    'generate-grid-button',
    'load-easy-button',
    'load-medium-button',
    'load-hard-button',
    'random-puzzle-button',
    'rows-input',
    'columns-input',
    'auto-number-button',
    'undo-button',
    'redo-button',
    'save-draft-button',
    'load-draft-button',
    'clear-draft-button',
    'clear-letters-button',
    'clear-blocks-button',
    'clear-grid-button',
    'clear-row-button',
    'clear-column-button',
    'editor-clue-input',
    'save-clue-button',
    'clear-clue-button',
    'export-puzzle-button',
    'import-puzzle-button',
    'word-search-input',
    'word-search-mode',
    'allow-reuse-toggle',
    'deterministic-solve-toggle',
    'visualize-solve-toggle',
    'visualize-speed-select',
    'theme-entries-input',
    'solve-crossword-button',
    'solve-selected-word-button',
    'suggest-fill-button',
    'blacklist-entry-button'
];

export class ModeUiController {
    update(state) {
        this._updateModeLabel(state);
        this._updateModeButtons(state);
        this._updateSymmetryButton(state);
        this._updateGlobalStates(state);
    }

    _updateModeLabel({ currentMode }) {
        const label = document.getElementById('mode-label');
        if (!label) return;

        let text = 'Default (Toggle Black Squares)';
        if (currentMode === 'drag') text = 'Drag';
        if (currentMode === 'letter') text = 'Letter';
        if (currentMode === 'play') text = 'Play Mode';

        label.textContent = `Mode: ${text}`;
    }

    _updateModeButtons({ editorModes, isPlayMode, currentMode }) {
        editorModes.forEach((mode) => {
            const btn = document.getElementById(`${mode}-mode-button`);
            if (!btn) return;

            const isActive = !isPlayMode && currentMode === mode;
            btn.classList.toggle('active-mode', isActive);
            btn.setAttribute('aria-pressed', String(isActive));
            btn.disabled = isPlayMode;
        });
    }

    _updateSymmetryButton({ isSymmetryEnabled, isPlayMode }) {
        const btn = document.getElementById('symmetry-button');
        if (!btn) return;

        btn.textContent = `Symmetry: ${isSymmetryEnabled ? 'ON' : 'OFF'}`;
        btn.classList.toggle('symmetry-on', isSymmetryEnabled);
        btn.classList.toggle('symmetry-off', !isSymmetryEnabled);
        btn.setAttribute('aria-pressed', String(isSymmetryEnabled));
        btn.disabled = isPlayMode;
    }

    _updateGlobalStates({ isPlayMode }) {
        document.body.classList.toggle('is-playing', isPlayMode);

        DISABLED_IN_PLAY_MODE.forEach((id) => {
            const el = document.getElementById(id);
            if (el) {
                el.disabled = isPlayMode;
            }
        });

        const cancelSolveBtn = document.getElementById('cancel-solve-button');
        if (cancelSolveBtn) {
            const isVisible = !cancelSolveBtn.classList.contains('hidden');
            cancelSolveBtn.disabled = isPlayMode && !isVisible;
        }
    }
}
