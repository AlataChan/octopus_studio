import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertElectronProbeTarget,
  canLoadPackageFrom,
  detectLinuxLibc,
  getBinaryArch,
  hasExactPackageVersion,
  inspectStagedAnydoc,
  resolveAnydocTarget,
  runAnydocElectronProbe,
  selectedAnydocNativePackage,
  targetNpmInstallArgs,
} from "../anydoc-runtime-check.mjs";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ELECTRON_PROBE_PATH = resolve(TEST_DIR, "../anydoc-electron-probe.cjs");
const ANYDOC_LICENSE_SHA256 =
  "03a9e7657aac6536fb6458bd220347c4e7f85bd0a51d8d9e8528530b7a682ade";
const ANYDOC_LICENSE_TEXT = readFileSync(
  resolve(TEST_DIR, "../../../collector/THIRD_PARTY_LICENSES/anydoc-MIT.txt"),
  "utf-8"
);

test("maps every supported target to its pinned anydoc native package", () => {
  const cases = [
    ["darwin", "arm64", undefined, "@firecrawl/anydoc-darwin-arm64"],
    ["darwin", "x64", undefined, "@firecrawl/anydoc-darwin-x64"],
    ["linux", "arm64", "glibc", "@firecrawl/anydoc-linux-arm64-gnu"],
    ["linux", "x64", "glibc", "@firecrawl/anydoc-linux-x64-gnu"],
    ["linux", "arm64", "musl", "@firecrawl/anydoc-linux-arm64-musl"],
    ["linux", "x64", "musl", "@firecrawl/anydoc-linux-x64-musl"],
    ["win32", "x64", undefined, "@firecrawl/anydoc-win32-x64-msvc"],
  ];

  for (const [platform, arch, libc, expected] of cases) {
    assert.equal(
      selectedAnydocNativePackage({ platform, arch, libc }),
      expected
    );
  }
});

test("rejects unsupported platform, architecture, and libc tuples", () => {
  assert.throws(
    () => selectedAnydocNativePackage({ platform: "darwin", arch: "ia32" }),
    /Unsupported anydoc target: darwin\/ia32/
  );
  assert.throws(
    () => selectedAnydocNativePackage({ platform: "linux", arch: "x64" }),
    /Unsupported anydoc target: linux\/x64\/unspecified/
  );
  assert.throws(
    () =>
      selectedAnydocNativePackage({
        platform: "linux",
        arch: "x64",
        libc: "uclibc",
      }),
    /Unsupported anydoc target: linux\/x64\/uclibc/
  );
  assert.throws(
    () => selectedAnydocNativePackage({ platform: "freebsd", arch: "x64" }),
    /Unsupported anydoc target: freebsd\/x64/
  );
});

test("generates explicit npm target selection arguments", () => {
  assert.deepEqual(
    targetNpmInstallArgs({ platform: "darwin", arch: "arm64" }),
    ["--os=darwin", "--cpu=arm64"]
  );
  assert.deepEqual(
    targetNpmInstallArgs({ platform: "linux", arch: "x64", libc: "musl" }),
    ["--os=linux", "--cpu=x64", "--libc=musl"]
  );
  assert.deepEqual(targetNpmInstallArgs({ platform: "win32", arch: "x64" }), [
    "--os=win32",
    "--cpu=x64",
  ]);
  assert.throws(
    () => targetNpmInstallArgs({ platform: "win32", arch: "arm64" }),
    /Unsupported anydoc target/
  );
});

test("detects an allowlisted libc only for a Linux host", () => {
  assert.equal(
    detectLinuxLibc("linux", { header: { glibcVersionRuntime: "2.31" } }),
    "glibc"
  );
  assert.equal(detectLinuxLibc("linux", { header: {} }), "musl");
  assert.equal(detectLinuxLibc("darwin", { header: {} }), undefined);
});

