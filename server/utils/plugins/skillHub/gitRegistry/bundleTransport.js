const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const yaml = require("js-yaml");

const { parseFrontmatter } = require("../../MarkdownParser");
const { writeFileAtomic } = require("../format/writeFileAtomic");

function ensureDir(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch {
    // ignore
  }
}

function safeSlug(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function resolveUrlMaybeRelative(target, base) {
  const raw = String(target || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw) || raw.startsWith("git@")) return raw;
  if (!base) return null;
  try {
    return new URL(raw, String(base)).toString();
  } catch {
    return null;
  }
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const buf = fs.readFileSync(filePath);
  hash.update(buf);
  return hash.digest("hex");
}

async function downloadToFile(url, filePath, { timeoutMs = 30_000 } = {}) {
  const parsed = new URL(url);
  const lib = parsed.protocol === "https:" ? https : http;

  await new Promise((resolve, reject) => {
    const req = lib.get(
      parsed,
      { headers: { Accept: "application/zip,application/octet-stream,*/*" } },
      (res) => {
        const status = res.statusCode || 0;
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`HTTP ${status} while downloading bundle`));
          return;
        }

        const out = fs.createWriteStream(filePath);
        res.pipe(out);
        out.on("finish", () => resolve(true));
        out.on("error", reject);
      }
    );
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("Request timeout"));
    });
  });

  return filePath;
}

function safeExtractZip(zipFilePath, destDir) {
  const AdmZip = require("adm-zip");
  const zip = new AdmZip(zipFilePath);
  const entries = zip.getEntries();

  for (const entry of entries) {
    const name = String(entry.entryName || "");
    const normalized = path.posix.normalize(name);
    if (
      normalized.startsWith("..") ||
      normalized.includes("../") ||
      normalized.startsWith("/") ||
      normalized.includes(":")
    ) {
      throw new Error(`Unsafe zip entry path: ${name}`);
    }
  }

  zip.extractAllTo(destDir, true);
}

function findSkillRoot(extractDir) {
  const direct = path.join(extractDir, "skill.md");
  if (fs.existsSync(direct)) return extractDir;

  const entries = fs
    .readdirSync(extractDir, { withFileTypes: true })
    .filter((e) => e.isDirectory());
  if (entries.length !== 1) return null;

  const candidate = path.join(extractDir, entries[0].name);
  if (fs.existsSync(path.join(candidate, "skill.md"))) return candidate;
  return null;
}

function writeSkillFrontmatterOverrides(skillMdPath, overrides) {
  const original = fs.readFileSync(skillMdPath, "utf8");
  const { data: fm, content: body } = parseFrontmatter(original);
  const merged = { ...(fm || {}), ...(overrides || {}) };
  const dumped = yaml.dump(merged, { lineWidth: -1 }).trimEnd();
  const content = String(body || "").trim();
  const updated = `---\n${dumped}\n---\n\n${content}\n`;
  writeFileAtomic(skillMdPath, updated, { encoding: "utf8" });
}

module.exports = {
  ensureDir,
  safeSlug,
  resolveUrlMaybeRelative,
  sha256File,
  downloadToFile,
  safeExtractZip,
  findSkillRoot,
  writeSkillFrontmatterOverrides,
};
