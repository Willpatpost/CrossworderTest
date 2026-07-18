import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConstraintManager } from '../../solver/ConstraintManager.js';
import { createSeededRandom } from '../../utils/CrosswordLayoutGenerator.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function normalizeAnswer(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z]/g, '');
}

function normalizeClue(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function semanticTokens(value) {
    const stopwords = new Set(['about', 'after', 'also', 'and', 'are', 'for', 'from', 'into', 'its', 'one', 'that', 'the', 'this', 'used', 'with']);
    return new Set(String(value || '').toLowerCase().match(/[a-z]{3,}/g)?.map((token) => {
        if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
        if (token.endsWith('ing') && token.length > 5) return token.slice(0, -3);
        if (token.endsWith('ed') && token.length > 4) return token.slice(0, -2);
        if (token.endsWith('s') && !token.endsWith('ss') && token.length > 3) return token.slice(0, -1);
        return token;
    }).filter((token) => token.length >= 3 && !stopwords.has(token)) || []);
}

const UNSAFE_CLUE_PATTERN = /\b(fuck|fucking|shit|bitch|slut|porn|420)\b/i;

export function isUsableDailyClue(answer, rawClue) {
    const clue = normalizeClue(rawClue);
    if (!clue || clue === '-' || clue.length < 2 || clue.length > 100) return false;
    if (/^(see|with)\s+\d+/i.test(clue)) return false;
    if (/^\d+[- ]?(across|down)$/i.test(clue)) return false;
    if (/\b(this (entry|answer|clue|puzzle)|top row|bottom row)\b/i.test(clue)) return false;
    if (/^[\W_]+$/.test(clue)) return false;
    if (UNSAFE_CLUE_PATTERN.test(clue)) return false;

    const normalizedAnswer = normalizeAnswer(answer);
    const normalizedClueText = normalizeAnswer(clue);
    const clueWords = new Set(clue.toUpperCase().match(/[A-Z]+/g) || []);
    if (clueWords.has(normalizedAnswer)) return false;
    if (normalizedAnswer.length >= 4 && normalizedClueText.includes(normalizedAnswer)) return false;
    return true;
}

function sourceScore(source) {
    const normalized = String(source || '').toUpperCase();
    if (normalized === 'WN') return 14;
    if (normalized.includes('NYT')) return 13;
    if (normalized.includes('LAT')) return 12;
    if (normalized.includes('WSJ')) return 11;
    if (normalized === '7XW') return 10;
    return normalized ? 7 : 0;
}

export function scoreDailyClue(entry, difficulty = 'medium') {
    const clue = normalizeClue(entry?.c ?? entry?.clue);
    const words = clue.split(/\s+/).filter(Boolean).length;
    const date = Number.parseInt(entry?.d ?? entry?.date, 10) || 0;
    const hasQuestion = clue.includes('?');
    const hasBlank = /_{2,}/.test(clue);
    const hasCrosswordReference = /\b(across|down)\b/i.test(clue);
    const hasAbbreviation = /\b(abbr|briefly|for short)\b/i.test(clue);
    let score = sourceScore(entry?.s ?? entry?.source);

    if (date >= 2020) score += 10;
    else if (date >= 2010) score += 7;
    else if (date >= 2000) score += 4;
    else if (date > 0 && date < 1980) score -= 8;

    if (clue.length <= 48) score += 8;
    else if (clue.length > 72) score -= 8;
    if (hasCrosswordReference) score -= 20;

    if (difficulty === 'easy') {
        if (words >= 1 && words <= 6) score += 16;
        if (!hasQuestion && !hasBlank) score += 14;
        if (hasQuestion) score -= 22;
        if (hasAbbreviation) score -= 8;
        if (/^["']/.test(clue)) score -= 5;
    } else if (difficulty === 'hard') {
        if (hasQuestion) score += 20;
        if (hasBlank) score += 6;
        if (words >= 2 && words <= 9) score += 8;
        if (words === 1 && !hasQuestion) score -= 6;
    } else {
        if (words >= 2 && words <= 8) score += 12;
        if (hasQuestion) score += 3;
        if (hasAbbreviation) score -= 3;
    }

    return score;
}

export function assessClueConfidence(answer, entry, difficulty = 'medium') {
    const clue = normalizeClue(entry?.c ?? entry?.clue);
    const source = String((entry?.s ?? entry?.source) || '').toUpperCase();
    const date = Number.parseInt(entry?.d ?? entry?.date, 10) || 0;
    const clueTokens = semanticTokens(clue);
    const referenceTokens = entry?.semanticTokens instanceof Set
        ? entry.semanticTokens
        : semanticTokens(entry?.semanticText);
    const overlap = [...clueTokens].filter((token) => referenceTokens.has(token)).length;
    let confidence = source === 'WN' ? 0.72 : 0.45;
    const reasons = [];

    if (['NYT', 'LAT', 'WSJ', '7XW'].some((trusted) => source.includes(trusted))) confidence += 0.08;
    if (date >= 2010) confidence += 0.06;
    if (clueTokens.size === 1) confidence += 0.08;
    if (overlap > 0) {
        confidence += Math.min(0.24, overlap * 0.12);
        reasons.push('semantic-overlap');
    } else if (source !== 'WN') {
        reasons.push('no-semantic-overlap');
    }
    if (clue.includes('?') || /_{2,}/.test(clue)) {
        confidence += difficulty === 'hard' ? 0.06 : difficulty === 'easy' ? -0.08 : 0;
        reasons.push('wordplay');
    }
    if (normalizeAnswer(answer).length <= 3) confidence -= 0.02;

    return {
        confidence: Math.max(0, Math.min(source === 'WN' ? 0.9 : 1, Number(confidence.toFixed(3)))),
        reasons
    };
}

export function selectDailyClue(
    answer,
    entries,
    difficulty,
    random = Math.random,
    usedClues = new Set(),
    options = {}
) {
    const recentClues = options.recentClues || new Set();
    const minConfidence = options.minConfidence ?? 0;
    let ranked = (entries || [])
        .filter((entry) => isUsableDailyClue(answer, entry?.c ?? entry?.clue))
        .map((entry) => {
            const clue = normalizeClue(entry?.c ?? entry?.clue);
            const audit = assessClueConfidence(answer, entry, difficulty);
            const repeatedRecently = recentClues.has(clue.toLowerCase());
            return {
                ...entry,
                clue,
                confidence: audit.confidence,
                confidenceReasons: audit.reasons,
                repeatedRecently,
                score: scoreDailyClue(entry, difficulty)
                    + (audit.confidence * 20)
                    - (repeatedRecently ? 35 : 0)
                    - (entry?.s === 'WN' ? (difficulty === 'easy' ? 10 : difficulty === 'hard' ? 8 : 6) : 0)
            };
        })
        .filter((entry) => entry.confidence >= minConfidence)
        .filter((entry) => !usedClues.has(entry.clue.toLowerCase()));

    if (difficulty === 'easy') {
        const strongHistorical = ranked.filter((entry) => (
            entry.s !== 'WN' && entry.confidence >= (options.historicalConfidence ?? 0.68)
        ));
        if (strongHistorical.length) ranked = strongHistorical;
    }
    ranked.sort((left, right) => right.score - left.score || left.clue.localeCompare(right.clue));

    if (!ranked.length) return null;
    const topScore = ranked[0].score;
    const band = ranked.filter((entry) => entry.score >= topScore - 3).slice(0, 5);
    return band[Math.floor(random() * band.length)] || ranked[0];
}

async function loadCandidatesByAnswer(answers) {
    const byLength = new Map();
    answers.forEach((answer) => {
        const list = byLength.get(answer.length) || [];
        list.push(answer);
        byLength.set(answer.length, list);
    });

    const candidates = new Map();
    for (const [length, lengthAnswers] of byLength.entries()) {
        const requested = new Set(lengthAnswers.map((answer) => answer.toLowerCase()));
        let definitions = {};
        let wordnet = {};

        try {
            definitions = JSON.parse(await fs.readFile(
                path.join(rootDir, 'data', 'defs_by_length', `defs-${length}.json`),
                'utf8'
            ));
        } catch {
            definitions = {};
        }

        try {
            wordnet = JSON.parse(await fs.readFile(
                path.join(rootDir, 'data', 'wordnet', 'entries_by_length', `words-${length}.json`),
                'utf8'
            ));
        } catch {
            wordnet = {};
        }

        requested.forEach((answer) => {
            const upperAnswer = answer.toUpperCase();
            const historical = Array.isArray(definitions[answer]) ? definitions[answer] : [];
            const wordnetDefinitions = (wordnet[upperAnswer]?.d || []).map(([clue]) => ({
                c: clue,
                s: 'WN',
                d: '2025'
            }));
            const semanticText = [
                ...(wordnet[upperAnswer]?.d || []).map(([definition]) => definition),
                ...(wordnet[upperAnswer]?.s || []),
                ...(wordnet[upperAnswer]?.t || [])
            ].join(' ');
            [...historical, ...wordnetDefinitions].forEach((entry) => {
                entry.semanticText = semanticText;
            });
            const usableHistorical = historical.filter((entry) => (
                isUsableDailyClue(upperAnswer, entry?.c)
            ));
            candidates.set(upperAnswer, [...usableHistorical, ...wordnetDefinitions]);
        });
    }

    return candidates;
}

export async function addDailyClues(puzzles, dateKey, recentUsage = {}) {
    const allAnswers = new Set();
    Object.values(puzzles).forEach((puzzle) => {
        Object.values(puzzle.solution || {}).forEach((answer) => allAnswers.add(answer));
    });
    const candidates = await loadCandidatesByAnswer(allAnswers);

    for (const [difficulty, puzzle] of Object.entries(puzzles)) {
        const constraintManager = new ConstraintManager();
        const { slots } = constraintManager.buildDataStructures(puzzle.grid);
        const random = createSeededRandom(`${dateKey}:${difficulty}:clues`);
        const usedClues = new Set();
        const clues = { across: {}, down: {} };
        const sources = {};
        const reviewFlags = [];
        let repeatedClueCount = 0;
        let totalScore = 0;
        let totalConfidence = 0;
        const cluePolicy = {
            easy: { minConfidence: 0.58, minAverageConfidence: 0.64, reviewThreshold: 0.68, maxReviewShare: 0.65, maxRepeatShare: 0.05 },
            medium: { minConfidence: 0.5, minAverageConfidence: 0.57, reviewThreshold: 0.62, maxReviewShare: 0.4, maxRepeatShare: 0.1 },
            hard: { minConfidence: 0.4, minAverageConfidence: 0.5, reviewThreshold: 0.55, maxReviewShare: 0.45, maxRepeatShare: 0.15 }
        }[difficulty];
        const recentClues = recentUsage[difficulty]?.clues || new Set();

        for (const slot of Object.values(slots)) {
            const answer = puzzle.solution?.[slot.id];
            const selected = selectDailyClue(
                answer,
                candidates.get(answer) || [],
                difficulty,
                random,
                usedClues,
                {
                    recentClues,
                    minConfidence: cluePolicy.minConfidence,
                    historicalConfidence: cluePolicy.reviewThreshold
                }
            );
            if (!selected) throw new Error(`No usable clue is available for ${difficulty} answer ${answer}.`);

            usedClues.add(selected.clue.toLowerCase());
            clues[slot.direction][slot.number] = selected.clue;
            const source = String(selected.s || selected.source || 'unknown');
            sources[source] = (sources[source] || 0) + 1;
            totalScore += selected.score;
            totalConfidence += selected.confidence;
            if (selected.repeatedRecently) repeatedClueCount++;
            if (selected.confidence < cluePolicy.reviewThreshold) {
                reviewFlags.push({
                    slotId: slot.id,
                    answer,
                    clue: selected.clue,
                    confidence: selected.confidence,
                    reasons: selected.confidenceReasons
                });
            }
        }

        const slotCount = Object.keys(slots).length;
        const reviewShare = reviewFlags.length / slotCount;
        const repeatShare = repeatedClueCount / slotCount;
        const averageConfidence = totalConfidence / slotCount;
        if (averageConfidence < cluePolicy.minAverageConfidence) {
            throw new Error(`${difficulty} average clue confidence ${averageConfidence.toFixed(2)} is below target.`);
        }
        if (reviewShare > cluePolicy.maxReviewShare) {
            throw new Error(`${difficulty} clue review share ${(reviewShare * 100).toFixed(0)}% is above target.`);
        }
        if (repeatShare > cluePolicy.maxRepeatShare) {
            throw new Error(`${difficulty} recent clue share ${(repeatShare * 100).toFixed(0)}% is above target.`);
        }

        puzzle.clues = clues;
        puzzle.generationReport.clues = {
            clueCount: slotCount,
            averageSelectionScore: Number((totalScore / slotCount).toFixed(2)),
            averageConfidence: Number(averageConfidence.toFixed(3)),
            repeatedClueCount,
            repeatedClueShare: Number(repeatShare.toFixed(3)),
            reviewFlagCount: reviewFlags.length,
            reviewFlagShare: Number(reviewShare.toFixed(3)),
            reviewFlags,
            sources
        };
    }

    return puzzles;
}
