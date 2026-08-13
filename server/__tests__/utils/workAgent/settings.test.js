describe("work-agent settings", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function settingsModel(values = {}) {
    return {
      get: jest.fn(async ({ label }) =>
        Object.prototype.hasOwnProperty.call(values, label)
          ? { label, value: values[label] }
          : null
      ),
      _updateSettings: jest.fn(async (updates) => ({
        success: true,
        error: null,
        updates,
      })),
    };
  }

  it("resolves DB value before env and default", async () => {
    process.env.ALATA_WORK_AGENT_PROVIDER = "openai";
    const {
      getWorkAgentSetting,
      WORK_AGENT_SETTINGS,
    } = require("../../../utils/workAgent/settings");

    const value = await getWorkAgentSetting(WORK_AGENT_SETTINGS.provider, {
      SystemSettingsModel: settingsModel({
        ALATA_WORK_AGENT_PROVIDER: "deterministic",
      }),
      defaultValue: "generic-openai",
    });

    expect(value).toBe("deterministic");
  });

  it("falls back to env before default when DB value is unset", async () => {
    process.env.ALATA_WORK_AGENT_PROVIDER = "openai";
    const {
      getWorkAgentSetting,
      WORK_AGENT_SETTINGS,
    } = require("../../../utils/workAgent/settings");

    const value = await getWorkAgentSetting(WORK_AGENT_SETTINGS.provider, {
      SystemSettingsModel: settingsModel({}),
      defaultValue: "deterministic",
    });

    expect(value).toBe("openai");
  });

  it("normalizes boolean settings from DB/env/default", async () => {
    const {
      getBooleanWorkAgentSetting,
      WORK_AGENT_SETTINGS,
    } = require("../../../utils/workAgent/settings");

    await expect(
      getBooleanWorkAgentSetting(WORK_AGENT_SETTINGS.seedGstackAssistants, {
        SystemSettingsModel: settingsModel({
          SEED_GSTACK_ASSISTANTS: "true",
        }),
      })
    ).resolves.toBe(true);

    process.env.SEED_GSTACK_ASSISTANTS = "true";
    await expect(
      getBooleanWorkAgentSetting(WORK_AGENT_SETTINGS.seedGstackAssistants, {
        SystemSettingsModel: settingsModel({}),
        defaultValue: "false",
      })
    ).resolves.toBe(true);
  });

  it("only persists supported work-agent settings", async () => {
    const {
      updateWorkAgentSettings,
    } = require("../../../utils/workAgent/settings");
    const model = settingsModel({});

    await expect(
      updateWorkAgentSettings(
        {
          SEED_GSTACK_ASSISTANTS: true,
          ALATA_CODE_EXECUTION_ROOT: "/tmp/alata-code",
          UNKNOWN_FLAG: "x",
        },
        { SystemSettingsModel: model }
      )
    ).resolves.toEqual({
      success: false,
      error: expect.stringContaining("Unsupported work-agent setting"),
    });

    expect(model._updateSettings).not.toHaveBeenCalled();
  });
});
