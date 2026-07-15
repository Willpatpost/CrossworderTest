import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolveStaticPath } from './static-path.mjs';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');
const port = Number(process.argv[2] || process.env.PORT || 4173);

const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8'
};

function resolveRequestPath(url = '/') {
    return resolveStaticPath(rootDir, url, `http://localhost:${port}`);
}

const server = http.createServer(async (req, res) => {
    try {
        const filePath = resolveRequestPath(req.url);
        if (!filePath) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }

        const stat = await fs.stat(filePath);
        const finalPath = stat.isDirectory()
            ? path.join(filePath, 'index.html')
            : filePath;
        const body = await fs.readFile(finalPath);
        const contentType = contentTypes[path.extname(finalPath)] || 'application/octet-stream';

        res.writeHead(200, { 'content-type': contentType });
        res.end(body);
    } catch {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Not found');
    }
});

server.listen(port, () => {
    console.log(`Crossworder static server running at http://localhost:${port}/`);
});
