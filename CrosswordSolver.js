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
        /* ===============================
           DATA PROVIDERS
        =============================== */
        this.wordProvider = new WordListProvider();
        this.definitions = new DefinitionsProvider();
        this.fallbackApi = new DictionaryAPI();

        /* ===============================
           CORE LOGIC
        =============================== */
        this.solver = new SolverEngine();
        this.constraintManager = new ConstraintManager();

        /* ===============================
           UI + GRID
        =============================== */
        this.cells = {};
        this.gridManager = new GridManager(this.cells);
        this.display = new DisplayManager();
        this.modes = new ModeManager();
        this.popups = new PopupManager(this.definitions, this.fallbackApi);

        /* ===============================
           APP STATE
        =============================== */
        this.grid = [];
        this.slots = {};
        this.wordLengthCache = {};
        this.letterFrequencies = {};

        this.isDragging = false;
        this.dragPaintValue = '#';

        this.isSolving = false;
        this.activeWorker = null;

        this.currentSolution = null;
        this.puzzleIndex = [];
    }

    /* ===============================
       INIT
    =============================== */

    async init() {
        this.setupEventListeners();

        try {
            const resp = await fetch('data/nyt_puzzles/puzzle_index.json');
            if (resp.ok) {
                this.puzzleIndex = await resp.json();
                this.display.updateStatus(
                    `Loaded ${this.puzzleIndex.length} classic puzzles to index.`
                );
            }
        } catch (error) {
            console.warn(
                'Could not load puzzle_index.json. Random puzzle feature disabled.',
                error
            );
        }

        this.loadPredefinedPuzzle('Easy');
        this.display.updateStatus('System ready.', true);
    }

    /* ===============================
       EVENT LISTENERS
    =============================== */

    setupEventListeners() {
        this._bindClick('generate-grid-button', () => {
            this.abortActiveSolve();
            const rows = parseInt(document.getElementById('rows-input')?.value, 10) || 15;
            const cols = parseInt(document.getElementById('columns-input')?.value, 10) || 15;
            this.generateNewGrid(rows, cols);
        });

        this._bindClick('load-easy-button', () => {
            this.abortActiveSolve();
            this.loadPredefinedPuzzle('Easy');
        });

        this._bindClick('load-medium-button', () => {
            this.abortActiveSolve();
            this.loadPredefinedPuzzle('Medium');
        });

        this._bindClick('load-hard-button', () => {
            this.abortActiveSolve();
            this.loadPredefinedPuzzle('Hard');
        });

        this._bindClick('random-puzzle-button', () => {
            this.abortActiveSolve();
            this.loadRandomPuzzle();
        });

        this._bindClick('drag-mode-button', () => {
            this.modes.setMode('drag');
        });

        this._bindClick('letter-entry-button', () => {
            this.modes.setMode('letter');
        });

        this._bindClick('symmetry-button', () => {
            this.modes.toggleSymmetry();
        });

        this._bindClick('auto-number-button', () => {
            this.render();
            this.display.updateStatus('Grid numbering refreshed.', true);
        });

        this._bindClick('solve-crossword-button', () => {
            this.handleSolve();
        });

        this._bindClick('cancel-solve-button', () => {
            this.abortActiveSolve(true);
        });

        const searchInput = document.getElementById('word-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.handleSearch(searchInput.value);
            });
        }

        this._bindClick('check-square-btn', () => this.handleCheckSquare());
        this._bindClick('check-word-btn', () => this.handleCheckWord());
        this._bindClick('check-puzzle-btn', () => this.handleCheckPuzzle());

        this._bindClick('reveal-square-btn', () => this.handleRevealSquare());
        this._bindClick('reveal-word-btn', () => this.handleRevealWord());
        this._bindClick('reveal-puzzle-btn', () => this.handleRevealPuzzle());

        this._bindClick('clear-btn', () => this.handleClearPlayGrid());
        this._bindClick('pause-btn', () => {
            this.display.updateStatus('Pause functionality is not implemented yet.', true);
        });

        window.addEventListener('mouseup', () => this.handleMouseUp());
    }

    _bindClick(id, handler) {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('click', handler);
    }

    /* ===============================
       WORKER / SOLVE STATE
    =============================== */

    abortActiveSolve(isManualCancel = false) {
        if (this.activeWorker) {
            this.activeWorker.terminate();
            this.activeWorker = null;
        }

        const wasSolving = this.isSolving;
        this.isSolving = false;

        const solveBtn = document.getElementById('solve-crossword-button');
        const cancelBtn = document.getElementById('cancel-solve-button');

        if (solveBtn) solveBtn.disabled = false;
        if (cancelBtn) cancelBtn.classList.add('hidden');

        if (wasSolving && isManualCancel) {
            this.display.updateStatus('Solve operation cancelled by user.', true);
            this.gridManager.syncGridToDOM(this.grid, this.slots);
        }
    }

    /* ===============================
       PLAY MODE TRANSITIONS
    =============================== */

    enterPlayMode() {
        if (this.isSolving) this.abortActiveSolve();

        if (!this.currentSolution) {
            this.currentSolution = this.extractSolutionFromGrid();
        }

        this.modes.setPlayMode(true);
        this.blankGridForPlayMode();
        this.refreshWordList();
        this.display.updateStatus('Entered play mode. Good luck!', true);
    }

    exitPlayMode() {
        if (this.isSolving) this.abortActiveSolve();

        this.modes.setPlayMode(false);

        if (this.currentSolution) {
            this.applySolutionToGrid(this.slots, this.currentSolution);
        }

        this.refreshWordList();
        this.display.updateStatus('Returned to editor mode.', true);
    }

    extractSolutionFromGrid() {
        const solution = {};

        for (const slotId in this.slots) {
            const slot = this.slots[slotId];
            let word = '';

            slot.positions.forEach(([r, c]) => {
                const val = this.grid[r][c];
                word += (typeof val === 'string' && /^[A-Z]$/i.test(val)) ? val.toUpperCase() : ' ';
            });

            solution[slotId] = word;
        }

        return solution;
    }

    blankGridForPlayMode() {
        for (let r = 0; r < this.grid.length; r++) {
            for (let c = 0; c < this.grid[0].length; c++) {
                if (this.grid[r][c] !== '#') {
                    this.grid[r][c] = '';
                }
            }
        }

        this.gridManager.syncGridToDOM(this.grid, this.slots);
    }

    /* ===============================
       EDITOR GRID INTERACTION
    =============================== */

    handleMouseDown(_event, r, c) {
        if (this.modes.isPlayMode) return;
        if (this.modes.currentMode !== 'drag') return;
        if (!this._isInBounds(r, c)) return;

        this.abortActiveSolve();

        this.isDragging = true;
        this.dragPaintValue = this.grid[r][c] === '#' ? '' : '#';

        this.paintCell(r, c, this.dragPaintValue);
    }

    handleMouseOver(_event, r, c) {
        if (!this.isDragging) return;
        if (this.modes.isPlayMode) return;
        if (this.modes.currentMode !== 'drag') return;
        if (!this._isInBounds(r, c)) return;

        this.paintCell(r, c, this.dragPaintValue);
    }

    handleMouseUp() {
        this.isDragging = false;
    }

    handleCellClick(_event, r, c) {
        if (this.isSolving) this.abortActiveSolve();
        if (this.modes.isPlayMode) return;
        if (!this._isInBounds(r, c)) return;

        const mode = this.modes.currentMode;

        if (mode === 'letter') {
            this.handleLetterEntry(r, c);
            return;
        }

        if (mode === 'drag') {
            return;
        }

        this.paintCell(r, c, this.grid[r][c] === '#' ? '' : '#');
    }

    handleLetterEntry(r, c) {
        if (this.grid[r][c] === '#') return;

        const input = window.prompt('Enter a letter:');
        if (input === null) return;

        const letter = input.trim().toUpperCase().charAt(0);

        if (!letter) {
            this.grid[r][c] = '';
        } else if (/^[A-Z]$/.test(letter)) {
            this.grid[r][c] = letter;
        } else {
            this.display.updateStatus('Please enter a single letter A-Z.', true);
            return;
        }

        this.rebuildGridState();
        this.gridManager.syncGridToDOM(this.grid, this.slots);
        this.refreshWordList();
        this.currentSolution = null;
    }

    paintCell(r, c, value) {
        if (!this._isInBounds(r, c)) return;

        const nextValue = value === '#' ? '#' : '';

        this.grid[r][c] = nextValue;

        if (this.modes.isSymmetryEnabled) {
            const mirrorR = this.grid.length - 1 - r;
            const mirrorC = this.grid[0].length - 1 - c;
            this.grid[mirrorR][mirrorC] = nextValue;
        }

        this.rebuildGridState();
        this.gridManager.syncGridToDOM(this.grid, this.slots);
        this.refreshWordList();
        this.currentSolution = null;
    }

    /* ===============================
       DATA LOADING
    =============================== */

    generateNewGrid(rows, cols) {
        this.grid = Array.from({ length: rows }, () => Array(cols).fill(''));
        this.currentSolution = null;
        this.render();
        this.display.updateStatus(`Generated ${rows}×${cols} grid.`, true);
    }

    loadPredefinedPuzzle(name) {
        const puzzle = predefinedPuzzles.find(p => p.name === name);
        if (!puzzle) return;

        this.grid = JSON.parse(JSON.stringify(puzzle.grid)).map(row =>
            row.map(cell => (cell === ' ' ? '' : cell))
        );

        this.currentSolution = null;
        this.render();
        this.display.updateStatus(`Loaded ${name} puzzle.`, true);
    }

    async loadRandomPuzzle() {
        if (!this.puzzleIndex.length) {
            this.display.updateStatus('Puzzle index is empty or still loading.', true);
            return;
        }

        const randomEntry = this.puzzleIndex[Math.floor(Math.random() * this.puzzleIndex.length)];
        this.display.updateStatus(`Loading ${randomEntry.title || randomEntry.id}...`, true);

        try {
            const resp = await fetch(`data/nyt_puzzles/${randomEntry.file}`);
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }

            const puzzleData = await resp.json();
            this.importXdGrid(puzzleData.grid);

            this.display.updateStatus(
                `Loaded ${randomEntry.title} (${randomEntry.author}, ${randomEntry.date}).`,
                true
            );
        } catch (error) {
            console.error(error);
            this.display.updateStatus('Failed to load puzzle data.', true);
        }
    }

    importXdGrid(gridStrings) {
        if (!Array.isArray(gridStrings) || !gridStrings.length) return;

        this.grid = gridStrings.map(row =>
            [...row].map(char => {
                if (char === '.') return '#';
                if (/^[A-Z]$/i.test(char)) return char.toUpperCase();
                return '';
            })
        );

        this.currentSolution = null;
        this.render();
    }

    /* ===============================
       RENDER / REFRESH
    =============================== */

    rebuildGridState() {
        const { slots } = this.constraintManager.buildDataStructures(this.grid);
        this.slots = slots;
    }

    render() {
        const container = document.getElementById('grid-container');
        if (!container) return;

        this.rebuildGridState();
        this.gridManager.render(this.grid, container, this);
        this.refreshWordList();
    }

    refreshWordList() {
        const wordClickHandler = (slot) => {
            if (this.modes.isPlayMode) {
                const [r, c] = slot.positions[0];
                this.gridManager.selectedCell = { r, c };
                this.gridManager.selectedDirection = slot.direction;
                this.gridManager._updateHighlights(this);
                return;
            }

            const word = this.currentSolution?.[slot.id] || this._extractSlotWord(slot);
            this.popups.show(word);
        };

        this.display.updateWordLists(
            this.slots,
            this.currentSolution || {},
            wordClickHandler,
            this.definitions,
            this.modes.isPlayMode
        );
    }

    _extractSlotWord(slot) {
        return slot.positions
            .map(([r, c]) => {
                const val = this.grid[r][c];
                return /^[A-Z]$/i.test(val) ? val.toUpperCase() : '';
            })
            .join('');
    }

    /* ===============================
       SOLVER
    =============================== */

    async handleSolve() {
        if (this.isSolving) {
            this.abortActiveSolve();
        }

        const solveBtn = document.getElementById('solve-crossword-button');
        const cancelBtn = document.getElementById('cancel-solve-button');

        this.isSolving = true;
        if (solveBtn) solveBtn.disabled = true;
        if (cancelBtn) cancelBtn.classList.remove('hidden');

        try {
            this.display.updateStatus('Analyzing grid constraints...');

            const start = performance.now();

            const { slots, cellContents } = this.constraintManager.buildDataStructures(this.grid);
            this.slots = slots;

            const uniqueLengths = [...new Set(Object.values(this.slots).map(slot => slot.length))];
            for (const len of uniqueLengths) {
                if (!this.wordLengthCache[len]) {
                    this.wordLengthCache[len] = await this.wordProvider.getWordsOfLength(len);
                }
            }

            this.letterFrequencies = GridUtils.calculateLetterFrequencies(this.wordLengthCache);
            const domains = this.constraintManager.setupDomains(
                this.slots,
                this.wordLengthCache,
                this.grid
            );

            const allowReuse =
                document.getElementById('allow-reuse-toggle')?.checked || false;
            const visualize =
                document.getElementById('visualize-solve-toggle')?.checked || false;

            this.display.updateStatus(visualize ? 'Solving visually...' : 'Solving...', true);

            const result = await new Promise((resolve, reject) => {
                this.activeWorker = new Worker('./solver/SolverWorker.js', { type: 'module' });
                let lastVisualUpdate = performance.now();

                this.activeWorker.onmessage = (e) => {
                    const { type, payload } = e.data;

                    if (type === 'UPDATE') {
                        const now = performance.now();
                        if (now - lastVisualUpdate < 32) return;
                        lastVisualUpdate = now;

                        const { slotId, word } = payload;
                        const slot = this.slots[slotId];
                        if (!slot) return;

                        requestAnimationFrame(() => {
                            slot.positions.forEach(([r, c], i) => {
                                const td = this.cells[`${r},${c}`];
                                if (!td) return;

                                const span = td.querySelector('.cell-letter');
                                if (span) span.textContent = word?.[i] || '';

                                td.classList.add('solving-active');
                                window.setTimeout(() => {
                                    td.classList.remove('solving-active');
                                }, 120);
                            });
                        });
                    }

                    if (type === 'RESULT') {
                        resolve(payload);
                    }

                    if (type === 'ERROR') {
                        reject(new Error(payload));
                    }
                };

                this.activeWorker.onerror = (err) => reject(err);

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
                this.applySolutionToGrid(this.slots, result.solution);

                this.display.updateStatus(
                    `Solved in ${((end - start) / 1000).toFixed(2)}s!`,
                    true
                );

                this.refreshWordList();
            } else {
                this.display.updateStatus('No solution found.', true);
                this.gridManager.syncGridToDOM(this.grid, this.slots);
            }
        } catch (error) {
            if (this.isSolving) {
                console.error(error);
                this.display.updateStatus(`Solver error: ${error.message}`, true);
            }
        } finally {
            this.abortActiveSolve();
        }
    }

    applySolutionToGrid(slots, solution) {
        for (const slotId in solution) {
            const word = solution[slotId];
            const slot = slots[slotId];
            if (!slot) continue;

            slot.positions.forEach(([r, c], i) => {
                this.grid[r][c] = word?.[i] || '';
            });
        }

        this.gridManager.syncGridToDOM(this.grid, slots);
    }

    /* ===============================
       PLAY TOOLS
    =============================== */

    handleCheckSquare() {
        if (!this.modes.isPlayMode || !this.currentSolution) return;

        const selected = this.gridManager.selectedCell;
        if (!selected) return;

        const { r, c } = selected;
        const expected = this._getSolutionLetterAt(r, c);
        const actual = (this.grid[r][c] || '').toUpperCase();

        const td = this.cells[`${r},${c}`];
        if (!td || this.grid[r][c] === '#') return;

        td.classList.remove('correct', 'incorrect');
        td.classList.add(actual && actual === expected ? 'correct' : 'incorrect');
    }

    handleCheckWord() {
        if (!this.modes.isPlayMode || !this.currentSolution) return;

        const slot = this.gridManager._getActiveSlot(this);
        if (!slot) return;

        slot.positions.forEach(([r, c]) => {
            const expected = this._getSolutionLetterAt(r, c);
            const actual = (this.grid[r][c] || '').toUpperCase();
            const td = this.cells[`${r},${c}`];
            if (!td) return;

            td.classList.remove('correct', 'incorrect');
            td.classList.add(actual && actual === expected ? 'correct' : 'incorrect');
        });
    }

    handleCheckPuzzle() {
        if (!this.modes.isPlayMode || !this.currentSolution) return;

        Object.values(this.slots).forEach(slot => {
            slot.positions.forEach(([r, c]) => {
                const expected = this._getSolutionLetterAt(r, c);
                const actual = (this.grid[r][c] || '').toUpperCase();
                const td = this.cells[`${r},${c}`];
                if (!td) return;

                td.classList.remove('correct', 'incorrect');
                td.classList.add(actual && actual === expected ? 'correct' : 'incorrect');
            });
        });
    }

    handleRevealSquare() {
        if (!this.modes.isPlayMode || !this.currentSolution) return;

        const selected = this.gridManager.selectedCell;
        if (!selected) return;

        const { r, c } = selected;
        const expected = this._getSolutionLetterAt(r, c);
        if (!expected) return;

        this.grid[r][c] = expected;
        this.gridManager.syncGridToDOM(this.grid, this.slots);
        this.gridManager._updateHighlights(this);
    }

    handleRevealWord() {
        if (!this.modes.isPlayMode || !this.currentSolution) return;

        const slot = this.gridManager._getActiveSlot(this);
        if (!slot) return;

        slot.positions.forEach(([r, c]) => {
            const expected = this._getSolutionLetterAt(r, c);
            if (expected) this.grid[r][c] = expected;
        });

        this.gridManager.syncGridToDOM(this.grid, this.slots);
        this.gridManager._updateHighlights(this);
    }

    handleRevealPuzzle() {
        if (!this.modes.isPlayMode || !this.currentSolution) return;

        this.applySolutionToGrid(this.slots, this.currentSolution);
        this.gridManager._updateHighlights(this);
    }

    handleClearPlayGrid() {
        if (!this.modes.isPlayMode) return;

        for (let r = 0; r < this.grid.length; r++) {
            for (let c = 0; c < this.grid[0].length; c++) {
                if (this.grid[r][c] !== '#') {
                    this.grid[r][c] = '';
                }
            }
        }

        Object.values(this.cells).forEach(td => {
            td.classList.remove('correct', 'incorrect');
        });

        this.gridManager.syncGridToDOM(this.grid, this.slots);
        this.gridManager._updateHighlights(this);
    }

    _getSolutionLetterAt(r, c) {
        for (const slotId in this.currentSolution) {
            const slot = this.slots[slotId];
            if (!slot) continue;

            const index = slot.positions.findIndex(([rr, cc]) => rr === r && cc === c);
            if (index !== -1) {
                const letter = this.currentSolution[slotId]?.[index] || '';
                return /^[A-Z]$/i.test(letter) ? letter.toUpperCase() : '';
            }
        }

        return '';
    }

    /* ===============================
       SEARCH
    =============================== */

    async handleSearch(value) {
        const query = value.trim().toUpperCase();
        const safeQuery = query.replace(/[^A-Z?]/g, '');

        if (!safeQuery || safeQuery.length < 2) {
            this.display.updateSearchResults([], () => {});
            return;
        }

        try {
            const words = await this.wordProvider.getWordsOfLength(safeQuery.length);
            const regex = new RegExp(`^${safeQuery.replace(/\?/g, '.')}$`);
            const matches = words.filter(word => regex.test(word)).slice(0, 50);

            this.display.updateSearchResults(matches, (selected) => {
                this.popups.show(selected);
            });
        } catch (error) {
            console.warn('Search failed', error);
            this.display.updateStatus('Word search failed.', true);
        }
    }

    /* ===============================
       HELPERS
    =============================== */

    _isInBounds(r, c) {
        return (
            r >= 0 &&
            c >= 0 &&
            r < this.grid.length &&
            c < this.grid[0].length
        );
    }
}