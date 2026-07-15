import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const playwrightCli = fileURLToPath(import.meta.resolve('@playwright/test/cli'));

async function findAvailablePort() {
    const probe = net.createServer();
    await new Promise((resolve, reject) => {
        probe.once('error', reject);
        probe.listen(0, '127.0.0.1', resolve);
    });
    const address = probe.address();
    await new Promise((resolve) => probe.close(resolve));
    return address.port;
}

function waitForExit(child) {
    return new Promise((resolve) => {
        if (child.exitCode !== null) {
            resolve(child.exitCode);
            return;
        }

        child.once('exit', (code) => resolve(code));
    });
}

async function waitForServer(server, baseUrl, timeoutMs = 30_000) {
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
    const port = await findAvailablePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const server = spawn(process.execPath, ['scripts/serve-static.mjs', String(port)], {
        stdio: ['ignore', 'ignore', 'inherit']
    });
    const serverExit = waitForExit(server);

    try {
        await waitForServer(server, baseUrl);

        const testRunner = spawn(process.execPath, [playwrightCli, 'test'], {
            stdio: 'inherit',
            env: {
                ...process.env,
                PLAYWRIGHT_BASE_URL: baseUrl
            }
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
