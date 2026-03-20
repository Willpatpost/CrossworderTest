// solver/ConstraintManager.js
import { GridUtils } from '../utils/GridUtils.js';

export class ConstraintManager {
    constructor() {
        this.slots = {};
        this.constraints = {};
        this.domains = {};
    }

    /**
     * Builds the slot structures and calculates intersections (constraints).
     */
    buildDataStructures(grid) {
        this.slots = {};
        this.constraints = {};
        
        const rows = grid.length;
        const cols = grid[0].length;
        let wordCounter = 1;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const isAcross = GridUtils.isStartOfAcrossSlot(grid, r, c);
                const isDown = GridUtils.isStartOfDownSlot(grid, r, c);

                let assignedNumber = false;

                if (isAcross) {
                    const slot = this._extractSlot(grid, r, c, 'across', wordCounter);
                    this.slots[slot.id] = slot;
                    assignedNumber = true;
                }
                if (isDown) {
                    const slot = this._extractSlot(grid, r, c, 'down', wordCounter);
                    this.slots[slot.id] = slot;
                    assignedNumber = true;
                }

                if (assignedNumber) wordCounter++;
            }
        }

        const flatCellMap = {};
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                flatCellMap[`${r},${c}`] = grid[r][c];
            }
        }

        this.generateConstraints();
        
        return { slots: this.slots, cellContents: flatCellMap };
    }

    _extractSlot(grid, r, c, direction, counter) {
        const positions = [];
        let currR = r;
        let currC = c;

        // If the cell contains a manual number (string digit), use it. 
        // Otherwise, use the auto-counter.
        const gridVal = grid[r][c];
        const displayLabel = (/\d/.test(gridVal)) ? parseInt(gridVal, 10) : counter;

        while (currR < grid.length && currC < grid[0].length && grid[currR][currC] !== "#") {
            positions.push([currR, currC]);
            if (direction === "across") currC++;
            else currR++;
        }

        return {
            id: `${displayLabel}-${direction}`, 
            direction,
            number: displayLabel,
            length: positions.length,
            positions
        };
    }

    generateConstraints() {
        this.constraints = {};
        const positionToSlots = {};

        for (const slotId in this.slots) {
            this.slots[slotId].positions.forEach((pos, idx) => {
                const key = `${pos[0]},${pos[1]}`;
                if (!positionToSlots[key]) positionToSlots[key] = [];
                positionToSlots[key].push({ slotId, idx });
            });
        }

        for (const key in positionToSlots) {
            const overlaps = positionToSlots[key];
            if (overlaps.length > 1) {
                for (let i = 0; i < overlaps.length; i++) {
                    for (let j = i + 1; j < overlaps.length; j++) {
                        const sA = overlaps[i].slotId;
                        const idxA = overlaps[i].idx;
                        const sB = overlaps[j].slotId;
                        const idxB = overlaps[j].idx;

                        if (!this.constraints[sA]) this.constraints[sA] = {};
                        if (!this.constraints[sA][sB]) this.constraints[sA][sB] = [];
                        this.constraints[sA][sB].push([idxA, idxB]);

                        if (!this.constraints[sB]) this.constraints[sB] = {};
                        if (!this.constraints[sB][sA]) this.constraints[sB][sA] = [];
                        this.constraints[sB][sA].push([idxB, idxA]);
                    }
                }
            }
        }
    }

    /**
     * Filters word lists based on current grid letters.
     */
    setupDomains(slots, wordLengthCache, grid) {
        this.domains = {};
        for (const slotId in slots) {
            const slot = slots[slotId];
            const allWords = wordLengthCache[slot.length] || [];

            // Pattern building: "^..C.T$"
            const patternParts = slot.positions.map(pos => {
                const [r, c] = pos;
                const char = grid[r][c];
                // Check if it's a letter (ignoring numbers/spaces)
                return (/[A-Z]/i.test(char)) ? char.toUpperCase() : '.';
            });

            const patternStr = `^${patternParts.join('')}$`;
            const pattern = new RegExp(patternStr);

            this.domains[slotId] = allWords.filter(word => pattern.test(word));
        }
        return this.domains;
    }
}