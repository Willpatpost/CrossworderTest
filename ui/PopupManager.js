// ui/PopupManager.js
export class PopupManager {
    constructor(localProvider, fallbackProvider) {
        this.localProvider = localProvider;
        this.fallbackProvider = fallbackProvider;
    }

    /**
     * Shows a popup with all available clues and definitions for a word.
     */
    async show(word) {
        if (!word) return;
        const upperWord = word.toUpperCase();

        try {
            // 1. Try our massive local database first
            const localResults = await this.localProvider.lookup(word);
            
            if (localResults && localResults.length > 0) {
                this._createPopup(upperWord, localResults, "Local Database");
            } else {
                // 2. Fallback to the Web API if local search fails
                await this._handleFallback(word);
            }
        } catch (e) {
            console.error("Popup Error:", e);
            await this._handleFallback(word);
        }
    }

    async _handleFallback(word) {
        const webResults = await this.fallbackProvider.fetchFallback(word);
        if (webResults && webResults.length > 0) {
            this._createPopup(word.toUpperCase(), webResults, "DictionaryAPI (Web)");
        } else {
            this._createPopup(word.toUpperCase(), null, "No results found");
        }
    }

    _createPopup(word, entries, sourceLabel) {
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.7)', zIndex: '9998',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(2px)'
        });

        const popup = document.createElement('div');
        Object.assign(popup.style, {
            width: '500px', maxHeight: '80vh', backgroundColor: '#fff', 
            padding: '30px', overflowY: 'auto', zIndex: '9999', 
            borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            fontFamily: 'sans-serif'
        });

        // Header
        let html = `<h2 style="margin-top:0; border-bottom: 2px solid #eee; padding-bottom: 10px;">${word}</h2>`;
        
        if (entries && entries.length > 0) {
            html += `<div style="display: flex; flexDirection: column; gap: 15px;">`;
            entries.forEach((item, i) => {
                html += `
                <div style="padding-bottom: 10px; ${i < entries.length - 1 ? 'border-bottom: 1px solid #f5f5f5;' : ''}">
                    <p style="margin: 0 0 5px 0; font-size: 1.1rem; line-height: 1.4;">${item.clue}</p>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 0.75rem; color: #007bff; font-weight: bold; text-transform: uppercase;">
                            ${item.source}
                        </span>
                        <span style="font-size: 0.75rem; color: #888;">${item.date || ''}</span>
                    </div>
                </div>`;
            });
            html += `</div>`;
        } else {
            html += `<p style="color: #666; font-style: italic;">No historical clues or definitions found for this word.</p>`;
        }

        html += `
            <div style="margin-top: 25px; padding-top: 15px; border-top: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                <small style="color: #bbb;">Source: ${sourceLabel}</small>
                <button id="close-popup" style="padding: 8px 16px; cursor: pointer; background: #333; color: #fff; border: none; borderRadius: 4px;">Close</button>
            </div>
        `;

        popup.innerHTML = html;
        overlay.appendChild(popup);

        // Close logic
        const close = () => { if (document.body.contains(overlay)) document.body.removeChild(overlay); };
        overlay.onclick = (e) => e.target === overlay && close();
        document.body.appendChild(overlay);
        document.getElementById('close-popup').onclick = close;
    }
}