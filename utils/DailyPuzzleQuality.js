import {
    analyzeCrosswordLayout,
    hasConnectedOpenCells
} from './CrosswordLayoutGenerator.js';

export function hasRotationalSymmetry(grid) {
    const rows = grid.length;
    const columns = grid[0]?.length || 0;
    if (!rows || !columns) return false;

    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
            const blocked = grid[row][column] === '#';
            const mirrorBlocked = grid[rows - 1 - row][columns - 1 - column] === '#';
            if (blocked !== mirrorBlocked) return false;
        }
    }

    return true;
}

export function evaluateDailyPuzzle(grid, solution, answerQuality = {}, quality = {}) {
    const analysis = analyzeCrosswordLayout(grid, { maxLength: 15 });
    if (!analysis.valid) return { valid: false, reason: analysis.reason };
    if (!hasConnectedOpenCells(grid)) {
        return { valid: false, reason: 'The layout contains disconnected open sections.' };
    }
    if (!hasRotationalSymmetry(grid)) {
        return { valid: false, reason: 'The layout is not rotationally symmetric.' };
    }

    const answers = Object.values(solution || {}).filter(Boolean);
    if (!answers.length) return { valid: false, reason: 'The filled puzzle has no answers.' };

    const uniqueAnswers = new Set(answers);
    const averageLength = answers.reduce((sum, answer) => sum + answer.length, 0) / answers.length;
    const threeLetterShare = answers.filter((answer) => answer.length === 3).length / answers.length;
    const uniqueRatio = uniqueAnswers.size / answers.length;
    const familiarityScores = answers.map((answer) => Number(answerQuality[answer]?.familiarity) || 0);
    const averageFamiliarity = familiarityScores.reduce((sum, score) => sum + score, 0) / answers.length;
    const lowFamiliarityThreshold = quality.lowFamiliarityThreshold ?? 90;
    const lowFamiliarityCount = familiarityScores.filter((score) => score < lowFamiliarityThreshold).length;
    const lowFamiliarityShare = lowFamiliarityCount / answers.length;
    const answersWithClues = answers.filter((answer) => Number(answerQuality[answer]?.clueCount) > 0).length;
    const clueCoverage = answersWithClues / answers.length;
    const shortAnswers = answers.filter((answer) => answer.length === 3);
    const ineligibleShortAnswers = shortAnswers.filter((answer) => (
        answerQuality[answer]?.shortEligible !== true
    ));
    const ineligibleShortShare = shortAnswers.length
        ? ineligibleShortAnswers.length / shortAnswers.length
        : 0;

    const checks = [
        [averageLength >= (quality.minAverageLength || 0), `Average answer length ${averageLength.toFixed(2)} is below target.`],
        [threeLetterShare <= (quality.maxThreeLetterShare ?? 1), `Three-letter answer share ${(threeLetterShare * 100).toFixed(0)}% is above target.`],
        [uniqueRatio >= (quality.minUniqueRatio || 0), `Unique answer ratio ${(uniqueRatio * 100).toFixed(0)}% is below target.`],
        [averageFamiliarity >= (quality.minAverageFamiliarity || 0), `Average familiarity ${averageFamiliarity.toFixed(1)} is below target.`],
        [lowFamiliarityShare <= (quality.maxLowFamiliarityShare ?? 1), `Low-familiarity answer share ${(lowFamiliarityShare * 100).toFixed(0)}% is above target.`],
        [clueCoverage >= (quality.minClueCoverage || 0), `Clue-history coverage ${(clueCoverage * 100).toFixed(0)}% is below target.`],
        [ineligibleShortShare <= (quality.maxIneligibleShortShare ?? 1), `${ineligibleShortAnswers.length} short answers failed the daily short-answer gate.`]
    ];
    const failedCheck = checks.find(([passes]) => !passes);
    if (failedCheck) return { valid: false, reason: failedCheck[1] };

    const score = (
        (averageFamiliarity * 2)
        + (averageLength * 12)
        + (uniqueRatio * 50)
        + (clueCoverage * 30)
        - (threeLetterShare * 35)
        - (lowFamiliarityShare * 80)
    );

    return {
        valid: true,
        score,
        averageLength,
        threeLetterShare,
        uniqueRatio,
        averageFamiliarity,
        lowFamiliarityThreshold,
        lowFamiliarityCount,
        lowFamiliarityShare,
        clueCoverage,
        ineligibleShortShare,
        slotCount: answers.length,
        uniqueCount: uniqueAnswers.size
    };
}

export function summarizeDailyQuality(result) {
    return {
        score: Number(result.score.toFixed(2)),
        averageLength: Number(result.averageLength.toFixed(2)),
        threeLetterShare: Number(result.threeLetterShare.toFixed(3)),
        uniqueRatio: Number(result.uniqueRatio.toFixed(3)),
        averageFamiliarity: Number(result.averageFamiliarity.toFixed(2)),
        lowFamiliarityShare: Number(result.lowFamiliarityShare.toFixed(3)),
        clueCoverage: Number(result.clueCoverage.toFixed(3)),
        ineligibleShortShare: Number(result.ineligibleShortShare.toFixed(3)),
        slotCount: result.slotCount,
        uniqueCount: result.uniqueCount
    };
}
