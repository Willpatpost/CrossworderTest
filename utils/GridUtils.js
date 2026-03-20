// utils/GridUtils.js
export const GridUtils = {
    isStartOfAcrossSlot(grid, r, c) {
        if (!grid[r] || !grid[r][c]) return false;
        if (grid[r][c] === '#') return false;
        if (c === 0 || grid[r][c - 1] === '#') {
            if (c + 1 < grid[0].length && grid[r][c + 1] !== '#') {
                return true;
            }
        }
        return false;
    },

    isStartOfDownSlot(grid, r, c) {
        if (!grid[r] || !grid[r][c]) return false;
        if (grid[r][c] === '#') return false;
        if (r === 0 || grid[r - 1][c] === '#') {
            if (r + 1 < grid.length && grid[r + 1][c] !== '#') {
                return true;
            }
        }
        return false;
    }
};