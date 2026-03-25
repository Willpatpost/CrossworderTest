// solver/SolverEngine.js

export class SolverEngine {
    constructor() {
        this.recursiveCalls = 0;
        this.allowReuse = false;
        this.onUpdateCallback = null;
        this.isInterrupted = false;
        this.randomize = true;
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
        this.allowReuse = settings.allowReuse ?? false;
        const visualize = settings.visualize ?? false;
        this.randomize = settings.randomize ?? true;

        const assignment = {};
        const localDomains = this._cloneDomains(domains);

        const consistent = this.ac3(localDomains, constraints);
        if (!consistent) {
            return { success: false };
        }

        return await this._recursiveSearch(
            slots,
            localDomains,
            constraints,
            letterFrequencies,
            cellContents,
            assignment,
            visualize
        );
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
        visualize
    ) {
        this._throwIfInterrupted();

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

        let orderedValues = this.orderDomainValues(slotId, domains, letterFrequencies);

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
                await this._visualizationPause(5);
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
                    visualize
                );

                if (result.success) {
                    return result;
                }
            }

            delete assignment[slotId];
            this.restoreDomains(domains, inferences);

            if (visualize && this.onUpdateCallback) {
                this.onUpdateCallback(slotId, '');
                await this._visualizationPause(2);
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

    orderDomainValues(slotId, domains, letterFrequencies) {
        const domain = Array.isArray(domains[slotId]) ? [...domains[slotId]] : [];

        if (!letterFrequencies || Object.keys(letterFrequencies).length === 0) {
            return domain;
        }

        const getScore = (word) =>
            [...word].reduce(
                (score, char) => score + (letterFrequencies[char] || 0),
                0
            );

        return domain.sort((a, b) => getScore(b) - getScore(a));
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
        }

        return revised;
    }
}