export const libraryMethods = {
    _getRecentPuzzleStorageKey() {
        return 'crossworder.recentPuzzle';
    },

    _getCompletedPuzzleStorageKey() {
        return 'crossworder.completedPuzzles';
    },

    _getDailyCompletionStorageKey() {
        return 'crossworder.dailyCompletions';
    },

    _captureRecentPuzzleRecord() {
        if (!Array.isArray(this.grid) || !this.grid.length) return null;

        const editorGrid = (this.modes?.isPlayMode && this.editorGridSnapshot?.length)
            ? this.editorGridSnapshot.map((row) => [...row])
            : this.grid.map((row) => [...row]);
        const playGrid = this.modes?.isPlayMode
            ? this.grid.map((row) => [...row])
            : null;

        return {
            savedAt: new Date().toISOString(),
            source: this.activePuzzleSource ? { ...this.activePuzzleSource } : null,
            editorGrid,
            playGrid,
            currentPuzzleClues: { ...(this.currentPuzzleClues || {}) },
            currentPuzzleMetadata: { ...(this.currentPuzzleMetadata || {}) },
            currentSolution: this.currentSolution ? { ...this.currentSolution } : null,
            slotBlacklist: Object.fromEntries(
                Object.entries(this.slotBlacklist || {}).map(([slotId, words]) => [
                    slotId,
                    Array.isArray(words) ? [...words] : Array.from(words || [])
                ])
            ),
            playState: {
                elapsedMs: this.playElapsedMs || 0,
                hasCompleted: Boolean(this.hasCompletedPlayPuzzle)
            }
        };
    },

    _readRecentPuzzleRecord() {
        try {
            const raw = localStorage.getItem(this._getRecentPuzzleStorageKey());
            if (!raw) return null;

            const parsed = JSON.parse(raw);
            return parsed?.editorGrid ? parsed : null;
        } catch (error) {
            console.warn('Could not read recent puzzle record.', error);
            return null;
        }
    },

    _readCompletedPuzzleHistory() {
        try {
            const raw = localStorage.getItem(this._getCompletedPuzzleStorageKey());
            if (!raw) return [];

            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.warn('Could not read completed puzzle history.', error);
            return [];
        }
    },

    _readDailyCompletionHistory() {
        try {
            const raw = localStorage.getItem(this._getDailyCompletionStorageKey());
            if (!raw) return [];

            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.warn('Could not read daily completion history.', error);
            return [];
        }
    },

    _saveRecentPuzzleRecord({ silent = true } = {}) {
        const record = this._captureRecentPuzzleRecord?.();
        if (!record) return false;

        try {
            localStorage.setItem(
                this._getRecentPuzzleStorageKey(),
                JSON.stringify(record)
            );
            this._updateRecentPuzzleUI?.();
            return true;
        } catch (error) {
            console.warn('Could not save recent puzzle record.', error);
            if (!silent) {
                this.display.updateStatus('Could not save the recent puzzle record on this device.', true);
            }
            return false;
        }
    },

    _recordCompletedPuzzle(timeLabel) {
        const recentRecord = this._captureRecentPuzzleRecord?.();
        if (!recentRecord) return false;

        const title = recentRecord.currentPuzzleMetadata?.title
            || recentRecord.source?.label
            || 'Untitled puzzle';
        const author = recentRecord.currentPuzzleMetadata?.author
            || recentRecord.source?.author
            || '';
        const completedAt = new Date().toISOString();
        const completionEntry = {
            id: `${recentRecord.source?.kind || 'workspace'}:${recentRecord.source?.id || title}:${completedAt}`,
            sourceId: recentRecord.source?.id || '',
            title,
            author,
            timeLabel: timeLabel || '',
            completedAt,
            difficulty: recentRecord.currentPuzzleMetadata?.difficulty || '',
            sourceKind: recentRecord.source?.kind || 'workspace'
        };

        try {
            const history = this._readCompletedPuzzleHistory?.();
            const nextHistory = [completionEntry, ...history].slice(0, 12);
            localStorage.setItem(
                this._getCompletedPuzzleStorageKey(),
                JSON.stringify(nextHistory)
            );
            if (completionEntry.sourceKind === 'daily' && completionEntry.sourceId) {
                this._recordDailyCompletion?.(completionEntry.sourceId);
            }
            this._saveRecentPuzzleRecord?.({ silent: true });
            this._updateRecentPuzzleUI?.();
            return true;
        } catch (error) {
            console.warn('Could not record completed puzzle history.', error);
            return false;
        }
    },

    _recordDailyCompletion(dateKey) {
        if (!dateKey) return false;

        try {
            const history = this._readDailyCompletionHistory?.();
            const nextHistory = [dateKey, ...history.filter((value) => value !== dateKey)]
                .sort((left, right) => String(right).localeCompare(String(left)))
                .slice(0, 60);
            localStorage.setItem(
                this._getDailyCompletionStorageKey(),
                JSON.stringify(nextHistory)
            );
            return true;
        } catch (error) {
            console.warn('Could not record daily completion.', error);
            return false;
        }
    },

    _calculateDailyStreak(dateKeys = []) {
        const normalized = [...new Set(dateKeys.filter(Boolean))]
            .sort((left, right) => String(right).localeCompare(String(left)));
        if (!normalized.length) {
            return {
                streak: 0,
                latest: ''
            };
        }

        let streak = 1;
        let cursor = new Date(`${normalized[0]}T00:00:00`);

        for (let index = 1; index < normalized.length; index++) {
            const expected = new Date(cursor);
            expected.setDate(expected.getDate() - 1);
            const expectedKey = expected.toISOString().slice(0, 10);

            if (normalized[index] !== expectedKey) {
                break;
            }

            streak += 1;
            cursor = expected;
        }

        return {
            streak,
            latest: normalized[0]
        };
    },

    _updateRecentPuzzleUI() {
        const record = this._readRecentPuzzleRecord?.();
        const history = this._readCompletedPuzzleHistory?.();

        const summaryEl = document.getElementById('recent-puzzle-summary');
        const completionEl = document.getElementById('recent-completion-summary');
        const editorButton = document.getElementById('resume-recent-editor-button');
        const playButton = document.getElementById('play-recent-button');

        if (summaryEl) {
            if (!record) {
                summaryEl.textContent =
                    'No recent puzzle workspace is saved yet. Load a bundled puzzle or start building one in the editor.';
            } else {
                const title = record.currentPuzzleMetadata?.title
                    || record.source?.label
                    || 'Untitled puzzle';
                const author = record.currentPuzzleMetadata?.author || record.source?.author || '';
                const authorSuffix = author ? ` by ${author}` : '';
                const savedLabel = record.savedAt
                    ? `Saved ${new Date(record.savedAt).toLocaleString()}.`
                    : 'Saved locally.';
                summaryEl.textContent = `${title}${authorSuffix}. ${savedLabel}`;
            }
        }

        if (completionEl) {
            if (!history.length) {
                completionEl.textContent =
                    'Completed puzzles will appear here once you finish a play session.';
            } else {
                const latest = history[0];
                const latestAuthor = latest.author ? ` by ${latest.author}` : '';
                const latestTime = latest.timeLabel ? ` in ${latest.timeLabel}` : '';
                completionEl.textContent =
                    `Completed ${history.length} puzzle${history.length === 1 ? '' : 's'} recently. Latest: ${latest.title}${latestAuthor}${latestTime}.`;
            }
        }

        if (editorButton) {
            editorButton.disabled = !record;
        }

        if (playButton) {
            playButton.disabled = !record?.currentSolution;
        }

        this.renderBundledPuzzleLibrary?.();
        this.renderHomeDashboard?.();
    },

    loadRecentPuzzle(mode = 'editor') {
        const record = this._readRecentPuzzleRecord?.();
        if (!record) {
            this.display.updateStatus('No recent puzzle workspace is available yet.', true);
            this._updateRecentPuzzleUI?.();
            return false;
        }

        try {
            this._assertValidPuzzleGrid(record.editorGrid, 'recent puzzle');
            this.importPuzzleGrid(record.editorGrid, {
                sourceLabel: 'recent puzzle'
            });
            this.currentPuzzleClues = { ...(record.currentPuzzleClues || {}) };
            this.currentPuzzleMetadata = { ...(record.currentPuzzleMetadata || {}) };
            this.currentSolution = record.currentSolution ? { ...record.currentSolution } : null;
            this.activePuzzleSource = record.source ? { ...record.source } : {
                kind: 'workspace',
                label: 'Recent puzzle'
            };
            this.slotBlacklist = Object.fromEntries(
                Object.entries(record.slotBlacklist || {}).map(([slotId, words]) => [
                    slotId,
                    Array.isArray(words) ? [...words] : []
                ])
            );
            this.hasCompletedPlayPuzzle = false;
            this.syncPuzzleMetadataInputs?.();
            this.renderSolverBlacklist?.();
            this.render();
            this.refreshWordList?.();
            this._updateRecentPuzzleUI?.();
            this._scheduleEditorAutosave?.();

            if (mode === 'play') {
                if (!this.currentSolution) {
                    this.display.updateStatus('The recent puzzle does not include a playable solution yet.', true);
                    return false;
                }

                document.getElementById('nav-play')?.click();
                return true;
            }

            this.display.updateStatus('Loaded the recent puzzle workspace.', true);
            document.getElementById('nav-editor')?.click();
            return true;
        } catch (error) {
            console.warn('Could not load recent puzzle workspace.', error);
            this.display.updateStatus('The recent puzzle workspace could not be restored.', true);
            return false;
        }
    },

    _getBundledPuzzleProgressLookup() {
        const recentRecord = this._readRecentPuzzleRecord?.();
        const completedHistory = this._readCompletedPuzzleHistory?.();
        const lookup = {};

        completedHistory.forEach((entry) => {
            if (!entry?.sourceId) return;
            lookup[entry.sourceId] = {
                completed: true,
                timeLabel: entry.timeLabel || '',
                completedAt: entry.completedAt || ''
            };
        });

        if (recentRecord?.source?.id) {
            lookup[recentRecord.source.id] = {
                ...(lookup[recentRecord.source.id] || {}),
                recent: true,
                recentLabel: recentRecord.savedAt || ''
            };
        }

        return lookup;
    },

    _getDashboardSnapshot() {
        const recentRecord = this._readRecentPuzzleRecord?.();
        const completedHistory = this._readCompletedPuzzleHistory?.();
        const dailyHistory = this._readDailyCompletionHistory?.();
        const progressLookup = this._getBundledPuzzleProgressLookup?.() || {};
        const dailyStats = this._calculateDailyStreak?.(dailyHistory) || {
            streak: 0,
            latest: ''
        };

        return {
            bundledCount: this.puzzleIndex.length,
            completedCount: completedHistory.length,
            hasRecentWorkspace: Boolean(recentRecord),
            recentRecord,
            progressLookup,
            dailyCompletionCount: dailyHistory.length,
            dailyStreak: dailyStats.streak,
            latestDailyCompletion: dailyStats.latest
        };
    },

    _selectFeaturedAndRecommendedPuzzles(entries = [], progressLookup = {}) {
        const sortedByDate = [...entries].sort((left, right) =>
            String(right.date || '').localeCompare(String(left.date || ''))
        );
        const featured = sortedByDate.find((entry) => entry.dailyEligible)
            || sortedByDate[0]
            || null;
        const recommended = entries.find((entry) => !progressLookup[entry.file]?.completed)
            || featured;

        return { featured, recommended };
    },

    _filterAndSortPuzzleEntries(entries = [], { query = '', sort = 'title' } = {}) {
        const normalizedQuery = String(query || '').trim().toLowerCase();
        const filtered = entries.filter((entry) => {
            if (!normalizedQuery) return true;

            return [
                entry.title,
                entry.author,
                entry.id,
                entry.file
            ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
        });

        return [...filtered].sort((left, right) => {
            if (sort === 'date-desc') {
                return String(right.date || '').localeCompare(String(left.date || ''));
            }

            if (sort === 'author') {
                return String(left.author || '').localeCompare(String(right.author || ''))
                    || String(left.title || '').localeCompare(String(right.title || ''));
            }

            return String(left.title || '').localeCompare(String(right.title || ''));
        });
    },

    renderBundledPuzzleLibrary() {
        const container = document.getElementById('home-puzzle-library');
        const summary = document.getElementById('home-puzzle-library-summary');
        if (!container || !summary) return;

        const searchValue = document.getElementById('home-puzzle-search')?.value || '';
        const sortValue = document.getElementById('home-puzzle-sort')?.value || 'title';
        const entries = this._filterAndSortPuzzleEntries?.(this.puzzleIndex || [], {
            query: searchValue,
            sort: sortValue
        }) || [];
        const progressLookup = this._getBundledPuzzleProgressLookup?.() || {};

        summary.textContent = entries.length
            ? `Showing ${entries.length} of ${this.puzzleIndex.length} bundled puzzle${this.puzzleIndex.length === 1 ? '' : 's'}. Load one directly, or search by title, author, or file id.`
            : `No bundled puzzles match "${searchValue.trim()}".`;

        container.innerHTML = '';

        if (!entries.length) {
            const empty = document.createElement('p');
            empty.className = 'muted-text';
            empty.textContent = 'Try a different search or sort option, or clear the query to see the full bundled library again.';
            container.appendChild(empty);
            return;
        }

        const fragment = document.createDocumentFragment();
        entries.forEach((entry) => {
            const card = document.createElement('article');
            card.className = 'info-card home-library-card';

            const eyebrow = document.createElement('p');
            eyebrow.className = 'card-eyebrow';
            eyebrow.textContent = entry.dailyEligible ? 'Bundled + Daily Eligible' : 'Bundled Puzzle';

            const heading = document.createElement('h3');
            heading.textContent = entry.title || entry.id || entry.file;

            const meta = document.createElement('p');
            meta.className = 'muted-text';
            meta.textContent = [entry.author, entry.date].filter(Boolean).join(' • ') || 'Bundled puzzle';

            const status = progressLookup[entry.file] || {};
            const detail = document.createElement('p');
            detail.className = 'muted-text';
            detail.textContent = status.completed
                ? `Completed${status.timeLabel ? ` in ${status.timeLabel}` : ''}.${status.recent ? ' Also saved as your most recent workspace.' : ''}`
                : status.recent
                    ? 'Saved as your most recent workspace.'
                    : 'Ready to load into the editor or play mode.';

            const actions = document.createElement('div');
            actions.className = 'daily-puzzle-actions';

            const editorButton = document.createElement('button');
            editorButton.type = 'button';
            editorButton.className = 'btn primary-btn';
            editorButton.dataset.puzzleFile = entry.file || '';
            editorButton.dataset.loadMode = 'editor';
            editorButton.textContent = 'Load in Editor';

            const playButton = document.createElement('button');
            playButton.type = 'button';
            playButton.className = 'btn secondary-btn';
            playButton.dataset.puzzleFile = entry.file || '';
            playButton.dataset.loadMode = 'play';
            playButton.textContent = 'Play Puzzle';

            actions.append(editorButton, playButton);
            card.append(eyebrow, heading, meta, detail, actions);
            fragment.appendChild(card);
        });

        container.appendChild(fragment);
    },

    renderHomeDashboard() {
        const stats = this._getDashboardSnapshot?.();
        if (!stats) return;

        const bundledEl = document.getElementById('home-stat-bundled');
        const completedEl = document.getElementById('home-stat-completed');
        const recentEl = document.getElementById('home-stat-recent');
        const streakEl = document.getElementById('home-stat-streak');

        if (bundledEl) bundledEl.textContent = String(stats.bundledCount);
        if (completedEl) completedEl.textContent = String(stats.completedCount);
        if (recentEl) recentEl.textContent = stats.hasRecentWorkspace ? '1' : '0';
        if (streakEl) streakEl.textContent = String(stats.dailyStreak || 0);

        const { featured, recommended } = this._selectFeaturedAndRecommendedPuzzles?.(
            this.puzzleIndex || [],
            stats.progressLookup || {}
        ) || {};

        this._renderDashboardCard?.('featured', featured, stats.progressLookup || {}, {
            emptyTitle: 'No featured puzzle yet',
            emptySummary: 'Load bundled puzzles to populate the featured spotlight.'
        });
        this._renderDashboardCard?.('recommended', recommended, stats.progressLookup || {}, {
            emptyTitle: 'No recommendation yet',
            emptySummary: 'Complete or load a puzzle to start receiving recommendations.'
        });

        const dailyProgressEl = document.getElementById('daily-puzzle-progress');
        if (dailyProgressEl) {
            if (!stats.dailyCompletionCount) {
                dailyProgressEl.textContent =
                    'Daily completions and streaks will appear here after you finish a daily puzzle.';
            } else {
                dailyProgressEl.textContent =
                    `Current daily streak: ${stats.dailyStreak}. Completed ${stats.dailyCompletionCount} daily puzzle${stats.dailyCompletionCount === 1 ? '' : 's'} so far.${stats.latestDailyCompletion ? ` Latest: ${stats.latestDailyCompletion}.` : ''}`;
            }
        }
    },

    _renderDashboardCard(kind, entry, progressLookup = {}, emptyState = {}) {
        const titleEl = document.getElementById(`home-${kind}-title`);
        const summaryEl = document.getElementById(`home-${kind}-summary`);
        const editorButton = document.getElementById(`home-${kind}-editor-button`);
        const playButton = document.getElementById(`home-${kind}-play-button`);

        if (!titleEl || !summaryEl || !editorButton || !playButton) return;

        if (!entry) {
            titleEl.textContent = emptyState.emptyTitle || 'Unavailable';
            summaryEl.textContent = emptyState.emptySummary || 'No puzzle is available.';
            editorButton.disabled = true;
            playButton.disabled = true;
            delete editorButton.dataset.puzzleFile;
            delete playButton.dataset.puzzleFile;
            return;
        }

        const progress = progressLookup[entry.file] || {};
        const author = entry.author ? ` by ${entry.author}` : '';
        const completion = progress.completed
            ? ` Completed${progress.timeLabel ? ` in ${progress.timeLabel}` : ''}.`
            : '';
        const recent = progress.recent ? ' Saved in your recent workspace.' : '';

        titleEl.textContent = entry.title || entry.id || entry.file;
        summaryEl.textContent = `${entry.date || 'Bundled puzzle'}${author}.${completion}${recent} Load it in the editor if you want to inspect and edit the fill, or in play mode for a cleaner solve.`;

        [editorButton, playButton].forEach((button) => {
            button.disabled = false;
            button.dataset.puzzleFile = entry.file || '';
            button.dataset.label = entry.title || entry.id || entry.file || '';
        });
    }
};
