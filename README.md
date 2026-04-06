# Crossworder

Crossworder is a browser-based crossword editor, solver, and play experience built as a static site. It lets you sketch grid layouts, fill fixed letters, run a CSP-style solver against bundled word lists, and then switch into a play mode with clue lookup, check/reveal tools, and a game timer. Created by Willpatpost

## What’s in the project

- `index.html`, `main.js`, and `style.css` provide the shell and app bootstrap.
- `app/` contains the application coordinator plus feature-focused modules for editor, puzzle, rendering, solver, and play behavior.
- `grid/` contains the grid rendering and interaction logic.
- `solver/` contains the constraint builder, solving engine, and web worker entrypoint.
- `providers/` loads bundled word/definition data and the fallback dictionary API.
- `ui/` manages status output, clue lists, popups, and mode UI.
- `data/words_by_length/` holds the solver’s candidate word lists.
- `data/defs_by_length/` holds local clue/definition history grouped by word length.
- `data/puzzles/` holds bundled puzzle JSON files and the puzzle index used by the random loader.
- `data/nyt_puzzles/` is currently archival source material and is not part of the active runtime puzzle flow.
- `scripts/` contains repository automation helpers, including puzzle-of-the-day generation.
- `tests/` contains the Node test suite for the core logic modules.

## Bundled puzzles

The app now ships with JSON-backed bundled puzzles in `data/puzzles/`:

- `easy.json`
- `medium.json`
- `hard.json`
- `puzzle_index.json`

Quick Load uses those files directly, and the random puzzle button picks from the same indexed set.

## Running locally

Because the app loads JSON and text assets with `fetch()`, it should be served over a local web server instead of opened directly from disk.

Examples:

```bash
python3 -m http.server
```

or

```bash
npm run dev
```

or

```bash
npx serve .
```

Then open the served URL in your browser.

## Core features

- Grid generation and manual editing
- Optional rotational symmetry while painting blocks
- Fixed-letter entry for themed or constrained fills
- Backtracking solver running in a web worker
- Word-pattern search using `?` wildcards
- Play mode with clue lists, timer, pause, check, and reveal tools
- Local clue lookup with a fallback dictionary API
- Puzzle of the day support via a generated static JSON artifact

## Architecture map

- [`main.js`](/Users/willpatpost/VSCode/GitHub/Crossworder/CrossworderTest/main.js) bootstraps the app, navigation, theme toggle, and play toolbar behavior.
- [`app/CrosswordApp.js`](/Users/willpatpost/VSCode/GitHub/Crossworder/CrossworderTest/app/CrosswordApp.js) owns shared runtime state and wires together the major subsystems.
- [`app/features/`](/Users/willpatpost/VSCode/GitHub/Crossworder/CrossworderTest/app/features) contains the main feature slices: editor input, rendering, solving, puzzles, and play mode.
- [`grid/GridManager.js`](/Users/willpatpost/VSCode/GitHub/Crossworder/CrossworderTest/grid/GridManager.js) handles grid DOM rendering, selection, keyboard entry, and highlighting.
- [`solver/`](/Users/willpatpost/VSCode/GitHub/Crossworder/CrossworderTest/solver) contains slot/constraint extraction, the CSP solver, and the browser worker entrypoint.
- [`providers/`](/Users/willpatpost/VSCode/GitHub/Crossworder/CrossworderTest/providers) loads local word and clue data and falls back to the dictionary API when needed.
- [`ui/`](/Users/willpatpost/VSCode/GitHub/Crossworder/CrossworderTest/ui) renders status logs, entry lists, clue hydration, mode UI, and popups.

## Puzzle data shape

Bundled puzzle files are JSON documents under `data/puzzles/`. At minimum, the app expects:

- `grid`: a non-empty rectangular array of rows
- Each row can be an array of cell values or a string
- Open cells can be blank/space, blocks can be `.` or `#`, and letters are normalized to uppercase

Optional fields currently used by the runtime include:

- `title`
- `author`
- `date`
- `difficulty`
- `clues.across` / `clues.down`

## Automation

- `.github/workflows/ci.yml` runs the Node test suite on pushes and pull requests.
- `.github/workflows/daily-puzzle.yml` generates `data/puzzles/puzzle-of-the-day.json` on a nightly schedule and commits it back to the repository.
- `npm run generate:potd` lets you generate the daily puzzle locally on demand.

## Notes

- The solver depends on the bundled word lists, so fill quality is only as strong as that data.
- Puzzle clues are optional in the bundled JSON format. If a puzzle file does not include clues, the app falls back to the local definitions database during play mode.
- This repository is currently light on automated tests, so manual browser verification is still important after behavior changes.
- The source tree is intentionally organized so top-level app code stays minimal, with feature logic living under `app/` and domain-specific modules staying in their own folders.
