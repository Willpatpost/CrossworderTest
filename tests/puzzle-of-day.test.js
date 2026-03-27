import test from 'node:test';
import assert from 'node:assert/strict';
import { pickPuzzleForDate } from '../utils/PuzzleOfDay.js';
import { puzzleMethods } from '../app/features/puzzles.js';

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

test('puzzle grid validation rejects non-rectangular puzzle data', () => {
    assert.throws(
        () => puzzleMethods._assertValidPuzzleGrid(['ABC', 'DE'], 'bad puzzle'),
        /not rectangular/
    );
});

test('puzzle load error formatter maps invalid-grid failures to friendly copy', () => {
    const message = puzzleMethods._formatPuzzleLoadError(
        'bad puzzle',
        new Error('The bad puzzle grid is not rectangular.')
    );

    assert.equal(
        message,
        'Could not load "bad puzzle" because its grid data is invalid.'
    );
});
