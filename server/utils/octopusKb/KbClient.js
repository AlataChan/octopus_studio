const childProcess = require("child_process");
const path = require("path");
const { SystemSettings } = require("../../models/systemSettings");
const {
  OCTOPUS_KB_DEFAULTS,
  OCTOPUS_KB_SETTINGS,
  getOctopusKbSetting,
  isOctopusKbEnabled,
  normalizeArgs,
} = require("./settings");

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_CIRCUIT_THRESHOLD = 3;
const DEFAULT_CIRCUIT_COOLDOWN_MS = 60_000;
const INTEGRATION_SRC = path.resolve(
  __dirname,
  "../../integrations/octopus-kb/src"
);
const OPENAI_COMPATIBLE_PROFILES = Object.freeze({
  openai: {
    baseURL: "https://api.openai.com/v1",
    apiKey: "OPEN_AI_KEY",
    model: "OPEN_MODEL_PREF",
    defaultModel: "gpt-4o-mini",
  },
  "generic-openai": {
    baseURL: "GENERIC_OPEN_AI_BASE_PATH",
    apiKey: "GENERIC_OPEN_AI_API_KEY",
    model: "GENERIC_OPEN_AI_MODEL_PREF",
    defaultModel: "gpt-4o-mini",
  },
  deepseek: {
    baseURL: "https://api.deepseek.com/v1",
    apiKey: "DEEPSEEK_API_KEY",
    model: "DEEPSEEK_MODEL_PREF",
    defaultModel: "deepseek-chat",
  },
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: "OPENROUTER_API_KEY",
    model: "OPENROUTER_MODEL_PREF",
    defaultModel: "openrouter/auto",
  },
  aihubmix: {
    baseURL: "AIHUBMIX_BASE_PATH",
    apiKey: "AIHUBMIX_API_KEY",
    model: "AIHUBMIX_MODEL_PREF",
  },
  moonshotai: {
    baseURL: "https://api.moonshot.ai/v1",
    apiKey: "MOONSHOT_AI_API_KEY",
    model: "MOONSHOT_AI_MODEL_PREF",
    defaultModel: "moonshot-v1-32k",
  },
  zhipu: {
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    apiKey: "ZHIPU_AI_API_KEY",
    model: "ZHIPU_AI_MODEL_PREF",
    defaultModel: "glm-4-plus",
  },
  minimax: {
    baseURL: "https://api.minimax.chat/v1",
    apiKey: "MINIMAX_API_KEY",
    model: "MINIMAX_MODEL_PREF",
    defaultModel: "abab6.5-chat",
  },
  siliconflow: {
    baseURL: "https://api.siliconflow.cn/v1",
    apiKey: "SILICONFLOW_API_KEY",
    model: "SILICONFLOW_MODEL_PREF",
    defaultModel: "Qwen/Qwen2.5-7B-Instruct",
  },
});

async function settingValue(label, { env = process.env, SystemSettingsModel } = {}) {
  if (env[label] !== undefined && env[label] !== null && env[label] !== "") {
    return env[label];
  }
  if (SystemSettingsModel?.get) {
    const row = await SystemSettingsModel.get({ label });
    if (row?.value !== undefined && row.value !== null && row.value !== "") {
      return row.value;
    }
  }
  return null;
}

function resolveProfileField(field, env) {
  if (!field) return null;
  if (field.startsWith("http://") || field.startsWith("https://")) return field;
  return env[field] || null;
}

async function buildLlmProfile({
  env = process.env,
  SystemSettingsModel = SystemSettings,
} = {}) {
  const provider = String(
    (await settingValue("LLM_PROVIDER", { env, SystemSettingsModel })) || ""
  )
    .trim()
    .toLowerCase();
  const profile = OPENAI_COMPATIBLE_PROFILES[provider];
  if (!profile) return null;

  const baseURL = resolveProfileField(profile.baseURL, env);
  const model =
    (await settingValue(profile.model, { env, SystemSettingsModel })) ||
    profile.defaultModel ||
    null;
  if (!baseURL || !model) return null;

  const apiKey = profile.apiKey
    ? await settingValue(profile.apiKey, { env, SystemSettingsModel })
    : null;

  return {
    baseURL,
    ...(apiKey ? { apiKey } : {}),
    model,
    provider,
  };
}

class KbClient {
  constructor({
    command = null,
    args = null,
    vaultRoot = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    spawnFn = childProcess.spawn,
    SystemSettingsModel,
    env = process.env,
    circuitThreshold = DEFAULT_CIRCUIT_THRESHOLD,
    circuitCooldownMs = DEFAULT_CIRCUIT_COOLDOWN_MS,
  } = {}) {
    this.command = command;
    this.args = args === null || args === undefined ? null : normalizeArgs(args);
    this.vaultRoot = vaultRoot;
    this.timeoutMs = timeoutMs;
    this.spawnFn = spawnFn;
    this.SystemSettingsModel = SystemSettingsModel;
    this.env = env;
    this.circuitThreshold = circuitThreshold;
    this.circuitCooldownMs = circuitCooldownMs;
    this.failures = 0;
    this.circuitOpenUntil = 0;
  }

  async enabled() {
    return isOctopusKbEnabled({
      env: this.env,
      SystemSettingsModel: this.SystemSettingsModel,
    });
  }

  isCircuitOpen() {
    return Date.now() < this.circuitOpenUntil;
  }

