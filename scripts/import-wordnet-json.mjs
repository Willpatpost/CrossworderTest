import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');
const inputZipPath = path.join(rootDir, 'data', 'english-wordnet-2025-plus-json.zip');
const wordnetOutputDir = path.join(rootDir, 'data', 'wordnet');
const playableOutputDir = path.join(rootDir, 'data', 'playable_words_by_length');
const MIN_WORD_LENGTH = 3;
const MAX_WORD_LENGTH = 15;

function readUInt16(buffer, offset) {
    return buffer.readUInt16LE(offset);
}

function readUInt32(buffer, offset) {
    return buffer.readUInt32LE(offset);
}

function findEndOfCentralDirectory(buffer) {
    const signature = 0x06054b50;
    const minOffset = Math.max(0, buffer.length - 65557);

    for (let offset = buffer.length - 22; offset >= minOffset; offset--) {
        if (readUInt32(buffer, offset) === signature) return offset;
    }

    throw new Error('Could not find ZIP central directory.');
}

function readZipEntries(buffer) {
    const eocdOffset = findEndOfCentralDirectory(buffer);
    const entryCount = readUInt16(buffer, eocdOffset + 10);
    const centralDirectoryOffset = readUInt32(buffer, eocdOffset + 16);
    const entries = new Map();
    let offset = centralDirectoryOffset;

    for (let index = 0; index < entryCount; index++) {
        if (readUInt32(buffer, offset) !== 0x02014b50) {
            throw new Error(`Invalid ZIP central directory entry at ${offset}.`);
        }

        const compressionMethod = readUInt16(buffer, offset + 10);
        const compressedSize = readUInt32(buffer, offset + 20);
        const uncompressedSize = readUInt32(buffer, offset + 24);
        const nameLength = readUInt16(buffer, offset + 28);
        const extraLength = readUInt16(buffer, offset + 30);
        const commentLength = readUInt16(buffer, offset + 32);
        const localHeaderOffset = readUInt32(buffer, offset + 42);
        const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);

        entries.set(name, {
            name,
            compressionMethod,
            compressedSize,
            uncompressedSize,
            localHeaderOffset
        });

        offset += 46 + nameLength + extraLength + commentLength;
    }

    return entries;
}

