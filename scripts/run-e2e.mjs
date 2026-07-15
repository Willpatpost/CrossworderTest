import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const baseUrl = 'http://127.0.0.1:4173';
const playwrightCli = fileURLToPath(import.meta.resolve('@playwright/test/cli'));

function waitForExit(child) {
    return new Promise((resolve) => {
        if (child.exitCode !== null) {
            resolve(child.exitCode);
            return;
        }

        child.once('exit', (code) => resolve(code));
    });
}

async function waitForServer(server, timeoutMs = 30_000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (server.exitCode !== null) {
            throw new Error(`Static server exited with code ${server.exitCode}.`);
        }

        try {
            const response = await fetch(baseUrl);
            if (response.ok) return;
        } catch {
            // The server may still be binding its port.
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(`Static server did not become ready at ${baseUrl}.`);
}

async function main() {
    const server = spawn(process.execPath, ['scripts/serve-static.mjs', '4173'], {
        stdio: ['ignore', 'ignore', 'inherit']
    });
    const serverExit = waitForExit(server);

    try {
        await waitForServer(server);

        const testRunner = spawn(process.execPath, [playwrightCli, 'test'], {
            stdio: 'inherit'
        });
        const testExitCode = await waitForExit(testRunner);
        process.exitCode = testExitCode ?? 1;
    } finally {
        if (server.exitCode === null) {
            server.kill();
        }
        await serverExit;
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
