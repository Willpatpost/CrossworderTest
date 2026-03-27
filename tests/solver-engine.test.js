import test from 'node:test';
import assert from 'node:assert/strict';
import { SolverEngine } from '../solver/SolverEngine.js';

test('SolverEngine solves a simple two-slot crossing puzzle', async () => {
    const solver = new SolverEngine();
    const slots = {
        '1-across': {
            id: '1-across',
            direction: 'across',
            number: 1,
            length: 3,
            positions: [[0, 0], [0, 1], [0, 2]]
        },
        '1-down': {
            id: '1-down',
            direction: 'down',
            number: 1,
            length: 3,
            positions: [[0, 0], [1, 0], [2, 0]]
        }
    };
    const domains = {
        '1-across': ['CAT', 'CAR'],
        '1-down': ['COW', 'DOG']
    };
    const constraints = {
        '1-across': {
            '1-down': [[0, 0]]
        },
        '1-down': {
            '1-across': [[0, 0]]
        }
    };

    const result = await solver.backtrackingSolve(
        slots,
        domains,
        constraints,
        {},
        {}
    );

    assert.equal(result.success, true);
    assert.equal(result.solution['1-down'], 'COW');
    assert.match(result.solution['1-across'], /^CA[TR]$/);
});

test('SolverEngine reports unsolved when AC-3 empties a domain', async () => {
    const solver = new SolverEngine();
    const result = await solver.backtrackingSolve(
        {
            a: { id: 'a', length: 2, positions: [[0, 0], [0, 1]] },
            b: { id: 'b', length: 2, positions: [[0, 0], [1, 0]] }
        },
        {
            a: ['AT'],
            b: ['NO']
        },
        {
            a: { b: [[0, 0]] },
            b: { a: [[0, 0]] }
        },
        {},
        {}
    );

    assert.equal(result.success, false);
    assert.equal(typeof result.stats.recursiveCalls, 'number');
});

test('SolverEngine orderDomainValues prefers least-constraining values deterministically', () => {
    const solver = new SolverEngine();
    const ordered = solver.orderDomainValues(
        '1-across',
        {
            '1-across': ['CAT', 'CAR'],
            '1-down': ['TEN', 'RUG', 'RAT']
        },
        {
            '1-across': {
                '1-down': [[2, 0]]
            }
        },
        {},
        {}
    );

    assert.deepEqual(ordered, ['CAR', 'CAT']);
});

test('SolverEngine returns deterministic stats when randomization is disabled', async () => {
    const solver = new SolverEngine();
    const result = await solver.backtrackingSolve(
        {
            a: { id: 'a', length: 3, positions: [[0, 0], [0, 1], [0, 2]] }
        },
        {
            a: ['CAT', 'CAR']
        },
        {
            a: {}
        },
        {},
        {},
        {
            randomize: false
        }
    );

    assert.equal(result.success, true);
    assert.equal(result.stats.randomized, false);
    assert.equal(typeof result.stats.elapsedMs, 'number');
});

test('SolverEngine prioritizes a preferred slot before other MRV ties', () => {
    const solver = new SolverEngine();
    solver.preferredSlotId = 'b';

    const selected = solver.selectUnassignedVariable(
        {},
        {
            a: ['AT', 'AN'],
            b: ['TO', 'DO']
        },
        {
            a: {},
            b: {}
        }
    );

    assert.equal(selected, 'b');
});
