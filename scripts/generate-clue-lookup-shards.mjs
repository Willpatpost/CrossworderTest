import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DefinitionsProvider } from '../providers/DefinitionsProvider.js';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');
const searchIndexPath = path.join(rootDir, 'data', 'search', 'clue-search.json');
const outputDir = path.join(rootDir, 'data', 'clues_by_prefix');

function getShardKey(word) {
    const initial = String(word || '').charAt(0).toLowerCase();
    return /^[a-z]$/.test(initial) ? initial : 'other';
}

function assertSafeOutputDirectory() {
    if (
        path.dirname(outputDir) !== path.join(rootDir, 'data')
        || path.basename(outputDir) !== 'clues_by_prefix'
    ) {
        throw new Error(`Refusing to replace unexpected shard directory: ${outputDir}`);
    }
}

async function main() {
    const searchIndex = JSON.parse(await fs.readFile(searchIndexPath, 'utf8'));
    if (!Array.isArray(searchIndex.entries) || !searchIndex.entries.length) {
        throw new Error('Generate the compact clue-search index before lookup shards.');
    }

    const provider = new DefinitionsProvider({ basePath: 'unused' });
    provider._searchIndexSources = searchIndex.sources || [];
    provider._searchIndexDates = searchIndex.dates || [];
    const sourceIds = new Map(
        provider._searchIndexSources.map((source, index) => [source, index])
    );
    const dateIds = new Map(
        provider._searchIndexDates.map((date, index) => [date, index])
    );

    const shards = new Map();
    for (const rawEntry of searchIndex.entries) {
        const entry = provider._normalizeSearchIndexEntry(rawEntry);
        if (!entry.word || !entry.clue) continue;

        const shardKey = getShardKey(entry.word);
        if (!shards.has(shardKey)) shards.set(shardKey, {});
        shards.get(shardKey)[entry.word] = [
            entry.clue,
            sourceIds.get(entry.source),
            dateIds.get(entry.date || '0'),
            Number(provider._scoreEntry(entry).toFixed(3))
        ];
    }

    assertSafeOutputDirectory();
    await fs.rm(outputDir, { recursive: true, force: true });
    await fs.mkdir(outputDir, { recursive: true });

    const shardManifest = {};
    let entryCount = 0;
    let sizeBytes = 0;

    for (const shardKey of [...shards.keys()].sort()) {
        const entries = shards.get(shardKey);
        const file = `clues-${shardKey}.json`;
        const serialized = `${JSON.stringify(entries)}\n`;
        await fs.writeFile(path.join(outputDir, file), serialized);

        const count = Object.keys(entries).length;
        entryCount += count;
        sizeBytes += Buffer.byteLength(serialized);
        shardManifest[shardKey] = { file, entryCount: count };
    }

    const manifest = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        entryCount,
        entryFormat: ['clue', 'sourceIndex', 'dateIndex', 'qualityScore'],
        sources: searchIndex.sources || [],
        dates: searchIndex.dates || [],
        shards: shardManifest
    };
    const manifestText = `${JSON.stringify(manifest)}\n`;
    await fs.writeFile(path.join(outputDir, 'manifest.json'), manifestText);
    sizeBytes += Buffer.byteLength(manifestText);

    console.log(
        `Wrote ${entryCount} clue lookup entries across ${Object.keys(shardManifest).length} shards `
        + `(${(sizeBytes / 1024 / 1024).toFixed(1)} MiB).`
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
