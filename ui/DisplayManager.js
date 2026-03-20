// ui/DisplayManager.js
export class DisplayManager {
    constructor() {
        this.statusDisplay = document.getElementById('status-display');
        this.acrossDisplay = document.getElementById('across-display');
        this.downDisplay = document.getElementById('down-display');
    }

    updateStatus(message, append = false) {
        if (!this.statusDisplay) return;
        if (append) {
            this.statusDisplay.value += message + "\n";
        } else {
            this.statusDisplay.value = message;
        }
        this.statusDisplay.scrollTop = this.statusDisplay.scrollHeight;
    }

    updateWordLists(slots, solution = {}) {
        if (!this.acrossDisplay || !this.downDisplay) return;

        this.acrossDisplay.innerHTML = '';
        this.downDisplay.innerHTML = '';

        const sortedSlots = Object.values(slots).sort((a, b) => a.number - b.number);

        sortedSlots.forEach(slot => {
            const word = solution[slot.id] || " ".repeat(slot.length);
            const entry = document.createElement('div');
            entry.className = 'word-list-entry';
            entry.textContent = `${slot.number}. ${word}`;
            
            if (slot.direction === 'across') {
                this.acrossDisplay.appendChild(entry);
            } else {
                this.downDisplay.appendChild(entry);
            }
        });
    }
}