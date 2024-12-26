// script.js

// Ensure the script runs after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const crosswordSolver = new CrosswordSolver();
    crosswordSolver.init();
});

class CrosswordSolver {
    constructor() {
        // Configuration and Flags
        this.DEBUG = false; // Toggle debug messages
        this.wordLengthCache = {}; // Cache for words by length
        this.isNumberEntryMode = false; // Number entry mode flag
        this.isLetterEntryMode = false; // Letter entry mode flag
        this.isDragMode = false; // Drag mode flag
        this.isSolving = false; // Prevent concurrent solving
        this.recursiveCalls = 0; // Count recursive calls
        this.performanceData = {}; // Store performance metrics

        // Data Structures
        this.grid = []; // The crossword grid
        this.words = []; // Word list
        this.slots = {}; // Slots with positions
        this.constraints = {}; // Constraints between slots
        this.solution = {}; // Final solution mapping slots to words
        this.domains = {}; // Possible words for each slot
        this.cellContents = {}; // Pre-filled letters in the grid
        this.cells = {}; // GUI cell mapping

        // Predefined Puzzles
        this.predefinedPuzzles = this.initializePuzzles();

        // Drag Mode Variables
        this.isDragging = false;
        this.toggleToBlack = true;
        this.startDragBound = null;
        this.onDragBound = null;
        this.stopDragBound = null;

        // Bind methods
        this.loadWords = this.loadWords.bind(this);
        this.generateGrid = this.generateGrid.bind(this);
        this.loadPredefinedPuzzle = this.loadPredefinedPuzzle.bind(this);
        this.cellClicked = this.cellClicked.bind(this);
        this.startNumberEntryMode = this.startNumberEntryMode.bind(this);
        this.startLetterEntryMode = this.startLetterEntryMode.bind(this);
        this.startDragMode = this.startDragMode.bind(this);
        this.solveCrossword = this.solveCrossword.bind(this);
        this.handleSearchInput = this.handleSearchInput.bind(this);
        this.displaySearchResults = this.displaySearchResults.bind(this);
    }

    // ------------------------- Initialization Methods -------------------------

    init() {
        try {
            this.createEventListeners();
            this.loadWords().then(() => {
                this.generateGrid(10, 10); // Automatically generate a 10x10 grid on page load
                this.createWordLookupSection(); // Initialize the Word Lookup section
            });
        } catch (error) {
            this.handleError("Initialization failed.", error);
        }
    }

