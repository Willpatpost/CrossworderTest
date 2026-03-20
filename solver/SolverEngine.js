// solver/SolverEngine.js

export class SolverEngine {
    constructor() {
        this.recursiveCalls = 0;
        this.allowReuse = false; 
    }

    /**
     * Entry point for the solver.
     */
    backtrackingSolve(slots, domains, constraints, letterFrequencies, cellContents, settings = {}) {
        this.recursiveCalls = 0;
        this.allowReuse = settings.allowReuse ?? false;
        
        const assignment = {};
        
        // 1. Clone domains. 
        // IMPORTANT: Because ConstraintManager now filters by grid letters, 
        // localDomains[id].length is now small and meaningful.
        const localDomains = {};
        for (const id in domains) {
            localDomains[id] = [...domains[id]];
        }

        // 2. Initial Pruning (AC-3)
        // This removes words that can't possibly work with neighbors
        const consistent = this.ac3(localDomains, constraints);
        if (!consistent) return { success: false };

        // 3. Start recursive search
        return this._recursiveSearch(slots, localDomains, constraints, letterFrequencies, cellContents, assignment);
    }

    _recursiveSearch(slots, domains, constraints, letterFrequencies, cellContents, assignment) {
        // Base Case: All slots filled
        if (Object.keys(assignment).length === Object.keys(slots).length) {
            return { success: true, solution: { ...assignment } };
        }

        this.recursiveCalls++;
        
        // HEURISTIC: Pick the slot with the fewest possible words left (MRV)
        const varToAssign = this.selectUnassignedVariable(assignment, domains, constraints);
        if (!varToAssign) return { success: false };

        // HEURISTIC: Order words by letter frequency (Least Constraining Value / Quality)
        let orderedValues = this.orderDomainValues(varToAssign, domains, letterFrequencies);
        
        // Weighted Shuffle: We want randomness, but we want to try "good" words first.
        // We take the top 20% of "good" words and shuffle them, rather than shuffling everything.
        orderedValues = this.smartShuffle(orderedValues);

        for (const value of orderedValues) {
            // Check uniqueness if reuse is disabled
            if (!this.allowReuse && Object.values(assignment).includes(value)) {
                continue;
            }

            // Final check against user-typed letters and intersections
            if (this.isConsistent(varToAssign, value, assignment, slots, constraints, cellContents)) {
                
                assignment[varToAssign] = value;
                
                // Forward Checking: Prune domains of neighbors to catch dead-ends early
                const inferences = this.forwardCheck(varToAssign, value, assignment, domains, constraints);
                
                if (inferences !== false) {
                    const result = this._recursiveSearch(slots, domains, constraints, letterFrequencies, cellContents, assignment);
                    if (result.success) return result;
                }
                
                // Backtrack
                delete assignment[varToAssign];
                this.restoreDomains(domains, inferences);
            }
        }

        return { success: false };
    }

    /**
     * Picks the variable with the Minimum Remaining Values (MRV).
     * Ties are broken by the Degree Heuristic (most intersections).
     */
    selectUnassignedVariable(assignment, domains, constraints) {
        const unassigned = Object.keys(domains).filter(s => !(s in assignment));
        let bestSlot = null;
        let minSize = Infinity;

        for (const slotId of unassigned) {
            const size = domains[slotId].length;
            if (size < minSize) {
                minSize = size;
                bestSlot = slotId;
            } else if (size === minSize) {
                // Degree Heuristic tie-breaker
                const degA = constraints[slotId] ? Object.keys(constraints[slotId]).length : 0;
                const degBest = bestSlot && constraints[bestSlot] ? Object.keys(constraints[bestSlot]).length : 0;
                if (degA > degBest) bestSlot = slotId;
            }
        }
        return bestSlot;
    }

    /**
     * Orders words based on English letter frequency.
     */
    orderDomainValues(slot, domains, letterFrequencies) {
        const domain = [...domains[slot]];
        if (Object.keys(letterFrequencies).length === 0) return domain;

        const getScore = (word) =>
            word.split('').reduce((acc, ch) => acc + (letterFrequencies[ch] || 0), 0);
        
        return domain.sort((a, b) => getScore(b) - getScore(a));
    }

    /**
     * Shuffles slightly while preserving high-quality words near the front.
     */
    smartShuffle(array) {
        if (array.length <= 1) return array;
        // Keep the top "stratum" of words mostly at the front, but shuffle within segments
        // This prevents the solver from trying rare words (like 'XYLYL') too early.
        const segmentSize = Math.max(5, Math.floor(array.length * 0.1));
        for (let i = 0; i < array.length; i += segmentSize) {
            let end = Math.min(i + segmentSize, array.length);
            for (let j = end - 1; j > i; j--) {
                const k = i + Math.floor(Math.random() * (j - i + 1));
                [array[j], array[k]] = [array[k], array[j]];
            }
        }
        return array;
    }

    isConsistent(slotId, word, assignment, slots, constraints, cellContents) {
        const slotObj = slots[slotId];
        const positions = slotObj.positions;
        
        // 1. Check against "static" grid content (User typed letters)
        for (let i = 0; i < positions.length; i++) {
            const [r, c] = positions[i];
            const val = cellContents[`${r},${c}`];
            if (val && /[A-Z]/i.test(val)) {
                if (val.toUpperCase() !== word[i].toUpperCase()) return false;
            }
        }

        // 2. Check against "dynamic" assignment (other words placed by solver)
        const neighbors = constraints[slotId] || {};
        for (const neighborId in neighbors) {
            if (neighborId in assignment) {
                const neighborWord = assignment[neighborId];
                const overlaps = neighbors[neighborId]; 
                for (const [myIdx, neighborIdx] of overlaps) {
                    if (word[myIdx] !== neighborWord[neighborIdx]) return false;
                }
            }
        }
        return true;
    }

    forwardCheck(slot, value, assignment, domains, constraints) {
        const inferences = {};
        const neighbors = constraints[slot] || {};

        for (const neighborId in neighbors) {
            if (!(neighborId in assignment)) {
                const overlaps = neighbors[neighborId];
                const oldDomain = domains[neighborId];
                
                const newDomain = oldDomain.filter(w => {
                    for (const [myIdx, neighborIdx] of overlaps) {
                        if (value[myIdx] !== w[neighborIdx]) return false;
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
        }
        return inferences;
    }

    restoreDomains(domains, inferences) {
        if (!inferences) return;
        for (const v in inferences) {
            domains[v] = inferences[v];
        }
    }

    ac3(domains, constraints) {
        const queue = [];
        for (const slotA in constraints) {
            for (const slotB in constraints[slotA]) {
                queue.push([slotA, slotB]);
            }
        }

        while (queue.length > 0) {
            const [var1, var2] = queue.shift();
            if (this.revise(var1, var2, domains, constraints)) {
                if (domains[var1].length === 0) return false;
                const neighbors = constraints[var1] || {};
                for (const var3 in neighbors) {
                    if (var3 !== var2) queue.push([var3, var1]);
                }
            }
        }
        return true;
    }

    revise(var1, var2, domains, constraints) {
        let revised = false;
        const overlaps = constraints[var1][var2];
        const domain1 = domains[var1];
        const domain2 = domains[var2];

        const newDomain = domain1.filter(word1 => {
            return domain2.some(word2 => {
                return overlaps.every(([idx1, idx2]) => word1[idx1] === word2[idx2]);
            });
        });

        if (newDomain.length < domain1.length) {
            domains[var1] = newDomain;
            revised = true;
        }
        return revised;
    }
}