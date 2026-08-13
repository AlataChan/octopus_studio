#!/usr/bin/env node
/**
 * verify-bundle.mjs
 *
 * Verifies that a packaged Electron app contains all required sidecar
 * dependencies and that native modules are built for the correct architecture.
 *
 * Usage:
 *   node scripts/electron/verify-bundle.mjs --appPath="dist-electron/mac-arm64/Alata Studio.app"
 *   node scripts/electron/verify-bundle.mjs --appPath="dist-electron/mac/Alata Studio.app" --arch=x64
 */

import { existsSync, readdirSync } from "fs";
import { createRequire } from "module";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import {
  assertElectronProbeTarget,
  getBinaryArch,
  inspectStagedAnydoc,
  resolveAnydocTarget,
  runAnydocElectronProbe,
} from "./anydoc-runtime-check.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, "../..");
const requireFromHere = createRequire(import.meta.url);
const ANYDOC_VERSION = "0.1.8";
const ANYDOC_LICENSE_SHA256 =
  "03a9e7657aac6536fb6458bd220347c4e7f85bd0a51d8d9e8528530b7a682ade";

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    appPath: null,
    sidecarDir: ".electron-build/sidecars",
    arch: null, // Will be auto-detected from app path or set explicitly
    platform: process.platform,
    libc: null,
    verbose: false,
  };

  for (const arg of args) {
    if (arg.startsWith("--appPath=")) {
      result.appPath = arg.split("=").slice(1).join("="); // Handle paths with =
    } else if (arg.startsWith("--sidecarDir=")) {
      result.sidecarDir = arg.split("=").slice(1).join("=");
    } else if (arg.startsWith("--arch=")) {
      result.arch = arg.split("=")[1];
    } else if (arg.startsWith("--platform=")) {
      result.platform = arg.split("=")[1];
    } else if (arg.startsWith("--libc=")) {
      result.libc = arg.split("=")[1];
    } else if (arg === "--verbose" || arg === "-v") {
      result.verbose = true;
    }
  }

  // Auto-detect architecture from path
  if (!result.arch) {
    const hintPath = result.appPath || result.sidecarDir || "";
    if (hintPath.includes("arm64")) {
      result.arch = "arm64";
    } else if (hintPath.includes("x64")) {
      result.arch = "x64";
    } else {
      // Default based on current machine
      result.arch = process.arch;
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

// Check if a path exists
function checkExists(path, description) {
  const exists = existsSync(path);
  if (exists) {
    console.log(`  ✓ ${description}`);
  } else {
    console.log(`  ✗ ${description} - NOT FOUND`);
  }
  return exists;
}

function checkAbsent(path, description) {
  const exists = existsSync(path);
  if (exists) {
    console.log(`  ✗ ${description} - SHOULD NOT BE BUNDLED`);
  } else {
    console.log(`  ✓ ${description}`);
  }
  return !exists;
}

// Find all .node files recursively
function findNodeFiles(dir, files = []) {
  if (!existsSync(dir)) return files;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      findNodeFiles(fullPath, files);
    } else if (entry.name.endsWith(".node")) {
      files.push(fullPath);
    }
  }
  return files;
}

function shouldCheckNativeModuleArch(
  relativePath,
  expectedPlatform,
  expectedArch
) {
  const normalized = relativePath.replace(/\\/g, "/").toLowerCase();

  // Many packages ship prebuilt binaries for multiple platforms/architectures.
  // Avoid flagging those as errors when they clearly target another platform/arch.
  const platformSegments = ["darwin", "linux", "win32", "windows"];
  const archSegments = ["arm64", "x64", "ia32"];

  const platformMatch = platformSegments.find(
    (p) => normalized.includes(`/${p}/`) || normalized.includes(`-${p}-`)
  );
  if (platformMatch) {
    const canonical = platformMatch === "windows" ? "win32" : platformMatch;
    if (canonical !== expectedPlatform) return false;
  }

  const archMatch = archSegments.find(
    (a) => normalized.includes(`/${a}/`) || normalized.includes(`-${a}-`)
  );
  if (archMatch && archMatch !== expectedArch) return false;

  return true;
}

