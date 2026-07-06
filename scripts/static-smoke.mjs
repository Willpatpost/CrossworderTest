import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');
const port = 0;

const expectedPaths = [
    '/',
    '/main.js',
    '/app/CrosswordApp.js',
    '/solver/SolverWorker.js',
    '/data/puzzles/easy.json',
    '/data/puzzles/puzzle_index.json',
    '/data/search/clue-search.json',
    '/data/words_by_length/words-3.txt'
];

function resolveRequestPath(url = '/') {
    const requestUrl = new URL(url, 'http://localhost');
    const relativePath = requestUrl.pathname === '/'
        ? 'index.html'
        : decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '');
    const resolvedPath = path.resolve(rootDir, relativePath);
    return resolvedPath.startsWith(rootDir) ? resolvedPath : null;
}

function createServer() {
    return http.createServer(async (req, res) => {
        try {
            const filePath = resolveRequestPath(req.url);
            if (!filePath) {
                res.writeHead(403);
                res.end('Forbidden');
                return;
            }

            const body = await fs.readFile(filePath);
            res.writeHead(200);
            res.end(body);
        } catch {
            res.writeHead(404);
            res.end('Not found');
        }
    });
}

async function fetchText(baseUrl, requestPath) {
    const resp = await fetch(`${baseUrl}${requestPath}`);
    if (!resp.ok) {
        throw new Error(`${requestPath} returned HTTP ${resp.status}`);
    }
    return resp.text();
}

async function main() {
    const server = createServer();
    await new Promise((resolve) => server.listen(port, resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
        const responses = await Promise.all(
            expectedPaths.map(async (requestPath) => [
                requestPath,
                await fetchText(baseUrl, requestPath)
            ])
        );
        const responseMap = Object.fromEntries(responses);

        if (!responseMap['/'].includes('<script type="module" src="main.js"></script>')) {
            throw new Error('index.html does not load main.js as a module');
        }

        const puzzleIndex = JSON.parse(responseMap['/data/puzzles/puzzle_index.json']);
        if (!Array.isArray(puzzleIndex) || puzzleIndex.length === 0) {
            throw new Error('puzzle_index.json is empty');
        }

        const searchIndex = JSON.parse(responseMap['/data/search/clue-search.json']);
        if (!Array.isArray(searchIndex.entries) || searchIndex.entries.length === 0) {
            throw new Error('clue-search.json is empty');
        }

        console.log(`Static smoke test passed at ${baseUrl}.`);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
