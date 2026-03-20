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
        this.isDragging = false;
        this.isSolving = false;
        this.currentDirection = 'across'; 
    }

    async init() {
        this.setupEventListeners();
        this.loadPredefinedPuzzle("Easy");
        this.display.updateStatus("System Ready. Click a cell to type.");
    }

    setupEventListeners() {
        document.getElementById('generate-grid-button').onclick = () => {
            if (this.isSolving) return;
            const r = parseInt(document.getElementById('rows-input').value) || 10;
            const c = parseInt(document.getElementById('columns-input').value) || 10;
            this.generateNewGrid(r, c);
        };

        document.getElementById('load-easy-button').onclick = () => !this.isSolving && this.loadPredefinedPuzzle("Easy");
        document.getElementById('load-medium-button').onclick = () => !this.isSolving && this.loadPredefinedPuzzle("Medium");
        document.getElementById('load-hard-button').onclick = () => !this.isSolving && this.loadPredefinedPuzzle("Hard");
        
        document.getElementById('number-entry-button').onclick = () => this.modes.toggle('number');
        document.getElementById('letter-entry-button').onclick = () => this.modes.toggle('letter');
        document.getElementById('drag-mode-button').onclick = () => this.modes.toggle('drag');
        
        const symBtn = document.getElementById('symmetry-button');
        if (symBtn) symBtn.onclick = () => this.modes.toggleSymmetry();

        document.getElementById('auto-number-button').onclick = () => this.render();
        document.getElementById('solve-crossword-button').onclick = () => this.handleSolve();

        const searchInput = document.getElementById('word-search-input');
        if (searchInput) searchInput.oninput = () => this.handleSearch(searchInput.value);

        window.onmouseup = () => this.handleMouseUp();
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    handleKeyDown(e) {
        if (this.isSolving || !this.gridManager.selectedCell) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        const { r, c } = this.gridManager.selectedCell;
        const rows = this.grid.length;
        const cols = this.grid[0].length;

        if (e.key === 'ArrowRight') this.gridManager.focusCell(r, Math.min(cols - 1, c + 1));
        if (e.key === 'ArrowLeft')  this.gridManager.focusCell(r, Math.max(0, c - 1));
        if (e.key === 'ArrowDown')  this.gridManager.focusCell(Math.min(rows - 1, r + 1), c);
        if (e.key === 'ArrowUp')    this.gridManager.focusCell(Math.max(0, r - 1), c);

        if (/^[a-zA-Z]$/.test(e.key)) {
            e.preventDefault();
            this.grid[r][c] = e.key.toUpperCase();
            this.gridManager.syncGridToDOM(this.grid, this.slots);
            this.moveCursor(r, c, 1);
        }

        if (e.key === 'Backspace') {
            e.preventDefault();
            this.grid[r][c] = " ";
            this.gridManager.syncGridToDOM(this.grid, this.slots);
            this.moveCursor(r, c, -1);
        }
    }

    moveCursor(r, c, delta) {
        if (this.currentDirection === 'across') {
            const nextC = c + delta;
            if (nextC >= 0 && nextC < this.grid[0].length) this.gridManager.focusCell(r, nextC);
        } else {
            const nextR = r + delta;
            if (nextR >= 0 && nextR < this.grid.length) this.gridManager.focusCell(nextR, c);
        }
    }

    handleCellClick(e, r, c) {
        if (this.isSolving) return;

        if (this.gridManager.selectedCell?.r === r && this.gridManager.selectedCell?.c === c) {
            this.currentDirection = this.currentDirection === 'across' ? 'down' : 'across';
            this.display.updateStatus(`Direction: ${this.currentDirection.toUpperCase()}`);
        }

        this.gridManager.focusCell(r, c);
        const mode = this.modes.currentMode;
        if (mode === 'number') {
            this.gridManager.addNumberToCell(this.grid, r, c);
            this.render(); 
        } else if (mode === 'default') {
            this.toggleCell(r, c);
        }
    }

    handleMouseDown(e, r, c) {
        if (this.isSolving || this.modes.currentMode !== 'drag') return;
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
        if (this.isSolving) return;
        const rows = this.grid.length;
        const cols = this.grid[0].length;
        const targetVal = this.gridManager.toggleToBlack ? "#" : " ";
        this.grid[r][c] = targetVal;

        if (this.modes.isSymmetryEnabled) {
            this.grid[rows - 1 - r][cols - 1 - c] = targetVal;
        }

        this.constraintManager.buildDataStructures(this.grid);
        this.slots = this.constraintManager.slots;
        this.gridManager.syncGridToDOM(this.grid, this.slots);
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
        this.constraintManager.buildDataStructures(this.grid);
        this.slots = this.constraintManager.slots;
        this.gridManager.render(this.grid, container, this);
        this.display.updateWordLists(this.slots, {}, (word) => this.popups.show(word));
    }

    // Inside CrosswordSolver.js

    async handleSolve() {
        if (this.isSolving) return;
        this.isSolving = true;
        const solveBtn = document.getElementById('solve-crossword-button');
        if (solveBtn) solveBtn.disabled = true;

        try {
            this.display.updateStatus("Preparing solver...");
            const start = performance.now();
            
            // 1. Rebuild structures to ensure we have the latest slots
            const { slots, cellContents } = this.constraintManager.buildDataStructures(this.grid);
            this.slots = slots;
            
            // 2. Ensure word cache is ready
            const uniqueLengths = [...new Set(Object.values(this.slots).map(s => s.length))];
            for (const len of uniqueLengths) {
                if (!this.wordLengthCache[len]) {
                    this.wordLengthCache[len] = await this.wordProvider.getWordsOfLength(len);
                }
            }

            const letterFrequencies = GridUtils.calculateLetterFrequencies(this.wordLengthCache);
            const domains = this.constraintManager.setupDomains(this.slots, this.wordLengthCache, this.grid);
            
            const allowReuse = document.getElementById('allow-reuse-toggle')?.checked || false;
            const visualize = document.getElementById('visualize-solve-toggle')?.checked || false;

            // 3. Visualization Hook
            if (visualize) {
                this.solver.onUpdateCallback = (slotId, word) => {
                    const slot = this.slots[slotId];
                    if (!slot) return;
                    slot.positions.forEach((pos, i) => {
                        const td = this.cells[`${pos[0]},${pos[1]}`];
                        if (td) {
                            const span = td.querySelector('.cell-letter') || td;
                            span.textContent = word[i] || "";
                        }
                    });
                };
            }

            // 4. Run Solver
            const result = await this.solver.backtrackingSolve(
                this.slots, domains, this.constraintManager.constraints, 
                letterFrequencies, cellContents, { allowReuse, visualize }
            );

            const end = performance.now();
            
            if (result.success) {
                this.display.updateStatus(`Solved in ${((end - start) / 1000).toFixed(2)}s!`);
            
                this.display.updateWordLists(this.slots, result.solution, (word) => this.popups.show(word));
                
                this.applySolutionToGrid(this.slots, result.solution);
            } else {
                this.display.updateStatus("No solution found.");
            }
        } catch (error) {
            console.error(error);
            this.display.updateStatus("An error occurred during solving.");
        } finally {
            this.isSolving = false;
            if (solveBtn) solveBtn.disabled = false;
        }
    }

    applySolutionToGrid(slots, solution) {
        for (const slotId in solution) {
            const word = solution[slotId];
            slots[slotId].positions.forEach((pos, i) => {
                this.grid[pos[0]][pos[1]] = word[i];
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