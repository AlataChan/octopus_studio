#!/usr/bin/env node
/**
 * stage-sidecars.mjs
 *
 * Creates self-contained sidecar bundles for Electron packaging.
 * Each sidecar (server, collector, alata-im-gateway) gets its own node_modules with production deps,
 * native modules rebuilt for the target Electron version and architecture.
 *
 * Usage:
 *   node scripts/electron/stage-sidecars.mjs --arch=arm64 --outDir=.electron-build/sidecars
 *   node scripts/electron/stage-sidecars.mjs --arch=x64 --outDir=.electron-build/sidecars
 */

import { execSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  rmSync,
  cpSync,
  closeSync,
  openSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  symlinkSync,
  unlinkSync,
} from "fs";
import { createRequire } from "module";
import { tmpdir } from "os";
import { join, dirname, basename, resolve } from "path";
import { fileURLToPath } from "url";
import {
  resolveAnydocTarget,
  targetNpmInstallArgs,
} from "./anydoc-runtime-check.mjs";
import { shouldExclude } from "./stagingExclude.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, "../..");
const requireFromHere = createRequire(import.meta.url);

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    arch: "arm64",
    platform: process.platform,
    libc: null,
    outDir: ".electron-build/sidecars",
    electronVersion: null,
    verbose: false,
  };

  for (const arg of args) {
    if (arg.startsWith("--arch=")) {
      result.arch = arg.split("=")[1];
    } else if (arg.startsWith("--platform=")) {
      result.platform = arg.split("=")[1];
    } else if (arg.startsWith("--libc=")) {
      result.libc = arg.split("=")[1];
    } else if (arg.startsWith("--outDir=")) {
      result.outDir = arg.split("=")[1];
    } else if (arg.startsWith("--electronVersion=")) {
      result.electronVersion = arg.split("=")[1];
    } else if (arg === "--verbose" || arg === "-v") {
      result.verbose = true;
    }
  }

  // Auto-detect Electron version from installed dependency if not specified
  if (!result.electronVersion) {
    try {
      const electronPkgPath = requireFromHere.resolve("electron/package.json", {
        paths: [ROOT_DIR],
      });
      const electronPkg = JSON.parse(readFileSync(electronPkgPath, "utf-8"));
      if (electronPkg?.version) {
        result.electronVersion = electronPkg.version;
      }
    } catch {
      // ignore; fallback to package.json spec below
    }
  }

  // Fallback: detect Electron version from root package.json spec if not specified
  if (!result.electronVersion) {
    const rootPkg = JSON.parse(
      readFileSync(join(ROOT_DIR, "package.json"), "utf-8")
    );
    const electronDep =
      rootPkg.devDependencies?.electron || rootPkg.dependencies?.electron;
    if (electronDep) {
      // Remove ^ or ~ prefix
      result.electronVersion = electronDep.replace(/^[\^~]/, "");
    } else {
      console.error(
        "Error: Could not detect Electron version. Specify --electronVersion=X.Y.Z"
      );
      process.exit(1);
    }
  }

  const target = resolveAnydocTarget({
    platform: result.platform,
    arch: result.arch,
    libc: result.libc,
    hostPlatform: process.platform,
    processReport: process.report?.getReport?.(),
  });
  result.platform = target.platform;
  result.arch = target.arch;
  result.libc = target.libc;

  return result;
}

// Run a shell command with optional output capture
function run(cmd, options = {}) {
  const {
    cwd = ROOT_DIR,
    silent = false,
    capture = false,
    env = null,
  } = options;
  console.log(`  $ ${cmd}`);
  try {
    const result = execSync(cmd, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: capture ? "pipe" : silent ? "ignore" : "inherit",
      encoding: "utf-8",
    });
    return capture ? result.trim() : true;
  } catch (err) {
    if (capture) return "";
    throw err;
  }
}

// Recursively copy directory, excluding unwanted files
function copyDir(src, dest, relBase = "") {
  if (!existsSync(src)) return;

  mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
    if (shouldExclude(relPath)) continue;

    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, relPath);
    } else if (entry.isSymbolicLink()) {
      // Skip symlinks (like server/public -> frontend/dist)
      // We'll handle frontend assets separately
      console.log(`    Skipping symlink: ${entry.name}`);
    } else {
      cpSync(srcPath, destPath);
    }
  }
}

