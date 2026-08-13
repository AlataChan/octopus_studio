const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../../..");
const removedFiles = [
  ["server", "utils", "workAgent", "engine", "octopus" + "Adapter.js"],
  ["server", "utils", "workAgent", "octopus" + "Loader.js"],
  ["server", "scripts", "deepseek-" + "octopus" + "-smoke.cjs"],
];
const forbidden = new RegExp(
  [
    "octopus" + "Adapter",
    "octopus" + "Loader",
    "enable" + "OctopusEngine",
    "ALATA_ENABLE_" + "OCTOPUS_ENGINE",
    "ENGINES\\." + "OCTOPUS",
  ].join("|")
);

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) return walkFiles(child);
    return [child];
  });
}

describe("retired Octopus work-agent adapter", () => {
  it("removes runtime, configuration, product UI, and current architecture docs together", () => {
    for (const parts of removedFiles) {
      expect(fs.existsSync(path.join(repoRoot, ...parts))).toBe(false);
    }

    const roots = [
      "server/endpoints",
      "server/models",
      "server/scripts",
      "server/utils/workAgent",
      "frontend/src",
    ];
    const files = roots.flatMap((root) => walkFiles(path.join(repoRoot, root)));
    files.push(path.join(repoRoot, "docs/AGENT_ARCHITECTURE.md"));

    const matches = files.flatMap((file) => {
      const text = fs.readFileSync(file, "utf8");
      return forbidden.test(text) ? [path.relative(repoRoot, file)] : [];
    });
    expect(matches).toEqual([]);
  });
});
