import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertValidDailyPuzzlePack } from '../utils/DailyPuzzlePackValidator.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(rootDir, 'data', 'puzzles', 'puzzle-of-the-day.json');
const payload = JSON.parse(await fs.readFile(inputPath, 'utf8'));

assertValidDailyPuzzlePack(payload);
console.log(`Validated daily puzzle pack for ${payload.generatedFor}.`);
