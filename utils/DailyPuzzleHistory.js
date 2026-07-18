export function createLayoutSignature(grid) {
    return (grid || []).map((row) => (
        (row || []).map((cell) => cell === '#' ? '#' : '.').join('')
    )).join('/');
}

export function createHistoryEntry(payload) {
    const puzzles = {};
    Object.entries(payload?.puzzles || {}).forEach(([difficulty, puzzle]) => {
        puzzles[difficulty] = {
            answers: [...new Set(Object.values(puzzle.solution || {}))],
            clues: [...new Set([
                ...Object.values(puzzle.clues?.across || {}),
                ...Object.values(puzzle.clues?.down || {})
            ].map((clue) => String(clue || '').trim()).filter(Boolean))],
            layout: createLayoutSignature(puzzle.grid)
        };
    });
    return { date: payload.generatedFor, puzzles };
}

export function appendDailyHistory(history, payload, maxEntries = 14) {
    const entries = Array.isArray(history?.entries) ? history.entries : [];
    const nextEntry = createHistoryEntry(payload);
    return {
        schemaVersion: 1,
        entries: [
            nextEntry,
            ...entries.filter((entry) => entry?.date && entry.date !== nextEntry.date)
        ].slice(0, maxEntries)
    };
}

export function collectRecentUsage(history, currentPayload, dateKey, maxEntries = 14) {
    const entries = Array.isArray(history?.entries) ? [...history.entries] : [];
    if (currentPayload?.generatedFor && currentPayload.generatedFor !== dateKey) {
        entries.unshift(createHistoryEntry(currentPayload));
    }

    const uniqueEntries = [];
    const seenDates = new Set();
    entries.forEach((entry) => {
        if (!entry?.date || entry.date === dateKey || seenDates.has(entry.date)) return;
        seenDates.add(entry.date);
        uniqueEntries.push(entry);
    });

    const usage = {};
    ['easy', 'medium', 'hard'].forEach((difficulty) => {
        usage[difficulty] = { answers: new Set(), clues: new Set(), layouts: new Set() };
        uniqueEntries.slice(0, maxEntries).forEach((entry) => {
            const puzzle = entry.puzzles?.[difficulty];
            (puzzle?.answers || []).forEach((answer) => usage[difficulty].answers.add(answer));
            (puzzle?.clues || []).forEach((clue) => usage[difficulty].clues.add(String(clue).toLowerCase()));
            if (puzzle?.layout) usage[difficulty].layouts.add(puzzle.layout);
        });
    });
    return usage;
}
