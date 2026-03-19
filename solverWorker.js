/**
 * solverWorker.js
 */

class Solver {
    constructor(data) {
        this.slots = data.slots || {};
        this.domains = data.domains || {};
        this.constraints = data.constraints || {};
        this.letterFrequencies = data.letterFrequencies || {};
        this.recursiveCalls = 0;
    }

    solve() {
        try {
            if (!this.ac3()) {
                console.warn("AC-3 determined no solution possible before starting.");
            }
            const solution = this.backtrackingSolve({});
            return { solution, recursiveCalls: this.recursiveCalls };
        } catch (error) {
            console.error("Solver Error:", error);
            return { solution: null, recursiveCalls: this.recursiveCalls };
        }
    }

    ac3() {
        let queue = [];
        for (const slot in this.constraints) {
            for (const neighbor of this.constraints[slot]) {
                queue.push([slot, neighbor.slot]);
            }
        }

        while (queue.length > 0) {
            const [slotA, slotB] = queue.shift();
            if (this.revise(slotA, slotB)) {
                if (!this.domains[slotA] || this.domains[slotA].length === 0) return false;
                for (const neighbor of this.constraints[slotA]) {
                    if (neighbor.slot !== slotB) {
                        queue.push([neighbor.slot, slotA]);
                    }
                }
            }
        }
        return true;
    }

    revise(slotA, slotB) {
        let revised = false;
        const constraint = this.constraints[slotA]?.find(c => c.slot === slotB);
        if (!constraint || !this.domains[slotA] || !this.domains[slotB]) return false;

        const newDomain = [];
        for (const wordA of this.domains[slotA]) {
            let possible = false;
            for (const wordB of this.domains[slotB]) {
                if (wordA[constraint.indexA] === wordB[constraint.indexB]) {
                    possible = true;
                    break;
                }
            }
            if (possible) {
                newDomain.push(wordA);
            } else {
                revised = true;
            }
        }
        this.domains[slotA] = newDomain;
        return revised;
    }

    backtrackingSolve(assigned = {}) {
        this.recursiveCalls++;
        if (this.recursiveCalls > 50000) return null; // Safety timeout

        if (Object.keys(assigned).length === Object.keys(this.slots).length) {
            return assigned;
        }

        const slot = this.selectUnassignedVariable(assigned);
        if (!slot) return null;

        const orderedWords = this.orderDomainValues(slot);

        for (const word of orderedWords) {
            if (this.isConsistent(slot, word, assigned)) {
                assigned[slot] = word;
                const savedDomains = JSON.parse(JSON.stringify(this.domains));
                
                if (this.forwardCheck(slot, word)) {
                    const result = this.backtrackingSolve(assigned);
                    if (result) return result;
                }
                
                this.domains = savedDomains;
                delete assigned[slot];
            }
        }
        return null;
    }

    isConsistent(slot, word, assigned) {
        const constraints = this.constraints[slot] || [];
        for (const constraint of constraints) {
            if (assigned[constraint.slot]) {
                const neighborWord = assigned[constraint.slot];
                if (word[constraint.indexA] !== neighborWord[constraint.indexB]) {
                    return false;
                }
            }
        }
        return true;
    }

    forwardCheck(slot, word) {
        const constraints = this.constraints[slot] || [];
        for (const constraint of constraints) {
            const neighbor = constraint.slot;
            if (this.domains[neighbor]) {
                const newNeighborDomain = this.domains[neighbor].filter(neighborWord => {
                    return word[constraint.indexA] === neighborWord[constraint.indexB];
                });
                if (newNeighborDomain.length === 0) return false;
                this.domains[neighbor] = newNeighborDomain;
            }
        }
        return true;
    }

    orderDomainValues(slot) {
        const words = this.domains[slot] || [];
        if (Object.keys(this.letterFrequencies).length === 0) return words;
        return [...words].sort((a, b) => this.getLetterFrequency(b) - this.getLetterFrequency(a));
    }

    getLetterFrequency(word) {
        let score = 0;
        for (const ch of word) {
            score += this.letterFrequencies[ch] || 0;
        }
        return score;
    }

    selectUnassignedVariable(assigned) {
        let bestSlot = null;
        let minDomainSize = Infinity;

        for (const slot in this.slots) {
            if (!assigned[slot]) {
                const domainSize = this.domains[slot] ? this.domains[slot].length : 0;
                if (domainSize < minDomainSize) {
                    minDomainSize = domainSize;
                    bestSlot = slot;
                }
            }
        }
        return bestSlot;
    }
}

self.onmessage = function(e) {
    const solver = new Solver(e.data);
    const startTime = performance.now();
    const { solution, recursiveCalls } = solver.solve();
    const endTime = performance.now();
    
    self.postMessage({
        solution,
        recursiveCalls,
        solveTime: (endTime - startTime) / 1000
    });
};
