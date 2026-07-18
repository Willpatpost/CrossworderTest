export function clampInteger(value, min, max, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

export function createSeededRandom(seed) {
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

export function shuffleValues(values, random = Math.random) {
    const shuffled = [...values];
    for (let index = shuffled.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
}

export function analyzeCrosswordLayout(grid, { minLength = 3, maxLength = 21 } = {}) {
    if (
        !Array.isArray(grid) ||
        !grid.length ||
        !Array.isArray(grid[0]) ||
        !grid[0].length ||
        !grid.every((row) => Array.isArray(row) && row.length === grid[0].length)
    ) {
        return { valid: false, reason: 'The generated grid is empty or malformed.', slotLengths: [] };
    }

    const lengths = [];
    const collectRuns = (values) => {
        let runLength = 0;
        for (const value of [...values, '#']) {
            if (value !== '#') {
                runLength++;
            } else {
                if (runLength > 0) lengths.push(runLength);
                runLength = 0;
            }
        }
    };

    grid.forEach(collectRuns);
    for (let column = 0; column < grid[0].length; column++) {
        collectRuns(grid.map((row) => row[column]));
    }

    if (!lengths.length) {
        return { valid: false, reason: 'The layout does not contain any fillable entries.', slotLengths: [] };
    }

    const unsupported = [...new Set(lengths.filter((length) => length < minLength || length > maxLength))]
        .sort((left, right) => left - right);
    if (unsupported.length) {
        return {
            valid: false,
            reason: `Entry length${unsupported.length === 1 ? '' : 's'} ${unsupported.join(', ')} ${unsupported.length === 1 ? 'is' : 'are'} outside the bundled ${minLength}-${maxLength} letter word data. Add dividers or reduce the grid size.`,
            slotLengths: lengths
        };
    }

    return { valid: true, reason: '', slotLengths: lengths };
}

export function cloneGrid(grid) {
    return grid.map((row) => [...row]);
}

export function countBlocks(grid) {
    return grid.reduce(
        (count, row) => count + row.filter((cell) => cell === '#').length,
        0
    );
}

export function hasFullDivider(grid) {
    if (!grid.length || !grid[0]?.length) return true;
    if (grid.some((row) => row.every((cell) => cell === '#'))) return true;

    for (let column = 0; column < grid[0].length; column++) {
        if (grid.every((row) => row[column] === '#')) return true;
    }

    return false;
}

export function hasConnectedOpenCells(grid) {
    const rows = grid.length;
    const columns = grid[0]?.length || 0;
    let firstOpen = null;
    let openCount = 0;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < columns; c++) {
            if (grid[r][c] === '#') continue;
            openCount++;
            if (!firstOpen) firstOpen = [r, c];
        }
    }

    if (!firstOpen) return false;

    const visited = new Set();
    const queue = [firstOpen];
    visited.add(firstOpen.join(','));

    for (let index = 0; index < queue.length; index++) {
        const [r, c] = queue[index];
        [
            [r - 1, c],
            [r + 1, c],
            [r, c - 1],
            [r, c + 1]
        ].forEach(([nextR, nextC]) => {
            if (
                nextR < 0 ||
                nextR >= rows ||
                nextC < 0 ||
                nextC >= columns ||
                grid[nextR][nextC] === '#'
            ) {
                return;
            }

            const key = `${nextR},${nextC}`;
            if (visited.has(key)) return;
            visited.add(key);
            queue.push([nextR, nextC]);
        });
    }

    return visited.size === openCount;
}

function createRotationalBlockPairs(rows, columns, random = Math.random) {
    const seen = new Set();
    const pairs = [];

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < columns; c++) {
            const mirrorR = rows - 1 - r;
            const mirrorC = columns - 1 - c;
            const key = `${r},${c}`;
            const mirrorKey = `${mirrorR},${mirrorC}`;
            if (seen.has(key) || seen.has(mirrorKey)) continue;

            seen.add(key);
            seen.add(mirrorKey);
            pairs.push(key === mirrorKey ? [[r, c]] : [[r, c], [mirrorR, mirrorC]]);
        }
    }

    return shuffleValues(pairs, random);
}

function getTargetBlockCount(rows, columns, blockedRows, blockedColumns, densityRange) {
    const cells = rows * columns;
    const [minDensity, maxDensity] = densityRange;
    const density = Math.min(
        maxDensity,
        Math.max(minDensity, minDensity + ((blockedRows + blockedColumns) * 0.015))
    );
    return Math.max(0, Math.round(cells * density));
}

