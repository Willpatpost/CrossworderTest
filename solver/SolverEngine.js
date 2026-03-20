// solver/SolverEngine.js

export class SolverEngine {
    constructor() {
        this.recursiveCalls = 0;
    }

    /**
     * Entry point for the solver.
     */
    backtrackingSolve(slots, domains, constraints, letterFrequencies, cellContents) {
        this.recursiveCalls = 0;
        const assignment = {};
        
        // 1. Clone domains to avoid mutating the original word list cache
        const localDomains = {};
        for (const id in domains) {
            localDomains[id] = [...domains[id]];
        }

        // 2. Run AC-3 to prune initial impossible values based on grid intersections
        const consistent = this.ac3(localDomains, constraints);
        if (!consistent) return { success: false };

        // 3. Start the recursive search
        return this._recursiveSearch(slots, localDomains, constraints, letterFrequencies, cellContents, assignment);
    }

    _recursiveSearch(slots, domains, constraints, letterFrequencies, cellContents, assignment) {
        // Base case: All slots filled
        if (Object.keys(assignment).length === Object.keys(slots).length) {
            return { success: true, solution: { ...assignment } };
        }

        this.recursiveCalls++;
        
        // Select next variable using MRV (Minimum Remaining Values)
        const varToAssign = this.selectUnassignedVariable(assignment, domains, constraints);
        if (!varToAssign) return { success: false };

        // Order words by letter frequency (Heuristic)
        const orderedValues = this.orderDomainValues(varToAssign, domains, letterFrequencies);

        for (const value of orderedValues) {
            if (this.isConsistent(varToAssign, value, assignment, slots, constraints, cellContents)) {
                
                assignment[varToAssign] = value;
                
                // Forward Checking: Prune domains of neighbors to catch failures early
                const inferences = this.forwardCheck(varToAssign, value, assignment, domains, constraints);
                
                if (inferences !== false) {
                    const result = this._recursiveSearch(slots, domains, constraints, letterFrequencies, cellContents, assignment);
                    if (result.success) return result;
                }
                
                // Backtrack: Remove assignment and restore pruned domains
                delete assignment[varToAssign];
                this.restoreDomains(domains, inferences);
            }
        }

        return { success: false };
    }

    /**
     * Checks if a word fits current grid letters and intersections.
     * CRITICAL: Ignores digits (clue numbers) in the cellContents.
     */
    isConsistent(slotId, word, assignment, slots, constraints, cellContents) {
        const slotObj = slots[slotId];
        const positions = slotObj.positions || slotObj;
        
        // Check against letters physically entered in the grid
        for (let i = 0; i < positions.length; i++) {
            const [r, c] = positions[i];
            const val = cellContents[`${r},${c}`];
            
            // Only conflict if the cell contains an actual LETTER (A-Z)
            // If it contains a clue number ("1") or is empty (" "), it's a match.
            if (val && /[A-Z]/.test(val)) {
                if (val !== word[i]) return false;
            }
        }

        // Check against words already placed by the solver in intersecting slots
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

    selectUnassignedVariable(assignment, domains, constraints) {
        const unassigned = Object.keys(domains).filter(s => !(s in assignment));
        let minSize = Infinity;
        let bestSlot = unassigned[0];

        for (const slot of unassigned) {
            const size = domains[slot].length;
            if (size < minSize) {
                minSize = size;
                bestSlot = slot;
            } else if (size === minSize) {
                // Tie-breaker: Degree heuristic (most intersections)
                const degA = constraints[slot] ? Object.keys(constraints[slot]).length : 0;
                const degBest = constraints[bestSlot] ? Object.keys(constraints[bestSlot]).length : 0;
                if (degA > degBest) bestSlot = slot;
            }
        }
        return bestSlot;
    }

    orderDomainValues(slot, domains, letterFrequencies) {
        const domain = [...domains[slot]];
        const getScore = (word) =>
            word.split('').reduce((acc, ch) => acc + (letterFrequencies[ch] || 0), 0);
        
        // Try most common letter combinations first
        return domain.sort((a, b) => getScore(b) - getScore(a));
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