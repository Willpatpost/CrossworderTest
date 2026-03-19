// CrosswordSolver.js

import { Slot } from './grid/Slot.js';
import { predefinedPuzzles } from './puzzles.js';
import { WordListProvider } from './WordListProvider.js';
import { WiktionaryDefinitionsProvider } from './WiktionaryDefinitionsProvider.js';

export class CrosswordSolver {
  constructor() {
    // --------------------- Configuration & Flags ---------------------
    this.DEBUG = false;
    this.isSolving = false;
    this.isNumberEntryMode = false;
    this.isLetterEntryMode = false;
    this.isDragMode = false;
    this.isDragging = false;

    // --------------------- Data Structures ---------------------
    this.grid = [];
    this.words = [];

    this.wordLengthCache = {};
    this.letterFrequencies = {};

    this.slots = {};
    this.constraints = {};
    this.solution = {};
    this.domains = {};
    this.cellContents = {};
    this.cells = {};
    this.performanceData = {};
    this.recursiveCalls = 0;

    // --------------------- Predefined Puzzles ---------------------
    this.predefinedPuzzles = predefinedPuzzles;

    // --------------------- Drag Mode Variables ---------------------
    this.toggleToBlack = true;
    this.startDragBound = null;
    this.onDragBound = null;
    this.stopDragBound = null;

    // --------------------- Providers ---------------------
    this.wordProvider = new WordListProvider({
      basePath: 'Data/words_by_length',
      uppercase: true,
    });

    this.definitionsProvider = new WiktionaryDefinitionsProvider({
      basePath: "Data/defs_by_length",
    });

    this.fallbackCache = {};

    // --------------------- Method Binding ---------------------
    this.loadWords = this.loadWords.bind(this);
    this.generateGrid = this.generateGrid.bind(this);
    this.renderGrid = this.renderGrid.bind(this);
    this.loadPredefinedPuzzle = this.loadPredefinedPuzzle.bind(this);
    this.cellClicked = this.cellClicked.bind(this);
    this.startNumberEntryMode = this.startNumberEntryMode.bind(this);
    this.startLetterEntryMode = this.startLetterEntryMode.bind(this);
    this.startDragMode = this.startDragMode.bind(this);
    this.solveCrossword = this.solveCrossword.bind(this);
    this.handleSearchInput = this.handleSearchInput.bind(this);
    this.displaySearchResults = this.displaySearchResults.bind(this);
    this.showDefinitionPopup = this.showDefinitionPopup.bind(this);
    this.autoNumberGrid = this.autoNumberGrid.bind(this);
  }

  // ----------------------------------------------------------------
  //                      🔹 Internal Helpers (NEW)
  // ----------------------------------------------------------------

  isNumberCell(value) {
    return /\d/.test(value);
  }

  isBlackCell(value) {
    return value === "#";
  }

  isEmptyCell(value) {
    return value === " " || value === "";
  }

  shouldStartAcross(r, c) {
    if (!this.grid[r] || !this.grid[r][c]) return false;
    if (this.isBlackCell(this.grid[r][c])) return false;

    return (
      (c === 0 || this.isBlackCell(this.grid[r][c - 1])) &&
      c + 1 < this.grid[0].length &&
      !this.isBlackCell(this.grid[r][c + 1])
    );
  }

  shouldStartDown(r, c) {
    if (!this.grid[r] || !this.grid[r][c]) return false;
    if (this.isBlackCell(this.grid[r][c])) return false;

    return (
      (r === 0 || this.isBlackCell(this.grid[r - 1][c])) &&
      r + 1 < this.grid.length &&
      !this.isBlackCell(this.grid[r + 1][c])
    );
  }

  // ----------------------------------------------------------------
  //                          Initialization
  // ----------------------------------------------------------------

  init() {
    try {
      this.createEventListeners();
      this.generateGrid(10, 10);
      this.updateStatus("Ready. Word lists will load on demand when solving.", true);
    } catch (error) {
      this.handleError("Initialization failed.", error);
    }
  }

