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
import { GridUtils } from './utils/GridUtils.js';

const PUZZLES_BASE_PATH = 'data/puzzles';

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
        this.editorGridSnapshot = null;
        this.currentPuzzleClues = {};
        this.puzzleIndex = [];
        this.missingPuzzleFiles = new Set();

        this._globalMouseUpBound = false;
        this._searchInputBound = false;
        this._searchRequestId = 0;

        this.activeSolveSession = null;
        this._solveRunId = 0;

        this.isPlayPaused = false;
        this.playElapsedMs = 0;
        this.playTimerStartedAt = null;
        this.playTimerInterval = null;
    }

    /* ===============================
       INIT
    =============================== */

    async init() {
        this.setupEventListeners();

        try {
            const resp = await fetch(`${PUZZLES_BASE_PATH}/puzzle_index.json`);
            if (resp.ok) {
                this.puzzleIndex = await resp.json();
                this.display.updateStatus(
                    `Loaded ${this.puzzleIndex.length} bundled puzzles to index.`
                );
            }
        } catch (error) {
            console.warn(
                'Could not load puzzle_index.json. Random puzzle feature disabled.',
                error
            );
        }

        this._updateRandomPuzzleButton();
        this._updateTimerDisplay();
        this._updatePauseUI();

        await this.loadPredefinedPuzzle('Easy');
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
            void this.loadPredefinedPuzzle('Easy');
        });

        this._bindClick('load-medium-button', () => {
            this.abortActiveSolve();
            void this.loadPredefinedPuzzle('Medium');
        });

        this._bindClick('load-hard-button', () => {
            this.abortActiveSolve();
            void this.loadPredefinedPuzzle('Hard');
        });

        this._bindClick('random-puzzle-button', () => {
            this.abortActiveSolve();
            void this.loadRandomPuzzle();
        });

        this._bindClick('drag-mode-button', () => {
            this.modes.setMode('drag');
            this.display.updateStatus('Drag mode enabled.', true);
        });

        this._bindClick('letter-mode-button', () => {
            this.modes.setMode('letter');
            this.display.updateStatus('Letter mode enabled.', true);
        });

        this._bindClick('symmetry-button', () => {
            this.modes.toggleSymmetry();
            this.display.updateStatus(
                `Symmetry ${this.modes.isSymmetryEnabled ? 'enabled' : 'disabled'}.`,
                true
            );
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
        if (searchInput && !this._searchInputBound) {
            searchInput.addEventListener('input', () => {
                this.handleSearch(searchInput.value);
            });
            this._searchInputBound = true;
        }

        this._bindClick('check-square-btn', () => this.handleCheckSquare());
        this._bindClick('check-word-btn', () => this.handleCheckWord());
        this._bindClick('check-puzzle-btn', () => this.handleCheckPuzzle());

        this._bindClick('reveal-square-btn', () => this.handleRevealSquare());
        this._bindClick('reveal-word-btn', () => this.handleRevealWord());
        this._bindClick('reveal-puzzle-btn', () => this.handleRevealPuzzle());

        this._bindClick('clear-btn', () => this.handleClearPlayGrid());
        this._bindClick('pause-btn', () => this.togglePlayPause());

        if (!this._globalMouseUpBound) {
            window.addEventListener('mouseup', () => this.handleMouseUp());
            this._globalMouseUpBound = true;
        }
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
        const session = this.activeSolveSession;

        if (session && !session.settled) {
            session.settled = true;
            session.reject(new Error('SOLVE_CANCELLED'));
        }

        if (this.activeWorker) {
            this.activeWorker.terminate();
            this.activeWorker = null;
        }

        const wasSolving = this.isSolving || Boolean(session);
        this.activeSolveSession = null;
        this._updateSolveControls(false);

        if (wasSolving && isManualCancel) {
            this.display.updateStatus('Solve operation cancelled by user.', true);
            this.syncActiveGridToDOM();
        }
    }

    /* ===============================
       PLAY MODE TRANSITIONS
    =============================== */

    enterPlayMode() {
        if (this.isSolving) {
            this.abortActiveSolve();
        }

        if (!this.currentSolution) {
            const extractedSolution = this.extractSolutionFromGrid({ requireComplete: true });
            if (!extractedSolution) {
                this.display.updateStatus(
                    'Play mode requires a fully solved grid or imported puzzle.',
                    true
                );
                return false;
            }

            this.currentSolution = extractedSolution;
        }

        this.editorGridSnapshot = GridUtils.cloneGrid(this.grid);
        this.isPlayPaused = false;

        this.modes.setPlayMode(true);
        this.blankGridForPlayMode();
        this.render();
        this.refreshWordList();
        this._resetPlayTimer();
        this._resumePlayTimer();
        this._updatePauseUI();

        const firstSlot = this._getFirstSlot();
        if (firstSlot) {
            const [r, c] = firstSlot.positions[0];
            this.gridManager.selectedCell = { r, c };
            this.gridManager.selectedDirection = firstSlot.direction;
            this.gridManager._updateHighlights(this);
        }

        this.display.updateStatus('Entered play mode. Good luck!', true);
        return true;
    }

    exitPlayMode() {
        if (this.isSolving) {
            this.abortActiveSolve();
        }

        this._pausePlayTimer();
        this._resetPlayTimer();
        this.isPlayPaused = false;
        this.modes.setPlayMode(false);

        if (this.editorGridSnapshot?.length) {
            this.grid = GridUtils.cloneGrid(this.editorGridSnapshot);
        }

        this.editorGridSnapshot = null;
        this.render();
        this.refreshWordList();
        this._updatePauseUI();
        this.display.updateStatus('Returned to editor mode.', true);
    }

    extractSolutionFromGrid({ requireComplete = false } = {}) {
        const solution = {};

        for (const slotId in this.slots) {
            const slot = this.slots[slotId];
            let word = '';

            slot.positions.forEach(([r, c]) => {
                const val = this.grid[r][c];
                if (/^[A-Z]$/i.test(val)) {
                    word += val.toUpperCase();
                    return;
                }

                if (requireComplete) {
                    word = '';
                    return;
                }
            });

            if (requireComplete && word.length !== slot.length) {
                return null;
            }

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
        if (this.isSolving) {
            this.abortActiveSolve();
        }

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
        this.syncActiveGridToDOM();
        this.refreshWordList();
        this.currentSolution = null;
        this.currentPuzzleClues = {};
    }

    paintCell(r, c, value) {
        if (!this._isInBounds(r, c)) return;

        const nextValue = value === '#' ? '#' : '';

        if (this.grid[r][c] === nextValue) return;

        this.grid[r][c] = nextValue;

        if (this.modes.isSymmetryEnabled) {
            const mirrorR = this.grid.length - 1 - r;
            const mirrorC = this.grid[0].length - 1 - c;
            this.grid[mirrorR][mirrorC] = nextValue;
        }

        this.rebuildGridState();
        this.syncActiveGridToDOM();
        this.refreshWordList();
        this.currentSolution = null;
        this.currentPuzzleClues = {};
    }

    /* ===============================
       DATA LOADING
    =============================== */

    generateNewGrid(rows, cols) {
        this.grid = Array.from({ length: rows }, () => Array(cols).fill(''));
        this.currentSolution = null;
        this.currentPuzzleClues = {};
        this.editorGridSnapshot = null;
        this.render();
        this.display.updateStatus(`Generated ${rows}×${cols} grid.`, true);
    }

    async loadPredefinedPuzzle(name) {
        const file = `${name.toLowerCase()}.json`;

        try {
            const puzzleData = await this._fetchPuzzleFile(file);
            this.importPuzzleGrid(puzzleData.grid);
            this.currentPuzzleClues = this._extractPuzzleClues(puzzleData);
            this.currentSolution = null;
            this.display.updateStatus(`Loaded ${name} puzzle.`, true);
        } catch (error) {
            console.error(error);
            this.display.updateStatus(`Could not load "${name}" puzzle.`, true);
        }
    }

    async loadRandomPuzzle() {
        if (!this.puzzleIndex.length) {
            this.display.updateStatus('Puzzle index is empty or still loading.', true);
            return;
        }

        const candidateEntries = this.puzzleIndex.filter(
            (entry) => !this.missingPuzzleFiles.has(entry.file)
        );

        if (!candidateEntries.length) {
            this._updateRandomPuzzleButton(
                true,
                'Bundled puzzle files are unavailable.'
            );
            this.display.updateStatus(
                'Random Puzzle is unavailable because the puzzle files are missing from this repository snapshot.',
                true
            );
            return;
        }

        const shuffledCandidates = [...candidateEntries]
            .sort(() => Math.random() - 0.5)
            .slice(0, 8);

        for (const randomEntry of shuffledCandidates) {
            this.display.updateStatus(
                `Loading ${randomEntry.title || randomEntry.id}...`,
                true
            );

            try {
                const puzzleData = await this._fetchPuzzleFile(randomEntry.file);
                this.importPuzzleGrid(puzzleData.grid);
                this.currentPuzzleClues = this._extractPuzzleClues(puzzleData);
                this.currentSolution = this.extractSolutionFromGrid({ requireComplete: true });
                this._updateRandomPuzzleButton(false);

                const authoredClueCount = Object.keys(this.currentPuzzleClues).length;
                const clueSuffix = authoredClueCount
                    ? ` Loaded ${authoredClueCount} authored clues.`
                    : ' No authored clues were included, so clue lookup will fall back to the local database.';
                const details = [randomEntry.author, randomEntry.date]
                    .filter(Boolean)
                    .join(', ');
                const detailSuffix = details ? ` (${details})` : '';

                this.display.updateStatus(
                    `Loaded ${randomEntry.title}${detailSuffix}.${clueSuffix}`,
                    true
                );
                return;
            } catch (error) {
                console.error(error);
                if (/404/.test(String(error?.message))) {
                    this.missingPuzzleFiles.add(randomEntry.file);
                }
            }
        }

        this._updateRandomPuzzleButton(
            true,
            'Bundled puzzle files are unavailable.'
        );
        this.display.updateStatus(
            'Random Puzzle is unavailable because the referenced puzzle files could not be loaded.',
            true
        );
    }

    importPuzzleGrid(rawGrid) {
        if (!Array.isArray(rawGrid) || !rawGrid.length) return;

        this.grid = rawGrid.map((row) => {
            const cells = Array.isArray(row) ? row : [...String(row)];
            return cells.map((cell) => {
                if (cell === ' ') return '';
                if (cell === '.') return '#';
                if (/^[A-Z]$/i.test(cell)) return cell.toUpperCase();
                if (cell === '#') return '#';
                return '';
            });
        });

        this.currentPuzzleClues = {};
        this.currentSolution = null;
        this.editorGridSnapshot = null;
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
        if (!this.grid.length || !this.grid[0]?.length) return;

        this.rebuildGridState();

        const container = this._getActiveGridContainer();
        if (!container) return;

        this.gridManager.render(this.grid, container, this);
        this.cells = this.gridManager.cells;

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
            (slot) => {
                if (this.modes.isPlayMode && this.isPlayPaused) {
                    return;
                }

                wordClickHandler(slot);
            },
            this.definitions,
            this.modes.isPlayMode,
            this.currentPuzzleClues
        );
    }

    syncActiveGridToDOM() {
        const container = this._getActiveGridContainer();
        if (!container) return;

        if (container !== this.gridManager.container) {
            this.render();
            return;
        }

        this.gridManager.syncGridToDOM(this.grid, this.slots);
        this.cells = this.gridManager.cells;

        if (this.modes.isPlayMode) {
            this.gridManager._updateHighlights(this);
        }
    }

    _extractSlotWord(slot) {
        return slot.positions
            .map(([r, c]) => {
                const val = this.grid[r][c];
                return /^[A-Z]$/i.test(val) ? val.toUpperCase() : '';
            })
            .join('');
    }

    _getActiveGridContainer() {
        if (this.modes.isPlayMode) {
            return document.getElementById('play-grid-container');
        }
        return document.getElementById('grid-container');
    }

    _getFirstSlot() {
        const allSlots = Object.values(this.slots || {});
        if (!allSlots.length) return null;

        const acrossFirst = allSlots
            .filter((slot) => slot.direction === 'across')
            .sort((a, b) => a.number - b.number)[0];

        return acrossFirst || allSlots.sort((a, b) => a.number - b.number)[0] || null;
    }

    /* ===============================
       SOLVER
    =============================== */

    async handleSolve() {
        if (this.isSolving) {
            this.abortActiveSolve();
        }

        const runId = ++this._solveRunId;
        this.isSolving = true;
        this._updateSolveControls(true);

        try {
            this.display.updateStatus('Analyzing grid constraints...');

            const start = performance.now();

            const { slots, cellContents } =
                this.constraintManager.buildDataStructures(this.grid);
            this.slots = slots;

            const uniqueLengths = [
                ...new Set(Object.values(this.slots).map((slot) => slot.length))
            ];

            for (const len of uniqueLengths) {
                if (!this.wordLengthCache[len]) {
                    this.wordLengthCache[len] =
                        await this.wordProvider.getWordsOfLength(len);
                }
            }

            this.letterFrequencies =
                GridUtils.calculateLetterFrequencies(this.wordLengthCache);

            const domains = this.constraintManager.setupDomains(
                this.slots,
                this.wordLengthCache,
                this.grid
            );

            const allowReuse =
                document.getElementById('allow-reuse-toggle')?.checked || false;
            const visualize =
                document.getElementById('visualize-solve-toggle')?.checked || false;

            this.display.updateStatus(
                visualize ? 'Solving visually...' : 'Solving...',
                true
            );

            const session = {
                settled: false,
                reject: () => { },
                worker: null
            };

            const result = await new Promise((resolve, reject) => {
                session.reject = reject;
                session.worker = new Worker('./solver/SolverWorker.js', {
                    type: 'module'
                });
                this.activeWorker = session.worker;
                this.activeSolveSession = session;

                let lastVisualUpdate = performance.now();
                const settle = (callback, value) => {
                    if (session.settled) return;
                    session.settled = true;
                    if (session.worker) {
                        session.worker.terminate();
                        session.worker = null;
                    }
                    if (this.activeSolveSession === session) {
                        this.activeSolveSession = null;
                    }
                    callback(value);
                };

                session.worker.onmessage = (e) => {
                    const { type, payload } = e.data;

                    if (session.settled) return;

                    if (type === 'UPDATE') {
                        if (!visualize) return;

                        const now = performance.now();
                        if (now - lastVisualUpdate < 32) return;
                        lastVisualUpdate = now;

                        const { slotId, word } = payload;
                        const slot = this.slots[slotId];
                        if (!slot) return;

                        requestAnimationFrame(() => {
                            slot.positions.forEach(([r, c], i) => {
                                const td = this.gridManager.cells[`${r},${c}`];
                                if (!td) return;

                                let span = td.querySelector('.cell-letter');
                                if (!span) {
                                    span = document.createElement('span');
                                    span.className = 'cell-letter';
                                    td.appendChild(span);
                                }

                                span.textContent = word?.[i] || '';

                                td.classList.add('solving-active');
                                window.setTimeout(() => {
                                    td.classList.remove('solving-active');
                                }, 120);
                            });
                        });

                        return;
                    }

                    if (type === 'RESULT') {
                        settle(resolve, payload);
                        return;
                    }

                    if (type === 'ERROR') {
                        settle(reject, new Error(payload));
                    }
                };

                session.worker.onerror = (err) => settle(reject, err);

                session.worker.postMessage({
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

            if (runId !== this._solveRunId) {
                return;
            }

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
                this.syncActiveGridToDOM();
            }
        } catch (error) {
            if (runId !== this._solveRunId) {
                return;
            }

            if (error?.message === 'SOLVE_CANCELLED') {
                return;
            }

            if (this.isSolving) {
                console.error(error);
                this.display.updateStatus(`Solver error: ${error.message}`, true);
            }
        } finally {
            if (runId === this._solveRunId) {
                this.activeWorker = null;
                this.activeSolveSession = null;
                this._updateSolveControls(false);
            }
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

        this.syncActiveGridToDOM();
    }

    /* ===============================
       PLAY TOOLS
    =============================== */

    handleCheckSquare() {
        if (!this._canUsePlayTools()) return;

        const selected = this.gridManager.selectedCell;
        if (!selected) return;

        const { r, c } = selected;
        if (this.grid[r][c] === '#') return;

        const expected = this._getSolutionLetterAt(r, c);
        const actual = (this.grid[r][c] || '').toUpperCase();

        const td = this.gridManager.cells[`${r},${c}`];
        if (!td) return;

        this._applyCheckState(td, actual, expected);
    }

    handleCheckWord() {
        if (!this._canUsePlayTools()) return;

        const slot = this.gridManager._getActiveSlot(this);
        if (!slot) return;

        slot.positions.forEach(([r, c]) => {
            const expected = this._getSolutionLetterAt(r, c);
            const actual = (this.grid[r][c] || '').toUpperCase();
            const td = this.gridManager.cells[`${r},${c}`];
            if (!td) return;

            this._applyCheckState(td, actual, expected);
        });
    }

    handleCheckPuzzle() {
        if (!this._canUsePlayTools()) return;

        Object.values(this.slots).forEach((slot) => {
            slot.positions.forEach(([r, c]) => {
                const expected = this._getSolutionLetterAt(r, c);
                const actual = (this.grid[r][c] || '').toUpperCase();
                const td = this.gridManager.cells[`${r},${c}`];
                if (!td) return;

                this._applyCheckState(td, actual, expected);
            });
        });
    }

    handleRevealSquare() {
        if (!this._canUsePlayTools()) return;

        const selected = this.gridManager.selectedCell;
        if (!selected) return;

        const { r, c } = selected;
        const expected = this._getSolutionLetterAt(r, c);
        if (!expected) return;

        this.grid[r][c] = expected;
        this.syncActiveGridToDOM();
    }

    handleRevealWord() {
        if (!this._canUsePlayTools()) return;

        const slot = this.gridManager._getActiveSlot(this);
        if (!slot) return;

        slot.positions.forEach(([r, c]) => {
            const expected = this._getSolutionLetterAt(r, c);
            if (expected) {
                this.grid[r][c] = expected;
            }
        });

        this.syncActiveGridToDOM();
    }

    handleRevealPuzzle() {
        if (!this._canUsePlayTools()) return;

        this.applySolutionToGrid(this.slots, this.currentSolution);
        this.gridManager._updateHighlights(this);
    }

    handleClearPlayGrid() {
        if (!this.modes.isPlayMode || this.isPlayPaused) return;

        for (let r = 0; r < this.grid.length; r++) {
            for (let c = 0; c < this.grid[0].length; c++) {
                if (this.grid[r][c] !== '#') {
                    this.grid[r][c] = '';
                }
            }
        }

        Object.values(this.gridManager.cells).forEach((td) => {
            td.classList.remove('correct', 'incorrect');
        });

        this.syncActiveGridToDOM();
    }

    _getSolutionLetterAt(r, c) {
        for (const slotId in this.currentSolution) {
            const slot = this.slots[slotId];
            if (!slot) continue;

            const index = slot.positions.findIndex(
                ([rr, cc]) => rr === r && cc === c
            );

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
        const requestId = ++this._searchRequestId;
        const query = value.trim().toUpperCase();
        const safeQuery = query.replace(/[^A-Z?]/g, '');

        if (!safeQuery || safeQuery.length < 2) {
            this.display.updateSearchResults([], () => { });
            return;
        }

        try {
            const words = await this.wordProvider.getWordsOfLength(safeQuery.length);
            if (requestId !== this._searchRequestId) return;

            const regex = new RegExp(`^${safeQuery.replace(/\?/g, '.')}$`);
            const matches = words.filter((word) => regex.test(word)).slice(0, 50);

            if (requestId !== this._searchRequestId) return;
            this.display.updateSearchResults(matches, (selected) => {
                this.popups.show(selected);
            });
        } catch (error) {
            if (requestId !== this._searchRequestId) return;
            console.warn('Search failed', error);
            this.display.updateStatus('Word search failed.', true);
        }
    }

    togglePlayPause() {
        if (!this.modes.isPlayMode) return;

        this.isPlayPaused = !this.isPlayPaused;

        if (this.isPlayPaused) {
            this._pausePlayTimer();
            this.display.updateStatus('Game paused.', true);
        } else {
            this._resumePlayTimer();
            this.display.updateStatus('Game resumed.', true);
        }

        this._updatePauseUI();
    }

    _applyCheckState(td, actual, expected) {
        if (!td) return;

        td.classList.remove('correct', 'incorrect');
        if (!actual) return;

        td.classList.add(actual === expected ? 'correct' : 'incorrect');
    }

    _canUsePlayTools() {
        return this.modes.isPlayMode && this.currentSolution && !this.isPlayPaused;
    }

    _updateSolveControls(isSolving) {
        this.isSolving = isSolving;

        const solveBtn = document.getElementById('solve-crossword-button');
        const cancelBtn = document.getElementById('cancel-solve-button');

        if (solveBtn) solveBtn.disabled = isSolving;
        if (cancelBtn) cancelBtn.classList.toggle('hidden', !isSolving);
    }

    _updateRandomPuzzleButton(disabled = false, reason = '') {
        const randomBtn = document.getElementById('random-puzzle-button');
        if (!randomBtn) return;

        const shouldDisable = disabled || this.puzzleIndex.length === 0;
        randomBtn.disabled = shouldDisable;
        randomBtn.title = shouldDisable
            ? reason || 'Bundled puzzle files are unavailable.'
            : 'Load a random bundled puzzle';
    }

    _extractPuzzleClues(puzzleData) {
        const acrossSlots = Object.values(this.slots || {})
            .filter((slot) => slot.direction === 'across')
            .sort((a, b) => a.number - b.number);
        const downSlots = Object.values(this.slots || {})
            .filter((slot) => slot.direction === 'down')
            .sort((a, b) => a.number - b.number);

        return {
            ...this._mapDirectionalClues(
                puzzleData?.clues?.across ?? puzzleData?.across,
                acrossSlots,
                'across'
            ),
            ...this._mapDirectionalClues(
                puzzleData?.clues?.down ?? puzzleData?.down,
                downSlots,
                'down'
            )
        };
    }

    _mapDirectionalClues(rawClues, slots, direction) {
        const mapped = {};

        if (!rawClues) return mapped;

        if (Array.isArray(rawClues)) {
            rawClues.forEach((entry, index) => {
                const normalized = this._normalizePuzzleClueEntry(entry, direction);
                if (!normalized?.clue) return;

                if (normalized.slotId) {
                    mapped[normalized.slotId] = normalized.clue;
                    return;
                }

                const slot = slots[index];
                if (slot) {
                    mapped[slot.id] = normalized.clue;
                }
            });

            return mapped;
        }

        if (typeof rawClues === 'object') {
            Object.entries(rawClues).forEach(([key, value]) => {
                const clue = this._extractClueText(value);
                const match = String(key).match(/\d+/);
                if (!clue || !match) return;

                const slot = slots.find((candidate) => candidate.number === Number(match[0]));
                if (slot) {
                    mapped[slot.id] = clue;
                }
            });
        }

        return mapped;
    }

    _normalizePuzzleClueEntry(entry, direction) {
        if (typeof entry === 'string') {
            const trimmed = entry.trim();
            if (!trimmed) return null;

            const numberedMatch = trimmed.match(/^\s*(\d+)[\.\): -]+\s*(.+)$/);
            if (numberedMatch) {
                return {
                    slotId: `${numberedMatch[1]}-${direction}`,
                    clue: numberedMatch[2].trim()
                };
            }

            return { slotId: '', clue: trimmed };
        }

        if (!entry || typeof entry !== 'object') return null;

        const clue = this._extractClueText(entry);
        if (!clue) return null;

        const number = this._extractClueNumber(entry);
        return {
            slotId: number ? `${number}-${direction}` : '',
            clue
        };
    }

    _extractClueText(value) {
        if (typeof value === 'string') {
            return value.trim();
        }

        if (!value || typeof value !== 'object') {
            return '';
        }

        return [
            value.clue,
            value.text,
            value.label,
            value.value
        ].find((candidate) => typeof candidate === 'string' && candidate.trim())?.trim() || '';
    }

    _extractClueNumber(value) {
        const candidates = [value.number, value.num, value.id];

        for (const candidate of candidates) {
            const match = String(candidate ?? '').match(/\d+/);
            if (match) return match[0];
        }

        return '';
    }

    _pausePlayTimer() {
        if (this.playTimerStartedAt !== null) {
            this.playElapsedMs = Date.now() - this.playTimerStartedAt;
        }

        if (this.playTimerInterval) {
            window.clearInterval(this.playTimerInterval);
            this.playTimerInterval = null;
        }

        this.playTimerStartedAt = null;
        this._updateTimerDisplay();
    }

    _resumePlayTimer() {
        if (!this.modes.isPlayMode || this.isPlayPaused) return;
        if (this.playTimerInterval) return;

        this.playTimerStartedAt = Date.now() - this.playElapsedMs;
        this.playTimerInterval = window.setInterval(() => {
            this.playElapsedMs = Date.now() - this.playTimerStartedAt;
            this._updateTimerDisplay();
        }, 1000);

        this._updateTimerDisplay();
    }

    _resetPlayTimer() {
        if (this.playTimerInterval) {
            window.clearInterval(this.playTimerInterval);
            this.playTimerInterval = null;
        }

        this.playElapsedMs = 0;
        this.playTimerStartedAt = null;
        this._updateTimerDisplay();
    }

    _updateTimerDisplay() {
        const timer = document.getElementById('timer');
        if (!timer) return;

        const totalSeconds = Math.max(0, Math.floor(this.playElapsedMs / 1000));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        timer.textContent = hours > 0
            ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
            : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    _updatePauseUI() {
        const pauseBtn = document.getElementById('pause-btn');
        const overlay = document.getElementById('play-paused-overlay');
        const gridContainer = document.getElementById('play-grid-container');
        const disableWhilePaused = [
            'check-menu-btn',
            'reveal-menu-btn',
            'check-square-btn',
            'check-word-btn',
            'check-puzzle-btn',
            'reveal-square-btn',
            'reveal-word-btn',
            'reveal-puzzle-btn',
            'clear-btn'
        ];

        if (pauseBtn) {
            const isPlaying = this.modes.isPlayMode;
            pauseBtn.disabled = !isPlaying;
            pauseBtn.textContent = this.isPlayPaused ? 'Resume' : 'Pause';
            pauseBtn.setAttribute('aria-label', this.isPlayPaused ? 'Resume game' : 'Pause game');
        }

        if (overlay) {
            overlay.classList.toggle(
                'hidden',
                !(this.modes.isPlayMode && this.isPlayPaused)
            );
        }

        if (gridContainer) {
            gridContainer.classList.toggle('paused-grid', this.isPlayPaused);
        }

        disableWhilePaused.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.disabled = this.isPlayPaused || !this.modes.isPlayMode;
        });
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

    async _fetchPuzzleFile(file) {
        const resp = await fetch(`${PUZZLES_BASE_PATH}/${file}`);
        if (!resp.ok) {
            throw new Error(`Failed to fetch ${file}: HTTP ${resp.status}`);
        }

        return await resp.json();
    }
}
