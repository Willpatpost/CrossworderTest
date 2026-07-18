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
const dailyOutputDir = path.join(rootDir, 'data', 'daily_words_by_length');
const defsInputDir = path.join(rootDir, 'data', 'defs_by_length');
const dailyBlocklistPath = path.join(rootDir, 'data', 'daily_blocklist.txt');
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
    return value !== value.toLowerCase() || String(synset.lexname || '').includes('noun.person');
}

function isSensitiveDefinition(definition) {
    return /\b(offensive|ethnic slur|racial slur|derogatory|vulgar|obscene)\b/i.test(
        String(definition || '')
    );
}

function isWeakDailyDefinition(definition) {
    return /\b(genus|genera|disease|syndrome|inflammation|basic unit of money|vertebra|middle ear|spore-producing|sperm|tropical|cassava|hemp obtained|archaic|obsolete|sixteenth century|17th century|18th century|of or relating to|worn in)\b/i.test(
        String(definition || '')
    );
}

async function loadDailyBlocklist() {
    try {
        const text = await fs.readFile(dailyBlocklistPath, 'utf8');
        return new Set(
            text.split(/\r?\n/)
                .map((line) => line.replace(/#.*/, '').trim().toUpperCase())
                .filter(Boolean)
        );
    } catch {
        return new Set();
    }
}

function scoreClueEntry(entry) {
    const source = String(entry?.s || entry?.source || '').toUpperCase();
    const clue = String(entry?.c || entry?.clue || '');
    const dateValue = Date.parse(entry?.d || entry?.date || '') || 0;
    let score = 0;

    if (source.includes('NYT')) score += 40;
    else if (source.includes('LAT')) score += 35;
    else if (source.includes('WSJ')) score += 32;
    else if (source.includes('WEB')) score += 12;
    else if (source) score += 24;

    score += Math.min(dateValue / 1_000_000_000_000, 10);
    score += Math.max(0, 36 - clue.length) / 4;

    if (/^\w[\w\s'",&-]*$/.test(clue)) score += 3;
    if (/[?!";]/.test(clue)) score -= 2;

    return score;
}

async function loadClueHistoryByAnswer() {
    const history = new Map();
    let files = [];

    try {
        files = (await fs.readdir(defsInputDir))
            .filter((file) => /^defs-\d+\.json$/.test(file))
            .sort((left, right) => {
                const leftLen = Number(left.match(/\d+/)?.[0] || 0);
                const rightLen = Number(right.match(/\d+/)?.[0] || 0);
                return leftLen - rightLen;
            });
    } catch {
        return history;
    }

    for (const file of files) {
        const defsMap = JSON.parse(await fs.readFile(path.join(defsInputDir, file), 'utf8'));
        Object.entries(defsMap || {}).forEach(([rawWord, rawEntries]) => {
            const answer = normalizeAnswer(rawWord);
            if (!answer) return;

            const existing = history.get(answer) || {
                count: 0,
                recentCount: 0,
                sources: new Set(),
                bestScore: 0
            };

            (rawEntries || []).forEach((entry) => {
                existing.count++;
                if (entry?.s) existing.sources.add(String(entry.s).toUpperCase());
                if (Date.parse(entry?.d || '') >= Date.parse('2015-01-01')) {
                    existing.recentCount++;
                }
                existing.bestScore = Math.max(existing.bestScore, scoreClueEntry(entry));
            });

            history.set(answer, existing);
        });
    }

    history.forEach((entry, answer) => {
        history.set(answer, {
            count: entry.count,
            recentCount: entry.recentCount,
            sourceCount: entry.sources.size,
            bestScore: Number(entry.bestScore.toFixed(3))
        });
    });

    return history;
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

function compactEntry(answer, records, clueHistory = null) {
    const definitions = [];
    const definitionKeys = new Set();
    const terms = [];
    const termKeys = new Set();
    const synonyms = new Set();
    const partsOfSpeech = new Set();
    let hasProper = true;

    for (const record of records) {
        if (!termKeys.has(record.term)) {
            termKeys.add(record.term);
            terms.push(record.term);
        }
        if (record.pos) partsOfSpeech.add(record.pos);
        if (!record.isProper) hasProper = false;

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

    const history = clueHistory || { count: 0, recentCount: 0, sourceCount: 0, bestScore: 0 };
    const wordnetScore = scoreEntry(answer, records);
    const familiarityScore = scoreFamiliarity(answer, wordnetScore, definitions, history, hasProper);

    return {
        t: terms.slice(0, 8),
        p: [...partsOfSpeech].sort(),
        d: definitions.slice(0, 8),
        s: [...synonyms].sort().slice(0, 24),
        q: wordnetScore,
        f: familiarityScore,
        h: [
            history.count || 0,
            history.recentCount || 0,
            history.sourceCount || 0,
            history.bestScore || 0
        ],
        proper: hasProper
    };
}

function scoreFamiliarity(answer, wordnetScore, definitions, history, isProper) {
    const count = history?.count || 0;
    const recentCount = history?.recentCount || 0;
    const sourceCount = history?.sourceCount || 0;
    const bestClueScore = history?.bestScore || 0;
    const allDefinitionsWeak = definitions.length > 0
        && definitions.every(([definition]) => isWeakDailyDefinition(definition));

    let score = wordnetScore;
    score += Math.min(count, 24) * 1.7;
    score += Math.min(recentCount, 8) * 2.5;
    score += Math.min(sourceCount, 8) * 2;
    score += Math.min(bestClueScore, 55) * 0.6;

    if (!count) score -= answer.length <= 3 ? 8 : 24;
    if (count > 0 && count < 3 && answer.length >= 5) score -= 8;
    if (allDefinitionsWeak) score -= 45;
    if (isProper) score -= 10;
    if (/[^A-Z]/.test(answer)) score -= 20;
    if (/^[A-Z]{3}$/.test(answer) && count < 3 && wordnetScore < 82) score -= 10;

    return Number(Math.max(0, score).toFixed(3));
}

function shouldUseAsPlayable(answer, entry) {
    if (entry.q < 76) return false;
    if (/^[IVXLCDM]+$/.test(answer)) return false;
    if (/^[BCDFGHJKLMNPQRSTVWXYZ]{3,}$/.test(answer)) return false;
    if (entry.proper && entry.q < 88) return false;
    if (entry.d.some(([definition]) => isSensitiveDefinition(definition))) return false;
    if (entry.d.every(([definition]) => isWeakDailyDefinition(definition))) return false;
    return entry.d.length > 0;
}

function shouldUseAsDaily(answer, entry, dailyBlocklist = new Set()) {
    if (dailyBlocklist.has(answer)) return false;
    if (!shouldUseAsPlayable(answer, entry)) return false;
    if (entry.d.every(([definition]) => isWeakDailyDefinition(definition))) return false;
    if (entry.proper && entry.f < 120) return false;

    const [clueCount = 0, recentCount = 0, sourceCount = 0] = entry.h || [];
    if (answer.length >= 5 && entry.q < 78 && recentCount < 1) return false;
    if (answer.length <= 3) {
        return entry.f >= 92 && (clueCount >= 2 || entry.q >= 84);
    }

    if (answer.length <= 5) {
        return entry.f >= 105 && (clueCount >= 3 || sourceCount >= 2 || entry.q >= 88);
    }

    return entry.f >= 112 && (clueCount >= 4 || recentCount >= 2 || sourceCount >= 2);
}

function assertSafeOutputDirectory(outputDir, expectedName) {
    if (path.dirname(outputDir) !== path.join(rootDir, 'data') || path.basename(outputDir) !== expectedName) {
        throw new Error(`Refusing to replace unexpected output directory: ${outputDir}`);
    }
}

async function main() {
    const buffer = await fs.readFile(inputZipPath);
    const zipEntries = readZipEntries(buffer);
    const clueHistoryByAnswer = await loadClueHistoryByAnswer();
    const dailyBlocklist = await loadDailyBlocklist();
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
        const entry = compactEntry(answer, records, clueHistoryByAnswer.get(answer));
        const lengthEntries = byLength.get(answer.length) || {};
        lengthEntries[answer] = entry;
        byLength.set(answer.length, lengthEntries);
    }

    assertSafeOutputDirectory(wordnetOutputDir, 'wordnet');
    assertSafeOutputDirectory(playableOutputDir, 'playable_words_by_length');
    assertSafeOutputDirectory(dailyOutputDir, 'daily_words_by_length');
    await fs.rm(wordnetOutputDir, { recursive: true, force: true });
    await fs.rm(playableOutputDir, { recursive: true, force: true });
    await fs.rm(dailyOutputDir, { recursive: true, force: true });
    await fs.mkdir(path.join(wordnetOutputDir, 'entries_by_length'), { recursive: true });
    await fs.mkdir(playableOutputDir, { recursive: true });
    await fs.mkdir(dailyOutputDir, { recursive: true });

    const lengths = [...byLength.keys()].sort((a, b) => a - b);
    const manifestLengths = {};
    let entryCount = 0;
    let playableCount = 0;

    for (const length of lengths) {
        const entries = byLength.get(length);
        const words = Object.keys(entries).sort();
        const playableWords = words
            .filter((word) => shouldUseAsPlayable(word, entries[word]))
            .sort((a, b) => entries[b].f - entries[a].f || entries[b].q - entries[a].q || a.localeCompare(b));
        const dailyWords = playableWords
            .filter((word) => shouldUseAsDaily(word, entries[word], dailyBlocklist))
            .sort((a, b) => entries[b].f - entries[a].f || entries[b].q - entries[a].q || a.localeCompare(b));

        entryCount += words.length;
        playableCount += playableWords.length;
        manifestLengths[length] = {
            entryCount: words.length,
            playableCount: playableWords.length,
            dailyCount: dailyWords.length,
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
            await fs.writeFile(
                path.join(dailyOutputDir, `words-${length}.txt`),
                `${dailyWords.join('\n')}\n`
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
            f: 'daily familiarity score',
            h: ['clueCount', 'recentClueCount', 'sourceCount', 'bestClueScore'],
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
