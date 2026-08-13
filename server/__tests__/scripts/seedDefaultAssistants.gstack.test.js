const {
  convertTemplateToDbData,
  getSeedTemplates,
  gstackAssistantsEnabled,
  seedDefaultAssistants,
  seedCategoryForPresetId,
} = require("../../prisma/seeds/seedDefaultAssistants");
const { GSTACK_TEMPLATES } = require("../../data/presetTemplates.gstack");
const {
  OFFICIAL_PRESET_IDS,
  DEMO_PRESET_IDS,
  GSTACK_PRESET_IDS,
} = require("../../data/immutablePresetIds");
const {
  DEFAULT_DESKTOP_EMPLOYEE_PRESET_IDS,
} = require("../../data/defaultEmployees");

describe("seedDefaultAssistants gstack gate", () => {
  function createFakePrisma() {
    const templates = new Map();
    const workspaceAssistants = [];
    return {
      _templates: templates,
      assistant_templates: {
        findMany: jest.fn(async () =>
          [...templates.values()].map(({ id, seedCategory }) => ({
            id,
            seedCategory,
          }))
        ),
        findFirst: jest.fn(
          async ({ where }) => templates.get(where.id) || null
        ),
        create: jest.fn(async ({ data }) => {
          templates.set(data.id, data);
          return data;
        }),
        update: jest.fn(async ({ where, data }) => {
          const existing = templates.get(where.id);
          const next = { ...existing, ...data };
          templates.set(where.id, next);
          return next;
        }),
      },
      workspace_assistants: {
        findMany: jest.fn(async () => workspaceAssistants),
        update: jest.fn(async () => null),
      },
    };
  }

  it("always includes demo templates and keeps gstack out unless enabled", () => {
    const env = {
      SEED_GSTACK_ASSISTANTS: "false",
    };
    const defaultTemplates = getSeedTemplates({ env });
    expect(defaultTemplates).toHaveLength(
      OFFICIAL_PRESET_IDS.length + DEMO_PRESET_IDS.length
    );
    expect(
      defaultTemplates.filter((template) => template.seedCategory === "demo")
    ).toHaveLength(DEMO_PRESET_IDS.length);
    expect(
      defaultTemplates.some((template) => template.seedCategory === "gstack")
    ).toBe(false);

    const enabledTemplates = getSeedTemplates({
      env: { ...env, SEED_GSTACK_ASSISTANTS: "true" },
    });
    expect(enabledTemplates).toHaveLength(
      OFFICIAL_PRESET_IDS.length +
        DEMO_PRESET_IDS.length +
        GSTACK_PRESET_IDS.length
    );
    expect(
      enabledTemplates.filter((template) => template.seedCategory === "gstack")
    ).toHaveLength(GSTACK_PRESET_IDS.length);
  });

  it("keeps demo templates independent from gstack gating", () => {
    const templates = getSeedTemplates({
      env: { SEED_GSTACK_ASSISTANTS: "true" },
    });
    expect(templates).toHaveLength(
      OFFICIAL_PRESET_IDS.length +
        DEMO_PRESET_IDS.length +
        GSTACK_PRESET_IDS.length
    );
  });

  it("converts gstack templates with code tools and gstack seed category", () => {
    const template = GSTACK_TEMPLATES[0];
    const dbData = convertTemplateToDbData(template);

    expect(seedCategoryForPresetId(template.id)).toBe("gstack");
    expect(dbData.seedCategory).toBe("gstack");
    expect(JSON.parse(dbData.defaultTools)).toEqual(
      expect.arrayContaining(["builtin:code-execution"])
    );
    expect(
      JSON.parse(dbData.defaultTools).some((tool) => tool.startsWith("code_"))
    ).toBe(true);
    expect(dbData.isDefault).toBe(false);
  });

  it("reads the gstack flag from the provided env", () => {
    expect(gstackAssistantsEnabled({ SEED_GSTACK_ASSISTANTS: "true" })).toBe(
      true
    );
    expect(gstackAssistantsEnabled({ SEED_GSTACK_ASSISTANTS: "false" })).toBe(
      false
    );
  });

  it("seeds gstack templates idempotently when the gate is enabled", async () => {
    const fakePrisma = createFakePrisma();
    const first = await seedDefaultAssistants(fakePrisma, {
      includeGstack: true,
    });
    expect(first.created).toBe(
      OFFICIAL_PRESET_IDS.length +
        DEMO_PRESET_IDS.length +
        GSTACK_PRESET_IDS.length
    );
    expect(first.updated).toBe(0);

    const categories = [...fakePrisma._templates.values()].reduce(
      (acc, template) => {
        acc[template.seedCategory] = (acc[template.seedCategory] || 0) + 1;
        return acc;
      },
      {}
    );
    expect(categories).toEqual({
      official: OFFICIAL_PRESET_IDS.length,
      demo: DEMO_PRESET_IDS.length,
      gstack: GSTACK_PRESET_IDS.length,
    });

    const second = await seedDefaultAssistants(fakePrisma, {
      includeGstack: true,
    });
    expect(second).toEqual(
      expect.objectContaining({
        created: 0,
        updated: 0,
        skipped:
          OFFICIAL_PRESET_IDS.length +
          DEMO_PRESET_IDS.length +
          GSTACK_PRESET_IDS.length,
      })
    );
  });

  it("backfills only isDefault for existing desktop default employees", async () => {
    const fakePrisma = createFakePrisma();
    const defaultId = [...DEFAULT_DESKTOP_EMPLOYEE_PRESET_IDS][0];
    const existingRow = {
      id: defaultId,
      seedCategory: "demo",
      isDefault: false,
      systemPrompt: "user edited prompt",
      description: "user edited description",
      skills: JSON.stringify(["user edited skill"]),
      defaultTools: JSON.stringify(["user edited tool"]),
      employeeBio: "user edited bio",
    };
    fakePrisma._templates.set(defaultId, existingRow);

    const originalRuntime = process.env.ANYTHING_LLM_RUNTIME;
    process.env.ANYTHING_LLM_RUNTIME = "desktop";
    try {
      const result = await seedDefaultAssistants(fakePrisma, {
        includeGstack: false,
      });

      expect(result.updated).toBe(1);
      const updatedRow = fakePrisma._templates.get(defaultId);
      expect(updatedRow).toEqual({
        ...existingRow,
        isDefault: true,
      });
      expect(fakePrisma.assistant_templates.update).toHaveBeenCalledWith({
        where: { id: defaultId },
        data: { isDefault: true },
      });
    } finally {
      if (originalRuntime === undefined) {
        delete process.env.ANYTHING_LLM_RUNTIME;
      } else {
        process.env.ANYTHING_LLM_RUNTIME = originalRuntime;
      }
    }
  });
});
