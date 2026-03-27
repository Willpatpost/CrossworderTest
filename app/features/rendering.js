export const renderingMethods = {
    rebuildGridState() {
        const { slots } = this.constraintManager.buildDataStructures(this.grid);
        this.slots = slots;
    },

    render() {
        if (!this.grid.length || !this.grid[0]?.length) return;

        this.rebuildGridState();

        const container = this._getActiveGridContainer();
        if (!container) return;

        this.gridManager.render(this.grid, container, this);
        this.cells = this.gridManager.cells;

        this.refreshWordList();
    },

    refreshWordList() {
        const wordClickHandler = (slot) => {
            if (this.modes.isPlayMode) {
                const [r, c] = slot.positions[0];
                this.gridManager.selectedCell = { r, c };
                this.gridManager.selectedDirection = slot.direction;
                this.gridManager._updateHighlights(this);
                return;
            }

            const word = this.currentSolution?.[slot.id] || this._extractSlotWord(slot);
            this.popups.show(word);
        };

        this.display.updateWordLists(
            this.slots,
            this.currentSolution || {},
            (slot) => {
                if (this.modes.isPlayMode && this.isPlayPaused) {
                    return;
                }

                wordClickHandler(slot);
            },
            this.definitions,
            this.modes.isPlayMode,
            this.currentPuzzleClues
        );
        this.display.updatePuzzleSummary(this.grid, this.slots, this.currentPuzzleClues);
    },

    syncActiveGridToDOM() {
        const container = this._getActiveGridContainer();
        if (!container) return;

        if (container !== this.gridManager.container) {
            this.render();
            return;
        }

        this.gridManager.syncGridToDOM(this.grid, this.slots);
        this.cells = this.gridManager.cells;

        if (this.modes.isPlayMode) {
            this.gridManager._updateHighlights(this);
        }

        this.display.updatePuzzleSummary(this.grid, this.slots, this.currentPuzzleClues);
    },

    _extractSlotWord(slot) {
        return slot.positions
            .map(([r, c]) => {
                const val = this.grid[r][c];
                return /^[A-Z]$/i.test(val) ? val.toUpperCase() : '';
            })
            .join('');
    },

    _getActiveGridContainer() {
        if (this.modes.isPlayMode) {
            return document.getElementById('play-grid-container');
        }
        return document.getElementById('grid-container');
    },

    _getFirstSlot() {
        const allSlots = Object.values(this.slots || {});
        if (!allSlots.length) return null;

        const acrossFirst = allSlots
            .filter((slot) => slot.direction === 'across')
            .sort((a, b) => a.number - b.number)[0];

        return acrossFirst || allSlots.sort((a, b) => a.number - b.number)[0] || null;
    },

    _isInBounds(r, c) {
        return (
            r >= 0 &&
            c >= 0 &&
            r < this.grid.length &&
            c < this.grid[0].length
        );
    }
};
