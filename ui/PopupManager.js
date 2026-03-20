// ui/PopupManager.js
export class PopupManager {
    constructor(definitionsProvider) {
        this.definitionsProvider = definitionsProvider;
        this.fallbackCache = {};
    }

    async show(word) {
        if (!word) return;
        try {
            const senses = await this.definitionsProvider.lookup(word);
            if (senses && senses.length > 0) {
                this._createPopup(word, senses, "Wiktionary");
            } else {
                await this._handleFallback(word);
            }
        } catch (e) {
            await this._handleFallback(word);
        }
    }

    async _handleFallback(word) {
        try {
            const data = await this._fetchApi(word);
            const transformed = this._transform(data);
            this._createPopup(word, transformed, "DictionaryAPI");
        } catch (err) {
            this._createPopup(word, null, "DictionaryAPI (No results)");
        }
    }

    _createPopup(word, senses, source) {
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: '9998'
        });

        const popup = document.createElement('div');
        Object.assign(popup.style, {
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '600px', maxHeight: '70vh', backgroundColor: '#fff', padding: '20px',
            overflowY: 'auto', zIndex: '9999', borderRadius: '4px'
        });

        let content = `<h2>${word}</h2>`;
        if (senses) {
            senses.forEach(s => {
                content += `<h4>(${s.pos})</h4>` + s.definitions.map((d, i) => `<p>${i + 1}. ${d}</p>`).join('');
            });
        } else {
            content += `<p><em>No definition found.</em></p>`;
        }
        content += `<br><small>Source: ${source}</small>`;

        popup.innerHTML = content;
        overlay.appendChild(popup);
        overlay.onclick = (e) => e.target === overlay && document.body.removeChild(overlay);
        document.body.appendChild(overlay);
    }

    async _fetchApi(word) {
        if (this.fallbackCache[word]) return this.fallbackCache[word];
        const resp = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`);
        const data = await resp.json();
        this.fallbackCache[word] = data;
        return data;
    }

    _transform(data) {
        return data[0].meanings.map(m => ({
            pos: m.partOfSpeech,
            definitions: m.definitions.map(d => d.definition)
        }));
    }
}