    initializePuzzles() {
        // Define predefined puzzles
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

    debugLog(message, ...args) {
        if (this.DEBUG) {
            console.log(message, ...args);
            // Additionally, you can append to a debug log on the page if desired
        }
    }

    handleError(userMessage, error) {
        console.error(userMessage, error);
        this.updateStatus(`${userMessage} ${error.message}`, true);
        alert(`${userMessage} Please check the console for more details.`);
    }

    // ------------------------- Event Listeners -------------------------

    createEventListeners() {
        try {
            // Generate Grid Button
            const generateGridButton = document.getElementById('generate-grid-button');
            if (generateGridButton) {
                generateGridButton.addEventListener('click', () => {
                    const rowsInput = document.getElementById('rows-input');
                    const columnsInput = document.getElementById('columns-input');
                    const rows = parseInt(rowsInput.value) || 10;
                    const cols = parseInt(columnsInput.value) || 10;
                    this.generateGrid(rows, cols);
                });
            } else {
                throw new Error("Generate Grid button not found in DOM.");
            }

            // Load Predefined Puzzle Buttons
            const loadEasyButton = document.getElementById('load-easy-button');
            const loadMediumButton = document.getElementById('load-medium-button');
            const loadHardButton = document.getElementById('load-hard-button');

            if (loadEasyButton && loadMediumButton && loadHardButton) {
                loadEasyButton.addEventListener('click', () => this.loadPredefinedPuzzle("Easy"));
                loadMediumButton.addEventListener('click', () => this.loadPredefinedPuzzle("Medium"));
                loadHardButton.addEventListener('click', () => this.loadPredefinedPuzzle("Hard"));
            } else {
                throw new Error("One or more Predefined Puzzle buttons not found in DOM.");
            }

            // Mode Buttons
            const numberEntryButton = document.getElementById('number-entry-button');
            const letterEntryButton = document.getElementById('letter-entry-button');
            const dragModeButton = document.getElementById('drag-mode-button');

            if (numberEntryButton && letterEntryButton && dragModeButton) {
                numberEntryButton.addEventListener('click', this.startNumberEntryMode);
                letterEntryButton.addEventListener('click', this.startLetterEntryMode);
                dragModeButton.addEventListener('click', this.startDragMode);
            } else {
                throw new Error("One or more Mode buttons not found in DOM.");
            }

            // Solve Crossword Button
            const solveButton = document.getElementById('solve-crossword-button');
            if (solveButton) {
                solveButton.addEventListener('click', this.solveCrossword);
                // Tooltip can be handled via CSS or additional JS
            } else {
                throw new Error("Solve Crossword button not found in DOM.");
            }
        } catch (error) {
            this.handleError("Error setting up event listeners:", error);
        }
    }

    // ------------------------- UI Methods -------------------------

    async loadWords() {
        try {
            const response = await fetch('Data/Words.txt');
            if (!response.ok) {
                throw new Error(`Network response was not ok: ${response.statusText}`);
            }
            const text = await response.text();
            this.words = text.split(/\r?\n/).map(word => word.trim().toUpperCase()).filter(word => word);
            if (!this.words.every(word => /^[A-Z]+$/.test(word))) {
                throw new Error("File contains invalid words. Ensure all entries are alphabetic.");
            }
            this.cacheWordsByLength();
            this.calculateLetterFrequencies();
            this.debugLog(`Words loaded: ${this.words.length}`);
            this.updateStatus(`Words loaded successfully: ${this.words.length}`);
        } catch (error) {
            // Fallback word list
            this.words = ["LASER", "SAILS", "SHEET", "STEER", "HEEL", "HIKE", "KEEL", "KNOT"];
            alert("Warning: Words.txt not found or invalid. Using fallback word list.");
            this.debugLog("Words.txt not found or invalid. Using fallback word list.");
            this.updateStatus("Warning: Words.txt not found or invalid. Using fallback word list.", true);
            this.cacheWordsByLength();
            this.calculateLetterFrequencies();
        }
    }

    cacheWordsByLength() {
        this.wordLengthCache = {};
        this.words.forEach(word => {
            const length = word.length;
            if (!this.wordLengthCache[length]) {
                this.wordLengthCache[length] = [];
            }
            this.wordLengthCache[length].push(word);
        });
        this.debugLog("Word length cache created.");
    }

    calculateLetterFrequencies() {
        this.letterFrequencies = {};
        this.words.forEach(word => {
            for (const char of word) {
                if (!this.letterFrequencies[char]) {
                    this.letterFrequencies[char] = 0;
                }
                this.letterFrequencies[char]++;
            }
        });
    }

    updateStatus(message, isError = false) {
        const statusDisplay = document.getElementById('status-display');
        if (statusDisplay) {
            if (isError) {
                statusDisplay.style.color = 'red';
            } else {
                statusDisplay.style.color = '#222';
            }
            statusDisplay.value += message + '\n';
            statusDisplay.scrollTop = statusDisplay.scrollHeight;
        }
        this.debugLog(message);
    }

    showTooltip(element, text) {
        // Implement tooltip functionality if desired
        // Alternatively, use CSS tooltips
    }

    updateCell(row, col, value = null, fg = null, bg = null) {
        const cell = this.cells[`${row},${col}`];
        if (cell) {
            if (value !== null) {
                cell.textContent = value;
            }
            if (fg !== null) {
                cell.style.color = fg;
            }
            if (bg !== null) {
                cell.style.backgroundColor = bg;
            }
        }
    }

    // ------------------------- Grid Management Methods -------------------------

    generateGrid(rows = 10, cols = 10) {
        try {
            // Clear any existing puzzle
            this.grid = Array.from({ length: rows }, () => Array(cols).fill("#"));
            this.solution = {};
            this.slots = {};
            this.constraints = {};
            this.domains = {};
            this.cellContents = {};
            this.cells = {}; // Reset cells mapping

            // Render the grid
            this.renderGrid();

            this.updateStatus(`Grid generated with rows: ${rows}, columns: ${cols}`, true);
            this.debugLog(`Grid generated with rows: ${rows}, columns: ${cols}`);
        } catch (error) {
            this.handleError("Error generating grid:", error);
        }
    }

    renderGrid() {
        try {
            const gridContainer = document.getElementById('grid-container');
            if (!gridContainer) {
                throw new Error("Grid container not found in DOM.");
            }

            // Clear existing grid
            gridContainer.innerHTML = '';

            // Create grid table
            const table = document.createElement('table');
            table.style.borderCollapse = 'collapse';

            for (let r = 0; r < this.grid.length; r++) {
                const tr = document.createElement('tr');
                for (let c = 0; c < this.grid[0].length; c++) {
                    const td = document.createElement('td');
                    td.style.border = '1px solid #ccc'; // Grid line color
                    td.style.width = '30px';
                    td.style.height = '30px';
                    td.style.textAlign = 'center';
                    td.style.verticalAlign = 'middle';
                    td.style.fontSize = '16px';
                    td.style.fontWeight = 'bold';
                    td.style.cursor = 'pointer';
                    td.dataset.row = r;
                    td.dataset.col = c;

                    // Initialize cell appearance
                    if (this.grid[r][c] === "#") {
                        td.style.backgroundColor = '#000000'; // Black cell
                        td.style.color = '#000000';
                    } else {
                        td.style.backgroundColor = '#ffffff'; // White cell
                        td.style.color = '#444444';
                        td.textContent = ''; // Empty cell
                    }

                    // Bind click event
                    td.addEventListener('click', this.cellClicked);

                    // Store cell reference
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

            // Clear any existing puzzle
            this.grid = [];
            this.solution = {};
            this.slots = {};
            this.constraints = {};
            this.domains = {};
            this.cellContents = {};
            this.cells = {}; // Reset cells mapping

            // Deep copy to avoid modifying the original puzzle
            this.grid = puzzle.grid.map(row => [...row]);

            // Render the grid
            this.renderGrid();

            // Populate cellContents based on pre-filled letters and numbers
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const cellValue = this.grid[r][c];
                    const key = `${r},${c}`;
                    if (cellValue.match(/[A-Z]/)) {
                        this.cellContents[key] = cellValue;
                    } else if (cellValue !== "#" && cellValue.trim() !== "") {
                        this.cellContents[key] = null; // Numbered cells without letters
                    }
                }
            }

            this.updateStatus(`Loaded predefined puzzle: ${puzzleName}`, true);
            this.debugLog(`Loaded predefined puzzle: ${puzzleName}`);
        } catch (error) {
            this.handleError(`Error loading puzzle "${puzzleName}":`, error);
        }
    }

    cellClicked(event) {
        try {
            const cell = event.target;
            const row = parseInt(cell.dataset.row);
            const col = parseInt(cell.dataset.col);

            // Validate row and column
            if (isNaN(row) || isNaN(col) || row < 0 || row >= this.grid.length || col < 0 || col >= this.grid[0].length) {
                throw new Error(`Invalid cell coordinates: row ${row}, col ${col}.`);
            }

            if (this.grid[row][col] === "#") {
                alert("This cell is blacked out and cannot be modified.");
                return;
            }

            if (this.isNumberEntryMode) {
                // Number Entry Mode: Automatically assign the next available number
                if (this.grid[row][col].match(/\d/)) {
                    // If the cell already has a number, remove it
                    this.removeNumberFromCell(row, col);
                } else {
                    this.addNumberToCell(row, col);
                }
                return;
            }

            if (this.isLetterEntryMode) {
                // Letter Entry Mode: Allow only single alphabetic characters
                const letter = prompt("Enter a single letter (A-Z):");
                if (letter && /^[A-Za-z]$/.test(letter)) {
                    const upperLetter = letter.toUpperCase();
                    this.updateCell(row, col, upperLetter, '#000000', '#ffffff'); // White background
                    this.grid[row][col] = upperLetter;
                } else if (letter !== null) {
                    alert("Please enter a single letter (A-Z).");
                }
                return;
            }

            if (this.isDragMode) {
                // Drag Mode is active, so clicking does not toggle cells
                return;
            }

            // Default Mode: Toggle between black and white
            if (this.grid[row][col] !== "#") {
                if (cell.style.backgroundColor !== 'rgb(0, 0, 0)') { // If not black
                    this.updateCell(row, col, "", '#000000', '#000000'); // Set to black
                    this.grid[row][col] = "#";
                    this.updateNumbersAfterRemoval(row, col);
                } else {
                    this.updateCell(row, col, "", '#444444', '#ffffff'); // Set to white
                    this.grid[row][col] = " ";
                }
            }
        } catch (error) {
            this.handleError("Error handling cell click:", error);
        }
    }

    startNumberEntryMode() {
        try {
            const modeLabel = document.getElementById('mode-label');
            const numberEntryButton = document.getElementById('number-entry-button');

            if (!modeLabel || !numberEntryButton) {
                throw new Error("Mode label or Number Entry button not found in DOM.");
            }

            if (this.isNumberEntryMode) {
                // Deactivate number entry mode
                this.isNumberEntryMode = false;
                modeLabel.textContent = "Mode: Default";
                this.updateStatus("Number Entry Mode Deactivated.");
                this.debugLog("Number entry mode stopped.");
                numberEntryButton.textContent = "Number Entry Mode";
                numberEntryButton.style.backgroundColor = "#0069d9";
            } else {
                // Activate number entry mode
                if (this.isLetterEntryMode) {
                    this.startLetterEntryMode(); // Toggle off letter entry mode
                }
                if (this.isDragMode) {
                    this.startDragMode(); // Toggle off drag mode
                }
                this.isNumberEntryMode = true;
                modeLabel.textContent = "Mode: Number Entry";
                this.updateStatus("Number Entry Mode Activated.");
                this.debugLog("Number entry mode started.");
                numberEntryButton.textContent = "Exit Number Entry Mode";
                numberEntryButton.style.backgroundColor = "#dc3545";
            }
        } catch (error) {
            this.handleError("Error toggling Number Entry Mode:", error);
        }
    }

    startLetterEntryMode() {
        try {
            const modeLabel = document.getElementById('mode-label');
            const letterEntryButton = document.getElementById('letter-entry-button');

            if (!modeLabel || !letterEntryButton) {
                throw new Error("Mode label or Letter Entry button not found in DOM.");
            }

            if (this.isLetterEntryMode) {
                // Deactivate letter entry mode
                this.isLetterEntryMode = false;
                modeLabel.textContent = "Mode: Default";
                this.updateStatus("Letter Entry Mode Deactivated.");
                this.debugLog("Letter entry mode stopped.");
                letterEntryButton.textContent = "Letter Entry Mode";
                letterEntryButton.style.backgroundColor = "#0069d9";
            } else {
                // Activate letter entry mode
                if (this.isNumberEntryMode) {
                    this.startNumberEntryMode(); // Toggle off number entry mode
                }
                if (this.isDragMode) {
                    this.startDragMode(); // Toggle off drag mode
                }
                this.isLetterEntryMode = true;
                modeLabel.textContent = "Mode: Letter Entry";
                this.updateStatus("Letter Entry Mode Activated.");
                this.debugLog("Letter entry mode started.");
                letterEntryButton.textContent = "Exit Letter Entry Mode";
                letterEntryButton.style.backgroundColor = "#dc3545";
            }
        } catch (error) {
            this.handleError("Error toggling Letter Entry Mode:", error);
        }
    }

    startDragMode() {
        try {
            const modeLabel = document.getElementById('mode-label');
            const dragModeButton = document.getElementById('drag-mode-button');

            if (!modeLabel || !dragModeButton) {
                throw new Error("Mode label or Drag Mode button not found in DOM.");
            }

            if (this.isDragMode) {
                // Deactivate drag mode
                this.isDragMode = false;
                modeLabel.textContent = "Mode: Default";
                this.updateStatus("Drag Mode Deactivated.");
                this.debugLog("Drag mode stopped.");
                dragModeButton.textContent = "Drag Mode";
                dragModeButton.style.backgroundColor = "#0069d9";

                // Remove drag event listeners
                for (const key in this.cells) {
                    const cell = this.cells[key];
                    cell.removeEventListener('mousedown', this.startDragBound);
                    cell.removeEventListener('mousemove', this.onDragBound);
                    cell.removeEventListener('mouseup', this.stopDragBound);
                }

            } else {
                // Activate drag mode
                if (this.isNumberEntryMode) {
                    this.startNumberEntryMode(); // Toggle off number entry mode
                }
                if (this.isLetterEntryMode) {
                    this.startLetterEntryMode(); // Toggle off letter entry mode
                }
                this.isDragMode = true;
                modeLabel.textContent = "Mode: Drag";
                this.updateStatus("Drag Mode Activated.");
                this.debugLog("Drag mode started.");
                dragModeButton.textContent = "Exit Drag Mode";
                dragModeButton.style.backgroundColor = "#dc3545";

                // Bind the drag methods once to allow removal later
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

    addNumberToCell(row, col) {
        try {
            const numberPositions = this.getNumberPositions();
            const newNumber = this.getNewNumber(row, col, numberPositions);
            this.updateNumbersAfterInsertion(row, col, newNumber);
            this.updateCell(row, col, newNumber.toString(), '#000000', '#ffffff'); // White background
            this.grid[row][col] = newNumber.toString();
        } catch (error) {
            this.handleError(`Error adding number to cell (${row}, ${col}):`, error);
        }
    }

    getNumberPositions() {
        const numberPositions = [];
        for (let r = 0; r < this.grid.length; r++) {
            for (let c = 0; c < this.grid[0].length; c++) {
                const cellValue = this.grid[r][c];
                if (cellValue.match(/\d/)) {
                    numberPositions.push({ number: parseInt(cellValue), row: r, col: c });
                }
            }
        }
        numberPositions.sort((a, b) => a.number - b.number);
        return numberPositions;
    }

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

    updateNumbersAfterInsertion(row, col, newNumber) {
        for (let r = 0; r < this.grid.length; r++) {
            for (let c = 0; c < this.grid[0].length; c++) {
                const cellValue = this.grid[r][c];
                if (cellValue.match(/\d/)) {
                    const currentNumber = parseInt(cellValue);
                    if (currentNumber >= newNumber && (r !== row || c !== col)) {
                        const updatedNumber = currentNumber + 1;
                        this.grid[r][c] = updatedNumber.toString();
                        this.updateCell(r, c, updatedNumber.toString());
                    }
                }
            }
        }
    }

    removeNumberFromCell(row, col) {
        try {
            const removedNumber = parseInt(this.grid[row][col]);
            this.grid[row][col] = " ";
            this.updateCell(row, col, "", '#444444', '#ffffff'); // White background
            for (let r = 0; r < this.grid.length; r++) {
                for (let c = 0; c < this.grid[0].length; c++) {
                    const cellValue = this.grid[r][c];
                    if (cellValue.match(/\d/)) {
                        const currentNumber = parseInt(cellValue);
                        if (currentNumber > removedNumber) {
                            const updatedNumber = currentNumber - 1;
                            this.grid[r][c] = updatedNumber.toString();
                            this.updateCell(r, c, updatedNumber.toString());
                        }
                    }
                }
            }
        } catch (error) {
            this.handleError(`Error removing number from cell (${row}, ${col}):`, error);
        }
    }

    updateNumbersAfterRemoval(row, col) {
        if (this.grid[row][col].match(/\d/)) {
            this.removeNumberFromCell(row, col);
        }
    }

    startDrag(event) {
        if (!this.isDragMode) return;
        const cell = event.target;
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        this.isDragging = true;
        if (this.grid[row][col] !== "#") {
            this.toggleToBlack = true;
        } else {
            this.toggleToBlack = false;
        }
        this.toggleCell(row, col);
    }

    onDrag(event) {
        if (!this.isDragging || !this.isDragMode) return;
        const cell = document.elementFromPoint(event.clientX, event.clientY);
        if (cell && cell.dataset && cell.dataset.row && cell.dataset.col) {
            const row = parseInt(cell.dataset.row);
            const col = parseInt(cell.dataset.col);
            this.toggleCell(row, col);
        }
    }

    stopDrag(event) {
        this.isDragging = false;
    }

    toggleCell(row, col) {
        const cell = this.cells[`${row},${col}`];
        if (cell) {
            if (this.toggleToBlack && this.grid[row][col] !== "#") {
                this.updateCell(row, col, "", '#000000', '#000000'); // Set to black
                this.grid[row][col] = "#";
                this.updateNumbersAfterRemoval(row, col);
            } else if (!this.toggleToBlack && this.grid[row][col] === "#") {
                this.updateCell(row, col, "", '#444444', '#ffffff'); // Set to white
                this.grid[row][col] = " ";
            }
        }
    }

    // ------------------------- Solving Methods -------------------------

    solveCrossword() {
        if (this.isSolving) {
            alert("A puzzle is already being solved. Please wait.");
            return;
        }
        this.isSolving = true;
        const solveButton = document.getElementById('solve-crossword-button');
        if (solveButton) {
            solveButton.disabled = true;
        }
        this.updateStatus("Setting up constraints...", true);
        // Start solving asynchronously to prevent UI blocking
        this.solveCrosswordThread().then(() => {
            if (solveButton) {
                solveButton.disabled = false;
            }
            this.isSolving = false;
        });
    }

    async solveCrosswordThread() {
        const startTime = performance.now();
        try {
            // Validate the grid before solving
            if (!this.validateGrid()) {
                this.isSolving = false;
                return;
            }

            this.generateSlots();
            if (Object.keys(this.slots).length === 0) {
                alert("No numbered slots found to solve.");
                this.updateStatus("Error: No numbered slots found to solve.");
                this.isSolving = false;
                return;
            }

            this.randomizeDomains(); // Shuffle domains for initial randomness
            this.updateStatus("Running AC-3 algorithm...");

            const ac3Result = this.ac3();

            const hasEmptyDomain = Object.values(this.domains).some(domain => domain.length === 0);

            if (!ac3Result || hasEmptyDomain) {
                this.updateStatus("AC-3 failed or domains wiped out. Attempting backtracking...");
            } else {
                this.updateStatus("Starting backtracking search...");
            }

            // Display domain sizes
            this.displayDomainSizes();

            // Performance metrics for heuristic backtracking
            this.recursiveCalls = 0;
            const backtrackingStart = performance.now();
            const result = this.backtrackingSolve();
            const backtrackingEnd = performance.now();
            const backtrackingTime = backtrackingEnd - backtrackingStart;
            const totalTime = (performance.now() - startTime) / 1000;

            if (result) {
                this.updateStatus("Solution found with backtracking.");
                this.performanceData['Backtracking'] = {
                    time: backtrackingTime / 1000, // in seconds
                    calls: this.recursiveCalls
                };
                this.displaySolution();
                this.displayWordList();
                this.updateStatus(`Total solving time: ${totalTime.toFixed(2)} seconds`);
                this.logPerformanceMetrics();
            } else {
                this.updateStatus("No possible solution found.");
                alert("No possible solution found for the current puzzle.");
            }
        } catch (error) {
            this.handleError(`An error occurred during solving:`, error);
        } finally {
            this.isSolving = false;
        }
    }

    validateGrid() {
        if (this.grid.length === 0) {
            alert("The grid is empty. Please generate or load a grid.");
            this.updateStatus("Error: The grid is empty. Please generate or load a grid.");
            return false;
        }

        // Check for rectangular grid
        const cols = this.grid[0].length;
        for (let r = 1; r < this.grid.length; r++) {
            if (this.grid[r].length !== cols) {
                alert("The grid is not rectangular. Please ensure all rows have the same number of columns.");
                this.updateStatus("Error: The grid is not rectangular.");
                return false;
            }
        }

        this.generateSlots();
        if (Object.keys(this.slots).length === 0) {
            alert("No valid slots found in the grid.");
            this.updateStatus("Error: No valid slots found in the grid.");
            return false;
        }

        return true;
    }

    generateSlots() {
        this.slots = {};
        this.domains = {};
        this.cellContents = {};

        const rows = this.grid.length;
        const cols = this.grid[0].length;

        // Record pre-filled letters and numbered cells
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = this.grid[r][c];
                const key = `${r},${c}`;
                if (cell.match(/[A-Z]/)) {
                    this.cellContents[key] = cell;
                } else if (cell !== "#" && cell.trim() !== "") {
                    this.cellContents[key] = null;
                }
            }
        }

        // Identify slots
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = this.grid[r][c];
                if (cell.match(/\d/)) {
                    // Across slot
                    if (c === 0 || this.grid[r][c - 1] === "#") {
                        const positions = this.getSlotPositions(r, c, "across");
                        if (positions.length >= 2) {
                            const slotName = `${cell}ACROSS`;
                            this.slots[slotName] = positions;
                        }
                    }
                    // Down slot
                    if (r === 0 || this.grid[r - 1][c] === "#") {
                        const positions = this.getSlotPositions(r, c, "down");
                        if (positions.length >= 2) {
                            const slotName = `${cell}DOWN`;
                            this.slots[slotName] = positions;
                        }
                    }
                }
            }
        }

        this.generateConstraints();
        this.setupDomains();
    }

