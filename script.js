// script.js

/**
 * Initializes the Crossword Solver once the DOM is ready.
 */
document.addEventListener('DOMContentLoaded', () => {
    const crosswordSolver = new CrosswordSolver();
    crosswordSolver.init();
});

class CrosswordSolver {
    constructor() {
        // --------------------- Configuration & Flags ---------------------
        this.DEBUG = false;             // Toggle debug messages
        this.isSolving = false;         // Prevent concurrent solving
        this.isNumberEntryMode = false; // Number entry mode flag
        this.isLetterEntryMode = false; // Letter entry mode flag
        this.isDragMode = false;        // Drag mode flag
        this.isDragging = false;        // Internal drag-state flag

        // --------------------- Data Structures ---------------------
        this.grid = [];            // The crossword grid
        this.words = [];           // Word list
        this.wordLengthCache = {}; // Cache for words by length
        this.letterFrequencies = {};// Letter frequency map
        this.slots = {};           // Slots with positions
        this.constraints = {};     // Constraints between slots
        this.solution = {};        // Final solution mapping slots to words
        this.domains = {};         // Possible words for each slot
        this.cellContents = {};    // Pre-filled letters in the grid
        this.cells = {};           // GUI cell mapping
        this.performanceData = {}; // Store performance metrics
        this.recursiveCalls = 0;   // Count recursive calls for backtracking

        // --------------------- Predefined Puzzles ---------------------
        this.predefinedPuzzles = this.initializePuzzles();

        // --------------------- Drag Mode Variables ---------------------
        this.toggleToBlack = true;
        this.startDragBound = null;
        this.onDragBound = null;
        this.stopDragBound = null;

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
    }

    // ----------------------------------------------------------------
    //                          Initialization
    // ----------------------------------------------------------------

    /**
     * Lifecycle method called after DOM content is loaded.
     * Sets up event listeners, loads words, and creates an initial 10x10 grid.
     */
    init() {
        try {
            this.createEventListeners();
            this.loadWords()
                .then(() => {
                    // Auto-generate a 10x10 grid when the page loads
                    this.generateGrid(10, 10);
                    // NOTE: We are NOT creating a duplicate Word Lookup section here
                })
                .catch((error) => {
                    this.handleError("Initialization failed during word loading.", error);
                });
        } catch (error) {
            this.handleError("Initialization failed.", error);
        }
    }

    /**
     * Defines the set of predefined puzzles for easy, medium, and hard modes.
     * @returns {Array} Array of puzzle objects
     */
    initializePuzzles() {
        return [
            {
                name: "Easy",
                grid: [
                    ["#", "#", "#", "#", "#", "#", "#"],
                    ["#", "1", " ", "2", " ", "3", "#"],
                    ["#", "#", "#", " ", "#", " ", "#"],
                    ["#", "#", "4", " ", "5", " ", "#"],
                    ["#", "6", "#", "7", " ", " ", "#"],
                    ["#", "8", " ", " ", " ", " ", "#"],
                    ["#", " ", "#", "#", " ", "#", "#"],
                    ["#", "#", "#", "#", "#", "#", "#"]
                ]
            },
            {
                name: "Medium",
                grid: [
                    ["#", "#", "#", "#", "#", "#", "#", "#", "#", "#", "#", "#", "#", "#"],
                    ["#", "#", "#", "1", " ", " ", " ", " ", " ", "2", "#", "#", "#", "#"],
                    ["#", "#", "#", " ", "#", "#", "#", "#", "#", " ", "#", "#", "3", "#"],
                    ["#", "#", "#", " ", "#", "#", "#", "#", "#", " ", "#", "#", " ", "#"],
                    ["#", "#", "#", " ", "#", "#", "4", " ", "5", " ", " ", "#", " ", "#"],
                    ["#", "#", "#", " ", "#", "#", "#", "#", " ", "#", "#", "#", " ", "#"],
                    ["#", "#", "#", "#", "#", "6", "#", "#", "7", " ", "8", " ", " ", "#"],
                    ["#", "#", "#", "#", "#", " ", "#", "#", " ", "#", " ", "#", " ", "#"],
                    ["#", "#", "9", "#", "10", " ", " ", " ", " ", "#", " ", "#", "#", "#"],
                    ["#", "#", " ", "#", "#", " ", "#", "#", " ", "#", " ", "#", "#", "#"],
                    ["#", "11", " ", " ", " ", " ", " ", "#", "#", "#", " ", "#", "#", "#"],
                    ["#", "#", " ", "#", "#", " ", "#", "#", "#", "#", " ", "#", "#", "#"],
                    ["#", "#", "#", "#", "#", "#", "#", "#", "#", "#", "#", "#", "#", "#"]
                ]
            },
            {
                name: "Hard",
                grid: [
                    ["#", "#", "#", "#", "#", "#", "#", "#", "#", "#", "#", "#", "#", "#", "#"],
                    ["#", "#", "#", "1", "2", "3", "#", "#", "#", "4", "5", "6", "#", "#", "#"],
                    ["#", "#", "7", " ", " ", " ", "8", "#", "9", " ", " ", " ", "10", "#", "#"],
                    ["#", "#", "11", " ", " ", " ", " ", "#", "12", " ", " ", " ", " ", "#", "#"],
                    ["#", "13", " ", " ", "#", "14", " ", "15", " ", " ", "#", "16", " ", "17", "#"],
                    ["#", "18", " ", " ", "19", "#", "20", " ", " ", "#", "21", " ", " ", " ", "#"],
                    ["#", "22", " ", " ", " ", "#", "23", " ", " ", "#", "24", " ", " ", " ", "#"],
                    ["#", "#", "25", " ", " ", "26", "#", "#", "#", "27", " ", " ", " ", "#", "#"],
                    ["#", "#", "#", "28", " ", " ", "29", "#", "30", " ", " ", " ", "#", "#", "#"],
                    ["#", "#", "#", "#", "31", " ", " ", "32", " ", " ", " ", "#", "#", "#", "#"],
                    ["#", "#", "#", "#", "#", "33", " ", " ", " ", " ", "#", "#", "#", "#", "#"],
                    ["#", "#", "#", "#", "#", "#", "N", "T", "H", "#", "#", "#", "#", "#", "#"],
                    ["#", "#", "#", "#", "#", "#", "#", " ", "#", "#", "#", "#", "#", "#", "#"],
                    ["#", "#", "#", "#", "#", "#", "#", "#", "#", "#", "#", "#", "#", "#", "#"]
                ]
            }
        ];
    }

