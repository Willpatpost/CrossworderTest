import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { ConstraintManager } from '../solver/ConstraintManager.js';
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
        attempts: 12,
        mask: [
            '...#...',
            '...#...',
            '...#...',
            '#######',
            '...#...',
            '...#...',
            '...#...'
        ]
    },
    {
        key: 'medium',
        label: 'Medium',
        attempts: 16,
        mask: [
            '...#...#...',
            '...#...#...',
            '...#...#...',
            '###########',
            '...#...#...',
            '...#...#...',
            '...#...#...',
            '###########',
            '...#...#...',
            '...#...#...',
            '...#...#...'
        ]
    },
    {
        key: 'hard',
        label: 'Hard',
        attempts: 20,
        mask: [
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
        ]
    }
];

async function solveGeneratedPuzzle(puzzleData, seed) {
    return await new Promise((resolve, reject) => {
        const worker = new Worker(solverWorkerPath, {
            workerData: {
                slug: puzzleData.id || seed,
                puzzleData,
                seed,
                domainSampleSize: 80,
                allowReuse: true
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
        const grid = difficulty.mask.map((row) =>
            [...row].map((cell) => cell === '#' ? '#' : '')
        );

        try {
            const solved = await solveGeneratedPuzzle({
                id: `daily-${dateKey}-${difficulty.key}`,
                title: `${difficulty.label} Daily Crossword`,
                difficulty: difficulty.key,
                author: 'Crossworder',
                date: dateKey,
                grid,
                clues: {}
            }, seed);

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

    const puzzleEntries = await Promise.all(
        GENERATED_DIFFICULTIES.map(async (difficulty) => [
            difficulty.key,
            await generateDifficultyPuzzle(dateKey, difficulty)
        ])
    );
    const payload = await writePuzzleOfTheDayPack(dateKey, Object.fromEntries(puzzleEntries));
    console.log(
        `Generated daily puzzle pack for ${payload.generatedFor}: ${Object.keys(payload.puzzles).join(', ')}.`
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
