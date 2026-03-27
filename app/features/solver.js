import { GridUtils } from '../../utils/GridUtils.js';

export const solverMethods = {
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

            const domains = this.constraintManager.setupDomains(
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

    async handleSearch(value) {
        const requestId = ++this._searchRequestId;
        const query = value.trim().toUpperCase();
        const safeQuery = query.replace(/[^A-Z?]/g, '');

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
                    showDropdown: matches.length > 0
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
        const cancelBtn = document.getElementById('cancel-solve-button');

        if (solveBtn) solveBtn.disabled = isSolving;
        if (cancelBtn) cancelBtn.classList.toggle('hidden', !isSolving);
    }
};
