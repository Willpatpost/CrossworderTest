// solver/ConstraintManager.js
import { GridUtils } from '../utils/GridUtils.js';

export class ConstraintManager {
    constructor() {
        this.slots = {};
        this.constraints = {};
        this.domains = {};
        this.cellContents = {}; // Maps "r,c" -> [slotId1, slotId2]
    }

    /**
     * Identifies all Across and Down slots and maps intersections.
     * Restores data needed for the Word Bank UI.
     */
    buildDataStructures(grid) {
        this.slots = {};
        this.cellContents = {}; 
        this.constraints = {};
        const rows = grid.length;
        const cols = grid[0].length;
        let wordCounter = 1;

        // 1. First pass: Identify slots and assign numbers
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const isAcross = GridUtils.isStartOfAcrossSlot(grid, r, c);
                const isDown = GridUtils.isStartOfDownSlot(grid, r, c);

                if (isAcross || isDown) {
                    const currentNum = wordCounter++;
                    
                    if (isAcross) {
                        const slot = this._extractSlot(grid, r, c, 'across', currentNum);
                        this.slots[slot.id] = slot;
                    }
                    if (isDown) {
                        const slot = this._extractSlot(grid, r, c, 'down', currentNum);
                        this.slots[slot.id] = slot;
                    }
                }
            }
        }

        // 2. Second pass: Map every coordinate to the slots that occupy it
        // This is crucial for the solver to detect intersections
        for (const slotId in this.slots) {
            this.slots[slotId].positions.forEach((pos, index) => {
                const key = `${pos[0]},${pos[1]}`;
                if (!this.cellContents[key]) {
                    this.cellContents[key] = {
                        slots: [],
                        staticValue: null
                    };
                }
                this.cellContents[key].slots.push({ slotId, index });
                
                // If the user manually typed a letter (not a number or #), lock it in
                const val = grid[pos[0]][pos[1]];
                if (/[A-Z]/.test(val)) {
                    this.cellContents[key].staticValue = val;
                }
            });
        }

        this.generateConstraints();
        return { slots: this.slots, cellContents: this.cellContents };
    }

    _extractSlot(grid, r, c, direction, number) {
        const positions = [];
        let currR = r;
        let currC = c;

        while (currR < grid.length && currC < grid[0].length && grid[currR][currC] !== "#") {
            positions.push([currR, currC]);
            if (direction === "across") currC++;
            else currR++;
        }

        return {
            id: `${direction}-${r}-${c}`, // Unique ID for solver
            direction,
            number,
            length: positions.length,
            positions
        };
    }

    /**
     * Creates the intersection map so the solver knows:
     * "If I change Word A, I must check Word B's letter at index X."
     */
    generateConstraints() {
        const positionMap = {};

        for (const slotId in this.slots) {
            this.slots[slotId].positions.forEach((pos, idx) => {
                const key = `${pos[0]},${pos[1]}`;
                if (!positionMap[key]) positionMap[key] = [];
                positionMap[key].push({ slotId, idx });
            });
        }

        for (const key in positionMap) {
            const overlaps = positionMap[key];
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
     * Filters word lists based on the length and any pre-filled letters.
     */
    setupDomains(wordLengthCache) {
        this.domains = {};
        for (const slotId in this.slots) {
            const slot = this.slots[slotId];
            const possibleWords = wordLengthCache[slot.length] || [];

            // Build regex from pre-filled letters
            const pattern = slot.positions.map(pos => {
                const key = `${pos[0]},${pos[1]}`;
                return this.cellContents[key]?.staticValue || '.';
            }).join('');

            const regex = new RegExp(`^${pattern}$`);
            this.domains[slotId] = possibleWords.filter(word => regex.test(word));
        }
        return this.domains;
    }
}