# Crossworder

Crossworder is a browser-based crossword editor, solver, and play experience built as a static site. It lets you sketch grid layouts, fill fixed letters, run a CSP-style solver against bundled word lists, and then switch into a play mode with clue lookup, check/reveal tools, and a game timer.

## What’s in the project

- `index.html`, `main.js`, and `style.css` provide the shell and app bootstrap.
- `CrosswordSolver.js` coordinates puzzle loading, editor interactions, solving, and play mode.
- `grid/` contains the grid rendering and interaction logic.
- `solver/` contains the constraint builder, solving engine, and web worker entrypoint.
- `providers/` loads bundled word/definition data and the fallback dictionary API.
- `ui/` manages status output, clue lists, popups, and mode UI.
- `data/words_by_length/` holds the solver’s candidate word lists.
- `data/defs_by_length/` holds local clue/definition history grouped by word length.
- `data/puzzles/` holds bundled puzzle JSON files and the puzzle index used by the random loader.

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

## Notes

- The solver depends on the bundled word lists, so fill quality is only as strong as that data.
- Puzzle clues are optional in the bundled JSON format. If a puzzle file does not include clues, the app falls back to the local definitions database during play mode.
- This repository is currently light on automated tests, so manual browser verification is still important after behavior changes.
