// providers/DefinitionsProvider.js
export class DefinitionsProvider {
  constructor({ basePath = "data/defs_by_length" } = {}) {
    this.basePath = basePath;
    this._cache = new Map();
    this._promises = new Map();
  }

  async _loadLength(len) {
    if (this._cache.has(len)) return this._cache.get(len);

    if (!this._promises.has(len)) {
      const p = (async () => {
        const url = `${this.basePath}/defs-${len}.json`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
        
        const defsMap = await resp.json();
        this._cache.set(len, defsMap);
        this._promises.delete(len);
        return defsMap;
      })().catch(err => {
        this._promises.delete(len);
        throw err;
      });

      this._promises.set(len, p);
    }
    return await this._promises.get(len);
  }

  /**
   * Returns an array of clue objects: [{ clue, source, date, display }]
   */
  async lookup(rawWord) {
    if (!rawWord) return null;
    const word = rawWord.toLowerCase(); // Files are keyed in lowercase from our merger
    const len = word.length;

    try {
      const defsMap = await this._loadLength(len);
      const rawEntries = defsMap[word];

      if (!rawEntries) return null;

      // Transform {c, s, d} into a cleaner format for the UI
      return rawEntries.map(entry => ({
        clue: entry.c,
        source: entry.s,
        date: entry.d === "0" ? "" : entry.d,
        // Helper string for the "History" badge in the UI
        attribution: `(${entry.s}${entry.d !== "0" ? `, ${entry.d}` : ""})`
      }));
    } catch (e) {
      console.warn(`Definition load failed for ${word}:`, e);
      return null;
    }
  }
}
