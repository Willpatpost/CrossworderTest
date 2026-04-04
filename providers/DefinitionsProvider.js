// providers/DefinitionsProvider.js
export class DefinitionsProvider {
  constructor({ basePath = "data/defs_by_length" } = {}) {
    this.basePath = basePath;
    this._cache = new Map();
    this._promises = new Map();
    this._searchLengths = Array.from({ length: 19 }, (_, index) => index + 3);
    this._searchIndex = null;
    this._searchIndexPromise = null;
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

      const normalizedEntries = rawEntries.map(entry => ({
        clue: entry.c,
        source: entry.s,
        date: entry.d === "0" ? "" : entry.d,
        attribution: `(${entry.s}${entry.d !== "0" ? `, ${entry.d}` : ""})`
      }));

      return this._rankEntries(normalizedEntries);
    } catch (e) {
      console.warn(`Definition load failed for ${word}:`, e);
      return null;
    }
  }

  async searchEntries(rawQuery, { limit = 25 } = {}) {
    const query = String(rawQuery || "").trim().toLowerCase();
    if (!query) return [];

    const index = await this._getSearchIndex();
    const matches = [];

    index.forEach(({ word, entries }) => {
      const bestEntry = entries.find((entry) =>
        String(entry.clue || "").toLowerCase().includes(query)
          || String(word || "").toLowerCase().includes(query)
      );

      if (!bestEntry) return;

      matches.push({
        word: word.toUpperCase(),
        clue: bestEntry.clue,
        source: bestEntry.source,
        date: bestEntry.date,
        attribution: bestEntry.attribution,
        score: this._scoreSearchMatch(word, bestEntry, query)
      });
    });

    return matches
      .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word))
      .slice(0, limit)
      .map(({ score, ...entry }) => entry);
  }

  async _getSearchIndex() {
    if (this._searchIndex) return this._searchIndex;
    if (this._searchIndexPromise) return this._searchIndexPromise;

    this._searchIndexPromise = (async () => {
      const indexedEntries = [];

      await Promise.all(this._searchLengths.map(async (len) => {
        try {
          const defsMap = await this._loadLength(len);

          Object.entries(defsMap || {}).forEach(([word, entries]) => {
            indexedEntries.push({
              word,
              entries: this._rankEntries((entries || []).map(entry => ({
                clue: entry.c,
                source: entry.s,
                date: entry.d === "0" ? "" : entry.d,
                attribution: `(${entry.s}${entry.d !== "0" ? `, ${entry.d}` : ""})`
              })))
            });
          });
        } catch {
          return;
        }
      }));

      this._searchIndex = indexedEntries;
      this._searchIndexPromise = null;
      return indexedEntries;
    })().catch((error) => {
      this._searchIndexPromise = null;
      throw error;
    });

    return this._searchIndexPromise;
  }

  async scoreWords(rawWords) {
    const words = [...new Set(
      (rawWords || [])
        .map((word) => String(word || "").trim().toLowerCase())
        .filter(Boolean)
    )];
    const scores = {};
    if (!words.length) return scores;

    const byLength = new Map();
    words.forEach((word) => {
      const list = byLength.get(word.length) || [];
      list.push(word);
      byLength.set(word.length, list);
    });

    for (const [len, lengthWords] of byLength.entries()) {
      try {
        const defsMap = await this._loadLength(len);

        lengthWords.forEach((word) => {
          const rawEntries = defsMap?.[word];
          if (!rawEntries?.length) {
            scores[word.toUpperCase()] = 0;
            return;
          }

          const normalizedEntries = rawEntries.map(entry => ({
            clue: entry.c,
            source: entry.s,
            date: entry.d === "0" ? "" : entry.d,
            attribution: `(${entry.s}${entry.d !== "0" ? `, ${entry.d}` : ""})`
          }));

          const bestScore = normalizedEntries.reduce(
            (best, entry) => Math.max(best, this._scoreEntry(entry)),
            0
          );
          scores[word.toUpperCase()] = bestScore + Math.min(rawEntries.length, 12);
        });
      } catch {
        lengthWords.forEach((word) => {
          scores[word.toUpperCase()] = scores[word.toUpperCase()] || 0;
        });
      }
    }

    return scores;
  }

  _rankEntries(entries) {
    const seenClues = new Set();

    return [...entries]
      .filter((entry) => entry?.clue)
      .sort((a, b) => this._scoreEntry(b) - this._scoreEntry(a))
      .filter((entry) => {
        const key = String(entry.clue).trim().toLowerCase();
        if (!key || seenClues.has(key)) return false;
        seenClues.add(key);
        return true;
      });
  }

  _scoreEntry(entry) {
    const source = String(entry?.source || "").toUpperCase();
    const clue = String(entry?.clue || "");
    const dateValue = Date.parse(entry?.date || "") || 0;
    let score = 0;

    if (source.includes("NYT")) score += 40;
    else if (source.includes("LAT")) score += 35;
    else if (source.includes("WSJ")) score += 32;
    else if (source.includes("WEB")) score += 12;
    else if (source) score += 24;

    score += Math.min(dateValue / 1_000_000_000_000, 10);
    score += Math.max(0, 36 - clue.length) / 4;

    if (/^\w[\w\s'",&-]*$/.test(clue)) score += 3;
    if (/[?!";]/.test(clue)) score -= 2;

    return score;
  }

  _scoreSearchMatch(word, entry, query) {
    const normalizedWord = String(word || "").toLowerCase();
    const normalizedClue = String(entry?.clue || "").toLowerCase();
    let score = this._scoreEntry(entry);

    if (normalizedWord === query) score += 120;
    else if (normalizedWord.startsWith(query)) score += 60;
    else if (normalizedWord.includes(query)) score += 35;

    if (normalizedClue.startsWith(query)) score += 45;
    else if (normalizedClue.includes(query)) score += 25;

    return score;
  }
}
