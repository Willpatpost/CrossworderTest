import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { isPathInside, resolveStaticPath } from '../scripts/static-path.mjs';

const rootDir = path.resolve('static-test-root');

test('resolveStaticPath resolves root and asset requests inside the site root', () => {
    assert.equal(resolveStaticPath(rootDir, '/'), path.join(rootDir, 'index.html'));
    assert.equal(resolveStaticPath(rootDir, '/main.js'), path.join(rootDir, 'main.js'));
    assert.equal(
        resolveStaticPath(rootDir, '/data/puzzles/easy.json?cache=1'),
        path.join(rootDir, 'data', 'puzzles', 'easy.json')
    );
});

test('resolveStaticPath rejects traversal and malformed encoded paths', () => {
    assert.equal(resolveStaticPath(rootDir, '/..%2foutside.txt'), null);
    assert.equal(resolveStaticPath(rootDir, '/..%5coutside.txt'), null);
    assert.equal(resolveStaticPath(rootDir, '/%E0%A4%A'), null);
});

test('isPathInside rejects sibling directories that share the root prefix', () => {
    assert.equal(isPathInside(rootDir, path.join(rootDir, 'main.js')), true);
    assert.equal(isPathInside(rootDir, `${rootDir}-backup`), false);
});
