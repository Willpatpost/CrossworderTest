// solver/SolverEngine.js

export class SolverEngine {
    constructor() {
        this.recursiveCalls = 0;
        this.allowReuse = false; 
    }

    /**
     * Entry point for the solver.
     * @param {Object} settings - includes allowReuse (boolean)
     */
    backtrackingSolve(slots, domains, constraints, letterFrequencies, cellContents, settings = {}) {
        this.recursiveCalls = 0;
        this.allowReuse = settings.allowReuse ?? false;
        
        const assignment = {};
        
        // 1. Clone domains to avoid mutating the original word list cache
        const localDomains = {};
        for (const id in domains) {
            localDomains[id] = [...domains[id]];
        }

        // 2. Run AC-3 to prune initial impossible values
        const consistent = this.ac3(localDomains, constraints);
        if (!consistent) return { success: false };

        // 3. Start randomized recursive search
        return this._recursiveSearch(slots, localDomains, constraints, letterFrequencies, cellContents, assignment);
    }

    _recursiveSearch(slots, domains, constraints, letterFrequencies, cellContents, assignment) {
        if (Object.keys(assignment).length === Object.keys(slots).length) {
            return { success: true, solution: { ...assignment } };
        }

        this.recursiveCalls++;
        
        const varToAssign = this.selectUnassignedVariable(assignment, domains, constraints);
        if (!varToAssign) return { success: false };

        // 4. Get and randomize the domain values
        let orderedValues = this.orderDomainValues(varToAssign, domains, letterFrequencies);
        
        // We shuffle the domain so the puzzle feels different every time.
        // Even with shuffling, orderDomainValues keeps them sorted by quality, 
        // so we shuffle only slightly or completely depending on preference.
        orderedValues = this.shuffleArray(orderedValues);

        for (const value of orderedValues) {
            // 5. WORD UNIQUENESS CHECK
            // If reuse is toggled OFF, skip words already assigned to other slots
            if (!this.allowReuse && Object.values(assignment).includes(value)) {
                continue;
            }

            if (this.isConsistent(varToAssign, value, assignment, slots, constraints, cellContents)) {
                
                assignment[varToAssign] = value;
                
                const inferences = this.forwardCheck(varToAssign, value, assignment, domains, constraints);
                
                if (inferences !== false) {
                    const result = this._recursiveSearch(slots, domains, constraints, letterFrequencies, cellContents, assignment);
                    if (result.success) return result;
                }
                
                delete assignment[varToAssign];
                this.restoreDomains(domains, inferences);
            }
        }

        return { success: false };
    }

    /**
     * Standard Fisher-Yates Shuffle
     */
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    isConsistent(slotId, word, assignment, slots, constraints, cellContents) {
        const slotObj = slots[slotId];
        const positions = slotObj.positions || slotObj;
        
        for (let i = 0; i < positions.length; i++) {
            const [r, c] = positions[i];
            const val = cellContents[`${r},${c}`];
            
            // Only conflict if the cell contains a LETTER (A-Z)
            if (val && /[A-Z]/.test(val)) {
                if (val !== word[i]) return false;
            }
        }

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