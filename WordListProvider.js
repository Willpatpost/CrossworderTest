// WordListProvider.js
// WordListProvider.js
export class WordListProvider {
  constructor({ basePath = "Data/words_by_length", uppercase = true } = {}) {
    this.basePath = basePath;
    this.uppercase = uppercase;
    this._lengthPromises = new Map();
    this._lengthWords = new Map();
  }

  async getWordsOfLength(len) {
    if (this._lengthWords.has(len)) return this._lengthWords.get(len);

    if (!this._lengthPromises.has(len)) {
      const p = (async () => {
        try {
            const url = `${this.basePath}/words-${len}.txt`;
            const resp = await fetch(url);
            
            // If file doesn't exist, return empty array instead of crashing
            if (!resp.ok) {
                console.warn(`Word list for length ${len} not found at ${url}.`);
                return []; 
            }
            
            const text = await resp.text();
            let words = text.split(/\r?\n/).map(w => w.trim()).filter(Boolean);
            if (this.uppercase) words = words.map(w => w.toUpperCase());

            this._lengthWords.set(len, words);
            return words;
        } catch (err) {
            console.error(`Error loading words for length ${len}:`, err);
            return [];
        }
      })();

      this._lengthPromises.set(len, p);
    }
    return await this._lengthPromises.get(len);
  }
}