    getSlotPositions(r, c, direction) {
        const positions = [];
        const rows = this.grid.length;
        const cols = this.grid[0].length;

        while (r < rows && c < cols && this.grid[r][c] !== "#") {
            positions.push([r, c]);
            if (direction === "across") {
                c += 1;
            } else {
                r += 1;
            }
        }

        return positions;
    }

    generateConstraints() {
        this.constraints = {};
        const positionMap = {};

        for (const slot in this.slots) {
            const positions = this.slots[slot];
            positions.forEach((pos, idx) => {
                const key = `${pos[0]},${pos[1]}`;
                if (!positionMap[key]) {
                    positionMap[key] = [];
                }
                positionMap[key].push({ slot: slot, idx: idx });
            });
        }

        for (const key in positionMap) {
            const overlaps = positionMap[key];
            if (overlaps.length > 1) {
                for (let i = 0; i < overlaps.length; i++) {
                    for (let j = i + 1; j < overlaps.length; j++) {
                        const slot1 = overlaps[i].slot;
                        const idx1 = overlaps[i].idx;
                        const slot2 = overlaps[j].slot;
                        const idx2 = overlaps[j].idx;

                        if (!this.constraints[slot1]) {
                            this.constraints[slot1] = {};
                        }
                        if (!this.constraints[slot1][slot2]) {
                            this.constraints[slot1][slot2] = [];
                        }
                        this.constraints[slot1][slot2].push([idx1, idx2]);

                        if (!this.constraints[slot2]) {
                            this.constraints[slot2] = {};
                        }
                        if (!this.constraints[slot2][slot1]) {
                            this.constraints[slot2][slot1] = [];
                        }
                        this.constraints[slot2][slot1].push([idx2, idx1]);
                    }
                }
            }
        }
    }

