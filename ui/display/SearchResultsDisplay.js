export class SearchResultsDisplay {
    constructor({ dropdown, matchesCount, input }) {
        this.dropdown = dropdown;
        this.matchesCount = matchesCount;
        this.input = input;
        this._matches = [];
        this._onSelect = null;
        this._activeIndex = -1;
        this._optionNodes = [];

        this._bindInputNavigation();
    }

    update(matches, onSelect, options = {}) {
        if (!this.dropdown) return;

        const { message = '', showDropdown = matches.length > 0, mode = 'answer' } = options;
        this._matches = Array.isArray(matches) ? matches : [];
        this._onSelect = typeof onSelect === 'function' ? onSelect : null;
        this._activeIndex = -1;
        this._optionNodes = [];

        this.dropdown.innerHTML = '';

        if (!showDropdown || !matches.length) {
            this._hideDropdown();

            if (this.matchesCount) {
                this.matchesCount.textContent = message;
            }

            return;
        }

        this.dropdown.classList.remove('hidden');
        this.dropdown.removeAttribute('aria-hidden');
        this._setInputExpanded(true);

        if (this.matchesCount) {
            this.matchesCount.textContent = message;
        }

        const fragment = document.createDocumentFragment();

        matches.forEach((match, index) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'search-result-item';
            item.id = `search-result-${index}`;
            item.setAttribute('role', 'option');
            item.setAttribute('aria-selected', 'false');

            if (mode === 'clue' && match && typeof match === 'object') {
                const title = document.createElement('span');
                title.className = 'search-result-title';
                title.textContent = match.word || '';

                const clue = document.createElement('span');
                clue.className = 'search-result-subtitle';
                clue.textContent = match.clue || 'No clue text available';

                item.append(title, clue);
            } else {
                item.textContent = match;
            }

            item.addEventListener('click', () => {
                this._selectMatch(index);
            });

            item.addEventListener('mouseenter', () => {
                this._setActiveIndex(index);
            });

            this._optionNodes.push(item);
            fragment.appendChild(item);
        });

        this.dropdown.appendChild(fragment);
    }

    _bindInputNavigation() {
        if (!this.input) return;

        this.input.addEventListener('keydown', (event) => {
            if (this.dropdown?.classList.contains('hidden')) return;
            if (!this._optionNodes.length) return;

            if (event.key === 'ArrowDown') {
                event.preventDefault();
                this._moveActiveIndex(1);
                return;
            }

            if (event.key === 'ArrowUp') {
                event.preventDefault();
                this._moveActiveIndex(-1);
                return;
            }

            if (event.key === 'Enter' && this._activeIndex >= 0) {
                event.preventDefault();
                this._selectMatch(this._activeIndex);
                return;
            }

            if (event.key === 'Escape') {
                this._hideDropdown();
            }
        });
    }

    _moveActiveIndex(delta) {
        const nextIndex = this._activeIndex < 0
            ? (delta > 0 ? 0 : this._optionNodes.length - 1)
            : (this._activeIndex + delta + this._optionNodes.length) % this._optionNodes.length;
        this._setActiveIndex(nextIndex);
    }

    _setActiveIndex(index) {
        this._activeIndex = index;

        this._optionNodes.forEach((node, nodeIndex) => {
            const selected = nodeIndex === index;
            node.setAttribute('aria-selected', String(selected));
            if (selected) {
                node.scrollIntoView({ block: 'nearest' });
            }
        });

        const activeNode = this._optionNodes[index];
        if (this.input) {
            if (activeNode) {
                this.input.setAttribute('aria-activedescendant', activeNode.id);
            } else {
                this.input.removeAttribute('aria-activedescendant');
            }
        }
    }

    _selectMatch(index) {
        const match = this._matches[index];
        this._hideDropdown();
        if (this._onSelect) {
            this._onSelect(match);
        }
    }

    _setInputExpanded(expanded) {
        if (!this.input) return;
        this.input.setAttribute('aria-expanded', String(expanded));
        if (!expanded) {
            this.input.removeAttribute('aria-activedescendant');
        }
    }

    _hideDropdown() {
        if (!this.dropdown) return;
        this.dropdown.classList.add('hidden');
        this.dropdown.setAttribute('aria-hidden', 'true');
        this._setInputExpanded(false);
        this._activeIndex = -1;
        this._optionNodes = [];
    }
}