test("normalizes and validates staging targets before installation", () => {
  assert.deepEqual(
    resolveAnydocTarget({
      platform: "linux",
      arch: "arm64",
      hostPlatform: "linux",
      processReport: { header: { glibcVersionRuntime: "2.31" } },
    }),
    { platform: "linux", arch: "arm64", libc: "glibc" }
  );
  assert.deepEqual(
    resolveAnydocTarget({
      platform: "darwin",
      arch: "x64",
      libc: "musl",
      processReport: { header: {} },
    }),
    { platform: "darwin", arch: "x64", libc: undefined }
  );
  assert.throws(
    () => resolveAnydocTarget({ platform: "darwin", arch: "ia32" }),
    /Unsupported anydoc target: darwin\/ia32/
  );
});

test("requires an explicit libc when targeting Linux from another host", () => {
  assert.throws(
    () =>
      resolveAnydocTarget({
        platform: "linux",
        arch: "x64",
        hostPlatform: "darwin",
        processReport: { header: { glibcVersionRuntime: "2.31" } },
      }),
    /Explicit libc is required when targeting Linux from darwin/
  );
  assert.throws(
    () =>
      resolveAnydocTarget({
        platform: "linux",
        arch: "arm64",
        hostPlatform: "win32",
        processReport: { header: {} },
      }),
    /Explicit libc is required when targeting Linux from win32/
  );
  assert.deepEqual(
    resolveAnydocTarget({
      platform: "linux",
      arch: "x64",
      libc: "musl",
      hostPlatform: "darwin",
      processReport: { header: { glibcVersionRuntime: "2.31" } },
    }),
    { platform: "linux", arch: "x64", libc: "musl" }
  );
});

test("compares installed package versions exactly", () => {
  const root = mkdtempSync(join(tmpdir(), "anydoc-version-check-"));
  try {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ version: "0.1.8" })
    );
    assert.equal(hasExactPackageVersion(root, "0.1.8"), true);
    assert.equal(hasExactPackageVersion(root, "0.1.7"), false);
    assert.equal(hasExactPackageVersion(join(root, "missing"), "0.1.8"), false);
  } finally {
    rmSync(resolve(root), { recursive: true, force: true });
  }
});

test("loads a real temporary package using the default ESM createRequire", () => {
  const root = mkdtempSync(join(tmpdir(), "anydoc-create-require-"));
  try {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ private: true })
    );
    const packageDir = join(root, "node_modules", "probe-package");
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(
      join(packageDir, "package.json"),
      JSON.stringify({
        name: "probe-package",
        version: "1.0.0",
        main: "index.js",
      })
    );
    writeFileSync(
      join(packageDir, "index.js"),
      "module.exports = { loaded: true };\n"
    );

    assert.equal(
      canLoadPackageFrom(join(root, "package.json"), "probe-package"),
      true
    );
  } finally {
    rmSync(resolve(root), { recursive: true, force: true });
  }
});

test("reports package resolution and native load failures", () => {
  const resolvingRequireFactory = () => {
    const requireFn = () => ({ loaded: true });
    requireFn.resolve = () => "/tmp/probe-package/index.js";
    return requireFn;
  };
  assert.equal(
    canLoadPackageFrom(
      "/tmp/package.json",
      "probe-package",
      resolvingRequireFactory
    ),
    true
  );

  const resolutionFailureFactory = () => {
    const requireFn = () => ({ loaded: true });
    requireFn.resolve = () => {
      throw new Error("not installed");
    };
    return requireFn;
  };
  assert.equal(
    canLoadPackageFrom(
      "/tmp/package.json",
      "probe-package",
      resolutionFailureFactory
    ),
    false
  );

  const loadFailureFactory = () => {
    const requireFn = () => {
      throw new Error("wrong native architecture");
    };
    requireFn.resolve = () => "/tmp/probe-package/index.js";
    return requireFn;
  };
  assert.equal(
    canLoadPackageFrom(
      "/tmp/package.json",
      "probe-package",
      loadFailureFactory
    ),
    false
  );
});

test("passes shell metacharacter paths to file as one literal argument", () => {
  const suspiciousPath = "/tmp/native $(touch SHOULD_NOT_EXIST);&.node";
  const calls = [];
  const execFileSyncImpl = (command, args, options) => {
    calls.push({ command, args, options });
    return "Mach-O 64-bit bundle arm64";
  };

  assert.equal(getBinaryArch(suspiciousPath, execFileSyncImpl), "arm64");
  assert.deepEqual(calls, [
    {
      command: "file",
      args: ["-b", suspiciousPath],
      options: { encoding: "utf-8" },
    },
  ]);
});

