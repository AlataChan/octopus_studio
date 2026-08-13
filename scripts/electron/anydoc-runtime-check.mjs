import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const ANYDOC_NATIVE_PACKAGES = Object.freeze({
  "darwin/arm64": "@firecrawl/anydoc-darwin-arm64",
  "darwin/x64": "@firecrawl/anydoc-darwin-x64",
  "linux/arm64/glibc": "@firecrawl/anydoc-linux-arm64-gnu",
  "linux/x64/glibc": "@firecrawl/anydoc-linux-x64-gnu",
  "linux/arm64/musl": "@firecrawl/anydoc-linux-arm64-musl",
  "linux/x64/musl": "@firecrawl/anydoc-linux-x64-musl",
  "win32/x64": "@firecrawl/anydoc-win32-x64-msvc",
});

function targetKey({ platform, arch, libc }) {
  return platform === "linux"
    ? `${platform}/${arch}/${libc || "unspecified"}`
    : `${platform}/${arch}`;
}

export function selectedAnydocNativePackage(target) {
  const key = targetKey(target);
  const packageName = ANYDOC_NATIVE_PACKAGES[key];
  if (!packageName) {
    throw new Error(`Unsupported anydoc target: ${key}`);
  }
  return packageName;
}

export function targetNpmInstallArgs(target) {
  selectedAnydocNativePackage(target);
  const args = [`--os=${target.platform}`, `--cpu=${target.arch}`];
  if (target.platform === "linux") args.push(`--libc=${target.libc}`);
  return args;
}

export function detectLinuxLibc(platform, processReport) {
  if (platform !== "linux") return undefined;
  return processReport?.header?.glibcVersionRuntime ? "glibc" : "musl";
}

export function resolveAnydocTarget({
  platform,
  arch,
  libc,
  processReport,
  hostPlatform = process.platform,
}) {
  if (platform === "linux" && !libc && hostPlatform !== "linux") {
    throw new Error(
      `Explicit libc is required when targeting Linux from ${hostPlatform}`
    );
  }
  const target = {
    platform,
    arch,
    libc:
      platform === "linux"
        ? libc || detectLinuxLibc(platform, processReport)
        : undefined,
  };
  selectedAnydocNativePackage(target);
  return target;
}

export function hasExactPackageVersion(packageDir, expectedVersion) {
  try {
    const packageJson = JSON.parse(
      readFileSync(join(packageDir, "package.json"), "utf-8")
    );
    return packageJson.version === expectedVersion;
  } catch {
    return false;
  }
}

export function canLoadPackageFrom(
  packageJsonPath,
  packageName,
  createRequireImpl = createRequire
) {
  try {
    const requireFromPackage = createRequireImpl(packageJsonPath);
    requireFromPackage.resolve(packageName);
    requireFromPackage(packageName);
    return true;
  } catch {
    return false;
  }
}

export function getBinaryArch(filePath, execFileSyncImpl = execFileSync) {
  try {
    const output = execFileSyncImpl("file", ["-b", filePath], {
      encoding: "utf-8",
    });
    const normalized = output.toLowerCase();
    if (normalized.includes("universal")) return "universal";
    if (normalized.includes("arm64") || normalized.includes("aarch64")) {
      return "arm64";
    }
    if (
      normalized.includes("x86_64") ||
      normalized.includes("x86-64") ||
      normalized.includes("x64")
    ) {
      return "x64";
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

function findNativeNodeFiles(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      findNativeNodeFiles(entryPath, files);
    } else if (entry.name.endsWith(".node")) {
      files.push(entryPath);
    }
  }
  return files;
}

export function inspectStagedAnydoc({
  collectorDir,
  platform,
  arch,
  libc,
  expectedVersion,
  expectedLicenseSha256,
  getBinaryArchImpl = getBinaryArch,
}) {
  const wrapperDir = join(collectorDir, "node_modules", "@firecrawl", "anydoc");
  if (!hasExactPackageVersion(wrapperDir, expectedVersion)) {
    throw new Error(
      `@firecrawl/anydoc must be exact version ${expectedVersion}`
    );
  }

  const nativePackageName = selectedAnydocNativePackage({
    platform,
    arch,
    libc,
  });
  const nativeDir = join(
    collectorDir,
    "node_modules",
    ...nativePackageName.split("/")
  );
  if (!hasExactPackageVersion(nativeDir, expectedVersion)) {
    throw new Error(
      `${nativePackageName} must be exact version ${expectedVersion}`
    );
  }

  const nativeNodeFiles = findNativeNodeFiles(nativeDir).sort();
  if (nativeNodeFiles.length === 0) {
    throw new Error(`${nativePackageName} does not contain a .node binary`);
  }
  for (const nativeNodeFile of nativeNodeFiles) {
    const binaryArch = getBinaryArchImpl(nativeNodeFile);
    if (binaryArch !== arch && binaryArch !== "universal") {
      throw new Error(
        `${nativePackageName} has ${binaryArch} architecture; expected ${arch}`
      );
    }
  }

  const licensePath = join(
    collectorDir,
    "THIRD_PARTY_LICENSES",
    "anydoc-MIT.txt"
  );
  if (!existsSync(licensePath)) {
    throw new Error("Packaged anydoc MIT license is missing");
  }
  const licenseSha256 = createHash("sha256")
    .update(readFileSync(licensePath))
    .digest("hex");
  if (licenseSha256 !== expectedLicenseSha256) {
    throw new Error("Packaged anydoc MIT license hash mismatch");
  }

  return { nativePackageName, nativeNodeFiles, licensePath, licenseSha256 };
}

export function runAnydocElectronProbe({
  electronExecutable,
  probeScriptPath,
  collectorPackageJsonPath,
  spawnSyncImpl = spawnSync,
  env = process.env,
}) {
  const result = spawnSyncImpl(
    electronExecutable,
    [probeScriptPath, collectorPackageJsonPath],
    {
      encoding: "utf-8",
      env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
    }
  );
  if (result.error) {
    throw new Error("Electron anydoc probe failed to launch");
  }
  if (result.status !== 0) {
    throw new Error(
      `Electron anydoc probe exited with status ${result.status}`
    );
  }
  return true;
}

export function assertElectronProbeTarget({
  targetPlatform,
  targetArch,
  targetLibc,
  hostPlatform = process.platform,
  hostArch = process.arch,
  hostProcessReport = process.report?.getReport?.(),
}) {
  const compareLinuxLibc =
    targetPlatform === "linux" && hostPlatform === "linux";
  const hostLibc = compareLinuxLibc
    ? detectLinuxLibc(hostPlatform, hostProcessReport)
    : undefined;
  if (
    targetPlatform !== hostPlatform ||
    targetArch !== hostArch ||
    (compareLinuxLibc && targetLibc !== hostLibc)
  ) {
    const target = compareLinuxLibc
      ? `${targetPlatform}/${targetArch}/${targetLibc || "unspecified"}`
      : `${targetPlatform}/${targetArch}`;
    const host = compareLinuxLibc
      ? `${hostPlatform}/${hostArch}/${hostLibc}`
      : `${hostPlatform}/${hostArch}`;
    throw new Error(
      `Electron anydoc probe requires a matching target runner: target=${target} host=${host}`
    );
  }
  return true;
}