  createEventListeners() {
    try {
      this.bindButton('#generate-grid-button', () => {
        const rows = parseInt(document.getElementById('rows-input')?.value) || 10;
        const cols = parseInt(document.getElementById('columns-input')?.value) || 10;
        this.generateGrid(rows, cols);
      });

      this.bindButton('#load-easy-button', () => this.loadPredefinedPuzzle("Easy"));
      this.bindButton('#load-medium-button', () => this.loadPredefinedPuzzle("Medium"));
      this.bindButton('#load-hard-button', () => this.loadPredefinedPuzzle("Hard"));

      this.bindButton('#number-entry-button', this.startNumberEntryMode);
      this.bindButton('#auto-number-button', this.autoNumberGrid);
      this.bindButton('#letter-entry-button', this.startLetterEntryMode);
      this.bindButton('#drag-mode-button', this.startDragMode);
      this.bindButton('#solve-crossword-button', this.solveCrossword);

      const input = document.getElementById('word-search-input');
      if (input) input.addEventListener('input', this.handleSearchInput);

    } catch (error) {
      this.handleError("Error setting up event listeners:", error);
    }
  }

  bindButton(selector, callback) {
    const button = document.querySelector(selector);
    if (!button) {
      this.debugLog(`Button not found: ${selector}`);
      return;
    }
    button.addEventListener('click', callback);
  }

  // ----------------------------------------------------------------
  //                       Grid Management
  // ----------------------------------------------------------------

  generateGrid(rows = 10, cols = 10) {
    try {
      this.grid = Array.from({ length: rows }, () => Array(cols).fill("#"));
      this.resetDataStructures();
      this.renderGrid();

      this.updateStatus(`Grid generated (${rows}x${cols})`, true);
    } catch (error) {
      this.handleError("Error generating grid:", error);
    }
  }

  resetDataStructures() {
    this.solution = {};
    this.slots = {};
    this.constraints = {};
    this.domains = {};
    this.cellContents = {};
    this.cells = {};
  }

  renderGrid() {
    try {
      const container = document.getElementById('grid-container');
      if (!container) throw new Error("Grid container not found.");

      container.innerHTML = '';

      const table = document.createElement('table');
      table.style.borderCollapse = 'collapse';

      for (let r = 0; r < this.grid.length; r++) {
        const tr = document.createElement('tr');

        for (let c = 0; c < this.grid[0].length; c++) {
          const td = document.createElement('td');
          const value = this.grid[r][c];

          td.dataset.row = r;
          td.dataset.col = c;

          td.style.border = '1px solid #ccc';
          td.style.width = '30px';
          td.style.height = '30px';
          td.style.textAlign = 'center';
          td.style.fontWeight = 'bold';
          td.style.cursor = 'pointer';

          if (this.isBlackCell(value)) {
            td.style.backgroundColor = '#000';
            td.style.color = '#000';
          } else {
            td.style.backgroundColor = '#fff';
            td.style.color = '#444';

            if (this.isNumberCell(value)) {
              td.textContent = value;
            }
          }

          td.addEventListener('click', this.cellClicked);
          this.cells[`${r},${c}`] = td;

          tr.appendChild(td);
        }

        table.appendChild(tr);
      }

      container.appendChild(table);

    } catch (error) {
      this.handleError("Error rendering grid:", error);
    }
  }

  // ----------------------------------------------------------------
  //                       Auto Numbering (CLEANED)
  // ----------------------------------------------------------------

  autoNumberGrid() {
    try {
      // Clear numbers
      for (let r = 0; r < this.grid.length; r++) {
        for (let c = 0; c < this.grid[0].length; c++) {
          if (this.isNumberCell(this.grid[r][c])) {
            this.grid[r][c] = ' ';
          }
        }
      }

      let current = 1;

      for (let r = 0; r < this.grid.length; r++) {
        for (let c = 0; c < this.grid[0].length; c++) {

          if (this.shouldStartAcross(r, c)) {
            this.grid[r][c] = current.toString();
            current++;
            continue;
          }

          if (this.shouldStartDown(r, c) && !this.isNumberCell(this.grid[r][c])) {
            this.grid[r][c] = current.toString();
            current++;
          }
        }
      }

      this.renderGrid();
      this.updateStatus("Auto-numbered all slots.");

    } catch (error) {
      this.handleError("Error auto-numbering grid:", error);
    }
    }

      // ----------------------------------------------------------------
  //                       Predefined Puzzle Loading (CLEANED)
  // ----------------------------------------------------------------

