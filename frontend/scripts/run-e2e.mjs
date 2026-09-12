import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(frontendRoot, "..");
const backendRoot = resolve(repoRoot, "backend");
const artifactsDir = resolve(frontendRoot, "test-results");
const externalUrl = process.env.OFFERMESH_E2E_EXTERNAL_URL;
const apiPort = Number(process.env.OFFERMESH_E2E_API_PORT ?? 3101);
const webPort = Number(process.env.OFFERMESH_E2E_WEB_PORT ?? 5187);

await mkdir(artifactsDir, { recursive: true });

function waitForExit(child) {
  return new Promise((resolveExit, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => resolveExit(code ?? 1));
  });
}

async function runPython(baseUrl) {
  const child = spawn(
    process.env.PYTHON ?? "python",
    [resolve(frontendRoot, "tests/e2e_result.py")],
    {
      cwd: frontendRoot,
      env: { ...process.env, OFFERMESH_E2E_URL: baseUrl },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  return waitForExit(child);
}

if (externalUrl) {
  process.exitCode = await runPython(externalUrl);
} else {
  const temp = await mkdtemp(resolve(tmpdir(), "offermesh-e2e-"));
  let web;
  let backend;

  try {
    const serverModule = resolve(temp, "backend-e2e-server.mjs");
    const appUrl = pathToFileURL(resolve(backendRoot, "src/app.ts")).href;
    await writeFile(
      serverModule,
      `import { createApp } from ${JSON.stringify(appUrl)};\n` +
        `const host = "127.0.0.1";\n` +
        `const port = Number(process.env.OFFERMESH_TEST_PORT);\n` +
        `const app = await createApp({ dbPath: process.env.OFFERMESH_DB_PATH });\n` +
        "const server = app.listen(port, host, () => console.log(`OfferMesh e2e backend listening at http://${host}:${port}`));\n" +
        `let stopping = false;\n` +
        `function stop() {\n` +
        `  if (stopping) process.exit(0);\n` +
        `  stopping = true;\n` +
        `  server.close(() => { app.locals.store?.close?.(); process.exit(0); });\n` +
        `  setTimeout(() => process.exit(0), 1000).unref();\n` +
        `}\n` +
        `process.on("SIGTERM", stop);\n` +
        `process.on("SIGINT", stop);\n`,
      "utf8",
    );

    backend = spawn(
      process.execPath,
      [resolve(backendRoot, "node_modules/tsx/dist/cli.mjs"), serverModule],
      {
        cwd: backendRoot,
        env: {
          ...process.env,
          OFFERMESH_TEST_PORT: String(apiPort),
          OFFERMESH_DB_PATH: resolve(temp, "result-e2e.sqlite"),
        },
        stdio: "inherit",
        windowsHide: true,
      },
    );

    let ready = false;
    for (let i = 0; i < 120; i += 1) {
      if (backend.exitCode !== null) {
        throw new Error("Test backend failed to start");
      }
      try {
        const response = await fetch(`http://127.0.0.1:${apiPort}/api/requests/test-missing`);
        if (response.status === 404) {
          ready = true;
          break;
        }
      } catch {
        // keep polling until the tsx-loaded backend is listening
      }
      await new Promise((resolvePoll) => setTimeout(resolvePoll, 100));
    }

    if (!ready) {
      throw new Error("Backend startup timed out");
    }

    web = await createServer({
      configFile: false,
      plugins: [react()],
      root: frontendRoot,
      server: {
        port: webPort,
        strictPort: true,
        host: "127.0.0.1",
        proxy: { "/api": `http://127.0.0.1:${apiPort}` },
      },
    });
    await web.listen();

    process.exitCode = await runPython(`http://127.0.0.1:${webPort}`);
  } finally {
    await web?.close();
    if (backend && backend.exitCode === null) {
      backend.kill();
      await new Promise((resolveExit) =>
        backend.exitCode !== null ? resolveExit() : backend.once("exit", resolveExit),
      );
    }
    await rm(temp, { recursive: true, force: true });
  }
}
