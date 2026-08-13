const prisma = require("../utils/prisma");
const { safeJsonParse } = require("../utils/http");

function normalizeSource(source = "") {
  return String(source || "")
    .trim()
    .toLowerCase();
}

function safeJsonStringify(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ raw: String(value) });
  }
}

function toNullableString(value) {
  const s = String(value ?? "").trim();
  return s ? s : null;
}

function toNullableDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

function toCatalogColumns(metadata = null) {
  if (!metadata || typeof metadata !== "object") return {};

  const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
  return {
    name: toNullableString(metadata.name),
    description: toNullableString(metadata.description),
    version: toNullableString(metadata.version),
    category: toNullableString(metadata.category),
    tagsJson: safeJsonStringify(tags),
    icon: toNullableString(metadata.icon),
    sourceUrl: toNullableString(metadata.sourceUrl),
    sourceHash: toNullableString(metadata.sourceHash || metadata.contentHash),
    license: toNullableString(metadata.license),
    verified: metadata.verified === true,
    latestVersion: toNullableString(metadata.latestVersion),
    lastCheckedAt: toNullableDate(metadata.lastCheckedAt),
    status: toNullableString(metadata.status),
  };
}

function isMissingTableError(error) {
  const msg = String(error?.message || "");
  return msg.includes("no such table") && msg.includes("skill_catalog");
}

function hasSkillCatalogModel() {
  return !!prisma?.skill_catalog;
}

const SkillCatalog = {
  async get({ skillId, source }) {
    try {
      if (!hasSkillCatalogModel()) return null;
      return await prisma.skill_catalog.findUnique({
        where: {
          skillId_source: {
            skillId: String(skillId),
            source: normalizeSource(source),
          },
        },
      });
    } catch (error) {
      if (isMissingTableError(error)) return null;
      console.error("[SkillCatalog] get failed:", error.message);
      return null;
    }
  },

  async list({ source = null, enabled = null } = {}) {
    try {
      if (!hasSkillCatalogModel()) return [];
      const where = {};
      if (source) where.source = normalizeSource(source);
      if (typeof enabled === "boolean") where.enabled = enabled;

      const results = await prisma.skill_catalog.findMany({
        where,
        orderBy: [{ source: "asc" }, { skillId: "asc" }],
      });

      return results.map((row) => ({
        ...row,
        metadata: safeJsonParse(row.metadataJson, null),
      }));
    } catch (error) {
      if (isMissingTableError(error)) return [];
      console.error("[SkillCatalog] list failed:", error.message);
      return [];
    }
  },

  async upsert({
    skillId,
    source,
    metadata = null,
    enabledDefault = true,
    merge = true,
  } = {}) {
    try {
      if (!hasSkillCatalogModel()) return null;
      const normalizedSource = normalizeSource(source);
      const existing = await this.get({ skillId, source: normalizedSource });
      const existingMetadata =
        merge && existing
          ? safeJsonParse(existing.metadataJson, {}) || {}
          : null;

      const mergedMetadata =
        merge && existingMetadata && metadata && typeof metadata === "object"
          ? { ...existingMetadata, ...metadata }
          : (metadata ?? existingMetadata);

      const columns = toCatalogColumns(mergedMetadata);

      if (!existing) {
        return await prisma.skill_catalog.create({
          data: {
            skillId: String(skillId),
            source: normalizedSource,
            metadataJson: safeJsonStringify(mergedMetadata),
            enabled: enabledDefault === false ? false : true,
            ...columns,
          },
        });
      }

      return await prisma.skill_catalog.update({
        where: {
          skillId_source: {
            skillId: String(skillId),
            source: normalizedSource,
          },
        },
        data: {
          metadataJson: safeJsonStringify(mergedMetadata),
          ...columns,
        },
      });
    } catch (error) {
      if (isMissingTableError(error)) return null;
      console.error("[SkillCatalog] upsert failed:", error.message);
      return null;
    }
  },

  async setEnabled({ skillId, source, enabled }) {
    try {
      if (!hasSkillCatalogModel()) return null;
      return await prisma.skill_catalog.update({
        where: {
          skillId_source: {
            skillId: String(skillId),
            source: normalizeSource(source),
          },
        },
        data: { enabled: enabled === true },
      });
    } catch (error) {
      if (isMissingTableError(error)) return null;
      console.error("[SkillCatalog] setEnabled failed:", error.message);
      return null;
    }
  },
};

module.exports = { SkillCatalog };
