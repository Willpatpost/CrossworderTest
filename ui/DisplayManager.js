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
     * Updated: Renders word lists with support for "Play Mode" (Clues)
     * and "Builder Mode" (Words).
     */
    async updateWordLists(slots, solution = {}, onWordClick, definitionsProvider = null, isPlayMode = false) {
        if (!this.acrossDisplay || !this.downDisplay) return;

        this.acrossDisplay.innerHTML = '';
        this.downDisplay.innerHTML = '';

        // Separate and sort slots by number
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
                
                // Styling
                item.style.padding = '6px 10px';
                item.style.cursor = 'pointer';
                item.style.borderBottom = '1px solid #eee';
                item.style.display = 'flex';
                item.style.flexDirection = 'column';

                // 1. Number and Clue/Word Container
                const title = document.createElement('strong');
                title.textContent = `${slot.number}. `;
                
                const content = document.createElement('span');
                
                if (isPlayMode && word && definitionsProvider) {
                    // Fetch real clue if in play mode and word exists
                    try {
                        const senses = await definitionsProvider.lookup(word);
                        if (senses && senses.length > 0) {
                            // Pick the first definition found
                            content.textContent = senses[0].definitions[0];
                        } else {
                            content.textContent = "No clue available for this word.";
                        }
                    } catch (e) {
                        content.textContent = "Click to reveal word (Clue fetch failed).";
                    }
                } else {
                    // Default builder mode: show the word or dots
                    content.textContent = word || ".".repeat(slot.length);
                }

                item.appendChild(title);
                item.appendChild(content);

                // Hover effects
                item.onmouseover = () => {
                    item.style.backgroundColor = '#e3f2fd';
                    // We can emit a custom event here later to highlight the grid
                };
                item.onmouseout = () => {
                    item.style.backgroundColor = 'transparent';
                };
                
                // Interaction
                item.onclick = () => onWordClick(word || slot.id);

                container.appendChild(item);
            }
        };

        // Note: Using await here to ensure clues load in order
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

    /**
     * Highlights a specific slot in the sidebar to match grid focus
     */
    highlightSlotInList(slotId) {
        const allItems = document.querySelectorAll('.word-list-item');
        allItems.forEach(el => el.style.borderLeft = 'none');
        
        const target = document.querySelector(`.word-list-item[data-slot-id="${slotId}"]`);
        if (target) {
            target.style.borderLeft = '4px solid #007bff';
            target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }
}
