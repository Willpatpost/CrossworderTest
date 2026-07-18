import test from 'node:test';
import assert from 'node:assert/strict';
import { automatedEditorMethods } from '../app/features/automatedEditor.js';

function createAutomatedEditor(overrides = {}) {
    return {
        ...automatedEditorMethods,
        display: { updateStatus() {} },
        editorHistory: [],
        editorFuture: [],
        _automationRunId: 0,
        isAutomating: false,
        _updateSolveControls() {},
        _updateRecentPuzzleUI() {},
        _scheduleEditorAutosave() {},
        ...overrides
    };
}

function countBlocks(grid) {
    return grid.reduce(
        (count, row) => count + row.filter((cell) => cell === '#').length,
        0
    );
}

test('automated layouts use rotational blocks without full dividers or short runs', () => {
    const editor = createAutomatedEditor();
    const layout = automatedEditorMethods.createRandomAutomatedLayout.call(editor, {
        rows: 11,
        columns: 13,
        blockedRows: 2,
        blockedColumns: 2,
        random: editor._createSeededRandom('layout-quality')
    });

    assert.equal(layout.grid.length, 11);
    assert.equal(layout.grid[0].length, 13);
    assert.equal(layout.rowDividers.length, 0);
    assert.equal(layout.columnDividers.length, 0);
    assert.equal(countBlocks(layout.grid) > 0, true);
    assert.equal(editor._hasAutomatedFullDivider(layout.grid), false);
    assert.equal(editor._hasConnectedAutomatedOpenCells(layout.grid), true);

    for (let r = 0; r < layout.grid.length; r++) {
        for (let c = 0; c < layout.grid[0].length; c++) {
            const mirrorR = layout.grid.length - 1 - r;
            const mirrorC = layout.grid[0].length - 1 - c;
            assert.equal(layout.grid[r][c], layout.grid[mirrorR][mirrorC]);
        }
    }

    const analysis = editor._analyzeAutomatedLayout(layout.grid);
    assert.equal(analysis.valid, true);
    assert.equal(analysis.slotLengths.every((length) => length >= 3 && length <= 21), true);
});

test('automated layout dimensions and divider counts are bounded', () => {
    const editor = createAutomatedEditor();
    const layout = automatedEditorMethods.createRandomAutomatedLayout.call(editor, {
        rows: 100,
        columns: 2,
        blockedRows: 20,
        blockedColumns: -4,
        random: () => 0.5
    });

    assert.equal(layout.grid.length, 25);
    assert.equal(layout.grid[0].length, 7);
    assert.equal(layout.blockCount <= layout.targetBlockCount + 1, true);
    assert.deepEqual(layout.columnDividers, []);
});

test('blank automated seeds produce fresh layout seeds without pinning the input', () => {
    const originalDocument = globalThis.document;
    const seedInput = { value: '' };
    let seedCounter = 0;
    const seeds = [];
    const editor = createAutomatedEditor({
        _createAutomatedSeed() {
            seedCounter++;
            return `generated-${seedCounter}`;
        },
        createRandomAutomatedLayout(settings) {
            seeds.push(settings.seed);
            return {
                grid: Array.from({ length: 7 }, () => Array(7).fill('')),
                rowDividers: [],
                columnDividers: [],
                blockCount: 0,
                targetBlockCount: 0
            };
        },
        importPuzzleGrid(grid) {
            this.grid = grid.map((row) => [...row]);
        }
    });

    globalThis.document = {
        getElementById(id) {
            return id === 'automated-seed-input' ? seedInput : null;
        }
    };

    try {
        const first = editor.generateAutomatedLayout({ rows: 7, columns: 7, seed: '' });
        const second = editor.generateAutomatedLayout({ rows: 7, columns: 7, seed: '' });

        assert.equal(first.seed, 'generated-1');
        assert.equal(second.seed, 'generated-2');
        assert.deepEqual(seeds, ['generated-1', 'generated-2']);
        assert.equal(seedInput.value, '');
    } finally {
        globalThis.document = originalDocument;
    }
});

test('seeded automated layouts are reproducible', () => {
    const editor = createAutomatedEditor();
    const settings = {
        rows: 15,
        columns: 15,
        blockedRows: 2,
        blockedColumns: 2
    };
    const first = editor.createRandomAutomatedLayout({
        ...settings,
        random: editor._createSeededRandom('daily-seed')
    });
    const second = editor.createRandomAutomatedLayout({
        ...settings,
        random: editor._createSeededRandom('daily-seed')
    });

    assert.deepEqual(first, second);
});

