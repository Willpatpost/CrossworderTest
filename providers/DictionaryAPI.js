// providers/DictionaryAPI.js
export class DictionaryAPI {
    constructor() {
        this.fallbackCache = {};
    }

    async fetchFallbackDefinition(word) {
        if (this.fallbackCache[word]) return this.fallbackCache[word];

        const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`API returned status ${resp.status}`);
        
        const data = await resp.json();
        this.fallbackCache[word] = data;
        return data;
    }

    transformFallbackData(data) {
        const result = [];
        if (!Array.isArray(data)) return result;

        for (const entry of data) {
            if (!entry.meanings) continue;
            for (const meaning of entry.meanings) {
                const pos = meaning.partOfSpeech || 'unknown';
                const defList = (meaning.definitions || []).map(d => d.definition || '');
                if (defList.length > 0) {
                    result.push({ pos, definitions: defList });
                }
            }
        }
        return result;
    }
}