// solver/ConstraintManager.js
import { GridUtils } from '../utils/GridUtils.js';

export class ConstraintManager {
    constructor() {
        this.slots = {};
        this.constraints = {};
        this.domains = {};
    }

    /* ===============================
       BUILD SLOT + CONSTRAINT DATA
    =============================== */

    buildDataStructures(grid) {
        this.slots = {};
        this.constraints = {};
        this.domains = {};

        if (!Array.isArray(grid) || grid.length === 0 || !Array.isArray(grid[0])) {
            return {
                slots: {},
                cellContents: {}
            };
        }

        const rows = grid.length;
        const cols = grid[0].length;
        let clueNumber = 1;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (!GridUtils.isFillableCell(grid, r, c)) continue;

                const isAcross = GridUtils.isStartOfAcrossSlot(grid, r, c);
                const isDown = GridUtils.isStartOfDownSlot(grid, r, c);

                let assignedNumber = false;

                if (isAcross) {
                    const slot = this._createSlot(grid, r, c, 'across', clueNumber);
                    this.slots[slot.id] = slot;
                    assignedNumber = true;
                }

                if (isDown) {
                    const slot = this._createSlot(grid, r, c, 'down', clueNumber);
                    this.slots[slot.id] = slot;
                    assignedNumber = true;
                }

                if (assignedNumber) {
                    clueNumber++;
                }
            }
        }

        const cellContents = this._buildCellContentsMap(grid);

        this.generateConstraints();

        return {
            slots: this.slots,
            cellContents
        };
    }

    _createSlot(grid, r, c, direction, clueNumber) {
        const positions = GridUtils.getSlotPositions(grid, r, c, direction);

        return {
            id: `${clueNumber}-${direction}`,
            direction,
            number: clueNumber,
            length: positions.length,
            positions
        };
    }

    _buildCellContentsMap(grid) {
        const flatCellMap = {};

        for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < grid[0].length; c++) {
                flatCellMap[`${r},${c}`] = GridUtils.normalizeCellValue(grid[r][c]) === '#'
                    ? ''
                    : GridUtils.normalizeCellValue(grid[r][c]);
            }
        }

        return flatCellMap;
    }

    /* ===============================
       CONSTRAINT GENERATION
    =============================== */

    generateConstraints() {
        this.constraints = {};

        const positionToSlots = {};

        for (const slotId in this.slots) {
            const slot = this.slots[slotId];

            slot.positions.forEach(([r, c], indexInSlot) => {
                const key = `${r},${c}`;

                if (!positionToSlots[key]) {
                    positionToSlots[key] = [];
                }

                positionToSlots[key].push({
                    slotId,
                    indexInSlot
                });
            });
        }

        for (const key in positionToSlots) {
            const overlaps = positionToSlots[key];

            if (overlaps.length < 2) continue;

            for (let i = 0; i < overlaps.length; i++) {
                for (let j = i + 1; j < overlaps.length; j++) {
                    const a = overlaps[i];
                    const b = overlaps[j];

                    this._addConstraint(a.slotId, b.slotId, a.indexInSlot, b.indexInSlot);
                    this._addConstraint(b.slotId, a.slotId, b.indexInSlot, a.indexInSlot);
                }
            }
        }
    }

    _addConstraint(fromSlotId, toSlotId, fromIndex, toIndex) {
        if (!this.constraints[fromSlotId]) {
            this.constraints[fromSlotId] = {};
        }

        if (!this.constraints[fromSlotId][toSlotId]) {
            this.constraints[fromSlotId][toSlotId] = [];
        }

        this.constraints[fromSlotId][toSlotId].push([fromIndex, toIndex]);
    }

    /* ===============================
       DOMAIN SETUP
    =============================== */

    setupDomains(slots, wordLengthCache, grid) {
        this.domains = {};

        for (const slotId in slots) {
            const slot = slots[slotId];
            const allWords = wordLengthCache[slot.length] || [];

            const pattern = this._buildSlotPattern(slot, grid);
            this.domains[slotId] = allWords.filter(word => pattern.test(word));
        }

        return this.domains;
    }

    _buildSlotPattern(slot, grid) {
        const patternParts = slot.positions.map(([r, c]) => {
            const normalized = GridUtils.normalizeCellValue(grid[r][c]);
            return /^[A-Z]$/.test(normalized) ? normalized : '.';
        });

        return new RegExp(`^${patternParts.join('')}$`);
    }
}