function inflateZipEntry(buffer, entry) {
    const offset = entry.localHeaderOffset;
    if (readUInt32(buffer, offset) !== 0x04034b50) {
        throw new Error(`Invalid local ZIP header for ${entry.name}.`);
    }

    const nameLength = readUInt16(buffer, offset + 26);
    const extraLength = readUInt16(buffer, offset + 28);
    const dataOffset = offset + 30 + nameLength + extraLength;
    const compressed = buffer.subarray(dataOffset, dataOffset + entry.compressedSize);

    if (entry.compressionMethod === 0) return compressed;
    if (entry.compressionMethod === 8) return zlib.inflateRawSync(compressed);

    throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod} for ${entry.name}.`);
}

function parseJsonEntry(buffer, entries, name) {
    const entry = entries.get(name);
    if (!entry) throw new Error(`Missing ${name} in WordNet archive.`);
    const inflated = inflateZipEntry(buffer, entry);

    if (inflated.length !== entry.uncompressedSize) {
        throw new Error(`Unexpected uncompressed size for ${name}.`);
    }

    return JSON.parse(inflated.toString('utf8'));
}

function normalizeAnswer(term) {
    const answer = String(term || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z]/g, '')
        .toUpperCase();

    if (answer.length < MIN_WORD_LENGTH || answer.length > MAX_WORD_LENGTH) return '';
    if (!/^[A-Z]+$/.test(answer)) return '';
    if (/^([A-Z])\1+$/.test(answer)) return '';
    if (/(.)\1{4,}/.test(answer)) return '';
    return answer;
}

function isLikelyProperTerm(term, synset) {
    const value = String(term || '');
    return /[A-Z]/.test(value.slice(1));
}

function isSensitiveDefinition(definition) {
    return /\b(offensive|ethnic slur|racial slur|derogatory|vulgar|obscene)\b/i.test(
        String(definition || '')
    );
}

function scoreEntry(answer, records) {
    const positions = new Set(records.map((record) => record.pos).filter(Boolean));
    const lexnames = new Set(records.map((record) => record.lexname).filter(Boolean));
    const hasDefinition = records.some((record) => record.definition);
    const hasCommonPartOfSpeech = [...positions].some((pos) => ['n', 'v', 'a', 's', 'r'].includes(pos));
    const properCount = records.filter((record) => record.isProper).length;
    const phraseCount = records.filter((record) => /[^A-Za-z]/.test(record.term)).length;
    const sensitiveCount = records.filter((record) => isSensitiveDefinition(record.definition)).length;

    let score = 40;
    if (hasDefinition) score += 24;
    if (hasCommonPartOfSpeech) score += 8;
    score += Math.min(records.length, 8) * 3;
    score += Math.min(positions.size, 4) * 2;
    score += Math.min(phraseCount, 3) * 2;
    score -= Math.max(0, answer.length - 10);
    score -= Math.min(properCount, 4) * 3;

    if (lexnames.has('noun.person') || lexnames.has('noun.location')) score -= 4;
    if (/^[IVXLCDM]+$/.test(answer)) score -= 35;
    if (/^[BCDFGHJKLMNPQRSTVWXYZ]{3,}$/.test(answer)) score -= 28;
    if (!/[AEIOUY]/.test(answer)) score -= 25;
    if ((answer.match(/[AEIOUY]/g) || []).length / answer.length > 0.85) score -= 12;
    if (sensitiveCount) score -= 60;

    return Math.max(0, Math.round(score));
}

function compactEntry(answer, records) {
    const definitions = [];
    const definitionKeys = new Set();
    const terms = [];
    const termKeys = new Set();
    const synonyms = new Set();
    const partsOfSpeech = new Set();
    let hasProper = false;

    for (const record of records) {
        if (!termKeys.has(record.term)) {
            termKeys.add(record.term);
            terms.push(record.term);
        }
        if (record.pos) partsOfSpeech.add(record.pos);
        if (record.isProper) hasProper = true;

        for (const synonym of record.members || []) {
            const normalized = normalizeAnswer(synonym);
            if (normalized && normalized !== answer) synonyms.add(normalized);
        }

        const definition = String(record.definition || '').trim();
        const key = `${definition}\u0000${record.pos || ''}`;
        if (definition && !definitionKeys.has(key)) {
            definitionKeys.add(key);
            definitions.push([definition, record.pos || '', record.term, record.synsetId]);
        }
    }

    return {
        t: terms.slice(0, 8),
        p: [...partsOfSpeech].sort(),
        d: definitions.slice(0, 8),
        s: [...synonyms].sort().slice(0, 24),
        q: scoreEntry(answer, records),
        proper: hasProper
    };
}

function shouldUseAsPlayable(answer, entry) {
    if (entry.q < 76) return false;
    if (/^[IVXLCDM]+$/.test(answer)) return false;
    if (/^[BCDFGHJKLMNPQRSTVWXYZ]{3,}$/.test(answer)) return false;
    if (entry.proper && entry.q < 82) return false;
    if (entry.d.some(([definition]) => isSensitiveDefinition(definition))) return false;
    return entry.d.length > 0;
}

function assertSafeOutputDirectory(outputDir, expectedName) {
    if (path.dirname(outputDir) !== path.join(rootDir, 'data') || path.basename(outputDir) !== expectedName) {
        throw new Error(`Refusing to replace unexpected output directory: ${outputDir}`);
    }
}

async function main() {
    const buffer = await fs.readFile(inputZipPath);
    const zipEntries = readZipEntries(buffer);
    const synsets = new Map();

    for (const name of [...zipEntries.keys()].sort()) {
        if (!/^(adj|adv|noun|verb)\..+\.json$/.test(name)) continue;

        const lexname = name.replace(/\.json$/, '');
        const payload = parseJsonEntry(buffer, zipEntries, name);
        Object.entries(payload).forEach(([synsetId, synset]) => {
            synsets.set(synsetId, { ...synset, lexname });
        });
    }

    const recordsByAnswer = new Map();
    const entryFiles = [...zipEntries.keys()].filter((name) => /^entries-.+\.json$/.test(name)).sort();

    for (const name of entryFiles) {
        const payload = parseJsonEntry(buffer, zipEntries, name);
        Object.entries(payload).forEach(([term, parts]) => {
            Object.values(parts || {}).forEach((part) => {
                (part?.sense || []).forEach((sense) => {
                    const synset = synsets.get(sense.synset);
                    if (!synset) return;

                    const answer = normalizeAnswer(term);
                    if (!answer) return;

                    const records = recordsByAnswer.get(answer) || [];
                    records.push({
                        term,
                        synsetId: sense.synset,
                        definition: synset.definition?.[0] || '',
                        members: synset.members || [],
                        pos: synset.partOfSpeech || '',
                        lexname: synset.lexname || '',
                        isProper: isLikelyProperTerm(term, synset)
                    });
                    recordsByAnswer.set(answer, records);
                });
            });
        });
    }

    const byLength = new Map();
    for (const [answer, records] of recordsByAnswer.entries()) {
        const entry = compactEntry(answer, records);
        const lengthEntries = byLength.get(answer.length) || {};
        lengthEntries[answer] = entry;
        byLength.set(answer.length, lengthEntries);
    }

    assertSafeOutputDirectory(wordnetOutputDir, 'wordnet');
    assertSafeOutputDirectory(playableOutputDir, 'playable_words_by_length');
    await fs.rm(wordnetOutputDir, { recursive: true, force: true });
    await fs.rm(playableOutputDir, { recursive: true, force: true });
    await fs.mkdir(path.join(wordnetOutputDir, 'entries_by_length'), { recursive: true });
    await fs.mkdir(playableOutputDir, { recursive: true });

    const lengths = [...byLength.keys()].sort((a, b) => a - b);
    const manifestLengths = {};
    let entryCount = 0;
    let playableCount = 0;

    for (const length of lengths) {
        const entries = byLength.get(length);
        const words = Object.keys(entries).sort();
        const playableWords = words
            .filter((word) => shouldUseAsPlayable(word, entries[word]))
            .sort((a, b) => entries[b].q - entries[a].q || a.localeCompare(b));

        entryCount += words.length;
        playableCount += playableWords.length;
        manifestLengths[length] = {
            entryCount: words.length,
            playableCount: playableWords.length,
            file: `entries_by_length/words-${length}.json`
        };

        await fs.writeFile(
            path.join(wordnetOutputDir, 'entries_by_length', `words-${length}.json`),
            `${JSON.stringify(entries)}\n`
        );

        if (length >= MIN_WORD_LENGTH && length <= MAX_WORD_LENGTH) {
            await fs.writeFile(
                path.join(playableOutputDir, `words-${length}.txt`),
                `${playableWords.join('\n')}\n`
            );
        }
    }

    const manifest = {
        schemaVersion: 1,
        source: path.basename(inputZipPath),
        generatedAt: new Date().toISOString(),
        entryCount,
        playableCount,
        answerLengthRange: [MIN_WORD_LENGTH, MAX_WORD_LENGTH],
        entryFormat: {
            t: 'source terms',
            p: 'parts of speech',
            d: ['definition', 'partOfSpeech', 'sourceTerm', 'synsetId'],
            s: 'normalized synonyms',
            q: 'quality score',
            proper: 'contains proper-noun signal'
        },
        lengths: manifestLengths
    };

    await fs.writeFile(path.join(wordnetOutputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Imported ${entryCount} WordNet entries with ${playableCount} playable answers.`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
