import { WordListProvider } from '../providers/WordListProvider.js';
import { DefinitionsProvider } from '../providers/DefinitionsProvider.js';
import { DictionaryAPI } from '../providers/DictionaryAPI.js';
import { SolverEngine } from '../solver/SolverEngine.js';
import { ConstraintManager } from '../solver/ConstraintManager.js';
import { GridManager } from '../grid/GridManager.js';
import { DisplayManager } from '../ui/DisplayManager.js';
import { ModeManager } from '../ui/ModeManager.js';
import { PopupManager } from '../ui/PopupManager.js';
import { PUZZLES_BASE_PATH } from './constants.js';
import { editorMethods } from './features/editor.js';
import { puzzleMethods } from './features/puzzles.js';
import { renderingMethods } from './features/rendering.js';
import { solverMethods } from './features/solver.js';
import { playMethods } from './features/play.js';

export class CrosswordApp {
    constructor() {
        this.wordProvider = new WordListProvider();
        this.definitions = new DefinitionsProvider();
        this.fallbackApi = new DictionaryAPI();

        this.solver = new SolverEngine();
        this.constraintManager = new ConstraintManager();

        this.cells = {};
        this.gridManager = new GridManager(this.cells);
        this.display = new DisplayManager();
        this.modes = new ModeManager();
        this.popups = new PopupManager(this.definitions, this.fallbackApi);

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
        this.puzzleOfTheDay = null;
        this.editorHistory = [];
        this.editorFuture = [];

        this._globalMouseUpBound = false;
        this._searchInputBound = false;
        this._searchRequestId = 0;
        this._searchDebounceTimer = null;
        this._draftAutosaveTimer = null;

        this.activeSolveSession = null;
        this._solveRunId = 0;

        this.isPlayPaused = false;
        this.playElapsedMs = 0;
        this.playTimerStartedAt = null;
        this.playTimerInterval = null;
        this.hasCompletedPlayPuzzle = false;
    }

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
        this._updateUndoRedoButtons();
        this._updateDraftButtons();
        this._updateTimerDisplay();
        this._updatePauseUI();

        await this.loadPredefinedPuzzle('Easy');
        await this.loadPuzzleOfTheDaySummary();
        this.display.updateStatus('System ready.', true);
    }

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

        this._bindClick('load-daily-editor-button', () => {
            void this.handleLoadDailyPuzzle('editor');
        });

        this._bindClick('play-daily-button', () => {
            void this.handleLoadDailyPuzzle('play');
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

        this._bindClick('undo-button', () => {
            this.undoEditorChange();
        });

        this._bindClick('redo-button', () => {
            this.redoEditorChange();
        });

        this._bindClick('save-draft-button', () => {
            this.saveEditorDraft();
        });

        this._bindClick('load-draft-button', () => {
            this.loadEditorDraft();
        });

        this._bindClick('clear-draft-button', () => {
            this.clearSavedEditorDraft();
        });

        this._bindClick('clear-letters-button', () => {
            this.clearEditorLetters();
        });

        this._bindClick('clear-blocks-button', () => {
            this.clearEditorBlocks();
        });

        this._bindClick('clear-grid-button', () => {
            this.clearEditorGrid();
        });

        this._bindClick('clear-row-button', () => {
            this.clearEditorRow();
        });

        this._bindClick('clear-column-button', () => {
            this.clearEditorColumn();
        });

        this._bindClick('save-clue-button', () => {
            this.saveSelectedEditorClue();
        });

        this._bindClick('clear-clue-button', () => {
            this.clearSelectedEditorClue();
        });

        this._bindClick('export-puzzle-button', () => {
            this.exportCurrentPuzzle();
        });

        this._bindClick('import-puzzle-button', () => {
            const input = document.getElementById('import-puzzle-input');
            input?.click();
        });

        const importInput = document.getElementById('import-puzzle-input');
        if (importInput) {
            importInput.addEventListener('change', async (event) => {
                const file = event.target?.files?.[0];
                if (file) {
                    await this.importPuzzleFile(file);
                }

                importInput.value = '';
            });
        }

        this._bindClick('solve-crossword-button', () => {
            this.handleSolve();
        });

        this._bindClick('cancel-solve-button', () => {
            this.abortActiveSolve(true);
        });

        const searchInput = document.getElementById('word-search-input');
        if (searchInput && !this._searchInputBound) {
            searchInput.addEventListener('input', () => {
                if (this._searchDebounceTimer) {
                    window.clearTimeout(this._searchDebounceTimer);
                }

                this._searchDebounceTimer = window.setTimeout(() => {
                    this.handleSearch(searchInput.value);
                }, 120);
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
        this._bindClick('next-empty-btn', () => this.jumpToNextEmptyPlayCell());
        this._bindClick('pause-btn', () => this.togglePlayPause());
        this._bindClick('previous-clue-button', () => this.selectPreviousPlayClue());
        this._bindClick('next-clue-button', () => this.selectNextPlayClue());

        const clueInput = document.getElementById('editor-clue-input');
        if (clueInput) {
            clueInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    this.saveSelectedEditorClue();
                }
            });
        }

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
}

Object.assign(
    CrosswordApp.prototype,
    editorMethods,
    puzzleMethods,
    renderingMethods,
    solverMethods,
    playMethods
);