function countOpenLines(grid) {
    if (!grid.length || !grid[0]?.length) return 0;

    let openLines = grid.filter((row) => row.every((cell) => cell !== '#')).length;
    for (let column = 0; column < grid[0].length; column++) {
        if (grid.every((row) => row[column] !== '#')) openLines++;
    }

    return openLines;
}

function isPlacementAcceptable(grid, options) {
    if (hasFullDivider(grid)) return false;
    if (!hasConnectedOpenCells(grid)) return false;
    return analyzeCrosswordLayout(grid, options).valid;
}

function scoreLayout(grid, targetBlockCount, options) {
    const analysis = analyzeCrosswordLayout(grid, options);
    if (!analysis.valid) return Number.NEGATIVE_INFINITY;
    if (hasFullDivider(grid)) return Number.NEGATIVE_INFINITY;
    if (!hasConnectedOpenCells(grid)) return Number.NEGATIVE_INFINITY;

    const blockCount = countBlocks(grid);
    const lengths = analysis.slotLengths;
    const desired = options.desiredLengths || [4, 8];
    const longRunPenalty = lengths
        .filter((length) => length > options.longRunLimit)
        .reduce((sum, length) => sum + (((length - options.longRunLimit) ** 2) * 8), 0);
    const shortSlotPenalty = lengths.filter((length) => length === 3).length * (options.threeLetterPenalty || 0);
    const openLinePenalty = countOpenLines(grid) * 200;
    const mediumRunScore = lengths.filter((length) => length >= desired[0] && length <= desired[1]).length * 3;
    const slotCountScore = lengths.length * 1.5;
    const densityPenalty = Math.abs(targetBlockCount - blockCount) * 5;

    return slotCountScore + mediumRunScore - longRunPenalty - openLinePenalty - densityPenalty - shortSlotPenalty;
}

export function createRandomCrosswordLayout({
    rows = 15,
    columns = 15,
    blockedRows = 1,
    blockedColumns = 1,
    random = Math.random,
    minLength = 3,
    maxLength = 21,
    attempts = 36,
    densityRange = [0.14, 0.23],
    desiredLengths = [4, 8],
    longRunLimit = 10,
    threeLetterPenalty = 0
} = {}) {
    const safeRows = clampInteger(rows, 7, 25, 15);
    const safeColumns = clampInteger(columns, 7, 25, 15);
    const safeBlockedRows = clampInteger(blockedRows, 0, 3, 1);
    const safeBlockedColumns = clampInteger(blockedColumns, 0, 3, 1);
    const options = { minLength, maxLength, desiredLengths, longRunLimit, threeLetterPenalty };
    const targetBlockCount = getTargetBlockCount(
        safeRows,
        safeColumns,
        safeBlockedRows,
        safeBlockedColumns,
        densityRange
    );
    let bestLayout = null;

    for (let attempt = 0; attempt < attempts; attempt++) {
        const grid = Array.from({ length: safeRows }, () => Array(safeColumns).fill(''));
        const blockPairs = createRotationalBlockPairs(safeRows, safeColumns, random);

        for (const pair of blockPairs) {
            const currentBlockCount = countBlocks(grid);
            if (currentBlockCount >= targetBlockCount) break;
            if (currentBlockCount + pair.length > targetBlockCount + 1) continue;

            const candidate = cloneGrid(grid);
            pair.forEach(([r, c]) => {
                candidate[r][c] = '#';
            });

            if (isPlacementAcceptable(candidate, options)) {
                pair.forEach(([r, c]) => {
                    grid[r][c] = '#';
                });
            }
        }

        const score = scoreLayout(grid, targetBlockCount, options);
        if (!bestLayout || score > bestLayout.score) {
            bestLayout = { grid, score };
        }
    }

    const grid = bestLayout?.grid || Array.from(
        { length: safeRows },
        () => Array(safeColumns).fill('')
    );

    return {
        grid,
        rowDividers: [],
        columnDividers: [],
        blockCount: countBlocks(grid),
        targetBlockCount,
        analysis: analyzeCrosswordLayout(grid, options),
        score: bestLayout?.score ?? Number.NEGATIVE_INFINITY
    };
}
