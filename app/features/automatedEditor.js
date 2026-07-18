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

    _resolveAutomatedSeed(seed = '', { syncInput = true } = {}) {
        const resolved = String(seed || '').trim() || this._createAutomatedSeed();
        const input = typeof document === 'undefined'
            ? null
            : document.getElementById('automated-seed-input');
        if (input && syncInput && String(seed || '').trim()) input.value = resolved;
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
                    if (runLength > 0) lengths.push(runLength);
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

    _shuffleAutomatedValues(values, random = Math.random) {
        const shuffled = [...values];
        for (let index = shuffled.length - 1; index > 0; index--) {
            const swapIndex = Math.floor(random() * (index + 1));
            [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
        }
        return shuffled;
    },

    _getAutomatedTargetBlockCount(rows, columns, blockedRows, blockedColumns) {
        const cells = rows * columns;
        const density = Math.min(
            0.23,
            Math.max(0.14, 0.15 + ((blockedRows + blockedColumns) * 0.015))
        );
        return Math.max(0, Math.round(cells * density));
    },

    _createRotationalBlockPairs(rows, columns, random = Math.random) {
        const seen = new Set();
        const pairs = [];

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < columns; c++) {
                const mirrorR = rows - 1 - r;
                const mirrorC = columns - 1 - c;
                const key = `${r},${c}`;
                const mirrorKey = `${mirrorR},${mirrorC}`;
                if (seen.has(key) || seen.has(mirrorKey)) continue;

                seen.add(key);
                seen.add(mirrorKey);

                const pair = key === mirrorKey
                    ? [[r, c]]
                    : [[r, c], [mirrorR, mirrorC]];
                pairs.push(pair);
            }
        }

        return this._shuffleAutomatedValues(pairs, random);
    },

    _cloneAutomatedGrid(grid) {
        return grid.map((row) => [...row]);
    },

    _countAutomatedBlocks(grid) {
        return grid.reduce(
            (count, row) => count + row.filter((cell) => cell === '#').length,
            0
        );
    },

    _hasAutomatedFullDivider(grid) {
        if (!grid.length || !grid[0]?.length) return true;

        if (grid.some((row) => row.every((cell) => cell === '#'))) {
            return true;
        }

        for (let column = 0; column < grid[0].length; column++) {
            if (grid.every((row) => row[column] === '#')) {
                return true;
            }
        }

        return false;
    },

    _countAutomatedOpenLines(grid) {
        if (!grid.length || !grid[0]?.length) return 0;

        let openLines = grid.filter((row) => row.every((cell) => cell !== '#')).length;
        for (let column = 0; column < grid[0].length; column++) {
            if (grid.every((row) => row[column] !== '#')) {
                openLines++;
            }
        }

        return openLines;
    },

    _getAutomatedOpenLineTargets(grid) {
        const targets = [];
        if (!grid.length || !grid[0]?.length) return targets;

        grid.forEach((row, index) => {
            if (row.every((cell) => cell !== '#')) {
                targets.push({ axis: 'row', index });
            }
        });

        for (let column = 0; column < grid[0].length; column++) {
            if (grid.every((row) => row[column] !== '#')) {
                targets.push({ axis: 'column', index: column });
            }
        }

        return targets;
    },

    _hasConnectedAutomatedOpenCells(grid) {
        const rows = grid.length;
        const columns = grid[0]?.length || 0;
        let firstOpen = null;
        let openCount = 0;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < columns; c++) {
                if (grid[r][c] === '#') continue;
                openCount++;
                if (!firstOpen) firstOpen = [r, c];
            }
        }

        if (!firstOpen) return false;

        const visited = new Set();
        const queue = [firstOpen];
        visited.add(firstOpen.join(','));

        for (let index = 0; index < queue.length; index++) {
            const [r, c] = queue[index];
            [
                [r - 1, c],
                [r + 1, c],
                [r, c - 1],
                [r, c + 1]
            ].forEach(([nextR, nextC]) => {
                if (
                    nextR < 0 ||
                    nextR >= rows ||
                    nextC < 0 ||
                    nextC >= columns ||
                    grid[nextR][nextC] === '#'
                ) {
                    return;
                }

                const key = `${nextR},${nextC}`;
                if (visited.has(key)) return;
                visited.add(key);
                queue.push([nextR, nextC]);
            });
        }

        return visited.size === openCount;
    },

    _isAutomatedBlockPlacementAcceptable(grid) {
        if (this._hasAutomatedFullDivider(grid)) return false;
        if (!this._hasConnectedAutomatedOpenCells(grid)) return false;
        return this._analyzeAutomatedLayout(grid).valid;
    },

    _scoreAutomatedLayout(grid, targetBlockCount) {
        const analysis = this._analyzeAutomatedLayout(grid);
        if (!analysis.valid) return Number.NEGATIVE_INFINITY;
        if (this._hasAutomatedFullDivider(grid)) return Number.NEGATIVE_INFINITY;
        if (!this._hasConnectedAutomatedOpenCells(grid)) return Number.NEGATIVE_INFINITY;

        const blockCount = this._countAutomatedBlocks(grid);
        const lengths = analysis.slotLengths;
        const longRunPenalty = lengths
            .filter((length) => length > 10)
            .reduce((sum, length) => sum + (((length - 10) ** 2) * 8), 0);
        const openLinePenalty = this._countAutomatedOpenLines(grid) * 200;
        const mediumRunScore = lengths.filter((length) => length >= 4 && length <= 8).length * 3;
        const slotCountScore = lengths.length * 1.5;
        const densityPenalty = Math.abs(targetBlockCount - blockCount) * 5;

        return slotCountScore + mediumRunScore - longRunPenalty - openLinePenalty - densityPenalty;
    },

    _improveAutomatedOpenLineCoverage(grid, targetBlockCount, random = Math.random) {
        const rows = grid.length;
        const columns = grid[0]?.length || 0;
        if (rows < 11 || columns < 11) return grid;

        const maxBlockCount = targetBlockCount + 5;
        let improved = grid;

        for (let pass = 0; pass < 8; pass++) {
            const targets = this._getAutomatedOpenLineTargets(improved);
            if (!targets.length || this._countAutomatedBlocks(improved) >= maxBlockCount) {
                break;
            }

            const target = targets[Math.floor(random() * targets.length)];
            const pairs = this._shuffleAutomatedValues(
                this._createRotationalBlockPairs(rows, columns, random)
                    .filter((pair) => pair.some(([r, c]) =>
                        target.axis === 'row' ? r === target.index : c === target.index
                    )),
                random
            );

            let placed = false;
            for (const pair of pairs) {
                const currentBlockCount = this._countAutomatedBlocks(improved);
                if (currentBlockCount + pair.length > maxBlockCount) continue;
                if (pair.some(([r, c]) => improved[r][c] === '#')) continue;

                const candidate = this._cloneAutomatedGrid(improved);
                pair.forEach(([r, c]) => {
                    candidate[r][c] = '#';
                });

                if (this._isAutomatedBlockPlacementAcceptable(candidate)) {
                    improved = candidate;
                    placed = true;
                    break;
                }
            }

            if (!placed) break;
        }

        return improved;
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
        const safeBlockedRows = this._clampAutomatedInteger(blockedRows, 0, 3, 1);
        const safeBlockedColumns = this._clampAutomatedInteger(blockedColumns, 0, 3, 1);
        const targetBlockCount = this._getAutomatedTargetBlockCount(
            safeRows,
            safeColumns,
            safeBlockedRows,
            safeBlockedColumns
        );
        let bestLayout = null;

        for (let attempt = 0; attempt < 36; attempt++) {
            const grid = Array.from(
                { length: safeRows },
                () => Array(safeColumns).fill('')
            );
            const blockPairs = this._createRotationalBlockPairs(safeRows, safeColumns, random);

            for (const pair of blockPairs) {
                const currentBlockCount = this._countAutomatedBlocks(grid);
                if (currentBlockCount >= targetBlockCount) break;
                if (currentBlockCount + pair.length > targetBlockCount + 1) continue;

                const candidate = this._cloneAutomatedGrid(grid);
                pair.forEach(([r, c]) => {
                    candidate[r][c] = '#';
                });

                if (this._isAutomatedBlockPlacementAcceptable(candidate)) {
                    pair.forEach(([r, c]) => {
                        grid[r][c] = '#';
                    });
                }
            }

            const improvedGrid = this._improveAutomatedOpenLineCoverage(
                grid,
                targetBlockCount,
                random
            );

            const score = this._scoreAutomatedLayout(improvedGrid, targetBlockCount);
            if (!bestLayout || score > bestLayout.score) {
                bestLayout = { grid: improvedGrid, score };
            }
        }

        const grid = bestLayout?.grid || Array.from(
            { length: safeRows },
            () => Array(safeColumns).fill('')
        );
        const blockCount = this._countAutomatedBlocks(grid);

        return {
            grid,
            rowDividers: [],
            columnDividers: [],
            blockCount,
            targetBlockCount
        };
    },

    generateAutomatedLayout(settings = null, options = {}) {
        const resolvedSettings = settings || this._readAutomatedLayoutSettings();
        const seed = this._resolveAutomatedSeed(resolvedSettings.seed, {
            syncInput: options.syncSeedInput ?? true
        });
        const layout = this.createRandomAutomatedLayout({
            ...resolvedSettings,
            seed,
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
            const message = `Generated an automated ${layout.grid.length}x${layout.grid[0].length} layout with ${layout.blockCount} blocks using seed ${seed}.`;
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
        const seed = this._resolveAutomatedSeed(resolvedSettings.seed, {
            syncInput: Boolean(String(resolvedSettings.seed || '').trim())
        });
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
                    announce: false,
                    syncSeedInput: false
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
            if (seedInput && String(resolvedSettings.seed || '').trim()) seedInput.value = seed;

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
