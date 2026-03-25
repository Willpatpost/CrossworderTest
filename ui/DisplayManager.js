// ui/DisplayManager.js
export class DisplayManager {
    constructor() {
        this.statusDisplay = document.getElementById('status-display');
        this.acrossDisplay = document.getElementById('across-display');
        this.downDisplay = document.getElementById('down-display');
        this.dropdown = document.getElementById('search-dropdown');
        this.matchesCount = document.getElementById('matches-count');
    }

    updateStatus(message, append = false) {
        if (!this.statusDisplay) return;
        const timestamp = new Date().toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' });
        const text = `[${timestamp}] ${message}\n`;
        
        if (append) {
            this.statusDisplay.value += text;
        } else {
            this.statusDisplay.value = text;
        }
        this.statusDisplay.scrollTop = this.statusDisplay.scrollHeight;
    }

    /**
     * Renders word lists. 
     * Handles the transition between "Word Building" and "Clue Solving".
     */
    async updateWordLists(slots, solution = {}, onWordClick, definitionsProvider = null, isPlayMode = false) {
        if (!this.acrossDisplay || !this.downDisplay) return;

        this.acrossDisplay.innerHTML = '';
        this.downDisplay.innerHTML = '';

        const acrossSlots = Object.values(slots)
            .filter(s => s.direction === 'across')
            .sort((a, b) => a.number - b.number);
            
        const downSlots = Object.values(slots)
            .filter(s => s.direction === 'down')
            .sort((a, b) => a.number - b.number);

        const renderList = async (slotsArr, container) => {
            for (const slot of slotsArr) {
                const word = solution[slot.id];
                const item = document.createElement('div');
                item.className = 'word-list-item';
                item.dataset.slotId = slot.id;

                // 1. Number and Clue/Word Container
                const header = document.createElement('div');
                header.className = 'clue-header';

                const num = document.createElement('strong');
                num.className = 'clue-number';
                num.textContent = slot.number;
                
                const mainContent = document.createElement('span');
                mainContent.className = 'clue-text';

                // 2. Attribution Badge
                const badge = document.createElement('small');
                badge.className = 'clue-attribution';

                if (isPlayMode && word && definitionsProvider) {
                    try {
                        const results = await definitionsProvider.lookup(word);
                        if (results && results.length > 0) {
                            // Pick the first historical clue
                            const bestMatch = results[0];
                            mainContent.textContent = bestMatch.clue;
                            badge.textContent = bestMatch.source;
                        } else {
                            mainContent.textContent = "No clue found for this word.";
                            mainContent.classList.add('muted-text');
                        }
                    } catch (e) {
                        mainContent.textContent = "[Error fetching clue]";
                    }
                } else {
                    // Builder mode logic: Show the word or dots
                    mainContent.textContent = word || ".".repeat(slot.length);
                    mainContent.classList.add('builder-word');
                }

                header.appendChild(num);
                header.appendChild(mainContent);
                item.appendChild(header);
                if (badge.textContent) item.appendChild(badge);

                // UI Interactivity
                item.onclick = () => onWordClick(slot);

                container.appendChild(item);
            }
        };

        await renderList(acrossSlots, this.acrossDisplay);
        await renderList(downSlots, this.downDisplay);
    }

    /**
     * Sidebar search result dropdown logic
     */
    updateSearchResults(matches, onSelect) {
        if (!this.dropdown) return;

        this.dropdown.innerHTML = '';
        if (matches.length === 0) {
            this.dropdown.classList.add('hidden');
            if (this.matchesCount) this.matchesCount.textContent = "No matches found.";
            return;
        }

        this.dropdown.classList.remove('hidden');
        if (this.matchesCount) this.matchesCount.textContent = `Found ${matches.length} matches.`;

        matches.forEach(word => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.textContent = word;
            
            item.onclick = () => {
                this.dropdown.classList.add('hidden');
                onSelect(word);
            };

            this.dropdown.appendChild(item);
        });
    }

    /**
     * Highlights the current clue in the sidebar 
     * and scrolls it into view.
     */
    highlightSlotInList(slotId) {
        const allItems = document.querySelectorAll('.word-list-item');
        allItems.forEach(el => el.classList.remove('active-clue'));
        
        const target = document.querySelector(`.word-list-item[data-slot-id="${slotId}"]`);
        if (target) {
            target.classList.add('active-clue');
            target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }
}