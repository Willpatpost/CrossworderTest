export const automatedEditorMethods = {
    setEditorWorkspaceMode(mode) {
        if (!['manual', 'automated'].includes(mode)) return false;

        this.editorWorkspaceMode = mode;

        const tabs = {
            manual: document.getElementById('manual-editor-tab'),
            automated: document.getElementById('automated-editor-tab')
        };
        const panels = {
            manual: document.getElementById('manual-editor-controls'),
            automated: document.getElementById('automated-editor-controls')
        };

        Object.entries(tabs).forEach(([tabMode, tab]) => {
            const isActive = tabMode === mode;
            tab?.classList.toggle('active', isActive);
            tab?.setAttribute('aria-selected', String(isActive));
            tab?.setAttribute('tabindex', isActive ? '0' : '-1');
        });

        Object.entries(panels).forEach(([panelMode, panel]) => {
            const isActive = panelMode === mode;
            panel?.classList.toggle('hidden', !isActive);
            panel?.setAttribute('aria-hidden', String(!isActive));
        });

        return true;
    },

    _clampAutomatedInteger(value, min, max, fallback) {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.min(max, Math.max(min, parsed));
    },

    _readAutomatedLayoutSettings() {
        return {
            rows: this._clampAutomatedInteger(
                document.getElementById('automated-rows-input')?.value,
                7,
                25,
                15
            ),
            columns: this._clampAutomatedInteger(
                document.getElementById('automated-columns-input')?.value,
                7,
                25,
                15
            ),
            blockedRows: this._clampAutomatedInteger(
                document.getElementById('automated-block-rows-input')?.value,
                0,
                3,
                1
            ),
            blockedColumns: this._clampAutomatedInteger(
                document.getElementById('automated-block-columns-input')?.value,
                0,
                3,
                1
            ),
            attempts: this._clampAutomatedInteger(
                document.getElementById('automated-attempts-input')?.value,
                1,
                8,
                4
            ),
            seed: String(document.getElementById('automated-seed-input')?.value || '').trim()
        };
    },

    _createAutomatedSeed() {
        if (globalThis.crypto?.getRandomValues) {
            const values = new Uint32Array(2);
            globalThis.crypto.getRandomValues(values);
            return `${values[0].toString(36)}-${values[1].toString(36)}`;
        }

        return `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xFFFFFFFF).toString(36)}`;
    },

    _createSeededRandom(seed) {
        let state = 2166136261;
        for (const character of String(seed)) {
            state ^= character.charCodeAt(0);
            state = Math.imul(state, 16777619);
        }

        return () => {
            state += 0x6D2B79F5;
            let value = state;
            value = Math.imul(value ^ (value >>> 15), value | 1);
            value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
            return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
        };
    },

    _resolveAutomatedSeed(seed = '') {
        const resolved = String(seed || '').trim() || this._createAutomatedSeed();
        const input = typeof document === 'undefined'
            ? null
            : document.getElementById('automated-seed-input');
        if (input) input.value = resolved;
        return resolved;
    },

    _updateAutomatedProgress(message, state = 'idle') {
        if (typeof document !== 'undefined') {
            const progress = document.getElementById('automated-progress');
            if (progress) {
                progress.textContent = message;
                progress.dataset.state = state;
            }
        }

        return message;
    },

    _analyzeAutomatedLayout(grid) {
        if (
            !Array.isArray(grid) ||
            !grid.length ||
            !Array.isArray(grid[0]) ||
            !grid[0].length ||
            !grid.every((row) => Array.isArray(row) && row.length === grid[0].length)
        ) {
            return { valid: false, reason: 'The generated grid is empty or malformed.', slotLengths: [] };
        }

        const lengths = [];
        const collectRuns = (values) => {
            let runLength = 0;
            for (const value of [...values, '#']) {
                if (value !== '#') {
                    runLength++;
                } else {
                    if (runLength >= 2) lengths.push(runLength);
                    runLength = 0;
                }
            }
        };

        grid.forEach(collectRuns);
        for (let column = 0; column < grid[0].length; column++) {
            collectRuns(grid.map((row) => row[column]));
        }

        if (!lengths.length) {
            return { valid: false, reason: 'The layout does not contain any fillable entries.', slotLengths: [] };
        }

        const unsupported = [...new Set(lengths.filter((length) => length < 3 || length > 21))]
            .sort((left, right) => left - right);
        if (unsupported.length) {
            return {
                valid: false,
                reason: `Entry length${unsupported.length === 1 ? '' : 's'} ${unsupported.join(', ')} ${unsupported.length === 1 ? 'is' : 'are'} outside the bundled 3-21 letter word data. Add dividers or reduce the grid size.`,
                slotLengths: lengths
            };
        }

        return { valid: true, reason: '', slotLengths: lengths };
    },

    _commitAutomatedSnapshot(snapshot) {
        if (!snapshot || !Array.isArray(this.editorHistory)) return false;

        this.editorHistory.push(snapshot);
        if (this.editorHistory.length > 100) this.editorHistory.shift();
        this.editorFuture = [];
        this._updateUndoRedoButtons?.();
        return true;
    },

    _selectRandomDividerIndexes(size, requestedCount, random = Math.random) {
        if (requestedCount <= 0) return [];

        const candidates = [];
        for (let index = 3; index <= size - 4; index++) {
            candidates.push(index);
        }

        for (let index = candidates.length - 1; index > 0; index--) {
            const swapIndex = Math.floor(random() * (index + 1));
            [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
        }

        const selected = [];
        for (const candidate of candidates) {
            if (selected.every((index) => Math.abs(index - candidate) >= 4)) {
                selected.push(candidate);
            }
            if (selected.length >= requestedCount) break;
        }

        return selected.sort((left, right) => left - right);
    },

    createRandomAutomatedLayout({
        rows = 15,
        columns = 15,
        blockedRows = 1,
        blockedColumns = 1,
        random = Math.random
    } = {}) {
        const safeRows = this._clampAutomatedInteger(rows, 7, 25, 15);
        const safeColumns = this._clampAutomatedInteger(columns, 7, 25, 15);
        const rowDividers = this._selectRandomDividerIndexes(
            safeRows,
            this._clampAutomatedInteger(blockedRows, 0, 3, 1),
            random
        );
        const columnDividers = this._selectRandomDividerIndexes(
            safeColumns,
            this._clampAutomatedInteger(blockedColumns, 0, 3, 1),
            random
        );
        const rowDividerSet = new Set(rowDividers);
        const columnDividerSet = new Set(columnDividers);
        const grid = Array.from({ length: safeRows }, (_, row) =>
            Array.from({ length: safeColumns }, (_value, column) =>
                rowDividerSet.has(row) || columnDividerSet.has(column) ? '#' : ''
            )
        );

        return { grid, rowDividers, columnDividers };
    },

    generateAutomatedLayout(settings = null, options = {}) {
        const resolvedSettings = settings || this._readAutomatedLayoutSettings();
        const seed = this._resolveAutomatedSeed(resolvedSettings.seed);
        const layout = this.createRandomAutomatedLayout({
            ...resolvedSettings,
            random: resolvedSettings.random || this._createSeededRandom(seed)
        });

        this.importPuzzleGrid(layout.grid, {
            sourceLabel: 'automated layout',
            recordSnapshot: options.recordSnapshot ?? true,
            persist: options.persist ?? true
        });
        this.activePuzzleSource = {
            kind: 'automated',
            label: 'Automated layout'
        };
        layout.seed = seed;
        if (options.announce ?? true) {
            const message = `Generated an automated ${layout.grid.length}x${layout.grid[0].length} layout with seed ${seed}.`;
            this._updateAutomatedProgress(message, 'success');
            this.display.updateStatus(message, true);
        }

        return layout;
    },

    async fillAutomatedGrid({ clearExisting = false } = {}) {
        if (this.isSolving || !this.grid?.length) return false;

        const originalState = this._captureEditorState?.() || null;
        if (clearExisting) {
            this.grid = this.grid.map((row) =>
                row.map((cell) => cell === '#' ? '#' : '')
            );
            this.currentSolution = null;
            this.rebuildGridState?.();
            this.syncActiveGridToDOM?.();
            this.refreshWordList?.();
        }

        const analysis = this._analyzeAutomatedLayout(this.grid);
        if (!analysis.valid) {
            if (clearExisting && originalState) this._restoreEditorState?.(originalState);
            this._updateAutomatedProgress(analysis.reason, 'error');
            this.display.updateStatus(analysis.reason, true);
            return false;
        }

        this._updateAutomatedProgress('Filling the current layout...', 'working');
        const solved = await this.handleSolve?.();
        if (!solved) {
            if (clearExisting && originalState) this._restoreEditorState?.(originalState);
            this._updateAutomatedProgress('No complete fill was found for the current layout.', 'error');
            return false;
        }

        this._commitAutomatedSnapshot(originalState);
        this.activePuzzleSource = {
            kind: 'automated',
            label: 'Automated fill'
        };
        this._updateRecentPuzzleUI?.();
        this._scheduleEditorAutosave?.();
        this._updateAutomatedProgress('The current layout was filled successfully.', 'success');
        return true;
    },

    async generateAndFillAutomatedGrid(settings = null) {
        if (this.isSolving || this.isAutomating) return false;

        const resolvedSettings = settings || this._readAutomatedLayoutSettings();
        const attempts = this._clampAutomatedInteger(resolvedSettings.attempts, 1, 8, 4);
        const seed = this._resolveAutomatedSeed(resolvedSettings.seed);
        const originalState = this._captureEditorState?.() || null;
        const runId = ++this._automationRunId;
        let validLayoutAttempts = 0;
        let lastValidationFailure = '';
        this.isAutomating = true;
        this._updateSolveControls?.(false);

        try {
            for (let attempt = 1; attempt <= attempts; attempt++) {
                if (runId !== this._automationRunId) return false;

                const attemptSeed = `${seed}:${attempt}`;
                const progress = `Trying layout ${attempt} of ${attempts} (seed ${attemptSeed})...`;
                this._updateAutomatedProgress(progress, 'working');
                this.display.updateStatus(progress, true);

                const layout = this.generateAutomatedLayout({
                    ...resolvedSettings,
                    seed: attemptSeed
                }, {
                    recordSnapshot: false,
                    persist: false,
                    announce: false
                });
                const analysis = this._analyzeAutomatedLayout(layout.grid);

                if (!analysis.valid) {
                    lastValidationFailure = analysis.reason;
                    this._updateAutomatedProgress(analysis.reason, 'error');
                    if (attempt === attempts) {
                        this.display.updateStatus(analysis.reason, true);
                    }
                    continue;
                }

                validLayoutAttempts++;
                const solved = await this.handleSolve?.();
                if (runId !== this._automationRunId) return false;
                if (!solved) {
                    this._updateAutomatedProgress(
                        attempt < attempts
                            ? `Layout ${attempt} could not be filled. Trying another layout...`
                            : `Layout ${attempt} could not be filled.`,
                        'working'
                    );
                    continue;
                }

                this._commitAutomatedSnapshot(originalState);
                this.activePuzzleSource = {
                    kind: 'automated',
                    label: 'Automated fill',
                    seed: attemptSeed
                };
                this._updateRecentPuzzleUI?.();
                this._scheduleEditorAutosave?.();
                const message = `Generated and filled layout ${attempt} of ${attempts} with seed ${attemptSeed}.`;
                this._updateAutomatedProgress(message, 'success');
                this.display.updateStatus(message, true);
                return true;
            }

            if (originalState) this._restoreEditorState?.(originalState);
            const message = validLayoutAttempts === 0 && lastValidationFailure
                ? lastValidationFailure
                : `No complete fill was found after ${attempts} layout attempt${attempts === 1 ? '' : 's'}. Try another seed, more dividers, or a smaller grid.`;
            this._updateAutomatedProgress(message, 'error');
            this.display.updateStatus(message, true);
            return false;
        } finally {
            const seedInput = typeof document === 'undefined'
                ? null
                : document.getElementById('automated-seed-input');
            if (seedInput) seedInput.value = seed;

            if (runId === this._automationRunId) {
                this.isAutomating = false;
                this._updateSolveControls?.(false);
            } else if (originalState) {
                this._restoreEditorState?.(originalState);
                this._updateAutomatedProgress('Automated generation was cancelled.', 'error');
            }
        }
    }
};
