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

export class CrosswordSolver {
    constructor() {
        // --- Core Providers ---
        this.wordProvider = new WordListProvider();
        this.defProvider = new WiktionaryDefinitionsProvider();

        // --- Logic & Engines ---
        this.solver = new SolverEngine();
        this.constraintManager = new ConstraintManager();
        
        // --- UI & Grid Managers ---
        this.cells = {}; // Shared DOM reference map
        this.gridManager = new GridManager(this.cells);
        this.display = new DisplayManager();
        this.modes = new ModeManager();
        this.popups = new PopupManager(this.defProvider);

        // --- State ---
        this.grid = [];
        this.wordLengthCache = {};
        this.letterFrequencies = {};
    }

    async init() {
        this.setupEventListeners();
        this.loadPredefinedPuzzle("Easy"); // Default start
        this.display.updateStatus("System Ready.");
    }

    setupEventListeners() {
        // Grid Generation
        document.getElementById('generate-grid-button').onclick = () => {
            const r = parseInt(document.getElementById('rows-input').value);
            const c = parseInt(document.getElementById('columns-input').value);
            this.generateNewGrid(r, c);
        };

        // Mode Toggles
        document.getElementById('number-entry-button').onclick = () => this.modes.toggle('number');
        document.getElementById('letter-entry-button').onclick = () => this.modes.toggle('letter');
        document.getElementById('drag-mode-button').onclick = () => this.modes.toggle('drag');

        // Solve Action
        document.getElementById('solve-crossword-button').onclick = () => this.handleSolve();
    }

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
        this.gridManager.render(this.grid, container, (e) => this.handleCellClick(e));
    }

    handleCellClick(e) {
        const r = parseInt(e.target.dataset.row);
        const c = parseInt(e.target.dataset.col);
        const mode = this.modes.currentMode;

        if (mode === 'number') {
            this.gridManager.addNumberToCell(this.grid, r, c);
        } else if (mode === 'letter') {
            const letter = prompt("Enter Letter:").toUpperCase();
            this.grid[r][c] = letter;
        } else if (mode === 'drag' || mode === 'default') {
            this.grid[r][c] = (this.grid[r][c] === "#") ? " " : "#";
        }
        this.render();
    }

    async handleSolve() {
        this.display.updateStatus("Analyzing constraints...");
        const start = performance.now();
        
        // 1. Build Constraints
        const { slots, cellContents } = this.constraintManager.buildDataStructures(this.grid);
        
        // 2. Prepare Domains (Lazy load word lists)
        this.display.updateStatus("Loading word lists...");
        for (const slot in slots) {
            const len = slots[slot].length;
            if (!this.wordLengthCache[len]) {
                this.wordLengthCache[len] = await this.wordProvider.getWordsOfLength(len);
            }
        }

        const domains = this.constraintManager.setupDomains(this.wordLengthCache);

        // 3. Run Solver
        this.display.updateStatus("Solving via AC-3 + Backtracking...");
        const result = this.solver.backtrackingSolve(
            slots, 
            domains, 
            this.constraintManager.constraints, 
            this.letterFrequencies, 
            cellContents
        );

        const end = performance.now();
        if (result.success) {
            this.display.updateStatus(`Solved in ${((end - start) / 1000).toFixed(2)}s!`);
            this.display.updateWordLists(slots, result.solution);
            this.applySolutionToGrid(slots, result.solution);
        } else {
            this.display.updateStatus("No solution found.");
        }
    }

    applySolutionToGrid(slots, solution) {
        for (const slotId in solution) {
            const word = solution[slotId];
            const positions = slots[slotId];
            positions.forEach((pos, i) => {
                const [r, c] = pos;
                // Preserve numbering if present, otherwise just set letter
                const cellVal = this.grid[r][c];
                if (!/\d/.test(cellVal)) {
                    this.grid[r][c] = word[i];
                }
            });
        }
        this.render();
    }
}