  loadPredefinedPuzzle(puzzleName) {
    try {
      const puzzle = this.predefinedPuzzles.find(p => p.name === puzzleName);
      if (!puzzle) throw new Error(`Puzzle "${puzzleName}" not found.`);

      if (!Array.isArray(puzzle.grid) || !Array.isArray(puzzle.grid[0])) {
        throw new Error(`Invalid grid format for "${puzzleName}"`);
      }

      this.resetDataStructures();
      this.grid = puzzle.grid.map(row => [...row]);

      this.renderGrid();

      // Populate cellContents
      for (let r = 0; r < this.grid.length; r++) {
        for (let c = 0; c < this.grid[0].length; c++) {
          const value = this.grid[r][c];
          const key = `${r},${c}`;

          if (/[A-Z]/.test(value)) {
            this.cellContents[key] = value;
            continue;
          }

          if (!this.isBlackCell(value) && value.trim() !== "") {
            this.cellContents[key] = null;
          }
        }
      }

      this.updateStatus(`Loaded puzzle: ${puzzleName}`, true);

    } catch (error) {
      this.handleError(`Error loading puzzle "${puzzleName}":`, error);
    }
  }

  // ----------------------------------------------------------------
  //                          Cell Interaction
  // ----------------------------------------------------------------

  cellClicked(event) {
    try {
      const cell = event.target;
      const row = parseInt(cell.dataset.row, 10);
      const col = parseInt(cell.dataset.col, 10);

      if (this.isNumberEntryMode) {
        this.handleNumberEntry(row, col);
        return;
      }

      if (this.isLetterEntryMode) {
        this.handleLetterEntry(row, col);
        return;
      }

      if (this.isDragMode) return;

      this.toggleBlockCell(row, col);

    } catch (error) {
      this.handleError("Error handling cell click:", error);
    }
  }

  handleNumberEntry(row, col) {
    if (this.isNumberCell(this.grid[row][col])) {
      this.removeNumberFromCell(row, col);
      return;
    }
    this.addNumberToCell(row, col);
  }

  handleLetterEntry(row, col) {
    const input = prompt("Enter a single letter (A-Z):");
    if (input === null) return;

    if (!/^[A-Za-z]$/.test(input)) {
      alert("Please enter a single letter (A-Z).");
      return;
    }

    const letter = input.toUpperCase();
    this.updateCell(row, col, letter, '#000', '#fff');
    this.grid[row][col] = letter;
  }

  toggleBlockCell(row, col) {
    if (!this.isBlackCell(this.grid[row][col])) {
      this.updateCell(row, col, '', '#000', '#000');
      this.grid[row][col] = "#";
      this.updateNumbersAfterRemoval(row, col);
      return;
    }

    this.updateCell(row, col, '', '#444', '#fff');
    this.grid[row][col] = " ";
  }

  // ----------------------------------------------------------------
  //                         Mode Toggles (CLEANED)
  // ----------------------------------------------------------------

  startNumberEntryMode() {
    this.toggleMode({
      modeKey: 'isNumberEntryMode',
      label: "Number Entry",
      buttonId: 'number-entry-button'
    });
  }

  startLetterEntryMode() {
    this.toggleMode({
      modeKey: 'isLetterEntryMode',
      label: "Letter Entry",
      buttonId: 'letter-entry-button'
    });
  }

  startDragMode() {
    try {
      const modeLabel = document.getElementById('mode-label');
      const button = document.getElementById('drag-mode-button');

      if (!modeLabel || !button) {
        throw new Error("Drag mode UI elements missing.");
      }

      if (this.isDragMode) {
        this.disableDragMode(button, modeLabel);
        return;
      }

      // Turn off others
      if (this.isNumberEntryMode) this.startNumberEntryMode();
      if (this.isLetterEntryMode) this.startLetterEntryMode();

      this.isDragMode = true;

      modeLabel.textContent = "Mode: Drag";
      button.textContent = "Exit Drag Mode";
      button.style.backgroundColor = "#dc3545";

      this.startDragBound = this.startDrag.bind(this);
      this.onDragBound = this.onDrag.bind(this);
      this.stopDragBound = this.stopDrag.bind(this);

      for (const key in this.cells) {
        const cell = this.cells[key];
        cell.addEventListener('mousedown', this.startDragBound);
        cell.addEventListener('mousemove', this.onDragBound);
        cell.addEventListener('mouseup', this.stopDragBound);
      }

      this.updateStatus("Drag Mode Activated.");

    } catch (error) {
      this.handleError("Error toggling Drag Mode:", error);
    }
  }

