import { ConstraintManager } from '../solver/ConstraintManager.js';
import { hasConnectedOpenCells } from './CrosswordLayoutGenerator.js';
import { hasRotationalSymmetry } from './DailyPuzzleQuality.js';

const EXPECTED_SIZES = { easy: 7, medium: 11, hard: 15 };

function clueForSlot(clues, slot) {
    const directional = clues?.[slot.direction];
    if (Array.isArray(directional)) {
        return directional.find((entry) => Number(entry?.number) === slot.number)?.clue;
    }
    return directional?.[slot.number] ?? directional?.[String(slot.number)];
}

export function validateDailyPuzzlePack(payload, expectedDate = '') {
    const errors = [];
    if (payload?.schemaVersion !== 2) errors.push('Daily pack schemaVersion must be 2.');
    if (!payload?.generatedFor) errors.push('Daily pack is missing generatedFor.');
    if (expectedDate && payload?.generatedFor !== expectedDate) {
        errors.push(`Daily pack date ${payload?.generatedFor || '(missing)'} does not match ${expectedDate}.`);
    }

    for (const [difficulty, expectedSize] of Object.entries(EXPECTED_SIZES)) {
        const puzzle = payload?.puzzles?.[difficulty];
        if (!puzzle) {
            errors.push(`Daily pack is missing the ${difficulty} puzzle.`);
            continue;
        }

        const grid = puzzle.grid;
        if (
            !Array.isArray(grid)
            || grid.length !== expectedSize
            || !grid.every((row) => Array.isArray(row) && row.length === expectedSize)
        ) {
            errors.push(`${difficulty} puzzle must have a ${expectedSize}x${expectedSize} grid.`);
            continue;
        }
        if (!hasConnectedOpenCells(grid)) errors.push(`${difficulty} puzzle has disconnected open cells.`);
        if (!hasRotationalSymmetry(grid)) errors.push(`${difficulty} puzzle is not rotationally symmetric.`);

        const constraintManager = new ConstraintManager();
        const { slots } = constraintManager.buildDataStructures(grid);
        for (const slot of Object.values(slots)) {
            const answer = puzzle.solution?.[slot.id];
            if (!/^[A-Z]+$/.test(answer || '') || answer.length !== slot.length) {
                errors.push(`${difficulty} puzzle has no valid answer for ${slot.id}.`);
                continue;
            }
            const clue = String(clueForSlot(puzzle.clues, slot) || '').trim();
            if (!clue) errors.push(`${difficulty} puzzle has no clue for ${slot.id}.`);

            slot.positions.forEach(([row, column], index) => {
                if (puzzle.solvedGrid?.[row]?.[column] !== answer[index]) {
                    errors.push(`${difficulty} solved grid conflicts with ${slot.id}.`);
                }
            });
        }

        const quality = puzzle.generationReport?.selectedQuality;
        if (!quality || quality.slotCount !== Object.keys(slots).length) {
            errors.push(`${difficulty} puzzle is missing a complete quality report.`);
        }
        if (puzzle.generationReport?.clues?.clueCount !== Object.keys(slots).length) {
            errors.push(`${difficulty} puzzle is missing a complete clue report.`);
        }
    }

    return { valid: errors.length === 0, errors };
}

export function assertValidDailyPuzzlePack(payload, expectedDate = '') {
    const result = validateDailyPuzzlePack(payload, expectedDate);
    if (!result.valid) {
        throw new Error(`Daily puzzle pack validation failed:\n- ${result.errors.join('\n- ')}`);
    }
    return payload;
}
