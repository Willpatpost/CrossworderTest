import test from 'node:test';
import assert from 'node:assert/strict';
import { CrosswordApp } from '../app/CrosswordApp.js';
import { editorMethods } from '../app/features/editor.js';
import { navigationMethods } from '../app/features/navigation.js';
import { puzzleMethods } from '../app/features/puzzles.js';
import { playMethods } from '../app/features/play.js';
import { playSessionMethods } from '../app/features/playSession.js';
import { renderingMethods } from '../app/features/rendering.js';
import { solverMethods } from '../app/features/solver.js';
import { GridManager } from '../grid/GridManager.js';
import { DisplayManager } from '../ui/DisplayManager.js';
import { ModeManager } from '../ui/ModeManager.js';

test('puzzle clue extraction maps mixed clue formats onto slot ids', () => {
    const app = {
        slots: {
            '1-across': { id: '1-across', direction: 'across', number: 1 },
            '3-across': { id: '3-across', direction: 'across', number: 3 },
            '1-down': { id: '1-down', direction: 'down', number: 1 },
            '2-down': { id: '2-down', direction: 'down', number: 2 }
        },
        _mapDirectionalClues: puzzleMethods._mapDirectionalClues,
        _normalizePuzzleClueEntry: puzzleMethods._normalizePuzzleClueEntry,
        _extractClueText: puzzleMethods._extractClueText,
        _extractClueNumber: puzzleMethods._extractClueNumber
    };

    const clues = puzzleMethods._extractPuzzleClues.call(app, {
        clues: {
            across: [
                '1. First across',
                { clue: 'Second across clue', number: 3 }
            ],
            down: {
                '1': 'First down',
                '2-down': { text: 'Second down clue' }
            }
        }
    });

    assert.deepEqual(clues, {
        '1-across': 'First across',
        '3-across': 'Second across clue',
        '1-down': 'First down',
        '2-down': 'Second down clue'
    });
});

test('CrosswordApp exposes aliased state through structured state slices', () => {
    const originalDocument = globalThis.document;
    globalThis.document = {
        getElementById() {
            return null;
        }
    };

    try {
        const app = new CrosswordApp();

        app.grid = [['A']];
        app.currentPuzzleMetadata = { title: 'Slice Test' };
        app.isPlayPaused = true;

        assert.deepEqual(app.workspaceState.grid, [['A']]);
        assert.deepEqual(app.workspaceState.currentPuzzleMetadata, { title: 'Slice Test' });
        assert.equal(app.playState.isPaused, true);

        app.solverState.isSolving = true;
        assert.equal(app.isSolving, true);
    } finally {
        globalThis.document = originalDocument;
    }
});

test('ModeManager setPlayMode updates play state and current mode', () => {
    const manager = new ModeManager();
    let updatedState = null;
    manager.ui = {
        update(state) {
            updatedState = state;
        }
    };

    const enabled = manager.setPlayMode(true);

    assert.equal(enabled, true);
    assert.equal(manager.isPlayMode, true);
    assert.equal(manager.currentMode, 'play');
    assert.equal(updatedState.isPlayMode, true);
    assert.equal(updatedState.currentMode, 'play');
});

test('navigation switchView exits play mode when leaving the play screen', () => {
    const originalDocument = globalThis.document;
    const events = [];
    const homeSection = {
        id: 'home-screen',
        classList: { toggle() {} },
        setAttribute() {},
        querySelector() {
            return null;
        }
    };
    const playSection = {
        id: 'play-screen',
        classList: { toggle() {} },
        setAttribute() {},
        querySelector() {
            return null;
        }
    };
    const homeButton = {
        dataset: { target: 'home-screen' },
        classList: { toggle() {} },
        setAttribute() {}
    };
    const playButton = {
        dataset: { target: 'play-screen' },
        classList: { toggle() {} },
        setAttribute() {}
    };

    globalThis.document = {
        dispatchEvent(event) {
            events.push(event.type);
        },
        getElementById(id) {
            if (id === 'home-screen') return homeSection;
            if (id === 'play-screen') return playSection;
            return null;
        }
    };

    try {
        let exited = 0;
        const app = {
            modes: { isPlayMode: true },
            _navButtons: [homeButton, playButton],
            _viewSections: [homeSection, playSection],
            exitPlayMode() {
                exited++;
                this.modes.isPlayMode = false;
            },
            _updateNavigationState: navigationMethods._updateNavigationState,
            _updateViewState: navigationMethods._updateViewState
        };

        const switched = navigationMethods.switchView.call(app, 'home-screen');

        assert.equal(switched, true);
        assert.equal(exited, 1);
        assert.deepEqual(events, ['crossworder:close-play-menus']);
        assert.equal(app.modes.isPlayMode, false);
    } finally {
        globalThis.document = originalDocument;
    }
});

test('navigation switchView aborts play navigation when play mode cannot be entered', () => {
    const originalDocument = globalThis.document;
    const events = [];
    globalThis.document = {
        dispatchEvent(event) {
            events.push(event.type);
        }
    };

    try {
        let updated = false;
        const app = {
            modes: { isPlayMode: false },
            enterPlayMode() {
                return false;
            },
            _updateNavigationState() {
                updated = true;
            },
            _updateViewState() {
                updated = true;
            }
        };

        const switched = navigationMethods.switchView.call(app, 'play-screen');

        assert.equal(switched, false);
        assert.equal(updated, false);
        assert.deepEqual(events, ['crossworder:close-play-menus']);
    } finally {
        globalThis.document = originalDocument;
    }
});

test('puzzle clue extraction falls back to slot order for unnumbered entries', () => {
    const app = {
        slots: {
            '4-across': { id: '4-across', direction: 'across', number: 4 },
            '7-across': { id: '7-across', direction: 'across', number: 7 }
        },
        _mapDirectionalClues: puzzleMethods._mapDirectionalClues,
        _normalizePuzzleClueEntry: puzzleMethods._normalizePuzzleClueEntry,
        _extractClueText: puzzleMethods._extractClueText,
        _extractClueNumber: puzzleMethods._extractClueNumber
    };

    const clues = puzzleMethods._extractPuzzleClues.call(app, {
        across: ['Unnumbered first', 'Unnumbered second']
    });

    assert.deepEqual(clues, {
        '4-across': 'Unnumbered first',
        '7-across': 'Unnumbered second'
    });
});

test('puzzle clue normalization reads clue text and numbers from alternate object fields', () => {
    const normalized = puzzleMethods._normalizePuzzleClueEntry(
        {
            label: 'Alternate clue text',
            id: '17-down'
        },
        'down'
    );

    assert.deepEqual(normalized, {
        slotId: '17-down',
        clue: 'Alternate clue text'
    });
});

test('puzzle clue extraction ignores entries with no usable text', () => {
    const app = {
        slots: {
            '1-across': { id: '1-across', direction: 'across', number: 1 }
        },
        _mapDirectionalClues: puzzleMethods._mapDirectionalClues,
        _normalizePuzzleClueEntry: puzzleMethods._normalizePuzzleClueEntry,
        _extractClueText: puzzleMethods._extractClueText,
        _extractClueNumber: puzzleMethods._extractClueNumber
    };

    const clues = puzzleMethods._extractPuzzleClues.call(app, {
        clues: {
            across: [{ number: 1, clue: '   ' }]
        }
    });

    assert.deepEqual(clues, {});
});

test('enterPlayMode snapshots the editor grid and exitPlayMode restores it', () => {
    const originalDocument = globalThis.document;
    globalThis.document = {
        querySelector() {
            return null;
        }
    };

    const app = {
        isSolving: false,
        currentSolution: { '1-across': 'CAT' },
        grid: [['C', 'A', 'T'], ['#', '', '']],
        slots: {
            '1-across': {
                id: '1-across',
                direction: 'across',
                positions: [[0, 0], [0, 1], [0, 2]]
            }
        },
        gridManager: {
            selectedCell: null,
            selectedDirection: 'across',
            _updateHighlights() {}
        },
        display: {
            updateStatus() {}
        },
        modes: {
            isPlayMode: false,
            setPlayMode(enabled) {
                this.isPlayMode = enabled;
            }
        },
        popups: {
            showMessage() {}
        },
        render() {},
        refreshWordList() {},
        _resetPlayTimer() {},
        _resumePlayTimer() {},
        _pausePlayTimer() {},
        _updateInstantMistakeUI() {},
        _updatePauseUI() {},
        _getFirstSlot() {
            return app.slots['1-across'];
        },
        blankGridForPlayMode: playMethods.blankGridForPlayMode,
        extractSolutionFromGrid: playMethods.extractSolutionFromGrid,
        _updatePlayStatusCopy() {}
    };

    try {
        const entered = playMethods.enterPlayMode.call(app);
        assert.equal(entered, true);
        assert.deepEqual(app.editorGridSnapshot, [['C', 'A', 'T'], ['#', '', '']]);
        assert.deepEqual(app.grid, [['', '', ''], ['#', '', '']]);
        assert.equal(app.modes.isPlayMode, true);

        app.grid[0][0] = 'X';
        playMethods.exitPlayMode.call(app);

        assert.equal(app.modes.isPlayMode, false);
        assert.deepEqual(app.grid, [['C', 'A', 'T'], ['#', '', '']]);
        assert.equal(app.editorGridSnapshot, null);
    } finally {
        globalThis.document = originalDocument;
    }
});

test('abortActiveSolve cancels the active session, stops the worker, and syncs the grid on manual cancel', () => {
    let rejectedMessage = '';
    let terminated = false;
    let synced = false;
    let solvingFlag = null;

    const app = {
        activeSolveSession: {
            settled: false,
            reject(error) {
                rejectedMessage = error.message;
            }
        },
        activeWorker: {
            terminate() {
                terminated = true;
            }
        },
        isSolving: true,
        display: {
            updateStatus() {}
        },
        syncActiveGridToDOM() {
            synced = true;
        },
        _updateSolveControls(isSolving) {
            solvingFlag = isSolving;
            this.isSolving = isSolving;
        }
    };

    CrosswordApp.prototype.abortActiveSolve.call(app, true);

    assert.equal(rejectedMessage, 'SOLVE_CANCELLED');
    assert.equal(terminated, true);
    assert.equal(synced, true);
    assert.equal(solvingFlag, false);
    assert.equal(app.activeSolveSession, null);
    assert.equal(app.activeWorker, null);
});

