import test from 'node:test';
import assert from 'node:assert/strict';
import { PuzzleSummaryDisplay } from '../ui/display/PuzzleSummaryDisplay.js';

class FakeElement {
    constructor(tagName) {
        this.tagName = tagName;
        this.children = [];
        this.className = '';
        this.textContent = '';
        this.classes = new Set();
        this.classList = {
            add: (...names) => names.forEach((name) => this.classes.add(name))
        };
    }

    set innerHTML(_value) {
        throw new Error('Puzzle summaries must not render HTML strings.');
    }

    append(...children) {
        this.children.push(...children);
    }

    replaceChildren(...children) {
        this.children = children;
    }
}

test('PuzzleSummaryDisplay renders imported metadata as inert text', () => {
    const originalDocument = globalThis.document;
    globalThis.document = {
        createElement(tagName) {
            return new FakeElement(tagName);
        }
    };

    try {
        const container = new FakeElement('div');
        const display = new PuzzleSummaryDisplay({ puzzleSummary: container });
        const title = '<img src=x onerror="globalThis.pwned=true">';
        const author = '<script>globalThis.pwned=true</script>';

        display.update([['A', '']], {}, {}, { title, author });

        assert.equal(container.children.length, 6);
        assert.equal(container.children[0].children[0].textContent, title);
        assert.equal(container.children[0].children[1].textContent, author);
        assert.equal(globalThis.pwned, undefined);
    } finally {
        globalThis.document = originalDocument;
        delete globalThis.pwned;
    }
});

test('PuzzleSummaryDisplay replaces stale content for empty and invalid grids', () => {
    const originalDocument = globalThis.document;
    globalThis.document = {
        createElement(tagName) {
            return new FakeElement(tagName);
        }
    };

    try {
        const container = new FakeElement('div');
        const display = new PuzzleSummaryDisplay({ puzzleSummary: container });

        display.update([['#']], {}, {});
        assert.equal(container.children.length, 1);
        assert.equal(container.children[0].classes.has('summary-item-wide'), true);

        display.update([], {}, {});
        assert.deepEqual(container.children, []);
    } finally {
        globalThis.document = originalDocument;
    }
});
