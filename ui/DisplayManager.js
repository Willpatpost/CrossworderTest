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
     * In Play Mode: Shows clues from our local database.
     * In Builder Mode: Shows the current word or blanks.
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
                
                // Base Container Styling
                Object.assign(item.style, {
                    padding: '8px 12px',
                    cursor: 'pointer',
                    borderBottom: '1px solid #eee',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                });

                // 1. Number and Clue/Word Container
                const header = document.createElement('div');
                header.style.display = 'flex';
                header.style.alignItems = 'baseline';
                header.style.gap = '6px';

                const num = document.createElement('strong');
                num.textContent = `${slot.number}.`;
                num.style.minWidth = '25px';
                
                const mainContent = document.createElement('span');
                mainContent.style.flex = '1';

                // 2. Attribution Badge (for Play Mode)
                const badge = document.createElement('small');
                badge.style.color = '#888';
                badge.style.fontSize = '0.75rem';
                badge.style.marginLeft = 'auto';

                if (isPlayMode && word && definitionsProvider) {
                    try {
                        const results = await definitionsProvider.lookup(word);
                        if (results && results.length > 0) {
                            // Display the first clue found in our merged DB
                            const bestMatch = results[0];
                            mainContent.textContent = bestMatch.clue;
                            badge.textContent = bestMatch.attribution;
                        } else {
                            mainContent.textContent = "No clue found for this word.";
                            mainContent.style.fontStyle = 'italic';
                            mainContent.style.color = '#999';
                        }
                    } catch (e) {
                        mainContent.textContent = "[Error fetching clue]";
                    }
                } else {
                    // Builder mode logic
                    mainContent.textContent = word || ".".repeat(slot.length);
                    mainContent.style.fontFamily = 'monospace';
                    mainContent.style.letterSpacing = '1px';
                }

                header.appendChild(num);
                header.appendChild(mainContent);
                item.appendChild(header);
                if (badge.textContent) item.appendChild(badge);

                // UI Interactivity
                item.onmouseover = () => item.style.backgroundColor = '#f0f7ff';
                item.onmouseout = () => item.style.backgroundColor = 'transparent';
                item.onclick = () => onWordClick(word || slot.id);

                container.appendChild(item);
            }
        };

        await renderList(acrossSlots, this.acrossDisplay);
        await renderList(downSlots, this.downDisplay);
    }

    /**
     * Search result dropdown logic for the sidebar search tool.
     */
    updateSearchResults(matches, onSelect) {
        if (!this.dropdown) return;

        this.dropdown.innerHTML = '';
        if (matches.length === 0) {
            this.dropdown.style.display = 'none';
            if (this.matchesCount) this.matchesCount.textContent = "No matches found.";
            return;
        }

        this.dropdown.style.display = 'block';
        if (this.matchesCount) this.matchesCount.textContent = `Found ${matches.length} matches.`;

        matches.forEach(word => {
            const item = document.createElement('div');
            item.textContent = word;
            item.style.padding = '8px';
            item.style.cursor = 'pointer';

            item.onmouseover = () => item.style.backgroundColor = '#f1f1f1';
            item.onmouseout = () => item.style.backgroundColor = '#fff';
            
            item.onclick = () => {
                this.dropdown.style.display = 'none';
                onSelect(word);
            };

            this.dropdown.appendChild(item);
        });
    }

    highlightSlotInList(slotId) {
        const allItems = document.querySelectorAll('.word-list-item');
        allItems.forEach(el => el.style.borderLeft = 'none');
        
        const target = document.querySelector(`.word-list-item[data-slot-id="${slotId}"]`);
        if (target) {
            target.style.borderLeft = '4px solid #007bff';
            target.style.backgroundColor = '#eef6ff';
            target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }
}