test('paintCell mirrors block edits across the grid when symmetry is enabled', () => {
    let refreshCount = 0;
    const app = {
        grid: [
            ['', '', ''],
            ['', '', ''],
            ['', '', '']
        ],
        modes: {
            isSymmetryEnabled: true
        },
        currentSolution: { '1-across': 'CAT' },
        currentPuzzleClues: { '1-across': 'Clue' },
        _isInBounds(r, c) {
            return r >= 0 && c >= 0 && r < 3 && c < 3;
        },
        _recordEditorSnapshot() {},
        rebuildGridState() {},
        syncActiveGridToDOM() {},
        refreshWordList() {
            refreshCount++;
        }
    };

    editorMethods.paintCell.call(app, 0, 1, '#');

    assert.equal(app.grid[0][1], '#');
    assert.equal(app.grid[2][1], '#');
    assert.equal(app.currentSolution, null);
    assert.deepEqual(app.currentPuzzleClues, {});
    assert.equal(refreshCount, 1);
});

test('paintCell handles the center cell once on odd-sized symmetric grids', () => {
    let rebuilds = 0;
    const app = {
        grid: [
            ['', '', ''],
            ['', '', ''],
            ['', '', '']
        ],
        modes: {
            isSymmetryEnabled: true
        },
        currentSolution: null,
        currentPuzzleClues: {},
        _isInBounds(r, c) {
            return r >= 0 && c >= 0 && r < 3 && c < 3;
        },
        _recordEditorSnapshot() {},
        rebuildGridState() {
            rebuilds++;
        },
        syncActiveGridToDOM() {},
        refreshWordList() {}
    };

    editorMethods.paintCell.call(app, 1, 1, '#');
    editorMethods.paintCell.call(app, 1, 1, '');

    assert.equal(app.grid[1][1], '');
    assert.equal(rebuilds, 2);
});

test('setEditorSelection selects a letter-mode cell and toggles direction on repeat selection', () => {
    let highlightCount = 0;

    const app = {
        grid: [['', '']],
        slots: {
            '1-across': {
                id: '1-across',
                direction: 'across',
                positions: [[0, 0], [0, 1]]
            }
        },
        gridManager: {
            selectedCell: null,
            selectedDirection: 'across',
            _updateHighlights() {
                highlightCount++;
            }
        },
        display: {
            updateStatus() {}
        },
        _isInBounds(r, c) {
            return r >= 0 && c >= 0 && r < 1 && c < 2;
        }
    };

    editorMethods.setEditorSelection.call(app, 0, 0);
    editorMethods.setEditorSelection.call(app, 0, 0);

    assert.deepEqual(app.gridManager.selectedCell, { r: 0, c: 0 });
    assert.equal(app.gridManager.selectedDirection, 'down');
    assert.equal(highlightCount, 2);
});

test('editor backspace clears the previous cell when the current one is already empty', () => {
    let movedBackward = 0;
    let highlightCount = 0;

    const app = {
        grid: [['A', '']],
        currentSolution: { '1-across': 'AB' },
        gridManager: {
            selectedCell: { r: 0, c: 1 },
            _moveWithinWord(delta) {
                movedBackward = delta;
                this.selectedCell = { r: 0, c: 0 };
            },
            _updateHighlights() {
                highlightCount++;
            }
        },
        _isInBounds(r, c) {
            return r >= 0 && c >= 0 && r < 1 && c < 2;
        },
        _recordEditorSnapshot() {},
        rebuildGridState() {},
        syncActiveGridToDOM() {},
        refreshWordList() {},
        _finalizeEditorLetterChange: editorMethods._finalizeEditorLetterChange
    };

    editorMethods.handleEditorBackspace.call(app);

    assert.equal(movedBackward, -1);
    assert.equal(app.grid[0][0], '');
    assert.equal(app.currentSolution, null);
    assert.equal(highlightCount, 1);
});

test('editor letter entry jumps to the next word after filling the end of the current word', () => {
    let movedForward = 0;
    let jumpedForward = 0;

    const app = {
        grid: [['A', '']],
        currentSolution: { '1-across': 'AB' },
        currentPuzzleClues: { '1-across': 'Clue' },
        gridManager: {
            selectedCell: { r: 0, c: 1 },
            _moveWithinWord(delta) {
                movedForward = delta;
            },
            _jumpToNextWord(_coordinator, delta) {
                jumpedForward = delta;
            }
        },
        _isInBounds(r, c) {
            return r >= 0 && c >= 0 && r < 1 && c < 2;
        },
        _recordEditorSnapshot() {},
        rebuildGridState() {},
        syncActiveGridToDOM() {},
        refreshWordList() {},
        _finalizeEditorLetterChange: editorMethods._finalizeEditorLetterChange,
        _scheduleEditorAutosave() {}
    };

    editorMethods.handleEditorLetterInput.call(app, 'T');

    assert.equal(app.grid[0][1], 'T');
    assert.equal(movedForward, 1);
    assert.equal(jumpedForward, 1);
    assert.equal(app.currentSolution, null);
});

test('editor key handling uses tab to jump between words', () => {
    const originalWindow = globalThis.window;
    const listeners = new Map();
    let jumpDelta = 0;
    let prevented = false;

    globalThis.window = {
        addEventListener(type, handler) {
            listeners.set(type, handler);
        },
        removeEventListener(type) {
            listeners.delete(type);
        }
    };

    try {
        const manager = new GridManager();
        manager.selectedCell = { r: 0, c: 0 };
        manager._jumpToNextWord = (_coordinator, delta) => {
            jumpDelta = delta;
        };

        manager._setupGlobalListeners({
            modes: { isPlayMode: false, currentMode: 'letter' }
        });

        const keydown = listeners.get('keydown');
        keydown({
            key: 'Tab',
            shiftKey: true,
            metaKey: false,
            ctrlKey: false,
            altKey: false,
            target: {},
            preventDefault() {
                prevented = true;
            }
        });

        assert.equal(jumpDelta, -1);
        assert.equal(prevented, true);
    } finally {
        globalThis.window = originalWindow;
    }
});

test('saveSelectedEditorClue stores clue text for the selected slot', () => {
    const originalDocument = globalThis.document;
    const statuses = [];
    let snapshotCount = 0;
    let refreshed = 0;
    let autosaved = 0;

    globalThis.document = {
        getElementById(id) {
            if (id === 'editor-clue-input') {
                return { value: 'A feline friend' };
            }
            return null;
        }
    };

    try {
        const app = {
            modes: { isPlayMode: false },
            currentPuzzleClues: {},
            display: {
                updateStatus(message) {
                    statuses.push(message);
                }
            },
            _getSelectedEditorSlot() {
                return { id: '1-across', number: 1, direction: 'across', length: 3 };
            },
            _recordEditorSnapshot() {
                snapshotCount++;
            },
            refreshWordList() {
                refreshed++;
            },
            updateEditorClueComposer() {},
            _updateDraftButtons() {},
            _scheduleEditorAutosave() {
                autosaved++;
            }
        };

        const saved = editorMethods.saveSelectedEditorClue.call(app);

        assert.equal(saved, true);
        assert.equal(snapshotCount, 1);
        assert.equal(refreshed, 1);
        assert.equal(autosaved, 1);
        assert.deepEqual(app.currentPuzzleClues, { '1-across': 'A feline friend' });
        assert.match(statuses.at(-1), /Saved a clue for 1 across/);
    } finally {
        globalThis.document = originalDocument;
    }
});

test('updatePuzzleMetadataFromInputs stores editor metadata and schedules autosave', () => {
    const originalDocument = globalThis.document;
    const statuses = [];
    let snapshotCount = 0;
    let autosaved = 0;

    globalThis.document = {
        getElementById(id) {
            const values = {
                'puzzle-title-input': { value: 'Mini Theme' },
                'puzzle-author-input': { value: 'Will' },
                'puzzle-difficulty-input': { value: 'Medium' },
                'puzzle-tags-input': { value: 'mini, theme' },
                'puzzle-copyright-input': { value: 'Copyright 2026' },
                'puzzle-source-url-input': { value: 'https://example.com/puzzle' },
                'puzzle-notes-input': { value: 'Theme entries included.' }
            };
            return values[id] || null;
        }
    };

    try {
        const app = {
            modes: { isPlayMode: false },
            currentPuzzleMetadata: {},
            display: {
                updateStatus(message) {
                    statuses.push(message);
                }
            },
            _recordEditorSnapshot() {
                snapshotCount++;
            },
            _updateDraftButtons() {},
            _scheduleEditorAutosave() {
                autosaved++;
            }
        };

        const updated = editorMethods.updatePuzzleMetadataFromInputs.call(app);

        assert.equal(updated, true);
        assert.equal(snapshotCount, 1);
        assert.equal(autosaved, 1);
        assert.deepEqual(app.currentPuzzleMetadata, {
            title: 'Mini Theme',
            author: 'Will',
            difficulty: 'Medium',
            tags: 'mini, theme',
            copyright: 'Copyright 2026',
            sourceUrl: 'https://example.com/puzzle',
            notes: 'Theme entries included.'
        });
        assert.match(statuses.at(-1), /Updated puzzle metadata/);
    } finally {
        globalThis.document = originalDocument;
    }
});

test('clearSelectedEditorClue removes the authored clue for the selected slot', () => {
    const statuses = [];
    let snapshotCount = 0;
    let refreshed = 0;

    const app = {
        modes: { isPlayMode: false },
        currentPuzzleClues: { '1-across': 'Old clue' },
        display: {
            updateStatus(message) {
                statuses.push(message);
            }
        },
        _getSelectedEditorSlot() {
            return { id: '1-across', number: 1, direction: 'across', length: 3 };
        },
        _recordEditorSnapshot() {
            snapshotCount++;
        },
        refreshWordList() {
            refreshed++;
        },
        updateEditorClueComposer() {},
        _updateDraftButtons() {},
        _scheduleEditorAutosave() {}
    };

    const cleared = editorMethods.clearSelectedEditorClue.call(app);

    assert.equal(cleared, true);
    assert.equal(snapshotCount, 1);
    assert.equal(refreshed, 1);
    assert.deepEqual(app.currentPuzzleClues, {});
    assert.match(statuses.at(-1), /Cleared the clue for 1 across/);
});

