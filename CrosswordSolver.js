// CrosswordSolver.js
import { WordListProvider } from './providers/WordListProvider.js';
import { DefinitionsProvider } from './providers/DefinitionsProvider.js';
import { DictionaryAPI } from './providers/DictionaryAPI.js';
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
        // Data Providers
        this.wordProvider = new WordListProvider();
        this.Defs = new DefinitionsProvider();
        this.fallbackApi = new DictionaryAPI();
        
        // Core Engine
        this.solver = new SolverEngine();
        this.constraintManager = new ConstraintManager();
        
        // UI & Grid state
        this.cells = {}; 
        this.gridManager = new GridManager(this.cells);
        this.display = new DisplayManager();
        this.modes = new ModeManager();
        this.popups = new PopupManager(this.Defs, this.fallbackApi);

        // State Variables
        this.grid = [];
        this.slots = {}; 
        this.wordLengthCache = {};
        this.letterFrequencies = {};
        this.isDragging = false;
        this.isSolving = false; 
        this.activeWorker = null; 
        
        this.currentSolution = null; 
        this.puzzleIndex = []; // Stores the 86k puzzle index
    }

    async init() {
        this.setupEventListeners();
        
        // Load the massive classic puzzle index asynchronously 
        try {
            const resp = await fetch('data/nyt_puzzles/puzzle_index.json');
            if (resp.ok) {
                this.puzzleIndex = await resp.json();
                this.display.updateStatus(`Loaded ${this.puzzleIndex.length} classic puzzles to index.`);
            }
        } catch (e) {
            console.warn("Could not load puzzle_index.json. Random puzzle feature will be disabled.", e);
        }

        this.loadPredefinedPuzzle("Easy");
        this.display.updateStatus("System Ready.");
    }

    setupEventListeners() {
        document.getElementById('generate-grid-button').onclick = () => {
            this.abortActiveSolve();
            const r = parseInt(document.getElementById('rows-input').value) || 10;
            const c = parseInt(document.getElementById('columns-input').value) || 10;
            this.generateNewGrid(r, c);
        };

        document.getElementById('load-easy-button').onclick = () => { this.abortActiveSolve(); this.loadPredefinedPuzzle("Easy"); };
        document.getElementById('load-medium-button').onclick = () => { this.abortActiveSolve(); this.loadPredefinedPuzzle("Medium"); };
        document.getElementById('load-hard-button').onclick = () => { this.abortActiveSolve(); this.loadPredefinedPuzzle("Hard"); };
        
        const randomBtn = document.getElementById('random-puzzle-button');
        if (randomBtn) randomBtn.onclick = () => { this.abortActiveSolve(); this.loadRandomPuzzle(); };

        document.getElementById('number-entry-button').onclick = () => this.modes.toggle('number');
        document.getElementById('letter-entry-button').onclick = () => this.modes.toggle('letter');
        document.getElementById('drag-mode-button').onclick = () => this.modes.toggle('drag');
        
        const symBtn = document.getElementById('symmetry-button');
        if (symBtn) symBtn.onclick = () => this.modes.toggleSymmetry();

        document.getElementById('auto-number-button').onclick = () => this.render();
        document.getElementById('solve-crossword-button').onclick = () => this.handleSolve();
        
        const cancelBtn = document.getElementById('cancel-solve-button');
        if (cancelBtn) cancelBtn.onclick = () => this.abortActiveSolve(true);

        const searchInput = document.getElementById('word-search-input');
        if (searchInput) searchInput.oninput = () => this.handleSearch(searchInput.value);

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

    // NEW: Centralized Worker Lifecycle Management
    abortActiveSolve(isManualCancel = false) {
        if (this.activeWorker) {
            this.activeWorker.terminate();
            this.activeWorker = null;
        }
        
        if (this.isSolving) {
            this.isSolving = false;
            
            const solveBtn = document.getElementById('solve-crossword-button');
            const cancelBtn = document.getElementById('cancel-solve-button');
            if (solveBtn) solveBtn.disabled = false;
            if (cancelBtn) cancelBtn.style.display = 'none';
            
            if (isManualCancel) {
                this.display.updateStatus("Solve operation cancelled by user.");
                this.gridManager.syncGridToDOM(this.grid, this.slots);
            }
        }
    }

    // Handles transition between Builder and Player states
    handlePlayModeToggle() {
        if (this.isSolving) this.abortActiveSolve();

        // If we don't have a solution saved, but the grid has letters, extract them as the solution
        if (!this.currentSolution) {
            this.currentSolution = this.extractSolutionFromGrid();
        }

        const isNowPlaying = this.modes.togglePlayMode();
        
        if (isNowPlaying) {
            this.display.updateStatus("Entered Play Mode. Good luck!");
            this.blankGridForPlayMode();
        } else {
            this.display.updateStatus("Returned to Builder Mode.");
            this.applySolutionToGrid(this.slots, this.currentSolution);
        }

        this.display.updateWordLists(
            this.slots, 
            this.currentSolution, 
            (word) => { if (!this.modes.isPlayMode) this.popups.show(word); },
            this.Defs, 
            this.modes.isPlayMode
        );
    }

    extractSolutionFromGrid() {
        const solution = {};
        for (const slotId in this.slots) {
            const slot = this.slots[slotId];
            let word = "";
            slot.positions.forEach(([r, c]) => {
                word += this.grid[r][c] || " ";
            });
            solution[slotId] = word;
        }
        return solution;
    }

    blankGridForPlayMode() {
        for (let r = 0; r < this.grid.length; r++) {
            for (let c = 0; c < this.grid[0].length; c++) {
                if (this.grid[r][c] !== "#") {
                    this.grid[r][c] = " ";
                }
            }
        }
        this.gridManager.syncGridToDOM(this.grid, this.slots);
    }

    handleMouseDown(e, r, c) {
        if (this.modes.currentMode !== 'drag') return;
        this.abortActiveSolve(); // Interrupt solve if user clicks the grid
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

        this.grid[r][c] = targetVal;

        if (this.modes.isSymmetryEnabled) {
            const mirrorR = rows - 1 - r;
            const mirrorC = cols - 1 - c;
            this.grid[mirrorR][mirrorC] = targetVal;
        }

        this.constraintManager.buildDataStructures(this.grid);
        this.slots = this.constraintManager.slots;
        this.gridManager.syncGridToDOM(this.grid, this.slots);
        this.currentSolution = null; 
    }

    handleCellClick(e, r, c) {
        if (this.isSolving) this.abortActiveSolve();
        
        if (this.modes.isPlayMode) return;

        const mode = this.modes.currentMode;
        if (mode === 'number') {
            this.gridManager.addNumberToCell(this.grid, r, c);
            this.render(); 
        } else if (mode === 'letter') {
            const letter = prompt("Enter Letter:");
            if (letter !== null) {
                this.grid[r][c] = letter.trim().toUpperCase().charAt(0) || " ";
                this.gridManager.syncGridToDOM(this.grid, this.slots);
                this.currentSolution = null; 
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

    async loadRandomPuzzle() {
        if (this.puzzleIndex.length === 0) {
            this.display.updateStatus("Puzzle index is empty or still loading.");
            return;
        }
        
        const randomEntry = this.puzzleIndex[Math.floor(Math.random() * this.puzzleIndex.length)];
        this.display.updateStatus(`Loading: ${randomEntry.title || randomEntry.id}...`);

        try {
            const resp = await fetch(`data/nyt_puzzles/${randomEntry.file}`);
            const puzzleData = await resp.json();
            
            this.importXdGrid(puzzleData.grid);
            this.display.updateStatus(`Loaded ${randomEntry.title} (${randomEntry.author}, ${randomEntry.date})`);
            
        } catch (e) {
            this.display.updateStatus("Failed to load puzzle data.");
            console.error(e);
        }
    }

    importXdGrid(gridStrings) {
        if (!gridStrings || gridStrings.length === 0) return;
        
        const rows = gridStrings.length;
        const cols = gridStrings[0].length;
        
        this.grid = [];
        for (let r = 0; r < rows; r++) {
            const rowArr = [];
            for (let c = 0; c < cols; c++) {
                const char = gridStrings[r][c];
                rowArr.push(char === '.' ? '#' : char.toUpperCase()); 
            }
            this.grid.push(rowArr);
        }
        
        this.currentSolution = null;
        this.render();
    }

    render() {
        const container = document.getElementById('grid-container');
        this.constraintManager.buildDataStructures(this.grid);
        this.slots = this.constraintManager.slots;
        this.gridManager.render(this.grid, container, this);
        
        this.display.updateWordLists(
            this.slots, 
            this.currentSolution || {}, 
            (word) => this.popups.show(word),
            this.Defs,
            this.modes.isPlayMode
        );
    }

    async handleSolve() {
        // If they click solve while it's already running, restart it cleanly.
        if (this.isSolving) {
            this.abortActiveSolve();
        }
        
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
                
                // UI Throttling setup
                let lastVisualUpdate = performance.now();

                this.activeWorker.onmessage = (e) => {
                    const { type, payload } = e.data;

                    if (type === 'UPDATE') {
                        const now = performance.now();
                        // Throttle to ~30fps to prevent DOM lockup
                        if (now - lastVisualUpdate > 32) {
                            lastVisualUpdate = now;
                            
                            const { slotId, word } = payload;
                            const slot = this.slots[slotId];
                            if (!slot) return;
                            
                            requestAnimationFrame(() => {
                                slot.positions.forEach((pos, i) => {
                                    const [r, c] = pos;
                                    const td = this.cells[`${r},${c}`];
                                    if (td) {
                                        const letterSpan = td.querySelector('.cell-letter') || td;
                                        letterSpan.textContent = word[i] || "";
                                        td.style.backgroundColor = word ? "#e3f2fd" : "white";
                                    }
                                });
                            });
                        }
                    } else if (type === 'RESULT') {
                        resolve(payload);
                    } else if (type === 'ERROR') {
                        reject(new Error(payload));
                    }
                };

                this.activeWorker.onerror = (err) => {
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
                this.currentSolution = result.solution;
                this.display.updateStatus(`Solved in ${((end - start) / 1000).toFixed(2)}s!`);
                this.applySolutionToGrid(this.slots, result.solution);
                
                this.display.updateWordLists(
                    this.slots, 
                    result.solution, 
                    (word) => this.popups.show(word),
                    this.Defs,
                    this.modes.isPlayMode
                );
            } else {
                this.display.updateStatus("No solution found.");
                this.gridManager.syncGridToDOM(this.grid, this.slots);
            }
        } catch (err) {
            // Only log if it wasn't an intentional abort
            if (this.isSolving) {
                console.error(err);
                this.display.updateStatus("Solver Error: " + err.message);
            }
        } finally {
            this.abortActiveSolve(); // Clean up gracefully
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
        const query = val.trim().toUpperCase();
        // Remove all characters except A-Z and the '?' wildcard to prevent regex crashes
        const safeQuery = query.replace(/[^A-Z?]/g, ''); 
        
        if (!safeQuery || safeQuery.length < 2) {
            this.display.updateSearchResults([], () => {});
            return;
        }
        
        try {
            const words = await this.wordProvider.getWordsOfLength(safeQuery.length);
            const regex = new RegExp(`^${safeQuery.replace(/\?/g, '.')}$`);
            const matches = words.filter(w => regex.test(w)).slice(0, 50);
            this.display.updateSearchResults(matches, (selected) => this.popups.show(selected));
        } catch (e) {
            console.warn("Search failed", e);
        }
    }
}