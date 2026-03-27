import test from 'node:test';
import assert from 'node:assert/strict';
import { CrosswordApp } from '../app/CrosswordApp.js';
import { editorMethods } from '../app/features/editor.js';
import { puzzleMethods } from '../app/features/puzzles.js';
import { playMethods } from '../app/features/play.js';
import { solverMethods } from '../app/features/solver.js';

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
        }
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
        currentSolution: null,
        hasCompletedPlayPuzzle: true,
        display: {
            updateStatus() {}
        },
        importPuzzleGrid() {}
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
        }
    };

    await puzzleMethods.loadRandomPuzzle.call(app);

    assert.deepEqual(importedGrid, [['A', 'T']]);
    assert.deepEqual(app.currentPuzzleClues, { '1-across': 'Authored clue' });
    assert.deepEqual(app.currentSolution, { '1-across': 'AT' });
    assert.deepEqual(buttonStates.at(-1), { disabled: false, reason: undefined });
    assert.match(statuses.at(-1), /Loaded Candidate A \(Author A, 2026-03-26\)\. Loaded 1 authored clues\./);
});
