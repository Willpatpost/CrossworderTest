import test from 'node:test';
import assert from 'node:assert/strict';
import {
    appendDailyHistory,
    collectRecentUsage,
    createHistoryEntry,
    createLayoutSignature
} from '../utils/DailyPuzzleHistory.js';

function pack(date, answer = 'CAT', clue = 'House pet') {
    return {
        generatedFor: date,
        puzzles: {
            easy: {
                grid: [['', '', '']],
                solution: { '1-across': answer },
                clues: { across: { 1: clue }, down: {} }
            }
        }
    };
}

test('daily history stores compact answer, clue, and layout usage', () => {
    const entry = createHistoryEntry(pack('2026-07-18'));
    assert.deepEqual(entry.puzzles.easy.answers, ['CAT']);
    assert.deepEqual(entry.puzzles.easy.clues, ['House pet']);
    assert.equal(entry.puzzles.easy.layout, '...');
    assert.equal(createLayoutSignature([['#', '', '']]), '#..');
});

test('daily history replaces same-date entries and excludes the active date from recent usage', () => {
    let history = appendDailyHistory({ entries: [] }, pack('2026-07-17', 'DOG', 'House pet'));
    history = appendDailyHistory(history, pack('2026-07-18', 'CAT', 'House pet'));
    history = appendDailyHistory(history, pack('2026-07-18', 'OWL', 'Night bird'));

    assert.deepEqual(history.entries.map((entry) => entry.date), ['2026-07-18', '2026-07-17']);
    const usage = collectRecentUsage(history, pack('2026-07-18', 'OWL', 'Night bird'), '2026-07-18');
    assert.deepEqual([...usage.easy.answers], ['DOG']);
    assert.deepEqual([...usage.easy.clues], ['house pet']);
});
