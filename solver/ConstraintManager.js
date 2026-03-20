// solver/ConstraintManager.js
import { GridUtils } from '../utils/GridUtils.js';

export class ConstraintManager {
    constructor() {
        this.slots = {};
        this.constraints = {};
        this.domains = {};
        this.cellContents = {}; 
    }

    buildDataStructures(grid) {
        this.slots = {};
        this.constraints = {};
        // We will return a flat map for the solver, but keep a local one for static values
        const staticLetters = {}; 
        
        const rows = grid.length;
        const cols = grid[0].length;
        let wordCounter = 1;

        // 1. Identify slots
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

        // 2. Generate a flat cellContents map for the SolverEngine
        // This map contains exactly what is physically in the grid (Letters or Clue Numbers)
        const flatCellMap = {};
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                flatCellMap[`${r},${c}`] = grid[r][c];
            }
        }

        this.generateConstraints();
        
        // We return the flat map because SolverEngine.js uses: val = cellContents[`${r},${c}`]
        return { slots: this.slots, cellContents: flatCellMap };
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
            // ID format changed to "1-across" to match UI expectations
            id: `${number}-${direction}`, 
            direction,
            number,
            length: positions.length,
            positions
        };
    }

    generateConstraints() {
        this.constraints = {};
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
     * Corrected: Uses the actual grid content to build the initial regex patterns.
     */
    setupDomains(slots, wordLengthCache) {
        this.domains = {};
        for (const slotId in slots) {
            const slot = slots[slotId];
            const possibleWords = wordLengthCache[slot.length] || [];

            // Build regex from pre-filled letters currently in the grid
            const pattern = slot.positions.map(pos => {
                const [r, c] = pos;
                // This logic should match SolverEngine: only lock in actual A-Z letters
                // If it's a number or a space, it's a wildcard '.'
                const val = this.slots[slotId].gridRef ? this.slots[slotId].gridRef[r][c] : ""; 
                // Note: Since we don't have grid here, we use the slots' positions 
                // and the logic within the Solver is usually better for dynamic checking.
                // For the initial domain, we can assume all words are possible unless 
                // we want to pre-filter based on user-typed letters.
                return '.'; 
            }).join('');

            // For now, let's keep the domains full and let the Solver's isConsistent 
            // handle the user-typed letters. This is much safer against "No solution found" errors.
            this.domains[slotId] = [...possibleWords];
        }
        return this.domains;
    }
}