test('automated layout validation rejects unsupported entry lengths', () => {
    const editor = createAutomatedEditor();
    const valid = editor._analyzeAutomatedLayout(
        Array.from({ length: 7 }, () => Array(7).fill(''))
    );
    const unsupported = editor._analyzeAutomatedLayout(
        Array.from({ length: 7 }, () => Array(25).fill(''))
    );

    assert.equal(valid.valid, true);
    assert.equal(unsupported.valid, false);
    assert.match(unsupported.reason, /outside the bundled 3-21 letter word data/);
});

test('automated fill preserves blocks and user letters while recording an editable result', async () => {
    let solveCalls = 0;
    const originalGrid = [
        ['C', '', 'T', '', '', '', ''],
        ['', '', '', '', '', '', ''],
        ['', '', '', '', '', '', ''],
        ['', '', '', '#', '', '', ''],
        ['', '', '', '', '', '', ''],
        ['', '', '', '', '', '', ''],
        ['A', '', 'E', '', '', '', '']
    ];
    const editor = createAutomatedEditor({
        grid: originalGrid.map((row) => [...row]),
        currentSolution: { old: 'CAT' },
        isSolving: false,
        _captureEditorState() {
            return { grid: this.grid.map((row) => [...row]) };
        },
        rebuildGridState() {},
        syncActiveGridToDOM() {},
        refreshWordList() {},
        async handleSolve() {
            solveCalls++;
            assert.equal(this.grid[0][0], 'C');
            this.grid[1][0] = 'A';
            return true;
        }
    });

    const filled = await editor.fillAutomatedGrid();

    assert.equal(filled, true);
    assert.equal(editor.editorHistory.length, 1);
    assert.deepEqual(editor.editorHistory[0].grid, originalGrid);
    assert.equal(solveCalls, 1);
    assert.equal(editor.grid[0][0], 'C');
    assert.equal(editor.grid[3][3], '#');
    assert.equal(editor.grid[1][0], 'A');
    assert.deepEqual(editor.activePuzzleSource, {
        kind: 'automated',
        label: 'Automated fill'
    });
});

test('automated fill reports failure without marking the workspace as automated', async () => {
    const editor = createAutomatedEditor({
        grid: Array.from({ length: 3 }, () => Array(3).fill('')),
        isSolving: false,
        _captureEditorState() {
            return { grid: this.grid.map((row) => [...row]) };
        },
        rebuildGridState() {},
        syncActiveGridToDOM() {},
        refreshWordList() {},
        async handleSolve() {
            return false;
        }
    });

    const filled = await editor.fillAutomatedGrid();

    assert.equal(filled, false);
    assert.equal(editor.editorHistory.length, 0);
    assert.equal(editor.activePuzzleSource, undefined);
});

test('generate and fill retries layouts and commits one undo state', async () => {
    const attempts = [];
    const originalGrid = Array.from({ length: 3 }, () => Array(3).fill('O'));
    const editor = createAutomatedEditor({
        grid: originalGrid.map((row) => [...row]),
        _captureEditorState() {
            return { grid: this.grid.map((row) => [...row]) };
        },
        generateAutomatedLayout(settings) {
            attempts.push(settings.seed);
            this.grid = Array.from({ length: 7 }, () => Array(7).fill(''));
            return { grid: this.grid, seed: settings.seed };
        },
        async handleSolve() {
            return attempts.length === 3;
        }
    });

    const filled = await editor.generateAndFillAutomatedGrid({
        rows: 7,
        columns: 7,
        blockedRows: 0,
        blockedColumns: 0,
        attempts: 4,
        seed: 'reliable'
    });

    assert.equal(filled, true);
    assert.deepEqual(attempts, ['reliable:1', 'reliable:2', 'reliable:3']);
    assert.equal(editor.editorHistory.length, 1);
    assert.deepEqual(editor.editorHistory[0].grid, originalGrid);
    assert.equal(editor.activePuzzleSource.seed, 'reliable:3');
});

test('generate and fill restores the original workspace after all attempts fail', async () => {
    const originalGrid = Array.from({ length: 3 }, () => Array(3).fill('O'));
    let restores = 0;
    const editor = createAutomatedEditor({
        grid: originalGrid.map((row) => [...row]),
        _captureEditorState() {
            return { grid: this.grid.map((row) => [...row]) };
        },
        _restoreEditorState(state) {
            restores++;
            this.grid = state.grid.map((row) => [...row]);
        },
        generateAutomatedLayout(settings) {
            this.grid = Array.from({ length: 7 }, () => Array(7).fill(''));
            return { grid: this.grid, seed: settings.seed };
        },
        async handleSolve() {
            return false;
        }
    });

    const filled = await editor.generateAndFillAutomatedGrid({
        rows: 7,
        columns: 7,
        attempts: 2,
        seed: 'impossible'
    });

    assert.equal(filled, false);
    assert.equal(restores, 1);
    assert.deepEqual(editor.grid, originalGrid);
    assert.equal(editor.editorHistory.length, 0);
});