// Main verification function
function verify(config) {
  const packagedMode = !!config.appPath;
  const rootPath = resolve(
    ROOT_DIR,
    packagedMode ? config.appPath : config.sidecarDir
  );
  const resourcesDir = packagedMode
    ? join(rootPath, "Contents/Resources")
    : rootPath;

  console.log("========================================");
  console.log("  Electron Bundle Verification");
  console.log("========================================");
  console.log(`  Mode: ${packagedMode ? "packaged-app" : "staged-sidecars"}`);
  console.log(`  Target Path: ${rootPath}`);
  console.log(`  Expected Platform: ${config.platform}`);
  console.log(`  Expected Architecture: ${config.arch}`);
  if (config.libc) console.log(`  Expected Libc: ${config.libc}`);
  console.log("========================================\n");

  if (!existsSync(rootPath)) {
    console.error(
      `Error: ${packagedMode ? "app" : "staged sidecar directory"} not found at ${rootPath}`
    );
    process.exit(1);
  }
  let errors = 0;
  let warnings = 0;

  // Check basic structure
  console.log("=== Checking App Structure ===");
  if (!checkExists(resourcesDir, "Contents/Resources")) {
    console.error(
      `Error: ${packagedMode ? "Resources directory not found. Is this a valid .app bundle?" : "staged sidecar directory not found."}`
    );
    process.exit(1);
  }

  // Check sidecars exist
  console.log("\n=== Checking Sidecars ===");
  const serverDir = join(resourcesDir, "server");
  const collectorDir = join(resourcesDir, "collector");
  const gatewayDir = join(resourcesDir, "alata-im-gateway");
  const frontendDir = join(resourcesDir, "frontend/dist");

  if (!checkExists(join(serverDir, "index.js"), "server/index.js")) errors++;
  // Swagger is required by server/endpoints/api/index.js (developerEndpoints).
  if (
    !checkExists(join(serverDir, "swagger/utils.js"), "server/swagger/utils.js")
  )
    errors++;
  // Electron runtime needs a schema-only template DB to bootstrap userData storage.
  if (
    !checkExists(
      join(serverDir, "prisma/template-anythingllm.db"),
      "server/prisma/template-anythingllm.db"
    )
  )
    errors++;
  // Some endpoints depend on S3 client helper living under utils/storage.
  if (
    !checkExists(
      join(serverDir, "utils/storage/S3Client.js"),
      "server/utils/storage/S3Client.js"
    )
  )
    errors++;
  if (
    !checkAbsent(
      join(serverDir, "scripts"),
      "server/scripts excluded from bundle"
    )
  )
    errors++;
  if (!checkExists(join(collectorDir, "index.js"), "collector/index.js"))
    errors++;
  if (
    !checkExists(
      join(gatewayDir, "bin/alata-gateway.js"),
      "alata-im-gateway/bin/alata-gateway.js"
    )
  )
    errors++;
  if (!checkExists(frontendDir, "frontend/dist")) errors++;
  // Alata serves the SPA root via server-side MetaGenerator, which references
  // `/index.js` and `/index.css` (not an on-disk `index.html`).
  if (!checkExists(join(frontendDir, "index.js"), "frontend/dist/index.js"))
    errors++;
  if (!checkExists(join(frontendDir, "index.css"), "frontend/dist/index.css"))
    errors++;

  // Check sidecar node_modules
  console.log("\n=== Checking Sidecar Dependencies ===");
  const serverNodeModules = join(serverDir, "node_modules");
  const collectorNodeModules = join(collectorDir, "node_modules");
  const gatewayNodeModules = join(gatewayDir, "node_modules");

  if (!checkExists(serverNodeModules, "server/node_modules")) {
    errors++;
  } else {
    // Check critical server dependencies
    checkExists(
      join(serverNodeModules, "express"),
      "server/node_modules/express"
    ) || errors++;
    checkExists(
      join(serverNodeModules, "dotenv"),
      "server/node_modules/dotenv"
    ) || errors++;
    checkExists(
      join(serverNodeModules, "@prisma/client"),
      "server/node_modules/@prisma/client"
    ) || errors++;
    checkExists(
      join(serverNodeModules, "node-cache"),
      "server/node_modules/node-cache"
    ) || errors++;
    checkExists(
      join(serverNodeModules, "bcrypt"),
      "server/node_modules/bcrypt"
    ) || warnings++;
  }

  if (!checkExists(collectorNodeModules, "collector/node_modules")) {
    errors++;
  } else {
    // Check critical collector dependencies
    checkExists(
      join(collectorNodeModules, "express"),
      "collector/node_modules/express"
    ) || errors++;
    checkExists(
      join(collectorNodeModules, "sharp"),
      "collector/node_modules/sharp"
    ) || warnings++;

    try {
      const inspection = inspectStagedAnydoc({
        collectorDir,
        platform: config.platform,
        arch: config.arch,
        libc: config.libc,
        expectedVersion: ANYDOC_VERSION,
        expectedLicenseSha256: ANYDOC_LICENSE_SHA256,
      });
      console.log(`  ✓ @firecrawl/anydoc exact ${ANYDOC_VERSION}`);
      console.log(
        `  ✓ ${inspection.nativePackageName} exact ${ANYDOC_VERSION} with ${inspection.nativeNodeFiles.length} verified binary/binaries`
      );
      console.log("  ✓ collector/THIRD_PARTY_LICENSES/anydoc-MIT.txt");

      assertElectronProbeTarget({
        targetPlatform: config.platform,
        targetArch: config.arch,
        targetLibc: config.libc,
        hostPlatform: process.platform,
        hostArch: process.arch,
        hostProcessReport: process.report?.getReport?.(),
      });
      const electronExecutable = requireFromHere("electron");
      runAnydocElectronProbe({
        electronExecutable,
        probeScriptPath: join(__dirname, "anydoc-electron-probe.cjs"),
        collectorPackageJsonPath: join(collectorDir, "package.json"),
      });
      console.log(
        "  ✓ @firecrawl/anydoc loads under matching Electron runtime"
      );
    } catch (error) {
      console.log(`  ✗ Anydoc runtime verification failed: ${error.message}`);
      errors++;
    }
  }

  if (!checkExists(gatewayNodeModules, "alata-im-gateway/node_modules")) {
    errors++;
  } else {
    checkExists(
      join(gatewayNodeModules, "express"),
      "alata-im-gateway/node_modules/express"
    ) || errors++;
    checkExists(
      join(gatewayNodeModules, "axios"),
      "alata-im-gateway/node_modules/axios"
    ) || errors++;
    checkExists(
      join(gatewayNodeModules, "better-sqlite3"),
      "alata-im-gateway/node_modules/better-sqlite3"
    ) || warnings++;
  }

  // Check Prisma client
  console.log("\n=== Checking Prisma ===");
  const prismaClient = join(serverNodeModules, ".prisma/client");
  if (existsSync(prismaClient)) {
    console.log("  ✓ .prisma/client exists");

    // Check for query engine
    const engineFiles = readdirSync(prismaClient).filter(
      (f) => f.includes("query_engine") || f.includes("libquery_engine")
    );
    if (engineFiles.length > 0) {
      console.log(`  ✓ Prisma query engine found: ${engineFiles.join(", ")}`);
    } else {
      console.log("  ✗ Prisma query engine NOT FOUND");
      errors++;
    }
  } else {
    console.log("  ✗ .prisma/client NOT FOUND");
    errors++;
  }

  // Check native module architectures
  console.log("\n=== Checking Native Module Architectures ===");
  const serverNodeFiles = findNodeFiles(serverNodeModules);
  const collectorNodeFiles = findNodeFiles(collectorNodeModules);
  const gatewayNodeFiles = findNodeFiles(gatewayNodeModules);
  const allNodeFiles = [
    ...serverNodeFiles,
    ...collectorNodeFiles,
    ...gatewayNodeFiles,
  ];

  if (allNodeFiles.length === 0) {
    console.log("  ⚠ No .node files found (may be okay if no native deps)");
    warnings++;
  } else {
    const expectedPlatform = config.platform;
    const expectedArch = config.arch;
    const nodeFilesToCheck = allNodeFiles.filter((nodeFile) => {
      const relativePath = nodeFile.replace(resourcesDir + "/", "");
      return shouldCheckNativeModuleArch(
        relativePath,
        expectedPlatform,
        expectedArch
      );
    });

    console.log(
      `  Found ${allNodeFiles.length} native module(s) (${nodeFilesToCheck.length} relevant to ${expectedPlatform}/${expectedArch}):`
    );

    for (const nodeFile of nodeFilesToCheck) {
      const relativePath = nodeFile.replace(resourcesDir + "/", "");
      const fileArch = getBinaryArch(nodeFile);

      if (fileArch === config.arch || fileArch === "universal") {
        console.log(`    ✓ ${relativePath} (${fileArch})`);
      } else {
        console.log(
          `    ✗ ${relativePath} (${fileArch}) - WRONG ARCH, expected ${config.arch}`
        );
        errors++;
      }
    }
  }

  // Check server/public (frontend assets)
  console.log("\n=== Checking Server Static Assets ===");
  const serverPublic = join(serverDir, "public");
  if (existsSync(serverPublic)) {
    checkExists(join(serverPublic, "index.js"), "server/public/index.js") ||
      errors++;
    checkExists(join(serverPublic, "index.css"), "server/public/index.css") ||
      errors++;
  } else {
    console.log("  ⚠ server/public not found (may use frontend/dist directly)");
    warnings++;
  }

  // Summary
  console.log("\n========================================");
  console.log("  Verification Summary");
  console.log("========================================");

  if (errors === 0 && warnings === 0) {
    console.log("  ✓ All checks passed!");
    console.log("========================================\n");
    return true;
  }

  if (errors > 0) {
    console.log(`  ✗ ${errors} error(s) found`);
  }
  if (warnings > 0) {
    console.log(`  ⚠ ${warnings} warning(s) found`);
  }
  console.log("========================================\n");

  if (errors > 0) {
    console.error("Verification FAILED. The bundle may not work correctly.");
    process.exit(1);
  }

  return true;
}

// Run verification
const config = parseArgs();
verify(config);
