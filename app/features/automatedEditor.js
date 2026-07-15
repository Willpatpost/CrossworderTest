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
            )
        };
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

    generateAutomatedLayout(settings = null) {
        const layout = this.createRandomAutomatedLayout(
            settings || this._readAutomatedLayoutSettings()
        );

        this.importPuzzleGrid(layout.grid, { sourceLabel: 'automated layout' });
        this.activePuzzleSource = {
            kind: 'automated',
            label: 'Automated layout'
        };
        this._updateRecentPuzzleUI?.();
        this._scheduleEditorAutosave?.();
        this.display.updateStatus(
            `Generated an automated ${layout.grid.length}x${layout.grid[0].length} layout with ${layout.rowDividers.length} blocked row${layout.rowDividers.length === 1 ? '' : 's'} and ${layout.columnDividers.length} blocked column${layout.columnDividers.length === 1 ? '' : 's'}.`,
            true
        );

        return layout;
    },

    async fillAutomatedGrid({ clearExisting = false } = {}) {
        if (this.isSolving || !this.grid?.length) return false;

        this._recordEditorSnapshot?.();
        if (clearExisting) {
            this.grid = this.grid.map((row) =>
                row.map((cell) => cell === '#' ? '#' : '')
            );
            this.currentSolution = null;
            this.rebuildGridState?.();
            this.syncActiveGridToDOM?.();
            this.refreshWordList?.();
        }

        const solved = await this.handleSolve?.();
        if (!solved) return false;

        this.activePuzzleSource = {
            kind: 'automated',
            label: 'Automated fill'
        };
        this._updateRecentPuzzleUI?.();
        this._scheduleEditorAutosave?.();
        return true;
    },

    async generateAndFillAutomatedGrid() {
        this.generateAutomatedLayout();
        return this.fillAutomatedGrid({ clearExisting: false });
    }
};