    /**
     * Binds all DOM event listeners needed for puzzle generation, mode toggling, etc.
     */
    createEventListeners() {
        try {
            // Generate Grid Button
            this.bindButton('#generate-grid-button', () => {
                const rowsInput = document.getElementById('rows-input');
                const columnsInput = document.getElementById('columns-input');
                const rows = parseInt(rowsInput?.value) || 10;
                const cols = parseInt(columnsInput?.value) || 10;
                this.generateGrid(rows, cols);
            });

            // Load Predefined Puzzle Buttons
            this.bindButton('#load-easy-button', () => this.loadPredefinedPuzzle("Easy"));
            this.bindButton('#load-medium-button', () => this.loadPredefinedPuzzle("Medium"));
            this.bindButton('#load-hard-button', () => this.loadPredefinedPuzzle("Hard"));

            // Mode Buttons
            this.bindButton('#number-entry-button', this.startNumberEntryMode);
            this.bindButton('#letter-entry-button', this.startLetterEntryMode);
            this.bindButton('#drag-mode-button', this.startDragMode);

            // Solve Crossword Button
            this.bindButton('#solve-crossword-button', this.solveCrossword);

            // Word Lookup Input
            // If the ID is present in HTML, we'll attach the dynamic search.
            const wordSearchInput = document.getElementById('word-search-input');
            if (wordSearchInput) {
                wordSearchInput.addEventListener('input', this.handleSearchInput);
            }

        } catch (error) {
            this.handleError("Error setting up event listeners:", error);
        }
    }

    /**
     * Utility function to reduce repetitive button-binding code.
     * @param {string} selector - CSS selector for the button
     * @param {Function} callback - Event handler function
     */
    bindButton(selector, callback) {
        const button = document.querySelector(selector);
        if (!button) {
            // Not all buttons are mandatory, so just log a debug message
            this.debugLog(`Button with selector "${selector}" not found in DOM. Possibly intentional.`);
            return;
        }
        button.addEventListener('click', callback);
    }

    // ----------------------------------------------------------------
    //                          Word Loading
    // ----------------------------------------------------------------

    /**
     * Loads words from a text file (Data/Words.txt).
     * Caches them by length and calculates letter frequencies.
     */
    async loadWords() {
        try {
            const response = await fetch('Data/Words.txt');
            if (!response.ok) {
                throw new Error(`Network response was not ok: ${response.statusText}`);
            }
            const text = await response.text();
            const rawWords = text.split(/\r?\n/).map(w => w.trim().toUpperCase()).filter(Boolean);

            if (!rawWords.every(word => /^[A-Z]+$/.test(word))) {
                throw new Error("File contains invalid words. Ensure all entries are purely alphabetic.");
            }

            this.words = rawWords;
            this.cacheWordsByLength();
            this.calculateLetterFrequencies();
            this.debugLog(`Words loaded: ${this.words.length}`);
            this.updateStatus(`Words loaded successfully: ${this.words.length}`);

        } catch (error) {
            // Fallback word list if something goes wrong
            this.words = ["LASER", "SAILS", "SHEET", "STEER", "HEEL", "HIKE", "KEEL", "KNOT"];
            alert("Warning: Words.txt not found or invalid. Using fallback word list.");
            this.debugLog("Words.txt not found or invalid. Using fallback word list.");
            this.updateStatus("Warning: Words.txt not found or invalid. Using fallback word list.", true);
            this.cacheWordsByLength();
            this.calculateLetterFrequencies();
        }
    }

    /**
     * Caches words by their lengths for faster domain lookups.
     */
    cacheWordsByLength() {
        this.wordLengthCache = {};
        for (const word of this.words) {
            const len = word.length;
            if (!this.wordLengthCache[len]) {
                this.wordLengthCache[len] = [];
            }
            this.wordLengthCache[len].push(word);
        }
        this.debugLog("Word length cache created.");
    }

    /**
     * Calculates frequency of each letter across the entire word list,
     * helping with heuristics (like least-constraining-value ordering).
     */
    calculateLetterFrequencies() {
        this.letterFrequencies = {};
        for (const word of this.words) {
            for (const char of word) {
                if (!this.letterFrequencies[char]) {
                    this.letterFrequencies[char] = 0;
                }
                this.letterFrequencies[char]++;
            }
        }
    }

    // ----------------------------------------------------------------
    //                       Grid Management
    // ----------------------------------------------------------------

    /**
     * Generates a fresh grid of specified rows and columns, filling it with '#' (black cells).
     * @param {number} rows - Number of rows in the grid
     * @param {number} cols - Number of columns in the grid
     */
    generateGrid(rows = 10, cols = 10) {
        try {
            // Clear any existing puzzle data
            this.grid = Array.from({ length: rows }, () => Array(cols).fill("#"));
            this.resetDataStructures();

            // Render the new grid
            this.renderGrid();
            this.updateStatus(`Grid generated with rows: ${rows}, columns: ${cols}`, true);

        } catch (error) {
            this.handleError("Error generating grid:", error);
        }
    }

