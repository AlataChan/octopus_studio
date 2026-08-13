const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../..");
const vendorRoot = path.join(repoRoot, "server/integrations/octopus-kb");
const manifestPath = path.join(
  repoRoot,
  "docs/consolidation/octopus-kb-provenance.json"
);

function walkFiles(root, relative = "") {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(relative, entry.name);
    return entry.isDirectory() ? walkFiles(root, child) : [child.split(path.sep).join("/")];
  });
}

describe("absorbed octopus-kb provenance", () => {
  it("makes Studio authoritative and covers every adopted file", () => {
    expect(fs.existsSync(path.join(vendorRoot, "NOTICE"))).toBe(true);
    expect(fs.existsSync(manifestPath)).toBe(true);

    const vendorNotice = fs.readFileSync(path.join(vendorRoot, "NOTICE"), "utf8");
    const vendorReadme = fs.readFileSync(path.join(vendorRoot, "VENDOR.md"), "utf8");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

    expect(vendorNotice).toContain("d4852698caedbb37f4c370bc339da22a38db1367");
    expect(vendorReadme).toContain("Studio is the sole active source of truth");
    expect(vendorReadme).not.toContain("Source of truth: ../../../octopus-kb");
    expect(manifest.authority).toBe("studio");
    expect(manifest.source.commit).toBe("d4852698caedbb37f4c370bc339da22a38db1367");

    const adapters = walkFiles(path.join(repoRoot, "server/utils/octopusKb")).map(
      (file) => `server/utils/octopusKb/${file}`
    );
    const adopted = walkFiles(vendorRoot)
      .filter(
        (file) =>
          file === "LICENSE" ||
          file === "NOTICE" ||
          file.startsWith("schemas/") ||
          file.startsWith("src/") ||
          file.startsWith("tests/")
      )
      .map((file) => `server/integrations/octopus-kb/${file}`);

    for (const file of [...adapters, ...adopted]) {
      expect(manifest.files[file]).toEqual(
        expect.objectContaining({ origin: expect.any(String), license: expect.any(String) })
      );
    }
  });
});
