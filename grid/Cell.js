// grid/Cell.js
export class Cell {
    constructor(row, col, value = "#") {
        this.row = row;
        this.col = col;
        this.value = value; // "#", " ", "A", or "1" (number)
        this.domElement = null;
    }

    isBlock() {
        return this.value === "#";
    }

    isEmpty() {
        return this.value === " " || /\d/.test(this.value);
    }
}