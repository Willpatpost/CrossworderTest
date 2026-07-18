// providers/WordListProvider.js
export class WordListProvider {
  constructor({ basePath = "data/playable_words_by_length", fallbackBasePath = "data/words_by_length" } = {}) {
    this.basePath = basePath;
    this.fallbackBasePath = fallbackBasePath;
    this._cache = new Map();
    this._promises = new Map();
  }

  async getWordsOfLength(len) {
    if (this._cache.has(len)) return this._cache.get(len);

    if (!this._promises.has(len)) {
      const p = (async () => {
        let words = await this._fetchWords(this.basePath, len);
        if (words === null && this.fallbackBasePath) {
            words = await this._fetchWords(this.fallbackBasePath, len);
        }

        if (words === null) {
            // If a length doesn't exist (e.g. length 25), return empty array.
            this._cache.set(len, []);
            this._promises.delete(len);
            return [];
        }

        this._cache.set(len, words);
        this._promises.delete(len);
        return words;
      })().catch(err => {
        this._promises.delete(len);
        throw err;
      });

      this._promises.set(len, p);
    }

    return await this._promises.get(len);
  }

  async _fetchWords(basePath, len) {
    const url = `${basePath}/words-${len}.txt`;
    const resp = await fetch(url);

    if (resp.status === 404) return null;

    if (!resp.ok) {
        throw new Error(`Failed to fetch ${url}: HTTP ${resp.status}`);
    }

    const text = await resp.text();
    return text.split(/\r?\n/)
        .map(w => w.trim().toUpperCase())
        .filter(w => w.length > 0);
  }

  async preloadLengths(lengths) {
    await Promise.all([...new Set(lengths)].map(len => this.getWordsOfLength(len)));
  }
}
