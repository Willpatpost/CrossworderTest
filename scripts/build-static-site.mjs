import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');
const outputDir = path.join(rootDir, 'dist');

const rootFiles = ['index.html', 'main.js', 'style.css'];
const runtimeDirectories = [
    'app',
    'grid',
    'providers',
    'solver',
    'ui',
    'utils',
    'data/clues_by_prefix',
    'data/daily_words_by_length',
    'data/puzzles',
    'data/playable_words_by_length',
    'data/search',
    'data/wordnet',
    'data/words_by_length'
];

function assertSafeOutputDirectory() {
    if (path.dirname(outputDir) !== rootDir || path.basename(outputDir) !== 'dist') {
        throw new Error(`Refusing to replace unexpected build directory: ${outputDir}`);
    }
}

async function copyRelativePath(relativePath) {
    const sourcePath = path.join(rootDir, relativePath);
    const destinationPath = path.join(outputDir, relativePath);
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.cp(sourcePath, destinationPath, { recursive: true });
}

async function directorySize(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    let total = 0;

    for (const entry of entries) {
        const entryPath = path.join(directory, entry.name);
        total += entry.isDirectory()
            ? await directorySize(entryPath)
            : (await fs.stat(entryPath)).size;
    }

    return total;
}

async function main() {
    assertSafeOutputDirectory();
    await fs.rm(outputDir, { recursive: true, force: true });
    await fs.mkdir(outputDir, { recursive: true });

    for (const relativePath of [...rootFiles, ...runtimeDirectories]) {
        await copyRelativePath(relativePath);
    }

    const sizeBytes = await directorySize(outputDir);
    console.log(
        `Built static site in ${path.relative(rootDir, outputDir)} `
        + `(${(sizeBytes / 1024 / 1024).toFixed(1)} MiB).`
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
