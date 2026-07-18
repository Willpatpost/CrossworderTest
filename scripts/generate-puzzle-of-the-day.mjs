import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { ConstraintManager } from '../solver/ConstraintManager.js';
import {
    analyzeCrosswordLayout,
    createRandomCrosswordLayout,
    createSeededRandom
} from '../utils/CrosswordLayoutGenerator.js';
import { getNewYorkDateParts } from '../utils/PuzzleOfDay.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outputPath = path.join(rootDir, 'data/puzzles/puzzle-of-the-day.json');
const solverWorkerPath = path.join(__dirname, 'puzzle-of-the-day/solve-worker.mjs');
const SOLVE_TIMEOUT_MS = 30000;
const GENERATED_DIFFICULTIES = [
    {
        key: 'easy',
        label: 'Easy',
        attempts: 18,
        templates: [[
            '...#...',
            '...#...',
            '.......',
            '##...##',
            '.......',
            '...#...',
            '...#...'
        ]],
        layout: {
            rows: 7,
            columns: 7,
            blockedRows: 1,
            blockedColumns: 1,
            attempts: 64,
            densityRange: [0.16, 0.22],
            desiredLengths: [3, 6],
            longRunLimit: 7,
            threeLetterPenalty: 1
        },
        solve: {
            domainSampleSize: 0,
            domainSamplePoolSize: 0,
            allowReuse: false,
            randomize: false
        },
        quality: {
            minAverageLength: 3.6,
            maxThreeLetterShare: 0.85,
            minUniqueRatio: 0.8
        }
    },
    {
        key: 'medium',
        label: 'Medium',
        attempts: 24,
        layout: {
            rows: 11,
            columns: 11,
            blockedRows: 2,
            blockedColumns: 2,
            attempts: 72,
            densityRange: [0.17, 0.24],
            desiredLengths: [4, 8],
            longRunLimit: 10,
            threeLetterPenalty: 2
        },
        solve: {
            domainSampleSize: 0,
            domainSamplePoolSize: 0,
            allowReuse: true,
            randomize: true
        },
        quality: {
            minAverageLength: 4.15,
            maxThreeLetterShare: 0.55,
            minUniqueRatio: 0.7
        }
    },
    {
        key: 'hard',
        label: 'Hard',
        attempts: 8,
        templates: [[
            '...#...#...#...',
            '...#...#...#...',
            '...#...#...#...',
            '###############',
            '...#...#...#...',
            '...#...#...#...',
            '...#...#...#...',
            '###############',
            '...#...#...#...',
            '...#...#...#...',
            '...#...#...#...',
            '###############',
            '...#...#...#...',
            '...#...#...#...',
            '...#...#...#...'
        ]],
        layout: {
            rows: 15,
            columns: 15,
            blockedRows: 3,
            blockedColumns: 3,
            attempts: 84,
            densityRange: [0.18, 0.25],
            desiredLengths: [5, 10],
            longRunLimit: 12,
            threeLetterPenalty: 3
        },
        solve: {
            domainSampleSize: 800,
            domainSamplePoolSize: 3000,
            allowReuse: true,
            randomize: true,
            useDailyWordList: false
        },
        quality: {
            minAverageLength: 3,
            maxThreeLetterShare: 1,
            minUniqueRatio: 0.55
        }
    }
];

async function solveGeneratedPuzzle(puzzleData, seed, solveOptions = {}) {
    return await new Promise((resolve, reject) => {
        const worker = new Worker(solverWorkerPath, {
            workerData: {
                slug: puzzleData.id || seed,
                puzzleData,
                seed,
                domainSampleSize: solveOptions.domainSampleSize ?? 100,
                domainSamplePoolSize: solveOptions.domainSamplePoolSize ?? 140,
                allowReuse: solveOptions.allowReuse ?? true,
                randomize: solveOptions.randomize ?? true,
                useDailyWordList: solveOptions.useDailyWordList ?? true
            }
        });

        const timeout = setTimeout(() => {
            worker.terminate();
            reject(new Error(`Timed out while solving ${puzzleData.id}`));
        }, SOLVE_TIMEOUT_MS);

        worker.once('message', (message) => {
            clearTimeout(timeout);
            worker.terminate();

            if (message?.error) {
                reject(new Error(message.error));
                return;
            }

            resolve(message);
        });

        worker.once('error', (error) => {
            clearTimeout(timeout);
            worker.terminate();
            reject(error);
        });
    });
}

function createSolvedGrid(grid, solution) {
    return grid.map((row) => {
        const cells = Array.isArray(row) ? [...row] : [...String(row)];
        return cells.map((cell) => {
            if (cell === '.' || cell === '#') return '#';
            if (/^[A-Z]$/i.test(cell)) return cell.toUpperCase();
            return '';
        });
    });
}

function applySolutionToGrid(grid, slots, solution) {
    const solvedGrid = grid.map((row) => [...row]);

    Object.entries(slots).forEach(([slotId, slot]) => {
        const word = solution[slotId] || '';
        slot.positions.forEach(([r, c], index) => {
            solvedGrid[r][c] = word[index] || solvedGrid[r][c] || '';
        });
    });

    return solvedGrid;
}

