// solver/SolverEngine.js

export class SolverEngine {
    constructor() {
        this.recursiveCalls = 0;
        this.backtracks = 0;
        this.domainReductions = 0;
        this.ac3Revisions = 0;
        this.maxDepth = 0;
        this.allowReuse = false;
        this.onUpdateCallback = null;
        this.isInterrupted = false;
        this.randomize = true;
        this.themeEntries = [];
        this.stats = null;
        this.preferredSlotId = null;
    }

    interrupt() {
        this.isInterrupted = true;
    }

    /* ===============================
       ENTRY POINT
    =============================== */

    async backtrackingSolve(
        slots,
        domains,
        constraints,
        letterFrequencies,
        cellContents,
        settings = {}
    ) {
        this.isInterrupted = false;
        this.recursiveCalls = 0;
        this.backtracks = 0;
        this.domainReductions = 0;
        this.ac3Revisions = 0;
        this.maxDepth = 0;
        this.allowReuse = settings.allowReuse ?? false;
        const visualize = settings.visualize ?? false;
        this.randomize = settings.randomize ?? true;
        this.visualizationDelayMs = Math.max(0, settings.visualizationDelayMs ?? 5);
        this.themeEntries = Array.isArray(settings.themeEntries)
            ? settings.themeEntries.map((entry) => String(entry || '').toUpperCase()).filter(Boolean)
            : [];
        this.preferredSlotId = settings.preferredSlotId || null;
        this.wordHistoryScores = settings.wordHistoryScores || {};
        const startedAt = performance.now();

        const assignment = { ...(settings.initialAssignment || {}) };
        const localDomains = this._cloneDomains(domains);

        Object.entries(assignment).forEach(([slotId, value]) => {
            if (slotId in localDomains) {
                localDomains[slotId] = [value];
            }
        });

        const consistent = this.ac3(localDomains, constraints);
        if (!consistent) {
            return { success: false, stats: this._buildStats(startedAt, false) };
        }

        const result = await this._recursiveSearch(
            slots,
            localDomains,
            constraints,
            letterFrequencies,
            cellContents,
            assignment,
            visualize,
            0
        );

        return {
            ...result,
            stats: this._buildStats(startedAt, result.success)
        };
    }

    _cloneDomains(domains) {
        const clone = {};
        for (const slotId in domains) {
            clone[slotId] = Array.isArray(domains[slotId]) ? [...domains[slotId]] : [];
        }
        return clone;
    }

    /* ===============================
       RECURSIVE SEARCH
    =============================== */

    async _recursiveSearch(
        slots,
        domains,
        constraints,
        letterFrequencies,
        cellContents,
        assignment,
        visualize,
        depth = 0
    ) {
        this._throwIfInterrupted();
        this.maxDepth = Math.max(this.maxDepth, depth);

        if (this._isComplete(assignment, slots)) {
            return {
                success: true,
                solution: { ...assignment }
            };
        }

        this.recursiveCalls++;

        if (this.recursiveCalls % 500 === 0) {
            await this._yieldToEventLoop();
            this._throwIfInterrupted();
        }

        const slotId = this.selectUnassignedVariable(assignment, domains, constraints);
        if (!slotId) {
            return { success: false };
        }

        let orderedValues = this.orderDomainValues(
            slotId,
            domains,
            constraints,
            assignment,
            letterFrequencies
        );

        if (this.randomize) {
            orderedValues = this.smartShuffle(orderedValues);
        }

        for (const value of orderedValues) {
            this._throwIfInterrupted();

            if (!this.allowReuse && this._isDuplicateAssignment(value, assignment)) {
                continue;
            }

            if (
                !this.isConsistent(
                    slotId,
                    value,
                    assignment,
                    slots,
                    constraints,
                    cellContents
                )
            ) {
                continue;
            }

            assignment[slotId] = value;

            if (visualize && this.onUpdateCallback) {
                this.onUpdateCallback(slotId, value);
                await this._visualizationPause(this.visualizationDelayMs);
                this._throwIfInterrupted();
            }

            const inferences = this.forwardCheck(
                slotId,
                value,
                assignment,
                domains,
                constraints
            );

            if (inferences !== false) {
                const result = await this._recursiveSearch(
                    slots,
                    domains,
                    constraints,
                    letterFrequencies,
                    cellContents,
                    assignment,
                    visualize,
                    depth + 1
                );

                if (result.success) {
                    return result;
                }
            }

            delete assignment[slotId];
            this.restoreDomains(domains, inferences);
            this.backtracks++;

            if (visualize && this.onUpdateCallback) {
                this.onUpdateCallback(slotId, '');
                await this._visualizationPause(Math.max(0, this.visualizationDelayMs / 2));
                this._throwIfInterrupted();
            }
        }

        return { success: false };
    }

