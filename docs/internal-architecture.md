# Internal Architecture

This document describes the main runtime boundaries inside Crossworder after the Phase 7 refactor.

## App State Slices

`CrosswordApp` owns five primary state slices:

- `workspaceState`
  Holds the active grid, slot graph, cell-to-slot lookup index, solution, clue map, puzzle metadata, source metadata, and blacklist state.
- `editorState`
  Holds editor-only interaction state such as drag painting and undo/redo history.
- `solverState`
  Holds active solve session state, worker lifecycle state, and solve run bookkeeping.
- `libraryState`
  Holds bundled puzzle index data, missing file tracking, and puzzle-of-the-day data.
- `playState`
  Holds play-session timer, pause state, completion state, and instant-mistake settings.

Backward-compatible aliases like `app.grid` and `app.currentPuzzleMetadata` still point into these slices so features can be migrated incrementally.

## Feature Boundaries

- `app/features/editor.js`
  Editor-only mutation and authoring behavior.
- `app/features/puzzles.js`
  Puzzle loading, import/export parsing, clue extraction, grid validation, and play-mode solution preparation for bundled/daily content.
- `app/features/library.js`
  Local persistence, recent/completed history, dashboard state, bundled puzzle library rendering, and play-session restoration metadata.
- `app/features/solver.js`
  Solver controls, search flow, diagnostics wiring, and blacklist UI behavior.
- `app/features/play.js`
  Play interactions such as checking, revealing, navigation, and instant-mistake highlighting.
- `app/features/playSession.js`
  Play session lifecycle: pause/resume, timer updates, completion handling, and session UI state.
- `app/features/navigation.js`
  Screen/view transitions and nav button synchronization.

## UI Boundaries

- `ui/DisplayManager.js`
  Thin coordinator over specialized display presenters.
- `ui/display/StatusDisplay.js`
  Status log and live-region announcements.
- `ui/display/ClueListDisplay.js`
  Editor/play clue lists, clue hydration, and active clue panel updates.
- `ui/display/SearchResultsDisplay.js`
  Search dropdown rendering and selection behavior.
- `ui/display/PuzzleSummaryDisplay.js`
  Editor puzzle summary cards.
- `ui/ModeManager.js`
  Editor/play mode state transitions.
- `ui/ModeUiController.js`
  DOM-side mode button, symmetry, and disabled-state rendering.

## Grid and Solver Contracts

- Grids are rectangular arrays of strings.
- Fillable cells are `''` or `A-Z`.
- Blocks are stored as `'#'`.
- Imported puzzle data may use spaces or dots, but those are normalized before entering app state.
- Slot ids use the shape `<number>-<direction>`, for example `12-across`.
- `currentSolution` is a slot-id keyed object, not a cell matrix.
- `cellSlotIndex` maps `"row,col"` keys to the across/down slots that cross that cell so grid interactions do not need to rescan the full slot list on every highlight update.

## Play Session Notes

- Entering play mode may come from a pre-solved puzzle, a saved `solution`, or a just-in-time solver pass for bundled puzzle data that ships without an explicit solution payload.
- Recent puzzle restore stores both the editor workspace and the in-progress play grid/timer state. When resuming into play mode, the editor snapshot is restored first and the play session overlay is then reapplied on entry.

## Refactor Guidance

When adding new behavior:

1. Put persistent app data into the correct state slice first.
2. Keep DOM rendering inside presenters/managers instead of feature modules when practical.
3. Prefer extracting a focused collaborator over growing `CrosswordApp`, `DisplayManager`, or `ModeManager`.
4. Preserve alias compatibility until all call sites for a field have been migrated.