test('undoEditorChange restores the previous editor snapshot and queues redo state', () => {
    const statuses = [];
    let restored = null;

    const app = {
        modes: { isPlayMode: false },
        isSolving: false,
        editorHistory: [
            {
                grid: [['A']],
                currentSolution: { '1-across': 'A' },
                currentPuzzleClues: { '1-across': 'Clue' },
                selectedCell: { r: 0, c: 0 },
                selectedDirection: 'across'
            }
        ],
        editorFuture: [],
        grid: [['B']],
        currentSolution: null,
        currentPuzzleClues: {},
        gridManager: {
            selectedCell: { r: 0, c: 0 },
            selectedDirection: 'down'
        },
        display: {
            updateStatus(message) {
                statuses.push(message);
            }
        },
        _captureEditorState: editorMethods._captureEditorState,
        _restoreEditorState(state) {
            restored = state;
        }
    };

    editorMethods.undoEditorChange.call(app);

    assert.deepEqual(restored.grid, [['A']]);
    assert.equal(app.editorHistory.length, 0);
    assert.equal(app.editorFuture.length, 1);
    assert.match(statuses.at(-1), /Undid the last editor change/);
});

test('redoEditorChange restores the queued future snapshot', () => {
    const statuses = [];
    let restored = null;

    const app = {
        modes: { isPlayMode: false },
        isSolving: false,
        editorHistory: [],
        editorFuture: [
            {
                grid: [['B']],
                currentSolution: null,
                currentPuzzleClues: {},
                selectedCell: { r: 0, c: 0 },
                selectedDirection: 'down'
            }
        ],
        grid: [['A']],
        currentSolution: { '1-across': 'A' },
        currentPuzzleClues: { '1-across': 'Clue' },
        gridManager: {
            selectedCell: { r: 0, c: 0 },
            selectedDirection: 'across'
        },
        display: {
            updateStatus(message) {
                statuses.push(message);
            }
        },
        _captureEditorState: editorMethods._captureEditorState,
        _restoreEditorState(state) {
            restored = state;
        }
    };

    editorMethods.redoEditorChange.call(app);

    assert.deepEqual(restored.grid, [['B']]);
    assert.equal(app.editorHistory.length, 1);
    assert.equal(app.editorFuture.length, 0);
    assert.match(statuses.at(-1), /Redid the last editor change/);
});

test('saveEditorDraft writes the current editor state to local storage', () => {
    const originalLocalStorage = globalThis.localStorage;
    const originalDocument = globalThis.document;
    let storedKey = '';
    let storedValue = '';

    globalThis.localStorage = {
        setItem(key, value) {
            storedKey = key;
            storedValue = value;
        },
        getItem() {
            return storedValue;
        },
        removeItem() {}
    };

    globalThis.document = {
        getElementById() {
            return null;
        }
    };

    const app = {
        modes: { isPlayMode: false },
        grid: [['A', 'T']],
        currentSolution: { '1-across': 'AT' },
        currentPuzzleClues: { '1-across': 'Clue' },
        gridManager: {
            selectedCell: { r: 0, c: 0 },
            selectedDirection: 'across'
        },
        display: {
            updateStatus() {}
        },
        _captureEditorState: editorMethods._captureEditorState,
        _getEditorDraftStorageKey: editorMethods._getEditorDraftStorageKey,
        _updateDraftButtons() {}
    };

    try {
        const saved = editorMethods.saveEditorDraft.call(app);
        const payload = JSON.parse(storedValue);

        assert.equal(saved, true);
        assert.equal(storedKey, 'crossworder.editor.draft');
        assert.deepEqual(payload.grid, [['A', 'T']]);
        assert.deepEqual(payload.currentPuzzleClues, { '1-across': 'Clue' });
    } finally {
        globalThis.localStorage = originalLocalStorage;
        globalThis.document = originalDocument;
    }
});

test('saveRecentPuzzleRecord stores the current workspace snapshot locally', () => {
    const originalLocalStorage = globalThis.localStorage;
    const originalDocument = globalThis.document;
    const storage = new Map();

    globalThis.localStorage = {
        getItem(key) {
            return storage.has(key) ? storage.get(key) : null;
        },
        setItem(key, value) {
            storage.set(key, value);
        },
        removeItem(key) {
            storage.delete(key);
        }
    };

    globalThis.document = {
        getElementById() {
            return null;
        }
    };

    const app = {
        grid: [['A', 'T']],
        modes: { isPlayMode: false },
        currentPuzzleClues: { '1-across': 'Clue' },
        currentPuzzleMetadata: { title: 'Recent Puzzle', author: 'Constructor' },
        currentSolution: { '1-across': 'AT' },
        activePuzzleSource: { kind: 'bundled', id: 'easy.json', label: 'Easy puzzle' },
        slotBlacklist: { '1-across': ['AX'] },
        _getRecentPuzzleStorageKey: puzzleMethods._getRecentPuzzleStorageKey,
        _captureRecentPuzzleRecord: puzzleMethods._captureRecentPuzzleRecord,
        _updateRecentPuzzleUI() {}
    };

    try {
        const saved = puzzleMethods._saveRecentPuzzleRecord.call(app, { silent: true });
        const payload = JSON.parse(storage.get('crossworder.recentPuzzle'));

        assert.equal(saved, true);
        assert.deepEqual(payload.editorGrid, [['A', 'T']]);
        assert.deepEqual(payload.currentPuzzleMetadata, {
            title: 'Recent Puzzle',
            author: 'Constructor'
        });
        assert.equal(payload.source.id, 'easy.json');
    } finally {
        globalThis.localStorage = originalLocalStorage;
        globalThis.document = originalDocument;
    }
});

test('scheduleEditorAutosave debounces draft saves and uses silent mode', async () => {
    const originalWindow = globalThis.window;
    const scheduled = [];
    let clearedTimer = null;
    const saveCalls = [];

    globalThis.window = {
        setTimeout(fn, delay) {
            scheduled.push({ fn, delay });
            return scheduled.length;
        },
        clearTimeout(id) {
            clearedTimer = id;
        }
    };

    const app = {
        modes: { isPlayMode: false },
        grid: [['A']],
        _draftAutosaveTimer: 1,
        saveEditorDraft(options) {
            saveCalls.push(options);
        }
    };

    try {
        const scheduledResult = editorMethods._scheduleEditorAutosave.call(app);
        assert.equal(scheduledResult, true);
        assert.equal(clearedTimer, 1);
        assert.equal(scheduled[0].delay, 400);

        scheduled[0].fn();

        assert.equal(app._draftAutosaveTimer, null);
        assert.deepEqual(saveCalls, [{ silent: true }]);
    } finally {
        globalThis.window = originalWindow;
    }
});

test('loadEditorDraft restores a saved draft into the editor', () => {
    const originalLocalStorage = globalThis.localStorage;
    const originalDocument = globalThis.document;
    let restoredDraft = null;
    let snapshotCount = 0;

    globalThis.localStorage = {
        getItem() {
            return JSON.stringify({
                grid: [['C', 'A', 'T']],
                currentSolution: null,
                currentPuzzleClues: { '1-across': 'Saved clue' },
                selectedCell: { r: 0, c: 1 },
                selectedDirection: 'across'
            });
        },
        setItem() {},
        removeItem() {}
    };

    globalThis.document = {
        getElementById() {
            return null;
        }
    };

    const app = {
        modes: { isPlayMode: false },
        display: {
            updateStatus() {}
        },
        _getEditorDraftStorageKey: editorMethods._getEditorDraftStorageKey,
        _readSavedEditorDraft: editorMethods._readSavedEditorDraft,
        _recordEditorSnapshot() {
            snapshotCount++;
        },
        _assertValidPuzzleGrid: puzzleMethods._assertValidPuzzleGrid,
        _restoreEditorState(state) {
            restoredDraft = state;
        },
        _updateDraftButtons() {}
    };

    try {
        const loaded = editorMethods.loadEditorDraft.call(app);

        assert.equal(loaded, true);
        assert.equal(snapshotCount, 1);
        assert.deepEqual(restoredDraft.grid, [['C', 'A', 'T']]);
        assert.deepEqual(restoredDraft.currentPuzzleClues, { '1-across': 'Saved clue' });
    } finally {
        globalThis.localStorage = originalLocalStorage;
        globalThis.document = originalDocument;
    }
});

test('loadRecentPuzzle restores the saved workspace into the editor', () => {
    const originalLocalStorage = globalThis.localStorage;
    const originalDocument = globalThis.document;
    const storage = new Map([
        ['crossworder.recentPuzzle', JSON.stringify({
            editorGrid: [['C', 'A', 'T']],
            currentPuzzleClues: { '1-across': 'Saved clue' },
            currentPuzzleMetadata: { title: 'Saved Puzzle', author: 'Maker' },
            currentSolution: { '1-across': 'CAT' },
            source: { kind: 'bundled', id: 'easy.json', label: 'Easy puzzle' },
            slotBlacklist: { '1-across': ['CAR'] }
        })],
        ['crossworder.completedPuzzles', JSON.stringify([])]
    ]);
    let navEditorClicks = 0;
    let importedGrid = null;

    globalThis.localStorage = {
        getItem(key) {
            return storage.has(key) ? storage.get(key) : null;
        },
        setItem(key, value) {
            storage.set(key, value);
        },
        removeItem(key) {
            storage.delete(key);
        }
    };

    globalThis.document = {
        getElementById(id) {
            if (id === 'nav-editor') {
                return { click() { navEditorClicks++; } };
            }

            return null;
        }
    };

    const app = {
        display: {
            updateStatus() {}
        },
        importPuzzleGrid(grid) {
            importedGrid = grid;
        },
        render() {},
        refreshWordList() {},
        renderSolverBlacklist() {},
        syncPuzzleMetadataInputs() {},
        _scheduleEditorAutosave() {},
        _assertValidPuzzleGrid: puzzleMethods._assertValidPuzzleGrid,
        _getRecentPuzzleStorageKey: puzzleMethods._getRecentPuzzleStorageKey,
        _getCompletedPuzzleStorageKey: puzzleMethods._getCompletedPuzzleStorageKey,
        _readRecentPuzzleRecord: puzzleMethods._readRecentPuzzleRecord,
        _readCompletedPuzzleHistory: puzzleMethods._readCompletedPuzzleHistory,
        _updateRecentPuzzleUI: puzzleMethods._updateRecentPuzzleUI
    };

    try {
        const loaded = puzzleMethods.loadRecentPuzzle.call(app, 'editor');

        assert.equal(loaded, true);
        assert.deepEqual(importedGrid, [['C', 'A', 'T']]);
        assert.deepEqual(app.currentPuzzleClues, { '1-across': 'Saved clue' });
        assert.deepEqual(app.currentPuzzleMetadata, { title: 'Saved Puzzle', author: 'Maker' });
        assert.deepEqual(app.slotBlacklist, { '1-across': ['CAR'] });
        assert.equal(navEditorClicks, 1);
    } finally {
        globalThis.localStorage = originalLocalStorage;
        globalThis.document = originalDocument;
    }
});

