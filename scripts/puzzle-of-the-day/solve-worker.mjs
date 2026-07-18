import fs from 'node:fs/promises';
import { parentPort, workerData } from 'node:worker_threads';
import { ConstraintManager } from '../../solver/ConstraintManager.js';
import { SolverEngine } from '../../solver/SolverEngine.js';
import { GridUtils } from '../../utils/GridUtils.js';

async function loadWordsByLength(lengths) {
    const cache = {};

    for (const len of lengths) {
        cache[len] = await loadWordListForLength(len);
    }

    return cache;
}

async function loadWordListForLength(length) {
    const candidatePaths = [
        `../../data/playable_words_by_length/words-${length}.txt`,
        `../../data/words_by_length/words-${length}.txt`
    ];

    for (const candidatePath of candidatePaths) {
        try {
            const text = await fs.readFile(new URL(candidatePath, import.meta.url), 'utf8');
            const words = text
                .split(/\r?\n/)
                .map((word) => word.trim().toUpperCase())
                .filter(Boolean);

            if (words.length) return words;
        } catch {
            continue;
        }
    }

    return [];
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

function shuffleValues(values, random = Math.random) {
    const shuffled = [...values];
    for (let index = shuffled.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
}

function createSeededRandom(seed) {
    let state = 2166136261;
    for (const character of String(seed)) {
        state ^= character.charCodeAt(0);
        state = Math.imul(state, 16777619);
    }

    return () => {
        state += 0x6D2B79F5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

async function solvePuzzle() {
    if (workerData.seed) {
        Math.random = createSeededRandom(workerData.seed);
    }

    const puzzleData = workerData.puzzleData
        || JSON.parse(await fs.readFile(workerData.filePath, 'utf8'));
    const grid = normalizePuzzleGrid(puzzleData.grid);

    const constraintManager = new ConstraintManager();
    const solver = new SolverEngine();
    const { slots, cellContents } = constraintManager.buildDataStructures(grid);

    const lengths = [...new Set(Object.values(slots).map((slot) => slot.length))];
    const wordLengthCache = await loadWordsByLength(lengths);
    const sampleSize = Number(workerData.domainSampleSize) || 0;
    if (sampleSize > 0) {
        const samplePoolSize = Math.max(
            sampleSize,
            Number(workerData.domainSamplePoolSize) || sampleSize
        );
        lengths.forEach((length) => {
            wordLengthCache[length] = shuffleValues(
                wordLengthCache[length].slice(0, samplePoolSize),
                Math.random
            )
                .slice(0, sampleSize);
        });
    }
    const letterFrequencies = GridUtils.calculateLetterFrequencies(wordLengthCache);
    const domains = constraintManager.setupDomains(slots, wordLengthCache, grid);

    const result = await solver.backtrackingSolve(
        slots,
        domains,
        constraintManager.constraints,
        letterFrequencies,
        cellContents,
        {
            allowReuse: workerData.allowReuse ?? true,
            randomize: true
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
