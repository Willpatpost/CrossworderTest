import test from 'node:test';
import assert from 'node:assert/strict';
import { ConstraintManager } from '../solver/ConstraintManager.js';
import { validateDailyPuzzlePack } from '../utils/DailyPuzzlePackValidator.js';

function createPuzzle(size, difficulty) {
    const grid = Array.from({ length: size }, () => Array(size).fill(''));
    const solvedGrid = Array.from({ length: size }, () => Array(size).fill('A'));
    const { slots } = new ConstraintManager().buildDataStructures(grid);
    const solution = {};
    const clues = { across: {}, down: {} };

    Object.values(slots).forEach((slot) => {
        solution[slot.id] = 'A'.repeat(slot.length);
        clues[slot.direction][slot.number] = `Clue for ${slot.id}`;
    });

    return {
        difficulty,
        grid,
        solvedGrid,
        solution,
        clues,
        generationReport: {
            selectedQuality: { slotCount: Object.keys(slots).length },
            clues: {
                clueCount: Object.keys(slots).length,
                averageConfidence: 0.8,
                reviewFlagShare: 0,
                repeatedClueShare: 0
            }
        }
    };
}

function createPack() {
    return {
        schemaVersion: 2,
        generatedFor: '2026-07-18',
        puzzles: {
            easy: createPuzzle(7, 'easy'),
            medium: createPuzzle(11, 'medium'),
            hard: createPuzzle(15, 'hard')
        }
    };
}

test('daily pack validator accepts complete difficulty grids and clues', () => {
    const result = validateDailyPuzzlePack(createPack(), '2026-07-18');
    assert.deepEqual(result, { valid: true, errors: [] });
});

test('daily pack validator reports missing clues and stale dates', () => {
    const pack = createPack();
    delete pack.puzzles.easy.clues.across[1];
    const result = validateDailyPuzzlePack(pack, '2026-07-19');

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => /does not match/.test(error)));
    assert.ok(result.errors.some((error) => /no clue for 1-across/.test(error)));
});