test('recordCompletedPuzzle appends a completion entry to local history', () => {
    const originalLocalStorage = globalThis.localStorage;
    const originalDocument = globalThis.document;
    const storage = new Map([
        ['crossworder.completedPuzzles', JSON.stringify([])],
        ['crossworder.dailyCompletions', JSON.stringify([])]
    ]);

    globalThis.localStorage = {
        getItem(key) {
            return storage.has(key) ? storage.get(key) : null;
        },
        setItem(key, value) {
            storage.set(key, value);
        },
        removeItem(key) {
            storage.delete(key);
        }
    };

    globalThis.document = {
        getElementById() {
            return null;
        }
    };

    const app = {
        grid: [['A', 'T']],
        modes: { isPlayMode: true },
        editorGridSnapshot: [['A', 'T']],
        currentPuzzleClues: {},
        currentPuzzleMetadata: { title: 'Finished Puzzle', author: 'Setter' },
        currentSolution: { '1-across': 'AT' },
        activePuzzleSource: { kind: 'daily', id: '2026-03-26', label: 'Daily puzzle' },
        slotBlacklist: {},
        playElapsedMs: 93000,
        hasCompletedPlayPuzzle: true,
        _captureRecentPuzzleRecord: puzzleMethods._captureRecentPuzzleRecord,
        _getCompletedPuzzleStorageKey: puzzleMethods._getCompletedPuzzleStorageKey,
        _getDailyCompletionStorageKey: puzzleMethods._getDailyCompletionStorageKey,
        _getRecentPuzzleStorageKey: puzzleMethods._getRecentPuzzleStorageKey,
        _readCompletedPuzzleHistory: puzzleMethods._readCompletedPuzzleHistory,
        _readDailyCompletionHistory: puzzleMethods._readDailyCompletionHistory,
        _recordDailyCompletion: puzzleMethods._recordDailyCompletion,
        _saveRecentPuzzleRecord() {
            return true;
        },
        _updateRecentPuzzleUI() {}
    };

    try {
        const recorded = puzzleMethods._recordCompletedPuzzle.call(app, '1:33');
        const history = JSON.parse(storage.get('crossworder.completedPuzzles'));

        assert.equal(recorded, true);
        assert.equal(history.length, 1);
        assert.equal(history[0].title, 'Finished Puzzle');
        assert.equal(history[0].author, 'Setter');
        assert.equal(history[0].timeLabel, '1:33');
        assert.equal(history[0].sourceId, '2026-03-26');
        assert.equal(history[0].sourceKind, 'daily');
        assert.deepEqual(JSON.parse(storage.get('crossworder.dailyCompletions')), ['2026-03-26']);
    } finally {
        globalThis.localStorage = originalLocalStorage;
        globalThis.document = originalDocument;
    }
});

test('calculateDailyStreak counts consecutive daily completions from the latest date', () => {
    const streak = puzzleMethods._calculateDailyStreak([
        '2026-03-26',
        '2026-03-25',
        '2026-03-24',
        '2026-03-22'
    ]);
    const broken = puzzleMethods._calculateDailyStreak([
        '2026-03-26',
        '2026-03-24'
    ]);

    assert.deepEqual(streak, {
        streak: 3,
        latest: '2026-03-26'
    });
    assert.deepEqual(broken, {
        streak: 1,
        latest: '2026-03-26'
    });
});

test('filterAndSortPuzzleEntries filters by query and sorts by author or date', () => {
    const entries = [
        { id: 'hard', title: 'Hard', author: 'Bravo', date: '2026-03-20', file: 'hard.json' },
        { id: 'easy', title: 'Easy', author: 'Alpha', date: '2026-03-26', file: 'easy.json' },
        { id: 'medium', title: 'Medium', author: 'Charlie', date: '2026-03-24', file: 'medium.json' }
    ];

    const authorSorted = puzzleMethods._filterAndSortPuzzleEntries(entries, { sort: 'author' });
    const queryFiltered = puzzleMethods._filterAndSortPuzzleEntries(entries, { query: 'med' });
    const dateSorted = puzzleMethods._filterAndSortPuzzleEntries(entries, { sort: 'date-desc' });

    assert.deepEqual(authorSorted.map((entry) => entry.id), ['easy', 'hard', 'medium']);
    assert.deepEqual(queryFiltered.map((entry) => entry.id), ['medium']);
    assert.deepEqual(dateSorted.map((entry) => entry.id), ['easy', 'medium', 'hard']);
});

test('loadBundledPuzzleByFile can load a bundled puzzle directly into play mode', async () => {
    const originalDocument = globalThis.document;
    let playClicks = 0;
    let importedGrid = null;

    globalThis.document = {
        getElementById(id) {
            if (id === 'nav-play') {
                return { click() { playClicks++; } };
            }

            return null;
        }
    };

    const app = {
        puzzleIndex: [
            { file: 'easy.json', title: 'Easy', author: 'Crossworder', date: '2026-03-26' }
        ],
        currentPuzzleClues: {},
        currentPuzzleMetadata: {},
        display: {
            updateStatus() {}
        },
        importPuzzleGrid(grid) {
            importedGrid = grid;
        },
        _fetchPuzzleFile: async () => ({
            grid: [['A', 'T']],
            clues: { across: ['1. A clue'] },
            metadata: { title: 'Easy', author: 'Crossworder' },
            solution: { '1-across': 'AT' }
        }),
        _extractPuzzleClues() {
            return { '1-across': 'A clue' };
        },
        _extractPuzzleMetadata: puzzleMethods._extractPuzzleMetadata,
        extractSolutionFromGrid() {
            return { '1-across': 'AT' };
        },
        syncPuzzleMetadataInputs() {},
        _updateRecentPuzzleUI() {},
        _saveRecentPuzzleRecord() {},
        slots: {
            '1-across': {
                id: '1-across',
                direction: 'across',
                number: 1,
                positions: [[0, 0], [0, 1]],
                length: 2
            }
        }
    };

    try {
        const loaded = await puzzleMethods.loadBundledPuzzleByFile.call(app, 'easy.json', 'play');

        assert.equal(loaded, true);
        assert.deepEqual(importedGrid, [['A', 'T']]);
        assert.deepEqual(app.currentPuzzleClues, { '1-across': 'A clue' });
        assert.deepEqual(app.currentSolution, { '1-across': 'AT' });
        assert.equal(playClicks, 1);
    } finally {
        globalThis.document = originalDocument;
    }
});

test('selectFeaturedAndRecommendedPuzzles prefers daily-eligible featured and incomplete recommended entries', () => {
    const entries = [
        { file: 'easy.json', title: 'Easy', dailyEligible: true, date: '2026-03-26' },
        { file: 'medium.json', title: 'Medium', dailyEligible: true, date: '2026-03-24' },
        { file: 'hard.json', title: 'Hard', dailyEligible: false, date: '2026-03-25' }
    ];
    const progressLookup = {
        'easy.json': { completed: true },
        'medium.json': { completed: false }
    };

    const picks = puzzleMethods._selectFeaturedAndRecommendedPuzzles(entries, progressLookup);

    assert.equal(picks.featured.file, 'easy.json');
    assert.equal(picks.recommended.file, 'medium.json');
});

test('DisplayManager announces status updates in the live region', () => {
    const originalDocument = globalThis.document;
    const statusDisplay = {
        value: '',
        scrollTop: 0,
        scrollHeight: 24
    };
    const liveStatus = {
        textContent: ''
    };

    globalThis.document = {
        getElementById(id) {
            if (id === 'status-display') return statusDisplay;
            if (id === 'live-status') return liveStatus;
            return null;
        }
    };

    try {
        const display = new DisplayManager();
        display.updateStatus('Testing live updates.', false);

        assert.match(statusDisplay.value, /Testing live updates\./);
        assert.equal(liveStatus.textContent, 'Testing live updates.');
    } finally {
        globalThis.document = originalDocument;
    }
});

test('DisplayManager marks the active clue with aria-current', () => {
    const originalDocument = globalThis.document;
    const makeItem = (slotId) => {
        const classSet = new Set();
        return {
            dataset: { slotId },
            classList: {
                add(name) {
                    classSet.add(name);
                },
                remove(name) {
                    classSet.delete(name);
                },
                contains(name) {
                    return classSet.has(name);
                }
            },
            attributes: {},
            setAttribute(name, value) {
                this.attributes[name] = value;
            },
            removeAttribute(name) {
                delete this.attributes[name];
            },
            scrollIntoView() {}
        };
    };
    const first = makeItem('1-across');
    const second = makeItem('2-down');
    const container = {
        querySelectorAll() {
            return [first, second];
        },
        querySelector(selector) {
            return selector.includes('2-down') ? second : null;
        }
    };

    globalThis.document = {
        getElementById() {
            return null;
        }
    };

    const originalWindow = globalThis.window;
    globalThis.window = {
        matchMedia() {
            return { matches: true };
        }
    };

    try {
        const display = new DisplayManager();
        display._activeListMode = 'editor';
        display.editorAcrossDisplay = container;
        display.editorDownDisplay = null;
        display._updateActiveCluePanelFromItem = () => {};

        display.highlightSlotInList('2-down');

        assert.equal(first.attributes['aria-current'], undefined);
        assert.equal(second.attributes['aria-current'], 'true');
    } finally {
        globalThis.document = originalDocument;
        globalThis.window = originalWindow;
    }
});

