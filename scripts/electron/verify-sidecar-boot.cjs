#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const childProcess = require("child_process");
const semver = require("semver");

const DEFAULT_TIMEOUT_MS = 8_000;
const ELECTRON_PROBE_MAX_ATTEMPTS = 5;
const ELECTRON_PROBE_RETRY_DELAY_MS = 1_500;
const SIDECAR_BOOT_MAX_ATTEMPTS = 3;
const EARLY_GATEKEEPER_KILL_MS = 500;
let spawnImpl = childProcess.spawn;
let spawnSyncImpl = childProcess.spawnSync;
const SIDECARS = [
  {
    name: "server",
    relativeDir: "server",
    entry: "index.js",
    readyPattern: /Primary server .* listening on/i,
  },
  {
    name: "collector",
    relativeDir: "collector",
    entry: "index.js",
    readyPattern: /Document processor app listening on/i,
  },
  {
    name: "gateway",
    relativeDir: "alata-im-gateway",
    entry: path.join("bin", "alata-gateway.js"),
    args: ["run"],
    readyPattern: /alata-im-gateway listening on/i,
  },
];

function parseCliArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const arg of argv) {
    if (arg.startsWith("--appOutDir=")) args.appOutDir = arg.slice("--appOutDir=".length);
    if (arg.startsWith("--productFilename=")) {
      args.productFilename = arg.slice("--productFilename=".length);
    }
    if (arg.startsWith("--serverManagerPath=")) {
      args.serverManagerPath = arg.slice("--serverManagerPath=".length);
    }
    if (arg.startsWith("--bootTimeoutMs=")) {
      args.bootTimeoutMs = Number(arg.slice("--bootTimeoutMs=".length));
    }
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function resolveAppPaths({ appOutDir, productFilename }) {
  if (!appOutDir) throw new Error("--appOutDir is required");
  const absoluteAppOutDir = path.resolve(appOutDir);

  let appName = productFilename ? `${productFilename}.app` : null;
  if (!appName) {
    const apps = fs
      .readdirSync(absoluteAppOutDir)
      .filter((name) => name.endsWith(".app"));
    if (apps.length !== 1) {
      throw new Error(
        `Expected exactly one .app in ${absoluteAppOutDir}; found ${apps.length}. Pass --productFilename.`
      );
    }
    appName = apps[0];
    productFilename = path.basename(appName, ".app");
  }

  const appBundle = path.join(absoluteAppOutDir, appName);
  const appExecutable = path.join(appBundle, "Contents", "MacOS", productFilename);
  const resourcesDir = path.join(appBundle, "Contents", "Resources");

  if (!fs.existsSync(appExecutable)) {
    throw new Error(`Packaged app executable not found: ${appExecutable}`);
  }
  if (!fs.existsSync(resourcesDir)) {
    throw new Error(`Packaged Resources directory not found: ${resourcesDir}`);
  }

  return { appBundle, appExecutable, resourcesDir, productFilename };
}

function sleepSync(ms) {
  if (!ms) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function hasUsableStdout(result) {
  return typeof result?.stdout === "string" && result.stdout.trim().length > 0;
}

function formatProbeFailure(result) {
  return [
    "Failed to probe packaged Electron Node version.",
    `status=${result?.status ?? "null"}`,
    `signal=${result?.signal ?? "null"}`,
    result?.error?.message,
    result?.stdout,
    result?.stderr,
  ]
    .filter(Boolean)
    .join("\n");
}

function probeElectronNodeVersion(appExecutable, options = {}) {
  const executable = path.resolve(appExecutable);
  const maxAttempts = options.maxAttempts || ELECTRON_PROBE_MAX_ATTEMPTS;
  const retryDelayMs =
    options.retryDelayMs ?? ELECTRON_PROBE_RETRY_DELAY_MS;
  let lastResult = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = spawnSyncImpl(
      executable,
      ["-e", "console.log(process.versions.node)"],
      {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        encoding: "utf-8",
      }
    );
    lastResult = result;

    if (!result.error && result.status === 0 && hasUsableStdout(result)) {
      return result.stdout.trim();
    }

    console.warn(
      `[sidecar-guard] electron probe attempt ${attempt}/${maxAttempts} failed (signal=${result?.signal ?? "null"}, status=${result?.status ?? "null"})`
    );

    const retryable = result.status !== 0 && !hasUsableStdout(result);
    if (!retryable || attempt === maxAttempts) {
      throw new Error(formatProbeFailure(result));
    }

    sleepSync(retryDelayMs);
  }

  throw new Error(formatProbeFailure(lastResult));
}

function listTopLevelPackageJsons(nodeModulesDir) {
  if (!fs.existsSync(nodeModulesDir)) return [];

  const packageJsons = [];
  const entries = fs
    .readdirSync(nodeModulesDir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

    if (entry.name.startsWith("@")) {
      const scopeDir = path.join(nodeModulesDir, entry.name);
      const scopedEntries = fs
        .readdirSync(scopeDir, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const scoped of scopedEntries) {
        if (!scoped.isDirectory() || scoped.name.startsWith(".")) continue;
        const packageJson = path.join(scopeDir, scoped.name, "package.json");
        if (fs.existsSync(packageJson)) packageJsons.push(packageJson);
      }
      continue;
    }

    const packageJson = path.join(nodeModulesDir, entry.name, "package.json");
    if (fs.existsSync(packageJson)) packageJsons.push(packageJson);
  }

  return packageJsons;
}

function checkPackageNodeEngine(packageJson, nodeVersion) {
  const nodeRange = packageJson?.engines?.node;
  if (!nodeRange) return null;

  const normalizedNodeVersion = semver.coerce(nodeVersion);
  if (!normalizedNodeVersion) {
    throw new Error(`Invalid Node version for engine check: ${nodeVersion}`);
  }

  if (
    semver.satisfies(normalizedNodeVersion, nodeRange, {
      includePrerelease: true,
    })
  ) {
    return null;
  }

  return {
    name: packageJson.name || "(unknown)",
    version: packageJson.version || "(unknown)",
    engine: nodeRange,
  };
}

function findUnsatisfiedNodeEngines(sidecarDirs, nodeVersion) {
  const failures = [];
  for (const sidecar of sidecarDirs) {
    const packageJsons = listTopLevelPackageJsons(
      path.join(sidecar.dir, "node_modules")
    );
    for (const packageJsonPath of packageJsons) {
      const packageJson = readJson(packageJsonPath);
      const failure = checkPackageNodeEngine(packageJson, nodeVersion);
      if (failure) {
        failures.push({
          ...failure,
          sidecar: sidecar.name,
          packageJsonPath,
        });
      }
    }
  }
  return failures;
}

function assertGatewayDesktopRuntimeEnv(serverManagerPath) {
  if (!serverManagerPath) return;

  const source = fs.readFileSync(serverManagerPath, "utf-8");
  const start = source.indexOf("async startGateway");
  if (start < 0) {
    throw new Error(`Unable to locate startGateway in ${serverManagerPath}`);
  }

  const nextMethod = source.indexOf("\n  async ", start + 1);
  const block = source.slice(start, nextMethod < 0 ? source.length : nextMethod);
  const envBlock = block.match(/const env\s*=\s*\{[\s\S]*?\n\s*\};/);

  if (!envBlock || !/ANYTHING_LLM_RUNTIME/.test(envBlock[0]) || !/desktop/.test(envBlock[0])) {
    throw new Error(
      "electron/main/serverManager.cjs startGateway env must set ANYTHING_LLM_RUNTIME to desktop."
    );
  }
}

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function makeBaseEnv({ serverPort, collectorPort, gatewayPort, storageDir, gatewayDataDir }) {
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    ANYTHING_LLM_RUNTIME: "desktop",
    SERVER_HOST: "127.0.0.1",
    SERVER_PORT: String(serverPort),
    COLLECTOR_HOST: "127.0.0.1",
    COLLECTOR_PORT: String(collectorPort),
    GATEWAY_HOST: "127.0.0.1",
    GATEWAY_PORT: String(gatewayPort),
    STORAGE_DIR: storageDir,
    GATEWAY_DATA_DIR: gatewayDataDir,
    GATEWAY_CONFIG_MODE: "standalone",
    ALATA_BASE_URL: `http://127.0.0.1:${serverPort}/api`,
    CORS_ALLOWED_ORIGINS: `http://127.0.0.1:${serverPort}`,
    DATABASE_URL: `file:${path.join(storageDir, "anythingllm.db")}`,
    JWT_SECRET: crypto.randomBytes(32).toString("hex"),
    VECTOR_DB: "lancedb",
  };
}

