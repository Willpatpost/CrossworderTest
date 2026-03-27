import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { ConstraintManager } from '../solver/ConstraintManager.js';
import { getNewYorkDateParts, pickPuzzleForDate } from '../utils/PuzzleOfDay.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const indexPath = path.join(rootDir, 'data/puzzles/puzzle_index.json');
const outputPath = path.join(rootDir, 'data/puzzles/puzzle-of-the-day.json');
const solverWorkerPath = path.join(__dirname, 'puzzle-of-the-day/solve-worker.mjs');
const SOLVE_TIMEOUT_MS = 15000;

function rotateEntries(entries, selectedEntry) {
    const selectedIndex = entries.findIndex((entry) => entry.file === selectedEntry.file);
    if (selectedIndex === -1) return entries;
    return [...entries.slice(selectedIndex), ...entries.slice(0, selectedIndex)];
}

async function solveEntry(entry) {
    return await new Promise((resolve, reject) => {
        const worker = new Worker(solverWorkerPath, {
            workerData: {
                slug: entry.id || entry.file,
                filePath: path.join(rootDir, 'data/puzzles', entry.file)
            }
        });

        const timeout = setTimeout(() => {
            worker.terminate();
            reject(new Error(`Timed out while solving ${entry.file}`));
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

async function writePuzzleOfTheDay(dateKey, entry, solvedPayload) {
    const unsolvedGrid = createSolvedGrid(solvedPayload.grid, solvedPayload.solution);
    const constraintManager = new ConstraintManager();
    const { slots } = constraintManager.buildDataStructures(unsolvedGrid);
    const solvedGrid = applySolutionToGrid(
        unsolvedGrid.map((row) => [...row]),
        slots,
        solvedPayload.solution
    );

    const payload = {
        generatedFor: dateKey,
        timezone: 'America/New_York',
        id: `daily-${dateKey}`,
        title: `Puzzle of the Day`,
        sourceId: entry.id || entry.file,
        sourceTitle: solvedPayload.title,
        sourceFile: entry.file,
        sourceAuthor: solvedPayload.metadata.author || entry.author || '',
        sourceDate: solvedPayload.metadata.date || entry.date || '',
        difficulty: solvedPayload.metadata.difficulty || entry.difficulty || '',
        grid: unsolvedGrid,
        solvedGrid,
        solution: solvedPayload.solution,
        clues: solvedPayload.clues || {}
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

    const entries = JSON.parse(await fs.readFile(indexPath, 'utf8'));
    const selected = pickPuzzleForDate(entries, dateKey);

    if (!selected) {
        throw new Error('No eligible puzzles found in puzzle_index.json');
    }

    const candidates = rotateEntries(
        entries.filter((entry) => entry?.dailyEligible !== false),
        selected
    );

    let solved = null;
    let chosenEntry = null;

    for (const entry of candidates) {
        try {
            solved = await solveEntry(entry);
            chosenEntry = entry;
            break;
        } catch (error) {
            console.warn(`Skipping ${entry.file}: ${error.message}`);
        }
    }

    if (!solved || !chosenEntry) {
        throw new Error('Could not solve any eligible puzzle for the daily rotation.');
    }

    const payload = await writePuzzleOfTheDay(dateKey, chosenEntry, solved);
    console.log(
        `Generated puzzle of the day for ${payload.generatedFor} from ${payload.sourceFile}.`
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
