// main.js
import { CrosswordSolver } from './CrosswordSolver.js';

document.addEventListener('DOMContentLoaded', () => {
    // The entry point simply boots the Coordinator
    const app = new CrosswordSolver();
    app.init();
});