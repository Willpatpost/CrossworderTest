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

export function selectDailyClue(answer, entries, difficulty, random = Math.random, usedClues = new Set()) {
    const ranked = (entries || [])
        .filter((entry) => isUsableDailyClue(answer, entry?.c ?? entry?.clue))
        .map((entry) => ({
            ...entry,
            clue: normalizeClue(entry?.c ?? entry?.clue),
            score: scoreDailyClue(entry, difficulty)
        }))
        .filter((entry) => !usedClues.has(entry.clue.toLowerCase()))
        .sort((left, right) => right.score - left.score || left.clue.localeCompare(right.clue));

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
            const usableHistorical = historical.filter((entry) => (
                isUsableDailyClue(upperAnswer, entry?.c)
            ));
            candidates.set(
                upperAnswer,
                usableHistorical.length ? usableHistorical : wordnetDefinitions
            );
        });
    }

    return candidates;
}

export async function addDailyClues(puzzles, dateKey) {
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
        let totalScore = 0;

        for (const slot of Object.values(slots)) {
            const answer = puzzle.solution?.[slot.id];
            const selected = selectDailyClue(
                answer,
                candidates.get(answer) || [],
                difficulty,
                random,
                usedClues
            );
            if (!selected) throw new Error(`No usable clue is available for ${difficulty} answer ${answer}.`);

            usedClues.add(selected.clue.toLowerCase());
            clues[slot.direction][slot.number] = selected.clue;
            const source = String(selected.s || selected.source || 'unknown');
            sources[source] = (sources[source] || 0) + 1;
            totalScore += selected.score;
        }

        puzzle.clues = clues;
        puzzle.generationReport.clues = {
            clueCount: Object.keys(slots).length,
            averageSelectionScore: Number((totalScore / Object.keys(slots).length).toFixed(2)),
            sources
        };
    }

    return puzzles;
}
