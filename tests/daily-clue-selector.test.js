import test from 'node:test';
import assert from 'node:assert/strict';
import {
    assessClueConfidence,
    isUsableDailyClue,
    scoreDailyClue,
    selectDailyClue
} from '../scripts/puzzle-of-the-day/clue-selector.mjs';

test('daily clue selection rejects cross-references and answer giveaways', () => {
    assert.equal(isUsableDailyClue('ASSAULT', 'See 12-Down'), false);
    assert.equal(isUsableDailyClue('ASSAULT', 'An assault'), false);
    assert.equal(isUsableDailyClue('YES', 'Is this entry on the bottom row?'), false);
    assert.equal(isUsableDailyClue('ERR', 'Fuck up'), false);
    assert.equal(isUsableDailyClue('AWE', 'Inspire awe in'), false);
    assert.equal(isUsableDailyClue('ASSAULT', 'Onslaught'), true);
});

test('clue confidence recognizes semantic support and flags unsupported wordplay', () => {
    const supported = assessClueConfidence('FIR', {
        c: 'Many a Christmas tree',
        s: 'LAT',
        d: '2022',
        semanticText: 'fir evergreen tree wood'
    }, 'easy');
    const unsupported = assessClueConfidence('ACT', {
        c: 'Neko Atsume find',
        s: '7XW',
        d: '2021',
        semanticText: 'action deed perform behave'
    }, 'medium');

    assert.ok(supported.confidence > unsupported.confidence);
    assert.ok(unsupported.reasons.includes('no-semantic-overlap'));
});

test('easy clue scoring prefers direct wording while hard scoring rewards wordplay', () => {
    const direct = { c: 'Introduction', s: '7XW', d: '2021' };
    const wordplay = { c: 'Opening number?', s: '7XW', d: '2021' };

    assert.ok(scoreDailyClue(direct, 'easy') > scoreDailyClue(wordplay, 'easy'));
    assert.ok(scoreDailyClue(wordplay, 'hard') > scoreDailyClue(direct, 'hard'));
    assert.equal(selectDailyClue('PRELUDE', [wordplay, direct], 'easy', () => 0).clue, 'Introduction');
    assert.equal(selectDailyClue('PRELUDE', [direct, wordplay], 'hard', () => 0).clue, 'Opening number?');
});

test('daily clue selection penalizes recently used clue text', () => {
    const entries = [
        { c: 'House pet', s: 'LAT', d: '2022', semanticText: 'cat pet animal' },
        { c: 'Feline companion', s: 'LAT', d: '2022', semanticText: 'cat feline animal' }
    ];
    const selected = selectDailyClue(
        'CAT',
        entries,
        'medium',
        () => 0,
        new Set(),
        { recentClues: new Set(['house pet']) }
    );

    assert.equal(selected.clue, 'Feline companion');
    assert.equal(selected.repeatedRecently, false);
});
