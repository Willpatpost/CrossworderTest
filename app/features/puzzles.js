import { DAILY_PUZZLE_FILE, PUZZLES_BASE_PATH } from '../constants.js';

export const puzzleMethods = {
    async loadPredefinedPuzzle(name) {
        const file = `${name.toLowerCase()}.json`;

        try {
            const puzzleData = await this._fetchPuzzleFile(file);
            this.importPuzzleGrid(puzzleData.grid, {
                sourceLabel: `${name} puzzle`
            });
            this.currentPuzzleClues = this._extractPuzzleClues(puzzleData);
            this.currentSolution = null;
            this.display.updateStatus(`Loaded ${name} puzzle.`, true);
        } catch (error) {
            console.error(error);
            this.display.updateStatus(this._formatPuzzleLoadError(name, error), true);
        }
    },

    async loadRandomPuzzle() {
        if (!this.puzzleIndex.length) {
            this._updateRandomPuzzleButton(true, 'Puzzle index is unavailable.');
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
                this.importPuzzleGrid(puzzleData.grid, {
                    sourceLabel: randomEntry.title || randomEntry.id || randomEntry.file
                });
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
                this.display.updateStatus(
                    this._formatPuzzleLoadError(
                        randomEntry.title || randomEntry.id || randomEntry.file,
                        error
                    ),
                    true
                );
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
    },

    importPuzzleGrid(rawGrid, { sourceLabel = 'puzzle' } = {}) {
        this._recordEditorSnapshot?.();
        this._assertValidPuzzleGrid(rawGrid, sourceLabel);

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
        this.slotBlacklist = {};
        this.editorGridSnapshot = null;
        this.hasCompletedPlayPuzzle = false;
        this.render();
        this._updateUndoRedoButtons?.();
        this._updateDraftButtons?.();
        this._scheduleEditorAutosave?.();
    },

    async loadPuzzleOfTheDaySummary() {
        const summaryEl = document.getElementById('daily-puzzle-summary');
        const actionButtons = [
            document.getElementById('load-daily-editor-button'),
            document.getElementById('play-daily-button')
        ].filter(Boolean);

        actionButtons.forEach((button) => {
            button.disabled = true;
            button.title = 'Loading daily puzzle details...';
        });

        if (summaryEl) {
            summaryEl.textContent = 'Loading today’s puzzle details...';
        }

        try {
            const puzzleData = await this._fetchDailyPuzzle();
            this.puzzleOfTheDay = puzzleData;

            if (summaryEl) {
                const sourceTitle = puzzleData.title || puzzleData.sourceTitle || 'Today’s puzzle';
                const sourceDate = puzzleData.dateKey || puzzleData.generatedFor || '';
                const puzzleName = puzzleData.sourceTitle && puzzleData.sourceTitle !== sourceTitle
                    ? `${sourceTitle} from ${puzzleData.sourceTitle}`
                    : sourceTitle;
                summaryEl.textContent = sourceDate
                    ? `${puzzleName} is ready for ${sourceDate}. Load it into the editor or jump straight into play mode.`
                    : `${puzzleName} is ready to play.`;
            }

            actionButtons.forEach((button) => {
                button.disabled = false;
                button.title = 'Load the current daily puzzle';
            });
        } catch (error) {
            console.warn('Could not load puzzle of the day.', error);
            this.puzzleOfTheDay = null;

            if (summaryEl) {
                summaryEl.textContent =
                    'The daily puzzle has not been generated yet. You can still use the bundled quick-load puzzles.';
            }

            actionButtons.forEach((button) => {
                button.disabled = true;
                button.title = 'The daily puzzle is not available right now.';
            });
        }
    },

    async handleLoadDailyPuzzle(mode = 'editor') {
        try {
            const dailyPuzzle = this.puzzleOfTheDay || await this._fetchDailyPuzzle();
            this.puzzleOfTheDay = dailyPuzzle;

            this.importPuzzleGrid(dailyPuzzle.grid, {
                sourceLabel: 'daily puzzle'
            });
            this.currentPuzzleClues = dailyPuzzle.clues || {};
            this.currentSolution = mode === 'play' ? (dailyPuzzle.solution || null) : null;
            this.hasCompletedPlayPuzzle = false;

            if (mode === 'play') {
                document.getElementById('nav-play')?.click();
                return;
            }

            this.display.updateStatus('Loaded the puzzle of the day into the editor.', true);
            document.getElementById('nav-editor')?.click();
        } catch (error) {
            console.error(error);
            this.display.updateStatus(
                this._formatPuzzleLoadError('puzzle of the day', error),
                true
            );
        }
    },

    _updateRandomPuzzleButton(disabled = false, reason = '') {
        const randomBtn = document.getElementById('random-puzzle-button');
        if (!randomBtn) return;

        const shouldDisable = disabled || this.puzzleIndex.length === 0;
        randomBtn.disabled = shouldDisable;
        randomBtn.title = shouldDisable
            ? reason || 'Bundled puzzle files are unavailable.'
            : 'Load a random bundled puzzle';
    },

    _formatPuzzleLoadError(label, error) {
        const details = String(error?.message || '').trim();
        if (!details) {
            return `Could not load "${label}".`;
        }

        if (/not rectangular|valid grid|grid is empty/i.test(details)) {
            return `Could not load "${label}" because its grid data is invalid.`;
        }

        if (/HTTP 404/i.test(details)) {
            return `Could not load "${label}" because its puzzle file was not found.`;
        }

        if (/HTTP/i.test(details)) {
            return `Could not load "${label}" due to a data request error.`;
        }

        return `Could not load "${label}". ${details}`;
    },

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
    },

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
    },

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
    },

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
    },

    _extractClueNumber(value) {
        const candidates = [value.number, value.num, value.id];

        for (const candidate of candidates) {
            const match = String(candidate ?? '').match(/\d+/);
            if (match) return match[0];
        }

        return '';
    },

    async _fetchPuzzleFile(file) {
        const resp = await fetch(`${PUZZLES_BASE_PATH}/${file}`);
        if (!resp.ok) {
            throw new Error(`Failed to fetch ${file}: HTTP ${resp.status}`);
        }

        const puzzleData = await resp.json();
        this._assertValidPuzzleGrid(puzzleData?.grid, file);
        return puzzleData;
    },

    async _fetchDailyPuzzle() {
        const resp = await fetch(DAILY_PUZZLE_FILE);
        if (!resp.ok) {
            throw new Error(`Failed to fetch puzzle-of-the-day.json: HTTP ${resp.status}`);
        }

        const puzzleData = await resp.json();
        this._assertValidPuzzleGrid(puzzleData?.grid, 'puzzle-of-the-day.json');
        return puzzleData;
    },

    _assertValidPuzzleGrid(rawGrid, sourceLabel = 'puzzle') {
        if (!Array.isArray(rawGrid) || rawGrid.length === 0) {
            throw new Error(`The ${sourceLabel} does not include a valid grid.`);
        }

        const width = Array.isArray(rawGrid[0]) ? rawGrid[0].length : String(rawGrid[0]).length;

        if (!width) {
            throw new Error(`The ${sourceLabel} grid is empty.`);
        }

        const isRectangular = rawGrid.every((row) => {
            const cells = Array.isArray(row) ? row : [...String(row)];
            return cells.length === width;
        });

        if (!isRectangular) {
            throw new Error(`The ${sourceLabel} grid is not rectangular.`);
        }
    }
};