test("does not let architecture-like path segments contaminate file output", () => {
  const fileOutput = (_command, args) =>
    args[0] === "-b"
      ? "Mach-O 64-bit bundle x86_64"
      : `${args[0]}: Mach-O 64-bit bundle x86_64`;
  assert.equal(
    getBinaryArch("/tmp/darwin-arm64/addon.node", fileOutput),
    "x64"
  );

  const unknownOutput = (_command, args) =>
    args[0] === "-b" ? "data" : `${args[0]}: data`;
  assert.equal(
    getBinaryArch("/tmp/darwin-x64/addon.node", unknownOutput),
    "unknown"
  );
});

test("recognizes universal binaries before their component architectures", () => {
  const output =
    "Mach-O universal binary with 2 architectures: [x86_64] [arm64]";
  assert.equal(
    getBinaryArch("/tmp/universal.node", () => output),
    "universal"
  );
});

test("recognizes Linux and Windows file architecture labels", () => {
  assert.equal(
    getBinaryArch(
      "/tmp/linux-arm64.node",
      () => "ELF 64-bit LSB shared object, ARM aarch64"
    ),
    "arm64"
  );
  assert.equal(
    getBinaryArch(
      "/tmp/linux-x64.node",
      () => "ELF 64-bit LSB shared object, x86-64"
    ),
    "x64"
  );
  assert.equal(
    getBinaryArch(
      "C:\\tmp\\win32-x64.node",
      () => "PE32+ executable (DLL) (console) x86-64, for MS Windows"
    ),
    "x64"
  );
});

function createStagedAnydocFixture() {
  const root = mkdtempSync(join(tmpdir(), "anydoc-staged-check-"));
  const collectorDir = join(root, "collector");
  const wrapperDir = join(collectorDir, "node_modules", "@firecrawl", "anydoc");
  const nativeDir = join(
    collectorDir,
    "node_modules",
    "@firecrawl",
    "anydoc-darwin-arm64"
  );
  mkdirSync(wrapperDir, { recursive: true });
  mkdirSync(nativeDir, { recursive: true });
  mkdirSync(join(collectorDir, "THIRD_PARTY_LICENSES"), { recursive: true });
  writeFileSync(
    join(collectorDir, "package.json"),
    JSON.stringify({ private: true })
  );
  writeFileSync(
    join(wrapperDir, "package.json"),
    JSON.stringify({ version: "0.1.8" })
  );
  writeFileSync(
    join(nativeDir, "package.json"),
    JSON.stringify({ version: "0.1.8" })
  );
  writeFileSync(
    join(nativeDir, "anydoc.darwin-arm64.node"),
    "native-placeholder"
  );
  writeFileSync(
    join(collectorDir, "THIRD_PARTY_LICENSES", "anydoc-MIT.txt"),
    ANYDOC_LICENSE_TEXT
  );
  return { root, collectorDir, wrapperDir, nativeDir };
}

test("inspects exact wrapper/native versions, selected binary arch, and MIT text", () => {
  const fixture = createStagedAnydocFixture();
  try {
    const result = inspectStagedAnydoc({
      collectorDir: fixture.collectorDir,
      platform: "darwin",
      arch: "arm64",
      expectedVersion: "0.1.8",
      expectedLicenseSha256: ANYDOC_LICENSE_SHA256,
      getBinaryArchImpl: () => "arm64",
    });

    assert.equal(result.nativePackageName, "@firecrawl/anydoc-darwin-arm64");
    assert.deepEqual(result.nativeNodeFiles, [
      join(fixture.nativeDir, "anydoc.darwin-arm64.node"),
    ]);
  } finally {
    rmSync(resolve(fixture.root), { recursive: true, force: true });
  }
});

