const fs = require("fs");
const os = require("os");
const path = require("path");

function writeFile(file, body = "body") {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, "utf8");
}

describe("octopus-kb memory retention", () => {
  it("deletes memory pages for a specific workspace thread only", async () => {
    const vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-retention-"));
    const threadFile = path.join(
      vaultRoot,
      "workspace-a",
      "wiki/memory/workspace-a/thread-1/memory.md"
    );
    const otherFile = path.join(
      vaultRoot,
      "workspace-a",
      "wiki/memory/workspace-a/thread-2/memory.md"
    );
    writeFile(threadFile);
    writeFile(otherFile);

    const { deleteWorkspaceMemoryPages } = require("../../utils/octopusKb/retention");
    const result = await deleteWorkspaceMemoryPages("workspace-a", {
      threadId: "thread:1",
      vaultRoot,
    });

    expect(result.deleted).toBe(true);
    expect(fs.existsSync(threadFile)).toBe(false);
    expect(fs.existsSync(otherFile)).toBe(true);
  });

  it("archives aged memory pages and seeds archive exclusion in the vault profile", async () => {
    const vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-retention-"));
    const oldFile = path.join(
      vaultRoot,
      "workspace-a",
      "wiki/memory/workspace-a/thread-1/old.md"
    );
    writeFile(oldFile, "old");
    const oldTime = new Date("2026-01-01T00:00:00.000Z");
    fs.utimesSync(oldFile, oldTime, oldTime);

    const { archiveAgedMemoryPages } = require("../../utils/octopusKb/retention");
    const result = await archiveAgedMemoryPages("workspace-a", {
      vaultRoot,
      olderThanDays: 7,
      now: new Date("2026-06-16T00:00:00.000Z"),
    });

    expect(result.archived).toBe(1);
    expect(fs.existsSync(oldFile)).toBe(false);
    expect(
      fs.existsSync(
        path.join(
          vaultRoot,
          "workspace-a",
          "archive/wiki/memory/workspace-a/thread-1/old.md"
        )
      )
    ).toBe(true);
    expect(
      fs.readFileSync(path.join(vaultRoot, "workspace-a", ".octopus-kb.yml"), "utf8")
    ).toContain("archive/**");
  });

  it("does not rewrite a supported profile that already excludes archive pages inline", async () => {
    const vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-retention-"));
    const vault = path.join(vaultRoot, "workspace-a");
    fs.mkdirSync(vault, { recursive: true });
    const profile = path.join(vault, ".octopus-kb.yml");
    const original = 'exclude_globs: ["archive/**"]\n';
    fs.writeFileSync(profile, original, "utf8");

    const { ensureArchiveExcluded } = require("../../utils/octopusKb/retention");
    const result = await ensureArchiveExcluded(vault);

    expect(result.changed).toBe(false);
    expect(fs.readFileSync(profile, "utf8")).toBe(original);
  });
});