  toggleMode({ modeKey, label, buttonId }) {
    try {
      const modeLabel = document.getElementById('mode-label');
      const button = document.getElementById(buttonId);

      if (!modeLabel || !button) {
        throw new Error(`${label} mode UI elements missing.`);
      }

      if (this[modeKey]) {
        this[modeKey] = false;
        modeLabel.textContent = "Mode: Default";
        button.textContent = `${label} Mode`;
        button.style.backgroundColor = "#0069d9";
        this.updateStatus(`${label} Mode Deactivated.`);
        return;
      }

      // Turn off others
      if (modeKey !== 'isNumberEntryMode' && this.isNumberEntryMode) this.startNumberEntryMode();
      if (modeKey !== 'isLetterEntryMode' && this.isLetterEntryMode) this.startLetterEntryMode();
      if (modeKey !== 'isDragMode' && this.isDragMode) this.startDragMode();

      this[modeKey] = true;

      modeLabel.textContent = `Mode: ${label}`;
      button.textContent = `Exit ${label} Mode`;
      button.style.backgroundColor = "#dc3545";

      this.updateStatus(`${label} Mode Activated.`);

    } catch (error) {
      this.handleError(`Error toggling ${label} mode:`, error);
    }
  }

  disableDragMode(button, modeLabel) {
    this.isDragMode = false;

    modeLabel.textContent = "Mode: Default";
    button.textContent = "Drag Mode";
    button.style.backgroundColor = "#0069d9";

    for (const key in this.cells) {
      const cell = this.cells[key];
      cell.removeEventListener('mousedown', this.startDragBound);
      cell.removeEventListener('mousemove', this.onDragBound);
      cell.removeEventListener('mouseup', this.stopDragBound);
    }

    this.updateStatus("Drag Mode Deactivated.");
  }

  // ----------------------------------------------------------------
  //                         Number Management (CLEANED)
  // ----------------------------------------------------------------

  addNumberToCell(row, col) {
    try {
      const positions = this.getNumberPositions();
      const newNumber = this.getNewNumber(row, col, positions);

      this.updateNumbersAfterInsertion(row, col, newNumber);

      this.grid[row][col] = newNumber.toString();
      this.updateCell(row, col, newNumber.toString(), '#000', '#fff');

    } catch (error) {
      this.handleError(`Error adding number at (${row}, ${col})`, error);
    }
  }

  getNumberPositions() {
    const positions = [];

    for (let r = 0; r < this.grid.length; r++) {
      for (let c = 0; c < this.grid[0].length; c++) {
        const value = this.grid[r][c];
        if (!this.isNumberCell(value)) continue;

        positions.push({
          number: parseInt(value, 10),
          row: r,
          col: c
        });
      }
    }

    return positions.sort((a, b) => a.number - b.number);
  }

  getNewNumber(row, col, positions) {
    let index = 0;

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];

