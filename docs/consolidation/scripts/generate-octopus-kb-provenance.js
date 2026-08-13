const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../..");
const sourceRoot = process.argv[2];
const sourceCommit = "d4852698caedbb37f4c370bc339da22a38db1367";
const vendorRelative = "server/integrations/octopus-kb";
const vendorRoot = path.join(repoRoot, vendorRelative);
const outputPath = path.join(
  repoRoot,
  "docs/consolidation/octopus-kb-provenance.json"
);

if (!sourceRoot) {
  throw new Error("Usage: node generate-octopus-kb-provenance.js <octopus-kb checkout>");
}

function walkFiles(root, relative = "") {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(relative, entry.name);
    return entry.isDirectory() ? walkFiles(root, child) : [child.split(path.sep).join("/")];
  });
}

function git(args, options = {}) {
  return execFileSync("/usr/bin/git", args, {
    cwd: repoRoot,
    encoding: options.encoding,
    stdio: options.stdio || ["ignore", "pipe", "pipe"],
  });
}

function sourceBlob(relative) {
  try {
    return execFileSync(
      "/usr/bin/git",
      ["-C", sourceRoot, "show", `${sourceCommit}:${relative}`],
      { encoding: null, stdio: ["ignore", "pipe", "ignore"] }
    );
  } catch (_error) {
    return null;
  }
}

function studioCommits(relative) {
  const output = git(["log", "--follow", "--format=%H", "--", relative], {
    encoding: "utf8",
  }).trim();
  return output ? output.split("\n") : [];
}

const adapters = walkFiles(path.join(repoRoot, "server/utils/octopusKb")).map(
  (relative) => `server/utils/octopusKb/${relative}`
);
const adoptedVendorFiles = walkFiles(vendorRoot)
  .filter(
    (relative) =>
      relative === "LICENSE" ||
      relative === "NOTICE" ||
      relative.startsWith("schemas/") ||
      relative.startsWith("src/") ||
      relative.startsWith("tests/")
  )
  .map((relative) => `${vendorRelative}/${relative}`);

const files = {};
for (const relative of [...adapters, ...adoptedVendorFiles].sort()) {
  if (relative.startsWith("server/utils/octopusKb/")) {
    files[relative] = {
      origin: "studio-native-adapter",
      license: "MIT",
      studioCommits: studioCommits(relative),
    };
    continue;
  }

  const vendorPath = relative.slice(`${vendorRelative}/`.length);
  if (vendorPath === "NOTICE") {
    files[relative] = {
      origin: "studio-absorption-notice",
      license: "MIT",
      studioCommits: studioCommits(relative),
    };
    continue;
  }

  const baseline = sourceBlob(vendorPath);
  const current = fs.readFileSync(path.join(repoRoot, relative));
  files[relative] = {
    origin:
      baseline === null
        ? "studio-integration"
        : baseline.equals(current)
          ? "octopus-kb-commit"
          : "studio-divergence-from-octopus-kb",
    license: "MIT",
    ...(baseline === null ? {} : { sourceCommit }),
    studioCommits: studioCommits(relative),
  };
}

const manifest = {
  schemaVersion: 1,
  generatedAt: "2026-08-09",
  authority: "studio",
  source: {
    repository: "octopus-kb",
    commit: sourceCommit,
    roleAfterAbsorption: "read-only archival input",
  },
  files,
};

fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