    /**
     * Clears or resets puzzle-related data structures.
     */
    resetDataStructures() {
        this.solution = {};
        this.slots = {};
        this.constraints = {};
        this.domains = {};
        this.cellContents = {};
        this.cells = {};
    }

    /**
     * Creates an HTML table representing the crossword grid and attaches click listeners.
     */
    renderGrid() {
        try {
            const gridContainer = document.getElementById('grid-container');
            if (!gridContainer) {
                throw new Error("Grid container not found in DOM.");
            }
            gridContainer.innerHTML = ''; // Clear existing grid

            const table = document.createElement('table');
            table.style.borderCollapse = 'collapse';

            for (let r = 0; r < this.grid.length; r++) {
                const tr = document.createElement('tr');
                for (let c = 0; c < this.grid[0].length; c++) {
                    const td = document.createElement('td');
                    td.style.border = '1px solid #ccc';
                    td.style.width = '30px';
                    td.style.height = '30px';
                    td.style.textAlign = 'center';
                    td.style.verticalAlign = 'middle';
                    td.style.fontSize = '16px';
                    td.style.fontWeight = 'bold';
                    td.style.cursor = 'pointer';
                    td.dataset.row = r;
                    td.dataset.col = c;

                    if (this.grid[r][c] === "#") {
                        td.style.backgroundColor = '#000';
                        td.style.color = '#000';
                    } else {
                        td.style.backgroundColor = '#fff';
                        td.style.color = '#444';
                    }

                    td.addEventListener('click', this.cellClicked);
                    this.cells[`${r},${c}`] = td;
                    tr.appendChild(td);
                }
                table.appendChild(tr);
            }

            gridContainer.appendChild(table);

        } catch (error) {
            this.handleError("Error rendering grid:", error);
        }
    }