test('clearEditorLetters removes letters while preserving block structure', () => {
    const statuses = [];
    let snapshotCount = 0;

    const app = {
        modes: { isPlayMode: false },
        grid: [['A', '#', 'T']],
        currentSolution: { '1-across': 'AT' },
        currentPuzzleMetadata: { title: 'Keep Me' },
        display: {
            updateStatus(message) {
                statuses.push(message);
            }
        },
        _recordEditorSnapshot() {
            snapshotCount++;
        },
        render() {},
        _updateDraftButtons() {}
    };

    const cleared = editorMethods.clearEditorLetters.call(app);

    assert.equal(cleared, true);
    assert.equal(snapshotCount, 1);
    assert.deepEqual(app.grid, [['', '#', '']]);
    assert.equal(app.currentSolution, null);
    assert.deepEqual(app.currentPuzzleMetadata, { title: 'Keep Me' });
    assert.match(statuses.at(-1), /Cleared all entered letters/);
});

test('clearEditorBlocks removes blocks and authored clues but keeps letters', () => {
    const statuses = [];
    let snapshotCount = 0;

    const app = {
        modes: { isPlayMode: false },
        grid: [['A', '#', 'T']],
        currentSolution: { '1-across': 'AT' },
        currentPuzzleClues: { '1-across': 'Clue' },
        display: {
            updateStatus(message) {
                statuses.push(message);
            }
        },
        _recordEditorSnapshot() {
            snapshotCount++;
        },
        render() {},
        _updateDraftButtons() {}
    };

    const cleared = editorMethods.clearEditorBlocks.call(app);

    assert.equal(cleared, true);
    assert.equal(snapshotCount, 1);
    assert.deepEqual(app.grid, [['A', '', 'T']]);
    assert.equal(app.currentSolution, null);
    assert.deepEqual(app.currentPuzzleClues, {});
    assert.match(statuses.at(-1), /Cleared all blocks/);
});

test('clearEditorGrid removes all editor content and selection', () => {
    const statuses = [];
    let snapshotCount = 0;

    const app = {
        modes: { isPlayMode: false },
        grid: [['A', '#', 'T']],
        currentSolution: { '1-across': 'AT' },
        currentPuzzleClues: { '1-across': 'Clue' },
        gridManager: {
            selectedCell: { r: 0, c: 0 }
        },
        display: {
            updateStatus(message) {
                statuses.push(message);
            }
        },
        _recordEditorSnapshot() {
            snapshotCount++;
        },
        render() {},
        _updateDraftButtons() {}
    };

    const cleared = editorMethods.clearEditorGrid.call(app);

    assert.equal(cleared, true);
    assert.equal(snapshotCount, 1);
    assert.deepEqual(app.grid, [['', '', '']]);
    assert.equal(app.currentSolution, null);
    assert.deepEqual(app.currentPuzzleClues, {});
    assert.equal(app.gridManager.selectedCell, null);
    assert.match(statuses.at(-1), /Cleared the entire editor grid/);
});

test('clearEditorRow clears the selected row and resets puzzle metadata', () => {
    const statuses = [];
    let snapshotCount = 0;

    const app = {
        modes: { isPlayMode: false },
        grid: [['A', '#', 'T'], ['D', 'O', 'G']],
        currentSolution: { '1-across': 'AT' },
        currentPuzzleClues: { '1-across': 'Clue' },
        gridManager: {
            selectedCell: { r: 0, c: 2 }
        },
        display: {
            updateStatus(message) {
                statuses.push(message);
            }
        },
        _recordEditorSnapshot() {
            snapshotCount++;
        },
        _clearEditorLine: editorMethods._clearEditorLine,
        _isInBounds(r, c) {
            return r >= 0 && c >= 0 && r < this.grid.length && c < this.grid[0].length;
        },
        render() {},
        _updateDraftButtons() {}
    };

    const cleared = editorMethods.clearEditorRow.call(app);

    assert.equal(cleared, true);
    assert.equal(snapshotCount, 1);
    assert.deepEqual(app.grid, [['', '', ''], ['D', 'O', 'G']]);
    assert.equal(app.currentSolution, null);
    assert.deepEqual(app.currentPuzzleClues, {});
    assert.match(statuses.at(-1), /Cleared editor row 1/);
});

test('clearEditorColumn clears the selected column and preserves other cells', () => {
    const statuses = [];
    let snapshotCount = 0;

    const app = {
        modes: { isPlayMode: false },
        grid: [['A', '#', 'T'], ['D', 'O', 'G']],
        currentSolution: { '1-across': 'AT' },
        currentPuzzleClues: { '1-across': 'Clue' },
        gridManager: {
            selectedCell: { r: 1, c: 1 }
        },
        display: {
            updateStatus(message) {
                statuses.push(message);
            }
        },
        _recordEditorSnapshot() {
            snapshotCount++;
        },
        _clearEditorLine: editorMethods._clearEditorLine,
        _isInBounds(r, c) {
            return r >= 0 && c >= 0 && r < this.grid.length && c < this.grid[0].length;
        },
        render() {},
        _updateDraftButtons() {}
    };

    const cleared = editorMethods.clearEditorColumn.call(app);

    assert.equal(cleared, true);
    assert.equal(snapshotCount, 1);
    assert.deepEqual(app.grid, [['A', '', 'T'], ['D', '', 'G']]);
    assert.equal(app.currentSolution, null);
    assert.deepEqual(app.currentPuzzleClues, {});
    assert.match(statuses.at(-1), /Cleared editor column 2/);
});

test('serializeCurrentPuzzle exports the editor grid and numbered clues as JSON-ready data', () => {
    const app = {
        grid: [['A', '#', ''], ['', 'T', '']],
        currentPuzzleMetadata: {
            title: 'Mini Theme',
            author: 'Will',
            difficulty: 'Medium',
            tags: 'mini, themed',
            copyright: 'Copyright 2026',
            sourceUrl: 'https://example.com/mini-theme',
            notes: 'Theme notes'
        },
        activePuzzleSource: {
            kind: 'bundled',
            id: 'easy.json',
            label: 'Easy'
        },
        slots: {
            '1-across': { id: '1-across', direction: 'across', number: 1 },
            '2-down': { id: '2-down', direction: 'down', number: 2 }
        },
        currentPuzzleClues: {
            '1-across': 'Across clue',
            '2-down': 'Down clue'
        }
    };

    const payload = editorMethods._serializeCurrentPuzzle.call(app);

    assert.deepEqual(payload.grid, [['A', '.', ' '], [' ', 'T', ' ']]);
    assert.equal(payload.title, 'Mini Theme');
    assert.equal(payload.author, 'Will');
    assert.equal(payload.schemaVersion, 2);
    assert.equal(payload.packageType, 'crossworder-puzzle');
    assert.deepEqual(payload.metadata, {
        title: 'Mini Theme',
        author: 'Will',
        difficulty: 'Medium',
        tags: 'mini, themed',
        copyright: 'Copyright 2026',
        sourceUrl: 'https://example.com/mini-theme',
        notes: 'Theme notes',
        packageType: 'crossworder-puzzle',
        schemaVersion: 2
    });
    assert.deepEqual(payload.clues, {
        across: { '1': 'Across clue' },
        down: { '2': 'Down clue' }
    });
    assert.equal(payload.source.id, 'easy.json');
    assert.equal(payload.stats.totalSlots, 2);
});

test('importPuzzleFile loads JSON through the existing puzzle import flow', async () => {
    let importedGrid = null;
    const statuses = [];

    const app = {
        modes: { isPlayMode: false },
        currentPuzzleClues: {},
        currentPuzzleMetadata: {},
        currentSolution: { '1-across': 'OLD' },
        display: {
            updateStatus(message) {
                statuses.push(message);
            }
        },
        _assertValidPuzzleGrid: puzzleMethods._assertValidPuzzleGrid,
        importPuzzleGrid(grid) {
            importedGrid = grid;
        },
        _extractPuzzleClues: puzzleMethods._extractPuzzleClues,
        _mapDirectionalClues: puzzleMethods._mapDirectionalClues,
        _normalizePuzzleClueEntry: puzzleMethods._normalizePuzzleClueEntry,
        _extractClueText: puzzleMethods._extractClueText,
        _extractClueNumber: puzzleMethods._extractClueNumber,
        _extractPuzzleMetadata: puzzleMethods._extractPuzzleMetadata,
        slots: {
            '1-across': { id: '1-across', direction: 'across', number: 1 }
        },
        _formatPuzzleLoadError: puzzleMethods._formatPuzzleLoadError,
        syncPuzzleMetadataInputs() {}
    };

    const file = {
        name: 'imported.json',
        async text() {
            return JSON.stringify({
                schemaVersion: 2,
                packageType: 'crossworder-puzzle',
                grid: [['A', 'T']],
                metadata: {
                    title: 'Imported Theme',
                    author: 'Constructor',
                    difficulty: 'Hard',
                    tags: 'themed, mini',
                    copyright: 'Copyright 2026',
                    sourceUrl: 'https://example.com/imported',
                    notes: 'Imported notes'
                },
                source: {
                    kind: 'bundled',
                    id: 'imported.json',
                    label: 'Imported package'
                },
                solution: {
                    '1-across': 'AT'
                },
                clues: {
                    across: ['1. Imported clue']
                }
            });
        }
    };

    const imported = await editorMethods.importPuzzleFile.call(app, file);

    assert.equal(imported, true);
    assert.deepEqual(importedGrid, [['A', 'T']]);
    assert.deepEqual(app.currentPuzzleClues, { '1-across': 'Imported clue' });
    assert.deepEqual(app.currentPuzzleMetadata, {
        title: 'Imported Theme',
        author: 'Constructor',
        difficulty: 'Hard',
        tags: 'themed, mini',
        copyright: 'Copyright 2026',
        sourceUrl: 'https://example.com/imported',
        notes: 'Imported notes'
    });
    assert.deepEqual(app.currentSolution, { '1-across': 'AT' });
    assert.equal(app.activePuzzleSource.id, 'imported.json');
    assert.match(statuses.at(-1), /Imported puzzle from imported\.json/);
});

