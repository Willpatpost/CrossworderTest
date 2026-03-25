// utils/GridUtils.js

export const GridUtils = {
    /* ===============================
       BASIC CELL / GRID HELPERS
    =============================== */

    isRectangularGrid(grid) {
        if (!Array.isArray(grid) || grid.length === 0) return false;
        if (!Array.isArray(grid[0]) || grid[0].length === 0) return false;

        const width = grid[0].length;
        return grid.every((row) => Array.isArray(row) && row.length === width);
    },

    isInBounds(grid, r, c) {
        return (
            this.isRectangularGrid(grid) &&
            Number.isInteger(r) &&
            Number.isInteger(c) &&
            r >= 0 &&
            c >= 0 &&
            r < grid.length &&
            c < grid[0].length
        );
    },

    isBlock(grid, r, c) {
        if (!this.isInBounds(grid, r, c)) return false;
        return this.normalizeCellValue(grid[r][c]) === '#';
    },

    isLetter(value) {
        return typeof value === 'string' && /^[A-Z]$/i.test(value);
    },

    isEmptyValue(value) {
        return this.normalizeCellValue(value) === '';
    },

    isFillableCell(grid, r, c) {
        if (!this.isInBounds(grid, r, c)) return false;
        return !this.isBlock(grid, r, c);
    },

    normalizeCellValue(value) {
        if (value === '#') return '#';

        if (typeof value === 'string') {
            const trimmed = value.trim();

            if (trimmed === '#') return '#';
            if (/^[A-Z]$/i.test(trimmed)) return trimmed.toUpperCase();
        }

        return '';
    },

    cloneGrid(grid) {
        if (!Array.isArray(grid)) return [];
        return grid.map((row) => (Array.isArray(row) ? [...row] : []));
    },

    normalizeGrid(grid) {
        if (!Array.isArray(grid)) return [];

        return grid.map((row) =>
            Array.isArray(row)
                ? row.map((cell) => this.normalizeCellValue(cell))
                : []
        );
    },

    /* ===============================
       SLOT START DETECTION
    =============================== */

    isStartOfAcrossSlot(grid, r, c) {
        if (!this.isFillableCell(grid, r, c)) return false;

        const startsAtLeftEdge = c === 0;
        const precededByBlock = !startsAtLeftEdge && this.isBlock(grid, r, c - 1);
        const rightIsFillable = this.isFillableCell(grid, r, c + 1);

        return (startsAtLeftEdge || precededByBlock) && rightIsFillable;
    },

    isStartOfDownSlot(grid, r, c) {
        if (!this.isFillableCell(grid, r, c)) return false;

        const startsAtTopEdge = r === 0;
        const precededByBlock = !startsAtTopEdge && this.isBlock(grid, r - 1, c);
        const belowIsFillable = this.isFillableCell(grid, r + 1, c);

        return (startsAtTopEdge || precededByBlock) && belowIsFillable;
    },

    getSlotNumber(grid, r, c) {
        if (!this.isFillableCell(grid, r, c)) return null;

        const startsAcross = this.isStartOfAcrossSlot(grid, r, c);
        const startsDown = this.isStartOfDownSlot(grid, r, c);

        if (!startsAcross && !startsDown) return null;

        let number = 0;

        for (let row = 0; row < grid.length; row++) {
            for (let col = 0; col < grid[0].length; col++) {
                if (!this.isFillableCell(grid, row, col)) continue;

                const startsSlot =
                    this.isStartOfAcrossSlot(grid, row, col) ||
                    this.isStartOfDownSlot(grid, row, col);

                if (!startsSlot) continue;

                number++;

                if (row === r && col === c) {
                    return number;
                }
            }
        }

        return null;
    },

    /* ===============================
       SLOT POSITION HELPERS
    =============================== */

    getAcrossSlotPositions(grid, r, c) {
        if (!this.isStartOfAcrossSlot(grid, r, c)) return [];

        const positions = [];
        let col = c;

        while (this.isInBounds(grid, r, col) && this.isFillableCell(grid, r, col)) {
            positions.push([r, col]);
            col++;
        }

        return positions;
    },

    getDownSlotPositions(grid, r, c) {
        if (!this.isStartOfDownSlot(grid, r, c)) return [];

        const positions = [];
        let row = r;

        while (this.isInBounds(grid, row, c) && this.isFillableCell(grid, row, c)) {
            positions.push([row, c]);
            row++;
        }

        return positions;
    },

    getSlotPositions(grid, r, c, direction) {
        if (direction === 'across') {
            return this.getAcrossSlotPositions(grid, r, c);
        }

        if (direction === 'down') {
            return this.getDownSlotPositions(grid, r, c);
        }

        return [];
    },

    findSlotContainingCell(slots, r, c, direction = null) {
        const allSlots = Object.values(slots || {});
        return (
            allSlots.find((slot) => {
                if (direction && slot.direction !== direction) return false;

                return slot.positions.some(
                    ([slotRow, slotCol]) => slotRow === r && slotCol === c
                );
            }) || null
        );
    },

    extractWordFromPositions(grid, positions) {
        return positions
            .map(([r, c]) => this.normalizeCellValue(grid?.[r]?.[c]))
            .join('');
    },

    /* ===============================
       GRID ANALYSIS
    =============================== */

    calculateLetterFrequencies(wordLengthCache) {
        const frequencies = {};
        let totalChars = 0;

        for (const len in wordLengthCache) {
            const words = wordLengthCache[len];
            if (!Array.isArray(words)) continue;

            for (const word of words) {
                if (typeof word !== 'string') continue;

                for (const char of word.toUpperCase()) {
                    if (!/^[A-Z]$/.test(char)) continue;
                    frequencies[char] = (frequencies[char] || 0) + 1;
                    totalChars++;
                }
            }
        }

        if (totalChars === 0) return {};

        for (const char in frequencies) {
            frequencies[char] /= totalChars;
        }

        return frequencies;
    }
};