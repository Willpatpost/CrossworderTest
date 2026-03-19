// solver/grid/Slot.js

export class Slot {
  constructor({ id, direction, positions }) {
    this.id = id; // e.g. "12ACROSS"
    this.direction = direction; // "across" | "down"
    this.positions = positions; // [[r, c], ...]
    this.length = positions.length;
  }

  // -----------------------------
  // Static: Build positions
  // (EXTRACTED from getSlotPositions)
  // -----------------------------
  static getPositions(grid, startRow, startCol, direction) {
    const positions = [];
    let r = startRow;
    let c = startCol;

    while (
      r < grid.length &&
      c < grid[0].length &&
      grid[r][c] !== "#"
    ) {
      positions.push([r, c]);

      if (direction === "across") {
        c++;
      } else {
        r++;
      }
    }

    return positions;
  }

  // -----------------------------
  // Build pattern from grid state
  // (EXTRACTED from setupDomains)
  // -----------------------------
  getPattern(cellContents) {
    return this.positions
      .map(([r, c]) => {
        const key = `${r},${c}`;
        return cellContents[key] || '.';
      })
      .join('');
  }

  // -----------------------------
  // Convert pattern to regex
  // -----------------------------
  getRegex(cellContents) {
    const pattern = this.getPattern(cellContents);
    return new RegExp(`^${pattern}$`);
  }

  // -----------------------------
  // Check word against prefilled letters
  // (EXTRACTED from wordMatchesPreFilledLetters)
  // -----------------------------
  matchesWord(word, cellContents) {
    for (let i = 0; i < this.positions.length; i++) {
      const [r, c] = this.positions[i];
      const key = `${r},${c}`;
      const preFilled = cellContents[key];

      if (preFilled && preFilled !== word[i]) {
        return false;
      }
    }
    return true;
  }

  // -----------------------------
  // Utility: Create slot name
  // (EXTRACTED from generateSlots)
  // -----------------------------
  static createId(number, direction) {
    return `${number}${direction.toUpperCase()}`;
  }
}