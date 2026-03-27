// solver/ConstraintManager.js
import { GridUtils } from '../utils/GridUtils.js';

export class ConstraintManager {
    constructor() {
        this.slots = {};
        this.constraints = {};
        this.domains = {};
        this.patternCache = new Map();
    }

    /* ===============================
       BUILD SLOT + CONSTRAINT DATA
    =============================== */

    buildDataStructures(grid) {
        this.slots = {};
        this.constraints = {};
        this.domains = {};

        if (!GridUtils.isRectangularGrid(grid)) {
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

                const startsAcross = GridUtils.isStartOfAcrossSlot(grid, r, c);
                const startsDown = GridUtils.isStartOfDownSlot(grid, r, c);

                if (!startsAcross && !startsDown) continue;

                if (startsAcross) {
                    const acrossSlot = this._createSlot(grid, r, c, 'across', clueNumber);
                    if (acrossSlot) {
                        this.slots[acrossSlot.id] = acrossSlot;
                    }
                }

                if (startsDown) {
                    const downSlot = this._createSlot(grid, r, c, 'down', clueNumber);
                    if (downSlot) {
                        this.slots[downSlot.id] = downSlot;
                    }
                }

                clueNumber++;
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

        if (!positions.length) return null;

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

        if (!GridUtils.isRectangularGrid(grid)) return flatCellMap;

        for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < grid[0].length; c++) {
                const normalized = GridUtils.normalizeCellValue(grid[r][c]);
                flatCellMap[`${r},${c}`] = normalized === '#' ? '' : normalized;
            }
        }

        return flatCellMap;
    }

    /* ===============================
       CONSTRAINT GENERATION
    =============================== */

    generateConstraints() {
        this.constraints = {};

        const slotIds = Object.keys(this.slots);
        slotIds.forEach((slotId) => {
            this.constraints[slotId] = {};
        });

        const positionToSlots = this._buildPositionIndex();

        for (const key in positionToSlots) {
            const overlaps = positionToSlots[key];

            if (!Array.isArray(overlaps) || overlaps.length < 2) continue;

            for (let i = 0; i < overlaps.length; i++) {
                for (let j = i + 1; j < overlaps.length; j++) {
                    const a = overlaps[i];
                    const b = overlaps[j];

                    if (a.slotId === b.slotId) continue;

                    this._addConstraint(a.slotId, b.slotId, a.indexInSlot, b.indexInSlot);
                    this._addConstraint(b.slotId, a.slotId, b.indexInSlot, a.indexInSlot);
                }
            }
        }

        return this.constraints;
    }

    _buildPositionIndex() {
        const positionToSlots = {};

        for (const slotId in this.slots) {
            const slot = this.slots[slotId];
            if (!slot?.positions?.length) continue;

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

        return positionToSlots;
    }

    _addConstraint(fromSlotId, toSlotId, fromIndex, toIndex) {
        if (!this.constraints[fromSlotId]) {
            this.constraints[fromSlotId] = {};
        }

        if (!this.constraints[fromSlotId][toSlotId]) {
            this.constraints[fromSlotId][toSlotId] = [];
        }

        const alreadyExists = this.constraints[fromSlotId][toSlotId].some(
            ([existingFrom, existingTo]) =>
                existingFrom === fromIndex && existingTo === toIndex
        );

        if (!alreadyExists) {
            this.constraints[fromSlotId][toSlotId].push([fromIndex, toIndex]);
        }
    }

    getNeighbors(slotId) {
        return Object.keys(this.constraints[slotId] || {});
    }

    getOverlap(slotIdA, slotIdB) {
        const overlaps = this.constraints[slotIdA]?.[slotIdB] || [];
        return overlaps.length ? overlaps : null;
    }

    /* ===============================
       DOMAIN SETUP
    =============================== */

    setupDomains(slots, wordLengthCache, grid) {
        this.domains = {};

        for (const slotId in slots) {
            const slot = slots[slotId];
            const allWords = Array.isArray(wordLengthCache[slot.length])
                ? wordLengthCache[slot.length]
                : [];

            const pattern = this._buildSlotPattern(slot, grid);
            const cacheKey = `${slot.length}:${pattern.source}`;
            const cachedDomain = this.patternCache.get(cacheKey);

            if (cachedDomain) {
                this.domains[slotId] = [...cachedDomain];
                continue;
            }

            const filtered = allWords.filter((word) => {
                if (typeof word !== 'string') return false;

                const normalizedWord = word.trim().toUpperCase();

                if (normalizedWord.length !== slot.length) return false;
                return pattern.test(normalizedWord);
            });

            this.patternCache.set(cacheKey, filtered);
            this.domains[slotId] = [...filtered];
        }

        return this.domains;
    }

    _buildSlotPattern(slot, grid) {
        const patternParts = slot.positions.map(([r, c]) => {
            const normalized = GridUtils.normalizeCellValue(grid?.[r]?.[c]);
            return GridUtils.isLetter(normalized) ? normalized : '.';
        });

        return new RegExp(`^${patternParts.join('')}$`);
    }
}
