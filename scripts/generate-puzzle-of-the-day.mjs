import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { ConstraintManager } from '../solver/ConstraintManager.js';
import {
    createRandomCrosswordLayout,
    createSeededRandom
} from '../utils/CrosswordLayoutGenerator.js';
import {
    evaluateDailyPuzzle,
    summarizeDailyQuality
} from '../utils/DailyPuzzleQuality.js';
import { getNewYorkDateParts } from '../utils/PuzzleOfDay.js';
import { assertValidDailyPuzzlePack } from '../utils/DailyPuzzlePackValidator.js';
import { addDailyClues } from './puzzle-of-the-day/clue-selector.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outputPath = path.join(rootDir, 'data/puzzles/puzzle-of-the-day.json');
const solverWorkerPath = path.join(__dirname, 'puzzle-of-the-day/solve-worker.mjs');
const SOLVE_TIMEOUT_MS = 15000;
const GENERATED_DIFFICULTIES = [
    {
        key: 'easy',
        label: 'Easy',
        attempts: 18,
        candidateTarget: 3,
        solveRestarts: 2,
        templates: [
            {
                name: 'pinwheel',
                rows: [
                    '...#...',
                    '...#...',
                    '.......',
                    '##...##',
                    '.......',
                    '...#...',
                    '...#...'
                ]
            },
            {
                name: 'open-corners',
                rows: [
                    '...#...',
                    '.......',
                    '.......',
                    '##...##',
                    '.......',
                    '.......',
                    '...#...'
                ]
            }
        ],
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
            randomize: true,
            qualityFirst: true
        },
        quality: {
            minAverageLength: 3.6,
            maxThreeLetterShare: 0.85,
            minUniqueRatio: 0.9,
            minAverageFamiliarity: 112,
            lowFamiliarityThreshold: 90,
            maxLowFamiliarityShare: 0.12,
            minClueCoverage: 0.95,
            maxIneligibleShortShare: 0
        }
    },
    {
        key: 'medium',
        label: 'Medium',
        attempts: 4,
        candidateTarget: 1,
        solveRestarts: 1,
        templates: [
            {
                name: 'offset-stair',
                rows: [
                    '#.....##...',
                    '......##...',
                    '......#....',
                    '....##.....',
                    '...##.....#',
                    '##.......##',
                    '#.....##...',
                    '.....##....',
                    '....#......',
                    '...##......',
                    '...##.....#'
                ]
            },
            {
                name: 'offset-stair-transposed',
                rows: [
                    '#....##....',
                    '.....#.....',
                    '...........',
                    '....#....##',
                    '...##...###',
                    '...#...#...',
                    '###...##...',
                    '##....#....',
                    '...........',
                    '.....#.....',
                    '....##....#'
                ]
            }
        ],
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
            randomize: false,
            qualityFirst: true
        },
        quality: {
            minAverageLength: 4.15,
            maxThreeLetterShare: 0.55,
            minUniqueRatio: 0.95,
            minAverageFamiliarity: 108,
            lowFamiliarityThreshold: 86,
            maxLowFamiliarityShare: 0.16,
            minClueCoverage: 0.9,
            maxIneligibleShortShare: 0
        }
    },
    {
        key: 'hard',
        label: 'Hard',
        attempts: 4,
        candidateTarget: 1,
        solveRestarts: 2,
        templates: [
            {
                name: 'interlocking-stair',
                rows: [
                    '#...#...####...',
                    '....#...##.....',
                    '........#......',
                    '...#...#.....##',
                    '###....#...#...',
                    '##....#...#....',
                    '....##....#....',
                    '....##...##....',
                    '....#....##....',
                    '....#...#....##',
                    '...#...#....###',
                    '##.....#...#...',
                    '......#........',
                    '.....##...#....',
                    '...####...#...#'
                ]
            },
            {
                name: 'interlocking-stair-transposed',
                rows: [
                    '#...##.....#...',
                    '....##.....#...',
                    '....#..........',
                    '...#......#...#',
                    '##....####....#',
                    '......##.....##',
                    '.....#......###',
                    '...##.....##...',
                    '###......#.....',
                    '##.....##......',
                    '#....####....##',
                    '#...#......#...',
                    '..........#....',
                    '...#.....##....',
                    '...#.....##...#'
                ]
            }
        ],
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
            domainSampleSize: 0,
            domainSamplePoolSize: 0,
            allowReuse: false,
            randomize: true,
            useDailyWordList: true,
            qualityFirst: true
        },
        quality: {
            minAverageLength: 4.1,
            maxThreeLetterShare: 0.55,
            minUniqueRatio: 0.98,
            minAverageFamiliarity: 105,
            lowFamiliarityThreshold: 82,
            maxLowFamiliarityShare: 0.2,
            minClueCoverage: 0.85,
            maxIneligibleShortShare: 0
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
                useDailyWordList: solveOptions.useDailyWordList ?? true,
                qualityFirst: solveOptions.qualityFirst ?? false
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
        const rows = Array.isArray(template) ? template : template.rows;
        return rows.map((row) => [...row].map((cell) => cell === '#' ? '#' : ''));
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

function buildDailyPuzzlePayload(dateKey, difficulty, solvedPayload, seed, generationReport) {
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
        clues: solvedPayload.clues || {},
        generationReport
    };
}

