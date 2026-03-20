// solver/ConstraintManager.js

export class ConstraintManager {
    constructor() {
        this.slots = {};
        this.constraints = {};
        this.domains = {};
        this.cellContents = {};
    }

    // Maps to original: generateSlots() (First half)
    buildDataStructures(grid) {
        this.slots = {};
        this.cellContents = {};
        const rows = grid.length;
        const cols = grid[0].length;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const val = grid[r][c];
                const key = `${r},${c}`;

                if (/[A-Z]/.test(val)) {
                    this.cellContents[key] = val;
                } else if (val !== "#" && val.trim() !== "") {
                    this.cellContents[key] = null;
                }
            }
        }

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (/\d/.test(grid[r][c])) {
                    if (c === 0 || grid[r][c - 1] === "#") {
                        const positions = this.getSlotPositions(grid, r, c, "across");
                        if (positions.length >= 2) {
                            const slotName = `${grid[r][c]}ACROSS`;
                            this.slots[slotName] = positions;
                        }
                    }
                    if (r === 0 || grid[r - 1][c] === "#") {
                        const positions = this.getSlotPositions(grid, r, c, "down");
                        if (positions.length >= 2) {
                            const slotName = `${grid[r][c]}DOWN`;
                            this.slots[slotName] = positions;
                        }
                    }
                }
            }
        }
        
        this.generateConstraints();
        return { slots: this.slots, cellContents: this.cellContents };
    }

    // Maps to original: getSlotPositions()
    getSlotPositions(grid, r, c, direction) {
        const positions = [];
        while (r < grid.length && c < grid[0].length && grid[r][c] !== "#") {
            positions.push([r, c]);
            if (direction === "across") c++;
            else r++;
        }
        return positions;
    }

    // Maps to original: generateConstraints()
    generateConstraints() {
        this.constraints = {};
        const positionMap = {};

        for (const slot in this.slots) {
            const positions = this.slots[slot];
            positions.forEach((pos, idx) => {
                const key = `${pos[0]},${pos[1]}`;
                if (!positionMap[key]) positionMap[key] = [];
                positionMap[key].push({ slot, idx });
            });
        }

        for (const key in positionMap) {
            const overlaps = positionMap[key];
            if (overlaps.length > 1) {
                for (let i = 0; i < overlaps.length; i++) {
                    for (let j = i + 1; j < overlaps.length; j++) {
                        const slotA = overlaps[i].slot;
                        const idxA = overlaps[i].idx;
                        const slotB = overlaps[j].slot;
                        const idxB = overlaps[j].idx;

                        if (!this.constraints[slotA]) this.constraints[slotA] = {};
                        if (!this.constraints[slotA][slotB]) this.constraints[slotA][slotB] = [];
                        this.constraints[slotA][slotB].push([idxA, idxB]);

                        if (!this.constraints[slotB]) this.constraints[slotB] = {};
                        if (!this.constraints[slotB][slotA]) this.constraints[slotB][slotA] = [];
                        this.constraints[slotB][slotA].push([idxB, idxA]);
                    }
                }
            }
        }
    }

    // Maps to original: setupDomains()
    setupDomains(wordLengthCache) {
        this.domains = {};
        for (const slot in this.slots) {
            const positions = this.slots[slot];
            const length = positions.length;

            const pattern = positions.map(([r, c]) => {
                const key = `${r},${c}`;
                return this.cellContents[key] || '.';
            }).join('');

            const regex = new RegExp(`^${pattern}$`);
            const possibleWords = wordLengthCache[length] || [];
            this.domains[slot] = possibleWords.filter(word => regex.test(word));
        }
        return this.domains;
    }
}