test("fails closed on wrong versions, missing native binaries, wrong arch, or license", () => {
  const cases = [
    {
      name: "wrapper version",
      mutate: ({ wrapperDir }) =>
        writeFileSync(
          join(wrapperDir, "package.json"),
          JSON.stringify({ version: "0.1.7" })
        ),
      expected: /@firecrawl\/anydoc must be exact version 0\.1\.8/,
    },
    {
      name: "native version",
      mutate: ({ nativeDir }) =>
        writeFileSync(
          join(nativeDir, "package.json"),
          JSON.stringify({ version: "0.1.7" })
        ),
      expected: /@firecrawl\/anydoc-darwin-arm64 must be exact version 0\.1\.8/,
    },
    {
      name: "native binary",
      mutate: ({ nativeDir }) =>
        rmSync(join(nativeDir, "anydoc.darwin-arm64.node"), { force: true }),
      expected: /does not contain a \.node binary/,
    },
    {
      name: "native architecture",
      mutate: () => {},
      binaryArch: "x64",
      expected: /has x64 architecture; expected arm64/,
    },
    {
      name: "packaged license",
      mutate: ({ collectorDir }) =>
        rmSync(join(collectorDir, "THIRD_PARTY_LICENSES", "anydoc-MIT.txt"), {
          force: true,
        }),
      expected: /Packaged anydoc MIT license is missing/,
    },
    {
      name: "truncated packaged license",
      mutate: ({ collectorDir }) =>
        writeFileSync(
          join(collectorDir, "THIRD_PARTY_LICENSES", "anydoc-MIT.txt"),
          ANYDOC_LICENSE_TEXT.slice(0, 100)
        ),
      expected: /Packaged anydoc MIT license hash mismatch/,
    },
    {
      name: "replaced packaged license",
      mutate: ({ collectorDir }) =>
        writeFileSync(
          join(collectorDir, "THIRD_PARTY_LICENSES", "anydoc-MIT.txt"),
          "MIT License\n\nreplacement text\n"
        ),
      expected: /Packaged anydoc MIT license hash mismatch/,
    },
  ];

  for (const testCase of cases) {
    const fixture = createStagedAnydocFixture();
    try {
      testCase.mutate(fixture);
      assert.throws(
        () =>
          inspectStagedAnydoc({
            collectorDir: fixture.collectorDir,
            platform: "darwin",
            arch: "arm64",
            expectedVersion: "0.1.8",
            expectedLicenseSha256: ANYDOC_LICENSE_SHA256,
            getBinaryArchImpl: () => testCase.binaryArch || "arm64",
          }),
        testCase.expected,
        testCase.name
      );
    } finally {
      rmSync(resolve(fixture.root), { recursive: true, force: true });
    }
  }
});

test("runs the load-only Electron probe with explicit environment and arguments", () => {
  const calls = [];
  const spawnSyncImpl = (executable, args, options) => {
    calls.push({ executable, args, options });
    return { status: 0, signal: null, stdout: "", stderr: "" };
  };

  assert.equal(
    runAnydocElectronProbe({
      electronExecutable: "/Applications/Electron.app/Contents/MacOS/Electron",
      probeScriptPath: "/repo/scripts/electron/anydoc-electron-probe.cjs",
      collectorPackageJsonPath: "/bundle/collector/package.json",
      spawnSyncImpl,
      env: { PATH: "/usr/bin" },
    }),
    true
  );
  assert.deepEqual(calls[0].args, [
    "/repo/scripts/electron/anydoc-electron-probe.cjs",
    "/bundle/collector/package.json",
  ]);
  assert.equal(calls[0].options.env.ELECTRON_RUN_AS_NODE, "1");
  assert.equal(calls[0].options.env.PATH, "/usr/bin");
  assert.equal(calls[0].options.encoding, "utf-8");
});

test("treats Electron probe launch and load failures as errors", () => {
  assert.throws(
    () =>
      runAnydocElectronProbe({
        electronExecutable: "/missing/electron",
        probeScriptPath: "/repo/probe.cjs",
        collectorPackageJsonPath: "/bundle/collector/package.json",
        spawnSyncImpl: () => ({
          error: new Error("spawn failed"),
          status: null,
          signal: null,
          stdout: "",
          stderr: "",
        }),
      }),
    /Electron anydoc probe failed to launch/
  );
  assert.throws(
    () =>
      runAnydocElectronProbe({
        electronExecutable: "/Applications/Electron",
        probeScriptPath: "/repo/probe.cjs",
        collectorPackageJsonPath: "/bundle/collector/package.json",
        spawnSyncImpl: () => ({
          status: 1,
          signal: null,
          stdout: "",
          stderr: "native load failed",
        }),
      }),
    /Electron anydoc probe exited with status 1/
  );
});

