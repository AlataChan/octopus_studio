const fs = require("fs");
const path = require("path");
const {
  OCTOPUS_KB_DEFAULTS,
  OCTOPUS_KB_SETTINGS,
  getOctopusKbSetting,
} = require("./settings");

function safePathSegment(value, fallback = "item") {
  const cleaned = String(value ?? fallback)
    .trim()
    .replace(/[:/\\\s]+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160);
  return cleaned || fallback;
}

async function resolveVaultRoot({ vaultRoot, env, SystemSettingsModel } = {}) {
  if (vaultRoot) return path.resolve(vaultRoot);
  return path.resolve(
    await getOctopusKbSetting(OCTOPUS_KB_SETTINGS.vaultRoot, {
      env,
      SystemSettingsModel,
      defaultValue: OCTOPUS_KB_DEFAULTS[OCTOPUS_KB_SETTINGS.vaultRoot],
    })
  );
}

async function workspaceVault(slug, options = {}) {
  return path.join(await resolveVaultRoot(options), slug);
}

/**
 * Ensure generated octopus-kb vault profiles exclude physical archive pages.
 * This helper owns the simple generated `.octopus-kb.yml` shapes used by Alata
 * and preserves existing profiles that already mention archive/**.
 */
async function ensureArchiveExcluded(vaultPath) {
  fs.mkdirSync(vaultPath, { recursive: true });
  const profilePath = path.join(vaultPath, ".octopus-kb.yml");
  if (!fs.existsSync(profilePath)) {
    await fs.promises.writeFile(
      profilePath,
      "exclude_globs:\n  - archive/**\n",
      "utf8"
    );
    return { path: profilePath, changed: true };
  }

  const current = await fs.promises.readFile(profilePath, "utf8");
  if (profileHasArchiveExclude(current)) {
    return { path: profilePath, changed: false };
  }
  const next = addArchiveExclude(current);
  await fs.promises.writeFile(profilePath, next, "utf8");
  return { path: profilePath, changed: true };
}

function profileHasArchiveExclude(text) {
  return /archive\/\*\*/.test(String(text || ""));
}

function addArchiveExclude(text) {
  const current = String(text || "");
  if (/exclude_globs:\s*\[[^\]]*\]/.test(current)) {
    return current.replace(/exclude_globs:\s*\[([^\]]*)\]/, (_, items) => {
      const trimmed = items.trim();
      const prefix = trimmed ? `${trimmed}, ` : "";
      return `exclude_globs: [${prefix}"archive/**"]`;
    });
  }
  if (current.includes("exclude_globs:")) {
    return current.replace(/exclude_globs:\s*\n/, "exclude_globs:\n  - archive/**\n");
  }
  return `${current.trimEnd()}\nexclude_globs:\n  - archive/**\n`;
}

function memoryRoot(vaultPath, slug) {
  return path.join(vaultPath, "wiki", "memory", safePathSegment(slug, "workspace"));
}

async function deletePath(targetPath) {
  if (!fs.existsSync(targetPath)) return false;
  await fs.promises.rm(targetPath, { recursive: true, force: true });
  return true;
}

async function deleteWorkspaceMemoryPages(slug, threadOrOptions = null, maybeOptions = {}) {
  const options =
    typeof threadOrOptions === "object" && threadOrOptions !== null
      ? threadOrOptions
      : { ...maybeOptions, threadId: threadOrOptions };
  try {
    const vaultPath = await workspaceVault(slug, options);
    const base = memoryRoot(vaultPath, slug);
    const target = options.threadId
      ? path.join(base, safePathSegment(options.threadId, "thread"))
      : base;
    const deleted = await deletePath(target);
    return { deleted, path: target };
  } catch (error) {
    console.warn("[octopus-kb] memory retention delete skipped:", error.message);
    return { deleted: false, error: error.message };
  }
}

function walkMarkdownFiles(root) {
  if (!fs.existsSync(root)) return [];
  const results = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) results.push(...walkMarkdownFiles(file));
    if (entry.isFile() && entry.name.endsWith(".md")) results.push(file);
  }
  return results;
}

async function archiveAgedMemoryPages(
  slug,
  { olderThanDays = 90, now = new Date(), ...options } = {}
) {
  try {
    const vaultPath = await workspaceVault(slug, options);
    await ensureArchiveExcluded(vaultPath);
    const base = memoryRoot(vaultPath, slug);
    const cutoff = Number(now) - olderThanDays * 24 * 60 * 60 * 1000;
    let archived = 0;

    for (const file of walkMarkdownFiles(base)) {
      const stat = await fs.promises.stat(file);
      if (stat.mtimeMs > cutoff) continue;
      const relative = path.relative(vaultPath, file);
      const target = path.join(vaultPath, "archive", relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      await fs.promises.rename(file, target);
      archived += 1;
    }

    return { archived };
  } catch (error) {
    console.warn("[octopus-kb] memory archive skipped:", error.message);
    return { archived: 0, error: error.message };
  }
}

module.exports = {
  archiveAgedMemoryPages,
  deleteWorkspaceMemoryPages,
  ensureArchiveExcluded,
  safePathSegment,
};
