// solver/SolverEngine.js

export class SolverEngine {
    constructor() {
        this.recursiveCalls = 0;
        this.allowReuse = false;
        this.onUpdateCallback = null; // Used for UI visualization
    }

    /**
     * Entry point for the solver.
     */
    async backtrackingSolve(slots, domains, constraints, letterFrequencies, cellContents, settings = {}) {
        this.recursiveCalls = 0;
        this.allowReuse = settings.allowReuse ?? false;
        const visualize = settings.visualize ?? false;
        
        const assignment = {};
        
        // 1. Deep clone domains to ensure search branches don't interfere with each other
        const localDomains = {};
        for (const id in domains) {
            localDomains[id] = [...domains[id]];
        }

        // 2. Initial Pruning (AC-3) - Pre-processes domains to ensure arc consistency
        const consistent = this.ac3(localDomains, constraints);
        if (!consistent) return { success: false };

        // 3. Start recursive search
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

    /**
     * Core recursive search (Async to allow for UI thread breathing room)
     */
    async _recursiveSearch(slots, domains, constraints, letterFrequencies, cellContents, assignment, visualize) {
        // Base Case: All slots successfully filled
        if (Object.keys(assignment).length === Object.keys(slots).length) {
            return { success: true, solution: { ...assignment } };
        }

        this.recursiveCalls++;
        
        // HEURISTIC: Minimum Remaining Values (MRV)
        const varToAssign = this.selectUnassignedVariable(assignment, domains, constraints);
        if (!varToAssign) return { success: false };

        // HEURISTIC: Order values by letter frequency score
        let orderedValues = this.orderDomainValues(varToAssign, domains, letterFrequencies);
        orderedValues = this.smartShuffle(orderedValues);

        for (const value of orderedValues) {
            // Constraint: No duplicate words (unless explicitly allowed)
            if (!this.allowReuse && Object.values(assignment).includes(value)) {
                continue;
            }

            // Check if word fits existing letters and intersects with current assignments
            if (this.isConsistent(varToAssign, value, assignment, slots, constraints, cellContents)) {
                
                assignment[varToAssign] = value;
                
                // --- VISUALIZATION HOOK ---
                if (visualize && this.onUpdateCallback) {
                    this.onUpdateCallback(varToAssign, value);
                    // Small delay to let the browser paint the update
                    await new Promise(resolve => setTimeout(resolve, 5)); 
                }

                // Look ahead: Prune domains of neighbors to detect early failures
                const inferences = this.forwardCheck(varToAssign, value, assignment, domains, constraints);
                
                if (inferences !== false) {
                    const result = await this._recursiveSearch(slots, domains, constraints, letterFrequencies, cellContents, assignment, visualize);
                    if (result.success) return result;
                }
                
                // BACKTRACK: The current path failed. Remove assignment and restore domains.
                delete assignment[varToAssign];
                
                if (visualize && this.onUpdateCallback) {
                    this.onUpdateCallback(varToAssign, ""); 
                    await new Promise(resolve => setTimeout(resolve, 2)); 
                }

                this.restoreDomains(domains, inferences);
            }
        }

        return { success: false };
    }

    /**
     * Selects the next slot to fill using MRV and Degree heuristics.
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
                // Tie-breaker: Degree Heuristic (pick the one with most constraints on others)
                const degA = constraints[slotId] ? Object.keys(constraints[slotId]).length : 0;
                const degBest = bestSlot && constraints[bestSlot] ? Object.keys(constraints[bestSlot]).length : 0;
                if (degA > degBest) bestSlot = slotId;
            }
        }
        return bestSlot;
    }

    /**
     * Scores words based on sum of letter frequencies (Common letters = higher score).
     */
    orderDomainValues(slot, domains, letterFrequencies) {
        const domain = [...domains[slot]];
        if (!letterFrequencies || Object.keys(letterFrequencies).length === 0) return domain;

        const getScore = (word) =>
            word.split('').reduce((acc, ch) => acc + (letterFrequencies[ch] || 0), 0);
        
        return domain.sort((a, b) => getScore(b) - getScore(a));
    }

    /**
     * Shuffles small segments of the domain to prevent deterministic "boring" grids.
     */
    smartShuffle(array) {
        if (array.length <= 1) return array;
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

    /**
     * Validates if a word can be placed in a slot.
     */
    isConsistent(slotId, word, assignment, slots, constraints, cellContents) {
        const slotObj = slots[slotId];
        const positions = slotObj.positions;
        
        // 1. Check against static letters manually entered in the grid
        for (let i = 0; i < positions.length; i++) {
            const [r, c] = positions[i];
            const val = cellContents[`${r},${c}`];
            if (val && /^[A-Z]$/i.test(val)) {
                if (val.toUpperCase() !== word[i].toUpperCase()) return false;
            }
        }

        // 2. Check against already assigned words in intersecting slots
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

    /**
     * Reduces domains of neighbors based on the new assignment.
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
                        // FIX: Ensure we compare the assigned 'value' char with the potential 'w' char
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

    /**
     * AC-3 Algorithm for constraint satisfaction pre-processing.
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
