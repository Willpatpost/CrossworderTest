// solver/ConstraintManager.js
import { GridUtils } from '../utils/GridUtils.js';

export class ConstraintManager {
    constructor() {
        this.slots = {};
        this.constraints = {}; // Maps slotId -> { neighborId: [[myIdx, neighborIdx], ...] }
    }

    /**
     * Scans the grid to find all word slots and their intersections.
     * Returns cellContents: a map of { "r,c": "LETTER" } for pre-filled cells.
     */
    buildDataStructures(grid) {
        this.slots = {};
        this.constraints = {};
        const cellContents = {};
        
        const rows = grid.length;
        const cols = grid[0].length;
        let wordCounter = 1;

        // 1. Identify all Across and Down slots
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const char = grid[r][c];
                
                // Track pre-filled letters for the solver
                if (/[A-Z]/i.test(char)) {
                    cellContents[`${r},${c}`] = char.toUpperCase();
                }

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

        // 2. Map Intersections (Constraints)
        this._buildIntersections();

        return { slots: this.slots, cellContents };
    }

    /**
     * Finds every point where an ACROSS word and a DOWN word share a cell.
     */
    _buildIntersections() {
        const acrossSlots = Object.values(this.slots).filter(s => s.direction === 'across');
        const downSlots = Object.values(this.slots).filter(s => s.direction === 'down');

        for (const aSlot of acrossSlots) {
            for (const dSlot of downSlots) {
                // Find shared coordinates
                const overlaps = [];
                aSlot.positions.forEach((posA, idxA) => {
                    dSlot.positions.forEach((posD, idxD) => {
                        if (posA[0] === posD[0] && posA[1] === posD[1]) {
                            overlaps.push([idxA, idxD]);
                        }
                    });
                });

                if (overlaps.length > 0) {
                    if (!this.constraints[aSlot.id]) this.constraints[aSlot.id] = {};
                    if (!this.constraints[dSlot.id]) this.constraints[dSlot.id] = {};
                    
                    this.constraints[aSlot.id][dSlot.id] = overlaps;
                    this.constraints[dSlot.id][aSlot.id] = overlaps.map(([iA, iD]) => [iD, iA]);
                }
            }
        }
    }

    _extractSlot(grid, r, c, dir, num) {
        const positions = [];
        let currR = r;
        let currC = c;

        while (currR < grid.length && currC < grid[0].length && grid[currR][currC] !== '#') {
            positions.push([currR, currC]);
            if (dir === 'across') currC++; else currR++;
        }

        return {
            id: `${dir}-${num}`,
            number: num,
            direction: dir,
            length: positions.length,
            positions: positions
        };
    }

    /**
     * Creates the initial word choices for every slot based on pre-filled letters.
     */
    setupDomains(slots, wordLengthCache, grid) {
        const domains = {};
        for (const id in slots) {
            const slot = slots[id];
            const allWords = wordLengthCache[slot.length] || [];

            // Create a regex pattern based on current grid letters (e.g., "A.B..")
            const pattern = slot.positions.map(([r, c]) => {
                const char = grid[r][c];
                return (/[A-Z]/i.test(char)) ? char.toUpperCase() : '.';
            }).join('');

            if (pattern.includes('.')) {
                const regex = new RegExp(`^${pattern}$`);
                domains[id] = allWords.filter(w => regex.test(w));
            } else {
                // If the word is already fully typed out, the domain is just that word
                domains[id] = [pattern];
            }
        }
        return domains;
    }
}