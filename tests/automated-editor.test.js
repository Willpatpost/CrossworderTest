import test from 'node:test';
import assert from 'node:assert/strict';
import { automatedEditorMethods } from '../app/features/automatedEditor.js';

function createAutomatedEditor(overrides = {}) {
    return {
        _clampAutomatedInteger: automatedEditorMethods._clampAutomatedInteger,
        _selectRandomDividerIndexes: automatedEditorMethods._selectRandomDividerIndexes,
        createRandomAutomatedLayout: automatedEditorMethods.createRandomAutomatedLayout,
        ...overrides
    };
}

test('automated layouts use blocked rows and columns with three-cell minimum runs', () => {
    const editor = createAutomatedEditor();
    const layout = automatedEditorMethods.createRandomAutomatedLayout.call(editor, {
        rows: 11,
        columns: 13,
        blockedRows: 2,
        blockedColumns: 2,
        random: () => 0.25
    });

    assert.equal(layout.grid.length, 11);
    assert.equal(layout.grid[0].length, 13);
    assert.equal(layout.rowDividers.length > 0, true);
    assert.equal(layout.columnDividers.length > 0, true);

    layout.rowDividers.forEach((row) => {
        assert.equal(layout.grid[row].every((cell) => cell === '#'), true);
    });
    layout.columnDividers.forEach((column) => {
        assert.equal(layout.grid.every((row) => row[column] === '#'), true);
    });

    const assertMinimumSpacing = (indexes, size) => {
        const boundaries = [-1, ...indexes, size];
        for (let index = 1; index < boundaries.length; index++) {
            assert.equal(boundaries[index] - boundaries[index - 1] - 1 >= 3, true);
        }
    };
    assertMinimumSpacing(layout.rowDividers, 11);
    assertMinimumSpacing(layout.columnDividers, 13);
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
    assert.equal(layout.rowDividers.length <= 3, true);
    assert.deepEqual(layout.columnDividers, []);
});

test('automated fill preserves blocks and user letters while recording an editable result', async () => {
    let snapshots = 0;
    let solveCalls = 0;
    const editor = {
        grid: [['C', '#'], ['A', 'T']],
        currentSolution: { old: 'CAT' },
        isSolving: false,
        _recordEditorSnapshot() {
            snapshots++;
        },
        rebuildGridState() {},
        syncActiveGridToDOM() {},
        refreshWordList() {},
        async handleSolve() {
            solveCalls++;
            assert.equal(this.grid[0][0], 'C');
            this.grid[1][0] = 'A';
            return true;
        },
        _updateRecentPuzzleUI() {},
        _scheduleEditorAutosave() {}
    };

    const filled = await automatedEditorMethods.fillAutomatedGrid.call(editor);

    assert.equal(filled, true);
    assert.equal(snapshots, 1);
    assert.equal(solveCalls, 1);
    assert.equal(editor.grid[0][0], 'C');
    assert.equal(editor.grid[0][1], '#');
    assert.equal(editor.grid[1][0], 'A');
    assert.deepEqual(editor.activePuzzleSource, {
        kind: 'automated',
        label: 'Automated fill'
    });
});

test('automated fill reports failure without marking the workspace as automated', async () => {
    const editor = {
        grid: [['']],
        isSolving: false,
        _recordEditorSnapshot() {},
        rebuildGridState() {},
        syncActiveGridToDOM() {},
        refreshWordList() {},
        async handleSolve() {
            return false;
        }
    };

    const filled = await automatedEditorMethods.fillAutomatedGrid.call(editor);

    assert.equal(filled, false);
    assert.equal(editor.activePuzzleSource, undefined);
});
