import test from 'node:test';
import assert from 'node:assert/strict';
import { ConstraintManager } from '../solver/ConstraintManager.js';

test('ConstraintManager builds slots, contents, and overlaps from a grid', () => {
    const manager = new ConstraintManager();
    const grid = [
        ['', '', '#'],
        ['', '#', '#'],
        ['#', '#', '#']
    ];

    const { slots, cellContents } = manager.buildDataStructures(grid);

    assert.deepEqual(Object.keys(slots).sort(), ['1-across', '1-down']);
    assert.equal(cellContents['0,0'], '');
    assert.equal(cellContents['0,2'], '');
    assert.deepEqual(manager.getOverlap('1-across', '1-down'), [[0, 0]]);
    assert.equal(manager.getOverlap('1-across', '2-down'), null);
});

test('ConstraintManager filters domains against fixed letters in the grid', () => {
    const manager = new ConstraintManager();
    const slots = {
        '1-across': {
            id: '1-across',
            direction: 'across',
            number: 1,
            length: 3,
            positions: [[0, 0], [0, 1], [0, 2]]
        }
    };

    const domains = manager.setupDomains(
        slots,
        { 3: ['CAT', 'CAR', 'DOG'] },
        [['C', '', 'T']]
    );

    assert.deepEqual(domains['1-across'], ['CAT']);
});

test('ConstraintManager reuses cached pattern domains across matching slots', () => {
    const manager = new ConstraintManager();
    const slots = {
        '1-across': { id: '1-across', length: 3, positions: [[0, 0], [0, 1], [0, 2]] },
        '2-across': { id: '2-across', length: 3, positions: [[1, 0], [1, 1], [1, 2]] }
    };
    const grid = [
        ['C', '', ''],
        ['C', '', '']
    ];

    const domains = manager.setupDomains(slots, { 3: ['CAT', 'CAR', 'DOG'] }, grid);

    assert.deepEqual(domains['1-across'], ['CAT', 'CAR']);
    assert.deepEqual(domains['2-across'], ['CAT', 'CAR']);
    assert.equal(manager.patternCache.size, 1);
});
