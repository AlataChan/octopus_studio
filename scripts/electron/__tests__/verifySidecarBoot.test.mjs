import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test, { afterEach } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  checkPackageNodeEngine,
  findUnsatisfiedNodeEngines,
  probeElectronNodeVersion,
  resetChildProcessForTests,
  setSpawnSyncForTests,
} = require("../verify-sidecar-boot.cjs");

afterEach(() => {
  resetChildProcessForTests();
});

test("checkPackageNodeEngine accepts missing or compatible node engines", () => {
  assert.equal(
    checkPackageNodeEngine({ name: "no-engine", version: "1.0.0" }, "18.18.2"),
    null
  );
  assert.equal(
    checkPackageNodeEngine(
      {
        name: "compatible",
        version: "1.0.0",
        engines: { node: ">=18.17" },
      },
      "18.18.2"
    ),
    null
  );
});

test("checkPackageNodeEngine reports packages that require newer Node", () => {
  assert.deepEqual(
    checkPackageNodeEngine(
      {
        name: "undici",
        version: "7.27.2",
        engines: { node: ">=20.18.1" },
      },
      "18.18.2"
    ),
    {
      name: "undici",
      version: "7.27.2",
      engine: ">=20.18.1",
    }
  );
});

test("findUnsatisfiedNodeEngines walks top-level and scoped packages", () => {
  const root = mkdtempSync(join(tmpdir(), "sidecar-engines-test-"));
  try {
    const nodeModules = join(root, "server", "node_modules");
    mkdirSync(join(nodeModules, "good"), { recursive: true });
    mkdirSync(join(nodeModules, "bad"), { recursive: true });
    mkdirSync(join(nodeModules, "@scope", "bad"), { recursive: true });
    writeFileSync(
      join(nodeModules, "good", "package.json"),
      JSON.stringify({
        name: "good",
        version: "1.0.0",
        engines: { node: ">=18.17" },
      })
    );
    writeFileSync(
      join(nodeModules, "bad", "package.json"),
      JSON.stringify({
        name: "bad",
        version: "2.0.0",
        engines: { node: ">=20.18.1" },
      })
    );
    writeFileSync(
      join(nodeModules, "@scope", "bad", "package.json"),
      JSON.stringify({
        name: "@scope/bad",
        version: "3.0.0",
        engines: { node: "^20.0.0" },
      })
    );

    const failures = findUnsatisfiedNodeEngines(
      [{ name: "server", dir: join(root, "server") }],
      "18.18.2"
    );

    assert.deepEqual(
      failures.map((failure) => `${failure.sidecar}:${failure.name}`),
      ["server:@scope/bad", "server:bad"]
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("probeElectronNodeVersion retries an empty SIGKILL probe and returns the version", () => {
  const calls = [];
  setSpawnSyncForTests((executable, args, options) => {
    calls.push({ executable, args, options });
    if (calls.length === 1) {
      return {
        error: null,
        status: null,
        signal: "SIGKILL",
        stdout: "",
        stderr: "",
      };
    }
    return {
      error: null,
      status: 0,
      signal: null,
      stdout: "24.15.0\n",
      stderr: "",
    };
  });

  assert.equal(
    probeElectronNodeVersion("relative/Octopus Studio", {
      maxAttempts: 2,
      retryDelayMs: 0,
    }),
    "24.15.0"
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[0].executable, resolve("relative/Octopus Studio"));
  assert.deepEqual(calls[0].args, ["-e", "console.log(process.versions.node)"]);
  assert.equal(calls[0].options.env.ELECTRON_RUN_AS_NODE, "1");
});

test("probeElectronNodeVersion throws with signal after repeated empty probe failures", () => {
  setSpawnSyncForTests(() => ({
    error: null,
    status: null,
    signal: "SIGKILL",
    stdout: "",
    stderr: "",
  }));

  assert.throws(
    () =>
      probeElectronNodeVersion("/tmp/Octopus Studio", {
        maxAttempts: 2,
        retryDelayMs: 0,
      }),
    /Failed to probe packaged Electron Node version\.[\s\S]*signal=SIGKILL/
  );
});