function prepareServerStorage(resourcesDir, storageDir) {
  fs.mkdirSync(storageDir, { recursive: true });
  const templateDb = path.join(
    resourcesDir,
    "server",
    "prisma",
    "template-anythingllm.db"
  );
  const targetDb = path.join(storageDir, "anythingllm.db");
  if (fs.existsSync(templateDb) && !fs.existsSync(targetDb)) {
    fs.copyFileSync(templateDb, targetDb);
  }
}

function tailLines(lines, count = 20) {
  return lines.slice(-count).join("\n");
}

function terminateChild(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  child.kill("SIGTERM");
  setTimeout(() => {
    if (!child.killed && child.exitCode === null) child.kill("SIGKILL");
  }, 2_000).unref();
}

function isEarlyGatekeeperKill({ signal, output, startedAt }) {
  return (
    ["SIGKILL", "SIGTERM"].includes(signal) &&
    output.length === 0 &&
    Date.now() - startedAt <= EARLY_GATEKEEPER_KILL_MS
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function smokeSidecarAttempt({
  appExecutable,
  resourcesDir,
  sidecar,
  env,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const sidecarDir = path.join(resourcesDir, sidecar.relativeDir);
  const entry = path.join(sidecarDir, sidecar.entry);
  if (!fs.existsSync(entry)) {
    throw new Error(`[sidecar-guard] ${sidecar.name} entry not found: ${entry}`);
  }

  const output = [];
  const executable = path.resolve(appExecutable);
  const startedAt = Date.now();
  const child = spawnImpl(executable, [entry, ...(sidecar.args || [])], {
    cwd: sidecarDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  return await new Promise((resolve, reject) => {
    let settled = false;

    function settle(result, isFailure = false) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      terminateChild(child);
      if (isFailure) reject(result);
      else resolve(result);
    }

    const timer = setTimeout(() => {
      settle({
        status: "alive-after-timeout",
        line: `[sidecar-guard] ${sidecar.name} stayed alive for ${timeoutMs}ms`,
      });
    }, timeoutMs);

    child.stdout.on("data", (data) => {
      const text = data.toString();
      output.push(...text.split(/\r?\n/).filter(Boolean));
      const readyLine = output.find((line) => sidecar.readyPattern.test(line));
      if (readyLine) {
        settle({ status: "ready", line: readyLine });
      }
    });

    child.stderr.on("data", (data) => {
      output.push(...data.toString().split(/\r?\n/).filter(Boolean));
    });

    child.on("error", (error) => {
      settle(
        new Error(
          `[sidecar-guard] ${sidecar.name} failed to spawn: ${error.message}`
        ),
        true
      );
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      const error = new Error(
        [
          `[sidecar-guard] ${sidecar.name} exited before readiness (code=${code}, signal=${signal}).`,
          tailLines(output),
        ]
          .filter(Boolean)
          .join("\n")
      );
      error.retryableGatekeeperKill = isEarlyGatekeeperKill({
        signal,
        output,
        startedAt,
      });
      error.code = code;
      error.signal = signal;
      settle(error, true);
    });
  });
}

async function smokeSidecar({
  appExecutable,
  resourcesDir,
  sidecar,
  env,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  let lastError = null;
  for (let attempt = 1; attempt <= SIDECAR_BOOT_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await smokeSidecarAttempt({
        appExecutable,
        resourcesDir,
        sidecar,
        env,
        timeoutMs,
      });
    } catch (error) {
      lastError = error;
      if (!error.retryableGatekeeperKill || attempt === SIDECAR_BOOT_MAX_ATTEMPTS) {
        throw error;
      }
      console.warn(
        `[sidecar-guard] ${sidecar.name} boot attempt ${attempt}/${SIDECAR_BOOT_MAX_ATTEMPTS} killed early (signal=${error.signal ?? "null"}, status=${error.code ?? "null"}); retrying.`
      );
      await sleep(ELECTRON_PROBE_RETRY_DELAY_MS);
    }
  }
  throw lastError;
}

function setSpawnSyncForTests(mockSpawnSync) {
  spawnSyncImpl = mockSpawnSync;
}

function resetChildProcessForTests() {
  spawnImpl = childProcess.spawn;
  spawnSyncImpl = childProcess.spawnSync;
}

async function verifyPackagedSidecars(options) {
  if (process.env.ALATA_SKIP_SIDECAR_BOOT_CHECK === "1") {
    console.warn(
      "[sidecar-guard] WARNING: ALATA_SKIP_SIDECAR_BOOT_CHECK=1; skipping packaged sidecar boot and engines checks."
    );
    return;
  }

  const { appExecutable, resourcesDir } = resolveAppPaths(options);
  const nodeVersion = probeElectronNodeVersion(appExecutable);
  console.log(`[sidecar-guard] Electron runtime Node: ${nodeVersion}`);

  assertGatewayDesktopRuntimeEnv(options.serverManagerPath);

  const sidecarDirs = SIDECARS.map((sidecar) => ({
    name: sidecar.name,
    dir: path.join(resourcesDir, sidecar.relativeDir),
  }));
  const engineFailures = findUnsatisfiedNodeEngines(sidecarDirs, nodeVersion);
  if (engineFailures.length > 0) {
    const details = engineFailures
      .map(
        (failure) =>
          `- ${failure.sidecar}: ${failure.name}@${failure.version} requires node "${failure.engine}"`
      )
      .join("\n");
    throw new Error(
      `[sidecar-guard] Static engines check failed for Electron Node ${nodeVersion}:\n${details}`
    );
  }
  console.log(
    `[sidecar-guard] Static engines check passed for ${sidecarDirs.length} sidecars.`
  );

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "alata-sidecar-boot-"));
  const storageDir = path.join(tempRoot, "server-storage");
  const gatewayDataDir = path.join(tempRoot, "gateway-data");
  fs.mkdirSync(gatewayDataDir, { recursive: true });
  prepareServerStorage(resourcesDir, storageDir);

  const ports = {
    serverPort: await getFreePort(),
    collectorPort: await getFreePort(),
    gatewayPort: await getFreePort(),
  };
  const env = makeBaseEnv({
    ...ports,
    storageDir,
    gatewayDataDir,
  });

  try {
    for (const sidecar of SIDECARS) {
      const result = await smokeSidecar({
        appExecutable,
        resourcesDir,
        sidecar,
        env,
        timeoutMs: options.bootTimeoutMs || DEFAULT_TIMEOUT_MS,
      });
      console.log(`[sidecar-guard] ${sidecar.name} readiness: ${result.line}`);
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  console.log("[sidecar-guard] Packaged sidecar guard passed.");
}

if (require.main === module) {
  verifyPackagedSidecars(parseCliArgs()).catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exit(1);
  });
}

module.exports = {
  SIDECARS,
  assertGatewayDesktopRuntimeEnv,
  checkPackageNodeEngine,
  findUnsatisfiedNodeEngines,
  listTopLevelPackageJsons,
  parseCliArgs,
  probeElectronNodeVersion,
  resolveAppPaths,
  resetChildProcessForTests,
  setSpawnSyncForTests,
  verifyPackagedSidecars,
};
