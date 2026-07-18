import fs from 'node:fs/promises';
import { parentPort, workerData } from 'node:worker_threads';
import { ConstraintManager } from '../../solver/ConstraintManager.js';
import { SolverEngine } from '../../solver/SolverEngine.js';
import { GridUtils } from '../../utils/GridUtils.js';

let dailyBlocklistPromise = null;

async function loadDailyBlocklist() {
    if (!dailyBlocklistPromise) {
        dailyBlocklistPromise = fs.readFile(
            new URL('../../data/daily_blocklist.txt', import.meta.url),
            'utf8'
        ).then((text) => new Set(text
            .split(/\r?\n/)
            .map((word) => word.trim().toUpperCase())
            .filter((word) => word && !word.startsWith('#'))))
            .catch(() => new Set());
    }
    return dailyBlocklistPromise;
}

async function loadWordsByLength(lengths) {
    const cache = {};

    for (const len of lengths) {
        cache[len] = await loadWordListForLength(len);
    }

    return cache;
}

async function loadWordQualityByLength(lengths) {
    const scores = {};
    const metadata = {};

    for (const length of lengths) {
        try {
            const text = await fs.readFile(
                new URL(`../../data/wordnet/entries_by_length/words-${length}.json`, import.meta.url),
                'utf8'
            );
            const entries = JSON.parse(text);
            Object.entries(entries || {}).forEach(([word, entry]) => {
                const normalizedWord = word.toUpperCase();
                const familiarity = Number(entry?.f) || 0;
                const quality = Number(entry?.q) || 0;
                const clueCount = Number(entry?.h?.[0]) || 0;
                const allowlisted = entry?.allow === true;
                const proper = entry?.proper === true;
                const dailyEligible = allowlisted || (
                    normalizedWord.length === 3
                        ? quality >= 80 && clueCount >= 12 && familiarity >= 120 && !proper
                        : normalizedWord.length <= 5
                            ? quality >= 78 && clueCount >= 8 && familiarity >= 115 && (!proper || quality >= 88)
                            : quality >= 78 && clueCount >= 4 && familiarity >= 112 && (!proper || quality >= 88)
                );
                scores[normalizedWord] = familiarity;
                metadata[normalizedWord] = {
                    familiarity,
                    quality,
                    clueCount,
                    recentClueCount: Number(entry?.h?.[1]) || 0,
                    sourceCount: Number(entry?.h?.[2]) || 0,
                    allowlisted,
                    proper,
                    dailyEligible,
                    shortEligible: dailyEligible
                };
            });
        } catch {
            continue;
        }
    }

    return { scores, metadata };
}

async function loadWordListForLength(length) {
    const candidatePaths = [];
    if (workerData.useDailyWordList !== false) {
        candidatePaths.push(`../../data/daily_words_by_length/words-${length}.txt`);
    }
    candidatePaths.push(
        `../../data/playable_words_by_length/words-${length}.txt`,
        `../../data/words_by_length/words-${length}.txt`
    );

    for (const candidatePath of candidatePaths) {
        try {
            const text = await fs.readFile(new URL(candidatePath, import.meta.url), 'utf8');
            const words = text
                .split(/\r?\n/)
                .map((word) => word.trim().toUpperCase())
                .filter(Boolean);

            if (words.length) {
                const blocked = await loadDailyBlocklist();
                return words.filter((word) => !blocked.has(word));
            }
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
    const wordQuality = await loadWordQualityByLength(lengths);
    const excludedAnswers = new Set(
        (workerData.excludedAnswers || []).map((word) => String(word).toUpperCase())
    );
    lengths.forEach((length) => {
        wordLengthCache[length] = wordLengthCache[length].filter((word) => !excludedAnswers.has(word));
    });
    const recentAnswers = new Set(
        (workerData.recentAnswers || []).map((word) => String(word).toUpperCase())
    );
    Object.keys(wordQuality.scores).forEach((word) => {
        if (recentAnswers.has(word)) wordQuality.scores[word] -= 180;
    });
    if (workerData.useDailyWordList !== false && wordLengthCache[3]) {
        wordLengthCache[3] = wordLengthCache[3].filter((word) => (
            wordQuality.metadata[word]?.shortEligible === true
        ));
    }
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
            randomize: workerData.randomize ?? true,
            wordHistoryScores: wordQuality.scores,
            qualityFirst: workerData.qualityFirst ?? false
        }
    );

    if (!result.success) {
        throw new Error(`Solver could not fill ${workerData.slug}`);
    }

    const answerQuality = {};
    Object.values(result.solution).forEach((word) => {
        answerQuality[word] = wordQuality.metadata[word] || {
            familiarity: 0,
            quality: 0,
            clueCount: 0,
            recentClueCount: 0,
            sourceCount: 0,
            allowlisted: false,
            proper: false,
            dailyEligible: false,
            shortEligible: false
        };
    });

    parentPort.postMessage({
        slug: workerData.slug,
        title: puzzleData.title || workerData.slug,
        grid: puzzleData.grid,
        solution: result.solution,
        answerQuality,
        solverStats: result.stats,
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