test('handleSolve ignores stale worker results after a newer solve run starts', async () => {
    const originalWorker = globalThis.Worker;
    const originalDocument = globalThis.document;
    const originalPerformance = globalThis.performance;

    let workerInstance = null;
    let applied = false;
    let refreshed = false;
    const controlStates = [];

    const documentStub = {
        getElementById() {
            return { checked: false };
        }
    };
    globalThis.document = documentStub;
    global.document = documentStub;

    globalThis.performance = {
        now() {
            return 1000;
        }
    };

    globalThis.Worker = class MockWorker {
        constructor() {
            this.onmessage = null;
            this.onerror = null;
            workerInstance = this;
        }

        postMessage() {}

        terminate() {}
    };

    const app = {
        isSolving: false,
        _solveRunId: 0,
        grid: [['', '']],
        slots: {},
        wordLengthCache: {},
        letterFrequencies: {},
        currentSolution: null,
        activeWorker: null,
        activeSolveSession: null,
        gridManager: { cells: {} },
        display: { updateStatus() {} },
        wordProvider: {
            async getWordsOfLength() {
                return ['AT'];
            }
        },
        constraintManager: {
            constraints: {},
            buildDataStructures() {
                return {
                    slots: {
                        '1-across': {
                            id: '1-across',
                            number: 1,
                            direction: 'across',
                            length: 2,
                            positions: [[0, 0], [0, 1]]
                        }
                    },
                    cellContents: {
                        '0,0': '',
                        '0,1': ''
                    }
                };
            },
            setupDomains() {
                return {
                    '1-across': ['AT']
                };
            }
        },
        applySolutionToGrid() {
            applied = true;
        },
        refreshWordList() {
            refreshed = true;
        },
        syncActiveGridToDOM() {},
        _updateSolveControls(isSolving) {
            controlStates.push(isSolving);
            this.isSolving = isSolving;
        }
    };

    try {
        const solvePromise = solverMethods.handleSolve.call(app);
        await Promise.resolve();

        assert.ok(workerInstance);

        app._solveRunId = 2;
        workerInstance.onmessage({
            data: {
                type: 'RESULT',
                payload: {
                    success: true,
                    solution: { '1-across': 'AT' }
                }
            }
        });

        await solvePromise;

        assert.equal(applied, false);
        assert.equal(refreshed, false);
        assert.equal(app.currentSolution, null);
        assert.deepEqual(controlStates, [true]);
    } finally {
        globalThis.Worker = originalWorker;
        globalThis.document = originalDocument;
        global.document = originalDocument;
        globalThis.performance = originalPerformance;
    }
});

test('handleSolve exits early with a status update when the grid has no fillable slots', async () => {
    const statuses = [];
    let synced = false;
    const controlStates = [];

    const app = {
        isSolving: false,
        _solveRunId: 0,
        grid: [['#', '#']],
        slots: {},
        wordLengthCache: {},
        letterFrequencies: {},
        display: {
            updateStatus(message) {
                statuses.push(message);
            }
        },
        constraintManager: {
            buildDataStructures() {
                return {
                    slots: {},
                    cellContents: {}
                };
            }
        },
        syncActiveGridToDOM() {
            synced = true;
        },
        _updateSolveControls(isSolving) {
            controlStates.push(isSolving);
            this.isSolving = isSolving;
        }
    };

    await solverMethods.handleSolve.call(app);

    assert.equal(synced, true);
    assert.match(statuses.at(-1), /No fillable entries were found/);
    assert.deepEqual(controlStates, [true, false]);
});

test('handleSolve exits early when a slot has no candidate domain values', async () => {
    const statuses = [];
    let synced = false;
    const controlStates = [];

    const app = {
        isSolving: false,
        _solveRunId: 0,
        grid: [['', '']],
        slots: {},
        wordLengthCache: { 2: ['AT'] },
        letterFrequencies: {},
        display: {
            updateStatus(message) {
                statuses.push(message);
            }
        },
        wordProvider: {
            async getWordsOfLength() {
                return ['AT'];
            }
        },
        constraintManager: {
            constraints: {},
            buildDataStructures() {
                return {
                    slots: {
                        '1-across': {
                            id: '1-across',
                            number: 1,
                            direction: 'across',
                            length: 2,
                            positions: [[0, 0], [0, 1]]
                        }
                    },
                    cellContents: {}
                };
            },
            setupDomains() {
                return {
                    '1-across': []
                };
            }
        },
        syncActiveGridToDOM() {
            synced = true;
        },
        _updateSolveControls(isSolving) {
            controlStates.push(isSolving);
            this.isSolving = isSolving;
        }
    };

    await solverMethods.handleSolve.call(app);

    assert.equal(synced, true);
    assert.match(statuses.at(-1), /No candidate fills were found for 1-across/);
    assert.deepEqual(controlStates, [true, false]);
});

test('handleSearch ignores stale async results from earlier requests', async () => {
    let resolveFirst;
    let requestCount = 0;
    const searchUpdates = [];

    const firstPromise = new Promise((resolve) => {
        resolveFirst = resolve;
    });

    const app = {
        _searchRequestId: 0,
        wordProvider: {
            async getWordsOfLength() {
                requestCount++;

                if (requestCount === 1) {
                    await firstPromise;
                    return ['CAT', 'CAR'];
                }

                return ['DOG', 'DOE'];
            }
        },
        display: {
            updateSearchResults(matches, _onSelect, options) {
                searchUpdates.push({
                    matches,
                    message: options?.message || ''
                });
            },
            updateStatus() {}
        },
        popups: {
            show() {}
        }
    };

    const firstSearch = solverMethods.handleSearch.call(app, 'CA?');
    const secondSearch = solverMethods.handleSearch.call(app, 'DO?');

    await secondSearch;
    resolveFirst();
    await firstSearch;

    assert.equal(searchUpdates.length, 1);
    assert.deepEqual(searchUpdates[0].matches, ['DOG', 'DOE']);
    assert.match(searchUpdates[0].message, /2 matches/);
});

test('loadPuzzleOfTheDaySummary updates button states for success and failure', async () => {
    const originalDocument = globalThis.document;
    const originalWarn = console.warn;

    const summaryEl = { textContent: '' };
    const editorButton = { disabled: false, title: '' };
    const playButton = { disabled: false, title: '' };

    const documentStub = {
        getElementById(id) {
            const elements = {
                'daily-puzzle-summary': summaryEl,
                'load-daily-editor-button': editorButton,
                'play-daily-button': playButton
            };

            return elements[id] || null;
        }
    };

    globalThis.document = documentStub;
    global.document = documentStub;
    console.warn = () => {};

    const successApp = {
        puzzleOfTheDay: null,
        async _fetchDailyPuzzle() {
            return {
                title: 'Puzzle of the Day',
                sourceTitle: 'Daily Source',
                generatedFor: '2026-03-26'
            };
        }
    };

    const failureApp = {
        puzzleOfTheDay: null,
        async _fetchDailyPuzzle() {
            throw new Error('missing');
        }
    };

    try {
        await puzzleMethods.loadPuzzleOfTheDaySummary.call(successApp);
        assert.equal(editorButton.disabled, false);
        assert.equal(playButton.disabled, false);
        assert.equal(editorButton.title, 'Load the current daily puzzle');
        assert.match(summaryEl.textContent, /2026-03-26/);

        await puzzleMethods.loadPuzzleOfTheDaySummary.call(failureApp);
        assert.equal(editorButton.disabled, true);
        assert.equal(playButton.disabled, true);
        assert.equal(playButton.title, 'The daily puzzle is not available right now.');
        assert.match(summaryEl.textContent, /has not been generated yet/);
    } finally {
        globalThis.document = originalDocument;
        global.document = originalDocument;
        console.warn = originalWarn;
    }
});

test('handleLoadDailyPuzzle loads editor mode without forcing play navigation', async () => {
    const originalDocument = globalThis.document;
    let editorClicks = 0;
    let playClicks = 0;
    let importedGrid = null;

    const documentStub = {
        getElementById(id) {
            if (id === 'nav-editor') {
                return { click() { editorClicks++; } };
            }

            if (id === 'nav-play') {
                return { click() { playClicks++; } };
            }

            return null;
        }
    };

    globalThis.document = documentStub;
    global.document = documentStub;

    const app = {
        puzzleOfTheDay: null,
        currentPuzzleClues: {},
        currentPuzzleMetadata: {},
        currentSolution: null,
        hasCompletedPlayPuzzle: true,
        display: {
            updateStatus() {}
        },
        importPuzzleGrid(grid) {
            importedGrid = grid;
        },
        async _fetchDailyPuzzle() {
            return {
                grid: [['A', 'T']],
                clues: { '1-across': 'Daily clue' },
                solution: { '1-across': 'AT' }
            };
        },
        _extractPuzzleMetadata: puzzleMethods._extractPuzzleMetadata,
        _formatPuzzleLoadError: puzzleMethods._formatPuzzleLoadError,
        syncPuzzleMetadataInputs() {}
    };

    try {
        await puzzleMethods.handleLoadDailyPuzzle.call(app, 'editor');

        assert.deepEqual(importedGrid, [['A', 'T']]);
        assert.deepEqual(app.currentPuzzleClues, { '1-across': 'Daily clue' });
        assert.equal(app.currentSolution, null);
        assert.equal(app.hasCompletedPlayPuzzle, false);
        assert.equal(editorClicks, 1);
        assert.equal(playClicks, 0);
    } finally {
        globalThis.document = originalDocument;
        global.document = originalDocument;
    }
});

test('handleLoadDailyPuzzle play mode keeps solution and navigates to play', async () => {
    const originalDocument = globalThis.document;
    let editorClicks = 0;
    let playClicks = 0;

    const documentStub = {
        getElementById(id) {
            if (id === 'nav-editor') {
                return { click() { editorClicks++; } };
            }

            if (id === 'nav-play') {
                return { click() { playClicks++; } };
            }

            return null;
        }
    };

    globalThis.document = documentStub;
    global.document = documentStub;

    const app = {
        puzzleOfTheDay: {
            grid: [['A', 'T']],
            clues: { '1-across': 'Daily clue' },
            solution: { '1-across': 'AT' }
        },
        currentPuzzleClues: {},
        currentPuzzleMetadata: {},
        currentSolution: null,
        hasCompletedPlayPuzzle: true,
        display: {
            updateStatus() {}
        },
        importPuzzleGrid() {},
        _extractPuzzleMetadata: puzzleMethods._extractPuzzleMetadata,
        _formatPuzzleLoadError: puzzleMethods._formatPuzzleLoadError,
        syncPuzzleMetadataInputs() {}
    };

    try {
        await puzzleMethods.handleLoadDailyPuzzle.call(app, 'play');

        assert.deepEqual(app.currentPuzzleClues, { '1-across': 'Daily clue' });
        assert.deepEqual(app.currentSolution, { '1-across': 'AT' });
        assert.equal(app.hasCompletedPlayPuzzle, false);
        assert.equal(editorClicks, 0);
        assert.equal(playClicks, 1);
    } finally {
        globalThis.document = originalDocument;
        global.document = originalDocument;
    }
});

