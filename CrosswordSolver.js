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
        this.isSolving = false; 
        this.activeWorker = null; // Track the worker for cancellation
        
        // NEW: Store the generated solution for Play Mode validation
        this.currentSolution = null; 
    }

    async init() {
        this.setupEventListeners();
        this.loadPredefinedPuzzle("Easy");
        this.display.updateStatus("System Ready.");
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
        
        const cancelBtn = document.getElementById('cancel-solve-button');
        if (cancelBtn) cancelBtn.onclick = () => this.handleCancel();

        const searchInput = document.getElementById('word-search-input');
        if (searchInput) searchInput.oninput = () => this.handleSearch(searchInput.value);

        // NEW: Play Mode Listeners
        const playBtn = document.getElementById('play-mode-button');
        if (playBtn) playBtn.onclick = () => this.handlePlayModeToggle();

        const checkGridBtn = document.getElementById('check-grid-button');
        if (checkGridBtn) checkGridBtn.onclick = () => console.log("Check Grid clicked - To be implemented");

        const revealWordBtn = document.getElementById('reveal-word-button');
        if (revealWordBtn) revealWordBtn.onclick = () => console.log("Reveal Word clicked - To be implemented");

        const revealPuzzleBtn = document.getElementById('reveal-puzzle-button');
        if (revealPuzzleBtn) revealPuzzleBtn.onclick = () => console.log("Reveal Puzzle clicked - To be implemented");

        window.onmouseup = () => this.handleMouseUp();
    }

    // NEW: Handle the transition between Builder and Player states
    handlePlayModeToggle() {
        if (!this.currentSolution) {
            this.display.updateStatus("Please generate a solution first before playing!");
            return;
        }

        const isNowPlaying = this.modes.togglePlayMode();
        
        if (isNowPlaying) {
            this.display.updateStatus("Entered Play Mode. Good luck!");
            // In the next step, we will clear the physical grid here so the user can type
        } else {
            this.display.updateStatus("Returned to Builder Mode.");
            // Restore the solved grid visually
            this.applySolutionToGrid(this.slots, this.currentSolution);
        }

        // Trigger the updated DisplayManager to swap Words for Clues
        this.display.updateWordLists(
            this.slots, 
            this.currentSolution, 
            (word) => { if (!this.modes.isPlayMode) this.popups.show(word); },
            this.defProvider,
            this.modes.isPlayMode
        );
    }

    handleCancel() {
        if (this.activeWorker) {
            this.activeWorker.terminate();
            this.activeWorker = null;
            this.isSolving = false;
            
            const solveBtn = document.getElementById('solve-crossword-button');
            const cancelBtn = document.getElementById('cancel-solve-button');
            if (solveBtn) solveBtn.disabled = false;
            if (cancelBtn) cancelBtn.style.display = 'none';
            
            this.display.updateStatus("Solve operation cancelled by user.");
            this.gridManager.syncGridToDOM(this.grid, this.slots);
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
            const mirrorR = rows - 1 - r;
            const mirrorC = cols - 1 - c;
            this.grid[mirrorR][mirrorC] = targetVal;
        }

        this.constraintManager.buildDataStructures(this.grid);
        this.slots = this.constraintManager.slots;
        this.gridManager.syncGridToDOM(this.grid, this.slots);
        this.currentSolution = null; // Reset solution if grid geometry changes
    }

    handleCellClick(e, r, c) {
        if (this.isSolving) return;
        
        // NEW: Prevent builder clicks while in play mode
        if (this.modes.isPlayMode) {
            // We will add grid selection/typing logic here later
            return;
        }

        const mode = this.modes.currentMode;
        if (mode === 'number') {
            this.gridManager.addNumberToCell(this.grid, r, c);
            this.render(); 
        } else if (mode === 'letter') {
            const letter = prompt("Enter Letter:");
            if (letter !== null) {
                this.grid[r][c] = letter.trim().toUpperCase().charAt(0) || " ";
                this.gridManager.syncGridToDOM(this.grid, this.slots);
                this.currentSolution = null; // Reset solution on manual edit
            }
        } else if (mode === 'default') {
            this.toggleCell(r, c);
        }
    }

    generateNewGrid(rows, cols) {
        this.grid = Array.from({ length: rows }, () => Array(cols).fill(" "));
        this.currentSolution = null;
        this.render();
    }

    loadPredefinedPuzzle(name) {
        const puzzle = predefinedPuzzles.find(p => p.name === name);
        if (puzzle) {
            this.grid = JSON.parse(JSON.stringify(puzzle.grid));
            this.currentSolution = null;
            this.render();
        }
    }

    render() {
        const container = document.getElementById('grid-container');
        this.constraintManager.buildDataStructures(this.grid);
        this.slots = this.constraintManager.slots;
        this.gridManager.render(this.grid, container, this);
        
        // Ensure we pass the new arguments so it doesn't break
        this.display.updateWordLists(
            this.slots, 
            this.currentSolution || {}, 
            (word) => this.popups.show(word),
            this.defProvider,
            this.modes.isPlayMode
        );
    }

    async handleSolve() {
        if (this.isSolving) return;
        
        const solveBtn = document.getElementById('solve-crossword-button');
        const cancelBtn = document.getElementById('cancel-solve-button');
        
        this.isSolving = true;
        if (solveBtn) solveBtn.disabled = true;
        if (cancelBtn) cancelBtn.style.display = 'inline-block';

        try {
            this.display.updateStatus("Analyzing grid constraints...");
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

            const result = await new Promise((resolve, reject) => {
                this.activeWorker = new Worker('./solver/SolverWorker.js', { type: 'module' });

                this.activeWorker.onmessage = (e) => {
                    const { type, payload } = e.data;

                    if (type === 'UPDATE') {
                        const { slotId, word } = payload;
                        const slot = this.slots[slotId];
                        if (!slot) return;
                        
                        slot.positions.forEach((pos, i) => {
                            const [r, c] = pos;
                            const td = this.cells[`${r},${c}`];
                            if (td) {
                                const letterSpan = td.querySelector('.cell-letter') || td;
                                letterSpan.textContent = word[i] || "";
                                td.style.backgroundColor = word ? "#e3f2fd" : "white";
                            }
                        });
                    } else if (type === 'RESULT') {
                        this.activeWorker.terminate();
                        this.activeWorker = null;
                        resolve(payload);
                    } else if (type === 'ERROR') {
                        this.activeWorker.terminate();
                        this.activeWorker = null;
                        reject(new Error(payload));
                    }
                };

                this.activeWorker.onerror = (err) => {
                    if (this.activeWorker) this.activeWorker.terminate();
                    this.activeWorker = null;
                    reject(err);
                };

                this.activeWorker.postMessage({
                    type: 'START_SOLVE',
                    payload: {
                        slots: this.slots,
                        domains,
                        constraints: this.constraintManager.constraints,
                        letterFrequencies: this.letterFrequencies,
                        cellContents,
                        settings: { allowReuse, visualize }
                    }
                });
            });

            const end = performance.now();
            if (result.success) {
                // NEW: Store the solution!
                this.currentSolution = result.solution;

                this.display.updateStatus(`Solved in ${((end - start) / 1000).toFixed(2)}s!`);
                this.applySolutionToGrid(this.slots, result.solution);
                
                this.display.updateWordLists(
                    this.slots, 
                    result.solution, 
                    (word) => this.popups.show(word),
                    this.defProvider,
                    this.modes.isPlayMode
                );
            } else {
                this.display.updateStatus("No solution found.");
                this.gridManager.syncGridToDOM(this.grid, this.slots);
            }
        } catch (err) {
            if (this.isSolving) {
                console.error(err);
                this.display.updateStatus("Solver Error: " + err.message);
            }
        } finally {
            this.isSolving = false;
            this.activeWorker = null;
            if (solveBtn) solveBtn.disabled = false;
            if (cancelBtn) cancelBtn.style.display = 'none';
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
        
        try {
            const words = await this.wordProvider.getWordsOfLength(query.length);
            const regex = new RegExp(`^${query.replace(/\?/g, '.').toUpperCase()}$`);
            const matches = words.filter(w => regex.test(w)).slice(0, 50);
            this.display.updateSearchResults(matches, (selected) => this.popups.show(selected));
        } catch (e) {
            console.warn("Search failed", e);
        }
    }
}
