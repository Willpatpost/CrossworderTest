// CrosswordSolver.js
import { WordListProvider } from './providers/WordListProvider.js';
import { WiktionaryDefinitionsProvider } from './providers/WiktionaryDefinitionsProvider.js';
import { SolverEngine } from './solver/SolverEngine.js';
import { ConstraintManager } from './solver/ConstraintManager.js';
import { GridManager } from './grid/GridManager.js';
import { DisplayManager } from './ui/DisplayManager.js';
import { ModeManager } from './ui/ModeManager.js';
import { PopupManager } from './ui/PopupManager.js';
import { predefinedPuzzles } from './utils/Puzzles.js';
import { GridUtils } from './utils/GridUtils.js';

export class CrosswordSolver {
    constructor() {
        this.wordProvider = new WordListProvider();
        this.defProvider = new WiktionaryDefinitionsProvider();
        this.solver = new SolverEngine();
        this.constraintManager = new ConstraintManager();
        
        this.cells = {}; 
        this.gridManager = new GridManager(this.cells);
        this.display = new DisplayManager();
        this.modes = new ModeManager();
        this.popups = new PopupManager(this.defProvider);

        this.grid = [];
        this.wordLengthCache = {};
        this.letterFrequencies = {};
        this.isDragging = false;
    }

    async init() {
        this.setupEventListeners();
        this.loadPredefinedPuzzle("Easy");
        this.display.updateStatus("System Ready.");
    }

    setupEventListeners() {
        // Grid Controls
        document.getElementById('generate-grid-button').onclick = () => {
            const r = parseInt(document.getElementById('rows-input').value) || 10;
            const c = parseInt(document.getElementById('columns-input').value) || 10;
            this.generateNewGrid(r, c);
        };

        // Mode Toggles
        document.getElementById('number-entry-button').onclick = () => this.modes.toggle('number');
        document.getElementById('letter-entry-button').onclick = () => this.modes.toggle('letter');
        document.getElementById('drag-mode-button').onclick = () => this.modes.toggle('drag');

        // Solver Action
        document.getElementById('solve-crossword-button').onclick = () => this.handleSolve();

        // RESTORED: Search/Word Lookup Logic
        const searchInput = document.getElementById('word-search-input');
        if (searchInput) {
            searchInput.oninput = () => this.handleSearch(searchInput.value);
        }
    }

    // --- Drag & Interaction Handlers (Restored from OG) ---
    handleMouseDown(e, r, c) {
        if (this.modes.currentMode !== 'drag') return;
        this.isDragging = true;
        this.gridManager.toggleToBlack = (this.grid[r][c] !== "#");
        this.toggleCell(r, c);
    }

    handleMouseOver(e, r, c) {
        if (this.isDragging) this.toggleCell(r, c);
    }

    handleMouseUp() {
        this.isDragging = false;
    }

    toggleCell(r, c) {
        this.grid[r][c] = this.gridManager.toggleToBlack ? "#" : " ";
        const td = this.cells[`${r},${c}`];
        this.gridManager.updateCellDisplay(td, this.grid[r][c]);
    }

    handleCellClick(e, r, c) {
        const mode = this.modes.currentMode;
        if (mode === 'number') {
            this.gridManager.addNumberToCell(this.grid, r, c);
        } else if (mode === 'letter') {
            const letter = prompt("Enter Letter:").toUpperCase();
            if (letter !== null) {
                this.grid[r][c] = letter.charAt(0) || " ";
                this.gridManager.syncGridToDOM(this.grid);
            }
        } else if (mode === 'default') {
            this.grid[r][c] = (this.grid[r][c] === "#") ? " " : "#";
            this.gridManager.syncGridToDOM(this.grid);
        }
    }

    // --- Core Logic ---
    generateNewGrid(rows, cols) {
        this.grid = Array.from({ length: rows }, () => Array(cols).fill(" "));
        this.render();
    }

    loadPredefinedPuzzle(name) {
        const puzzle = predefinedPuzzles.find(p => p.name === name);
        if (puzzle) {
            this.grid = JSON.parse(JSON.stringify(puzzle.grid));
            this.render();
        }
    }

    render() {
        const container = document.getElementById('grid-container');
        // Pass 'this' as the coordinator so GridManager can call interaction hooks
        this.gridManager.render(this.grid, container, this);
    }

    async handleSolve() {
        this.display.updateStatus("Analyzing constraints...");
        const start = performance.now();
        
        const { slots, cellContents } = this.constraintManager.buildDataStructures(this.grid);
        
        this.display.updateStatus("Loading word lists...");
        const uniqueLengths = [...new Set(Object.values(slots).map(s => s.length))];
        for (const len of uniqueLengths) {
            if (!this.wordLengthCache[len]) {
                this.wordLengthCache[len] = await this.wordProvider.getWordsOfLength(len);
            }
        }

        // RESTORED: Heuristic calculation
        this.letterFrequencies = GridUtils.calculateLetterFrequencies(this.wordLengthCache);
        const domains = this.constraintManager.setupDomains(this.wordLengthCache);

        this.display.updateStatus("Solving...");
        const result = this.solver.backtrackingSolve(
            slots, domains, this.constraintManager.constraints, 
            this.letterFrequencies, cellContents
        );

        const end = performance.now();
        if (result.success) {
            this.display.updateStatus(`Solved in ${((end - start) / 1000).toFixed(2)}s!`);
            // RESTORED: Clickable list items link to PopupManager
            this.display.updateWordLists(slots, result.solution, (word) => this.popups.show(word));
            this.applySolutionToGrid(slots, result.solution);
        } else {
            this.display.updateStatus("No solution found.");
        }
    }

    applySolutionToGrid(slots, solution) {
        for (const slotId in solution) {
            const word = solution[slotId];
            slots[slotId].forEach((pos, i) => {
                const [r, c] = pos;
                if (!/\d/.test(this.grid[r][c])) this.grid[r][c] = word[i];
            });
        }
        this.gridManager.syncGridToDOM(this.grid);
    }

    // --- Search Helper ---
    async handleSearch(val) {
        if (!val || val.length < 2) return;
        const words = await this.wordProvider.getWordsOfLength(val.length);
        const regex = new RegExp(`^${val.replace(/\?/g, '.').toUpperCase()}$`);
        const matches = words.filter(w => regex.test(w)).slice(0, 50);
        this.display.updateSearchResults(matches, (selected) => this.popups.show(selected));
    }
}