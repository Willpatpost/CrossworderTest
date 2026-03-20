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
     * RESTORED: Clickable word lists that trigger definitions.
     * Maps to OG: displayWordList()
     */
    updateWordLists(slots, solution = {}, onWordClick) {
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

        const renderList = (slotsArr, container) => {
            slotsArr.forEach(slot => {
                const word = solution[slot.id] || ".".repeat(slot.length);
                const item = document.createElement('div');
                item.className = 'word-list-item';
                item.style.padding = '4px 8px';
                item.style.cursor = 'pointer';
                item.style.borderBottom = '1px solid #eee';
                item.textContent = `${slot.number}. ${word}`;

                // Hover effects
                item.onmouseover = () => item.style.backgroundColor = '#f8f9fa';
                item.onmouseout = () => item.style.backgroundColor = 'transparent';
                
                // RESTORED: Click to show definition
                item.onclick = () => onWordClick(word);

                container.appendChild(item);
            });
        };

        renderList(acrossSlots, this.acrossDisplay);
        renderList(downSlots, this.downDisplay);
    }

    /**
     * RESTORED: Search result dropdown logic.
     * Maps to OG: displaySearchResults()
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
}