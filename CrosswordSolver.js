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
        this.slots = {}; 
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
        document.getElementById('generate-grid-button').onclick = () => {
            const r = parseInt(document.getElementById('rows-input').value) || 10;
            const c = parseInt(document.getElementById('columns-input').value) || 10;
            this.generateNewGrid(r, c);
        };

        document.getElementById('load-easy-button').onclick = () => this.loadPredefinedPuzzle("Easy");
        document.getElementById('load-medium-button').onclick = () => this.loadPredefinedPuzzle("Medium");
        document.getElementById('load-hard-button').onclick = () => this.loadPredefinedPuzzle("Hard");

        document.getElementById('number-entry-button').onclick = () => this.modes.toggle('number');
        document.getElementById('letter-entry-button').onclick = () => this.modes.toggle('letter');
        document.getElementById('drag-mode-button').onclick = () => this.modes.toggle('drag');
        
        // NEW: Symmetry Toggle
        const symBtn = document.getElementById('symmetry-button');
        if (symBtn) symBtn.onclick = () => this.modes.toggleSymmetry();

        document.getElementById('auto-number-button').onclick = () => this.render();
        document.getElementById('solve-crossword-button').onclick = () => this.handleSolve();

        const searchInput = document.getElementById('word-search-input');
        if (searchInput) searchInput.oninput = () => this.handleSearch(searchInput.value);

        window.onmouseup = () => this.handleMouseUp();
    }

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
        const rows = this.grid.length;
        const cols = this.grid[0].length;
        const targetVal = this.gridManager.toggleToBlack ? "#" : " ";

        // Set clicked cell
        this.grid[r][c] = targetVal;

        // Apply Rotational Symmetry
        if (this.modes.isSymmetryEnabled) {
            const mirrorR = rows - 1 - r;
            const mirrorC = cols - 1 - c;
            this.grid[mirrorR][mirrorC] = targetVal;
        }

        const { slots } = this.constraintManager.buildDataStructures(this.grid);
        this.slots = slots;
        this.gridManager.syncGridToDOM(this.grid, this.slots);
    }

    handleCellClick(e, r, c) {
        const mode = this.modes.currentMode;
        if (mode === 'number') {
            this.gridManager.addNumberToCell(this.grid, r, c);
            this.render(); 
        } else if (mode === 'letter') {
            const letter = prompt("Enter Letter:");
            if (letter !== null) {
                this.grid[r][c] = letter.trim().toUpperCase().charAt(0) || " ";
                this.gridManager.syncGridToDOM(this.grid, this.slots);
            }
        } else if (mode === 'default') {
            this.toggleCell(r, c);
        }
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
        const { slots } = this.constraintManager.buildDataStructures(this.grid);
        this.slots = slots;
        this.gridManager.render(this.grid, container, this);
        this.display.updateWordLists(this.slots, {}, (word) => this.popups.show(word));
    }

    async handleSolve() {
        this.display.updateStatus("Preparing solver...");
        const start = performance.now();
        
        const { slots, cellContents } = this.constraintManager.buildDataStructures(this.grid);
        this.slots = slots;
        
        const uniqueLengths = [...new Set(Object.values(this.slots).map(s => s.length))];
        for (const len of uniqueLengths) {
            if (!this.wordLengthCache[len]) {
                this.wordLengthCache[len] = await this.wordProvider.getWordsOfLength(len);
            }
        }

        this.letterFrequencies = GridUtils.calculateLetterFrequencies(this.wordLengthCache);
        const domains = this.constraintManager.setupDomains(this.slots, this.wordLengthCache, this.grid);
        const allowReuse = document.getElementById('allow-reuse-toggle')?.checked || false;
        const visualize = document.getElementById('visualize-solve-toggle')?.checked || false;

        this.display.updateStatus(visualize ? "Solving visually..." : "Solving...");

        // Hook for visual updates
        if (visualize) {
            this.solver.onUpdateCallback = (slotId, word) => {
                const slot = this.slots[slotId];
                slot.positions.forEach((pos, i) => {
                    const [r, c] = pos;
                    this.grid[r][c] = word[i] || " ";
                });
                this.gridManager.syncGridToDOM(this.grid, this.slots);
            };
        } else {
            this.solver.onUpdateCallback = null;
        }

        // Use 'await' because we are making the solver engine async for visualization
        const result = await this.solver.backtrackingSolve(
            this.slots, 
            domains, 
            this.constraintManager.constraints, 
            this.letterFrequencies, 
            cellContents,
            { allowReuse, visualize }
        );

        const end = performance.now();
        if (result.success) {
            this.display.updateStatus(`Solved in ${((end - start) / 1000).toFixed(2)}s!`);
            this.display.updateWordLists(this.slots, result.solution, (word) => this.popups.show(word));
            this.applySolutionToGrid(this.slots, result.solution);
        } else {
            this.display.updateStatus("No solution found.");
        }
    }

    applySolutionToGrid(slots, solution) {
        for (const slotId in solution) {
            const word = solution[slotId];
            const slot = slots[slotId];
            slot.positions.forEach((pos, i) => {
                const [r, c] = pos;
                this.grid[r][c] = word[i];
            });
        }
        this.gridManager.syncGridToDOM(this.grid, slots);
    }

    async handleSearch(val) {
        const query = val.trim();
        if (!query || query.length < 2) return;
        const words = await this.wordProvider.getWordsOfLength(query.length);
        const regex = new RegExp(`^${query.replace(/\?/g, '.').toUpperCase()}$`);
        const matches = words.filter(w => regex.test(w)).slice(0, 50);
        this.display.updateSearchResults(matches, (selected) => this.popups.show(selected));
    }
}