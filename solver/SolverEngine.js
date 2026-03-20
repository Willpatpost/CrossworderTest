// solver/SolverEngine.js

export class SolverEngine {
    constructor() {
        this.recursiveCalls = 0;
    }

    // Maps to original: ac3() and revise()
    ac3(domains, constraints) {
        const queue = new Set();
        for (const slotA in constraints) {
            for (const slotB in constraints[slotA]) {
                queue.add(`${slotA},${slotB}`);
            }
        }

        while (queue.size > 0) {
            const [var1, var2] = Array.from(queue).shift().split(',');
            queue.delete(`${var1},${var2}`);

            if (this.revise(var1, var2, domains, constraints)) {
                if (domains[var1].length === 0) return false;
                for (const neighbor in constraints[var1]) {
                    if (neighbor !== var2) queue.add(`${neighbor},${var1}`);
                }
            }
        }
        return true;
    }

    revise(var1, var2, domains, constraints) {
        let revised = false;
        const overlaps = constraints[var1][var2];
        const newDomain = domains[var1].filter(word1 => {
            return overlaps.some(([idx1, idx2]) => {
                return domains[var2].some(word2 => word1[idx1] === word2[idx2]);
            });
        });

        if (newDomain.length < domains[var1].length) {
            domains[var1] = newDomain;
            revised = true;
        }
        return revised;
    }

    // Maps to original: backtrackingSolve()
    backtrackingSolve(slots, domains, constraints, letterFrequencies, cellContents, assignment = {}, cache = {}) {
        if (Object.keys(assignment).length === Object.keys(slots).length) {
            return { success: true, solution: { ...assignment } };
        }

        this.recursiveCalls++;
        const assignmentKey = JSON.stringify(Object.entries(assignment).sort());
        if (cache[assignmentKey] !== undefined) return { success: cache[assignmentKey] };

        const varToAssign = this.selectUnassignedVariable(assignment, domains, constraints);
        if (!varToAssign) {
            cache[assignmentKey] = false;
            return { success: false };
        }

        const orderedValues = this.orderDomainValues(varToAssign, domains, letterFrequencies);

        for (const value of orderedValues) {
            if (this.isConsistent(varToAssign, value, assignment, slots, domains, constraints, cellContents)) {
                assignment[varToAssign] = value;
                const inferences = this.forwardCheck(varToAssign, value, assignment, domains, constraints);
                
                if (inferences !== false) {
                    const result = this.backtrackingSolve(slots, domains, constraints, letterFrequencies, cellContents, assignment, cache);
                    if (result.success) {
                        cache[assignmentKey] = true;
                        return result;
                    }
                }
                
                delete assignment[varToAssign];
                this.restoreDomains(domains, inferences);
            }
        }

        cache[assignmentKey] = false;
        return { success: false };
    }

    // Maps to original: selectUnassignedVariable() (MRV Heuristic)
    selectUnassignedVariable(assignment, domains, constraints) {
        const unassigned = Object.keys(domains).filter(s => !(s in assignment));
        if (unassigned.length === 0) return null;

        let minSize = Infinity;
        let candidates = [];
        for (const slot of unassigned) {
            const size = domains[slot].length;
            if (size < minSize) {
                minSize = size;
                candidates = [slot];
            } else if (size === minSize) {
                candidates.push(slot);
            }
        }

        let maxDegree = -1;
        let finalCandidates = [];
        for (const slot of candidates) {
            const deg = constraints[slot] ? Object.keys(constraints[slot]).length : 0;
            if (deg > maxDegree) {
                maxDegree = deg;
                finalCandidates = [slot];
            } else if (deg === maxDegree) {
                finalCandidates.push(slot);
            }
        }

        return finalCandidates[Math.floor(Math.random() * finalCandidates.length)];
    }

    // Maps to original: orderDomainValues() and shuffleArray()
    orderDomainValues(slot, domains, letterFrequencies) {
        const domain = [...domains[slot]];
        const getFrequencyScore = (word) =>
            word.split('').reduce((acc, ch) => acc + (letterFrequencies[ch] || 0), 0);

        domain.sort((a, b) => getFrequencyScore(a) - getFrequencyScore(b));

        for (let i = domain.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [domain[i], domain[j]] = [domain[j], domain[i]];
        }
        return domain;
    }

    // Maps to original: isConsistent(), wordMatchesPreFilledLetters(), wordsMatch()
    isConsistent(slot, word, assignment, slots, domains, constraints, cellContents) {
        const positions = slots[slot];
        for (let i = 0; i < positions.length; i++) {
            const [r, c] = positions[i];
            const preFilled = cellContents[`${r},${c}`];
            if (preFilled && preFilled !== word[i]) return false;
        }

        const neighbors = constraints[slot] || {};
        for (const neighbor in neighbors) {
            if (neighbor in assignment) {
                const overlaps = constraints[slot][neighbor];
                for (const [idx1, idx2] of overlaps) {
                    if (word[idx1] !== assignment[neighbor][idx2]) return false;
                }
            } else {
                const viable = domains[neighbor].filter(w => {
                    const overlaps = constraints[slot][neighbor];
                    for (const [idx1, idx2] of overlaps) {
                        if (word[idx1] !== w[idx2]) return false;
                    }
                    return true;
                });
                if (viable.length === 0) return false;
            }
        }
        return true;
    }

    // Maps to original: forwardCheck()
    forwardCheck(slot, value, assignment, domains, constraints) {
        const inferences = {};
        const neighbors = constraints[slot] || {};

        for (const neighbor in neighbors) {
            if (!(neighbor in assignment)) {
                const newDomain = domains[neighbor].filter(w => {
                    const overlaps = constraints[slot][neighbor];
                    for (const [idx1, idx2] of overlaps) {
                        if (value[idx1] !== w[idx2]) return false;
                    }
                    return true;
                });
                
                if (newDomain.length === 0) return false;
                
                inferences[neighbor] = domains[neighbor];
                domains[neighbor] = newDomain;
            }
        }
        return inferences;
    }

    // Maps to original: restoreDomains()
    restoreDomains(domains, inferences) {
        if (!inferences) return;
        for (const v in inferences) {
            domains[v] = inferences[v];
        }
    }
}