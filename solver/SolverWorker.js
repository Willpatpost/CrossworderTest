// solver/SolverWorker.js
import { SolverEngine } from './SolverEngine.js';

const solver = new SolverEngine();

self.onmessage = async (e) => {
    const { type, payload } = e.data;

    if (type === 'START_SOLVE') {
        const {
            slots,
            domains,
            constraints,
            letterFrequencies,
            cellContents,
            settings
        } = payload;

        // Route visualization updates back to the main thread
        if (settings.visualize) {
            solver.onUpdateCallback = (slotId, word) => {
                self.postMessage({
                    type: 'UPDATE',
                    payload: { slotId, word }
                });
            };
        } else {
            solver.onUpdateCallback = null;
        }

        try {
            // Execute the heavy recursive search
            const result = await solver.backtrackingSolve(
                slots,
                domains,
                constraints,
                letterFrequencies,
                cellContents,
                settings
            );

            // Send the final solution back
            self.postMessage({
                type: 'RESULT',
                payload: result
            });
        } catch (error) {
            self.postMessage({
                type: 'ERROR',
                payload: error.message
            });
        }
    }
};