function createDailyLayout(difficulty, seed) {
    if (difficulty.templates?.length) {
        const random = createSeededRandom(seed);
        const template = difficulty.templates[
            Math.floor(random() * difficulty.templates.length)
        ];
        return template.map((row) => [...row].map((cell) => cell === '#' ? '#' : ''));
    }

    const layout = createRandomCrosswordLayout({
        ...difficulty.layout,
        random: createSeededRandom(seed)
    });

    if (!layout.analysis.valid) {
        throw new Error(layout.analysis.reason);
    }

    return layout.grid.map((row) =>
        row.map((cell) => cell === '#' ? '#' : '')
    );
}

function evaluateSolvedPuzzle(grid, solution, quality = {}) {
    const analysis = analyzeCrosswordLayout(grid, { maxLength: 15 });
    if (!analysis.valid) return { valid: false, reason: analysis.reason };

    const answers = Object.values(solution || {}).filter(Boolean);
    if (!answers.length) return { valid: false, reason: 'The filled puzzle has no answers.' };

    const uniqueAnswers = new Set(answers);
    const averageLength = answers.reduce((sum, answer) => sum + answer.length, 0) / answers.length;
    const threeLetterShare = answers.filter((answer) => answer.length === 3).length / answers.length;
    const uniqueRatio = uniqueAnswers.size / answers.length;

    if (averageLength < (quality.minAverageLength || 0)) {
        return {
            valid: false,
            reason: `Average answer length ${averageLength.toFixed(2)} is below target.`
        };
    }

    if (threeLetterShare > (quality.maxThreeLetterShare ?? 1)) {
        return {
            valid: false,
            reason: `Three-letter answer share ${(threeLetterShare * 100).toFixed(0)}% is above target.`
        };
    }

    if (uniqueRatio < (quality.minUniqueRatio || 0)) {
        return {
            valid: false,
            reason: `Unique answer ratio ${(uniqueRatio * 100).toFixed(0)}% is below target.`
        };
    }

    return {
        valid: true,
        averageLength,
        threeLetterShare,
        uniqueRatio,
        slotCount: answers.length,
        uniqueCount: uniqueAnswers.size
    };
}

function buildDailyPuzzlePayload(dateKey, difficulty, solvedPayload, seed) {
    const unsolvedGrid = createSolvedGrid(solvedPayload.grid, solvedPayload.solution);
    const constraintManager = new ConstraintManager();
    const { slots } = constraintManager.buildDataStructures(unsolvedGrid);
    const solvedGrid = applySolutionToGrid(
        unsolvedGrid.map((row) => [...row]),
        slots,
        solvedPayload.solution
    );

    return {
        generatedFor: dateKey,
        timezone: 'America/New_York',
        id: `daily-${dateKey}-${difficulty.key}`,
        title: `${difficulty.label} Daily Crossword`,
        seed,
        sourceId: `generated:${difficulty.key}`,
        sourceTitle: `${difficulty.label} generated layout`,
        sourceAuthor: 'Crossworder',
        sourceDate: dateKey,
        difficulty: difficulty.key,
        grid: unsolvedGrid,
        solvedGrid,
        solution: solvedPayload.solution,
        clues: solvedPayload.clues || {}
    };
}

async function generateDifficultyPuzzle(dateKey, difficulty) {
    let lastError = null;

    for (let attempt = 1; attempt <= difficulty.attempts; attempt++) {
        const seed = `${dateKey}:${difficulty.key}:${attempt}`;

        try {
            const grid = createDailyLayout(difficulty, seed);
            const solved = await solveGeneratedPuzzle({
                id: `daily-${dateKey}-${difficulty.key}`,
                title: `${difficulty.label} Daily Crossword`,
                difficulty: difficulty.key,
                author: 'Crossworder',
                date: dateKey,
                grid,
                clues: {}
            }, seed, difficulty.solve);
            const quality = evaluateSolvedPuzzle(grid, solved.solution, difficulty.quality);
            if (!quality.valid) {
                throw new Error(quality.reason);
            }

            return buildDailyPuzzlePayload(dateKey, difficulty, solved, seed);
        } catch (error) {
            lastError = error;
            console.warn(`Skipping ${difficulty.key} attempt ${attempt}: ${error.message}`);
        }
    }

    throw new Error(
        `Could not generate a ${difficulty.label.toLowerCase()} daily puzzle after ${difficulty.attempts} attempts.${lastError ? ` Last error: ${lastError.message}` : ''}`
    );
}

async function writePuzzleOfTheDayPack(dateKey, puzzles) {
    const payload = {
        generatedFor: dateKey,
        dateKey,
        timezone: 'America/New_York',
        schemaVersion: 2,
        title: 'Daily Crossword Pack',
        puzzles
    };

    await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
    return payload;
}

async function main() {
    const force = process.argv.includes('--force') || process.env.FORCE_POTD === 'true';
    const { dateKey, hour } = getNewYorkDateParts();

    if (!force && hour !== 0) {
        console.log(`Skipping generation because New York local hour is ${hour}, not midnight.`);
        return;
    }

    const puzzles = {};
    for (const difficulty of GENERATED_DIFFICULTIES) {
        puzzles[difficulty.key] = await generateDifficultyPuzzle(dateKey, difficulty);
    }
    const payload = await writePuzzleOfTheDayPack(dateKey, puzzles);
    console.log(
        `Generated daily puzzle pack for ${payload.generatedFor}: ${Object.keys(payload.puzzles).join(', ')}.`
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
