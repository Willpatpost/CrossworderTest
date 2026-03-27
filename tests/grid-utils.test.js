import test from 'node:test';
import assert from 'node:assert/strict';
import { GridUtils } from '../utils/GridUtils.js';

test('GridUtils identifies slot starts and positions on a rectangular grid', () => {
    const grid = [
        ['#', '', ''],
        ['', '', '#'],
        ['', '#', '']
    ];

    assert.equal(GridUtils.isRectangularGrid(grid), true);
    assert.equal(GridUtils.isStartOfAcrossSlot(grid, 0, 1), true);
    assert.equal(GridUtils.isStartOfDownSlot(grid, 1, 0), true);
    assert.deepEqual(GridUtils.getAcrossSlotPositions(grid, 0, 1), [[0, 1], [0, 2]]);
    assert.deepEqual(GridUtils.getDownSlotPositions(grid, 1, 0), [[1, 0], [2, 0]]);
});

test('GridUtils normalizes mixed cell values', () => {
    assert.equal(GridUtils.normalizeCellValue('a'), 'A');
    assert.equal(GridUtils.normalizeCellValue(' # '), '#');
    assert.equal(GridUtils.normalizeCellValue('7'), '');
    assert.deepEqual(
        GridUtils.normalizeGrid([
            ['a', ' ', '#'],
            ['b', null, 'c']
        ]),
        [
            ['A', '', '#'],
            ['B', '', 'C']
        ]
    );
});
