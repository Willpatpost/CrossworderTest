// utils/GridUtils.js
export const GridUtils = {
    /**
     * Checks if a cell is the start of an ACROSS word.
     * Matches the logic from your OG autoNumberGrid.
     */
    isStartOfAcrossSlot(grid, r, c) {
        if (!grid[r] || grid[r][c] === '#' || grid[r][c] === undefined) return false;
        // Start of row or preceded by a block
        const isStart = (c === 0 || grid[r][c - 1] === '#');
        // Has at least one white space to the right
        const hasSpace = (c + 1 < grid[0].length && grid[r][c + 1] !== '#');
        return isStart && hasSpace;
    },

    /**
     * Checks if a cell is the start of a DOWN word.
     * Matches the logic from your OG autoNumberGrid.
     */
    isStartOfDownSlot(grid, r, c) {
        if (!grid[r] || grid[r][c] === '#' || grid[r][c] === undefined) return false;
        // Top of column or preceded by a block
        const isStart = (r === 0 || grid[r - 1][c] === '#');
        // Has at least one white space below
        const hasSpace = (r + 1 < grid.length && grid[r + 1][c] !== '#');
        return isStart && hasSpace;
    },

    /**
     * THE MISSING LINK: Restores the statistical sorting logic.
     * Maps to OG: calculateLetterFrequenciesFromLoadedCache()
     */
    calculateLetterFrequencies(wordLengthCache) {
        const frequencies = {};
        let totalChars = 0;

        for (const len in wordLengthCache) {
            const words = wordLengthCache[len];
            for (const word of words) {
                for (const char of word) {
                    frequencies[char] = (frequencies[char] || 0) + 1;
                    totalChars++;
                }
            }
        }

        // Convert to relative probabilities (0.0 to 1.0)
        for (const char in frequencies) {
            frequencies[char] /= totalChars;
        }

        return frequencies;
    }
};