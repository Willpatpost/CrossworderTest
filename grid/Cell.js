// grid/Cell.js

export class Cell {
    constructor(row, col, value = "") {
        this.row = row;
        this.col = col;
        this.value = value; // "#", "", or "A"
    }

    isBlock() {
        return this.value === "#";
    }

    isFilled() {
        return /^[A-Z]$/.test(this.value);
    }

    isEmpty() {
        return this.value === "";
    }
}