    _isComplete(assignment, slots) {
        return Object.keys(assignment).length === Object.keys(slots).length;
    }

    _isDuplicateAssignment(value, assignment) {
        return Object.values(assignment).includes(value);
    }

    _throwIfInterrupted() {
        if (this.isInterrupted) {
            throw new Error('SOLVE_CANCELLED');
        }
    }

    _yieldToEventLoop() {
        return new Promise((resolve) => setTimeout(resolve, 0));
    }

    _visualizationPause(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /* ===============================
       VARIABLE / VALUE HEURISTICS
    =============================== */

    selectUnassignedVariable(assignment, domains, constraints) {
        const unassigned = Object.keys(domains).filter(
            (slotId) => !(slotId in assignment)
        );

        if (this.preferredSlotId && unassigned.includes(this.preferredSlotId)) {
            return this.preferredSlotId;
        }

        let bestSlot = null;
        let bestDomainSize = Infinity;
        let bestDegree = -1;

        for (const slotId of unassigned) {
            const domainSize = Array.isArray(domains[slotId])
                ? domains[slotId].length
                : 0;

            const degree = constraints[slotId]
                ? Object.keys(constraints[slotId]).length
                : 0;

            if (
                domainSize < bestDomainSize ||
                (domainSize === bestDomainSize && degree > bestDegree)
            ) {
                bestSlot = slotId;
                bestDomainSize = domainSize;
                bestDegree = degree;
            }
        }

        return bestSlot;
    }

    orderDomainValues(slotId, domains, constraints, assignment, letterFrequencies) {
        const domain = Array.isArray(domains[slotId]) ? [...domains[slotId]] : [];
        const historyScores = arguments[5] || this.wordHistoryScores || {};

        const getFrequencyScore = (word) => {
            if (!letterFrequencies || Object.keys(letterFrequencies).length === 0) {
                return 0;
            }

            return [...word].reduce(
                (score, char) => score + (letterFrequencies[char] || 0),
                0
            );
        };

        const getConstraintImpact = (word) => {
            const neighbors = constraints[slotId] || {};
            let impact = 0;

            for (const neighborId in neighbors) {
                if (neighborId in assignment) continue;

                const overlaps = neighbors[neighborId] || [];
                const neighborDomain = domains[neighborId] || [];
                let compatibleCount = 0;

                neighborDomain.forEach((candidate) => {
                    const compatible = overlaps.every(([myIdx, neighborIdx]) => (
                        word[myIdx] === candidate[neighborIdx]
                    ));

                    if (compatible) compatibleCount++;
                });

                impact += compatibleCount;
            }

            return impact;
        };

        const getThemeBoost = (word) => (
            this.themeEntries.includes(word) ? 5000 : 0
        );

        const getHistoryScore = (word) => (
            Number(historyScores?.[word] || 0)
        );

        return domain.sort((a, b) => {
            const lcvDelta = getConstraintImpact(b) - getConstraintImpact(a);
            if (lcvDelta !== 0) return lcvDelta;

            const themeDelta = getThemeBoost(b) - getThemeBoost(a);
            if (themeDelta !== 0) return themeDelta;

            const historyDelta = getHistoryScore(b) - getHistoryScore(a);
            if (historyDelta !== 0) return historyDelta;

            const frequencyDelta = getFrequencyScore(b) - getFrequencyScore(a);
            if (frequencyDelta !== 0) return frequencyDelta;

            return a.localeCompare(b);
        });
    }

    smartShuffle(array) {
        if (!Array.isArray(array) || array.length <= 1) {
            return Array.isArray(array) ? [...array] : [];
        }

        const shuffled = [...array];
        const segmentSize = Math.max(5, Math.floor(shuffled.length * 0.1));

        for (let start = 0; start < shuffled.length; start += segmentSize) {
            const end = Math.min(start + segmentSize, shuffled.length);

            for (let i = end - 1; i > start; i--) {
                const j = start + Math.floor(Math.random() * (i - start + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
        }

        return shuffled;
    }

    /* ===============================
       CONSISTENCY CHECKS
    =============================== */

    isConsistent(slotId, word, assignment, slots, constraints, cellContents) {
        const slot = slots[slotId];
        if (!slot || !Array.isArray(slot.positions)) {
            return false;
        }

        if (typeof word !== 'string' || word.length !== slot.length) {
            return false;
        }

        const positions = slot.positions;

        for (let i = 0; i < positions.length; i++) {
            const [r, c] = positions[i];
            const fixedValue = cellContents?.[`${r},${c}`];

            if (fixedValue && /^[A-Z]$/i.test(fixedValue)) {
                if (fixedValue.toUpperCase() !== word[i].toUpperCase()) {
                    return false;
                }
            }
        }

        const neighbors = constraints[slotId] || {};

        for (const neighborId in neighbors) {
            if (!(neighborId in assignment)) continue;

            const neighborWord = assignment[neighborId];
            const overlaps = neighbors[neighborId] || [];

            for (const [myIdx, neighborIdx] of overlaps) {
                if (word[myIdx] !== neighborWord[neighborIdx]) {
                    return false;
                }
            }
        }

        return true;
    }

    /* ===============================
       FORWARD CHECKING
    =============================== */

    forwardCheck(slotId, value, assignment, domains, constraints) {
        const inferences = {};
        const neighbors = constraints[slotId] || {};

        for (const neighborId in neighbors) {
            if (neighborId in assignment) continue;

            const overlaps = neighbors[neighborId] || [];
            const oldDomain = domains[neighborId] || [];

            const newDomain = oldDomain.filter((candidate) => {
                for (const [myIdx, neighborIdx] of overlaps) {
                    if (value[myIdx] !== candidate[neighborIdx]) {
                        return false;
                    }
                }

                if (!this.allowReuse && this._isDuplicateAssignment(candidate, assignment)) {
                    return false;
                }

                return true;
            });

            if (newDomain.length === 0) {
                this.restoreDomains(domains, inferences);
                return false;
            }

            inferences[neighborId] = oldDomain;
            domains[neighborId] = newDomain;
            this.domainReductions += Math.max(0, oldDomain.length - newDomain.length);
        }

        return inferences;
    }

    restoreDomains(domains, inferences) {
        if (!inferences || typeof inferences !== 'object') return;

        for (const slotId in inferences) {
            domains[slotId] = inferences[slotId];
        }
    }

    /* ===============================
       AC-3
    =============================== */

    ac3(domains, constraints) {
        const queue = [];

        for (const slotA in constraints) {
            for (const slotB in constraints[slotA]) {
                queue.push([slotA, slotB]);
            }
        }

        while (queue.length > 0) {
            this._throwIfInterrupted();

            const [var1, var2] = queue.shift();

            if (this.revise(var1, var2, domains, constraints)) {
                if (!domains[var1] || domains[var1].length === 0) {
                    return false;
                }

                const neighbors = constraints[var1] || {};
                for (const var3 in neighbors) {
                    if (var3 !== var2) {
                        queue.push([var3, var1]);
                    }
                }
            }
        }

        return true;
    }

    revise(var1, var2, domains, constraints) {
        const overlaps = constraints[var1]?.[var2];

        if (!Array.isArray(overlaps) || overlaps.length === 0) {
            return false;
        }

        const domain1 = Array.isArray(domains[var1]) ? domains[var1] : [];
        const domain2 = Array.isArray(domains[var2]) ? domains[var2] : [];

        let revised = false;

        const filteredDomain = domain1.filter((word1) => {
            return domain2.some((word2) => {
                return overlaps.every(([idx1, idx2]) => word1[idx1] === word2[idx2]);
            });
        });

        if (filteredDomain.length !== domain1.length) {
            domains[var1] = filteredDomain;
            revised = true;
            this.ac3Revisions++;
            this.domainReductions += Math.max(0, domain1.length - filteredDomain.length);
        }

        return revised;
    }

    _buildStats(startedAt, success) {
        return {
            success,
            elapsedMs: Math.max(0, performance.now() - startedAt),
            recursiveCalls: this.recursiveCalls,
            backtracks: this.backtracks,
            domainReductions: this.domainReductions,
            ac3Revisions: this.ac3Revisions,
            maxDepth: this.maxDepth,
            randomized: this.randomize,
            allowReuse: this.allowReuse
        };
    }
}
