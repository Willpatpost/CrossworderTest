import { StatusDisplay } from './display/StatusDisplay.js';
import { SearchResultsDisplay } from './display/SearchResultsDisplay.js';
import { PuzzleSummaryDisplay } from './display/PuzzleSummaryDisplay.js';
import { ClueListDisplay } from './display/ClueListDisplay.js';

export class DisplayManager {
    constructor() {
        this.statusDisplay = document.getElementById('status-display');
        this.liveStatus = document.getElementById('live-status');

        this.editorAcrossDisplay = document.getElementById('across-display');
        this.editorDownDisplay = document.getElementById('down-display');
        this.playAcrossDisplay = document.getElementById('play-across-display');
        this.playDownDisplay = document.getElementById('play-down-display');
        this.playActiveClueLabel = document.getElementById('play-active-clue-label');
        this.playActiveClueText = document.getElementById('play-active-clue-text');
        this.playActiveClueSource = document.getElementById('play-active-clue-source');

        this.dropdown = document.getElementById('search-dropdown');
        this.matchesCount = document.getElementById('matches-count');
        this.puzzleSummary = document.getElementById('puzzle-summary');
        this._activeListMode = 'editor';

        this.status = new StatusDisplay({
            statusDisplay: this.statusDisplay,
            liveStatus: this.liveStatus
        });
        this.searchResults = new SearchResultsDisplay({
            dropdown: this.dropdown,
            matchesCount: this.matchesCount
        });
        this.puzzleSummaryDisplay = new PuzzleSummaryDisplay({
            puzzleSummary: this.puzzleSummary
        });
        this.clueLists = new ClueListDisplay({
            editorAcrossDisplay: this.editorAcrossDisplay,
            editorDownDisplay: this.editorDownDisplay,
            playAcrossDisplay: this.playAcrossDisplay,
            playDownDisplay: this.playDownDisplay,
            playActiveClueLabel: this.playActiveClueLabel,
            playActiveClueText: this.playActiveClueText,
            playActiveClueSource: this.playActiveClueSource
        });
    }

    updateStatus(message, append = false) {
        this.status.update(message, append);
    }

    async updateWordLists(
        slots,
        solution = {},
        onWordClick,
        definitionsProvider = null,
        isPlayMode = false,
        clueMap = {}
    ) {
        this._activeListMode = isPlayMode ? 'play' : 'editor';
        this._syncClueListBindings();
        await this.clueLists.updateWordLists(
            slots,
            solution,
            onWordClick,
            definitionsProvider,
            isPlayMode,
            clueMap
        );
    }

    updateSearchResults(matches, onSelect, options = {}) {
        this.searchResults.update(matches, onSelect, options);
    }

    highlightSlotInList(slotId) {
        this._syncClueListBindings();
        const containers = this._activeListMode === 'play'
            ? [this.playAcrossDisplay, this.playDownDisplay]
            : [this.editorAcrossDisplay, this.editorDownDisplay];

        containers.forEach((container) => {
            if (!container) return;

            container.querySelectorAll('.word-list-item').forEach((el) => {
                el.classList.remove('selected-clue');
                el.removeAttribute('aria-current');
            });
        });

        for (const container of containers) {
            if (!container) continue;

            const target = container.querySelector(`.word-list-item[data-slot-id="${slotId}"]`);
            if (!target) continue;

            target.classList.add('selected-clue');
            target.setAttribute('aria-current', 'true');
            this._updateActiveCluePanelFromItem(target);
            target.scrollIntoView({
                block: 'nearest',
                behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
                    ? 'auto'
                    : 'smooth'
            });
            break;
        }
    }

    updatePuzzleSummary(grid, slots, clueMap = {}, metadata = {}) {
        this.puzzleSummaryDisplay.update(grid, slots, clueMap, metadata);
    }

    _describeClueSource(clueResult) {
        if (!clueResult) return null;

        if (typeof clueResult === 'string') {
            return {
                kind: 'local',
                label: 'Local',
                detail: clueResult
            };
        }

        if (clueResult.kind === 'authored') {
            return clueResult;
        }

        const source = String(clueResult.source || '').trim();
        const date = String(clueResult.date || '').trim();

        if (source.toUpperCase() === 'WEB') {
            return {
                kind: 'web',
                label: 'Web',
                detail: clueResult.attribution || 'Dictionary API fallback'
            };
        }

        const detail = [source, date].filter(Boolean).join(', ');
        return {
            kind: 'local',
            label: 'Local',
            detail: detail || 'Bundled clue history'
        };
    }

    _updateActiveCluePanelFromItem(item) {
        this._syncClueListBindings();
        this.clueLists._updateActiveCluePanelFromItem(item);
    }

    _syncClueListBindings() {
        this.clueLists.editorAcrossDisplay = this.editorAcrossDisplay;
        this.clueLists.editorDownDisplay = this.editorDownDisplay;
        this.clueLists.playAcrossDisplay = this.playAcrossDisplay;
        this.clueLists.playDownDisplay = this.playDownDisplay;
        this.clueLists.playActiveClueLabel = this.playActiveClueLabel;
        this.clueLists.playActiveClueText = this.playActiveClueText;
        this.clueLists.playActiveClueSource = this.playActiveClueSource;
        this.clueLists._activeListMode = this._activeListMode ?? this.clueLists._activeListMode;
    }
}
