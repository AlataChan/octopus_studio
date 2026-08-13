const path = require("path");
const { SystemSettings } = require("../../models/systemSettings");

const WORK_AGENT_SETTINGS = Object.freeze({
  provider: "ALATA_WORK_AGENT_PROVIDER",
  codeExecutionRoot: "ALATA_CODE_EXECUTION_ROOT",
  seedGstackAssistants: "SEED_GSTACK_ASSISTANTS",
});

const WORK_AGENT_DEFAULTS = Object.freeze({
  [WORK_AGENT_SETTINGS.provider]: null,
  [WORK_AGENT_SETTINGS.codeExecutionRoot]: null,
  [WORK_AGENT_SETTINGS.seedGstackAssistants]: "false",
});

const SUPPORTED_WORK_AGENT_SETTINGS = Object.freeze(
  Object.values(WORK_AGENT_SETTINGS)
);

function normalizeBooleanSetting(value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized === "true" ? "true" : "false";
}

function validateWorkAgentSetting(key, value) {
  if (!SUPPORTED_WORK_AGENT_SETTINGS.includes(key)) {
    throw new Error(`Unsupported work-agent setting: ${key}`);
  }

  if (key === WORK_AGENT_SETTINGS.seedGstackAssistants) {
    return normalizeBooleanSetting(value);
  }

  if (key === WORK_AGENT_SETTINGS.provider) {
    const provider = String(value ?? "")
      .trim()
      .toLowerCase();
    if (!provider) return null;
    if (
      ![
        "deterministic",
        "phase1-deterministic",
        "openai",
        "generic-openai",
      ].includes(provider)
    ) {
      throw new Error(`Unsupported work-agent provider: ${value}`);
    }
    return provider;
  }

  if (key === WORK_AGENT_SETTINGS.codeExecutionRoot) {
    const root = String(value ?? "").trim();
    if (!root) return null;
    return path.resolve(root);
  }

  return value == null ? null : String(value);
}

async function readDbSetting(label, SystemSettingsModel = SystemSettings) {
  const row = await SystemSettingsModel.get({ label });
  if (
    !row ||
    row.value === null ||
    row.value === undefined ||
    row.value === ""
  ) {
    return { value: null, source: null };
  }
  return { value: row.value, source: "db" };
}

async function resolveWorkAgentSetting(
  label,
  {
    env = process.env,
    SystemSettingsModel = SystemSettings,
    defaultValue = WORK_AGENT_DEFAULTS[label] ?? null,
  } = {}
) {
  if (!SUPPORTED_WORK_AGENT_SETTINGS.includes(label)) {
    throw new Error(`Unsupported work-agent setting: ${label}`);
  }

  const db = await readDbSetting(label, SystemSettingsModel);
  if (db.source === "db") return db;

  if (Object.prototype.hasOwnProperty.call(env, label) && env[label] !== "") {
    return { value: env[label], source: "env" };
  }

  return { value: defaultValue, source: "default" };
}

async function getWorkAgentSetting(label, options = {}) {
  return (await resolveWorkAgentSetting(label, options)).value;
}

async function getBooleanWorkAgentSetting(label, options = {}) {
  return (
    normalizeBooleanSetting(await getWorkAgentSetting(label, options)) ===
    "true"
  );
}

async function getWorkAgentSettings(options = {}) {
  const entries = await Promise.all(
    SUPPORTED_WORK_AGENT_SETTINGS.map(async (label) => [
      label,
      await resolveWorkAgentSetting(label, options),
    ])
  );
  return Object.fromEntries(entries);
}

async function updateWorkAgentSettings(
  updates = {},
  { SystemSettingsModel = SystemSettings } = {}
) {
  try {
    const sanitized = {};
    for (const [key, value] of Object.entries(updates || {})) {
      sanitized[key] = validateWorkAgentSetting(key, value);
    }
    const result = await SystemSettingsModel._updateSettings(sanitized);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = {
  SUPPORTED_WORK_AGENT_SETTINGS,
  WORK_AGENT_DEFAULTS,
  WORK_AGENT_SETTINGS,
  getBooleanWorkAgentSetting,
  getWorkAgentSetting,
  getWorkAgentSettings,
  normalizeBooleanSetting,
  resolveWorkAgentSetting,
  updateWorkAgentSettings,
  validateWorkAgentSetting,
};
