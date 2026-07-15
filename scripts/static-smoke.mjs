import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolveStaticPath } from './static-path.mjs';

const __filename = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(__filename), '..');
const rootDir = process.argv[2]
    ? path.resolve(process.argv[2])
    : repositoryRoot;
const port = 0;

const expectedPaths = [
    '/',
    '/main.js',
    '/app/CrosswordApp.js',
    '/solver/SolverWorker.js',
    '/data/puzzles/easy.json',
    '/data/puzzles/puzzle_index.json',
    '/data/clues_by_prefix/manifest.json',
    '/data/clues_by_prefix/clues-a.json',
    '/data/search/clue-search.json',
    '/data/words_by_length/words-3.txt'
];

function resolveRequestPath(url = '/') {
    return resolveStaticPath(rootDir, url);
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

        const clueManifest = JSON.parse(responseMap['/data/clues_by_prefix/manifest.json']);
        const clueShard = JSON.parse(responseMap['/data/clues_by_prefix/clues-a.json']);
        if (
            clueManifest.schemaVersion !== 1
            || clueManifest.entryCount !== searchIndex.entryCount
            || !clueManifest.shards?.a
            || !Array.isArray(clueShard.AAA)
        ) {
            throw new Error('Compact clue lookup shards are invalid');
        }

        if (rootDir !== repositoryRoot) {
            try {
                await fs.access(path.join(rootDir, 'data', 'defs_by_length'));
                throw new Error('Production artifact includes archival definition files');
            } catch (error) {
                if (error?.code !== 'ENOENT') throw error;
            }
        }

        if (searchIndex.schemaVersion >= 2) {
            const firstEntry = searchIndex.entries[0];
            if (
                !Array.isArray(firstEntry)
                || firstEntry.length !== 4
                || !Array.isArray(searchIndex.sources)
                || !Array.isArray(searchIndex.dates)
            ) {
                throw new Error('clue-search.json has an invalid compact schema');
            }
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
