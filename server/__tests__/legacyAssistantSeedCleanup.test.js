const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../..");
const SEARCH_ROOTS = ["server", "electron", "scripts", "docker"];
const BANNED_TOKENS = [
  "syncBuiltin" + "Employees",
  "AI_" + "EMPLOYEES",
  "SEED_DEMO_" + "ASSISTANTS",
];
const EXCLUDED_PARTS = new Set([
  "node_modules",
  ".git",
  "storage",
  "vector-cache",
  "documents",
  "swagger",
  "__tests__",
]);

function walkFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDED_PARTS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, files);
      continue;
    }

    if (entry.isFile()) files.push(fullPath);
  }

  return files;
}

describe("legacy assistant seed cleanup", () => {
  it("does not leave production references to removed legacy seed symbols", () => {
    const matches = [];

    for (const root of SEARCH_ROOTS) {
      const rootPath = path.join(REPO_ROOT, root);
      if (!fs.existsSync(rootPath)) continue;

      for (const file of walkFiles(rootPath)) {
        const content = fs.readFileSync(file, "utf8");
        for (const token of BANNED_TOKENS) {
          if (!content.includes(token)) continue;
          matches.push(`${path.relative(REPO_ROOT, file)} contains ${token}`);
        }
      }
    }

    expect(matches).toEqual([]);
  });
});
