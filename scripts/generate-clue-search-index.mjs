import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DefinitionsProvider } from '../providers/DefinitionsProvider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const defsDir = path.join(rootDir, 'data', 'defs_by_length');
const outputDir = path.join(rootDir, 'data', 'search');
const outputPath = path.join(outputDir, 'clue-search.json');

function normalizeEntry(entry) {
    return {
        clue: entry?.c || '',
        source: entry?.s || '',
        date: entry?.d === '0' ? '' : entry?.d || ''
    };
}

async function main() {
    const provider = new DefinitionsProvider();
    const files = (await fs.readdir(defsDir))
        .filter((file) => /^defs-\d+\.json$/.test(file))
        .sort((left, right) => {
            const leftLen = Number(left.match(/\d+/)?.[0] || 0);
            const rightLen = Number(right.match(/\d+/)?.[0] || 0);
            return leftLen - rightLen;
        });

    const entries = [];

    for (const file of files) {
        const defsMap = JSON.parse(await fs.readFile(path.join(defsDir, file), 'utf8'));

        Object.entries(defsMap).forEach(([word, rawEntries]) => {
            const ranked = provider._rankEntries((rawEntries || []).map(normalizeEntry));
            const best = ranked[0];
            if (!best?.clue) return;

            entries.push({
                w: word.toUpperCase(),
                c: best.clue,
                s: best.source,
                d: best.date || '0'
            });
        });
    }

    const payload = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        entryCount: entries.length,
        entries
    };

    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(payload)}\n`);
    console.log(`Wrote ${entries.length} clue-search entries to ${path.relative(rootDir, outputPath)}.`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
