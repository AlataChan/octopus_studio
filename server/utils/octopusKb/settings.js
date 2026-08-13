const path = require("path");
const { SystemSettings } = require("../../models/systemSettings");

const OCTOPUS_KB_SETTINGS = Object.freeze({
  enabled: "OCTOPUS_KB_ENABLED",
  command: "OCTOPUS_KB_COMMAND",
  args: "OCTOPUS_KB_ARGS",
  vaultRoot: "OCTOPUS_KB_VAULT_ROOT",
  curationEnabled: "OCTOPUS_KB_CURATION_ENABLED",
  curationMaxFiles: "OCTOPUS_KB_CURATION_MAX_FILES",
  curationMaxBytes: "OCTOPUS_KB_CURATION_MAX_BYTES",
  memoryEnabled: "OCTOPUS_KB_MEMORY_ENABLED",
});

const OCTOPUS_KB_DEFAULTS = Object.freeze({
  [OCTOPUS_KB_SETTINGS.enabled]: "false",
  [OCTOPUS_KB_SETTINGS.command]: null,
  [OCTOPUS_KB_SETTINGS.args]: "[]",
  [OCTOPUS_KB_SETTINGS.vaultRoot]: path.resolve(
    process.env.STORAGE_DIR || path.join(__dirname, "../../storage"),
    "kb-vaults"
  ),
  [OCTOPUS_KB_SETTINGS.curationEnabled]: "false",
  [OCTOPUS_KB_SETTINGS.curationMaxFiles]: "50",
  [OCTOPUS_KB_SETTINGS.curationMaxBytes]: String(2 * 1024 * 1024),
  [OCTOPUS_KB_SETTINGS.memoryEnabled]: "false",
});

const SUPPORTED_OCTOPUS_KB_SETTINGS = Object.freeze(
  Object.values(OCTOPUS_KB_SETTINGS)
);

function normalizeBooleanSetting(value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value ?? "")
    .trim()
    .toLowerCase() === "true"
    ? "true"
    : "false";
}

function normalizeArgs(value) {
  if (Array.isArray(value)) return value.map(String);
  if (value == null || value === "") return [];
  if (typeof value === "string") {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error("OCTOPUS_KB_ARGS must be a JSON array.");
    return parsed.map(String);
  }
  throw new Error("OCTOPUS_KB_ARGS must be a JSON array.");
}

function validateOctopusKbSetting(key, value) {
  if (!SUPPORTED_OCTOPUS_KB_SETTINGS.includes(key)) {
    throw new Error(`Unsupported octopus-kb setting: ${key}`);
  }

  if (key === OCTOPUS_KB_SETTINGS.enabled) return normalizeBooleanSetting(value);
  if (
    key === OCTOPUS_KB_SETTINGS.curationEnabled ||
    key === OCTOPUS_KB_SETTINGS.memoryEnabled
  )
    return normalizeBooleanSetting(value);
  if (
    key === OCTOPUS_KB_SETTINGS.curationMaxFiles ||
    key === OCTOPUS_KB_SETTINGS.curationMaxBytes
  ) {
    const normalized = Number(value);
    if (!Number.isInteger(normalized) || normalized <= 0) {
      throw new Error(`${key} must be a positive integer.`);
    }
    return String(normalized);
  }
  if (key === OCTOPUS_KB_SETTINGS.args) return JSON.stringify(normalizeArgs(value));
  if (key === OCTOPUS_KB_SETTINGS.command) {
    const command = String(value || "").trim();
    if (!command) return null;
    if (!path.isAbsolute(command)) {
      throw new Error("OCTOPUS_KB_COMMAND must be an absolute path.");
    }
    return command;
  }
  if (key === OCTOPUS_KB_SETTINGS.vaultRoot) {
    const root = String(value || "").trim();
    if (!root) return OCTOPUS_KB_DEFAULTS[OCTOPUS_KB_SETTINGS.vaultRoot];
    return path.resolve(root);
  }
  return value == null ? null : String(value);
}

async function readDbSetting(label, SystemSettingsModel = SystemSettings) {
  const row = await SystemSettingsModel.get({ label });
  if (!row || row.value === null || row.value === undefined || row.value === "") {
    return { value: null, source: null };
  }
  return { value: row.value, source: "db" };
}

async function resolveOctopusKbSetting(
  label,
  {
    env = process.env,
    SystemSettingsModel = SystemSettings,
    defaultValue = OCTOPUS_KB_DEFAULTS[label] ?? null,
  } = {}
) {
  if (!SUPPORTED_OCTOPUS_KB_SETTINGS.includes(label)) {
    throw new Error(`Unsupported octopus-kb setting: ${label}`);
  }

  const db = await readDbSetting(label, SystemSettingsModel);
  if (db.source === "db") return db;

  if (Object.prototype.hasOwnProperty.call(env, label) && env[label] !== "") {
    return { value: env[label], source: "env" };
  }

  return { value: defaultValue, source: "default" };
}

async function getOctopusKbSetting(label, options = {}) {
  return (await resolveOctopusKbSetting(label, options)).value;
}

async function isOctopusKbEnabled(options = {}) {
  return (
    normalizeBooleanSetting(
      await getOctopusKbSetting(OCTOPUS_KB_SETTINGS.enabled, options)
    ) === "true"
  );
}

async function isOctopusKbCurationEnabled(options = {}) {
  return (
    normalizeBooleanSetting(
      await getOctopusKbSetting(OCTOPUS_KB_SETTINGS.curationEnabled, options)
    ) === "true"
  );
}

async function isOctopusKbMemoryEnabled(options = {}) {
  return (
    normalizeBooleanSetting(
      await getOctopusKbSetting(OCTOPUS_KB_SETTINGS.memoryEnabled, options)
    ) === "true"
  );
}

async function getOctopusKbCurationLimits(options = {}) {
  return {
    maxFiles: Number(
      await getOctopusKbSetting(OCTOPUS_KB_SETTINGS.curationMaxFiles, options)
    ),
    maxBytes: Number(
      await getOctopusKbSetting(OCTOPUS_KB_SETTINGS.curationMaxBytes, options)
    ),
  };
}

module.exports = {
  OCTOPUS_KB_DEFAULTS,
  OCTOPUS_KB_SETTINGS,
  SUPPORTED_OCTOPUS_KB_SETTINGS,
  getOctopusKbSetting,
  getOctopusKbCurationLimits,
  isOctopusKbEnabled,
  isOctopusKbCurationEnabled,
  isOctopusKbMemoryEnabled,
  normalizeArgs,
  normalizeBooleanSetting,
  resolveOctopusKbSetting,
  validateOctopusKbSetting,
};