function createRebuildContext(destDir) {
  if (!/\s/.test(destDir)) {
    return { cwd: destDir, cleanup: () => {} };
  }

  const linkRoot = join(tmpdir(), "alata-electron-rebuild-links");
  mkdirSync(linkRoot, { recursive: true });
  const linkPath = join(
    linkRoot,
    `${basename(destDir)}-${process.pid}-${Date.now()}`
  );
  symlinkSync(destDir, linkPath, "dir");
  console.log(`  Using whitespace-safe rebuild path: ${linkPath}`);

  return {
    cwd: linkPath,
    cleanup: () => {
      try {
        unlinkSync(linkPath);
      } catch (err) {
        if (err.code !== "ENOENT") throw err;
      }
    },
  };
}

// Stage a single sidecar
async function stageSidecar(name, srcDir, destDir, config) {
  console.log(`\n=== Staging ${name} ===`);

  // Step 1: Copy source files (excluding node_modules, tests, etc.)
  console.log(`  Copying source files...`);
  copyDir(srcDir, destDir);

  // Step 2: Install production dependencies
  // Since this is a Yarn workspace monorepo, individual packages don't have their own
  // lockfiles that npm can use directly. We use `npm install` which is less deterministic
  // but works reliably for packaging purposes.
  console.log(`  Installing production dependencies...`);
  const targetArgs = targetNpmInstallArgs(config).join(" ");
  run(
    `npm install --omit=dev --ignore-scripts --legacy-peer-deps ${targetArgs}`,
    { cwd: destDir }
  );

  // Step 3: Rebuild native modules for Electron
  // Note: Native modules like bcrypt, sharp need to be rebuilt for Electron's Node version
  // We use @electron/rebuild (the updated package name)
  console.log(
    `  Rebuilding native modules for Electron ${config.electronVersion} (${config.arch})...`
  );
  const rebuildContext = createRebuildContext(destDir);
  try {
    // Use @electron/rebuild (the updated package, electron-rebuild is deprecated)
    run(
      `npx --yes @electron/rebuild -v ${config.electronVersion} --arch ${config.arch} --force --module-dir .`,
      { cwd: rebuildContext.cwd }
    );
  } catch (err) {
    console.error(
      `  ERROR: Native module rebuild failed for ${name}. Aborting sidecar staging.`
    );
    throw err;
  } finally {
    rebuildContext.cleanup();
  }

  // Step 4: Run prisma generate for server
  if (name === "server") {
    console.log(`  Running prisma generate...`);
    try {
      run("npx prisma generate", { cwd: destDir });
    } catch (err) {
      console.warn(`  Warning: prisma generate failed. Check Prisma setup.`);
    }

    // Step 5: Create a schema-only SQLite template DB for Electron.
    // - Packaged apps should store data under userData (writable), not app Resources (read-only).
    // - Prisma schema currently points at ../storage/anythingllm.db, so we run migrations once
    //   during staging to generate a clean DB file, then stash it under prisma/ for copying at runtime.
    console.log(
      `  Creating Electron template database (prisma migrate deploy)...`
    );
    const stagedStorageDir = join(destDir, "storage");
    const stagedDbPath = join(stagedStorageDir, "anythingllm.db");
    const templateDbPath = join(destDir, "prisma", "template-anythingllm.db");
    try {
      mkdirSync(stagedStorageDir, { recursive: true });
      rmSync(stagedDbPath, { force: true });
      closeSync(openSync(stagedDbPath, "w"));
      run("npx prisma migrate deploy", { cwd: destDir });

      // Seed builtin employees/settings into the template DB so first-run UX is not "empty".
      // - ANYTHING_LLM_RUNTIME=desktop marks a curated default team as `isDefault=true`.
      // - Official and demo templates are always included in the factory DB.
      // - SEED_GSTACK_ASSISTANTS=true is the desktop default so the factory
      //   template DB already includes gstack employees; explicitly set false
      //   in the build env to ship without them.
      run("npx prisma db seed", {
        cwd: destDir,
        env: {
          ANYTHING_LLM_RUNTIME: "desktop",
          SEED_GSTACK_ASSISTANTS:
            process.env.SEED_GSTACK_ASSISTANTS === "false" ? "false" : "true",
        },
      });
      if (!existsSync(stagedDbPath)) {
        throw new Error(`Expected DB not found at ${stagedDbPath}`);
      }
      cpSync(stagedDbPath, templateDbPath);
      rmSync(stagedStorageDir, { recursive: true, force: true });
      console.log(`  Template DB created: ${templateDbPath}`);
    } catch (err) {
      console.error(
        `  ERROR: failed to create template DB for Electron.\n  Packaged app will not boot without it.\n  ${err?.message || err}`
      );
      throw err;
    }
  }

  console.log(`  ${name} staged successfully.`);
}

