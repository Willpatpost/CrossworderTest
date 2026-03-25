// utils/GridUtils.js

export const GridUtils = {
    /* ===============================
       BASIC CELL / GRID HELPERS
    =============================== */

    isInBounds(grid, r, c) {
        return (
            Array.isArray(grid) &&
            r >= 0 &&
            c >= 0 &&
            r < grid.length &&
            c < (grid[0]?.length ?? 0)
        );
    },

    isBlock(grid, r, c) {
        if (!this.isInBounds(grid, r, c)) return false;
        return grid[r][c] === '#';
    },

    isFillableCell(grid, r, c) {
        if (!this.isInBounds(grid, r, c)) return false;
        return grid[r][c] !== '#';
    },

    normalizeCellValue(value) {
        if (value === '#') return '#';
        if (typeof value === 'string' && /^[A-Z]$/i.test(value)) {
            return value.toUpperCase();
        }
        return '';
    },

    /* ===============================
       SLOT START DETECTION
    =============================== */

    isStartOfAcrossSlot(grid, r, c) {
        if (!this.isFillableCell(grid, r, c)) return false;

        const startsAtLeftEdge = c === 0;
        const precededByBlock = !startsAtLeftEdge && this.isBlock(grid, r, c - 1);
        const hasCellToRight = this.isInBounds(grid, r, c + 1);
        const rightIsFillable = hasCellToRight && this.isFillableCell(grid, r, c + 1);

        return (startsAtLeftEdge || precededByBlock) && rightIsFillable;
    },

    isStartOfDownSlot(grid, r, c) {
        if (!this.isFillableCell(grid, r, c)) return false;

        const startsAtTopEdge = r === 0;
        const precededByBlock = !startsAtTopEdge && this.isBlock(grid, r - 1, c);
        const hasCellBelow = this.isInBounds(grid, r + 1, c);
        const belowIsFillable = hasCellBelow && this.isFillableCell(grid, r + 1, c);

        return (startsAtTopEdge || precededByBlock) && belowIsFillable;
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

    extractWordFromPositions(grid, positions) {
        return positions
            .map(([r, c]) => this.normalizeCellValue(grid[r][c]))
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