export class SearchResultsDisplay {
    constructor({ dropdown, matchesCount }) {
        this.dropdown = dropdown;
        this.matchesCount = matchesCount;
    }

    update(matches, onSelect, options = {}) {
        if (!this.dropdown) return;

        const { message = '', showDropdown = matches.length > 0, mode = 'answer' } = options;

        this.dropdown.innerHTML = '';

        if (!showDropdown || !matches.length) {
            this.dropdown.classList.add('hidden');

            if (this.matchesCount) {
                this.matchesCount.textContent = message;
            }

            return;
        }

        this.dropdown.classList.remove('hidden');

        if (this.matchesCount) {
            this.matchesCount.textContent = message;
        }

        const fragment = document.createDocumentFragment();

        matches.forEach((match) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'search-result-item';

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
                this.dropdown.classList.add('hidden');
                if (typeof onSelect === 'function') {
                    onSelect(match);
                }
            });

            fragment.appendChild(item);
        });

        this.dropdown.appendChild(fragment);
    }
}
