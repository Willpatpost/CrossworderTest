import test from 'node:test';
import assert from 'node:assert/strict';
import { WordListProvider } from '../providers/WordListProvider.js';
import { DefinitionsProvider } from '../providers/DefinitionsProvider.js';
import { DictionaryAPI } from '../providers/DictionaryAPI.js';

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