    setupDomains() {
        this.domains = {};
        for (const slot in this.slots) {
            const positions = this.slots[slot];
            const length = positions.length;
            const regexPattern = positions.map(pos => {
                const key = `${pos[0]},${pos[1]}`;
                return this.cellContents[key] || '.';
            }).join('');
            const regex = new RegExp(`^${regexPattern}$`);

            const possibleWords = this.wordLengthCache[length] || [];
            const filteredWords = possibleWords.filter(word => regex.test(word));
            this.domains[slot] = filteredWords;
        }
    }

    wordMatchesPreFilledLetters(slot, word) {
        const positions = this.slots[slot];
        for (let i = 0; i < positions.length; i++) {
            const [r, c] = positions[i];
            const key = `${r},${c}`;
            const preFilledLetter = this.cellContents[key];
            if (preFilledLetter && preFilledLetter !== word[i]) {
                return false;
            }
        }
        return true;
    }

    ac3() {
        const queue = new Set();
        for (const var1 in this.constraints) {
            for (const var2 in this.constraints[var1]) {
                queue.add(`${var1},${var2}`);
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

    backtrackingSolve(assignment = {}, cache = {}) {
        if (Object.keys(assignment).length === Object.keys(this.slots).length) {
            this.solution = { ...assignment };
            return true;
        }

        this.recursiveCalls += 1;

        const assignmentKey = JSON.stringify(Object.entries(assignment).sort());
        if (cache[assignmentKey] !== undefined) {
            return cache[assignmentKey];
        }

        const varToAssign = this.selectUnassignedVariable(assignment);
        if (!varToAssign) {
            return false;
        }

        const orderedValues = this.orderDomainValues(varToAssign, assignment);

        for (const value of orderedValues) {
            if (this.isConsistent(varToAssign, value, assignment)) {
                assignment[varToAssign] = value;
                const inferences = this.forwardCheck(varToAssign, value, assignment);
                if (inferences !== false) {
                    const result = this.backtrackingSolve(assignment, cache);
                    if (result) {
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

    selectUnassignedVariable(assignment) {
        const unassignedVars = Object.keys(this.domains).filter(v => !(v in assignment));
        if (unassignedVars.length === 0) return null;

        // MRV (Minimum Remaining Values)
        let minSize = Infinity;
        let candidates = [];
        unassignedVars.forEach(v => {
            if (this.domains[v].length < minSize) {
                minSize = this.domains[v].length;
                candidates = [v];
            } else if (this.domains[v].length === minSize) {
                candidates.push(v);
            }
        });

        // Degree Heuristic
        let maxDegree = -1;
        let finalCandidates = [];
        candidates.forEach(v => {
            const degree = this.constraints[v] ? Object.keys(this.constraints[v]).length : 0;
            if (degree > maxDegree) {
                maxDegree = degree;
                finalCandidates = [v];
            } else if (degree === maxDegree) {
                finalCandidates.push(v);
            }
        });

        // Random Tie-Breaking
        return finalCandidates[Math.floor(Math.random() * finalCandidates.length)];
    }

    orderDomainValues(variable, assignment) {
        // Least Constraining Value: Sort by letter frequencies
        const def = (word) => {
            return word.split('').reduce((acc, char) => acc + (this.letterFrequencies[char] || 0), 0);
        };
        const sorted = [...this.domains[variable]].sort((a, b) => def(a) - def(b));
        // Shuffle to ensure additional randomness
        for (let i = sorted.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
        }
        return sorted;
    }

    isConsistent(variable, value, assignment) {
        if (!this.wordMatchesPreFilledLetters(variable, value)) {
            return false;
        }

        const neighbors = this.constraints[variable] || {};
        for (const neighbor in neighbors) {
            if (neighbor in assignment) {
                if (!this.wordsMatch(variable, value, neighbor, assignment[neighbor])) {
                    return false;
                }
            } else {
                const newDomain = this.domains[neighbor].filter(word => this.wordsMatch(variable, value, neighbor, word));
                if (newDomain.length === 0) {
                    return false;
                }
            }
        }

        return true;
    }

    forwardCheck(variable, value, assignment) {
        const inferences = {};
        const neighbors = this.constraints[variable] || {};

        for (const neighbor in neighbors) {
            if (!(neighbor in assignment)) {
                const possibleValues = this.domains[neighbor].filter(word => this.wordsMatch(variable, value, neighbor, word));
                if (possibleValues.length === 0) {
                    return false;
                }
                inferences[neighbor] = this.domains[neighbor];
                this.domains[neighbor] = possibleValues;
            }
        }

        return inferences;
    }

    restoreDomains(inferences) {
        if (!inferences) return;
        for (const variable in inferences) {
            this.domains[variable] = inferences[variable];
        }
    }

    randomizeDomains() {
        for (const slot in this.domains) {
            this.domains[slot] = this.shuffleArray(this.domains[slot]);
        }
        this.debugLog("Domains randomized.");
    }

    shuffleArray(array) {
        // Fisher-Yates shuffle
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    wordsMatch(var1, word1, var2, word2) {
        const overlaps = this.constraints[var1][var2];
        for (const [idx1, idx2] of overlaps) {
            if (word1[idx1] !== word2[idx2]) {
                return false;
            }
        }
        return true;
    }

    // ------------------------- Solution Display Methods -------------------------

    displaySolution() {
        try {
            for (const slot in this.solution) {
                const word = this.solution[slot];
                const positions = this.slots[slot];
                for (let i = 0; i < positions.length; i++) {
                    const [r, c] = positions[i];
                    this.updateCell(r, c, word[i], '#155724', '#d1e7dd'); // Highlight solution
                }
            }
            this.updateStatus("Solution displayed on the grid.");
            this.debugLog("Solution displayed on the grid.");
        } catch (error) {
            this.handleError("Error displaying solution:", error);
        }
    }

    displayWordList() {
        try {
            const acrossWords = [];
            const downWords = [];

            const sortedSlots = Object.keys(this.slots).sort((a, b) => {
                const numA = parseInt(a.match(/\d+/)[0]);
                const numB = parseInt(b.match(/\d+/)[0]);
                return numA - numB;
            });

            sortedSlots.forEach(slot => {
                const word = this.solution[slot];
                if (word) {
                    const slotNumber = slot.match(/\d+/)[0];
                    const entry = `${slotNumber}: ${word}`;
                    if (slot.endsWith("ACROSS")) {
                        acrossWords.push(entry);
                    } else if (slot.endsWith("DOWN")) {
                        downWords.push(entry);
                    }
                }
            });

            // Update Across Words Display
            const acrossDisplay = document.getElementById('across-display');
            if (acrossDisplay) {
                acrossDisplay.value = acrossWords.join('\n');
            } else {
                throw new Error("Across Display textarea not found in DOM.");
            }

            // Update Down Words Display
            const downDisplay = document.getElementById('down-display');
            if (downDisplay) {
                downDisplay.value = downWords.join('\n');
            } else {
                throw new Error("Down Display textarea not found in DOM.");
            }
        } catch (error) {
            this.handleError("Error displaying word lists:", error);
        }
    }

    logPerformanceMetrics() {
        try {
            for (const method in this.performanceData) {
                const data = this.performanceData[method];
                const message = `${method} - Time: ${data.time.toFixed(4)}s, Recursive Calls: ${data.calls}`;
                this.updateStatus(message);
                this.debugLog(message);
            }
        } catch (error) {
            this.handleError("Error logging performance metrics:", error);
        }
    }

    displayDomainSizes() {
        try {
            this.updateStatus("Domain Sizes After Setup:");
            const sortedSlots = Object.keys(this.domains).sort((a, b) => {
                const numA = parseInt(a.match(/\d+/)[0]);
                const numB = parseInt(b.match(/\d+/)[0]);
                return numA - numB;
            });
            sortedSlots.forEach(slot => {
                const domainSize = this.domains[slot].length;
                this.updateStatus(`Domain for ${slot} has ${domainSize} options.`);
            });
        } catch (error) {
            this.handleError("Error displaying domain sizes:", error);
        }
    }

    // ------------------------- Word Lookup Methods -------------------------

    createWordLookupSection() {
        try {
            // Find a suitable container to append the word lookup section
            // For example, append to the settings-section
            const settingsSection = document.querySelector('.settings-section');
            if (!settingsSection) {
                throw new Error("Settings section not found in DOM.");
            }

            // Create the Word Lookup Section
            const wordLookupSection = document.createElement('section');
            wordLookupSection.className = 'word-lookup-section';
            wordLookupSection.style.marginTop = '20px';

            // Create Header
            const header = document.createElement('h2');
            header.textContent = "Word Lookup";
            wordLookupSection.appendChild(header);

            // Create Search Bar Container
            const searchContainer = document.createElement('div');
            searchContainer.className = 'search-container';
            searchContainer.style.position = 'relative'; // For dropdown positioning

            // Create Search Input
            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.id = 'word-search-input';
            searchInput.placeholder = 'Search for a word...';
            searchInput.style.width = '100%';
            searchInput.style.padding = '8px';
            searchInput.style.border = '1px solid #ccc';
            searchInput.style.borderRadius = '4px';
            searchInput.setAttribute('aria-label', 'Word Search Input');

            searchContainer.appendChild(searchInput);

            // Create Dropdown for Results
            const dropdown = document.createElement('div');
            dropdown.id = 'search-dropdown';
            dropdown.style.position = 'absolute';
            dropdown.style.top = '100%';
            dropdown.style.left = '0';
            dropdown.style.right = '0';
            dropdown.style.backgroundColor = '#fff';
            dropdown.style.border = '1px solid #ccc';
            dropdown.style.borderTop = 'none';
            dropdown.style.maxHeight = '200px';
            dropdown.style.overflowY = 'auto';
            dropdown.style.zIndex = '1000';
            dropdown.style.display = 'none'; // Hidden by default

            searchContainer.appendChild(dropdown);

            // Create Matches Count
            const matchesCount = document.createElement('div');
            matchesCount.id = 'matches-count';
            matchesCount.style.marginTop = '5px';
            matchesCount.style.fontSize = '0.9em';
            matchesCount.style.color = '#555';
            searchContainer.appendChild(matchesCount);

            wordLookupSection.appendChild(searchContainer);
            settingsSection.appendChild(wordLookupSection);

            // Add Event Listener for Search Input
            searchInput.addEventListener('input', this.handleSearchInput);
        } catch (error) {
            this.handleError("Error creating Word Lookup section:", error);
        }
    }

    handleSearchInput(event) {
        const query = event.target.value.trim().toUpperCase();
        const dropdown = document.getElementById('search-dropdown');
        const matchesCount = document.getElementById('matches-count');

        if (query === "") {
            dropdown.style.display = 'none';
            matchesCount.textContent = "";
            return;
        }

        // Find matches that start with the query
        const matches = this.words.filter(word => word.startsWith(query)).sort();

        // Update matches count
        if (matches.length > 0) {
            matchesCount.textContent = `Found ${matches.length} match(es).`;
        } else {
            matchesCount.textContent = "No matches found.";
        }

        if (matches.length === 0) {
            dropdown.style.display = 'none';
            return;
        }

        // Take first ten matches
        const topMatches = matches.slice(0, 10);

        // Populate dropdown
        this.displaySearchResults(topMatches);

        // Show dropdown
        dropdown.style.display = 'block';
    }

    displaySearchResults(matches) {
        const dropdown = document.getElementById('search-dropdown');
        dropdown.innerHTML = ''; // Clear previous results

        matches.forEach(word => {
            const item = document.createElement('div');
            item.textContent = word;
            item.style.padding = '8px';
            item.style.cursor = 'pointer';
            item.style.borderBottom = '1px solid #eee';

            // Add hover effect
            item.addEventListener('mouseover', () => {
                item.style.backgroundColor = '#f1f1f1';
            });
            item.addEventListener('mouseout', () => {
                item.style.backgroundColor = '#fff';
            });

            // Add click event to populate the search input with the clicked word
            item.addEventListener('click', () => {
                const searchInput = document.getElementById('word-search-input');
                if (searchInput) {
                    searchInput.value = word;
                }
                dropdown.style.display = 'none';
                const matchesCount = document.getElementById('matches-count');
                if (matchesCount) {
                    matchesCount.textContent = `Found 1 match.`;
                }
            });

            dropdown.appendChild(item);
        });

        // If less than ten matches, do not include extra empty spaces
    }

    // ------------------------- Solving Methods Continued -------------------------

    // (All solving-related methods are already included above)

    // ------------------------- Solution Display Methods Continued -------------------------
    // (Already included above)

    // ------------------------- Additional Helper Methods -------------------------
    // If you have any additional helper methods, include them here

    // ------------------------- Word Lookup Section Integration -------------------------
    // (Already integrated above)

    // ------------------------- Conclusion -------------------------

    // The rest of the methods remain unchanged
}
