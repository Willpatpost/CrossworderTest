// providers/DictionaryAPI.js
export class DictionaryAPI {
  constructor() {
    this.fallbackCache = new Map();
  }

  async fetchFallback(word) {
    if (this.fallbackCache.has(word)) return this.fallbackCache.get(word);

    try {
      const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
      const resp = await fetch(url);
      if (!resp.ok) return null;

      const data = await resp.json();
      const transformed = this._transform(data);
      this.fallbackCache.set(word, transformed);
      return transformed;
    } catch (e) {
      return null;
    }
  }

  _transform(data) {
    if (!Array.isArray(data)) return [];
    const results = [];
    
    for (const entry of data) {
      for (const meaning of (entry.meanings || [])) {
        for (const def of (meaning.definitions || [])) {
          results.push({
            clue: def.definition,
            source: "WEB",
            date: "",
            attribution: "(DictionaryAPI)"
          });
        }
      }
    }
    return results;
  }
}