import test from 'node:test';
import assert from 'node:assert/strict';
import {
    evaluateDailyPuzzle,
    hasRotationalSymmetry,
    summarizeDailyQuality
} from '../utils/DailyPuzzleQuality.js';

const openGrid = Array.from({ length: 3 }, () => Array(3).fill(''));
const strongQuality = {
    CAT: { familiarity: 140, quality: 90, clueCount: 8, shortEligible: true },
    ARE: { familiarity: 130, quality: 90, clueCount: 6, shortEligible: true },
    TEN: { familiarity: 135, quality: 90, clueCount: 5, shortEligible: true }
};

test('hasRotationalSymmetry compares block placement through the center', () => {
    assert.equal(hasRotationalSymmetry([
        ['#', '', ''],
        ['', '', ''],
        ['', '', '#']
    ]), true);
    assert.equal(hasRotationalSymmetry([
        ['#', '', ''],
        ['', '', ''],
        ['', '#', '']
    ]), false);
});

test('evaluateDailyPuzzle rejects disconnected layouts before fill quality', () => {
    const result = evaluateDailyPuzzle([
        ['', '', '', '#', '', '', ''],
        ['', '', '', '#', '', '', ''],
        ['', '', '', '#', '', '', '']
    ], { a: 'CAT' }, strongQuality);

    assert.equal(result.valid, false);
    assert.match(result.reason, /disconnected/i);
});

test('evaluateDailyPuzzle enforces familiarity and produces a stable report', () => {
    const result = evaluateDailyPuzzle(
        openGrid,
        { a: 'CAT', b: 'ARE', c: 'TEN' },
        strongQuality,
        {
            minAverageLength: 3,
            minUniqueRatio: 1,
            minAverageFamiliarity: 120,
            maxLowFamiliarityShare: 0,
            minClueCoverage: 1
        }
    );

    assert.equal(result.valid, true);
    assert.equal(result.averageFamiliarity, 135);
    assert.deepEqual(summarizeDailyQuality(result), {
        score: 351,
        averageLength: 3,
        threeLetterShare: 1,
        uniqueRatio: 1,
        averageFamiliarity: 135,
        lowFamiliarityShare: 0,
        clueCoverage: 1,
        averageLexicalQuality: 90,
        lowLexicalQualityShare: 0,
        properNounShare: 0,
        recentAnswerCount: 0,
        recentAnswerShare: 0,
        ineligibleShortShare: 0,
        slotCount: 3,
        uniqueCount: 3
    });

    const weak = evaluateDailyPuzzle(
        openGrid,
        { a: 'CAT', b: 'ARE', c: 'TEN' },
        { ...strongQuality, TEN: { familiarity: 5, clueCount: 1 } },
        { minAverageFamiliarity: 120 }
    );
    assert.equal(weak.valid, false);
    assert.match(weak.reason, /familiarity/i);

    const weakShortAnswer = evaluateDailyPuzzle(
        openGrid,
        { a: 'CAT', b: 'ARE', c: 'TEN' },
        { ...strongQuality, TEN: { familiarity: 135, clueCount: 5, shortEligible: false } },
        { maxIneligibleShortShare: 0 }
    );
    assert.equal(weakShortAnswer.valid, false);
    assert.match(weakShortAnswer.reason, /short answers/i);

    const repeated = evaluateDailyPuzzle(
        openGrid,
        { a: 'CAT', b: 'ARE', c: 'TEN' },
        strongQuality,
        { recentAnswers: new Set(['CAT']), maxRecentAnswerShare: 0 }
    );
    assert.equal(repeated.valid, false);
    assert.match(repeated.reason, /recent answer share/i);
});