async function generateDifficultyPuzzle(dateKey, difficulty) {
    let lastError = null;
    const candidates = [];
    const report = {
        attemptedLayouts: 0,
        attemptedFills: 0,
        rejectedFills: 0,
        rejectionReasons: {}
    };

    for (let attempt = 1; attempt <= difficulty.attempts; attempt++) {
        const layoutSeed = `${dateKey}:${difficulty.key}:layout:${attempt}`;
        report.attemptedLayouts++;

        try {
            const grid = createDailyLayout(difficulty, layoutSeed);

            for (let restart = 1; restart <= (difficulty.solveRestarts || 1); restart++) {
                const seed = `${layoutSeed}:fill:${restart}`;
                report.attemptedFills++;

                try {
                    const solved = await solveGeneratedPuzzle({
                        id: `daily-${dateKey}-${difficulty.key}`,
                        title: `${difficulty.label} Daily Crossword`,
                        difficulty: difficulty.key,
                        author: 'Crossworder',
                        date: dateKey,
                        grid,
                        clues: {}
                    }, seed, difficulty.solve);
                    const quality = evaluateDailyPuzzle(
                        grid,
                        solved.solution,
                        solved.answerQuality,
                        difficulty.quality
                    );
                    if (!quality.valid) throw new Error(quality.reason);

                    candidates.push({ grid, solved, seed, quality });
                    if (candidates.length >= difficulty.candidateTarget) break;
                } catch (error) {
                    lastError = error;
                    report.rejectedFills++;
                    report.rejectionReasons[error.message] = (report.rejectionReasons[error.message] || 0) + 1;
                    console.warn(`Skipping ${difficulty.key} fill ${attempt}.${restart}: ${error.message}`);
                }
            }
        } catch (error) {
            lastError = error;
            report.rejectedFills++;
            report.rejectionReasons[error.message] = (report.rejectionReasons[error.message] || 0) + 1;
            console.warn(`Skipping ${difficulty.key} layout ${attempt}: ${error.message}`);
        }

        if (candidates.length >= difficulty.candidateTarget) break;
    }

    if (candidates.length) {
        candidates.sort((left, right) => right.quality.score - left.quality.score);
        const winner = candidates[0];
        return buildDailyPuzzlePayload(dateKey, difficulty, winner.solved, winner.seed, {
            ...report,
            acceptedCandidates: candidates.length,
            selectedQuality: summarizeDailyQuality(winner.quality),
            solverStats: winner.solved.solverStats || null
        });
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

    assertValidDailyPuzzlePack(payload, dateKey);
    const temporaryPath = `${outputPath}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`);
    await fs.rename(temporaryPath, outputPath);
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
    await addDailyClues(puzzles, dateKey);
    const payload = await writePuzzleOfTheDayPack(dateKey, puzzles);
    console.log(
        `Generated daily puzzle pack for ${payload.generatedFor}: ${Object.keys(payload.puzzles).join(', ')}.`
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
