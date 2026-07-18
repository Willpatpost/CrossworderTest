import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isUsableDailyClue,
    scoreDailyClue,
    selectDailyClue
} from '../scripts/puzzle-of-the-day/clue-selector.mjs';

test('daily clue selection rejects cross-references and answer giveaways', () => {
    assert.equal(isUsableDailyClue('ASSAULT', 'See 12-Down'), false);
    assert.equal(isUsableDailyClue('ASSAULT', 'An assault'), false);
    assert.equal(isUsableDailyClue('YES', 'Is this entry on the bottom row?'), false);
    assert.equal(isUsableDailyClue('ERR', 'Fuck up'), false);
    assert.equal(isUsableDailyClue('ASSAULT', 'Onslaught'), true);
});

test('easy clue scoring prefers direct wording while hard scoring rewards wordplay', () => {
    const direct = { c: 'Introduction', s: '7XW', d: '2021' };
    const wordplay = { c: 'Opening number?', s: '7XW', d: '2021' };

    assert.ok(scoreDailyClue(direct, 'easy') > scoreDailyClue(wordplay, 'easy'));
    assert.ok(scoreDailyClue(wordplay, 'hard') > scoreDailyClue(direct, 'hard'));
    assert.equal(selectDailyClue('PRELUDE', [wordplay, direct], 'easy', () => 0).clue, 'Introduction');
    assert.equal(selectDailyClue('PRELUDE', [direct, wordplay], 'hard', () => 0).clue, 'Opening number?');
});
