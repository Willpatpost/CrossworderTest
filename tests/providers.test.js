import test from 'node:test';
import assert from 'node:assert/strict';
import { WordListProvider } from '../providers/WordListProvider.js';
import { DefinitionsProvider } from '../providers/DefinitionsProvider.js';
import { DictionaryAPI } from '../providers/DictionaryAPI.js';
import { editorMethods } from '../app/features/editor.js';
import { playMethods } from '../app/features/play.js';
import { DisplayManager } from '../ui/DisplayManager.js';
import { GridManager } from '../grid/GridManager.js';
import { PuzzleSummaryDisplay } from '../ui/display/PuzzleSummaryDisplay.js';
import { SearchResultsDisplay } from '../ui/display/SearchResultsDisplay.js';

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
        ok: true,
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

test('DefinitionsProvider searchEntries reuses a cached search index across queries', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => ({
        ok: true,
        async json() {
            if (String(url).includes('defs-3')) {
                return {
                    cat: [{ c: 'Feline friend', s: 'NYT', d: '2025-01-01' }]
                };
            }

            if (String(url).includes('defs-4')) {
                return {
                    lion: [{ c: 'Big feline', s: 'LAT', d: '2024-01-01' }]
                };
            }

            return {};
        }
    });

    try {
        const provider = new DefinitionsProvider({ basePath: '/mock' });
        provider._searchLengths = [3, 4];

        let loadCalls = 0;
        const originalLoadLength = provider._loadLength.bind(provider);
        provider._loadLength = async (len) => {
            loadCalls++;
            return originalLoadLength(len);
        };

        await provider.searchEntries('feline');
        await provider.searchEntries('lion');

        assert.equal(loadCalls, 2);
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

test('GridManager syncGridToDOM refreshes block accessibility state', () => {
    const letter = { textContent: '' };
    const attributes = new Map([
        ['tabindex', '-1'],
        ['aria-selected', 'false']
    ]);
    const classes = new Set();
    const td = {
        classList: {
            add(name) {
                classes.add(name);
            },
            remove(name) {
                classes.delete(name);
            },
            contains(name) {
                return classes.has(name);
            }
        },
        setAttribute(name, value) {
            attributes.set(name, value);
        },
        removeAttribute(name) {
            attributes.delete(name);
        },
        querySelector(selector) {
            return selector === '.cell-letter' ? letter : null;
        },
        appendChild() {}
    };

    const manager = new GridManager();
    manager.cells = { '0,0': td };

    manager.syncGridToDOM([['#']], null);
    assert.equal(attributes.get('aria-label'), 'Block cell row 1 column 1');
    assert.equal(attributes.get('aria-readonly'), 'true');
    assert.equal(attributes.has('tabindex'), false);

    manager.syncGridToDOM([['A']], null);
    assert.equal(attributes.get('aria-label'), 'Row 1 column 1, A');
    assert.equal(attributes.has('aria-readonly'), false);
    assert.equal(attributes.get('tabindex'), '-1');
    assert.equal(attributes.get('aria-selected'), 'false');
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

test('SearchResultsDisplay supports keyboard selection with combobox semantics', () => {
    const originalDocument = globalThis.document;
    const listeners = {};
    let selected = null;

    const makeNode = (tagName) => ({
        tagName,
        id: '',
        textContent: '',
        className: '',
        children: [],
        attrs: {},
        listeners: {},
        classList: {
            _set: new Set(),
            add(name) {
                this._set.add(name);
            },
            remove(name) {
                this._set.delete(name);
            },
            contains(name) {
                return this._set.has(name);
            }
        },
        append(...nodes) {
            this.children.push(...nodes);
        },
        appendChild(node) {
            if (Array.isArray(node.children)) {
                this.children.push(...node.children);
            } else {
                this.children.push(node);
            }
        },
        setAttribute(name, value) {
            this.attrs[name] = value;
        },
        removeAttribute(name) {
            delete this.attrs[name];
        },
        addEventListener(name, handler) {
            this.listeners[name] = handler;
        },
        scrollIntoView() {}
    });

    const input = {
        attrs: {},
        addEventListener(name, handler) {
            listeners[name] = handler;
        },
        setAttribute(name, value) {
            this.attrs[name] = value;
        },
        removeAttribute(name) {
            delete this.attrs[name];
        }
    };

    const dropdown = makeNode('div');
    const matchesCount = { textContent: '' };

    globalThis.document = {
        createElement(tagName) {
            return makeNode(tagName);
        },
        createDocumentFragment() {
            return {
                children: [],
                appendChild(node) {
                    this.children.push(node);
                }
            };
        }
    };

    try {
        const display = new SearchResultsDisplay({ dropdown, matchesCount, input });
        display.update(['CAT', 'CAR'], (match) => {
            selected = match;
        });

        listeners.keydown({
            key: 'ArrowDown',
            preventDefault() {}
        });
        assert.equal(input.attrs['aria-activedescendant'], 'search-result-0');
        assert.equal(dropdown.children[0].attrs['aria-selected'], 'true');

        listeners.keydown({
            key: 'Enter',
            preventDefault() {}
        });

        assert.equal(selected, 'CAT');
        assert.equal(input.attrs['aria-expanded'], 'false');
    } finally {
        globalThis.document = originalDocument;
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

test('GridManager play entry triggers puzzle completion when the final letter is typed', () => {
    let completionChecks = 0;

    const coordinator = {
        grid: [['C', 'A', '']],
        hasCompletedPlayPuzzle: false,
        _applyInstantMistakeStateAt() {},
        _scheduleRecentPuzzleSave() {},
        _checkForPuzzleCompletion() {
            completionChecks++;
        }
    };

    const letterSpan = { textContent: '' };
    const td = {
        classList: {
            contains() {
                return false;
            },
            remove() {}
        },
        querySelector(selector) {
            return selector === '.cell-letter' ? letterSpan : null;
        },
        appendChild() {}
    };

    const manager = new GridManager();
    manager.cells = { '0,2': td };

    manager._setCell(0, 2, 'T', coordinator);

    assert.equal(coordinator.grid[0][2], 'T');
    assert.equal(letterSpan.textContent, 'T');
    assert.equal(completionChecks, 1);
});

test('PuzzleSummaryDisplay renders imported metadata as text instead of HTML', () => {
    const summary = {
        children: [],
        innerHTML: '',
        replaceChildren() {
            this.children = [];
            this.innerHTML = '';
        },
        appendChild(child) {
            this.children.push(child);
        }
    };

    const originalDocument = globalThis.document;
    globalThis.document = {
        createElement(tag) {
            return {
                tagName: tag,
                className: '',
                textContent: '',
                children: [],
                append(...nodes) {
                    this.children.push(...nodes);
                }
            };
        }
    };

    try {
        const display = new PuzzleSummaryDisplay({ puzzleSummary: summary });
        display.update(
            [['A', '']],
            { '1-across': { direction: 'across' }, '1-down': { direction: 'down' } },
            {},
            {
                title: '<img src=x onerror=alert(1)>',
                author: '<script>alert(1)</script>'
            }
        );

        const firstCard = summary.children[0];
        const [valueEl, labelEl] = firstCard.children;
        assert.equal(valueEl.textContent, '<img src=x onerror=alert(1)>');
        assert.equal(labelEl.textContent, '<script>alert(1)</script>');
        assert.equal(summary.innerHTML, '');
    } finally {
        globalThis.document = originalDocument;
    }
});