test('loadRandomPuzzle disables the button and reports when the index is empty', async () => {
    let buttonArgs = null;
    const statuses = [];

    const app = {
        puzzleIndex: [],
        missingPuzzleFiles: new Set(),
        display: {
            updateStatus(message) {
                statuses.push(message);
            }
        },
        _updateRandomPuzzleButton(disabled, reason) {
            buttonArgs = { disabled, reason };
        }
    };

    await puzzleMethods.loadRandomPuzzle.call(app);

    assert.deepEqual(buttonArgs, {
        disabled: true,
        reason: 'Puzzle index is unavailable.'
    });
    assert.match(statuses.at(-1), /Puzzle index is empty or still loading/);
});

test('handleSearch short queries skip provider work and show guidance', async () => {
    let providerCalls = 0;
    const searchUpdates = [];

    const app = {
        _searchRequestId: 0,
        wordProvider: {
            async getWordsOfLength() {
                providerCalls++;
                return [];
            }
        },
        display: {
            updateSearchResults(matches, _onSelect, options) {
                searchUpdates.push({
                    matches,
                    message: options?.message || ''
                });
            },
            updateStatus() {}
        },
        popups: {
            show() {}
        }
    };

    await solverMethods.handleSearch.call(app, 'C');

    assert.equal(providerCalls, 0);
    assert.deepEqual(searchUpdates, [
        {
            matches: [],
            message: 'Type at least 2 letters to search.'
        }
    ]);
});

test('handleSearch supports clue-text mode with ranked clue results', async () => {
    const originalDocument = globalThis.document;
    const updates = [];
    let popupWord = null;

    globalThis.document = {
        getElementById(id) {
            if (id === 'word-search-mode') {
                return { value: 'clue' };
            }
            return null;
        }
    };

    try {
        const app = {
            _searchRequestId: 0,
            definitions: {
                async searchEntries(query) {
                    return [
                        { word: 'CAT', clue: `Result for ${query}`, source: 'NYT', date: '2025-01-01' }
                    ];
                }
            },
            display: {
                updateSearchResults(matches, onSelect, options) {
                    updates.push({ matches, options });
                    onSelect(matches[0]);
                },
                updateStatus() {}
            },
            popups: {
                show(word) {
                    popupWord = word;
                }
            }
        };

        await solverMethods.handleSearch.call(app, 'feline');

        assert.equal(updates[0].options.mode, 'clue');
        assert.equal(updates[0].matches[0].word, 'CAT');
        assert.equal(popupWord, 'CAT');
    } finally {
        globalThis.document = originalDocument;
    }
});

test('buildSolverDomains filters slot-specific blacklisted fills', () => {
    const app = {
        slotBlacklist: {
            '1-across': ['CAT']
        },
        constraintManager: {
            setupDomains() {
                return {
                    '1-across': ['CAT', 'CAR']
                };
            }
        },
        wordLengthCache: {},
        grid: [['', '', '']],
        _getSlotBlacklist: solverMethods._getSlotBlacklist
    };

    const domains = solverMethods._buildSolverDomains.call(app, {
        '1-across': { id: '1-across', length: 3, positions: [[0, 0], [0, 1], [0, 2]] }
    });

    assert.deepEqual(domains['1-across'], ['CAR']);
});

test('suggestSelectedWord fills the selected slot with the top candidate', async () => {
    const statuses = [];
    let snapshotCount = 0;
    let refreshed = 0;

    const app = {
        modes: { isPlayMode: false },
        slotBlacklist: {},
        grid: [['', '', '']],
        slots: {
            '1-across': { id: '1-across', number: 1, direction: 'across', length: 3, positions: [[0, 0], [0, 1], [0, 2]] }
        },
        constraintManager: {
            constraints: {},
            buildDataStructures() {
                return {
                    slots: app.slots,
                    cellContents: {}
                };
            },
            setupDomains() {
                return {
                    '1-across': ['CAT', 'CAR']
                };
            }
        },
        wordProvider: {
            async getWordsOfLength() {
                return ['CAT', 'CAR'];
            }
        },
        solver: {
            orderDomainValues() {
                return ['CAR', 'CAT'];
            }
        },
        display: {
            updateStatus(message) {
                statuses.push(message);
            }
        },
        _getSelectedEditorSlot() {
            return app.slots['1-across'];
        },
        _getSelectedSolveSettings() {
            return { lockFilledEntries: true };
        },
        _getLockedAssignments() {
            return {};
        },
        _getSlotBlacklist: solverMethods._getSlotBlacklist,
        _buildSolverDomains: solverMethods._buildSolverDomains,
        _withPreparedSolverData: solverMethods._withPreparedSolverData,
        _extractSlotWord: renderingMethods._extractSlotWord,
        _recordEditorSnapshot() {
            snapshotCount++;
        },
        syncActiveGridToDOM() {},
        refreshWordList() {
            refreshed++;
        },
        _applySlotWord: solverMethods._applySlotWord,
        _scheduleEditorAutosave() {},
        letterFrequencies: {}
    };

    const suggested = await solverMethods.suggestSelectedWord.call(app);

    assert.equal(suggested, true);
    assert.equal(snapshotCount, 1);
    assert.equal(refreshed, 1);
    assert.deepEqual(app.grid, [['C', 'A', 'R']]);
    assert.match(statuses.at(-1), /Suggested CAR/);
});

test('blacklistSelectedSlotWord stores the current fill and clears the slot', () => {
    const statuses = [];
    let snapshotCount = 0;

    const slot = { id: '1-across', number: 1, direction: 'across', length: 3, positions: [[0, 0], [0, 1], [0, 2]] };
    const app = {
        slotBlacklist: {},
        grid: [['C', 'A', 'T']],
        display: {
            updateStatus(message) {
                statuses.push(message);
            }
        },
        _getSelectedEditorSlot() {
            return slot;
        },
        _extractSlotWord: renderingMethods._extractSlotWord,
        _getSlotBlacklist: solverMethods._getSlotBlacklist,
        _setSlotBlacklist: solverMethods._setSlotBlacklist,
        _recordEditorSnapshot() {
            snapshotCount++;
        },
        syncActiveGridToDOM() {},
        refreshWordList() {},
        _scheduleEditorAutosave() {}
    };

    const blacklisted = solverMethods.blacklistSelectedSlotWord.call(app);

    assert.equal(blacklisted, true);
    assert.equal(snapshotCount, 1);
    assert.deepEqual(app.slotBlacklist, { '1-across': ['CAT'] });
    assert.deepEqual(app.grid, [['', '', '']]);
    assert.match(statuses.at(-1), /Blacklisted CAT/);
});

test('removeBlacklistedWord updates slot blacklist state and reports the change', () => {
    const statuses = [];
    let snapshotCount = 0;
    let rendered = 0;

    const app = {
        slotBlacklist: { '1-across': ['CAT', 'CAR'] },
        display: {
            updateStatus(message) {
                statuses.push(message);
            }
        },
        _getSlotBlacklist: solverMethods._getSlotBlacklist,
        _setSlotBlacklist: solverMethods._setSlotBlacklist,
        _recordEditorSnapshot() {
            snapshotCount++;
        },
        renderSolverBlacklist() {
            rendered++;
        },
        _scheduleEditorAutosave() {}
    };

    const removed = solverMethods.removeBlacklistedWord.call(app, '1-across', 'CAT');

    assert.equal(removed, true);
    assert.equal(snapshotCount, 1);
    assert.equal(rendered, 1);
    assert.deepEqual(app.slotBlacklist, { '1-across': ['CAR'] });
    assert.match(statuses.at(-1), /Removed CAT from the blacklist/);
});

test('updateSolverDiagnostics renders a readable summary for the latest solve', () => {
    const originalDocument = globalThis.document;
    const diagnostics = {
        textContent: '',
        classList: {
            add() {},
            remove() {}
        }
    };

    globalThis.document = {
        getElementById(id) {
            return id === 'solver-diagnostics' ? diagnostics : null;
        }
    };

    try {
        solverMethods._updateSolverDiagnostics.call(
            {},
            {
                maxDepth: 4,
                backtracks: 7,
                domainReductions: 20,
                recursiveCalls: 10
            },
            {
                deterministic: true,
                lockFilledEntries: true,
                allowReuse: false,
                themeEntries: ['NOVA']
            }
        );

        assert.match(diagnostics.textContent, /deterministic/);
        assert.match(diagnostics.textContent, /depth 4/);
        assert.match(diagnostics.textContent, /Theme priority: NOVA/);
    } finally {
        globalThis.document = originalDocument;
    }
});

test('loadRandomPuzzle marks missing files and falls back when all candidates fail', async () => {
    const originalError = console.error;
    const statuses = [];
    const disabledStates = [];

    const app = {
        puzzleIndex: [
            { file: 'missing-one.json', id: 'one', title: 'One' },
            { file: 'missing-two.json', id: 'two', title: 'Two' }
        ],
        missingPuzzleFiles: new Set(),
        display: {
            updateStatus(message) {
                statuses.push(message);
            }
        },
        _updateRandomPuzzleButton(disabled, reason) {
            disabledStates.push({ disabled, reason });
        },
        _formatPuzzleLoadError: puzzleMethods._formatPuzzleLoadError,
        async _fetchPuzzleFile(file) {
            throw new Error(`Failed to fetch ${file}: HTTP 404`);
        }
    };

    console.error = () => {};

    try {
        await puzzleMethods.loadRandomPuzzle.call(app);
    } finally {
        console.error = originalError;
    }

    assert.equal(app.missingPuzzleFiles.has('missing-one.json'), true);
    assert.equal(app.missingPuzzleFiles.has('missing-two.json'), true);
    assert.deepEqual(disabledStates.at(-1), {
        disabled: true,
        reason: 'Bundled puzzle files are unavailable.'
    });
    assert.match(
        statuses.at(-1),
        /referenced puzzle files could not be loaded/
    );
});

