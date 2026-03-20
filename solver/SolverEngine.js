// solver/SolverEngine.js

export class SolverEngine {
    constructor() {
        this.recursiveCalls = 0;
    }

    /**
     * Entry point for the solver.
     * Uses Backtracking Search + Forward Checking + MRV Heuristic.
     */
    backtrackingSolve(slots, domains, constraints, letterFrequencies, cellContents) {
        this.recursiveCalls = 0;
        const assignment = {};
        const cache = {};

        // Optional: Pre-process domains with AC-3 to prune impossible words before starting
        this.ac3(domains, constraints);

        const result = this._recursiveSearch(slots, domains, constraints, letterFrequencies, cellContents, assignment, cache);
        
        if (result.success) {
            return { success: true, solution: result.solution };
        }
        return { success: false };
    }

    _recursiveSearch(slots, domains, constraints, letterFrequencies, cellContents, assignment, cache) {
        // Base case: All slots filled
        if (Object.keys(assignment).length === Object.keys(slots).length) {
            return { success: true, solution: { ...assignment } };
        }

        this.recursiveCalls++;

        // Select next variable using MRV (Minimum Remaining Values)
        const varToAssign = this.selectUnassignedVariable(assignment, domains, constraints);
        if (!varToAssign) return { success: false };

        // Optimization: Sort domain values to try most promising words first
        const orderedValues = this.orderDomainValues(varToAssign, domains, letterFrequencies);

        for (const value of orderedValues) {
            if (this.isConsistent(varToAssign, value, assignment, slots, constraints, cellContents)) {
                
                // Set assignment
                assignment[varToAssign] = value;

                // Forward Checking: Prune domains of neighbors
                const inferences = this.forwardCheck(varToAssign, value, assignment, domains, constraints);
                
                if (inferences !== false) {
                    const result = this._recursiveSearch(slots, domains, constraints, letterFrequencies, cellContents, assignment, cache);
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
     * Checks if a word fits the current grid and doesn't conflict with intersecting words.
     */
    isConsistent(slotId, word, assignment, slots, constraints, cellContents) {
        // 1. Check against manually entered letters in the grid (cellContents)
        const slotObj = slots[slotId];
        const positions = slotObj.positions || slotObj; // Handle both rich objects and raw arrays
        
        for (let i = 0; i < positions.length; i++) {
            const [r, c] = positions[i];
            const preFilled = cellContents[`${r},${c}`];
            // If the UI has a fixed letter, the solver must respect it
            if (preFilled && /[A-Z]/.test(preFilled) && preFilled !== word[i]) {
                return false;
            }
        }

        // 2. Check against already assigned intersecting words
        const neighbors = constraints[slotId] || {};
        for (const neighborId in neighbors) {
            if (neighborId in assignment) {
                const neighborWord = assignment[neighborId];
                const overlaps = neighbors[neighborId]; 
                
                for (const [myIdx, neighborIdx] of overlaps) {
                    if (word[myIdx] !== neighborWord[neighborIdx]) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    /**
     * MRV Heuristic: Choose the slot with the fewest possible words left.
     */
    selectUnassignedVariable(assignment, domains, constraints) {
        const unassigned = Object.keys(domains).filter(s => !(s in assignment));
        if (unassigned.length === 0) return null;

        let minSize = Infinity;
        let bestSlot = unassigned[0];

        for (const slot of unassigned) {
            const size = domains[slot].length;
            if (size < minSize) {
                minSize = size;
                bestSlot = slot;
            } else if (size === minSize) {
                // Tie-breaker: Degree Heuristic (most constraints on remaining variables)
                const degA = constraints[slot] ? Object.keys(constraints[slot]).length : 0;
                const degBest = constraints[bestSlot] ? Object.keys(constraints[bestSlot]).length : 0;
                if (degA > degBest) bestSlot = slot;
            }
        }
        return bestSlot;
    }

    /**
     * Order words based on letter frequency (Heuristic).
     */
    orderDomainValues(slot, domains, letterFrequencies) {
        const domain = [...domains[slot]];
        if (domain.length <= 1) return domain;

        const getScore = (word) =>
            word.split('').reduce((acc, ch) => acc + (letterFrequencies[ch] || 0), 0);

        // Sort descending: try words with common letters first
        return domain.sort((a, b) => getScore(b) - getScore(a));
    }

    /**
     * Forward Checking: Temporarily remove impossible words from neighboring slots.
     */
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
                    return false; // Failure: Pruning led to empty domain
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

    /**
     * AC-3 Algorithm for Arc Consistency.
     * Prunes domains before backtracking begins.
     */
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