      if (row < pos.row || (row === pos.row && col < pos.col)) break;
      index = i + 1;
    }

    return index + 1;
  }

  updateNumbersAfterInsertion(row, col, newNumber) {
    for (let r = 0; r < this.grid.length; r++) {
      for (let c = 0; c < this.grid[0].length; c++) {
        const value = this.grid[r][c];
        if (!this.isNumberCell(value)) continue;

        const current = parseInt(value, 10);
        if (current < newNumber || (r === row && c === col)) continue;

        const updated = current + 1;
        this.grid[r][c] = updated.toString();
        this.updateCell(r, c, updated.toString());
      }
    }
  }

  removeNumberFromCell(row, col) {
    try {
      const removed = parseInt(this.grid[row][col], 10);

      this.grid[row][col] = " ";
      this.updateCell(row, col, "", '#444', '#fff');

      for (let r = 0; r < this.grid.length; r++) {
        for (let c = 0; c < this.grid[0].length; c++) {
          const value = this.grid[r][c];
          if (!this.isNumberCell(value)) continue;

          const current = parseInt(value, 10);
          if (current <= removed) continue;

          const updated = current - 1;
          this.grid[r][c] = updated.toString();
          this.updateCell(r, c, updated.toString());
        }
      }

    } catch (error) {
      this.handleError(`Error removing number at (${row}, ${col})`, error);
    }
  }

  updateNumbersAfterRemoval(row, col) {
    if (!this.isNumberCell(this.grid[row][col])) return;
    this.removeNumberFromCell(row, col);
  }

  // ----------------------------------------------------------------
  //                         Drag Logic (SIMPLIFIED)
  // ----------------------------------------------------------------

  startDrag(event) {
    if (!this.isDragMode) return;

    this.isDragging = true;

    const row = parseInt(event.target.dataset.row, 10);
    const col = parseInt(event.target.dataset.col, 10);

    this.toggleToBlack = !this.isBlackCell(this.grid[row][col]);
    this.toggleCell(row, col);
  }

  onDrag(event) {
    if (!this.isDragging || !this.isDragMode) return;

    const cell = document.elementFromPoint(event.clientX, event.clientY);
    if (!cell?.dataset) return;

    const row = parseInt(cell.dataset.row, 10);
    const col = parseInt(cell.dataset.col, 10);

    if (Number.isNaN(row) || Number.isNaN(col)) return;

    this.toggleCell(row, col);
  }

  stopDrag() {
    this.isDragging = false;
  }

  toggleCell(row, col) {
    const cell = this.cells[`${row},${col}`];
    if (!cell) return;

    if (this.toggleToBlack && !this.isBlackCell(this.grid[row][col])) {
      this.grid[row][col] = "#";
      this.updateCell(row, col, "", '#000', '#000');
      this.updateNumbersAfterRemoval(row, col);
      return;
    }

    if (!this.toggleToBlack && this.isBlackCell(this.grid[row][col])) {
      this.grid[row][col] = " ";
      this.updateCell(row, col, "", '#444', '#fff');
    }
  }

  async generateSlots() {
    this.slots = {};
    this.domains = {};
    this.cellContents = {};

    const rows = this.grid.length;
    const cols = this.grid[0].length;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = this.grid[r][c];

            if (!/\d/.test(cell)) continue;

            const number = cell;

            this.tryCreateSlot(r, c, number, "across");
            this.tryCreateSlot(r, c, number, "down");
        }
    }

    const lengthsNeeded = [
        ...new Set(Object.values(this.slots).map(slot => slot.length))
    ];

    await this.wordProvider.preloadLengths(lengthsNeeded);

    for (const L of lengthsNeeded) {
        this.wordLengthCache[L] = await this.wordProvider.getWordsOfLength(L);
    }

    this.calculateLetterFrequenciesFromLoadedCache();

    this.generateConstraints();
    this.setupDomains();
    }

    tryCreateSlot(r, c, number, direction) {
    if (!this.isStartOfSlot(r, c, direction)) return;

    const positions = Slot.getPositions(this.grid, r, c, direction);

    if (positions.length < 2) return;

    const slotId = Slot.createId(number, direction, r, c);

    this.slots[slotId] = new Slot({
        id: slotId,
        direction,
        positions
    });
    }

    isStartOfSlot(r, c, direction) {
    if (this.grid[r][c] === "#") return false;

    if (direction === "across") {
        return (
            (c === 0 || this.grid[r][c - 1] === "#") &&
            (c + 1 < this.grid[0].length && this.grid[r][c + 1] !== "#")
        );
    }

    if (direction === "down") {
        return (
            (r === 0 || this.grid[r - 1][c] === "#") &&
            (r + 1 < this.grid.length && this.grid[r + 1][c] !== "#")
        );
    }

    return false;
    }

    autoNumberGrid() {
    try {
        for (let r = 0; r < this.grid.length; r++) {
            for (let c = 0; c < this.grid[0].length; c++) {
                if (/\d+/.test(this.grid[r][c])) {
                    this.grid[r][c] = ' ';
                }
            }
        }

        let currentNumber = 1;

        for (let r = 0; r < this.grid.length; r++) {
            for (let c = 0; c < this.grid[0].length; c++) {

                if (this.isStartOfSlot(r, c, "across") ||
                    this.isStartOfSlot(r, c, "down")) {

                    this.grid[r][c] = currentNumber.toString();
                    currentNumber++;
                }
            }
        }

        this.renderGrid();
        this.updateStatus("Auto-numbered all slots.");

    } catch (error) {
        this.handleError("Error auto-numbering grid:", error);
    }
    }

    isStartOfAcrossSlot(r, c) {
        return this.isStartOfSlot(r, c, "across");
    }

    isStartOfDownSlot(r, c) {
        return this.isStartOfSlot(r, c, "down");
    }

    