test('loadRandomPuzzle loads the first successful candidate and records authored clues', async () => {
    const statuses = [];
    const buttonStates = [];
    let importedGrid = null;

    const app = {
        puzzleIndex: [
            {
                file: 'candidate-a.json',
                id: 'a',
                title: 'Candidate A',
                author: 'Author A',
                date: '2026-03-26'
            }
        ],
        missingPuzzleFiles: new Set(),
        display: {
            updateStatus(message) {
                statuses.push(message);
            }
        },
        currentPuzzleClues: {},
        currentPuzzleMetadata: {},
        currentSolution: null,
        _updateRandomPuzzleButton(disabled, reason) {
            buttonStates.push({ disabled, reason });
        },
        importPuzzleGrid(grid) {
            importedGrid = grid;
        },
        _extractPuzzleClues() {
            return { '1-across': 'Authored clue' };
        },
        extractSolutionFromGrid() {
            return { '1-across': 'AT' };
        },
        async _fetchPuzzleFile(file) {
            return {
                grid: [['A', 'T']],
                clues: {
                    across: ['1. Authored clue']
                },
                title: file
            };
        },
        _extractPuzzleMetadata: puzzleMethods._extractPuzzleMetadata,
        _formatPuzzleLoadError: puzzleMethods._formatPuzzleLoadError,
        syncPuzzleMetadataInputs() {}
    };

    await puzzleMethods.loadRandomPuzzle.call(app);

    assert.deepEqual(importedGrid, [['A', 'T']]);
    assert.deepEqual(app.currentPuzzleClues, { '1-across': 'Authored clue' });
    assert.deepEqual(app.currentSolution, { '1-across': 'AT' });
    assert.deepEqual(buttonStates.at(-1), { disabled: false, reason: undefined });
    assert.match(statuses.at(-1), /Loaded Candidate A \(Author A, 2026-03-26\)\. Loaded 1 authored clues\./);
});

test('selectNextPlayClue advances through play clues using the grid manager', () => {
    let jumpDelta = 0;
    let highlighted = null;

    const app = {
        modes: { isPlayMode: true },
        isPlayPaused: false,
        _stepPlayClue: playMethods._stepPlayClue,
        gridManager: {
            _jumpToNextWord(_coordinator, delta) {
                jumpDelta = delta;
            },
            _getActiveSlot() {
                return { id: '2-down' };
            }
        },
        display: {
            highlightSlotInList(slotId) {
                highlighted = slotId;
            }
        },
        _syncPlayActiveClue: playMethods._syncPlayActiveClue
    };

    const advanced = playMethods.selectNextPlayClue.call(app);

    assert.equal(advanced, true);
    assert.equal(jumpDelta, 1);
    assert.equal(highlighted, '2-down');
});

test('jumpToNextEmptyPlayCell moves within the active slot before advancing elsewhere', () => {
    const statuses = [];
    let highlightCount = 0;
    let activeClueSyncs = 0;

    const app = {
        modes: { isPlayMode: true },
        isPlayPaused: false,
        hasCompletedPlayPuzzle: false,
        currentSolution: { '1-across': 'CAT', '2-down': 'DOG' },
        grid: [['C', '', ''], ['D', 'O', 'G']],
        slots: {
            '1-across': {
                id: '1-across',
                number: 1,
                direction: 'across',
                positions: [[0, 0], [0, 1], [0, 2]]
            },
            '2-down': {
                id: '2-down',
                number: 2,
                direction: 'down',
                positions: [[0, 0], [1, 0], [2, 0]]
            }
        },
        gridManager: {
            selectedCell: { r: 0, c: 0 },
            selectedDirection: 'across',
            _getActiveSlot() {
                return {
                    id: '1-across',
                    number: 1,
                    direction: 'across',
                    positions: [[0, 0], [0, 1], [0, 2]]
                };
            },
            _updateHighlights() {
                highlightCount++;
            }
        },
        display: {
            updateStatus(message) {
                statuses.push(message);
            }
        },
        _canUsePlayTools: playMethods._canUsePlayTools,
        _findNextEmptyPlayCell: playMethods._findNextEmptyPlayCell,
        _syncPlayActiveClue() {
            activeClueSyncs++;
        }
    };

    const moved = playMethods.jumpToNextEmptyPlayCell.call(app);

    assert.equal(moved, true);
    assert.deepEqual(app.gridManager.selectedCell, { r: 0, c: 1 });
    assert.equal(app.gridManager.selectedDirection, 'across');
    assert.equal(highlightCount, 1);
    assert.equal(activeClueSyncs, 1);
    assert.match(statuses.at(-1), /Moved to the next empty cell in 1 across/);
});

test('updatePauseUI reflects completed play state in the toolbar', () => {
    const originalDocument = globalThis.document;
    const elements = new Map();

    const makeEl = () => ({
        disabled: false,
        textContent: '',
        attrs: {},
        classList: { toggle() {} },
        setAttribute(name, value) {
            this.attrs[name] = value;
        }
    });

    [
        'pause-btn',
        'play-paused-overlay',
        'play-grid-container',
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
        'previous-clue-button',
        'next-clue-button'
    ].forEach((id) => {
        elements.set(id, makeEl());
    });

    globalThis.document = {
        getElementById(id) {
            return elements.get(id) || null;
        }
    };

    try {
        playMethods._updatePauseUI.call({
            modes: { isPlayMode: true },
            isPlayPaused: false,
            hasCompletedPlayPuzzle: true,
            _updateInstantMistakeUI() {}
        });

        assert.equal(elements.get('pause-btn').disabled, true);
        assert.equal(elements.get('pause-btn').textContent, 'Complete');
        assert.equal(elements.get('pause-btn').attrs['aria-label'], 'Puzzle complete');
        assert.equal(elements.get('clear-btn').disabled, true);
        assert.equal(elements.get('next-empty-btn').disabled, true);
        assert.equal(elements.get('previous-clue-button').disabled, false);
    } finally {
        globalThis.document = originalDocument;
    }
});

test('togglePlayPause pauses and resumes play while saving recent progress', () => {
    const statuses = [];
    let pauseCount = 0;
    let resumeCount = 0;
    let pauseUiCount = 0;
    let saveCount = 0;
    const stateUpdates = [];

    const app = {
        modes: { isPlayMode: true },
        isPlayPaused: false,
        display: {
            updateStatus(message) {
                statuses.push(message);
            }
        },
        _pausePlayTimer() {
            pauseCount++;
        },
        _resumePlayTimer() {
            resumeCount++;
        },
        _updatePlayStatusCopy(state) {
            stateUpdates.push(state);
        },
        _updatePauseUI() {
            pauseUiCount++;
        },
        _saveRecentPuzzleRecord() {
            saveCount++;
        }
    };

    playSessionMethods.togglePlayPause.call(app);
    playSessionMethods.togglePlayPause.call(app);

    assert.equal(app.isPlayPaused, false);
    assert.equal(pauseCount, 1);
    assert.equal(resumeCount, 1);
    assert.equal(pauseUiCount, 2);
    assert.equal(saveCount, 2);
    assert.deepEqual(stateUpdates, ['paused', 'active']);
    assert.match(statuses[0], /Game paused/);
    assert.match(statuses[1], /Game resumed/);
});

test('updateTimerDisplay formats elapsed play time with hours when needed', () => {
    const originalDocument = globalThis.document;
    const timer = { textContent: '' };
    globalThis.document = {
        getElementById(id) {
            return id === 'timer' ? timer : null;
        }
    };

    try {
        playSessionMethods._updateTimerDisplay.call({
            playElapsedMs: ((1 * 3600) + (2 * 60) + 3) * 1000
        });

        assert.equal(timer.textContent, '1:02:03');
    } finally {
        globalThis.document = originalDocument;
    }
});

test('toggleInstantMistakeMode refreshes incorrect-cell highlights for play mode', () => {
    const statuses = [];
    const incorrectOps = [];

    const td = {
        classList: {
            remove(...names) {
                incorrectOps.push(['remove', ...names]);
            },
            add(name) {
                incorrectOps.push(['add', name]);
            }
        }
    };

    const app = {
        modes: { isPlayMode: true },
        isPlayPaused: false,
        hasCompletedPlayPuzzle: false,
        isInstantMistakeMode: false,
        currentSolution: { '1-across': 'CAT' },
        grid: [['C', 'X', 'T']],
        slots: {
            '1-across': {
                id: '1-across',
                positions: [[0, 0], [0, 1], [0, 2]]
            }
        },
        gridManager: {
            cells: {
                '0,0': td,
                '0,1': td,
                '0,2': td
            }
        },
        display: {
            updateStatus(message) {
                statuses.push(message);
            }
        },
        _updateInstantMistakeUI() {},
        _refreshInstantMistakeHighlights: playMethods._refreshInstantMistakeHighlights,
        _clearPlayFeedbackStates: playMethods._clearPlayFeedbackStates,
        _applyInstantMistakeStateAt: playMethods._applyInstantMistakeStateAt,
        _getSolutionLetterAt: playMethods._getSolutionLetterAt
    };

    const enabled = playMethods.toggleInstantMistakeMode.call(app);

    assert.equal(enabled, true);
    assert.equal(app.isInstantMistakeMode, true);
    assert.match(statuses.at(-1), /Instant mistake mode enabled/);
    assert.equal(
        incorrectOps.some((entry) => entry[0] === 'add' && entry[1] === 'incorrect'),
        true
    );
});

test('GridManager setCell invokes instant mistake updates after play entry changes', () => {
    const manager = new GridManager({
        '0,0': {
            classList: {
                contains() {
                    return false;
                },
                remove() {}
            },
            querySelector() {
                return { textContent: '' };
            }
        }
    });

    let appliedAt = null;
    const coordinator = {
        grid: [['']],
        _applyInstantMistakeStateAt(r, c) {
            appliedAt = { r, c };
        }
    };

    manager._setCell(0, 0, 'A', coordinator);

    assert.deepEqual(appliedAt, { r: 0, c: 0 });
    assert.equal(coordinator.grid[0][0], 'A');
});