test("requires a matching runner for the Electron load probe", () => {
  assert.equal(
    assertElectronProbeTarget({
      targetPlatform: "darwin",
      targetArch: "arm64",
      hostPlatform: "darwin",
      hostArch: "arm64",
    }),
    true
  );
  assert.throws(
    () =>
      assertElectronProbeTarget({
        targetPlatform: "linux",
        targetArch: "x64",
        hostPlatform: "darwin",
        hostArch: "arm64",
      }),
    /Electron anydoc probe requires a matching target runner: target=linux\/x64 host=darwin\/arm64/
  );
  assert.throws(
    () =>
      assertElectronProbeTarget({
        targetPlatform: "darwin",
        targetArch: "x64",
        hostPlatform: "darwin",
        hostArch: "arm64",
      }),
    /Electron anydoc probe requires a matching target runner: target=darwin\/x64 host=darwin\/arm64/
  );
});

test("requires matching Linux libc for the Electron load probe", () => {
  assert.throws(
    () =>
      assertElectronProbeTarget({
        targetPlatform: "linux",
        targetArch: "x64",
        targetLibc: "musl",
        hostPlatform: "linux",
        hostArch: "x64",
        hostProcessReport: { header: { glibcVersionRuntime: "2.31" } },
      }),
    /Electron anydoc probe requires a matching target runner: target=linux\/x64\/musl host=linux\/x64\/glibc/
  );
  assert.throws(
    () =>
      assertElectronProbeTarget({
        targetPlatform: "linux",
        targetArch: "x64",
        targetLibc: "glibc",
        hostPlatform: "linux",
        hostArch: "x64",
        hostProcessReport: { header: {} },
      }),
    /Electron anydoc probe requires a matching target runner: target=linux\/x64\/glibc host=linux\/x64\/musl/
  );

  assert.equal(
    assertElectronProbeTarget({
      targetPlatform: "linux",
      targetArch: "x64",
      targetLibc: "glibc",
      hostPlatform: "linux",
      hostArch: "x64",
      hostProcessReport: { header: { glibcVersionRuntime: "2.31" } },
    }),
    true
  );
  assert.equal(
    assertElectronProbeTarget({
      targetPlatform: "linux",
      targetArch: "x64",
      targetLibc: "musl",
      hostPlatform: "linux",
      hostArch: "x64",
      hostProcessReport: { header: {} },
    }),
    true
  );
});

test("the probe script requires anydoc from the supplied collector package root", () => {
  const root = mkdtempSync(join(tmpdir(), "anydoc-probe-script-"));
  try {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ private: true })
    );
    const anydocDir = join(root, "node_modules", "@firecrawl", "anydoc");
    mkdirSync(anydocDir, { recursive: true });
    writeFileSync(
      join(anydocDir, "package.json"),
      JSON.stringify({
        name: "@firecrawl/anydoc",
        version: "0.1.8",
        main: "index.js",
      })
    );
    writeFileSync(
      join(anydocDir, "index.js"),
      "exports.toMarkdown = async () => '';\n"
    );

    const success = spawnSync(
      process.execPath,
      [ELECTRON_PROBE_PATH, join(root, "package.json")],
      { encoding: "utf-8" }
    );
    assert.equal(success.status, 0, success.stderr);

    writeFileSync(join(anydocDir, "index.js"), "module.exports = {};\n");
    const failure = spawnSync(
      process.execPath,
      [ELECTRON_PROBE_PATH, join(root, "package.json")],
      { encoding: "utf-8" }
    );
    assert.notEqual(failure.status, 0);
    assert.match(failure.stderr, /toMarkdown is not available/);
  } finally {
    rmSync(resolve(root), { recursive: true, force: true });
  }
});
