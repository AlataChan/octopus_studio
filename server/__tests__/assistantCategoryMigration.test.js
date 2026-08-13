jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn(() => ({
    assistant_templates: {
      findMany: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    workspace_assistants: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    $disconnect: jest.fn(),
  })),
}));

const fs = require("fs");
const path = require("path");

describe("assistant seed category migration", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test("backfills existing official preset templates with seedCategory=official", async () => {
    const { OFFICIAL_PRESET_IDS } = require("../data/immutablePresetIds");
    const {
      backfillAssistantSeedCategories,
    } = require("../prisma/seeds/seedDefaultAssistants");

    const officialId = OFFICIAL_PRESET_IDS[0];
    const prisma = {
      assistant_templates: {
        findMany: jest.fn().mockResolvedValue([
          { id: officialId, seedCategory: null },
          { id: "user-created-template", seedCategory: null },
        ]),
        update: jest.fn(),
      },
      workspace_assistants: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
    };

    const result = await backfillAssistantSeedCategories(prisma);

    expect(result.templates.updated).toBe(1);
    expect(prisma.assistant_templates.update).toHaveBeenCalledWith({
      where: { id: officialId },
      data: { seedCategory: "official" },
    });
    expect(prisma.assistant_templates.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-created-template" } })
    );
  });

  test("leaves user-created templates with unknown or missing preset IDs unclassified", async () => {
    const {
      backfillAssistantSeedCategories,
    } = require("../prisma/seeds/seedDefaultAssistants");
    const prisma = {
      assistant_templates: {
        findMany: jest.fn().mockResolvedValue([
          { id: "custom-template", seedCategory: null },
          { id: null, seedCategory: null },
        ]),
        update: jest.fn(),
      },
      workspace_assistants: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "custom-assistant",
            templateId: "custom-template",
            category: null,
          },
        ]),
        update: jest.fn(),
      },
    };

    const result = await backfillAssistantSeedCategories(prisma);

    expect(result.templates.updated).toBe(0);
    expect(result.workspaceAssistants.updated).toBe(0);
    expect(prisma.assistant_templates.update).not.toHaveBeenCalled();
    expect(prisma.workspace_assistants.update).not.toHaveBeenCalled();
  });

  test("seeds demo templates even without a demo seed flag", async () => {
    const { DEMO_PRESET_IDS } = require("../data/immutablePresetIds");
    const {
      seedDefaultAssistants,
    } = require("../prisma/seeds/seedDefaultAssistants");
    const prisma = {
      assistant_templates: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      workspace_assistants: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
    };

    await seedDefaultAssistants(prisma);
    const createdIds = prisma.assistant_templates.create.mock.calls.map(
      ([payload]) => payload.data.id
    );

    expect(createdIds.length).toBeGreaterThan(0);
    expect(DEMO_PRESET_IDS.length).toBeGreaterThan(0);
    for (const demoId of DEMO_PRESET_IDS) {
      expect(createdIds).toContain(demoId);
    }
  });

  test("sets seedCategory=demo for demo templates", async () => {
    const { DEMO_PRESET_IDS } = require("../data/immutablePresetIds");
    const {
      seedDefaultAssistants,
    } = require("../prisma/seeds/seedDefaultAssistants");
    const prisma = {
      assistant_templates: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      workspace_assistants: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
    };

    await seedDefaultAssistants(prisma);
    const createdRows = prisma.assistant_templates.create.mock.calls.map(
      ([payload]) => payload.data
    );
    const createdIds = createdRows.map((row) => row.id);

    expect(DEMO_PRESET_IDS.length).toBeGreaterThan(0);
    expect(createdIds).toEqual(expect.arrayContaining(DEMO_PRESET_IDS));
    expect(
      createdRows
        .filter((row) => DEMO_PRESET_IDS.includes(row.id))
        .every((row) => row.seedCategory === "demo")
    ).toBe(true);
  });

  test("backfill is idempotent for already classified rows", async () => {
    const {
      OFFICIAL_PRESET_IDS,
      DEMO_PRESET_IDS,
    } = require("../data/immutablePresetIds");
    const {
      backfillAssistantSeedCategories,
    } = require("../prisma/seeds/seedDefaultAssistants");

    const prisma = {
      assistant_templates: {
        findMany: jest.fn().mockResolvedValue([
          { id: OFFICIAL_PRESET_IDS[0], seedCategory: "official" },
          { id: DEMO_PRESET_IDS[0], seedCategory: "demo" },
        ]),
        update: jest.fn(),
      },
      workspace_assistants: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "assistant-1",
            templateId: OFFICIAL_PRESET_IDS[0],
            category: "official",
          },
        ]),
        update: jest.fn(),
      },
    };

    const result = await backfillAssistantSeedCategories(prisma);

    expect(result.templates.updated).toBe(0);
    expect(result.workspaceAssistants.updated).toBe(0);
    expect(prisma.assistant_templates.update).not.toHaveBeenCalled();
    expect(prisma.workspace_assistants.update).not.toHaveBeenCalled();
  });

  test("keeps sqlite and postgres workspace_assistants category schema in sync", () => {
    const extractWorkspaceAssistantsModel = (schema) =>
      schema.match(/model workspace_assistants \{[\s\S]*?\n\}/)?.[0] || "";
    const root = path.resolve(__dirname, "..");
    const sqliteSchema = fs.readFileSync(
      path.join(root, "prisma/schema.prisma"),
      "utf8"
    );
    const postgresSchema = fs.readFileSync(
      path.join(root, "prisma/postgres/schema.prisma"),
      "utf8"
    );

    for (const schema of [sqliteSchema, postgresSchema]) {
      const workspaceAssistantsModel = extractWorkspaceAssistantsModel(schema);

      expect(workspaceAssistantsModel).toMatch(/category\s+String\?/);
      expect(workspaceAssistantsModel).toMatch(/@@index\(\[category\]\)/);
    }
  });
});
