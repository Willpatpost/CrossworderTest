import test from 'node:test';
import assert from 'node:assert/strict';
import { pickPuzzleForDate } from '../utils/PuzzleOfDay.js';

test('pickPuzzleForDate is deterministic for a given date', () => {
    const entries = [
        { id: 'easy', dailyEligible: true },
        { id: 'medium', dailyEligible: true },
        { id: 'hard', dailyEligible: true }
    ];

    const first = pickPuzzleForDate(entries, '2026-03-26');
    const second = pickPuzzleForDate(entries, '2026-03-26');

    assert.deepEqual(first, second);
});

test('pickPuzzleForDate ignores entries excluded from daily rotation', () => {
    const entries = [
        { id: 'easy', dailyEligible: false },
        { id: 'medium', dailyEligible: true }
    ];

    const selected = pickPuzzleForDate(entries, '2026-03-26');
    assert.equal(selected.id, 'medium');
});
