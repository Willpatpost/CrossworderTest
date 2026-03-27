// providers/WordListProvider.js
export class WordListProvider {
  constructor({ basePath = "data/words_by_length" } = {}) {
    this.basePath = basePath;
    this._cache = new Map();
    this._promises = new Map();
  }

  async getWordsOfLength(len) {
    if (this._cache.has(len)) return this._cache.get(len);

    if (!this._promises.has(len)) {
      const p = (async () => {
        const url = `${this.basePath}/words-${len}.txt`;
        const resp = await fetch(url);
        
        if (!resp.ok) {
            // If a length doesn't exist (e.g. length 25), return empty array
            this._cache.set(len, []);
            this._promises.delete(len);
            return [];
        }

        const text = await resp.text();
        // Convert to uppercase for the solver's internal logic
        const words = text.split(/\r?\n/)
                          .map(w => w.trim().toUpperCase())
                          .filter(w => w.length > 0);

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

  async preloadLengths(lengths) {
    await Promise.all([...new Set(lengths)].map(len => this.getWordsOfLength(len)));
  }
}