// Stage frontend dist
function stageFrontend(srcDir, destDir) {
  console.log(`\n=== Staging frontend ===`);

  const frontendDist = join(srcDir, "frontend/dist");
  if (!existsSync(frontendDist)) {
    console.error(
      `  Error: frontend/dist not found. Run 'yarn prod:frontend' first.`
    );
    process.exit(1);
  }

  console.log(`  Copying frontend/dist...`);
  mkdirSync(dirname(destDir), { recursive: true });
  rmSync(destDir, { recursive: true, force: true });
  cpSync(frontendDist, destDir, { recursive: true });
  console.log(`  Frontend staged successfully.`);
}

// Ensure server/public has frontend assets (avoid symlink issues)
function linkFrontendToServer(stagedServerDir, stagedFrontendDir) {
  console.log(`\n=== Linking frontend to server/public ===`);

  const serverPublic = join(stagedServerDir, "public");

  // If server/public is a symlink, remove it
  if (existsSync(serverPublic)) {
    const stats = statSync(serverPublic, { throwIfNoEntry: false });
    if (stats?.isSymbolicLink?.() || stats?.isDirectory?.()) {
      rmSync(serverPublic, { recursive: true, force: true });
    }
  }

  // Copy frontend/dist to server/public
  console.log(`  Copying frontend assets to server/public...`);
  cpSync(stagedFrontendDir, serverPublic, { recursive: true });
  console.log(`  Frontend linked to server/public.`);
}

async function main() {
  const config = parseArgs();

  console.log("========================================");
  console.log("  Electron Sidecar Staging");
  console.log("========================================");
  console.log(`  Platform: ${config.platform}`);
  console.log(`  Architecture: ${config.arch}`);
  if (config.libc) console.log(`  Libc: ${config.libc}`);
  console.log(`  Electron Version: ${config.electronVersion}`);
  console.log(`  Output Directory: ${config.outDir}`);
  console.log("========================================");

  const outDir = resolve(ROOT_DIR, config.outDir);

  // Clean output directory
  console.log(`\nCleaning output directory: ${outDir}`);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  // Stage frontend first (needed for server/public)
  const stagedFrontend = join(outDir, "frontend/dist");
  stageFrontend(ROOT_DIR, stagedFrontend);

  // Stage sidecars
  const stagedServer = join(outDir, "server");
  const stagedCollector = join(outDir, "collector");
  const stagedGateway = join(outDir, "alata-im-gateway");

  await stageSidecar("server", join(ROOT_DIR, "server"), stagedServer, config);
  await stageSidecar(
    "collector",
    join(ROOT_DIR, "collector"),
    stagedCollector,
    config
  );
  await stageSidecar(
    "alata-im-gateway",
    join(ROOT_DIR, "alata-im-gateway"),
    stagedGateway,
    config
  );

  // Link frontend to server/public
  linkFrontendToServer(stagedServer, stagedFrontend);

  // Create staging metadata file
  const metadata = {
    platform: config.platform,
    arch: config.arch,
    libc: config.libc,
    electronVersion: config.electronVersion,
    timestamp: new Date().toISOString(),
    sidecars: ["server", "collector", "alata-im-gateway"],
  };
  writeFileSync(
    join(outDir, "staging-metadata.json"),
    JSON.stringify(metadata, null, 2)
  );

  console.log("\n========================================");
  console.log("  Staging Complete!");
  console.log("========================================");
  console.log(`  Output: ${outDir}`);
  console.log(`  - server/`);
  console.log(`  - collector/`);
  console.log(`  - alata-im-gateway/`);
  console.log(`  - frontend/dist/`);
  console.log("========================================\n");
}

main().catch((err) => {
  console.error("Staging failed:", err);
  process.exit(1);
});
