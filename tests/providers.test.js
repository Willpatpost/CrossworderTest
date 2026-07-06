import test from 'node:test';
import assert from 'node:assert/strict';
import { WordListProvider } from '../providers/WordListProvider.js';
import { DefinitionsProvider } from '../providers/DefinitionsProvider.js';
import { DictionaryAPI } from '../providers/DictionaryAPI.js';
import { editorMethods } from '../app/features/editor.js';
import { playMethods } from '../app/features/play.js';
import { DisplayManager } from '../ui/DisplayManager.js';
import { ClueListDisplay } from '../ui/display/ClueListDisplay.js';

test('WordListProvider clears in-flight promise entries after success', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
        ok: true,
        async text() {
            return 'cat\ncar\n';
        }
    });

    try {
        const provider = new WordListProvider({ basePath: '/mock' });
        const words = await provider.getWordsOfLength(3);

        assert.deepEqual(words, ['CAT', 'CAR']);
        assert.equal(provider._cache.has(3), true);
        assert.equal(provider._promises.has(3), false);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('WordListProvider caches missing lengths but retries transient server failures', async () => {
    const originalFetch = globalThis.fetch;
    let requestCount = 0;

    try {
        globalThis.fetch = async () => ({ ok: false, status: 404 });
        const missingProvider = new WordListProvider({ basePath: '/mock' });
        assert.deepEqual(await missingProvider.getWordsOfLength(25), []);
        assert.equal(missingProvider._cache.has(25), true);

        globalThis.fetch = async () => {
            requestCount++;
            return { ok: false, status: 500 };
        };
        const failingProvider = new WordListProvider({ basePath: '/mock' });

        await assert.rejects(
            () => failingProvider.getWordsOfLength(3),
            /HTTP 500/
        );
        await assert.rejects(
            () => failingProvider.getWordsOfLength(3),
            /HTTP 500/
        );
        assert.equal(failingProvider._cache.has(3), false);
        assert.equal(requestCount, 2);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('DefinitionsProvider clears in-flight promise entries after success', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
        ok: true,
        async json() {
            return {
                cat: [{ c: 'Feline', s: 'Test', d: '2025-01-01' }]
            };
        }
    });

    try {
        const provider = new DefinitionsProvider({ basePath: '/mock' });
        const defs = await provider.lookup('CAT');

        assert.equal(defs[0].clue, 'Feline');
        assert.equal(provider._cache.has(3), true);
        assert.equal(provider._promises.has(3), false);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('DefinitionsProvider ranks stronger local clues ahead of weaker ones', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
        ok: true,
        async json() {
            return {
                cat: [
                    { c: 'Questionable clue?!', s: 'WEB', d: '0' },
                    { c: 'Feline pet', s: 'NYT', d: '2025-01-01' }
                ]
            };
        }
    });

    try {
        const provider = new DefinitionsProvider({ basePath: '/mock' });
        const defs = await provider.lookup('CAT');

        assert.equal(defs[0].clue, 'Feline pet');
        assert.equal(defs[1].clue, 'Questionable clue?!');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('DefinitionsProvider searchEntries matches clue text and answer text', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => ({
        ok: !String(url).includes('clue-search'),
        async json() {
            if (String(url).includes('defs-3')) {
                return {
                    cat: [{ c: 'Feline friend', s: 'NYT', d: '2025-01-01' }]
                };
            }

            return {};
        }
    });

    try {
        const provider = new DefinitionsProvider({ basePath: '/mock' });
        const byClue = await provider.searchEntries('feline');
        const byAnswer = await provider.searchEntries('cat');

        assert.equal(byClue[0].word, 'CAT');
        assert.equal(byAnswer[0].word, 'CAT');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('DefinitionsProvider searchEntries uses compact search index when available', async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls = [];

    globalThis.fetch = async (url) => {
        requestedUrls.push(String(url));

        if (String(url).includes('clue-search')) {
            return {
                ok: true,
                async json() {
                    return {
                        entries: [
                            { w: 'CAT', c: 'Feline friend', s: 'NYT', d: '2025-01-01' },
                            { w: 'DOG', c: 'Canine friend', s: 'LAT', d: '2024-01-01' }
                        ]
                    };
                }
            };
        }

        throw new Error(`Unexpected archive fetch: ${url}`);
    };

    try {
        const provider = new DefinitionsProvider({
            basePath: '/mock-defs',
            searchIndexPath: '/mock-search/clue-search.json'
        });
        const matches = await provider.searchEntries('feline');

        assert.equal(matches.length, 1);
        assert.equal(matches[0].word, 'CAT');
        assert.deepEqual(requestedUrls, ['/mock-search/clue-search.json']);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('DefinitionsProvider scoreWords weights clue history quality and count', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
        ok: true,
        async json() {
            return {
                cat: [
                    { c: 'Feline pet', s: 'NYT', d: '2025-01-01' },
                    { c: 'House cat', s: 'LAT', d: '2024-01-01' }
                ],
                car: [
                    { c: 'Vehicle', s: 'WEB', d: '0' }
                ]
            };
        }
    });

    try {
        const provider = new DefinitionsProvider({ basePath: '/mock' });
        const scores = await provider.scoreWords(['CAT', 'CAR']);

        assert.equal(scores.CAT > scores.CAR, true);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('DictionaryAPI caches empty fallback results for failed requests', async () => {
    const originalFetch = globalThis.fetch;
    let requestCount = 0;

    globalThis.fetch = async () => {
        requestCount++;
        return { ok: false };
    };

    try {
        const api = new DictionaryAPI();
        const first = await api.fetchFallback('MISSING');
        const second = await api.fetchFallback('MISSING');

        assert.deepEqual(first, []);
        assert.deepEqual(second, []);
        assert.equal(requestCount, 1);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('DisplayManager describes authored, local, and web clue sources clearly', () => {
    const authored = DisplayManager.prototype._describeClueSource({
        kind: 'authored',
        label: 'Authored',
        detail: 'Written in this puzzle'
    });
    const local = DisplayManager.prototype._describeClueSource({
        source: 'NYT',
        date: '2025-01-01'
    });
    const web = DisplayManager.prototype._describeClueSource({
        source: 'WEB',
        attribution: '(DictionaryAPI)'
    });

    assert.deepEqual(authored, {
        kind: 'authored',
        label: 'Authored',
        detail: 'Written in this puzzle'
    });
    assert.deepEqual(local, {
        kind: 'local',
        label: 'Local',
        detail: 'NYT, 2025-01-01'
    });
    assert.deepEqual(web, {
        kind: 'web',
        label: 'Web',
        detail: '(DictionaryAPI)'
    });
});

test('ClueListDisplay hydrates clues with bounded concurrency', async () => {
    let active = 0;
    let maxActive = 0;
    const resolvers = [];
    const display = new ClueListDisplay({});
    display._clueHydrationConcurrency = 2;

    const tasks = Array.from({ length: 5 }, () => async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => {
            resolvers.push(resolve);
            setTimeout(resolve, 0);
        });
        active--;
    });

    await display._runHydrationQueue(tasks, display._clueHydrationToken);

    assert.equal(resolvers.length, 5);
    assert.equal(maxActive, 2);
});

test('Direct editor letter entry keeps authored clues while invalidating the saved solution', () => {
    const app = {
        grid: [['', '']],
        currentSolution: { '1-across': 'AB' },
        currentPuzzleClues: { '1-across': 'Example clue' },
        gridManager: {
            selectedCell: { r: 0, c: 0 },
            _moveWithinWord() {}
        },
        _isInBounds(r, c) {
            return r >= 0 && c >= 0 && r < 1 && c < 2;
        },
        _recordEditorSnapshot() {},
        display: { updateStatus() {} },
        rebuildGridState() {},
        syncActiveGridToDOM() {},
        refreshWordList() {},
        _finalizeEditorLetterChange: editorMethods._finalizeEditorLetterChange
    };

    editorMethods.handleEditorLetterInput.call(app, 'z');
    assert.equal(app.grid[0][0], 'Z');
    assert.equal(app.currentSolution, null);
    assert.deepEqual(app.currentPuzzleClues, { '1-across': 'Example clue' });
});

test('Play completion check detects a solved puzzle once', () => {
    let statusMessage = '';
    let popupMessage = '';

    const app = {
        modes: { isPlayMode: true },
        currentSolution: { '1-across': 'CAT' },
        slots: {
            '1-across': {
                id: '1-across',
                positions: [[0, 0], [0, 1], [0, 2]]
            }
        },
        grid: [['C', 'A', 'T']],
        hasCompletedPlayPuzzle: false,
        playElapsedMs: 65000,
        display: {
            updateStatus(message) {
                statusMessage = message;
            }
        },
        popups: {
            showMessage(_title, message) {
                popupMessage = message;
            }
        },
        _pausePlayTimer() {},
        _updatePauseUI() {},
        _updatePlayStatusCopy() {}
    };

    const first = playMethods._checkForPuzzleCompletion.call(app);
    const second = playMethods._checkForPuzzleCompletion.call(app);

    assert.equal(first, true);
    assert.equal(second, false);
    assert.equal(app.hasCompletedPlayPuzzle, true);
    assert.match(statusMessage, /Puzzle complete!/);
    assert.match(popupMessage, /1:05/);
});
