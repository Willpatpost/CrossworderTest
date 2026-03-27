import test from 'node:test';
import assert from 'node:assert/strict';
import { WordListProvider } from '../providers/WordListProvider.js';
import { DefinitionsProvider } from '../providers/DefinitionsProvider.js';
import { DictionaryAPI } from '../providers/DictionaryAPI.js';
import { editorMethods } from '../app/features/editor.js';
import { playMethods } from '../app/features/play.js';

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
