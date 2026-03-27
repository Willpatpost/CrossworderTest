import fs from 'node:fs/promises';
import { parentPort, workerData } from 'node:worker_threads';
import { ConstraintManager } from '../../solver/ConstraintManager.js';
import { SolverEngine } from '../../solver/SolverEngine.js';
import { GridUtils } from '../../utils/GridUtils.js';

async function loadWordsByLength(lengths) {
    const cache = {};

    for (const len of lengths) {
        try {
            const text = await fs.readFile(
                new URL(`../../data/words_by_length/words-${len}.txt`, import.meta.url),
                'utf8'
            );

            cache[len] = text
                .split(/\r?\n/)
                .map((word) => word.trim().toUpperCase())
                .filter(Boolean);
        } catch {
            cache[len] = [];
        }
    }

    return cache;
}

function normalizePuzzleGrid(rawGrid) {
    return rawGrid.map((row) => {
        const cells = Array.isArray(row) ? row : [...String(row)];
        return cells.map((cell) => {
            if (cell === '.' || cell === '#') return '#';
            if (/^[A-Z]$/i.test(cell)) return cell.toUpperCase();
            return '';
        });
    });
}

async function solvePuzzle() {
    const puzzleData = JSON.parse(await fs.readFile(workerData.filePath, 'utf8'));
    const grid = normalizePuzzleGrid(puzzleData.grid);

    const constraintManager = new ConstraintManager();
    const solver = new SolverEngine();
    const { slots, cellContents } = constraintManager.buildDataStructures(grid);

    const lengths = [...new Set(Object.values(slots).map((slot) => slot.length))];
    const wordLengthCache = await loadWordsByLength(lengths);
    const letterFrequencies = GridUtils.calculateLetterFrequencies(wordLengthCache);
    const domains = constraintManager.setupDomains(slots, wordLengthCache, grid);

    const result = await solver.backtrackingSolve(
        slots,
        domains,
        constraintManager.constraints,
        letterFrequencies,
        cellContents,
        {
            allowReuse: false,
            randomize: false
        }
    );

    if (!result.success) {
        throw new Error(`Solver could not fill ${workerData.slug}`);
    }

    parentPort.postMessage({
        slug: workerData.slug,
        title: puzzleData.title || workerData.slug,
        grid: puzzleData.grid,
        solution: result.solution,
        clues: puzzleData.clues || {},
        metadata: {
            difficulty: puzzleData.difficulty || '',
            author: puzzleData.author || '',
            date: puzzleData.date || ''
        }
    });
}

solvePuzzle().catch((error) => {
    parentPort.postMessage({
        error: error.message
    });
});