    /**
     * Loads one of the predefined puzzles (Easy, Medium, Hard).
     * @param {string} puzzleName - Name of the puzzle to load
     */
    loadPredefinedPuzzle(puzzleName) {
        try {
            const puzzle = this.predefinedPuzzles.find(p => p.name === puzzleName);
            if (!puzzle) {
                throw new Error(`Puzzle "${puzzleName}" not found.`);
            }
            // Validate puzzle grid
            if (!Array.isArray(puzzle.grid) || puzzle.grid.length === 0 || !Array.isArray(puzzle.grid[0])) {
                throw new Error(`Invalid grid format for puzzle "${puzzleName}".`);
            }

            const rows = puzzle.grid.length;
            const cols = puzzle.grid[0].length;

            // Clear any existing puzzle data
            this.grid = [];
            this.resetDataStructures();

            // Deep copy puzzle grid
            this.grid = puzzle.grid.map(row => [...row]);

            this.renderGrid();
            // Populate pre-filled letters / numbers in cellContents
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const cellValue = this.grid[r][c];
                    const key = `${r},${c}`;
                    if (/[A-Z]/.test(cellValue)) {
                        this.cellContents[key] = cellValue;
                    } else if (cellValue !== "#" && cellValue.trim() !== "") {
                        this.cellContents[key] = null; // Numbered cells with no letters
                    }
                }
            }
            this.updateStatus(`Loaded predefined puzzle: ${puzzleName}`, true);

        } catch (error) {
            this.handleError(`Error loading puzzle "${puzzleName}":`, error);
        }
    }

    /**
     * Handles clicks on grid cells, toggling their state based on the current mode.
     */
    cellClicked(event) {
        try {
            const cell = event.target;
            const row = parseInt(cell.dataset.row, 10);
            const col = parseInt(cell.dataset.col, 10);

            // Mode-based behaviors
            if (this.isNumberEntryMode) {
                // Toggle numbers
                if (/\d/.test(this.grid[row][col])) {
                    this.removeNumberFromCell(row, col);
                } else {
                    this.addNumberToCell(row, col);
                }
                return;
            }

            if (this.isLetterEntryMode) {
                // Letter input
                const letter = prompt("Enter a single letter (A-Z):");
                if (letter && /^[A-Za-z]$/.test(letter)) {
                    const upperLetter = letter.toUpperCase();
                    this.updateCell(row, col, upperLetter, '#000', '#fff');
                    this.grid[row][col] = upperLetter;
                } else if (letter !== null) {
                    alert("Please enter a single letter (A-Z).");
                }
                return;
            }

            if (this.isDragMode) {
                // Drag mode is active, so single-click does nothing
                return;
            }

            // Default Mode: Indefinite toggling from white <--> black
            if (this.grid[row][col] !== "#") {
                // Toggle to black
                this.updateCell(row, col, '', '#000', '#000');
                this.grid[row][col] = "#";
                this.updateNumbersAfterRemoval(row, col);
            } else {
                // Toggle back to white
                this.updateCell(row, col, '', '#444', '#fff');
                this.grid[row][col] = " ";
            }
        } catch (error) {
            this.handleError("Error handling cell click:", error);
        }
    }

    // ----------------------------------------------------------------
    //                         Mode Toggles
    // ----------------------------------------------------------------

    /**
     * Activates or deactivates Number Entry mode.
     */
    startNumberEntryMode() {
        try {
            const modeLabel = document.getElementById('mode-label');
            const button = document.getElementById('number-entry-button');
            if (!modeLabel || !button) throw new Error("Number Entry mode elements not found in DOM.");

            if (this.isNumberEntryMode) {
                // Deactivate
                this.isNumberEntryMode = false;
                modeLabel.textContent = "Mode: Default";
                this.updateStatus("Number Entry Mode Deactivated.");
                button.textContent = "Number Entry Mode";
                button.style.backgroundColor = "#0069d9";
            } else {
                // Activate
                if (this.isLetterEntryMode) this.startLetterEntryMode(); // Toggle off letter
                if (this.isDragMode) this.startDragMode();               // Toggle off drag

                this.isNumberEntryMode = true;
                modeLabel.textContent = "Mode: Number Entry";
                this.updateStatus("Number Entry Mode Activated.");
                button.textContent = "Exit Number Entry Mode";
                button.style.backgroundColor = "#dc3545";
            }
        } catch (error) {
            this.handleError("Error toggling Number Entry Mode:", error);
        }
    }

    /**
     * Activates or deactivates Letter Entry mode.
     */
    startLetterEntryMode() {
        try {
            const modeLabel = document.getElementById('mode-label');
            const button = document.getElementById('letter-entry-button');
            if (!modeLabel || !button) throw new Error("Letter Entry mode elements not found in DOM.");

            if (this.isLetterEntryMode) {
                // Deactivate
                this.isLetterEntryMode = false;
                modeLabel.textContent = "Mode: Default";
                this.updateStatus("Letter Entry Mode Deactivated.");
                button.textContent = "Letter Entry Mode";
                button.style.backgroundColor = "#0069d9";
            } else {
                // Activate
                if (this.isNumberEntryMode) this.startNumberEntryMode(); // Toggle off number
                if (this.isDragMode) this.startDragMode();               // Toggle off drag

                this.isLetterEntryMode = true;
                modeLabel.textContent = "Mode: Letter Entry";
                this.updateStatus("Letter Entry Mode Activated.");
                button.textContent = "Exit Letter Entry Mode";
                button.style.backgroundColor = "#dc3545";
            }
        } catch (error) {
            this.handleError("Error toggling Letter Entry Mode:", error);
        }
    }

    /**
     * Activates or deactivates Drag mode, allowing users to drag across cells to toggle them.
     */
    startDragMode() {
        try {
            const modeLabel = document.getElementById('mode-label');
            const button = document.getElementById('drag-mode-button');
            if (!modeLabel || !button) throw new Error("Drag Mode elements not found in DOM.");

            if (this.isDragMode) {
                // Deactivate drag mode
                this.isDragMode = false;
                modeLabel.textContent = "Mode: Default";
                this.updateStatus("Drag Mode Deactivated.");
                button.textContent = "Drag Mode";
                button.style.backgroundColor = "#0069d9";

                // Remove drag event listeners
                for (const key in this.cells) {
                    const cell = this.cells[key];
                    cell.removeEventListener('mousedown', this.startDragBound);
                    cell.removeEventListener('mousemove', this.onDragBound);
                    cell.removeEventListener('mouseup', this.stopDragBound);
                }

            } else {
                // Activate drag mode
                if (this.isNumberEntryMode) this.startNumberEntryMode(); // Toggle off number
                if (this.isLetterEntryMode) this.startLetterEntryMode(); // Toggle off letter

                this.isDragMode = true;
                modeLabel.textContent = "Mode: Drag";
                this.updateStatus("Drag Mode Activated.");
                button.textContent = "Exit Drag Mode";
                button.style.backgroundColor = "#dc3545";

                // Bind drag methods once
                this.startDragBound = this.startDrag.bind(this);
                this.onDragBound = this.onDrag.bind(this);
                this.stopDragBound = this.stopDrag.bind(this);

                // Add drag event listeners
                for (const key in this.cells) {
                    const cell = this.cells[key];
                    cell.addEventListener('mousedown', this.startDragBound);
                    cell.addEventListener('mousemove', this.onDragBound);
                    cell.addEventListener('mouseup', this.stopDragBound);
                }
            }
        } catch (error) {
            this.handleError("Error toggling Drag Mode:", error);
        }
    }

    // ----------------------------------------------------------------
    //                        Number Management
    // ----------------------------------------------------------------

    /**
     * Adds the next available number to a clicked cell.
     * @param {number} row - The row index of the cell
     * @param {number} col - The column index of the cell
     */
    addNumberToCell(row, col) {
        try {
            const numberPositions = this.getNumberPositions();
            const newNumber = this.getNewNumber(row, col, numberPositions);
            this.updateNumbersAfterInsertion(row, col, newNumber);
            this.updateCell(row, col, newNumber.toString(), '#000', '#fff');
            this.grid[row][col] = newNumber.toString();
        } catch (error) {
            this.handleError(`Error adding number to cell (${row}, ${col}):`, error);
        }
    }

    /**
     * Returns an array of all numbered cell positions in ascending order of their assigned numbers.
     */
    getNumberPositions() {
        const numberPositions = [];
        for (let r = 0; r < this.grid.length; r++) {
            for (let c = 0; c < this.grid[0].length; c++) {
                if (/\d/.test(this.grid[r][c])) {
                    numberPositions.push({ number: parseInt(this.grid[r][c], 10), row: r, col: c });
                }
            }
        }
        numberPositions.sort((a, b) => a.number - b.number);
        return numberPositions;
    }

    /**
     * Computes the new cell number by determining where the clicked cell fits among existing numbered cells.
     */
    getNewNumber(row, col, numberPositions) {
        let position = 0;
        for (let i = 0; i < numberPositions.length; i++) {
            const pos = numberPositions[i];
            if (row < pos.row || (row === pos.row && col < pos.col)) {
                break;
            }
            position = i + 1;
        }
        return position + 1;
    }

    /**
     * Updates the grid when a new number is inserted, incrementing subsequent numbers as needed.
     */
    updateNumbersAfterInsertion(row, col, newNumber) {
        for (let r = 0; r < this.grid.length; r++) {
            for (let c = 0; c < this.grid[0].length; c++) {
                const cellValue = this.grid[r][c];
                if (/\d/.test(cellValue)) {
                    const current = parseInt(cellValue, 10);
                    if (current >= newNumber && (r !== row || c !== col)) {
                        const updated = current + 1;
                        this.grid[r][c] = updated.toString();
                        this.updateCell(r, c, updated.toString());
                    }
                }
            }
        }
    }

    /**
     * Removes the number from a cell and decrements subsequent cell numbers accordingly.
     */
    removeNumberFromCell(row, col) {
        try {
            const removed = parseInt(this.grid[row][col], 10);
            this.grid[row][col] = " ";
            this.updateCell(row, col, "", '#444', '#fff');

            for (let r = 0; r < this.grid.length; r++) {
                for (let c = 0; c < this.grid[0].length; c++) {
                    const cellValue = this.grid[r][c];
                    if (/\d/.test(cellValue)) {
                        const current = parseInt(cellValue, 10);
                        if (current > removed) {
                            const updated = current - 1;
                            this.grid[r][c] = updated.toString();
                            this.updateCell(r, c, updated.toString());
                        }
                    }
                }
            }
        } catch (error) {
            this.handleError(`Error removing number from cell (${row}, ${col}):`, error);
        }
    }

    /**
     * Checks if a cell is a numbered cell. If it is, removes that number.
     */
    updateNumbersAfterRemoval(row, col) {
        if (/\d/.test(this.grid[row][col])) {
            this.removeNumberFromCell(row, col);
        }
    }

    // ----------------------------------------------------------------
    //                          Drag Logic
    // ----------------------------------------------------------------

    /**
     * Handles the mouse-down event in drag mode.
     */
    startDrag(event) {
        if (!this.isDragMode) return;
        this.isDragging = true;

        const cell = event.target;
        const row = parseInt(cell.dataset.row, 10);
        const col = parseInt(cell.dataset.col, 10);

        // If cell is not black, we'll be toggling to black, else toggling to white
        this.toggleToBlack = this.grid[row][col] !== "#";
        this.toggleCell(row, col);
    }

    /**
     * Handles the mouse-move event in drag mode, toggling cells as the mouse moves.
     */
    onDrag(event) {
        if (!this.isDragging || !this.isDragMode) return;
        const cell = document.elementFromPoint(event.clientX, event.clientY);
        if (cell && cell.dataset && cell.dataset.row && cell.dataset.col) {
            const row = parseInt(cell.dataset.row, 10);
            const col = parseInt(cell.dataset.col, 10);
            this.toggleCell(row, col);
        }
    }

    /**
     * Handles the mouse-up event in drag mode, stopping the drag operation.
     */
    stopDrag() {
        this.isDragging = false;
    }

    /**
     * Toggles a cell to black or white based on the current drag operation.
     */
    toggleCell(row, col) {
        const cell = this.cells[`${row},${col}`];
        if (!cell) return;

        if (this.toggleToBlack && this.grid[row][col] !== "#") {
            // Toggle to black
            this.updateCell(row, col, "", '#000', '#000');
            this.grid[row][col] = "#";
            this.updateNumbersAfterRemoval(row, col);
        } else if (!this.toggleToBlack && this.grid[row][col] === "#") {
            // Toggle to white
            this.updateCell(row, col, "", '#444', '#fff');
            this.grid[row][col] = " ";
        }
    }

    // ----------------------------------------------------------------
    //                       Solving Methods
    // ----------------------------------------------------------------

    /**
     * Initiates the solving process, preventing multiple solves in parallel.
     */
    solveCrossword() {
        if (this.isSolving) {
            alert("A puzzle is already being solved. Please wait.");
            return;
        }
        this.isSolving = true;

        const solveButton = document.getElementById('solve-crossword-button');
        if (solveButton) solveButton.disabled = true;

        this.updateStatus("Setting up constraints...", true);

        // Solve in async to avoid blocking the UI
        this.solveCrosswordThread()
            .finally(() => {
                if (solveButton) solveButton.disabled = false;
                this.isSolving = false;
            });
    }

    /**
     * Main solving thread using AC-3 followed by backtracking.
     */
    async solveCrosswordThread() {
        const startTime = performance.now();
        try {
            if (!this.validateGrid()) return; // Grid is invalid

            this.generateSlots();
            if (Object.keys(this.slots).length === 0) {
                alert("No numbered slots found to solve.");
                this.updateStatus("Error: No numbered slots found to solve.");
                return;
            }

            this.randomizeDomains();
            this.updateStatus("Running AC-3 algorithm...");

            const ac3Success = this.ac3();
            const hasEmptyDomain = Object.values(this.domains).some(d => d.length === 0);

            if (!ac3Success || hasEmptyDomain) {
                this.updateStatus("AC-3 failed or domains wiped out. Attempting backtracking...");
            } else {
                this.updateStatus("Starting backtracking search...");
            }

            this.displayDomainSizes();

            // Backtracking
            this.recursiveCalls = 0;
            const backStart = performance.now();
            const result = this.backtrackingSolve();
            const backEnd = performance.now();

            const totalTime = (performance.now() - startTime) / 1000;

            if (result) {
                this.performanceData['Backtracking'] = {
                    time: (backEnd - backStart) / 1000,
                    calls: this.recursiveCalls
                };
                this.updateStatus("Solution found with backtracking.");
                this.displaySolution();
                this.displayWordList();
                this.updateStatus(`Total solving time: ${totalTime.toFixed(2)} seconds`);
                this.logPerformanceMetrics();
            } else {
                this.updateStatus("No possible solution found.");
                alert("No possible solution found for the current puzzle.");
            }
        } catch (error) {
            this.handleError(`Error during solveCrosswordThread:`, error);
        }
    }

    /**
     * Checks if the grid is valid (non-empty, rectangular) and has potential slots.
     */
    validateGrid() {
        if (this.grid.length === 0) {
            alert("The grid is empty. Please generate or load a grid.");
            this.updateStatus("Error: The grid is empty.");
            return false;
        }

        const cols = this.grid[0].length;
        for (let r = 1; r < this.grid.length; r++) {
            if (this.grid[r].length !== cols) {
                alert("The grid is not rectangular. Please ensure all rows have the same number of columns.");
                this.updateStatus("Error: The grid is not rectangular.");
                return false;
            }
        }

        return true;
    }

    /**
     * Generates slot information (across/down) and sets up constraints/domains.
     */
    generateSlots() {
        this.slots = {};
        this.domains = {};
        this.cellContents = {};

        const rows = this.grid.length;
        const cols = this.grid[0].length;

        // Fill cellContents from letters/numbers
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const val = this.grid[r][c];
                const key = `${r},${c}`;

                if (/[A-Z]/.test(val)) {
                    this.cellContents[key] = val;
                } else if (val !== "#" && val.trim() !== "") {
                    this.cellContents[key] = null;
                }
            }
        }

        // Identify all slots
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (/\d/.test(this.grid[r][c])) {
                    // Check across slot
                    if (c === 0 || this.grid[r][c - 1] === "#") {
                        const positions = this.getSlotPositions(r, c, "across");
                        if (positions.length >= 2) {
                            const slotName = `${this.grid[r][c]}ACROSS`;
                            this.slots[slotName] = positions;
                        }
                    }
                    // Check down slot
                    if (r === 0 || this.grid[r - 1][c] === "#") {
                        const positions = this.getSlotPositions(r, c, "down");
                        if (positions.length >= 2) {
                            const slotName = `${this.grid[r][c]}DOWN`;
                            this.slots[slotName] = positions;
                        }
                    }
                }
            }
        }

        this.generateConstraints();
        this.setupDomains();
    }

    /**
     * Returns slot positions for an across or down sequence starting at a specific cell.
     */
    getSlotPositions(r, c, direction) {
        const positions = [];
        while (
            r < this.grid.length &&
            c < this.grid[0].length &&
            this.grid[r][c] !== "#"
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

    /**
     * Builds a constraints map of overlapping slots.
     */
    generateConstraints() {
        this.constraints = {};
        const positionMap = {};

        // Collect all slot positions
        for (const slot in this.slots) {
            const positions = this.slots[slot];
            positions.forEach((pos, idx) => {
                const key = `${pos[0]},${pos[1]}`;
                if (!positionMap[key]) {
                    positionMap[key] = [];
                }
                positionMap[key].push({ slot, idx });
            });
        }

        // If two slots share a position, they overlap
        for (const key in positionMap) {
            const overlaps = positionMap[key];
            if (overlaps.length > 1) {
                for (let i = 0; i < overlaps.length; i++) {
                    for (let j = i + 1; j < overlaps.length; j++) {
                        const slotA = overlaps[i].slot;
                        const idxA = overlaps[i].idx;
                        const slotB = overlaps[j].slot;
                        const idxB = overlaps[j].idx;

                        if (!this.constraints[slotA]) this.constraints[slotA] = {};
                        if (!this.constraints[slotA][slotB]) this.constraints[slotA][slotB] = [];
                        this.constraints[slotA][slotB].push([idxA, idxB]);

                        if (!this.constraints[slotB]) this.constraints[slotB] = {};
                        if (!this.constraints[slotB][slotA]) this.constraints[slotB][slotA] = [];
                        this.constraints[slotB][slotA].push([idxB, idxA]);
                    }
                }
            }
        }
    }

    /**
     * Initializes domains for each slot based on word length and any prefilled letters.
     */
    setupDomains() {
        for (const slot in this.slots) {
            const positions = this.slots[slot];
            const length = positions.length;

            // Build a regex pattern matching pre-filled letters
            const pattern = positions.map(([r, c]) => {
                const key = `${r},${c}`;
                return this.cellContents[key] || '.';
            }).join('');

            const regex = new RegExp(`^${pattern}$`);
            const possibleWords = this.wordLengthCache[length] || [];
            const filtered = possibleWords.filter(word => regex.test(word));

            this.domains[slot] = filtered;
        }
    }

    /**
     * AC-3 (Arc Consistency) algorithm to prune incompatible domains before backtracking.
     */
    ac3() {
        const queue = new Set();
        // Initialize queue with all constraint pairs
        for (const slotA in this.constraints) {
            for (const slotB in this.constraints[slotA]) {
                queue.add(`${slotA},${slotB}`);
            }
        }

        while (queue.size > 0) {
            const [var1, var2] = Array.from(queue).shift().split(',');
            queue.delete(`${var1},${var2}`);

            if (this.revise(var1, var2)) {
                if (this.domains[var1].length === 0) {
                    return false; // Domain wiped out, no solution
                }
                for (const neighbor in this.constraints[var1]) {
                    if (neighbor !== var2) {
                        queue.add(`${neighbor},${var1}`);
                    }
                }
            }
        }
        return true;
    }

    /**
     * Revises the domain of var1 if it has values incompatible with var2's domain.
     */
    revise(var1, var2) {
        let revised = false;
        const overlaps = this.constraints[var1][var2];
        const newDomain = this.domains[var1].filter(word1 => {
            return overlaps.some(([idx1, idx2]) => {
                return this.domains[var2].some(word2 => word1[idx1] === word2[idx2]);
            });
        });

        if (newDomain.length < this.domains[var1].length) {
            this.domains[var1] = newDomain;
            revised = true;
        }
        return revised;
    }

    /**
     * Backtracking search with MRV, Degree Heuristic, and forward checking.
     */
    backtrackingSolve(assignment = {}, cache = {}) {
        // All slots assigned
        if (Object.keys(assignment).length === Object.keys(this.slots).length) {
            this.solution = { ...assignment };
            return true;
        }

        this.recursiveCalls++;
        const assignmentKey = JSON.stringify(Object.entries(assignment).sort());
        if (cache[assignmentKey] !== undefined) {
            return cache[assignmentKey];
        }

        // Select slot with MRV / Degree
        const varToAssign = this.selectUnassignedVariable(assignment);
        if (!varToAssign) {
            cache[assignmentKey] = false;
            return false;
        }

        const orderedValues = this.orderDomainValues(varToAssign);

        // Try each candidate value
        for (const value of orderedValues) {
            if (this.isConsistent(varToAssign, value, assignment)) {
                assignment[varToAssign] = value;
                const inferences = this.forwardCheck(varToAssign, value, assignment);
                if (inferences !== false) {
                    if (this.backtrackingSolve(assignment, cache)) {
                        cache[assignmentKey] = true;
                        return true;
                    }
                }
                delete assignment[varToAssign];
                this.restoreDomains(inferences);
            }
        }

        cache[assignmentKey] = false;
        return false;
    }

    /**
     * Chooses an unassigned slot using Minimum Remaining Values (MRV) and Degree Heuristic.
     */
    selectUnassignedVariable(assignment) {
        const unassigned = Object.keys(this.domains).filter(s => !(s in assignment));
        if (unassigned.length === 0) return null;

        // MRV
        let minSize = Infinity;
        let candidates = [];
        for (const slot of unassigned) {
            const size = this.domains[slot].length;
            if (size < minSize) {
                minSize = size;
                candidates = [slot];
            } else if (size === minSize) {
                candidates.push(slot);
            }
        }

        // Degree Heuristic
        let maxDegree = -1;
        let finalCandidates = [];
        for (const slot of candidates) {
            const deg = this.constraints[slot] ? Object.keys(this.constraints[slot]).length : 0;
            if (deg > maxDegree) {
                maxDegree = deg;
                finalCandidates = [slot];
            } else if (deg === maxDegree) {
                finalCandidates.push(slot);
            }
        }

        // Random tie-break
        return finalCandidates[Math.floor(Math.random() * finalCandidates.length)];
    }

    /**
     * Orders the domain values using a least-constraining heuristic based on letter frequencies.
     */
    orderDomainValues(slot) {
        const domain = [...this.domains[slot]];
        const getFrequencyScore = (word) =>
            word.split('').reduce((acc, ch) => acc + (this.letterFrequencies[ch] || 0), 0);

        domain.sort((a, b) => getFrequencyScore(a) - getFrequencyScore(b));

        // Optional random shuffle for tie-breaks
        for (let i = domain.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [domain[i], domain[j]] = [domain[j], domain[i]];
        }
        return domain;
    }

    /**
     * Checks if a candidate word is consistent with the pre-filled letters and with the assigned neighbors.
     */
    isConsistent(slot, word, assignment) {
        if (!this.wordMatchesPreFilledLetters(slot, word)) {
            return false;
        }
        const neighbors = this.constraints[slot] || {};
        for (const neighbor in neighbors) {
            if (neighbor in assignment) {
                if (!this.wordsMatch(slot, word, neighbor, assignment[neighbor])) {
                    return false;
                }
            } else {
                // Check if at least one neighbor domain word is consistent
                const viable = this.domains[neighbor].filter(
                    w => this.wordsMatch(slot, word, neighbor, w)
                );
                if (viable.length === 0) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Applies forward checking to prune neighbor domains based on the chosen word.
     */
    forwardCheck(slot, value, assignment) {
        const inferences = {};
        const neighbors = this.constraints[slot] || {};

        for (const neighbor in neighbors) {
            if (!(neighbor in assignment)) {
                const newDomain = this.domains[neighbor].filter(
                    w => this.wordsMatch(slot, value, neighbor, w)
                );
                if (newDomain.length === 0) {
                    return false;
                }
                inferences[neighbor] = this.domains[neighbor];
                this.domains[neighbor] = newDomain;
            }
        }
        return inferences;
    }

    /**
     * Restores any pruned domains after a failed assignment.
     */
    restoreDomains(inferences) {
        if (!inferences) return;
        for (const v in inferences) {
            this.domains[v] = inferences[v];
        }
    }

    /**
     * Checks whether a candidate word matches pre-filled letters for a given slot.
     */
    wordMatchesPreFilledLetters(slot, word) {
        const positions = this.slots[slot];
        for (let i = 0; i < positions.length; i++) {
            const [r, c] = positions[i];
            const key = `${r},${c}`;
            const preFilled = this.cellContents[key];
            if (preFilled && preFilled !== word[i]) {
                return false;
            }
        }
        return true;
    }

    /**
     * Checks overlap consistency between two words in overlapping slots.
     */
    wordsMatch(var1, word1, var2, word2) {
        const overlaps = this.constraints[var1][var2];
        for (const [idx1, idx2] of overlaps) {
            if (word1[idx1] !== word2[idx2]) {
                return false;
            }
        }
        return true;
    }

    /**
     * Randomly shuffles the domains for an initial "random" approach to solving.
     */
    randomizeDomains() {
        for (const slot in this.domains) {
            this.domains[slot] = this.shuffleArray(this.domains[slot]);
        }
        this.debugLog("Domains randomized.");
    }

    /**
     * Fisher-Yates shuffle for randomizing arrays.
     */
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    // ----------------------------------------------------------------
    //                      Display & Status
    // ----------------------------------------------------------------

    /**
     * Updates the content, foreground, and background of a particular cell.
     */
    updateCell(row, col, value = null, fg = null, bg = null) {
        const cell = this.cells[`${row},${col}`];
        if (cell) {
            if (value !== null) cell.textContent = value;
            if (fg !== null) cell.style.color = fg;
            if (bg !== null) cell.style.backgroundColor = bg;
        }
    }

    /**
     * Displays a message to the status display area. If isError is true, text is styled in red.
     */
    updateStatus(message, isError = false) {
        const statusDisplay = document.getElementById('status-display');
        if (!statusDisplay) return;

        if (isError) {
            statusDisplay.style.color = 'red';
        } else {
            statusDisplay.style.color = '#222';
        }
        statusDisplay.value += `${message}\n`;
        statusDisplay.scrollTop = statusDisplay.scrollHeight;

        this.debugLog(message);
    }

    /**
     * Logs debug messages to the console when DEBUG mode is on.
     */
    debugLog(message, ...args) {
        if (this.DEBUG) {
            console.log(`[DEBUG] ${message}`, ...args);
        }
    }

    /**
     * Handles errors, logging to console and updating the status display.
     */
    handleError(userMessage, error) {
        console.error(`${userMessage}`, error);
        this.updateStatus(`${userMessage} ${error.message}`, true);
        alert(`${userMessage} Please check the console for more details.`);
    }

    // ----------------------------------------------------------------
    //                    Displaying the Solution
    // ----------------------------------------------------------------

    /**
     * Renders the solved crossword on the grid with a highlight.
     */
    displaySolution() {
        try {
            for (const slot in this.solution) {
                const word = this.solution[slot];
                const positions = this.slots[slot];
                for (let i = 0; i < positions.length; i++) {
                    const [r, c] = positions[i];
                    this.updateCell(r, c, word[i], '#155724', '#d1e7dd');
                }
            }
            this.updateStatus("Solution displayed on the grid.");
            this.debugLog("Solution displayed on the grid.");
        } catch (error) {
            this.handleError("Error displaying solution:", error);
        }
    }

    /**
     * Displays the across and down words in their respective text areas.
     */
    displayWordList() {
        try {
            const acrossWords = [];
            const downWords = [];
            const sortedSlots = Object.keys(this.slots).sort((a, b) => {
                const numA = parseInt(a.match(/\d+/)[0], 10);
                const numB = parseInt(b.match(/\d+/)[0], 10);
                return numA - numB;
            });

            for (const slot of sortedSlots) {
                const word = this.solution[slot];
                if (word) {
                    const slotNum = slot.match(/\d+/)[0];
                    const entry = `${slotNum}: ${word}`;
                    if (slot.endsWith("ACROSS")) {
                        acrossWords.push(entry);
                    } else if (slot.endsWith("DOWN")) {
                        downWords.push(entry);
                    }
                }
            }

            const acrossDisplay = document.getElementById('across-display');
            const downDisplay = document.getElementById('down-display');

            if (!acrossDisplay || !downDisplay) {
                throw new Error("Word list display elements not found in DOM.");
            }

            acrossDisplay.value = acrossWords.join('\n');
            downDisplay.value = downWords.join('\n');

        } catch (error) {
            this.handleError("Error displaying word lists:", error);
        }
    }

    /**
     * Logs performance metrics like time taken and number of recursive calls.
     */
    logPerformanceMetrics() {
        try {
            for (const method in this.performanceData) {
                const data = this.performanceData[method];
                const msg = `${method} - Time: ${data.time.toFixed(4)}s, Recursive Calls: ${data.calls}`;
                this.updateStatus(msg);
                this.debugLog(msg);
            }
        } catch (error) {
            this.handleError("Error logging performance metrics:", error);
        }
    }

    /**
     * Shows the size of each domain after AC-3 and before backtracking.
     */
    displayDomainSizes() {
        try {
            this.updateStatus("Domain Sizes After Setup:");
            const sortedSlots = Object.keys(this.domains).sort((a, b) => {
                const numA = parseInt(a.match(/\d+/)[0], 10);
                const numB = parseInt(b.match(/\d+/)[0], 10);
                return numA - numB;
            });
            for (const slot of sortedSlots) {
                const size = this.domains[slot].length;
                this.updateStatus(`Domain for ${slot} has ${size} option(s).`);
            }
        } catch (error) {
            this.handleError("Error displaying domain sizes:", error);
        }
    }

    // ----------------------------------------------------------------
    //                     Word Lookup Handlers
    // ----------------------------------------------------------------

    /**
     * Handler for dynamic search input. Filters the loaded words and displays up to 10 matches.
     */
    handleSearchInput(event) {
        const query = event.target.value.trim().toUpperCase();
        const dropdown = document.getElementById('search-dropdown');
        const matchesCount = document.getElementById('matches-count');
        if (!dropdown || !matchesCount) return;

        if (query === "") {
            dropdown.style.display = 'none';
            matchesCount.textContent = "";
            return;
        }

        // Filter words matching the query
        const matches = this.words.filter(word => word.startsWith(query)).sort();

        // Update matches count
        matchesCount.textContent = matches.length > 0
            ? `Found ${matches.length} match(es).`
            : "No matches found.";

        if (matches.length === 0) {
            dropdown.style.display = 'none';
            return;
        }

        // Take first 10 matches
        const topMatches = matches.slice(0, 10);

        // Populate dropdown
        this.displaySearchResults(topMatches);
        dropdown.style.display = 'block';
    }

    /**
     * Renders the top matches in the dropdown. Each item is clickable.
     */
    displaySearchResults(matches) {
        const dropdown = document.getElementById('search-dropdown');
        const matchesCount = document.getElementById('matches-count');
        if (!dropdown) return;

        dropdown.innerHTML = '';

        matches.forEach(word => {
            const item = document.createElement('div');
            item.textContent = word;
            item.style.padding = '8px';
            item.style.cursor = 'pointer';
            item.style.borderBottom = '1px solid #eee';

            item.addEventListener('mouseover', () => item.style.backgroundColor = '#f1f1f1');
            item.addEventListener('mouseout',  () => item.style.backgroundColor = '#fff');
            item.addEventListener('click', () => {
                const searchInput = document.getElementById('word-search-input');
                if (searchInput) {
                    searchInput.value = word;
                }
                dropdown.style.display = 'none';
                if (matchesCount) {
                    matchesCount.textContent = "Found 1 match.";
                }
            });

            dropdown.appendChild(item);
        });
    }
}
