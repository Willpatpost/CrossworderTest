import { GridUtils } from '../../utils/GridUtils.js';

export const solverMethods = {
    _parseThemeEntries(value) {
        return [...new Set(
            String(value || '')
                .split(',')
                .map((entry) => entry.trim().toUpperCase())
                .filter(Boolean)
        )];
    },

    async _buildWordHistoryScores(domains) {
        const words = Object.values(domains || {}).flat();
        if (!this.definitions?.scoreWords) return {};
        return this.definitions.scoreWords(words);
    },

    _getSelectedEditorSlot() {
        if (this.modes?.isPlayMode) return null;
        return this.gridManager._getActiveSlot?.(this) || null;
    },

    _getSlotBlacklist(slotId) {
        const values = this.slotBlacklist?.[slotId];
        return new Set(Array.isArray(values) ? values : []);
    },

    _setSlotBlacklist(slotId, words) {
        if (!slotId) return;

        const normalized = [...new Set(
            Array.from(words || [])
                .map((word) => String(word || '').trim().toUpperCase())
                .filter(Boolean)
        )];

        if (!normalized.length) {
            delete this.slotBlacklist?.[slotId];
            return;
        }

        if (!this.slotBlacklist) {
            this.slotBlacklist = {};
        }

        this.slotBlacklist[slotId] = normalized;
    },

    _getLockedAssignments(lockFilledEntries) {
        if (!lockFilledEntries) return {};

        const assignments = {};

        Object.values(this.slots || {}).forEach((slot) => {
            const word = this._extractSlotWord?.(slot) || '';
            if (word.length === slot.length && /^[A-Z]+$/.test(word)) {
                assignments[slot.id] = word;
            }
        });

        return assignments;
    },

    _buildSolverDomains(slots) {
        const domains = this.constraintManager.setupDomains(
            slots,
            this.wordLengthCache,
            this.grid
        );

        Object.keys(domains).forEach((slotId) => {
            const blacklist = this._getSlotBlacklist(slotId);
            if (!blacklist.size) return;

            domains[slotId] = (domains[slotId] || []).filter((word) => !blacklist.has(word));
        });

        return domains;
    },

    _getSelectedSolveSettings() {
        const settings = this._getSolveSettings
            ? this._getSolveSettings()
            : {
                allowReuse: false,
                deterministic: false,
                visualize: false,
                visualizeSpeed: 'fast',
                reducedMotion: false
            };

        const lockFilledEntries =
            typeof document !== 'undefined'
                ? (document.getElementById('lock-filled-toggle')?.checked ?? true)
                : true;

        return {
            ...settings,
            lockFilledEntries
        };
    },

    _prefersReducedMotion() {
        return typeof window !== 'undefined'
            && typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    },

    _getSolveSettings() {
        const allowReuse =
            document.getElementById('allow-reuse-toggle')?.checked || false;
        const deterministic =
            document.getElementById('deterministic-solve-toggle')?.checked || false;
        const wantsVisualize =
            document.getElementById('visualize-solve-toggle')?.checked || false;
        const visualizeSpeed =
            document.getElementById('visualize-speed-select')?.value || 'fast';
        const reducedMotion = this._prefersReducedMotion();
        const themeEntries = this._parseThemeEntries(
            document.getElementById('theme-entries-input')?.value || ''
        );

        return {
            allowReuse,
            deterministic,
            visualize: wantsVisualize && !reducedMotion,
            visualizeSpeed,
            reducedMotion,
            themeEntries
        };
    },

    _applySlotWord(slot, word) {
        if (!slot || typeof word !== 'string') return false;

        slot.positions.forEach(([r, c], index) => {
            this.grid[r][c] = word[index] || '';
        });

        this.currentSolution = null;
        this.syncActiveGridToDOM();
        this.refreshWordList();
        return true;
    },

    _updateSolverDiagnostics(stats = null, settings = null) {
        const container = document.getElementById('solver-diagnostics');
        if (!container) return;

        if (!stats) {
            container.textContent = 'Detailed solver diagnostics will appear here after a solve, including where the search spent time and why it stopped.';
            container.classList.add('muted-text');
            return;
        }

        const pruneRatio = stats.recursiveCalls
            ? ((stats.domainReductions / Math.max(stats.recursiveCalls, 1)) || 0).toFixed(1)
            : '0.0';
        const modeSummary = [
            settings?.deterministic ? 'deterministic' : 'adaptive',
            settings?.lockFilledEntries ? 'locked fills' : 'unlocked fills',
            settings?.allowReuse ? 'reuse on' : 'reuse off'
        ].join(', ');
        const themeSummary = settings?.themeEntries?.length
            ? ` Theme priority: ${settings.themeEntries.join(', ')}.`
            : '';

        container.textContent =
            `Solve mode: ${modeSummary}. Search reached depth ${stats.maxDepth} with ${stats.backtracks} backtracks and averaged ${pruneRatio} domain reductions per recursive call.${themeSummary}`;
        container.classList.remove('muted-text');
    },

    renderSolverBlacklist() {
        const container = document.getElementById('solver-blacklist-list');
        if (!container) return;

        const entries = Object.entries(this.slotBlacklist || {})
            .flatMap(([slotId, words]) => (words || []).map((word) => ({ slotId, word })));

        container.innerHTML = '';

        if (!entries.length) {
            container.textContent = 'No fills are blacklisted yet.';
            container.classList.add('muted-text');
            return;
        }

        container.classList.remove('muted-text');

        entries.forEach(({ slotId, word }) => {
            const slot = this.slots?.[slotId];
            const chip = document.createElement('div');
            chip.className = 'blacklist-chip';

            const label = document.createElement('span');
            label.textContent = slot
                ? `${slot.number}-${slot.direction}`
                : slotId;

            const strong = document.createElement('strong');
            strong.textContent = word;

            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.slotId = slotId;
            button.dataset.word = word;
            button.setAttribute('aria-label', `Remove ${word} from blacklist`);
            button.textContent = 'Remove';

            chip.appendChild(label);
            chip.appendChild(strong);
            chip.appendChild(button);
            container.appendChild(chip);
        });
    },

    removeBlacklistedWord(slotId, word) {
        if (!slotId || !word) return false;

        const blacklist = this._getSlotBlacklist(slotId);
        if (!blacklist.has(word)) return false;

        this._recordEditorSnapshot?.();
        blacklist.delete(word);
        this._setSlotBlacklist(slotId, blacklist);
        this.renderSolverBlacklist?.();
        this.display.updateStatus(`Removed ${word} from the blacklist for ${slotId}.`, true);
        this._scheduleEditorAutosave?.();
        return true;
    },

    _updateSolverMetrics(stats = null) {
        const container = document.getElementById('solver-metrics');
        if (!container) return;

        if (!stats) {
            container.innerHTML = `
                <div class="summary-item summary-item-wide">
                    <span class="summary-value">No solve yet</span>
                    <span class="summary-label">Run the solver to inspect timing, search depth, pruning, and domain pressure.</span>
                </div>
            `;
            this._updateSolverDiagnostics?.(null, null);
            return;
        }

        const elapsedSeconds = (stats.elapsedMs / 1000).toFixed(2);
        container.innerHTML = [
            `<div class="summary-item"><span class="summary-value">${elapsedSeconds}s</span><span class="summary-label">Time</span></div>`,
            `<div class="summary-item"><span class="summary-value">${stats.recursiveCalls}</span><span class="summary-label">Calls</span></div>`,
            `<div class="summary-item"><span class="summary-value">${stats.backtracks}</span><span class="summary-label">Backtracks</span></div>`,
            `<div class="summary-item"><span class="summary-value">${stats.domainReductions}</span><span class="summary-label">Domain reductions</span></div>`,
            `<div class="summary-item"><span class="summary-value">${stats.ac3Revisions}</span><span class="summary-label">AC-3 revisions</span></div>`,
            `<div class="summary-item"><span class="summary-value">${stats.maxDepth}</span><span class="summary-label">Max depth</span></div>`,
            `<div class="summary-item"><span class="summary-value">${stats.randomized ? 'No' : 'Yes'}</span><span class="summary-label">Deterministic</span></div>`
        ].join('');
    },

    updateSearchModeUI() {
        if (typeof document === 'undefined') return;

        const searchInput = document.getElementById('word-search-input');
        const searchMode = document.getElementById('word-search-mode');
        if (!searchInput || !searchMode) return;

        if (searchMode.value === 'clue') {
            searchInput.placeholder = 'Search clues or answers (e.g. feline or CAT)';
            return;
        }

        searchInput.placeholder = 'Search answers (use ? for wildcards, e.g. C??T)';
    },

    async _solvePuzzleForPlay(label = 'puzzle') {
        const { slots, cellContents } = this.constraintManager.buildDataStructures(this.grid);
        this.slots = slots;

        const slotValues = Object.values(this.slots || {});
        if (!slotValues.length) {
            return null;
        }

        const uniqueLengths = [...new Set(slotValues.map((slot) => slot.length))];
        for (const len of uniqueLengths) {
            if (!this.wordLengthCache[len]) {
                this.wordLengthCache[len] = await this.wordProvider.getWordsOfLength(len);
            }
        }

        this.letterFrequencies = GridUtils.calculateLetterFrequencies(this.wordLengthCache);
        const domains = this._buildSolverDomains
            ? this._buildSolverDomains(this.slots)
            : this.constraintManager.setupDomains(this.slots, this.wordLengthCache, this.grid);

        const emptyDomainSlot = slotValues.find((slot) => (domains[slot.id] || []).length === 0);
        if (emptyDomainSlot) {
            throw new Error(
                `Could not prepare ${label} for play because ${emptyDomainSlot.number}-${emptyDomainSlot.direction} has no candidate fills.`
            );
        }

        const result = await this.solver.backtrackingSolve(
            this.slots,
            domains,
            this.constraintManager.constraints,
            this.letterFrequencies,
            cellContents,
            {
                allowReuse: false,
                randomize: false,
                visualize: false
            }
        );

        if (!result?.success || !result.solution) {
            throw new Error(`Could not solve ${label} for play mode.`);
        }

        return result.solution;
    },

    async handleSolve() {
        if (this.isSolving) {
            this.abortActiveSolve();
        }

        const runId = ++this._solveRunId;
        this.isSolving = true;
        this._updateSolveControls(true);
        this._updateSolverMetrics?.(null);

        try {
            this.display.updateStatus('Analyzing grid constraints...');

            const start = performance.now();

            const { slots, cellContents } =
                this.constraintManager.buildDataStructures(this.grid);
            this.slots = slots;

            const slotCount = Object.keys(this.slots).length;
            if (!slotCount) {
                this.display.updateStatus(
                    'No fillable entries were found. Open up some non-block cells before solving.',
                    true
                );
                this.syncActiveGridToDOM();
                return;
            }

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

            const domains = this._buildSolverDomains
                ? this._buildSolverDomains(this.slots)
                : this.constraintManager.setupDomains(
                    this.slots,
                    this.wordLengthCache,
                    this.grid
                );

            const emptyDomainSlot = Object.values(this.slots).find(
                (slot) => (domains[slot.id] || []).length === 0
            );

            if (emptyDomainSlot) {
                this.display.updateStatus(
                    `No candidate fills were found for ${emptyDomainSlot.number}-${emptyDomainSlot.direction}. Check its pattern or add more word data.`,
                    true
                );
                this.syncActiveGridToDOM();
                return;
            }

            const solveSettings = this._getSelectedSolveSettings
                ? this._getSelectedSolveSettings()
                : this._getSolveSettings
                ? this._getSolveSettings()
                : {
                    allowReuse: false,
                    deterministic: false,
                    visualize: false,
                    visualizeSpeed: 'fast',
                    reducedMotion: false,
                    lockFilledEntries: true,
                    themeEntries: []
                };
            const {
                allowReuse,
                visualize,
                deterministic,
                visualizeSpeed,
                reducedMotion,
                lockFilledEntries
            } = solveSettings;
            const initialAssignment = this._getLockedAssignments
                ? this._getLockedAssignments(lockFilledEntries)
                : {};
            const wordHistoryScores = this._buildWordHistoryScores
                ? await this._buildWordHistoryScores(domains)
                : {};

            this.display.updateStatus(
                visualize
                    ? `Solving visually (${visualizeSpeed}${reducedMotion ? ', reduced motion' : ''})...`
                    : deterministic
                        ? 'Solving deterministically...'
                        : 'Solving...',
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
                        settings: {
                            allowReuse,
                            visualize,
                            randomize: !deterministic,
                            visualizationDelayMs: visualizeSpeed === 'slow' ? 14 : 5,
                            initialAssignment,
                            themeEntries: solveSettings.themeEntries,
                            wordHistoryScores
                        }
                    }
                });
            });

            if (runId !== this._solveRunId) {
                return;
            }

            const end = performance.now();
            this._updateSolverMetrics?.(result.stats || null);
            this._updateSolverDiagnostics?.(result.stats || null, solveSettings);

            if (result.success) {
                this.currentSolution = result.solution;
                this.applySolutionToGrid(this.slots, result.solution);

                this.display.updateStatus(
                    `Solved in ${((end - start) / 1000).toFixed(2)}s after ${result.stats?.recursiveCalls ?? 0} calls and ${result.stats?.backtracks ?? 0} backtracks.`,
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
    },

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
    },

    async solveSelectedWord() {
        const slot = this._getSelectedEditorSlot?.();
        if (!slot) {
            this.display.updateStatus('Select an entry in the editor before solving a word.', true);
            return false;
        }

        if (this.isSolving) {
            this.abortActiveSolve();
        }

        const runId = ++this._solveRunId;
        this.isSolving = true;
        this._updateSolveControls(true);

        try {
            const { slots, cellContents } = this.constraintManager.buildDataStructures(this.grid);
            this.slots = slots;
            const activeSlot = slots[slot.id];
            if (!activeSlot) {
                this.display.updateStatus('The selected entry is no longer available to solve.', true);
                return false;
            }

            const uniqueLengths = [...new Set(Object.values(this.slots).map((entry) => entry.length))];
            for (const len of uniqueLengths) {
                if (!this.wordLengthCache[len]) {
                    this.wordLengthCache[len] = await this.wordProvider.getWordsOfLength(len);
                }
            }

            this.letterFrequencies = GridUtils.calculateLetterFrequencies(this.wordLengthCache);
            const domains = this._buildSolverDomains(this.slots);
            const solveSettings = this._getSelectedSolveSettings?.() || this._getSolveSettings?.() || {};
            const initialAssignment = this._getLockedAssignments(solveSettings.lockFilledEntries);
            delete initialAssignment[activeSlot.id];

            const result = await this.solver.backtrackingSolve(
                this.slots,
                domains,
                this.constraintManager.constraints,
                this.letterFrequencies,
                cellContents,
                {
                    allowReuse: solveSettings.allowReuse,
                    randomize: !solveSettings.deterministic,
                    visualize: false,
                    preferredSlotId: activeSlot.id,
                    initialAssignment,
                    themeEntries: solveSettings.themeEntries,
                    wordHistoryScores: this._buildWordHistoryScores
                        ? await this._buildWordHistoryScores(domains)
                        : {}
                }
            );

            if (runId !== this._solveRunId) return false;

            this._updateSolverMetrics?.(result.stats || null);

            if (!result.success || !result.solution?.[activeSlot.id]) {
                this.display.updateStatus(`No consistent fill was found for ${activeSlot.number}-${activeSlot.direction}.`, true);
                return false;
            }

            this._recordEditorSnapshot?.();
            this._applySlotWord(activeSlot, result.solution[activeSlot.id]);
            this.display.updateStatus(
                `Solved ${activeSlot.number}-${activeSlot.direction} as ${result.solution[activeSlot.id]}.`,
                true
            );
            this._scheduleEditorAutosave?.();
            this.renderSolverBlacklist?.();
            return true;
        } catch (error) {
            if (runId === this._solveRunId && error?.message !== 'SOLVE_CANCELLED') {
                this.display.updateStatus(`Selected-word solve failed: ${error.message}`, true);
            }
            return false;
        } finally {
            if (runId === this._solveRunId) {
                this.activeWorker = null;
                this.activeSolveSession = null;
                this._updateSolveControls(false);
            }
        }
    },

    suggestSelectedWord() {
        const slot = this._getSelectedEditorSlot?.();
        if (!slot) {
            this.display.updateStatus('Select an entry in the editor before requesting a suggestion.', true);
            return false;
        }

        return this._withPreparedSolverData(async ({ slotMap, domains }) => {
            const wordHistoryScores = this._buildWordHistoryScores
                ? await this._buildWordHistoryScores(domains)
                : {};
            const solverSlot = slotMap?.[slot.id] || slot;
            const candidates = this.solver.orderDomainValues(
                solverSlot.id,
                domains,
                this.constraintManager.constraints || {},
                this._getLockedAssignments(this._getSelectedSolveSettings?.().lockFilledEntries ?? true),
                this.letterFrequencies || {},
                wordHistoryScores
            );

            const suggestion = candidates[0];
            if (!suggestion) {
                this.display.updateStatus(`No candidate suggestion is available for ${solverSlot.number}-${solverSlot.direction}.`, true);
                return false;
            }

            this._recordEditorSnapshot?.();
            this._applySlotWord(solverSlot, suggestion);
            this.display.updateStatus(
                `Suggested ${suggestion} for ${solverSlot.number}-${solverSlot.direction}.`,
                true
            );
            this._scheduleEditorAutosave?.();
            this.renderSolverBlacklist?.();
            return true;
        });
    },

    blacklistSelectedSlotWord() {
        const slot = this._getSelectedEditorSlot?.();
        if (!slot) {
            this.display.updateStatus('Select an entry in the editor before blacklisting a fill.', true);
            return false;
        }

        const word = this._extractSlotWord?.(slot) || '';
        if (word.length !== slot.length || /[^A-Z]/.test(word)) {
            this.display.updateStatus('Fill the selected entry completely before blacklisting it.', true);
            return false;
        }

        const blacklist = this._getSlotBlacklist(slot.id);
        blacklist.add(word);

        this._recordEditorSnapshot?.();
        this._setSlotBlacklist(slot.id, blacklist);
        slot.positions.forEach(([r, c]) => {
            this.grid[r][c] = '';
        });
        this.currentSolution = null;
        this.syncActiveGridToDOM();
        this.refreshWordList();
        this.display.updateStatus(
            `Blacklisted ${word} for ${slot.number}-${slot.direction}.`,
            true
        );
        this._scheduleEditorAutosave?.();
        this.renderSolverBlacklist?.();
        return true;
    },

    async _withPreparedSolverData(callback) {
        const { slots, cellContents } = this.constraintManager.buildDataStructures(this.grid);
        this.slots = slots;
        this.wordLengthCache = this.wordLengthCache || {};

        const uniqueLengths = [...new Set(Object.values(this.slots).map((slot) => slot.length))];
        for (const len of uniqueLengths) {
            if (!this.wordLengthCache[len]) {
                this.wordLengthCache[len] = await this.wordProvider.getWordsOfLength(len);
            }
        }

        this.letterFrequencies = GridUtils.calculateLetterFrequencies(this.wordLengthCache);
        const domains = this._buildSolverDomains(this.slots);
        return callback({
            slotMap: this.slots,
            cellContents,
            domains
        });
    },

    async handleSearch(value) {
        const requestId = ++this._searchRequestId;
        const rawQuery = value.trim();
        const searchMode = typeof document !== 'undefined'
            ? (document.getElementById('word-search-mode')?.value || 'answer')
            : 'answer';
        const query = rawQuery.toUpperCase();
        const safeQuery = query.replace(/[^A-Z?]/g, '');

        if (searchMode === 'clue') {
            if (!rawQuery || rawQuery.length < 3) {
                this.display.updateSearchResults([], () => { }, {
                    message: rawQuery ? 'Type at least 3 characters to search clues.' : 'Type 3 or more characters to search clues.',
                    showDropdown: false
                });
                return;
            }

            try {
                const matches = await this.definitions.searchEntries(rawQuery, { limit: 50 });
                if (requestId !== this._searchRequestId) return;

                const message = matches.length
                    ? `${matches.length} clue match${matches.length === 1 ? '' : 'es'}`
                    : `No clue matches found for "${rawQuery}".`;

                this.display.updateSearchResults(
                    matches,
                    (selected) => {
                        this.popups.show(selected.word);
                    },
                    {
                        message,
                        showDropdown: matches.length > 0,
                        mode: 'clue'
                    }
                );
            } catch (error) {
                if (requestId !== this._searchRequestId) return;
                console.warn('Clue search failed', error);
                this.display.updateStatus('Clue search failed.', true);
                this.display.updateSearchResults([], () => { }, {
                    message: 'Clue search failed. Please try again.',
                    showDropdown: false
                });
            }
            return;
        }

        if (!safeQuery || safeQuery.length < 2) {
            this.display.updateSearchResults([], () => { }, {
                message: query ? 'Type at least 2 letters to search.' : 'Type 2 or more letters to search.',
                showDropdown: false
            });
            return;
        }

        try {
            const words = await this.wordProvider.getWordsOfLength(safeQuery.length);
            if (requestId !== this._searchRequestId) return;

            const regex = new RegExp(`^${safeQuery.replace(/\?/g, '.')}$`);
            const matches = words.filter((word) => regex.test(word)).slice(0, 50);

            if (requestId !== this._searchRequestId) return;
            const hasLengthData = words.length > 0;
            const message = matches.length
                ? `${matches.length} match${matches.length === 1 ? '' : 'es'}`
                : hasLengthData
                    ? `No matches found for "${safeQuery}".`
                    : `No local word list is bundled for ${safeQuery.length}-letter entries.`;

            this.display.updateSearchResults(
                matches,
                (selected) => {
                    this.popups.show(selected);
                },
                {
                    message,
                    showDropdown: matches.length > 0,
                    mode: 'answer'
                }
            );
        } catch (error) {
            if (requestId !== this._searchRequestId) return;
            console.warn('Search failed', error);
            this.display.updateStatus('Word search failed.', true);
            this.display.updateSearchResults([], () => { }, {
                message: 'Word search failed. Please try again.',
                showDropdown: false
            });
        }
    },

    _updateSolveControls(isSolving) {
        this.isSolving = isSolving;

        const solveBtn = document.getElementById('solve-crossword-button');
        const solveSelectedBtn = document.getElementById('solve-selected-word-button');
        const suggestBtn = document.getElementById('suggest-fill-button');
        const blacklistBtn = document.getElementById('blacklist-entry-button');
        const cancelBtn = document.getElementById('cancel-solve-button');
        const speedSelect = document.getElementById('visualize-speed-select');

        if (solveBtn) solveBtn.disabled = isSolving;
        if (solveSelectedBtn) solveSelectedBtn.disabled = isSolving;
        if (suggestBtn) suggestBtn.disabled = isSolving;
        if (blacklistBtn) blacklistBtn.disabled = isSolving;
        if (cancelBtn) cancelBtn.classList.toggle('hidden', !isSolving);
        if (speedSelect) speedSelect.disabled = isSolving;
    }
};