  async exportGraph(slug) {
    return this.#runJson("export-graph", slug);
  }

  async retrieveBundle(slug, query, maxTokens = 1500) {
    return (
      (await this.#runJson("retrieve-bundle", slug, [
        "--query",
        query,
        "--max-tokens",
        String(maxTokens),
      ])) || []
    );
  }

  async ingest(slug, { markdown, title, tags = [] } = {}) {
    const args = ["--markdown", markdown || ""];
    if (title) args.push("--title", title);
    if (tags.length) args.push("--tags", tags.join(","));
    return this.#runJson("ingest", slug, args);
  }

  async writePage(slug, page) {
    return this.#runJson("write-page", slug, [
      "--page-json",
      JSON.stringify(page || {}),
    ]);
  }

  async propose(slug, rawPath, profile = null) {
    return this.#runJson("propose", slug, ["--raw-path", rawPath], profile);
  }

  async validate(slug, proposalPath, { apply = false, profile = null } = {}) {
    const args = ["--proposal-path", proposalPath];
    if (apply) args.push("--apply");
    return this.#runJson("validate", slug, args, profile);
  }

  async healthcheck(slug = "_health") {
    return Boolean(await this.exportGraph(slug));
  }

  async vaultPath(slug) {
    return path.join(await this.#vaultRoot(), slug);
  }

  async #runJson(verb, slug, extraArgs = [], profile = null) {
    if (this.isCircuitOpen()) return null;

    const command = await this.#command();
    if (!command) return null;

    const vaultRoot = await this.#vaultRoot();
    const childArgs = [
      ...(await this.#args()),
      "-m",
      "octopus_kb_mcp.cli",
      verb,
      "--vault",
      path.join(vaultRoot, slug),
      ...extraArgs.map(String),
    ];

    const result = await this.#spawnJson(command, childArgs, {
      env: this.#childEnv(vaultRoot, profile),
    });
    if (result.ok) {
      this.#recordSuccess();
      return result.value;
    }
    this.#recordFailure();
    return null;
  }

  async #command() {
    if (this.command) return this.command;
    return getOctopusKbSetting(OCTOPUS_KB_SETTINGS.command, {
      env: this.env,
      SystemSettingsModel: this.SystemSettingsModel,
      defaultValue: OCTOPUS_KB_DEFAULTS[OCTOPUS_KB_SETTINGS.command],
    });
  }

  async #args() {
    if (this.args !== null) return this.args;
    if (this.command) return [];
    const value = await getOctopusKbSetting(OCTOPUS_KB_SETTINGS.args, {
      env: this.env,
      SystemSettingsModel: this.SystemSettingsModel,
      defaultValue: OCTOPUS_KB_DEFAULTS[OCTOPUS_KB_SETTINGS.args],
    });
    return normalizeArgs(value);
  }

  async #vaultRoot() {
    if (this.vaultRoot) return path.resolve(this.vaultRoot);
    const value = await getOctopusKbSetting(OCTOPUS_KB_SETTINGS.vaultRoot, {
      env: this.env,
      SystemSettingsModel: this.SystemSettingsModel,
      defaultValue: OCTOPUS_KB_DEFAULTS[OCTOPUS_KB_SETTINGS.vaultRoot],
    });
    return path.resolve(value);
  }

  #childEnv(vaultRoot, profile = null) {
    const env = {
      PATH: this.env.PATH || process.env.PATH || "",
      PYTHONPATH: INTEGRATION_SRC,
      OCTOPUS_KB_VAULT_ROOT: vaultRoot,
    };
    if (profile) {
      if (profile.baseURL || profile.baseUrl || profile.base_url)
        env.KB_LLM_BASE_URL = profile.baseURL || profile.baseUrl || profile.base_url;
      if (profile.apiKey || profile.api_key)
        env.KB_LLM_API_KEY = profile.apiKey || profile.api_key;
      if (profile.model) env.KB_LLM_MODEL = profile.model;
    }
    return env;
  }

  #spawnJson(command, args, options) {
    return new Promise((resolve) => {
      let settled = false;
      let stdout = "";
      let stderr = "";
      let child;

      const finish = (payload) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(payload);
      };

      const timer = setTimeout(() => {
        if (child?.kill) child.kill("SIGTERM");
        finish({ ok: false, error: "timeout" });
      }, this.timeoutMs);

      try {
        child = this.spawnFn(command, args, {
          env: options.env,
          shell: false,
          windowsHide: true,
        });
      } catch (error) {
        finish({ ok: false, error: error.message });
        return;
      }

      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => finish({ ok: false, error: error.message }));
      child.on("close", (code, signal) => {
        if (code !== 0) {
          finish({ ok: false, error: stderr || signal || `exit ${code}` });
          return;
        }
        try {
          finish({ ok: true, value: JSON.parse(stdout || "null") });
        } catch (error) {
          finish({ ok: false, error: error.message });
        }
      });
    });
  }

  #recordSuccess() {
    this.failures = 0;
    this.circuitOpenUntil = 0;
  }

  #recordFailure() {
    this.failures += 1;
    if (this.failures >= this.circuitThreshold) {
      this.circuitOpenUntil = Date.now() + this.circuitCooldownMs;
    }
  }
}

module.exports = {
  INTEGRATION_SRC,
  KbClient,
  buildLlmProfile,
};
