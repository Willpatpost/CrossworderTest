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

    assert.deepEqual(result, { success: false });
});
